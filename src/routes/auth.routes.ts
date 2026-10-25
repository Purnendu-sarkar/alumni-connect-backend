import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validators/auth.schema.js';

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Try again later.' },
});

const refreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many session refresh attempts. Try again later.' },
});

export const authRouter = Router();

authRouter.post('/register', authRateLimit, validate(registerSchema), authController.register);
authRouter.post('/login', authRateLimit, validate(loginSchema), authController.login);
authRouter.post('/refresh', refreshRateLimit, authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', authenticate, authController.me);

// Password Reset & Email Verification Routes
authRouter.post(
  '/forgot-password',
  authRateLimit,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);
authRouter.post(
  '/reset-password',
  authRateLimit,
  validate(resetPasswordSchema),
  authController.resetPassword,
);
authRouter.post(
  '/send-verification-email',
  authenticate,
  authController.sendVerificationEmail,
);
authRouter.post(
  '/verify-email',
  validate(verifyEmailSchema),
  authController.verifyEmail,
);

// Development Demo Endpoints (Removable & Graceful fallback if module is disabled/omitted)
authRouter.get(
  '/demo-capabilities',
  async (request, response, next) => {
    try {
      const { demoController } = await import('../dev/demo.controller.js');
      return demoController.getCapabilities(request, response, next);
    } catch {
      return response.status(200).json({ success: true, data: { enabled: false, roles: [] } });
    }
  },
);

const demoRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many demo login attempts. Try again later.' },
});

authRouter.post(
  '/demo-login',
  demoRateLimit,
  async (request, response, next) => {
    try {
      const { demoController } = await import('../dev/demo.controller.js');
      return demoController.demoLogin(request, response, next);
    } catch (err) {
      return next(err);
    }
  },
);

