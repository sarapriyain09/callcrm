import OpenAI from 'openai';
import { config } from '../config.js';

const client = config.openAiApiKey
  ? new OpenAI({ apiKey: config.openAiApiKey })
  : null;

function buildFallbackSummary(call, transcript, extraNotes) {
  const contactName = call.contact?.name || 'Unknown contact';
  const outcome = call.outcome || 'UNKNOWN';
  const route = call.routedTo || 'unassigned queue';

  const summary = [
    `Inbound call from ${call.fromNumber} for ${contactName}.`,
    `Current status is ${call.status} with outcome ${outcome}.`,
    `Call was routed to ${route}.`,
    transcript
      ? `Transcript captured (${transcript.split(/\s+/).length} words).`
      : 'No transcript was provided yet.',
    extraNotes ? `Operator notes: ${extraNotes}` : ''
  ]
    .filter(Boolean)
    .join(' ');

  const actionItems = [
    'Confirm owner for follow-up',
    'Log customer intent in CRM pipeline'
  ];

  if (outcome === 'MISSED') {
    actionItems.push('Attempt callback within one business day');
  }

  return {
    summary,
    actionItems,
    model: 'fallback-rules-v1'
  };
}

function parseResponsePayload(rawText) {
  try {
    const parsed = JSON.parse(rawText);

    return {
      summary: String(parsed.summary || '').trim(),
      actionItems: Array.isArray(parsed.actionItems)
        ? parsed.actionItems.map((item) => String(item).trim()).filter(Boolean)
        : []
    };
  } catch {
    return {
      summary: rawText.trim(),
      actionItems: []
    };
  }
}

function buildFallbackAssistant({ call, notes, agentActions }) {
  const knownActions = Array.isArray(agentActions) ? agentActions : [];
  const pendingActions = knownActions.filter((item) => String(item?.status || '').toUpperCase() === 'PENDING');
  const approvedActions = knownActions.filter((item) => String(item?.status || '').toUpperCase() === 'APPROVED');

  const informationToCollect = [];
  if (!call.contact?.name) informationToCollect.push('Customer full name');
  if (!call.contact?.email) informationToCollect.push('Customer email address');
  if (!call.contact?.phone && !call.fromNumber) informationToCollect.push('Best callback phone number');

  if (call.outcome === 'MISSED') {
    informationToCollect.push('Preferred callback time window');
    informationToCollect.push('Primary reason for the call');
  }

  const topPending = pendingActions[0] || approvedActions[0] || null;

  return {
    recommendedAction: topPending
      ? `Complete action: ${topPending.title}`
      : call.outcome === 'MISSED'
        ? 'Send a follow-up SMS and schedule a callback.'
        : 'Confirm customer intent and move the case to the right owner.',
    informationToCollect,
    suggestedMessage:
      call.outcome === 'MISSED'
        ? 'Hi, we missed your call. Please share your preferred callback time and how we can help.'
        : 'Thanks for speaking with us. Please confirm the next best step and any required details.',
    model: 'fallback-rules-v1',
    notesUsed: String(notes || '').trim().length > 0
  };
}

function parseAssistantPayload(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    return {
      recommendedAction: String(parsed.recommendedAction || '').trim(),
      informationToCollect: Array.isArray(parsed.informationToCollect)
        ? parsed.informationToCollect.map((item) => String(item).trim()).filter(Boolean)
        : [],
      suggestedMessage: String(parsed.suggestedMessage || '').trim()
    };
  } catch {
    return {
      recommendedAction: rawText.trim(),
      informationToCollect: [],
      suggestedMessage: ''
    };
  }
}

export async function generateCallSummary({ call, transcript, notes }) {
  if (!client) {
    return buildFallbackSummary(call, transcript, notes);
  }

  const prompt = [
    'You are an assistant for a CRM call management platform.',
    'Return strict JSON with this shape: {"summary":"...","actionItems":["..."]}.',
    'Summary must be concise and factual, 2-4 sentences.',
    'Action items must be specific and useful for sales/support follow-up.',
    '',
    `Call SID: ${call.twilioCallSid}`,
    `From: ${call.fromNumber}`,
    `To: ${call.toNumber}`,
    `Call status: ${call.status}`,
    `Call outcome: ${call.outcome || 'UNKNOWN'}`,
    `IVR selection: ${call.ivrSelection || 'none'}`,
    `Customer: ${call.contact?.name || 'Unknown'}`,
    `Tags: ${(call.contact?.tags || []).join(', ') || 'none'}`,
    `Notes: ${notes || 'none'}`,
    '',
    'Transcript:',
    transcript || 'No transcript available.'
  ].join('\n');

  const completion = await client.chat.completions.create({
    model: config.openAiModel,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You summarize business phone calls for CRM users. Be concise and action-oriented.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const content = completion.choices?.[0]?.message?.content || '';
  const parsed = parseResponsePayload(content);

  return {
    summary: parsed.summary || 'No summary generated.',
    actionItems: parsed.actionItems,
    model: config.openAiModel
  };
}

export async function generateNextStepAssistant({ call, notes, agentActions }) {
  if (!client) {
    return buildFallbackAssistant({ call, notes, agentActions });
  }

  const actionDigest = (agentActions || [])
    .slice(0, 15)
    .map((item) => {
      const status = String(item?.status || 'UNKNOWN').toUpperCase();
      return `${item?.actionType || 'UNKNOWN'} | ${status} | ${item?.title || ''}`;
    })
    .join('\n');

  const prompt = [
    'You are a CRM call assistant that proposes the next best step for an agent.',
    'Return strict JSON with this shape:',
    '{"recommendedAction":"...","informationToCollect":["..."],"suggestedMessage":"..."}.',
    'recommendedAction: one concrete next action sentence.',
    'informationToCollect: 2-6 concise missing information items.',
    'suggestedMessage: one short customer-facing message (SMS/email tone).',
    '',
    `Call SID: ${call.twilioCallSid}`,
    `Status: ${call.status}`,
    `Outcome: ${call.outcome || 'UNKNOWN'}`,
    `Direction: ${call.direction}`,
    `From: ${call.fromNumber}`,
    `To: ${call.toNumber}`,
    `Customer name: ${call.contact?.name || 'Unknown'}`,
    `Customer email: ${call.contact?.email || 'Unknown'}`,
    `Customer phone: ${call.contact?.phone || call.fromNumber || 'Unknown'}`,
    `Summary: ${call.summary || 'none'}`,
    `Transcript: ${call.transcript || 'none'}`,
    `Operator notes: ${notes || 'none'}`,
    '',
    'Current/previous agent actions:',
    actionDigest || 'none'
  ].join('\n');

  const completion = await client.chat.completions.create({
    model: config.openAiModel,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You assist CRM agents with practical next actions and data collection prompts. Be specific and concise.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const content = completion.choices?.[0]?.message?.content || '';
  const parsed = parseAssistantPayload(content);

  return {
    recommendedAction: parsed.recommendedAction || 'Review the call and prepare a follow-up.',
    informationToCollect: parsed.informationToCollect,
    suggestedMessage: parsed.suggestedMessage,
    model: config.openAiModel,
    notesUsed: String(notes || '').trim().length > 0
  };
}
