import { Router } from 'express';
import { z } from 'zod';
import {
  editablePlainKeys,
  editableSecretKeys,
  getSettingsView,
  updateSettings
} from '../utils/envSettings.js';
import { requireRole } from '../middleware/roleGuard.js';
import { config } from '../config.js';
import { testTwilioConfiguration } from '../services/twilioClient.js';

const router = Router();

function isValidTwilioCallbackBaseUrl(value) {
  if (!value || typeof value !== 'string') return false;

  try {
    const parsed = new URL(value);
    const protocolOk = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    if (!protocolOk) return false;

    const hostname = parsed.hostname.toLowerCase();
    return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1';
  } catch {
    return false;
  }
}

router.get('/', requireRole(['admin']), async (_req, res, next) => {
  try {
    const data = await getSettingsView();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

const inputSchema = z
  .object(
    Object.fromEntries(
      [...editablePlainKeys, ...editableSecretKeys].map((key) => [
        key,
        z.string().optional()
      ])
    )
  )
  .strict();

router.post('/', requireRole(['admin']), async (req, res, next) => {
  try {
    const payload = inputSchema.parse(req.body || {});

    if (
      Object.hasOwn(payload, 'APP_BASE_URL') &&
      payload.APP_BASE_URL &&
      !isValidTwilioCallbackBaseUrl(payload.APP_BASE_URL)
    ) {
      return res.status(400).json({
        error: 'Invalid APP_BASE_URL',
        message:
          'APP_BASE_URL must be an absolute public http(s) URL and cannot use localhost. Use your tunnel or production API URL.'
      });
    }

    const result = await updateSettings(payload);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/twilio-test', requireRole(['admin']), async (_req, res, next) => {
  try {
    const result = await testTwilioConfiguration(config);
    res.status(result.ok ? 200 : 400).json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
