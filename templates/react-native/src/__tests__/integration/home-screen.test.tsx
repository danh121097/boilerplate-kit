import { render, screen } from "@testing-library/react-native";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);
jest.mock("expo-router", () => {
  const { Pressable } = require("react-native");
  return {
    Stack: { Screen: () => null },
    Link: ({ children }: { children: React.ReactElement }) => <Pressable>{children}</Pressable>,
  };
});
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: { message?: string }) => (o?.message ? `${k}: ${o.message}` : k),
  }),
}));

let mockQuery: { data?: unknown; isLoading: boolean; error: unknown };
jest.mock("@/services/users", () => ({ useUsersListQuery: () => mockQuery }));

import HomeScreen from "../../../app/(app)/index";

const META = { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false };
const USER = {
  _id: "u1",
  name: "Alice",
  email: "alice@example.com",
  role: "admin",
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

describe("HomeScreen users list", () => {
  it("renders the rows of the paginated data.data", () => {
    mockQuery = {
      data: { success: true, data: [USER], meta: META },
      isLoading: false,
      error: null,
    };
    render(<HomeScreen />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("alice@example.com")).toBeTruthy();
    expect(screen.queryByText("users.empty")).toBeNull();
  });

  it("shows users.empty for an empty list", () => {
    mockQuery = {
      data: { success: true, data: [], meta: { ...META, total: 0 } },
      isLoading: false,
      error: null,
    };
    render(<HomeScreen />);
    expect(screen.getByText("users.empty")).toBeTruthy();
  });

  it("shows the users.error message on failure", () => {
    mockQuery = {
      isLoading: false,
      error: { error_message: "Server down", message: "x", error_code: 500 },
    };
    render(<HomeScreen />);
    expect(screen.getByText("users.error: Server down")).toBeTruthy();
  });
});
