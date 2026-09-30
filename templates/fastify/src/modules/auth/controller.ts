import { serializeUser } from "@/modules/user/serialize-user";
import { AppError } from "@/types";
import { clearTokenCookies, setTokenCookies } from "@/utils/cookie";
import type { LoginBody, RefreshBody, RegisterBody } from "@/modules/auth/validation";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as AuthService from "@/modules/auth/service";

export async function register(
  request: FastifyRequest<{ Body: RegisterBody }>,
  reply: FastifyReply,
): Promise<unknown> {
  const { email, password, name } = request.body;
  const { user, tokens } = await AuthService.register(email, password, name);
  setTokenCookies(reply, tokens.accessToken, tokens.refreshToken);
  return reply.status(201).send({
    success: true,
    message: "User registered successfully!",
    data: { user: serializeUser(user), tokens },
  });
}

export async function login(
  request: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply,
): Promise<unknown> {
  const { email, password } = request.body;
  const { user, tokens } = await AuthService.login(email, password);
  setTokenCookies(reply, tokens.accessToken, tokens.refreshToken);
  return reply.send({
    success: true,
    message: "Login successful!",
    data: { user: serializeUser(user), tokens },
  });
}

export async function refresh(
  request: FastifyRequest<{ Body: RefreshBody }>,
  reply: FastifyReply,
): Promise<unknown> {
  const refreshToken = request.body?.refreshToken || request.cookies?.refreshToken;
  if (!refreshToken) {
    clearTokenCookies(reply);
    throw new AppError({
      message: "Refresh token not found in request body or cookies!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  try {
    const tokens = await AuthService.refresh(refreshToken);
    setTokenCookies(reply, tokens.accessToken, tokens.refreshToken);
    return reply.send({
      success: true,
      message: "Tokens refreshed successfully!",
      data: { tokens },
    });
  } catch (error) {
    if (error instanceof AppError && (error.statusCode === 401 || error.statusCode === 403)) {
      clearTokenCookies(reply);
    }
    throw error;
  }
}

export async function logout(
  request: FastifyRequest<{ Body: RefreshBody }>,
  reply: FastifyReply,
): Promise<unknown> {
  const refreshToken = request.body?.refreshToken || request.cookies?.refreshToken;
  if (refreshToken) await AuthService.logout(refreshToken);
  clearTokenCookies(reply);
  return reply.send({ success: true, message: "Logged out successfully!" });
}

export async function getMe(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  const user = await AuthService.getMe(request.user!.userId);
  return reply.send({ success: true, data: { user: serializeUser(user) } });
}
