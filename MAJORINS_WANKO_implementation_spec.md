# MAJORINS WANKO サブブランド実装仕様書

> **for Cursor** / 作成: 2026-06-20
> リポジトリ: `Keeeeei-Soeda/majorin_sweets`
> 前提: MAJORIN SWEETS 本体サイトのチケット→扉→Hero→THE MOMENT→SHOWCASE 導線は実装済み

---

## 1. 概要

MAJORIN SWEETS のサブブランドとして **MAJORINS WANKO**（愛犬向けアニバーサリーケーキライン）を追加する。本フェーズでは Coming Soon 段階の告知サイトとして実装し、秋の販売開始時にプロダクトを追加できる「器」を完成させる。

### 設計原則

1. **世界観は分離する**。MAJORIN SWEETS のラグジュアリー神秘トーンと、WANKO のやわらかい親密トーンは並列に扱わない。
2. **ナラティブで接続する**。「魔法使いの工房の奥に、もう一つの扉がある」というメタファーで2つの世界を物語的に橋渡しする。
3. **将来の独立を前提に構造を作る**。`/wanko/` サブディレクトリで切り出し、いつでも別ドメイン化できる状態にする。
4. **フォントは共通、色と光だけ変える**。これでブランド階層が視覚的に伝わる。

---

## 2. ファイル構成

```
majorin_sweets/
├── index.html                     # 既存。Transition + Teaser セクション追加
├── wanko/
│   └── index.html                 # 新規。WANKO 詳細ページ
├── css/
│   ├── (既存)
│   ├── transition.css             # 新規。橋渡しセクション専用
│   └── wanko.css                  # 新規。WANKO ページ専用
├── images/
│   ├── (既存)
│   └── wanko/
│       ├── wanko-hero.jpeg        # 提供画像をそのまま配置
│       └── small-door.svg         # 「奥の扉」アイコン(後述、暫定はSVG手書きで可)
```

---

## 3. メインページ (index.html) への追加

### 3-1. 追加位置

既存の SHOWCASE セクション直後、Footer の直前に以下を追加する：

```
... (既存 SHOWCASE セクション) ...
<!-- ▼ ここから追加 -->
<section class="transition-bridge"> ... </section>
<section class="wanko-teaser"> ... </section>
<!-- ▲ ここまで追加 -->
... (既存 Footer) ...
```

### 3-2. Transition Bridge セクション

**目的**: ラグジュアリー → やわらかい世界への色温度・光量の段階的シフトを担う物理的・物語的橋渡し。

**HTML 構造**:

```html
<section class="transition-bridge" aria-label="another door">
  <div class="transition-bridge__inner">
    <div class="transition-bridge__door" aria-hidden="true">
      <!-- 小さな扉のSVG。MAJORINSロゴ扉のミニチュア版的に。
           輪郭線細め、淡い金色 #C9A961 程度。高さ160-200px -->
    </div>
    <p class="transition-bridge__whisper-fr">
      Derrière l'atelier,<br>une autre porte.
    </p>
    <p class="transition-bridge__whisper-ja">
      工房の奥に、もう一つの扉がある。<br>
      そこには、また別の物語が眠っている。
    </p>
  </div>
</section>
```

**CSS 要件 (`css/transition.css`)**:

- セクション高さ: `min-height: 60vh` (デスクトップ) / `min-height: 50vh` (モバイル)
- 背景: 上から下へグラデーション
  - 開始 (上端): `var(--showcase-bg, #0a0a0a)` 等、SHOWCASE 末尾の暗色と一致
  - 終了 (下端): `#f5ebe0` (WANKO 側のクリーム色)
  - `background: linear-gradient(180deg, #0a0a0a 0%, #2a1f1a 40%, #6b5544 70%, #f5ebe0 100%);`
- 文字色: 中央付近は中間色なので `color: #d4c5a9` でやや暗めに。視認性のためにごく薄い text-shadow を許容。
- 仏語タグライン: Cormorant Garamond, font-style: italic, font-size: clamp(1.5rem, 3vw, 2.25rem), letter-spacing: 0.1em
- 日本語タグライン: Noto Serif JP, font-weight: 300, font-size: clamp(0.875rem, 1.5vw, 1rem), line-height: 2.2
- 扉SVGはふわっと明滅 (opacity 0.6 → 1.0 → 0.6, duration 4s, infinite, ease-in-out)
- セクション全体は `IntersectionObserver` でフェードイン (opacity 0 → 1, transform: translateY(20px) → 0, duration 1.2s)
- カスタムプロパティは `.transition-bridge` スコープに閉じる (既存と同じ衝突回避ルール)

### 3-3. WANKO Teaser セクション

**目的**: 詳細ページへの誘導。最小限の存在示唆。

**HTML 構造**:

```html
<section class="wanko-teaser" aria-label="MAJORINS WANKO">
  <div class="wanko-teaser__inner">
    <p class="wanko-teaser__eyebrow">A NEW LINE — Coming this Autumn</p>
    <h2 class="wanko-teaser__title">MAJORINS<span class="paw">🐾</span>WANKO</h2>
    <p class="wanko-teaser__lead">
      大切な家族のための、特別な一日に。<br>
      マジョリンズから、もう一つの物語が生まれます。
    </p>
    <a href="/wanko/" class="wanko-teaser__cta">
      <span>Step into the other room</span>
      <span class="arrow">→</span>
    </a>
  </div>
</section>
```

