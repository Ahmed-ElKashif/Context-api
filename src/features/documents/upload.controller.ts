import { Request, Response, NextFunction } from 'express'
import { DocumentModel, DocumentType } from './document.model'
import { AppError } from '../../core/errors/AppError'
import Folder, { IFolder } from '../folders/folder.model';

const getFileTypeFromMime = (mimeType: string): DocumentType => {
  if (mimeType.includes('pdf')) return 'PDF'
  if (mimeType.includes('word') || mimeType.includes('officedocument')) return 'Word'
  if (mimeType.includes('image')) return 'Image'
  return 'TextSnippet'
}

// ─── Windows-style duplicate title helpers ────────────────────────────────────

/** Splits "report.pdf" → ["report", ".pdf"], "README" → ["README", ""] */
const splitExtension = (filename: string): [string, string] => {
  const dotIdx = filename.lastIndexOf('.')
  if (dotIdx <= 0) return [filename, '']
  return [filename.slice(0, dotIdx), filename.slice(dotIdx)]
}

/**
 * Per-request cache: folderId (string) → Set of lowercase titles already in DB.
 * Loaded lazily on first access so we never hit the DB more than once per folder per request.
 */
const loadFolderTitles = async (
  userId: string,
  folderId: string,
  cache: Map<string, Set<string>>
): Promise<Set<string>> => {
  if (cache.has(folderId)) return cache.get(folderId)!

  const existing = await DocumentModel.find({ user: userId, folder: folderId }).select('title')
  const titles = new Set<string>(existing.map((d: any) => d.title.toLowerCase()))
  cache.set(folderId, titles)
  return titles
}

/**
 * Given a filename and the set of titles already taken in that folder
 * (DB titles + current batch titles), returns a unique Windows-style name.
 *
 * "report.pdf"    → "report(1).pdf"  when "report.pdf" is taken
 * "report(1).pdf" → "report(2).pdf"  when "report(1).pdf" is taken
 */
const resolveUniqueTitle = (
  filename: string,
  takenTitles: Set<string>
): string => {
  if (!takenTitles.has(filename.toLowerCase())) return filename

  const [base, ext] = splitExtension(filename)
  // Strip any existing trailing (N) so we always increment from a clean base
  const baseMatch = base.match(/^(.*?)\((\d+)\)$/)
  const cleanBase = baseMatch ? baseMatch[1] : base

  let index = 1
  let candidate = `${cleanBase}(${index})${ext}`
  while (takenTitles.has(candidate.toLowerCase())) {
    index++
    candidate = `${cleanBase}(${index})${ext}`
  }
  return candidate
}

// ─────────────────────────────────────────────────────────────────────────────

export const uploadData = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { title, fileType, extractedText, tags, clientPaths } = req.body

    // --- FLOW A: Text Snippets ---
    if (fileType === 'TextSnippet') {
      if (!extractedText) {
        return next(new AppError('extractedText is required for TextSnippets', 400))
      }

      const snippet = await DocumentModel.create({
        user: userId,
        title: title || `Snippet: ${extractedText.substring(0, 20)}...`,
        fileType,
        aiStatus: 'Analyzed',
        cognitiveLoad: 'Light',
        extractedText,
        tags: tags ? JSON.parse(tags) : [],
        originalClientPath: '/',
        semanticPath: '/',
        folder: null
      })

      res.status(201).json({ success: true, count: 1, data: [snippet] })
      return
    }

    // --- FLOW B: Batch Physical Files ---
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return next(new AppError('Please upload at least one valid file', 400))
    }

    let parsedPaths: string[] = []
    if (clientPaths) {
      parsedPaths = Array.isArray(clientPaths) ? clientPaths : [clientPaths]
    }

    const folderCache = new Map<string, any>();
    const docsToInsert = [];

    // dbTitleCache  : folderId → Set of titles already in DB (loaded once per folder per request)
    // batchTitleCache: folderId → Set of titles already assigned in this batch (prevents intra-batch collisions)
    const dbTitleCache = new Map<string, Set<string>>();
    const batchTitleCache = new Map<string, Set<string>>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileSizeMB = file.size / (1024 * 1024)
      let load: 'Light' | 'Medium' | 'Heavy' = 'Medium'
      if (fileSizeMB < 2) load = 'Light'
      if (fileSizeMB > 5) load = 'Heavy'

      const inferredType = getFileTypeFromMime(file.mimetype)
      const originalPath = parsedPaths[i] || `/${file.originalname}`

      // 1. تنظيف المسار من النقطة (.)
      const pathParts = originalPath.split('/').filter(p => p.trim() !== '' && p !== '.');

      // 2. حل ذكي لمسح اسم الملف
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart === file.originalname || lastPart.includes('.')) {
          pathParts.pop();
        }
      }

      // 3. Individual files with no folder path sit at the root (folder: null)
      //    — no virtual "Random files" folder is created.

      let currentParentId = null;
      let accumulatedPath = "";

      if (pathParts.length > 0) {
        const folderPathKey = pathParts.join('/');

        if (folderCache.has(folderPathKey)) {
          currentParentId = folderCache.get(folderPathKey);
        } else {
          for (const part of pathParts) {
            accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;

            let folder: IFolder | null = await Folder.findOne({
              name: part,
              user: userId,
              parentFolder: currentParentId
            });

            if (!folder) {
              folder = await Folder.create({
                name: part,
                user: userId,
                parentFolder: currentParentId,
                path: accumulatedPath,
                isPinned: false
              });
            }
            currentParentId = folder._id;
          }
          folderCache.set(folderPathKey, currentParentId);
        }
      }

      // ── Windows-style title deduplication ──────────────────────────────────
      const folderKey = String(currentParentId)

      // Load existing DB titles for this folder (result is cached after first query)
      const dbTitles = await loadFolderTitles(userId, folderKey, dbTitleCache)

      // Merge: DB titles + titles already reserved in this batch
      const batchTitles = batchTitleCache.get(folderKey) ?? new Set<string>()
      const allTaken = new Set<string>([...dbTitles, ...batchTitles])

      // Find the next available Windows-style name
      const uniqueTitle = resolveUniqueTitle(file.originalname, allTaken)

      // Reserve this title so the next file in the same batch won't collide
      batchTitles.add(uniqueTitle.toLowerCase())
      batchTitleCache.set(folderKey, batchTitles)
      // ───────────────────────────────────────────────────────────────────────

      docsToInsert.push({
        user: userId,
        title: uniqueTitle,           // ← guaranteed unique, Windows-style name
        fileType: inferredType,
        aiStatus: 'Pending',
        cognitiveLoad: load,
        originalFilePath: `/uploads/${file.filename}`,
        originalClientPath: originalPath,
        semanticPath: '/',
        folder: currentParentId,
        tags: tags ? JSON.parse(tags) : []
      })
    }

    const createdDocs = await DocumentModel.insertMany(docsToInsert)

    // 🚀 تحديث تاريخ المجلدات التي تم إضافة ملفات إليها للتو
    const folderIdsToUpdate = [...new Set(docsToInsert.map(doc => doc.folder).filter(id => id !== null))];
    if (folderIdsToUpdate.length > 0) {
      await Folder.updateMany(
        { _id: { $in: folderIdsToUpdate } },
        { $set: { updatedAt: new Date() } }
      );
    }

    res.status(201).json({ success: true, count: createdDocs.length, data: createdDocs })
  } catch (error) {
    next(error)
  }
}