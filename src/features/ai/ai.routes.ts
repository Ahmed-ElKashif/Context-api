import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware'
import { synthesizeDocuments } from './ai.controller'
import {
  generateSemanticStructureSchema,
  applySemanticFoldersSchema,
  semanticSearchSchema,
  synthesizeDocumentsSchema
} from './ai.schema'

import { generateSemanticStructure, applySemanticFolders, searchDocuments } from './ai.controller'

const router = Router()

// Protect AI routes
router.use(protect)

// ==========================================
// 🧠 GLOBAL AI ACTIONS (No single document focus)
// ==========================================

// 🧠 Organize Folders (Generate Proposal)
router.post(
  '/organize-folder',
  validate(generateSemanticStructureSchema),
  generateSemanticStructure
)

// 📁 Apply Folders (Physical DB updates)
router.put('/apply-folders', validate(applySemanticFoldersSchema), applySemanticFolders)

// 🔍 Semantic Search Endpoint (Global vector search)
router.get('/search', validate(semanticSearchSchema), searchDocuments)

// 🧠 Bulk Synthesis (Combine multiple documents)
router.post('/synthesize', validate(synthesizeDocumentsSchema), synthesizeDocuments)

export default router
