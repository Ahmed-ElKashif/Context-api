import { Request, Response, NextFunction } from 'express'
import { DocumentModel, DocumentType } from './document.model'
import { AppError } from '../../core/errors/AppError'
import Folder, { IFolder } from '../folders/folder.model'
//  NEW: Import the AI Brain
import { AIService } from '../ai/ai.service'

const getFileTypeFromMime = (mimeType: string): DocumentType => {
  if (mimeType.includes('pdf')) return 'PDF'
  if (mimeType.includes('word') || mimeType.includes('officedocument')) return 'Word'
  if (mimeType.includes('image')) return 'Image'
  return 'TextSnippet'
}

export const uploadData = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { title, fileType, extractedText, tags, clientPaths } = req.body

    // --- FLOW A: Text Snippets ---
    if (fileType === 'TextSnippet') {
      if (!extractedText) {
        return next(new AppError('extractedText is required for TextSnippets', 400))
      }

      //  AI INJECTION 1: Generate the vector embedding instantly since it's just raw text
      const embedding = await AIService.generateEmbedding(extractedText)

      const snippet = await DocumentModel.create({
        user: userId,
        title: title || `Snippet: ${extractedText.substring(0, 20)}...`,
        fileType,
        aiStatus: 'Analyzed', // It's text, so it's instantly analyzed
        cognitiveLoad: 'Light',
        extractedText,
        embedding, //  Save the 1536 vector array to the database
        tags: tags ? JSON.parse(tags) : [],
        originalClientPath: '/',
        semanticPath: '/',
        folder: null
      })

      res.status(201).json({ success: true, count: 1, data: [snippet] })
      return
    }

    // --- FLOW B: Batch Physical Files (The Folder Drop) ---
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return next(new AppError('Please upload at least one valid file', 400))
    }

    let parsedPaths: string[] = []
    if (clientPaths) {
      parsedPaths = Array.isArray(clientPaths) ? clientPaths : [clientPaths]
    }

    const folderCache = new Map<string, any>()
    const docsToInsert = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fileSizeMB = file.size / (1024 * 1024)
      let load: 'Light' | 'Medium' | 'Heavy' = 'Medium'
      if (fileSizeMB < 2) load = 'Light'
      if (fileSizeMB > 5) load = 'Heavy'

      const inferredType = getFileTypeFromMime(file.mimetype)
      const originalPath = parsedPaths[i] || `/${file.originalname}`

      const pathParts = originalPath.split('/').filter((p) => p.trim() !== '')

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
              parentFolder: currentParentId
            })

            if (!folder) {
              folder = await Folder.create({
                name: part,
                user: userId,
                parentFolder: currentParentId,
                path: accumulatedPath
              })
            }
            currentParentId = folder._id
          }
          folderCache.set(folderPathKey, currentParentId)
        }
      }

      docsToInsert.push({
        user: userId,
        title: file.originalname,
        fileType: inferredType,
        aiStatus: 'Pending', //  Leaves as pending for the background worker
        cognitiveLoad: load,
        originalFilePath: `/uploads/${file.filename}`,
        originalClientPath: originalPath,
        semanticPath: '/',
        folder: currentParentId,
        tags: tags ? JSON.parse(tags) : []
      })
    }

    // Blazing fast bulk insert into MongoDB
    const createdDocs = await DocumentModel.insertMany(docsToInsert)

    //  AI INJECTION 2: FIRE AND FORGET!
    // We grab the new IDs and send them to the AI worker.
    // Notice there is NO 'await' here. The server responds to the user instantly!
    const docIds = createdDocs.map((doc) => doc._id.toString())
    AIService.processPendingDocuments(docIds).catch((err) => {
      console.error('Background AI processing failed:', err)
    })

    res.status(201).json({ success: true, count: createdDocs.length, data: createdDocs })
  } catch (error) {
    next(error)
  }
}
