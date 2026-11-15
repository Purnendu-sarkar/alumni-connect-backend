import { Router } from 'express';
import multer from 'multer';

import { ApiError } from '../errors/api-error.js';
import { authController } from '../controllers/auth.controller.js';
import { userController } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { changePasswordSchema } from '../validators/auth.schema.js';
import { updateProfileSchema } from '../validators/user.schema.js';

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter(_req, file, callback) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype.toLowerCase())) {
      return callback(
        ApiError.badRequest('Only JPEG, PNG, and WebP images up to 5MB are supported.'),
      );
    }
    return callback(null, true);
  },
});

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get('/me', userController.getMe);
userRouter.patch('/me', validate(updateProfileSchema), userController.updateMe);
userRouter.post('/change-password', validate(changePasswordSchema), authController.changePassword);
userRouter.post('/me/avatar', upload.single('avatar'), userController.uploadAvatar);
userRouter.delete('/me/avatar', userController.removeAvatar);
