import { applicationService } from '../services/job/application.service.js';
import { resumeService } from '../services/media/resume.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import { paginationQuerySchema, toPageMeta } from '../utils/pagination.js';
import type {
  applyJobSchema,
  updateApplicationStatusSchema,
  withdrawApplicationSchema,
  ownerApplicationsQuerySchema,
} from '../validators/job.schema.js';
import type { z } from 'zod';

export const applicationController = {
  apply: asyncHandler(async (request, response) => {
    const body = request.body as z.infer<typeof applyJobSchema>;
    const application = await applicationService.applyToJob(
      request.auth!.userId,
      request.auth!.universityId,
      request.params.id as string,
      body,
    );

    return sendSuccess(response, {
      statusCode: 201,
      message: 'Your application was submitted successfully.',
      data: application,
    });
  }),

  getMyApplications: asyncHandler(async (request, response) => {
    const query = paginationQuerySchema.parse(request.query);
    const [apps, total] = await applicationService.getMyApplications(
      request.auth!.userId,
      query,
    );

    return sendSuccess(response, {
      data: apps,
      meta: toPageMeta(query.page, query.limit, total),
    });
  }),

  getDetail: asyncHandler(async (request, response) => {
    const app = await applicationService.getApplicationDetail(
      request.params.id as string,
      request.auth!.userId,
      request.auth!.role,
    );

    return sendSuccess(response, { data: app });
  }),

  withdraw: asyncHandler(async (request, response) => {
    const body = request.body as z.infer<typeof withdrawApplicationSchema>;
    const app = await applicationService.withdrawApplication(
      request.params.id as string,
      request.auth!.userId,
      request.auth!.universityId,
      body?.note || undefined,
    );

    return sendSuccess(response, {
      message: 'Application candidacy withdrawn successfully.',
      data: app,
    });
  }),

  getJobApplications: asyncHandler(async (request, response) => {
    const query = request.query as unknown as z.infer<typeof ownerApplicationsQuerySchema>;
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

    const [apps, total] = await applicationService.getJobApplicationsForOwner(
      request.params.jobId as string,
      request.auth!.userId,
      { status: query.status, q: query.q },
      { page, limit },
    );

    return sendSuccess(response, {
      data: apps,
      meta: toPageMeta(page, limit, total),
    });
  }),

  getReceivedApplications: asyncHandler(async (request, response) => {
    const query = request.query as unknown as z.infer<typeof ownerApplicationsQuerySchema> & { jobId?: string };
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

    const [apps, total] = await applicationService.getAllReceivedApplicationsForOwner(
      request.auth!.userId,
      { jobId: query.jobId, status: query.status, q: query.q },
      { page, limit },
    );

    return sendSuccess(response, {
      data: apps,
      meta: toPageMeta(page, limit, total),
    });
  }),

  updateStatus: asyncHandler(async (request, response) => {
    const body = request.body as z.infer<typeof updateApplicationStatusSchema>;
    const app = await applicationService.updateApplicationStatus(
      request.params.jobId as string,
      request.params.id as string,
      request.auth!.userId,
      request.auth!.universityId,
      body.status,
      body.ownerNote,
    );

    return sendSuccess(response, {
      message: `Candidate status updated to ${body.status}.`,
      data: app,
    });
  }),

  getSignedResume: asyncHandler(async (request, response) => {
    const result = await resumeService.generateSignedResumeUrl(
      request.params.id as string,
      request.auth!.userId,
      request.auth!.role,
      request.auth!.universityId,
    );

    return sendSuccess(response, {
      message: 'Signed resume URL generated successfully.',
      data: result,
    });
  }),
};
