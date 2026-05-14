import { Request, Response, NextFunction } from 'express'
import { DocumentModel, DocumentType } from './document.model'
import { AppError } from '../../core/errors/AppError'
import Folder, { IFolder } from '../folders/folder.model'
import { configureCloudinary } from '../../config/cloudinary'
import streamifier from 'streamifier'
import { AIService } from '../ai/ai.service'
import crypto from 'crypto'

const cloudinary = configureCloudinary()

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getFileTypeFromMime = (mimeType: string): DocumentType => {
  if (mimeType.includes('pdf')) return 'PDF'
  if (mimeType.includes('word') || mimeType.includes('officedocument')) return 'Word'
  if (mimeType.includes('image')) return 'Image'
  return 'TextSnippet'
}

const getCloudinaryFolder = (docType: DocumentType): string => {
  switch (docType) {
    case 'PDF':
      return 'documents/pdf'
    case 'Image':
      return 'documents/images'
    case 'Word':
      return 'documents/word'
    default:
      return 'documents/other'
  }
}

const uploadBufferToCloudinary = (
  buffer: Buffer,
  folder: string,
  originalName: string,
  mimeType: string
): Promise<{ secure_url: string; public_id: string }> => {
  return new Promise((resolve, reject) => {
    // Determine whether this is a raw (binary) file such as a Word document.
    // For raw resources, Cloudinary does NOT automatically append the extension
    // to the URL, so we must include it in the public_id ourselves.
    const isRaw =
      mimeType.includes('word') ||
      mimeType.includes('officedocument') ||
      mimeType.includes('octet-stream')

    const resourceType: 'raw' | 'image' | 'video' | 'auto' = isRaw ? 'raw' : 'auto'

    // Keep the full original filename (including extension) as the public_id.
    // This ensures the Cloudinary URL ends with the correct extension (e.g. .docx).
    const publicId = `${Date.now()}-${originalName}`

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        use_filename: false, // we are setting public_id manually
        unique_filename: false // timestamp prefix already guarantees uniqueness
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'))
        resolve({ secure_url: result.secure_url, public_id: result.public_id })
      }
    )
    streamifier.createReadStream(buffer).pipe(uploadStream)
  })
}

// ─── Windows-style duplicate title helpers ────────────────────────────────────

const splitExtension = (filename: string): [string, string] => {
  const dotIdx = filename.lastIndexOf('.')
  if (dotIdx <= 0) return [filename, '']
  return [filename.slice(0, dotIdx), filename.slice(dotIdx)]
}

const loadFolderTitles = async (
  userId: string,
  folderId: string | null,
  cache: Map<string, Set<string>>
): Promise<Set<string>> => {
  const folderKey = folderId ? String(folderId) : 'root'
  if (cache.has(folderKey)) return cache.get(folderKey)!

  const existing = await DocumentModel.find({ user: userId, folder: folderId }).select('title')
  const titles = new Set<string>(existing.map((d: any) => d.title.toLowerCase()))
  cache.set(folderKey, titles)
  return titles
}

const resolveUniqueTitle = (filename: string, takenTitles: Set<string>): string => {
  if (!takenTitles.has(filename.toLowerCase())) return filename

  const [base, ext] = splitExtension(filename)
  const baseMatch = base.match(/^(.*?)\((\d+)\)$/)
  const cleanBase = baseMatch ? baseMatch[1] : base

  let index = 1
  let candidate = `${cleanBase}(${index})${ext}`
  while (takenTitles.has(candidate.toLowerCase())) {
    index++
    candidate = `${cleanBase}(${index})${ext}`
  }
  return candidate
}

// ─────────────────────────────────────────────────────────────────────────────

