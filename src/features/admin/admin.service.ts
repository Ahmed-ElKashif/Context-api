import { User } from '../users/user.model'
import { analyticsService } from '../analytics/analytics.service'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GetUsersParams {
  search?: string
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
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

    return {
      users,
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

    const header = 'Username,Email,Full Name,Role,Status,Storage (MB),Suspended,Joined\n'
    const rows = users.map((u) =>
      [
        u.username,
        u.email,
        u.fullName,
        u.role ?? 'user',
        (u as any).subscriptionStatus ?? 'none',
        (((u as any).storageUsedBytes ?? 0) / 1e6).toFixed(1),
        u.isSuspended ? 'Yes' : 'No',
        new Date(u.createdAt).toLocaleDateString()
      ].join(',')
    ).join('\n')

    return header + rows
  }
}