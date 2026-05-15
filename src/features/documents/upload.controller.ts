import { Request, Response, NextFunction } from 'express'
import { UploadService } from './upload.service'
import { AppError } from '../../core/errors/AppError'

/**
 * @route POST /api/documents/upload
 * Handles both text snippets (Flow A) and batch physical file uploads (Flow B).
 * All business logic is delegated to UploadService.
 */
export const uploadData = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!._id
    const { title, fileType, extractedText, tags, clientPaths } = req.body || {}

    // ── Flow A: Text Snippets ─────────────────────────────────────────────────
    if (fileType === 'TextSnippet') {
      if (!extractedText) {
        return next(new AppError('extractedText is required for TextSnippets', 400))
      }

      const snippet = await UploadService.uploadTextSnippet(userId, { title, extractedText, tags })
      res.status(201).json({ success: true, count: 1, data: [snippet] })
      return
    }

    // ── Flow B: Batch Physical Files ──────────────────────────────────────────
    const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : [])

    if (!files || files.length === 0) {
      return next(new AppError('Please upload at least one valid file', 400))
    }

    const parsedPaths: string[] = clientPaths
      ? Array.isArray(clientPaths) ? clientPaths : [clientPaths]
      : []

    const { createdDocs, skippedFiles } = await UploadService.uploadPhysicalFiles(
      userId,
      files,
      tags,
      parsedPaths
    )

    if (createdDocs.length === 0) {
      res.status(409).json({
        success: false,
        message: 'All uploaded files were duplicates and were skipped.',
        skippedFiles
      })
      return
    }

    res.status(201).json({
      success: true,
      count: createdDocs.length,
      data: createdDocs,
      skippedCount: skippedFiles.length,
      skippedFiles
    })
  } catch (error) {
    next(error)
  }
}
