import path from 'path'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

import { DocumentModel } from '../documents/document.model'
import { ChunkModel } from '../documents/chunk.model'
import Folder, { IFolder } from '../folders/folder.model'
import { ChatMessageModel } from './chat.model'
import { VectorService } from './vector.service'

export class AIService {
  // ==========================================
  // CORE RAG PIPELINE
  // ==========================================

  // 1. Generate Vector Embeddings
  static async generateEmbedding(text: string): Promise<number[]> {
    try {
      const safeText = text.substring(0, 30000)
      const embeddingModel = VectorService.getEmbeddingsModel()

      return await embeddingModel.embedQuery(safeText)
    } catch (error) {
      console.error('Failed to generate embedding:', error)
      throw new Error('AI Embedding generation failed.')
    }
  }

  // THE VISUAL CORTEX: PDF Extractor & Chunker
  static async processPDF(documentId: string, filePath: string, userId: string): Promise<string> {
    // 1. Resolve the absolute path to the file uploaded by Multer
    const absolutePath = path.join(process.cwd(), filePath)

    // 2. Load the PDF using LangChain
    const loader = new PDFLoader(absolutePath)
    const docs = await loader.load()

    if (!docs || docs.length === 0) {
      throw new Error('No readable text found in PDF (might be a scanned image).')
    }

    // 3. Langchain Splitter: 1000 chars per chunk, 200 char overlap
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    })

    const splitDocs = await splitter.splitDocuments(docs)
    console.log(`[Visual Cortex] Sliced PDF into ${splitDocs.length} semantic chunks.`)

    // 4. Bulk Generate Embeddings (Optimized for single network request)
    const textsToEmbed = splitDocs.map((doc) => doc.pageContent)
    const embeddingModel = VectorService.getEmbeddingsModel()
    const embeddings = await embeddingModel.embedDocuments(textsToEmbed)

    // 5. Map into strictly typed Mongoose documents
    const chunkDocs = splitDocs.map((doc, index) => ({
      documentId,
      userId,
      text: doc.pageContent,
      embedding: embeddings[index],
      chunkIndex: index
    }))

    // Bulk insert all chunks at once for massive speed
    await ChunkModel.insertMany(chunkDocs)

    // Return the first 500 characters as a preview for the main Document
    return splitDocs[0].pageContent.substring(0, 500) + '...'
  }

  // Background Worker
  static async processPendingDocuments(documentIds: string[]): Promise<void> {
    console.log(`[AI Worker] Started processing ${documentIds.length} documents...`)

    for (const id of documentIds) {
      try {
        const doc = await DocumentModel.findById(id)
        if (!doc) continue

        await DocumentModel.findByIdAndUpdate(id, { aiStatus: 'Processing' })

        let extractedPreview = ''

        // Route to the correct extractor based on file type
        if (doc.fileType === 'PDF' && doc.originalFilePath) {
          extractedPreview = await this.processPDF(id, doc.originalFilePath, doc.user.toString())
        } else {
          // Placeholder for Images/Word Docs
          extractedPreview = 'File type not fully supported by Visual Cortex yet.'
        }

        // Update the main document with success
        await DocumentModel.findByIdAndUpdate(id, {
          extractedText: extractedPreview,
          aiStatus: 'Analyzed'
        })

        console.log(`[AI Worker] Document ${id} successfully analyzed and embedded.`)
      } catch (error) {
        console.error(`[AI Worker] Failed to process document ${id}:`, error)
        await DocumentModel.findByIdAndUpdate(id, { aiStatus: 'Failed' })
      }
    }
  }

  // ==========================================
  // MOCKED FEATURES (TO BE UPGRADED)
  // ==========================================

  // 1. Mock Chat
  static async processChat(userId: string, documentId: string, message: string) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return {
      reply: `This is a mocked AI response. In the real version, I will read the document and answer your prompt: "${message}"`,
      insights: [
        'The document focuses on modern tech stacks.',
        'There are 3 main action items detected.'
      ],
      riskWarnings: ['Confidential data detected in paragraph 2.']
    }
  }

  // 2. Mock Comparison
  static async compareDocs(doc1Id: string, doc2Id: string) {
    await new Promise((resolve) => setTimeout(resolve, 2500))
    return {
      similarTopics: [
        'Both files discuss project architecture and data flow.',
        'Both emphasize user authentication.'
      ],
      differences: [
        'File 1 focuses on Backend APIs (Node.js).',
        'File 2 focuses on Frontend UI components (React).'
      ],
      uniqueDoc1: ['Mentions Mongoose schemas', 'Discusses JWT limits'],
      uniqueDoc2: ['Mentions Tailwind CSS', 'Discusses Redux state']
    }
  }

  // 3. Mock Folder Organization (The Proposal)
  static async generateSemanticProposal(
    userId: string,
    documents: { _id?: string; id?: string; title: string }[]
  ) {
    const existingPaths = await Folder.distinct('path', { user: userId })
    await new Promise((resolve) => setTimeout(resolve, 3000))

    return documents.map((doc) => {
      let newPath = 'Miscellaneous'
      const titleLower = (doc.title || '').toLowerCase()

      if (titleLower.includes('invoice') || titleLower.includes('tax')) {
        newPath = existingPaths.includes('Finance/Invoices')
          ? 'Finance/Invoices'
          : 'Personal/Finance'
      } else if (titleLower.includes('contract') || titleLower.includes('nda')) {
        newPath = 'Work/Legal'
      } else if (
        titleLower.includes('png') ||
        titleLower.includes('jpg') ||
        titleLower.includes('image')
      ) {
        newPath = 'Media/Images'
      }

      return { documentId: doc._id || doc.id, newPath }
    })
  }

  // ==========================================
  // PHYSICAL FOLDER ACTIONS
  // ==========================================

  // 4. Recursive Folder Creation
  static async applyPhysicalFolders(
    userId: string,
    updates: { documentId: string; newPath: string }[]
  ) {
    for (const update of updates) {
      const { documentId, newPath } = update
      if (!documentId || !newPath) continue

      const pathParts = newPath.split('/').filter((p: string) => p.trim() !== '')
      let currentParentId = null
      let accumulatedPath = ''

      for (const part of pathParts) {
        accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part

        let folder: IFolder | null = await Folder.findOne({
          name: part,
          user: userId,
          parentFolder: currentParentId
        })

        if (!folder) {
          folder = await Folder.create({
            name: part,
            user: userId,
            parentFolder: currentParentId,
            path: accumulatedPath
          })
        }
        currentParentId = folder._id
      }

      await DocumentModel.findByIdAndUpdate(documentId, {
        folder: currentParentId,
        semanticPath: newPath
      })
    }
  }

  // 5. Fetch Chat History
  static async getDocumentHistory(documentId: string, userId: string) {
    const document = await DocumentModel.findOne({ _id: documentId, user: userId })
    if (!document) return null

    return await ChatMessageModel.find({ documentId, user: userId })
      .sort({ createdAt: 1 })
      .select('role content createdAt -_id')
  }
}
