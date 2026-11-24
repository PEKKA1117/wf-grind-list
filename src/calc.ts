// 剩餘段位經驗與完成判定
import type { Item, Node } from "./data.ts";

export const itemXp = (i: Pick<Item, "max" | "pts">, level = 0): number => (i.max - level) * i.pts;

export interface NodeState { normal: boolean; sp: boolean; left: number; done: boolean }
// 一般與鋼韌之道首通各給一次同額段位經驗；spOpt 不列入鋼韌之道的完成條件
export function nodeState(n: Pick<Node, "xp" | "spOpt">, mark: 1 | 2 | undefined, steel: boolean): NodeState {
  const normal = mark !== undefined, sp = mark === 2;
  return { normal, sp, left: (normal ? 0 : n.xp) + (!steel || sp ? 0 : n.xp), done: normal && (!steel || sp || n.spOpt === true) };
}
// 點一般或鋼韌的標籤。鋼韌要先通一般，所以勾鋼韌會連帶勾一般，取消一般會連帶取消鋼韌
export function toggleNode(mark: 1 | 2 | undefined, which: "normal" | "sp"): 1 | 2 | undefined {
  if (which === "normal") return mark === undefined ? 1 : undefined;
  return mark === 2 ? 1 : 2;
}
