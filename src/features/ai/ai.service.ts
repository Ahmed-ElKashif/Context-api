import mongoose from 'mongoose'
import { DocumentModel } from '../documents/document.model'
import Folder, { IFolder } from '../folders/folder.model'
import { ChatMessageModel } from './chat.model'
import { EmbeddingService } from './vector.service'
import { OrchestratorAgent } from './orchestrator.agent'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { SynthesizerAgent } from './synthesizer.agent'

export class AIService {
  // ==========================================
  // CORE RAG PIPELINE
  // ==========================================

  // 1. Generate Vector Embeddings
  static async generateEmbedding(text: string): Promise<number[]> {
    try {
      const safeText = text.substring(0, 30000)
      const embeddingModel = EmbeddingService.getEmbeddingsModel()

      return await embeddingModel.embedQuery(safeText)
    } catch (error) {
      console.error('Failed to generate embedding:', error)
      throw new Error('AI Embedding generation failed.')
    }
  }

  // ==========================================
  // BULK SYNTHESIS (Instructor Suggestion)
  // ==========================================

  static async synthesizeDocuments(documentIds: string[], userId: string): Promise<string> {
    // 1. Fetch the documents, ensuring they belong to the requesting user
    const documents = await DocumentModel.find({
      _id: { $in: documentIds },
      user: userId
    })

    if (!documents || documents.length === 0) {
      throw new Error('No valid documents found for synthesis.')
    }

    // If only one document is selected, just return its existing summary
    if (documents.length === 1) {
      return documents[0].summary || 'No summary available for this document.'
    }

    // 2. Format the lightweight data for the LangChain Agent
    const formattedData = documents
      .map(
        (doc, index) => `
      Document ${index + 1}:
      Title: ${doc.title || 'Unknown'}
      Type: ${doc.fileType}
      Tags: ${doc.tags?.join(', ')}
      Summary: ${doc.summary}
      ---
    `
      )
      .join('\n')

    // 3. Hand off to the Synthesizer Agent
    console.log(`[Synthesizer] Synthesizing ${documents.length} documents...`)
    const finalSummary = await SynthesizerAgent.generateBulkSummary(formattedData)

    return finalSummary
  }

  // Background Worker
  static async processPendingDocuments(documentIds: string[]): Promise<void> {
    console.log(`[AI Worker] Started processing ${documentIds.length} documents...`)

    for (const id of documentIds) {
      try {
        const doc = await DocumentModel.findById(id)
        if (!doc) continue

        await DocumentModel.findByIdAndUpdate(id, { aiStatus: 'Processing' })

        let rawText = ''

        // ==========================================
        // 🧠 MULTIMODAL EXTRACTION ROUTER
        // ==========================================
        console.log(`[AI Worker] Extracting text for type: ${doc.fileType}...`)

        switch (doc.fileType) {
          case 'TextSnippet':
            // Frictionless Capture: Already in DB, bypass downloading entirely!
            rawText = doc.extractedText || ''
            break

          case 'PDF':
            if (!doc.cloudinaryUrl) throw new Error('PDF missing Cloudinary URL')
            const pdfBuffer = await this.downloadFromCloudinary(doc.cloudinaryUrl)
            const parser = new PDFParse({ data: pdfBuffer })
            const pdfData = await parser.getText()
            rawText = pdfData.text
            break

          case 'Word':
            if (!doc.cloudinaryUrl) throw new Error('Word doc missing Cloudinary URL')
            const wordBuffer = await this.downloadFromCloudinary(doc.cloudinaryUrl)
            const wordData = await mammoth.extractRawText({ buffer: wordBuffer })
            rawText = wordData.value
            break

          case 'Image':
            if (!doc.cloudinaryUrl) throw new Error('Image missing Cloudinary URL')
            // 🛑 PLACEHOLDER: We will inject the Gemini REST API OCR here today!
            rawText = 'Placeholder text for Image OCR. Awaiting Gemini integration.'
            break

          default:
            throw new Error(`Unsupported file type: ${doc.fileType}`)
        }

        if (!rawText || rawText.trim().length === 0) {
          throw new Error('No readable text found in document.')
        }

        // ==========================================
        // 🚀 UNIFIED AI PIPELINE
        // ==========================================

        // 1. Run the LangGraph Orchestrator to extract structured metadata
        console.log(`[AI Worker] Running Orchestrator Agent on document ${id}...`)
        const metadata = await OrchestratorAgent.analyzeDocumentMetadata(id, rawText)

        // 2. Embed the text into MongoDB Atlas Vector Search
        console.log(`[AI Worker] Embedding chunks into Atlas...`)
        await EmbeddingService.upsert(rawText, id, doc.user.toString())

        // 3. Update the main document with success and new metadata
        await DocumentModel.findByIdAndUpdate(id, {
          extractedText: rawText,
          aiStatus: 'Analyzed',
          summary: metadata.summary,
          tags: metadata.tags,
          cognitiveLoad: metadata.cognitiveLoad,
          fileType: metadata.type || doc.fileType // Fallback to original if not provided
        })

        console.log(`[AI Worker] Document ${id} successfully analyzed, orchestrated, and embedded.`)
      } catch (error) {
        console.error(`[AI Worker] Failed to process document ${id}:`, error)
        await DocumentModel.findByIdAndUpdate(id, { aiStatus: 'Failed' })
      }
    }
  }

  /**
   * Helper method to download a file from Cloudinary into a Node.js Buffer
   * so that our parsers (pdf-parse, mammoth) can read it in memory.
   */
  private static async downloadFromCloudinary(url: string): Promise<Buffer> {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
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

  // ==========================================
  // SEMANTIC SEARCH (GLOBAL)
  // ==========================================

  /**
   * Performs a global semantic search across all documents owned by the user.
   * STRICT SECURITY: preFilter completely isolates the vector space to the specific user.
   */
  static async semanticSearch(userId: string, query: string) {
    const vectorStore = EmbeddingService.getVectorStore()

    // similaritySearchWithScore returns an array of tuples: [Document, score]
    const results = await vectorStore.similaritySearchWithScore(query, 5, {
      preFilter: { userId: new mongoose.Types.ObjectId(userId) }
    })

    // Map LangChain's raw output into a clean, frontend-ready structure
    return results.map(([chunk, score]) => ({
      text: chunk.pageContent,
      // Convert mathematical cosine score to a clean percentage (e.g., 85.42)
      confidenceScore: Number((score * 100).toFixed(2)),
      documentId: chunk.metadata.documentId,
      chunkIndex: chunk.metadata.chunkIndex
    }))
  }
}
