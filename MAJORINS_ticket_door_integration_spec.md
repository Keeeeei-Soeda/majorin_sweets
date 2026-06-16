# MAJORINS トップページ — チケット画面 & 扉演出 統合仕様書

**対象ファイル**: `index.html` （= `majorin_sweet_0607.html` と同一内容）
**作業のゴール**: 動画の後に「チケット画面」を新規追加し、クリックで扉セクションへ遷移する物語性の高い導入を実装する
**作業日**: 2026-06-17

---

## 1. 完成形のユーザー体験

```
[1] オープニング動画 (0525/0525.mp4)
　　└─ 既存実装そのまま（変更なし）
　　↓ ended イベント
[2] 白フェード (IN 800ms → OUT 1000ms)
　　└─ 既存実装そのまま（変更なし）
　　↓ #majorin-opening 削除、#root 表示
[3] チケット画面（★新規追加セクション）
　　・MAJORIN SWEETS タイトル + ようこそ文面 + チケット画像 + 締め文面 + クリック誘導
　　・1画面に収まる（100dvh）
　　↓ チケットをクリック / タップ
[4] Lift演出（チケットが上に浮き上がりながらフェード、約1秒）
　　↓ 同時に画面遷移
[5] 扉セクション（既存実装をほぼそのまま使用）
　　・doorState: 'closed' → 'opening' → 'open' → 'story'
　　・クリック起点でトリガー（スクロール起点も保険として併用）
　　↓ door-left.png / door-right.png が rotateY で観音開き（2s, バウンス）
[6] Hero Section（既存だが扉セクションの後ろに移動）
　　・バラのコテージ画像 (hero_main.jpg) + MAJORIN SWEETS タイトル
　　・「↓ スクロールして扉を開ける ↓」の文言は削除
[7] 執事 + 選択肢
　　・既存の doorman.png 出現 + 選択肢ボタン（buy / story）
　　・Hero Section の中、または扉セクションから継承
　　↓ buy 選択
[8] showcase（既存実装そのまま）
```

---

## 2. 既存実装の前提（Cursorは触らない部分）

以下は **既に動作している既存実装**。今回の作業では原則変更しない：

### 2-1. オープニング動画システム
- `index.html` の line 869-960 周辺
- `#majorin-opening` div、`startWhiteout()`、`finishOpening()` の流れ
- タイミング: `WHITE_IN_MS = 800`, `FADE_MS = 1000`, `FALLBACK_MS = 42000`
- 動画終了 → 白フェード → `#root` 表示の流れは変更しない

### 2-2. 扉画像とアニメーション
- `images/door-left.png` / `images/door-right.png` / `images/doorman.png` はそのまま使用
- `styles.door` の `transition: 'transform 2s cubic-bezier(0.68, -0.55, 0.265, 1.55)'` はそのまま
- `transformOrigin: 'left center'` / `'right center'` の観音開きはそのまま

### 2-3. showcase セクション
- 3つのケーキ（Noir Melt / Verdant Veil / Passion Orange Vert）
- ホバーエフェクト、スポットライト、レスポンシブ
- いずれも変更なし

### 2-4. 利用するフォント
既存の `<link>` で読み込み済み（`index.html` line 13）:
- Cormorant Garamond
- Noto Serif JP
- Cinzel
- Playfair Display

→ 新規のフォント読み込みは **不要**

---

## 3. 【作業1】チケット画面の新規追加

### 3-1. 配置位置

`MajorinSweetsLP()` コンポーネント (line 1184) の `return` の中、`<div style={styles.container}>` の **直後、`{/* Hero Section */}` の前**。
つまり、Hero Section の前に新セクションとして挿入する。

### 3-2. State の追加

`MajorinSweetsLP()` の useState 群（line 1185-1190 周辺）に追加：

```jsx
const [ticketState, setTicketState] = useState('visible'); 
// 'visible' → 'lifting' → 'gone'
```

### 3-3. JSX コード（追加するセクション）

