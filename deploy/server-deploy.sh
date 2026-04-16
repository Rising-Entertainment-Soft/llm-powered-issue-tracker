#!/usr/bin/env bash
# サーバー側で実行される有効化スクリプト。
# GitHub Actions から rsync 直後に SSH 経由で呼ばれる。
#
# 引数: $1 = リリース識別子 (コミットSHA)
#
# 前提:
#   ~/apps/issue-tracker/releases/<sha>/ に standalone 一式が展開済み
#   ~/apps/issue-tracker/shared/.env に本番用の環境変数（DATABASE_URL 等）
#   ~/apps/issue-tracker/shared/prisma/prod.db に SQLite データベース（初回は空で OK）
#   systemd --user で issue-tracker.service が登録済み（bootstrap.sh で行う）

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <release-sha>" >&2
  exit 1
fi

RELEASE="$1"
APP_DIR="$HOME/apps/issue-tracker"
RELEASE_DIR="$APP_DIR/releases/$RELEASE"
SHARED="$APP_DIR/shared"
CURRENT="$APP_DIR/current"

if [[ ! -d "$RELEASE_DIR" ]]; then
  echo "release dir not found: $RELEASE_DIR" >&2
  exit 1
fi

echo "==> activating $RELEASE"
cd "$RELEASE_DIR"

# shared/.env と DB を各リリースから参照できるようシンボリックリンクする
ln -sfn "$SHARED/.env" .env
mkdir -p prisma
# DATABASE_URL は shared の prod.db を絶対パスで指している想定
# ここではシンボリックリンクを作らず、.env 側で絶対パス指定に統一

# マイグレーション適用（shared の DB に対して）
set -a
# shellcheck disable=SC1090
source "$SHARED/.env"
set +a

if [[ -f node_modules/prisma/build/index.js ]]; then
  echo "==> running prisma migrate deploy"
  node node_modules/prisma/build/index.js migrate deploy
else
  echo "!! prisma CLI not found in release — skipping migrate (確認必要)" >&2
fi

# current を原子的に差し替え
ln -sfn "$RELEASE_DIR" "$APP_DIR/current.new"
mv -Tf "$APP_DIR/current.new" "$CURRENT"

# systemd --user で再起動。loginctl enable-linger が済んでいる前提。
echo "==> restarting issue-tracker.service"
systemctl --user daemon-reload
systemctl --user restart issue-tracker.service
systemctl --user --no-pager status issue-tracker.service | head -15 || true

# 古いリリースを掃除（最新5つだけ残す）
echo "==> cleaning old releases"
cd "$APP_DIR/releases"
# shellcheck disable=SC2012
ls -1t | tail -n +6 | xargs -r rm -rf

echo "==> deploy complete: $RELEASE"
