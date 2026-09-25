import { render } from "@testing-library/react-native";

// --- Mocks (declared before importing the layouts) ------------------------
jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);
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

  it("after a session expiry, redirects to /login with the current path as returnTo", () => {
    useAuthStore.setState({ hydrated: true, isAuthenticated: false, sessionExpired: true });
    render(<AppLayout />);
    expect(mockRedirect).toHaveBeenCalledWith({
      pathname: "/login",
      params: { returnTo: "/profile" },
    });
  });

  it("after a voluntary logout, redirects to a plain /login", () => {
    useAuthStore.setState({ hydrated: true, isAuthenticated: false, sessionExpired: false });
    render(<AppLayout />);
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("sends a signed-in user on the auth group to a validated returnTo", () => {
    useAuthStore.setState({ hydrated: true, isAuthenticated: true });
    mockGlobalParams = { returnTo: "/profile" };
    render(<AuthLayout />);
    expect(mockRedirect).toHaveBeenCalledWith("/profile");
  });

  it("ignores an off-app returnTo on the auth group", () => {
    useAuthStore.setState({ hydrated: true, isAuthenticated: true });
    mockGlobalParams = { returnTo: "//evil.example" };
    render(<AuthLayout />);
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});
