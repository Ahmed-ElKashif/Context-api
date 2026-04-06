import mongoose, { Document, Schema } from 'mongoose'

import { IDocument } from '../documents/document.model'

// 1. TypeScript Interface (For autocomplete in VS Code)
export interface IUser extends Document {
  fullName: string // 👈 Renamed from 'name'
  username: string
  email: string
  passwordHash: string

  persona: 'general' | 'professional' | 'student' | 'developer'
  files?: IDocument[] //  (It's optional because it only exists if you populate it)

  createdAt: Date
  updatedAt: Date
}

// 2. Mongoose Schema (The Database Rules)
const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    username: {
      type: String,
      required: true,
      unique: true, // 👈 Usernames must be unique!
      trim: true,
      lowercase: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: { type: String, required: true },
    persona: {
      type: String,
      required: true,
      enum: ['general', 'professional', 'student', 'developer'],
      default: 'general'
    }
  },
  {
    timestamps: true // Automatically manages createdAt and updatedAt
  }
)

// This creates a virtual 'files' field
userSchema.virtual('files', {
  ref: 'Document', // The model to use
  localField: '_id', // Find files where 'user' matches this user's '_id'
  foreignField: 'user' // The field in the Document schema that holds the REFID
})

// You also have to tell Mongoose to include virtuals when converting to JSON
userSchema.set('toJSON', { virtuals: true })
userSchema.set('toObject', { virtuals: true })

export const User = mongoose.model<IUser>('User', userSchema)
