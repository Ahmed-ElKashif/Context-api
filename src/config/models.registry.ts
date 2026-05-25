import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'
import { ChatGroq } from '@langchain/groq'
import { OrchestratorService } from '../features/ai/agents/orchestrator.service'
import { SynthesizerAgent } from '../features/ai/agents/synthesizer.service'
import { CognitiveLoadService } from '../features/ai/agents/cognitive-load.service'
import { VisualCortexService } from '../features/ai/agents/visual-cortex.service'
import { DeepThinkerService } from '../features/comparison/deep-thinker.service'
import { EmbeddingService } from '../features/ai/search/vector.service'
import { AIService } from '../features/ai/ai.service'
import { FolderOrganizerService } from '../features/ai/organizer/folder-organizer.service'
import { FolderProposerService } from '../features/ai/organizer/folder-proposer.service'
import { DocumentChatService } from '../features/documents/chat/document-chat.service'
import { ComparisonService } from '../features/comparison/comparison.service'

/**
 * @description Central model registry. Instantiates all LangChain model objects once
 * at server startup and injects them into every AI service via static init() setters.
 *
 * WHY: Enforces SRP — no service constructs its own model.
 * TESTING: In unit tests, bypass this and call Service.init(mockModel) directly in beforeEach().
 *
 * @example
 * // In server.ts — after dotenv loads, before app.listen()
 * ModelRegistry.initialize()
 */
export class ModelRegistry {
  static initialize(): void {
    // ─── Orchestrator (GPT-4o-mini — classify, tag, summarize) ─────────────────
    OrchestratorService.init(
      new ChatOpenAI({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 1000
      })
    )

    // ─── Synthesizer (GPT-4o-mini — bulk document synthesis) ───────────────────
    SynthesizerAgent.init(
      new ChatOpenAI({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 400  // Matches the prompt's 200-250 word constraint
      })
    )

    // ─── Cognitive Load (GPT-4o-mini — reading complexity scoring) ─────────────
    CognitiveLoadService.init(
      new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini',
        temperature: 0.3
      })
    )

    // ─── Visual Cortex (Groq Llama Vision primary, GPT-4o-mini fallback) ───────
    VisualCortexService.init(
      // PRIMARY: Groq Llama Vision via OpenAI-compatible endpoint
      new ChatOpenAI({
        apiKey: process.env.GROQ_API_KEY,
        configuration: {
          baseURL: 'https://api.groq.com/openai/v1'
        },
        model: process.env.GROQ_VIRTUAL_CORTEX_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
        temperature: 0.1,
        maxRetries: 1
      }),
      // FALLBACK: Official OpenAI
      new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini',
        temperature: 0.1,
        maxRetries: 2
      })
    )

    // ─── Deep Thinker (Groq 70B → Groq 8B → GPT-4o-mini) ──────────────────────
    DeepThinkerService.init(
      // PRIMARY: 70B "Professor"
      new ChatGroq({
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_VERSATILE_COMPARISON_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.3
      }),
      // FALLBACK: 8B "Fast Student"
      new ChatGroq({
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_INSTANT_COMPARISON_MODEL || 'llama-3.1-8b-instant',
        temperature: 0.3
      }),
      // LAST RESORT: GPT-4o-mini — activated only if both Groq models fail
      new ChatOpenAI({
        model: 'gpt-4o-mini',
        temperature: 0.3
      })
    )

    // ─── Embedding Service (text-embedding-3-small) ─────────────────────────────
    EmbeddingService.init(
      new OpenAIEmbeddings({
        model: 'text-embedding-3-small',
        dimensions: 1536
      })
    )

    // ─── Folder Organizer (GPT-4o-mini — semantic folder proposals via AI) ────────
    FolderOrganizerService.init(
      new ChatOpenAI({
        model: 'gpt-4o-mini',
        temperature: 0.3
      })
    )

    // ─── Folder Proposer (GPT-4o-mini — full-library semantic tree proposal) ───
    FolderProposerService.init(
      new ChatOpenAI({
        model: 'gpt-4o-mini',
        temperature: 0.3
      })
    )

    // ─── DocumentChatService (GPT-4o-mini — RAG chat with individual documents) ────
    DocumentChatService.init(
      new ChatOpenAI({
        model: 'gpt-4o-mini',
        temperature: 0.4 // Slightly higher temp for conversational RAG responses
      })
    )

    // ─── ComparisonService (GPT-4o-mini — RAG chat with dual compared documents) ────
    ComparisonService.init(
      new ChatOpenAI({
        model: 'gpt-4o-mini',
        temperature: 0.3 // Higher temp for collaborative thought partner
      })
    )

    console.log('[ModelRegistry] ✅ All AI models initialized successfully.')
  }
}
