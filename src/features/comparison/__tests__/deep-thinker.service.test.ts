/**
 * DeepThinkerService — unit tests
 *
 * Strategy:
 * - Mock @langchain/groq so ChatGroq() doesn't throw on missing GROQ_API_KEY at module load
 * - Mock DocumentModel so no MongoDB connection needed
 * - Inject mock primary + fallback models via DeepThinkerService.init()
 * - Each mock model has .pipe() returning { invoke: jest.fn() }
 */

// ─── Mock @langchain/groq FIRST — prevents ChatGroq() throwing on module load ─
jest.mock('@langchain/groq', () => ({
  ChatGroq: jest.fn().mockImplementation(() => ({
    pipe: jest.fn().mockReturnValue({ invoke: jest.fn() })
  }))
}))

// ─── Mock DocumentModel ───────────────────────────────────────────────────────
jest.mock('../../documents/document.model', () => ({
  DocumentModel: {
    findOne: jest.fn()
  }
}))

import { DeepThinkerService } from '../deep-thinker.service'
import { DocumentModel } from '../../documents/document.model'

// ─── Mock models: primary and fallback ───────────────────────────────────────
const mockPrimaryInvoke = jest.fn()
const mockFallbackInvoke = jest.fn()

const mockPrimary = { pipe: jest.fn().mockReturnValue({ invoke: mockPrimaryInvoke }) }
const mockFallback = { pipe: jest.fn().mockReturnValue({ invoke: mockFallbackInvoke }) }

// Sample documents returned by the DB mock
const docA = { _id: 'aaaa', extractedText: 'Neural networks and deep learning principles.' }
const docB = { _id: 'bbbb', extractedText: 'Financial derivatives and risk management.' }

const validComparisonResult = {
  similarities: ['Both are academic papers'],
  differences: ['Different fields'],
  uniqueToA: ['Neural networks'],
  uniqueToB: ['Risk metrics']
}

beforeEach(() => {
  DeepThinkerService.init(mockPrimary as any, mockFallback as any)
  ;(DocumentModel.findOne as jest.Mock).mockResolvedValueOnce(docA).mockResolvedValueOnce(docB)
})

// ─────────────────────────────────────────────────────────────────────────────

describe('DeepThinkerService', () => {
  describe('compareDocuments()', () => {
    it('verifies BOTH documents belong to the requesting user', async () => {
      mockPrimaryInvoke.mockResolvedValueOnce(validComparisonResult)
      await DeepThinkerService.compareDocuments('user1', 'aaaa', 'bbbb')

      const calls = (DocumentModel.findOne as jest.Mock).mock.calls
      expect(calls[0][0]).toEqual({ _id: 'aaaa', user: 'user1' })
      expect(calls[1][0]).toEqual({ _id: 'bbbb', user: 'user1' })
    })

    it('throws "unauthorized" if docA not found for user', async () => {
      ;(DocumentModel.findOne as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce(null) // docA missing
        .mockResolvedValueOnce(docB)

      await expect(DeepThinkerService.compareDocuments('user1', 'aaaa', 'bbbb')).rejects.toThrow(
        'Documents not found or unauthorized.'
      )
    })

    it('returns parsed comparison result from primary model on success', async () => {
      mockPrimaryInvoke.mockResolvedValueOnce(validComparisonResult)
      const result = await DeepThinkerService.compareDocuments('user1', 'aaaa', 'bbbb')
      expect(result).toEqual(validComparisonResult)
    })

    it('falls back to 8B model when primary throws', async () => {
      mockPrimaryInvoke.mockRejectedValueOnce(new Error('70B rate limit'))
      mockFallbackInvoke.mockResolvedValueOnce(validComparisonResult)

      const result = await DeepThinkerService.compareDocuments('user1', 'aaaa', 'bbbb')
      expect(result).toEqual(validComparisonResult)
      expect(mockFallbackInvoke).toHaveBeenCalledTimes(1)
    })

    it('throws descriptive error when BOTH models fail', async () => {
      mockPrimaryInvoke.mockRejectedValueOnce(new Error('70B down'))
      mockFallbackInvoke.mockRejectedValueOnce(new Error('8B down'))

      await expect(DeepThinkerService.compareDocuments('user1', 'aaaa', 'bbbb')).rejects.toThrow(
        'Our AI engines are currently experiencing high traffic'
      )
    })
  })
})
