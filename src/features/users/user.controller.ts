import { Request, Response, NextFunction } from 'express'
import { User } from './user.model'
import { AppError } from '../../core/errors/AppError'
import bcrypt from 'bcryptjs'

// @route   GET /api/users/profile
// @access  Private (Requires JWT)
export const getUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // req.user is guaranteed by our requireAuth middleware
    const user = await User.findById(req.user?._id)

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

// @route   PUT /api/users/profile
// @access  Private (Requires JWT)
export const updateUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await User.findById(req.user?._id)

    if (!user) {
      return next(new AppError('User not found', 404))
    }

    const { fullName, username, password, persona } = req.body

    // If they want to change their username, check if it's taken!
    if (username && username !== user.username) {
      const usernameTaken = await User.findOne({ username })
      if (usernameTaken) {
        return next(new AppError('This username is already taken', 400))
      }
      user.username = username
    }

    // Update the other basic fields if they were provided
    if (fullName) user.fullName = fullName
    if (persona) user.persona = persona

    // Hash the new password manually before saving
    if (password) {
      const salt = await bcrypt.genSalt(10)
      user.passwordHash = await bcrypt.hash(password, salt)
    }

    const updatedUser = await user.save()

    res.status(200).json({
      success: true,
      data: {
        id: updatedUser._id,
        fullName: updatedUser.fullName,
        username: updatedUser.username,
        email: updatedUser.email,
        persona: updatedUser.persona
      }
    })
  } catch (error) {
    next(error)
  }
}
