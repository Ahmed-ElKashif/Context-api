import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { User } from '../users/user.model'
import { AppError } from '../../core/errors/AppError'

// Helper function to generate tokens
const generateToken = (id: string) => {
  return jwt.sign({ id }, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '30d') as any
  })
}

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { fullName, username, email, password, persona } = req.body
    // 1. Check if user already exists
    const userExists = await User.findOne({
      $or: [{ email }, { username }] // Searches for either match
    })
    if (userExists) {
      if (userExists.email === email) {
        return next(new AppError('User with this email already exists', 400))
      }
      if (userExists.username === username) {
        return next(new AppError('This username is already taken', 400))
      }
    }

    // 2. Hash the password before saving to the database
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // 3. Create the user
    const user = await User.create({
      fullName,
      username,
      email,
      passwordHash: hashedPassword,
      persona
    })

    // 4. Generate the VIP Pass (Token)
    const token = generateToken(user.id)

    // 5. Send success response
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        persona: user.persona
      }
    })
  } catch (error) {
    next(error) // Sends error to our global error handler
  }
}

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body

    // 1. Check if user exists
    const user = await User.findOne({ email })
    if (!user) {
      return next(new AppError('Invalid email or password', 401))
    }

    // 2. Check if password matches the hashed password in DB
    const isMatch = await bcrypt.compare(password, user.passwordHash)
    if (!isMatch) {
      return next(new AppError('Invalid email or password', 401))
    }

    // 3. Generate token
    const token = generateToken(user.id)

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        persona: user.persona
      }
    })
  } catch (error) {
    next(error)
  }
}
