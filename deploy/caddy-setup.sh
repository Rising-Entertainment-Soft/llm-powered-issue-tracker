#!/usr/bin/env bash
# rising サーバーで一度だけ実行する Caddy セットアップスクリプト。
#
#   bash caddy-setup.sh
#
# やること:
#   1. Caddy 公式 apt リポジトリを追加して caddy をインストール
#   2. ufw が有効なら 80/443 を許可
#   3. このスクリプトと同じディレクトリにある Caddyfile を /etc/caddy/Caddyfile に配置
#   4. caddy.service を enable して起動 / 再読み込み
#
# 前提:
#   - Next.js アプリが systemd --user で 127.0.0.1:3000 に待受している（bootstrap 済み）
#   - shared/.env の AUTH_URL を "https://llm.rising.saltybullet.com" に更新してから
#     `systemctl --user restart issue-tracker.service` を実行する
#   - DNS A レコード llm.rising.saltybullet.com → 160.251.196.224 を設定する
#     (DNS が伝播していない間は証明書取得に失敗する。伝播後 Caddy が自動リトライ)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> [1/4] Installing Caddy"
if ! command -v caddy >/dev/null; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y caddy
else
  echo "    caddy already installed: $(caddy version)"
fi

echo "==> [2/4] Allowing 80/443 in ufw (if active)"
if sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
else
  echo "    ufw inactive — skipping (cloud-side firewall might still need 80/443 open)"
fi

echo "==> [3/4] Deploying Caddyfile"
if [[ ! -f "$SCRIPT_DIR/Caddyfile" ]]; then
  echo "!! Caddyfile not found next to this script" >&2
  exit 1
fi
sudo install -o root -g root -m 0644 "$SCRIPT_DIR/Caddyfile" /etc/caddy/Caddyfile
sudo mkdir -p /var/log/caddy
sudo chown caddy:caddy /var/log/caddy

echo "==> [4/4] Reloading Caddy"
sudo systemctl enable caddy
# 既に動いていれば reload、止まっていれば start
if sudo systemctl is-active --quiet caddy; then
  sudo systemctl reload caddy
else
  sudo systemctl start caddy
fi

sudo systemctl --no-pager status caddy 2>&1 | head -10 || true

cat <<'MSG'

==========================================================
Caddy セットアップ完了。次に必要なこと:

  1. DNS の A レコードを設定:
       llm.rising.saltybullet.com  →  160.251.196.224

  2. クラウド側のファイアウォール / セキュリティグループで
     TCP 80, 443 が開いているか確認。

  3. shared/.env を更新して AUTH_URL を本番URLに:
       sed -i 's|^AUTH_URL=.*|AUTH_URL=https://llm.rising.saltybullet.com|' \
         ~/apps/issue-tracker/shared/.env
       systemctl --user restart issue-tracker.service

  4. ブラウザで https://llm.rising.saltybullet.com を開く。
     初回アクセス時に Caddy が Let's Encrypt 証明書を取得する。
     1分くらい証明書取得待ちで遅れることがある。

ログ:
  sudo journalctl -u caddy -f         # Caddy 全体
  sudo tail -f /var/log/caddy/llm-issue-tracker.log
==========================================================
MSG
