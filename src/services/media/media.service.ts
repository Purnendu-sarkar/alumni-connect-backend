import type { UploadApiResponse, UploadApiOptions } from 'cloudinary';
import { cloudinary } from '../../config/cloudinary.js';
import { config } from '../../config/index.js';
import { ApiError } from '../../errors/api-error.js';
import type { MediaType, UploadPurpose } from '../../generated/prisma/client.js';
import { mediaRepository } from '../../repositories/media.repository.js';
import { userRepository } from '../../repositories/user.repository.js';
import type { ConfirmMediaInput, SignMediaInput } from '../../validators/media.validator.js';

export function getCloudinaryFolder(purpose: UploadPurpose, role: string, userId: string, isVideo = false): string {
  const roleSlug = role.toLowerCase().replace('_', '-');
  switch (purpose) {
    case 'PROFILE_PHOTO':
      return `alumni-connect/avatars/${roleSlug}/${userId}`;
    case 'STORY_MEDIA':
      return `alumni-connect/stories/${isVideo ? 'videos' : 'images'}/${userId}`;
    case 'EVENT_BANNER':
      return `alumni-connect/events/banners/${userId}`;
    case 'ANNOUNCEMENT_ATTACHMENT':
      return `alumni-connect/announcements/attachments/${userId}`;
    case 'MESSAGE_ATTACHMENT':
      return `alumni-connect/messages/${userId}`;
    case 'RESUME':
      return `alumni-connect/documents/resumes/${userId}`;
    default:
      return `alumni-connect/general/${userId}`;
  }
}

export function detectMediaType(mimeType: string): MediaType {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith('video/')) return 'VIDEO';
  if (lower.includes('pdf') || lower.includes('document') || lower.includes('msword')) return 'DOCUMENT';
  return 'IMAGE';
}

export const mediaService = {
  async uploadMediaStream(
    userId: string,
    universityId: string,
    role: string,
    fileBuffer: Buffer,
    mimeType: string,
    purpose: UploadPurpose = 'PROFILE_PHOTO',
  ) {
    const isVideo = mimeType.startsWith('video/');
    const mediaType = detectMediaType(mimeType);
    const folder = getCloudinaryFolder(purpose, role, userId, isVideo);

    const uploadOptions: UploadApiOptions = {
      folder,
      resource_type: isVideo ? 'video' : 'auto',
      overwrite: true,
    };

    if (purpose === 'PROFILE_PHOTO') {
      uploadOptions.transformation = [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto', fetch_format: 'auto' },
      ];
    } else if (purpose === 'EVENT_BANNER') {
      uploadOptions.transformation = [
        { width: 1200, height: 675, crop: 'fill' },
        { quality: 'auto', fetch_format: 'auto' },
      ];
    }

    const uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Upload to Cloudinary failed.'));
        }
        resolve(result);
      });
      stream.end(fileBuffer);
    });

    // Auto-cleanup existing avatar if replacing
    if (purpose === 'PROFILE_PHOTO') {
      const currentUser = await userRepository.findFullProfileById(userId);
      if (currentUser?.avatarPublicId && currentUser.avatarPublicId !== uploadResult.public_id) {
        try {
          await cloudinary.uploader.destroy(currentUser.avatarPublicId);
        } catch {
          // Ignore deletion error of legacy/missing asset
        }
      }
      await userRepository.updateAvatar(
        userId,
        universityId,
        uploadResult.secure_url,
        uploadResult.public_id,
      );
    }

    const savedFile = await mediaRepository.create({
      userId,
      purpose,
      mediaType,
      publicId: uploadResult.public_id,
      url: uploadResult.url,
      secureUrl: uploadResult.secure_url,
      format: uploadResult.format || 'unknown',
      sizeBytes: uploadResult.bytes,
      width: uploadResult.width,
      height: uploadResult.height,
      durationSec: uploadResult.duration,
    });

    return savedFile;
  },

  async generateUploadSignature(
    userId: string,
    role: string,
    input: SignMediaInput,
  ) {
    const isVideo = input.resourceType === 'video';
    const folder = getCloudinaryFolder(input.purpose, role, userId, isVideo);
    const timestamp = Math.round(new Date().getTime() / 1000);

    const paramsToSign: Record<string, string | number> = {
      folder,
      timestamp,
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      config.cloudinary.apiSecret,
    );

    return {
      signature,
      timestamp,
      apiKey: config.cloudinary.apiKey,
      cloudName: config.cloudinary.cloudName,
      folder,
      resourceType: input.resourceType,
    };
  },

  async confirmDirectUpload(userId: string, universityId: string, input: ConfirmMediaInput) {
    // Basic verification: user must own the asset path
    if (!input.publicId.includes(userId)) {
      throw ApiError.forbidden('Unauthorized media registration.');
    }

    if (input.purpose === 'PROFILE_PHOTO') {
      const currentUser = await userRepository.findFullProfileById(userId);
      if (currentUser?.avatarPublicId && currentUser.avatarPublicId !== input.publicId) {
        try {
          await cloudinary.uploader.destroy(currentUser.avatarPublicId);
        } catch {
          // Ignore cleanup error
        }
      }
      await userRepository.updateAvatar(
        userId,
        universityId,
        input.secureUrl,
        input.publicId,
      );
    }

    const savedFile = await mediaRepository.create({
      userId,
      purpose: input.purpose,
      mediaType: input.mediaType,
      publicId: input.publicId,
      url: input.url,
      secureUrl: input.secureUrl,
      format: input.format,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      durationSec: input.durationSec,
    });

    return savedFile;
  },

  async deleteMedia(userId: string, universityId: string, userRole: string, publicId: string) {
    const file = await mediaRepository.findByPublicId(publicId);
    if (!file) {
      throw ApiError.notFound('Media asset');
    }

    // Must be owner or SUPER_ADMIN
    if (file.userId !== userId && userRole !== 'SUPER_ADMIN') {
      throw ApiError.forbidden('You do not have permission to delete this media asset.');
    }

    const resourceType = file.mediaType === 'VIDEO' ? 'video' : 'image';

    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch {
      // Continue DB cleanup even if Cloudinary fails
    }

    await mediaRepository.deleteByPublicId(publicId);

    // If this was the user's avatar, clear it
    const currentUser = await userRepository.findFullProfileById(userId);
    if (currentUser?.avatarPublicId === publicId) {
      await userRepository.updateAvatar(userId, universityId, null, null);
    }

    return { success: true };
  },

  async removeAvatar(userId: string, universityId: string) {
    const currentUser = await userRepository.findFullProfileById(userId);
    if (!currentUser) throw ApiError.unauthorized('Account unavailable.');

    if (currentUser.avatarPublicId) {
      try {
        await cloudinary.uploader.destroy(currentUser.avatarPublicId);
      } catch {
        // Ignore deletion error
      }
      await mediaRepository.deleteByPublicId(currentUser.avatarPublicId);
    }

    await userRepository.updateAvatar(userId, universityId, null, null);
    return { avatarUrl: null, avatarPublicId: null };
  },

  async deleteCloudinaryAsset(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image') {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch {
      // Continue even if Cloudinary fails
    }
  },
};
