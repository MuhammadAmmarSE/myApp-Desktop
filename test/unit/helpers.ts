// Records for tests, built like the app builds them.
import type { Kind, KindData, Rec } from "@myapp/core";

let n = 0;
export function rec<K extends Kind>(kind: K, data: KindData[K], over: Partial<Rec<K>> = {}): Rec<K> {
  n += 1;
  return { id: `test-${kind}-${n}`, kind, data, created_at: 1000 + n, updated_at: 1000 + n, deleted: 0, ...over } as Rec<K>;
}
export const lists = () => ({ event: [], reminder: [], todo: [], date: [], person: [], car: [], car_log: [], thing: [] }) as {
  event: Rec<"event">[];
  reminder: Rec<"reminder">[];
  todo: Rec<"todo">[];
  date: Rec<"date">[];
  person: Rec<"person">[];
  car: Rec<"car">[];
  car_log: Rec<"car_log">[];
  thing: Rec<"thing">[];
};
