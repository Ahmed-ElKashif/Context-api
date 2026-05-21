import { ChatGroq } from '@langchain/groq'
import { ChatOpenAI } from '@langchain/openai'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { JsonOutputParser } from '@langchain/core/output_parsers'
import { z } from 'zod'
import { DocumentModel } from '../documents/document.model'
import { DocumentPreviewService, SupportedFileType } from '../ai/pipeline/document-preview.service'

// 1. Define the Comparison Output Schema
const ComparisonSchema = z.object({
  synthesis: z
    .string()
    .describe(
      'A 2-3 sentence overarching summary of how the documents compare, highlighting the most critical shifts or themes.'
    ),
  similarityPercentage: z
    .number()
    .min(0)
    .max(100)
    .describe('An estimated percentage of semantic similarity between 0 and 100.'),
  similarities: z.array(z.string()).describe('Key shared concepts between the two documents.'),
  differences: z.array(z.string()).describe('Key differences between the two documents.'),
  uniqueToA: z.array(z.string()).describe('Important points found ONLY in Document A (Base File).'),
  uniqueToB: z
    .array(z.string())
    .describe('Important points found ONLY in Document B (Comparison File).')
})

export type ComparisonResult = z.infer<typeof ComparisonSchema>

// ─── Module-level defaults (production) ─────────────────────────────────────

// PRIMARY: The "Professor" (70B) — high reasoning capability
const defaultPrimaryLlm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: process.env.GROQ_VERSATILE_COMPARISON_MODEL || 'llama-3.3-70b-versatile',
  temperature: 0.1
})

// FALLBACK: The "Fast Student" (8B) — speed over depth
const defaultFallbackLlm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: process.env.GROQ_INSTANT_COMPARISON_MODEL || 'llama-3.1-8b-instant',
  temperature: 0.1
})

// LAST RESORT: GPT-4o-mini — activated only if both Groq models fail
const defaultLastResortLlm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0.3
})

// Per-document character budget for comparison.
// Two documents share the same context window, so each gets half the orchestrator's
// 80k default (40k each = 80k combined ≈ 20k tokens — safe across all three models).
const MAX_COMPARISON_CHARS_PER_DOC = 40_000

export class DeepThinkerService {
  // ==========================================
  // INJECTED MODELS (injectable for unit tests)
  // ==========================================

  private static _primary: BaseChatModel = defaultPrimaryLlm
  private static _fallback: BaseChatModel = defaultFallbackLlm
  private static _lastResort: BaseChatModel = defaultLastResortLlm

  /**
   * Injection point — called by ModelRegistry at startup.
   * The third `lastResort` parameter is optional so existing unit tests
   * that only inject two mocks continue to work unchanged.
   * @example
   * DeepThinkerService.init(mockPrimary, mockFallback, mockLastResort)
   */
  static init(primary: BaseChatModel, fallback: BaseChatModel, lastResort?: BaseChatModel): void {
    this._primary = primary
    this._fallback = fallback
    if (lastResort) this._lastResort = lastResort
  }

