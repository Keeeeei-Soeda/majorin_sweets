/**
 * 既存 Stripe 商品に新価格（4800円）を追加し、Payment Link を作り直す
 *
 * 使い方:
 *   cd _archive/scripts
 *   echo 'STRIPE_SECRET_KEY=sk_live_...' > .env
 *   node update-stripe-prices.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, 'stripe-products.json');
const HTML_PATH = path.join(__dirname, '../../majorin_sweet_0607.html');
const INDEX_HTML_PATH = path.join(__dirname, '../../index.html');
const NEW_PRICE_YEN = 4800;

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

async function stripeRequest(secretKey, method, endpoint, params) {
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  };

  if (params) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = params;
  }

  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, init);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || JSON.stringify(data));
  }
  return data;
}

async function createPrice(secretKey, productId, priceYen) {
  const body = new URLSearchParams();
  body.append('product', productId);
  body.append('unit_amount', String(priceYen));
  body.append('currency', 'jpy');
  return stripeRequest(secretKey, 'POST', '/prices', body);
}

async function createPaymentLink(secretKey, priceId) {
  const body = new URLSearchParams();
  body.append('line_items[0][price]', priceId);
  body.append('line_items[0][quantity]', '1');
  return stripeRequest(secretKey, 'POST', '/payment_links', body);
}

async function deactivatePrice(secretKey, priceId) {
  const body = new URLSearchParams();
  body.append('active', 'false');
  return stripeRequest(secretKey, 'POST', `/prices/${priceId}`, body);
}

async function main() {
  await loadEnvFile();
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !secretKey.startsWith('sk_')) {
    console.error('STRIPE_SECRET_KEY を _archive/scripts/.env に設定してください');
    process.exit(1);
  }

  const products = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const urlMap = products.map((p) => ({ oldUrl: p.paymentUrl, name: p.name }));

  console.log(`Stripe 価格を ¥${NEW_PRICE_YEN} に更新します（${products.length}件）\n`);

  for (const product of products) {
    const oldPriceId = product.priceId;
    const oldPaymentUrl = product.paymentUrl;
    if (!oldPriceId) {
      console.error(`priceId がありません: ${product.name}`);
      process.exitCode = 1;
      continue;
    }

    console.log(`処理中: ${product.name}`);
    const oldPrice = await stripeRequest(secretKey, 'GET', `/prices/${oldPriceId}`);
    const newPrice = await createPrice(secretKey, oldPrice.product, NEW_PRICE_YEN);
    const paymentLink = await createPaymentLink(secretKey, newPrice.id);

    try {
      await deactivatePrice(secretKey, oldPriceId);
      console.log(`  旧価格を無効化: ${oldPriceId}`);
    } catch (err) {
      console.warn(`  旧価格の無効化をスキップ: ${err.message}`);
    }

    product.priceYen = NEW_PRICE_YEN;
    product.priceId = newPrice.id;
    product.paymentUrl = paymentLink.url;
    urlMap.find((m) => m.name === product.name).newUrl = paymentLink.url;
    urlMap.find((m) => m.name === product.name).oldUrl = oldPaymentUrl;

    console.log(`  新価格ID: ${newPrice.id}`);
    console.log(`  Payment Link: ${paymentLink.url}\n`);
  }

  fs.writeFileSync(JSON_PATH, JSON.stringify(products, null, 2) + '\n');
  console.log('stripe-products.json を更新しました');

  if (fs.existsSync(HTML_PATH) || fs.existsSync(INDEX_HTML_PATH)) {
    for (const htmlPath of [HTML_PATH, INDEX_HTML_PATH]) {
      if (!fs.existsSync(htmlPath)) continue;
      let html = fs.readFileSync(htmlPath, 'utf8');
      for (const { oldUrl, newUrl } of urlMap) {
        if (oldUrl && newUrl && oldUrl !== newUrl) {
          html = html.split(oldUrl).join(newUrl);
        }
      }
      fs.writeFileSync(htmlPath, html);
      console.log(`${path.basename(htmlPath)} の Payment Link を更新しました`);
    }
  }
}

main();
