import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import Folder, { IFolder } from './folder.model'
import { DocumentModel, IDocument } from '../documents/document.model'

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

  // 2. Get Folder Contents (🛠️ FIX: Added Search & Tags parameters)
  static async getContents(
    userId: string,
    targetFolderId: string | null,
    skip: number,
    limit: number,
    search?: string,
    tags?: string
  ): Promise<{
    currentFolder: IFolder | null
    breadcrumbs: IFolder[]
    folders: IFolder[]
    documents: IDocument[]
    totalDocuments: number
  }> {
    
    // --- 🛠️ THE FIX: BUILD A DYNAMIC QUERY ---
    let docQuery: any = { user: userId };

    // If we are NOT searching globally, restrict files to the current folder
    if (!search && !tags) {
      docQuery.folder = targetFolderId;
    }

    // If there is a search term, use Regex to match the title or tags (case-insensitive)
    if (search) {
      docQuery.$or = [
        { title: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    // If a tag filter is active, require that tag
    if (tags) {
      docQuery.tags = tags;
    }

    // 1. Fetch Folders (We only need to fetch folders if we aren't searching)
    let folders: IFolder[] = [];
    if (!search && !tags) {
      folders = await Folder.find({ user: userId, parentFolder: targetFolderId }).sort({
        name: 1
      });
    }

    // 2. Fetch Documents (Using our new dynamic docQuery!)
    const documents = await DocumentModel.find(docQuery)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)

    // 3. Count total documents for pagination
    const totalDocuments = await DocumentModel.countDocuments(docQuery)

    // 4. Breadcrumbs logic
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

    for (const doc of documentsToDelete) {
      if (doc.originalFilePath) {
        const filePath = path.join(process.cwd(), doc.originalFilePath)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      }
    }

    await DocumentModel.deleteMany({ user: userId, folder: { $in: folderIdsToDelete } })
    await Folder.deleteMany({ user: userId, _id: { $in: folderIdsToDelete } })

    return {
      foldersDeleted: foldersToDelete.length,
      documentsDeleted: documentsToDelete.length
    }
  }

  // 5. Get Entire Folder Tree
  static async getTree(userId: string): Promise<IFolder[]> {
    return await Folder.find({ user: userId }).sort({ path: 1 })
  }
}