export default {
  nav: {
    home: "ホーム",
    counter: "カウンター",
    users: "ユーザー",
    form: "フォーム",
    login: "ログイン",
    logout: "ログアウト",
  },
  session: {
    unavailable: "サーバーに接続できませんでした。ログイン状態は維持されています。",
    retry: "再試行",
  },
  socket: {
    connected: "リアルタイム接続済み",
    reconnecting: "リアルタイム再接続中",
  },
  validation: {
    email: "有効なメールアドレスを入力してください",
    password_min: "パスワードは8文字以上で入力してください",
  },
  not_found: {
    title: "ページが見つかりません",
    description: "お探しのページは存在しません。",
    back_home: "ホームに戻る",
  },
  login: {
    title: "ログイン",
    email: "メールアドレス",
    password: "パスワード",
    submit: "ログイン",
    submitting: "ログイン中…",
    error: "ログインに失敗しました",
  },
  home: {
    welcome: "ようこそ",
    description:
      "React 19 + Vite + TanStack Router + Zustand + shadcn/ui + TanStack Query + Tailwind v4.",
    open_dialog: "shadcn/ui ダイアログを開く",
  },
  counter: { title: "Zustand カウンター", count: "カウント" },
  users: {
    title: "ユーザー (TanStack Query)",
    loading: "読み込み中…",
    error: "エラー: {{message}}",
    empty: "ユーザーはまだいません。",
  },
  form: {
    title: "フォーム (react-hook-form + zod)",
    email: "メールアドレス",
    password: "パスワード",
    submit: "ログイン",
    success: "送信できました",
  },
} as const;
