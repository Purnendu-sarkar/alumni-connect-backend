import { publicRepository } from '../../repositories/public.repository.js';
import { publicPresenter, type PublicOverviewDto } from '../../presenters/public.presenter.js';
import { cacheService } from '../cache/cache.service.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../errors/api-error.js';

const PUBLIC_OVERVIEW_CACHE_KEY = 'cache:public:overview:nwu';
const CACHE_TTL_SECONDS = 300; // 5 minutes

export const publicService = {
  async getPublicOverview(universitySlug = 'north-western-university'): Promise<PublicOverviewDto> {
    try {
      const cached = await cacheService.get<PublicOverviewDto>(PUBLIC_OVERVIEW_CACHE_KEY);
      if (cached) {
        return cached;
      }
    } catch (err) {
      logger.warn({ error: (err as Error).message }, '[PUBLIC_SERVICE] Redis read failed, falling back to database');
    }

    const university = await publicRepository.getUniversityBySlug(universitySlug);
    if (!university) {
      throw ApiError.notFound(`University with slug "${universitySlug}"`);
    }

    const [
      metrics,
      departments,
      featuredAlumni,
      featuredJobs,
      featuredStories,
      featuredEvents,
      latestAnnouncements,
    ] = await Promise.all([
      publicRepository.getMetrics(university.id),
      publicRepository.getDepartmentDistribution(university.id),
      publicRepository.getFeaturedAlumni(university.id, 4),
      publicRepository.getFeaturedJobs(university.id, 3),
      publicRepository.getFeaturedStories(university.id, 3),
      publicRepository.getFeaturedEvents(university.id, 2),
      publicRepository.getLatestAnnouncements(university.id, 3),
    ]);

    const overviewDto = publicPresenter.toOverviewDto({
      university,
      metrics,
      departments,
      featuredAlumni,
      featuredJobs,
      featuredStories,
      featuredEvents,
      latestAnnouncements,
    });

    try {
      await cacheService.set(PUBLIC_OVERVIEW_CACHE_KEY, overviewDto, CACHE_TTL_SECONDS);
    } catch (err) {
      logger.warn({ error: (err as Error).message }, '[PUBLIC_SERVICE] Redis set failed');
    }

    return overviewDto;
  },
};
