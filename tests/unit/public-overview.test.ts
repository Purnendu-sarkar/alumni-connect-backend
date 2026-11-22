import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventMode, AnnouncementCategory, WorkMode } from '../../src/generated/prisma/client.js';
import { publicPresenter } from '../../src/presenters/public.presenter.js';
import { publicService } from '../../src/services/public/public.service.js';
import { publicRepository } from '../../src/repositories/public.repository.js';
import { cacheService } from '../../src/services/cache/cache.service.js';

describe('Public Overview & Telemetry Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockUniversity = {
    id: 'cmwdlkg3w0000msumsmxyqm6r',
    name: 'North Western University',
    slug: 'north-western-university',
    domain: 'nwu.ac.bd',
  };

  const mockMetrics = {
    totalMembers: 2008,
    studentsCount: 955,
    alumniCount: 1053,
    publishedJobsCount: 1220,
    publishedEventsCount: 247,
    publishedStoriesCount: 105,
    publishedAnnouncementsCount: 148,
  };

  const mockDepartments = [
    {
      id: 'dept-1',
      code: 'CSE',
      name: 'Computer Science & Engineering',
      faculty: 'Faculty of Science & Technology',
      studentCount: 162,
      alumniCount: 175,
      totalCount: 337,
    },
    {
      id: 'dept-2',
      code: 'BBA',
      name: 'Business Administration',
      faculty: 'Faculty of Business Studies',
      studentCount: 158,
      alumniCount: 176,
      totalCount: 334,
    },
  ];

  const mockFeaturedAlumni = [
    {
      id: 'usr-1',
      name: 'Sadia Rahman',
      avatarUrl: 'https://res.cloudinary.com/a1dumxpe/image/upload/alumni-connect/avatars/verified/female_1.jpg',
      headline: 'Principal Cloud Architect',
      currentCompany: 'Amazon Web Services',
      position: 'Principal Architect',
      department: 'Computer Science & Engineering',
      graduationYear: '2018',
      isMentorshipAvailable: true,
    },
  ];

  const mockFeaturedJobs = [
    {
      id: 'job-1',
      title: 'Senior Full Stack Engineer',
      company: 'Pathao',
      location: 'Dhaka / Remote',
      employmentType: 'Full-time',
      workMode: WorkMode.HYBRID,
      salaryMin: 90000,
      salaryMax: 140000,
      salaryCurrency: 'BDT',
      deadline: new Date('2026-12-31T23:59:59Z'),
      publishedAt: new Date('2026-11-20T10:00:00Z'),
      createdAt: new Date('2026-11-20T09:00:00Z'),
      description: '<p>Looking for a talented <strong>engineer</strong> to join our team.</p>',
    },
  ];

  const mockFeaturedStories = [
    {
      id: 'story-1',
      slug: 'from-nwu-to-cloud-architect',
      title: 'From NWU Labs to Principal Cloud Architect',
      summary: '<p>A journey from <em>North Western University</em> to global cloud leadership.</p>',
      body: '<p>Full story body here...</p>',
      coverImageUrl: 'https://res.cloudinary.com/a1dumxpe/image/upload/alumni-connect/stories/covers/cover_1.jpg',
      publishedAt: new Date('2026-11-18T10:00:00Z'),
      createdAt: new Date('2026-11-18T09:00:00Z'),
      author: {
        id: 'usr-1',
        name: 'Sadia Rahman',
        department: 'Computer Science & Engineering',
        graduationYear: '2018',
        avatarUrl: 'https://res.cloudinary.com/a1dumxpe/image/upload/alumni-connect/avatars/verified/female_1.jpg',
      },
    },
  ];

  const mockFeaturedEvents = [
    {
      id: 'event-1',
      title: 'Cyber Security & Enterprise Defense Conclave',
      slug: 'cyber-security-conclave',
      description: '<p>Interactive technical workshop with <strong>industry experts</strong>.</p>',
      bannerUrl: 'https://res.cloudinary.com/a1dumxpe/image/upload/alumni-connect/events/banners/banner_3.jpg',
      mode: EventMode.IN_PERSON,
      venue: 'Auditorium A',
      startsAt: new Date('2026-12-05T09:00:00Z'),
      endsAt: new Date('2026-12-05T17:00:00Z'),
    },
  ];

  const mockAnnouncements = [
    {
      id: 'ann-1',
      title: 'Fall 2026 Graduation Convocation Schedule',
      category: AnnouncementCategory.ACADEMIC,
      pinned: true,
      publishedAt: new Date('2026-11-21T08:00:00Z'),
      createdAt: new Date('2026-11-21T08:00:00Z'),
      body: '<p>Official notice regarding the upcoming <strong>convocation ceremony</strong>.</p>',
    },
  ];

  describe('publicPresenter.toOverviewDto', () => {
    it('converts raw database entities into clean DTO with zero PII and plain text excerpts', () => {
      const dto = publicPresenter.toOverviewDto({
        university: mockUniversity,
        metrics: mockMetrics,
        departments: mockDepartments,
        featuredAlumni: mockFeaturedAlumni,
        featuredJobs: mockFeaturedJobs,
        featuredStories: mockFeaturedStories,
        featuredEvents: mockFeaturedEvents,
        latestAnnouncements: mockAnnouncements,
      });

      // Verification of zero PII exposure
      const rawDto = dto as unknown as Record<string, unknown>;
      expect(rawDto.email).toBeUndefined();
      expect(rawDto.passwordHash).toBeUndefined();
      expect(rawDto.universityId).toBeUndefined();
      const rawAlumnus = dto.featuredAlumni[0] as unknown as Record<string, unknown>;
      expect(rawAlumnus?.email).toBeUndefined();
      expect(rawAlumnus?.phone).toBeUndefined();

      // University fields
      expect(dto.university.name).toBe('North Western University');
      expect(dto.university.slug).toBe('north-western-university');
      expect(dto.university.accreditation).toBe('UGC Accredited University');

      // Metrics
      expect(dto.metrics.totalMembers).toBe(2008);
      expect(dto.metrics.studentsCount).toBe(955);
      expect(dto.metrics.alumniCount).toBe(1053);
      expect(dto.metrics.publishedJobsCount).toBe(1220);

      // HTML stripping
      expect(dto.featuredJobs[0]?.descriptionSnippet).toBe('Looking for a talented engineer to join our team.');
      expect(dto.featuredJobs[0]?.descriptionSnippet).not.toContain('<p>');
      expect(dto.featuredJobs[0]?.descriptionSnippet).not.toContain('<strong>');

      expect(dto.featuredStories[0]?.excerpt).toBe(
        'A journey from North Western University to global cloud leadership.',
      );
      expect(dto.featuredStories[0]?.excerpt).not.toContain('<em>');

      expect(dto.featuredEvents[0]?.descriptionSnippet).toBe(
        'Interactive technical workshop with industry experts.',
      );
      expect(dto.featuredEvents[0]?.eventType).toBe('On-Campus Gathering');

      expect(dto.latestAnnouncements[0]?.summary).toBe(
        'Official notice regarding the upcoming convocation ceremony.',
      );
      expect(dto.latestAnnouncements[0]?.isPinned).toBe(true);

      // Salary formatting
      expect(dto.featuredJobs[0]?.salaryRange).toBe('BDT 90,000 - 140,000');
    });
  });

  describe('publicService.getPublicOverview', () => {
    it('returns cached overview when available in Redis', async () => {
      const cachedDto = {
        university: {
          name: 'North Western University',
          slug: 'north-western-university',
          domain: 'nwu.ac.bd',
          city: 'Khulna, Bangladesh',
          accreditation: 'UGC Accredited University',
        },
        metrics: mockMetrics,
        departments: [],
        featuredAlumni: [],
        featuredJobs: [],
        featuredStories: [],
        featuredEvents: [],
        latestAnnouncements: [],
      };

      vi.spyOn(cacheService, 'get').mockResolvedValue(cachedDto);
      const repoSpy = vi.spyOn(publicRepository, 'getUniversityBySlug');

      const result = await publicService.getPublicOverview('north-western-university');

      expect(result).toEqual(cachedDto);
      expect(repoSpy).not.toHaveBeenCalled();
    });

    it('queries repository and sets Redis cache with 300s TTL on cache miss', async () => {
      vi.spyOn(cacheService, 'get').mockResolvedValue(null);
      vi.spyOn(publicRepository, 'getUniversityBySlug').mockResolvedValue(mockUniversity);
      vi.spyOn(publicRepository, 'getMetrics').mockResolvedValue(mockMetrics);
      vi.spyOn(publicRepository, 'getDepartmentDistribution').mockResolvedValue(mockDepartments);
      vi.spyOn(publicRepository, 'getFeaturedAlumni').mockResolvedValue(mockFeaturedAlumni);
      vi.spyOn(publicRepository, 'getFeaturedJobs').mockResolvedValue(mockFeaturedJobs);
      vi.spyOn(publicRepository, 'getFeaturedStories').mockResolvedValue(mockFeaturedStories);
      vi.spyOn(publicRepository, 'getFeaturedEvents').mockResolvedValue(mockFeaturedEvents);
      vi.spyOn(publicRepository, 'getLatestAnnouncements').mockResolvedValue(mockAnnouncements);
      const setCacheSpy = vi.spyOn(cacheService, 'set').mockResolvedValue();

      const result = await publicService.getPublicOverview('north-western-university');

      expect(result.university.slug).toBe('north-western-university');
      expect(result.metrics.totalMembers).toBe(2008);
      expect(result.departments).toHaveLength(2);
      expect(result.featuredAlumni).toHaveLength(1);
      expect(result.featuredJobs).toHaveLength(1);
      expect(result.featuredStories).toHaveLength(1);
      expect(setCacheSpy).toHaveBeenCalledWith(
        'cache:public:overview:nwu',
        expect.any(Object),
        300,
      );
    });
  });
});
