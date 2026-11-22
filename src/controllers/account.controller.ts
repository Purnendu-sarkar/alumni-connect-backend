import { accountService } from '../services/account/account.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import type { DeactivateAccountInput, DeleteAccountInput } from '../validators/account.schema.js';

export const accountController = {
  getSummary: asyncHandler(async (request, response) => {
    const summary = await accountService.getAccountSummary(request.auth!.userId);
    return sendSuccess(response, {
      message: 'Account summary retrieved successfully.',
      data: summary,
    });
  }),

  requestDataExport: asyncHandler(async (request, response) => {
    const result = await accountService.requestDataExport(
      request.auth!.userId,
      request.auth!.universityId,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    );

    return sendSuccess(response, {
      statusCode: 201,
      message: 'Personal data archive compiled and ready for download.',
      data: result,
    });
  }),

  deactivate: asyncHandler(async (request, response) => {
    const { currentPassword } = request.body as DeactivateAccountInput;

    const result = await accountService.deactivateAccount(
      request.auth!.userId,
      request.auth!.universityId,
      currentPassword,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    );

    response.clearCookie('refreshToken', { path: '/api/v1' });

    return sendSuccess(response, {
      message: 'Your account has been deactivated. Your profile is hidden and all active sessions have been terminated.',
      data: result,
    });
  }),

  delete: asyncHandler(async (request, response) => {
    const { currentPassword, confirmText } = request.body as {
      currentPassword: string;
      confirmText: string;
    };

    const result = await accountService.deleteAccount(
      request.auth!.userId,
      request.auth!.universityId,
      currentPassword,
      confirmText,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    );

    response.clearCookie('refreshToken', { path: '/api/v1' });

    return sendSuccess(response, {
      message: 'Account scheduled for deletion. You have a 30-day grace period to sign back in before permanent anonymization.',
      data: result,
    });
  }),
};
