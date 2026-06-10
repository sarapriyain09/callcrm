import dotenv from 'dotenv';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function parseOptionalHour(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

const currentEnvPath = path.resolve(process.cwd(), '.env');
const rootEnvPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../.env'
);

if (existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

if (existsSync(currentEnvPath)) {
  dotenv.config({ path: currentEnvPath, override: true });
}

const required = ['DATABASE_URL', 'TWILIO_PHONE_NUMBER'];

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[config] Missing env var: ${key}`);
  }
}

export const config = {
  port: Number(process.env.PORT || 4000),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:4000',
  databaseUrl: process.env.DATABASE_URL,
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioApiKeySid: process.env.TWILIO_API_KEY_SID || '',
  twilioApiKeySecret: process.env.TWILIO_API_KEY_SECRET || '',
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  routeSalesNumber: process.env.ROUTE_SALES_NUMBER || '',
  routeSupportNumber: process.env.ROUTE_SUPPORT_NUMBER || '',
  routeAccountsNumber: process.env.ROUTE_ACCOUNTS_NUMBER || '',
  defaultRouteDigit: process.env.DEFAULT_ROUTE_DIGIT || '2',
  afterHoursRouteNumber: process.env.AFTER_HOURS_ROUTE_NUMBER || '',
  businessHoursStart: Number(process.env.BUSINESS_HOURS_START || 9),
  businessHoursEnd: Number(process.env.BUSINESS_HOURS_END || 18),
  businessDays: (process.env.BUSINESS_DAYS || '1,2,3,4,5')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6),
  businessHolidays: (process.env.BUSINESS_HOLIDAYS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
  lunchBreakStart: parseOptionalHour(process.env.LUNCH_BREAK_START),
  lunchBreakEnd: parseOptionalHour(process.env.LUNCH_BREAK_END),
  enableFailover: (process.env.ENABLE_FAILOVER || 'true').toLowerCase() !== 'false',
  missedCallAlertEmail: process.env.MISSED_CALL_ALERT_EMAIL || '',
  agentAutomationEnabled: (process.env.AGENT_AUTOMATION_ENABLED || 'true').toLowerCase() !== 'false',
  agentApprovalMode: (process.env.AGENT_APPROVAL_MODE || 'review').toLowerCase(),
  agentMaxRetries: Number(process.env.AGENT_MAX_RETRIES || 3),
  agentRetryDelaySeconds: Number(process.env.AGENT_RETRY_DELAY_SECONDS || 60),
  agentRetryIntervalSeconds: Number(process.env.AGENT_RETRY_INTERVAL_SECONDS || 60),
  agentNotificationEmailTo: process.env.AGENT_NOTIFICATION_EMAIL_TO || '',
  twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',
  crmSyncEnabled: (process.env.CRM_SYNC_ENABLED || 'false').toLowerCase() === 'true',
  crmWebhookUrl: process.env.CRM_WEBHOOK_URL || '',
  crmWebhookToken: process.env.CRM_WEBHOOK_TOKEN || '',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
};
