import { z } from 'zod';

export const uploadPurposeSchema = z.enum([
  'PROFILE_PHOTO',
  'RESUME',
  'STORY_MEDIA',
  'EVENT_BANNER',
  'ANNOUNCEMENT_ATTACHMENT',
]);

export const signMediaSchema = z.object({
  purpose: uploadPurposeSchema,
  resourceType: z.enum(['image', 'video', 'raw', 'auto']).default('auto'),
  format: z.string().optional(),
});

export const confirmMediaSchema = z.object({
  publicId: z.string().min(1, 'publicId is required'),
  url: z.string().url('url must be a valid URL'),
  secureUrl: z.string().url('secureUrl must be a valid URL'),
  format: z.string().min(1, 'format is required'),
  sizeBytes: z.number().int().positive('sizeBytes must be positive'),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  durationSec: z.number().optional(),
  purpose: uploadPurposeSchema,
  mediaType: z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']).default('IMAGE'),
});

export type SignMediaInput = z.infer<typeof signMediaSchema>;
export type ConfirmMediaInput = z.infer<typeof confirmMediaSchema>;
