import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { loginSchema, registerSchema } from '../validators/auth.schema.js';

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Try again later.' },
});

export const authRouter = Router();

authRouter.post('/register', authRateLimit, validate(registerSchema), authController.register);
authRouter.post('/login', authRateLimit, validate(loginSchema), authController.login);
authRouter.post('/refresh', authRateLimit, authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', authenticate, authController.me);
