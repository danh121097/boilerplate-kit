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
    description: "Nuxt 4 + Reka UI + Pinia + TanStack Vue Query + Tailwind v4 + i18n.",
    open_dialog: "Open a Reka UI dialog",
  },
  counter: { title: "Pinia counter", count: "Count" },
  users: {
    title: "TanStack Query users",
    loading: "Loading…",
    error: "Error: {message}",
    empty: "No users yet.",
  },
  validation: {
    email: "Enter a valid email address",
    password_min: "Password must be at least 8 characters",
  },
  input: { toggle_password: "Toggle password visibility" },
  not_found: {
    title: "Page not found",
    description: "The page you are looking for does not exist.",
    back_home: "Back to home",
  },
  error: { title: "Something went wrong", back_home: "Back to home" },
  form: {
    title: "Form (vee-validate + zod)",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    success: "Looks good!",
  },
} as const;
