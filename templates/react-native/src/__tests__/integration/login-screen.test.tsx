import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// --- Mocks (declared before importing the screen) -------------------------
// jest hoists jest.mock() above imports; factories may only reference
// out-of-scope vars whose names start with `mock`.
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => mockParams,
}));

const mockMutateAsync = jest.fn();
let mockPending = false;
jest.mock("@/services/auth", () => ({
  useLoginMutation: () => ({ mutateAsync: mockMutateAsync, isPending: mockPending }),
}));

// Return translation keys verbatim so assertions don't depend on i18n init.
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

// Import AFTER mocks so the screen picks them up.
import { SafeAreaProvider } from "react-native-safe-area-context";
import LoginScreen from "../../../app/(auth)/login";

const USER = {
  _id: "u1",
  email: "a@b.com",
  name: "A",
  role: "user",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

// Fixed metrics so SafeAreaProvider renders synchronously without native measure.
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderLogin = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <LoginScreen />
    </SafeAreaProvider>,
  );

describe("LoginScreen", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockParams = {};
    mockMutateAsync.mockReset();
    mockPending = false;
  });

  it("validates with zod and does not call the auth service on invalid input", async () => {
    renderLogin();
    fireEvent.changeText(screen.getByTestId("login-email"), "not-an-email");
    fireEvent.changeText(screen.getByTestId("login-password"), "");
    fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() => expect(screen.getByText("validation.email")).toBeTruthy());
    expect(screen.getByText("validation.password_required")).toBeTruthy();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("lets a legacy short password through: login leaves strength to the server", async () => {
    mockMutateAsync.mockResolvedValue({ user: USER, tokens: { accessToken: "AT" } });
    renderLogin();
    fireEvent.changeText(screen.getByTestId("login-email"), "a@b.com");
    fireEvent.changeText(screen.getByTestId("login-password"), "abc");
    fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({ email: "a@b.com", password: "abc" }),
    );
  });

  it("labels and autofill-hints both fields", () => {
    renderLogin();
    const email = screen.getByLabelText("login.email");
    const password = screen.getByLabelText("login.password");
    expect(email.props.autoComplete).toBe("username");
    expect(email.props.textContentType).toBe("username");
    expect(password.props.autoComplete).toBe("current-password");
    expect(password.props.textContentType).toBe("password");
  });

  it("shows the submitting label and blocks a second press while pending", () => {
    mockPending = true;
    renderLogin();
    expect(screen.getByText("login.submitting")).toBeTruthy();
    fireEvent.press(screen.getByTestId("login-submit"));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("logs in and redirects home on success", async () => {
    mockMutateAsync.mockResolvedValue({ user: USER, tokens: { accessToken: "AT" } });
    renderLogin();

    fireEvent.changeText(screen.getByTestId("login-email"), "a@b.com");
    fireEvent.changeText(screen.getByTestId("login-password"), "password123");
    fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({ email: "a@b.com", password: "password123" }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  });

  it.each([
    ["/profile", "/profile"],
    ["//evil.example/phish", "/"],
    ["https://evil.example", "/"],
    ["/login", "/"],
  ])("after sign-in returns to redirect=%j → %s", async (redirect, expected) => {
    mockParams = { redirect };
    mockMutateAsync.mockResolvedValue({ user: USER, tokens: { accessToken: "AT" } });
    renderLogin();

    fireEvent.changeText(screen.getByTestId("login-email"), "a@b.com");
    fireEvent.changeText(screen.getByTestId("login-password"), "password123");
    fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(expected));
  });

  it("shows the server message in an alert when login fails", async () => {
    mockMutateAsync.mockRejectedValue({ error_code: 401, error_message: "Wrong password" });
    renderLogin();

    fireEvent.changeText(screen.getByTestId("login-email"), "a@b.com");
    fireEvent.changeText(screen.getByTestId("login-password"), "password123");
    fireEvent.press(screen.getByTestId("login-submit"));

    const alert = await screen.findByTestId("login-error");
    expect(alert.props.accessibilityRole).toBe("alert");
    expect(screen.getByText("Wrong password")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("falls back to login.error when the rejection has no message", async () => {
    mockMutateAsync.mockRejectedValue({});
    renderLogin();

    fireEvent.changeText(screen.getByTestId("login-email"), "a@b.com");
    fireEvent.changeText(screen.getByTestId("login-password"), "password123");
    fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() => expect(screen.getByText("login.error")).toBeTruthy());
  });

  it("clears the previous server error when the next submit fails validation", async () => {
    mockMutateAsync.mockRejectedValue({ error_code: 401, error_message: "Wrong password" });
    renderLogin();

    fireEvent.changeText(screen.getByTestId("login-email"), "a@b.com");
    fireEvent.changeText(screen.getByTestId("login-password"), "password123");
    fireEvent.press(screen.getByTestId("login-submit"));
    await screen.findByTestId("login-error");

    fireEvent.changeText(screen.getByTestId("login-email"), "not-an-email");
    fireEvent.press(screen.getByTestId("login-submit"));

    await screen.findByText("validation.email");
    expect(screen.queryByTestId("login-error")).toBeNull();
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });
});
