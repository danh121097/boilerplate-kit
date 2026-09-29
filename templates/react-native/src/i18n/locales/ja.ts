export default {
  nav: {
    home: "ホーム",
    profile: "プロフィール",
    login: "ログイン",
    logout: "ログアウト",
  },
  session: {
    unavailable: "サーバーに接続できませんでした。ログイン状態は維持されています。",
    retry: "再試行",
  },
  validation: {
    email: "有効なメールアドレスを入力してください",
    password_min: "パスワードは8文字以上で入力してください",
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
    description: "Expo Router + NativeWind + TanStack Query + Zustand + SecureStore JWT 認証。",
  },
  profile: {
    title: "プロフィール",
    role: "権限",
    language: "言語",
  },
  not_found: {
    title: "ページが見つかりません",
    description: "お探しのページは存在しません。",
    back_home: "ホームに戻る",
  },
  users: {
    title: "ユーザー",
    loading: "読み込み中…",
    error: "エラー: {{message}}",
    empty: "ユーザーはまだいません。",
  },
} as const;
