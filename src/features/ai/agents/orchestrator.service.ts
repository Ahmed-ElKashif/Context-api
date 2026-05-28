import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { ChatOpenAI } from '@langchain/openai'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { HumanMessage, SystemMessage, isAIMessage } from '@langchain/core/messages'

/**
 * @description Defines the output structure expected from the Orchestrator Agent.
 */
export interface DocumentMetadata {
  type: 'PDF' | 'Word' | 'Image' | 'TextSnippet' | 'Excel'
  summary: string
  tags: string[]
  cognitiveLoad: 'Light' | 'Medium' | 'Heavy'
}

// ─── Module-level default (production) ──────────────────────────────────────
// Instantiated ONCE per process — not inside a method.
// ModelRegistry.initialize() will call OrchestratorService.init() to override this.
const defaultOrchestratorModel = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0.2,
  maxTokens: 1000
})

export class OrchestratorService {
  // ==========================================
  // INJECTED MODEL (injectable for unit tests)
  // ==========================================

  private static _model: BaseChatModel = defaultOrchestratorModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, call this in beforeEach() to inject a mock model.
   * @example OrchestratorService.init(mockModel)
   */
  static init(model: BaseChatModel): void {
    this._model = model
  }

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
        type: z.enum(['PDF', 'Word', 'Image', 'TextSnippet', 'Excel']),
        summary: z.string().describe('A clear, 7-10 sentence summary of the document content.')
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
   * Invokes the Orchestrator to analyze document text and extract structured metadata.
   * The LLM model is injected — never constructed here (SRP).
   * createReactAgent() stays inside this method intentionally: the LangGraph graph
   * is stateful per thread_id, so a fresh graph is correct per invocation.
   * Only the MODEL is shared and injected.
   */
  public static async analyzeDocumentMetadata(
    documentId: string,
    textPreview: string,
    persona: string = 'general'
  ): Promise<DocumentMetadata> {
    const tools = [this.classifyDocument, this.labelCognitiveLoad, this.generateTags]

    // Dynamic Persona Dictionary
    const personaPrompts: Record<string, string> = {
      general: 'Write a clear, easy-to-understand summary that anyone can digest.',
      professional:
        'Write a concise, executive-level brief focusing on actionable business insights, bottom-line impacts, and key metrics.',
      student:
        'Write an educational summary highlighting key concepts, definitions, and potential study points or exam topics.',
      developer:
        'Write a highly technical summary focusing on architecture, code patterns, algorithms, system design, and technical specifications.'
    }

    const stylingRule = personaPrompts[persona.toLowerCase()] || personaPrompts['general']

    const systemPrompt = new SystemMessage(`
      You are an elite Document Orchestrator Agent. 
      Your sole responsibility is to analyze the provided document text and extract metadata.
      
      CRITICAL INSTRUCTION FOR THE SUMMARY:
      The user who uploaded this document has the persona: "${persona}".
      When generating the summary for the classifyDocument tool, you MUST follow this style:
      ${stylingRule}
      
      CRITICAL LANGUAGE RULE:
      Detect the primary language of the document text provided. Write the summary and all tags 
      in that SAME language. If the document is in Arabic, respond in Arabic. If it is in French, 
      respond in French. Match the document's language exactly.
      
      CRITICAL WORKFLOW:
      You MUST call all three tools in this exact order to complete your task:
      1. classifyDocument
      2. labelCognitiveLoad
      3. generateTags
      
      Do not skip any tools. Do not ask follow-up questions.
    `)

    // createReactAgent uses the injected this._model — not a locally constructed one.
    // No checkpointSaver is provided: this agent does a single-shot 3-tool call and
    // has no need to persist state across invocations. Using MemorySaver with a fixed
    // thread_id caused message history to accumulate on retries, multiplying token usage.
    const agent = createReactAgent({
      llm: this._model,
      tools: tools
    })

    let response

    // Strict Try/Catch on Agent Execution
    try {
      response = await agent.invoke(
        {
          messages: [
            systemPrompt,
            new HumanMessage(`Analyze the following document text:\n\n${textPreview}`)
          ]
        },
        // ⏱️ 60s deadline: the ReAct agent does 3 sequential LLM tool calls.
        // Give it more time than a single call, but still enforce a ceiling.
        { timeout: 60_000 }
      )

      // Log Token Usage
      const aiMessages = response.messages.filter(isAIMessage)
      const lastAiMsg = aiMessages[aiMessages.length - 1]

      const tokens = lastAiMsg?.usage_metadata
      if (tokens) {
        console.log(
          `[Orchestrator Token Usage] Prompt: ${tokens.input_tokens} | Completion: ${tokens.output_tokens} | Total: ${tokens.total_tokens}`
        )
      } else {
        console.log(`[Orchestrator Token Usage] Metrics unavailable for this payload.`)
      }
    } catch (error) {
      console.error('[OrchestratorService] Critical failure during agent invocation:', error)
      throw new Error('Orchestrator execution failed.')
    }

    // ==========================================
    // DATA EXTRACTION
    // ==========================================

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

    return {
      type: metadata.type || 'TextSnippet',
      summary: metadata.summary || 'Summary could not be generated.',
      tags: metadata.tags && metadata.tags.length > 0 ? metadata.tags : ['Uncategorized'],
      cognitiveLoad: metadata.cognitiveLoad || 'Medium'
    }
  }
}
