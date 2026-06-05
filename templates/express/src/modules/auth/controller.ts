import { clearTokenCookies, setTokenCookies } from "@/utils/cookie";
import { Request, Response } from "express";
import * as AuthService from "./service";

/** POST /api/auth/register */
export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, name } = req.body;
  const { user, tokens } = await AuthService.register(email, password, name);

  setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

  res.status(201).json({
    success: true,
    message: "User registered successfully!",
    data: { user, tokens },
  });
}

/** POST /api/auth/login */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  const { user, tokens } = await AuthService.login(email, password);

  setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

  res.json({
    success: true,
    message: "Login successful!",
    data: { user, tokens },
  });
}

/** POST /api/auth/refresh */
export async function refresh(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    res.status(401).json({
      success: false,
      message: "Refresh token not found in cookies!",
    });
    return;
  }

  const tokens = await AuthService.refresh(refreshToken);

  setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

  res.json({
    success: true,
    message: "Tokens refreshed successfully!",
    data: { tokens },
  });
}

/** POST /api/auth/logout */
export async function logout(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    await AuthService.logout(refreshToken);
  }

  clearTokenCookies(res);

  res.json({ success: true, message: "Logged out successfully!" });
}

/** GET /api/auth/me */
export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await AuthService.getMe(req.user!.userId);

  res.json({ success: true, data: { user } });
}
