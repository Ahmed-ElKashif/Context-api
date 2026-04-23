import { Request, Response, NextFunction } from 'express'
import { ComparisonService } from './comparison.service'
import { AppError } from '../../core/errors/AppError'

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

    // 3. Send Response
    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
}
