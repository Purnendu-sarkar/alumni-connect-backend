import { privacyService, type ViewerRelationship } from '../services/privacy/privacy.service.js';

export type ConnectionStatusTag = 'NONE' | 'PENDING_SENT' | 'PENDING_RECEIVED' | 'CONNECTED';
export type MentorshipBadge = 'OPEN' | 'FULL' | 'CLOSED' | null;

export const directoryPresenter = {
  presentCard(
    member: any,
    relationship: ViewerRelationship,
    connectionStatus: ConnectionStatusTag = 'NONE',
  ) {
    const privacy = member.privacySetting;

    const emailVisible = privacyService.isFieldVisible(privacy?.emailVisibility, relationship);
    const phoneVisible = privacyService.isFieldVisible(privacy?.phoneVisibility, relationship);
    const locationVisible = privacyService.isFieldVisible(privacy?.locationVisibility, relationship);
    const careerVisible = privacyService.isFieldVisible(privacy?.careerVisibility, relationship);
    const skillsVisible = privacyService.isFieldVisible(privacy?.skillsVisibility, relationship);
    const mentorshipVisible = privacyService.isFieldVisible(privacy?.mentorshipVisibility, relationship);

    let mentorshipBadge: MentorshipBadge = null;
    if (member.role?.name === 'ALUMNI') {
      if (!mentorshipVisible) {
        mentorshipBadge = 'CLOSED';
      } else if (member.isMentorshipAvailable && member.mentorshipStatus === 'OPEN') {
        const activeCount = Array.isArray(member.mentoringRequests) ? member.mentoringRequests.length : 0;
        const maxMentees = member.maxActiveMentees ?? 5;
        mentorshipBadge = activeCount >= maxMentees ? 'FULL' : 'OPEN';
      } else {
        mentorshipBadge = 'CLOSED';
      }
    }

    return {
      id: member.id,
      name: member.name,
      avatarUrl: member.avatarUrl,
      role: member.role?.name,
      department: member.department,
      departmentId: member.departmentId,
      departmentRef: member.departmentRef,
      batch: member.batch,
      graduationYear: member.graduationYear,
      verified: member.verified,
      verificationStatus: member.verificationStatus,
      currentCompany: careerVisible ? member.currentCompany : null,
      position: careerVisible ? member.position : null,
      headline: careerVisible ? member.headline : null,
      bio: member.bio,
      location: locationVisible ? member.location : null,
      email: emailVisible ? member.email : null,
      phone: phoneVisible ? member.phone : null,
      skills: skillsVisible ? member.skills ?? [] : [],
      mentorshipBadge,
      connectionStatus,
      relationship,
    };
  },

  presentDetail(
    member: any,
    relationship: ViewerRelationship,
    connectionStatus: ConnectionStatusTag = 'NONE',
    activeMentorshipStatus: string | null = null,
  ) {
    const card = this.presentCard(member, relationship, connectionStatus);
    const privacy = member.privacySetting;

    const profileVisible = privacyService.isFieldVisible(privacy?.profileVisibility, relationship);
    const educationVisible = privacyService.isFieldVisible(privacy?.educationVisibility, relationship);

    return {
      ...card,
      profileVisible,
      studentId: relationship === 'SELF' ? member.studentId : null,
      academicId: relationship === 'SELF' ? member.academicId : null,
      admissionYear: educationVisible ? member.admissionYear : null,
      expectedGraduationYear: educationVisible ? member.expectedGraduationYear : null,
      currentSemester: educationVisible ? member.currentSemester : null,
      employmentStatus: card.currentCompany ? member.employmentStatus : null,
      interests: member.interests ?? [],
      linkedinUrl: card.currentCompany ? member.linkedinUrl : null,
      githubUrl: card.currentCompany ? member.githubUrl : null,
      websiteUrl: card.currentCompany ? member.websiteUrl : null,
      mentorshipTopics: member.mentorshipTopics ?? [],
      maxActiveMentees: member.role?.name === 'ALUMNI' && relationship === 'SELF' ? member.maxActiveMentees : undefined,
      activeMentorshipStatus,
      university: member.university,
      createdAt: member.createdAt,
    };
  },
};
