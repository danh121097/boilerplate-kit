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
    description: "Next.js 16 + App Router + TanStack Query + Zustand + shadcn/ui + Tailwind v4.",
    open_dialog: "Open a shadcn/ui dialog",
  },
  counter: { title: "Zustand counter", count: "Count" },
  users: { title: "TanStack Query users", loading: "Loading…", error: "Error: {{message}}" },
  form: {
    title: "Form (react-hook-form + zod)",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    success: "Looks good!",
  },
} as const;
