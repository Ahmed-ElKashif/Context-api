import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'
import { AppError } from '../errors/AppError' // Assuming error.middleware is in the same folder

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      })
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.issues.map((err) => err.message).join(', ')
        next(new AppError(`Validation failed: ${errorMessages}`, 400))
      } else {
        next(error)
      }
    }
  }
}
