import { DocumentService } from '../document.service'
import { DocumentChatService } from '../chat/document-chat.service'
import { DocumentModel } from '../document.model'
import Folder from '../../folders/folder.model'
import { configureCloudinary } from '../../../config/cloudinary'
import { EmbeddingService } from '../../ai/search/vector.service'
import { ChatMessageModel } from '../../ai/models/chat.model'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../document.model')
jest.mock('../../folders/folder.model')
jest.mock('../../ai/vector.service')
jest.mock('../../ai/chat.model')
jest.mock('../../../config/cloudinary', () => ({
  configureCloudinary: jest.fn().mockReturnValue({
    uploader: {
      destroy: jest.fn().mockResolvedValue({ result: 'ok' })
    }
  })
}))

const mockCloudinary = configureCloudinary()

// Mongoose chain mocks for DocumentModel
const mockSelect = jest.fn().mockResolvedValue([])
const mockLimit = jest.fn().mockReturnValue({ select: mockSelect })
const mockSkip = jest.fn().mockReturnValue({ limit: mockLimit })
const mockSort = jest.fn().mockReturnValue({ skip: mockSkip })
const mockFind = jest.fn().mockReturnValue({ sort: mockSort })
;(DocumentModel.find as jest.Mock) = mockFind

// ChatModel mock
const mockChatModelInvoke = jest.fn()
const mockChatModel = { invoke: mockChatModelInvoke }

// Retriever mock
const mockRetrieverInvoke = jest.fn()
const mockAsRetriever = jest.fn().mockReturnValue({ invoke: mockRetrieverInvoke })
;(EmbeddingService.getVectorStore as jest.Mock).mockResolvedValue({
  asRetriever: mockAsRetriever
})

// Mongoose ChatMessageModel chain mocks
const mockChatLimit = jest.fn().mockResolvedValue([])
const mockChatSort2 = jest.fn().mockReturnValue({ limit: mockChatLimit })
const mockChatSelect = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) })
const mockChatSort1 = jest.fn().mockReturnValue({ select: mockChatSelect })
const mockChatFind = jest.fn()
;(ChatMessageModel.find as jest.Mock) = mockChatFind

