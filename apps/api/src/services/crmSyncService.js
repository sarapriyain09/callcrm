import { config } from '../config.js';

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (config.crmWebhookToken) {
    headers.Authorization = `Bearer ${config.crmWebhookToken}`;
  }

  return headers;
}

function toCrmPayload(eventType, call) {
  return {
    eventType,
    occurredAt: new Date().toISOString(),
    source: 'callcrm',
    call: {
      id: call.id,
      twilioCallSid: call.twilioCallSid,
      direction: call.direction,
      status: call.status,
      outcome: call.outcome,
      fromNumber: call.fromNumber,
      toNumber: call.toNumber,
      ivrSelection: call.ivrSelection,
      routedTo: call.routedTo,
      durationSeconds: call.durationSeconds,
      transcript: call.transcript,
      summary: call.summary,
      actionItems: call.actionItems,
      recordingUrl: call.recordingUrl,
      recordingStatus: call.recordingStatus,
      createdAt: call.createdAt,
      updatedAt: call.updatedAt,
      contact: call.contact
        ? {
            id: call.contact.id,
            name: call.contact.name,
            email: call.contact.email,
            phone: call.contact.phone,
            tags: call.contact.tags,
            notes: call.contact.notes
          }
        : null
    }
  };
}

export async function syncCallToCrm(eventType, call) {
  if (!config.crmSyncEnabled || !config.crmWebhookUrl || !call) return;

  const payload = toCrmPayload(eventType, call);

  try {
    const response = await fetch(config.crmWebhookUrl, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const msg = await response.text().catch(() => 'unknown error');
      console.warn(`[crm-sync] non-2xx response: ${response.status} ${msg}`);
    }
  } catch (error) {
    console.warn('[crm-sync] failed to sync call event', error?.message || error);
  }
}