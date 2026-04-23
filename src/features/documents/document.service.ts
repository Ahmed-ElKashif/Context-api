import { DocumentModel } from './document.model'
import fs from 'fs'
import path from 'path'

export class DocumentService {
  // 1. Fetch All with Advanced Filters & Pagination
  static async getAll(
    userId: string,
    filters: any,
    skip: number,
    limit: number,
    sortBy: string,
    sortOrder: 1 | -1
  ) {
    const query: any = { user: userId }

    if (filters.tags) query.tags = { $in: filters.tags }
    if (filters.fileType) query.fileType = filters.fileType
    if (filters.cognitiveLoad) query.cognitiveLoad = filters.cognitiveLoad

    // AI Semantic Folder Filter
    if (filters.semanticPath) {
      const folderName = filters.semanticPath.replace(/^\/+|\/+$/g, '')
      const escapedFolder = folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.semanticPath = { $regex: `^/?${escapedFolder}(/|$)`, $options: 'i' }
    }

    // Physical Client Folder Filter
    if (filters.originalClientPath) {
      const folderName = filters.originalClientPath.replace(/^\/+|\/+$/g, '')
      const escapedFolder = folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.originalClientPath = { $regex: `^/?${escapedFolder}(/|$)`, $options: 'i' }
    }

    const documents = await DocumentModel.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .select('-extractedText -__v')

    const totalDocuments = await DocumentModel.countDocuments(query)

    return { documents, totalDocuments }
  }

  // 2. Search Text Indexes
  static async search(userId: string, q: string, skip: number, limit: number) {
    const searchQuery = {
      user: userId,
      $or: [
        { $text: { $search: q } },
        { title: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ]
    }

    const documents = await DocumentModel.find(searchQuery, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-extractedText -__v')

    const totalMatches = await DocumentModel.countDocuments(searchQuery)

    return { documents, totalMatches }
  }

  // 3. Update Single Document
  static async updateById(userId: string, docId: string, updateData: any) {
    const document = await DocumentModel.findOne({ _id: docId, user: userId })
    if (!document) return null

    if (updateData.title) document.title = updateData.title
    if (updateData.tags) document.tags = updateData.tags
    if (updateData.cognitiveLoad) document.cognitiveLoad = updateData.cognitiveLoad
    if (updateData.semanticPath) document.semanticPath = updateData.semanticPath
    if (updateData.originalClientPath) document.originalClientPath = updateData.originalClientPath

    await document.save()
    return document
  }

  // 4. Bulk Update Semantic Paths
  static async bulkUpdatePaths(userId: string, updates: any[]) {
    const bulkOps = updates.map((update) => ({
      updateOne: {
        filter: { _id: update.documentId, user: userId },
        update: { $set: { semanticPath: update.newPath } }
      }
    }))

    return await DocumentModel.bulkWrite(bulkOps)
  }

  // 5. Delete Single Document & Physical File
  static async deleteById(userId: string, docId: string) {
    const document = await DocumentModel.findOne({ _id: docId, user: userId })
    if (!document) return null

    if (document.originalFilePath) {
      const filePath = path.join(process.cwd(), document.originalFilePath)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }

    await document.deleteOne()
    return true
  }

  // 6. Bulk Delete Documents & Physical Files
  static async bulkDelete(userId: string, ids: string[]) {
    const query = { _id: { $in: ids }, user: userId }
    const documents = await DocumentModel.find(query)

    for (const doc of documents) {
      if (doc.originalFilePath) {
        const filePath = path.join(process.cwd(), doc.originalFilePath)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      }
    }

    return await DocumentModel.deleteMany(query)
  }

  // 7. Get Document by ID (Full payload)
  static async getById(userId: string, docId: string) {
    return await DocumentModel.findOne({ _id: docId, user: userId }).populate('folder', 'name')
  }

  // 8. Get Physical File Path for Streaming
  static async getFilePath(userId: string, docId: string) {
    const document = await DocumentModel.findOne({ _id: docId, user: userId })
    if (!document || !document.originalFilePath) return null

    const filePath = path.join(process.cwd(), document.originalFilePath)
    if (!fs.existsSync(filePath)) return null

    return filePath
  }
}
