import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { demoController } from './demo.controller.js';

const demoRateLimit = rateLimit({
  windowMs: 5 * 60 * 1_000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many demo requests. Please wait a moment.' },
});

export const demoRouter = Router();

demoRouter.use(demoRateLimit);

demoRouter.get('/capabilities', demoController.getCapabilities);
demoRouter.post('/login', demoController.demoLogin);
demoRouter.get('/emails', demoController.getCapturedEmails);
