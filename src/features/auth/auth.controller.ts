import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt, { SignOptions } from 'jsonwebtoken'
import { User } from '../users/user.model'
import { AppError } from '../../core/errors/AppError'

// Helper function to generate tokens
const generateToken = (id: string) => {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN as SignOptions['expiresIn']) || '30d'
  }

  return jwt.sign({ id }, process.env.JWT_SECRET as string, options)
}

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password } = req.body

    // 1. Check if user already exists
    const userExists = await User.findOne({ email })
    if (userExists) {
      return next(new AppError('User with this email already exists', 400))
    }

    // 2. Hash the password before saving to the database
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // 3. Create the user
    const user = await User.create({
      name,
      email,
      passwordHash: hashedPassword
    })

    // 4. Generate the VIP Pass (Token)
    const token = generateToken(user.id)

    // 5. Send success response
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
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
        name: user.name,
        email: user.email
      }
    })
  } catch (error) {
    next(error)
  }
}
