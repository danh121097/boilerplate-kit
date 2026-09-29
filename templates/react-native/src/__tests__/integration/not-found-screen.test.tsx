import { render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => {
  const { Pressable } = require("react-native");
  return {
    Stack: { Screen: () => null },
    Link: ({ children }: { children: React.ReactElement }) => <Pressable>{children}</Pressable>,
  };
});
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import NotFoundScreen from "../../../app/+not-found";

describe("NotFoundScreen", () => {
  it("renders the shared not-found copy and a way home", () => {
    render(<NotFoundScreen />);
    expect(screen.getByText("not_found.title")).toBeTruthy();
    expect(screen.getByText("not_found.description")).toBeTruthy();
    expect(screen.getByText("not_found.back_home")).toBeTruthy();
  });
});
