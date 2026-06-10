import { Router } from 'express';
import twilio from 'twilio';
import { config } from '../config.js';
import {
  createOrUpdateCallFromWebhook,
  markCallOutcome,
  updateCallRecording,
  updateCallStatus
} from '../services/callService.js';
import { upsertContactByPhone } from '../services/contactService.js';
import { sendMissedCallAlert } from '../services/notificationService.js';

const router = Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

const routeMap = {
  '1': {
    label: 'sales',
    number: config.routeSalesNumber,
    fallbackDigits: ['2', '3']
  },
  '2': {
    label: 'support',
    number: config.routeSupportNumber,
    fallbackDigits: ['1', '3']
  },
  '3': {
    label: 'accounts',
    number: config.routeAccountsNumber,
    fallbackDigits: ['2', '1']
  }
};

function absoluteUrl(path) {
  return `${config.appBaseUrl}${path}`;
}

function isBusinessHoursNow() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const dateKey = now.toISOString().slice(0, 10);

  const isHoliday = config.businessHolidays.includes(dateKey);
  if (isHoliday) return false;

  if (
    config.lunchBreakStart !== null &&
    config.lunchBreakEnd !== null &&
    hour >= config.lunchBreakStart &&
    hour < config.lunchBreakEnd
  ) {
    return false;
  }

  return (
    config.businessDays.includes(day) &&
    hour >= config.businessHoursStart &&
    hour < config.businessHoursEnd
  );
}

function getDialChain(selectedDigit) {
  const route = routeMap[selectedDigit];
  if (!route) return [];

  const digits = [selectedDigit, ...route.fallbackDigits];
  const unique = [];

  for (const digit of digits) {
    const number = routeMap[digit]?.number;
    if (number && !unique.includes(number)) {
      unique.push(number);
    }
  }

  if (!config.enableFailover) {
    return unique.slice(0, 1);
  }

  return unique;
}

function dialTarget(twiml, targetNumber, chain, index) {
  const dial = twiml.dial({
    callerId: config.twilioPhoneNumber,
    record: 'record-from-answer',
    action: absoluteUrl(
      `/twilio/voice/dial-complete?chain=${encodeURIComponent(chain.join(','))}&idx=${index}`
    ),
    method: 'POST',
    recordingStatusCallback: absoluteUrl('/twilio/voice/recording')
  });

  dial.number(targetNumber);
}

router.post('/voice/incoming', async (req, res, next) => {
  const twiml = new VoiceResponse();

  try {
    const { CallSid, From, To, CallStatus, Digits } = req.body;
    const contact = await upsertContactByPhone(From);

    if (!isBusinessHoursNow()) {
      await createOrUpdateCallFromWebhook({
        CallSid,
        From,
        To,
        CallStatus,
        contactId: contact?.id,
        RoutedTo: config.afterHoursRouteNumber || null
      });

      if (config.afterHoursRouteNumber) {
        twiml.say(
          { voice: 'alice' },
          'Our office is currently closed. Connecting you to our after-hours line.'
        );

        dialTarget(twiml, config.afterHoursRouteNumber, [config.afterHoursRouteNumber], 0);
      } else {
        twiml.say(
          { voice: 'alice' },
          'Our office is currently closed. Please leave a message after the beep.'
        );
        twiml.record({ maxLength: 120, playBeep: true });
      }

      return res.type('text/xml').send(twiml.toString());
    }

    if (!Digits) {
      await createOrUpdateCallFromWebhook({
        CallSid,
        From,
        To,
        CallStatus,
        contactId: contact?.id
      });

      const gather = twiml.gather({
        numDigits: 1,
        action: absoluteUrl('/twilio/voice/incoming'),
        method: 'POST',
        timeout: 7,
        actionOnEmptyResult: true
      });

      gather.say(
        { voice: 'alice' },
        'Welcome to Call CRM. Press 1 for Sales. Press 2 for Support. Press 3 for Accounts.'
      );

      twiml.redirect(absoluteUrl('/twilio/voice/incoming'));
    } else {
      const selectedDigit = routeMap[Digits] ? Digits : config.defaultRouteDigit;
      const destination = routeMap[selectedDigit];
      const dialChain = destination ? getDialChain(selectedDigit) : [];

      await createOrUpdateCallFromWebhook({
        CallSid,
        From,
        To,
        CallStatus,
        Digits: selectedDigit,
        RoutedTo: destination?.number,
        contactId: contact?.id
      });

      if (!destination || dialChain.length === 0) {
        twiml.say(
          { voice: 'alice' },
          'No active route is configured for that option. Please leave a message after the beep.'
        );
        twiml.record({ maxLength: 120, playBeep: true });
      } else {
        twiml.say({ voice: 'alice' }, `Connecting you to ${destination.label}.`);
        dialTarget(twiml, dialChain[0], dialChain, 0);
      }
    }

    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    next(error);
  }
});

router.post('/voice/dial-complete', async (req, res, next) => {
  const twiml = new VoiceResponse();

  try {
    const { CallSid, DialCallStatus, From } = req.body;
    const chain = String(req.query.chain || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const currentIdx = Number(req.query.idx || 0);
    const nextIdx = currentIdx + 1;
    const nextTarget = chain[nextIdx];

    if (DialCallStatus === 'completed') {
      await markCallOutcome(CallSid, 'ANSWERED');
    } else if (
      (DialCallStatus === 'busy' || DialCallStatus === 'no-answer') &&
      nextTarget
    ) {
      await createOrUpdateCallFromWebhook({
        CallSid,
        From,
        CallStatus: DialCallStatus,
        RoutedTo: nextTarget
      });

      twiml.say(
        { voice: 'alice' },
        'Trying the next available team member. Please hold.'
      );
      dialTarget(twiml, nextTarget, chain, nextIdx);
    } else if (DialCallStatus === 'busy' || DialCallStatus === 'no-answer') {
      await markCallOutcome(CallSid, 'MISSED');
      await sendMissedCallAlert({
        callSid: CallSid,
        fromNumber: From,
        toEmail: config.missedCallAlertEmail
      });

      twiml.say(
        { voice: 'alice' },
        'All agents are currently unavailable. Please leave a message after the beep.'
      );
      twiml.record({ maxLength: 120, playBeep: true });
    } else {
      await markCallOutcome(CallSid, 'ABANDONED');
      twiml.say({ voice: 'alice' }, 'The call could not be connected. Please try later.');
    }

    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    next(error);
  }
});

router.post('/voice/status', async (req, res, next) => {
  try {
    await updateCallStatus(req.body);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

router.post('/voice/recording', async (req, res, next) => {
  try {
    await updateCallRecording(req.body);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

export default router;
