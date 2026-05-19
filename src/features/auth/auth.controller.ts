import { Request, Response, NextFunction } from 'express'
import { AuthService } from './auth.service'
import { AppError } from '../../core/errors/AppError'

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payload = { ...req.body, passwordHash: req.body.password }

    const result = await AuthService.registerUser(payload)

    if (result.error) {
      return next(new AppError(result.error.message, result.error.statusCode))
    }

    res.status(201).json({
      success: true,
      token: result.token,
      user: {
        id: result.user?._id,
        fullName: result.user?.fullName,
        username: result.user?.username,
        email: result.user?.email,
        persona: result.user?.persona,
        avatar: (result.user as any)?.avatar,
        role: result.user?.role ?? 'user',   // ← added
      }
    })
  } catch (error) {
    next(error)
  }
}

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body

    const result = await AuthService.loginUser(email, password)

    if (result.error) {
      return next(new AppError(result.error.message, result.error.statusCode))
    }

    res.status(200).json({
      success: true,
      token: result.token,
      user: {
        id: result.user?._id,
        fullName: result.user?.fullName,
        username: result.user?.username,
        email: result.user?.email,
        persona: result.user?.persona,
        avatar: (result.user as any)?.avatar,
        role: result.user?.role ?? 'user',   // ← added
      }
    })
  } catch (error) {
    next(error)
  }
}

export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body
    const result = await AuthService.forgotPassword(email)
    if (result.error) {
      return next(new AppError(result.error.message, result.error.statusCode))
    }
    res.status(200).json({ success: true, message: 'Password reset link sent to your email.' })
  } catch (error) {
    next(error)
  }
}

export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, password } = req.body
    const result = await AuthService.resetPassword(token, password)
    if (result.error) {
      return next(new AppError(result.error.message, result.error.statusCode))
    }
    res.status(200).json({ success: true, message: 'Password reset successful. You can now login.' })
  } catch (error) {
    next(error)
  }
}