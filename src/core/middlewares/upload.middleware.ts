import multer from 'multer'
import { AppError } from '../errors/AppError'

// Allowed MIME types — PDFs, Word Docs, Images, and Spreadsheets
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'application/pdf', // PDFs
    'application/msword', // Word (.doc)
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // Word (.docx)
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    // 📊 NEW: Spreadsheet Formats
    'application/vnd.ms-excel', // Excel (.xls)
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Excel (.xlsx)
    'text/csv' // CSVs
  ]

  // Add this line to see exactly what Postman is trying to sneak past the bouncer:
  console.log(`[Multer] Incoming file: ${file.originalname} | MimeType: ${file.mimetype}`)

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(
      new AppError(
        `Rejected: "${file.originalname}" is an unsupported format (${file.mimetype || 'Unknown'}).`,
        400
      )
    )
  }
}

// Files are held in memory as a Buffer and streamed directly to Cloudinary.
// Nothing is ever written to disk.
export const uploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB
  }
})
