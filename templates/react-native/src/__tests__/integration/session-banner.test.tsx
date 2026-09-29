import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { SessionBanner } from "@/components/session-banner";
import { useAuthStore } from "@/stores/auth";

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const TRANSIENT = { status: "error", error_code: 503, message: "down", error_message: "down" };

const renderBanner = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SessionBanner />
    </SafeAreaProvider>,
  );

describe("SessionBanner", () => {
  afterEach(() => {
    useAuthStore.setState({ hydrateError: null });
  });

  it("renders nothing without a hydrate error (also after a 401)", () => {
    renderBanner();
    expect(screen.queryByTestId("session-banner")).toBeNull();
  });

  it("shows an alert after a transient failure; retry succeeding removes it", async () => {
    const retryHydrate = jest.fn(async () => {
      useAuthStore.setState({ hydrateError: null });
    });
    useAuthStore.setState({ hydrateError: TRANSIENT, retryHydrate });
    renderBanner();

    const banner = screen.getByTestId("session-banner");
    expect(banner.props.accessibilityRole).toBe("alert");
    expect(screen.getByText("session.unavailable")).toBeTruthy();

    fireEvent.press(screen.getByTestId("session-retry"));

    await waitFor(() => expect(screen.queryByTestId("session-banner")).toBeNull());
    expect(retryHydrate).toHaveBeenCalledTimes(1);
  });
});
