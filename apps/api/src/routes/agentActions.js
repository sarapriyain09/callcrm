import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/roleGuard.js';
import {
  createAndExecuteEmailAction,
  createAndExecuteSmsAction,
  generateEmailDraft,
  generateSmsDraft,
  listAgentActions,
  processDueAgentRetries,
  updateAgentActionStatus
} from '../services/agentService.js';

const router = Router();

router.get('/', requireRole(['admin', 'agent']), async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const data = await listAgentActions({ status });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

const statusSchema = z.object({
  status: z.enum(['APPROVED', 'EXECUTED', 'REJECTED', 'FAILED'])
});

router.put('/:id/status', requireRole(['admin']), async (req, res, next) => {
  try {
    const payload = statusSchema.parse(req.body || {});
    const data = await updateAgentActionStatus(req.params.id, payload.status);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post('/process-retries', requireRole(['admin']), async (_req, res, next) => {
  try {
    const data = await processDueAgentRetries();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

const smsSchema = z.object({
  callId: z.string().trim().min(1),
  toNumber: z.string().trim().min(8).optional(),
  body: z.string().trim().max(480).optional()
});

router.post('/sms-draft', requireRole(['admin', 'agent']), async (req, res, next) => {
  try {
    const payload = smsSchema.parse(req.body || {});
    const data = await generateSmsDraft(payload);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post('/sms-send', requireRole(['admin', 'agent']), async (req, res, next) => {
  try {
    const payload = smsSchema.parse(req.body || {});
    const data = await createAndExecuteSmsAction(payload);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

const emailSchema = z.object({
  callId: z.string().trim().min(1),
  toEmail: z.string().trim().email().optional(),
  subject: z.string().trim().max(180).optional(),
  body: z.string().trim().max(5000).optional()
});

router.post('/email-draft', requireRole(['admin', 'agent']), async (req, res, next) => {
  try {
    const payload = emailSchema.parse(req.body || {});
    const data = await generateEmailDraft(payload);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post('/email-send', requireRole(['admin', 'agent']), async (req, res, next) => {
  try {
    const payload = emailSchema.parse(req.body || {});
    const data = await createAndExecuteEmailAction(payload);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

export default router;
