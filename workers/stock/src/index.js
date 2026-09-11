/**
 * MAJORINS 週次在庫（商品ごと 10 個 / 木 10:00 JST リセット）
 *
 * 受付: 木曜 10:00 JST 〜 次週水曜 10:00 JST
 * 発送: 受付週の翌木曜（上限超過時はさらに次の木曜）
 *
 * GET  /status    公開：残り個数・受付可否・セール・配送目安
 * POST /checkout  注文内容から Stripe Checkout Session を作成
 * POST /contact   お問合せ受付（KV 保存 + Resend メール通知 + GAS シート追記）
 * POST /webhook   Stripe checkout.session.completed（在庫 + GAS 注文シート追記）
 *
 * Contact secrets:
 *   RESEND_API_KEY      … Resend API キー（必須・メール通知）
 *   CONTACT_NOTIFY_TO   … 通知先（省略時 mjshop@majorins.jp、カンマ区切り可）
 *   CONTACT_FROM        … 送信元（省略時 MAJORINS <mjshop@majorins.jp>）
 *   CONTACT_WEBHOOK_URL … 任意（Slack Incoming Webhook 等）
 * Sheet sync（任意・未設定でも本線は動作）:
 *   SHEET_SYNC_URL      … GAS ウェブアプリ URL（省略時は既定 URL）
 *   SHEET_SYNC_TOKEN    … GAS の SYNC_TOKEN（未設定なら空文字）
 */

const LIMIT_PER_ITEM = 10;
const PRODUCT_KEYS = ['noir', 'verdant', 'passion'];
// 2026-09-11: 通常価格を ¥4,800 に戻す（誤設定だった ¥4,600 Price は webhook 逆引き用に残置）
const KEY_TO_PRICE = {
  noir: 'price_1Tfr7c3A10QFS30cZiB51VM1',
  verdant: 'price_1Tfr7d3A10QFS30cxsuzLgbC',
  passion: 'price_1Tfr7f3A10QFS30c2sjr3cti',
};

// ===== 2026-09: 期間限定 特別価格（1本 800円OFF / ¥4,800 → ¥4,000）=====
// 期間: 2026-09-14 00:00 JST 〜 2026-09-26 00:00 JST（= 9/25 24:00）
// mo は 0-based（8 = 9月）
const SALE_START_JST = { y: 2026, mo: 8, d: 14, h: 0, mi: 0 };
const SALE_END_JST   = { y: 2026, mo: 8, d: 26, h: 0, mi: 0 };
const KEY_TO_PRICE_SALE = {
  noir: 'price_1UEOOl3A10QFS30cIJ7JlKE1',
  verdant: 'price_1UEOOs3A10QFS30cS9FtPNAj',
  passion: 'price_1UEOOs3A10QFS30cTKPJlmWk',
};
const SALE_PRICE_YEN = { noir: 4000, verdant: 4000, passion: 4000 };

function isSaleActive(nowMs) {
  const s = SALE_START_JST;
  const e = SALE_END_JST;
  const startMs = jstToUtcMs(s.y, s.mo, s.d, s.h, s.mi);
  const endMs = jstToUtcMs(e.y, e.mo, e.d, e.h, e.mi);
  return nowMs >= startMs && nowMs < endMs;
}

function priceMapFor(nowMs) {
  return isSaleActive(nowMs) ? KEY_TO_PRICE_SALE : KEY_TO_PRICE;
}

function yenMapFor(nowMs) {
  return isSaleActive(nowMs) ? SALE_PRICE_YEN : PRICE_YEN;
}
// ===== ここまで =====

