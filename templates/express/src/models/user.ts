import { ROLES, UserDocument } from "@/types/auth";
import { Schema, model } from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER,
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>): Record<string, unknown> => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

/** Hash password with bcrypt before saving */
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

/** Compare candidate password against stored hash */
userSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const User = model<UserDocument>("User", userSchema);
