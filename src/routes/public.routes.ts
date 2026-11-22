import { Router } from 'express';
import { publicController } from '../controllers/public.controller.js';

export const publicRouter = Router();

/**
 * Public consolidated overview for landing page
 * GET /api/v1/public/overview
 * Unauthenticated, cached in Redis for 300 seconds
 */
publicRouter.get('/overview', publicController.getOverview);
