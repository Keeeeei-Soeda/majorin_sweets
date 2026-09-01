# MAJORINS トップページ CTA 改修・受付ロジック統一（2026-09-01）

平石さん手書き指示（IMG_0779 / IMG_0780）に基づく CTA セクション改修と、表示文言に合わせた受付開始日（水曜）へのロジック統一の実装記録。

---

## 概要

| 項目 | 内容 |
|---|---|
| 作業日 | 2026-09-01 |
| 指示元 | 平石さん（手書き指示画像 2 点） |
| 主対象 | `index.html`（`id="reservation"` CTA セクション、浮遊「ご注文」ボタン） |
| 連動変更 | 受付ロジック・関連ページ文言・Cloudflare Worker |
| バックアップ | `_archive/backups/index_backup_20260901.html`（作業前の `index.html` コピー） |
| 本番コミット | `8955e6a` — CTAセクションを刷新し、受付開始を水曜10:00に統一する。 |
| Worker デプロイ | `majorins-stock` Version ID: `e223b577-3cad-440e-8830-efd33024a7ff` |

---

## 1. CTA セクション（`id="reservation"`）

### 1-1. 背景色をグレーに変更

- **対象:** `styles.ctaSection`
- **変更:** 暗色グラデーション → `#A5A5A5`（チケット画面 `styles.ticketScreen` と同色）
- **連動調整（明背景向けテキスト色）:**

| styles キー | プロパティ | 旧 | 新 |
|---|---|---|---|
| `ctaSubtitle` | `color` | `rgba(245, 240, 242, 0.88)` | `#333333` |
| `priceBox` | `background` | `rgba(74, 14, 78, 0.2)` | `rgba(255, 255, 255, 0.45)` |
| `priceBox` | `border` | `1px solid rgba(192, 64, 96, 0.35)` | `1px solid rgba(26, 26, 26, 0.18)` |
| `ctaNoteText` | `color` | `rgba(245, 240, 242, 0.82)` | `#333333` |
| `footer` | `borderTop` | `1px solid rgba(169, 169, 169, 0.2)` | `1px solid rgba(26, 26, 26, 0.22)` |
| `copyright` | `color` | `rgba(245, 240, 242, 0.72)` | `#605F5F` |

- `ctaTitle`（ピンクグラデーション文字）はグレー背景でも視認できるため変更なし。

### 1-2. タイトル・ラベル

| 項目 | 旧 | 新 |
|---|---|---|
| タイトル | `MAJORIN SWEETS` | `MAJORINS` |
| 追加ラベル | — | `ご予約について`（`styles.ctaSectionLabel`） |

### 1-3. サブタイトル

- **旧:** `🌹 完全予約制 \| 各週・各商品10個限定 🌹`
- **新:** `🌹 完全予約販売／販売上限あり 🌹`
- `styles.ctaSubtitle.marginBottom`: `60px` → `40px`

### 1-4. 価格ボックス → 予約スケジュール案内

枠内の価格表記（お一人様 / ¥4,800〜 / 税込・送料込）を予約スケジュール文に差し替え。

**表示文言:**

```
毎週水曜日10時から予約開始
翌週木曜日より発送。

ご予約上限に達した場合は翌々週の発送となります。
ご了承の程宜しくお願いします。
```

**追加 styles:** `reserveSchedule` / `reserveScheduleNote`  
**旧 styles:** `priceLabel` / `priceAmount` / `priceNote` は復活用に残置（削除していない）。

### 1-5. 注記文

- **旧（2 行）:** 週10個 SOLD OUT・受付時間・発送日に関する注記
- **新（1 文）:** `※ 週のご予約上限に達しましたら翌週の注文分となり、発送も翌々週となりますので、お届けまで1〜2週間程お時間頂きます。`

### 1-6. フッターコピー削除

「痛みと共に生きる人々に…」ブロック（`styles.footerText`）を JSX コメントアウト。style 定義は残置。

### 1-7. フッターナビ

4 リンクを横並び（`styles.footerNav` / `styles.footerNavLink`）。リンク色はグレー背景向けに濃色（`#1A1A1A`）へ変更。

| リンク | パス |
|---|---|
| 企業案内 | `/company/` |
| お問合せ | `/contact/` |
| ご利用ガイド | `/guide/` |
| 個人情報の取扱い | `/privacy/` |

> 個人情報リンクは仕様初版では 3 リンク構成だったが、実装後のフィードバックにより復活。

---

## 2. 浮遊「ご注文」ボタン（`.fab-order`）

### 既存機能（変更前から存在）

2026-08-22 以降のスナップショットに既に `.fab-order` / `showOrderFab` が存在。  
扉オープン後・一定スクロール後・ショーケースが画面外のとき等に右下固定表示。

### 今回の追加

ボタン枠内に文言を入れるとスマホで横幅が大きくなるため、**ボタン真上にキャプション**を添える方式に変更。

| 要素 | 内容 |
|---|---|
| ラッパー | `.fab-order-wrap`（位置指定・animation をこちらへ移動） |
| キャプション | `.fab-order-caption` — 「毎週水曜10時 予約開始」 |
| ボタン本体 | サイズ・見た目は従来どおり |

**表示条件（`showOrderFab`）:**

- `doorState === 'open' \|\| doorState === 'story'`
- `scrollY > window.innerHeight * 0.85`
- ショーケース（`#showcase`）が画面内にない
- 手紙ポップアップ（`globalLetter`）が開いていない

---

## 3. 受付ロジック統一（木曜 → 水曜）

表示文言「毎週水曜10時」と実装の食い違いを解消。

