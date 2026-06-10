import { AuthDemoClient } from "./auth-demo-client";
import { getMeServerData } from "@/server/get-me";
import { getUsersServerData } from "@/server/get-users";

/**
 * Cookie-auth demo — resolves session + users ON THE SERVER (forwarded httpOnly
 * cookie + HMAC), then hands off to a client component for login/logout. Needs the
 * Express backend + NEXT_PUBLIC_API_BASE_URL / NEXT_PUBLIC_HMAC_SECRET.
 */

// Force dynamic rendering — this route reads auth cookies on every request.
export const dynamic = "force-dynamic";

export default async function AuthDemoPage() {
  // Both calls run in parallel; null = unauthenticated / backend unreachable.
  const [user, users] = await Promise.all([getMeServerData(), getUsersServerData()]);

  return <AuthDemoClient initialUser={user} initialUsers={users} />;
}
