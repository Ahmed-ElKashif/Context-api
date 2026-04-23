import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../core/errors/AppError'
import { AIService } from './ai.service' // 🛠️ Import our new service

export const askAI = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { documentId, message } = req.body
    // 🧠 Hand off to the service
    const aiResponse = await AIService.processChat(documentId, message)

    res.status(200).json({ success: true, data: aiResponse })
  } catch (error) {
    next(error)
  }
}

export const compareDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { doc1Id, doc2Id } = req.body
    // 🧠 Hand off to the service
    const comparison = await AIService.compareDocs(doc1Id, doc2Id)

    res.status(200).json({ success: true, data: comparison })
  } catch (error) {
    next(error)
  }
}

export const generateSemanticStructure = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { documents } = req.body

    // 🧠 Hand off to the service
    const proposedUpdates = await AIService.generateSemanticProposal(userId, documents)

    res.status(200).json({
      success: true,
      message: 'AI successfully mapped documents to semantic folders.',
      data: { updates: proposedUpdates }
    })
  } catch (error) {
    next(error)
  }
}

export const applySemanticFolders = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { updates } = req.body

    // 🧠 Hand off to the service (No return data needed, just wait for it to finish)
    await AIService.applyPhysicalFolders(userId, updates)

    res.status(200).json({
      success: true,
      message: 'Physical folder structure generated and documents routed successfully!'
    })
  } catch (error) {
    next(error)
  }
}

export const getDocumentChatHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { documentId } = req.params
    const userId = (req as any).user._id

    // 🧠 Hand off to the service
    const history = await AIService.getDocumentHistory(documentId, userId)

    if (!history) {
      return next(new AppError('Document not found or access denied', 404))
    }

    res.status(200).json({ success: true, data: history })
  } catch (error) {
    next(error)
  }
}
