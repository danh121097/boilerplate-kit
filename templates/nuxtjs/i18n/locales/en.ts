export default {
  nav: { home: "Home", counter: "Counter", users: "Users", form: "Form", authDemo: "Auth Demo" },
  home: {
    welcome: "Welcome",
    description: "Nuxt 4 + Reka UI + Pinia + TanStack Vue Query + Tailwind v4 + i18n.",
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
