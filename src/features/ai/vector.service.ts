import mongoose from 'mongoose'
import { OpenAIEmbeddings } from '@langchain/openai'
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { ChunkModel } from '../documents/chunk.model'

/**
 * @description Dedicated service for managing the LangChain MongoDB Vector Store.
 * Isolates all embedding generation, chunking, and database connections.
 */
export class EmbeddingService {
  // 1. Initialize the LangChain Embeddings Model
  private static embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-3-small',
    dimensions: 1536
  })

  /**
   * Helper to extract the pure Native MongoDB Driver collection from Mongoose.
   * LangChain requires the native driver, not the Mongoose wrapper.
   */
  private static getNativeCollection() {
    // 1. Get the raw MongoClient underlying the Mongoose connection
    const client = mongoose.connection.getClient()
    // 2. Target the active database
    const db = client.db()
    // 3. Return the pure native collection
    return db.collection(ChunkModel.collection.collectionName)
  }

  /**
   * Initializes and returns the LangChain VectorStore instance connected to our MongoDB cluster.
   * Used strictly for RAG retrieval.
   */
  public static getVectorStore(): MongoDBAtlasVectorSearch {
    const collection = this.getNativeCollection()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new MongoDBAtlasVectorSearch(this.embeddings, {
      collection: collection as any,
      indexName: 'vector_index',
      textKey: 'text',
      embeddingKey: 'embedding'
    })
  }

  public static getEmbeddingsModel(): OpenAIEmbeddings {
    return this.embeddings
  }

  /**
   * Slices raw text into semantic chunks and handles the bulk embedding
   * and insertion into MongoDB directly through LangChain.
   */
  public static async upsert(rawText: string, documentId: string, userId: string): Promise<void> {
    // 1. Mirroring the exact separators and chunking strategy from your rag.js prototype
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 512,
      chunkOverlap: 50,
      separators: ['\n\n', '\n', '.', '!', '?']
    })

    // 2. Generate the chunks as LangChain Document objects
    const chunks = await splitter.createDocuments([rawText])

    // 3. Inject strict Mongoose schema requirements into LangChain metadata.
    // We MUST cast the IDs to native ObjectIds so they match the ChunkModel schema types.
    const mappedChunks = chunks.map((chunk, index) => {
      chunk.metadata = {
        documentId: new mongoose.Types.ObjectId(documentId),
        userId: new mongoose.Types.ObjectId(userId),
        chunkIndex: index
      }
      return chunk
    })

    // 4. Extract the native collection to bypass Mongoose's wrapper
    const collection = this.getNativeCollection()

    // 5. Hand off to LangChain for bulk embedding and insertion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await MongoDBAtlasVectorSearch.fromDocuments(mappedChunks, this.embeddings, {
      collection: collection as any,
      indexName: 'vector_index',
      textKey: 'text',
      embeddingKey: 'embedding'
    })
  }
}
