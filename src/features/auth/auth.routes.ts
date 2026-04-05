import { Router } from 'express'
import { validate } from '../../core/middlewares/validate.middleware'
import { registerSchema, loginSchema } from './auth.schema'
import { register, login } from './auth.controller'

const router = Router()

// Route: POST /api/auth/register
router.post('/register', validate(registerSchema), register)

// Route: POST /api/auth/login
router.post('/login', validate(loginSchema), login)

export default router
