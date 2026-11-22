import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { env } from '../config/index.js';
import { getRateLimitStore } from '../config/redis.js';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  quickAccessSchema,
  registerSchema,
  resetPasswordSchema,
  setupAccountSchema,
  setupAccountValidateSchema,
  verifyEmailSchema,
} from '../validators/auth.schema.js';

const isProd = env.NODE_ENV === 'production';

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: isProd ? 10 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore('login'),
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

const registerRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: isProd ? 10 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore('register'),
  message: { success: false, message: 'Too many registration attempts. Please try again later.' },
});

const forgotPasswordRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: isProd ? 3 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore('forgot-password'),
  message: {
    success: false,
    message: 'Too many password reset requests. Please check your inbox or try again in 15 minutes.',
  },
});

const resetPasswordRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: isProd ? 5 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore('reset-password'),
  message: { success: false, message: 'Too many password reset attempts. Please try again later.' },
});

const changePasswordRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: isProd ? 5 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore('change-password'),
  message: { success: false, message: 'Too many password change attempts. Please try again later.' },
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: isProd ? 20 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore('auth'),
  message: { success: false, message: 'Too many authentication attempts. Try again later.' },
});

const refreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: isProd ? 60 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore('refresh'),
  message: { success: false, message: 'Too many session refresh attempts. Try again later.' },
});

export const authRouter = Router();

authRouter.post('/register', registerRateLimit, validate(registerSchema), authController.register);
authRouter.post('/login', loginRateLimit, validate(loginSchema), authController.login);
authRouter.post('/refresh', refreshRateLimit, authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', authenticate, authController.me);
authRouter.get('/login-history', authenticate, authController.getLoginHistory);
authRouter.post(
  '/change-password',
  authenticate,
  changePasswordRateLimit,
  validate(changePasswordSchema),
  authController.changePassword,
);

// Moderator Account Setup Endpoints
authRouter.get(
  '/setup-account/validate',
  validate(setupAccountValidateSchema, 'query'),
  authController.validateSetupAccount,
);
authRouter.post(
  '/setup-account',
  authRateLimit,
  validate(setupAccountSchema),
  authController.setupAccount,
);

// Password Reset & Email Verification Routes
authRouter.post(
  '/forgot-password',
  forgotPasswordRateLimit,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);
authRouter.post(
  '/reset-password',
  resetPasswordRateLimit,
  validate(resetPasswordSchema),
  authController.resetPassword,
);
authRouter.post(
  '/send-verification-email',
  authenticate,
  authController.sendVerificationEmail,
);
authRouter.post(
  '/resend-verification-email',
  forgotPasswordRateLimit,
  authController.resendVerificationEmail,
);
authRouter.post(
  '/verify-email',
  validate(verifyEmailSchema),
  authController.verifyEmail,
);

// Quick Role Access Showcase Endpoints
const quickAccessRateLimit = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many quick access login attempts. Try again later.' },
});

authRouter.get(
  '/quick-access/profiles',
  authController.getQuickAccessProfiles,
);

authRouter.post(
  '/quick-access',
  quickAccessRateLimit,
  validate(quickAccessSchema),
  authController.quickAccessLogin,
);

// Backward compatibility aliases for legacy demo endpoints
authRouter.get(
  '/demo-capabilities',
  authController.getQuickAccessProfiles,
);

authRouter.post(
  '/demo-login',
  quickAccessRateLimit,
  validate(quickAccessSchema),
  authController.quickAccessLogin,
);

