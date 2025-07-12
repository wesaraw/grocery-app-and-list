import { strict as assert } from 'assert';
import { convertVolumeToOunces, setDensityRatio, loadDensityData } from '../utils/densityUtils.js';
import { initUomTable } from '../utils/uomConverter.js';
import fs from 'fs';

// stub chrome.storage for tests
global.chrome = {
  runtime: {
    getURL: p => p
  },
  storage: {
    local: {
      _data: {},
      get(key, cb) { cb(this._data); },
      set(obj, cb) { this._data = { ...this._data, ...obj }; cb(); }
    }
  }
};

global.fetch = async url => ({
  json: async () => JSON.parse(fs.readFileSync(url, 'utf8'))
});

(async () => {
  await initUomTable();
  // set density for whole milk
  await setDensityRatio({ itemName: 'whole milk', store: 'Walmart', measuredWeightG: 248.4 });
  const data = await loadDensityData();
  assert.equal(data.length, 1);
  const weight = await convertVolumeToOunces(32, 'fl oz', 'whole milk', 'Walmart');
  // expected approx 34.56 oz from instructions
  assert.ok(Math.abs(weight - 34.56) < 0.2);
  console.log('density utils ok');
})();
