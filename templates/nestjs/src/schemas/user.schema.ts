import { ROLES, Role } from "@/common/types/auth.types";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import bcrypt from "bcrypt";

/** Mongoose document type with instance methods. */
export interface UserDocument extends HydratedDocument<User> {
  _id: Types.ObjectId;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

/**
 * User schema — ported from express models/user.ts.
 * password is select:false so it is never returned in queries unless explicitly
 * projected. toJSON strips password + __v. bcrypt rounds = 12.
 */
@Schema({
  timestamps: true,
  toJSON: {
    transform: (_doc, ret: Record<string, unknown>): Record<string, unknown> => {
      delete ret.password;
      delete ret.__v;
      return ret;
    },
  },
})
export class User {
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true, index: true })
  email!: string;

  @Prop({ type: String, required: true, select: false })
  password!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: Object.values(ROLES), default: ROLES.USER })
  role!: Role;

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

/** Hash password before save — mirrors express pre-save hook exactly. */
UserSchema.pre("save", async function (this: UserDocument) {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

/** Compare candidate password against stored bcrypt hash. */
UserSchema.methods.comparePassword = async function (
  this: UserDocument,
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};
