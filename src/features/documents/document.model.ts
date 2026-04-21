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
  extractedText?: string

  // Storage & Organization
  originalFilePath?: string

  // --- 🛠️ UPGRADED: Relational Folder Architecture ---
  folder: mongoose.Types.ObjectId | null // Where it ACTUALLY lives right now (null = Root)
  originalClientPath?: string // We keep this temporarily just to remember the drag-and-drop structure
  semanticPath?: string // The AI's "Proposal" string. Not a real folder until accepted!

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
    tags: { type: [String], default: [] },
    extractedText: { type: String },
    originalFilePath: { type: String },

    // --- Relational & Semantic Paths ---
    folder: {
      type: Schema.Types.ObjectId,
      ref: 'Folder',
      default: null // Null means it sits on the main dashboard
    },
    originalClientPath: { type: String, default: '/' },
    semanticPath: { type: String, default: '/' }
  },
  { timestamps: true }
)

// Performance indexing so loading a specific folder is instant
documentSchema.index({ user: 1, folder: 1 })

// 2. 🛠️ NEW: Robust Text Index for Semantic/Keyword Search
documentSchema.index(
  {
    title: 'text',
    tags: 'text',
    summary: 'text',
    extractedText: 'text'
  },
  {
    weights: {
      title: 10, // Highest priority: Filenames
      tags: 5, // High priority: AI-assigned tags
      summary: 2, // Medium priority: AI Summary
      extractedText: 1 // Lowest priority: The deep raw text
    },
    name: 'DocumentTextIndex'
  }
)

export const DocumentModel = mongoose.model<IDocument>('Document', documentSchema)