```jsx
{/* ===== Ticket Screen ===== */}
{ticketState !== 'gone' && (
  <section style={styles.ticketScreen}>
    <div style={styles.ticketScreenInner}>
      <div style={styles.ticketTopBlock}>
        <h1 style={styles.ticketTitle}>MAJORIN SWEETS</h1>
        <p style={styles.welcomeJp}>ようこそ　いらっしゃいませ</p>
        <p style={styles.welcomeJp}>素敵な貴方に</p>
        <p style={styles.welcomeJp}>ご来店頂き嬉しいわ!</p>
      </div>

      <div
        style={{
          ...styles.ticketArea,
          transform: ticketState === 'lifting' ? 'translateY(-60px)' : 'translateY(0)',
          opacity: ticketState === 'lifting' ? 0 : 1,
          transition: 'transform 1s ease-out, opacity 1s ease-out',
          pointerEvents: ticketState === 'visible' ? 'auto' : 'none',
        }}
        onClick={() => {
          if (ticketState !== 'visible') return;
          setTicketState('lifting');
          setTimeout(() => {
            setTicketState('gone');
            // 扉セクションへスムーズスクロール（保険スクロールトリガーで自動的に扉が開く）
            const doorEl = document.getElementById('door-section');
            if (doorEl) doorEl.scrollIntoView({ behavior: 'smooth' });
          }, 1000);
        }}
        role="button"
        tabIndex={0}
        aria-label="チケットを使って扉を開く"
      >
        <img
          src="images/ticket.png"
          alt="MAJORINS Museum チケット"
          style={styles.ticketImage}
          draggable={false}
        />
      </div>

      <div style={styles.ticketBottomBlock}>
        <p style={styles.closingJp}>日常の一瞬を輝かせるマジョリンスイーツ</p>
        <p style={styles.closingJp}>魔法の扉を開け MAJORINS の世界へ</p>
        <div style={styles.actionHint}>
          <span style={styles.hintEn} className="hint-pc-only">— Click to open the door —</span>
          <span style={styles.hintEn} className="hint-sp-only">— Tap to open the door —</span>
          <span style={styles.hintJp} className="hint-pc-only">クリックして扉を開ける</span>
          <span style={styles.hintJp} className="hint-sp-only">タップして扉を開ける</span>
        </div>
      </div>
    </div>
  </section>
)}
```

### 3-4. styles オブジェクトに追加するスタイル

`styles` オブジェクト（line 1900 前後にあるはず）に以下を追加：

```js
ticketScreen: {
  minHeight: '100dvh',
  background: '#0a0a0a',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 24px',
  position: 'relative',
  zIndex: 5,
},
ticketScreenInner: {
  width: '100%',
  maxWidth: '700px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'space-between',
  textAlign: 'center',
  gap: '18px',
  minHeight: 'calc(100dvh - 64px)',
},
ticketTopBlock: {
  width: '100%',
},
ticketBottomBlock: {
  width: '100%',
},
ticketTitle: {
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 'clamp(26px, 4vw, 36px)',
  letterSpacing: '0.08em',
  margin: '0 0 14px',
  fontWeight: 500,
  color: '#f5f0e8',
},
welcomeJp: {
  fontFamily: "'Noto Serif JP', serif",
  fontSize: 'clamp(11px, 2vw, 13px)',
  color: '#c8bfae',
  margin: '3px 0',
  letterSpacing: '0.2em',
  lineHeight: 1.9,
  fontWeight: 300,
},
ticketArea: {
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'center',
  margin: '4px 0',
  width: '100%',
  willChange: 'transform, opacity',
},
ticketImage: {
  width: '100%',
  maxWidth: '420px',
  height: 'auto',
  display: 'block',
  userSelect: 'none',
},
closingJp: {
  fontFamily: "'Noto Serif JP', serif",
  fontSize: 'clamp(12px, 2.2vw, 14px)',
  color: '#d8d0bf',
  margin: '4px 0',
  letterSpacing: '0.12em',
  lineHeight: 1.9,
},
actionHint: {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  marginTop: '14px',
},
hintEn: {
  fontFamily: "'Cormorant Garamond', serif",
  fontStyle: 'italic',
  fontSize: '12px',
  color: '#998a72',
  letterSpacing: '0.22em',
},
hintJp: {
  fontFamily: "'Noto Serif JP', serif",
  fontSize: '14px',
  color: '#e0d8c4',
  letterSpacing: '0.18em',
  fontWeight: 400,
},
```

