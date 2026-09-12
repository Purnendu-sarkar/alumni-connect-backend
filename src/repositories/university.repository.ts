import { prisma } from '../config/database.js';

export const universityRepository = {
  findById(id: string) {
    return prisma.university.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, domain: true, isActive: true },
    });
  },

  findByDomain(domain: string) {
    return prisma.university.findUnique({
      where: { domain: domain.toLowerCase() },
      select: { id: true, name: true, slug: true, domain: true, isActive: true },
    });
  },

  findBySlug(slug: string) {
    return prisma.university.findUnique({
      where: { slug: slug.toLowerCase() },
      select: { id: true, name: true, slug: true, domain: true, isActive: true },
    });
  },
};
