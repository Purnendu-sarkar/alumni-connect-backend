import { redisClient, isRedisAvailable } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../errors/api-error.js';
import {
  departmentRepository,
  type CreateDepartmentInput,
  type UpdateDepartmentInput,
} from '../../repositories/department.repository.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';

export interface ActorContext {
  userId: string;
  universityId: string;
  role: string;
}

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

const CACHE_TTL_SECONDS = 3600; // 1 hour

function getCacheKey(universityId: string): string {
  return `depts:active:${universityId}`;
}

async function invalidateDepartmentCache(universityId: string): Promise<void> {
  if (redisClient && isRedisAvailable) {
    try {
      await redisClient.del(getCacheKey(universityId));
    } catch (err) {
      logger.warn({ error: err }, '[CACHE] Failed to invalidate department cache.');
    }
  }
}

export const departmentService = {
  async getActiveDepartments(universityId: string) {
    const cacheKey = getCacheKey(universityId);

    if (redisClient && isRedisAvailable) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.warn({ error: err }, '[CACHE] Failed to read department cache; falling back to DB.');
      }
    }

    const departments = await departmentRepository.findAllActive(universityId);

    if (redisClient && isRedisAvailable) {
      try {
        await redisClient.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(departments));
      } catch (err) {
        logger.warn({ error: err }, '[CACHE] Failed to write department cache.');
      }
    }

    return departments;
  },

  async listAdminDepartments(universityId: string) {
    return departmentRepository.findAllWithCounts(universityId);
  },

  async getDepartmentById(id: string, universityId: string) {
    const dept = await departmentRepository.findById(id, universityId);
    if (!dept) {
      throw ApiError.notFound('Department');
    }
    return dept;
  },

  async createDepartment(
    actor: ActorContext,
    input: Omit<CreateDepartmentInput, 'universityId'>,
    reqMeta?: RequestMeta,
  ) {
    const existing = await departmentRepository.findByNameOrCode(
      actor.universityId,
      input.name,
      input.code,
    );
    if (existing) {
      throw ApiError.conflict('A department with this name or code already exists in your university.');
    }

    const created = await departmentRepository.create({
      ...input,
      universityId: actor.universityId,
    });

    await invalidateDepartmentCache(actor.universityId);

    await auditLogRepository.record({
      universityId: actor.universityId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'DEPARTMENT_CREATED',
      targetType: 'department',
      targetId: created.id,
      result: 'SUCCESS',
      ip: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
      requestId: reqMeta?.requestId,
      metadata: {
        name: created.name,
        code: created.code,
        faculty: created.faculty,
      },
    });

    return created;
  },

  async updateDepartment(
    actor: ActorContext,
    id: string,
    input: UpdateDepartmentInput,
    reqMeta?: RequestMeta,
  ) {
    const existing = await departmentRepository.findById(id, actor.universityId);
    if (!existing) {
      throw ApiError.notFound('Department');
    }

    const targetName = input.name ?? existing.name;
    const targetCode = input.code ?? existing.code;

    if (input.name !== undefined || input.code !== undefined) {
      const conflict = await departmentRepository.findByNameOrCode(
        actor.universityId,
        targetName,
        targetCode,
        id,
      );
      if (conflict) {
        throw ApiError.conflict('Another department with this name or code already exists in your university.');
      }
    }

    const updated = await departmentRepository.update(id, input);

    await invalidateDepartmentCache(actor.universityId);

    await auditLogRepository.record({
      universityId: actor.universityId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'DEPARTMENT_UPDATED',
      targetType: 'department',
      targetId: id,
      result: 'SUCCESS',
      ip: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
      requestId: reqMeta?.requestId,
      metadata: {
        name: input.name,
        code: input.code,
        faculty: input.faculty,
        description: input.description,
        displayOrder: input.displayOrder,
        isActive: input.isActive,
      },
    });

    return updated;
  },

  async toggleDepartmentStatus(
    actor: ActorContext,
    id: string,
    isActive: boolean,
    reqMeta?: RequestMeta,
  ) {
    const existing = await departmentRepository.findById(id, actor.universityId);
    if (!existing) {
      throw ApiError.notFound('Department');
    }

    const updated = await departmentRepository.update(id, { isActive });

    await invalidateDepartmentCache(actor.universityId);

    await auditLogRepository.record({
      universityId: actor.universityId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'DEPARTMENT_STATUS_CHANGED',
      targetType: 'department',
      targetId: id,
      result: 'SUCCESS',
      ip: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
      requestId: reqMeta?.requestId,
      metadata: {
        previousStatus: existing.isActive,
        newStatus: isActive,
      },
    });

    return updated;
  },

  async deleteDepartment(actor: ActorContext, id: string, reqMeta?: RequestMeta) {
    const existing = await departmentRepository.findById(id, actor.universityId);
    if (!existing) {
      throw ApiError.notFound('Department');
    }

    if (existing._count.users > 0) {
      throw ApiError.conflict(
        'Cannot delete a department with enrolled members. Please deactivate or archive it instead.',
      );
    }

    await departmentRepository.delete(id);

    await invalidateDepartmentCache(actor.universityId);

    await auditLogRepository.record({
      universityId: actor.universityId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'DEPARTMENT_DELETED',
      targetType: 'department',
      targetId: id,
      result: 'SUCCESS',
      ip: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
      requestId: reqMeta?.requestId,
      metadata: {
        name: existing.name,
        code: existing.code,
      },
    });

    return { message: 'Department successfully deleted.' };
  },

  async reorderDepartments(
    actor: ActorContext,
    orderedIds: string[],
    reqMeta?: RequestMeta,
  ) {
    await departmentRepository.reorder(actor.universityId, orderedIds);

    await invalidateDepartmentCache(actor.universityId);

    await auditLogRepository.record({
      universityId: actor.universityId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'DEPARTMENT_REORDERED',
      targetType: 'department',
      result: 'SUCCESS',
      ip: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
      requestId: reqMeta?.requestId,
      metadata: {
        orderedIds,
      },
    });

    return { message: 'Departments successfully reordered.' };
  },
};
