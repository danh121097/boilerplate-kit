import { User } from "@/models/user";
import { AppError } from "@/types";
import {
  // buildCursorMeta,
  // parseCursorPagination,
  parseOffsetPagination,
  buildOffsetMeta,
} from "@/utils/pagination";
import { Request, Response } from "express";
// import { Types } from "mongoose";

/** List users (admin and above), offset-paginated via ?page&limit. */
export async function listUsers(req: Request, res: Response): Promise<void> {
  // --- Offset (page/limit)  ---
  const { page, limit, skip } = parseOffsetPagination(req.query);
  const [users, total] = await Promise.all([
    User.find().select("-password").sort({ _id: -1 }).skip(skip).limit(limit),
    User.countDocuments(),
  ]);
  res.json({ status: "success", data: users, meta: buildOffsetMeta(total, page, limit) });

  // --- Cursor (cursor/limit)  ---
  // const { cursor, limit } = parseCursorPagination(req.query);
  // // $lt pairs with sort _id:-1; build the ObjectId so the range compares ids, not strings.
  // const filter = cursor ? { _id: { $lt: new Types.ObjectId(cursor) } } : {};
  // const rows = await User.find(filter)
  //   .select("-password")
  //   .sort({ _id: -1 })
  //   .limit(limit + 1); // +1 row detects hasNext, trimmed off by buildCursorMeta
  // const { items, meta } = buildCursorMeta(rows, limit);
  // res.json({ status: "success", data: items, meta });
}

/** Get user by ID */
export async function getUserById(req: Request, res: Response): Promise<void> {
  const user = await User.findById(req.params.id).select("-password");
  if (!user) {
    throw new AppError({
      message: "User not found!",
      statusCode: 404,
      errorType: "NOT_FOUND",
    });
  }
  res.json({ status: "success", data: user });
}
