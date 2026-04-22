import { DocumentModel, IDocument } from '../documents/document.model'
import Folder, { IFolder } from '../folders/folder.model'
import { ChatMessageModel } from './chat.model'

export class AIService {
  // 1. Mock Chat
  static async processChat(documentId: string, message: string) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return {
      reply: `This is a mocked AI response. In the real version, I will read the document and answer your prompt: "${message}"`,
      insights: [
        'The document focuses on modern tech stacks.',
        'There are 3 main action items detected.'
      ],
      riskWarnings: ['Confidential data detected in paragraph 2.']
    }
  }

  // 2. Mock Comparison
  static async compareDocs(doc1Id: string, doc2Id: string) {
    await new Promise((resolve) => setTimeout(resolve, 2500))
    return {
      similarTopics: [
        'Both files discuss project architecture and data flow.',
        'Both emphasize user authentication.'
      ],
      differences: [
        'File 1 focuses on Backend APIs (Node.js).',
        'File 2 focuses on Frontend UI components (React).'
      ],
      uniqueDoc1: ['Mentions Mongoose schemas', 'Discusses JWT limits'],
      uniqueDoc2: ['Mentions Tailwind CSS', 'Discusses Redux state']
    }
  }

  // 3. Mock Folder Organization (The Proposal)
  // 🛠️ THE FIX: Typed exactly to match the frontend Zod payload instead of the Database Model
  static async generateSemanticProposal(
    userId: string,
    documents: { _id?: string; id?: string; title: string }[]
  ) {
    const existingPaths = await Folder.distinct('path', { user: userId })
    await new Promise((resolve) => setTimeout(resolve, 3000))

    return documents.map((doc) => {
      let newPath = 'Miscellaneous'
      // Safely fallback to an empty string if title is missing to prevent crashes
      const titleLower = (doc.title || '').toLowerCase()

      if (titleLower.includes('invoice') || titleLower.includes('tax')) {
        newPath = existingPaths.includes('Finance/Invoices')
          ? 'Finance/Invoices'
          : 'Personal/Finance'
      } else if (titleLower.includes('contract') || titleLower.includes('nda')) {
        newPath = 'Work/Legal'
      } else if (
        titleLower.includes('png') ||
        titleLower.includes('jpg') ||
        titleLower.includes('image')
      ) {
        newPath = 'Media/Images'
      }

      // TypeScript is now perfectly happy with both _id and id!
      return { documentId: doc._id || doc.id, newPath }
    })
  }

  // 4. The Final Boss: Recursive Folder Creation
  // 🛠️ THE FIX: Replaced `any[]` with a strict structural type
  static async applyPhysicalFolders(
    userId: string,
    updates: { documentId: string; newPath: string }[]
  ) {
    for (const update of updates) {
      const { documentId, newPath } = update
      if (!documentId || !newPath) continue

      const pathParts = newPath.split('/').filter((p: string) => p.trim() !== '')
      let currentParentId = null
      let accumulatedPath = ''

      for (const part of pathParts) {
        accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part

        let folder: IFolder | null = await Folder.findOne({
          name: part,
          user: userId,
          parentFolder: currentParentId
        })

        if (!folder) {
          folder = await Folder.create({
            name: part,
            user: userId,
            parentFolder: currentParentId,
            path: accumulatedPath
          })
        }
        currentParentId = folder._id
      }

      await DocumentModel.findByIdAndUpdate(documentId, {
        folder: currentParentId,
        semanticPath: newPath
      })
    }
  }

  // 5. Fetch Chat History
  static async getDocumentHistory(documentId: string, userId: string) {
    const document = await DocumentModel.findOne({ _id: documentId, user: userId })
    if (!document) return null // Let the controller handle the 404

    return await ChatMessageModel.find({ documentId, user: userId })
      .sort({ createdAt: 1 })
      .select('role content createdAt -_id')
  }
}
