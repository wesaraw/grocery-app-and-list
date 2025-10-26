import { formatDateLabel, toLocalDateFromIso } from '../utils/dateLabel.js';

const dayOfMonth = formatDateLabel('2025-10-26', date => date.getDate());
if (dayOfMonth !== 26) {
  throw new Error(`Expected local day 26 but received ${dayOfMonth}`);
}

const utcDay = formatDateLabel('2025-10-26T12:00:00Z', date => date.getUTCDate());
if (utcDay !== 26) {
  throw new Error(`Expected UTC day 26 for timestamp but received ${utcDay}`);
}

const cloned = toLocalDateFromIso(new Date('2025-10-26T00:00:00'));
if (!(cloned instanceof Date) || Number.isNaN(cloned.getTime())) {
  throw new Error('Expected to receive a valid Date instance for Date input');
}

if (formatDateLabel('invalid-date') !== null) {
  throw new Error('Expected invalid date strings to return null');
}

console.log('prepWindowDateFormatTest passed');
