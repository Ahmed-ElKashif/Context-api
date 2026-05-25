import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { User, IUser } from '../users/user.model'
import crypto from 'crypto'
import { sendResetPasswordEmail } from '../../core/services/mail.service'

export class AuthService {
  static generateToken(id: string): string {
    return jwt.sign({ id }, process.env.JWT_SECRET as string, {
      expiresIn: (process.env.JWT_EXPIRES_IN || '30d') as any
    })
  }

  static async registerUser(
    data: Partial<IUser>
  ): Promise<{ user?: IUser; token?: string; error?: { message: string; statusCode: number } }> {
    const { fullName, username, email, passwordHash, persona } = data

    const userExists = await User.findOne({ $or: [{ email }, { username }] })

    if (userExists) {
      if (userExists.email === email)
        return { error: { message: 'User with this email already exists', statusCode: 400 } }
      if (userExists.username === username)
        return { error: { message: 'This username is already taken', statusCode: 400 } }
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPwd = await bcrypt.hash(passwordHash as string, salt)

    const user = await User.create({
      fullName,
      username,
      email,
      passwordHash: hashedPwd,
      persona
    })

    const token = this.generateToken(user.id)
    return { user, token }
  }

  static async loginUser(
    email: string,
    passwordStr: string
  ): Promise<{ user?: IUser; token?: string; error?: { message: string; statusCode: number } }> {
    const user = await User.findOne({ email })
    if (!user) return { error: { message: 'Invalid email or password', statusCode: 401 } }

    const isMatch = await bcrypt.compare(passwordStr, user.passwordHash)
    if (!isMatch) return { error: { message: 'Invalid email or password', statusCode: 401 } }

    const token = this.generateToken(user.id)
    return { user, token }
  }

  static async forgotPassword(email: string): Promise<{ success: boolean; error?: { message: string; statusCode: number } }> {
    const user = await User.findOne({ email })
    if (!user) {
      return { success: true }
    }

    const resetToken = crypto.randomBytes(32).toString('hex')
    
    user.resetPasswordToken = resetToken
    user.resetPasswordExpires = new Date(Date.now() + 3600000)
    await user.save()

    try {
      await sendResetPasswordEmail(user.email, resetToken)
      return { success: true }
    } catch (err) {
      console.error('[AuthService] Failed to send password reset email:', err)
      user.resetPasswordToken = undefined
      user.resetPasswordExpires = undefined
      await user.save()
      return { success: false, error: { message: 'Failed to send password reset email', statusCode: 500 } }
    }
  }

  static async resetPassword(token: string, passwordStr: string): Promise<{ success: boolean; error?: { message: string; statusCode: number } }> {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    })

    if (!user) {
      return { success: false, error: { message: 'Invalid or expired token', statusCode: 400 } }
    }

    const salt = await bcrypt.genSalt(10)
    user.passwordHash = await bcrypt.hash(passwordStr, salt)
    
    user.resetPasswordToken = undefined
    user.resetPasswordExpires = undefined
    await user.save()

    return { success: true }
  }
}
