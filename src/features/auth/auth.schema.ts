import { z } from 'zod'

export const registerSchema = z.object({
  body: z.object({
    name: z
      .string({ error: 'Name is required' })
      .min(2, { error: 'Name must be at least 2 characters' }),

    // Notice how z.email() is now a top-level function!
    email: z.email({ error: 'Invalid email address format' }),

    password: z
      .string({ error: 'Password is required' })
      .min(6, { error: 'Password must be at least 6 characters long' })
  })
})

export const loginSchema = z.object({
  body: z.object({
    email: z.email({ error: 'Invalid email address format' }),
    password: z
      .string({ error: 'Password is required' })
      .min(1, { error: 'Password cannot be empty' })
  })
})
