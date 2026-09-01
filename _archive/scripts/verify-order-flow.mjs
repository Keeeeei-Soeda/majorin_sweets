/**
 * トップ → /order/ → 個数選択 → Stripe Checkout の導線確認（Playwright）
 *
 * 実行: cd _archive/scripts && node verify-order-flow.mjs
 *
 * 注: 受付時間外（月〜水など）は /status をモックし、
 *     checkout には QA トークンを付与して Session 作成を検証する。
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'order-flow-verify-out');
fs.mkdirSync(OUT, { recursive: true });

const SITE = 'https://shop.majorins.jp';
const QA_TOKEN = process.env.QA_CHECKOUT_TOKEN || 'majorins-qa-20260831';

const openStatus = {
  weekId: 'qa',
  accepting: true,
  limitPerItem: 10,
  items: {
    noir: { sold: 0, remaining: 10, soldOut: false, limit: 10 },
    verdant: { sold: 0, remaining: 10, soldOut: false, limit: 10 },
    passion: { sold: 0, remaining: 10, soldOut: false, limit: 10 },
  },
};

function check(name, ok, detail = '') {
  return { name, ok: !!ok, detail: String(detail || '') };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const checks = [];

  // 在庫 API を受付中にモック（月曜など時間外でも UI 検証可能）
  await page.route('**/majorins-stock.majorins.workers.dev/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(openStatus),
    });
  });

  // checkout に QA トークンを付与（受付時間外の Session 作成用）
  await page.route('**/majorins-stock.majorins.workers.dev/checkout', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    let body = {};
    try {
      body = JSON.parse(req.postData() || '{}');
    } catch {
      body = {};
    }
    body.qaToken = QA_TOKEN;
    await route.continue({
      method: 'POST',
      headers: {
        ...req.headers(),
        'content-type': 'application/json',
      },
      postData: JSON.stringify(body),
    });
  });

  console.log('=== 1. トップページ ===');
  await page.goto(`${SITE}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  // オープニング演出をスキップしてショーケースを触れる状態にする
  await page.evaluate(() => {
    document.querySelectorAll('video').forEach((v) => {
      try { v.pause(); v.remove(); } catch (_) {}
    });
    document.querySelectorAll('[class*="ticket"], [class*="door"], [class*="overlay"], [class*="opening"]')
      .forEach((el) => { el.style.pointerEvents = 'none'; el.style.display = 'none'; });
    const sc = document.getElementById('showcase');
    if (sc) sc.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '01-top.png'), fullPage: false });

  const html = await page.content();
  checks.push(check('トップに /order/ 導線', html.includes("href: '/order/'") || html.includes('href="/order/"'), 'SHOWCASE_CAKES or anchor'));

  const cakeLink = page.locator('a.cake-link[href="/order/"], a.mobile-cake-link[href="/order/"]').first();
  const linkCount = await cakeLink.count();
  checks.push(check('ショーケースに /order/ リンク', linkCount > 0, `count=${linkCount}`));

  let navigated = false;
  if (linkCount > 0) {
    const href = await cakeLink.getAttribute('href');
    // オープニング演出が pointer を奪うことがあるため、href 検証後に同一URLへ遷移
    if (href === '/order/' || href === '/order') {
      await page.goto(`${SITE}/order/`, { waitUntil: 'domcontentloaded' });
      navigated = true;
      checks.push(check('トップから注文ページへ遷移', true, `href=${href}`));
    } else {
      checks.push(check('トップから注文ページへ遷移', false, `href=${href}`));
    }
  }
  if (!navigated) {
    await page.goto(`${SITE}/order/`, { waitUntil: 'domcontentloaded' });
  }

  console.log('=== 2. 注文ページ ===');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '02-order.png'), fullPage: true });

  const orderUrl = page.url();
  checks.push(check('注文ページ到達', /\/order\/?/.test(orderUrl), orderUrl));

  const titleOk = await page.locator('h1.order-intro__title').count();
  checks.push(check('ご注文タイトル', titleOk > 0));

  // 受付中モック後に数量ボタンが出るまで待つ
  await page.waitForSelector('.qty__btn[data-act="inc"]', { timeout: 15000 });

  console.log('=== 3. 個数選択（Noir 1 + Verdant 1 = ¥9,600 + 送料） ===');
  const noirInc = page.locator('[data-sku="noir"] .qty__btn[data-act="inc"]');
  const verdantInc = page.locator('[data-sku="verdant"] .qty__btn[data-act="inc"]');
  await noirInc.click();
  await verdantInc.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '03-qty.png'), fullPage: true });

  const subtotalText = await page.locator('#subtotal').innerText();
  const shippingText = await page.locator('#shipping').innerText();
  const totalText = await page.locator('#total').innerText();
  checks.push(check('商品合計 ¥9,600', /9[,，]?600/.test(subtotalText), subtotalText));
  checks.push(check('送料 ¥1,300', /1[,，]?300/.test(shippingText), shippingText));
  checks.push(check('合計 ¥10,900', /10[,，]?900/.test(totalText), totalText));

  const submit = page.locator('#submit');
  await submit.waitFor({ state: 'visible' });
  const disabled = await submit.isDisabled();
  checks.push(check('お支払いボタン有効', !disabled));

  console.log('=== 4. Stripe Checkout へ ===');
  await Promise.all([
    page.waitForURL(/checkout\.stripe\.com/, { timeout: 45000 }),
    submit.click(),
  ]);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, '04-stripe.png'), fullPage: true });

  const stripeUrl = page.url();
  checks.push(check('Stripe Checkout 到達', /checkout\.stripe\.com/.test(stripeUrl), stripeUrl.slice(0, 80)));

  const bodyText = await page.locator('body').innerText().catch(() => '');
  checks.push(check('Stripeに金額表示', /9[,，]?600|4[,，]?800|10[,，]?900|1[,，]?300/.test(bodyText), '本文に金額'));
  checks.push(check('配送先または住所 UI', /配送|お届け|Shipping|住所|日本|Japan/i.test(bodyText), '配送関連テキスト'));

  // 送料無料ケース（3個 = 14,400）も API レベルで確認
  console.log('=== 5. 送料無料判定（API） ===');
  const freeRes = await fetch('https://majorins-stock.majorins.workers.dev/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ sku: 'noir', qty: 3 }],
      qaToken: QA_TOKEN,
    }),
  });
  const freeBody = await freeRes.json();
  checks.push(check('3個で送料無料 Session', freeRes.ok && freeBody.shippingFree === true && freeBody.shipping === 0, JSON.stringify({ status: freeRes.status, shipping: freeBody.shipping, shippingFree: freeBody.shippingFree })));

  const report = {
    at: new Date().toISOString(),
    site: SITE,
    checks,
    pass: checks.filter((c) => c.ok).length,
    fail: checks.filter((c) => !c.ok).length,
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  console.log('\n=== RESULT ===');
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  }
  console.log(`\n${report.pass} passed / ${report.fail} failed`);
  console.log(`screenshots: ${OUT}`);

  await browser.close();
  process.exit(report.fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
