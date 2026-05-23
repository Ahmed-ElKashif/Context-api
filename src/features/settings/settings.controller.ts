import { Request, Response, NextFunction } from 'express'
import { User } from '../users/user.model'
import { AppError } from '../../core/errors/AppError'
import { TokenBudgetService, MONTHLY_TOKEN_BUDGET } from '../../core/services/token-budget.service'

// GET /api/settings
export const getSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const user = await User.findById(userId)
    if (!user) return next(new AppError('User not found', 404))

    const budgetStatus = await TokenBudgetService.checkBudget(userId)
    const monthlyStatus = await TokenBudgetService.getMonthlyUsage(userId)

    res.status(200).json({
      success: true,
      data: {
        theme: user.theme || 'system',
        notificationsEnabled: user.notificationsEnabled ?? true,
        language: user.language || 'en',
        aiUsage: {
          tokensUsed: budgetStatus.tokensUsed,
          dailyLimit: budgetStatus.limit,
          remaining: budgetStatus.remaining,
          monthlyUsed: monthlyStatus.tokensUsed,
          monthlyLimit: MONTHLY_TOKEN_BUDGET
        }
      }
    })
  } catch (error) {
    next(error)
  }
}

// PATCH /api/settings
export const updateSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const { theme, notificationsEnabled, language } = req.body

    const user = await User.findById(userId)
    if (!user) return next(new AppError('User not found', 404))

    if (theme !== undefined) user.theme = theme
    if (notificationsEnabled !== undefined) user.notificationsEnabled = notificationsEnabled
    if (language !== undefined) user.language = language

    await user.save()

    const budgetStatus = await TokenBudgetService.checkBudget(userId)
    const monthlyStatus = await TokenBudgetService.getMonthlyUsage(userId)

    res.status(200).json({
      success: true,
      data: {
        theme: user.theme,
        notificationsEnabled: user.notificationsEnabled,
        language: user.language,
        aiUsage: {
          tokensUsed: budgetStatus.tokensUsed,
          dailyLimit: budgetStatus.limit,
          remaining: budgetStatus.remaining,
          monthlyUsed: monthlyStatus.tokensUsed,
          monthlyLimit: MONTHLY_TOKEN_BUDGET
        }
      }
    })
  } catch (error) {
    next(error)
  }
}

// POST /api/settings/reset
export const resetSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const user = await User.findById(userId)
    if (!user) return next(new AppError('User not found', 404))

    user.theme = 'system'
    user.notificationsEnabled = true
    user.language = 'en'
    await user.save()

    const budgetStatus = await TokenBudgetService.checkBudget(userId)
    const monthlyStatus = await TokenBudgetService.getMonthlyUsage(userId)

    res.status(200).json({
      success: true,
      data: {
        theme: user.theme,
        notificationsEnabled: user.notificationsEnabled,
        language: user.language,
        aiUsage: {
          tokensUsed: budgetStatus.tokensUsed,
          dailyLimit: budgetStatus.limit,
          remaining: budgetStatus.remaining,
          monthlyUsed: monthlyStatus.tokensUsed,
          monthlyLimit: MONTHLY_TOKEN_BUDGET
        }
      }
    })
  } catch (error) {
    next(error)
  }
}

// GET /api/settings/token-budget
export const getTokenBudget = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const budgetStatus = await TokenBudgetService.checkBudget(userId)
    const monthlyStatus = await TokenBudgetService.getMonthlyUsage(userId)

    res.status(200).json({
      success: true,
      data: {
        dailyUsage: {
          tokensUsed: budgetStatus.tokensUsed,
          dailyLimit: budgetStatus.limit,
          remaining: budgetStatus.remaining,
          resetAt: budgetStatus.resetAt
        },
        monthlyUsage: {
          tokensUsed: monthlyStatus.tokensUsed,
          requestCount: monthlyStatus.requestCount
        }
      }
    })
  } catch (error) {
    next(error)
  }
}
