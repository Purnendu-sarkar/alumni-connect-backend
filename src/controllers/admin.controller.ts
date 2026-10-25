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
};
