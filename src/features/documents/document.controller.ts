import { Request, Response, NextFunction } from 'express'
import { DocumentModel } from './document.model'
import { AppError } from '../../core/errors/AppError'
import fs from 'fs'
import path from 'path'

// @route   GET /api/documents
// @access  Private
export const getAllDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id

    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 10
    const skip = (page - 1) * limit

    const sortBy = (req.query.sortBy as string) || 'createdAt'
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1

    const query: any = { user: userId }

    if (req.query.tags) {
      const tagsArray = (req.query.tags as string).split(',').map((tag) => tag.trim())
      query.tags = { $in: tagsArray }
    }

    if (req.query.fileType) {
      query.fileType = req.query.fileType
    }

    if (req.query.cognitiveLoad) {
      query.cognitiveLoad = req.query.cognitiveLoad
    }

    // AI Semantic Folder Filter
    if (req.query.semanticPath) {
      query.semanticPath = req.query.semanticPath
    }

    // --- NEW: Physical Client Folder Filter (The TRUE VS Code Style) ---
    if (req.query.originalClientPath) {
      // 1. Clean the string: Remove any accidental leading or trailing slashes from the frontend
      const folderName = (req.query.originalClientPath as string).replace(/^\/+|\/+$/g, '')

      // 2. Escape any weird characters in the folder name
      const escapedFolder = folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      // 3. THE FIX: ^/? means "Start with an OPTIONAL slash".
      // Then match the folder, a slash, and ONLY a filename (no more slashes allowed)
      query.originalClientPath = {
        $regex: `^/?${escapedFolder}/[^/]+$`,
        $options: 'i'
      }
    }

    const documents = await DocumentModel.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .select('-extractedText -__v')

    const totalDocuments = await DocumentModel.countDocuments(query)

    res.status(200).json({
      success: true,
      count: documents.length,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalDocuments / limit),
        totalItems: totalDocuments,
        limit
      },
      data: documents
    })
  } catch (error) {
    next(error)
  }
}

// @route   PUT /api/documents/:id
// @access  Private
export const updateDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params
    // REMOVED folderId, ADDED semanticPath & originalClientPath
    const { title, tags, cognitiveLoad, semanticPath, originalClientPath } = req.body

    const document = await DocumentModel.findOne({ _id: id, user: req.user?._id })

    if (!document) {
      return next(new AppError('Document not found or unauthorized', 404))
    }

    if (title) document.title = title
    if (tags) document.tags = tags
    if (cognitiveLoad) document.cognitiveLoad = cognitiveLoad
    if (semanticPath) document.semanticPath = semanticPath
    if (originalClientPath) document.originalClientPath = originalClientPath

    await document.save()

    res.status(200).json({ success: true, data: document })
  } catch (error) {
    next(error)
  }
}

// NEW: @route   PUT /api/documents/bulk/semantic-paths
// NEW: @access  Private
// Description: Blazing fast bulk update for when the user clicks "Accept Organization"
export const bulkUpdateSemanticPaths = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id
    // Expects an array like: [{ documentId: "123", newPath: "Work/Invoices" }, ...]
    const { updates } = req.body

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return next(new AppError('Please provide an array of path updates', 400))
    }

    // Build the bulk operations array for MongoDB
    const bulkOps = updates.map((update) => ({
      updateOne: {
        filter: { _id: update.documentId, user: userId }, // Ensure they only update THEIR files
        update: { $set: { semanticPath: update.newPath } }
      }
    }))

    // Execute all updates in a single database trip
    const result = await DocumentModel.bulkWrite(bulkOps)

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} documents successfully routed to semantic folders.`
    })
  } catch (error) {
    next(error)
  }
}

// @route   DELETE /api/documents/:id
// @access  Private
export const deleteDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params

    const document = await DocumentModel.findOne({ _id: id, user: req.user?._id })

    if (!document) {
      return next(new AppError('Document not found or unauthorized', 404))
    }

    if (document.originalFilePath) {
      const filePath = path.join(process.cwd(), document.originalFilePath)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    }

    await document.deleteOne()

    res.status(200).json({ success: true, message: 'Document deleted successfully' })
  } catch (error) {
    next(error)
  }
}

// NEW: @route   DELETE /api/documents/folder
// NEW: @access  Private
// Description: Bulk delete all files inside a specific client folder path
export const deleteFolder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { folderPath } = req.body
    if (!folderPath) return next(new AppError('Folder path is required', 400))

    // Escape and build the regex exactly like we did for the fetch controller
    const escapedFolder = folderPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const query = {
      user: req.user?._id,
      originalClientPath: { $regex: `^/?${escapedFolder}(/|$)`, $options: 'i' }
    }

    // Find them first so we can delete the physical files off the server
    const documents = await DocumentModel.find(query)

    for (const doc of documents) {
      if (doc.originalFilePath) {
        const filePath = path.join(process.cwd(), doc.originalFilePath)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      }
    }

    // Now delete them from MongoDB
    const result = await DocumentModel.deleteMany(query)

    res
      .status(200)
      .json({ success: true, message: `Deleted ${result.deletedCount} files from folder.` })
  } catch (error) {
    next(error)
  }
}

// NEW: @route   PUT /api/documents/folder/rename
// NEW: @access  Private
// Description: Bulk rename the path for all files inside a specific folder
export const renameFolder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { oldPath, newName } = req.body
    if (!oldPath || !newName) return next(new AppError('Old path and new name are required', 400))

    const escapedFolder = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const query = {
      user: req.user?._id,
      originalClientPath: { $regex: `^/?${escapedFolder}(/|$)`, $options: 'i' }
    }

    const documents = await DocumentModel.find(query)

    // Loop through and string-replace the old folder name with the new one
    // Example: "Work/Invoices" -> "Home/Invoices"
    for (const doc of documents) {
      if (doc.originalClientPath) {
        // Find the exact oldPath segment and replace it
        doc.originalClientPath = doc.originalClientPath.replace(
          oldPath,
          oldPath.replace(/[^/]+$/, newName)
        )
        await doc.save()
      }
    }

    res.status(200).json({ success: true, message: `Renamed ${documents.length} files.` })
  } catch (error) {
    next(error)
  }
}

// NEW: @route   DELETE /api/documents/bulk
// NEW: @access  Private
// Description: Bulk delete multiple documents by their IDs
export const bulkDeleteDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { ids } = req.body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return next(new AppError('Please provide an array of document IDs to delete', 400))
    }

    const query = {
      _id: { $in: ids }, // Match any ID in the array
      user: req.user?._id // Security: Ensure they only delete their own files
    }

    // 1. Find them first so we can delete the physical files off the server
    const documents = await DocumentModel.find(query)

    for (const doc of documents) {
      if (doc.originalFilePath) {
        const filePath = path.join(process.cwd(), doc.originalFilePath)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      }
    }

    // 2. Now delete them all from MongoDB in a single operation
    const result = await DocumentModel.deleteMany(query)

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} documents.`
    })
  } catch (error) {
    next(error)
  }
}
