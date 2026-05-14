import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../core/errors/AppError'
import { AIService } from './ai.service'

/**
 * @description Serves as the central router for all AI-driven operations.
 * Strictly adheres to Controller-Service separation: handles only HTTP
 * parsing and response formatting, delegating all LangChain/LangGraph
 * agent logic to the AIService.
 */

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

// ==========================================
// 📂 SEMANTIC ORGANIZER (FOLDER PROPOSALS)
// ==========================================

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

/**
 * Performs a global semantic search across all of a user's embedded documents.
 * @route GET /api/ai/search?q=your_search_term
 */
export const searchDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id.toString()
    const query = req.query.q as string

    if (!query) {
      res.status(400).json({
        success: false,
        message: 'Search query is required (e.g., ?q=recipe).'
      })
      return
    }

    // 🧠 Hand off to the AI Service (the God Function we just perfected!)
    // Note: Make sure your import matches wherever you put semanticSearch
    // (e.g., AIService or EmbeddingService)
    const results = await AIService.semanticSearch(userId, query)

    res.status(200).json({
      success: true,
      count: results.length,
      data: results
    })
  } catch (error) {
    // I noticed you used `next(error)` in your snippet, which is the perfect
    // way to hand errors to a global Express error-handling middleware!
    next(error)
  }
}

/**
 * Generates a combined summary of multiple selected files.
 * @route POST /api/ai/synthesize
 */
export const synthesizeDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { documentIds } = req.body

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return next(new AppError('Please provide an array of documentIds.', 400))
    }

    const bulkSummary = await AIService.synthesizeDocuments(documentIds, userId)

    res.status(200).json({
      success: true,
      data: {
        summary: bulkSummary
      }
    })
  } catch (error) {
    next(error)
  }
}