// 特別価格・誤設定だった ¥4,600 / 旧 ¥3,800 Price も webhook 在庫反映のため残す
const PRICE_TO_KEY = Object.fromEntries(
  [
    ...Object.entries(KEY_TO_PRICE),
    ...Object.entries(KEY_TO_PRICE_SALE),
    // 2026-09-09 一時設定の ¥4,600
    ['noir', 'price_1UDgXT3A10QFS30cZgeISwBX'],
    ['verdant', 'price_1UDgXU3A10QFS30chLVkaZbf'],
    ['passion', 'price_1UDgXU3A10QFS30ca13csPYP'],
    // 2026-09-09 一時設定の特別価格 ¥3,800
    ['noir', 'price_1UDgXT3A10QFS30cq0qW2pRW'],
    ['verdant', 'price_1UDgXU3A10QFS30crKRgKg2z'],
    ['passion', 'price_1UDgXU3A10QFS30ceoA55vpv'],
  ].map(([k, v]) => [v, k]),
);
// 2026-09-11: 通常表示・計算を ¥4,800 に戻す
const PRICE_YEN = { noir: 4800, verdant: 4800, passion: 4800 };
const FREE_SHIPPING_YEN = 10000;
const SHIPPING_RATE_PAID = 'shr_1U8cKh3A10QFS30cDgDiCewG';
const DEFAULT_SHEET_SYNC_URL =
  'https://script.google.com/macros/s/AKfycbzQNDSrGqT7QGV15K0rl0Kl_vyfBp-bYyaCIi4TKYSb2CDeT0weZQ0GkMmOtVufQx-H/exec';
const PRODUCT_LABELS = {
  noir: 'Noir Melt / ノワール メルト',
  verdant: 'Verdant Veil / ヴァーダント ベール',
  passion: 'Passion Orange / パッションオレンジヴェール',
};
const SHIPPING_RATE_FREE = 'shr_1UARvb3A10QFS30c5a46Ocnr';
const SITE_ORIGIN = 'https://shop.majorins.jp';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jstWall(nowMs) {
  const t = new Date(nowMs + JST_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    mo: t.getUTCMonth(),
    d: t.getUTCDate(),
    dow: t.getUTCDay(),
    h: t.getUTCHours(),
    mi: t.getUTCMinutes(),
  };
}

function jstToUtcMs(y, mo, d, h, mi = 0) {
  return Date.UTC(y, mo, d, h - 9, mi, 0, 0);
}

/** 直近の木曜 10:00 JST（now がそれより前なら先週木曜）
 * 旧: 水曜 10:00 起点
 */
export function weekStartUtc(nowMs = Date.now()) {
  const w = jstWall(nowMs);
  // dow: 0=日 … 4=木
  const daysFromThu = (w.dow + 7 - 4) % 7;
  const thuUtcMidnight = Date.UTC(w.y, w.mo, w.d) - daysFromThu * 86400000;
  const thu = new Date(thuUtcMidnight);
  let start = jstToUtcMs(thu.getUTCFullYear(), thu.getUTCMonth(), thu.getUTCDate(), 10, 0);
  if (nowMs < start) {
    const prev = new Date(thuUtcMidnight - 7 * 86400000);
    start = jstToUtcMs(prev.getUTCFullYear(), prev.getUTCMonth(), prev.getUTCDate(), 10, 0);
  }
  return start;
}

/** 受付終了: 次週水曜 10:00 JST（木曜10:00から6日後）
 * 旧: 日曜 10:00（水曜起点から4日後）
 */
export function receptionEndUtc(weekStartMs) {
  return weekStartMs + 6 * 86400000;
}

export function isAccepting(nowMs, weekStartMs) {
  return nowMs >= weekStartMs && nowMs < receptionEndUtc(weekStartMs);
}

export function weekIdFromStart(weekStartMs) {
  const w = jstWall(weekStartMs);
  const mm = String(w.mo + 1).padStart(2, '0');
  const dd = String(w.d).padStart(2, '0');
  return `${w.y}-${mm}-${dd}`;
}

/**
 * 配送目安（JST）
 * 受付枠内（木10:00〜次週水10:00）の注文:
 * - sold < 10 → 受付終了直後の木曜に発送（木曜日配送予定）
 * - sold >= 10 → さらに次の週の木曜（さらに次の週の木曜日配送予定）
 * sold は Stripe webhook 集計を正とする
 *
 * 旧ロジック（水曜のみ通常枠 / それ以外は次週）は廃止
 */
export function deliveryFor(nowMs, sold) {
  const underCap = Number(sold || 0) < LIMIT_PER_ITEM;
  if (underCap) {
    return {
      slot: 'cycle_thursday',
      label: '木曜日配送予定',
      nextWeek: false,
    };
  }
  return {
    slot: 'following_thursday',
    label: 'さらに次の週の木曜日配送予定',
    nextWeek: true,
  };
}

function emptyCounts() {
  return { noir: 0, verdant: 0, passion: 0 };
}

