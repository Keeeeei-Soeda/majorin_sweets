/**
 * 登録済み Price ID から Payment Link を作成し、URL を表示
 * stripe-products.json に priceId / paymentUrl を追記
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRICE_IDS = {
  'ノワール メルト（Noir Melt）': 'price_1TcJXo3A10QFS30cSPEUssqH',
  'ヴァーダント ベール（Verdant Veil）': 'price_1TcJXp3A10QFS30cNKqztfOq',
  'パッションオレンジヴェール（Passion Orange Vert）': 'price_1TcJXp3A10QFS30cewpjaIr2',
};

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

async function createPaymentLink(secretKey, priceId) {
  const body = new URLSearchParams();
  body.append('line_items[0][price]', priceId);
  body.append('line_items[0][quantity]', '1');

  const res = await fetch('https://api.stripe.com/v1/payment_links', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
  return data.url;
}

async function main() {
  await loadEnvFile();
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('STRIPE_SECRET_KEY を scripts/.env に設定してください');
    process.exit(1);
  }

  const jsonPath = path.join(__dirname, 'stripe-products.json');
  const products = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  for (const p of products) {
    const priceId = p.priceId || PRICE_IDS[p.name];
    if (!priceId) {
      console.error(`Price ID 不明: ${p.name}`);
      continue;
    }
    p.priceId = priceId;
    console.log(`作成中: ${p.name}`);
    p.paymentUrl = await createPaymentLink(secretKey, priceId);
    console.log(`  → ${p.paymentUrl}`);
  }

  fs.writeFileSync(jsonPath, JSON.stringify(products, null, 2) + '\n');
  console.log('\nstripe-products.json を更新しました');
}

main();
