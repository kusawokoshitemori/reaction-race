# 06. 認証・ユーザー管理

## 実装範囲

- Google / X: Firebase Authenticationのポップアップ認証。
- 状態維持・ログアウト: Google / XはFirebase SDKのローカル永続化、ゲストはタブ単位のセッション永続化。IDトークン変更を監視し、登録ユーザーは他タブのログアウトも反映。
- ゲスト: Firebase匿名認証で識別。ユーザーテーブルには保存せず、レート・戦績も保存しない。
- プロフィール: Goが検証したFirebase UIDをキーにPostgreSQLへ作成・取得・表示名変更。
- HTTP: Firebase Admin SDKで署名・期限・発行元・プロジェクト・失効・無効化を確認。Google / Twitter / anonymous以外は拒否。

対戦WebSocketの認証は、接続処理を実装する後続タスクで扱う。

ゲストからGoogle / Xへログインした場合は、そのプロバイダーのアカウントへ切り替える。ゲスト成績の引き継ぎやGoogle / Xアカウントの自動統合は行わない。同一メールで別プロバイダーに登録済みの場合は以前使った方法へ案内する。

ゲストの匿名UIDは同じタブの再読み込みでは復元する。タブを閉じて新しく開いた場合は参加方法の選択から始まり、ゲストを選ぶと新しい匿名IDを作る。参加中にもう一度「ゲストで参加」を押した場合は同じIDでタイトルへ戻る。ブラウザの「閉じたタブを復元」等がセッションストレージを復元する場合は、ゲスト状態も復元されることがある。

以前のバージョンでローカル保存した匿名セッションは、起動時にログアウトして参加方法の選択へ戻す。Google / Xは引き続きログインを保持する。プロバイダー認証をキャンセルした場合はゲストのタブ単位の保持を継続する。

タブ終了はFirebase上の匿名アカウント削除を意味しない。匿名アカウントの削除期間・自動削除の利用可否は公開前に決める運用事項であり、削除処理は未実装。

参加後はヘッダーのログイン／アカウントを押すと認証・プロフィール画面を開き、もう一度押すとタイトルに戻る。初回の参加方法を選ぶ画面ではこの操作を表示しない。

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

すべて `Authorization: Bearer <Firebase ID token>` 必須。URLやbodyでUIDを申告しても本人は変更されない。表示名は前後の空白を除去した1〜30 Unicodeコードポイントで、制御文字は不可。

ログにトークン・秘密鍵・プロバイダーのアクセストークンを出さない。ログアウトは当該ブラウザのFirebaseセッションを破棄する。他端末も一括失効させる機能は今回の対象外。

## 確認

自動チェックのコマンドは [開発・レビュー規約](../AGENTS.md#変更時のチェック) を参照する。

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

## 既知の制限

Xログインの設定に起因する認証失敗は [Notionのバグ修正](https://app.notion.com/p/3f7df60d21148192acf8da53d92f1fae) で管理する。
認証復元中のローディングUIは親タスクの終盤で対応する。
