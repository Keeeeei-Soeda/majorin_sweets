# THE MOMENT 見出し帯の除去（2026-08-16）

**正本:** `index.html`  
**同期:** `versions/0617_ver01.html` / `versions/0617_ver02.html`（`npm run sync:versions` 相当）  
**関連コミット:**

| コミット | 内容 |
|---|---|
| `c6ba19d` 以前〜当日直前 | 工房写真の**後**に THE MOMENT 全文（見出し＋引用2枠＋魔女マスコット×4） |
| `b1c79f6` | 平石さん③: 本文を `crafting_majorin.jpg` 上へ転記。見出しだけを写真の**前**に独立帯として残した |
| （本変更） | 独立見出し帯が周囲から浮いて見えたため**見出しのみ除去**。本文オーバーレイは維持 |

**依頼背景:** 見出しを写真へ重ねなくても違和感はない、という判断で除去。④（こだわりの製法・お知らせ）は対象外のまま。

---

## 現行（除去後）の並び

```
STORY 第1〜3章
  → crafting 画像（左右に転記本文 + 下部「貴方の魂に響く…」）
  → スイーツを選ぶ
```

画像上の転記文（写メ③を正とする。サイト旧文「これ、何か優しくて…」とは異なる）:

- 左: カフェでの感想 + `マジョリン、街のカフェにて`
- 右: `その瞬間私はハッと思った` 以降
- 下部既存: 「貴方の魂に響く / 心に残るものを届けたい」

未使用だが復元用に `index.html` の `styles` へ残しているキー:

- `roseSection` / `turningContent` / `epiphanyBox` / `epiphanyQuote` / `epiphanyAuthor` / `epiphany` / `epiphanyText` / `epiphanyHighlight`
- マスコット画像: `images/image15.png`〜`image18.png`（ファイルは削除していない）

---

## 戻し方（かんたん）

1. 下の「復元A」または「復元B」を、`index.html` の  
   `{/* Crafting Image — ③ THE MOMENT 本文を画像へ転記` コメントの**直前**へ貼る。  
   （STORY セクションの閉じ `</section>` の直後）
2. `npm run sync:versions`（node が無い場合は正本を versions へコピーし、ver01 のみ執事パッチ）
3. 見出し帯だけ戻すなら **復元A**。本文ブロックも写真の外に戻すなら **復元B**（その場合は画像上の `.crafting-quote` を消すか残すかを別途決める）

Git で戻す場合:

```bash
# 見出し帯あり・本文は画像上（b1c79f6 相当の該当 hunk のみ）
git show b1c79f6:index.html

# 旧配置（写真の後に見出し＋本文＋マスコット）
git show c6ba19d:index.html
```

`c6ba19d` の THE MOMENT は crafting セクションの**後ろ**。復元Bは旧位置用。

---

## 復元A — 見出し帯のみ（`b1c79f6` 時点。写真の直前）

浮いて見えたのはこのブロック。写真へ重ねない独立帯。

```jsx
          {/* The Moment — 本文は直後の画像へ移動済み。見出しのみ残す */}
          <section 
            ref={el => sectionRefs.current['turning'] = el}
            style={{
              ...styles.section,
              ...styles.roseSection,
              overflow: 'visible',
              opacity: isVisible['turning'] ? 1 : 0,
              transform: isVisible['turning'] ? 'translateY(0)' : 'translateY(50px)',
              transition: 'all 1s ease-out 0.2s',
              minHeight: 'auto',
              padding: '48px 20px 8px',
            }}
          >
            <div style={styles.sectionContent}>
              <div style={styles.ornamentalDivider}>🌸 ━━━ ✦ ━━━ 🌸</div>
              <h2 style={styles.sectionTitle}>THE MOMENT</h2>
              <h3 style={styles.subtitle}>心が温かくなったある日</h3>
            </div>
          </section>
```

見出し文言:

- 装飾: `🌸 ━━━ ✦ ━━━ 🌸`
- 英題: `THE MOMENT`（`styles.sectionTitle` / Cinzel / letter-spacing 0.3em / `#605F5F`）
- 字幕: `心が温かくなったある日`（`styles.subtitle` / Playfair italic / **marginBottom 80px** が空帯の一因）

共通 `styles.section` は `minHeight: 100vh` + flex 中央寄せ。復元Aでは `minHeight: 'auto'` と `padding: '48px 20px 8px'` で上書きしていた。

---

## 復元B — 旧・全文セクション（`c6ba19d`。crafting 画像の**後**）

```jsx
          {/* The Moment */}
          <section 
            ref={el => sectionRefs.current['turning'] = el}
            style={{
              ...styles.section,
              ...styles.roseSection,
              overflow: 'visible',
              opacity: isVisible['turning'] ? 1 : 0,
              transform: isVisible['turning'] ? 'translateY(0)' : 'translateY(50px)',
              transition: 'all 1s ease-out 0.2s'
            }}
          >
            <div style={styles.sectionContent}>
              <div style={styles.ornamentalDivider}>🌸 ━━━ ✦ ━━━ 🌸</div>
              <h2 style={styles.sectionTitle}>THE MOMENT</h2>
              <h3 style={styles.subtitle}>心が温かくなったある日</h3>
              
              <div style={styles.turningContent}>
                <div style={styles.epiphanyBox}>
                  <p style={styles.epiphanyQuote}>
                    これ、何か優しくて、懐かしくて…心がホッとする…<br />
                    これは昔母が作ってくれたケーキと同じ温かい気持ちになる、、<br />
                    心が美味しい、、元気がでる、、これだわ！！
                  </p>
                  <p style={styles.epiphanyAuthor}>マジョリン、街のカフェにて</p>
                </div>
                
                <div style={styles.epiphany}>
                  <p style={styles.epiphanyText}>
                    その瞬間私はハッと思った
                  </p>
                  <p style={styles.epiphanyHighlight}>
                    お菓子には人を癒すことができると。<br />
                    想いも届けることができる…マジョリンの幸せな魔法がかかったお菓子を<br />
                    貴方に届けたい。
                  </p>
                </div>
              </div>
            </div>

            {/* 丸型魔女 ×4（右・左・右・左）topPx は各コンテンツ行の中間付近 */}
            <WitchMascot src="images/image15.png" side="right" topPx={140}  onOpenLetter={openGlobalLetter} />
            <WitchMascot src="images/image16.png" side="left"  topPx={480}  onOpenLetter={openGlobalLetter} />
            <WitchMascot src="images/image17.png" side="right" topPx={780}  onOpenLetter={openGlobalLetter} />
            <WitchMascot src="images/image18.png" side="left"  topPx={1080} onOpenLetter={openGlobalLetter} />
          </section>
```

注意: 復元Bの本文は旧サイト文言（「これ、何か優しくて…」）。画像上の写メ③文言と二重になる。

---

## 時系列メモ

1. **従来:** 写真（キャプションのみ）→ THE MOMENT 見出し＋本文。見出しは本文のキャップであり、写真のキャプションではなかった。
2. **b1c79f6:** 本文を写真左右へ移動。見出しを写真前の独立帯にした → ピンク余白の中で浮いて見えた。
3. **本変更:** 独立帯を削除。写真上の本文と下部キャプションは残す。
