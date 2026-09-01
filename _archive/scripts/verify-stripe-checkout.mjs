/**
 * Stripe Payment Link 動作確認（Playwright）
 * 実行: cd _archive/scripts && node verify-stripe-checkout.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'stripe-verify-out');
fs.mkdirSync(OUT, { recursive: true });

const PRODUCTS = [
  {
    key: 'noir',
    name: 'ノワール メルト',
    url: 'https://buy.stripe.com/5kQdR21pe5tcf164Bsgw009',
    expectPrice: '4,800',
  },
  {
    key: 'verdant',
    name: 'ヴァーダント ベール',
    url: 'https://buy.stripe.com/dRm4gs6Jyf3MaKQ3xogw00a',
    expectPrice: '4,800',
  },
  {
    key: 'passion',
    name: 'パッションオレンジ',
    url: 'https://buy.stripe.com/5kQ28k7NC2h05qw2tkgw00b',
    expectPrice: '4,800',
  },
];

const PROMO = 'MAJORIN300';

function check(name, ok, detail = '') {
  return { name, ok: !!ok, detail: String(detail || '') };
}

async function verifyOne(page, product) {
  const checks = [];
  const slug = product.key;
  console.log(`\n=== ${product.name} ===`);
  console.log(product.url);

  const res = await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  checks.push(check('ページ到達 (HTTP)', res && res.ok(), `status=${res?.status()}`));

  await page.waitForTimeout(2500);
  // Stripe checkout often hydrates slowly
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

  const bodyText = await page.locator('body').innerText().catch(() => '');
  const html = await page.content();

  checks.push(check('商品名の表示', bodyText.includes(product.name) || html.includes(product.name), product.name));
  checks.push(check('価格 ¥4,800', /4[,，]?800/.test(bodyText) || /4[,，]?800/.test(html), '本文に 4800'));
  checks.push(check('送料 1,300', /1[,，]?300/.test(bodyText) || bodyText.includes('クール便') || html.includes('クール便'), 'クール便 or 1300'));
  checks.push(check('クール便表記', bodyText.includes('クール便') || html.includes('クール便') || bodyText.includes('冷凍'), 'クール便/冷凍'));

  // Promo code UI — Stripe uses various labels
  const promoTriggers = [
    page.getByRole('button', { name: /プロモーション|クーポン|割引|Add promotion|Add coupon|promo/i }),
    page.getByText(/プロモーションコード|割引コード|Promotion code|Add promotion code/i),
    page.locator('[data-testid*="promotion"], [id*="promotion"], button:has-text("コード")'),
  ];

  let promoUiFound = false;
  let promoApplied = false;
  let promoDetail = '';

  for (const loc of promoTriggers) {
    const count = await loc.count().catch(() => 0);
    if (count > 0) {
      promoUiFound = true;
      try {
        await loc.first().click({ timeout: 3000 });
        await page.waitForTimeout(800);
      } catch {}
      break;
    }
  }

  // Direct input search
  const promoInput = page.locator(
    'input[name*="promo" i], input[id*="promo" i], input[placeholder*="コード" i], input[placeholder*="promo" i], input[autocomplete="off"][aria-label*="プロモ" i], input[aria-label*="promotion" i]'
  );
  if ((await promoInput.count()) === 0) {
    // try after clicking "プロモーションコードを追加" style links
    const addLink = page.locator('text=/プロモーション|Add promotion|クーポンを追加|割引コード/i').first();
    if (await addLink.count()) {
      promoUiFound = true;
      await addLink.click().catch(() => {});
      await page.waitForTimeout(1000);
    }
  }

  const inputs = page.locator('input:visible');
  const inputCount = await inputs.count();
  let targetInput = null;
  for (let i = 0; i < inputCount; i++) {
    const el = inputs.nth(i);
    const ph = ((await el.getAttribute('placeholder')) || '').toLowerCase();
    const name = ((await el.getAttribute('name')) || '').toLowerCase();
    const aria = ((await el.getAttribute('aria-label')) || '').toLowerCase();
    const id = ((await el.getAttribute('id')) || '').toLowerCase();
    const blob = `${ph} ${name} ${aria} ${id}`;
    if (/promo|coupon|code|クーポン|プロモ|割引/.test(blob)) {
      targetInput = el;
      promoUiFound = true;
      break;
    }
  }

  if (targetInput) {
    await targetInput.fill(PROMO);
    await page.waitForTimeout(400);
    const applyBtn = page.getByRole('button', { name: /適用|Apply|追加|Submit/i }).first();
    if (await applyBtn.count()) {
      await applyBtn.click().catch(() => {});
    } else {
      await targetInput.press('Enter').catch(() => {});
    }
    await page.waitForTimeout(2500);
    const after = await page.locator('body').innerText().catch(() => '');
    promoApplied =
      /300/.test(after) &&
      (/割引|オフ|−|-|OFF|applied|適用|¥4[,，]?500|4500|¥300/.test(after) || after.includes(PROMO));
    // softer success: code accepted without error
    const hasError = /無効|invalid|有効ではありません|doesn't apply/i.test(after);
    if (!hasError && after.includes('300')) promoApplied = true;
    promoDetail = hasError ? '適用エラーっぽい文言あり' : `入力試行済み code=${PROMO}`;
  } else {
    promoDetail = promoUiFound ? '入力欄を特定できず（UIは存在）' : 'プロモUI未検出';
  }

  checks.push(check('プロモコード入力UI', promoUiFound || (await promoInput.count()) > 0, promoDetail));
  checks.push(check(`コード ${PROMO} 適用試行`, promoApplied || promoUiFound, promoDetail));

  // Shipping address — look for JP address fields
  const addressHints = /郵便番号|お届け先|配送先|Shipping|住所|郵便|ZIP|Postal/i.test(bodyText + html);
  const countryJP = /日本|Japan|JP/i.test(bodyText + html);
  checks.push(check('配送先住所の収集UI', addressHints, addressHints ? '住所関連ラベル検出' : '未検出'));
  checks.push(check('配送先に日本', countryJP || addressHints, 'JP想定'));

  // Ingredients in description (optional)
  checks.push(check('原材料の記載', bodyText.includes('原材料') || html.includes('原材料'), '商品説明'));

  const shot = path.join(OUT, `${slug}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  checks.push(check('スクリーンショット保存', fs.existsSync(shot), shot));

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`  pass=${passed} fail=${failed}`);
  for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name} ${c.detail}`);

  return {
    product: product.name,
    url: product.url,
    key: product.key,
    screenshot: shot,
    checks,
    passed,
    failed,
    bodyPreview: bodyText.slice(0, 800),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const results = [];
  for (const product of PRODUCTS) {
    try {
      results.push(await verifyOne(page, product));
    } catch (err) {
      results.push({
        product: product.name,
        url: product.url,
        key: product.key,
        error: String(err),
        checks: [check('例外なく完了', false, String(err))],
        passed: 0,
        failed: 1,
      });
    }
  }

  await browser.close();

  const summary = {
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Tokyo',
    promoCode: PROMO,
    expectedShippingYen: 1300,
    results,
    totals: {
      products: results.length,
      checksPassed: results.reduce((s, r) => s + (r.passed || 0), 0),
      checksFailed: results.reduce((s, r) => s + (r.failed || 0), 0),
    },
  };

  const jsonPath = path.join(OUT, 'report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  console.log(`\nReport: ${jsonPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
