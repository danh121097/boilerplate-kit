import { serializeUser } from "@/modules/user/serialize-user";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as UserService from "@/modules/user/service";

interface UserListQuery {
  page?: string;
  limit?: string;
}

interface UserIdParams {
  id: string;
}

export async function listUsers(
  request: FastifyRequest<{ Querystring: UserListQuery }>,
  reply: FastifyReply,
): Promise<unknown> {
  const { users, meta } = await UserService.listUsers({ ...request.query });
  return reply.send({ success: true, data: users.map(serializeUser), meta });
}

export async function getUserById(
  request: FastifyRequest<{ Params: UserIdParams }>,
  reply: FastifyReply,
): Promise<unknown> {
  const user = await UserService.getUserById(request.params.id);
  return reply.send({ success: true, data: serializeUser(user) });
}
