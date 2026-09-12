import type { RequestHandler } from 'express';

import { ApiError } from '../errors/api-error.js';
import { universityRepository } from '../repositories/university.repository.js';
import { asyncHandler } from '../utils/async-handler.js';

/** Resolves public tenant context from a custom domain sent by the frontend. */
export const resolveTenant: RequestHandler = asyncHandler(async (request, _response, next) => {
  if (request.tenant) return next();

  const domain = request.header('x-tenant-domain')?.trim().toLowerCase();
  if (!domain) {
    throw ApiError.badRequest('The x-tenant-domain header is required for this public endpoint.');
  }

  const university = await universityRepository.findByDomain(domain);
  if (!university || !university.isActive) throw ApiError.notFound('Active university');

  request.tenant = { id: university.id, slug: university.slug, domain: university.domain };
  next();
});

export const requireTenant: RequestHandler = (request, _response, next) => {
  if (!request.tenant) return next(ApiError.badRequest('A tenant context is required.'));
  return next();
};
