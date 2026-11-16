import { Router } from 'express';
import multer from 'multer';

import { ApiError } from '../errors/api-error.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { resumeService } from '../services/media/resume.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';

const storage = multer.memoryStorage();
const uploadResume = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter(_req, file, callback) {
    if (file.mimetype.toLowerCase() !== 'application/pdf') {
      return callback(ApiError.badRequest('Only PDF files are permitted for resumes.'));
    }
    return callback(null, true);
  },
});

export const uploadRouter = Router();

uploadRouter.use(authenticate);

uploadRouter.post(
  '/resume',
  uploadResume.single('file'),
  asyncHandler(async (request, response) => {
    if (!request.file) {
      throw ApiError.badRequest('A PDF resume document is required in "file" field.');
    }

    const result = await resumeService.uploadResumeStream(
      request.auth!.userId,
      request.auth!.universityId,
      request.file.buffer,
      request.file.originalname,
      request.file.mimetype,
    );

    return sendSuccess(response, {
      statusCode: 201,
      message: 'Resume document securely uploaded.',
      data: result,
    });
  }),
);
