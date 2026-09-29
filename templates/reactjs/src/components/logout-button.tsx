import { useLogoutMutation } from "@/services/auth";

/**
 * Nav logout control. Disabled while the request is pending; `onSettled` (not
 * `onSuccess`) routes to plain `/login`, because the client session ends even
 * when the server call fails.
 */
export function LogoutButton() {
  const navigate = useNavigate();
  // `onSettled` goes on the hook, not on `mutate()`: the session-end listener
  // flips `isAuthenticated` before the request settles, which unmounts this
  // button, and per-call callbacks do not fire after unmount.
  const logout = useLogoutMutation({ onSettled: () => void navigate({ to: "/login" }) });

  const { t } = useTranslation();

  return (
    <Button
      variant="unstyled"
      className="hover:text-primary"
      disabled={logout.isPending}
      onClick={() => logout.mutate()}
    >
      {t("nav.logout")}
    </Button>
  );
}
