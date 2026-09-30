import { authenticate } from "@/plugins/auth";
import { AppError } from "@/types";
import { signAccessToken } from "@/utils/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";

const reply = {} as FastifyReply;
const token = () => signAccessToken({ userId: "1", email: "a@b.com", role: "user" });
const requestOf = (headers: Record<string, string> = {}, cookies?: Record<string, string>) =>
  ({ headers, cookies }) as unknown as FastifyRequest;

describe("authenticate hook", () => {
  it("sets request.user from a valid Bearer token", async () => {
    const request = requestOf({ authorization: `Bearer ${token()}` });
    await authenticate(request, reply);
    expect(request.user?.userId).toBe("1");
  });

  it("falls back to the accessToken cookie", async () => {
    const request = requestOf({}, { accessToken: token() });
    await authenticate(request, reply);
    expect(request.user?.userId).toBe("1");
  });

  it("prefers a Bearer header over the cookie", async () => {
    const request = requestOf(
      { authorization: `Bearer ${token()}` },
      { accessToken: "cookie-garbage" },
    );
    await authenticate(request, reply);
    expect(request.user?.userId).toBe("1");
  });

  it("throws 401 without a token", async () => {
    const rejection = authenticate(requestOf(), reply);
    await expect(rejection).rejects.toBeInstanceOf(AppError);
    await expect(rejection).rejects.toMatchObject({
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
      message: "Access token required!",
    });
  });

  it("throws 401 with an invalid token", async () => {
    await expect(
      authenticate(requestOf({ authorization: "Bearer invalidtoken" }), reply),
    ).rejects.toMatchObject({ statusCode: 401, message: "Invalid or expired access token!" });
  });

  it("throws 401 for a non-Bearer scheme", async () => {
    await expect(
      authenticate(requestOf({ authorization: "Basic abc" }), reply),
    ).rejects.toMatchObject({ statusCode: 401, message: "Access token required!" });
  });
});
