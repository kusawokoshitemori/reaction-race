# 06. 認証・ユーザー管理

## 実装範囲

- Google / X: Firebase Authenticationのポップアップ認証。
- 状態維持・ログアウト: Firebase SDKのローカル永続化とIDトークン変更監視。他タブのログアウトも反映。
- ゲスト: Firebase匿名認証で識別。ユーザーテーブルには保存せず、レート・戦績も保存しない。
- プロフィール: Goが検証したFirebase UIDをキーにPostgreSQLへ作成・取得・表示名変更。
- HTTP: Firebase Admin SDKで署名・期限・発行元・プロジェクト・失効・無効化を確認。Google / Twitter / anonymous以外は拒否。
- WebSocket準備: 認証済みHTTPから有効期限30秒の一回限りのチケットを発行。Origin確認とアトミックな消費を行う `identity.Tickets.UpgradeGuard` を用意。

**対戦WebSocketのエンドポイントとゲーム通信は未実装。** 後続の対戦タスクで、同じTicketsインスタンスのUpgradeGuardでアップグレード処理を包み、FromContextから取得した本人情報を接続に固定する。メッセージ内のユーザーIDを本人確認に使わない。チケットを含むURLをアクセスログへ保存しない。複数プロセスへ展開する際は共有ストアでチケットを一回だけ消費できる構成に変更する。

ゲストからGoogle / Xへログインした場合は、そのプロバイダーのアカウントへ切り替える。ゲスト成績の引き継ぎやGoogle / Xアカウントの自動統合は行わない。同一メールで別プロバイダーに登録済みの場合は以前使った方法へ案内する。

## 子タスク・確認状況

- [x] Firebase SDK導入・Google / X / 匿名認証へのUI接続
- [x] 状態復元・ログアウト・エラー表示
- [x] Goでのトークン検証・登録ユーザーとゲストの区別
- [x] プロフィールのDB取得・更新と入力検証
- [x] WebSocket認証チケットと接続前ガード
- [ ] Firebase / Xプロジェクト設定と実アカウントでのE2E確認
- [ ] 対戦WebSocketへの組み込み（後続の対戦タスク）

## 1. Firebaseを作成する

1. https://console.firebase.google.com/ でプロジェクトを作成。Analyticsは今回不要。
2. ウェブアプリ（`</>`）を追加。Hostingは不要。
3. プロジェクト設定に表示されるFirebase構成を `frontend/.env.local` に設定する。

```sh
cp -n frontend/.env.example frontend/.env.local
```

| Firebase構成の項目 | 環境変数 |
| --- | --- |
| apiKey | VITE_FIREBASE_API_KEY |
| authDomain | VITE_FIREBASE_AUTH_DOMAIN |
| projectId | VITE_FIREBASE_PROJECT_ID |
| appId | VITE_FIREBASE_APP_ID |

これらは公開Web設定。X API Secretやサービスアカウント秘密鍵は入れない。
値を変更したらViteを再起動する。

4. Authentication → ログイン方法でGoogleと匿名を有効化。Googleはサポート用メールを選択。
5. Authentication → 設定 → 承認済みドメインに `localhost` / `127.0.0.1` と公開先ドメインを追加。

## 2. Xを有効にする

1. X Developer Consoleでアプリを用意する。
2. アプリのユーザー認証設定でOAuth 1.0aを有効化し、必要最小限のRead権限を指定する。FirebaseのTwitter連携で使うのはAPI Key / API Key Secret（OAuth 1.0a）で、OAuth 2.0 Client IDやBearer Tokenではない。
3. コールバックURLにFirebaseのTwitterプロバイダー設定に表示されるURLを登録する。通常は `https://PROJECT_ID.firebaseapp.com/__/auth/handler`。Website URLにはアプリのURLを設定する。
4. Firebase Authentication → ログイン方法 → Twitterを有効化し、API Key / API Key Secretを入力する。

XのDeveloperアカウントやアプリ利用条件はコンソールで確認する。秘密値はFirebaseコンソールで管理し、ソースコード・チャット・VITE変数に入れない。

## 3. Goの認証情報とDBを設定する

`backend/.env.example` を参考に `backend/.env` を設定する。

- `FIREBASE_PROJECT_ID`: フロントと同じプロジェクトID。
- `DATABASE_URL`: ルート `.env` に設定したPostgreSQLの接続先。サンプルはローカル開発専用。
- Admin SDKの認証: 独自のDesktop OAuthクライアントで発行したApplication Default Credentials、またはFirebaseのプロジェクト設定 → サービスアカウントで管理用JSONを発行し、**リポジトリ外**へ保存。`GOOGLE_APPLICATION_CREDENTIALS` にその絶対パスを指定。サービスアカウントにはFirebase Authenticationのユーザー情報取得権限が必要（失効・無効化確認で使用）。本番は実行環境のサービスIDを優先する。

