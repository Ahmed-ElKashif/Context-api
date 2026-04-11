import { Router } from 'express'
import { requireAuth } from '../../core/middlewares/auth.middleware'
import { askAI, compareDocuments } from './ai.controller'

const router = Router()

// Protect AI routes
router.use(requireAuth)

// Endpoints
router.post('/chat', askAI)
router.post('/compare', compareDocuments)

export default router