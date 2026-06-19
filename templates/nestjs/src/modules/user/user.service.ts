import { AppException } from "@/common/exceptions/app.exception";
import { OffsetMeta } from "@/common/types/pagination.types";
import { buildOffsetMeta, parseOffsetPagination } from "@/common/utils/pagination.util";
import { User, UserDocument } from "@/schemas/user.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

/**
 * User service — ports express modules/user/controller.ts logic.
 * Password is excluded via .select("-password"); schema toJSON also strips it.
 */
@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  /**
   * List all users with offset pagination (?page&limit).
   * Sorted by _id descending (newest first), password excluded.
   * Returns documents + OffsetMeta for the { status, data, meta } envelope.
   */
  async listUsers(query: Record<string, unknown>): Promise<{ users: UserDocument[]; meta: OffsetMeta }> {
    const { page, limit, skip } = parseOffsetPagination(query);

    const [users, total] = await Promise.all([
      this.userModel.find().select("-password").sort({ _id: -1 }).skip(skip).limit(limit),
      this.userModel.countDocuments(),
    ]);

    return { users, meta: buildOffsetMeta(total, page, limit) };
  }

  /**
   * Get a single user by MongoDB ObjectId string.
   * Throws AppException 404 if not found (password excluded via select).
   */
  async getUserById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).select("-password");
    if (!user) {
      throw new AppException({
        message: "User not found!",
        statusCode: 404,
        errorType: "NOT_FOUND",
      });
    }
    return user;
  }
}
