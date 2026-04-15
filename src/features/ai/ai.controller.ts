import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../core/errors/AppError'
import { DocumentModel } from '../documents/document.model'

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

// NEW: @route   POST /api/ai/organize-folder
// NEW: @desc    Takes newly uploaded files, checks existing user folders, and mocks an AI routing response.
export const generateSemanticStructure = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id
    // The frontend will send the list of newly uploaded documents we just saved
    const { documents } = req.body

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return next(new AppError('Please provide an array of documents to organize.', 400))
    }

    // 1. Get the user's EXISTING folders from the database
    // We filter out the default '/' so the AI knows actual categories
    const existingPaths = await DocumentModel.distinct('semanticPath', {
      user: userId,
      semanticPath: { $ne: '/' }
    })

    // 2. Simulate AI processing time
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // 3. Mock the LLM Router Logic
    // In production, you would send `existingPaths` and `documents` to OpenAI here.
    // The prompt would be: "Route these files into these existingPaths. If they don't fit, invent a new path."

    const proposedUpdates = documents.map((doc: any) => {
      let newPath = 'Miscellaneous' // Fallback
      const titleLower = doc.title.toLowerCase()

      // Extremely basic mock routing logic just to test the UI
      if (titleLower.includes('invoice') || titleLower.includes('tax')) {
        newPath = existingPaths.includes('Finance/Invoices')
          ? 'Finance/Invoices'
          : 'Personal/Finance'
      } else if (titleLower.includes('contract') || titleLower.includes('nda')) {
        newPath = 'Work/Legal'
      } else if (titleLower.includes('png') || titleLower.includes('jpg')) {
        newPath = 'Media/Images'
      }

      return {
        documentId: doc._id || doc.id,
        newPath: newPath
      }
    })

    // 4. Return the strict JSON format that our `bulkUpdate` endpoint will eventually need!
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
