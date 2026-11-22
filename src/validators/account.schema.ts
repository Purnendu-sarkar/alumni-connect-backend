import { z } from 'zod';

export const deactivateAccountSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required to verify identity.'),
});

export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required to verify identity.'),
  confirmText: z
    .string()
    .refine((val) => val === 'DELETE', {
      message: "You must type 'DELETE' exactly to confirm account deletion.",
    }),
});

export type DeactivateAccountInput = z.infer<typeof deactivateAccountSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
