export default {
  nav: {
    home: "Home",
    counter: "Counter",
    users: "Users",
    form: "Form",
    login: "Login",
    logout: "Logout",
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
  counter: { title: "Pinia counter", count: "Count" },
  users: { title: "TanStack Query users", loading: "Loading…", error: "Error: {message}" },
  form: {
    title: "Form (vee-validate + zod)",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    success: "Looks good!",
  },
} as const;
