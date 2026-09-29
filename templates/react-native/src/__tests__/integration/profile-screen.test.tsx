import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// --- Mocks (declared before importing the screen) -------------------------
jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  Stack: { Screen: () => null },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));
const mockSetLocale = jest.fn();
jest.mock("@/i18n/i18n", () => ({ setLocale: (...args: unknown[]) => mockSetLocale(...args) }));

// Import AFTER mocks so the screen picks them up.
import { AppQueryClientProvider, queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import ProfileScreen from "../../../app/(app)/profile";

const renderProfile = () =>
  render(
    <AppQueryClientProvider>
      <ProfileScreen />
    </AppQueryClientProvider>,
  );

// Finished mutations and the signed-out session query schedule 5-minute GC timers that keep
// jest alive; disable GC for this suite and drop the cache at the end.
queryClient.setDefaultOptions({
  queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity },
  mutations: { gcTime: Infinity },
});
afterAll(() => queryClient.clear());

const USER = { _id: "u1", email: "a@b.com", name: "A", role: "user" };

describe("ProfileScreen user retry", () => {
  let loadUser: jest.Mock;

  beforeEach(() => {
    loadUser = jest.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ loadUser });
  });

  it("retries loading the user when signed in without one", () => {
    useAuthStore.setState({ user: null, isAuthenticated: true, hydrated: true });
    renderProfile();
    expect(loadUser).toHaveBeenCalledTimes(1);
  });

  it("does not call /me once logged out", () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, hydrated: true });
    renderProfile();
    expect(loadUser).not.toHaveBeenCalled();
  });

  it("does not refetch when the user is already known", () => {
    useAuthStore.setState({ user: USER as never, isAuthenticated: true, hydrated: true });
    renderProfile();
    expect(loadUser).not.toHaveBeenCalled();
  });
});

describe("ProfileScreen language toggle", () => {
  beforeEach(() => {
    mockSetLocale.mockClear();
    useAuthStore.setState({
      user: USER as never,
      isAuthenticated: true,
      hydrated: true,
      loadUser: jest.fn(),
    });
  });

  it("marks the current language selected and switches to JA", () => {
    renderProfile();
    expect(screen.getByTestId("language-en").props.accessibilityState).toMatchObject({
      selected: true,
    });
    fireEvent.press(screen.getByTestId("language-ja"));
    expect(mockSetLocale).toHaveBeenCalledWith("ja");
  });
});

describe("ProfileScreen logout", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    useAuthStore.setState({
      user: USER as never,
      isAuthenticated: true,
      hydrated: true,
      loggedOut: false,
      loadUser: jest.fn(),
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it("disables the button while the request is pending, then signs out and goes to /login", async () => {
    let release: () => void = () => {};
    jest
      .spyOn(AuthModel, "logout")
      .mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    renderProfile();

    fireEvent.press(screen.getByTestId("logout-button"));
    await waitFor(() =>
      expect(screen.getByTestId("logout-button").props.accessibilityState?.disabled).toBe(true),
    );
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => release());

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      loggedOut: true,
    });
  });

  it("still signs out locally and routes to /login when the logout request fails", async () => {
    jest.spyOn(AuthModel, "logout").mockRejectedValue({ error_code: 0, message: "offline" });
    renderProfile();

    fireEvent.press(screen.getByTestId("logout-button"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
  });
});
