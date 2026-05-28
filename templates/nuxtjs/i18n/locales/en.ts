export default {
  nav: { home: "Home", counter: "Counter", users: "Users", form: "Form" },
  home: {
    welcome: "Welcome",
    description: "Nuxt 4 + Nuxt UI + Pinia + TanStack Vue Query + Tailwind v4 + i18n.",
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
