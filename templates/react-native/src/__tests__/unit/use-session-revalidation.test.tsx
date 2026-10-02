import {
  SESSION_REVALIDATE_INTERVAL_MS,
  useSessionRevalidation,
} from "@/hooks/useSessionRevalidation";
import { useAuthStore } from "@/stores/auth";
import { renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import type { AppStateStatus } from "react-native";

/** A fake AppState: `emit` plays a foreground/background transition to the hook. */
function fakeAppState() {
  let handler: ((state: AppStateStatus) => void) | undefined;

  const remove = jest.fn();
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    handler = listener;
    return { remove };
  });
  return { emit: (state: AppStateStatus) => handler?.(state), remove };
}

describe("useSessionRevalidation", () => {
  let loadUser: jest.Mock;
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    loadUser = jest.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ isAuthenticated: true, hydrated: true, loadUser });
  });
  afterEach(() => jest.restoreAllMocks());

  it("re-checks the session silently on resume once the interval has passed", () => {
    const app = fakeAppState();
    renderHook(() => useSessionRevalidation());

    now += SESSION_REVALIDATE_INTERVAL_MS;
    app.emit("active");

    expect(loadUser).toHaveBeenCalledTimes(1);
    expect(loadUser).toHaveBeenCalledWith({ silent: true });
  });

  it("does not check again inside the interval, and ignores background transitions", () => {
    const app = fakeAppState();
    renderHook(() => useSessionRevalidation());

    now += 10_000;
    app.emit("active"); // under 30 s since mount
    app.emit("background");
    app.emit("inactive");
    expect(loadUser).not.toHaveBeenCalled();

    now += SESSION_REVALIDATE_INTERVAL_MS;
    app.emit("active");
    now += 5_000;
    app.emit("active"); // flapping foreground/background right after a check
    expect(loadUser).toHaveBeenCalledTimes(1);

    now += SESSION_REVALIDATE_INTERVAL_MS;
    app.emit("active");
    expect(loadUser).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["signed out", { isAuthenticated: false, hydrated: true }],
    ["not hydrated yet", { isAuthenticated: true, hydrated: false }],
  ])("does nothing while %s", (_label, state) => {
    const app = fakeAppState();
    useAuthStore.setState(state);
    renderHook(() => useSessionRevalidation());

    now += SESSION_REVALIDATE_INTERVAL_MS;
    app.emit("active");

    expect(loadUser).not.toHaveBeenCalled();
  });

  it("stops listening on unmount", () => {
    const app = fakeAppState();

    const { unmount } = renderHook(() => useSessionRevalidation());

    unmount();

    expect(app.remove).toHaveBeenCalledTimes(1);
  });
});
