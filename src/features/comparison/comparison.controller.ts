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
