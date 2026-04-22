import { DocumentModel } from '../documents/document.model'

export class ComparisonService {
  static async performComparison(userId: string, id1: string, id2: string) {
    // 1. Fetch documents securely
    const doc1 = await DocumentModel.findOne({ _id: id1, user: userId })
    const doc2 = await DocumentModel.findOne({ _id: id2, user: userId })

    if (!doc1 || !doc2) {
      return { error: 'One or both documents not found or unauthorized.', statusCode: 404 }
    }

    // 2. Ensure we have text to compare
    const text1 = doc1.extractedText || doc1.summary
    const text2 = doc2.extractedText || doc2.summary

    if (!text1 || !text2) {
      return {
        error: 'Both documents must have extracted text or a summary to perform a comparison.',
        statusCode: 400
      }
    }

    // 3. Construct the AI Prompt (Strict JSON output for the frontend)
    const systemPrompt = `
      You are an expert analytical AI. Your task is to perform a conceptual comparison between two documents.
      Do NOT perform a line-by-line diff. Focus on high-level concepts, overlaps, and unique points.
      
      Respond STRICTLY in the following JSON format:
      {
        "similarTopics": ["string", "string"],
        "keyDifferences": ["string", "string"],
        "uniqueToDoc1": ["string", "string"],
        "uniqueToDoc2": ["string", "string"]
      }
    `

    const userPrompt = `
      Document 1 Title: ${doc1.title}
      Document 1 Content: ${text1.substring(0, 5000)}

      Document 2 Title: ${doc2.title}
      Document 2 Content: ${text2.substring(0, 5000)}
    `

    // --- MOCK RESPONSE FOR NOW ---
    const comparisonData = {
      similarTopics: ['Project timelines', 'Core feature requirements'],
      keyDifferences: ['Doc 1 focuses on frontend, Doc 2 focuses on database architecture'],
      uniqueToDoc1: ['Mentions the React UI component structure'],
      uniqueToDoc2: ['Defines the MongoDB schemas']
    }

    // 4. Return the structured data
    return {
      doc1: { _id: doc1._id, title: doc1.title },
      doc2: { _id: doc2._id, title: doc2.title },
      comparison: comparisonData
    }
  }
}
