import { installErrorHandlers } from "@/plugins/error-handlers";
import Fastify from "fastify";

describe("not-found handler", () => {
  it("answers an unknown route with the 404 envelope", async () => {
    const app = Fastify();
    installErrorHandlers(app);

    const res = await app.inject({ method: "GET", url: "/nope" });
    await app.close();

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      success: false,
      status: "error",
      errorType: "NOT_FOUND",
      message: "Resource not found!",
      error_code: 404,
      error_message: "Resource not found!",
    });
  });
});