function corsHeaders(origin) {
  const allowed = [
    'https://shop.majorins.jp',
    'https://keeeeei-soeda.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  const allow = origin && allowed.some((o) => origin === o || origin.startsWith(o))
    ? origin
    : 'https://shop.majorins.jp';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    },
  });
}

async function readCounts(kv, weekId) {
  const raw = await kv.get(`week:${weekId}:counts`);
  if (!raw) return emptyCounts();
  try {
    return { ...emptyCounts(), ...JSON.parse(raw) };
  } catch {
    return emptyCounts();
  }
}

function buildStatus(nowMs, counts) {
  const weekStart = weekStartUtc(nowMs);
  const weekId = weekIdFromStart(weekStart);
  // 2026-09-09: 木10:00〜次週水10:00 のみ受付（旧: 全期間 / さらに旧: 水〜日）
  const accepting = isAccepting(nowMs, weekStart);
  // const accepting = true;
  const saleOn = isSaleActive(nowMs);
  const items = {};
  for (const key of PRODUCT_KEYS) {
    const sold = Number(counts[key] || 0);
    const remaining = Math.max(0, LIMIT_PER_ITEM - sold);
    const overCap = sold >= LIMIT_PER_ITEM;
    const delivery = deliveryFor(nowMs, sold);
    // 受付時間外のみ導線ブロック。上限超過は注文可（配送週をずらす）
    // 旧: soldOut = !accepting || remaining <= 0
    // 旧: soldOut = false（全期間）
    const soldOut = !accepting;
    items[key] = {
      sold,
      remaining,
      soldOut,
      overCap,
      limit: LIMIT_PER_ITEM,
      delivery,
    };
  }
  return {
    weekId,
    weekStartIso: new Date(weekStart).toISOString(),
    receptionEndIso: new Date(receptionEndUtc(weekStart)).toISOString(),
    accepting,
    // alwaysOpen: true, // 2026-09-09 廃止
    limitPerItem: LIMIT_PER_ITEM,
    items,
    // 2026-09-09: 特別価格情報をフロントへ渡す
    sale: {
      active: saleOn,
      unitPrice: saleOn ? 4000 : 4800,
      regularPrice: 4800,
      discount: 800,
      label: '特別価格',
      startsAt: jstToUtcMs(SALE_START_JST.y, SALE_START_JST.mo, SALE_START_JST.d, SALE_START_JST.h, SALE_START_JST.mi),
      endsAt: jstToUtcMs(SALE_END_JST.y, SALE_END_JST.mo, SALE_END_JST.d, SALE_END_JST.h, SALE_END_JST.mi),
    },
  };
}

async function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== v1.length) return false;
  let mismatch = 0;
  for (let i = 0; i < hex.length; i++) mismatch |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return mismatch === 0;
}

function mapPriceToKey(priceId) {
  return PRICE_TO_KEY[priceId] || null;
}

async function fetchSessionLineItems(sessionId, secretKey) {
  const url = new URL(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`);
  url.searchParams.append('expand[]', 'line_items.data.price');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) {
    throw new Error(`stripe session ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function formatJstDateTime(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function sheetSyncUrl(env) {
  return String(env.SHEET_SYNC_URL || DEFAULT_SHEET_SYNC_URL).trim();
}

function sheetSyncToken(env) {
  return String(env.SHEET_SYNC_TOKEN || '').trim();
}

/**
 * GAS ウェブアプリへ POST。
 * script.google.com の 302 は follow で問題なく doPost まで届く。
 */
async function postToGas(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });

  const text = await res.text().catch(() => '');
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // GAS が HTML を返すケースもある
  }
  return {
    ok: Boolean(res.ok && json && json.ok !== false),
    status: res.status,
    body: json || text.slice(0, 300),
  };
}

async function syncToSheet(env, type, fields) {
  const url = sheetSyncUrl(env);
  if (!url) return { skipped: true, reason: 'no_url' };
  return postToGas(url, {
    token: sheetSyncToken(env),
    type,
    fields,
  });
}

function formatShippingAddress(session) {
  const details = session.shipping_details || session.collected_information?.shipping_details;
  const addr = details?.address || {};
  const lines = [
    details?.name,
    [addr.postal_code, addr.state, addr.city, addr.line1, addr.line2].filter(Boolean).join(' '),
    addr.country && addr.country !== 'JP' ? addr.country : '',
  ].filter(Boolean);
  return lines.join(' / ') || '';
}