### 3-5. メディアクエリの追加（既存の `<style>` ブロック内に追記）

既存の `</style>` の直前、line 864 周辺に追記：

```css
/* ===== Ticket Screen PC/SP 出し分け ===== */
.hint-sp-only { display: none; }
.hint-pc-only { display: inline; }
@media (max-width: 520px) {
  .hint-pc-only { display: none; }
  .hint-sp-only { display: inline; }
}
```

### 3-6. チケット画像ファイルの配置

- ゆりあさん作のチケット画像を `images/ticket.png` として配置
- 推奨スペック: 透過 or 黒背景に馴染むアイボリー、幅 840px (Retina 2x)、画像比 約 16:5
- 画像は別途 Keiさんから差し替え

---

## 4. 【作業2】扉セクションのクリック起点トリガーを追加

### 4-1. 既存の `doorSectionRef` 要素に `id="door-section"` を付与

`index.html` の line 1310 付近、`<section ref={doorSectionRef} ...>` の属性に追加：

```jsx
<section
  ref={doorSectionRef}
  id="door-section"   // ← 追加
  style={styles.doorSection}
>
```

### 4-2. スクロールトリガーは既存のまま維持（保険）

`useEffect` 内の `handleScroll` (line 1225-1239) の **scroll検知ロジックは変更しない**。
チケットクリックで `scrollIntoView` するため、スクロール後に自然と既存のロジックで `doorState` が `'opening'` になる。

→ **追加実装は実質的に不要**（チケットの onClick が `scrollIntoView` するだけで、既存のスクロールトリガーが拾ってくれる）

### 4-3. doorHintBox 文言の変更（任意）

line 1421-1424 の現在の文言：
```jsx
<p style={styles.doorHint}>扉の奥に、マジョリンの世界が待っています</p>
<p style={styles.doorHintArrow}>↓</p>
<p style={styles.doorHintAction}>スクロールして扉を開く</p>
```

→ チケット画面で既に扉開放を促しているため、扉セクションのヒントは控えめにする。

**修正案（任意）**:
```jsx
<p style={styles.doorHint}>扉の奥に、マジョリンの世界が待っています</p>
{/* 矢印とスクロール文言は削除、または「もうすぐ扉が開きます」に変更 */}
```

→ 判断はKeiさんに委ねる。仕様書としては既存維持を推奨。

---

## 5. 【作業3】Hero Section の位置移動

### 5-1. 現状

`MajorinSweetsLP()` の return の中で、**Hero Section** (line 1271) → **扉セクション** (line 1310) → ... の順序。

### 5-2. 変更後

**扉セクション** → **Hero Section** → 執事/選択肢 → showcase の順序に変更。

具体的には、`<section style={styles.hero}>...</section>` ブロック（line 1271-1298）を、扉セクションの **直後** に移動する。

### 5-3. Hero Section 内の「↓ スクロールして扉を開ける ↓」を削除

line 1294-1296：
```jsx
<div style={styles.scrollHint}>
  <p style={styles.scrollHintText}>↓ スクロールして扉を開ける ↓</p>
</div>
```

→ **削除**（扉はすでに開いた後のセクションなので不要）

代わりに、扉が開いた先の世界観を強調するメッセージを入れるのは任意。例えば：
```jsx
<div style={styles.scrollHint}>
  <p style={styles.scrollHintText}>↓ マジョリンの世界へ ↓</p>
</div>
```

判断はKeiさんに委ねる。

### 5-4. 執事と選択肢の扱い

既存の butler 表示と選択肢ロジック（line 1356-1418 付近）は **そのまま維持**。
扉セクションの内側で動作する設計のため、扉セクション内の構造を変更しないこと。

「Hero Section の中で執事と選択肢を表示する」というKeiさんの希望は、視覚的には扉セクションの中で完結している現状で問題なく成立する（扉セクションは 100vh なので、扉が開いた後その場で執事が現れる演出は既存のまま）。

ただし、**選択肢ボタンの選択肢ラベルや遷移先**は要レビュー（次フェーズで）。

---

## 6. 触らないこと（重要）

以下のコードは **絶対に変更しない**：

