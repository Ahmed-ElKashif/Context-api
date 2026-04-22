import express, { Application, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import mongoSanitize from 'express-mongo-sanitize'
import hpp from 'hpp'
import path from 'path'

import { AppError } from './core/errors/AppError'
import { globalErrorHandler } from './core/middlewares/error.middleware'

// Route Imports
import authRoutes from './features/auth/auth.routes'
import userRoutes from './features/users/user.routes'
import documentRoutes from './features/documents/document.routes'
import aiRoutes from './features/ai/ai.routes'
import folderRoutes from './features/folders/folder.routes'
import comparisonRoutes from './features/comparison/comparison.routes'

const app: Application = express()

// ==========================================
// 🛡️ 1. SECURITY MIDDLEWARES
// ==========================================

// Set security HTTP headers
app.use(helmet())

// Limit repeated requests to public APIs (Prevents brute-force / DDoS)
const limiter = rateLimit({
  max: 1000, // Limit each IP to 1000 requests per window
  windowMs: 60 * 60 * 1000, // 1 Hour
  message: { success: false, error: 'Too many requests from this IP, please try again in an hour.' }
})
app.use('/api', limiter)

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' })) // Prevents massive payload attacks

// Data sanitization against NoSQL query injection (Stops hackers from bypassing auth)
app.use(mongoSanitize())

// Prevent HTTP Parameter Pollution (Stops things like ?sort=name&sort=age crashing the server)
app.use(hpp())

// Implement CORS (Cross-Origin Resource Sharing)
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Only allow your frontend to talk to this API
    credentials: true, // Allow cookies/tokens to be sent
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  })
)

// ==========================================
// ⚙️ 2. UTILITY MIDDLEWARES
// ==========================================

// Log HTTP requests in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'))
}

// Serve the uploads folder as static files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

// ==========================================
// 🚀 3. ROUTES
// ==========================================

// Standardized Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'Context API is running smoothly.' })
})

// Feature Routes
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/folders', folderRoutes)
app.use('/api/comparison', comparisonRoutes)

// 404 Handler for undefined routes
app.all('*', (req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404))
})

// ==========================================
// 🚨 4. GLOBAL ERROR HANDLER
// ==========================================
app.use(globalErrorHandler)

export default app
