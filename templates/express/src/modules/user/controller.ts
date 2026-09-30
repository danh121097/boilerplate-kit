import { serializeUser } from "@/modules/user/serialize-user";
import { Request, Response } from "express";
import * as UserService from "@/modules/user/service";

/** List users (admin and above), offset-paginated via ?page&limit. */
export async function listUsers(req: Request, res: Response): Promise<void> {
  const { users, meta } = await UserService.listUsers(req.query);
  res.json({ success: true, data: users.map(serializeUser), meta });
}

/** Get user by ID */
export async function getUserById(req: Request, res: Response): Promise<void> {
  const user = await UserService.getUserById(String(req.params.id));
  res.json({ success: true, data: serializeUser(user) });
}
