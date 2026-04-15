import { Router } from 'express'
import { requireAuth } from '../../core/middlewares/auth.middleware'
import { upload } from '../../core/middlewares/upload.middleware'
import { uploadData } from './upload.controller'
import {
  getAllDocuments,
  updateDocument,
  deleteDocument,
  bulkUpdateSemanticPaths
} from './document.controller'

const router = Router()

// Protect all document routes so only logged-in users can access them
router.use(requireAuth)

// Route: POST /api/documents/upload
// Upgraded to handle batch uploads! Expects an array of files under the key 'files' (max 50)
router.post('/upload', upload.array('files', 10), uploadData)

// Route: GET /api/documents
router.get('/', getAllDocuments)

// @route   PUT /api/documents/bulk/semantic-paths
// @desc    Bulk update multiple documents with AI-generated nested folder paths.
//          Triggered when the user clicks "Accept Organization" in the UI.
// @access  Private
router.put('/bulk/semantic-paths', bulkUpdateSemanticPaths)
// Route: PUT /api/documents/:id
// Route: DELETE /api/documents/:id
router.route('/:id').put(updateDocument).delete(deleteDocument)

export default router
