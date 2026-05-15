import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../core/errors/AppError'
import { AIService } from './ai.service'
import { estimateTokens } from '../../core/services/token-budget.service'

/**
 * @description AI Controller — HTTP parsing and response formatting only.
 * Each handler sets res.locals.aiMeta after its service call so that:
 *   - checkTokenBudget middleware can record token usage
 *   - aiLogger middleware can emit a structured log line
 *
 * res.locals.aiMeta shape: { model: string, tokensUsed: number, operation: string }
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLatency(res: Response): number {
  return Date.now() - (res.locals.startTime ?? Date.now())
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * Analyzes a batch of unstructured documents and generates a proposed
 * relational folder structure based on semantic context (GPT-4o-mini).
 * @route POST /api/ai/organize-folder
 */
export const generateSemanticStructure = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { documents } = req.body

    const proposedUpdates = await AIService.generateSemanticProposal(userId, documents)

    // Estimate tokens: document titles + summaries + system prompt overhead
    const inputText = JSON.stringify(documents)
    res.locals.aiMeta = {
      model: 'gpt-4o-mini',
      tokensUsed: estimateTokens(inputText) + 800, // +800 system prompt overhead
      operation: 'organize-folder'
    }

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
 * @route PUT /api/ai/apply-folders
 */
export const applySemanticFolders = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { updates } = req.body

    await AIService.applyPhysicalFolders(userId, updates)

    // No AI call — no aiMeta needed
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

    const results = await AIService.semanticSearch(userId, query)

    // Semantic search uses embeddings — estimate query tokens
    res.locals.aiMeta = {
      model: 'text-embedding-3-small',
      tokensUsed: estimateTokens(query),
      operation: 'semantic-search'
    }

    res.status(200).json({
      success: true,
      count: results.length,
      data: results
    })
  } catch (error) {
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

    // Synthesizer uses existing document summaries + tags — relatively light
    // Estimate: average summary ~200 chars × documentCount + system prompt
    const estimatedInputChars = documentIds.length * 800 // summary + tags per doc
    res.locals.aiMeta = {
      model: 'gpt-4o-mini',
      tokensUsed: estimateTokens(String(estimatedInputChars)) + 600,
      operation: 'synthesize'
    }

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
