import { Router } from 'express';
import { z } from 'zod';
import twilio from 'twilio';
import { config } from '../config.js';
import {
  createOrUpdateCallFromWebhook,
  getCallById,
  listLiveCalls,
  listCalls,
  updateCallSummary,
  updateCallTranscript
} from '../services/callService.js';
import { generateCallSummary } from '../services/aiSummaryService.js';
import { upsertContactByPhone } from '../services/contactService.js';
import { requireRole } from '../middleware/roleGuard.js';
import { buildTwilioClient } from '../services/twilioClient.js';

const router = Router();
const { client: twilioClient } = buildTwilioClient(config);

router.get('/', async (_req, res, next) => {
  try {
    const calls = await listCalls();
    res.json({ data: calls });
  } catch (error) {
    next(error);
  }
});

router.get('/live', async (_req, res, next) => {
  try {
    const calls = await listLiveCalls();
    res.json({ data: calls });
  } catch (error) {
    next(error);
  }
});

const outboundSchema = z.object({
  toNumber: z.string().trim().min(8),
  introMessage: z.string().trim().max(240).optional(),
  label: z.string().trim().max(120).optional()
});

router.post('/outbound', requireRole(['admin', 'agent']), async (req, res, next) => {
  try {
    if (!twilioClient) {
      return res.status(400).json({
        error:
          'Twilio credentials are missing or invalid. Use either ACCOUNT_SID + AUTH_TOKEN, or ACCOUNT_SID + API_KEY_SID + API_KEY_SECRET.'
      });
    }

    const payload = outboundSchema.parse(req.body || {});

    if (!config.twilioPhoneNumber) {
      return res.status(400).json({
        error: 'TWILIO_PHONE_NUMBER is missing.'
      });
    }

    const twiml = new twilio.twiml.VoiceResponse();
    const intro = payload.introMessage || 'Hello. This is a call from Call CRM.';
    twiml.say({ voice: 'alice' }, intro);

    if (payload.label) {
      twiml.say({ voice: 'alice' }, `Reference: ${payload.label}.`);
    }

    const call = await twilioClient.calls.create({
      to: payload.toNumber,
      from: config.twilioPhoneNumber,
      twiml: twiml.toString(),
      statusCallback: `${config.appBaseUrl}/twilio/voice/status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingStatusCallback: `${config.appBaseUrl}/twilio/voice/recording`
    });

    const contact = await upsertContactByPhone(payload.toNumber);
    const callLog = await createOrUpdateCallFromWebhook({
      CallSid: call.sid,
      From: config.twilioPhoneNumber,
      To: payload.toNumber,
      CallStatus: call.status,
      Direction: 'OUTBOUND',
      contactId: contact?.id
    });

    return res.status(201).json({
      data: {
        id: callLog?.id,
        twilioCallSid: call.sid,
        status: call.status,
        direction: 'OUTBOUND',
        toNumber: payload.toNumber
      }
    });
  } catch (error) {
    if (Number(error?.code) === 21210) {
      return res.status(400).json({
        error: 'Twilio caller number not ready',
        message:
          'TWILIO_PHONE_NUMBER is not verified or purchased in your Twilio account. Update it in Settings with a Twilio-owned/verified number.'
      });
    }

    if (Number(error?.code) === 21608) {
      return res.status(400).json({
        error: 'Twilio trial destination blocked',
        message:
          'Trial account can only call verified destination numbers. Verify the recipient number in Twilio console.'
      });
    }

    next(error);
  }
});

const transcriptSchema = z.object({
  transcript: z.string().trim().min(1)
});

router.post('/:id/transcript', async (req, res, next) => {
  try {
    const { transcript } = transcriptSchema.parse(req.body);
    const call = await updateCallTranscript(req.params.id, transcript);
    res.json({ data: call });
  } catch (error) {
    next(error);
  }
});

const summarySchema = z.object({
  transcript: z.string().trim().optional(),
  notes: z.string().trim().optional()
});

router.post('/:id/ai-summary', async (req, res, next) => {
  try {
    const call = await getCallById(req.params.id);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const input = summarySchema.parse(req.body || {});
    const transcript = input.transcript || call.transcript || '';

    const result = await generateCallSummary({
      call,
      transcript,
      notes: input.notes
    });

    const updated = await updateCallSummary(call.id, {
      summary: result.summary,
      actionItems: result.actionItems,
      model: result.model
    });

    return res.json({
      data: {
        id: updated.id,
        summary: updated.summary,
        actionItems: updated.actionItems,
        summaryModel: updated.summaryModel,
        summaryGeneratedAt: updated.summaryGeneratedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
