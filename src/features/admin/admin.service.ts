import { User } from '../users/user.model'
import { analyticsService } from '../analytics/analytics.service'
import { TokenBudgetModel } from '../ai/token-budget.model'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GetUsersParams {
  search?: string
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface AIUsageStats {
  totalTokensThisMonth: number
  totalRequestsThisMonth: number
  topUsers: {
    userId: string
    username: string
    email: string
    tokensUsed: number
    requestCount: number
  }[]
  dailyUsage: {
    date: string
    tokensUsed: number
    requestCount: number
  }[]
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const adminService = {

  /**
   * GET /api/admin/stats
   * Delegates to analyticsService for real traffic + storage data.
   */
  async getStats() {
    return await analyticsService.getAdminStats()
  },

  /**
   * GET /api/admin/users
   * Returns a paginated, searchable, sortable list of users.
   */
  async getUsers({ search = '', page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' }: GetUsersParams) {
    const query = search
      ? {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { fullName: { $regex: search, $options: 'i' } }
        ]
      }
      : {}

    const allowedSortFields = ['createdAt', 'fullName', 'username', 'email', 'storageUsedBytes', 'subscriptionStatus', 'role']
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt'
    const safeSortOrder = sortOrder === 'asc' ? 1 : -1

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-passwordHash -avatarPublicId')
        .sort({ [safeSortBy]: safeSortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ])

    // Calculate storage for each user by summing their document fileSizes
    const { DocumentModel } = require('../documents/document.model')
    const userIds = users.map((u) => u._id)
    const storageAgg = await DocumentModel.aggregate([
      { $match: { user: { $in: userIds } } },
      { $group: { _id: '$user', totalBytes: { $sum: '$fileSize' } } }
    ])

    const storageMap = (storageAgg as any[]).reduce((acc: Record<string, number>, item: any) => {
      acc[item._id.toString()] = item.totalBytes
      return acc
    }, {} as Record<string, number>)

    // Attach storage to each user
    const usersWithStorage = users.map((u) => ({
      ...u,
      storageUsedBytes: storageMap[u._id.toString()] || 0
    }))

    return {
      users: usersWithStorage,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }
  },

  /**
   * PATCH /api/admin/users/:id/suspend
   * Toggles the isSuspended flag on a user.
   * Admins cannot be suspended.
   */
  async toggleSuspend(userId: string, suspend: boolean) {
    const user = await User.findById(userId)
    if (!user) throw new Error('User not found')
    if (user.role === 'admin') throw new Error('Cannot suspend an admin account')

    user.isSuspended = suspend
    await user.save()
    return user
  },

  /**
   * GET /api/admin/export/users
   * Returns all users as a CSV string.
   */
  async exportUsersCSV(): Promise<string> {
    const users = await User.find()
      .select('-passwordHash -avatarPublicId')
      .lean()

    // Calculate storage for each user
    const { DocumentModel } = require('../documents/document.model')
    const userIds = users.map((u) => u._id)
    const storageAgg = await DocumentModel.aggregate([
      { $match: { user: { $in: userIds } } },
      { $group: { _id: '$user', totalBytes: { $sum: '$fileSize' } } }
    ])

    const storageMap = (storageAgg as any[]).reduce((acc: Record<string, number>, item: any) => {
      acc[item._id.toString()] = item.totalBytes
      return acc
    }, {} as Record<string, number>)

    const header = 'Username,Email,Full Name,Role,Status,Storage (MB),Suspended,Joined\n'
    const rows = users.map((u) =>
      [
        u.username,
        u.email,
        u.fullName,
        u.role ?? 'user',
        (u as any).subscriptionStatus ?? 'none',
        ((storageMap[u._id.toString()] || 0) / 1e6).toFixed(1),
        u.isSuspended ? 'Yes' : 'No',
        new Date(u.createdAt).toLocaleDateString()
      ].join(',')
    ).join('\n')

    return header + rows
  },

  /**
   * GET /api/admin/ai-usage
   * Returns AI token consumption analytics.
   */
  async getAIUsage(): Promise<AIUsageStats> {
    const now = new Date()
    const firstDayOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const monthKey = firstDayOfMonth.toISOString().split('T')[0]

    // Aggregate this month's total usage
    const monthlyAgg = await TokenBudgetModel.aggregate([
      {
        $match: {
          date: { $gte: monthKey }
        }
      },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: '$tokensUsed' },
          totalRequests: { $sum: '$requestCount' }
        }
      }
    ])

    const totalTokensThisMonth = monthlyAgg[0]?.totalTokens ?? 0
    const totalRequestsThisMonth = monthlyAgg[0]?.totalRequests ?? 0

    // Top users by token consumption (this month)
    const topUsersAgg = await TokenBudgetModel.aggregate([
      {
        $match: {
          date: { $gte: monthKey }
        }
      },
      {
        $group: {
          _id: '$userId',
          tokensUsed: { $sum: '$tokensUsed' },
          requestCount: { $sum: '$requestCount' }
        }
      },
      { $sort: { tokensUsed: -1 } },
      { $limit: 10 }
    ])

    // Hydrate user details
    const userIds = topUsersAgg.map((u) => u._id)
    const users = await User.find({ _id: { $in: userIds } }).select('username email').lean()
    const userMap = users.reduce((acc, u) => {
      acc[u._id.toString()] = u
      return acc
    }, {} as Record<string, any>)

    const topUsers = topUsersAgg.map((u) => ({
      userId: u._id.toString(),
      username: userMap[u._id.toString()]?.username ?? 'Unknown',
      email: userMap[u._id.toString()]?.email ?? 'Unknown',
      tokensUsed: u.tokensUsed,
      requestCount: u.requestCount
    }))

    // Daily usage for the last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const thirtyDaysKey = thirtyDaysAgo.toISOString().split('T')[0]

    const dailyAgg = await TokenBudgetModel.aggregate([
      {
        $match: {
          date: { $gte: thirtyDaysKey }
        }
      },
      {
        $group: {
          _id: '$date',
          tokensUsed: { $sum: '$tokensUsed' },
          requestCount: { $sum: '$requestCount' }
        }
      },
      { $sort: { _id: 1 } }
    ])

    const dailyUsage = dailyAgg.map((d) => ({
      date: d._id,
      tokensUsed: d.tokensUsed,
      requestCount: d.requestCount
    }))

    return {
      totalTokensThisMonth,
      totalRequestsThisMonth,
      topUsers,
      dailyUsage
    }
  },

  /**
   * GET /api/admin/ai-usage/user/:userId
   * Returns AI usage history for a specific user (last 30 days).
   */
  async getUserAIUsage(userId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const thirtyDaysKey = thirtyDaysAgo.toISOString().split('T')[0]

    const records = await TokenBudgetModel.find({
      userId,
      date: { $gte: thirtyDaysKey }
    })
      .sort({ date: 1 })
      .lean()

    return records.map((r) => ({
      date: r.date,
      tokensUsed: r.tokensUsed,
      requestCount: r.requestCount
    }))
  }
}