import { z } from 'zod';

export const createConversationSchema = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required'),
  initialMessage: z.string().trim().max(4000, 'Message cannot exceed 4000 characters').optional(),
  contextType: z.enum(['DIRECT', 'MENTORSHIP', 'JOB_APPLICATION']).default('DIRECT'),
  contextId: z.string().max(64).optional(),
});

export const messageAttachmentSchema = z.object({
  url: z.string().url('Invalid attachment URL'),
  secureUrl: z.string().url('Invalid attachment secure URL'),
  publicId: z.string().min(1, 'Public ID is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z.number().int().nonnegative('File size must be positive'),
  mimeType: z.string().min(1, 'MIME type is required'),
});

export const sendMessageSchema = z.object({
  content: z.string().trim().max(4000, 'Message cannot exceed 4000 characters').default(''),
  type: z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'SYSTEM']).default('TEXT'),
  replyToId: z.string().cuid('Invalid reply message ID').optional(),
  attachments: z.array(messageAttachmentSchema).max(5, 'Maximum 5 attachments allowed').optional(),
}).refine(
  (data) => data.content.length > 0 || (data.attachments && data.attachments.length > 0),
  {
    message: 'Message must have either text content or at least one attachment',
    path: ['content'],
  },
);

export const editMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message content cannot be empty').max(4000, 'Message cannot exceed 4000 characters'),
});

export const deleteMessageSchema = z.object({
  mode: z.enum(['ME', 'EVERYONE']),
});

export const reactMessageSchema = z.object({
  emoji: z.string().min(1, 'Emoji is required').max(16, 'Invalid emoji identifier'),
});

export const conversationPreferencesSchema = z.object({
  isArchived: z.boolean().optional(),
  isMuted: z.boolean().optional(),
  isPinned: z.boolean().optional(),
});

export const listConversationsQuerySchema = z.object({
  tab: z.enum(['all', 'unread', 'archived']).default('all'),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const listMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type MessageAttachmentInput = z.infer<typeof messageAttachmentSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>;
export type ReactMessageInput = z.infer<typeof reactMessageSchema>;
export type ConversationPreferencesInput = z.infer<typeof conversationPreferencesSchema>;
export type ListConversationsQueryInput = z.infer<typeof listConversationsQuerySchema>;
export type ListMessagesQueryInput = z.infer<typeof listMessagesQuerySchema>;
