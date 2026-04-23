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

   // 🛠️ THE FIX: Explicitly cast folderId as a string
const folderId = req.params.folderId as string;

const isRoot = !folderId || folderId === 'root';
const targetFolderId = isRoot ? null : folderId;

    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 10
    const skip = (page - 1) * limit
    
    // 🔍 Extract search and tags from the query string
    const search = req.query.search as string;
    const tags = req.query.tags as string;

    // 🛠️ THE FIX: Pass the search and tags down to the service!
    const result = await FolderService.getContents(
      userId, 
      targetFolderId,
      skip, 
      limit, 
      search, 
      tags
    );

    res.status(200).json({
      success: true,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(result.totalDocuments / limit),
        totalItems: result.totalDocuments,
        limit
      },
      data: {
        currentFolder: result.currentFolder,
        breadcrumbs: result.breadcrumbs, 
        folders: result.folders,
        documents: result.documents
      }
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

    const id = req.params.id as string
    const newName = req.body.newName

    if (!id) {
      return next(new AppError('Folder ID is required', 400))
    }

    const result = await FolderService.renameFolder(userId, id, newName)

    if (result.error) {
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

    const id = req.params.id as string

    if (!id) {
      return next(new AppError('Folder ID is required', 400))
    }

    const result = await FolderService.deleteFolderWithContents(userId, id)

    if (result.error) {
      res.status(404).json({ success: false, error: result.error })
      return
    }

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