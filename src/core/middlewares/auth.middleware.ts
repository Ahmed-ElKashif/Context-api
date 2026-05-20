import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../../features/users/user.model';
import { AppError } from '../errors/AppError'; 

interface JwtPayload {
  id: string;
}

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token;

    // 1. Check if the Authorization header exists or token is in query parameters
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token as string;
    }

    // 2. If no token is found, kick them out
    if (!token) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    // 3. Verify the token (Is it real? Has it expired?)
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;

    // 4. Check if the user belonging to this token still exists in the database
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    // 5. Check if the user has been suspended by an admin
    if (currentUser.isSuspended) {
      return next(new AppError('Your account has been suspended. Please contact support.', 403));
    }

    // 6. SUCCESS! Attach the user object to the request.
    req.user = currentUser; 
    next();
    
  } catch (error) {
    return next(new AppError('Invalid or expired token. Please log in again.', 401));
  }
};