**CSS 要件**:

- 背景色: `#f5ebe0` (transition の終了色とシームレス接続)
- パディング: 上下 `clamp(80px, 12vw, 160px)`
- eyebrow: 文字間隔広め `letter-spacing: 0.3em`, font-size: 0.75rem, color: `#8b7355`
- title: Cormorant Garamond, font-weight: 300, font-size: clamp(2.5rem, 6vw, 4.5rem), color: `#3d2f25`
  - `.paw` のフォントサイズは title の 0.6 倍程度、垂直中央寄せ
- lead: Noto Serif JP, font-size: clamp(0.95rem, 1.3vw, 1.05rem), line-height: 2, color: `#6b5544`
- CTA: ボーダー下線 1px + ホバーで下線が左から右へ伸びるアニメーション、矢印は hover で 8px 右へ translate
- 全体中央寄せ、最大幅 720px

---

## 4. WANKO 詳細ページ (`/wanko/index.html`)

### 4-1. ページ構造

```
[1] Hero Section          ... 提供画像 + ブランドステートメント
[2] Story Section         ... なぜ WANKO ラインを始めるのか、短いブランドストーリー
[3] Coming Soon Section   ... 9月発売予定告知 + Instagram CTA + (将来のメール登録枠)
[4] Back to MAJORINS      ... 本体サイトへ戻る導線
[5] Footer                ... 本体と共通だが配色は WANKO トーンに
```

### 4-2. Hero Section

**HTML**:

```html
<section class="wanko-hero">
  <div class="wanko-hero__image">
    <img src="../images/wanko/wanko-hero.jpeg" alt="MAJORINS WANKO" />
  </div>
  <div class="wanko-hero__copy">
    <p class="wanko-hero__eyebrow">MAJORINS WANKO</p>
    <h1 class="wanko-hero__title">
      <span class="line">Anniversary Cake</span>
      <span class="line line--ja">大切な日に、特別なひと皿を。</span>
    </h1>
    <p class="wanko-hero__lead">
      家族の記念日に。誕生日に。<br>
      愛犬と分かち合える、マジョリンズの新しいケーキライン。
    </p>
    <p class="wanko-hero__release">Coming September 2026</p>
  </div>
</section>
```

**レイアウト**:

- デスクトップ: 2カラム (画像 左 50% / コピー 右 50%)。画像は `object-fit: cover; max-height: 90vh;`
- モバイル: 縦積み (画像 → コピー)。画像は `aspect-ratio: 3/4`
- 背景: `#faf5ee` (淡いクリーム)
- 全体パディング: 0 (画像を端まで) / コピー側は 内側に `clamp(40px, 6vw, 80px)`

**タイポ**:

- eyebrow: letter-spacing: 0.4em, font-size: 0.7rem, color: `#a08866`
- title (英): Cormorant Garamond, font-weight: 300, italic, font-size: clamp(3rem, 7vw, 5rem)
- title (日): Noto Serif JP, font-weight: 400, font-size: clamp(1.1rem, 2vw, 1.4rem), color: `#5a4632`
- lead: Noto Serif JP, font-weight: 300, line-height: 2.2, color: `#6b5544`
- release: Cormorant Garamond italic, font-size: 1rem, color: `#c9a961`, letter-spacing: 0.15em

### 4-3. Story Section

**コピー (暫定。Kei が最終調整)**:

```
小さな家族へ。

MAJORIN SWEETS の工房から、もう一つの物語が生まれました。
大切な日に、人と愛犬が同じテーブルを囲める。
そんな一日のためのケーキです。

素材ひとつひとつを見直し、
小さな身体にも安心して届けられるレシピで仕立てます。

詳細は、この秋。
```

**レイアウト**: 中央寄せ、最大幅 640px、上下パディング `clamp(100px, 14vw, 180px)`。
背景: `#f5ebe0`

### 4-4. Coming Soon Section

**HTML**:

```html
<section class="wanko-coming-soon">
  <div class="wanko-coming-soon__inner">
    <p class="eyebrow">RELEASE</p>
    <h2>2026 年 初秋デビュー</h2>
    <p class="description">
      販売開始日・ラインナップ・ご予約方法の詳細は、<br>
      Instagram にて順次お知らせいたします。
    </p>
    <div class="cta-group">
      <a href="https://www.instagram.com/[アカウント名]/" class="cta cta--primary" target="_blank" rel="noopener">
        Instagram でフォロー
      </a>
      <!-- 将来のメール登録フォーム枠。今は非表示またはコメントアウト -->
      <!-- <form class="cta--newsletter"> ... </form> -->
    </div>
  </div>
</section>
```

背景: `#faf5ee`、文字色は story と統一。

### 4-5. Back to MAJORINS

