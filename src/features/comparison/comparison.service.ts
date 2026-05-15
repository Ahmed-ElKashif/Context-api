import { DocumentModel } from '../documents/document.model'
import { DeepThinkerService } from './deep-thinker.service'

export class ComparisonService {
  static async performComparison(userId: string, id1: string, id2: string) {
    // 1. Fetch documents securely — validates ownership and gets metadata for the response
    const [doc1, doc2] = await Promise.all([
      DocumentModel.findOne({ _id: id1, user: userId }),
      DocumentModel.findOne({ _id: id2, user: userId })
    ])

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

    // 3. Delegate AI comparison to DeepThinkerService (70B primary + 8B fallback)
    const comparison = await DeepThinkerService.compareDocuments(userId, id1, id2)

    // 4. Return the structured response with document metadata
    return {
      doc1: { _id: doc1._id, title: doc1.title },
      doc2: { _id: doc2._id, title: doc2.title },
      comparison
    }
  }
}
