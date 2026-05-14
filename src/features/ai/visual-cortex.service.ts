import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'

export class VisualCortexService {
  // 🛠️ THE ULTIMATE PIVOT: Groq is "OpenAI Compatible".
  // We use the flawless LangChain OpenAI wrapper, but point it at Groq's servers!
  private static visionModel = new ChatOpenAI({
    apiKey: process.env.GROQ_API_KEY, // Pass your Groq key here!
    configuration: {
      baseURL: 'https://api.groq.com/openai/v1' // 🏴‍☠️ Hijack the URL to hit Groq!
    },
    modelName: 'meta-llama/llama-4-scout-17b-16e-instruct',
    temperature: 0.1,
    maxRetries: 2
  })

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

    // Construct the Multimodal block using the standard OpenAI format
    const message = new HumanMessage({
      content: [
        {
          type: 'text',
          text: promptText
        },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Image}` } // Safe standard format
        }
      ]
    })

    console.log(`[Visual Cortex] Sending image to Groq Llama 3.2 Vision (via OpenAI Wrapper)...`)

    const response = await this.visionModel.invoke([message])

    return (response.content as string).trim()
  }
}