  static async compareDocuments(
    userId: string,
    docIdA: string,
    docIdB: string
  ): Promise<ComparisonResult> {
    const [docA, docB] = await Promise.all([
      DocumentModel.findOne({ _id: docIdA, user: userId }),
      DocumentModel.findOne({ _id: docIdB, user: userId })
    ])

    if (!docA || !docB) throw new Error('Documents not found or unauthorized.')

    // Build a token-safe preview of each document.
    // Each document gets MAX_COMPARISON_CHARS_PER_DOC (40k chars) so that
    // both together stay well within the 128k context limit of all three models.
    // The fileType drives the sampling strategy (windowed text vs. schema-first Excel).
    const previewA = DocumentPreviewService.buildPreview(
      docA.extractedText || '',
      docA.fileType as SupportedFileType,
      MAX_COMPARISON_CHARS_PER_DOC
    )
    const previewB = DocumentPreviewService.buildPreview(
      docB.extractedText || '',
      docB.fileType as SupportedFileType,
      MAX_COMPARISON_CHARS_PER_DOC
    )

    console.log(
      `[DeepThinker] Input sizes — A: ${previewA.length.toLocaleString()} chars, B: ${previewB.length.toLocaleString()} chars (combined: ${(previewA.length + previewB.length).toLocaleString()})`
    )

    const parser = new JsonOutputParser<ComparisonResult>()
    const humanMessage = new HumanMessage(`
      DOCUMENT A:
      ${previewA}

      DOCUMENT B:
      ${previewB}
    `)


    // ==========================================
    // ATTEMPT 1: The 70B Professor
    // ==========================================
    // ==========================================
    // ATTEMPT 1: The 70B Professor
    // ==========================================
    try {
      console.log(`[DeepThinker] Attempt 1: Performing High-Reasoning Comparison with 70B...`)

      const primarySystemMessage = new SystemMessage(`
        You are an expert document analyst specializing in comparative data extraction.
        Analyze the provided documents (A and B) and identify similarities, differences, and unique attributes.
        
        OUTPUT RULES:
        - Return ONLY a raw JSON object.
        - NO introductory text. NO closing remarks. NO markdown formatting.
        - Follow this structure exactly:
        {
          "synthesis": "string (A 2-3 sentence summary explaining the biggest shift between the documents)",
          "similarityPercentage": number (0 to 100),
          "similarities": ["string"],
          "differences": ["string"],
          "uniqueToA": ["string"],
          "uniqueToB": ["string"]
        }
      `)

      const primaryChain = this._primary.pipe(parser)
      const primaryResult = await primaryChain.invoke([primarySystemMessage, humanMessage])

      return ComparisonSchema.parse(primaryResult)
    } catch (primaryError) {
      console.warn(`[DeepThinker] ⚠️ 70B Model failed or timed out. Triggering 8B Fallback...`)
      console.error(
        `[DeepThinker Error Details]:`,
        primaryError instanceof Error ? primaryError.message : 'Unknown Error'
      )

      // ==========================================
      // ATTEMPT 2: The 8B Fallback
      // ==========================================
      try {
        console.log(`[DeepThinker] Attempt 2: Fast-comparing with 8B model...`)

        const fallbackSystemMessage = new SystemMessage(`
          You are a high-precision document analyst. 
          You MUST return your analysis in strict JSON format.
          DO NOT include any introductory text, explanations, or code blocks.
          
          The JSON must follow this exact structure:
          {
            "synthesis": "string (A brief summary of how the documents compare)",
            "similarityPercentage": number (0 to 100),
            "similarities": ["..."],
            "differences": ["..."],
            "uniqueToA": ["..."],
            "uniqueToB": ["..."]
          }
        `)

        const fallbackChain = this._fallback.pipe(parser)
        const fallbackResult = await fallbackChain.invoke([fallbackSystemMessage, humanMessage])

        return ComparisonSchema.parse(fallbackResult)
      } catch (fallbackError) {
        console.warn(`[DeepThinker] ⚠️ 8B model also failed. Triggering GPT-4o-mini last resort...`)
        console.error(
          `[DeepThinker Error Details]:`,
          fallbackError instanceof Error ? fallbackError.message : 'Unknown Error'
        )

        // ==========================================
        // ATTEMPT 3: GPT-4o-mini Last Resort
        // ==========================================
        try {
          console.log(`[DeepThinker] Attempt 3: Last resort — GPT-4o-mini...`)

          const lastResortSystemMessage = new SystemMessage(`
            You are a precise document analyst.
            Return ONLY a raw JSON object with no extra text, no markdown, no code blocks.
            Use this exact structure:
            {
              "synthesis": "string (2-3 sentence summary of how the documents compare)",
              "similarityPercentage": number (0 to 100),
              "similarities": ["string"],
              "differences": ["string"],
              "uniqueToA": ["string"],
              "uniqueToB": ["string"]
            }
          `)

          const lastResortChain = this._lastResort.pipe(parser)
          const lastResortResult = await lastResortChain.invoke([lastResortSystemMessage, humanMessage])

          return ComparisonSchema.parse(lastResortResult)
        } catch (lastResortError) {
          console.error(
            `[DeepThinker] 🚨 FATAL: All three models (70B, 8B, GPT-4o-mini) failed.`
          )
          throw new Error(
            'Our AI engines are currently experiencing high traffic. Please try comparing these documents again in a moment.'
          )
        }
      }
    }
  }
}
