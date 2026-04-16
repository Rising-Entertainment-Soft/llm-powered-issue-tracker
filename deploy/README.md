# Deploy

GitHub Actions でビルドし、rsync で `rising` サーバーにコピーする構成です。

## 構成

```
┌────────────────────┐       push       ┌──────────────────────────┐
│ ローカル (macOS)   │ ───────────────▶ │ GitHub main ブランチ     │
└────────────────────┘                  └─────────────┬────────────┘
                                                      │ Actions 起動
                                                      ▼
                                        ┌──────────────────────────┐
                                        │ ubuntu-24.04 runner      │
                                        │ npm ci → prisma generate │
                                        │ → next build (standalone)│
                                        │ → アセット同梱           │
                                        └─────────────┬────────────┘
                                                      │ rsync over SSH
                                                      ▼
                                        ┌──────────────────────────┐
                                        │ rising (Ubuntu 24.04)    │
                                        │ ~/apps/issue-tracker/    │
                                        │   releases/<sha>/        │
                                        │   shared/.env, prod.db   │
                                        │   current  (symlink)     │
                                        │ systemd --user で常駐    │
                                        │ 127.0.0.1:3000 で待受    │
                                        └──────────────────────────┘
```

## サーバー側初期セットアップ（一度だけ）

```bash
# ローカルから deploy/ をまるごと送る
scp -r deploy rising:~/issue-tracker-deploy

# サーバーで実行
ssh rising
cd ~/issue-tracker-deploy
bash bootstrap.sh
```

`bootstrap.sh` がやること:
- Node.js 22 を NodeSource からインストール
- `loginctl enable-linger ishiguro`（ログアウト後も systemd --user が動くように）
- `~/apps/issue-tracker/{releases,shared/prisma}` を作成
- `~/apps/issue-tracker/shared/.env` のテンプレを生成（`AUTH_SECRET` だけ自動生成済み）
- `~/.config/systemd/user/issue-tracker.service` を配置し enable

その後、以下を手動で:

1. **GEMINI_API_KEY** を `shared/.env` に書き込む
2. GitHub Actions 用 deploy key を作る:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/github-actions-deploy -N ""
   cat ~/.ssh/github-actions-deploy.pub >> ~/.ssh/authorized_keys
   cat ~/.ssh/github-actions-deploy   # ← 秘密鍵を GitHub Secrets に貼る
   ```
3. GitHub リポジトリ Settings → Secrets and variables → Actions に:
   | 名前 | 値 |
   |------|----|
   | `SSH_HOST` | `160.251.196.224` |
   | `SSH_USER` | `ishiguro` |
   | `SSH_PORT` | `22` |
   | `SSH_KEY` | 秘密鍵全体（-----BEGIN〜END まで） |

## デプロイフロー

`main` に push すれば `.github/workflows/deploy.yml` が動く:

1. GitHub runner で `npm ci → prisma generate → next build`
2. `.next/standalone/` に以下を追加:
   - `.next/static/`, `public/`
   - `prisma/schema.prisma`, `migrations/`, `prisma.config.ts`
   - Prisma CLI とエンジン（`migrate deploy` 用）
   - `server-deploy.sh`, `issue-tracker.service`
3. `rsync` で `rising:apps/issue-tracker/releases/<commit-sha>/` に展開
4. リモートで `server-deploy.sh <sha>` を実行:
   - `shared/.env` を各リリースにシンボリックリンク
   - `prisma migrate deploy` を走らせる（DB は `shared/prisma/prod.db`）
   - `current` シンボリックリンクを新リリースに原子的に差し替え
   - `systemctl --user restart issue-tracker`
   - 古いリリースを最新5つだけ残して掃除
5. `curl http://127.0.0.1:3000/login` でヘルスチェック

## 初回デプロイ時の注意

- `shared/prisma/prod.db` が空（ファイル自体無い）の状態から `prisma migrate deploy` が実行され、DB とテーブルが一気に作成される。
- 初回デプロイ成功後、初代ユーザーを作るために `/setup` にブラウザでアクセスする。
- 外部公開する場合は別途 nginx/caddy を前に置き、127.0.0.1:3000 へリバースプロキシする想定。

## 手動オペレーション

サーバー上で:

```bash
# ログを見る
journalctl --user -u issue-tracker.service -f

# ステータス
systemctl --user status issue-tracker.service

# 手動再起動
systemctl --user restart issue-tracker.service

# リリース一覧
ls -lt ~/apps/issue-tracker/releases/ | head

# ロールバック（一つ前のリリースに戻す）
ln -sfn ~/apps/issue-tracker/releases/<前のSHA> ~/apps/issue-tracker/current
systemctl --user restart issue-tracker.service
```
