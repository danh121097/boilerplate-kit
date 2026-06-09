export default {
  nav: { home: "Home", counter: "Counter", users: "Users", form: "Form" },
  home: {
    welcome: "Welcome",
    description:
      "TanStack Start + SSR + TanStack Router + Zustand + shadcn/ui + TanStack Query + Tailwind v4.",
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
