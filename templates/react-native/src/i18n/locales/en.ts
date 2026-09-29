export default {
  nav: {
    home: "Home",
    profile: "Profile",
    login: "Login",
    logout: "Logout",
  },
  session: {
    unavailable: "Could not reach the server. You are still signed in.",
    retry: "Retry",
  },
  socket: {
    connected: "Realtime connected",
    reconnecting: "Realtime reconnecting",
  },
  validation: {
    email: "Enter a valid email address",
    password_min: "Password must be at least 8 characters",
  },
  login: {
    title: "Sign in",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    error: "Sign in failed",
  },
  home: {
    welcome: "Welcome",
    description: "Expo Router + NativeWind + TanStack Query + Zustand + SecureStore JWT auth.",
  },
  profile: {
    title: "Profile",
    role: "Role",
    language: "Language",
  },
  not_found: {
    title: "Page not found",
    description: "The page you are looking for does not exist.",
    back_home: "Back to home",
  },
  users: {
    title: "Users",
    loading: "Loading…",
    error: "Error: {{message}}",
    empty: "No users yet.",
  },
} as const;
