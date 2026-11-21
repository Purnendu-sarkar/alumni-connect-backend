import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { messageController } from '../controllers/message.controller.js';

export const messageRouter = Router();

// All messaging endpoints require authenticated session
messageRouter.use(authenticate);

// Global unread badge
messageRouter.get('/unread-count', messageController.getUnreadCount);

// Eligibility check
messageRouter.get('/eligibility/:targetUserId', messageController.checkEligibility);

// Conversations management
messageRouter.post('/conversations', messageController.startOrGetConversation);
messageRouter.get('/conversations', messageController.listConversations);
messageRouter.get('/conversations/:id', messageController.getConversationById);
messageRouter.patch('/conversations/:id/preferences', messageController.updatePreferences);
messageRouter.post('/conversations/:id/read', messageController.markRead);

// Messages in conversation
messageRouter.get('/conversations/:id/messages', messageController.listMessages);
messageRouter.post('/conversations/:id/messages', messageController.sendMessage);

// Single message actions
messageRouter.put('/messages/:messageId', messageController.editMessage);
messageRouter.delete('/messages/:messageId', messageController.deleteMessage);
messageRouter.post('/messages/:messageId/react', messageController.toggleReaction);
