import { LogoutButton } from "@/components/logout-button";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

/**
 * The logout control's wiring. The hooks are stubbed and the component is
 * called as a plain function, so the returned Button element's props (disabled,
 * onClick) can be read without a DOM.
 */

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  mutate: vi.fn(),
  isPending: false,
  options: undefined as { onSettled?: () => void } | undefined,
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/services/auth", () => ({
  useLogoutMutation: (options?: { onSettled?: () => void }) => {
    mocks.options = options;
    return { mutate: mocks.mutate, isPending: mocks.isPending };
  },
}));

function render() {
  return (LogoutButton as () => ReactElement<{ disabled: boolean; onClick: () => void }>)();
}

describe("logout button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPending = false;
  });

  it("is enabled when idle and disabled while the request is pending", () => {
    expect(render().props.disabled).toBe(false);

    mocks.isPending = true;
    expect(render().props.disabled).toBe(true);
  });

  // Hook-level, not per-call: the button unmounts once the session ends, and
  // per-call mutate() callbacks do not fire after unmount.
  it("routes to plain /login once the request settles, even when it failed", () => {
    render().props.onClick();

    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();

    // onSettled runs for success and for failure alike.
    mocks.options?.onSettled?.();
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/login" });
  });
});
