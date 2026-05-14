import { AnalyticsEvent } from './analytics.model'
import { User } from '../users/user.model'
import { DocumentModel } from '../documents/document.model'

export const analyticsService = {

  /**
   * Track a new analytics event.
   * Called by middleware, frontend tracking, or explicit feature instrumentation.
   */
  async track(event: {
    eventType: string
    userId?: string
    sessionId: string
    route?: string
    method?: string
    statusCode?: number
    duration?: number
    userAgent?: string
    ip?: string
    metadata?: Record<string, any>
    errorMessage?: string
    errorStack?: string
  }) {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 90)  // 90 days from now

    await AnalyticsEvent.create({
      ...event,
      timestamp: new Date(),
      expiresAt
    })
  },

  /**
   * GET /api/admin/stats
   * Aggregates all KPI data for the admin dashboard.
   */
  async getAdminStats() {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)
    twelveMonthsAgo.setDate(1)

    const [
      totalUsers,
      activeUsers,
      trialUsers,
      canceledUsers,
      storageAgg,
      pageViewCount,
      uniqueVisitorCount,
      trafficByMonth,
      storageByMonth
    ] = await Promise.all([
      // User counts
      User.countDocuments(),
      User.countDocuments({ subscriptionStatus: 'active' }),
      User.countDocuments({ subscriptionStatus: 'trial' }),
      User.countDocuments({ subscriptionStatus: 'canceled' }),

      // Total storage (sum of all document file sizes)
      DocumentModel.aggregate([
        { $group: { _id: null, totalBytes: { $sum: '$fileSize' } } }
      ]),

      // Total pageviews (last 30 days)
      AnalyticsEvent.countDocuments({
        eventType: 'pageview',
        timestamp: { $gte: thirtyDaysAgo }
      }),

      // Unique visitors (distinct sessionIds, last 30 days)
      AnalyticsEvent.distinct('sessionId', {
        eventType: 'pageview',
        timestamp: { $gte: thirtyDaysAgo }
      }).then(sessions => sessions.length),

      // Traffic history (last 12 months, grouped by month)
      AnalyticsEvent.aggregate([
        {
          $match: {
            eventType: 'pageview',
            timestamp: { $gte: twelveMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$timestamp' },
              month: { $month: '$timestamp' }
            },
            pageViews: { $sum: 1 },
            uniqueVisitors: { $addToSet: '$sessionId' }
          }
        },
        {
          $project: {
            _id: 1,
            pageViews: 1,
            visitors: { $size: '$uniqueVisitors' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      // Storage growth history (last 12 months, cumulative)
      DocumentModel.aggregate([
        {
          $match: { createdAt: { $gte: twelveMonthsAgo } }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            bytes: { $sum: '$fileSize' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ])

    const totalStorageBytes = storageAgg[0]?.totalBytes ?? 0
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    // Build 12-month traffic history
    const trafficHistory = trafficByMonth.map((m: any) => ({
      date: monthNames[m._id.month - 1],
      pageViews: m.pageViews,
      visitors: m.visitors
    }))

    // Build 12-month storage history (cumulative)
    let cumulativeStorage = 0
    const storageHistory = storageByMonth.map((m: any) => {
      cumulativeStorage += m.bytes
      return {
        date: monthNames[m._id.month - 1],
        storageGB: parseFloat((cumulativeStorage / 1e9).toFixed(2))
      }
    })

    return {
      totalUsers,
      activeUsers,
      trialUsers,
      canceledUsers,
      totalStorageBytes,
      totalPageViews: pageViewCount,
      totalUniqueVisitors: uniqueVisitorCount,
      trafficHistory,
      storageHistory
    }
  },

  /**
   * Get top pages by pageview count (last 30 days).
   */
  async getTopPages(limit = 10) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    return await AnalyticsEvent.aggregate([
      {
        $match: {
          eventType: 'pageview',
          timestamp: { $gte: thirtyDaysAgo },
          route: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$route',
          views: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$sessionId' }
        }
      },
      {
        $project: {
          route: '$_id',
          views: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' }
        }
      },
      { $sort: { views: -1 } },
      { $limit: limit }
    ])
  },

  /**
   * Get feature usage stats (last 30 days).
   */
  async getFeatureUsage() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    return await AnalyticsEvent.aggregate([
      {
        $match: {
          eventType: 'feature_usage',
          timestamp: { $gte: thirtyDaysAgo },
          'metadata.feature': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$metadata.feature',
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          feature: '$_id',
          count: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      },
      { $sort: { count: -1 } }
    ])
  },

  /**
   * Get error summary (last 7 days).
   */
  async getErrorSummary() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    return await AnalyticsEvent.aggregate([
      {
        $match: {
          eventType: 'error',
          timestamp: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            route: '$route',
            message: '$errorMessage'
          },
          count: { $sum: 1 },
          lastSeen: { $max: '$timestamp' }
        }
      },
      {
        $project: {
          route: '$_id.route',
          message: '$_id.message',
          count: 1,
          lastSeen: 1
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ])
  }
}