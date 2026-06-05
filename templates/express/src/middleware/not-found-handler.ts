import { Request, Response } from "express";

/** Catch-all handler for unmatched routes — returns 404 JSON */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: "Resource not found!",
  });
}
