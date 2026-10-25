import { ApiError } from '../errors/api-error.js';
import { jobService } from '../services/job/job.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import { paginationQuerySchema, toPageMeta } from '../utils/pagination.js';
import type {
  applyJobSchema,
  createJobSchema,
  jobQuerySchema,
  reviewJobSchema,
} from '../validators/job.schema.js';
import type { z } from 'zod';

type JobQuery = z.infer<typeof jobQuerySchema>;
type CreateJobInput = z.infer<typeof createJobSchema>;
type ReviewJobInput = z.infer<typeof reviewJobSchema>;
type ApplyJobInput = z.infer<typeof applyJobSchema>;

export const jobController = {
  listPublished: asyncHandler(async (request, response) => {
    if (!request.tenant) throw ApiError.badRequest('A tenant context is required.');
    const query = request.query as unknown as JobQuery;
    const [jobs, total] = await jobService.listPublished(request.tenant.id, query);
    return sendSuccess(response, {
      data: jobs,
      meta: toPageMeta(query.page, query.limit, total),
    });
  }),

  create: asyncHandler(async (request, response) => {
    const job = await jobService.create({
      universityId: request.auth!.universityId,
      postedById: request.auth!.userId,
      ...(request.body as CreateJobInput),
    });
    return sendSuccess(response, {
      statusCode: 201,
      message: 'Job submitted for moderation.',
      data: job,
    });
  }),

  review: asyncHandler(async (request, response) => {
    const body = request.body as ReviewJobInput;
    const job = await jobService.review({
      jobId: request.params.id as string,
      universityId: request.auth!.universityId,
      reviewerId: request.auth!.userId,
      ...body,
    });
    return sendSuccess(response, { message: 'Job review completed.', data: job });
  }),

  apply: asyncHandler(async (request, response) => {
    const body = request.body as ApplyJobInput;
    const application = await jobService.apply({
      jobId: request.params.id as string,
      universityId: request.auth!.universityId,
      applicantId: request.auth!.userId,
      ...body,
    });
    return sendSuccess(response, {
      statusCode: 201,
      message: 'Job application submitted.',
      data: application,
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

  listMine: asyncHandler(async (request, response) => {
    const result = await jobService.listMine(request.auth!.userId, request.auth!.role);
    return sendSuccess(response, { data: result });
  }),

  getById: asyncHandler(async (request, response) => {
    const job = await jobService.getById(request.params.id as string);
    if (!job) throw ApiError.notFound('Job');
    return sendSuccess(response, { data: job });
  }),
};
