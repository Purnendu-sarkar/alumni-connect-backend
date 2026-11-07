import { Router } from 'express';

import { userPresenter } from '../presenters/user.presenter.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { updateProfileSchema } from '../validators/user.schema.js';

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get('/me', userPresenter.getMyProfile);
userRouter.patch('/me', validate(updateProfileSchema), userPresenter.updateMyProfile);
userRouter.get('/:id', userPresenter.getUserById);
