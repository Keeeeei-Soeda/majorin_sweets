import { weekStartUtc, receptionEndUtc, isAccepting, weekIdFromStart, deliveryFor } from './src/index.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// 2026-08-30 22:30 JST = 受付終了後（日曜10:00過ぎ）
const afterClose = Date.parse('2026-08-30T13:30:00.000Z');
const start = weekStartUtc(afterClose);
assert(weekIdFromStart(start) === '2026-08-26', `weekId=${weekIdFromStart(start)}`);
assert(!isAccepting(afterClose, start), 'should be closed after Sun 10:00');

// 2026-08-28 12:00 JST = 金曜＝受付中
const friday = Date.parse('2026-08-28T03:00:00.000Z');
const startFri = weekStartUtc(friday);
assert(weekIdFromStart(startFri) === '2026-08-26', `fri week=${weekIdFromStart(startFri)}`);
assert(isAccepting(friday, startFri), 'Friday should be accepting');

// 水曜 09:59 JST は前週
const beforeWed = Date.parse('2026-08-26T00:59:00.000Z');
const startPrev = weekStartUtc(beforeWed);
assert(weekIdFromStart(startPrev) === '2026-08-19', `prev=${weekIdFromStart(startPrev)}`);

const end = receptionEndUtc(start);
assert(end === Date.parse('2026-08-30T01:00:00.000Z'), `end=${new Date(end).toISOString()}`);

// 2026-09-09: 配送ラベル（JST）
// 水曜 12:00 JST・sold 0 → 今週木曜
const wedNoon = Date.parse('2026-09-09T03:00:00.000Z'); // 2026-09-09 is Wed
assert(deliveryFor(wedNoon, 0).slot === 'this_thursday', 'wed under cap');
assert(deliveryFor(wedNoon, 10).slot === 'next_thursday', 'wed over cap');
// 金曜 → 次週
assert(deliveryFor(friday, 0).slot === 'next_thursday', 'fri always next week');

// セール期間境界（JST）
function jstToUtcMs(y, mo, d, h, mi = 0) {
  return Date.UTC(y, mo, d, h - 9, mi, 0, 0);
}
const saleStart = jstToUtcMs(2026, 8, 14, 0, 0);
const saleEnd = jstToUtcMs(2026, 8, 26, 0, 0);
assert(saleStart === Date.parse('2026-09-13T15:00:00.000Z'), `saleStart=${new Date(saleStart).toISOString()}`);
assert(saleEnd === Date.parse('2026-09-25T15:00:00.000Z'), `saleEnd=${new Date(saleEnd).toISOString()}`);

console.log('week logic OK', {
  weekId: weekIdFromStart(start),
  acceptingNow: isAccepting(Date.now(), weekStartUtc()),
  saleWindow: { start: new Date(saleStart).toISOString(), end: new Date(saleEnd).toISOString() },
});