```html
<section class="back-to-main">
  <a href="/" class="back-link">
    <span class="arrow">←</span>
    <span>Return to MAJORIN SWEETS</span>
  </a>
</section>
```

ここで再びダークトーン側へ視覚的に切り替える微妙なグラデーション (`#faf5ee` → `#1a1410`) を施すと、回遊体験が一巡する。

---

## 5. デザイントークン (WANKO 専用)

`css/wanko.css` の `:root` または `.wanko-page` スコープで定義：

```css
.wanko-page {
  /* Colors */
  --wanko-bg-base: #faf5ee;
  --wanko-bg-soft: #f5ebe0;
  --wanko-text-primary: #3d2f25;
  --wanko-text-secondary: #6b5544;
  --wanko-text-muted: #a08866;
  --wanko-accent: #c9a961;        /* soft gold */
  --wanko-rose: #e8c5c0;          /* dusty pink, accent only */

  /* Typography (本体と共通フォントを継承) */
  --font-display: 'Cormorant Garamond', serif;
  --font-body: 'Noto Serif JP', serif;
}
```

**重要**: 本体の `:root` 変数とは衝突させない。すべて `--wanko-` プレフィックスで隔離する (既存の `.showcase-section` スコープ化と同じパターン)。

---

## 6. インタラクション仕様

- **スクロール連動**: 各セクション `IntersectionObserver` でフェードイン (opacity + translateY)。duration 1.0-1.2s, ease-out。`prefers-reduced-motion` 対応必須。
- **Hero 画像**: モバイルでパララックス禁止 (ジャンクの原因)。デスクトップのみ、控えめに `transform: translateY(scrollY * 0.1)` 程度。
- **CTA hover**: 0.3s ease のスムース遷移。色変化は控えめに (`opacity: 0.85` 程度) し、コントラスト過剰を避ける。

---

## 7. ナビゲーション・回遊設計

- 本体サイトのグローバルナビには **現フェーズでは WANKO を追加しない**。Coming Soon の段階で常設ナビに載せると未完成感が出る。
- 代わりに **メインページの teaser からの遷移を唯一の入口**にする。これが「奥の扉」というナラティブを強化する。
- WANKO ページ側にはヘッダーに小さく `MAJORIN SWEETS / WANKO` のブランド表記を置き、現在地が分かるようにする。

---

## 8. レスポンシブ

- ブレイクポイント: 既存サイトと合わせる (768px / 1024px 想定)
- モバイルでは Hero を画像→コピーの縦積み、Transition Bridge は高さを抑える (50vh)、Teaser のパディングも調整
- 提供画像 (`wanko-hero.jpeg`) は縦長傾向のため、デスクトップでもアスペクト比を保ったまま表示

---

## 9. アクセシビリティ

- 全画像に意味のある `alt`
- Transition Bridge の扉SVGは装飾なので `aria-hidden="true"`
- セクション全体に `aria-label`
- カラーコントラスト: 本文テキストは AA 基準 (4.5:1) を満たす。`#6b5544` on `#faf5ee` は十分。
- `prefers-reduced-motion: reduce` 環境では全アニメーションを無効化

---

## 10. 既存セクションへの影響

**影響なし**。本仕様は既存の index.html の末尾に2セクション追加するのみ。SHOWCASE まわりの CSS には一切手を入れない。

懸念があるとすれば、SHOWCASE 末尾の背景色と Transition Bridge 開始色の継ぎ目。SHOWCASE 末尾の `background` 値を Cursor が確認の上、Transition Bridge の開始色 (`#0a0a0a`) と一致するよう微調整すること。

---

## 11. 実装ステップ (Cursor向け順序)

1. `images/wanko/wanko-hero.jpeg` を配置 (Kei が手動で配置済みの想定)
2. `css/transition.css` 作成 → index.html に link 追加
3. index.html に Transition Bridge + WANKO Teaser セクションを追加
4. `wanko/index.html` を新規作成 (本体 index.html のヘッド構造を継承しつつ、`.wanko-page` クラスを `<body>` に付与)
5. `css/wanko.css` 作成
6. 動作確認: ローカルで `index.html` → `Step into the other room` → `wanko/index.html` → `Return to MAJORIN SWEETS` の往復が成立すること

---

## 12. 後日対応（このフェーズではやらない）

- Stripe Products/Prices 連携 (販売開始時)
- メール通知登録フォームの本実装
- WANKO 専用のショーケース UI (商品ラインナップ確定後)
- グローバルナビへの WANKO 追加 (販売開始時)
- 「奥の扉」SVG のクリエイティブ強化 (現状は手書きSVGで暫定、将来ゆりあさんに依頼検討)

---

## 13. Kei への確認事項

- [ ] Instagram アカウントURL (teaser/wanko両ページで使用)
- [ ] Story Section のコピー最終調整
- [ ] 仏語タグライン "Derrière l'atelier, une autre porte." のニュアンス確認
- [ ] 「奥の扉」SVGはこのフェーズで暫定実装するか、ゆりあさんに依頼するか
- [ ] 提供画像 (`IMG_1522.jpeg`) のリネーム後ファイル名は `wanko-hero.jpeg` でよいか

---

以上
