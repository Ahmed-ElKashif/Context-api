import { Router } from 'express'
import { register, login } from './auth.controller'

const router = Router()

// Route: POST /api/auth/register
router.post('/register', register)

// Route: POST /api/auth/login
router.post('/login', login)

export default router
