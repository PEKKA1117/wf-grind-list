// 匯入：自動分辨本頁的匯出檔、DE 的 profile JSON，以及含 subsumed／progress 的進度檔。
// 後兩種先轉成 Progress 再轉成 Marks，最後一律經過 cleanMarks 的白名單，帳號資料沒有欄位可留
import type { Item } from "./data.ts";
import { cleanMarks, FORMAT, parseExport, SaveError, type Known, type Marks } from "./save.ts";

export const SYND_TAGS: Record<string, string> = {
  SteelMeridianSyndicate: "SteelMeridian", ArbitersSyndicate: "Arbiters", CephalonSudaSyndicate: "Suda", PerrinSyndicate: "Perrin", RedVeilSyndicate: "RedVeil", NewLokaSyndicate: "NewLoka",
  ConclaveSyndicate: "Conclave", CetusSyndicate: "Ostron", QuillsSyndicate: "Quills", SolarisSyndicate: "Solaris", VoxSyndicate: "Vox", VentKidsSyndicate: "Ventkids", EntratiSyndicate: "Entrati",
  NecraloidSyndicate: "Necraloid", ZarimanSyndicate: "Holdfasts", KahlSyndicate: "Kahl", EntratiLabSyndicate: "Cavia", HexSyndicate: "Hex", NightcapJournalSyndicate: "Nightcap",
};
export const SKILL_TAGS: Record<string, string> = {
  LPS_TACTICAL: "railjack-Tactical", LPS_PILOTING: "railjack-Piloting", LPS_GUNNERY: "railjack-Gunnery", LPS_ENGINEERING: "railjack-Engineering", LPS_COMMAND: "railjack-Command",
  LPS_DRIFT_COMBAT: "drifter-Combat", LPS_DRIFT_RIDING: "drifter-Riding", LPS_DRIFT_OPPORTUNITY: "drifter-Opportunity", LPS_DRIFT_ENDURANCE: "drifter-Endurance",
};
const PLEXUS = "/Lotus/Types/Game/CrewShip/RailJack/DefaultHarness";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const rows = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);

interface Progress { xp: Map<string, number>; nodes: Map<string, 1 | 2>; synd: Map<string, number>; skills: Map<string, number> }
export interface Imported { kind: "own" | "profile" | "progress"; marks: Marks; dropped: number; hadProgress: boolean }

// 累積經驗 → 等級：武器 500×r²、戰甲與同伴 1000×r²，是每級點數的 5 倍
export const levelOf = (i: Pick<Item, "max" | "pts">, xp: number): number => Math.min(i.max, Math.floor(Math.sqrt(Math.max(0, xp) / (i.pts * 5))));

function readProfile(p: Obj, inv: Obj): Progress {
  const out: Progress = { xp: new Map(), nodes: new Map(), synd: new Map(), skills: new Map() };
  for (const r of rows(inv.XPInfo)) if (typeof r.ItemType === "string") out.xp.set(r.ItemType, Math.max(out.xp.get(r.ItemType) ?? 0, num(r.XP)));
  for (const r of rows(p.Missions)) {
    const tag = r.Tag ?? r.type;
    if (typeof tag === "string" && (num(r.Completes) > 0 || num(r.Tier) > 0)) out.nodes.set(tag, num(r.Tier) > 0 ? 2 : 1);
  }
  for (const r of rows(p.Affiliations)) if (typeof r.Tag === "string") out.synd.set(r.Tag, num(r.Title));
  if (isObj(p.PlayerSkills)) for (const [k, v] of Object.entries(p.PlayerSkills)) out.skills.set(k, num(v));
  return out;
}
function readProgress(v: unknown): Progress {
  if (!isObj(v) || !isObj(v.xp) || !isObj(v.nodes) || !isObj(v.synd) || !isObj(v.skills)) throw new SaveError("檔案裡的進度格式不對，可能壞了。");
  const out: Progress = { xp: new Map(), nodes: new Map(), synd: new Map(), skills: new Map() };
  for (const [k, x] of Object.entries(v.xp)) out.xp.set(k, num(x));
  for (const [k, x] of Object.entries(v.nodes)) if (isObj(x) && (num(x.n) > 0 || x.sp === true)) out.nodes.set(k, x.sp === true ? 2 : 1);
  for (const [k, x] of Object.entries(v.synd)) if (isObj(x)) out.synd.set(k, num(x.title));
  for (const [k, x] of Object.entries(v.skills)) out.skills.set(k, num(x));
  return out;
}
const own = (o: Record<string, string>, k: string): string | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);

