import { Router } from 'express';
import { getUserProfile, updateUserProfile } from './user.controller';
import { requireAuth } from '../../core/middlewares/auth.middleware';

const router = Router();

// Notice how we attach requireAuth to protect these routes!
// We can chain the HTTP methods since they share the same URL path.
router
  .route('/profile')
  .get(requireAuth, getUserProfile)
  .put(requireAuth, updateUserProfile);

export default router;