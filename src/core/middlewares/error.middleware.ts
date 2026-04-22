import { Request, Response, NextFunction } from 'express'
import { AppError } from '../errors/AppError'

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = err.statusCode || 500
  let message = err.message || 'Internal Server Error'

  // 0. Handle our custom AppErrors first!
  if (err instanceof AppError) {
    statusCode = err.statusCode
    message = err.message
  }
  // 1. Mongoose Bad ObjectId (CastError)
  else if (err.name === 'CastError') {
    message = `Resource not found. Invalid format for ${err.path}.`
    statusCode = 400
  }
  // 2. Mongoose Duplicate Key Error (e.g., bypassing our service check)
  else if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0]
    message = `Duplicate field value entered for '${field}'. Please use another value.`
    statusCode = 400
  }
  // 3. Mongoose Validation Error
  else if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((el: any) => el.message)
    message = `Invalid input data. ${errors.join('. ')}`
    statusCode = 400
  }
  // 4. JWT Token Errors
  else if (err.name === 'JsonWebTokenError') {
    message = 'Invalid token. Please log in again.'
    statusCode = 401
  } else if (err.name === 'TokenExpiredError') {
    message = 'Your token has expired! Please log in again.'
    statusCode = 401
  }

  // 5. Send the perfectly standardized JSON response
  res.status(statusCode).json({
    success: false,
    message: message,
    // Only send the detailed stack trace if developing locally
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  })
}
