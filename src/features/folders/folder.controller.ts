import { Request, Response, NextFunction } from 'express'
import { FolderService } from './folder.service'
import { AppError } from '../../core/errors/AppError'

export const createFolder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const { name, parentFolder } = req.body

    const result = await FolderService.createFolder(userId, name, parentFolder)

    if (result.error) {
      res.status(400).json({ success: false, error: result.error })
      return
    }

    res.status(201).json({ success: true, data: result.folder })
  } catch (error) {
    next(error)
  }
}

export const getFolderContents = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    // 🛠️ THE FIX: Explicitly cast to string so TypeScript knows it won't be undefined
    const folderId = req.params.folderId as string

    const isRoot = !folderId || folderId === 'root'
    const targetFolderId = isRoot ? null : folderId // This is now perfectly typed as string | null

    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 10
    const skip = (page - 1) * limit

    const data = await FolderService.getContents(userId, targetFolderId, skip, limit)

    res.status(200).json({
      success: true,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(data.totalDocuments / limit),
        totalItems: data.totalDocuments,
        limit
      },
      data
    })
  } catch (error) {
    next(error)
  }
}

export const renameFolder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    // 🛠️ THE FIX: Explicitly cast 'id' as a string so the Service is happy
    const id = req.params.id as string
    const newName = req.body.newName

    if (!id) {
      return next(new AppError('Folder ID is required', 400))
    }

    const result = await FolderService.renameFolder(userId, id, newName)

    if (result.error) {
      // Return 404 for not found, 400 for collisions
      const status = result.error === 'Folder not found.' ? 404 : 400
      res.status(status).json({ success: false, error: result.error })
      return
    }

    res.status(200).json({ success: true, data: result.folder })
  } catch (error) {
    next(error)
  }
}

export const deleteFolder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    // 🛠️ THE FIX: Explicitly cast 'id' as a string
    const id = req.params.id as string

    if (!id) {
      return next(new AppError('Folder ID is required', 400))
    }

    const result = await FolderService.deleteFolderWithContents(userId, id)

    if (result.error) {
      res.status(404).json({ success: false, error: result.error })
      return
    }

    // 🛠️ THE FIX: Safely fallback to 1 (so 1 - 1 = 0 subfolders) and 0 if TS gets confused
    const foldersNuked = result.foldersDeleted ?? 1
    const filesNuked = result.documentsDeleted ?? 0

    res.status(200).json({
      success: true,
      message: `Nuked! Deleted folder, ${foldersNuked - 1} sub-folders, and ${filesNuked} files.`
    })
  } catch (error) {
    next(error)
  }
}

export const getFolderTree = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const allFolders = await FolderService.getTree(userId)

    res.status(200).json({ success: true, data: allFolders })
  } catch (error) {
    next(error)
  }
}