function formatLineItemsSummary(lineItems) {
  const parts = [];
  for (const item of lineItems || []) {
    const priceId = item.price?.id || item.price;
    const key = mapPriceToKey(typeof priceId === 'string' ? priceId : '');
    const qty = Number(item.quantity || 0);
    if (!qty) continue;
    const label =
      PRODUCT_LABELS[key] ||
      item.description ||
      item.price?.product?.name ||
      key ||
      (typeof priceId === 'string' ? priceId : 'item');
    parts.push(`${label} x${qty}`);
  }
  return parts.join(' / ');
}

function extractRemarks(session) {
  const fields = session.custom_fields || [];
  for (const f of fields) {
    if (f?.key === 'remarks') {
      return String(f.text?.value || f.value || '').trim();
    }
  }
  return '';
}

function yenFromStripeAmount(amount) {
  if (amount == null || amount === '') return '';
  const n = Number(amount);
  return Number.isFinite(n) ? String(n) : String(amount);
}

async function syncContactToSheet(env, record) {
  return syncToSheet(env, 'contact', {
    受付日時: formatJstDateTime(Date.parse(record.createdAt) || Date.now()),
    受付ID: record.id || '',
    お名前: record.name || '',
    メール: record.email || '',
    電話: record.tel || '',
    郵便番号: record.zip || '',
    住所: record.address || '',
    種別: record.category || '',
    内容: record.message || '',
  });
}

async function syncOrderToSheet(env, session, lineItems) {
  const customer = session.customer_details || {};
  const shippingCost =
    session.shipping_cost?.amount_total ??
    session.total_details?.amount_shipping ??
    '';
  const subtotal =
    session.amount_subtotal != null
      ? session.amount_subtotal
      : session.amount_total != null && shippingCost !== ''
        ? Number(session.amount_total) - Number(shippingCost)
        : '';

  return syncToSheet(env, 'order', {
    注文日時: formatJstDateTime(
      session.created ? Number(session.created) * 1000 : Date.now(),
    ),
    'Session ID': session.id || '',
    お客様名: session.shipping_details?.name || customer.name || '',
    メール: customer.email || session.customer_email || '',
    電話: customer.phone || '',
    配送先住所: formatShippingAddress(session),
    商品内容: formatLineItemsSummary(lineItems),
    小計: yenFromStripeAmount(subtotal),
    送料: yenFromStripeAmount(shippingCost),
    合計: yenFromStripeAmount(session.amount_total),
    '備考（のし等）': extractRemarks(session),
    支払い状況: session.payment_status || session.status || '',
  });
}

