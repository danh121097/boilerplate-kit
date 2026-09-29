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
    description: "Nuxt 4 + Reka UI + Pinia + TanStack Vue Query + Tailwind v4 + i18n.",
    open_dialog: "Reka UI ダイアログを開く",
  },
  counter: { title: "Pinia カウンター", count: "カウント" },
  users: {
    title: "ユーザー (TanStack Query)",
    loading: "読み込み中…",
    error: "エラー: {message}",
    empty: "ユーザーはまだいません。",
  },
  validation: {
    email: "有効なメールアドレスを入力してください",
    password_min: "パスワードは8文字以上で入力してください",
  },
  input: { toggle_password: "パスワードの表示を切り替える" },
  not_found: {
    title: "ページが見つかりません",
    description: "お探しのページは存在しません。",
    back_home: "ホームに戻る",
  },
  error: { title: "問題が発生しました", back_home: "ホームに戻る" },
  form: {
    title: "フォーム (vee-validate + zod)",
    email: "メールアドレス",
    password: "パスワード",
    submit: "ログイン",
    success: "送信できました",
  },
} as const;
