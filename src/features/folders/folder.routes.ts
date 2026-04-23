import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware' // 🛠️ NEW: Zod Validator

import { createFolderSchema, updateFolderSchema } from './folder.schema' // 🛠️ NEW: Import Schemas

import {
  createFolder,
  getFolderContents,
  renameFolder,
  deleteFolder,
  getFolderTree
} from './folder.controller'

const router = Router()

// 🛡️ Apply authentication to all folder routes
router.use(protect)

// ==========================================
// 🛡️ STATIC ROUTES (Must go BEFORE /:id)
// ==========================================

// 📁 Create a folder (Validated)
router.post('/', validate(createFolderSchema), createFolder)

// 🌳 Global Tree
router.get('/tree', getFolderTree)

// 🔍 Fetch Root directory
router.get('/', getFolderContents)

// ==========================================
// 🔄 DYNAMIC ROUTES (/:id or /:folderId)
// ==========================================

// ✏️ Rename a folder (Validated)
router.put('/:id/rename', validate(updateFolderSchema), renameFolder)

// 🗑️ Delete a folder
router.delete('/:id', deleteFolder)

// 🔍 Fetch a specific Sub-folder
router.get('/:folderId', getFolderContents)

export default router