| 部分 | 行 | 理由 |
|---|---|---|
| `@keyframes` 全般 | 31-105 | 全体のアニメーション基盤 |
| `#majorin-opening` 〜 動画システム | 108-154, 869-960 | オープニング動画は変更しない |
| `.showcase-section` 系のCSS | 337-770 | showcase は完成済み |
| `door` 関連のスタイル | 2121-2200 | 扉アニメーションは完成済み |
| `door-left.png` / `door-right.png` / `doorman.png` | images/ | 既存アセットそのまま使用 |
| MARJORIN_MESSAGES / LetterPopup / WitchMascot | 975-1182 | マジョリンの手紙機能は独立 |
| showcase の React 部分 | 該当箇所 | 完成済み |

---

## 7. 未確定事項（次フェーズで詰める）

以下はまだ決まっていないので、**現時点では実装しない**。
ベースが動いてからKei + Claudeで詰める：

1. **Lift演出中の周辺文面の挙動** — チケット消失時に上下の文面（ようこそ文面・締め文面）も一緒にフェードするか、残すか
2. **クリック直後の沈み込み演出** — クリック瞬間にチケットがわずかに「押された」フィードバック（沈んでから浮く）を入れるか
3. **チケット画像 → 扉セクションへの遷移時の繋ぎ** — Lift と scrollIntoView の同時実行で違和感がないか、白フラッシュを挟むべきか
4. **doorHintBox の文言調整** — 「スクロールして扉を開く」をどう書き換えるか、または削除するか
5. **Hero Section の「↓ スクロールして扉を開ける ↓」差し替え文言**
6. **執事の登場タイミング** — クリック起点になったことで、現状の `setTimeout(2000)` で扉が開く + `setTimeout(3000)` で執事 + `setTimeout(4000)` で選択肢 のタイミングを再調整するか
7. **チケット画像の最終素材** — ゆりあさんから差し替え予定

---

## 8. 作業手順（推奨順）

1. `images/ticket.png` のプレースホルダー画像を仮配置（チケットの代わりに何でも良い、サイズだけ合わせる）
2. `index.html` の `<style>` 末尾にメディアクエリを追記（セクション 3-5）
3. `styles` オブジェクトにチケット関連スタイルを追加（セクション 3-4）
4. `MajorinSweetsLP()` 内に `ticketState` の useState を追加（セクション 3-2）
5. JSX に `{/* ===== Ticket Screen ===== */}` ブロックを追加（セクション 3-3）
6. 扉セクションに `id="door-section"` を追加（セクション 4-1）
7. Hero Section を扉セクションの後ろに移動（セクション 5-2）
8. Hero Section の「↓ スクロールして扉を開ける ↓」を削除（セクション 5-3）
9. ブラウザで以下の動作確認:
   - 動画 → 白フェード → チケット画面が出る
   - チケットをクリックすると上にすっと浮き上がって消える（約1秒）
   - 自動で扉セクションへスクロール
   - 扉が開く（既存実装）
   - Hero Section が下に続いて見える
   - 執事と選択肢が表示される
   - 「buy」で showcase へスクロール
10. レスポンシブ確認: PC（クリック表記）/ スマホ（タップ表記）

---

## 9. 完了後にKeiさんに報告してほしいこと

- [ ] 上記9項目の動作確認結果（OK/NG）
- [ ] 動かない・気になる点があればスクショ + 該当行番号
- [ ] Lift演出のスピード感（1秒は速い？遅い？）
- [ ] チケット → 扉の遷移で違和感があるか
- [ ] Hero Section が扉の後に来ることでの違和感
- [ ] その他、設計上「ここはこうした方が良さそう」という気づき

---

## 10. 関連ファイル

- `index.html` — メイン作業ファイル（= `majorin_sweet_0607.html`）
- `images/ticket.png` — 新規追加（ゆりあさん画像）
- `images/door-left.png` / `door-right.png` — 既存、変更なし
- `images/doorman.png` — 既存、変更なし
- `images/spring2026/hero_main.jpg` — 既存、Hero Section で使用継続

---

**仕様書バージョン**: v1.0
**作成日**: 2026-06-17
**次回更新**: 動作確認後の細部調整
