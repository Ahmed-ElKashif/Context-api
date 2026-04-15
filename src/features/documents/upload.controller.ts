import { Request, Response, NextFunction } from 'express'
import { DocumentModel, DocumentType } from './document.model'
import { AppError } from '../../core/errors/AppError'

// Helper function to map Multer's mimetype to your MVP DocumentType
const getFileTypeFromMime = (mimeType: string): DocumentType => {
  if (mimeType.includes('pdf')) return 'PDF'
  if (mimeType.includes('word') || mimeType.includes('officedocument')) return 'Word'
  if (mimeType.includes('image')) return 'Image'
  return 'TextSnippet' // Fallback
}

export const uploadData = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Get the user ID from the protected route middleware
    const userId = req.user?._id
    const { title, fileType, extractedText, tags, clientPaths } = req.body

    // --- FLOW A: Text Snippets (No physical file, just raw text) ---
    // We keep this exactly the same, but return it in an array to match the batch format
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
        originalClientPath: '/', // Snippets don't come from folders
        semanticPath: '/'
      })

      // Return as an array so the frontend always expects a list of files
      res.status(201).json({ success: true, count: 1, data: [snippet] })
      return
    }

    // --- FLOW B: Batch Physical Files (The Folder Drop) ---
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return next(new AppError('Please upload at least one valid file', 400))
    }

    // Parse the relative paths sent from the frontend dropzone
    // Example: ["Work/Invoices/invoice1.pdf", "Work/Invoices/invoice2.pdf"]
    let parsedPaths: string[] = []
    if (clientPaths) {
      parsedPaths = typeof clientPaths === 'string' ? JSON.parse(clientPaths) : clientPaths
    }

    // 2. Loop through the array of files and prepare them for the database
    const docsToInsert = files.map((file, index) => {
      // Estimate Cognitive Load based on file size (MVP Logic)
      const fileSizeMB = file.size / (1024 * 1024)
      let load: 'Light' | 'Medium' | 'Heavy' = 'Medium'
      if (fileSizeMB < 2) load = 'Light'
      if (fileSizeMB > 5) load = 'Heavy'

      // Infer the file type (PDF, Word, Image)
      const inferredType = getFileTypeFromMime(file.mimetype)

      // Grab the frontend path, or fallback to just the filename if it wasn't sent
      const originalPath = parsedPaths[index] || `/${file.originalname}`

      return {
        user: userId,
        title: file.originalname,
        fileType: inferredType,
        aiStatus: 'Pending',
        cognitiveLoad: load,
        originalFilePath: `/uploads/${file.filename}`, // Where it lives on our server
        originalClientPath: originalPath, // BEFORE: The path on the user's laptop
        semanticPath: '/', // AFTER: Stays empty until the AI router runs
        tags: tags ? JSON.parse(tags) : []
      }
    })

    // 3. Blazing fast bulk insert into MongoDB
    const createdDocs = await DocumentModel.insertMany(docsToInsert)

    res.status(201).json({ success: true, count: createdDocs.length, data: createdDocs })
  } catch (error) {
    next(error)
  }
}
