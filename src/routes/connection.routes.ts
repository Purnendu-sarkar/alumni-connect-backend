import { Router } from 'express';

import { PERMISSIONS } from '../constants/permissions.js';
import { connectionController } from '../controllers/connection.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  connectionIdParamSchema,
  createConnectionSchema,
  respondConnectionSchema,
} from '../validators/connection.schema.js';

export const connectionRouter = Router();

connectionRouter.use(authenticate);
connectionRouter.get('/', connectionController.listMine);
connectionRouter.post(
  '/',
  requirePermission(PERMISSIONS.CONNECTION_CREATE),
  validate(createConnectionSchema),
  connectionController.create,
);
connectionRouter.patch(
  '/:id/respond',
  requirePermission(PERMISSIONS.CONNECTION_RESPOND),
  validate(connectionIdParamSchema, 'params'),
  validate(respondConnectionSchema),
  connectionController.respond,
);
