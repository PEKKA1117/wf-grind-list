#!/usr/bin/env bash
# 測試、型別檢查、打包，再把 JS／CSS 全部內嵌成單一檔 docs/index.html
# CSP 用 default-src 'none'：頁面不能在背景連網
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p docs
[[ -d node_modules ]] || npm ci
npm test --silent
node_modules/.bin/tsc
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
node_modules/.bin/esbuild src/main.ts src/theme-init.ts src/style.css --bundle --minify --format=iife --target=es2022 --charset=utf8 --outdir="$tmp" --log-level=warning
# 用雜湊而非 unsafe-inline 放行腳本，注入的腳本不會執行
hash=$(openssl dgst -sha256 -binary "$tmp/main.js" | base64)
init=$(openssl dgst -sha256 -binary "$tmp/theme-init.js" | base64)
{
cat <<EOF
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}' 'sha256-${init}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>還沒刷 · Warframe 進度清單</title>
<style>
EOF
cat "$tmp/style.css"
printf '</style>\n<script>'; cat "$tmp/theme-init.js"; printf '</script>\n</head>\n<body>\n'
cat index.html
printf '<script>'; cat "$tmp/main.js"; printf '</script>\n</body>\n</html>\n'
} > docs/index.html
wc -c docs/index.html
