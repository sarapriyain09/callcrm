import { config } from '../config.js';
import { prisma } from './db.js';
import { sendAgentActionEmail } from './notificationService.js';
import { buildTwilioClient } from './twilioClient.js';
import { generateNextStepAssistant } from './aiSummaryService.js';

const { client: twilioClient } = buildTwilioClient(config);

function includesAny(text, words) {
  const normalized = String(text || '').toLowerCase();
  return words.some((w) => normalized.includes(w));
}

function buildActionsFromCall(call) {
  const text = `${call.summary || ''} ${call.transcript || ''}`;
  const actions = [];

  if (call.outcome === 'MISSED') {
    actions.push({
      actionType: 'CREATE_CALLBACK_TASK',
      title: 'Callback missed caller',
      details: 'Missed call detected. Schedule a callback within one business day.',
      priority: 'HIGH',
      reasoning: 'Call outcome is MISSED.'
    });

    actions.push({
      actionType: 'SEND_SMS_FOLLOWUP',
      title: 'Send SMS after missed call',
      details:
        'Hi, we noticed we missed your call. Reply with a preferred callback time and the topic you need help with.',
      priority: 'HIGH',
      reasoning: 'Missed calls benefit from quick SMS follow-up to recover intent.'
    });
  }

  if (includesAny(text, ['urgent', 'asap', 'immediately', 'critical'])) {
    actions.push({
      actionType: 'ESCALATE_PRIORITY',
      title: 'Escalate urgent enquiry',
      details: 'Customer language indicates urgency. Escalate to priority handling.',
      priority: 'HIGH',
      reasoning: 'Detected urgency keywords in summary/transcript.'
    });
  }

  if (includesAny(text, ['quote', 'pricing', 'proposal', 'cost'])) {
    actions.push({
      actionType: 'CREATE_CRM_TASK',
      title: 'Prepare and send quote',
      details: 'Customer requested pricing information. Create quote follow-up task.',
      priority: 'MEDIUM',
      reasoning: 'Detected commercial intent keywords.'
    });
  }

  if (includesAny(text, ['appointment', 'visit', 'schedule', 'book'])) {
    actions.push({
      actionType: 'SCHEDULE_FOLLOWUP',
      title: 'Schedule follow-up appointment',
      details: 'Customer discussed scheduling. Offer a confirmed slot.',
      priority: 'MEDIUM',
      reasoning: 'Detected scheduling keywords.'
    });
  }

  if (includesAny(text, ['sms', 'text message', 'text me', 'message me'])) {
    actions.push({
      actionType: 'SEND_SMS_FOLLOWUP',
      title: 'Send SMS confirmation',
      details: 'Send a confirmation SMS with agreed next steps and callback details.',
      priority: 'MEDIUM',
      reasoning: 'Caller explicitly referenced SMS/text follow-up.'
    });
  }

  if (includesAny(text, ['complaint', 'unhappy', 'refund', 'cancel'])) {
    actions.push({
      actionType: 'CUSTOMER_RECOVERY',
      title: 'Customer recovery workflow',
      details: 'Potential dissatisfaction detected. Trigger retention/recovery follow-up.',
      priority: 'HIGH',
      reasoning: 'Detected complaint/cancellation sentiment keywords.'
    });
  }

  if (actions.length === 0) {
    actions.push({
      actionType: 'REVIEW_CALL',
      title: 'Review call outcome',
      details: 'No high-confidence automation trigger found. Manual review recommended.',
      priority: 'LOW',
      reasoning: 'No specific trigger keywords matched.'
    });
  }

  return actions;
}

function withRetryDate() {
  return new Date(Date.now() + Math.max(5, config.agentRetryDelaySeconds) * 1000);
}

async function postCrmActionEvent(action, call) {
  if (!config.crmSyncEnabled || !config.crmWebhookUrl) {
    return;
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  if (config.crmWebhookToken) {
    headers.Authorization = `Bearer ${config.crmWebhookToken}`;
  }

  const response = await fetch(config.crmWebhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      eventType: 'agent.action.executed',
      occurredAt: new Date().toISOString(),
      source: 'callcrm',
      action: {
        id: action.id,
        actionType: action.actionType,
        title: action.title,
        details: action.details,
        priority: action.priority,
        status: 'EXECUTED'
      },
      call: {
        id: call.id,
        twilioCallSid: call.twilioCallSid,
        status: call.status,
        outcome: call.outcome,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        contactId: call.contactId
      }
    })
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'unknown CRM webhook error');
    throw new Error(`CRM webhook rejected action: ${response.status} ${message}`);
  }
}

