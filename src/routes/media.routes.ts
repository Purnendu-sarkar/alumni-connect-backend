import { Router } from 'express';
import multer from 'multer';

import { ApiError } from '../errors/api-error.js';
import { mediaController } from '../controllers/media.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { confirmMediaSchema, signMediaSchema } from '../validators/media.validator.js';

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for direct memory stream
  fileFilter(_req, file, callback) {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm',
      'application/pdf',
    ];
    if (!allowed.includes(file.mimetype.toLowerCase())) {
      return callback(
        ApiError.badRequest('Unsupported file type. Please upload a valid image, video, or PDF document.'),
      );
    }
    return callback(null, true);
  },
});

export const mediaRouter = Router();

mediaRouter.use(authenticate);

mediaRouter.post('/upload', upload.single('file'), mediaController.uploadStream);
mediaRouter.post('/signature', validate(signMediaSchema), mediaController.getSignParameters);
mediaRouter.post('/confirm', validate(confirmMediaSchema), mediaController.confirmDirectUpload);
mediaRouter.delete('/:publicId', mediaController.deleteMedia);
