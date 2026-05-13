import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware' // 🛠️ NEW: Import Validator
import { synthesizeDocuments } from './ai.controller'
import {
  askAISchema,
  generateSemanticStructureSchema,
  applySemanticFoldersSchema,
  chatHistoryParamsSchema,
  semanticSearchSchema, // 🛠️ NEW
  synthesizeDocumentsSchema
} from './ai.schema' // 🛠️ NEW: Import Schemas

import {
  askAI,
  generateSemanticStructure,
  applySemanticFolders,
  getDocumentChatHistory,
  searchDocuments
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

// 🔍 Semantic Search Endpoint
router.get('/search', validate(semanticSearchSchema), searchDocuments)

// 🧠 Bulk Synthesis (Combine multiple documents)
router.post('/synthesize', validate(synthesizeDocumentsSchema), synthesizeDocuments)

export default router
