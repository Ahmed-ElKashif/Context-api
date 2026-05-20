import mongoose, { Document, Schema } from 'mongoose'
import { IDocument } from '../documents/document.model'

export interface IUser extends Document {
  fullName: string
  username: string
  email: string
  passwordHash: string
  role: 'user' | 'admin'          // ← added
  persona: 'general' | 'professional' | 'student' | 'developer'
  avatar?: string
  avatarPublicId?: string
  isSuspended?: boolean            // ← added (needed by admin suspend endpoint)
  theme?: 'light' | 'dark' | 'system'
  notificationsEnabled?: boolean
  language?: string
  files?: IDocument[]
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    username: {
      type: String,
      required: true,
      unique: true,
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
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'              // every new user is 'user' by default
    },
    persona: {
      type: String,
      required: true,
      enum: ['general', 'professional', 'student', 'developer'],
      default: 'general'
    },
    avatar: { type: String, required: false },
    avatarPublicId: { type: String, required: false },
    isSuspended: { type: Boolean, default: false },
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    notificationsEnabled: {
      type: Boolean,
      default: true
    },
    language: {
      type: String,
      default: 'en'
    }
  },
  {
    timestamps: true
  }
)

userSchema.virtual('files', {
  ref: 'Document',
  localField: '_id',
  foreignField: 'user'
})

userSchema.set('toJSON', { virtuals: true })
userSchema.set('toObject', { virtuals: true })

export const User = mongoose.model<IUser>('User', userSchema)