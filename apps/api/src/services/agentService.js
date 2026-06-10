import { config } from '../config.js';
import { prisma } from './db.js';

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

  const status = config.agentApprovalMode === 'auto' ? 'EXECUTED' : 'PENDING';
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
  return prisma.agentAction.update({
    where: { id },
    data: { status },
    include: {
      call: {
        include: {
          contact: true
        }
      }
    }
  });
}
