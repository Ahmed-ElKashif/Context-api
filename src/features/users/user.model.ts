import mongoose, { Document, Schema } from 'mongoose'

// 1. TypeScript Interface (For autocomplete in VS Code)
export interface IUser extends Document {
  name: string
  email: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
}

// 2. Mongoose Schema (The Database Rules)
const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: { type: String, required: true }
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
