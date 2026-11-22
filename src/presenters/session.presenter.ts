import type { RefreshToken } from '../generated/prisma/client.js';
import { maskIp, parseDeviceName } from '../utils/device-parser.js';

export interface SessionDto {
  id: string;
  deviceName: string;
  maskedIp: string;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export const sessionPresenter = {
  toDto(session: RefreshToken, currentSessionId?: string | null): SessionDto {
    const isCurrent = Boolean(currentSessionId && session.id === currentSessionId);

    return {
      id: session.id,
      deviceName: session.deviceName || parseDeviceName(session.userAgent),
      maskedIp: maskIp(session.ipAddress),
      userAgent: session.userAgent ?? null,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: (session.lastActiveAt || session.createdAt).toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      isCurrent,
    };
  },

  toDtoList(sessions: RefreshToken[], currentSessionId?: string | null): SessionDto[] {
    let hasCurrent = false;
    const dtos = sessions.map((s) => {
      const dto = this.toDto(s, currentSessionId);
      if (dto.isCurrent) hasCurrent = true;
      return dto;
    });

    // If currentSessionId was not provided via cookie, assume the top (most recent) session is current
    if (!hasCurrent && dtos.length > 0 && dtos[0]) {
      dtos[0].isCurrent = true;
    }

    return dtos;
  },
};
