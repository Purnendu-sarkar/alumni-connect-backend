import type { Request, Response } from 'express';
import type { EmploymentType, WorkMode } from '@prisma/client';

import { jobService } from '../services/job/job.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { ApiError } from '../errors/api-error.js';

export const jobPresenter = {
  async listActiveJobs(req: Request, res: Response) {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const [jobs, total] = await jobService.listActive({
      employmentType: req.query.employmentType as EmploymentType | undefined,
      workMode: req.query.workMode as WorkMode | undefined,
      search: req.query.search as string | undefined,
      skip: (page - 1) * limit,
      take: limit,
    });

    return sendSuccess(res, {
      data: jobs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },

  async getJobById(req: Request, res: Response) {
    const id = req.params.id as string;
    const job = await jobService.findById(id);
    return sendSuccess(res, { data: job });
  },

  async createJob(req: Request, res: Response) {
    if (!req.user?.id) throw ApiError.unauthorized();

    const job = await jobService.create({
      ...req.body,
      creatorId: req.user.id,
      creatorRole: req.user.role,
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Job posting submitted successfully. Awaiting moderator review.',
      data: job,
    });
  },

  async applyToJob(req: Request, res: Response) {
    if (!req.user?.id) throw ApiError.unauthorized();

    const id = req.params.id as string;
    const { coverNote, resumeUrl } = req.body;

    const application = await jobService.apply({
      jobId: id,
      applicantId: req.user.id,
      applicantRole: req.user.role,
      coverLetter: coverNote,
      resumeUrl,
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Application submitted successfully to alumni poster.',
      data: application,
    });
  },

  async moderateJob(req: Request, res: Response) {
    if (!req.user?.id) throw ApiError.unauthorized();

    const id = req.params.id as string;
    const { action, reasonCode, note } = req.body;

    const updated = await jobService.moderate({
      jobId: id,
      moderatorId: req.user.id,
      moderatorRole: req.user.role,
      action,
      reasonCode,
      note,
    });

    return sendSuccess(res, {
      message: `Job posting ${action.toLowerCase()}d successfully.`,
      data: updated,
    });
  },
};
