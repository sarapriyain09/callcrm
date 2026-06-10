import { config } from '../config.js';
import { prisma } from './db.js';
import { sendAgentActionEmail } from './notificationService.js';
import { buildTwilioClient } from './twilioClient.js';

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

      await twilioClient.messages.create({
        from: config.twilioWhatsappFrom,
        to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
        body: `Hello from Splendid Technology. Following up on your recent call (${call.twilioCallSid}).`
      });
      return;
    }
    case 'SEND_EMAIL_ALERT': {
      await sendAgentActionEmail({
        toEmail: config.agentNotificationEmailTo,
        subject: `[CallCRM] ${action.title}`,
        body: action.details || `Action ${action.actionType} for call ${call.twilioCallSid}`
      });
      return;
    }
    default:
      await postCrmActionEvent(action, call);
  }
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
    await executeConnector(action, action.call);

    return prisma.agentAction.update({
      where: { id: action.id },
      data: {
        status: 'EXECUTED',
        executedAt: new Date(),
        lastError: null,
        nextRetryAt: null
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
