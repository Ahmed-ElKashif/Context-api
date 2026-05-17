import { DocumentModel, IDocument } from './document.model'
import Folder from '../folders/folder.model'
import { configureCloudinary } from '../../config/cloudinary'
import { ChatOpenAI } from '@langchain/openai'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages'
import { ChatMessageModel } from '../ai/chat.model'
import { EmbeddingService } from '../ai/vector.service'
import mongoose from 'mongoose'
import { AppError } from '../../core/errors/AppError'

const cloudinary = configureCloudinary()

// ─── Module-level default (production) ──────────────────────────────────────
// Instantiated once per process — never inside a method.
const defaultChatModel = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0.2 })

/**
 * Cloudinary stores images and PDFs under the 'image' resource type when uploaded with 'auto'.
 * Word documents and others are stored as 'raw'.
 * We must pass the correct resource_type to `destroy()` or the deletion silently fails.
 */
const getResourceType = (fileType: string): 'image' | 'raw' => {
  return fileType === 'Image' || fileType === 'PDF' ? 'image' : 'raw'
}

export class DocumentService {
  // ─── Injected Chat Model (injectable for unit tests) ───────────────────────
  private static _chatModel: BaseChatModel = defaultChatModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests: DocumentService.init(mockModel as any)
   */
  static init(chatModel: BaseChatModel): void {
    this._chatModel = chatModel
  }

