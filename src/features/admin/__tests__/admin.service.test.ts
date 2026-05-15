import { adminService } from '../admin.service'
import { User } from '../../users/user.model'
import { analyticsService } from '../../analytics/analytics.service'

jest.mock('../../users/user.model', () => ({
  User: {
    find: jest.fn(),
    countDocuments: jest.fn(),
    findById: jest.fn(),
  }
}))

jest.mock('../../analytics/analytics.service', () => ({
  analyticsService: {
    getAdminStats: jest.fn()
  }
}))

describe('AdminService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getStats()', () => {
    it('delegates to analyticsService.getAdminStats', async () => {
      const mockStats = { totalUsers: 10 }
      ;(analyticsService.getAdminStats as jest.Mock).mockResolvedValue(mockStats)

      const result = await adminService.getStats()
      expect(result).toEqual(mockStats)
      expect(analyticsService.getAdminStats).toHaveBeenCalled()
    })
  })

  describe('getUsers()', () => {
    const mockUsers = [{ _id: '1', username: 'test1' }, { _id: '2', username: 'test2' }]

    beforeEach(() => {
      const mockFind = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUsers)
      }
      ;(User.find as jest.Mock).mockReturnValue(mockFind)
      ;(User.countDocuments as jest.Mock).mockResolvedValue(20)
    })

    it('returns paginated users with no search query', async () => {
      const result = await adminService.getUsers({ page: 2, limit: 5 })

      expect(User.find).toHaveBeenCalledWith({})
      expect(User.countDocuments).toHaveBeenCalledWith({})
      expect(result.users).toEqual(mockUsers)
      expect(result.pagination).toEqual({ total: 20, page: 2, limit: 5, totalPages: 4 })
    })

    it('applies search filters', async () => {
      await adminService.getUsers({ search: 'john' })

      expect(User.find).toHaveBeenCalledWith({
        $or: [
          { username: { $regex: 'john', $options: 'i' } },
          { email: { $regex: 'john', $options: 'i' } },
          { fullName: { $regex: 'john', $options: 'i' } }
        ]
      })
    })

    it('falls back to default sort if an invalid sortBy is provided', async () => {
      const mockFind = User.find()
      await adminService.getUsers({ sortBy: 'invalidField', sortOrder: 'asc' })

      expect(mockFind.sort).toHaveBeenCalledWith({ createdAt: 1 })
    })

    it('uses valid sort fields', async () => {
      const mockFind = User.find()
      await adminService.getUsers({ sortBy: 'username', sortOrder: 'desc' })

      expect(mockFind.sort).toHaveBeenCalledWith({ username: -1 })
    })
  })

  describe('toggleSuspend()', () => {
    it('throws error if user not found', async () => {
      ;(User.findById as jest.Mock).mockResolvedValue(null)
      await expect(adminService.toggleSuspend('id1', true)).rejects.toThrow('User not found')
    })

    it('throws error if user is an admin', async () => {
      ;(User.findById as jest.Mock).mockResolvedValue({ role: 'admin' })
      await expect(adminService.toggleSuspend('id1', true)).rejects.toThrow('Cannot suspend an admin account')
    })

    it('updates isSuspended and saves the user', async () => {
      const mockUser = { role: 'user', isSuspended: false, save: jest.fn() }
      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)

      const result = await adminService.toggleSuspend('id1', true)

      expect(mockUser.isSuspended).toBe(true)
      expect(mockUser.save).toHaveBeenCalled()
      expect(result).toBe(mockUser)
    })
  })

  describe('exportUsersCSV()', () => {
    it('generates a CSV string of all users', async () => {
      const mockUsers = [
        {
          username: 'alice',
          email: 'alice@example.com',
          fullName: 'Alice A',
          role: 'user',
          subscriptionStatus: 'active',
          storageUsedBytes: 5000000, // 5.0 MB
          isSuspended: false,
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        },
        {
          username: 'bob',
          email: 'bob@example.com',
          fullName: 'Bob B',
          // missing role defaults to 'user'
          // missing status defaults to 'none'
          // missing storage defaults to 0
          isSuspended: true,
          createdAt: new Date('2026-02-01T00:00:00.000Z')
        }
      ]

      const mockFind = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUsers)
      }
      ;(User.find as jest.Mock).mockReturnValue(mockFind)

      const csv = await adminService.exportUsersCSV()

      const rows = csv.split('\n')
      expect(rows[0]).toBe('Username,Email,Full Name,Role,Status,Storage (MB),Suspended,Joined')
      expect(rows[1]).toBe(`alice,alice@example.com,Alice A,user,active,5.0,No,${new Date('2026-01-01T00:00:00.000Z').toLocaleDateString()}`)
      expect(rows[2]).toBe(`bob,bob@example.com,Bob B,user,none,0.0,Yes,${new Date('2026-02-01T00:00:00.000Z').toLocaleDateString()}`)
    })
  })
})
