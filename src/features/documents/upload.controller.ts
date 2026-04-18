import { Request, Response, NextFunction } from 'express'
import { DocumentModel, DocumentType } from './document.model'
import { AppError } from '../../core/errors/AppError'
import Folder, { IFolder } from '../folders/folder.model';  

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
    const userId = (req as any).user._id
    const { title, fileType, extractedText, tags, clientPaths } = req.body

    // --- FLOW A: Text Snippets (No physical file, just raw text) ---
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
        folder: null // 🛠️ NEW: Explicitly sits at the root
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

    // 🛠️ NEW: In-Memory Cache. 
    // Prevents creating the same folder 5 times if 5 files are in the same directory!
    const folderCache = new Map<string, any>();
    const docsToInsert = [];

    // 2. Loop through files sequentially so we can build the folder tree safely
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileSizeMB = file.size / (1024 * 1024)
      let load: 'Light' | 'Medium' | 'Heavy' = 'Medium'
      if (fileSizeMB < 2) load = 'Light'
      if (fileSizeMB > 5) load = 'Heavy'

      const inferredType = getFileTypeFromMime(file.mimetype)
      const originalPath = parsedPaths[i] || `/${file.originalname}`

      // --- 🛠️ THE UPGRADE: VIRTUAL TO PHYSICAL FOLDERS ---
      // Split "Q4/Invoices/invoice.pdf" -> ["Q4", "Invoices", "invoice.pdf"]
      const pathParts = originalPath.split('/').filter(p => p.trim() !== '');
      
      // Remove the filename from the path parts (we only want the folders)
      if (pathParts.length > 0 && pathParts[pathParts.length - 1] === file.originalname) {
        pathParts.pop(); 
      }

      let currentParentId = null;
      let accumulatedPath = "";

      // If there are actually folders to create (e.g., they didn't just upload a loose file)
      if (pathParts.length > 0) {
        const folderPathKey = pathParts.join('/'); // e.g., "Q4/Invoices"

        // Check if we already created this folder during THIS specific upload loop
        if (folderCache.has(folderPathKey)) {
          currentParentId = folderCache.get(folderPathKey);
        } else {
          // If not in cache, crawl down the path and create them in MongoDB
          for (const part of pathParts) {
            accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;

            let folder : IFolder | null = await Folder.findOne({ 
              name: part, 
              user: userId, 
              parentFolder: currentParentId 
            });

            if (!folder) {
              folder = await Folder.create({ 
                name: part, 
                user: userId, 
                parentFolder: currentParentId, 
                path: accumulatedPath 
              });
            }
            currentParentId = folder._id;
          }
          // Save the final deepest folder ID to our cache for the next file!
          folderCache.set(folderPathKey, currentParentId);
        }
      }

      // Add the fully mapped document to our insert array
      docsToInsert.push({
        user: userId,
        title: file.originalname,
        fileType: inferredType,
        aiStatus: 'Pending',
        cognitiveLoad: load,
        originalFilePath: `/uploads/${file.filename}`,
        originalClientPath: originalPath, 
        semanticPath: '/', 
        folder: currentParentId, // 🛠️ NEW: Connect to the physical Folder!
        tags: tags ? JSON.parse(tags) : []
      })
    }

    // 3. Blazing fast bulk insert into MongoDB
    const createdDocs = await DocumentModel.insertMany(docsToInsert)

    res.status(201).json({ success: true, count: createdDocs.length, data: createdDocs })
  } catch (error) {
    next(error)
  }
}