async function createCheckoutSession(env, items, opts = {}) {
  const now = Date.now();
  const weekStart = weekStartUtc(now);
  const weekId = weekIdFromStart(weekStart);
  const counts = await readCounts(env.STOCK, weekId);
  const status = buildStatus(now, counts);
  const forceOpen =
    Boolean(env.QA_CHECKOUT_TOKEN) &&
    typeof opts.qaToken === 'string' &&
    opts.qaToken.length > 0 &&
    opts.qaToken === env.QA_CHECKOUT_TOKEN;

  // 2026-09-09: 受付は木10:00〜次週水10:00（時間外は拒否）
  if (!status.accepting && !forceOpen) {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'not_accepting',
        message: '現在は受付時間外です。ご注文の受付は毎週木曜10:00〜次週水曜10:00です。',
        items: status.items,
        accepting: false,
      },
    };
  }

  // forceOpen 時は受付中扱いにする（在庫超過でも注文可）
  if (forceOpen) {
    for (const key of PRODUCT_KEYS) {
      const sold = Number(counts[key] || 0);
      const remaining = Math.max(0, LIMIT_PER_ITEM - sold);
      const delivery = deliveryFor(now, sold);
      status.items[key] = {
        sold,
        remaining,
        soldOut: false,
        overCap: sold >= LIMIT_PER_ITEM,
        limit: LIMIT_PER_ITEM,
        delivery,
      };
    }
    status.accepting = true;
  }

  // 2026-09-09: 特別価格期間の判定
  const saleNowMs = Date.now();
  const activePriceMap = priceMapFor(saleNowMs);
  const activeYenMap = yenMapFor(saleNowMs);

  const lineItems = [];
  let subtotal = 0;
  const deliveryNotes = {};

  for (const raw of items) {
    const sku = String(raw?.sku || '');
    const qty = Number(raw?.qty || 0);
    if (!PRODUCT_KEYS.includes(sku)) {
      return {
        ok: false,
        status: 400,
        body: { error: 'invalid_sku', message: '不明な商品です。', sku },
      };
    }
    if (!Number.isInteger(qty) || qty <= 0 || qty > LIMIT_PER_ITEM) {
      return {
        ok: false,
        status: 400,
        body: { error: 'invalid_qty', message: '数量が正しくありません。', sku, qty },
      };
    }
    // 上限超過でも注文受付。上限をまたぐ注文は「さらに次の週」扱い
    const soldBefore = Number(counts[sku] || 0);
    let del = deliveryFor(now, soldBefore);
    if (!del.nextWeek && soldBefore + qty > LIMIT_PER_ITEM) {
      del = deliveryFor(now, LIMIT_PER_ITEM);
    }
    deliveryNotes[sku] = del;

    // 2026-09-09: 期間限定 特別価格に対応（旧実装は下記）
    // lineItems.push({ price: KEY_TO_PRICE[sku], quantity: qty });
    // subtotal += PRICE_YEN[sku] * qty;
    lineItems.push({ price: activePriceMap[sku], quantity: qty });
    subtotal += activeYenMap[sku] * qty;
  }

  if (!lineItems.length) {
    return {
      ok: false,
      status: 400,
      body: { error: 'empty_cart', message: 'ケーキの個数をお選びください。' },
    };
  }

  const shippingFree = subtotal >= FREE_SHIPPING_YEN;
  const body = new URLSearchParams();
  body.append('mode', 'payment');
  body.append('success_url', `${SITE_ORIGIN}/order/?success=1`);
  body.append('cancel_url', `${SITE_ORIGIN}/order/?canceled=1`);
  body.append('billing_address_collection', 'auto');
  body.append('phone_number_collection[enabled]', 'false');
  body.append('shipping_address_collection[allowed_countries][0]', 'JP');
  body.append('allow_promotion_codes', 'true');
  body.append('locale', 'ja');
  body.append('custom_fields[0][key]', 'remarks');
  body.append('custom_fields[0][label][type]', 'custom');
  body.append('custom_fields[0][label][custom]', '備考（のし・表書きなど）');
  body.append('custom_fields[0][type]', 'text');
  body.append('custom_fields[0][optional]', 'true');
  body.append('custom_fields[0][text][maximum_length]', '200');

  lineItems.forEach((li, i) => {
    body.append(`line_items[${i}][price]`, li.price);
    body.append(`line_items[${i}][quantity]`, String(li.quantity));
  });

  if (shippingFree) {
    body.append('shipping_options[0][shipping_rate]', SHIPPING_RATE_FREE);
  } else {
    body.append('shipping_options[0][shipping_rate]', SHIPPING_RATE_PAID);
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    return {
      ok: false,
      status: 502,
      body: {
        error: 'stripe_error',
        message: data.error?.message || '決済セッションを作成できませんでした。',
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      url: data.url,
      id: data.id,
      subtotal,
      shipping: shippingFree ? 0 : 1300,
      shippingFree,
      delivery: deliveryNotes,
    },
  };
}

