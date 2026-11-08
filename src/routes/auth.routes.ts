import { Router } from 'express';

import { authPresenter } from '../presenters/auth.presenter.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  loginSchema,
  registerSchema,
  reauthSchema,
  setupAccountSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.schema.js';

export const authRouter = Router();

authRouter.post('/register', validate(registerSchema), authPresenter.register);
authRouter.post('/verify-email', validate(verifyEmailSchema), authPresenter.verifyEmail);
authRouter.post(
  '/resend-verification',
  validate(resendVerificationSchema),
  authPresenter.resendVerification,
);

authRouter.get('/setup-account/validate', authPresenter.validateSetupToken);
authRouter.post('/setup-account', validate(setupAccountSchema), authPresenter.setupAccount);

authRouter.post('/forgot-password', validate(forgotPasswordSchema), authPresenter.forgotPassword);
authRouter.post('/reset-password', validate(resetPasswordSchema), authPresenter.resetPassword);

authRouter.post('/login', validate(loginSchema), authPresenter.login);
authRouter.post('/refresh', authPresenter.refresh);
authRouter.post('/logout', authPresenter.logout);

authRouter.use(authenticate);
authRouter.get('/me', authPresenter.getCurrentUser);
authRouter.post('/reauth', validate(reauthSchema), authPresenter.reauth);
