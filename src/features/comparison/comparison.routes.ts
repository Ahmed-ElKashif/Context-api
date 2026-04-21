import { Router } from 'express'
import { compareDocuments } from './comparison.controller'
import { protect } from '../../core/middlewares/auth.middleware'

const router = Router()

// 🛡️ All comparison routes require authentication
router.use(protect)

// 🔍 Conceptual Comparison Route
router.post('/compare', compareDocuments)

export default router
