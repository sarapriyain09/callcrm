import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { verifyPassword } from '../utils/passwordHash.js';

const router = Router();

const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(8)
});

const logoutSchema = z.object({
  userId: z.string().trim().min(1)
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

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isAvailable: true,
        lastLoginAt: new Date()
      }
    });

    return res.json({
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        team: updatedUser.team,
        phoneNumber: updatedUser.phoneNumber,
        isAvailable: updatedUser.isAvailable,
        readOnly: String(updatedUser.username || '').toLowerCase() === 'demo',
        roleHeaderValue: updatedUser.role.toLowerCase()
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const payload = logoutSchema.parse(req.body || {});

    await prisma.user.update({
      where: { id: payload.userId },
      data: { isAvailable: false }
    });

    return res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

export default router;