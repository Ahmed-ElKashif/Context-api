import { Router } from 'express'
import { validate } from '../../core/middlewares/validate.middleware'
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.schema'
import { register, login, forgotPassword, resetPassword } from './auth.controller'

const router = Router()

// Route: POST /api/auth/register
router.post('/register', validate(registerSchema), register)

// Route: POST /api/auth/login
router.post('/login', validate(loginSchema), login)

// Route: POST /api/auth/forgot-password
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword)

// Route: POST /api/auth/reset-password
router.post('/reset-password', validate(resetPasswordSchema), resetPassword)

export default router
