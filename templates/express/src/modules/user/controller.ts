import { User } from '@/models/user';
import { AppError } from '@/types';
import { Request, Response } from 'express';

/** List all users (admin only) */
export async function listUsers(_req: Request, res: Response): Promise<void> {
  const users = await User.find().select('-password');
  res.json({ status: 'success', data: users });
}

/** Get user by ID */
export async function getUserById(req: Request, res: Response): Promise<void> {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) {
    throw new AppError({
      message: 'User not found!',
      statusCode: 404,
      errorType: 'NOT_FOUND'
    });
  }
  res.json({ status: 'success', data: user });
}
