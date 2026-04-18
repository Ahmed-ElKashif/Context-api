import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware' 
import { upload } from '../../core/middlewares/upload.middleware'
import { uploadData } from './upload.controller'
import {
  getAllDocuments,
  updateDocument,
  deleteDocument,
  bulkUpdateSemanticPaths,
  deleteFolder, // Note: You might move these to your new folder controller later!
  renameFolder, 
  bulkDeleteDocuments
} from './document.controller'

const router = Router()

// Protect all document routes so only logged-in users can access them
router.use(protect) // 🛠️ THE FIX: Updated name

// Route: POST /api/documents/upload
// Upgraded to handle batch uploads! Expects an array of files under the key 'files' (max 10)
router.post('/upload', upload.array('files', 10), uploadData)

// Route: GET /api/documents
router.get('/', getAllDocuments)

// @route   PUT /api/documents/bulk/semantic-paths
// @desc    Bulk update multiple documents with AI-generated nested folder paths.
//          Triggered when the user clicks "Accept Organization" in the UI.
// @access  Private
router.put('/bulk/semantic-paths', bulkUpdateSemanticPaths)

// --- NEW: FOLDER BULK ACTIONS ---
// IMPORTANT: These must come BEFORE the /:id routes so Express doesn't think "folder" is an ID!
router.delete('/bulk', bulkDeleteDocuments) 
router.delete('/folder', deleteFolder)
router.put('/folder/rename', renameFolder)

// Route: PUT /api/documents/:id
// Route: DELETE /api/documents/:id
router.route('/:id').put(updateDocument).delete(deleteDocument)

export default router