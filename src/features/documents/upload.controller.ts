import { Request, Response, NextFunction } from 'express'
import { DocumentModel } from './document.model'
import { AppError } from '../../core/errors/AppError'

export const uploadData = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Get the user ID from the protected route middleware
    const userId = req.user?._id
    const { title, fileType, extractedText, tags } = req.body

    if (!fileType) {
      return next(new AppError('Please provide a fileType (PDF, Word, Image, TextSnippet)', 400))
    }

    // --- FLOW A: Text Snippets (No physical file, just raw text) ---
    if (fileType === 'TextSnippet') {
      if (!extractedText) {
        return next(new AppError('extractedText is required for TextSnippets', 400))
      }

      const snippet = await DocumentModel.create({
        user: userId,
        title: title || `Snippet: ${extractedText.substring(0, 20)}...`,
        fileType,
        aiStatus: 'Analyzed', // Already text, no OCR needed!
        cognitiveLoad: 'Light',
        extractedText,
        tags: tags ? JSON.parse(tags) : []
      })

      res.status(201).json({ success: true, data: snippet })
      return
    }

    // --- FLOW B: Physical Files (PDFs & Images caught by Multer) ---
    if (!req.file) {
      return next(new AppError('Please upload a valid file for this fileType', 400))
    }

    // Estimate Cognitive Load based on file size (MVP Logic)
    const fileSizeMB = req.file.size / (1024 * 1024)
    let load: 'Light' | 'Medium' | 'Heavy' = 'Medium'
    if (fileSizeMB < 2) load = 'Light'
    if (fileSizeMB > 5) load = 'Heavy'

    // Create the document in MongoDB with the file path
    const doc = await DocumentModel.create({
      user: userId,
      title: title || req.file.originalname,
      fileType,
      aiStatus: 'Pending', // Status is Pending until the AI pipeline runs
      cognitiveLoad: load,
      originalFilePath: `/uploads/${req.file.filename}`, // Save the relative path
      tags: tags ? JSON.parse(tags) : []
    })

    res.status(201).json({ success: true, data: doc })
  } catch (error) {
    next(error)
  }
}