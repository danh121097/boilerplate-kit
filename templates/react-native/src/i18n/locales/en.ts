export default {
  login: {
    title: "Sign in",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    failed: "Login failed. Check your credentials.",
  },
  home: {
    welcome: "Welcome",
    description: "Expo Router + NativeWind + TanStack Query + Zustand + SecureStore JWT auth.",
    users: "Users",
    profile: "Profile",
  },
  profile: {
    title: "Profile",
    role: "Role",
    logout: "Log out",
  },
  users: {
    title: "Users",
    loading: "Loading…",
    error: "Error: {{message}}",
    empty: "No users yet.",
  },
} as const;
