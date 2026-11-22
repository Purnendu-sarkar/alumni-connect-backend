import { adminService } from '../services/admin/admin.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import type {
  adminUsersQuerySchema,
  changeUserRoleSchema,
  removeModeratorSchema,
  reviewVerificationSchema,
  updateAdminUserSchema,
  verificationQuerySchema,
} from '../validators/admin.schema.js';
import type { z } from 'zod';

type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
type VerificationQuery = z.infer<typeof verificationQuerySchema>;
type ReviewVerificationInput = z.infer<typeof reviewVerificationSchema>;
type UpdateAdminUserPayload = z.infer<typeof updateAdminUserSchema>;
type ChangeUserRolePayload = z.infer<typeof changeUserRoleSchema>;
type RemoveModeratorPayload = z.infer<typeof removeModeratorSchema>;

export const adminController = {
  listUsers: asyncHandler(async (request, response) => {
    const query = request.query as unknown as AdminUsersQuery;
    const result = await adminService.listUsers(request.auth!.universityId, query);
    return sendSuccess(response, {
      data: result.users,
      meta: result.meta,
    });
  }),

  getUserDetail: asyncHandler(async (request, response) => {
    const user = await adminService.getUserDetail(
      request.params.userId as string,
      request.auth!.universityId,
    );
    return sendSuccess(response, { data: user });
  }),

  updateUserByAdmin: asyncHandler(async (request, response) => {
    const body = request.body as UpdateAdminUserPayload;
    const updated = await adminService.updateUserByAdmin({
      userId: request.params.userId as string,
      universityId: request.auth!.universityId,
      actorId: request.auth!.userId,
      data: body,
    });
    return sendSuccess(response, {
      message: 'User record updated successfully.',
      data: updated,
    });
  }),

  changeUserRole: asyncHandler(async (request, response) => {
    const body = request.body as ChangeUserRolePayload;
    const updated = await adminService.changeUserRole({
      userId: request.params.userId as string,
      universityId: request.auth!.universityId,
      actorId: request.auth!.userId,
      role: body.role,
      graduationYear: body.graduationYear,
      batch: body.batch,
      reason: body.reason,
    });
    return sendSuccess(response, {
      message: `User role updated to ${body.role}.`,
      data: updated,
    });
  }),

  sendPasswordResetByAdmin: asyncHandler(async (request, response) => {
    const result = await adminService.sendPasswordResetByAdmin({
      userId: request.params.userId as string,
      universityId: request.auth!.universityId,
      actorId: request.auth!.userId,
    });
    return sendSuccess(response, {
      message: result.message,
      data: result,
    });
  }),

  terminateUserSessions: asyncHandler(async (request, response) => {
    const result = await adminService.terminateUserSessions({
      userId: request.params.userId as string,
      universityId: request.auth!.universityId,
      actorId: request.auth!.userId,
    });
    return sendSuccess(response, { message: result.message });
  }),

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
    const message =
      body.status === 'APPROVED'
        ? 'User verification approved.'
        : body.status === 'REVOKED'
          ? 'User accreditation revoked.'
          : 'User verification rejected.';
    return sendSuccess(response, {
      message,
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

  listModerators: asyncHandler(async (request, response) => {
    const result = await adminService.listModerators(request.auth!.universityId);
    return sendSuccess(response, { data: result });
  }),

  removeModerator: asyncHandler(async (request, response) => {
    const body = request.body as RemoveModeratorPayload;
    const result = await adminService.removeModerator({
      userId: request.params.userId as string,
      universityId: request.auth!.universityId,
      actorId: request.auth!.userId,
      reason: body.reason,
    });
    return sendSuccess(response, {
      message: 'Moderator deactivated and claimed queue items released.',
      data: result,
    });
  }),

  getRolesOverview: asyncHandler(async (request, response) => {
    const data = await adminService.getRolesOverview(request.auth!.universityId);
    return sendSuccess(response, { data });
  }),

  listAdmins: asyncHandler(async (request, response) => {
    const admins = await adminService.listAdmins(request.auth!.universityId);
    return sendSuccess(response, { data: admins });
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
    const stats = await adminService.getStats(request.auth!.universityId);
    return sendSuccess(response, { data: stats });
  }),

  listAuditLogs: asyncHandler(async (request, response) => {
    const page = request.query.page ? Number(request.query.page) : 1;
    const limit = request.query.limit ? Number(request.query.limit) : 50;
    const query = request.query as Record<string, string | undefined>;
    const result = await adminService.listAuditLogs({
      page,
      limit,
      search: query.search,
      action: query.action,
      actorId: query.actorId,
      actorRole: query.actorRole,
      targetType: query.targetType,
      result: query.result as 'SUCCESS' | 'FAILURE' | undefined,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
    return sendSuccess(response, {
      data: result.logs,
      meta: result.meta,
    });
  }),

  inviteModerator: asyncHandler(async (request, response) => {
    const { email } = request.body as { email: string };
    const result = await adminService.inviteModerator({
      email,
      actorId: request.auth!.userId,
      universityId: request.auth!.universityId,
    });
    return sendSuccess(response, {
      statusCode: 201,
      message: 'Moderator invitation dispatched successfully.',
      data: result,
    });
  }),

  listModeratorInvitations: asyncHandler(async (_request, response) => {
    const invitations = await adminService.listModeratorInvitations();
    return sendSuccess(response, { data: invitations });
  }),

  resendModeratorInvitation: asyncHandler(async (request, response) => {
    const result = await adminService.resendModeratorInvitation(
      request.params.id as string,
      request.auth!.userId,
      request.auth!.universityId,
    );
    return sendSuccess(response, {
      message: 'Invitation resent successfully.',
      data: result,
    });
  }),

  revokeModeratorInvitation: asyncHandler(async (request, response) => {
    const result = await adminService.revokeModeratorInvitation(
      request.params.id as string,
      request.auth!.userId,
      request.auth!.universityId,
    );
    return sendSuccess(response, {
      message: result.message,
    });
  }),

  toggleUserSuspension: asyncHandler(async (request, response) => {
    const { isActive, reason } = request.body as { isActive: boolean; reason?: string };
    const user = await adminService.toggleUserSuspension({
      userId: request.params.userId as string,
      universityId: request.auth!.universityId,
      isActive: Boolean(isActive),
      reason,
      actorId: request.auth!.userId,
    });
    return sendSuccess(response, {
      message: `User account ${isActive ? 'restored' : 'suspended'}.`,
      data: user,
    });
  }),

  getSettings: asyncHandler(async (request, response) => {
    const settings = await adminService.getSettings(request.auth!.universityId);
    return sendSuccess(response, {
      message: 'Platform governance settings retrieved successfully.',
      data: settings,
    });
  }),

  updateSettings: asyncHandler(async (request, response) => {
    const updated = await adminService.updateSettings(
      request.auth!.universityId,
      request.body,
      request.auth!.userId,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    );
    return sendSuccess(response, {
      message: 'Platform governance settings updated and persisted successfully.',
      data: updated,
    });
  }),
};
