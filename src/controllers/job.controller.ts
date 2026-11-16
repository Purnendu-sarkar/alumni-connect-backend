import { ApiError } from '../errors/api-error.js';
import { jobService } from '../services/job/job.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import { paginationQuerySchema, toPageMeta } from '../utils/pagination.js';
import type {
  createJobSchema,
  jobQuerySchema,
  updateJobSchema,
  closeJobSchema,
  reviewJobSchema,
  applyJobSchema,
} from '../validators/job.schema.js';
import type { z } from 'zod';

export const jobController = {
  searchJobs: asyncHandler(async (request, response) => {
    const universityId = request.auth?.universityId || request.tenant?.id;
    if (!universityId) throw ApiError.badRequest('University tenant context is required.');

    const query = request.query as unknown as z.infer<typeof jobQuerySchema>;
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

    const [jobs, total] = await jobService.searchJobs(
      universityId,
      {
        q: query.q,
        category: query.category,
        employmentType: query.employmentType,
        workMode: query.workMode,
        experienceLevel: query.experienceLevel,
        location: query.location,
        referralAvailable: query.referralAvailable,
        postedWithinDays: query.postedWithinDays,
        sort: query.sort,
      },
      { page, limit },
      request.auth?.userId,
    );

    return sendSuccess(response, {
      data: jobs,
      meta: toPageMeta(page, limit, total),
    });
  }),

  create: asyncHandler(async (request, response) => {
    const body = request.body as z.infer<typeof createJobSchema>;
    const job = await jobService.createJob(
      request.auth!.userId,
      request.auth!.universityId,
      body,
    );

    const message = body.submitNow
      ? 'Job opportunity submitted for institutional review.'
      : 'Job draft saved successfully.';

    return sendSuccess(response, {
      statusCode: 201,
      message,
      data: job,
    });
  }),

  update: asyncHandler(async (request, response) => {
    const body = request.body as z.infer<typeof updateJobSchema>;
    const job = await jobService.updateJob(
      request.auth!.userId,
      request.auth!.universityId,
      request.params.id as string,
      body,
    );

    return sendSuccess(response, {
      message: 'Job listing updated successfully.',
      data: job,
    });
  }),

  submit: asyncHandler(async (request, response) => {
    const job = await jobService.submitJob(
      request.auth!.userId,
      request.auth!.universityId,
      request.params.id as string,
    );

    return sendSuccess(response, {
      message: 'Job listing submitted for institutional moderation.',
      data: job,
    });
  }),

  withdraw: asyncHandler(async (request, response) => {
    const job = await jobService.withdrawJob(
      request.auth!.userId,
      request.auth!.universityId,
      request.params.id as string,
    );

    return sendSuccess(response, {
      message: 'Job submission withdrawn back to Draft status.',
      data: job,
    });
  }),

  duplicate: asyncHandler(async (request, response) => {
    const job = await jobService.duplicateJob(
      request.auth!.userId,
      request.auth!.universityId,
      request.params.id as string,
    );

    return sendSuccess(response, {
      statusCode: 201,
      message: 'Job listing cloned as a new draft.',
      data: job,
    });
  }),

  close: asyncHandler(async (request, response) => {
    const body = request.body as z.infer<typeof closeJobSchema>;
    const job = await jobService.closeJob(
      request.auth!.userId,
      request.auth!.role,
      request.auth!.universityId,
      request.params.id as string,
      body?.reason,
    );

    return sendSuccess(response, {
      message: 'Job listing closed successfully.',
      data: job,
    });
  }),

  delete: asyncHandler(async (request, response) => {
    await jobService.deleteJob(request.auth!.userId, request.params.id as string);
    return sendSuccess(response, {
      message: 'Job listing removed.',
    });
  }),

  getById: asyncHandler(async (request, response) => {
    const job = await jobService.getJobDetail(
      request.params.id as string,
      request.auth?.userId,
    );
    return sendSuccess(response, { data: job });
  }),

  getOwnerView: asyncHandler(async (request, response) => {
    const job = await jobService.getOwnerJobDetail(
      request.params.id as string,
      request.auth!.userId,
    );
    return sendSuccess(response, { data: job });
  }),

  listMine: asyncHandler(async (request, response) => {
    const result = await jobService.listMine(request.auth!.userId, request.auth!.role);
    return sendSuccess(response, { data: result });
  }),

  // Legacy compatibility handlers
  listPublished: asyncHandler(async (request, response) => {
    const universityId = request.auth?.universityId || request.tenant?.id;
    if (!universityId) throw ApiError.badRequest('A tenant context is required.');
    const query = paginationQuerySchema.parse(request.query);
    const [jobs, total] = await jobService.searchJobs(
      universityId,
      {},
      query,
      request.auth?.userId,
    );
    return sendSuccess(response, {
      data: jobs,
      meta: toPageMeta(query.page, query.limit, total),
    });
  }),

  listPending: asyncHandler(async (request, response) => {
    const pagination = paginationQuerySchema.parse(request.query);
    const [jobs, total] = await jobService.listPending(request.auth!.universityId, pagination);
    return sendSuccess(response, {
      data: jobs,
      meta: toPageMeta(pagination.page, pagination.limit, total),
    });
  }),

  review: asyncHandler(async (request, response) => {
    const body = request.body as z.infer<typeof reviewJobSchema>;
    const status = body.status === 'CHANGES_REQUESTED' ? 'REJECTED' : body.status;
    const job = await jobService.review({
      jobId: request.params.id as string,
      universityId: request.auth!.universityId,
      reviewerId: request.auth!.userId,
      status,
      rejectionReason: body.rejectionReason,
    });
    return sendSuccess(response, { message: 'Job review completed.', data: job });
  }),

  apply: asyncHandler(async (request, response) => {
    const body = request.body as z.infer<typeof applyJobSchema>;
    const application = await jobService.apply({
      jobId: request.params.id as string,
      universityId: request.auth!.universityId,
      applicantId: request.auth!.userId,
      message: body.message || undefined,
    });
    return sendSuccess(response, {
      statusCode: 201,
      message: 'Job application submitted.',
      data: application,
    });
  }),
};
