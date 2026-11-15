import { beforeEach, describe, expect, it, vi } from 'vitest';
import { departmentService } from '../../src/services/department/department.service.js';
import { departmentRepository } from '../../src/repositories/department.repository.js';
import { auditLogRepository } from '../../src/repositories/audit-log.repository.js';
import { ApiError } from '../../src/errors/api-error.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
} from '../../src/validators/department.schema.js';

describe('Centralized Department Management Unit Tests', () => {
  const mockActor = {
    userId: 'admin-usr-1',
    universityId: 'uni-1',
    role: 'SUPER_ADMIN',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Validation Schemas', () => {
    it('validates and auto-uppercases department code', () => {
      const valid = createDepartmentSchema.safeParse({
        name: 'Computer Science & Engineering',
        code: 'cse',
        faculty: 'Faculty of Science & Engineering',
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.code).toBe('CSE');
      }
    });

    it('rejects short names and short codes', () => {
      const invalid = createDepartmentSchema.safeParse({
        name: 'A',
        code: 'C',
      });

      expect(invalid.success).toBe(false);
    });

    it('rejects empty update payload', () => {
      const invalid = updateDepartmentSchema.safeParse({});
      expect(invalid.success).toBe(false);
    });
  });

  describe('Department Service CRUD and Constraints', () => {
    it('creates department and triggers audit log', async () => {
      vi.spyOn(departmentRepository, 'findByNameOrCode').mockResolvedValue(null);
      vi.spyOn(departmentRepository, 'create').mockResolvedValue({
        id: 'dept-1',
        universityId: 'uni-1',
        name: 'Civil Engineering',
        code: 'CE',
        faculty: 'Faculty of Engineering',
        description: null,
        displayOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const auditSpy = vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const result = await departmentService.createDepartment(mockActor, {
        name: 'Civil Engineering',
        code: 'CE',
        faculty: 'Faculty of Engineering',
      });

      expect(result.id).toBe('dept-1');
      expect(result.name).toBe('Civil Engineering');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEPARTMENT_CREATED',
          targetType: 'department',
          targetId: 'dept-1',
          actorId: mockActor.userId,
        }),
      );
    });

    it('throws 409 Conflict if department name or code already exists', async () => {
      vi.spyOn(departmentRepository, 'findByNameOrCode').mockResolvedValue({
        id: 'dept-existing',
      } as any);

      await expect(
        departmentService.createDepartment(mockActor, {
          name: 'Computer Science & Engineering',
          code: 'CSE',
        }),
      ).rejects.toThrow(ApiError);
    });

    it('prevents deletion if department has enrolled members', async () => {
      vi.spyOn(departmentRepository, 'findById').mockResolvedValue({
        id: 'dept-1',
        universityId: 'uni-1',
        name: 'Computer Science & Engineering',
        code: 'CSE',
        faculty: 'Faculty of Science',
        description: null,
        displayOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { users: 5 },
      });

      await expect(
        departmentService.deleteDepartment(mockActor, 'dept-1'),
      ).rejects.toThrow('Cannot delete a department with enrolled members');
    });

    it('allows deletion if department has 0 enrolled members', async () => {
      vi.spyOn(departmentRepository, 'findById').mockResolvedValue({
        id: 'dept-empty',
        universityId: 'uni-1',
        name: 'Empty Department',
        code: 'EMP',
        faculty: null,
        description: null,
        displayOrder: 9,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { users: 0 },
      });
      const deleteSpy = vi.spyOn(departmentRepository, 'delete').mockResolvedValue({} as any);
      const auditSpy = vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const res = await departmentService.deleteDepartment(mockActor, 'dept-empty');

      expect(deleteSpy).toHaveBeenCalledWith('dept-empty');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEPARTMENT_DELETED',
          targetId: 'dept-empty',
        }),
      );
      expect(res.message).toContain('successfully deleted');
    });

    it('toggles department status and records audit log', async () => {
      vi.spyOn(departmentRepository, 'findById').mockResolvedValue({
        id: 'dept-1',
        universityId: 'uni-1',
        name: 'Civil Engineering',
        code: 'CE',
        faculty: null,
        description: null,
        displayOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { users: 0 },
      });
      vi.spyOn(departmentRepository, 'update').mockResolvedValue({
        id: 'dept-1',
        universityId: 'uni-1',
        name: 'Civil Engineering',
        code: 'CE',
        faculty: null,
        description: null,
        displayOrder: 1,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const auditSpy = vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const updated = await departmentService.toggleDepartmentStatus(mockActor, 'dept-1', false);

      expect(updated.isActive).toBe(false);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEPARTMENT_STATUS_CHANGED',
          targetId: 'dept-1',
          metadata: { previousStatus: true, newStatus: false },
        }),
      );
    });
  });
});
