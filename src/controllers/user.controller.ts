import { ApiError } from '../errors/api-error.js';
import { userService } from '../services/user/user.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import type { UpdateProfileInput } from '../validators/user.schema.js';

export const userController = {
  getMe: asyncHandler(async (request, response) => {
    const profile = await userService.getMe(request.auth!.userId);
    return sendSuccess(response, { data: profile });
  }),

  updateMe: asyncHandler(async (request, response) => {
    const body = request.body as UpdateProfileInput;
    const profile = await userService.updateMe(
      request.auth!.userId,
      request.auth!.universityId,
      body,
    );
    return sendSuccess(response, {
      message: 'Profile updated successfully.',
      data: profile,
    });
  }),

  uploadAvatar: asyncHandler(async (request, response) => {
    if (!request.file) {
      throw ApiError.badRequest('Please upload an image file (JPEG, PNG, or WebP up to 2MB).');
    }

    const result = await userService.uploadAvatar(
      request.auth!.userId,
      request.auth!.universityId,
      request.file.filename,
    );

    return sendSuccess(response, {
      message: 'Avatar uploaded successfully.',
      data: result,
    });
  }),

  removeAvatar: asyncHandler(async (request, response) => {
    const result = await userService.removeAvatar(
      request.auth!.userId,
      request.auth!.universityId,
    );

    return sendSuccess(response, {
      message: 'Avatar removed successfully.',
      data: result,
    });
  }),
};
