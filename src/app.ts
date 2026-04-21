import express, { Application, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { AppError } from './core/errors/AppError'
import { globalErrorHandler } from './core/middlewares/error.middleware'
import path from 'path'

// Route Imports
import authRoutes from './features/auth/auth.routes'
import userRoutes from './features/users/user.routes'
import documentRoutes from './features/documents/document.routes'
import aiRoutes from './features/ai/ai.routes'
import folderRoutes from './features/folders/folder.routes' // 🛠️ NEW: Imported Folder Routes
import comparisonRoutes from './features/comparison/comparison.routes' // 🛠️ Import it

const app: Application = express()

// Global Middlewares
app.use(helmet()) // Security headers
app.use(cors()) // Allow frontend to communicate
app.use(express.json()) // Parse incoming JSON payloads
app.use(morgan('dev')) // Log HTTP requests in the terminal

// Serve the uploads folder as static files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

// Health Check Route (Good for ensuring the API is awake)
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'Context API is running smoothly.' })
})

// Feature Routes
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/folders', folderRoutes) // 🛠️ NEW: Mounted Folder Routes
app.use('/api/comparison', comparisonRoutes) // 🛠️ Mount it here!

// 404 Handler for undefined routes
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404))
})

// Plug in the Global Error Handler (MUST be the last middleware)
app.use(globalErrorHandler)

export default app
