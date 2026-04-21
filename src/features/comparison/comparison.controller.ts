import { Request, Response, NextFunction } from 'express'
import { DocumentModel } from '../documents/document.model'
// NOTE: Import your AI provider here (OpenAI, Gemini, Claude, etc.)
// import { generateAIResponse } from '../../services/ai.service';

export const compareDocuments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id
    const { documentIds } = req.body

    // 1. Validation
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length !== 2) {
      return res
        .status(400)
        .json({ error: 'Please provide exactly two document IDs for comparison.' })
    }

    const [id1, id2] = documentIds

    // 2. Fetch documents securely (Ensure they belong to the user)
    const doc1 = await DocumentModel.findOne({ _id: id1, user: userId })
    const doc2 = await DocumentModel.findOne({ _id: id2, user: userId })

    if (!doc1 || !doc2) {
      return res.status(404).json({ error: 'One or both documents not found or unauthorized.' })
    }

    // 3. Ensure we have text to compare
    const text1 = doc1.extractedText || doc1.summary
    const text2 = doc2.extractedText || doc2.summary

    if (!text1 || !text2) {
      return res.status(400).json({
        error: 'Both documents must have extracted text or a summary to perform a comparison.'
      })
    }

    // 4. Construct the AI Prompt (Strict JSON output for the frontend)
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
      Document 1 Content: ${text1.substring(0, 5000)} // Truncating to avoid token bloat for MVP

      Document 2 Title: ${doc2.title}
      Document 2 Content: ${text2.substring(0, 5000)}
    `

    // 5. Call your AI Provider (Replace this block with your actual AI calling logic)
    /* const aiResult = await generateAIResponse(systemPrompt, userPrompt);
      const comparisonData = JSON.parse(aiResult);
    */

    // --- MOCK RESPONSE FOR NOW (Until you hook up your specific AI service) ---
    const comparisonData = {
      similarTopics: ['Project timelines', 'Core feature requirements'],
      keyDifferences: ['Doc 1 focuses on frontend, Doc 2 focuses on database architecture'],
      uniqueToDoc1: ['Mentions the React UI component structure'],
      uniqueToDoc2: ['Defines the MongoDB schemas']
    }
    // ------------------------------------------------------------------------

    // 6. Send the structured data to the frontend
    res.status(200).json({
      success: true,
      data: {
        doc1: { _id: doc1._id, title: doc1.title },
        doc2: { _id: doc2._id, title: doc2.title },
        comparison: comparisonData
      }
    })
  } catch (error) {
    next(error)
  }
}
