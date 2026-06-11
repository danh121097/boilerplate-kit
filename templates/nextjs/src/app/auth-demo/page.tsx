import { AuthDemoClient } from "./auth-demo-client";
import { getMeServerData } from "@/server/get-me";
import { getUsersServerData } from "@/server/get-users";

// Force dynamic rendering — this route reads auth cookies on every request.
export const dynamic = "force-dynamic";

export default async function AuthDemoPage() {
  // Both calls run in parallel; null = unauthenticated / backend unreachable.
  const [user, users] = await Promise.all([getMeServerData(), getUsersServerData()]);

  return <AuthDemoClient initialUser={user} initialUsers={users} />;
}
