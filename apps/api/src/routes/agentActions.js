import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/roleGuard.js';
import {
  listAgentActions,
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
  status: z.enum(['APPROVED', 'EXECUTED', 'REJECTED'])
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

export default router;
