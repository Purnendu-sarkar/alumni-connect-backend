import { prisma } from '../config/database.js';
import type { MediaType, UploadPurpose } from '../generated/prisma/client.js';

export interface CreateUploadedFileInput {
  userId: string;
  purpose: UploadPurpose;
  mediaType: MediaType;
  publicId: string;
  url: string;
  secureUrl: string;
  format: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationSec?: number;
}

export const mediaRepository = {
  async create(data: CreateUploadedFileInput) {
    return prisma.uploadedFile.create({
      data: {
        userId: data.userId,
        purpose: data.purpose,
        mediaType: data.mediaType,
        publicId: data.publicId,
        url: data.url,
        secureUrl: data.secureUrl,
        format: data.format,
        sizeBytes: data.sizeBytes,
        width: data.width,
        height: data.height,
        durationSec: data.durationSec,
      },
    });
  },

  async findByPublicId(publicId: string) {
    return prisma.uploadedFile.findUnique({
      where: { publicId },
    });
  },

  async deleteByPublicId(publicId: string) {
    return prisma.uploadedFile.deleteMany({
      where: { publicId },
    });
  },

  async findByUserAndPurpose(userId: string, purpose: UploadPurpose) {
    return prisma.uploadedFile.findMany({
      where: { userId, purpose },
      orderBy: { createdAt: 'desc' },
    });
  },

  async updateUserAvatar(userId: string, avatarUrl: string | null, avatarPublicId: string | null) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl,
        avatarPublicId,
      },
    });
  },
};
