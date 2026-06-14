import { Router } from 'express';
import twilio from 'twilio';
import { config } from '../config.js';
import {
  createOrUpdateCallFromWebhook,
  getCallBySid,
  markCallOutcome,
  updateCallRecording,
  updateCallStatus
} from '../services/callService.js';
import { upsertContactByPhone } from '../services/contactService.js';
import { sendMissedCallAlert } from '../services/notificationService.js';
import { syncCallToCrm } from '../services/crmSyncService.js';
import { generateAgentActionsForCall } from '../services/agentService.js';
import { prisma } from '../services/db.js';

const router = Router();
const VoiceResponse = twilio.twiml.VoiceResponse;
const inboundPriorityUsers = ['admin', 'arun', 'shiva'];

const baseRouteMap = {
  '1': {
    label: 'sales',
    fallbackDigits: ['2', '3'],
    team: 'SALES',
    fallbackNumber: config.routeSalesNumber
  },
  '2': {
    label: 'support',
    fallbackDigits: ['1', '3'],
    team: 'SUPPORT',
    fallbackNumber: config.routeSupportNumber
  },
  '3': {
    label: 'accounts',
    fallbackDigits: ['2', '1'],
    team: 'ACCOUNTS',
    fallbackNumber: config.routeAccountsNumber
  }
};

async function buildRouteMap() {
  const availableUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      isAvailable: true,
      phoneNumber: { not: null }
    },
    select: {
      team: true,
      phoneNumber: true,
      lastLoginAt: true,
      updatedAt: true
    },
    orderBy: [{ lastLoginAt: 'desc' }, { updatedAt: 'desc' }]
  });

  const numbersByTeam = {
    SALES: [],
    SUPPORT: [],
    ACCOUNTS: []
  };

  for (const user of availableUsers) {
    const number = String(user.phoneNumber || '').trim();
    if (!number) continue;

    const teamList = numbersByTeam[user.team] || [];
    if (!teamList.includes(number)) {
      teamList.push(number);
    }
    numbersByTeam[user.team] = teamList;
  }

  const routeMap = {};

  for (const [digit, route] of Object.entries(baseRouteMap)) {
    const teamNumbers = numbersByTeam[route.team] || [];
    const fallbackNumber = route.fallbackNumber ? [route.fallbackNumber] : [];
    const numbers = [...teamNumbers, ...fallbackNumber].filter(
      (value, idx, arr) => value && arr.indexOf(value) === idx
    );

    routeMap[digit] = {
      ...route,
      number: numbers[0] || '',
      numbers
    };
  }

  return routeMap;
}

async function buildInboundPriorityDialChain() {
  const userPriority = new Map(inboundPriorityUsers.map((name, index) => [name, index]));

  const prioritizedUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      phoneNumber: { not: null },
      OR: inboundPriorityUsers.map((username) => ({
        username: { equals: username, mode: 'insensitive' }
      }))
    },
    select: {
      username: true,
      phoneNumber: true
    }
  });

  const orderedUsers = prioritizedUsers.sort((a, b) => {
    const left = userPriority.get(String(a.username || '').toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const right = userPriority.get(String(b.username || '').toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });

  const chain = [];

  for (const user of orderedUsers) {
    const number = String(user.phoneNumber || '').trim();
    if (number && !chain.includes(number)) {
      chain.push(number);
    }
  }

  return chain;
}

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

function getDialChain(selectedDigit, routeMap) {
  const route = routeMap[selectedDigit];
  if (!route) return [];

  const digits = [selectedDigit, ...route.fallbackDigits];
  const unique = [];

  for (const digit of digits) {
    const numbers = routeMap[digit]?.numbers || [];
    for (const number of numbers) {
      if (number && !unique.includes(number)) {
        unique.push(number);
      }
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
    const routeMap = await buildRouteMap();
    const inboundPriorityChain = await buildInboundPriorityDialChain();
    const contact = await upsertContactByPhone(From);

    if (!isBusinessHoursNow()) {
      const call = await createOrUpdateCallFromWebhook({
        CallSid,
        From,
        To,
        CallStatus,
        contactId: contact?.id,
        RoutedTo: config.afterHoursRouteNumber || null
      });
      await syncCallToCrm('call.created', call);

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
      const call = await createOrUpdateCallFromWebhook({
        CallSid,
        From,
        To,
        CallStatus,
        contactId: contact?.id
      });
      await syncCallToCrm('call.updated', call);

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
      const selectedRoute = routeMap[selectedDigit];
      const fallbackChain = selectedRoute ? getDialChain(selectedDigit, routeMap) : [];
      const dialChain = inboundPriorityChain.length > 0 ? inboundPriorityChain : fallbackChain;

      const call = await createOrUpdateCallFromWebhook({
        CallSid,
        From,
        To,
        CallStatus,
        Digits: selectedDigit,
        RoutedTo: dialChain[0] || selectedRoute?.number,
        contactId: contact?.id
      });
      await syncCallToCrm('call.routed', call);

      if (dialChain.length === 0) {
        twiml.say(
          { voice: 'alice' },
          'No active route is configured for that option. Please leave a message after the beep.'
        );
        twiml.record({ maxLength: 120, playBeep: true });
      } else {
        twiml.say({ voice: 'alice' }, 'Connecting you to our team now.');
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
        await syncCallToCrm('call.completed', await getCallBySid(CallSid));
    } else if (
      (DialCallStatus === 'busy' || DialCallStatus === 'no-answer') &&
      nextTarget
    ) {
      const call = await createOrUpdateCallFromWebhook({
        CallSid,
        From,
        CallStatus: DialCallStatus,
        RoutedTo: nextTarget
      });
      await syncCallToCrm('call.rerouted', call);

      twiml.say(
        { voice: 'alice' },
        'Trying the next available team member. Please hold.'
      );
      dialTarget(twiml, nextTarget, chain, nextIdx);
    } else if (DialCallStatus === 'busy' || DialCallStatus === 'no-answer') {
      await markCallOutcome(CallSid, 'MISSED');
      const missedCall = await getCallBySid(CallSid);
      await syncCallToCrm('call.missed', missedCall);

      if (missedCall?.id) {
        await generateAgentActionsForCall(missedCall.id);
      }

      await sendMissedCallAlert({
        callSid: CallSid,
        fromNumber: From,
        toEmail: 'info@splendidtechnology.co.uk'
      });

      twiml.say(
        { voice: 'alice' },
        'All agents are currently unavailable. Please leave a message after the beep.'
      );
      twiml.record({ maxLength: 120, playBeep: true });
    } else {
      await markCallOutcome(CallSid, 'ABANDONED');
        await syncCallToCrm('call.abandoned', await getCallBySid(CallSid));
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
    await syncCallToCrm('call.status', await getCallBySid(req.body?.CallSid));
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

router.post('/voice/recording', async (req, res, next) => {
  try {
    await updateCallRecording(req.body);
    await syncCallToCrm('call.recording', await getCallBySid(req.body?.CallSid));
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

export default router;