### 受付ルール

| 項目 | 値 |
|---|---|
| 受付開始 | 毎週 **水曜 10:00 JST** |
| 受付終了 | その週 **日曜 10:00 JST**（開始から 4 日間） |
| 週次在庫 | 商品ごと 10 個 |

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `index.html` | `weekStartUtc()` を水曜基準（`daysFromWed`）に変更。`isReceptionOpen()` を 4 日間に修正（旧: 木曜基準・3 日間） |
| `order/index.html` | 上記と同一ロジック。受付時間外メッセージを水曜表記へ |
| `workers/stock/src/index.js` | Worker 側も同一ロジック。`receptionEndUtc()` を `+ 4 * 86400000` に修正 |
| `workers/stock/test-week.mjs` | 水曜基準のテストケース（パス確認済み） |
| `company/index.html` | 引渡し時期の文言を水曜表記へ |
| `guide/index.html` | ご注文受付の文言を水曜表記へ |
| `docs/MAJORINS_order_checkout_spec.md` | 仕様書の受付時間表記を更新 |

### ロジック概要（共通）

```js
// 直近の水曜 10:00 JST（now がそれより前なら先週水曜）
const daysFromWed = (w.dow + 7 - 3) % 7;

// 受付中判定
return nowMs >= start && nowMs < start + 4 * 86400000;
```

---

## 4. 実装方針（コード変更ルール）

仕様書どおり、**削除ではなくコメントアウト**で旧コードを残置。

- JSX 内: `{/* ... */}`
- `styles` オブジェクト内: `/* ... */`
- 入れ子 JSX コメントは作らない

---

## 5. 触っていない範囲

- オープニング動画（`#majorin-opening`）
- チケット画面（`styles.ticketScreen` 一式）
- 扉演出（`doorState` ロジック）
- ショーケース（`.showcase-section`、SOLD OUT 判定 UI）
- 在庫 API URL（`STOCK_API_URL`）
- 美味しさのひみつ / 素材・材料 / 取り扱い・食べ方
- STORY / Crafting / WANKO ティザー
- 「今すぐ予約する」ボタンの遷移先（`alert('予約ページへ遷移します')` のまま）

---

## 6. デプロイ状況

### GitHub（静的サイト）

- **ブランチ:** `main`
- **リモート:** `Keeeeei-Soeda/majorin_sweets`
- **プッシュ済みコミット範囲:** `edeec3c..8955e6a`（8 コミット）

含まれる主なコミット:

| コミット | 内容 |
|---|---|
| `8955e6a` | CTA 改修 + 水曜受付ロジック統一 |
| `98da1c4` | 企業案内（ママ食材株式会社） |
| `e732b25` | 個人情報の取扱いページ |
| `2d91ed3` | お問合せページ + 送信 API |
| `91a9b31` | 企業案内ページ + フッター導線 |
| `eb9af35` | 受付時間制約復帰 + ガイド送料無料表記 |

### Cloudflare Worker（在庫 API）

```
Worker: majorins-stock
URL:    https://majorins-stock.majorins.workers.dev
Version: e223b577-3cad-440e-8830-efd33024a7ff
```

デプロイ後 `/status` 確認例（2026-09-01 時点）:

- `weekId`: `2026-08-26`（水曜開始）
- `receptionEndIso`: `2026-08-30T01:00:00.000Z`（日曜 10:00 JST）
- `accepting`: `false`（受付時間外 — 想定どおり）

---

## 7. 確認チェックリスト

- [x] CTA 背景がグレー（`#A5A5A5`）で全テキストが読める
- [x] タイトル「MAJORINS」+ ラベル「ご予約について」
- [x] サブタイトル「完全予約販売／販売上限あり」
- [x] 価格ボックスが予約スケジュール文に差し替わっている
- [x] 注記が新しい 1 文になっている
- [x] 「痛みと共に生きる人々に…」が非表示
- [x] フッターに 4 リンク（企業案内 / お問合せ / ご利用ガイド / 個人情報）が並ぶ
- [x] 浮遊ボタン上にキャプション「毎週水曜10時 予約開始」
- [x] 浮遊ボタン本体のサイズは従来どおり
- [x] 受付ロジックが水曜 10:00 開始に統一（トップ / 注文 / Worker）
- [x] Worker 本番デプロイ済み
- [x] GitHub `main` プッシュ済み

---

## 8. 未対応・今後の検討

| # | 内容 | 現状 |
|---|---|---|
| 1 | 「今すぐ予約する」ボタン | `alert()` のまま。`/order/` への遷移は別途対応想定 |
| 2 | 受付終了タイミングのユーザー向け説明 | ロジック上は日曜 10:00 まで。CTA 注記には明記していない |
| 3 | 作業前バックアップ | `_archive/backups/index_backup_20260901.html` に保管 |

---

## 9. 関連ファイル一覧

```
index.html                          … CTA 改修・受付ロジック・浮遊ボタン
order/index.html                    … 受付ロジック・文言
workers/stock/src/index.js          … Worker 受付ロジック
workers/stock/test-week.mjs         … 週次ロジックテスト
company/index.html                  … 受付時間文言
guide/index.html                    … 受付時間文言
docs/MAJORINS_order_checkout_spec.md … 仕様書表記更新
docs/MAJORINS_cta_revision_20260901.md … 本改修の実装記録
docs/project_structure.md             … プロジェクト構成（整理後）
_archive/backups/index_backup_20260901.html … 作業前バックアップ
```

---

## 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-09-01 | 初版。CTA 改修・水曜受付統一・本番プッシュ・Worker デプロイを記録 |
