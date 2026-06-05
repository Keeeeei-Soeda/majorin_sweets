/**
 * Stripe API で商品を登録（ダッシュボードログイン不要）
 *
 * 使い方:
 *   export STRIPE_SECRET_KEY="sk_live_..."
 *   node scripts/register-stripe-api.mjs
 *
 * または scripts/.env に STRIPE_SECRET_KEY=... を置いて実行
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IMAGE_BASE =
  process.env.STRIPE_IMAGE_BASE_URL ||
  'https://keeeeei-soeda.github.io/majorin_sweets/';

async function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

async function createProduct(secretKey, product) {
  const imageUrl = new URL(product.image, IMAGE_BASE).href;
  const body = new URLSearchParams();
  body.append('name', product.name);
  body.append('description', product.description);
  body.append('images[]', imageUrl);
  body.append('default_price_data[currency]', 'jpy');
  body.append('default_price_data[unit_amount]', String(product.priceYen));

  const res = await fetch('https://api.stripe.com/v1/products', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || JSON.stringify(data));
  }
  return { product: data, imageUrl };
}

async function main() {
  await loadEnvFile();
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !secretKey.startsWith('sk_')) {
    console.error('STRIPE_SECRET_KEY を設定してください（sk_live_... または sk_test_...）');
    process.exit(1);
  }

  const products = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'stripe-products.json'), 'utf8')
  );

  console.log(`Stripe API 登録開始（${products.length}件）\n`);

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    console.log(`[${i + 1}/${products.length}] ${p.name}`);
    try {
      const { product, imageUrl } = await createProduct(secretKey, p);
      console.log(`  ✓ 商品ID: ${product.id}`);
      console.log(`    価格ID: ${product.default_price}`);
      console.log(`    画像: ${imageUrl}`);
    } catch (err) {
      console.error(`  ✗ 失敗: ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log('\n完了。Stripe ダッシュボードの「商品」で確認してください。');
}

main();
