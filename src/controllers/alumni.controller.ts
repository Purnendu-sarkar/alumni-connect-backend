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
};
