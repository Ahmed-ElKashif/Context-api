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
        `You are a Document Synthesizer. Your job is to review the summaries and tags of multiple files selected by the user.
        
        RULES:
        1. If the files share a core semantic topic or are logically related, write a cohesive 1-paragraph summary connecting them.
        2. If the files are completely unrelated to each other, you MUST reply with exactly this exact string: "The files are not related". Do not add any punctuation or extra words to that string.`
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
