import { Router } from 'express';

import { alumniPresenter } from '../presenters/alumni.presenter.js';
import { authenticate } from '../middlewares/auth.middleware.js';

export const alumniRouter = Router();

alumniRouter.use(authenticate);

alumniRouter.get('/', alumniPresenter.listDirectory);
alumniRouter.get('/:id', alumniPresenter.getAlumnusById);
