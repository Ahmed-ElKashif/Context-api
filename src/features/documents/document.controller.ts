// import { Request, Response, NextFunction } from 'express';
// import { IDocument } from './document.model'; /* come in week   */
// import { AppError } from '../../core/errors/AppError';

// @route   POST /api/documents/upload
// @access  Private (Requires JWT)
// export const uploadDocument = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     // req.user is guaranteed to exist because of our requireAuth middleware!
//     const userId = req.user?._id;

//     // Extract metadata from the request body (Frontend sends this alongside the file)
//     const { title, sourceType, folderContext, rawText } = req.body;

//     if (!sourceType) {
//       return next(new AppError('Please provide a sourceType (PDF, Word, Image, TextSnippet)', 400));
//     }

//     // --- SCENARIO A: The Text Snippet (No file, just raw text) ---
//     if (sourceType === 'TextSnippet') {
//       if (!rawText) {
//         return next(new AppError('rawText is required when creating a TextSnippet', 400));
//       }

//       const doc = await IDocument.create({
//         user: userId,
//         title: title || `Snippet: ${rawText.substring(0, 15)}...`, // Auto-generate title if missing
//         sourceType,
//         rawText,
//         cognitiveLoad: 'Light', // Snippets are always light
//         processingStatus: 'Completed', // Text is already extracted, no AI parsing needed yet!
//         folderContext
//       });

//       res.status(201).json({ success: true, data: doc });
//       return;
//     }

//     // --- SCENARIO B: File Upload (PDF, Word, Image) ---
//     if (!req.file) {
//       return next(new AppError('Please upload a valid file', 400));
//     }

//     // MVP Logic: Estimate Cognitive Load based on file size
//     const fileSizeInMB = req.file.size / (1024 * 1024);
//     let estimatedLoad = 'Medium';
//     if (fileSizeInMB < 1) estimatedLoad = 'Light';
//     if (fileSizeInMB > 5) estimatedLoad = 'Heavy';

//     const doc = await IDocument.create({
//       user: userId,
//       title: title || req.file.originalname, // Fallback to original file name
//       sourceType,
//       originalUrl: `/uploads/${req.file.filename}`, // Save the path to the local Multer folder
//       cognitiveLoad: estimatedLoad,
//       processingStatus: 'Pending', // We will build the AI queue later!
//       folderContext
//     });

//     res.status(201).json({ success: true, data: doc });

//   } catch (error) {
//     next(error);
//   }
// };

// this file is currently empty because we moved the upload logic to a new file called upload.controller.ts
//  to keep things organized. The document.controller.ts will eventually hold other document-related endpoints
// like fetching,
//  updating, and deleting documents.
