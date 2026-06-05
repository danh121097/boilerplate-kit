import { notFoundHandler } from "@/middleware/not-found-handler";
import { describe, it, expect, vi } from "vitest";

describe("notFoundHandler", () => {
  it("returns 404 JSON", () => {
    const req = {} as any;
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);

    notFoundHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      status: "error",
      errorType: "NOT_FOUND",
      message: "Resource not found!",
      error_code: 404,
      error_message: "Resource not found!",
    });
  });
});
