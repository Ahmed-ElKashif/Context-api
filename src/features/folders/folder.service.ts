import mongoose from 'mongoose'
import Folder, { IFolder } from './folder.model'
import { DocumentModel, IDocument } from '../documents/document.model'
import { configureCloudinary } from '../../config/cloudinary'

const cloudinary = configureCloudinary()

/**
 * Cloudinary stores images and PDFs under the 'image' resource type when uploaded with 'auto'.
 * Word documents and others are stored as 'raw'.
 * We must pass the correct resource_type to `destroy()` or the deletion silently fails.
 */
const getResourceType = (fileType: string): 'image' | 'raw' => {
  return fileType === 'Image' || fileType === 'PDF' ? 'image' : 'raw'
}

export class FolderService {
  // 1. Create a Folder
  static async createFolder(
    userId: string,
    name: string,
    parentFolderId?: string
  ): Promise<{ folder?: IFolder; error?: string }> {
    const existingFolder = await Folder.findOne({
      name,
      user: userId,
      parentFolder: parentFolderId || null
    })

    if (existingFolder) return { error: 'A folder with this name already exists here.' }

    let newPath = name
    if (parentFolderId) {
      const parent = await Folder.findById(parentFolderId)
      if (!parent) return { error: 'Parent folder not found.' }
      newPath = `${parent.path}/${name}`
    }

    const folder = await Folder.create({
      name,
      user: userId,
      parentFolder: parentFolderId || null,
      path: newPath
    })

    return { folder }
  }

  // 2. Get Folder Contents (🛠️ THE PAGINATION FIX)
 // 2. Get Folder Contents (🛠️ THE PAGINATION FIX)
  static async getContents(
    userId: string,
    targetFolderId: string | null,
    skip: number,
    limit: number,
    search?: string,
    tags?: string,
    sortBy: string = 'updatedAt', // 🛠️ NEW: Accept sortBy
    sortOrder: 1 | -1 = -1        // 🛠️ NEW: Accept sortOrder
  ): Promise<{
    currentFolder: IFolder | null
    breadcrumbs: IFolder[]
    folders: IFolder[]
    documents: IDocument[]
    totalDocuments: number
  }> {
    
    let docQuery: any = { user: userId };
    if (!search && !tags) docQuery.folder = targetFolderId;
    if (search) docQuery.$or = [
      { title: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } }
    ];
    if (tags) docQuery.tags = tags;

    const folderQuery = { user: userId, parentFolder: targetFolderId };
    const folderCount = (!search && !tags) ? await Folder.countDocuments(folderQuery) : 0;
    const documentCount = await DocumentModel.countDocuments(docQuery);
    const totalDocuments = folderCount + documentCount;

    let folders: IFolder[] = [];
    let documents: IDocument[] = [];

    // 🛠️ THE FIX: Smart Sorting Objects!
    // Folders use 'name' instead of 'title', but pinned folders always stay at the top!
    const folderSortField = sortBy === 'title' ? 'name' : sortBy;
    const folderSortOptions: any = { isPinned: -1, [folderSortField]: sortOrder };
    
    // Documents use whatever the frontend sends
    const docSortOptions: any = { [sortBy]: sortOrder };

    if (!search && !tags) {
      if (skip < folderCount) {
        const folderLimit = Math.min(limit, folderCount - skip);
        folders = await Folder.find(folderQuery)
          .sort(folderSortOptions) // 🛠️ Applied here!
          .skip(skip)
          .limit(folderLimit);

        const remainingSpace = limit - folders.length;
        if (remainingSpace > 0) {
          documents = await DocumentModel.find(docQuery)
            .sort(docSortOptions) // 🛠️ Applied here!
            .skip(0) 
            .limit(remainingSpace);
        }
      } else {
        const docSkip = skip - folderCount;
        documents = await DocumentModel.find(docQuery)
          .sort(docSortOptions) // 🛠️ Applied here!
          .skip(docSkip)
          .limit(limit);
      }
    } else {
      documents = await DocumentModel.find(docQuery)
        .sort(docSortOptions) // 🛠️ Applied here!
        .skip(skip)
        .limit(limit);
    }

    // 4. Breadcrumbs logic (unchanged)
    let currentFolder: IFolder | null = null
    let breadcrumbs: IFolder[] = []

    if (targetFolderId) {
      currentFolder = await Folder.findById(targetFolderId)

      if (currentFolder) {
        const pathParts = currentFolder.path.split('/')
        const ancestorPaths = []
        let cumulativePath = ''

        for (let i = 0; i < pathParts.length - 1; i++) {
          cumulativePath = cumulativePath ? `${cumulativePath}/${pathParts[i]}` : pathParts[i]
          ancestorPaths.push(cumulativePath)
        }

        if (ancestorPaths.length > 0) {
          const ancestors = await Folder.find({ user: userId, path: { $in: ancestorPaths } })
          breadcrumbs = ancestors.sort((a, b) => a.path.length - b.path.length)
        }
      }
    }

    return { currentFolder, breadcrumbs, folders, documents, totalDocuments }
  }
  // 3. Rename a Folder
  static async renameFolder(
    userId: string,
    folderId: string,
    newName: string
  ): Promise<{ folder?: IFolder; error?: string }> {
    const folder = await Folder.findOne({ _id: folderId, user: userId })
    if (!folder) return { error: 'Folder not found.' }

    const collision = await Folder.findOne({
      name: newName,
      parentFolder: folder.parentFolder,
      user: userId
    })

    if (collision) return { error: 'Name already in use in this destination.' }

    const oldName = folder.name
    folder.name = newName
    folder.path = folder.path.replace(new RegExp(`${oldName}$`), newName)
    folder.updatedAt = new Date(); // 🛠️ Explicitly force the timestamp to update

    await folder.save()
    return { folder }
  }

  // 4. Delete Folder, Sub-folders, and Physical Documents
  static async deleteFolderWithContents(
    userId: string,
    folderId: string
  ): Promise<{ error?: string; foldersDeleted?: number; documentsDeleted?: number }> {
    const targetFolder = await Folder.findOne({ _id: folderId, user: userId })
    if (!targetFolder) return { error: 'Folder not found.' }

    const escapedPath = targetFolder.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const foldersToDelete = await Folder.find({
      user: userId,
      path: { $regex: `^${escapedPath}(/|$)` }
    })

    const folderIdsToDelete = foldersToDelete.map((f) => f._id)

    const documentsToDelete = await DocumentModel.find({
      user: userId,
      folder: { $in: folderIdsToDelete }
    })

    // ☁️ Delete each document's Cloudinary asset in parallel
    await Promise.all(
      documentsToDelete
        .filter((doc) => doc.cloudinaryPublicId)
        .map((doc) =>
          cloudinary.uploader.destroy(doc.cloudinaryPublicId!, {
            resource_type: getResourceType(doc.fileType),
          })
        )
    )

    await DocumentModel.deleteMany({ user: userId, folder: { $in: folderIdsToDelete } })
    await Folder.deleteMany({ user: userId, _id: { $in: folderIdsToDelete } })

    return {
      foldersd: foldersToDelete.length,
      documentsDeleted: documentsToDelete.length
    }
  }

  // 5. Get Entire Folder Tree
  static async getTree(userId: string): Promise<IFolder[]> {
    return await Folder.find({ user: userId }).sort({ path: 1 })
  }
}