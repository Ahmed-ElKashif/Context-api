import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import {
  askAI,
  compareDocuments,
  generateSemanticStructure,
  applySemanticFolders, // 🛠️ NEW: Import our final boss controller!
  getDocumentChatHistory // 🛠️ NEW IMPORT
} from './ai.controller'

const router = Router()

// Protect AI routes
router.use(protect) // 🛠️ THE FIX: Updated name

// Endpoints
router.post('/chat', askAI)
router.get('/chat/:documentId', getDocumentChatHistory) // 🛠️ NEW ROUTE
router.post('/compare', compareDocuments)

// Endpoint for the Before & After Smart Folder Feature (Generates the Proposal)
router.post('/organize-folder', generateSemanticStructure)

// 🛠️ NEW: Endpoint to physically create the folders in MongoDB and apply them!
router.put('/apply-folders', applySemanticFolders)

export default router
