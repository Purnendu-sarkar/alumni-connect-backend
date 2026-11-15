import { Router } from 'express';

import { blockController } from '../controllers/block.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { blockUserSchema, unblockParamSchema } from '../validators/block.schema.js';

export const blockRouter = Router();

blockRouter.use(authenticate);
blockRouter.post('/', validate(blockUserSchema), blockController.block);
blockRouter.delete('/:userId', validate(unblockParamSchema, 'params'), blockController.unblock);
