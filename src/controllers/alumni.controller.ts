import { userService } from '../services/user/user.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import { toPageMeta } from '../utils/pagination.js';
import type { alumniQuerySchema } from '../validators/alumni.schema.js';
import type { z } from 'zod';

type AlumniQuery = z.infer<typeof alumniQuerySchema>;

export const alumniController = {
  list: asyncHandler(async (request, response) => {
    const query = request.query as unknown as AlumniQuery;
    const [alumni, total] = await userRepository.findAlumni(request.auth!.universityId, query);
    return sendSuccess(response, {
      data: alumni,
      meta: toPageMeta(query.page, query.limit, total),
    });
  }),

  getById: asyncHandler(async (request, response) => {
    const alumnus = await userService.getAlumniById(
      request.params.id as string,
      request.auth!.universityId,
      { id: request.auth!.userId, role: request.auth!.role },
    );
    return sendSuccess(response, { data: alumnus });
  }),
};
