import { ChatOpenAI } from '@langchain/openai'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { DocumentModel } from '../../documents/document.model'
import { AppError } from '../../../core/errors/AppError'

// ─── Output Schemas (Zod) ────────────────────────────────────────────────────

/**
 * Subfolder node — one level of nesting.
 * Two-level max is intentional: prevents overly deep trees and keeps JSON Schema
 * simple enough for withStructuredOutput() to reliably parse.
 */
const SubfolderSchema = z.object({
  name: z.string().describe('A short, descriptive subfolder name (2–4 words max)'),
  reason: z
    .string()
    .describe('One sentence explaining why these documents are grouped here'),
  documentIds: z
    .array(z.string())
    .describe('Exact document IDs that belong in this subfolder')
})

/**
 * Top-level folder node.
 * documentIds holds docs that live directly here (no subfolder needed).
 * subfolders holds more granular clusters inside this folder.
 */
const FolderNodeSchema = z.object({
  name: z.string().describe('A short, descriptive top-level folder name (2–4 words max)'),
  reason: z
    .string()
    .describe('One sentence explaining why these documents are grouped here'),
  documentIds: z
    .array(z.string())
    .describe('Document IDs that live directly in this folder (NOT in any subfolder)'),
  subfolders: z
    .array(SubfolderSchema)
    .describe('Optional nested subfolders for more granular grouping. Empty array if not needed.')
})

/**
 * Root output schema — wrapped in an object so withStructuredOutput() works reliably.
 * The LLM always returns { folders: [...] }.
 */
const FolderTreeOutputSchema = z.object({
  folders: z
    .array(FolderNodeSchema)
    .describe('The complete proposed folder tree. Every document must appear exactly once.')
})

// ─── Exported Types ───────────────────────────────────────────────────────────

export type SubfolderNode = z.infer<typeof SubfolderSchema>
export type FolderNode = z.infer<typeof FolderNodeSchema>
export type FolderTreeOutput = z.infer<typeof FolderTreeOutputSchema>

// ─── Module-level default (production) ──────────────────────────────────────

const defaultProposerModel = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0.1 // Low temp for consistent, logical clustering
})

// ─── FolderProposerService ───────────────────────────────────────────────────

/**
 * @description Proposes a semantic folder tree for ALL of a user's analyzed documents.
 *
 * Differs from AIService.generateSemanticProposal() which:
 *   - Requires explicit document IDs from the caller
 *   - Returns flat { documentId, newPath }[] pairs
 *   - Is designed for apply-then-write flow
 *
 * FolderProposerService:
 *   - Fetches ALL analyzed docs automatically (no input required)
 *   - Returns a hierarchical FolderTree[] structure
 *   - Is read-only (pure proposal, no DB writes)
 */
export class FolderProposerService {
  // ─── Injected Model (injectable for unit tests) ──────────────────────────

  private static _model: BaseChatModel = defaultProposerModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, inject a mock:
   * @example FolderProposerService.init(mockModel)
   */
  static init(model: BaseChatModel): void {
    this._model = model
  }

  // ─── Core Method ─────────────────────────────────────────────────────────

  /**
   * Fetches all analyzed documents for a user, batches their summaries + tags
   * into a single prompt, and asks GPT-4o-mini to cluster them into a semantic
   * FolderTree via withStructuredOutput().
   *
   * Returns the proposed tree without making any DB changes.
   * Safety cap: processes at most 100 documents per request.
   */
  static async proposeStructure(userId: string): Promise<{
    tree: FolderTreeOutput['folders']
    documentCount: number
    wasCapped: boolean
  }> {
    // ── 0. Ensure no unanalyzed documents exist in the pool ───────────────
    const unanalyzedDocs = await DocumentModel.exists({
      user: userId,
      isOrganized: false,
      aiStatus: { $ne: 'Analyzed' }
    })

    if (unanalyzedDocs) {
      throw new AppError('Please wait until the Neural Cortex finishes analyzing all your unorganized documents before generating a global folder proposal.', 400)
    }

    // ── 1. Fetch all analyzed documents for this user ─────────────────────
    const allDocs = await DocumentModel.find({
      user: userId,
      aiStatus: 'Analyzed',
      isOrganized: false
    })
      .select('_id title summary tags fileType cognitiveLoad')
      .sort({ updatedAt: -1 })
      .limit(101) // fetch one extra to detect if capping occurred

    const wasCapped = allDocs.length > 100
    const docs = allDocs.slice(0, 100)

    if (docs.length < 2) {
      console.log(`[FolderProposer] Not enough documents to cluster (found ${docs.length}).`)
      return {
        tree: [],
        documentCount: docs.length,
        wasCapped: false
      }
    }

    // ── 2. Build a compact JSON payload (summary + tags drive clustering) ──
    const docPayload = docs.map((doc) => ({
      id: doc._id.toString(),
      title: doc.title,
      summary: doc.summary || 'No summary available.',
      tags: doc.tags ?? [],
      type: doc.fileType,
      cognitiveLoad: doc.cognitiveLoad
    }))

    // ── 3. Bind the model with structured output ───────────────────────────
    const llm = this._model.withStructuredOutput(FolderTreeOutputSchema)

    // ── 4. Craft the prompt ────────────────────────────────────────────────
    const systemMessage = new SystemMessage(`
      You are an expert digital librarian and information architect.
      Your task is to analyze a user's document collection and propose
      a clean, logical, hierarchical folder structure.

      INPUT: A JSON array of documents, each with: id, title, summary, tags, type, cognitiveLoad.

      OUTPUT RULES:
      1. Group documents by semantic topic — NOT by file type.
      2. Every document must appear EXACTLY ONCE in the output (either in a folder's documentIds or in a subfolder's documentIds).
      3. Folder names must be concise (2–4 words, Title Case).
      4. Use subfolders only when a group has 4+ documents on a more specific subtopic.
      5. Maximum 2 levels deep (folders → subfolders). No deeper nesting.
      6. Maximum 8 top-level folders. Merge small groups (1–2 docs) under a "Miscellaneous" folder.
      7. Write a clear, one-sentence reason for each folder and subfolder.
      8. Use the exact document IDs from the input — do not invent or modify them.
    `)

    const humanMessage = new HumanMessage(
      `Here are the ${docs.length} documents to organize:\n\n${JSON.stringify(docPayload, null, 2)}`
    )

    // ── 5. Invoke and return ───────────────────────────────────────────────
    console.log(`[FolderProposer] Clustering ${docs.length} documents into semantic folders...`)

    // ⏱️ 60s deadline: this sends up to 100 document summaries in a single call —
    // the most expensive prompt in the system. Still enforce a ceiling.
    const result = await llm.withConfig({ timeout: 60_000 }).invoke([systemMessage, humanMessage])

    console.log(
      `[FolderProposer] Proposed ${result.folders.length} top-level folders for ${docs.length} documents.`
    )

    return {
      tree: result.folders,
      documentCount: docs.length,
      wasCapped
    }
  }
}
