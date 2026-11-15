import { prisma } from '../config/database.js';

export interface CreateDepartmentInput {
  universityId: string;
  name: string;
  code: string;
  faculty?: string | null;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateDepartmentInput {
  name?: string;
  code?: string;
  faculty?: string | null;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export const departmentRepository = {
  findAllActive(universityId: string) {
    return prisma.department.findMany({
      where: {
        universityId,
        isActive: true,
      },
      select: {
        id: true,
        universityId: true,
        name: true,
        code: true,
        faculty: true,
        description: true,
        displayOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  },

  findAllWithCounts(universityId: string) {
    return prisma.department.findMany({
      where: {
        universityId,
      },
      select: {
        id: true,
        universityId: true,
        name: true,
        code: true,
        faculty: true,
        description: true,
        displayOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
          },
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  },

  findById(id: string, universityId?: string) {
    return prisma.department.findFirst({
      where: {
        id,
        ...(universityId ? { universityId } : {}),
      },
      select: {
        id: true,
        universityId: true,
        name: true,
        code: true,
        faculty: true,
        description: true,
        displayOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
          },
        },
      },
    });
  },

  findByNameOrCode(universityId: string, name: string, code: string, excludeId?: string) {
    return prisma.department.findFirst({
      where: {
        universityId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { code: { equals: code, mode: 'insensitive' } },
        ],
      },
    });
  },

  findActiveByIdOrNameOrCode(universityId: string, identifier: string) {
    const trimmed = identifier.trim();
    return prisma.department.findFirst({
      where: {
        universityId,
        isActive: true,
        OR: [
          { id: trimmed },
          { name: { equals: trimmed, mode: 'insensitive' } },
          { code: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
    });
  },

  countUsers(departmentId: string) {
    return prisma.user.count({
      where: { departmentId },
    });
  },

  create(data: CreateDepartmentInput) {
    return prisma.department.create({
      data: {
        universityId: data.universityId,
        name: data.name.trim(),
        code: data.code.trim().toUpperCase(),
        faculty: data.faculty?.trim() || null,
        description: data.description?.trim() || null,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  },

  update(id: string, data: UpdateDepartmentInput) {
    return prisma.department.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
        ...(data.faculty !== undefined ? { faculty: data.faculty?.trim() || null } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
        ...(data.displayOrder !== undefined ? { displayOrder: data.displayOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  },

  delete(id: string) {
    return prisma.department.delete({
      where: { id },
    });
  },

  async reorder(universityId: string, orderedIds: string[]) {
    return prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.department.updateMany({
          where: { id, universityId },
          data: { displayOrder: index + 1 },
        }),
      ),
    );
  },
};
