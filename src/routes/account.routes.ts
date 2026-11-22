import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { accountController } from '../controllers/account.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  deactivateAccountSchema,
  deleteAccountSchema,
} from '../validators/account.schema.js';

export const accountRouter = Router();

accountRouter.use(authenticate);

const exportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1_000, // 1 hour
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many data export requests. Please try again in an hour.',
  },
});

accountRouter.get('/', accountController.getSummary);
accountRouter.post('/data-export', exportRateLimit, accountController.requestDataExport);
accountRouter.post('/deactivate', validate(deactivateAccountSchema), accountController.deactivate);
accountRouter.post('/delete', validate(deleteAccountSchema), accountController.delete);
