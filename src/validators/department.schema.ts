import { z } from 'zod';

export const departmentIdParamSchema = z.object({
  id: z.string().min(1, 'Department ID is required.'),
});

export const createDepartmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Department name must be at least 2 characters.')
    .max(100, 'Department name must not exceed 100 characters.'),
  code: z
    .string()
    .trim()
    .min(2, 'Department code must be at least 2 characters.')
    .max(10, 'Department code must not exceed 10 characters.')
    .toUpperCase(),
  faculty: z
    .string()
    .trim()
    .max(100, 'Faculty name must not exceed 100 characters.')
    .optional()
    .nullable(),
  description: z
    .string()
    .trim()
    .max(500, 'Description must not exceed 500 characters.')
    .optional()
    .nullable(),
  displayOrder: z.coerce.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export const updateDepartmentSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Department name must be at least 2 characters.')
      .max(100, 'Department name must not exceed 100 characters.')
      .optional(),
    code: z
      .string()
      .trim()
      .min(2, 'Department code must be at least 2 characters.')
      .max(10, 'Department code must not exceed 10 characters.')
      .toUpperCase()
      .optional(),
    faculty: z
      .string()
      .trim()
      .max(100, 'Faculty name must not exceed 100 characters.')
      .optional()
      .nullable(),
    description: z
      .string()
      .trim()
      .max(500, 'Description must not exceed 500 characters.')
      .optional()
      .nullable(),
    displayOrder: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update.',
  );

export const toggleDepartmentStatusSchema = z.object({
  isActive: z.boolean(),
});

export const reorderDepartmentsSchema = z.object({
  orderedIds: z
    .array(z.string().min(1, 'Invalid department ID.'))
    .min(1, 'At least one department ID is required for reordering.'),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type ToggleDepartmentStatusInput = z.infer<typeof toggleDepartmentStatusSchema>;
export type ReorderDepartmentsInput = z.infer<typeof reorderDepartmentsSchema>;
