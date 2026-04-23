import { Request, Response, NextFunction } from 'express'
import { UserService } from './user.service'
import { AppError } from '../../core/errors/AppError'

export const getUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id // Strict typings
    if (!userId) return next(new AppError('Unauthorized', 401))

    const user = await UserService.getProfileById(userId)

    if (!user) {
      return next(new AppError('User not found', 404))
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        persona: user.persona,
        createdAt: user.createdAt
      }
    })
  } catch (error) {
    next(error)
  }
}

export const updateUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const result = await UserService.updateProfile(userId, req.body)

    if (result.error) {
      return next(new AppError(result.error.message, result.error.statusCode))
    }

    res.status(200).json({
      success: true,
      data: {
        id: result.user?._id,
        fullName: result.user?.fullName,
        username: result.user?.username,
        email: result.user?.email,
        persona: result.user?.persona
      }
    })
  } catch (error) {
    next(error)
  }
}
