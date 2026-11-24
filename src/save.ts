// 紀錄的資料、匯出檔格式與驗證。匯入檔當成不可信的輸入：逐欄驗型別，只收認得的 ID
export interface Marks {
  done: string[];                  // 練滿的裝備
  levels: Record<string, number>;  // 還沒滿的裝備等級，只有匯入 profile 才有
  nodes: Record<string, 1 | 2>;    // 1 = 一般通過，2 = 鋼韌之道也通過
  ranks: Record<string, number>;   // 集團段位、內蘊等級
  fed: string[];                   // 已餵給 Helminth
  skip: string[];                  // 不打算刷，不算進總數；key 前面帶分類
}
export interface Known {
  done: ReadonlySet<string>; levels: ReadonlyMap<string, number>; nodes: ReadonlySet<string>; ranks: ReadonlyMap<string, number>; fed: ReadonlySet<string>; skip: ReadonlySet<string>;
}
export class SaveError extends Error {}
export const FORMAT = "wf-grind-list";
const VERSION = 1;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
export const emptyMarks = (): Marks => ({ done: [], levels: Object.create(null), nodes: Object.create(null), ranks: Object.create(null), fed: [], skip: [] });

export function cleanMarks(v: unknown, known: Known): { marks: Marks; dropped: number } {
  const out = emptyMarks(), o = isObj(v) ? v : {};
  let dropped = 0;
  const pick = (xs: unknown, ok: ReadonlySet<string>): string[] => {
    const uniq = [...new Set(Array.isArray(xs) ? xs : [])], keep = uniq.filter((x): x is string => typeof x === "string" && ok.has(x));
    dropped += uniq.length - keep.length;
    return keep;
  };
  out.done = pick(o.done, known.done); out.fed = pick(o.fed, known.fed); out.skip = pick(o.skip, known.skip);
  // 已滿的不留等級；等級要在 1 到上限之間
  for (const [k, x] of Object.entries(isObj(o.levels) ? o.levels : {})) {
    const max = known.levels.get(k);
    if (max !== undefined && typeof x === "number" && Number.isInteger(x) && x > 0 && x < max && !out.done.includes(k)) out.levels[k] = x; else dropped++;
  }
  for (const [k, x] of Object.entries(isObj(o.nodes) ? o.nodes : {})) if (known.nodes.has(k) && (x === 1 || x === 2)) out.nodes[k] = x; else dropped++;
  for (const [k, x] of Object.entries(isObj(o.ranks) ? o.ranks : {})) {
    const max = known.ranks.get(k);
    if (max !== undefined && typeof x === "number" && Number.isInteger(x) && x > 0) out.ranks[k] = Math.min(x, max); else dropped++;
  }
  return { marks: out, dropped };
}

export const makeExport = (m: Marks, now: number): object => ({ format: FORMAT, version: VERSION, exportedAt: new Date(now).toISOString(), marks: m });

export function parseExport(text: string, known: Known): { marks: Marks; dropped: number } {
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new SaveError("不是完整的 JSON，檔案可能壞了或沒有全選複製。"); }
  if (!isObj(j) || j.format !== FORMAT) throw new SaveError("這不是本頁匯出的檔案。這頁只讀自己匯出的檔案。");
  if (!Number.isInteger(j.version) || (j.version as number) < 1) throw new SaveError("匯出檔的版本欄位不對，檔案可能壞了。");
  if ((j.version as number) > VERSION) throw new SaveError("這個檔案是較新版的頁面匯出的，請先更新頁面。");
  const m = j.marks;
  if (!isObj(m) || !Array.isArray(m.done) || (m.levels !== undefined && !isObj(m.levels)) || !isObj(m.nodes) || !isObj(m.ranks) || !Array.isArray(m.fed) || !Array.isArray(m.skip))
    throw new SaveError("匯出檔缺少欄位，檔案可能壞了。");
  return cleanMarks(m, known);
}
