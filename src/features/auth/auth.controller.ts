import { Request, Response, NextFunction } from 'express'
import { AuthService } from './auth.service' // 🛠️ NOW POINTS TO AUTH SERVICE
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
        persona: result.user?.persona
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
        id: result.user?._id, // 🛠️ FIXED Mongoose ID mapping
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
