import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mentorshipService } from '../../src/services/mentorship/mentorship.service.js';
import { mentorshipRepository } from '../../src/repositories/mentorship.repository.js';
import { mentorshipPresenter } from '../../src/presenters/mentorship.presenter.js';
import { userRepository } from '../../src/repositories/user.repository.js';
import { blockRepository } from '../../src/repositories/block.repository.js';
import { auditLogRepository } from '../../src/repositories/audit-log.repository.js';
import { notificationService } from '../../src/services/notification/notification.service.js';

describe('Feature 5: Alumni Mentorship System Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Mentorship Request Creation & Guard Validation', () => {
    it('blocks request if mentor is at maximum capacity (5 active mentees)', async () => {
      vi.spyOn(blockRepository, 'findBlock').mockResolvedValue(null);
      vi.spyOn(userRepository, 'findAuthenticatedById').mockResolvedValue({
        id: 'mentor-1',
        universityId: 'uni-1',
        role: { name: 'ALUMNI' },
        isMentorshipAvailable: true,
        mentorshipStatus: 'OPEN',
        maxActiveMentees: 5,
      } as any);

      vi.spyOn(mentorshipRepository, 'countActiveMentees').mockResolvedValue(5);

      await expect(
        mentorshipService.createRequest({
          universityId: 'uni-1',
          studentId: 'student-1',
          mentorId: 'mentor-1',
          topic: 'Backend Architecture',
          careerGoal: 'Become a Senior Software Engineer',
          message: 'Hello senior, seeking guidance on distributed Go microservices.',
          preferredCommunication: 'CHAT',
          availability: 'Weekends',
        }),
      ).rejects.toThrow('Mentor is currently at maximum active mentee capacity.');
    });

    it('blocks duplicate active or pending mentorship proposals', async () => {
      vi.spyOn(blockRepository, 'findBlock').mockResolvedValue(null);
      vi.spyOn(userRepository, 'findAuthenticatedById').mockResolvedValue({
        id: 'mentor-1',
        universityId: 'uni-1',
        role: { name: 'ALUMNI' },
        isMentorshipAvailable: true,
        mentorshipStatus: 'OPEN',
        maxActiveMentees: 5,
      } as any);

      vi.spyOn(mentorshipRepository, 'countActiveMentees').mockResolvedValue(2);
      vi.spyOn(mentorshipRepository, 'findActiveBetweenUsers').mockResolvedValue({
        id: 'existing-req',
        status: 'REQUESTED',
      } as any);

      await expect(
        mentorshipService.createRequest({
          universityId: 'uni-1',
          studentId: 'student-1',
          mentorId: 'mentor-1',
          topic: 'Backend Architecture',
          careerGoal: 'Become a Senior Software Engineer',
          message: 'Hello senior, seeking guidance on distributed Go microservices.',
          preferredCommunication: 'CHAT',
          availability: 'Weekends',
        }),
      ).rejects.toThrow(/already exists/);
    });

    it('successfully creates mentorship request in REQUESTED state and dispatches notification', async () => {
      vi.spyOn(blockRepository, 'findBlock').mockResolvedValue(null);
      vi.spyOn(userRepository, 'findAuthenticatedById').mockImplementation(async (id) => ({
        id,
        universityId: 'uni-1',
        name: id === 'student-1' ? 'Purnendu Sarkar' : 'Tanvir Hossain',
        role: { name: id === 'student-1' ? 'STUDENT' : 'ALUMNI' },
        isMentorshipAvailable: true,
        mentorshipStatus: 'OPEN',
        maxActiveMentees: 5,
      } as any));

      vi.spyOn(mentorshipRepository, 'countActiveMentees').mockResolvedValue(1);
      vi.spyOn(mentorshipRepository, 'findActiveBetweenUsers').mockResolvedValue(null);
      vi.spyOn(mentorshipRepository, 'createRequest').mockResolvedValue({
        id: 'req-new',
        mentorId: 'mentor-1',
        menteeId: 'student-1',
        topic: 'Backend Architecture',
        careerGoal: 'Become a Senior Software Engineer',
        message: 'Hello senior, seeking guidance.',
        preferredCommunication: 'CHAT',
        availability: 'Weekends',
        status: 'REQUESTED',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const notifySpy = vi.spyOn(notificationService, 'notifyUser').mockResolvedValue({} as any);
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const result = await mentorshipService.createRequest({
        universityId: 'uni-1',
        studentId: 'student-1',
        mentorId: 'mentor-1',
        topic: 'Backend Architecture',
        careerGoal: 'Become a Senior Software Engineer',
        message: 'Hello senior, seeking guidance.',
        preferredCommunication: 'CHAT',
        availability: 'Weekends',
      });

      expect(result.status).toBe('REQUESTED');
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'mentor-1',
          type: 'MENTORSHIP_REQUEST',
        }),
      );
    });
  });

  describe('6-State Lifecycle Transitions', () => {
    it('supports clarification flow: REQUESTED -> CLARIFICATION_REQUESTED -> REQUESTED', async () => {
      vi.spyOn(mentorshipRepository, 'findById').mockResolvedValue({
        id: 'req-1',
        universityId: 'uni-1',
        mentorId: 'mentor-1',
        menteeId: 'student-1',
        status: 'REQUESTED',
      } as any);

      const updateSpy = vi.spyOn(mentorshipRepository, 'updateStatus').mockResolvedValue({
        id: 'req-1',
        status: 'CLARIFICATION_REQUESTED',
        clarificationQuestion: 'What are your preferred meeting hours?',
      } as any);

      vi.spyOn(notificationService, 'notifyUser').mockResolvedValue({} as any);
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const clarified = await mentorshipService.clarifyRequest({
        id: 'req-1',
        alumniId: 'mentor-1',
        universityId: 'uni-1',
        question: 'What are your preferred meeting hours?',
      });

      expect(clarified.status).toBe('CLARIFICATION_REQUESTED');

      // Student replies
      vi.spyOn(mentorshipRepository, 'findById').mockResolvedValue({
        id: 'req-1',
        universityId: 'uni-1',
        mentorId: 'mentor-1',
        menteeId: 'student-1',
        status: 'CLARIFICATION_REQUESTED',
      } as any);

      updateSpy.mockResolvedValue({
        id: 'req-1',
        status: 'REQUESTED',
        clarificationReply: 'Friday evenings 8 PM.',
      } as any);

      const replied = await mentorshipService.replyClarification({
        id: 'req-1',
        studentId: 'student-1',
        universityId: 'uni-1',
        reply: 'Friday evenings 8 PM.',
      });

      expect(replied.status).toBe('REQUESTED');
    });

    it('concludes active mentorship to COMPLETED and records endedAt', async () => {
      vi.spyOn(mentorshipRepository, 'findById').mockResolvedValue({
        id: 'req-active',
        universityId: 'uni-1',
        mentorId: 'mentor-1',
        menteeId: 'student-1',
        status: 'ACTIVE',
      } as any);

      vi.spyOn(mentorshipRepository, 'updateStatus').mockResolvedValue({
        id: 'req-active',
        status: 'COMPLETED',
        endedAt: new Date(),
        endedById: 'mentor-1',
        endNote: 'Great progress made on system design.',
      } as any);

      vi.spyOn(notificationService, 'notifyUser').mockResolvedValue({} as any);
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const ended = await mentorshipService.endMentorship({
        id: 'req-active',
        userId: 'mentor-1',
        universityId: 'uni-1',
        note: 'Great progress made on system design.',
      });

      expect(ended.status).toBe('COMPLETED');
    });
  });

  describe('Presenter Privacy Masking for Private Alumni Notes', () => {
    const rawSession = {
      id: 'session-1',
      mentorId: 'mentor-1',
      menteeId: 'student-1',
      topic: 'Cloud DevOps',
      careerGoal: 'SRE Role',
      message: 'Need coaching.',
      status: 'ACTIVE',
      alumniNote: 'CONFIDENTIAL: Student needs to improve fundamental Linux networking knowledge.',
    };

    it('strictly hides alumniNote when viewer is the student mentee', () => {
      const presented = mentorshipPresenter.presentItem(rawSession, 'student-1');
      expect(presented.alumniNote).toBeUndefined();
    });

    it('includes alumniNote when viewer is the alumni mentor', () => {
      const presented = mentorshipPresenter.presentItem(rawSession, 'mentor-1');
      expect(presented.alumniNote).toBe('CONFIDENTIAL: Student needs to improve fundamental Linux networking knowledge.');
    });
  });
});
