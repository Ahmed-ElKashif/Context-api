import { Router } from 'express'
import { requireAuth } from '../../core/middlewares/auth.middleware'
import { askAI, compareDocuments, generateSemanticStructure } from './ai.controller'

const router = Router()

// Protect AI routes
router.use(requireAuth)

// Endpoints
router.post('/chat', askAI)
router.post('/compare', compareDocuments)

// NEW: Endpoint for the Before & After Smart Folder Feature
router.post('/organize-folder', generateSemanticStructure)

export default router
