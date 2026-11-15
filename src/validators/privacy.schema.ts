import { z } from 'zod';

const privacyScopeEnum = z.enum(['PUBLIC', 'ALL_MEMBERS', 'CONNECTIONS_ONLY', 'ONLY_ME']);

export const updatePrivacySchema = z.object({
  profileVisibility: privacyScopeEnum.optional(),
  emailVisibility: privacyScopeEnum.optional(),
  phoneVisibility: privacyScopeEnum.optional(),
  locationVisibility: privacyScopeEnum.optional(),
  careerVisibility: privacyScopeEnum.optional(),
  educationVisibility: privacyScopeEnum.optional(),
  skillsVisibility: privacyScopeEnum.optional(),
  connectionsVisibility: privacyScopeEnum.optional(),
  mentorshipVisibility: privacyScopeEnum.optional(),
  searchVisibility: privacyScopeEnum.optional(),
  messagingPermission: privacyScopeEnum.optional(),
});
