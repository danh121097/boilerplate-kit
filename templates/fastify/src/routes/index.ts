import { config } from "@/config/environment";
import type { FastifyInstance, FastifyPluginAsync, RawServerDefault } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import authRoutes from "@/modules/auth/routes";
import healthRoutes from "@/modules/health/routes";
import userRoutes from "@/modules/user/routes";

const apiRoutes: FastifyPluginAsync = async (app) => {
  app.register(healthRoutes);
  app.register(authRoutes, { prefix: "/auth" });
  app.register(userRoutes, { prefix: "/users" });
};

export function registerApi(
  app: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse>,
): void {
  app.register(apiRoutes, { prefix: config.apiPrefix });
}

export default apiRoutes;
