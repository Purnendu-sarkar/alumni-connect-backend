import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';

import { ApiError } from '../errors/api-error.js';
import { userController } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { updateProfileSchema } from '../validators/user.schema.js';

const uploadDir = path.resolve(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    callback(null, uploadDir);
  },
  filename(req, file, callback) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const userId = req.auth?.userId ?? 'user';
    const sanitizedExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    callback(null, `${userId}-${Date.now()}${sanitizedExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter(_req, file, callback) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype.toLowerCase())) {
      return callback(
        ApiError.badRequest('Only JPEG, PNG, and WebP images up to 2MB are supported.'),
      );
    }
    return callback(null, true);
  },
});

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get('/me', userController.getMe);
userRouter.patch('/me', validate(updateProfileSchema), userController.updateMe);
userRouter.post('/me/avatar', upload.single('avatar'), userController.uploadAvatar);
userRouter.delete('/me/avatar', userController.removeAvatar);
