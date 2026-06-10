import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { verifyPassword } from '../utils/passwordHash.js';

const router = Router();

const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(8)
});

router.post('/login', async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body || {});

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: payload.identifier, mode: 'insensitive' } },
          { username: { equals: payload.identifier, mode: 'insensitive' } }
        ]
      }
    });

    if (!user || !user.isActive || !verifyPassword(payload.password, user.passwordHash)) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    return res.json({
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        roleHeaderValue: user.role.toLowerCase()
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;