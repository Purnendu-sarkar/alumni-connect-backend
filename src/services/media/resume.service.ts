import { cloudinary } from '../../config/cloudinary.js';
import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { applicationRepository } from '../../repositories/application.repository.js';
import { mediaRepository } from '../../repositories/media.repository.js';

export const resumeService = {
  async uploadResumeStream(
    userId: string,
    universityId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
  ) {
    // 1. Strict PDF Magic Bytes & MIME validation
    if (mimeType.toLowerCase() !== 'application/pdf') {
      throw ApiError.badRequest('Only PDF resume files are permitted.');
    }

    if (fileBuffer.length > 5 * 1024 * 1024) {
      throw ApiError.badRequest('Resume document must not exceed 5MB in size.');
    }

    // Verify PDF header magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
    const header = fileBuffer.subarray(0, 5).toString('ascii');
    if (!header.startsWith('%PDF-')) {
      throw ApiError.badRequest('Corrupted or invalid PDF file header.');
    }

    const folder = `alumni-connect/documents/resumes/${userId}`;
    const timestamp = Date.now();
    const publicId = `${folder}/resume_${timestamp}`;

    // Upload as private/authenticated asset
    const uploadResult = await new Promise<{ public_id: string; secure_url: string; bytes: number }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: 'raw',
          type: 'authenticated',
          overwrite: true,
          tags: ['resume', `user_${userId}`],
        },
        (error, result) => {
          if (error || !result) {
            return reject(error || new Error('Upload to Cloudinary failed.'));
          }
          resolve(result);
        },
      );
      stream.end(fileBuffer);
    });

    // Record in media asset repository
    await mediaRepository.create({
      userId,
      purpose: 'RESUME',
      mediaType: 'DOCUMENT',
      publicId: uploadResult.public_id,
      url: uploadResult.secure_url,
      secureUrl: uploadResult.secure_url,
      format: 'pdf',
      sizeBytes: uploadResult.bytes,
    });

    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'RESUME_UPLOADED',
      targetType: 'user',
      targetId: userId,
      metadata: { originalName, sizeBytes: uploadResult.bytes },
    });

    return {
      resumeKey: uploadResult.public_id,
      sizeBytes: uploadResult.bytes,
    };
  },

  async generateSignedResumeUrl(
    applicationId: string,
    userId: string,
    userRole: string,
    universityId: string,
  ) {
    const application = await applicationRepository.findById(applicationId);
    if (!application) {
      throw ApiError.notFound('Application');
    }

    const isApplicant = application.applicantId === userId;
    const isJobOwner = application.job?.postedById === userId;
    const isModeratorOrAdmin = userRole === 'MODERATOR' || userRole === 'SUPER_ADMIN';

    if (!isApplicant && !isJobOwner && !isModeratorOrAdmin) {
      throw ApiError.forbidden('You are not authorized to view this candidate resume.');
    }

    if (!application.resumeKey) {
      throw ApiError.notFound('No resume document attached to this application.');
    }

    // 5-minute time-limited signed URL
    const expiresInSeconds = 300;
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

    // Cloudinary private download URL for authenticated asset
    const signedUrl = cloudinary.utils.private_download_url(
      application.resumeKey,
      'pdf',
      {
        resource_type: 'raw',
        type: 'authenticated',
        expires_at: expiresAt,
        attachment: true,
      },
    );

    // Record audit trail
    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'RESUME_DOWNLOADED',
      targetType: 'job_application',
      targetId: applicationId,
      metadata: {
        applicantId: application.applicantId,
        jobId: application.jobId,
        authorizedRole: userRole,
      },
    });

    return {
      url: signedUrl,
      expiresInSeconds,
    };
  },
};
