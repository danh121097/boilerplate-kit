import { AuthModel } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";

/** What `useLogoutMutation` + its `onSettled` do: the API call, then the local clear even when it fails. */
export async function logoutAndClear(): Promise<void> {
  try {
    await AuthModel.logout();
  } catch {
    // The client signs out regardless.
  } finally {
    useAuthStore.getState().clearSession();
  }
}
