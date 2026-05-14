import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HumanMessage } from '@langchain/core/messages'

export class VisualCortexService {
  // Initialize the Gemini 1.5 Flash model
  private static visionModel = new ChatGoogleGenerativeAI({
    model: 'gemini-1.5-flash',
    temperature: 0.1, // Keep it low to ensure factual OCR without hallucination
    maxRetries: 2
  })

  /**
   * Processes an image to extract OCR text or provide a fallback description.
   * @param base64Image The raw base64 string of the image
   * @param mimeType The image mime type (e.g., 'image/jpeg', 'image/png')
   */
  static async extractImageContent(
    base64Image: string,
    mimeType: string = 'image/jpeg'
  ): Promise<string> {
    // The exact prompt enforcing your fallback requirement
    const promptText = `You are a highly accurate OCR engine and visual analyst. 
    1. Extract all readable text from this image. If it is a whiteboard, diagram, or handwritten note, structure the text logically so the relationships and flow make sense.
    2. If there is absolutely NO readable text in the photo, provide a short, concise description of what the photo contains.
    
    Return ONLY the extracted text or the short description. Do not add any conversational filler.`

    // Construct the Multimodal HumanMessage block per LangChain specs
    const message = new HumanMessage({
      content: [
        {
          type: 'text',
          text: promptText
        },
        {
          type: 'image_url',
          // Format the base64 string as a standard data URI
          image_url: `data:${mimeType};base64,${base64Image}`
        }
      ]
    })

    console.log(`[Visual Cortex] Sending image to Gemini 1.5 Flash for processing...`)

    const response = await this.visionModel.invoke([message])

    return (response.content as string).trim()
  }
}
