import { Router } from 'express';

import { connectionPresenter } from '../presenters/connection.presenter.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  createConnectionSchema,
  respondConnectionSchema,
} from '../validators/connection.schema.js';

export const connectionRouter = Router();

connectionRouter.use(authenticate);

connectionRouter.get('/', connectionPresenter.listMyConnections);
connectionRouter.post('/', validate(createConnectionSchema), connectionPresenter.sendRequest);
connectionRouter.patch('/:id', validate(respondConnectionSchema), connectionPresenter.respond);
