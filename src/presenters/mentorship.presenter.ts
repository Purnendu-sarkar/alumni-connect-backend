export const mentorshipPresenter = {
  presentItem(item: any, viewerId: string) {
    const isMentor = viewerId === item.mentorId;

    return {
      id: item.id,
      mentorId: item.mentorId,
      menteeId: item.menteeId,
      topic: item.topic,
      careerGoal: item.careerGoal,
      message: item.message,
      preferredCommunication: item.preferredCommunication,
      availability: item.availability,
      expectedDuration: item.expectedDuration,
      status: item.status,
      clarificationQuestion: item.clarificationQuestion,
      clarificationReply: item.clarificationReply,
      decisionNote: item.decisionNote,
      scheduledAt: item.scheduledAt,
      startedAt: item.startedAt,
      endedAt: item.endedAt,
      endedById: item.endedById,
      endNote: item.endNote,
      // Strictly private to Alumni mentor: never exposed to mentee
      alumniNote: isMentor ? item.alumniNote ?? null : undefined,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      mentor: item.mentor
        ? {
            id: item.mentor.id,
            name: item.mentor.name,
            avatarUrl: item.mentor.avatarUrl,
            department: item.mentor.department,
            currentCompany: item.mentor.currentCompany,
            position: item.mentor.position,
            email: item.mentor.email,
          }
        : undefined,
      mentee: item.mentee
        ? {
            id: item.mentee.id,
            name: item.mentee.name,
            avatarUrl: item.mentee.avatarUrl,
            department: item.mentee.department,
            batch: item.mentee.batch,
            email: item.mentee.email,
          }
        : undefined,
    };
  },

  presentList(items: any[], viewerId: string) {
    return items.map((item) => this.presentItem(item, viewerId));
  },
};
