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
