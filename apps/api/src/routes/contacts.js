import { Router } from 'express';
import { listContacts } from '../services/contactService.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const contacts = await listContacts();
    res.json({ data: contacts });
  } catch (error) {
    next(error);
  }
});

export default router;
