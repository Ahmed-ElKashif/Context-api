import mongoose, { Document, Schema } from 'mongoose'

// The specific allowed values based on your MVP
export type DocumentType = 'PDF' | 'Word' | 'Image' | 'TextSnippet'
export type AIStatus = 'Pending' | 'Processing' | 'Analyzed' | 'Failed'
export type CognitiveLoad = 'Light' | 'Medium' | 'Heavy'

export interface IDocument extends Document {
  user: mongoose.Types.ObjectId // Who owns this file?
  title: string
  fileType: DocumentType

  // AI Understanding Fields
  aiStatus: AIStatus
  cognitiveLoad: CognitiveLoad
  summary?: string
  tags: string[]
  extractedText?: string // The raw text for the Semantic Search later

  // Storage & Organization
  folderId?: mongoose.Types.ObjectId // For the "Smart Classification" feature
  originalFilePath?: string // Where the actual PDF/Image lives (AWS S3 or Local)

  createdAt: Date
  updatedAt: Date
}

const documentSchema = new Schema<IDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    fileType: {
      type: String,
      enum: ['PDF', 'Word', 'Image', 'TextSnippet'],
      required: true
    },
    aiStatus: {
      type: String,
      enum: ['Pending', 'Processing', 'Analyzed', 'Failed'],
      default: 'Pending'
    },
    cognitiveLoad: {
      type: String,
      enum: ['Light', 'Medium', 'Heavy'],
      default: 'Light'
    },
    summary: { type: String },
    tags: [{ type: String }],
    extractedText: { type: String },
    folderId: { type: Schema.Types.ObjectId, ref: 'Folder' },
    originalFilePath: { type: String } // Not required for TextSnippets!
  },
  { timestamps: true }
)

export const DocumentModel = mongoose.model<IDocument>('Document', documentSchema)
