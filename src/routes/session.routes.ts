import { Router } from 'express';

import { sessionController } from '../controllers/session.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

export const sessionRouter = Router();

sessionRouter.use(authenticate);

sessionRouter.get('/', sessionController.listSessions);
sessionRouter.delete('/others', sessionController.revokeOthers);
sessionRouter.delete('/:id', sessionController.revokeSession);
