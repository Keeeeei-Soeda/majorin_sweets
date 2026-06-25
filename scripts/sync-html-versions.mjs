#!/usr/bin/env node
/**
 * index.html（執事なし・正本）を versions/0617_ver02.html に同期し、
 * 執事セクションを復元した versions/0617_ver01.html を生成する。
 *
 * 使い方: npm run sync:versions
 * 今後 index.html を編集したら、このコマンドで両バージョンへ反映してください。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const canonical = path.join(root, 'index.html');
const ver02 = path.join(root, 'versions', '0617_ver02.html');
const ver01 = path.join(root, 'versions', '0617_ver01.html');

const BUTLER_STATE = `      const [showButler, setShowButler] = useState(false);
      const [showChoices, setShowChoices] = useState(false);
`;

const BUTLER_OPEN_TIMEOUT = `              setTimeout(() => {
                setDoorState('open');
                setShowButler(true);
                
                setTimeout(() => {
                  setShowChoices(true);
                }, 1000);
              }, 2000);`;

const HANDLE_CHOICE = `
      const handleChoice = (choice) => {
        if (choice === 'buy') {
          setTimeout(scrollToShowcase, 300);
        } else if (choice === 'story') {
          const el = document.getElementById('story');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
      };
`;

const BUTLER_JSX = `
              {/* 扉の奥の世界 */}
              {(doorState === 'open' || doorState === 'story') && (
                <>
                  {/* 執事の登場 */}
                  {showButler && (
                    <div style={styles.butlerContainer}>
                      <img 
                        src="images/doorman.png" 
                        alt="Butler" 
                        style={styles.butlerImage}
                        className="butler-image"
                      />
                    </div>
                  )}
                  
                  <div style={styles.behindDoor}>
                    {showButler && (
                      <div style={styles.welcomeBox}>
                        <h2 style={styles.welcomeTitle} className="welcome-title">ようこそ MAJORINS の世界へ</h2>
                        <p style={styles.welcomeText}>
                          私がご案内いたします<br />
                          どちらをお選びになりますか?
                        </p>
                      </div>
                    )}
                  
                  {showChoices && doorState === 'open' && (
                    <div style={styles.choicesContainer}>
                      {[
                        { key: 'buy',   icon: '🛍️', label: 'スイーツを買う',   primary: true,  disabled: false },
                        { key: 'story', icon: '📖', label: 'ストーリーをみる', primary: false, disabled: false },
                        { key: 'tbd1',  icon: '🌹', label: '準備中',           primary: false, disabled: true  },
                        { key: 'tbd2',  icon: '✦',  label: '準備中',           primary: false, disabled: true  },
                      ].map((item, i) => (
                        <button
                          key={item.key}
                          className={\`choice-button choice-btn-\${i}\`}
                          style={{
                            ...(item.primary ? styles.choiceButton : styles.choiceButtonSecondary),
                            ...(item.disabled ? { opacity: 0.4, cursor: 'default' } : {}),
                          }}
                          onClick={() => { if (!item.disabled) handleChoice(item.key); }}
                          onMouseEnter={(e) => {
                            if (item.disabled) return;
                            e.currentTarget.style.transform = 'scale(1.05)';
                            if (!item.primary) e.currentTarget.style.background = 'rgba(26, 26, 26, 0.08)';
                          }}
                          onMouseLeave={(e) => {
                            if (item.disabled) return;
                            e.currentTarget.style.transform = 'scale(1)';
                            if (!item.primary) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <span style={styles.choiceIcon}>{item.icon}</span>
                          <span style={styles.choiceText}>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                </>
              )}
              
`;

function applyButlerPatches(source) {
  let html = source;

  html = html.replace(
    "      const [doorState, setDoorState] = useState('closed'); \n      const [globalLetter, setGlobalLetter] = useState(null);",
    `      const [doorState, setDoorState] = useState('closed'); \n${BUTLER_STATE}      const [globalLetter, setGlobalLetter] = useState(null);`,
  );

  html = html.replace(
    `              setTimeout(() => {
                setDoorState('open');
              }, 2000);`,
    BUTLER_OPEN_TIMEOUT,
  );

  html = html.replace(
    `      const scrollToShowcase = () => {
        const el = document.getElementById('showcase');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      };

      const openDoorFromTicket = () => {
        setTicketState('gone');
        requestAnimationFrame(() => {
          const doorEl = document.getElementById('door-section');
          if (!doorEl) return;
          // チケット削除後のレイアウト確定を待ってから扉先頭へ固定（scrollIntoView だと MOVIE まで飛ぶことがある）
          window.scrollTo({ top: doorEl.offsetTop, left: 0, behavior: 'auto' });
          setDoorState('opening');
          setTimeout(() => setDoorState('open'), 2000);
        });
      };

      return (`,
    `      const scrollToShowcase = () => {
        const el = document.getElementById('showcase');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      };

      const openDoorFromTicket = () => {
        setTicketState('gone');
        requestAnimationFrame(() => {
          const doorEl = document.getElementById('door-section');
          if (!doorEl) return;
          // チケット削除後のレイアウト確定を待ってから扉先頭へ固定（scrollIntoView だと MOVIE まで飛ぶことがある）
          window.scrollTo({ top: doorEl.offsetTop, left: 0, behavior: 'auto' });
          setDoorState('opening');
          setTimeout(() => setDoorState('open'), 2000);
        });
      };
${HANDLE_CHOICE}
      return (`,
  );

  html = html.replace(
    `              </div>
              
              {/* 閉じた扉の装飾 */}`,
    `              </div>
              ${BUTLER_JSX}              {/* 閉じた扉の装飾 */}`,
  );

  return html;
}

if (!fs.existsSync(canonical)) {
  console.error('index.html が見つかりません');
  process.exit(1);
}

const base = fs.readFileSync(canonical, 'utf8');
fs.writeFileSync(ver02, base);
fs.writeFileSync(ver01, applyButlerPatches(base));

console.log('同期完了:');
console.log('  index.html → versions/0617_ver02.html（執事なし）');
console.log('  index.html → versions/0617_ver01.html（執事あり・復元）');
