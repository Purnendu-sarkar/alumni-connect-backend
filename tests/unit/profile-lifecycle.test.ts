import { describe, expect, it, vi, beforeEach } from 'vitest';
import { userService } from '../../src/services/user/user.service.js';
import { userRepository } from '../../src/repositories/user.repository.js';

describe('Profile Lifecycle & Mandatory Field Metrics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates 70% completion and onboardingCompleted=true when student has mandatory fields', async () => {
    const mockStudent = {
      id: 'stu-1',
      universityId: 'uni-1',
      name: 'John Doe',
      email: 'john@example.com',
      studentId: 'STU-1001',
      department: 'Computer Science',
      batch: '2024',
      bio: null,
      skills: [],
      avatarUrl: null,
      linkedinUrl: null,
      onboardingCompleted: false,
      role: { name: 'STUDENT' },
      university: { id: 'uni-1', name: 'Campus', slug: 'campus', domain: 'campus.edu' },
    };

    vi.spyOn(userRepository, 'findFullProfileById').mockResolvedValue(mockStudent as any);

    const result = await userService.getMe('stu-1');
    expect(result.completionPercentage).toBe(70);
    expect(result.onboardingCompleted).toBe(true);
    expect(result.missingRequiredFields).toEqual([]);
  });

  it('detects missing studentId in student profile and marks onboardingCompleted=false', async () => {
    const mockStudentIncomplete = {
      id: 'stu-2',
      universityId: 'uni-1',
      name: 'Jane Student',
      email: 'jane@example.com',
      studentId: '',
      department: 'Computer Science',
      batch: '2024',
      bio: null,
      skills: [],
      avatarUrl: null,
      linkedinUrl: null,
      onboardingCompleted: false,
      role: { name: 'STUDENT' },
      university: { id: 'uni-1', name: 'Campus', slug: 'campus', domain: 'campus.edu' },
    };

    vi.spyOn(userRepository, 'findFullProfileById').mockResolvedValue(mockStudentIncomplete as any);

    const result = await userService.getMe('stu-2');
    expect(result.onboardingCompleted).toBe(false);
    expect(result.missingRequiredFields).toContain('Student ID');
  });

  it('allows alumni to toggle and persist mentorship availability', async () => {
    const mockAlumni = {
      id: 'alu-1',
      universityId: 'uni-1',
      name: 'Jane Alum',
      email: 'jane@alum.edu',
      department: 'EEE',
      graduationYear: '2020',
      academicId: 'ACAD-2020',
      isMentorshipAvailable: false,
      onboardingCompleted: true,
      role: { name: 'ALUMNI' },
      university: { id: 'uni-1', name: 'Campus', slug: 'campus', domain: 'campus.edu' },
    };

    vi.spyOn(userRepository, 'findFullProfileById').mockResolvedValue(mockAlumni as any);
    vi.spyOn(userRepository, 'updateProfile').mockImplementation((async (_userId: string, _uniId: string, data: any) => {
      return { ...mockAlumni, ...data } as any;
    }) as any);

    const updated = await userService.updateMe('alu-1', 'uni-1', {
      isMentorshipAvailable: true,
    } as any);

    expect(updated.isMentorshipAvailable).toBe(true);
  });
});
