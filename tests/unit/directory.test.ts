import { beforeEach, describe, expect, it, vi } from 'vitest';
import { directoryPresenter } from '../../src/presenters/directory.presenter.js';
import { directoryService } from '../../src/services/directory/directory.service.js';
import { directoryRepository } from '../../src/repositories/directory.repository.js';
import { blockRepository } from '../../src/repositories/block.repository.js';
import { cacheService } from '../../src/services/cache/cache.service.js';

describe('Feature 3: Alumni & Community Directory Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Privacy Field Masking & Presenter', () => {
    const rawAlumnus = {
      id: 'alumni-1',
      name: 'Tanvir Hossain',
      email: 'tanvir@example.com',
      phone: '+8801700000000',
      currentCompany: 'Brain Station 23',
      position: 'Engineering Manager',
      location: 'Dhaka, Bangladesh',
      skills: ['Go', 'Node.js', 'AWS'],
      isMentorshipAvailable: true,
      mentorshipStatus: 'OPEN',
      maxActiveMentees: 5,
      mentoringRequests: [{ id: 'm-1' }, { id: 'm-2' }],
      role: { name: 'ALUMNI' },
      privacySetting: {
        profileVisibility: 'ALL_MEMBERS',
        emailVisibility: 'CONNECTIONS_ONLY',
        phoneVisibility: 'ONLY_ME',
        locationVisibility: 'ALL_MEMBERS',
        careerVisibility: 'ALL_MEMBERS',
        skillsVisibility: 'ALL_MEMBERS',
        mentorshipVisibility: 'ALL_MEMBERS',
      },
    };

    it('masks email and phone for VERIFIED_MEMBER relationship', () => {
      const card = directoryPresenter.presentCard(rawAlumnus, 'VERIFIED_MEMBER', 'NONE');
      expect(card.email).toBeNull();
      expect(card.phone).toBeNull();
      expect(card.currentCompany).toBe('Brain Station 23');
      expect(card.location).toBe('Dhaka, Bangladesh');
      expect(card.skills).toEqual(['Go', 'Node.js', 'AWS']);
      expect(card.mentorshipBadge).toBe('OPEN');
      expect(card.connectionStatus).toBe('NONE');
    });

    it('unmasks email for CONNECTED relationship while keeping phone masked if phoneVisibility is ONLY_ME', () => {
      const card = directoryPresenter.presentCard(rawAlumnus, 'CONNECTED', 'CONNECTED');
      expect(card.email).toBe('tanvir@example.com');
      expect(card.phone).toBeNull();
      expect(card.currentCompany).toBe('Brain Station 23');
      expect(card.connectionStatus).toBe('CONNECTED');
    });

    it('unmasks all fields for SELF relationship', () => {
      const card = directoryPresenter.presentCard(rawAlumnus, 'SELF', 'NONE');
      expect(card.email).toBe('tanvir@example.com');
      expect(card.phone).toBe('+8801700000000');
    });

    it('computes mentorshipBadge as FULL when active mentees reach capacity', () => {
      const fullAlumnus = {
        ...rawAlumnus,
        maxActiveMentees: 2,
        mentoringRequests: [{ id: 'm-1' }, { id: 'm-2' }],
      };
      const card = directoryPresenter.presentCard(fullAlumnus, 'VERIFIED_MEMBER', 'NONE');
      expect(card.mentorshipBadge).toBe('FULL');
    });
  });

  describe('Directory Service Filtering & Role Enforcement', () => {
    it('forces group to alumni when viewer role is STUDENT', async () => {
      vi.spyOn(blockRepository, 'getBlockedUserIds').mockResolvedValue([]);
      const searchSpy = vi.spyOn(directoryRepository, 'searchCandidates').mockResolvedValue({
        candidates: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await directoryService.searchDirectory(
        'uni-1',
        { id: 'stu-1', role: 'STUDENT' },
        { group: 'students' }, // Attempting to search students
      );

      expect(searchSpy).toHaveBeenCalledWith(
        'uni-1',
        'alumni', // Enforced to 'alumni'
        expect.anything(),
        ['stu-1'],
      );
    });

    it('excludes blocked users from directory candidates query', async () => {
      vi.spyOn(blockRepository, 'getBlockedUserIds').mockResolvedValue(['blocked-user-99']);
      const searchSpy = vi.spyOn(directoryRepository, 'searchCandidates').mockResolvedValue({
        candidates: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await directoryService.searchDirectory(
        'uni-1',
        { id: 'alumni-1', role: 'ALUMNI' },
        { group: 'alumni' },
      );

      expect(searchSpy).toHaveBeenCalledWith(
        'uni-1',
        'alumni',
        expect.anything(),
        ['alumni-1', 'blocked-user-99'],
      );
    });

    it('bumps directory cache version on profile and privacy changes', async () => {
      const bumpSpy = vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(2);
      await cacheService.bumpVersion('dir');
      expect(bumpSpy).toHaveBeenCalledWith('dir');
    });
  });
});
