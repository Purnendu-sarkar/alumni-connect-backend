import type { PrivacyScope, PrivacySetting } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';

export const privacyRepository = {
  async findByUserId(userId: string): Promise<PrivacySetting | null> {
    return prisma.privacySetting.findUnique({
      where: { userId },
    });
  },

  async getOrCreateDefault(userId: string): Promise<PrivacySetting> {
    const existing = await this.findByUserId(userId);
    if (existing) return existing;

    return prisma.privacySetting.create({
      data: {
        userId,
        profileVisibility: 'ALL_MEMBERS',
        emailVisibility: 'CONNECTIONS_ONLY',
        phoneVisibility: 'ONLY_ME',
        locationVisibility: 'ALL_MEMBERS',
        careerVisibility: 'ALL_MEMBERS',
        educationVisibility: 'ALL_MEMBERS',
        skillsVisibility: 'ALL_MEMBERS',
        connectionsVisibility: 'ALL_MEMBERS',
        mentorshipVisibility: 'ALL_MEMBERS',
        searchVisibility: 'ALL_MEMBERS',
        messagingPermission: 'ALL_MEMBERS',
      },
    });
  },

  async update(
    userId: string,
    data: Partial<{
      profileVisibility: PrivacyScope;
      emailVisibility: PrivacyScope;
      phoneVisibility: PrivacyScope;
      locationVisibility: PrivacyScope;
      careerVisibility: PrivacyScope;
      educationVisibility: PrivacyScope;
      skillsVisibility: PrivacyScope;
      connectionsVisibility: PrivacyScope;
      mentorshipVisibility: PrivacyScope;
      searchVisibility: PrivacyScope;
      messagingPermission: PrivacyScope;
    }>,
  ): Promise<PrivacySetting> {
    return prisma.privacySetting.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        profileVisibility: data.profileVisibility ?? 'ALL_MEMBERS',
        emailVisibility: data.emailVisibility ?? 'CONNECTIONS_ONLY',
        phoneVisibility: data.phoneVisibility ?? 'ONLY_ME',
        locationVisibility: data.locationVisibility ?? 'ALL_MEMBERS',
        careerVisibility: data.careerVisibility ?? 'ALL_MEMBERS',
        educationVisibility: data.educationVisibility ?? 'ALL_MEMBERS',
        skillsVisibility: data.skillsVisibility ?? 'ALL_MEMBERS',
        connectionsVisibility: data.connectionsVisibility ?? 'ALL_MEMBERS',
        mentorshipVisibility: data.mentorshipVisibility ?? 'ALL_MEMBERS',
        searchVisibility: data.searchVisibility ?? 'ALL_MEMBERS',
        messagingPermission: data.messagingPermission ?? 'ALL_MEMBERS',
      },
    });
  },

  async resetDefaults(userId: string): Promise<PrivacySetting> {
    const defaults = {
      profileVisibility: 'ALL_MEMBERS' as PrivacyScope,
      emailVisibility: 'CONNECTIONS_ONLY' as PrivacyScope,
      phoneVisibility: 'CONNECTIONS_ONLY' as PrivacyScope,
      locationVisibility: 'ALL_MEMBERS' as PrivacyScope,
      careerVisibility: 'ALL_MEMBERS' as PrivacyScope,
      educationVisibility: 'ALL_MEMBERS' as PrivacyScope,
      skillsVisibility: 'ALL_MEMBERS' as PrivacyScope,
      connectionsVisibility: 'CONNECTIONS_ONLY' as PrivacyScope,
      mentorshipVisibility: 'ALL_MEMBERS' as PrivacyScope,
      searchVisibility: 'ALL_MEMBERS' as PrivacyScope,
      messagingPermission: 'CONNECTIONS_ONLY' as PrivacyScope,
    };

    return prisma.privacySetting.upsert({
      where: { userId },
      update: defaults,
      create: {
        userId,
        ...defaults,
      },
    });
  },
};
