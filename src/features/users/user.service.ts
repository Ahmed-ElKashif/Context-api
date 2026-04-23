import bcrypt from 'bcryptjs'
import { User, IUser } from './user.model'

export class UserService {
  static async getProfileById(userId: string): Promise<IUser | null> {
    return await User.findById(userId)
  }

  static async updateProfile(
    userId: string,
    updateData: {
      fullName?: string
      username?: string
      password?: string
      persona?: 'general' | 'professional' | 'student' | 'developer'
    }
  ): Promise<{ user?: IUser; error?: { message: string; statusCode: number } }> {
    const user = await User.findById(userId)
    if (!user) return { error: { message: 'User not found', statusCode: 404 } }

    if (updateData.username && updateData.username !== user.username) {
      const usernameTaken = await User.findOne({ username: updateData.username })
      if (usernameTaken)
        return { error: { message: 'This username is already taken', statusCode: 400 } }
      user.username = updateData.username
    }

    if (updateData.fullName) user.fullName = updateData.fullName
    if (updateData.persona) user.persona = updateData.persona

    if (updateData.password) {
      const salt = await bcrypt.genSalt(10)
      user.passwordHash = await bcrypt.hash(updateData.password, salt)
    }

    await user.save()
    return { user }
  }
}
