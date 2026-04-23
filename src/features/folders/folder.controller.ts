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
    
    // 🔍 Extract search and tags from the query string
    const search = req.query.search as string;
    const tags = req.query.tags as string;

    // --- 🛠️ THE FIX: BUILD A DYNAMIC QUERY ---
    let docQuery: any = { user: userId };

    // If we are NOT searching globally, restrict files to the current folder
    if (!search && !tags) {
      docQuery.folder = targetFolderId;
    }

    // If there is a search term, use Regex to match the title or tags (case-insensitive)
    if (search) {
      docQuery.$or = [
        { title: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    // If a tag filter is active, require that tag
    if (tags) {
      docQuery.tags = tags;
    }

    // 1. Fetch Folders (We only need to fetch folders if we aren't searching)
    let folders: mongoose.Document[] = [];
    if (!search && !tags) {
      folders = await Folder.find({
        user: userId,
        parentFolder: targetFolderId
      }).sort({ name: 1 })
    }

    // 2. Fetch Documents (Using our new dynamic docQuery!)
    const documents = await DocumentModel.find(docQuery)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)

    // 3. Count total documents for pagination
    const totalDocuments = await DocumentModel.countDocuments(docQuery)

    // 4. Build Breadcrumbs
    let currentFolder = null
    let breadcrumbs: mongoose.Document[] = [] 

    if (!isRoot) {
      currentFolder = await Folder.findById(targetFolderId)

      if (currentFolder) {
        const pathParts = currentFolder.path.split('/')
        const ancestorPaths = []
        let cumulativePath = ''

        for (let i = 0; i < pathParts.length - 1; i++) {
          cumulativePath = cumulativePath ? `${cumulativePath}/${pathParts[i]}` : pathParts[i]
          ancestorPaths.push(cumulativePath)
        }

        if (ancestorPaths.length > 0) {
          const ancestors = await Folder.find({
            user: userId,
            path: { $in: ancestorPaths }
          })
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
        breadcrumbs, 
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

    const collision = await Folder.findOne({
      name: newName,
      parentFolder: folder.parentFolder,
      user: userId
    })

    if (collision) {
      return res.status(400).json({ error: 'Name already in use in this destination.' })
    }

    const oldName = folder.name
    folder.name = newName
    folder.path = folder.path.replace(new RegExp(`${oldName}$`), newName)

    await folder.save()

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

    const escapedPath = targetFolder.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const folderQuery = {
      user: userId,
      path: { $regex: `^${escapedPath}(/|$)` }
    }

    const foldersToDelete = await Folder.find(folderQuery)
    const folderIdsToDelete = foldersToDelete.map((f) => f._id)

    const documentsToDelete = await DocumentModel.find({
      user: userId,
      folder: { $in: folderIdsToDelete }
    })

    for (const doc of documentsToDelete) {
      if (doc.originalFilePath) {
        const filePath = path.join(process.cwd(), doc.originalFilePath)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      }
    }

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
    const allFolders = await Folder.find({ user: userId }).sort({ path: 1 })

    res.status(200).json({
      success: true,
      data: allFolders
    })
  } catch (error) {
    next(error)
  }
}