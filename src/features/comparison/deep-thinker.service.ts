import { ChatGroq } from '@langchain/groq'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { JsonOutputParser } from '@langchain/core/output_parsers'
import { z } from 'zod'
import { DocumentModel } from '../documents/document.model'

// 1. Define the Comparison Output Schema
const ComparisonSchema = z.object({
  similarities: z.array(z.string()),
  differences: z.array(z.string()),
  uniqueToA: z.array(z.string()),
  uniqueToB: z.array(z.string())
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

export class DeepThinkerService {
  // ==========================================
  // INJECTED MODELS (injectable for unit tests)
  // ==========================================

  private static _primary: BaseChatModel = defaultPrimaryLlm
  private static _fallback: BaseChatModel = defaultFallbackLlm

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, inject mocks:
   * @example
   * DeepThinkerService.init(mockPrimary, mockFallback)
   */
  static init(primary: BaseChatModel, fallback: BaseChatModel): void {
    this._primary = primary
    this._fallback = fallback
  }

  static async compareDocuments(userId: string, docIdA: string, docIdB: string): Promise<ComparisonResult> {
    const [docA, docB] = await Promise.all([
      DocumentModel.findOne({ _id: docIdA, user: userId }),
      DocumentModel.findOne({ _id: docIdB, user: userId })
    ])

    if (!docA || !docB) throw new Error('Documents not found or unauthorized.')

    const parser = new JsonOutputParser<ComparisonResult>()
    const humanMessage = new HumanMessage(`
      DOCUMENT A:
      ${docA.extractedText}

      DOCUMENT B:
      ${docB.extractedText}
    `)

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
        console.error(
          `[DeepThinker] 🚨 FATAL: Both 70B and 8B models failed to parse the documents.`
        )
        throw new Error(
          'Our AI engines are currently experiencing high traffic. Please try comparing these documents again in a moment.'
        )
      }
    }
  }
}
