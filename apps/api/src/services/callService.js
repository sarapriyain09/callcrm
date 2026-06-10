import { prisma } from './db.js';

export async function createOrUpdateCallFromWebhook(payload) {
  const {
    CallSid,
    From,
    To,
    CallStatus,
    Direction,
    Digits,
    RoutedTo,
    contactId
  } = payload;

  if (!CallSid) return null;

  return prisma.callLog.upsert({
    where: { twilioCallSid: CallSid },
    update: {
      fromNumber: From || '',
      toNumber: To || '',
      status: CallStatus || 'initiated',
      ...(Direction ? { direction: Direction } : {}),
      ivrSelection: Digits || null,
      routedTo: RoutedTo || null,
      contactId: contactId || undefined
    },
    create: {
      twilioCallSid: CallSid,
      direction: Direction || 'INBOUND',
      fromNumber: From || '',
      toNumber: To || '',
      status: CallStatus || 'initiated',
      ivrSelection: Digits || null,
      routedTo: RoutedTo || null,
      contactId: contactId || null
    }
  });
}

export async function updateCallStatus(payload) {
  const { CallSid, CallStatus, CallDuration } = payload;
  if (!CallSid) return null;

  return prisma.callLog.updateMany({
    where: { twilioCallSid: CallSid },
    data: {
      status: CallStatus || 'unknown',
      durationSeconds: CallDuration ? Number(CallDuration) : null
    }
  });
}

export async function updateCallRecording(payload) {
  const { CallSid, RecordingSid, RecordingUrl, RecordingStatus } = payload;
  if (!CallSid) return null;

  return prisma.callLog.updateMany({
    where: { twilioCallSid: CallSid },
    data: {
      recordingSid: RecordingSid || null,
      recordingUrl: RecordingUrl || null,
      recordingStatus: RecordingStatus || null
    }
  });
}

export async function markCallOutcome(callSid, outcome) {
  if (!callSid) return null;

  return prisma.callLog.updateMany({
    where: { twilioCallSid: callSid },
    data: { outcome }
  });
}

export async function listCalls() {
  return prisma.callLog.findMany({
    include: { contact: true },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
}

export async function listLiveCalls() {
  return prisma.callLog.findMany({
    include: { contact: true },
    where: {
      status: {
        in: ['queued', 'initiated', 'ringing', 'in-progress']
      }
    },
    orderBy: { updatedAt: 'desc' },
    take: 50
  });
}

export async function getCallById(callId) {
  if (!callId) return null;

  return prisma.callLog.findUnique({
    where: { id: callId },
    include: { contact: true }
  });
}

export async function updateCallTranscript(callId, transcript) {
  if (!callId) return null;

  return prisma.callLog.update({
    where: { id: callId },
    data: {
      transcript: transcript || null
    }
  });
}

export async function updateCallSummary(callId, payload) {
  if (!callId) return null;

  return prisma.callLog.update({
    where: { id: callId },
    data: {
      summary: payload.summary,
      actionItems: payload.actionItems,
      summaryModel: payload.model,
      summaryGeneratedAt: new Date()
    }
  });
}
