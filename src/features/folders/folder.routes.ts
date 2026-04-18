import { Router } from "express";
import {
  createFolder,
  getFolderContents,
  renameFolder,
  deleteFolder,
} from "./folder.controller";
import { protect } from "../../core/middlewares/auth.middleware"; // Adjust this path to match your auth middleware!

const router = Router();

// 🛡️ Apply authentication to all folder routes
router.use(protect);

// 📁 Base routes
router.post("/", createFolder);

// 🔍 Fetching (🛠️ THE FIX: Split into two explicit routes)
router.get("/", getFolderContents);          // Fetches the Root directory
router.get("/:folderId", getFolderContents); // Fetches a specific Sub-folder
// ✏️ Updates & Deletions
router.put("/:id/rename", renameFolder);
router.delete("/:id", deleteFolder);

export default router;