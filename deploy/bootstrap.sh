#!/usr/bin/env bash
# サーバーに対して一度だけ実行するセットアップスクリプト。
# ssh rising でログインした後、このファイルを scp しておくか curl で取得して実行する。
#
#   bash bootstrap.sh
#
# やること:
#   1. Node.js 22 をインストール（NodeSource）
#   2. systemd --user をログアウト後も維持させる (enable-linger)
#   3. アプリディレクトリ構造を作る
#   4. shared/.env のテンプレを配置（未作成なら）
#   5. systemd user unit をコピーして enable
#
# sudo パスワードを数回聞かれる。

set -euo pipefail

APP_DIR="$HOME/apps/issue-tracker"
SHARED="$APP_DIR/shared"

echo "==> [1/5] Installing Node.js 22"
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "node already installed: $(node --version)"
fi

echo "==> [2/5] Enabling user linger for ${USER}"
sudo loginctl enable-linger "$USER"

echo "==> [3/5] Creating directory layout"
mkdir -p "$APP_DIR/releases"
mkdir -p "$SHARED/prisma"
mkdir -p "$HOME/.config/systemd/user"

echo "==> [4/5] Preparing shared/.env"
if [[ ! -f "$SHARED/.env" ]]; then
  cat > "$SHARED/.env" <<EOF
# 本番用環境変数。git 管理しない。
DATABASE_URL=file:$SHARED/prisma/prod.db
AUTH_SECRET=$(openssl rand -hex 32)
# 公開ホスト名に合わせて書き換え
AUTH_URL=http://127.0.0.1:3000
# Gemini のキーは空。あとで手で書き換える。
GEMINI_API_KEY=
EOF
  chmod 600 "$SHARED/.env"
  echo "   created $SHARED/.env (GEMINI_API_KEY を手動で埋めてください)"
else
  echo "   $SHARED/.env already exists — skipping"
fi

echo "==> [5/5] Installing systemd --user unit"
# このスクリプトと同じディレクトリに issue-tracker.service がある想定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/issue-tracker.service" ]]; then
  cp "$SCRIPT_DIR/issue-tracker.service" "$HOME/.config/systemd/user/"
  systemctl --user daemon-reload
  # 初回はまだ current/ が無いので start はしない。有効化だけ。
  systemctl --user enable issue-tracker.service || true
  echo "   installed issue-tracker.service (first deploy 後に自動起動します)"
else
  echo "   !! issue-tracker.service not found next to bootstrap.sh" >&2
fi

cat <<'MSG'

==========================================================
bootstrap 完了。次の手順:

 1. このサーバーの公開鍵を GitHub Actions の deploy key として登録する:
    ssh-keygen -t ed25519 -f ~/.ssh/github-actions-deploy -N ""
    cat ~/.ssh/github-actions-deploy.pub >> ~/.ssh/authorized_keys
    cat ~/.ssh/github-actions-deploy    # ← これを GitHub Secrets SSH_KEY に貼る

 2. shared/.env の GEMINI_API_KEY を本物のキーで埋める。
    AUTH_URL も公開ホスト名に書き換える（後で nginx を前に置くなら）。

 3. GitHub リポジトリの Settings → Secrets and variables → Actions に以下を登録:
      SSH_HOST = 160.251.196.224
      SSH_USER = ishiguro
      SSH_PORT = 22
      SSH_KEY  = (手順1 で出力した秘密鍵まるごと)

 4. main に push すれば Actions が走り、初回デプロイが完了すると
    systemd --user で 127.0.0.1:3000 でアプリが立ち上がる。
==========================================================
MSG
