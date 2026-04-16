# LLM-Powered Issue Tracker

不具合報告のフリーテキストを **Gemini 2.5 Flash** で構造化し、チケット管理する Web アプリ。

## 機能

- 報告テキストの貼り付け → LLM が「タイトル / 要約 / 報告者 / 優先度 / 期日」を抽出
- 1 つの貼り付けに複数の不具合があっても自動で分割
- チケット一覧 (ステータス・担当者でフィルタ)
- 担当者割当・期日設定・ステータス変更・対応内容記録
- ログイン認証 (Auth.js Credentials)
- 全員 admin、誰でも新規ユーザー作成可能
- 監査ログ (ログイン / ユーザー作成 / チケット CRUD / LLM 解析)

## 技術スタック

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- Prisma + SQLite
- Auth.js v5 (Credentials Provider, JWT セッション)
- @google/genai (Gemini 2.5 Flash, thinking 無効, response schema 利用)

## セットアップ

```bash
# 1. 依存インストール
npm install

# 2. 環境変数を設定
cp .env.example .env
# .env を編集:
#   AUTH_SECRET = openssl rand -base64 32 で生成
#   GEMINI_API_KEY = https://aistudio.google.com/apikey で取得

# 3. DB 作成
npx prisma migrate dev --name init

# 4. 起動
npm run dev
```

ブラウザで `http://localhost:3000` を開くと、初回は `/setup` にリダイレクトされ、最初の管理者ユーザーを作成できます。

## 使い方

1. `/setup` で最初の管理者を作成 → 自動ログイン
2. ヘッダーの「新規取り込み」を開く
3. Chatwork の不具合報告スレからテキストをそのまま貼り付け
4. 「LLM で解析」ボタン → 抽出結果を確認・編集
5. 担当者を割り当てて「チケット化」
6. 一覧画面から各チケットを開いて、対応内容を記録 / ステータスを更新

## ディレクトリ

```
prisma/
  schema.prisma      # User / Ticket / AuditLog
src/
  auth.ts            # Auth.js v5 設定
  middleware.ts      # 認証ミドルウェア
  lib/
    prisma.ts        # Prisma クライアントシングルトン
    gemini.ts        # Gemini 構造化抽出
    audit.ts         # 監査ログヘルパー
    types.ts         # ステータス・優先度ラベル
  app/
    api/             # REST 風 API
    login/           # ログイン
    setup/           # 初回管理者作成
    tickets/         # 一覧 / 新規 / 詳細
    users/           # ユーザー管理
    audit/           # 監査ログ表示
```

## 注意

- SQLite は単一ファイル DB のため、複数ノードでの並行運用には向きません。社内 1 サーバー運用前提。
- LLM コストは月 1,000 件処理しても数十円程度 (gemini-2.5-flash, thinking 無効)。
- `/setup` は **DB に User が 0 件のときのみ** 動作します。一度ユーザーが作られた後は 403。
