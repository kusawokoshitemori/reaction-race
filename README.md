# reaction-race

同時にクリックすることで速さを競うゲーム。

## 開発環境の方針（01-1）

フロントエンドとバックエンドは同じリポジトリで管理する。
APIの変更と画面の変更をまとめて記録でき、開発手順も一か所に保てるため。
起動や将来のデプロイはそれぞれ独立して行う。

```text
reaction-race/
├── frontend/       # React + TypeScript + Vite（npm）
├── backend/        # Go（標準ライブラリのHTTPサーバーから開始）
├── compose.yaml    # ローカル開発用PostgreSQL
└── README.md       # 設定・起動・停止の手順
```

### 実行環境

| ツール | 採用するバージョン・方針 |
| --- | --- |
| Node.js | 24系（現在のローカル環境は24.10.0） |
| npm | 11系（現在のローカル環境は11.6.0）、package-lock.jsonを管理する |
| Go | 1.27系 |
| PostgreSQL | 18系、Docker公式イメージで起動する |
| Docker Compose | v2（現在のローカル環境は2.38.2） |

フロントとGoはホスト上で直接起動し、DBのみDocker Composeを使う。
React・Viteなどの具体的な依存バージョンは01-2でpackage.jsonとロックファイルに記録する。

## 今回の範囲

Notion「01. 開発環境の構築」の子タスク順に進める。

- [x] 01-1 リポジトリ・実行環境の配置を決める
- [x] 01-2 React＋TypeScript＋Viteを起動する
- [x] 01-3 Goサーバーを起動する
- [x] 01-4 ローカルPostgreSQLを用意する
- [ ] 01-5 設定サンプルと起動手順を整える

完了条件はREADMEの手順でフロント・サーバー・DBを起動できること。
認証、WebSocket、ゲーム処理、テーブル設計、公開環境は後続タスクで扱う。
