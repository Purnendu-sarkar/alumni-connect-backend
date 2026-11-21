import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { config, corsOrigins } from '../config/index.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/database.js';
import { tokenService } from '../services/auth/token.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { conversationRepository } from '../repositories/conversation.repository.js';
import { messageRepository } from '../repositories/message.repository.js';

interface SocketUser {
  userId: string;
  universityId: string;
  role: string;
  name: string;
}

interface CustomSocket extends Socket {
  data: {
    user?: SocketUser;
  };
}

let io: Server | null = null;
const userConnectionCounts = new Map<string, number>();
const onlineUsers = new Set<string>();

export function getSocketServer(): Server | null {
  return io;
}

export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId);
}

export function getOnlineUsers(): string[] {
  return Array.from(onlineUsers);
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, pair) => {
    const [key, value] = pair.trim().split('=');
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});
}

export function initSocketServer(httpServer: HttpServer): Server {
  if (io) {
    return io;
  }

  io = new Server(httpServer, {
    cors: {
      origin: corsOrigins.length > 0 ? corsOrigins : '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // JWT Handshake Authentication Middleware
  io.use(async (socket: CustomSocket, next) => {
    try {
      let token: string | undefined;

      // 1. Check handshake auth
      if (socket.handshake.auth && typeof socket.handshake.auth.token === 'string') {
        token = socket.handshake.auth.token;
      }

      // 2. Check authorization header
      if (!token && socket.handshake.headers.authorization?.startsWith('Bearer ')) {
        token = socket.handshake.headers.authorization.slice('Bearer '.length);
      }

      // 3. Check cookies
      if (!token && socket.handshake.headers.cookie) {
        const cookies = parseCookies(socket.handshake.headers.cookie);
        token = cookies.accessToken || cookies.access_token;
      }

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const payload = tokenService.verifyAccessToken(token);
      const user = await userRepository.findAuthenticatedById(payload.sub);

      if (!user || !user.isActive) {
        return next(new Error('Account is inactive or suspended'));
      }

      if (user.role.name === 'ALUMNI' && user.verificationStatus !== 'APPROVED') {
        return next(new Error('Account accreditation pending review'));
      }

      socket.data.user = {
        userId: user.id,
        universityId: user.universityId,
        role: user.role.name,
        name: user.name,
      };

      next();
    } catch (err) {
      logger.debug(err, '[Socket] Authentication handshake failed');
      next(new Error('Unauthorized'));
    }
  });

  // Connection Handler
  io.on('connection', async (socket: CustomSocket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    const { userId, universityId, name } = user;
    logger.debug(`[Socket] User connected: ${name} (${userId})`);

    // Personal user room and university room
    void socket.join(`user:${userId}`);
    void socket.join(`uni:${universityId}`);

    // Update presence tracking
    const currentCount = userConnectionCounts.get(userId) || 0;
    userConnectionCounts.set(userId, currentCount + 1);

    if (currentCount === 0) {
      onlineUsers.add(userId);
      socket.to(`uni:${universityId}`).emit('presence:update', {
        userId,
        status: 'ONLINE',
      });
    }

    // Flush any pending undelivered messages for this user
    try {
      const pendingSent = await prisma.message.findMany({
        where: {
          deliveryStatus: 'SENT',
          conversation: {
            participants: {
              some: { userId },
            },
          },
          senderId: { not: userId },
        },
        select: { id: true, conversationId: true, senderId: true },
      });

      if (pendingSent.length > 0) {
        const messageIds = pendingSent.map((m) => m.id);
        await prisma.message.updateMany({
          where: { id: { in: messageIds } },
          data: { deliveryStatus: 'DELIVERED' },
        });

        // Notify senders
        for (const msg of pendingSent) {
          io?.to(`user:${msg.senderId}`).emit('message:delivered', {
            conversationId: msg.conversationId,
            messageId: msg.id,
          });
        }
      }
    } catch (err) {
      logger.error(err, '[Socket] Error flushing undelivered messages');
    }

    // Join conversation room
    socket.on('conversation:join', async (data: { conversationId: string }) => {
      if (!data?.conversationId) return;
      const isMember = await conversationRepository.isParticipant(data.conversationId, userId);
      if (isMember) {
        void socket.join(`conversation:${data.conversationId}`);
      }
    });

    // Leave conversation room
    socket.on('conversation:leave', (data: { conversationId: string }) => {
      if (data?.conversationId) {
        void socket.leave(`conversation:${data.conversationId}`);
      }
    });

    // Typing start indicator
    socket.on('typing:start', async (data: { conversationId: string }) => {
      if (!data?.conversationId) return;
      socket.to(`conversation:${data.conversationId}`).emit('typing:status', {
        conversationId: data.conversationId,
        userId,
        userName: name,
        isTyping: true,
      });
    });

    // Typing stop indicator
    socket.on('typing:stop', async (data: { conversationId: string }) => {
      if (!data?.conversationId) return;
      socket.to(`conversation:${data.conversationId}`).emit('typing:status', {
        conversationId: data.conversationId,
        userId,
        userName: name,
        isTyping: false,
      });
    });

    // Client requests online presence of users
    socket.on('presence:check', (data: { userIds: string[] }, callback) => {
      if (!Array.isArray(data?.userIds)) return;
      const statusMap: Record<string, boolean> = {};
      for (const id of data.userIds) {
        statusMap[id] = onlineUsers.has(id);
      }
      if (typeof callback === 'function') {
        callback(statusMap);
      }
    });

    // Disconnect Handler
    socket.on('disconnect', () => {
      const remainingCount = (userConnectionCounts.get(userId) || 1) - 1;
      if (remainingCount <= 0) {
        userConnectionCounts.delete(userId);
        onlineUsers.delete(userId);
        socket.to(`uni:${universityId}`).emit('presence:update', {
          userId,
          status: 'OFFLINE',
          lastSeenAt: new Date(),
        });
      } else {
        userConnectionCounts.set(userId, remainingCount);
      }
      logger.debug(`[Socket] User disconnected: ${name} (${userId})`);
    });
  });

  return io;
}

export function stopSocketServer(): void {
  if (io) {
    io.close();
    io = null;
    userConnectionCounts.clear();
    onlineUsers.clear();
    logger.info('[Socket] Server closed cleanly');
  }
}
