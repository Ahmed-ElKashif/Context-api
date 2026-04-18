import { Request, Response, NextFunction } from "express";
import Folder from "./folder.model";
import { DocumentModel } from "../documents/document.model";
import mongoose from "mongoose";

// Helper to standard responses (Assuming you have an AppError class, if not, standard throw works)
export const createFolder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, parentFolder } = req.body;
    const userId = (req as any).user.id; // Assuming auth.middleware attaches user

    // 1. Check if a folder with this name already exists in this specific location
    const existingFolder = await Folder.findOne({
      name,
      user: userId,
      parentFolder: parentFolder || null,
    });

    if (existingFolder) {
      return res.status(400).json({ error: "A folder with this name already exists here." });
    }

    // 2. Build the breadcrumb path string
    let newPath = name;
    if (parentFolder) {
      const parent = await Folder.findById(parentFolder);
      if (!parent) {
        return res.status(404).json({ error: "Parent folder not found." });
      }
      newPath = `${parent.path}/${name}`;
    }

    // 3. Create the folder
    const folder = await Folder.create({
      name,
      user: userId,
      parentFolder: parentFolder || null,
      path: newPath,
    });

    res.status(201).json({ success: true, data: folder });
  } catch (error) {
    next(error);
  }
};

export const getFolderContents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const { folderId } = req.params; // If "root", we pass "root" or handle it

    const isRoot = !folderId || folderId === "root";
    const targetFolderId = isRoot ? null : new mongoose.Types.ObjectId(folderId as string );

    // 1. Fetch all Sub-Folders in this directory
    const folders = await Folder.find({
      user: userId,
      parentFolder: targetFolderId,
    }).sort({ name: 1 }); // Alphabetical sort

    // 2. Fetch all Documents in this directory
    const documents = await DocumentModel.find({
      user: userId,
      folder: targetFolderId,
    }).sort({ updatedAt: -1 }); // Newest first

    // 3. If we are inside a folder, fetch its details for the UI Breadcrumbs
    let currentFolder = null;
    if (!isRoot) {
      currentFolder = await Folder.findById(targetFolderId);
    }

    res.status(200).json({
      success: true,
      data: {
        currentFolder,
        folders,
        documents,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const renameFolder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { newName } = req.body;
    const userId = (req as any).user.id;

    const folder = await Folder.findOne({ _id: id, user: userId });
    if (!folder) {
      return res.status(404).json({ error: "Folder not found." });
    }

    // Check for naming collisions in the same parent directory
    const collision = await Folder.findOne({
      name: newName,
      parentFolder: folder.parentFolder,
      user: userId,
    });

    if (collision) {
      return res.status(400).json({ error: "Name already in use in this destination." });
    }

    // Update name and regenerate the path string
    const oldName = folder.name;
    folder.name = newName;
    folder.path = folder.path.replace(new RegExp(`${oldName}$`), newName);
    
    await folder.save();

    // Note: In a massive enterprise app, renaming a parent folder would require a background 
    // worker to update the `path` string of all deeply nested child folders. For MVP, this is fine!

    res.status(200).json({ success: true, data: folder });
  } catch (error) {
    next(error);
  }
};

export const deleteFolder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const folder = await Folder.findOne({ _id: id, user: userId });
    if (!folder) {
      return res.status(404).json({ error: "Folder not found." });
    }

    // Safety Check: Prevent deletion if the folder has contents
    // (You can change this to a cascading delete later if you want users to bulk-delete)
    const hasSubFolders = await Folder.exists({ parentFolder: id });
    const hasDocuments = await DocumentModel.exists({ folder: id });

    if (hasSubFolders || hasDocuments) {
      return res.status(400).json({ 
        error: "Folder is not empty. Please delete or move its contents first." 
      });
    }

    await folder.deleteOne();

    res.status(200).json({ success: true, message: "Folder deleted successfully." });
  } catch (error) {
    next(error);
  }
};