import { ChatOpenAI } from '@langchain/openai'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'

// ─── Module-level defaults (production) ─────────────────────────────────────

// PRIMARY: Groq Llama Vision via OpenAI-compatible URL
const defaultPrimaryVisionModel = new ChatOpenAI({
  apiKey: process.env.GROQ_API_KEY,
  configuration: {
    baseURL: 'https://api.groq.com/openai/v1'
  },
  model: process.env.GROQ_VIRTUAL_CORTEX_MODEL || 'llama-3.2-11b-vision-preview',
  temperature: 0.1,
  maxRetries: 1 // Fail fast — if Groq hiccups, jump to OpenAI immediately
})

// FALLBACK: Official OpenAI gpt-4o-mini
const defaultFallbackVisionModel = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
  temperature: 0.1,
  maxRetries: 2
})

export class VisualCortexService {
  // ==========================================
  // INJECTED MODELS (injectable for unit tests)
  // ==========================================

  private static _primary: BaseChatModel = defaultPrimaryVisionModel
  private static _fallback: BaseChatModel = defaultFallbackVisionModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, inject mocks:
   * @example
   * VisualCortexService.init(mockPrimary, mockFallback)
   */
  static init(primary: BaseChatModel, fallback: BaseChatModel): void {
    this._primary = primary
    this._fallback = fallback
  }

  /**
   * Processes an image to extract OCR text or provide a fallback description.
   */
  static async extractImageContent(
    base64Image: string,
    mimeType: string = 'image/jpeg'
  ): Promise<string> {
    const promptText = `You are a highly accurate OCR engine and visual analyst. 
    1. Extract all readable text from this image. If it is a whiteboard, diagram, or handwritten note, structure the text logically so the relationships and flow make sense.
    2. If there is absolutely NO readable text in the photo, provide a short, concise description of what the photo contains.
    
    Return ONLY the extracted text or the short description. Do not add any conversational filler.`

    const message = new HumanMessage({
      content: [
        {
          type: 'text',
          text: promptText
        },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Image}` }
        }
      ]
    })

    // ==========================================
    // ATTEMPT 1: Groq Llama Vision
    // ==========================================
    try {
      console.log(`[Visual Cortex] Attempt 1: Sending image to Groq Llama Vision...`)

      const response = await this._primary.invoke([message])
      return (response.content as string).trim()
    } catch (primaryError) {
      console.warn(`[Visual Cortex] ⚠️ Groq Vision failed. Triggering gpt-4o-mini fallback...`)
      console.error(
        `[Visual Cortex Error Details]:`,
        primaryError instanceof Error ? primaryError.message : 'Unknown Error'
      )

      // ==========================================
      // ATTEMPT 2: OpenAI gpt-4o-mini
      // ==========================================
      try {
        console.log(`[Visual Cortex] Attempt 2: Sending image to OpenAI gpt-4o-mini...`)

        const fallbackResponse = await this._fallback.invoke([message])
        return (fallbackResponse.content as string).trim()
      } catch (fallbackError) {
        console.error(`[Visual Cortex] 🚨 FATAL: Both Groq and OpenAI Vision models failed.`)
        throw new Error(
          'Our OCR engines are currently experiencing high traffic. Please try uploading the image again.'
        )
      }
    }
  }
}
