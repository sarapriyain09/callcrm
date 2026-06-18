import { Router } from 'express';
import { z } from 'zod';
import twilio from 'twilio';
import { config } from '../config.js';
import {
  createOrUpdateCallFromWebhook,
  deleteCallById,
  getCallById,
  listLiveCalls,
  listCalls,
  updateCallSummary,
  updateCallTranscript
} from '../services/callService.js';
import { generateCallSummary, generateNextStepAssistant } from '../services/aiSummaryService.js';
import { upsertContactByPhone } from '../services/contactService.js';
import { requireRole } from '../middleware/roleGuard.js';
import { buildTwilioClient } from '../services/twilioClient.js';
import { syncCallToCrm } from '../services/crmSyncService.js';
import { generateAgentActionsForCall } from '../services/agentService.js';
import { prisma } from '../services/db.js';

const router = Router();
const { client: twilioClient } = buildTwilioClient(config);

function isPublicCallbackBaseUrl(value) {
  try {
    const parsed = new URL(value);
    const protocolOk = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    if (!protocolOk) return false;

    const hostname = parsed.hostname.toLowerCase();

    // Twilio cannot reach localhost or loopback/private callback targets.
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function callbackUrl(pathname) {
  return new URL(pathname, config.appBaseUrl).toString();
}

async function getOutboundBridgeNumber() {
  const adminUser = await prisma.user.findFirst({
    where: {
      username: { equals: 'admin', mode: 'insensitive' },
      isActive: true,
      phoneNumber: { not: null }
    },
    select: { phoneNumber: true }
  });

  const adminNumber = String(adminUser?.phoneNumber || '').trim();
  if (adminNumber) return adminNumber;

  return String(config.routeAccountsNumber || '').trim();
}

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

router.delete('/:id', requireRole(['admin', 'agent']), async (req, res, next) => {
  try {
    const requestUsername = String(req.header('x-callcrm-username') || '').trim().toLowerCase();
    if (requestUsername === 'demo' || requestUsername === 'democallcrm') {
      return res.status(403).json({
        error: 'Demo user is read-only and cannot delete calls.'
      });
    }

    const existing = await getCallById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Call not found' });
    }

    await deleteCallById(req.params.id);
    return res.sendStatus(204);
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
    const requestUsername = String(req.header('x-callcrm-username') || '').trim().toLowerCase();
    if (requestUsername === 'demo' || requestUsername === 'democallcrm') {
      return res.status(403).json({
        error: 'Demo user is read-only and cannot place outbound calls.'
      });
    }

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

    if (!isPublicCallbackBaseUrl(config.appBaseUrl)) {
      return res.status(400).json({
        error: 'Invalid APP_BASE_URL for Twilio callbacks.',
        message:
          'Set APP_BASE_URL to a publicly reachable URL (for example your ngrok or production HTTPS URL), then retry the outbound call.'
      });
    }

    const twiml = new twilio.twiml.VoiceResponse();
    const intro = payload.introMessage || 'Hello. This is a call from Call CRM.';
    twiml.say({ voice: 'alice' }, intro);

    if (payload.label) {
      twiml.say({ voice: 'alice' }, `Reference: ${payload.label}.`);
    }

    const bridgeNumber = await getOutboundBridgeNumber();
    if (!bridgeNumber) {
      return res.status(400).json({
        error: 'Admin bridge number is missing.',
        message:
          'Set admin user phoneNumber (recommended) or ROUTE_ACCOUNTS_NUMBER to connect outbound customer calls to admin.'
      });
    }

    const dial = twiml.dial({
      callerId: config.twilioPhoneNumber,
      record: 'record-from-answer',
      recordingStatusCallback: callbackUrl('/twilio/voice/recording')
    });
    dial.number(bridgeNumber);

    const call = await twilioClient.calls.create({
      to: payload.toNumber,
      from: config.twilioPhoneNumber,
      twiml: twiml.toString(),
      statusCallback: callbackUrl('/twilio/voice/status'),
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingStatusCallback: callbackUrl('/twilio/voice/recording')
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
    await syncCallToCrm('call.outbound.created', callLog);

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

    if (Number(error?.code) === 21609) {
      return res.status(400).json({
        error: 'Invalid Twilio callback URL',
        message:
          'Twilio rejected the callback URL. Ensure APP_BASE_URL is a publicly reachable absolute URL and does not point to localhost.'
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
    await syncCallToCrm('call.transcript.updated', call);
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
    await syncCallToCrm('call.summary.updated', updated);
    const agentActions = await generateAgentActionsForCall(call.id);
    const assistant = await generateNextStepAssistant({
      call: updated,
      notes: input.notes,
      agentActions
    });

    return res.json({
      data: {
        id: updated.id,
        summary: updated.summary,
        actionItems: updated.actionItems,
        summaryModel: updated.summaryModel,
        summaryGeneratedAt: updated.summaryGeneratedAt,
        agentActions,
        assistant
      }
    });
  } catch (error) {
    next(error);
  }
});

const assistantSchema = z.object({
  notes: z.string().trim().optional(),
  objective: z.string().trim().max(240).optional()
});

router.post('/:id/ai-assistant', requireRole(['admin', 'agent']), async (req, res, next) => {
  try {
    const call = await getCallById(req.params.id);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const input = assistantSchema.parse(req.body || {});

    const actionRows = await prisma.agentAction.findMany({
      where: { callId: call.id },
      orderBy: { createdAt: 'desc' },
      take: 25
    });

    const assistant = await generateNextStepAssistant({
      call,
      notes: [input.objective, input.notes].filter(Boolean).join(' | '),
      agentActions: actionRows
    });

    return res.json({
      data: {
        callId: call.id,
        ...assistant
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
