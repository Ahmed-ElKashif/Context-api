import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { AppError } from '../errors/AppError'

// 1. Ensure the uploads directory exists
const uploadDir = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// 2. Configure Storage Settings
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Tell Multer to save files in our root 'uploads' folder
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    // Generate a unique filename: <timestamp>-<original-name>
    // Example: 1712258400000-lecture.pdf
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

// 3. Configure File Filter (Security)
// Based on your MVP: PDFs, Word Docs, and Images
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'application/pdf', // PDFs
    'application/msword', // Word (.doc)
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // Word (.docx)
    'image/jpeg', // Images
    'image/png',
    'image/webp'
  ]

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true) // Accept the file
  } else {
    // THE ULTIMATE DEBUGGER: Expose the exact file and its weird MIME type to the frontend
    cb(
      new AppError(
        `Rejected: "${file.originalname}" is an unsupported format (${file.mimetype || 'Unknown'}).`,
        400
      )
    )
  }
}

// 4. Export the configured Multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // Set a 10MB file size limit to prevent server crashes
  }
})