async function executeConnector(action, call) {
  switch (action.actionType) {
    case 'SEND_SMS_FOLLOWUP': {
      if (!twilioClient) {
        throw new Error('Twilio client is not configured for SMS execution.');
      }

      if (!config.twilioPhoneNumber) {
        throw new Error('TWILIO_PHONE_NUMBER is missing.');
      }

      const requestedTo = String(action.payload?.toNumber || '').trim();
      const to = requestedTo || call.contact?.phone || call.fromNumber;
      if (!to) {
        throw new Error('No recipient number available for SMS follow-up.');
      }

      const body = String(action.details || '').trim() ||
        `Hello from Splendid Technology. Following up on your recent call (${call.twilioCallSid}).`;

      const message = await twilioClient.messages.create({
        from: config.twilioPhoneNumber,
        to,
        body
      });

      return {
        channel: 'sms',
        provider: 'twilio',
        sid: message.sid,
        status: message.status,
        to,
        from: config.twilioPhoneNumber,
        body
      };
    }
    case 'SEND_WHATSAPP_FOLLOWUP': {
      if (!twilioClient) {
        throw new Error('Twilio client is not configured for WhatsApp execution.');
      }

      if (!config.twilioWhatsappFrom) {
        throw new Error('TWILIO_WHATSAPP_FROM is missing.');
      }

      const to = call.contact?.phone || call.fromNumber;
      if (!to) {
        throw new Error('No recipient number available for WhatsApp follow-up.');
      }

      const message = await twilioClient.messages.create({
        from: config.twilioWhatsappFrom,
        to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
        body: `Hello from Splendid Technology. Following up on your recent call (${call.twilioCallSid}).`
      });
      return {
        channel: 'whatsapp',
        provider: 'twilio',
        sid: message.sid,
        status: message.status,
        to,
        from: config.twilioWhatsappFrom
      };
    }
    case 'SEND_EMAIL_ALERT': {
      const toEmail = String(action.payload?.toEmail || '').trim() || config.agentNotificationEmailTo;
      if (!toEmail) {
        throw new Error('No recipient email available for follow-up.');
      }

      await sendAgentActionEmail({
        toEmail,
        subject: `[CallCRM] ${action.title}`,
        body: action.details || `Action ${action.actionType} for call ${call.twilioCallSid}`
      });
      return {
        channel: 'email',
        provider: 'smtp',
        toEmail,
        subject: `[CallCRM] ${action.title}`
      };
    }
    default:
      await postCrmActionEvent(action, call);
      return {
        channel: 'crm',
        provider: 'webhook'
      };
  }
}

async function buildAssistantForCall(call) {
  const actionRows = await prisma.agentAction.findMany({
    where: { callId: call.id },
    orderBy: { createdAt: 'desc' },
    take: 15
  });

  return generateNextStepAssistant({
    call,
    notes: 'Draft a concise customer follow-up message based on this call context.',
    agentActions: actionRows
  });
}

export async function generateSmsDraft({ callId, toNumber }) {
  const call = await prisma.callLog.findUnique({
    where: { id: callId },
    include: { contact: true }
  });

  if (!call) {
    throw new Error('Call not found for SMS draft.');
  }

  const recipient =
    String(toNumber || '').trim() || String(call.contact?.phone || '').trim() || String(call.fromNumber || '').trim();

  if (!recipient) {
    throw new Error('No recipient number available for SMS draft.');
  }

  const assistant = await buildAssistantForCall(call);

  return {
    callId,
    toNumber: recipient,
    body:
      String(assistant?.suggestedMessage || '').trim() ||
      'Hi, thanks for contacting Splendid Technology. Please share your preferred callback time and what you need help with.',
    context: {
      recommendedAction: assistant?.recommendedAction || null,
      informationToCollect: Array.isArray(assistant?.informationToCollect)
        ? assistant.informationToCollect
        : []
    }
  };
}

