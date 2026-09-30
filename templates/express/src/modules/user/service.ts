import { User } from "@/models/user";
import { AppError } from "@/types";
import { buildOffsetMeta, parseOffsetPagination } from "@/utils/pagination";
import type { UserDocument } from "@/types/auth";

/** List users, newest first, offset-paginated via ?page&limit. Password excluded. */
export async function listUsers(query: Record<string, unknown>): Promise<{
  users: UserDocument[];
  meta: ReturnType<typeof buildOffsetMeta>;
}> {
  const { page, limit, skip } = parseOffsetPagination(query);
  const [users, total] = await Promise.all([
    User.find().select("-password").sort({ _id: -1 }).skip(skip).limit(limit),
    User.countDocuments(),
  ]);
  return { users, meta: buildOffsetMeta(total, page, limit) };
}

/** Get a user by ID; throws 404 when missing. Password excluded. */
export async function getUserById(id: string): Promise<UserDocument> {
  const user = await User.findById(id).select("-password");
  if (!user) {
    throw new AppError({
      message: "User not found!",
      statusCode: 404,
      errorType: "NOT_FOUND",
    });
  }
  return user;
}
