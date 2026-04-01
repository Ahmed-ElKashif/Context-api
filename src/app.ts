import express, { Application, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { AppError } from './core/errors/AppError'
import { globalErrorHandler } from './core/middlewares/error.middleware'

import authRoutes from './features/auth/auth.routes'

const app: Application = express()

// Global Middlewares
app.use(helmet()) // Security headers
app.use(cors()) // Allow frontend to communicate
app.use(express.json()) // Parse incoming JSON payloads
app.use(morgan('dev')) // Log HTTP requests in the terminal

// Health Check Route (Good for ensuring the API is awake)
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'Context API is running smoothly.' })
})

app.use('/api/auth', authRoutes)

// 404 Handler for undefined routes
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404))
})

// Plug in the Global Error Handler (MUST be the last middleware)
app.use(globalErrorHandler)

export default app
