import { sortItemsByCategory } from '../utils/sortByCategory.js';

const items = [
  { category: 'Fruit', name: 'Apple' },
  { category: 'Vegetable' },
  { name: 'Banana' },
  {}
];

const sorted = sortItemsByCategory(items);

if (items[1].name !== 'Missing 1' || items[1].category !== 'Vegetable') {
  throw new Error('Missing name not assigned');
}
if (items[2].category !== 'Missing') {
  throw new Error('Missing category not assigned');
}
if (items[3].name !== 'Missing 2' || items[3].category !== 'Missing') {
  throw new Error('Missing defaults not applied');
}
if (sorted[0].name !== 'Apple') {
  throw new Error('Expected Apple first after sorting');
}
if (sorted[1].name !== 'Banana') {
  throw new Error('Expected Banana second after sorting');
}
if (sorted[3].name !== 'Missing 1') {
  throw new Error('Expected Vegetable category last after sorting');
}

console.log('sortByCategory defaults test passed');
