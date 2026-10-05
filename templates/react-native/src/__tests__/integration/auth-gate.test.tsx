import { render } from "@testing-library/react-native";

// --- Mocks (declared before importing the layouts) ------------------------
const mockRedirect = jest.fn();
let mockPathname = "/profile";
let mockGlobalParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  Redirect: (props: { href: unknown }) => {
    mockRedirect(props.href);
    return null;
  },
  Stack: () => null,
  usePathname: () => mockPathname,
  useGlobalSearchParams: () => mockGlobalParams,
}));

// Import AFTER mocks so the layouts pick them up.
import { useAuthStore } from "@/stores/auth";
import AppLayout from "../../../app/(app)/_layout";
import AuthLayout from "../../../app/(auth)/_layout";

describe("auth gates", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockPathname = "/profile";
    mockGlobalParams = {};
  });

  it("redirects a guest on a protected screen to /login with the current path as redirect", () => {
    useAuthStore.setState({ hydrated: true, isAuthenticated: false, loggedOut: false });
    render(<AppLayout />);
    expect(mockRedirect).toHaveBeenCalledWith({
      pathname: "/login",
      params: { redirect: "/profile" },
    });
  });

  it("after an explicit logout, redirects to a plain /login", () => {
    useAuthStore.setState({ hydrated: true, isAuthenticated: false, loggedOut: true });
    render(<AppLayout />);
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("lets a guest on the login group clear the logout marker", () => {
    useAuthStore.setState({ hydrated: true, isAuthenticated: false, loggedOut: true });
    render(<AuthLayout />);
    expect(useAuthStore.getState().loggedOut).toBe(false);
  });

  it("sends a signed-in user on the auth group to a validated redirect", () => {
    useAuthStore.setState({ hydrated: true, isAuthenticated: true });
    mockGlobalParams = { redirect: "/profile" };
    render(<AuthLayout />);
    expect(mockRedirect).toHaveBeenCalledWith("/profile");
  });

  it("ignores an off-app redirect on the auth group", () => {
    useAuthStore.setState({ hydrated: true, isAuthenticated: true });
    mockGlobalParams = { redirect: "//evil.example" };
    render(<AuthLayout />);
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});
