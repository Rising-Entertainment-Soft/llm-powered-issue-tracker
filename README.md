# 🐛 LLM-Powered Issue Tracker

> Chatwork や Slack に散らばる不具合報告テキストを、**Gemini 2.5 Flash** で即座に構造化してチケット化する社内向けウェブアプリ。

---

## できること

| | |
|---|---|
| 🤖 **LLM 自動構造化** | フリーテキストを貼り付けると、タイトル・要約 (`description`)・優先度・期日・担当者候補・原文までを分解。1回の貼り付けに複数の報告が混ざっていても自動分割。 |
| 🌳 **階層チケット** | 親チケットに「+ 子チケット」で紐付け。孫・ひ孫まで任意の深さで構築可能。親を削除すれば子孫も連鎖削除。 |
| ✨ **`!ai` インライン生成** | タイトル / 内容 / 対応内容 の入力欄で `!ai` と入力するとプロンプトモーダルが起動。前後文脈を踏まえた文をその場で挿入 (Notion AI 風)。 |
| 💾 **リアルタイム自動保存** | 全フィールドがデバウンス付き autosave。保存ボタン不要。行内のステータス / 優先度 / 担当者 / 期日も即反映。 |
| 🧭 **ソート & フィルタ** | 担当者・ステータス・重要度・報告者・締切日・登録日で並び替え。未完了のみ表示がデフォルト。 |
| 👤 **担当者自動推定** | 本文に「○○さんお願いします」等の記述があれば、既存ユーザーと曖昧マッチして `assigneeId` を自動セット。 |
| 📱 **PWA 対応** | `manifest.ts` + 動的アイコン (Satori) + Service Worker でホーム画面インストール可。 |
| 🔐 **認証 + 監査ログ** | Auth.js Credentials + JWT。全員 admin、誰でもユーザー作成可。全操作 (ログイン / チケット CRUD / LLM 解析 / AI 生成) を監査ログに記録。 |

---

## 技術スタック

- **Next.js 16** (App Router, Turbopack)
  - 認証ミドルウェアは `src/proxy.ts` (Next 16 で `middleware.ts` から改名)
  - `output: "standalone"` でデプロイアーティファクトを最小化
- **Prisma 7** + **SQLite** (via `@prisma/adapter-better-sqlite3`)
  - DB URL は `prisma.config.ts` 経由 (Prisma 7 で `schema.prisma` から分離)
- **Auth.js v5** (Credentials Provider, JWT セッション)
- **@google/genai** — Gemini 2.5 Flash, `thinkingBudget: 0`, `responseSchema` による JSON 保証
- **Tailwind CSS v4**
- **TypeScript 5** / **React 19**

---

## ローカル開発

```bash
# 1. 依存
npm ci

# 2. 環境変数
cp .env.example .env
# .env を編集:
#   AUTH_SECRET    = openssl rand -hex 32
#   GEMINI_API_KEY = https://aistudio.google.com/apikey で発行
#   AUTH_URL       = http://localhost:3000
#   DATABASE_URL   = file:./dev.db

# 3. DB を作成
npx prisma migrate dev

# 4. 起動
npm run dev
```

`http://localhost:3000` を開くと、初回はユーザーが 0 件なので `/setup` にリダイレクトされ、最初の管理者を作成できます。その後は `/login`。

---

## 主な画面

| 画面 | 説明 |
|---|---|
| `/` | チケット一覧。上部に取り込みフォーム、下に階層ツリー。行内で各フィールド即編集、行クリックでアコーディオン (内容編集 + 対応内容 + 原文モーダル + `+ 子チケット`)。 |
| `/login` | LP 風のログインページ。アプリの機能説明と GitHub リンク。 |
| `/setup` | 初回管理者作成。User が 0 件のときのみ動作。 |
| `/users` | ユーザー一覧・作成。 |
| `/audit` | 監査ログ。 |

---

## `!ai` トリガの使い方

タイトル / 内容 / 対応内容 の編集欄で、**行頭または空白直後** に `!ai` と入力するとプロンプトモーダルが開きます。

```
初動調査:
!ai      ← これを打ち終わった瞬間に !ai が消えてモーダル起動
```

1. モーダルでプロンプト入力 (例: 「ログの要約を3行で」) → `Enter`
2. Gemini が前後文脈を考慮して文章を生成
3. `OK` でカーソル位置に挿入、`再生成` / `キャンセル` も可能

---

## デプロイ (GitHub Actions → rsync → systemd + Caddy)

`main` に push すると `.github/workflows/deploy.yml` が走り、サーバー上で自動起動まで行います。詳細は [`deploy/README.md`](./deploy/README.md)。

```
┌────────────────────┐ push  ┌──────────────┐  Actions  ┌──────────────────────┐
│ ローカル開発       │ ────▶ │ GitHub main  │ ────────▶ │ Ubuntu 24.04 runner  │
└────────────────────┘       └──────────────┘           │ npm ci → prisma gen  │
                                                        │ → next build (stand) │
                                                        │ → pack & rsync       │
                                                        └──────────┬───────────┘
                                                                   │ ssh
                                                                   ▼
                                                        ┌──────────────────────┐
                                                        │ rising (Ubuntu 24.04)│
                                                        │ releases/<sha>/      │
                                                        │ shared/.env, prod.db │
                                                        │ current (symlink)    │
                                                        │ systemd --user :3000 │
                                                        │ Caddy :443 (LetsEnc) │
                                                        └──────────────────────┘
```

