import { weekStartUtc, receptionEndUtc, isAccepting, weekIdFromStart, deliveryFor } from './src/index.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function jstToUtcMs(y, mo, d, h, mi = 0) {
  return Date.UTC(y, mo, d, h - 9, mi, 0, 0);
}

// 受付枠: 2026-09-10(木) 10:00 〜 2026-09-16(水) 10:00 JST
const thuOpen = jstToUtcMs(2026, 8, 10, 10, 0);
const wedAlmostClose = jstToUtcMs(2026, 8, 16, 9, 59);
const wedClosed = jstToUtcMs(2026, 8, 16, 10, 0);
const gapBeforeNext = jstToUtcMs(2026, 8, 17, 9, 59); // 木10:00前＝閉鎖
const nextThuOpen = jstToUtcMs(2026, 8, 17, 10, 0);

const start = weekStartUtc(thuOpen);
assert(weekIdFromStart(start) === '2026-09-10', `weekId=${weekIdFromStart(start)}`);
assert(isAccepting(thuOpen, start), 'Thu 10:00 should be accepting');
assert(isAccepting(wedAlmostClose, weekStartUtc(wedAlmostClose)), 'Wed 09:59 should be accepting');
assert(!isAccepting(wedClosed, weekStartUtc(wedClosed)), 'Wed 10:00 should be closed');
assert(!isAccepting(gapBeforeNext, weekStartUtc(gapBeforeNext)), 'Thu 09:59 gap should be closed');
assert(isAccepting(nextThuOpen, weekStartUtc(nextThuOpen)), 'next Thu 10:00 should be accepting');

const end = receptionEndUtc(start);
assert(end === wedClosed, `end=${new Date(end).toISOString()} expected=${new Date(wedClosed).toISOString()}`);

// 配送: 上限未満=木曜日 / 上限以上=さらに次の週の木曜日
assert(deliveryFor(thuOpen, 0).slot === 'cycle_thursday', 'under cap');
assert(deliveryFor(thuOpen, 0).nextWeek === false, 'under cap nextWeek');
assert(deliveryFor(thuOpen, 10).slot === 'following_thursday', 'over cap');
assert(deliveryFor(thuOpen, 10).label.includes('さらに次の週'), 'over cap label');

console.log('week logic OK', {
  weekId: weekIdFromStart(start),
  acceptingNow: isAccepting(Date.now(), weekStartUtc()),
  reception: {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  },
});
