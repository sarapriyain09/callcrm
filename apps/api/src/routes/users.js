import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { requireRole } from '../middleware/roleGuard.js';
import { hashPassword } from '../utils/passwordHash.js';

const router = Router();

const roleEnum = z.enum(['ADMIN', 'AGENT']);
const teamEnum = z.enum(['SALES', 'SUPPORT', 'ACCOUNTS']);
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{8,15}$/, 'phoneNumber must be an E.164-like number')
  .optional();

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  role: roleEnum.default('AGENT'),
  team: teamEnum.default('SUPPORT'),
  phoneNumber: phoneSchema,
  isActive: z.boolean().default(true)
});

const updateUserSchema = z
  .object({
    username: z.string().trim().min(3).max(64).optional(),
    email: z.string().trim().email().optional(),
    password: z.string().min(8).max(128).optional(),
    role: roleEnum.optional(),
    team: teamEnum.optional(),
    phoneNumber: phoneSchema,
    isAvailable: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required'
  });

router.get('/', requireRole(['admin']), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        team: true,
        phoneNumber: true,
        isActive: true,
        isAvailable: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return res.json({ data: users });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole(['admin']), async (req, res, next) => {
  try {
    const payload = createUserSchema.parse(req.body || {});

    const user = await prisma.user.create({
      data: {
        username: payload.username,
        email: payload.email,
        passwordHash: hashPassword(payload.password),
        role: payload.role,
        team: payload.team,
        phoneNumber: payload.phoneNumber || null,
        isActive: payload.isActive
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        team: true,
        phoneNumber: true,
        isActive: true,
        isAvailable: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return res.status(201).json({ data: user });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireRole(['admin']), async (req, res, next) => {
  try {
    const payload = updateUserSchema.parse(req.body || {});
    const data = {
      ...(payload.username ? { username: payload.username } : {}),
      ...(payload.email ? { email: payload.email } : {}),
      ...(payload.role ? { role: payload.role } : {}),
      ...(payload.team ? { team: payload.team } : {}),
      ...(Object.hasOwn(payload, 'phoneNumber')
        ? { phoneNumber: payload.phoneNumber || null }
        : {}),
      ...(typeof payload.isAvailable === 'boolean' ? { isAvailable: payload.isAvailable } : {}),
      ...(typeof payload.isActive === 'boolean' ? { isActive: payload.isActive } : {}),
      ...(payload.password ? { passwordHash: hashPassword(payload.password) } : {})
    };

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        team: true,
        phoneNumber: true,
        isActive: true,
        isAvailable: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return res.json({ data: user });
  } catch (error) {
    next(error);
  }
});

export default router;