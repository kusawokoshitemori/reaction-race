# フロントエンド

React + TypeScript + Vite。ログインまたはゲスト選択後、タイトル・ゲーム・結果・ランキングへ移動できます。
認証と試合は仮動作です。画面デザイン・実処理は後続タスクで実装します。

[画面一覧・遷移条件](../docs/screen-navigation.md)

セットアップ・起動・停止手順は [ルートのREADME](../README.md) を参照。

このディレクトリで使うコマンド：

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
npm run check
npm run format:fix
npm run test:watch
```

依存はpackage-lock.jsonで固定。LintはOxlint（警告0件）、整形はPrettier、テストはVitest + React Testing Libraryを使用する。
UI・状態管理ライブラリは必要になった段階で検討する。
