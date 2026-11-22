function stripHtml(html?: string | null): string {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+([.,!?:;])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSalary(min?: number | null, max?: number | null, currency = 'BDT'): string | null {
  if (!min && !max) return null;
  if (min && max) {
    return `${currency} ${min.toLocaleString()} - ${max.toLocaleString()}`;
  }
  if (min) return `${currency} ${min.toLocaleString()}+`;
  return `Up to ${currency} ${max?.toLocaleString()}`;
}

export interface PublicUniversityDto {
  name: string;
  slug: string;
  domain: string;
  city: string;
  accreditation: string;
}

export interface PublicMetricsDto {
  totalMembers: number;
  studentsCount: number;
  alumniCount: number;
  publishedJobsCount: number;
  publishedEventsCount: number;
  publishedStoriesCount: number;
  publishedAnnouncementsCount: number;
}

export interface PublicDepartmentDto {
  id: string;
  code: string;
  name: string;
  faculty: string | null;
  studentCount: number;
  alumniCount: number;
  totalCount: number;
}

export interface PublicAlumnusDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  company: string | null;
  position: string | null;
  department: string | null;
  graduationYear: string | null;
  isMentorshipAvailable: boolean;
}

export interface PublicJobDto {
  id: string;
  title: string;
  company: string;
  location: string | null;
  jobType: string;
  workMode: string;
  salaryRange: string | null;
  deadline: string | null;
  postedAt: string;
  descriptionSnippet: string;
}

export interface PublicStoryDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  authorName: string;
  authorDepartment: string | null;
  authorGraduationYear: string | null;
  publishedAt: string;
}

export interface PublicEventDto {
  id: string;
  title: string;
  slug: string;
  bannerUrl: string | null;
  eventType: string;
  venue: string | null;
  startsAt: string;
  endsAt: string;
  descriptionSnippet: string;
}

export interface PublicAnnouncementDto {
  id: string;
  title: string;
  category: string;
  isPinned: boolean;
  publishedAt: string;
  summary: string;
}

export interface PublicOverviewDto {
  university: PublicUniversityDto;
  metrics: PublicMetricsDto;
  departments: PublicDepartmentDto[];
  featuredAlumni: PublicAlumnusDto[];
  featuredJobs: PublicJobDto[];
  featuredStories: PublicStoryDto[];
  featuredEvents: PublicEventDto[];
  latestAnnouncements: PublicAnnouncementDto[];
}

export const publicPresenter = {
  toOverviewDto(data: {
    university: { name: string; slug: string; domain: string };
    metrics: PublicMetricsDto;
    departments: PublicDepartmentDto[];
    featuredAlumni: Array<{
      id: string;
      name: string;
      avatarUrl: string | null;
      headline: string | null;
      currentCompany: string | null;
      position: string | null;
      department: string | null;
      graduationYear: string | null;
      isMentorshipAvailable: boolean;
    }>;
    featuredJobs: Array<{
      id: string;
      title: string;
      company: string;
      location: string | null;
      employmentType: string | null;
      workMode: string;
      salaryMin: number | null;
      salaryMax: number | null;
      salaryCurrency: string;
      deadline: Date | string | null;
      publishedAt: Date | string | null;
      createdAt: Date | string;
      description: string;
    }>;
    featuredStories: Array<{
      id: string;
      slug: string;
      title: string;
      summary: string;
      body: string;
      coverImageUrl: string | null;
      publishedAt: Date | string | null;
      createdAt: Date | string;
      author: {
        id: string;
        name: string;
        department: string | null;
        graduationYear: string | null;
        avatarUrl: string | null;
      } | null;
    }>;
    featuredEvents: Array<{
      id: string;
      title: string;
      slug: string;
      description: string;
      bannerUrl: string | null;
      mode: string;
      venue: string | null;
      startsAt: Date | string;
      endsAt: Date | string;
    }>;
    latestAnnouncements: Array<{
      id: string;
      title: string;
      category: string;
      pinned: boolean;
      publishedAt: Date | string | null;
      createdAt: Date | string;
      body: string;
    }>;
  }): PublicOverviewDto {
    return {
      university: {
        name: data.university.name,
        slug: data.university.slug,
        domain: data.university.domain,
        city: 'Khulna, Bangladesh',
        accreditation: 'UGC Accredited University',
      },
      metrics: data.metrics,
      departments: data.departments,
      featuredAlumni: data.featuredAlumni.map((a) => ({
        id: a.id,
        name: a.name,
        avatarUrl: a.avatarUrl,
        headline: a.headline,
        company: a.currentCompany,
        position: a.position,
        department: a.department,
        graduationYear: a.graduationYear,
        isMentorshipAvailable: a.isMentorshipAvailable,
      })),
      featuredJobs: data.featuredJobs.map((j) => {
        const plainDesc = stripHtml(j.description);
        return {
          id: j.id,
          title: j.title,
          company: j.company,
          location: j.location ?? 'Campus / Remote',
          jobType: j.employmentType ?? 'Full-time',
          workMode: j.workMode ?? 'ON_SITE',
          salaryRange: formatSalary(j.salaryMin, j.salaryMax, j.salaryCurrency),
          deadline: j.deadline ? new Date(j.deadline).toISOString() : null,
          postedAt: new Date(j.publishedAt ?? j.createdAt).toISOString(),
          descriptionSnippet: plainDesc.length > 180 ? `${plainDesc.slice(0, 180)}...` : plainDesc,
        };
      }),
      featuredStories: data.featuredStories.map((s) => {
        const plainText = stripHtml(s.summary || s.body);
        return {
          id: s.id,
          slug: s.slug,
          title: s.title,
          excerpt: plainText.length > 200 ? `${plainText.slice(0, 200)}...` : plainText,
          coverImageUrl: s.coverImageUrl,
          authorName: s.author?.name ?? 'Distinguished Alumnus',
          authorDepartment: s.author?.department ?? null,
          authorGraduationYear: s.author?.graduationYear ?? null,
          publishedAt: new Date(s.publishedAt ?? s.createdAt).toISOString(),
        };
      }),
      featuredEvents: data.featuredEvents.map((e) => {
        const plainDesc = stripHtml(e.description);
        return {
          id: e.id,
          title: e.title,
          slug: e.slug,
          bannerUrl: e.bannerUrl,
          eventType: e.mode === 'ONLINE' ? 'Virtual Webinar' : 'On-Campus Gathering',
          venue: e.venue ?? (e.mode === 'ONLINE' ? 'Online Conference Room' : 'University Auditorium'),
          startsAt: new Date(e.startsAt).toISOString(),
          endsAt: new Date(e.endsAt).toISOString(),
          descriptionSnippet: plainDesc.length > 160 ? `${plainDesc.slice(0, 160)}...` : plainDesc,
        };
      }),
      latestAnnouncements: data.latestAnnouncements.map((a) => {
        const plainBody = stripHtml(a.body);
        return {
          id: a.id,
          title: a.title,
          category: a.category,
          isPinned: a.pinned,
          publishedAt: new Date(a.publishedAt ?? a.createdAt).toISOString(),
          summary: plainBody.length > 160 ? `${plainBody.slice(0, 160)}...` : plainBody,
        };
      }),
    };
  },
};
