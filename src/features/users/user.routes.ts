import { Router } from 'express'
import { getUserProfile, updateUserProfile } from './user.controller'
import { requireAuth } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware'
import { updateProfileSchema } from './user.schema'

const router = Router()

// Notice how we attach requireAuth to protect these routes!
// We can chain the HTTP methods since they share the same URL path.
router
  .route('/profile')
  .get(requireAuth, getUserProfile)
  .put(requireAuth, validate(updateProfileSchema), updateUserProfile)

export default router
