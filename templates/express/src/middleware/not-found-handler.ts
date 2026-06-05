import { Request, Response } from "express";

/** Catch-all handler for unmatched routes — returns 404 JSON */
export function notFoundHandler(_req: Request, res: Response): void {
  const message = "Resource not found!";
  res.status(404).json({
    success: false,
    status: "error",
    errorType: "NOT_FOUND",
    message,
    error_code: 404,
    error_message: message,
  });
}
