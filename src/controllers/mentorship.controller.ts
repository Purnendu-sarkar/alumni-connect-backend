import { mentorshipService } from '../services/mentorship/mentorship.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import type {
  clarifyReplySchema,
  clarifyRequestSchema,
  createMentorshipSchema,
  endMentorshipSchema,
  mentorshipQuerySchema,
  rejectMentorshipSchema,
  updateAlumniNoteSchema,
  updateMentorshipAvailabilitySchema,
} from '../validators/mentorship.schema.js';
import type { z } from 'zod';

type CreateMentorshipInput = z.infer<typeof createMentorshipSchema>;
type ClarifyRequestInput = z.infer<typeof clarifyRequestSchema>;
type ClarifyReplyInput = z.infer<typeof clarifyReplySchema>;
type RejectMentorshipInput = z.infer<typeof rejectMentorshipSchema>;
type EndMentorshipInput = z.infer<typeof endMentorshipSchema>;
type UpdateAlumniNoteInput = z.infer<typeof updateAlumniNoteSchema>;
type UpdateAvailabilityInput = z.infer<typeof updateMentorshipAvailabilitySchema>;
type MentorshipQuery = z.infer<typeof mentorshipQuerySchema>;

export const mentorshipController = {
  create: asyncHandler(async (request, response) => {
    const body = request.body as CreateMentorshipInput;
    const result = await mentorshipService.createRequest({
      universityId: request.auth!.universityId,
      studentId: request.auth!.userId,
      ...body,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      statusCode: 201,
      message: 'Mentorship proposal submitted successfully.',
      data: result,
    });
  }),

  listMine: asyncHandler(async (request, response) => {
    const query = request.query as unknown as MentorshipQuery;
    const result = await mentorshipService.listMyMentorships(
      request.auth!.userId,
      request.auth!.role as 'STUDENT' | 'ALUMNI',
      {
        group: query.group,
        page: query.page,
        limit: query.limit,
      },
    );

    return sendSuccess(response, {
      data: result.data,
      meta: result.meta,
    });
  }),

  getById: asyncHandler(async (request, response) => {
    const result = await mentorshipService.getMentorshipById(
      request.params.id as string,
      request.auth!.userId,
      request.auth!.role,
    );

    return sendSuccess(response, {
      data: result,
    });
  }),

  clarify: asyncHandler(async (request, response) => {
    const body = request.body as ClarifyRequestInput;
    const result = await mentorshipService.clarifyRequest({
      id: request.params.id as string,
      alumniId: request.auth!.userId,
      universityId: request.auth!.universityId,
      question: body.question,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      message: 'Clarification requested from student.',
      data: result,
    });
  }),

  replyClarify: asyncHandler(async (request, response) => {
    const body = request.body as ClarifyReplyInput;
    const result = await mentorshipService.replyClarification({
      id: request.params.id as string,
      studentId: request.auth!.userId,
      universityId: request.auth!.universityId,
      reply: body.reply,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      message: 'Clarification submitted to mentor.',
      data: result,
    });
  }),

  accept: asyncHandler(async (request, response) => {
    const result = await mentorshipService.acceptRequest({
      id: request.params.id as string,
      alumniId: request.auth!.userId,
      universityId: request.auth!.universityId,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      message: 'Mentorship proposal accepted. Workspace ready.',
      data: result,
    });
  }),

  reject: asyncHandler(async (request, response) => {
    const body = request.body as RejectMentorshipInput;
    const result = await mentorshipService.rejectRequest({
      id: request.params.id as string,
      alumniId: request.auth!.userId,
      universityId: request.auth!.universityId,
      reason: body.reason,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      message: 'Mentorship proposal declined.',
      data: result,
    });
  }),

  cancel: asyncHandler(async (request, response) => {
    const body = request.body as EndMentorshipInput;
    const result = await mentorshipService.cancelRequest({
      id: request.params.id as string,
      userId: request.auth!.userId,
      universityId: request.auth!.universityId,
      note: body.note,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      message: 'Mentorship proposal cancelled.',
      data: result,
    });
  }),

  end: asyncHandler(async (request, response) => {
    const body = request.body as EndMentorshipInput;
    const result = await mentorshipService.endMentorship({
      id: request.params.id as string,
      userId: request.auth!.userId,
      universityId: request.auth!.universityId,
      note: body.note,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      message: 'Mentorship session concluded successfully.',
      data: result,
    });
  }),

  updateNote: asyncHandler(async (request, response) => {
    const body = request.body as UpdateAlumniNoteInput;
    const result = await mentorshipService.updateAlumniNote({
      id: request.params.id as string,
      alumniId: request.auth!.userId,
      universityId: request.auth!.universityId,
      note: body.note,
      scheduledAt: body.scheduledAt,
    });

    return sendSuccess(response, {
      message: 'Private session notes saved.',
      data: result,
    });
  }),

  updateAvailability: asyncHandler(async (request, response) => {
    const body = request.body as UpdateAvailabilityInput;
    const result = await mentorshipService.updateAvailability({
      alumniId: request.auth!.userId,
      universityId: request.auth!.universityId,
      status: body.status,
      maxActiveMentees: body.maxActiveMentees,
      topics: body.topics,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      message: 'Mentorship availability updated.',
      data: result,
    });
  }),

  adminStats: asyncHandler(async (request, response) => {
    const stats = await mentorshipService.getAdminStats(request.auth!.universityId);
    return sendSuccess(response, {
      data: stats,
    });
  }),
};
