import type { MessagingEligibility } from '../services/message/message.service.js';

export interface FormattedParticipant {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  department: string | null;
  position: string | null;
  currentCompany: string | null;
}

export interface FormattedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  senderRole: string;
  isOwn: boolean;
  type: string;
  content: string;
  attachments: unknown[];
  deliveryStatus: string;
  replyTo: {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
  } | null;
  reactions: Record<string, string[]>;
  isEdited: boolean;
  editedAt: string | null;
  isDeletedForAll: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FormattedConversation {
  id: string;
  contextType: string;
  contextId: string | null;
  lastMessageSnippet: string | null;
  lastMessageAt: string | null;
  otherParticipant: FormattedParticipant;
  preferences: {
    isArchived: boolean;
    isMuted: boolean;
    isPinned: boolean;
    unreadCount: number;
    lastReadAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export const messagePresenter = {
  formatMessage(message: any, currentUserId: string): FormattedMessage {
    const isDeleted = Boolean(message.isDeletedForAll);
    const content = isDeleted ? 'This message was deleted' : message.content;
    const attachments = isDeleted ? [] : (Array.isArray(message.attachments) ? message.attachments : []);

    let replyTo = null;
    if (message.replyTo) {
      replyTo = {
        id: message.replyTo.id,
        senderId: message.replyTo.senderId,
        senderName: message.replyTo.sender?.name || 'User',
        content: message.replyTo.isDeletedForAll ? 'This message was deleted' : message.replyTo.content,
      };
    }

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: message.sender?.name || 'User',
      senderAvatarUrl: message.sender?.avatarUrl || null,
      senderRole: message.sender?.role?.name || 'MEMBER',
      isOwn: message.senderId === currentUserId,
      type: message.type,
      content,
      attachments,
      deliveryStatus: message.deliveryStatus,
      replyTo,
      reactions: message.reactions || {},
      isEdited: Boolean(message.isEdited),
      editedAt: message.editedAt ? new Date(message.editedAt).toISOString() : null,
      isDeletedForAll: isDeleted,
      readAt: message.readAt ? new Date(message.readAt).toISOString() : null,
      createdAt: new Date(message.createdAt).toISOString(),
      updatedAt: new Date(message.updatedAt).toISOString(),
    };
  },

  formatConversation(conversation: any, currentUserId: string): FormattedConversation {
    const myParticipant = conversation.participants.find((p: any) => p.userId === currentUserId);
    const otherParticipantRecord = conversation.participants.find((p: any) => p.userId !== currentUserId) || conversation.participants[0];
    const otherUser = otherParticipantRecord?.user || {};

    const otherParticipant: FormattedParticipant = {
      id: otherUser.id || '',
      name: otherUser.name || 'Member',
      avatarUrl: otherUser.avatarUrl || null,
      role: otherUser.role?.name || 'MEMBER',
      department: otherUser.department || null,
      position: otherUser.position || null,
      currentCompany: otherUser.currentCompany || null,
    };

    return {
      id: conversation.id,
      contextType: conversation.contextType,
      contextId: conversation.contextId || null,
      lastMessageSnippet: conversation.lastMessageSnippet || null,
      lastMessageAt: conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toISOString() : null,
      otherParticipant,
      preferences: {
        isArchived: Boolean(myParticipant?.isArchived),
        isMuted: Boolean(myParticipant?.isMuted),
        isPinned: Boolean(myParticipant?.isPinned),
        unreadCount: myParticipant?.unreadCount || 0,
        lastReadAt: myParticipant?.lastReadAt ? new Date(myParticipant.lastReadAt).toISOString() : null,
      },
      createdAt: new Date(conversation.createdAt).toISOString(),
      updatedAt: new Date(conversation.updatedAt).toISOString(),
    };
  },

  formatConversationsList(
    result: { conversations: any[]; meta: any },
    currentUserId: string,
  ) {
    return {
      conversations: result.conversations.map((c) => this.formatConversation(c, currentUserId)),
      meta: result.meta,
    };
  },

  formatMessagesList(result: { messages: any[]; nextCursor: string | null }, currentUserId: string) {
    return {
      messages: result.messages.map((m) => this.formatMessage(m, currentUserId)),
      nextCursor: result.nextCursor,
    };
  },

  formatEligibility(eligibility: MessagingEligibility) {
    return {
      eligible: eligibility.eligible,
      reason: eligibility.reason || null,
      message: eligibility.message || null,
    };
  },
};
