import { User } from "@/models/user";
import { signAccessToken } from "@/utils/jwt";

interface TestUserOptions {
  email?: string;
  password?: string;
  name?: string;
  role?: "user" | "admin";
}

/** Create a user in the test DB and return it with a valid access token. */
export async function createTestUser(options: TestUserOptions = {}) {
  const user = await User.create({
    email: options.email ?? "test@example.com",
    password: options.password ?? "Password1!",
    name: options.name ?? "Test User",
    role: options.role ?? "user",
  });

  const accessToken = signAccessToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  return { user, accessToken };
}