export const uploadData = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { title, fileType, extractedText, tags, clientPaths } = req.body || {}

    // --- FLOW A: Text Snippets ---
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
        fileSize: 0
      })

      res.status(201).json({ success: true, count: 1, data: [snippet] })
      return
    }

    // --- FLOW B: Batch Physical Files ---
    const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : [])

    if (!files || files.length === 0) {
      return next(new AppError('Please upload at least one valid file', 400))
    }

    let parsedPaths: string[] = []
    if (clientPaths) {
      parsedPaths = Array.isArray(clientPaths) ? clientPaths : [clientPaths]
    }

    const folderCache = new Map<string, any>()
    const docsToInsert = []
    const skippedFiles = [] // 🛠️ NEW: Keep track of duplicates so we can warn the user

    const dbTitleCache = new Map<string, Set<string>>()
    const batchTitleCache = new Map<string, Set<string>>()

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')

      // ==========================================
      // 🛡️ DEDUPLICATION CHECK (SHA-256)
      // ==========================================
      // 1. Calculate the unique digital fingerprint of this specific file
      const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex')

      // 2. Check if this exact file already exists in the user's database
      const isDuplicate = await DocumentModel.exists({ user: userId, fileHash })

      if (isDuplicate) {
        console.log(`[Upload] Skipped duplicate file: ${originalName}`)
        skippedFiles.push(originalName) // Add to our warning list
        continue // 🛑 SKIP Cloudinary and DB insertion for this specific file!
      }
      // ==========================================

      const fileSizeMB = file.size / (1024 * 1024)
      let load: 'Light' | 'Medium' | 'Heavy' = 'Medium'
      if (fileSizeMB < 2) load = 'Light'
      if (fileSizeMB > 5) load = 'Heavy'

      const inferredType = getFileTypeFromMime(file.mimetype)
      const originalPath = parsedPaths[i] || `/${originalName}`

      const cloudinaryFolder = getCloudinaryFolder(inferredType)
      const { secure_url, public_id } = await uploadBufferToCloudinary(
        file.buffer,
        cloudinaryFolder,
        originalName,
        file.mimetype
      )

      const pathParts = originalPath.split('/').filter((p) => p.trim() !== '' && p !== '.')

      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1]
        if (lastPart === originalName || lastPart === file.originalname || lastPart.includes('.')) {
          pathParts.pop()
        }
      }

      if (pathParts.length === 0) {
        pathParts.push('Random files')
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
              parentFolder: currentParentId
            })

            if (!folder) {
              folder = await Folder.create({
                name: part,
                user: userId,
                parentFolder: currentParentId,
                path: accumulatedPath,
                isPinned: part === 'Random files'
              })
            } else if (part === 'Random files' && !folder.isPinned) {
              await Folder.findByIdAndUpdate(folder._id, { isPinned: true })
            }
            currentParentId = folder._id
          }
          folderCache.set(folderPathKey, currentParentId)
        }
      }

      const folderKey = currentParentId ? String(currentParentId) : 'root'
      const dbTitles = await loadFolderTitles(userId, currentParentId, dbTitleCache)
      const batchTitles = batchTitleCache.get(folderKey) ?? new Set<string>()
      const allTaken = new Set<string>([...dbTitles, ...batchTitles])

      const uniqueTitle = resolveUniqueTitle(originalName, allTaken)
      batchTitles.add(uniqueTitle.toLowerCase())
      batchTitleCache.set(folderKey, batchTitles)

      docsToInsert.push({
        user: userId,
        title: uniqueTitle,
        fileType: inferredType,
        aiStatus: 'Pending',
        cognitiveLoad: load,
        cloudinaryUrl: secure_url,
        cloudinaryPublicId: public_id,
        originalClientPath: originalPath,
        semanticPath: '/',
        folder: currentParentId,
        tags: tags ? JSON.parse(tags) : [],
        fileSize: file.size,
        fileHash: fileHash // 🛠️ NEW: Save the hash so the bouncer catches it next time!
      })
    }

    // If ALL files were duplicates, exit early
    if (docsToInsert.length === 0) {
      res.status(409).json({
        success: false,
        message: 'All uploaded files were duplicates and were skipped.',
        skippedFiles
      })
      return
    }

    const createdDocs = await DocumentModel.insertMany(docsToInsert)

    // Update folder updatedAt dates
    const folderIdsToUpdate = [
      ...new Set(docsToInsert.map((doc) => doc.folder).filter((id) => id !== null))
    ]
    if (folderIdsToUpdate.length > 0) {
      await Folder.updateMany(
        { _id: { $in: folderIdsToUpdate } },
        { $set: { updatedAt: new Date() } }
      )
    }

    // ==========================================
    // RESTORED AI TRIGGER (FIRE AND FORGET)
    // ==========================================
    const docIds = createdDocs.map((doc) => doc._id.toString())
    AIService.processPendingDocuments(docIds).catch((err) => {
      console.error('Background AI processing failed:', err)
    })

    // Return success, but include the skipped array so the frontend can show a toast notification!
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
