import express from 'express'
import dotenv from 'dotenv'
import { connectDB } from './config/db'
import { globalErrorHandler } from './core/middlewares/error.middleware'
import { AppError } from './core/errors/AppError'

// 1. Load environment variables
dotenv.config()

// 2. Connect to the database
connectDB()

const app = express()

// 3. Middlewares for parsing JSON
app.use(express.json())

// [Your API Routes will go here eventually]

// 4. Catch-all for routes that don't exist (404)
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404))
})

// 5. Plug in the Global Error Handler (MUST BE THE VERY LAST APP.USE)
app.use(globalErrorHandler)

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
})