  static async getAll(
    userId: string,
    filters: any,
    skip: number,
    limit: number,
    sortBy: string,
    sortOrder: 1 | -1
  ): Promise<{ documents: IDocument[]; totalDocuments: number }> {
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
  static async search(
    userId: string,
    q: string,
    skip: number,
    limit: number
  ): Promise<{ documents: IDocument[]; totalMatches: number }> {
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
  static async updateById(
    userId: string,
    docId: string,
    updateData: Partial<IDocument>
  ): Promise<IDocument | null> {
    const document = await DocumentModel.findOne({ _id: docId, user: userId })
    if (!document) return null

    if (updateData.title) document.title = updateData.title
    if (updateData.tags) document.tags = updateData.tags
    if (updateData.cognitiveLoad) document.cognitiveLoad = updateData.cognitiveLoad
    if (updateData.semanticPath) document.semanticPath = updateData.semanticPath
    if (updateData.originalClientPath) document.originalClientPath = updateData.originalClientPath

    await document.save()

    // 🛠️ THE FIX 2: Update the parent folder's timestamp when a document is edited!
    if (document.folder) {
      await Folder.findByIdAndUpdate(document.folder, { updatedAt: new Date() })
    }

    return document
  }

  // 4. Bulk Update Semantic Paths
  static async bulkUpdatePaths(userId: string, updates: { documentId: string; newPath: string }[]) {
    // 🛠️ Check if any of these documents are already organized
    const documentIds = updates.map(u => u.documentId)
    const alreadyOrganizedDocs = await DocumentModel.find({
      _id: { $in: documentIds },
      user: userId,
      isOrganized: true
    })

    if (alreadyOrganizedDocs.length > 0) {
      throw new AppError('One or more selected documents are already organized.', 400)
    }

    const bulkOps = updates.map((update) => ({
      updateOne: {
        filter: { _id: update.documentId, user: userId },
        update: { $set: { semanticPath: update.newPath, isOrganized: true } }
      }
    }))

    return await DocumentModel.bulkWrite(bulkOps)
  }

  // 5. Delete Single Document + Cloudinary Asset
  static async deleteById(userId: string, docId: string): Promise<boolean> {
    const document = await DocumentModel.findOne({ _id: docId, user: userId })
    if (!document) return false

    // ☁️ Delete from Cloudinary if asset exists
    if (document.cloudinaryPublicId) {
      const resourceType = getResourceType(document.fileType)
      await cloudinary.uploader.destroy(document.cloudinaryPublicId, {
        resource_type: resourceType
      })
    }

    // 🛠️ Store the folder ID before we delete the document
    const folderId = document.folder

    await document.deleteOne()

    // 🛠️ THE FIX 3: Update the parent folder's timestamp when a document is deleted!
    if (folderId) {
      await Folder.findByIdAndUpdate(folderId, { updatedAt: new Date() })
    }

    return true
  }

  // 6. Bulk Delete Documents + Cloudinary Assets
  static async bulkDelete(userId: string, ids: string[]) {
    const query = { _id: { $in: ids }, user: userId }
    const documents = await DocumentModel.find(query)

    // ☁️ Delete each asset from Cloudinary in parallel
    await Promise.all(
      documents
        .filter((doc) => doc.cloudinaryPublicId)
        .map((doc) =>
          cloudinary.uploader.destroy(doc.cloudinaryPublicId!, {
            resource_type: getResourceType(doc.fileType)
          })
        )
    )

    // 🛠️ Collect all unique folder IDs that these documents belong to
    const folderIdsToUpdate = [
      ...new Set(documents.map((doc) => doc.folder).filter((id) => id !== null))
    ]

    const result = await DocumentModel.deleteMany(query)

    // 🛠️ THE FIX 4: Update timestamps for all affected folders at once!
    if (folderIdsToUpdate.length > 0) {
      await Folder.updateMany(
        { _id: { $in: folderIdsToUpdate } },
        { $set: { updatedAt: new Date() } }
      )
    }

    return result
  }

  // 7. Get Document by ID (Full payload)
  static async getById(userId: string, docId: string): Promise<IDocument | null> {
    return await DocumentModel.findOne({ _id: docId, user: userId }).populate('folder', 'name')
  }

  // 8. Get Cloudinary URL for serving a file
  // The controller can redirect to this URL or return it — no proxying needed.
  static async getFilePath(userId: string, docId: string): Promise<string | null> {
    const document = await DocumentModel.findOne({ _id: docId, user: userId })
    if (!document || !document.cloudinaryUrl) return null
    return document.cloudinaryUrl
  }

  /**
   * Fetches the chat history for a specific document and user
   */
  static async getDocumentChatHistory(documentId: string, userId: string) {
    return await ChatMessageModel.find({ documentId, user: userId })
      .sort({ createdAt: 1 }) // Ascending order for frontend UIs
      .select('role content createdAt -_id')
      .exec()
  }

  /**
   * Performs a vector search and generates an AI response
   */
  static async chatWithDocument(
    documentId: string,
    userId: string,
    query: string
  ): Promise<string> {
    const llm = this._chatModel  // ← uses injected singleton, never constructs inline
    const vectorStore = await EmbeddingService.getVectorStore()

    // 1. Retrieve Context
    const retriever = vectorStore.asRetriever({
      k: 5,
      filter: {
        preFilter: {
          // 🛠️ THE FIX: Cast the strings back to MongoDB ObjectIds!
          documentId: { $eq: new mongoose.Types.ObjectId(documentId) },
          userId: { $eq: new mongoose.Types.ObjectId(userId) }
        }
      }
    })

    const relevantChunks = await retriever.invoke(query)
    const contextText = relevantChunks.map((chunk) => chunk.pageContent).join('\n\n---\n\n')

    if (!contextText) {
      return "I couldn't find any relevant information in this document to answer your question."
    }

    // 2. Fetch recent conversation memory
    const history = await ChatMessageModel.find({ documentId, user: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .exec()

    const formattedHistory = history
      .reverse()
      .map((msg) =>
        msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
      )

    // 3. Generate Answer
    const systemPrompt = new SystemMessage(`
      You are an elite, helpful AI assistant. 
      Answer the user's question using ONLY the context provided below. 
      If the answer is not contained in the context, do not guess—simply state that you do not know.
      
      CONTEXT:
      ${contextText}
    `)

    const response = await llm.invoke([systemPrompt, ...formattedHistory, new HumanMessage(query)])
    const aiResponseText = (response.content as string).trim()

    // 4. Save to Database
    await ChatMessageModel.insertMany([
      { documentId, user: userId, role: 'user', content: query }, // 🛠️ Fixed
      { documentId, user: userId, role: 'assistant', content: aiResponseText } // 🛠️ Fixed
    ])

    return aiResponseText
  }
}
