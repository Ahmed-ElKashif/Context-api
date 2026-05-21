import { ChatOpenAI } from '@langchain/openai'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { Runnable } from '@langchain/core/runnables'
import { z } from 'zod'
import { DocumentModel } from '../../documents/document.model'

// 1. Define the Structured Output Schema
const CognitiveLoadSchema = z.object({
  load: z.enum(['Light', 'Medium', 'Heavy']).describe('Categorize the reading difficulty.'),
  score: z
    .number()
    .min(1)
    .max(10)
    .describe('A score from 1 (easy) to 10 (highly dense/technical).'),
  reason: z.string().describe('A 1-sentence explanation of why it received this score.')
})

export type CognitiveLoadResult = z.infer<typeof CognitiveLoadSchema>

// ─── Module-level default (production) ──────────────────────────────────────
// Base model instantiated once. .withStructuredOutput() wraps it into a Runnable.
const defaultBaseModel = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
  temperature: 0.1
})

const defaultAnalyzerModel = defaultBaseModel.withStructuredOutput(CognitiveLoadSchema)

export class CognitiveLoadService {
  // ==========================================
  // INJECTED MODEL (injectable for unit tests)
  // ==========================================

  // Typed as Runnable so both the real withStructuredOutput wrapper
  // and a jest.fn() mock satisfy the interface
  private static _model: Runnable = defaultAnalyzerModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, inject a mock:
   * @example
   * const mockModel = { invoke: jest.fn().mockResolvedValue({ load: 'Heavy', score: 9, reason: 'dense' }) }
   * CognitiveLoadService.init(mockModel as any)
   */
  static init(model: Runnable): void {
    this._model = model
  }

  /**
   * Evaluates the text and returns structured cognitive load metrics.
   */
  static async evaluateText(text: string | undefined): Promise<CognitiveLoadResult> {
    if (!text || text.trim().length === 0) {
      return { load: 'Light', score: 1, reason: 'Document is empty or mostly images.' }
    }

    // Cost-Saver: Only analyze the first ~4000 characters.
    const sampleText = text.substring(0, 4000)

    const systemMessage = new SystemMessage(`
      You are an expert linguistics and reading-comprehension analyst.
      Analyze the provided text sample and determine its cognitive load.
      Look for: Jargon density, sentence complexity, and subject matter accessibility.
    `)

    const humanMessage = new HumanMessage(`TEXT SAMPLE:\n\n${sampleText}`)

    try {
      return (await this._model.invoke([systemMessage, humanMessage])) as CognitiveLoadResult
    } catch (error) {
      console.error('[CognitiveLoad] Evaluation failed:', error)
      return { load: 'Medium', score: 5, reason: 'AI analysis failed; defaulted to Medium.' }
    }
  }

  /**
   * 🚜 BACKFILL JOB: Scans the DB for documents missing advanced analysis and updates them.
   */
  static async backfillExistingDocuments(): Promise<void> {
    console.log(`[Backfill] Starting Cognitive Load backfill job...`)

    const docsToUpdate = await DocumentModel.find({
      $or: [
        { cognitiveScore: { $exists: false } },
        { cognitiveScore: 1, cognitiveReason: { $exists: false } }
      ],
      extractedText: { $exists: true, $ne: '' }
    })

    console.log(`[Backfill] Found ${docsToUpdate.length} documents to analyze.`)

    let successCount = 0

    for (const doc of docsToUpdate) {
      console.log(`[Backfill] Analyzing: "${doc.title}"...`)

      const analysis = await this.evaluateText(doc.extractedText)

      doc.cognitiveLoad = analysis.load
      doc.cognitiveScore = analysis.score
      doc.cognitiveReason = analysis.reason

      await doc.save()
      successCount++

      // Brief pause to respect OpenAI rate limits
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    console.log(`[Backfill] Complete! Successfully updated ${successCount} documents.`)
  }
}
