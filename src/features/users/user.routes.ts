import { Router } from 'express'
import { getUserProfile, updateUserProfile } from './user.controller'
import { protect } from '../../core/middlewares/auth.middleware' // 🛠️ THE FIX: Updated name
import { validate } from '../../core/middlewares/validate.middleware'
import { updateProfileSchema } from './user.schema'

const router = Router()

// Notice how we attach protect to secure these routes!
// We can chain the HTTP methods since they share the same URL path.
router
  .route('/profile')
  .get(protect, getUserProfile) // 🛠️ THE FIX: Updated name
  .put(protect, validate(updateProfileSchema), updateUserProfile) // 🛠️ THE FIX: Updated name

export default router