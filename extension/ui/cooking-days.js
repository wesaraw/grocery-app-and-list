import { get, set } from '../services/storageService.js';

const daysFull = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
let config = { categories: {}, prepDay: null, version: 1 };

async function load() {
  const stored = await get('cooking-days');
  if (stored && typeof stored === 'object') config = stored;
  render();
}

function render() {
  const container = document.getElementById('days');
  container.innerHTML = '';
  const defaultCats = ['Breakfast', 'Lunch', 'Dinner'];
  const cats = Array.from(new Set([...defaultCats, ...Object.keys(config.categories)]));
  cats.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'category';
    const label = document.createElement('span');
    label.textContent = `${cat}: `;
    div.appendChild(label);
    if (!Array.isArray(config.categories[cat])) config.categories[cat] = [];
    daysFull.forEach(day => {
      const lbl = document.createElement('label');
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = config.categories[cat].includes(day);
      chk.addEventListener('change', async () => {
        let arr = config.categories[cat];
        if (chk.checked) {
          if (!arr.includes(day)) arr.push(day);
        } else {
          arr = arr.filter(d => d !== day);
        }
        config.categories[cat] = arr;
        await set('cooking-days', config);
      });
      lbl.appendChild(chk);
      lbl.appendChild(document.createTextNode(day.slice(0,3)));
      div.appendChild(lbl);
    });
    container.appendChild(div);
  });

  const prep = document.getElementById('prepDay');
  prep.innerHTML = '';
  const prepLabel = document.createElement('span');
  prepLabel.textContent = 'Prep Ahead Day: ';
  prep.appendChild(prepLabel);
  daysFull.forEach(day => {
    const lbl = document.createElement('label');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = config.prepDay === day;
    chk.addEventListener('change', async () => {
      if (chk.checked) {
        config.prepDay = day;
        prep.querySelectorAll('input').forEach(i => { if (i !== chk) i.checked = false; });
      } else if (config.prepDay === day) {
        config.prepDay = null;
      }
      await set('cooking-days', config);
    });
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode(day.slice(0,3)));
    prep.appendChild(lbl);
  });
}

load();
