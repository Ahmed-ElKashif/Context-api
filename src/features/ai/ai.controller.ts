import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../core/errors/AppError'

// @route   POST /api/ai/chat
// @desc    Mock endpoint for the Contextual AI Sidebar (Chat / Summarize)
export const askAI = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { documentId, message } = req.body

    if (!documentId || !message) {
      return next(new AppError('documentId and message are required', 400))
    }

    // 🚀 SENIOR MOVE: Simulate a 1.5-second AI thinking delay!
    // This forces the frontend team to build Loading Spinners in their React UI.
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Hardcoded Mock Response
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

    // Simulate a 2.5-second heavy AI comparison delay
    await new Promise((resolve) => setTimeout(resolve, 2500))

    // Hardcoded Comparison Response
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