import {
  getItemId,
  getItemName,
  renameItemInRegistry,
  convertArrayToIds,
  convertArrayToNames,
  convertObjectKeysToIds,
  convertObjectKeysToNames,
  saveArray,
  loadArray,
  saveObject,
  loadObject
} from '../utils/itemRegistry.js';

const storage = {};

global.chrome = {
  storage: {
    local: {
      get: (key, cb) => {
        if (key == null) return cb({ ...storage });
        if (typeof key === 'string') return cb({ [key]: storage[key] });
        if (Array.isArray(key)) {
          const res = {};
          for (const k of key) res[k] = storage[k];
          return cb(res);
        }
        cb({});
      },
      set: (obj, cb) => {
        Object.assign(storage, obj);
        cb && cb();
      },
      remove: (keys, cb) => {
        if (Array.isArray(keys)) {
          for (const k of keys) delete storage[k];
        } else {
          delete storage[keys];
        }
        cb && cb();
      }
    }
  }
};

async function run() {
  const appleId = await getItemId('Apple');
  if (appleId !== '1') throw new Error(`Expected Apple id 1 but got ${appleId}`);
  const bananaId = await getItemId('Banana');
  if (bananaId !== '2') throw new Error(`Expected Banana id 2 but got ${bananaId}`);
  const name1 = await getItemName('1');
  if (name1 !== 'Apple') throw new Error(`Name for id 1 expected Apple got ${name1}`);

  const arr = [{ name: 'Apple' }, { name: 'Banana' }];
  const arrIds = await convertArrayToIds(arr);
  if (arrIds[0].id !== '1' || arrIds[1].id !== '2') throw new Error('convertArrayToIds failed');
  const arrNames = await convertArrayToNames(arrIds);
  if (arrNames[0].name !== 'Apple' || arrNames[1].name !== 'Banana') throw new Error('convertArrayToNames failed');

  const obj = { Apple: 5, Banana: 7 };
  const objIds = await convertObjectKeysToIds(obj);
  if (objIds['1'] !== 5 || objIds['2'] !== 7) throw new Error('convertObjectKeysToIds failed');
  const objNames = await convertObjectKeysToNames(objIds);
  if (objNames.Apple !== 5 || objNames.Banana !== 7) throw new Error('convertObjectKeysToNames failed');

  await saveArray('arrKey', arr);
  await saveObject('objKey', obj);

  await renameItemInRegistry('Apple', 'Gala Apple');
  const renamed = await getItemName('1');
  if (renamed !== 'Gala Apple') throw new Error('renameItemInRegistry failed');

  const loadedArr = await loadArray('arrKey');
  if (loadedArr[0].name !== 'Gala Apple' || loadedArr[1].name !== 'Banana') throw new Error('loadArray failed');
  const loadedObj = await loadObject('objKey');
  if (loadedObj['Gala Apple'] !== 5 || loadedObj['Banana'] !== 7) throw new Error('loadObject failed');

  console.log('itemRegistry tests passed');
}

await run();
