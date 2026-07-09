import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// --- Mocks (declared before importing the screen) -------------------------
jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

// jest hoists jest.mock() above imports; factories may only reference
// out-of-scope vars whose names start with `mock`.
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));

const mockMutateAsync = jest.fn();
jest.mock("@/services/auth", () => ({
  useLoginMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

// Return translation keys verbatim so assertions don't depend on i18n init.
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

// Import AFTER mocks so the screen picks them up.
import { SafeAreaProvider } from "react-native-safe-area-context";
import LoginScreen from "../../../app/(auth)/login";

const USER = { _id: "u1", email: "a@b.com", name: "A", role: "user" };

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
    mockMutateAsync.mockReset();
  });

  it("validates with zod and does not call the auth service on invalid input", async () => {
    renderLogin();
    fireEvent.changeText(screen.getByTestId("login-email"), "not-an-email");
    fireEvent.changeText(screen.getByTestId("login-password"), "short");
    fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() => expect(screen.getByText("Invalid email")).toBeTruthy());
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

  it("shows an error message when login fails", async () => {
    mockMutateAsync.mockRejectedValue(new Error("401"));
    renderLogin();

    fireEvent.changeText(screen.getByTestId("login-email"), "a@b.com");
    fireEvent.changeText(screen.getByTestId("login-password"), "password123");
    fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() => expect(screen.getByTestId("login-error")).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
