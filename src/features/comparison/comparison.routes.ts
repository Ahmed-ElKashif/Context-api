import { Router } from 'express'
import { compareDocuments } from './comparison.controller'
import { protect } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware' // 🛠️ NEW: Import Validator
import { compareDocumentsSchema } from './comparison.schema' // 🛠️ NEW: Import Schema

const router = Router()

// 🛡️ All comparison routes require authentication
router.use(protect)

// 🔍 Conceptual Comparison Route (Now Validated!)
router.post('/compare', validate(compareDocumentsSchema), compareDocuments)

export default router
