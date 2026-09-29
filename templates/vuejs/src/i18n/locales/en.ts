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
    description: "Vue 3 + Vite + Vue Router + Pinia + Reka UI + TanStack Query + Tailwind v4.",
    open_dialog: "Open a Reka UI dialog",
  },
  not_found: {
    title: "Page not found",
    description: "The page you are looking for does not exist.",
    back_home: "Back to home",
  },
  validation: {
    email: "Enter a valid email address",
    password_min: "Password must be at least 8 characters",
  },
  input: { toggle_password: "Toggle password visibility" },
  counter: { title: "Pinia counter", count: "Count" },
  users: {
    title: "TanStack Query users",
    loading: "Loading…",
    error: "Error: {message}",
    empty: "No users yet.",
  },
  form: {
    title: "Form (vee-validate + zod)",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    success: "Looks good!",
  },
} as const;
