import { Router } from 'express';

import { authPresenter } from '../presenters/auth.presenter.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  loginSchema,
  registerSchema,
  reauthSchema,
} from '../validators/auth.schema.js';

export const authRouter = Router();

authRouter.post('/register', validate(registerSchema), authPresenter.register);
authRouter.post('/login', validate(loginSchema), authPresenter.login);
authRouter.post('/refresh', authPresenter.refresh);
authRouter.post('/logout', authPresenter.logout);

authRouter.use(authenticate);
authRouter.get('/me', authPresenter.getCurrentUser);
authRouter.post('/reauth', validate(reauthSchema), authPresenter.reauth);
