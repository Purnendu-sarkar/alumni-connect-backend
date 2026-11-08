import type { Request, Response } from 'express';
import type { Role, VerificationStatus } from '@prisma/client';

import { adminService } from '../services/admin/admin.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { ApiError } from '../errors/api-error.js';

export const adminPresenter = {
  async listVerifications(req: Request, res: Response) {
    const role = req.query.role as Role | undefined;
    const status = req.query.status as VerificationStatus | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const { users, total } = await adminService.listVerifications({
      role,
      status,
      skip: (page - 1) * limit,
      take: limit,
    });

    return sendSuccess(res, {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },

  async reviewVerification(req: Request, res: Response) {
    if (!req.user?.id) throw ApiError.unauthorized();

    const userId = req.params.userId as string;
    const { status, reason } = req.body;

    if (status !== 'APPROVED' && status !== 'REJECTED') {
      throw ApiError.badRequest('Status must be APPROVED or REJECTED.');
    }

    const updated = await adminService.reviewVerification({
      userId,
      reviewerId: req.user.id,
      status,
      reason,
    });

    return sendSuccess(res, {
      message: `User identity verification has been ${status.toLowerCase()}.`,
      data: updated,
    });
  },

  async inviteUser(req: Request, res: Response) {
    if (!req.user?.id) throw ApiError.unauthorized();

    const { email, fullName, role, department } = req.body;
    const result = await adminService.inviteAdmin({
      inviterId: req.user.id,
      email,
      fullName,
      role,
      department,
    });

    return sendSuccess(res, {
      message: `Invitation email sent successfully to ${email} as ${role}.`,
      data: result,
      statusCode: 201,
    });
  },

  async getStats(_req: Request, res: Response) {
    const stats = await adminService.getPlatformStats();
    return sendSuccess(res, { data: stats });
  },

  async listAuditLogs(req: Request, res: Response) {
    const action = req.query.action as string | undefined;
    const targetType = req.query.targetType as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const [logs, total] = await adminService.listAuditLogs({
      action,
      targetType,
      skip: (page - 1) * limit,
      take: limit,
    });

    return sendSuccess(res, {
      data: logs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
};
