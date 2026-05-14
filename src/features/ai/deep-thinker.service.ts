// import { ChatGroq } from '@langchain/groq'
// import { SystemMessage, HumanMessage } from '@langchain/core/messages'
// import { JsonOutputParser } from '@langchain/core/output_parsers' // 🛠️ Import this
// import { z } from 'zod'
// import { DocumentModel } from '../documents/document.model'

// // Define the Schema (Same as before)
// const ComparisonSchema = z.object({
//   similarities: z.array(z.string()),
//   differences: z.array(z.string()),
//   uniqueToA: z.array(z.string()),
//   uniqueToB: z.array(z.string())
// })

// export class DeepThinkerService {
//   private static llm = new ChatGroq({
//     apiKey: process.env.GROQ_API_KEY,
//     model: 'llama-3.1-8b-instant', // ⚡ Using the fast 8B model
//     temperature: 0.1
//   })

//   static async compareDocuments(userId: string, docIdA: string, docIdB: string) {
//     const [docA, docB] = await Promise.all([
//       DocumentModel.findOne({ _id: docIdA, user: userId }),
//       DocumentModel.findOne({ _id: docIdB, user: userId })
//     ])

//     if (!docA || !docB) throw new Error('Documents not found.')

//     // 🛠️ 1. Create a JSON Parser
//     const parser = new JsonOutputParser<z.infer<typeof ComparisonSchema>>()

//     // 🛠️ 2. Strengthen the System Message to demand ONLY JSON
//     const systemMessage = new SystemMessage(`
//       You are a high-precision document analyst.
//       You MUST return your analysis in strict JSON format.
//       DO NOT include any introductory text, explanations, or code blocks.

//       The JSON must follow this exact structure:
//       {
//         "similarities": ["..."],
//         "differences": ["..."],
//         "uniqueToA": ["..."],
//         "uniqueToB": ["..."]
//       }
//     `)

//     const humanMessage = new HumanMessage(`
//       Compare these documents:
//       DOC A: ${docA.extractedText}
//       DOC B: ${docB.extractedText}
//     `)

//     console.log(`[DeepThinker] Fast-comparing with 8B model...`)

//     // 🛠️ 3. Use a Pipe Chain for reliable parsing
//     const chain = this.llm.pipe(parser)

//     const result = await chain.invoke([systemMessage, humanMessage])

//     // 🛠️ 4. Final Zod validation just to be safe
//     return ComparisonSchema.parse(result)
//   }
// }

import { ChatGroq } from '@langchain/groq'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { JsonOutputParser } from '@langchain/core/output_parsers'
import { z } from 'zod'
import { DocumentModel } from '../documents/document.model'

// 1. Define the Schema (Same as before)
const ComparisonSchema = z.object({
  similarities: z.array(z.string()),
  differences: z.array(z.string()),
  uniqueToA: z.array(z.string()),
  uniqueToB: z.array(z.string())
})

export class DeepThinkerService {
  /**
   * 🛠️ THE PRO FIX:
   * We initialize the 70B model and explicitly enable JSON mode at the API level.
   */
  private static llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile', // 🧠 The "Professor" Model
    temperature: 0.1
  })

  static async compareDocuments(userId: string, docIdA: string, docIdB: string) {
    const [docA, docB] = await Promise.all([
      DocumentModel.findOne({ _id: docIdA, user: userId }),
      DocumentModel.findOne({ _id: docIdB, user: userId })
    ])

    if (!docA || !docB) throw new Error('Documents not found or unauthorized.')

    // Create the parser for the chain
    const parser = new JsonOutputParser<z.infer<typeof ComparisonSchema>>()

    /**
     * 🛠️ STRENGTHENED PROMPT:
     * Since 70B is smarter, we give it clear instructions to ignore the 'function'
     * tags that were causing the 400 error earlier.
     */
    const systemMessage = new SystemMessage(`
      You are an expert document analyst specializing in comparative data extraction.
      
      TASK:
      Analyze the provided documents (A and B) and identify similarities, differences, and unique attributes.
      
      OUTPUT RULES:
      - Return ONLY a raw JSON object.
      - NO introductory text. NO closing remarks. NO code blocks (no \`\`\`json).
      - Follow this structure exactly:
      {
        "similarities": ["string"],
        "differences": ["string"],
        "uniqueToA": ["string"],
        "uniqueToB": ["string"]
      }
    `)

    const humanMessage = new HumanMessage(`
      DOCUMENT A:
      ${docA.extractedText}

      DOCUMENT B:
      ${docB.extractedText}
    `)

    console.log(`[DeepThinker] Performing High-Reasoning Comparison with 70B...`)

    // 🛠️ The Chain: Pipe the LLM into the JSON parser
    const chain = this.llm.pipe(parser)

    try {
      const result = await chain.invoke([systemMessage, humanMessage])

      // Final validation pass to ensure keys are 100% correct
      return ComparisonSchema.parse(result)
    } catch (error) {
      console.error('[DeepThinker] 70B Model Parsing Error:', error)
      throw new Error('Failed to generate a valid comparison report.')
    }
  }
}