export async function generateEmailDraft({ callId, toEmail }) {
  const call = await prisma.callLog.findUnique({
    where: { id: callId },
    include: { contact: true }
  });

  if (!call) {
    throw new Error('Call not found for email draft.');
  }

  const recipient =
    String(toEmail || '').trim() ||
    String(call.contact?.email || '').trim() ||
    String(config.agentNotificationEmailTo || '').trim();

  if (!recipient) {
    throw new Error('No recipient email available for follow-up draft.');
  }

  const assistant = await buildAssistantForCall(call);
  const customerName = String(call.contact?.name || '').trim() || 'there';
  const suggestedMessage =
    String(assistant?.suggestedMessage || '').trim() ||
    'Thanks for contacting Splendid Technology. Please confirm your preferred callback time and what you need help with.';
  const contactTags = Array.isArray(call.contact?.tags)
    ? call.contact.tags.map((tag) => String(tag || '').toLowerCase())
    : [];
  const contactNotes = String(call.contact?.notes || '').toLowerCase();
  const isEngineeringPipeline =
    contactTags.some((tag) => tag.includes('engineering') || tag.includes('pipeline')) ||
    (contactNotes.includes('engineering') && contactNotes.includes('pipeline'));
  const collectionItems = Array.isArray(assistant?.informationToCollect)
    ? assistant.informationToCollect.slice(0, 4)
    : [];

  const subject = isEngineeringPipeline
    ? 'Engineering Pipeline Update and Next Steps'
    : call.outcome === 'MISSED'
      ? 'Follow-up on your missed call'
      : 'Follow-up from your recent call';

  const bodyLines = isEngineeringPipeline
    ? [
      `Hi ${customerName},`,
      '',
      'Thanks for progressing with our engineering pipeline workflow.',
      suggestedMessage,
      '',
      collectionItems.length
        ? `For CRM progression, please confirm: ${collectionItems.join('; ')}.`
        : 'For CRM progression, please confirm your technical requirements, timeline, and key decision owner.',
      '',
      'Once we receive this, we will update your pipeline stage and share the next implementation steps.',
      '',
      'Regards,',
      'Splendid Technology Engineering Team'
    ]
    : [
      `Hi ${customerName},`,
      '',
      suggestedMessage,
      '',
      collectionItems.length
        ? `To help quickly, please share: ${collectionItems.join('; ')}.`
        : 'Please share any additional details so we can support you quickly.',
      '',
      'Regards,',
      'Splendid Technology Team'
    ];

  return {
    callId,
    toEmail: recipient,
    subject,
    body: bodyLines.join('\n'),
    context: {
      recommendedAction: assistant?.recommendedAction || null,
      informationToCollect: collectionItems
    }
  };
}

export async function executeAgentActionById(actionId) {
  const action = await prisma.agentAction.findUnique({
    where: { id: actionId },
    include: {
      call: {
        include: {
          contact: true
        }
      }
    }
  });

  if (!action) throw new Error('Agent action not found.');

  if (action.status === 'EXECUTED' || action.status === 'REJECTED' || action.status === 'FAILED') {
    return action;
  }

  try {
    const execution = await executeConnector(action, action.call);

    return prisma.agentAction.update({
      where: { id: action.id },
      data: {
        status: 'EXECUTED',
        executionAttempts: action.executionAttempts + 1,
        executedAt: new Date(),
        lastError: null,
        nextRetryAt: null,
        payload: {
          ...(action.payload && typeof action.payload === 'object' ? action.payload : {}),
          execution: {
            ...(execution || {}),
            executedAt: new Date().toISOString()
          }
        }
      },
      include: {
        call: {
          include: {
            contact: true
          }
        }
      }
    });
  } catch (error) {
    const attempts = action.executionAttempts + 1;
    const retryAllowed = attempts < Math.max(1, config.agentMaxRetries);

    return prisma.agentAction.update({
      where: { id: action.id },
      data: {
        status: retryAllowed ? 'APPROVED' : 'FAILED',
        executionAttempts: attempts,
        lastError: String(error?.message || error),
        nextRetryAt: retryAllowed ? withRetryDate() : null,
        failedAt: retryAllowed ? null : new Date()
      },
      include: {
        call: {
          include: {
            contact: true
          }
        }
      }
    });
  }
}

export async function processDueAgentRetries() {
  const now = new Date();

  const due = await prisma.agentAction.findMany({
    where: {
      status: 'APPROVED',
      nextRetryAt: {
        lte: now
      }
    },
    orderBy: {
      nextRetryAt: 'asc'
    },
    take: 25
  });

  let processed = 0;
  for (const action of due) {
    await executeAgentActionById(action.id);
    processed += 1;
  }

  return { processed };
}

