import { Router } from 'express';

import { prisma } from '../config/database.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import { adminRouter } from './admin.routes.js';
import { adminJobRouter } from './admin-job.routes.js';
import { alumniRouter } from './alumni.routes.js';
import { applicationRouter } from './application.routes.js';
import { authRouter } from './auth.routes.js';
import { blockRouter } from './block.routes.js';
import { connectionRouter } from './connection.routes.js';
import { departmentRouter, adminDepartmentRouter } from './department.routes.js';
import { directoryRouter } from './directory.routes.js';
import { jobRouter } from './job.routes.js';
import { mediaRouter } from './media.routes.js';
import { mentorshipRouter, adminMentorshipRouter } from './mentorship.routes.js';
import { moderatorJobRouter } from './moderator-job.routes.js';
import { notificationRouter } from './notification.routes.js';
import { privacyRouter } from './privacy.routes.js';
import { uploadRouter } from './upload.routes.js';
import { userRouter } from './user.routes.js';
import { eventRouter } from './event.routes.js';
import { adminEventRouter } from './admin-event.routes.js';
import { announcementRouter } from './announcement.routes.js';
import { adminAnnouncementRouter } from './admin-announcement.routes.js';
import { storyRouter } from './story.routes.js';
import { adminStoryRouter } from './admin-story.routes.js';
import { messageRouter } from './message.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', (_request, response) =>
  sendSuccess(response, { data: { status: 'ok', service: 'alumni-connect-api' } }),
);
apiRouter.get(
  '/ready',
  asyncHandler(async (_request, response) => {
    await prisma.$queryRaw`SELECT 1`;
    return sendSuccess(response, { data: { status: 'ready', database: 'connected' } });
  }),
);

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/alumni', alumniRouter);
apiRouter.use('/directory', directoryRouter);
apiRouter.use('/connections', connectionRouter);
apiRouter.use('/blocks', blockRouter);
apiRouter.use('/privacy', privacyRouter);
apiRouter.use('/mentorship', mentorshipRouter);
apiRouter.use('/admin/mentorship', adminMentorshipRouter);
apiRouter.use('/departments', departmentRouter);
apiRouter.use('/admin/departments', adminDepartmentRouter);
apiRouter.use('/jobs', jobRouter);
apiRouter.use('/applications', applicationRouter);
apiRouter.use('/moderator/jobs', moderatorJobRouter);
apiRouter.use('/admin/jobs', adminJobRouter);
apiRouter.use('/uploads', uploadRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/media', mediaRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/events', eventRouter);
apiRouter.use('/admin/events', adminEventRouter);
apiRouter.use('/announcements', announcementRouter);
apiRouter.use('/admin/announcements', adminAnnouncementRouter);
apiRouter.use('/stories', storyRouter);
apiRouter.use('/moderator/stories', adminStoryRouter);
apiRouter.use('/admin/stories', adminStoryRouter);
apiRouter.use('/messages', messageRouter);

// Removable Development Demo Module: gracefully mounts when present and enabled
try {
  const { registerDemoRoutes } = await import('../dev/index.js');
  registerDemoRoutes(apiRouter);
} catch {
  // Removable module: if src/dev is not bundled or removed, startup continues smoothly
}

