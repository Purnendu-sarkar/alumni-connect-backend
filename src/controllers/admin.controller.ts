import { adminService } from '../services/admin/admin.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import type { reviewVerificationSchema, verificationQuerySchema } from '../validators/admin.schema.js';
import type { z } from 'zod';

type VerificationQuery = z.infer<typeof verificationQuerySchema>;
type ReviewVerificationInput = z.infer<typeof reviewVerificationSchema>;

export const adminController = {
  listVerifications: asyncHandler(async (request, response) => {
    const query = request.query as unknown as VerificationQuery;
    const result = await adminService.listVerifications(request.auth!.universityId, query);
    return sendSuccess(response, {
      data: result.users,
      meta: result.meta,
    });
  }),

  reviewVerification: asyncHandler(async (request, response) => {
    const body = request.body as ReviewVerificationInput;
    const user = await adminService.reviewVerification({
      userId: request.params.userId as string,
      universityId: request.auth!.universityId,
      actorId: request.auth!.userId,
      status: body.status,
      reason: body.reason,
    });
    return sendSuccess(response, {
      message: body.status === 'APPROVED' ? 'User verification approved.' : 'User verification rejected.',
      data: user,
    });
  }),

  verifyUser: asyncHandler(async (request, response) => {
    const user = await adminService.verifyUser({
      userId: request.params.userId as string,
      universityId: request.auth!.universityId,
      actorId: request.auth!.userId,
    });
    return sendSuccess(response, { message: 'User verified.', data: user });
  }),

  listUniversities: asyncHandler(async (_request, response) => {
    const universities = await adminService.listUniversities();
    return sendSuccess(response, { data: universities });
  }),

  createUniversity: asyncHandler(async (request, response) => {
    const { name, slug, domain } = request.body as { name: string; slug: string; domain: string };
    const university = await adminService.createUniversity({
      name,
      slug,
      domain,
      actorId: request.auth!.userId,
    });
    return sendSuccess(response, {
      statusCode: 201,
      message: 'University created successfully.',
      data: university,
    });
  }),

  toggleUniversityStatus: asyncHandler(async (request, response) => {
    const { isActive } = request.body as { isActive: boolean };
    const university = await adminService.toggleUniversityStatus(
      request.params.id as string,
      Boolean(isActive),
      request.auth!.userId,
    );
    return sendSuccess(response, {
      message: `University ${isActive ? 'activated' : 'deactivated'}.`,
      data: university,
    });
  }),

  getStats: asyncHandler(async (request, response) => {
    const isSuperAdmin = request.auth!.role === 'SUPER_ADMIN';
    const stats = await adminService.getStats(request.auth!.universityId, isSuperAdmin);
    return sendSuccess(response, { data: stats });
  }),
};
