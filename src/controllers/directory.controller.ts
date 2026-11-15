import { directoryService } from '../services/directory/directory.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import type { directoryQuerySchema } from '../validators/directory.schema.js';
import type { z } from 'zod';

type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

export const directoryController = {
  search: asyncHandler(async (request, response) => {
    const query = request.query as unknown as DirectoryQuery;
    const result = await directoryService.searchDirectory(
      request.auth!.universityId,
      { id: request.auth!.userId, role: request.auth!.role },
      query,
    );

    return sendSuccess(response, {
      data: result.data,
      meta: result.meta,
    });
  }),

  getById: asyncHandler(async (request, response) => {
    const member = await directoryService.getMemberById(
      request.auth!.universityId,
      { id: request.auth!.userId, role: request.auth!.role },
      request.params.id as string,
    );

    return sendSuccess(response, {
      data: member,
    });
  }),
};
