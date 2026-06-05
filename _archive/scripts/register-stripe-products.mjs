/**
 * Stripe Dashboard に3商品を登録する Playwright スクリプト
 *
 * 使い方:
 *   cd /Users/soedakei/majorin_hp
 *   npx playwright install chromium
 *   node scripts/register-stripe-products.mjs
 *
 * 初回: ブラウザが開いたら Stripe にログイン（2FA含む）してください。
 * ログイン状態は scripts/.stripe-auth/ に保存され、2回目以降は省略できます。
 *
 * ※ Stripe の画面UIは変更されることがあります。失敗したら手動登録か Stripe API をご利用ください。
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const AUTH_DIR = path.join(__dirname, '.stripe-auth');
const PRODUCTS_URL =
  'https://dashboard.stripe.com/acct_1Tb5Hp3A10QFS30c/products?active=true';

const products = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'stripe-products.json'), 'utf8')
);

async function waitForProductsPage(page) {
  console.log('\n=== Stripe ログイン ===');
  console.log('ブラウザでログイン・2FA を完了してください。');
  console.log('商品一覧ページが表示されるまで待機します（最大10分）…\n');
  await page.goto(PRODUCTS_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/dashboard\.stripe\.com\/acct_.*\/products/, {
    timeout: 600_000,
  });
  await page.waitForTimeout(2000);
}

async function clickAddProduct(page) {
  const candidates = [
    () => page.getByRole('button', { name: /商品を追加|Add product|製品を追加/i }),
    () => page.getByRole('link', { name: /商品を追加|Add product|製品を追加/i }),
    () => page.locator('a, button').filter({ hasText: /商品を追加|Add product/i }).first(),
  ];
  for (const get of candidates) {
    const el = get();
    if ((await el.count()) > 0) {
      await el.click();
      return;
    }
  }
  throw new Error('「商品を追加」ボタンが見つかりません。UI変更の可能性があります。');
}

async function fillProductForm(page, product) {
  const imagePath = path.resolve(ROOT, product.image);
  if (!fs.existsSync(imagePath)) {
    throw new Error(`画像が見つかりません: ${imagePath}`);
  }

  // 商品名
  const nameField = page
    .getByLabel(/名前|Name|商品名/i)
    .or(page.locator('input[name="name"], input[id*="name"]').first());
  await nameField.waitFor({ state: 'visible', timeout: 30_000 });
  await nameField.fill(product.name);

  // 説明
  const descField = page
    .getByLabel(/説明|Description/i)
    .or(page.locator('textarea[name="description"], textarea[id*="description"]').first());
  if ((await descField.count()) > 0) {
    await descField.fill(product.description);
  }

  // 画像アップロード
  const fileInput = page.locator('input[type="file"]').first();
  if ((await fileInput.count()) > 0) {
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(1500);
  } else {
    console.warn('  ⚠ 画像アップロード欄が見つかりませんでした。手動で追加してください。');
  }

  // 価格（JPY）
  const priceField = page
    .getByLabel(/価格|Price|金額/i)
    .or(page.locator('input[name*="price"], input[inputmode="decimal"]').first());
  if ((await priceField.count()) > 0) {
    await priceField.fill(String(product.priceYen));
  }

  // 保存
  const saveBtn = page.getByRole('button', { name: /保存|Save|商品を追加|Add product/i }).last();
  await saveBtn.click();
  await page.waitForTimeout(3000);
}

async function main() {
  const context = await chromium.launchPersistentContext(AUTH_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'ja-JP',
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    await waitForProductsPage(page);

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      console.log(`\n[${i + 1}/${products.length}] 登録中: ${p.name}`);
      await page.goto(PRODUCTS_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await clickAddProduct(page);
      await page.waitForTimeout(1000);
      await fillProductForm(page, p);
      console.log(`  ✓ 完了（または保存確認）: ${p.name}`);
    }

    console.log('\n=== すべての商品の登録処理が終わりました ===');
    console.log('Stripe ダッシュボードで表示を確認してください。\n');
  } catch (err) {
    console.error('\nエラー:', err.message);
    console.error('手動で登録するか、Stripe API（推奨）の利用を検討してください。');
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

main();
