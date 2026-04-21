import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../core/errors/AppError'
import { DocumentModel } from '../documents/document.model'
import Folder, { IFolder } from '../folders/folder.model'
import { ChatMessageModel } from './chat.model' // 🛠️ NEW IMPORT
// @route   POST /api/ai/chat
// @desc    Mock endpoint for the Contextual AI Sidebar (Chat / Summarize)
export const askAI = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { documentId, message } = req.body

    if (!documentId || !message) {
      return next(new AppError('documentId and message are required', 400))
    }

    // 🚀 SENIOR MOVE: Simulate a 1.5-second AI thinking delay!
    await new Promise((resolve) => setTimeout(resolve, 1500))

    res.status(200).json({
      success: true,
      data: {
        reply: `This is a mocked AI response. In the real version, I will read the document and answer your prompt: "${message}"`,
        insights: [
          'The document focuses on modern tech stacks.',
          'There are 3 main action items detected.'
        ],
        riskWarnings: ['Confidential data detected in paragraph 2.']
      }
    })
  } catch (error) {
    next(error)
  }
}

// @route   POST /api/ai/compare
// @desc    Mock endpoint for comparing two files
export const compareDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { doc1Id, doc2Id } = req.body

    if (!doc1Id || !doc2Id) {
      return next(new AppError('Please provide both doc1Id and doc2Id', 400))
    }

    await new Promise((resolve) => setTimeout(resolve, 2500))

    res.status(200).json({
      success: true,
      data: {
        similarTopics: [
          'Both files discuss project architecture and data flow.',
          'Both emphasize user authentication.'
        ],
        differences: [
          'File 1 focuses on Backend APIs (Node.js).',
          'File 2 focuses on Frontend UI components (React).'
        ],
        uniqueDoc1: ['Mentions Mongoose schemas', 'Discusses JWT limits'],
        uniqueDoc2: ['Mentions Tailwind CSS', 'Discusses Redux state']
      }
    })
  } catch (error) {
    next(error)
  }
}

// @route   POST /api/ai/organize-folder
// @desc    Takes newly uploaded files, checks existing user folders, and mocks an AI routing response.
export const generateSemanticStructure = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { documents } = req.body

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return next(new AppError('Please provide an array of documents to organize.', 400))
    }

    // 1. Get the user's EXISTING folders from the Folder database now!
    const existingPaths = await Folder.distinct('path', {
      user: userId
    })

    // 2. Simulate AI processing time
    await new Promise((resolve) => setTimeout(resolve, 3000))

    const proposedUpdates = documents.map((doc: any) => {
      let newPath = 'Miscellaneous' // Fallback
      const titleLower = doc.title.toLowerCase()

      if (titleLower.includes('invoice') || titleLower.includes('tax')) {
        newPath = existingPaths.includes('Finance/Invoices')
          ? 'Finance/Invoices'
          : 'Personal/Finance'
      } else if (titleLower.includes('contract') || titleLower.includes('nda')) {
        newPath = 'Work/Legal'
      } else if (
        titleLower.includes('png') ||
        titleLower.includes('jpg') ||
        titleLower.includes('image')
      ) {
        newPath = 'Media/Images'
      }

      return {
        documentId: doc._id || doc.id,
        newPath: newPath
      }
    })

    res.status(200).json({
      success: true,
      message: 'AI successfully mapped documents to semantic folders.',
      data: {
        updates: proposedUpdates
      }
    })
  } catch (error) {
    next(error)
  }
}

// 🛠️ THE FINAL BOSS: Recursively creates physical folders based on AI string paths!
// @route   PUT /api/ai/apply-folders
// @desc    Takes proposed paths, generates Folder models, and links them to Documents
export const applySemanticFolders = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { updates } = req.body // Array of { documentId, newPath }

    if (!updates || !Array.isArray(updates)) {
      return next(new AppError('Invalid updates array provided.', 400))
    }

    // Loop through each document the AI wants to move
    for (const update of updates) {
      const { documentId, newPath } = update

      if (!documentId || !newPath) continue

      // Split "Finance/Invoices/2026" into ["Finance", "Invoices", "2026"]
      const pathParts = newPath.split('/').filter((p: string) => p.trim() !== '')

      let currentParentId = null // Start at the root level
      let accumulatedPath = ''

      // Sequentially crawl down the path, creating folders if they don't exist
      for (const part of pathParts) {
        accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part

        // Does this folder exist at this exact level?
        // 🛠️ THE FIX: Strongly typed as IFolder | null
        let folder: IFolder | null = await Folder.findOne({
          name: part,
          user: userId,
          parentFolder: currentParentId
        })

        // If not, physically create it in MongoDB!
        if (!folder) {
          folder = await Folder.create({
            name: part,
            user: userId,
            parentFolder: currentParentId,
            path: accumulatedPath
          })
        }

        // Move down one level for the next loop iteration
        currentParentId = folder._id
      }

      // 'currentParentId' is now the ID of the deepest folder in the path (e.g. "2026")
      // Attach the Document to this real Folder!
      await DocumentModel.findByIdAndUpdate(documentId, {
        folder: currentParentId,
        semanticPath: newPath // Keep the string for easy reading
      })
    }

    res.status(200).json({
      success: true,
      message: 'Physical folder structure generated and documents routed successfully!'
    })
  } catch (error) {
    next(error)
  }
}

// @route   GET /api/ai/chat/:documentId
// @desc    Fetches the chat history scoped specifically to one document
export const getDocumentChatHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { documentId } = req.params
    const userId = (req as any).user._id

    // 1. Verify the user actually owns the document
    const document = await DocumentModel.findOne({ _id: documentId, user: userId })
    if (!document) {
      return next(new AppError('Document not found or access denied', 404))
    }

    // 2. Fetch the chat history, sorted from oldest to newest
    const history = await ChatMessageModel.find({ documentId, user: userId })
      .sort({ createdAt: 1 })
      .select('role content createdAt -_id') // Only send what the UI needs

    res.status(200).json({
      success: true,
      data: history
    })
  } catch (error) {
    next(error)
  }
}
