import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware' // 🛠️ NEW: Zod Validation Middleware
import { upload } from '../../core/middlewares/upload.middleware'
import { uploadData } from './upload.controller'

// 🛠️ NEW: Import your Zod Schemas
import {
  searchDocumentSchema,
  updateDocumentSchema,
  bulkDeleteSchema,
  bulkUpdateSemanticSchema
} from './document.schema'

import {
  getAllDocuments,
  searchDocuments, // 🛠️ NEW: Don't forget your powerful search controller!
  updateDocument,
  deleteDocument,
  bulkUpdateSemanticPaths,
  bulkDeleteDocuments,
  getDocumentById,
  serveDocumentFile
} from './document.controller'

const router = Router()

// Protect all document routes so only logged-in users can access them
router.use(protect)

// ==========================================
// 🛡️ STATIC ROUTES (Must go BEFORE /:id)
// ==========================================

// Route: POST /api/documents/upload
// Upgraded to handle batch uploads! Expects an array of files under the key 'files' (max 10)
router.post('/upload', upload.array('files', 10), uploadData)

// Route: GET /api/documents
router.get('/', getAllDocuments)

// 🔍 Route: GET /api/documents/search
// Validates query parameters (q, page, limit)
router.get('/search', validate(searchDocumentSchema), searchDocuments)

// 📁 Route: PUT /api/documents/bulk/semantic-paths
// Validates the array of updates before hitting the DB
router.put('/bulk/semantic-paths', validate(bulkUpdateSemanticSchema), bulkUpdateSemanticPaths)

// 🗑️ Route: DELETE /api/documents/bulk
// Validates the array of IDs before attempting to delete
router.delete('/bulk', validate(bulkDeleteSchema), bulkDeleteDocuments)

// ==========================================
// 🔄 DYNAMIC ROUTES (/:id)
// ==========================================

// Route: GET /api/documents/:id
router.get('/:id', getDocumentById)

// Route: GET /api/documents/:id/file
router.get('/:id/file', serveDocumentFile)

// Route: PUT /api/documents/:id
// Validates the update body (title, tags, cognitiveLoad, etc.)
router.put('/:id', validate(updateDocumentSchema), updateDocument)

// Route: DELETE /api/documents/:id
router.delete('/:id', deleteDocument)

export default router
