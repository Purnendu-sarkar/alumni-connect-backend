import { departmentService } from '../services/department/department.service.js';
import { universityRepository } from '../repositories/university.repository.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import { ApiError } from '../errors/api-error.js';
import type {
  CreateDepartmentInput,
  UpdateDepartmentInput,
  ToggleDepartmentStatusInput,
  ReorderDepartmentsInput,
} from '../validators/department.schema.js';

export const departmentController = {
  getActiveDepartments: asyncHandler(async (request, response) => {
    let universityId = request.auth?.universityId || request.tenant?.id;
    if (!universityId) {
      const canonical = await universityRepository.findCanonical();
      if (!canonical) {
        throw ApiError.notFound('Active university institution');
      }
      universityId = canonical.id;
    }

    const departments = await departmentService.getActiveDepartments(universityId);
    return sendSuccess(response, {
      data: departments,
    });
  }),

  listAdminDepartments: asyncHandler(async (request, response) => {
    const universityId = request.auth!.universityId;
    const departments = await departmentService.listAdminDepartments(universityId);
    return sendSuccess(response, {
      data: departments,
    });
  }),

  getDepartmentDetail: asyncHandler(async (request, response) => {
    const universityId = request.auth!.universityId;
    const department = await departmentService.getDepartmentById(
      request.params.id as string,
      universityId,
    );
    return sendSuccess(response, {
      data: department,
    });
  }),

  createDepartment: asyncHandler(async (request, response) => {
    const actor = {
      userId: request.auth!.userId,
      universityId: request.auth!.universityId,
      role: request.auth!.role,
    };
    const reqMeta = {
      ip: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
      requestId: request.requestId,
    };

    const input = request.body as CreateDepartmentInput;
    const created = await departmentService.createDepartment(actor, input, reqMeta);

    return sendSuccess(response, {
      statusCode: 201,
      message: 'Department created successfully.',
      data: created,
    });
  }),

  updateDepartment: asyncHandler(async (request, response) => {
    const actor = {
      userId: request.auth!.userId,
      universityId: request.auth!.universityId,
      role: request.auth!.role,
    };
    const reqMeta = {
      ip: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
      requestId: request.requestId,
    };

    const input = request.body as UpdateDepartmentInput;
    const updated = await departmentService.updateDepartment(
      actor,
      request.params.id as string,
      input,
      reqMeta,
    );

    return sendSuccess(response, {
      message: 'Department updated successfully.',
      data: updated,
    });
  }),

  toggleDepartmentStatus: asyncHandler(async (request, response) => {
    const actor = {
      userId: request.auth!.userId,
      universityId: request.auth!.universityId,
      role: request.auth!.role,
    };
    const reqMeta = {
      ip: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
      requestId: request.requestId,
    };

    const { isActive } = request.body as ToggleDepartmentStatusInput;
    const updated = await departmentService.toggleDepartmentStatus(
      actor,
      request.params.id as string,
      isActive,
      reqMeta,
    );

    return sendSuccess(response, {
      message: `Department ${isActive ? 'activated' : 'archived'} successfully.`,
      data: updated,
    });
  }),

  deleteDepartment: asyncHandler(async (request, response) => {
    const actor = {
      userId: request.auth!.userId,
      universityId: request.auth!.universityId,
      role: request.auth!.role,
    };
    const reqMeta = {
      ip: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
      requestId: request.requestId,
    };

    const result = await departmentService.deleteDepartment(
      actor,
      request.params.id as string,
      reqMeta,
    );

    return sendSuccess(response, {
      message: result.message,
    });
  }),

  reorderDepartments: asyncHandler(async (request, response) => {
    const actor = {
      userId: request.auth!.userId,
      universityId: request.auth!.universityId,
      role: request.auth!.role,
    };
    const reqMeta = {
      ip: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
      requestId: request.requestId,
    };

    const { orderedIds } = request.body as ReorderDepartmentsInput;
    const result = await departmentService.reorderDepartments(actor, orderedIds, reqMeta);

    return sendSuccess(response, {
      message: result.message,
    });
  }),
};
