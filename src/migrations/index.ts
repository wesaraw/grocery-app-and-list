import { Item } from '../models/index';

export type Migration<T> = (entity: T) => T;

export function v1ToV2(item: Item): Item {
  return { ...item, version: 2 };
}

export const migrations: Record<number, Migration<any>> = {
  1: v1ToV2,
};

export function runMigrations<T extends { version: number }>(entity: T): T {
  let current: any = { ...entity };
  while (migrations[current.version]) {
    current = migrations[current.version](current);
  }
  return current;
}
