import { adminService } from '../services/admin/admin.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';

export const adminController = {
  verifyUser: asyncHandler(async (request, response) => {
    const user = await adminService.verifyUser({
      userId: request.params.userId as string,
      universityId: request.auth!.universityId,
      actorId: request.auth!.userId,
    });
    return sendSuccess(response, { message: 'User verified.', data: user });
  }),
};
