import { Router } from 'express';

import { privacyController } from '../controllers/privacy.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { updatePrivacySchema } from '../validators/privacy.schema.js';

export const privacyRouter = Router();

privacyRouter.use(authenticate);
privacyRouter.get('/me', privacyController.getMine);
privacyRouter.patch('/me', validate(updatePrivacySchema), privacyController.updateMine);
