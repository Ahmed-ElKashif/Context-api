import { z } from 'zod'

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    password: z.string().min(6, 'Password must be at least 6 characters').optional()
  })
})
