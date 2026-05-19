import { Request, Response, NextFunction } from 'express'
import { ComparisonService } from './comparison.service'
import { AppError } from '../../core/errors/AppError'
import { estimateTokens } from '../../core/services/token-budget.service'

/**
 * @route POST /api/comparison/compare
 * @description Performs a deep conceptual comparison between two documents
 *              using the DeepThinkerService (Groq 70B → 8B fallback).
 */
export const compareDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const { documentIds } = req.body

    // 1. Validation
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length !== 2) {
      return next(new AppError('Please provide exactly two document IDs for comparison.', 400))
    }

    const [id1, id2] = documentIds

    // 2. Delegate to Service
    const result = await ComparisonService.performComparison(userId, id1, id2)

    if (result.error) {
      return next(new AppError(result.error, result.statusCode || 400))
    }

    // 3. Set AI meta for token-budget and logging middleware
    //    DeepThinker sends ~5000 chars of text per doc to the 70B model
    const estimatedInputChars = 5000 * 2 // 5k chars per document
    res.locals.aiMeta = {
      model: process.env.GROQ_VERSATILE_COMPARISON_MODEL || 'llama-3.3-70b-versatile',
      tokensUsed: estimateTokens(String(estimatedInputChars)) + 500,
      operation: 'document-comparison'
    }

    // 4. Send Response
    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @route GET /api/comparison/:docIdA/:docIdB/chat
 * @description Retrieves the chat history for a specific dual-document comparison session.
 */
export const getComparisonChatHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const { docIdA, docIdB } = req.params as { docIdA: string; docIdB: string }

    if (!docIdA || !docIdB) {
      return next(new AppError('Both document IDs are required in the URL.', 400))
    }

    const history = await ComparisonService.getComparisonChatHistory(userId, docIdA, docIdB)

    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @route POST /api/comparison/:docIdA/:docIdB/chat
 * @description Queries the dual-document RAG pipeline to answer questions about both files.
 */
export const chatWithComparison = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const { docIdA, docIdB } = req.params as { docIdA: string; docIdB: string }
    const { message } = req.body

    if (!docIdA || !docIdB) {
      return next(new AppError('Both document IDs are required in the URL.', 400))
    }

    if (!message) {
      return next(new AppError('Message is required in the request body.', 400))
    }

    // Delegate to the dual-document RAG pipeline
    const aiResponse = await ComparisonService.chatWithComparison(userId, docIdA, docIdB, message)

    // Set AI meta for token-budget and logging middleware
    res.locals.aiMeta = {
      model: 'llama3.1:8b-instruct-q4_K_M', // Assuming local offline model for chat
      tokensUsed: estimateTokens(message + aiResponse) + 200, // Rough conversational estimate
      operation: 'comparison-chat'
    }

    res.status(200).json({
      success: true,
      data: { role: 'assistant', content: aiResponse }
    })
  } catch (error) {
    next(error)
  }
}
