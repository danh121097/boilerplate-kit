import { render } from "@testing-library/react-native";

// --- Mocks (declared before importing the screen) -------------------------
jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);
jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

// Import AFTER mocks so the screen picks them up.
import { useAuthStore } from "@/stores/auth";
import ProfileScreen from "../../../app/(app)/profile";

const USER = { _id: "u1", email: "a@b.com", name: "A", role: "user" };

describe("ProfileScreen user retry", () => {
  let loadUser: jest.Mock;

  beforeEach(() => {
    loadUser = jest.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ loadUser });
  });

  it("retries loading the user when signed in without one", () => {
    useAuthStore.setState({ user: null, isAuthenticated: true, hydrated: true });
    render(<ProfileScreen />);
    expect(loadUser).toHaveBeenCalledTimes(1);
  });

  it("does not call /me once logged out", () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, hydrated: true });
    render(<ProfileScreen />);
    expect(loadUser).not.toHaveBeenCalled();
  });

  it("does not refetch when the user is already known", () => {
    useAuthStore.setState({ user: USER as never, isAuthenticated: true, hydrated: true });
    render(<ProfileScreen />);
    expect(loadUser).not.toHaveBeenCalled();
  });
});
