import { privacyService } from '../services/privacy/privacy.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const privacyController = {
  getMine: asyncHandler(async (request, response) => {
    const settings = await privacyService.getMyPrivacy(request.auth!.userId);
    return sendSuccess(response, { data: settings });
  }),

  updateMine: asyncHandler(async (request, response) => {
    const updated = await privacyService.updateMyPrivacy(
      request.auth!.userId,
      request.auth!.universityId,
      request.body,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    );
    return sendSuccess(response, {
      message: 'Privacy settings updated successfully.',
      data: updated,
    });
  }),

  resetDefaults: asyncHandler(async (request, response) => {
    const reset = await privacyService.resetPrivacyDefaults(
      request.auth!.userId,
      request.auth!.universityId,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    );
    return sendSuccess(response, {
      message: 'Privacy settings reset to institutional defaults successfully.',
      data: reset,
    });
  }),
};
