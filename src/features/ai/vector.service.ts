import mongoose from 'mongoose'
import { OpenAIEmbeddings } from '@langchain/openai'
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb'
import { ChunkModel } from '../documents/chunk.model'

/**
 * @description Dedicated service for managing the LangChain MongoDB Vector Store.
 * Isolates all embedding generation and vector database connections away from core business logic.
 */
export class VectorService {
  // 1. Initialize the LangChain Embeddings Model
  // LangChain automatically picks up process.env.OPENAI_API_KEY
  private static embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-3-small',
    dimensions: 1536
  })

  /**
   * Initializes and returns the LangChain VectorStore instance connected to our MongoDB cluster.
   * This is used for both adding new documents (ingestion) and retrieving them (RAG).
   */
  public static getVectorStore(): MongoDBAtlasVectorSearch {
    // We must extract the raw native MongoDB collection from Mongoose to pass to LangChain
    const collection = mongoose.connection.collection(ChunkModel.collection.collectionName)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new MongoDBAtlasVectorSearch(this.embeddings, {
      collection: collection as any, // Cast needed: mongoose & @langchain/mongodb bundle different mongodb versions
      indexName: 'vector_index', // This MUST match the name you typed in the Atlas UI
      textKey: 'text', // The schema field containing the raw text
      embeddingKey: 'embedding' // The schema field containing the 1536 vector array
    })
  }

  /**
   * A helper method to expose the raw embedding model if we ever need to embed
   * a single string manually (e.g., for standard keyword searches).
   */
  public static getEmbeddingsModel(): OpenAIEmbeddings {
    return this.embeddings
  }
}
