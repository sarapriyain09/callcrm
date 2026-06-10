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
