import { weekStartUtc, receptionEndUtc, isAccepting, weekIdFromStart } from './src/index.js';

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

console.log('week logic OK', {
  weekId: weekIdFromStart(start),
  acceptingNow: isAccepting(Date.now(), weekStartUtc()),
});
