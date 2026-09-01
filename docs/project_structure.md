# プロジェクト構成（2026-09-01 整理後）

MAJORINS 公式サイト（GitHub Pages + Cloudflare Worker）のディレクトリ構成。

---

## ルート直下（公開・運用）

| パス | 用途 |
|---|---|
| `index.html` | **トップページ正本**（React 単一ファイル LP） |
| `CNAME` | カスタムドメイン設定 |
| `package.json` | ローカルサーバー（`npm start` → port 3000） |

### 公開ページ

| パス | 用途 |
|---|---|
| `order/index.html` | 注文ページ |
| `guide/index.html` | ご利用ガイド |
| `company/index.html` | 企業案内 |
| `contact/index.html` | お問合せ |
| `privacy/index.html` | 個人情報の取扱い |
| `wanko/index.html` | WANKO ティザー |

### アセット

| パス | 用途 |
|---|---|
| `images/` | 本番用画像（showcase / toppage / spring2026 / wanko 等） |
| `css/` | 共通 CSS（wanko / transition） |
| `videos/` | 本番動画（`cake_cut.mp4` 等） |
| `0525/` | オープニング動画（`opening_20260816.mp4`） |

### 開発・同期

| パス | 用途 |
|---|---|
| `scripts/sync-html-versions.mjs` | `index.html` → `versions/` へ執事あり/なしを同期 |
| `versions/0617_ver01.html` | 執事セクションあり版（同期生成） |
| `versions/0617_ver02.html` | 執事なし版（正本コピー） |
| `workers/stock/` | 在庫 API（Cloudflare Worker） |

### ドキュメント

| パス | 用途 |
|---|---|
| `docs/` | 仕様書・改修記録・ブランド資料 |

---

## `_archive/`（非公開・保管）

GitHub Pages には載せない過去資産・作業ファイル。

| パス | 用途 |
|---|---|
| `_archive/html/` | 旧 HTML プロトタイプ、`message-list.html`（手紙メッセージ一覧） |
| `_archive/assets/` | 旧画像・動画 |
| `_archive/scripts/` | Stripe 設定・検証スクリプト（本番非依存） |
| `_archive/incoming/` | 未整理の受け取り素材（gitignore） |
| `_archive/backups/` | 作業前バックアップ（gitignore） |

---

## 削除したもの（2026-09-01）

### `r20*.html`（16 ファイル）

キャッシュ bust 用にルートへ置いていた `index.html` の日時付きコピー。  
正本は `index.html` のみ。再作成しない（`.gitignore` で `r20*.html` を除外）。

### ルート散在ファイル → `_archive/incoming/` へ移動

- デザイン草案（`名称未設定のデザイン/`）
- 未使用動画（`opening_movie.mp4` 等）
- クライアント指示画像（JPEG / ChatGPT 生成 PNG 等）

---

## ローカル開発

```bash
npm start          # http://localhost:3000
npm run sync:versions   # index.html → versions/ 同期
cd workers/stock && npm run deploy   # Worker 本番デプロイ
```

---

## 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-09-01 | 初版。`r20*.html` 削除・ルート整理 |
