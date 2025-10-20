import { resolveNextPrepWindow } from '../utils/calendarUtils.js';

const { prepDays: normalized, endDate: firstEnd } = resolveNextPrepWindow(
  { prepDay: ['thursday', 'monday'] },
  '2025-03-06'
);

if (!Array.isArray(normalized) || normalized.length !== 2) {
  throw new Error(`Expected two normalized prep days but received ${JSON.stringify(normalized)}`);
}
if (normalized[0] !== 'Monday' || normalized[1] !== 'Thursday') {
  throw new Error(`Expected normalized days Monday/Thursday but got ${JSON.stringify(normalized)}`);
}
if (firstEnd !== '2025-03-10') {
  throw new Error(`Expected next prep date 2025-03-10 but received ${firstEnd}`);
}

const sameDay = resolveNextPrepWindow({ prepDay: ['Monday'] }, '2025-03-03');
if (sameDay.endDate !== '2025-03-10') {
  throw new Error(`Expected exclusive next Monday but received ${sameDay.endDate}`);
}

const missing = resolveNextPrepWindow({}, '2025-03-03');
if (missing.endDate !== null || (Array.isArray(missing.prepDays) && missing.prepDays.length !== 0)) {
  throw new Error('Expected no prep window when prep days missing');
}

console.log('nextPrepWindowHelperTest passed');
