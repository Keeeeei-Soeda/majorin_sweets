/**
 * Playwright で Stripe Dashboard の価格を更新し、Payment Link を差し替える
 *
 * 使い方:
 *   cd _archive/scripts
 *   npm install
 *   npx playwright install chromium
 *   node update-stripe-prices-playwright.mjs
 *
 * 初回: ブラウザが開いたら Stripe にログイン（2FA 含む）してください。
 * ログイン状態は .stripe-auth/ に保存されます。
 *
 * 処理内容（各商品）:
 *   1. 商品詳細で ¥4,800 の新価格を追加
 *   2. Payment Link を編集して新価格に切り替え
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '.stripe-auth');
const JSON_PATH = path.join(__dirname, 'stripe-products.json');
const HTML_PATH = path.join(__dirname, '../../majorin_sweet_0607.html');
const ACCT = 'acct_1Tb5Hp3A10QFS30c';
const BASE = `https://dashboard.stripe.com/${ACCT}`;

const products = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

function searchTerms(product) {
  const terms = [product.name];
  const m = product.name.match(/（(.+?)）/);
  if (m) terms.push(m[1]);
  if (product.name.includes('Noir')) terms.push('Noir Melt', 'ノワール');
  if (product.name.includes('Verdant')) terms.push('Verdant Veil', 'ヴァーダント');
  if (product.name.includes('Passion')) terms.push('Passion Orange', 'パッション');
  return [...new Set(terms)];
}

async function waitForDashboard(page) {
  console.log('\n=== Stripe ログイン ===');
  console.log('ブラウザで Stripe にログインしてください（Google 2FA 含む）。');
  console.log('商品一覧が表示されたら自動で続行します（最大10分）…\n');

  await page.goto(`${BASE}/products?active=true`, { waitUntil: 'domcontentloaded' });

  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (/dashboard\.stripe\.com\/acct_/.test(url) && !url.includes('/login')) {
      await page.waitForTimeout(2000);
      return;
    }
    if (page.isClosed()) {
      throw new Error('ブラウザが閉じられました。ターミナルから再度実行してください。');
    }
    await page.waitForTimeout(2000);
  }
  throw new Error('ログインがタイムアウトしました。');
}

async function clickFirst(page, getters, label) {
  for (const get of getters) {
    const el = get();
    if ((await el.count()) > 0 && (await el.first().isVisible())) {
      await el.first().click();
      return;
    }
  }
  throw new Error(`${label} が見つかりません`);
}

async function fillPriceAmount(page, amount) {
  const field = page
    .getByLabel(/単価|Unit price|価格|Price|金額|Amount/i)
    .or(page.locator('input[inputmode="decimal"], input[name*="amount"], input[name*="price"]').first());
  await field.waitFor({ state: 'visible', timeout: 30_000 });
  await field.click({ clickCount: 3 });
  await field.fill(String(amount));
}

async function addProductPrice(page, product) {
  const terms = searchTerms(product);
  console.log(`\n[価格追加] ${product.name}`);

  await page.goto(`${BASE}/products?active=true`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const search = page.getByPlaceholder(/検索|Search/i).first();
  if ((await search.count()) > 0) {
    await search.fill(terms[1] || terms[0]);
    await page.waitForTimeout(1500);
  }

  let opened = false;
  for (const term of terms) {
    const row = page.getByRole('link', { name: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
    if ((await row.count()) > 0) {
      await row.click();
      opened = true;
      break;
    }
    const cell = page.locator('a, tr, [role="row"]').filter({ hasText: new RegExp(term, 'i') }).first();
    if ((await cell.count()) > 0) {
      await cell.click();
      opened = true;
      break;
    }
  }
  if (!opened) throw new Error(`商品が見つかりません: ${product.name}`);

  await page.waitForTimeout(2000);

  await clickFirst(
    page,
    [
      () => page.getByRole('button', { name: /価格を追加|Add another price|Add price|新しい価格/i }),
      () => page.getByRole('link', { name: /価格を追加|Add another price|Add price/i }),
      () => page.locator('button, a').filter({ hasText: /価格を追加|Add another price|Add price/i }),
    ],
    '「価格を追加」'
  );
  await page.waitForTimeout(1000);

  await fillPriceAmount(page, product.priceYen);

  await clickFirst(
    page,
    [
      () => page.getByRole('button', { name: /^追加$|^Add$|保存|Save|価格を追加|Add price/i }),
      () => page.locator('button[type="submit"]').filter({ hasText: /追加|Add|保存|Save/i }),
    ],
    '価格の保存ボタン'
  );
  await page.waitForTimeout(2500);
  console.log(`  ✓ ¥${product.priceYen.toLocaleString()} を追加`);
}

async function updatePaymentLink(page, product) {
  const linkSlug = product.paymentUrl.split('/').pop();
  console.log(`[Payment Link] ${product.name} (${linkSlug})`);

  await page.goto(`${BASE}/payment-links`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const search = page.getByPlaceholder(/検索|Search/i).first();
  if ((await search.count()) > 0) {
    await search.fill(searchTerms(product)[1] || searchTerms(product)[0]);
    await page.waitForTimeout(1500);
  }

  const linkRow = page.locator('a, tr, [role="row"]').filter({ hasText: /3,800|3800|4,800|4800|Noir|Verdant|Passion|ノワール|ヴァーダント|パッション/i }).first();
  if ((await linkRow.count()) === 0) {
    const bySlug = page.locator(`a[href*="${linkSlug}"], *:text-matches("${linkSlug}")`).first();
    if ((await bySlug.count()) > 0) await bySlug.click();
    else throw new Error(`Payment Link が見つかりません: ${product.name}`);
  } else {
    await linkRow.click();
  }

  await page.waitForTimeout(2000);

  await clickFirst(
    page,
    [
      () => page.getByRole('button', { name: /編集|Edit/i }),
      () => page.getByRole('link', { name: /編集|Edit/i }),
      () => page.locator('a, button').filter({ hasText: /^編集$|^Edit$/i }),
    ],
    '「編集」'
  );
  await page.waitForTimeout(1500);

  const priceSelect = page.locator('select, [role="combobox"], button').filter({ hasText: /3,800|3800|4,800|4800|¥/i }).first();
  if ((await priceSelect.count()) > 0) {
    await priceSelect.click();
    await page.waitForTimeout(500);
    const newPrice = page.locator('[role="option"], li, button, a').filter({ hasText: /4,800|4800/ }).first();
    if ((await newPrice.count()) > 0) {
      await newPrice.click();
    }
  }

  const changePriceBtn = page.locator('button, a').filter({ hasText: /価格を変更|Change price|Replace/i }).first();
  if ((await changePriceBtn.count()) > 0) {
    await changePriceBtn.click();
    await page.waitForTimeout(500);
    const opt = page.locator('[role="option"], li, button').filter({ hasText: /4,800|4800/ }).first();
    if ((await opt.count()) > 0) await opt.click();
  }

  await clickFirst(
    page,
    [
      () => page.getByRole('button', { name: /変更を保存|Save changes|更新|Update|保存|Save/i }),
      () => page.locator('button[type="submit"]').filter({ hasText: /保存|Save|更新|Update/i }),
    ],
    '保存ボタン'
  );
  await page.waitForTimeout(2500);
  console.log(`  ✓ Payment Link を ¥${product.priceYen.toLocaleString()} に更新`);
}

async function main() {
  const context = await chromium.launchPersistentContext(AUTH_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    locale: 'ja-JP',
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    await waitForDashboard(page);

    for (const product of products) {
      await addProductPrice(page, product);
      await updatePaymentLink(page, product);
    }

    console.log('\n=== 完了 ===');
    console.log('Stripe ダッシュボードと buy.stripe.com で ¥4,800 を確認してください。');
    console.log('Payment Link URL は通常そのまま使えます（HTML のリンク変更は不要な場合が多いです）。\n');
  } catch (err) {
    console.error('\nエラー:', err.message);
    console.error('Stripe UI が変わっている可能性があります。表示中の画面で手動完了も可能です。');
    console.error('ブラウザは10秒後に閉じます。手動操作が必要な場合は Ctrl+C で中断してください。');
    await page.waitForTimeout(10_000).catch(() => {});
    process.exitCode = 1;
  } finally {
    if (!page.isClosed()) await context.close();
  }
}

main();
