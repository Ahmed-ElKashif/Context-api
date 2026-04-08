import { Router } from 'express'
import { requireAuth } from '../../core/middlewares/auth.middleware'
import { upload } from '../../core/middlewares/upload.middleware'
import { uploadData } from './upload.controller'
import { getAllDocuments } from './document.controller'

const router = Router()

// Protect all document routes so only logged-in users can upload
router.use(requireAuth)

// Route: POST /api/documents/upload
// The upload.single('file') middleware intercepts FormData where the key is 'file'
router.post('/upload', upload.single('file'), uploadData)

// Route: GET /api/documents
router.get('/', getAllDocuments)
export default router