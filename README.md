# reaction-race

ゲーム画面はクリック／スペースで操作します。試合進行・入力判定・遅延補正・順位計算をサーバーへ接続済みです。結果保存と確定レートの仕様は [レート計算・試合結果保存](docs/rating-results.md) を参照してください。

同時にクリックすることで速さを競うゲーム。
Google／X／匿名認証とGoの本人確認・プロフィール保存を接続済みです。対戦結果とレートはPostgreSQLへ保存します。起動前に002マイグレーションを適用してください。戦績一覧・全体ランキング・タイトル画面のレートは引き続き仮データです。

認証の設定手順・API・検証範囲は [認証・ユーザー管理](docs/authentication.md) を参照してください。

画面一覧・遷移条件は [画面遷移設計](docs/screen-navigation.md) を参照してください。

## 使用している技術スタック

| 分類 | 技術 | このプロジェクトでの役割 |
| --- | --- | --- |
| 画面 | React | ブラウザに表示するUIを作る。仮画面と画面遷移を表示する。 |
| フロントの言語 | TypeScript | JavaScriptに型を付け、コードの型の間違いを検出する。 |
| フロントの開発・ビルド | Vite | 開発用サーバーを起動し、配布用のHTML・JavaScriptを生成する。 |
| フロントの開発ツール実行・依存管理 | Node.js / npm | Viteなどのツールを実行し、必要なライブラリを導入する。 |
| バックエンド | Go（標準ライブラリの `net/http` / `log/slog`） | HTTPリクエストを受け付け、ログを出力する。現在は起動確認用の `GET /healthz` を用意する。 |
| データベース | PostgreSQL | ユーザー、試合結果、レートを保存。Goから接続する。 |
| DBの実行環境 | Docker / Docker Compose | PostgreSQLをコンテナで起動し、設定・ポート・データ保存用ボリュームを管理する。 |
| フロントの整形・静的チェック | Prettier / Oxlint | コードの書式と、問題のある書き方をチェックする。 |
| フロントのテスト | Vitest / React Testing Library / jsdom | ブラウザのDOMを模した環境で、Reactの表示をテストする。 |
| Goの整形・静的チェック・テスト | gofmt / go vet / testing / race detector | 書式、問題のあるコード、HTTP応答、終了処理、データ競合を確認する。 |

フロントとGoはホスト上、DBはDocker上で動かす。現段階ではそれぞれの起動を確認できる状態までを用意しており、
フロント→Go→DBの連携、認証、WebSocket、対戦機能は後続タスクで実装する。
実行ツールのバージョンは下の「必要なツール」、フロントの依存は `frontend/package.json` と `frontend/package-lock.json` を参照。

## 構成

フロントエンドとバックエンドは同じリポジトリで管理する。
APIの変更と画面の変更をまとめて記録でき、開発手順も一か所に保てるため。
起動や将来のデプロイはそれぞれ独立して行う。

```text
reaction-race/
├── frontend/             # React + TypeScript + Vite（npm）
├── backend/
│   ├── cmd/server/       # 標準ライブラリによるHTTPサーバー
│   ├── go.mod
│   └── .env.example      # HTTP待受アドレスのサンプル
├── compose.yaml          # ローカル開発用PostgreSQL
├── .env.example          # DB設定のサンプル
└── .nvmrc                # Node.jsの検証済みバージョン
```

フロントとGoはホスト上で直接起動し、DBのみDocker Composeを使う。
この段階では各環境を個別に起動・確認する。認証・プロフィールAPIではフロント→Go→DBを接続する。

## 必要なツール

| ツール | 採用バージョン | 検証済み |
| --- | --- | --- |
| Node.js | 24系 | 24.15.0 |
| npm | 11系 | 11.6.0 |
| Go | 1.27系 | 1.27.1 |
| PostgreSQL | 18系（Dockerイメージ） | 18.6 |
| Docker Engine | Docker Desktop等 | 28.3.2 |
| Docker Compose | v2、`up --wait`が使えるもの | 2.38.2 |

Node.js・npm・Go・Dockerをインストールし、Dockerを起動しておく。
macOSでGoがない場合は `brew install go` で導入できる。
nvmを利用している場合はリポジトリ直下で `nvm install` と `nvm use` を実行する。
ホストへのPostgreSQLやpsqlのインストールは必須ではない。

```sh
node --version
npm --version
go version
docker compose version
docker info
```

フロントの依存バージョンは `frontend/package.json` と `frontend/package-lock.json` で管理する。
インストールには `npm ci` を使う。

## 初回セットアップ

リポジトリ直下で実行する。すでに `.env` がある場合は上書きせず、サンプルとの差分を確認する。

```sh
cp -n .env.example .env
cp -n backend/.env.example backend/.env
cd frontend
npm ci
```

サンプルのDB認証情報はローカル開発専用。`.env` はGit管理から除外している。
フロントには `frontend/.env.example` のFirebase設定が必要です。将来 `VITE_` 変数を追加する場合、その値はブラウザへ公開されるため秘密情報を入れない。

## 起動

### 1. DB

リポジトリ直下で実行する。

```sh
docker compose up -d --wait db
docker compose ps
```

DBの状態が `healthy` になれば起動完了。
ホスト側の接続先は `127.0.0.1:55432`。既存のPostgreSQLとの競合を避けるため、通常の5432とは分けている。
変更する場合はルート `.env` の `POSTGRES_PORT` を編集する。

簡単なSQLを実行する（ホスト側のpsqlは不要）。

```sh
docker compose exec db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1 AS connection_check;"'
```

`connection_check` が `1` なら成功。対話的にSQLを実行する場合：

