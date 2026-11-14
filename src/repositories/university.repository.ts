import { prisma } from '../config/database.js';

export const universityRepository = {
  findCanonical() {
    return prisma.university.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, domain: true, isActive: true },
    });
  },

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
