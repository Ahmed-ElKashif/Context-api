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
    // 1. Ensure user is authenticated
    const userId = req.user?._id

    // 2. Pagination Setup
    // Fallbacks: default to page 1, limit to 10 items per page
    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 10
    const skip = (page - 1) * limit

    // 3. Sorting Setup
    // Default to newest first (createdAt, descending)
    const sortBy = (req.query.sortBy as string) || 'createdAt'
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1

    // 4. Filtering Setup (Security: ALWAYS restrict to the logged-in user's files!)
    const query: any = { user: userId }

    // Optional Filter: Tags
    // Example URL: /api/documents?tags=study,ai
    if (req.query.tags) {
      const tagsArray = (req.query.tags as string).split(',').map((tag) => tag.trim())
      // $in means: "Find documents where the tags array contains ANY of these tags"
      query.tags = { $in: tagsArray }
    }

    // Optional Filter: File Type
    // Example URL: /api/documents?fileType=PDF
    if (req.query.fileType) {
      query.fileType = req.query.fileType
    }

    // Optional Filter: Cognitive Load
    if (req.query.cognitiveLoad) {
      query.cognitiveLoad = req.query.cognitiveLoad
    }

    // 5. Execute Database Query
    const documents = await DocumentModel.find(query)
      .sort({ [sortBy]: sortOrder }) // Apply sorting dynamically
      .skip(skip) // Skip previous pages
      .limit(limit) // Limit items returned
      .select('-extractedText -__v') // SENIOR MOVE: Exclude heavy text to keep API fast!

    // 6. Get total count for frontend pagination UI
    const totalDocuments = await DocumentModel.countDocuments(query)

    // 7. Send standard JSON response
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
    const { title, tags, cognitiveLoad, folderId } = req.body

    // 1. Find the document and ensure it belongs to the current user
    const document = await DocumentModel.findOne({ _id: id, user: req.user?._id })

    if (!document) {
      return next(new AppError('Document not found or unauthorized', 404))
    }

    // 2. Update allowed fields
    if (title) document.title = title
    if (tags) document.tags = tags
    if (cognitiveLoad) document.cognitiveLoad = cognitiveLoad
    if (folderId) document.folderId = folderId

    await document.save()

    res.status(200).json({ success: true, data: document })
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

    // 1. Find the document and ensure it belongs to the current user
    const document = await DocumentModel.findOne({ _id: id, user: req.user?._id })

    if (!document) {
      return next(new AppError('Document not found or unauthorized', 404))
    }

    // 2. File System Cleanup: Delete the physical file from the hard drive if it exists
    if (document.originalFilePath) {
      const filePath = path.join(process.cwd(), document.originalFilePath)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath) // Removes the file from the uploads folder
      }
    }

    // 3. Remove the document record from the database
    await document.deleteOne()

    res.status(200).json({ success: true, message: 'Document deleted successfully' })
  } catch (error) {
    next(error)
  }
}