通常の `gcloud auth application-default login` が使うgcloud OAuthクライアントのユーザー認証情報はFirebase Authenticationで受け付けられない。ユーザー認証を使う場合は独自のDesktop OAuthクライアントを作成し、`--client-id-file` を指定する（[公式手順](https://firebase.google.com/docs/admin/setup#test_with_gcloud_end_user_credentials)）。

既存の `.env` は上書きせず不足項目を追加する。`DATABASE_URL` に記号を含むパスワードを使用する場合はURLエンコードする。

```sh
cp -n .env.example .env
cp -n backend/.env.example backend/.env
# .env / backend/.env を編集

docker compose up -d --wait db
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backend/migrations/001_users.sql
```

マイグレーションは再実行可能。既存テーブルの変更を自動で推測するものではない。以後の変更は新しいマイグレーションを追加する。

GoはREADMEの手順でビルド・起動。認証設定がない間は `/healthz` のみ利用可能で `/api/*` は503を返す。
フロント開発時の `/api` はViteからGoの8080番へプロキシする。本番環境でも同一オリジンの `/api/*` をGoへ転送し、HTTPSを使う。Viteの開発・previewサーバーを本番公開しない。

## API

| メソッド | パス | 動作 |
| --- | --- | --- |
| GET | /api/me | 本人のプロフィール。登録ユーザーは初回のみDB作成、ゲストは保存しない |
| PATCH | /api/me | 登録ユーザー本人の表示名変更。JSONは `{"displayName":"名前"}` のみ |
| POST | /api/ws-ticket | ゲストを含む本人にチケット発行。新規発行時は同一UIDの未使用チケットを失効 |

すべて `Authorization: Bearer <Firebase ID token>` 必須。URLやbodyでUIDを申告しても本人は変更されない。表示名は前後の空白を除去した1〜30 Unicodeコードポイントで、制御文字は不可。

ログにトークン・秘密鍵・プロバイダーのアクセストークンを出さない。ログアウトは当該ブラウザのFirebaseセッションを破棄する。他端末も一括失効させる機能は今回の対象外。

## 確認

```sh
cd frontend
npm test
npm run build
npm run lint
# 別ターミナル
cd backend
go test -race ./...
go vet ./...
go build -o bin/server ./cmd/server
```

実設定後の確認項目:

1. Googleでログインし、本人の表示名が出る。ページ再読み込み後も維持される。
2. 表示名を変更し、ログアウト・再ログイン後も変更が残る。
3. Xでも同様に確認する。認証画面キャンセル時はログイン成功扱いにならない。
4. ゲスト参加後は戦績を開けず、プロフィール編集APIは403を返す。
5. 別タブでログアウトすると元のタブもログイン画面へ戻る。
6. 未認証・改ざん・期限切れトークンは401。他人のUID付きbodyは400。
7. DBやGo停止時はエラーと再試行が表示され、偽の成功にはならない。
8. プロバイダーの未有効化・ドメイン未登録・ポップアップ拒否を確認する。

Firebase / Xの実設定がない環境では上記の実アカウントE2E確認は完了できない。自動テストのVerifier差し替えはテスト専用で、実サーバーには認証をバイパスするモードを設けていない。

Firebase 13はNode.js 24.12以降が必要なため `.nvmrc` は24.15.0。Firebaseの未使用Firestore依存が参照するgRPCも修正版へoverrideしている。将来Firebase更新時はoverrideが不要になったか再確認する。

## 公式資料

- [Google認証](https://firebase.google.com/docs/auth/web/google-signin)
- [X / Twitter認証](https://firebase.google.com/docs/auth/web/twitter-login)
- [匿名認証](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [IDトークンの検証](https://firebase.google.com/docs/auth/admin/verify-id-tokens)

## 2026-10-11の検証結果

- Node.js 24.15.0: フロント23テスト、TypeScriptビルド、Viteビルド、Lintが成功。
- Go: `go test -race ./...` / `go vet ./...` / ビルドが成功。
- 一時PostgreSQL 18.6: 10並列の初回ユーザー作成で重複しないこと、表示名の保存・再取得、別ユーザーの分離を検証。検証後に一時コンテナを停止。
- ブラウザ: 設定なしのGoogle / X / ゲスト操作がエラー表示になり、ログイン扱いにならないことを確認。
- npm audit: 0 vulnerabilities。
- 未確認: 実Firebase / XアカウントでのOAuth、失効済み実トークン、実ブラウザのセッション復元・別タブログアウト。Firebase / X設定後に確認する。

## 2026-10-12 実サービス接続確認

- Firebaseサービスアカウントのファイルパスをローカルbackend/.envへ設定（JSONはリポジトリ外）。
- ローカルPostgreSQL起動、usersマイグレーション適用、Go:8080とVite:5173起動。
- ブラウザからFirebase匿名認証→Goのトークン検証→プロフィール取得→タイトル表示が成功。
- 再読み込み後のゲスト認証復元が成功。ゲスト操作でusersの件数は0のまま。
- Googleの認証操作はアプリ内ブラウザでは完了を確認できず。Google / Xでの実アカウントログイン、プロフィール保存は通常のブラウザでの確認待ち。

## Xログイン失敗の診断（2026-10-12）

- ブラウザで `auth/invalid-credential` を再現。
- FirebaseのTwitter設定を読み取り、有効化済み・キーとSecret登録済み・前後の空白なしを確認（値は出力・保存しない）。
- 同じ設定でXのOAuth 1.0a request_tokenを診断するとHTTP 401。応答に `Desktop applications only support the oauth_callback value` が含まれる。
- X側がデスクトップ用として扱い、FirebaseのWebコールバックを受け付けていない。X Developer ConsoleのUser authentication settingsでWebアプリ向け設定とコールバックURLの登録を確認する。
- Callback URI: `https://reaction-race-b1f70.firebaseapp.com/__/auth/handler`
- X側の設定修正・ログイン再確認は未完了。キーの再発行を先に行う必要があるとは判断していない。
- 開発画面に秘密値を含まない診断コード表示を追加。24テスト・ビルド・Lint成功。

## 未解決バグの管理

Xログインは [Notionのバグ修正](https://app.notion.com/p/3f7df60d21148192acf8da53d92f1fae) で別管理する。認証復元中のローディングUIは親タスクの終盤で対応する。

PR用チェックアウトではGitHubの既存規約に合わせ、フロントのテストをVitest / React Testing Libraryへ統合した。現在の一括チェックは `npm run check`。前述の件数はローカルでの検証時点の記録。
