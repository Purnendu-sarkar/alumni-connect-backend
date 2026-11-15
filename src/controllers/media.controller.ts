import { ApiError } from '../errors/api-error.js';
import { mediaService } from '../services/media/media.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import type { ConfirmMediaInput, SignMediaInput } from '../validators/media.validator.js';

export const mediaController = {
  uploadStream: asyncHandler(async (request, response) => {
    if (!request.file) {
      throw ApiError.badRequest('Please upload an image file (JPEG, PNG, or WebP up to 5MB).');
    }

    const purpose = (request.body.purpose || 'PROFILE_PHOTO') as Parameters<typeof mediaService.uploadMediaStream>[5];

    const result = await mediaService.uploadMediaStream(
      request.auth!.userId,
      request.auth!.universityId,
      request.auth!.role,
      request.file.buffer,
      request.file.mimetype,
      purpose,
    );

    return sendSuccess(response, {
      message: 'Media uploaded successfully.',
      data: result,
    });
  }),

  getSignParameters: asyncHandler(async (request, response) => {
    const body = request.body as SignMediaInput;
    const credentials = await mediaService.generateUploadSignature(
      request.auth!.userId,
      request.auth!.role,
      body,
    );

    return sendSuccess(response, {
      message: 'Signed upload parameters generated successfully.',
      data: credentials,
    });
  }),

  confirmDirectUpload: asyncHandler(async (request, response) => {
    const body = request.body as ConfirmMediaInput;
    const result = await mediaService.confirmDirectUpload(
      request.auth!.userId,
      request.auth!.universityId,
      body,
    );

    return sendSuccess(response, {
      message: 'Direct media upload registered successfully.',
      data: result,
    });
  }),

  deleteMedia: asyncHandler(async (request, response) => {
    const rawPublicId = request.params.publicId;
    const publicId = Array.isArray(rawPublicId) ? rawPublicId[0] : rawPublicId;
    if (!publicId || typeof publicId !== 'string') {
      throw ApiError.badRequest('Media publicId is required.');
    }

    await mediaService.deleteMedia(
      request.auth!.userId,
      request.auth!.universityId,
      request.auth!.role,
      publicId,
    );

    return sendSuccess(response, {
      message: 'Media deleted successfully.',
    });
  }),
};
