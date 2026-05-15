import { Router } from 'express'
import { compareDocuments } from './comparison.controller'
import { protect } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware'
import { checkTokenBudget } from '../../core/middlewares/token-budget.middleware'
import { aiLogger } from '../../core/middlewares/ai-logger.middleware'
import { compareDocumentsSchema } from './comparison.schema'

const router = Router()

// 🛡️ All comparison routes require authentication
router.use(protect)

// 🧠 Deep Comparison — DeepThinkerService (Groq 70B → 8B fallback)
router.post(
  '/compare',
  checkTokenBudget,
  aiLogger,
  validate(compareDocumentsSchema),
  compareDocuments
)

export default router
