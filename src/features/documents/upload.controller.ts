import { Request, Response, NextFunction } from 'express'
import { DocumentModel, DocumentType } from './document.model'
import { AppError } from '../../core/errors/AppError'
import Folder, { IFolder } from '../folders/folder.model'
import { configureCloudinary } from '../../config/cloudinary'
import streamifier from 'streamifier'

// Ensure Cloudinary is configured
const cloudinary = configureCloudinary()

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map a MIME type to your DocumentType enum value.
 */
const getFileTypeFromMime = (mimeType: string): DocumentType => {
  if (mimeType.includes('pdf')) return 'PDF'
  if (mimeType.includes('word') || mimeType.includes('officedocument')) return 'Word'
  if (mimeType.includes('image')) return 'Image'
  return 'TextSnippet' // Fallback
}

/**
 * Map a DocumentType to the Cloudinary sub-folder name.
 *
 * Cloudinary folder structure:
 *   documents/
 *     ├── pdf/
 *     ├── images/
 *     ├── word/
 *     └── other/
 */
const getCloudinaryFolder = (docType: DocumentType): string => {
  switch (docType) {
    case 'PDF':   return 'documents/pdf'
    case 'Image': return 'documents/images'
    case 'Word':  return 'documents/word'
    default:      return 'documents/other'
  }
}

/**
 * Upload a file buffer to Cloudinary and resolve with the upload result.
 * Uses the upload_stream API so nothing is written to disk.
 */
const uploadBufferToCloudinary = (
  buffer: Buffer,
  folder: string,
  originalName: string
): Promise<{ secure_url: string; public_id: string }> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        // Use the original filename (without extension) as the public_id so it
        // stays human-readable in the Cloudinary Media Library.
        public_id: `${Date.now()}-${originalName.replace(/\.[^/.]+$/, '')}`,
        resource_type: 'auto', // handles PDFs, images, and raw files automatically
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'))
        resolve({ secure_url: result.secure_url, public_id: result.public_id })
      }
    )

    // Pipe the in-memory buffer into the Cloudinary upload stream
    streamifier.createReadStream(buffer).pipe(uploadStream)
  })
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const uploadData = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { title, fileType, extractedText, tags, clientPaths } = req.body

    // ── FLOW A: Text Snippets (no physical file) ─────────────────────────────
    if (fileType === 'TextSnippet') {
      if (!extractedText) {
        return next(new AppError('extractedText is required for TextSnippets', 400))
      }

      const snippet = await DocumentModel.create({
        user: userId,
        title: title || `Snippet: ${extractedText.substring(0, 20)}...`,
        fileType,
        aiStatus: 'Analyzed',
        cognitiveLoad: 'Light',
        extractedText,
        tags: tags ? JSON.parse(tags) : [],
        originalClientPath: '/',
        semanticPath: '/',
        folder: null,
      })

      res.status(201).json({ success: true, count: 1, data: [snippet] })
      return
    }

    // ── FLOW B: Batch Physical Files ─────────────────────────────────────────
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return next(new AppError('Please upload at least one valid file', 400))
    }

    let parsedPaths: string[] = []
    if (clientPaths) {
      parsedPaths = Array.isArray(clientPaths) ? clientPaths : [clientPaths]
    }

    // In-memory cache: prevents creating the same folder N times when N files
    // share the same parent directory in a single upload batch.
    const folderCache = new Map<string, any>()
    const docsToInsert: any[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // ── Cognitive-load heuristic ────────────────────────────────────────
      const fileSizeMB = file.size / (1024 * 1024)
      let load: 'Light' | 'Medium' | 'Heavy' = 'Medium'
      if (fileSizeMB < 2) load = 'Light'
      if (fileSizeMB > 5) load = 'Heavy'

      const inferredType = getFileTypeFromMime(file.mimetype)
      const originalPath = parsedPaths[i] || `/${file.originalname}`

      // ── Upload to Cloudinary (type-based folder) ────────────────────────
      const cloudinaryFolder = getCloudinaryFolder(inferredType)
      const { secure_url, public_id } = await uploadBufferToCloudinary(
        file.buffer,
        cloudinaryFolder,
        file.originalname
      )

      // ── Resolve or create the virtual MongoDB Folder tree ───────────────
      const pathParts = originalPath.split('/').filter((p) => p.trim() !== '')

      // Strip the filename from the path — we only want the directory parts
      if (pathParts.length > 0 && pathParts[pathParts.length - 1] === file.originalname) {
        pathParts.pop()
      }

      let currentParentId = null
      let accumulatedPath = ''

      if (pathParts.length > 0) {
        const folderPathKey = pathParts.join('/')

        if (folderCache.has(folderPathKey)) {
          currentParentId = folderCache.get(folderPathKey)
        } else {
          for (const part of pathParts) {
            accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part

            let folder: IFolder | null = await Folder.findOne({
              name: part,
              user: userId,
              parentFolder: currentParentId,
            })

            if (!folder) {
              folder = await Folder.create({
                name: part,
                user: userId,
                parentFolder: currentParentId,
                path: accumulatedPath,
              })
            }

            currentParentId = folder._id
          }

          folderCache.set(folderPathKey, currentParentId)
        }
      }

      // ── Build the document record ────────────────────────────────────────
      docsToInsert.push({
        user: userId,
        title: file.originalname,
        fileType: inferredType,
        aiStatus: 'Pending',
        cognitiveLoad: load,
        // ☁️ Cloudinary references (replaces local originalFilePath)
        cloudinaryUrl: secure_url,
        cloudinaryPublicId: public_id,
        originalClientPath: originalPath,
        semanticPath: '/',
        folder: currentParentId,
        tags: tags ? JSON.parse(tags) : [],
      })
    }

    // Bulk-insert all documents in one DB round-trip
    const createdDocs = await DocumentModel.insertMany(docsToInsert)

    res.status(201).json({ success: true, count: createdDocs.length, data: createdDocs })
  } catch (error) {
    next(error)
  }
}