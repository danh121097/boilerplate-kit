export default {
  login: {
    title: "ログイン",
    email: "メールアドレス",
    password: "パスワード",
    submit: "ログイン",
    failed: "ログインに失敗しました。認証情報を確認してください。",
  },
  home: {
    welcome: "ようこそ",
    description: "Expo Router + NativeWind + TanStack Query + Zustand + SecureStore JWT 認証。",
    users: "ユーザー",
    profile: "プロフィール",
  },
  profile: {
    title: "プロフィール",
    role: "権限",
    logout: "ログアウト",
  },
  users: {
    title: "ユーザー",
    loading: "読み込み中…",
    error: "エラー: {{message}}",
    empty: "ユーザーがいません。",
  },
} as const;
