export default {
  nav: { home: "ホーム", counter: "カウンター", users: "ユーザー", form: "フォーム" },
  home: {
    welcome: "ようこそ",
    description:
      "Next.js 16 + App Router + TanStack Query + Zustand + shadcn/ui + Tailwind v4.",
    open_dialog: "shadcn/ui ダイアログを開く",
  },
  counter: { title: "Zustand カウンター", count: "カウント" },
  users: { title: "ユーザー (TanStack Query)", loading: "読み込み中…", error: "エラー: {{message}}" },
  form: {
    title: "フォーム (react-hook-form + zod)",
    email: "メールアドレス",
    password: "パスワード",
    submit: "ログイン",
    success: "送信できました",
  },
} as const;
