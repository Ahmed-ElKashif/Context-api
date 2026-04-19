import { Request, Response, NextFunction } from 'express'
import fs from 'fs'
import path from 'path'
import Folder from './folder.model'
import { DocumentModel } from '../documents/document.model'
import mongoose from 'mongoose'

// Helper to standard responses (Assuming you have an AppError class, if not, standard throw works)
export const createFolder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, parentFolder } = req.body
    const userId = (req as any).user.id // Assuming auth.middleware attaches user

    // 1. Check if a folder with this name already exists in this specific location
    const existingFolder = await Folder.findOne({
      name,
      user: userId,
      parentFolder: parentFolder || null
    })

    if (existingFolder) {
      return res.status(400).json({ error: 'A folder with this name already exists here.' })
    }

    // 2. Build the breadcrumb path string
    let newPath = name
    if (parentFolder) {
      const parent = await Folder.findById(parentFolder)
      if (!parent) {
        return res.status(404).json({ error: 'Parent folder not found.' })
      }
      newPath = `${parent.path}/${name}`
    }

    // 3. Create the folder
    const folder = await Folder.create({
      name,
      user: userId,
      parentFolder: parentFolder || null,
      path: newPath
    })

    res.status(201).json({ success: true, data: folder })
  } catch (error) {
    next(error)
  }
}

export const getFolderContents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id
    const { folderId } = req.params

    const isRoot = !folderId || folderId === 'root'
    const targetFolderId = isRoot ? null : new mongoose.Types.ObjectId(folderId as string)

    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 10
    const skip = (page - 1) * limit

    const folders = await Folder.find({
      user: userId,
      parentFolder: targetFolderId
    }).sort({ name: 1 })

    const documents = await DocumentModel.find({
      user: userId,
      folder: targetFolderId
    })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)

    const totalDocuments = await DocumentModel.countDocuments({
      user: userId,
      folder: targetFolderId
    })

    let currentFolder = null
    let breadcrumbs: mongoose.Document[] = [] // 🛠️ NEW: Array of Parent Folders for the UI Header!

    if (!isRoot) {
      currentFolder = await Folder.findById(targetFolderId)

      if (currentFolder) {
        // Build the ancestor string paths (e.g., ["mock", "mock/My Files"])
        const pathParts = currentFolder.path.split('/')
        const ancestorPaths = []
        let cumulativePath = ''

        // Loop up to the second-to-last item (we don't need the current folder in the breadcrumb ancestors)
        for (let i = 0; i < pathParts.length - 1; i++) {
          cumulativePath = cumulativePath ? `${cumulativePath}/${pathParts[i]}` : pathParts[i]
          ancestorPaths.push(cumulativePath)
        }

        // Fetch all parent folders in one quick database trip
        if (ancestorPaths.length > 0) {
          const ancestors = await Folder.find({
            user: userId,
            path: { $in: ancestorPaths }
          })

          // Sort them by path length so they are in the correct top-down order
          breadcrumbs = ancestors.sort((a, b) => a.path.length - b.path.length)
        }
      }
    }

    res.status(200).json({
      success: true,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalDocuments / limit),
        totalItems: totalDocuments,
        limit
      },
      data: {
        currentFolder,
        breadcrumbs, // 🛠️ NEW: Added to the response payload!
        folders,
        documents
      }
    })
  } catch (error) {
    next(error)
  }
}

export const renameFolder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const { newName } = req.body
    const userId = (req as any).user.id

    const folder = await Folder.findOne({ _id: id, user: userId })
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found.' })
    }

    // Check for naming collisions in the same parent directory
    const collision = await Folder.findOne({
      name: newName,
      parentFolder: folder.parentFolder,
      user: userId
    })

    if (collision) {
      return res.status(400).json({ error: 'Name already in use in this destination.' })
    }

    // Update name and regenerate the path string
    const oldName = folder.name
    folder.name = newName
    folder.path = folder.path.replace(new RegExp(`${oldName}$`), newName)

    await folder.save()

    // Note: In a massive enterprise app, renaming a parent folder would require a background
    // worker to update the `path` string of all deeply nested child folders. For MVP, this is fine!

    res.status(200).json({ success: true, data: folder })
  } catch (error) {
    next(error)
  }
}

export const deleteFolder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const userId = (req as any).user.id

    const targetFolder = await Folder.findOne({ _id: id, user: userId })
    if (!targetFolder) {
      return res.status(404).json({ error: 'Folder not found.' })
    }

    // 1. Find the folder AND all sub-folders nested inside it
    // Escaping regex chars just in case the folder name has a weird symbol
    const escapedPath = targetFolder.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const folderQuery = {
      user: userId,
      path: { $regex: `^${escapedPath}(/|$)` }
    }

    const foldersToDelete = await Folder.find(folderQuery)
    const folderIdsToDelete = foldersToDelete.map((f) => f._id)

    // 2. Find all documents that live inside ANY of these folders
    const documentsToDelete = await DocumentModel.find({
      user: userId,
      folder: { $in: folderIdsToDelete }
    })

    // 3. Clean up the physical hard drive (Wipe the actual files)
    for (const doc of documentsToDelete) {
      if (doc.originalFilePath) {
        const filePath = path.join(process.cwd(), doc.originalFilePath)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      }
    }

    // 4. Wipe them from the database in two clean, massive sweeps!
    await DocumentModel.deleteMany({ user: userId, folder: { $in: folderIdsToDelete } })
    await Folder.deleteMany({ user: userId, _id: { $in: folderIdsToDelete } })

    res.status(200).json({
      success: true,
      message: `Nuked! Deleted folder, ${foldersToDelete.length - 1} sub-folders, and ${documentsToDelete.length} files.`
    })
  } catch (error) {
    next(error)
  }
}

export const getFolderTree = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id

    // Fetch all folders, sorted alphabetically by path to make rendering the tree easy
    const allFolders = await Folder.find({ user: userId }).sort({ path: 1 })

    res.status(200).json({
      success: true,
      data: allFolders
    })
  } catch (error) {
    next(error)
  }
}
