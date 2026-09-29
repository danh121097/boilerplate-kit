import { MockAuthBadge } from "@/components/mock-auth-badge";
import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const setDev = (value: boolean) => Object.assign(globalThis, { __DEV__: value });

const renderBadge = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <MockAuthBadge />
    </SafeAreaProvider>,
  );

describe("mock auth badge", () => {
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => {
    jest.restoreAllMocks();
    setDev(true);
    delete process.env.EXPO_PUBLIC_AUTH_MOCK;
  });

  it("shows only while the mock is active", () => {
    process.env.EXPO_PUBLIC_AUTH_MOCK = "true";
    renderBadge();
    expect(screen.getByText("Mock auth")).toBeTruthy();
    screen.unmount();

    process.env.EXPO_PUBLIC_AUTH_MOCK = "";
    renderBadge();
    expect(screen.queryByText("Mock auth")).toBeNull();
    screen.unmount();

    process.env.EXPO_PUBLIC_AUTH_MOCK = "true";
    setDev(false);
    renderBadge();
    expect(screen.queryByText("Mock auth")).toBeNull();
  });
});
