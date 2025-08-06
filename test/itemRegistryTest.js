import 'fake-indexeddb/auto';
import { db } from '../db.js';
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

async function run() {
  await db.items.clear();
  await db.lists.clear();
  const appleId = await getItemId('Apple');
  if (appleId !== '1') throw new Error(`Expected Apple id 1 but got ${appleId}`);
  const storedApple = await db.items.get(appleId);
  if (!storedApple || storedApple.name !== 'Apple') throw new Error('Apple not persisted');
  const bananaId = await getItemId('Banana');
  if (bananaId !== '2') throw new Error(`Expected Banana id 2 but got ${bananaId}`);
  const name1 = await getItemName('1');
  if (name1 !== 'Apple') throw new Error(`Name for id 1 expected Apple got ${name1}`);

  const arr = [{ name: 'Apple' }, { name: 'Banana' }];
  const arrIds = await convertArrayToIds(arr);
  if (arrIds[0].id !== '1' || arrIds[1].id !== '2') throw new Error('convertArrayToIds failed');
  if ('name' in arrIds[0] || 'unit' in arrIds[0]) throw new Error('name/unit not removed');
  const arrNames = await convertArrayToNames(arrIds);
  if (arrNames[0].name !== 'Apple' || arrNames[1].name !== 'Banana') throw new Error('convertArrayToNames failed');

  const arrWithId = [{ id: '1', name: 'Apple', unit: 'lb' }];
  const arrIds2 = await convertArrayToIds(arrWithId);
  if (arrIds2[0].id !== '1' || 'name' in arrIds2[0] || 'unit' in arrIds2[0]) {
    throw new Error('convertArrayToIds did not strip existing name/unit');
  }

  const obj = { Apple: 5, Banana: 7 };
  const objIds = await convertObjectKeysToIds(obj);
  if (objIds['1'] !== 5 || objIds['2'] !== 7) throw new Error('convertObjectKeysToIds failed');
  const objNames = await convertObjectKeysToNames(objIds);
  if (objNames.Apple !== 5 || objNames.Banana !== 7) throw new Error('convertObjectKeysToNames failed');

  await saveArray('arrKey', arrWithId);
  const rawArr = await db.lists.get('arrKey');
  if (rawArr.value[0].id !== '1' || 'name' in rawArr.value[0] || 'unit' in rawArr.value[0]) {
    throw new Error('saveArray stored name/unit');
  }
  await saveObject('objKey', obj);

  await renameItemInRegistry('Apple', 'Gala Apple');
  const renamed = await getItemName('1');
  if (renamed !== 'Gala Apple') throw new Error('renameItemInRegistry failed');
  const storedRenamed = await db.items.get('1');
  if (!storedRenamed || storedRenamed.name !== 'Gala Apple') {
    throw new Error('Renamed item not persisted');
  }

  const loadedArr = await loadArray('arrKey');
  if (loadedArr[0].name !== 'Gala Apple') throw new Error('loadArray failed');
  if ('unit' in loadedArr[0]) throw new Error('loadArray returned unit');
  const loadedObj = await loadObject('objKey');
  if (loadedObj['Gala Apple'] !== 5 || loadedObj['Banana'] !== 7) throw new Error('loadObject failed');

  console.log('itemRegistry tests passed');
}

await run();