**デプロイステップ** (概要):

1. `ubuntu-24.04` で `npm ci` → `npx prisma generate` → `next build`
2. `.next/standalone/` に `static / public / prisma / prod の node_modules` を重ねる
3. `rsync` で `~/apps/issue-tracker/releases/<sha>/` に展開
4. リモートで `server-deploy.sh` を実行:
   - `shared/.env` のシンボリックリンク
   - `prisma migrate deploy` (`shared/prisma/prod.db` に対して)
   - `current` を原子的に差し替え
   - `systemctl --user restart issue-tracker`
5. ヘルスチェックで `/login` 200 を確認
6. 古いリリースを 5 世代だけ残して掃除

初回サーバーセットアップ (Node.js 22 / linger / systemd unit / Caddy) は [`deploy/bootstrap.sh`](./deploy/bootstrap.sh) と [`deploy/caddy-setup.sh`](./deploy/caddy-setup.sh) を手動実行。

---

## データモデル

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String
  passwordHash  String
  ...
}

model Ticket {
  id            String    @id @default(cuid())
  title         String
  description   String?                 // 「何をしなきゃいけないのか」
  originalText  String                  // LLM が抽出した原文
  reporterName  String?                 // = ログインユーザー名
  assigneeId    String?                 // 自動 or 手動
  dueDate       DateTime?
  priority      String    @default("MEDIUM") // LOW | MEDIUM | HIGH
  status        String    @default("OPEN")   // OPEN | IN_PROGRESS | DONE | WONT_FIX
  actionTaken   String?
  parentId      String?                 // 階層構造
  parent        Ticket?   @relation("TicketChildren", ..., onDelete: Cascade)
  children      Ticket[]  @relation("TicketChildren")
  createdById   String
  ...
}

model AuditLog {
  action   String  // LOGIN | CREATE_TICKET | UPDATE_TICKET | DELETE_TICKET | EXTRACT | AI_ASSIST | ...
  ...
}
```

---

## ディレクトリ構成

```
prisma.config.ts           # Prisma 7 datasource 設定 (DATABASE_URL はこちら)
prisma/
  schema.prisma            # User / Ticket (階層) / AuditLog
  migrations/
src/
  auth.ts                  # Auth.js v5 (Credentials + audit on login/logout)
  proxy.ts                 # Next 16 Proxy (旧 middleware)。PWA アセットはホワイトリスト
  lib/
    prisma.ts              # PrismaClient + better-sqlite3 adapter
    gemini.ts              # Gemini 構造化抽出 + retry (401/429/500/502/503)
    audit.ts               # 監査ログヘルパー
    types.ts               # STATUSES / PRIORITIES とラベル・色
    iconArt.tsx            # PWA アイコンの Satori JSX
  components/
    Header.tsx             # safe-area-inset 対応 sticky ヘッダー
    SessionProvider.tsx
    ServiceWorkerRegister.tsx
    SmartEditors.tsx       # !ai トリガ付き input / textarea
  app/
    manifest.ts            # Web App Manifest
    icon.tsx / icon2.tsx / icon3.tsx / apple-icon.tsx
    layout.tsx
    page.tsx               # メイン一覧 (ツリー + 取り込みフォーム + ソート/フィルタ)
    login/                 # LP 風ログインページ
    setup/                 # 初回管理者作成
    users/                 # ユーザー管理
    audit/                 # 監査ログ
    api/
      auth/[...nextauth]/
      extract/             # Gemini で貼り付けテキスト → 構造化 JSON
      ai-assist/           # !ai のプロンプト → 挿入文生成
      tickets/             # CRUD + 子孫一括削除
      tickets/[id]/
      users/
      setup/
      audit/
public/
  sw.js                    # 最低限の Service Worker (installability)
deploy/
  bootstrap.sh             # サーバー初期セットアップ (Node 22 / linger / systemd)
  caddy-setup.sh           # Caddy インストール + Caddyfile 配置
  server-deploy.sh         # リリース有効化 (rsync 後に Actions から呼ばれる)
  issue-tracker.service    # systemd --user unit
  Caddyfile                # llm.rising.saltybullet.com リバプロ + Let's Encrypt
  README.md
.github/workflows/deploy.yml
```

---

## 注意点 / 制約

- **SQLite** なので単一ノード運用前提。並行書き込みは限定的。社内 1 サーバーの想定。
- **Gemini 2.5 Flash 無料枠**: 20 リクエスト/日/モデル。テストですぐ消費するので、本格運用するなら課金設定を推奨。
- **`/setup`** は User が 0 件のときのみ動作。一度ユーザーが作られた後は 403。
- **Service Worker**: 開発環境 (`npm run dev`) では登録しない。本番ビルドのみ有効。
- **PWA のアイコンサフィックス** は数字必須 (`icon.tsx`, `icon2.tsx`, …)。Next.js の命名規則。

---

## ライセンス

社内運用向けプライベートプロジェクト。ライセンス指定なし。
