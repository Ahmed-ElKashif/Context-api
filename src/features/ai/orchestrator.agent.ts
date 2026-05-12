import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { initChatModel } from 'langchain/chat_models/universal'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { HumanMessage, SystemMessage, isAIMessage } from '@langchain/core/messages'

/**
 * @description Defines the output structure expected from the Orchestrator Agent.
 */
export interface DocumentMetadata {
  type: 'PDF' | 'Word' | 'Image' | 'TextSnippet'
  summary: string
  tags: string[]
  cognitiveLoad: 'Light' | 'Medium' | 'Heavy'
}

export class OrchestratorAgent {
  // ==========================================
  // TOOL DEFINITIONS
  // ==========================================

  private static classifyDocument = tool(
    async (args) => {
      // The tool simply returns the validated arguments as a string to the agent trace
      return JSON.stringify(args)
    },
    {
      name: 'classifyDocument',
      description:
        'Call this tool FIRST to classify the document type and generate a concise summary.',
      schema: z.object({
        type: z.enum(['PDF', 'Word', 'Image', 'TextSnippet']),
        summary: z.string().describe('A clear, 2-3 sentence summary of the document content.')
      })
    }
  )

  private static labelCognitiveLoad = tool(
    async (args) => {
      return JSON.stringify(args)
    },
    {
      name: 'labelCognitiveLoad',
      description: 'Call this tool SECOND to evaluate the cognitive load based on text complexity.',
      schema: z.object({
        load: z
          .enum(['Light', 'Medium', 'Heavy'])
          .describe(
            'Light: simple/short. Medium: standard business doc. Heavy: dense, technical, or highly complex.'
          )
      })
    }
  )

  private static generateTags = tool(
    async (args) => {
      return JSON.stringify(args)
    },
    {
      name: 'generateTags',
      description: 'Call this tool THIRD to generate precise semantic tags for the document.',
      schema: z.object({
        tags: z.array(z.string()).describe('An array of 4 to 8 highly specific, descriptive tags.')
      })
    }
  )

  // ==========================================
  // AGENT EXECUTION
  // ==========================================

  /**
   * Invokes the GPT-4o-mini Orchestrator to analyze document text and extract structured metadata.
   * Forces the model to use the defined tools to guarantee type safety via Zod.
   */
  public static async analyzeDocumentMetadata(textPreview: string): Promise<DocumentMetadata> {
    const model = await initChatModel('gpt-4o-mini', {
      temperature: 0.2, // Low temperature for consistent categorization
      maxTokens: 1000
    })

    const tools = [this.classifyDocument, this.labelCognitiveLoad, this.generateTags]

    const systemPrompt = new SystemMessage(`
      You are an elite Document Orchestrator Agent. 
      Your sole responsibility is to analyze the provided document text and extract metadata.
      
      CRITICAL WORKFLOW:
      You MUST call all three tools in this exact order to complete your task:
      1. classifyDocument
      2. labelCognitiveLoad
      3. generateTags
      
      Do not skip any tools. Do not ask follow-up questions.
    `)

    const agent = createReactAgent({
      llm: model,
      tools: tools
    })

    // Execute the agent workflow
    const response = await agent.invoke({
      messages: [
        systemPrompt,
        new HumanMessage(`Analyze the following document text:\n\n${textPreview}`)
      ]
    })

    // ==========================================
    // DATA EXTRACTION
    // ==========================================

    // We iterate through the AI's tool calls in the message history to extract the Zod-validated data
    const metadata: Partial<DocumentMetadata> = {
      tags: []
    }

    const messages = response.messages
    for (const msg of messages) {
      if (isAIMessage(msg) && msg.tool_calls) {
        for (const call of msg.tool_calls) {
          if (call.name === 'classifyDocument') {
            metadata.type = call.args.type
            metadata.summary = call.args.summary
          }
          if (call.name === 'labelCognitiveLoad') {
            metadata.cognitiveLoad = call.args.load
          }
          if (call.name === 'generateTags') {
            metadata.tags = call.args.tags
          }
        }
      }
    }

    // Fallback safeguards to guarantee structural integrity
    return {
      type: metadata.type || 'TextSnippet',
      summary: metadata.summary || 'Summary could not be generated.',
      tags: metadata.tags && metadata.tags.length > 0 ? metadata.tags : ['Uncategorized'],
      cognitiveLoad: metadata.cognitiveLoad || 'Medium'
    }
  }
}