// 進度以檔案為準；Helminth 與略過沿用傳入的
function apply(p: Progress, items: Item[], base: Marks, known: Known): Marks {
  const done: string[] = [], levels: Obj = {}, nodes: Obj = {}, ranks: Obj = {};
  const owned = new Set<string>();
  for (const i of items) {
    const xp = p.xp.get(i.id === "plexus" ? PLEXUS : i.id);
    if (xp === undefined) continue;
    owned.add(`gear:${i.id}`);
    const lv = levelOf(i, xp);
    if (lv >= i.max) done.push(i.id); else if (lv > 0) levels[i.id] = lv;
  }
  for (const [k, v] of p.nodes) if (known.nodes.has(k)) nodes[k] = v;
  for (const [tags, src] of [[SYND_TAGS, p.synd], [SKILL_TAGS, p.skills]] as const)
    for (const [k, v] of src) { const id = own(tags, k); if (id && v > 0) ranks[id] = Math.floor(v); }
  const founders = new Set(items.filter(i => i.founder).map(i => `gear:${i.id}`));
  const skip = base.skip.filter(k => !(founders.has(k) && owned.has(k)));   // 持有創始人裝備就不再略過
  return cleanMarks({ done, levels, nodes, ranks, fed: base.fed, skip }, known).marks;
}

function readProgressFile(j: Obj, known: Known, items: Item[], cur: Marks): Imported {
  if (j.version !== 1) throw new SaveError("檔案的版本不對。");
  if (!Array.isArray(j.subsumed) || !Array.isArray(j.skip)) throw new SaveError("檔案缺少欄位，可能壞了。");
  const progress = j.progress == null ? null : readProgress(j.progress);
  // 這種檔案的略過 key 沒有分類，只有 Helminth 帶 h:
  const key = (k: unknown): unknown => {
    if (typeof k !== "string") return k;
    if (k.startsWith("h:")) return `helminth:${k.slice(2)}`;
    const s = own(SYND_TAGS, k), r = own(SKILL_TAGS, k), id = k === PLEXUS ? "plexus" : k;
    return s ? `synd:${s}` : r ? `skills:${r}` : known.nodes.has(id) ? `nodes:${id}` : `gear:${id}`;
  };
  // 這種檔案的略過清單不含創始人裝備，這裡補上
  const founders = items.filter(i => i.founder).map(i => `gear:${i.id}`);
  const c = cleanMarks({ fed: j.subsumed, skip: [...j.skip.map(key), ...founders] }, known);
  const base: Marks = { ...cur, fed: c.marks.fed, skip: c.marks.skip };
  return { kind: "progress", marks: progress ? apply(progress, items, base, known) : base, dropped: c.dropped, hadProgress: progress !== null };
}

// 瀏覽器「另存完整網頁」會把 JSON 包進 HTML，取出最外層的大括號
function unwrap(text: string): string {
  const t = text.replace(/^\uFEFF/, "").trim();
  if (!t.startsWith("<")) return t;
  const at = t.search(/\{\s*(?:"|&quot;)/), end = t.lastIndexOf("}");
  if (at < 0 || end < at) return t;
  return t.slice(at, end + 1).replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

export function readImport(text: string, known: Known, items: Item[], cur: Marks): Imported {
  const body = unwrap(text);
  if (!body) throw new SaveError("內容是空的。");
  if (/^Could not find requested account/i.test(body)) throw new SaveError("伺服器回覆找不到這個帳號，這不是 profile 資料。");
  let j: unknown;
  try { j = JSON.parse(body); } catch { throw new SaveError("不是完整的 JSON，檔案可能壞了或沒有全選複製。"); }
  if (isObj(j)) {
    if (j.format === FORMAT) return { kind: "own", ...parseExport(body, known), hadProgress: true };
    if ("subsumed" in j && "skip" in j && "progress" in j) return readProgressFile(j, known, items, cur);
    if (Array.isArray(j.Results) && j.Results.length === 0) throw new SaveError("Results 是空的：找不到這個帳號。");
    const p = Array.isArray(j.Results) ? j.Results[0] : j;
    if (isObj(p) && isObj(p.LoadOutInventory) && Array.isArray(p.LoadOutInventory.XPInfo))
      return { kind: "profile", marks: apply(readProfile(p, p.LoadOutInventory), items, cur, known), dropped: 0, hadProgress: true };
    if (Array.isArray(j.XPInfo)) throw new SaveError("這看起來是 inventory 檔，這頁不讀 inventory。");
  }
  throw new SaveError("認不出這個檔案。可以匯入這頁的匯出檔，或 DE 的 profile JSON。");
}
