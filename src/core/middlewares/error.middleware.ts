import { Request, Response, NextFunction } from 'express'
import { AppError } from '../errors/AppError'

export const globalErrorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = 500
  let message = 'Internal Server Error'

  // Check if the error is one we intentionally threw using our custom class
  if (err instanceof AppError) {
    statusCode = err.statusCode
    message = err.message
  }

  // Send a standardized JSON response to the frontend
  res.status(statusCode).json({
    success: false,
    message: message,
    // Only send the detailed stack trace if you are developing locally
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  })
}
