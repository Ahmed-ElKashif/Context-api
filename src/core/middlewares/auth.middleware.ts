import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../../features/users/user.model';
import { AppError } from '../errors/AppError'; 

// Define the shape of our JWT payload based on what we signed in auth.controller.ts
interface JwtPayload {
  id: string;
}

// 🛠️ UPGRADE: Renamed from requireAuth to protect to match our routes!
export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token;

    // 1. Check if the Authorization header exists and starts with "Bearer"
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      // Split "Bearer <token>" and grab just the token part
      token = req.headers.authorization.split(' ')[1];
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

    // 5. SUCCESS! Attach the user object to the request.
    // Now, any controller that runs AFTER this middleware can access req.user!
    // (Note: This assumes you have defined req.user in your src/core/types/express.d.ts file)
    (req as any).user = currentUser; 
    next();
    
  } catch (error) {
    // If jwt.verify fails (e.g., token expired or tampered with), it throws an error
    return next(new AppError('Invalid or expired token. Please log in again.', 401));
  }
};