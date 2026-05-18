import { ChatOpenAI } from '@langchain/openai'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'

// ─── Module-level default (production) ──────────────────────────────────────
const defaultSynthesizerModel = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0.2 // Low temperature for factual synthesis, not creative writing
})

export class SynthesizerAgent {
  // ==========================================
  // INJECTED MODEL (injectable for unit tests)
  // ==========================================

  private static _model: BaseChatModel = defaultSynthesizerModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, call this in beforeEach() to inject a mock model.
   * @example SynthesizerAgent.init(mockModel)
   */
  static init(model: BaseChatModel): void {
    this._model = model
  }

  static async generateBulkSummary(documentsData: string): Promise<string> {
    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are an elite Executive AI Document Synthesizer. You have been provided with rich pre-extracted metadata (Orchestrator summaries, tags, cognitive load scores, and content types) for multiple documents uploaded by the user. Your job is to synthesize these pre-computed insights into a cohesive executive overview without needing or re-analyzing raw text.
        
        GUIDELINES:
        1. Compare and connect the core concepts, common tags, and themes across the provided document summaries.
        2. Highlight how the documents complement each other across their specific subject areas and cognitive complexity.
        3. Even if documents cover distinct topics, group them logically into an executive overview. Never dismiss documents as unrelated.
        4. Format your response beautifully in professional Markdown, using clear headings (###), bulleted takeaways, and bold emphasis.`
      ],
      ['human', 'Here is the data for the selected files:\n{documentsData}']
    ])

    const chain = prompt.pipe(this._model).pipe(new StringOutputParser())

    const response = await chain.invoke({
      documentsData
    })

    return response.trim()
  }
}
