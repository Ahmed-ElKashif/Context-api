import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware' // 🛠️ NEW: Import Validator

import {
  askAISchema,
  generateSemanticStructureSchema,
  applySemanticFoldersSchema,
  chatHistoryParamsSchema
} from './ai.schema' // 🛠️ NEW: Import Schemas

import {
  askAI,
  generateSemanticStructure,
  applySemanticFolders,
  getDocumentChatHistory
} from './ai.controller'

const router = Router()

// Protect AI routes
router.use(protect)

// 💬 Chat Endpoints
router.post('/chat', validate(askAISchema), askAI)
router.get('/chat/:documentId', validate(chatHistoryParamsSchema), getDocumentChatHistory)

// 🧠 Organize Folders (Generate Proposal)
router.post(
  '/organize-folder',
  validate(generateSemanticStructureSchema),
  generateSemanticStructure
)

// 📁 Apply Folders (Physical DB updates)
router.put('/apply-folders', validate(applySemanticFoldersSchema), applySemanticFolders)

export default router
