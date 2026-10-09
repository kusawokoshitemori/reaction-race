# フロントエンド

React + TypeScript + Vite。画面はタイトル「Reaction Race」のみを表示する最小構成。
画面遷移やゲーム用UIはタスク02以降で実装する。

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
