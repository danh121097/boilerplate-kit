import { User } from "@/models/user";
import { AppError } from "@/types";
import { buildOffsetMeta, parseOffsetPagination } from "@/utils/pagination";
import type { UserDocument } from "@/types/auth";

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
