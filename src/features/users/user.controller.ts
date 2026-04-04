import { Request, Response, NextFunction } from 'express';
import { User } from './user.model';
import { AppError } from '../../core/errors/AppError';
import bcrypt from 'bcryptjs'; 

// @route   GET /api/users/profile
// @access  Private (Requires JWT)
export const getUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // req.user is guaranteed by our requireAuth middleware
    const user = await User.findById(req.user?._id);

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   PUT /api/users/profile
// @access  Private (Requires JWT)
export const updateUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await User.findById(req.user?._id);

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Update the basic fields
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;

    // Because we don't have a schema hook, we hash it manually here!
    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      user.passwordHash = await bcrypt.hash(req.body.password, salt);
    }

    const updatedUser = await user.save();

    res.status(200).json({
      success: true,
      data: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
      },
    });
  } catch (error) {
    next(error);
  }
};