import { Router } from 'express';

import { PERMISSIONS } from '../constants/permissions.js';
import { departmentController } from '../controllers/department.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { resolveTenant } from '../middlewares/tenant.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  createDepartmentSchema,
  departmentIdParamSchema,
  reorderDepartmentsSchema,
  toggleDepartmentStatusSchema,
  updateDepartmentSchema,
} from '../validators/department.schema.js';

// Public / Tenant-scoped routes
export const departmentRouter = Router();

departmentRouter.get('/', resolveTenant, departmentController.getActiveDepartments);

// Super Admin Management routes
export const adminDepartmentRouter = Router();

adminDepartmentRouter.use(authenticate);
adminDepartmentRouter.use(requirePermission(PERMISSIONS.UNIVERSITY_MANAGE));

adminDepartmentRouter.get('/', departmentController.listAdminDepartments);

adminDepartmentRouter.post(
  '/',
  validate(createDepartmentSchema, 'body'),
  departmentController.createDepartment,
);

adminDepartmentRouter.post(
  '/reorder',
  validate(reorderDepartmentsSchema, 'body'),
  departmentController.reorderDepartments,
);

adminDepartmentRouter.get(
  '/:id',
  validate(departmentIdParamSchema, 'params'),
  departmentController.getDepartmentDetail,
);

adminDepartmentRouter.patch(
  '/:id',
  validate(departmentIdParamSchema, 'params'),
  validate(updateDepartmentSchema, 'body'),
  departmentController.updateDepartment,
);

adminDepartmentRouter.patch(
  '/:id/status',
  validate(departmentIdParamSchema, 'params'),
  validate(toggleDepartmentStatusSchema, 'body'),
  departmentController.toggleDepartmentStatus,
);

adminDepartmentRouter.delete(
  '/:id',
  validate(departmentIdParamSchema, 'params'),
  departmentController.deleteDepartment,
);
