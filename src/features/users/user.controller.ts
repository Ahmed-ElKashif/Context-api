import { Request, Response, NextFunction } from 'express'
import { UserService } from './user.service'
import { AppError } from '../../core/errors/AppError'
import { configureCloudinary } from '../../config/cloudinary'
import { User } from './user.model'

const extractCloudinaryPublicIdFromUrl = (url?: string): string | null => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    // Expected path format includes: /<cloud>/image/upload/v123/folder/file.ext
    const uploadIdx = parsed.pathname.indexOf('/upload/')
    if (uploadIdx === -1) return null

    let afterUpload = parsed.pathname.slice(uploadIdx + '/upload/'.length)
    // Remove optional transformation/version prefix like v1710000000/
    afterUpload = afterUpload.replace(/^v\d+\//, '')

    // Remove extension to get public_id
    const withoutExt = afterUpload.replace(/\.[^/.]+$/, '')
    return withoutExt || null
  } catch {
    return null
  }
}

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
        avatar: (user as any).avatar,
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
        avatar: result.user?.avatar,
        persona: result.user?.persona,
        createdAt: result.user?.createdAt
      }
    })
  } catch (error) {
    next(error)
  }
}

export const uploadUserAvatar = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    if (!req.file || !req.file.buffer) {
      return next(new AppError('No file uploaded', 400))
    }

    const cloudinary = configureCloudinary()

    const user = await User.findById(userId)
    if (!user) return next(new AppError('User not found', 404))

    // Upload via data URI to keep implementation simple and type-safe.
    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    const uploadResult: any = await cloudinary.uploader.upload(dataUri, {
      folder: 'avatars',
      resource_type: 'image'
    })

    const previousPublicId =
      user.avatarPublicId || extractCloudinaryPublicIdFromUrl(user.avatar)

    user.avatar = uploadResult.secure_url
    user.avatarPublicId = uploadResult.public_id
    await user.save()

    // Best-effort cleanup: deleting old Cloudinary image should not block profile update.
    if (previousPublicId && previousPublicId !== uploadResult.public_id) {
      try {
        await cloudinary.uploader.destroy(previousPublicId, { resource_type: 'image' })
      } catch {
        // Intentionally ignored to avoid breaking avatar update flow.
      }
    }

    res.status(200).json({ success: true, data: {
      id: user._id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      persona: user.persona,
      createdAt: user.createdAt
    }})
  } catch (error) {
    next(error)
  }
}
