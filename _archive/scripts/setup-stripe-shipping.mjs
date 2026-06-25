/**
 * Stripe Shipping rate（地域別送料）を設定し、全 Payment Link に配送先収集を追加
 *
 * 使い方:
 *   cd _archive/scripts
 *   # 送料変更時は stripe-shipping.json の amountYen を編集して再実行
 *   node setup-stripe-shipping.mjs
 *
 * ※ shipping_options は Payment Link 作成時のみ指定可能なため、
 *   送料設定変更時は新しい Payment Link を発行し HTML の URL も更新します。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHIPPING_JSON = path.join(__dirname, 'stripe-shipping.json');
const PRODUCTS_JSON = path.join(__dirname, 'stripe-products.json');
const HTML_PATH = path.join(__dirname, '../html/majorin_sweet_0607.html');
const INDEX_HTML_PATH = path.join(__dirname, '../../index.html');

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
    headers: { Authorization: `Bearer ${secretKey}` },
  };
  if (params) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = params;
  }
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
  return data;
}

async function findPaymentLinkByUrl(secretKey, paymentUrl) {
  const slug = paymentUrl.split('/').pop();
  let startingAfter;
  for (;;) {
    const qs = new URLSearchParams({ limit: '100' });
    if (startingAfter) qs.set('starting_after', startingAfter);
    const list = await stripeRequest(secretKey, 'GET', `/payment_links?${qs}`);
    const found = (list.data || []).find((l) => l.url.includes(slug));
    if (found) return found;
    if (!list.has_more) break;
    startingAfter = list.data[list.data.length - 1].id;
  }
  throw new Error(`Payment Link が見つかりません: ${paymentUrl}`);
}

async function getShippingRate(secretKey, rateId) {
  return stripeRequest(secretKey, 'GET', `/shipping_rates/${rateId}`);
}

async function createShippingRate(secretKey, zone) {
  const body = new URLSearchParams();
  body.append('display_name', zone.displayName);
  body.append('type', 'fixed_amount');
  body.append('fixed_amount[amount]', String(zone.amountYen));
  body.append('fixed_amount[currency]', 'jpy');
  body.append('metadata[zone_key]', zone.key);
  return stripeRequest(secretKey, 'POST', '/shipping_rates', body);
}

async function deactivateShippingRate(secretKey, rateId) {
  const body = new URLSearchParams();
  body.append('active', 'false');
  return stripeRequest(secretKey, 'POST', `/shipping_rates/${rateId}`, body);
}

async function ensureShippingRates(secretKey, config) {
  const nextIds = { ...(config.shippingRateIds || {}) };

  for (const zone of config.zones) {
    const existingId = nextIds[zone.key];
    let needsCreate = true;

    if (existingId) {
      try {
        const rate = await getShippingRate(secretKey, existingId);
        const amount = rate.fixed_amount?.amount ?? null;
        if (rate.active && amount === zone.amountYen) {
          console.log(`  既存利用: ${zone.displayName} (${existingId}) ¥${zone.amountYen}`);
          needsCreate = false;
        } else {
          console.log(`  再作成: ${zone.displayName}（金額または状態が変更）`);
          if (rate.active) await deactivateShippingRate(secretKey, existingId);
        }
      } catch {
        console.log(`  再作成: ${zone.displayName}（ID が無効）`);
      }
    }

    if (needsCreate) {
      const created = await createShippingRate(secretKey, zone);
      nextIds[zone.key] = created.id;
      console.log(`  新規作成: ${zone.displayName} (${created.id}) ¥${zone.amountYen}`);
    }
  }

  config.shippingRateIds = nextIds;
  fs.writeFileSync(SHIPPING_JSON, JSON.stringify(config, null, 2) + '\n');
  return config.zones.map((z) => nextIds[z.key]);
}

function buildPaymentLinkBody(priceId, config, shippingRateIds) {
  const body = new URLSearchParams();
  body.append('line_items[0][price]', priceId);
  body.append('line_items[0][quantity]', '1');

  config.allowedCountries.forEach((country, i) => {
    body.append(`shipping_address_collection[allowed_countries][${i}]`, country);
  });

  shippingRateIds.forEach((rateId, i) => {
    body.append(`shipping_options[${i}][shipping_rate]`, rateId);
  });

  return body;
}

async function deactivatePaymentLink(secretKey, linkId) {
  const body = new URLSearchParams();
  body.append('active', 'false');
  return stripeRequest(secretKey, 'POST', `/payment_links/${linkId}`, body);
}

async function recreatePaymentLinkWithShipping(secretKey, product, config, shippingRateIds) {
  const oldUrl = product.paymentUrl;
  const oldLink = await findPaymentLinkByUrl(secretKey, oldUrl);
  const body = buildPaymentLinkBody(product.priceId, config, shippingRateIds);
  const newLink = await stripeRequest(secretKey, 'POST', '/payment_links', body);

  try {
    await deactivatePaymentLink(secretKey, oldLink.id);
    console.log(`  旧リンク無効化: ${oldUrl}`);
  } catch (err) {
    console.warn(`  旧リンク無効化をスキップ: ${err.message}`);
  }

  product.paymentUrl = newLink.url;
  console.log(`  新リンク: ${newLink.url}`);
  return { oldUrl, newUrl: newLink.url };
}

async function syncHtmlPaymentUrls(urlMap) {
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

async function main() {
  await loadEnvFile();
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey?.startsWith('sk_')) {
    console.error('STRIPE_SECRET_KEY を _archive/scripts/.env に設定してください');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(SHIPPING_JSON, 'utf8'));
  const products = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf8'));

  console.log('=== Stripe 送料ゾーン設定 ===\n');
  const shippingRateIds = await ensureShippingRates(secretKey, config);

  console.log('\n=== Payment Link 再作成（配送先 + 送料選択） ===\n');
  const urlMap = [];
  for (const product of products) {
    console.log(`更新中: ${product.name}`);
    urlMap.push(await recreatePaymentLinkWithShipping(secretKey, product, config, shippingRateIds));
  }

  fs.writeFileSync(PRODUCTS_JSON, JSON.stringify(products, null, 2) + '\n');
  console.log('\nstripe-products.json を更新しました');

  await syncHtmlPaymentUrls(urlMap);

  console.log('\n完了。checkout で配送先入力と地域（本州/北海道/沖縄）選択が表示されます。');
  console.log('送料変更時: stripe-shipping.json の amountYen を編集 → node setup-stripe-shipping.mjs\n');
}

main();
