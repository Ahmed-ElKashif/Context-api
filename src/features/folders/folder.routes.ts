import { Router } from 'express'
import {
  createFolder,
  getFolderContents,
  renameFolder,
  deleteFolder,
  getFolderTree // 🛠️ Make sure this is imported!
} from './folder.controller'
import { protect } from '../../core/middlewares/auth.middleware'

const router = Router()

// 🛡️ Apply authentication to all folder routes
router.use(protect)

// 📁 Base routes
router.post('/', createFolder)

// 🌳 Global Tree (MUST GO BEFORE /:folderId)
router.get('/tree', getFolderTree)

// 🔍 Fetching
router.get('/', getFolderContents) // Fetches the Root directory
router.get('/:folderId', getFolderContents) // Fetches a specific Sub-folder

// ✏️ Updates & Deletions
router.put('/:id/rename', renameFolder)
router.delete('/:id', deleteFolder)

export default router
