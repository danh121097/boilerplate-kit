import { requireMinRole } from "@/plugins/role";
import { AppError } from "@/types";
import type { FastifyReply, FastifyRequest } from "fastify";

const reply = {} as FastifyReply;
const requestWith = (role?: string) =>
  ({ user: role ? { userId: "1", email: "a@b.com", role } : null }) as unknown as FastifyRequest;

describe("requireMinRole hook", () => {
  it("passes when the role matches", async () => {
    await expect(requireMinRole("admin")(requestWith("admin"), reply)).resolves.toBeUndefined();
  });

  it("throws 403 AUTHORIZATION_ERROR when the role is too low", async () => {
    await expect(requireMinRole("admin")(requestWith("user"), reply)).rejects.toMatchObject({
      statusCode: 403,
      errorType: "AUTHORIZATION_ERROR",
    });
  });

  it("throws 401 AUTHENTICATION_ERROR when no user is on the request", async () => {
    const rejection = requireMinRole("admin")(requestWith(), reply);
    await expect(rejection).rejects.toBeInstanceOf(AppError);
    await expect(rejection).rejects.toMatchObject({
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  });

  // Hierarchy: super_admin > admin > user. requireMinRole(X) allows X and anything higher.
  it("higher role passes a lower requirement (super_admin on admin route)", async () => {
    await expect(
      requireMinRole("admin")(requestWith("super_admin"), reply),
    ).resolves.toBeUndefined();
  });

  it("admin passes a user-level requirement", async () => {
    await expect(requireMinRole("user")(requestWith("admin"), reply)).resolves.toBeUndefined();
  });

  it("lower role is rejected on a higher requirement (admin on super_admin route)", async () => {
    await expect(requireMinRole("super_admin")(requestWith("admin"), reply)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
