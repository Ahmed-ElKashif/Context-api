import mongoose from 'mongoose'
import { DocumentModel } from '../documents/document.model'
import Folder from '../folders/folder.model'
import { EmbeddingService } from './vector.service'
import { OrchestratorService } from './orchestrator.service'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { SynthesizerAgent } from './synthesizer.service'
import { VisualCortexService } from './visual-cortex.service'
import { z } from 'zod'
import { ChatOpenAI } from '@langchain/openai'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { CognitiveLoadService } from './cognitive-load.service'
import { TokenBudgetService, estimateDocumentPipelineTokens } from '../../core/services/token-budget.service'
import { AppError } from '../../core/errors/AppError'

// ─── Module-level default (production) ──────────────────────────────────────
// The AI folder organizer model — instantiated once, never inside a method.
const defaultOrganizerModel = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0.1
})

export class AIService {
  // ==========================================
  // INJECTED MODEL (injectable for unit tests)
  // ==========================================

  private static _organizerModel: BaseChatModel = defaultOrganizerModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, inject a mock:
   * @example AIService.init(mockOrganizerModel)
   */
  static init(organizerModel: BaseChatModel): void {
    this._organizerModel = organizerModel
  }

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

    // 🛠️ Check if any document is still processing
    const unanalyzedDocs = documents.filter((doc) => doc.aiStatus !== 'Analyzed')
    if (unanalyzedDocs.length > 0) {
      throw new AppError(
        'Please wait until the Neural Cortex finishes analyzing all selected documents before synthesizing.',
        400
      )
    }

    // If only one document is selected, just return its existing summary
    if (documents.length === 1) {
      return documents[0].summary || 'No summary available for this document.'
    }