beforeEach(() => {
  jest.clearAllMocks()
  DocumentChatService.init(mockChatModel as any)

  // Reset chain
  mockFind.mockReturnValue({ sort: mockSort })
  mockSort.mockReturnValue({ skip: mockSkip })
  mockSkip.mockReturnValue({ limit: mockLimit })
  mockLimit.mockReturnValue({ select: mockSelect })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('DocumentService', () => {
  describe('getAll()', () => {
    it('applies basic filters and returns documents and total count', async () => {
      mockSelect.mockResolvedValueOnce([{ _id: 'doc1' }])
      ;(DocumentModel.countDocuments as jest.Mock).mockResolvedValueOnce(1)

      const filters = { fileType: 'PDF' }
      const result = await DocumentService.getAll('user1', filters, 0, 10, 'createdAt', -1)

      expect(mockFind).toHaveBeenCalledWith({ user: 'user1', fileType: 'PDF' })
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 })
      expect(result.documents).toEqual([{ _id: 'doc1' }])
      expect(result.totalDocuments).toBe(1)
    })

    it('escapes and applies regex for semanticPath', async () => {
      mockSelect.mockResolvedValueOnce([])
      ;(DocumentModel.countDocuments as jest.Mock).mockResolvedValueOnce(0)

      const filters = { semanticPath: '/My/Folder/' }
      await DocumentService.getAll('user1', filters, 0, 10, 'createdAt', -1)

      expect(mockFind).toHaveBeenCalledWith({
        user: 'user1',
        semanticPath: { $regex: '^/?My/Folder(/|$)', $options: 'i' }
      })
    })
  })

  describe('updateById()', () => {
    it('updates document fields and touches parent folder if present', async () => {
      const mockDoc = {
        _id: 'doc1',
        title: 'Old',
        folder: 'folder1',
        save: jest.fn().mockResolvedValue(true)
      }
      ;(DocumentModel.findOne as jest.Mock).mockResolvedValueOnce(mockDoc)
      ;(Folder.findByIdAndUpdate as jest.Mock).mockResolvedValueOnce(true)

      const result = await DocumentService.updateById('user1', 'doc1', { title: 'New' })

      expect(result?.title).toBe('New')
      expect(mockDoc.save).toHaveBeenCalled()
      expect(Folder.findByIdAndUpdate).toHaveBeenCalledWith('folder1', {
        updatedAt: expect.any(Date)
      })
    })
  })

  describe('deleteById()', () => {
    it('deletes from db, destroys from cloudinary, and updates parent folder', async () => {
      const mockDoc = {
        _id: 'doc1',
        fileType: 'PDF',
        cloudinaryPublicId: 'pub_id_123',
        folder: 'folder1',
        deleteOne: jest.fn().mockResolvedValue(true)
      }
      ;(DocumentModel.findOne as jest.Mock).mockResolvedValueOnce(mockDoc)
      ;(Folder.findByIdAndUpdate as jest.Mock).mockResolvedValueOnce(true)

      const success = await DocumentService.deleteById('user1', 'doc1')

      expect(success).toBe(true)
      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith('pub_id_123', {
        resource_type: 'image'
      })
      expect(mockDoc.deleteOne).toHaveBeenCalled()
      expect(Folder.findByIdAndUpdate).toHaveBeenCalledWith('folder1', {
        updatedAt: expect.any(Date)
      })
    })
  })

  describe('bulkDelete()', () => {
    it('deletes multiple docs, their assets, and updates unique parent folders', async () => {
      const mockDocs = [
        { _id: 'd1', fileType: 'Word', cloudinaryPublicId: 'c1', folder: 'f1' },
        { _id: 'd2', fileType: 'PDF', cloudinaryPublicId: 'c2', folder: 'f1' },
        { _id: 'd3', fileType: 'Image', cloudinaryPublicId: 'c3', folder: 'f2' }
      ]
      ;(DocumentModel.find as jest.Mock).mockReturnValueOnce(mockDocs)
      ;(DocumentModel.deleteMany as jest.Mock).mockResolvedValueOnce({ deletedCount: 3 })
      ;(Folder.updateMany as jest.Mock).mockResolvedValueOnce(true)

      const res = await DocumentService.bulkDelete('user1', ['d1', 'd2', 'd3'])

      expect(res.deletedCount).toBe(3)
      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledTimes(3)
      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith('c1', { resource_type: 'raw' })
      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith('c2', { resource_type: 'image' })

      // Folder updates - should deduplicate to ['f1', 'f2']
      expect(Folder.updateMany).toHaveBeenCalledWith(
        { _id: { $in: ['f1', 'f2'] } },
        { $set: { updatedAt: expect.any(Date) } }
      )
    })
  })

  describe('chatWithDocument()', () => {
    it('performs vector search, calls LLM, and saves chat history', async () => {
      // Setup memory fetch mock
      const mockMemoryExec = jest.fn().mockResolvedValue([{ role: 'user', content: 'hello' }])
      mockChatFind.mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ exec: mockMemoryExec }) })
      })

      mockRetrieverInvoke.mockResolvedValueOnce([{ pageContent: 'Document context here.' }])
      mockChatModelInvoke.mockResolvedValueOnce({ content: 'AI Answer' })

      const validDocId = '5f8d04f3b54764421b7156d1'
      const validUserId = '5f8d04f3b54764421b7156d2'
      const result = await DocumentChatService.chatWithDocument(validDocId, validUserId, 'What is this?')

      expect(result).toBe('AI Answer')
      expect(mockRetrieverInvoke).toHaveBeenCalledWith('What is this?')
      expect(mockChatModelInvoke).toHaveBeenCalled()
      expect(ChatMessageModel.insertMany).toHaveBeenCalledWith([
        { documentId: validDocId, user: validUserId, role: 'user', content: 'What is this?' },
        { documentId: validDocId, user: validUserId, role: 'assistant', content: 'AI Answer' }
      ])
    })

    it('returns a fallback message if no relevant context is found', async () => {
      mockRetrieverInvoke.mockResolvedValueOnce([]) // No context chunks

      const validDocId = '5f8d04f3b54764421b7156d1'
      const validUserId = '5f8d04f3b54764421b7156d2'
      const result = await DocumentChatService.chatWithDocument(validDocId, validUserId, 'Hello')

      expect(result).toBe(
        "I couldn't find any relevant information in this document to answer your question."
      )
      expect(mockChatModelInvoke).not.toHaveBeenCalled()
    })
  })
})
