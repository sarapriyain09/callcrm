import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentEnvPath = path.resolve(process.cwd(), '.env');
const rootEnvPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../.env'
);
const ENV_PATH = rootEnvPath;

export const editablePlainKeys = [
  'DATABASE_URL',
  'APP_BASE_URL',
  'TWILIO_PHONE_NUMBER',
  'ROUTE_SALES_NUMBER',
  'ROUTE_SUPPORT_NUMBER',
  'ROUTE_ACCOUNTS_NUMBER',
  'DEFAULT_ROUTE_DIGIT',
  'AFTER_HOURS_ROUTE_NUMBER',
  'BUSINESS_HOURS_START',
  'BUSINESS_HOURS_END',
  'BUSINESS_DAYS',
  'BUSINESS_HOLIDAYS',
  'LUNCH_BREAK_START',
  'LUNCH_BREAK_END',
  'ENABLE_FAILOVER',
  'MISSED_CALL_ALERT_EMAIL',
  'CRM_SYNC_ENABLED',
  'CRM_WEBHOOK_URL',
  'OPENAI_MODEL'
];

export const editableSecretKeys = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET',
  'CRM_WEBHOOK_TOKEN',
  'OPENAI_API_KEY'
];

const plainDefaults = {
  DEFAULT_ROUTE_DIGIT: '2',
  AFTER_HOURS_ROUTE_NUMBER: '',
  BUSINESS_HOURS_START: '9',
  BUSINESS_HOURS_END: '18',
  BUSINESS_DAYS: '1,2,3,4,5',
  BUSINESS_HOLIDAYS: '',
  LUNCH_BREAK_START: '13',
  LUNCH_BREAK_END: '14',
  ENABLE_FAILOVER: 'true',
  CRM_SYNC_ENABLED: 'false',
  CRM_WEBHOOK_URL: '',
  OPENAI_MODEL: 'gpt-4o-mini'
};

function formatEnvValue(value) {
  const str = String(value ?? '');
  if (str.length === 0) return '';

  if (/[\s#"'`]/.test(str)) {
    return `"${str.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  }

  return str;
}

async function readParsedEnv() {
  const merged = {};

  // Load root .env as source-of-truth, then allow local workspace override if present.
  const paths = [rootEnvPath, currentEnvPath];

  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const raw = await fs.readFile(p, 'utf8');
      Object.assign(merged, dotenv.parse(raw));
    } catch {
      // Ignore unreadable env files and continue with whatever is available.
    }
  }

  return merged;
}

export async function getSettingsView() {
  const parsed = await readParsedEnv();

  const values = {};
  const secrets = {};

  for (const key of editablePlainKeys) {
    values[key] = parsed[key] ?? plainDefaults[key] ?? '';
  }

  for (const key of editableSecretKeys) {
    secrets[key] = {
      isSet: Boolean(parsed[key] && String(parsed[key]).trim())
    };
  }

  return { values, secrets };
}

export async function updateSettings(input) {
  const parsed = await readParsedEnv();
  const next = { ...parsed };

  for (const key of editablePlainKeys) {
    if (Object.hasOwn(input, key)) {
      next[key] = String(input[key] ?? '');
    }
  }

  for (const key of editableSecretKeys) {
    if (Object.hasOwn(input, key)) {
      const maybe = String(input[key] ?? '');
      if (maybe.trim()) {
        next[key] = maybe;
      }
    }
  }

  const keys = Object.keys(next).sort((a, b) => a.localeCompare(b));
  const output = keys.map((key) => `${key}=${formatEnvValue(next[key])}`).join('\n');

  await fs.writeFile(ENV_PATH, `${output}\n`, 'utf8');

  return {
    updatedKeys: Object.keys(input),
    requiresRestart: true
  };
}