    // 2. Format the lightweight metadata for the LangChain Agent (Zero raw text, highly token efficient!)
    const formattedData = documents
      .map(
        (doc, index) => `
      Document ${index + 1}:
      Title: ${doc.title || 'Unknown'}
      Category/Type: ${doc.contentType || doc.fileType}
      Cognitive Load: ${doc.cognitiveLoad || 'Medium'} (${doc.cognitiveScore || 5}/10)
      Tags: ${doc.tags?.join(', ')}
      Orchestrator Summary: ${doc.summary || 'No summary available.'}
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
        // 🛠️ Populate the user to grab their persona!
        const doc = await DocumentModel.findById(id).populate('user')
        if (!doc) continue

        // Extract the persona (fallback to 'general' just in case)
        const userPersona = (doc.user as any).persona || 'general'
        await DocumentModel.findByIdAndUpdate(id, { aiStatus: 'Processing' })

        let rawText = ''

        // ==========================================
        // 🧠 MULTIMODAL EXTRACTION ROUTER
        // ==========================================
        console.log(`[AI Worker] Extracting text for type: ${doc.fileType}...`)

        switch (doc.fileType) {
          case 'TextSnippet':
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
            console.log(`[AI Worker] Activating Visual Cortex for Image OCR...`)
            const imageBuffer = await this.downloadFromCloudinary(doc.cloudinaryUrl)
            const base64Data = imageBuffer.toString('base64')
            rawText = await VisualCortexService.extractImageContent(base64Data, 'image/jpeg')
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
        const metadata = await OrchestratorService.analyzeDocumentMetadata(id, rawText, userPersona)

        // 🧠 2. NEW: Calculate deep Cognitive Load metrics
        console.log(`[AI Worker] Evaluating Cognitive Load...`)
        const loadMetrics = await CognitiveLoadService.evaluateText(rawText)

        // 3. Embed the text into MongoDB Atlas Vector Search
        console.log(`[AI Worker] Embedding chunks into Atlas...`)
        await EmbeddingService.upsert(rawText, id, (doc.user as any)._id.toString())

        // 4. Update the main document with success and new metadata
        await DocumentModel.findByIdAndUpdate(id, {
          extractedText: rawText,
          aiStatus: 'Analyzed',
          summary: metadata.summary,
          tags: metadata.tags,

          // 🛠️ THE FIX: Use the dedicated, detailed deep metrics here
          cognitiveLoad: loadMetrics.load,
          cognitiveScore: loadMetrics.score,
          cognitiveReason: loadMetrics.reason,

          contentType: metadata.type
        })

        console.log(
          `[AI Worker] Document ${id} successfully analyzed, orchestrated, scored, and embedded.`
        )

        // 5. Record token usage for the budget system (fire-and-forget, non-blocking)
        const estimatedTokens = estimateDocumentPipelineTokens(rawText)
        TokenBudgetService.recordUsage((doc.user as any)._id.toString(), estimatedTokens).catch(
          (err) => console.error('[TokenBudget] Failed to record upload usage:', err)
        )
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

  // 3. AI Folder Organization (The Proposal)
  static async generateSemanticProposal(
    userId: string,
    documents: { _id?: string; id?: string; title: string }[]
  ) {
    // 1. Get existing folder paths so the AI doesn't reinvent the wheel
    const existingPaths = await Folder.distinct('path', { user: userId })

    // 2. Extract IDs and fetch the rich semantic metadata from the DB!
    const docIds = documents.map((d) => d._id || d.id).filter(Boolean) as string[]
    const dbDocs = await DocumentModel.find({ _id: { $in: docIds }, user: userId }).select(
      '_id title summary tags fileType contentType isOrganized aiStatus'
    )

    if (dbDocs.length === 0) return []

    // 🛠️ Ensure all documents are fully analyzed before organizing
    const unanalyzedDocs = dbDocs.filter((doc) => doc.aiStatus !== 'Analyzed')
    if (unanalyzedDocs.length > 0) {
      throw new AppError(
        'Please wait until the Neural Cortex finishes analyzing all selected documents before organizing.',
        400
      )
    }

    // 🛠️ Check if any of these documents are already organized to save tokens
    const alreadyOrganizedDocs = dbDocs.filter((doc) => doc.isOrganized)
    if (alreadyOrganizedDocs.length > 0) {
      throw new AppError('One or more selected documents are already organized.', 400)
    }

    // 3. Force the AI to return a strict JSON array using Zod
    const ProposalSchema = z.object({
      updates: z.array(
        z.object({
          documentId: z.string().describe('The exact ID of the document'),
          newPath: z
            .string()
            .describe(
              "The proposed folder path (e.g., 'Finance/Invoices', 'Recipes/Desserts'). Use '/' for nesting."
            )
        })
      )
    })

    // 4. Bind the injected organizer model with structured output
    // Base model is reused from module-level — only the schema binding is local
    const llm = this._organizerModel.withStructuredOutput(ProposalSchema)

    // 5. Prepare the payload (This is why your earlier Orchestrator work was brilliant)
    const docPayload = dbDocs.map((doc) => ({
      id: doc._id.toString(),
      title: doc.title,
      summary: doc.summary, // The AI actually knows what the document is about!
      tags: doc.tags,
      type: doc.contentType || doc.fileType
    }))

    // 6. Define the Librarian Rules
    const systemPrompt = new SystemMessage(`
      You are an elite digital librarian. 
      Your task is to analyze a batch of uploaded documents and organize them into a clean, logical, hierarchical folder structure based on their semantic content.
      
      EXISTING FOLDER PATHS:
      ${existingPaths.length > 0 ? existingPaths.join('\n') : 'No existing folders. You have a blank slate.'}
      
      RULES:
      1. Reuse existing folder paths if they perfectly match the document's content.
      2. If no existing folder fits, invent a new, highly logical nested path (e.g., "Health/Medical Records" or "Personal/Receipts").
      3. Keep paths concise (maximum 3 levels deep).
      4. Group similar documents together.
    `)

    const humanPrompt = new HumanMessage(JSON.stringify(docPayload, null, 2))

    console.log(`[AI Organizer] Proposing folders for ${dbDocs.length} documents...`)

    // 7. Invoke the model
    try {
      const response = await llm.invoke([systemPrompt, humanPrompt])

      // Returns perfectly structured: [{ documentId: "...", newPath: "..." }]
      return response.updates
    } catch (error: any) {
      if (
        error?.status === 429 ||
        error?.message?.includes('429') ||
        error?.message?.includes('rate limit') ||
        error?.message?.includes('Too Many Requests')
      ) {
        throw new AppError('AI provider rate limit exceeded. Please try again later.', 429)
      }
      throw error
    }
  }

  // ==========================================
  // PHYSICAL FOLDER ACTIONS
  // ==========================================

  // 4. Recursive Folder Creation (Optimized with Caching & BulkWrite)
  static async applyPhysicalFolders(
    userId: string,
    updates: { documentId: string; newPath: string }[]
  ) {
    if (!updates || updates.length === 0) return

    // Pre-fetch old folder IDs before moving documents to prune ghost folders afterwards
    const documentIds = updates.map((u) => u.documentId).filter(Boolean)
    const docsToMove = await DocumentModel.find({ _id: { $in: documentIds }, user: userId }).select('folder')
    const oldFolderIds = [...new Set(docsToMove.map(d => d.folder?.toString()).filter(Boolean))]

    // 1. Pre-fetch existing folders into memory (O(1) lookups!)
    const existingFolders = await Folder.find({ user: userId }).select('_id path')
    const folderCache = new Map<string, string>()
    existingFolders.forEach((folder) => {
      folderCache.set(folder.path, folder._id.toString())
    })

    // Array to hold our document updates for a single Bulk transaction
    const documentOperations = []

    // 2. Process each AI proposal
    for (const update of updates) {
      const { documentId, newPath } = update
      if (!documentId || !newPath) continue

      const pathParts = newPath.split('/').filter((p) => p.trim() !== '')
      let currentParentId = null
      let accumulatedPath = ''

      for (const part of pathParts) {
        accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part

        // ⚡ CHECK MEMORY FIRST: If we already know this folder exists, skip the DB!
        if (folderCache.has(accumulatedPath)) {
          currentParentId = folderCache.get(accumulatedPath)
          continue
        }

        // 🛡️ ATOMIC UPSERT: Find it, or create it safely if it doesn't exist
        const upsertedFolder = (await Folder.findOneAndUpdate(
          { name: part, user: userId, parentFolder: currentParentId },
          {
            $setOnInsert: {
              name: part,
              user: userId,
              parentFolder: currentParentId,
              path: accumulatedPath
            }
          },
          { upsert: true, new: true } // Return the newly created/found doc
        )) as any

        currentParentId = upsertedFolder._id.toString()
        // Save the new folder to our memory cache for the next document in the loop
        folderCache.set(accumulatedPath, currentParentId)
      }

      // 3. Queue up the Document update
      documentOperations.push({
        updateOne: {
          filter: { _id: documentId },
          update: {
            $set: {
              folder: currentParentId,
              semanticPath: newPath,
              isOrganized: true // 🛠️ Hides the AI button on the frontend!
            }
          }
        }
      })
    }

    // 4. Execute all document updates in ONE database round-trip
    if (documentOperations.length > 0) {
      await DocumentModel.bulkWrite(documentOperations)
      console.log(
        `[Folder Organizer] Successfully applied ${documentOperations.length} folder updates via BulkWrite.`
      )
    }

    // 5. Clean up / prune any old folders that are now completely empty ghost folders
    if (oldFolderIds.length > 0) {
      for (const oldFolderId of oldFolderIds) {
        let currentId = oldFolderId
        while (currentId) {
          const docCount = await DocumentModel.countDocuments({ folder: currentId })
          const childCount = await Folder.countDocuments({ parentFolder: currentId })

          if (docCount === 0 && childCount === 0) {
            const folderToDelete = await Folder.findById(currentId)
            if (folderToDelete) {
              const parentId = folderToDelete.parentFolder?.toString()
              await Folder.findByIdAndDelete(currentId)
              console.log(`[Folder Organizer] Pruned empty ghost folder: ${folderToDelete.name}`)
              currentId = parentId
            } else {
              break
            }
          } else {
            break
          }
        }
      }
    }
  }

  // ==========================================
  // SEMANTIC SEARCH (GLOBAL)
  // ==========================================

  /**
   * Performs a global semantic search across all documents owned by the user.
   * STRICT SECURITY: preFilter completely isolates the vector space to the specific user.
   */
  static async semanticSearch(userId: string, query: string) {
    // 🛠️ FIX 1: Added the missing 'await'
    const vectorStore = await EmbeddingService.getVectorStore()

    console.log(`[Global Search] Scanning vector space for user ${userId}...`)

    // similaritySearchWithScore returns an array of tuples: [Document, score]
    const results = await vectorStore.similaritySearchWithScore(query, 5, {
      preFilter: {
        // Keep it explicit with $eq just to be absolutely safe with Atlas Search
        userId: { $eq: new mongoose.Types.ObjectId(userId) }
      }
    })

    if (results.length === 0) return []

    // 🛠️ FIX 2: Hydrate the results with actual Document metadata
    // First, extract all unique document IDs from the vector results
    const uniqueDocIds = [...new Set(results.map(([chunk]) => chunk.metadata.documentId))]

    // Fetch the actual document titles and types from MongoDB
    const actualDocuments = await DocumentModel.find({
      _id: { $in: uniqueDocIds }
    }).select('title fileType cloudinaryUrl')

    // Create a lookup dictionary for blazing fast mapping
    const docLookup = actualDocuments.reduce(
      (acc, doc) => {
        acc[doc._id.toString()] = doc
        return acc
      },
      {} as Record<string, any>
    )

    // Map LangChain's raw output into a clean, hydrated frontend structure
    return results.map(([chunk, score]) => {
      const docId = chunk.metadata.documentId.toString()
      const parentDoc = docLookup[docId]

      return {
        text: chunk.pageContent,
        confidenceScore: Number((score * 100).toFixed(2)),
        documentId: docId,
        // Provide the frontend with the UI details it actually needs!
        documentTitle: parentDoc?.title || 'Unknown Document',
        documentType: parentDoc?.fileType || 'Unknown',
        documentUrl: parentDoc?.cloudinaryUrl || null,
        chunkIndex: chunk.metadata.chunkIndex
      }
    })
  }
}
