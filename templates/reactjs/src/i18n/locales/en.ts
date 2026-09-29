export default {
  nav: {
    home: "Home",
    counter: "Counter",
    users: "Users",
    form: "Form",
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
  not_found: {
    title: "Page not found",
    description: "The page you are looking for does not exist.",
    back_home: "Back to home",
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
    description:
      "React 19 + Vite + TanStack Router + Zustand + shadcn/ui + TanStack Query + Tailwind v4.",
    open_dialog: "Open a shadcn/ui dialog",
  },
  counter: { title: "Zustand counter", count: "Count" },
  users: {
    title: "TanStack Query users",
    loading: "Loading…",
    error: "Error: {{message}}",
    empty: "No users yet.",
  },
  form: {
    title: "Form (react-hook-form + zod)",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    success: "Looks good!",
  },
} as const;