export async function generateAgentActionsForCall(callId) {
  if (!config.agentAutomationEnabled) {
    return [];
  }

  const call = await prisma.callLog.findUnique({
    where: { id: callId },
    include: { contact: true }
  });

  if (!call) return [];

  await prisma.agentAction.deleteMany({ where: { callId } });

  const autoMode = config.agentApprovalMode === 'auto';
  const status = autoMode ? 'APPROVED' : 'PENDING';
  const actionTemplates = buildActionsFromCall(call);

  const created = [];

  for (const item of actionTemplates) {
    const row = await prisma.agentAction.create({
      data: {
        callId,
        actionType: item.actionType,
        title: item.title,
        details: item.details,
        reasoning: item.reasoning,
        priority: item.priority,
        status,
        payload: {
          callId: call.id,
          twilioCallSid: call.twilioCallSid,
          contactId: call.contactId,
          contactName: call.contact?.name || null,
          suggestedBy: 'agent-v1-rules'
        }
      }
    });

    if (autoMode) {
      await executeAgentActionById(row.id);
    }

    created.push(row);
  }

  return created;
}

export async function listAgentActions({ status } = {}) {
  return prisma.agentAction.findMany({
    where: {
      ...(status ? { status } : {})
    },
    include: {
      call: {
        include: {
          contact: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 200
  });
}

export async function createAndExecuteSmsAction({ callId, toNumber, body }) {
  const call = await prisma.callLog.findUnique({
    where: { id: callId },
    include: { contact: true }
  });

  if (!call) {
    throw new Error('Call not found for SMS action.');
  }

  const action = await prisma.agentAction.create({
    data: {
      callId,
      actionType: 'SEND_SMS_FOLLOWUP',
      title: 'Manual SMS follow-up',
      details:
        String(body || '').trim() ||
        'Hi, thanks for contacting us. Please share a good time for us to call you back and what you need help with.',
      reasoning: 'Created manually from tracker for immediate follow-up.',
      priority: 'MEDIUM',
      status: 'APPROVED',
      payload: {
        callId,
        twilioCallSid: call.twilioCallSid,
        contactId: call.contactId,
        toNumber: String(toNumber || '').trim() || null,
        suggestedBy: 'agent-manual-sms'
      }
    }
  });

  return executeAgentActionById(action.id);
}

export async function createAndExecuteEmailAction({ callId, toEmail, subject, body }) {
  const call = await prisma.callLog.findUnique({
    where: { id: callId },
    include: { contact: true }
  });

  if (!call) {
    throw new Error('Call not found for email action.');
  }

  const recipient =
    String(toEmail || '').trim() ||
    String(call.contact?.email || '').trim() ||
    String(config.agentNotificationEmailTo || '').trim();

  if (!recipient) {
    throw new Error('No recipient email available for follow-up send.');
  }

  const normalizedSubject =
    String(subject || '').trim() ||
    (call.outcome === 'MISSED' ? 'Follow-up on your missed call' : 'Follow-up from your recent call');

  const normalizedBody =
    String(body || '').trim() ||
    'Thanks for contacting Splendid Technology. Please reply with your preferred callback time and what you need help with.';

  const action = await prisma.agentAction.create({
    data: {
      callId,
      actionType: 'SEND_EMAIL_ALERT',
      title: normalizedSubject,
      details: normalizedBody,
      reasoning: 'Created manually from tracker after reviewing AI-generated draft context.',
      priority: 'MEDIUM',
      status: 'APPROVED',
      payload: {
        callId,
        twilioCallSid: call.twilioCallSid,
        contactId: call.contactId,
        toEmail: recipient,
        suggestedBy: 'agent-manual-email'
      }
    }
  });

  return executeAgentActionById(action.id);
}

export async function updateAgentActionStatus(id, status) {
  const updated = await prisma.agentAction.update({
    where: { id },
    data: {
      status,
      nextRetryAt: status === 'APPROVED' ? new Date() : null
    },
    include: {
      call: {
        include: {
          contact: true
        }
      }
    }
  });

  if (status === 'APPROVED' || status === 'EXECUTED') {
    return executeAgentActionById(id);
  }

  return updated;
}