async function applySession(env, session) {
  const sessionId = session.id;
  if (!sessionId) return { ok: false, reason: 'no_session_id' };
  const seenKey = `evt:${sessionId}`;
  if (await env.STOCK.get(seenKey)) return { ok: true, duplicate: true };

  const paid = session.payment_status === 'paid' || session.status === 'complete';
  if (!paid && session.payment_status !== 'unpaid') {
    // Payment Links は即時決済。paid 以外は無視
  }
  if (session.payment_status && session.payment_status !== 'paid') {
    return { ok: true, skipped: 'not_paid' };
  }

  let fullSession = session;
  let lineItems = session.line_items?.data;
  if (!lineItems || !session.customer_details) {
    fullSession = await fetchSessionLineItems(sessionId, env.STRIPE_SECRET_KEY);
    lineItems = fullSession.line_items?.data || [];
  }

  const now = Date.now();
  const weekId = weekIdFromStart(weekStartUtc(now));
  const counts = await readCounts(env.STOCK, weekId);
  const added = {};

  for (const item of lineItems) {
    const priceId = item.price?.id || item.price;
    const key = mapPriceToKey(typeof priceId === 'string' ? priceId : '');
    const qty = Number(item.quantity || 1);
    if (!key || qty <= 0) continue;
    counts[key] = Number(counts[key] || 0) + qty;
    added[key] = (added[key] || 0) + qty;
  }

  await env.STOCK.put(`week:${weekId}:counts`, JSON.stringify(counts));
  await env.STOCK.put(seenKey, '1', { expirationTtl: 60 * 60 * 24 * 40 });

  // GAS シート同期は保険（失敗しても在庫反映は成功扱い）
  let sheet = null;
  try {
    sheet = await syncOrderToSheet(env, fullSession, lineItems);
  } catch (err) {
    sheet = { ok: false, error: String(err.message || err) };
  }

  return { ok: true, weekId, added, counts, sheet };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contactNotifyRecipients(env) {
  const raw = String(env.CONTACT_NOTIFY_TO || 'mjshop@majorins.jp');
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function sendContactEmail(env, record) {
  if (!env.RESEND_API_KEY) return { skipped: true, reason: 'no_api_key' };

  const to = contactNotifyRecipients(env);
  if (!to.length) return { skipped: true, reason: 'no_recipients' };

  const from = String(env.CONTACT_FROM || 'MAJORINS <mjshop@majorins.jp>').trim();
  const subject = `【MAJORINS お問合せ】${record.category || 'その他'} / ${record.name}`;
  const lines = [
    'MAJORINS サイトからお問合せがありました。',
    '',
    `受付ID: ${record.id}`,
    `日時: ${record.createdAt}`,
    `お名前: ${record.name}`,
    `メール: ${record.email}`,
    `電話: ${record.tel || '（未入力）'}`,
    `郵便番号: ${record.zip || '（未入力）'}`,
    `住所: ${record.address || '（未入力）'}`,
    `種別: ${record.category || '（未選択）'}`,
    '',
    '—— お問合せ内容 ——',
    record.message,
    '',
    'このメールに返信すると、お客様のメールアドレスへ送れます。',
  ];
  const text = lines.join('\n');
  const html = `
    <p>MAJORINS サイトからお問合せがありました。</p>
    <table style="border-collapse:collapse;font-size:14px;line-height:1.6">
      <tr><td style="padding:2px 12px 2px 0;color:#666">受付ID</td><td>${escapeHtml(record.id)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#666">日時</td><td>${escapeHtml(record.createdAt)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#666">お名前</td><td>${escapeHtml(record.name)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#666">メール</td><td><a href="mailto:${escapeHtml(record.email)}">${escapeHtml(record.email)}</a></td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#666">電話</td><td>${escapeHtml(record.tel || '（未入力）')}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#666">郵便番号</td><td>${escapeHtml(record.zip || '（未入力）')}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#666">住所</td><td>${escapeHtml(record.address || '（未入力）')}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#666">種別</td><td>${escapeHtml(record.category || '（未選択）')}</td></tr>
    </table>
    <p style="margin:20px 0 6px;color:#666">お問合せ内容</p>
    <pre style="white-space:pre-wrap;font-family:inherit;background:#f7f5f2;padding:14px;border-radius:6px">${escapeHtml(record.message)}</pre>
    <p style="color:#888;font-size:12px">このメールに返信すると、お客様のメールアドレスへ送れます。</p>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: record.email,
      subject,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: errBody.slice(0, 500) };
  }
  return { ok: true };
}

async function handleContact(env, payload) {
  const name = String(payload?.name || '').trim();
  const email = String(payload?.email || '').trim();
  const message = String(payload?.message || '').trim();
  const tel = String(payload?.tel || '').trim();
  const zip = String(payload?.zip || '').trim();
  const address = String(payload?.address || '').trim();
  const category = String(payload?.category || '').trim();

  if (!name || name.length > 100) {
    return { ok: false, status: 400, body: { error: 'invalid_name', message: 'お名前をご入力ください。' } };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return { ok: false, status: 400, body: { error: 'invalid_email', message: 'メールアドレスを正しくご入力ください。' } };
  }
  if (!message || message.length > 5000) {
    return { ok: false, status: 400, body: { error: 'invalid_message', message: 'お問合せ内容をご入力ください。' } };
  }
  if (tel && !/^[0-9+\-() ]{9,20}$/.test(tel)) {
    return { ok: false, status: 400, body: { error: 'invalid_tel', message: '電話番号を正しくご入力ください。' } };
  }

  const now = Date.now();
  const id = `contact:${now}:${crypto.randomUUID().slice(0, 8)}`;
  const record = {
    id,
    createdAt: new Date(now).toISOString(),
    name,
    email,
    tel,
    zip,
    address,
    category,
    message,
  };
  await env.STOCK.put(id, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 120 });

  // Resend で運営宛に通知（失敗しても KV 保存は成功扱い）
  try {
    await sendContactEmail(env, record);
  } catch {
    // ignore
  }

  // 任意: CONTACT_WEBHOOK_URL があれば通知（Slack Incoming Webhook 等）
  try {
    await notifyContactSlack(env, record);
  } catch {
    // 保存は成功しているので通知失敗は握りつぶす
  }

  // GAS シート同期（失敗しても問い合わせ自体は成功扱い）
  try {
    await syncContactToSheet(env, record);
  } catch {
    // ignore
  }

  return { ok: true, status: 200, body: { ok: true, id } };
}

function slackMrkdwnEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function notifyContactSlack(env, record) {
  if (!env.CONTACT_WEBHOOK_URL) return;

  const category = record.category || '（未選択）';
  const addressLine = [record.zip, record.address].filter(Boolean).join(' ').trim() || '（未入力）';
  const tel = record.tel || '（未入力）';
  const fallback = [
    `【MAJORINS お問合せ】${record.name} <${record.email}>`,
    `種別: ${category}`,
    record.message,
  ].join('\n');

  const body = [
    'HPへ問い合わせがありました。',
    '',
    `お名前: ${slackMrkdwnEscape(record.name)}`,
    `メール: ${slackMrkdwnEscape(record.email)}`,
    `電話: ${slackMrkdwnEscape(tel)}`,
    `住所: ${slackMrkdwnEscape(addressLine)}`,
    `種別: ${slackMrkdwnEscape(category)}`,
    `内容: ${slackMrkdwnEscape(record.message)}`,
  ].join('\n');

  await fetch(env.CONTACT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: fallback,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: body },
        },
      ],
    }),
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === 'GET' && (url.pathname === '/status' || url.pathname === '/')) {
      const now = Date.now();
      const weekId = weekIdFromStart(weekStartUtc(now));
      const counts = await readCounts(env.STOCK, weekId);
      return json(buildStatus(now, counts), 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/checkout') {
      if (!env.STRIPE_SECRET_KEY) {
        return json({ error: 'misconfigured', message: '決済設定が未完了です。' }, 500, origin);
      }
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: 'invalid_json', message: 'リクエストが不正です。' }, 400, origin);
      }
      const items = Array.isArray(payload?.items) ? payload.items : [];
      try {
        const result = await createCheckoutSession(env, items, { qaToken: payload?.qaToken });
        return json(result.body, result.status, origin);
      } catch (err) {
        return json({ error: String(err.message || err), message: '決済画面を開けませんでした。' }, 500, origin);
      }
    }

    if (request.method === 'POST' && url.pathname === '/contact') {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: 'invalid_json', message: 'リクエストが不正です。' }, 400, origin);
      }
      try {
        const result = await handleContact(env, payload);
        return json(result.body, result.status, origin);
      } catch (err) {
        return json({ error: String(err.message || err), message: '送信できませんでした。' }, 500, origin);
      }
    }

    if (request.method === 'POST' && url.pathname === '/webhook') {
      const raw = await request.text();
      const sig = request.headers.get('Stripe-Signature') || '';
      const valid = await verifyStripeSignature(raw, sig, env.STRIPE_WEBHOOK_SECRET);
      if (!valid) return json({ error: 'invalid_signature' }, 400, origin);

      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        return json({ error: 'invalid_json' }, 400, origin);
      }

      if (event.type !== 'checkout.session.completed') {
        return json({ received: true, ignored: event.type }, 200, origin);
      }

      try {
        const result = await applySession(env, event.data?.object || {});
        return json({ received: true, ...result }, 200, origin);
      } catch (err) {
        return json({ error: String(err.message || err) }, 500, origin);
      }
    }

    return json({ error: 'not_found' }, 404, origin);
  },
};
