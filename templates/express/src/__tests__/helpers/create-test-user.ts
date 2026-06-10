import { User } from "@/models/user";
import { signAccessToken } from "@/utils/jwt";

interface TestUserOptions {
  email?: string;
  password?: string;
  name?: string;
  role?: "user" | "admin";
}

/** Create a user in test DB and return user + valid access token */
export const createTestUser = async (opts: TestUserOptions = {}) => {
  const user = await User.create({
    email: opts.email ?? "test@example.com",
    password: opts.password ?? "Password1!",
    name: opts.name ?? "Test User",
    role: opts.role ?? "user",
  });

  const accessToken = signAccessToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  return { user, accessToken };
};