```sh
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

psqlは `\q` で終了する。

### 2. Goサーバー

別のターミナルをリポジトリ直下で開いて実行する。

```sh
cd backend
set -a
. ./.env
set +a
go build -o bin/server ./cmd/server
./bin/server
```

`.env` は自動では読み込まない。上の `set -a` から `set +a` で環境変数として読み込む。
`HTTP_ADDR` 未指定時は `127.0.0.1:8080` を使う。
Goのソースを変更したら、停止して再ビルド・再起動する。

別のターミナルで疎通確認：

```sh
curl --fail http://127.0.0.1:8080/healthz
```

期待する応答は `{"status":"ok"}`。これはHTTPサーバーの起動確認で、DB接続は確認しない。
`HTTP_ADDR` を変更した場合はcurlの接続先も合わせる。
起動・停止・エラーはJSON形式で標準出力に記録する。

### 3. フロントエンド

別のターミナルをリポジトリ直下で開いて実行する。

```sh
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

ブラウザで <http://127.0.0.1:5173/> を開く。
ログイン画面から「ログイン」または「ゲストで続ける」でタイトルに進めます。
「ゲーム開始」から仮ボタンで試合結果まで進め、再戦やタイトルへ戻る操作を確認できます。
画面デザインと実際の認証・対戦処理は後続タスクで実装します。

## 停止・再起動

- フロント：実行中のターミナルで `Ctrl+C`。
- Go：実行中のターミナルで `Ctrl+C`。最大5秒待って処理中のHTTPリクエストを終了する。
- DB：リポジトリ直下で次を実行する。

```sh
docker compose down
```

DBのデータはDockerの名前付きボリューム `reaction-race_postgres_data` に残る。
`docker compose up -d --wait db` で再起動できる。
通常の停止では `down` に `-v` を付けないこと。`-v` はDBデータも削除する。

## チェック

フロント（リポジトリ直下から）：

```sh
cd frontend
npm run check
```

Go（別のターミナルでリポジトリ直下から）：

```sh
cd backend
test -z "$(gofmt -l .)"
go vet ./...
go test -race ./...
go build -o bin/server ./cmd/server
```

Goコマンドは `go.mod` のある `backend/` 内で実行する。
Compose設定の確認はリポジトリ直下で `docker compose config --quiet`。

## 困ったとき

- Dockerに接続できない：Docker Desktop等が起動しているか確認する。
- ポートが使用中：起動済みの同じサーバーがないか確認する。別のアプリを停止する必要がある場合は、先に用途を確認する。DBは `POSTGRES_PORT`、Goは `HTTP_ADDR`、フロントは起動コマンドの `--port` で変更できる。
- DBが起動しない：`docker compose logs db` で原因を確認する。
- DBの認証情報を `.env` で変えても反映されない：`POSTGRES_USER`・`POSTGRES_PASSWORD`・`POSTGRES_DB` は空のデータ領域を初期化するときだけ使われる。既存DBを使う場合は元の設定へ戻すか、DB上で設定を変更する。

## 01の確認結果

2026-10-09、macOS（Apple Silicon）で確認。

- [x] 01-1 リポジトリ・実行環境の配置を決める
- [x] 01-2 React＋TypeScript＋Viteのブラウザ表示・ビルド・Lint
- [x] 01-3 Goのビルド・静的チェック・HTTP疎通・正常終了
- [x] 01-4 PostgreSQLのSQL実行・ホストからの接続・停止・再起動
- [x] 01-5 設定サンプル・秘密情報の除外・起動手順の確認

認証・プロフィールは06で実装。WebSocket対戦、ゲーム処理、戦績テーブル、公開環境は後続タスクで扱う。

## 開発規約

実装・テスト・レビューの方針は [AGENTS.md](AGENTS.md) を参照。
フロントの `npm run check` はフォーマット・Lint・テスト・ビルドを実行する。
自動修正は `npm run format:fix`、テストの継続実行は `npm run test:watch`。
Go のテストは一時的なループバックポートを使用し、DB は不要。

## 参照

- [設計書](https://app.notion.com/p/043a2936051c43c89fdb2f423a15ee4e)
- [01. 開発環境の構築](https://app.notion.com/p/3f3df60d21148197a3e0e219be3b1356)
- [Viteの導入手順](https://vite.dev/guide/)
- [Goの配布ページ](https://go.dev/dl/)
- [PostgreSQL公式Dockerイメージ](https://hub.docker.com/_/postgres)

結果画面の表示仕様・確認手順は [結果画面](docs/result-screen.md) を参照してください。

## 07. 待機室・参加者管理

[仕様・検証手順](docs/lobby.md)。APP_ORIGINを設定してGoを再起動すると、ゲーム開始から待機室へ接続する。10秒または100人で参加者が確定し、不足分はボットで補充する。試合進行は08で接続済み。

## 08. 試合進行・入力判定

[状態遷移・通信・検証](docs/match.md)。Goで合図、初回入力、3秒の締切、結果確定を管理し、ゲーム／結果画面へ通知する。試合前後のRTTで通信遅延を補正し、同タイムを同順位として表示する。計測不能・不安定な記録は順位対象外。詳細と検証の限界は[遅延補正](docs/latency-correction.md)を参照。

## 11. レート計算・試合結果保存

[配点・DB更新・保存失敗時の再処理・マイグレーション](docs/rating-results.md)。同格100人なら1位+20、10位+8、30位±0、最下位・失敗−8を基準とし、相手の強さで補正します。結果とレートを同じトランザクションで保存し、保存成功後に確定レートを表示します。未保存結果の再試行はプロセス稼働中のみです。
