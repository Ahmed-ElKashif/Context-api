import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../core/errors/AppError'
import { AIService } from './ai.service'

/**
 * @description Serves as the central router for all AI-driven operations.
 * Strictly adheres to Controller-Service separation: handles only HTTP
 * parsing and response formatting, delegating all LangChain/LangGraph
 * agent logic to the AIService.
 */

// ==========================================
// 🤖 CORE RAG AGENT (CHAT)
// ==========================================

/**
 * Handles real-time semantic chat queries against a specific document.
 * @route POST /api/ai/chat
 */
export const askAI = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Extract user ID from auth middleware and payload from body
    const userId = (req as any).user._id
    const { documentId, message } = req.body

    // 🧠 Hand off to LangGraph Agent
    const aiResponse = await AIService.processChat(userId, documentId, message)

    res.status(200).json({ success: true, data: aiResponse })
  } catch (error) {
    next(error)
  }
}

/**
 * Retrieves the LangGraph chat memory/history for a specific document.
 * @route GET /api/ai/chat/:documentId
 */
export const getDocumentChatHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { documentId } = req.params as { documentId: string }
    const userId = (req as any).user._id

    // 🧠 Fetch thread history from Service
    const history = await AIService.getDocumentHistory(documentId, userId)

    if (!history) {
      return next(new AppError('Document not found or access denied', 404))
    }

    res.status(200).json({ success: true, data: history })
  } catch (error) {
    next(error)
  }
}

// ==========================================
// 📂 SEMANTIC ORGANIZER (FOLDER PROPOSALS)
// ==========================================

/**
 * Analyzes a batch of unstructured documents and generates a proposed
 * relational folder structure based on semantic context (GPT-4o-mini).
 * @route POST /api/ai/folders/propose
 */
export const generateSemanticStructure = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { documents } = req.body

    // 🧠 Hand off to the Orchestrator Service
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

/**
 * Executes the AI's proposed structure, recursively building physical
 * MongoDB folders and moving the documents into them.
 * @route POST /api/ai/folders/apply
 */
export const applySemanticFolders = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { updates } = req.body

    // 🧠 Hand off to the DB Service (Fire and wait)
    await AIService.applyPhysicalFolders(userId, updates)

    res.status(200).json({
      success: true,
      message: 'Physical folder structure generated and documents routed successfully!'
    })
  } catch (error) {
    next(error)
  }
}
