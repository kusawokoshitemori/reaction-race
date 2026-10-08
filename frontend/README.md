# フロントエンド

React + TypeScript + Vite。初期画面は公式テンプレートのまま。
画面遷移やゲーム用UIはタスク02以降で実装する。

セットアップ・起動・停止手順は [ルートのREADME](../README.md) を参照。

このディレクトリで使うコマンド：

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
npm run build
npm run lint
```

依存はpackage-lock.jsonで固定。現段階のLintはViteテンプレート標準のOxlintを使用する。
UI・状態管理ライブラリは必要になった段階で検討する。
