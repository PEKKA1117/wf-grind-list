// 進入點：畫面渲染與事件。所有文字一律用 textContent，不拼 HTML
import { DATA, type Cat, type Item } from "./data.ts";
import { itemXp, nodeState, toggleNode } from "./calc.ts";
import { readImport } from "./import.ts";
import { setTheme, showTheme, type Theme } from "./theme.ts";
import { cleanMarks, emptyMarks, makeExport, SaveError, type Known, type Marks } from "./save.ts";

type Tab = "gear" | "nodes" | "synd" | "skills" | "helminth";
const KEY = "wf-grind-list";
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const fmt = (n: number): string => n.toLocaleString("en-US");
type Child = Node | string | null | false;
function h(tag: string, attrs: Record<string, string | boolean> = {}, ...kids: Child[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v === true) e.setAttribute(k, ""); else if (v !== false) e.setAttribute(k, v);
  for (const k of kids) if (k) e.append(k);
  return e;
}

const CATS: [Cat, string][] = [["frame", "戰甲"], ["primary", "主要武器"], ["secondary", "次要武器"], ["melee", "近戰"], ["companion", "同伴"],
  ["robotic", "同伴武器"], ["zaw", "Zaw"], ["kitgun", "組合槍"], ["amp", "增幅器"], ["kdrive", "K 式懸浮板"], ["archwing", "Archwing"],
  ["archgun", "Archwing 槍械"], ["archmelee", "Archwing 近戰"], ["mech", "亡骸機甲"], ["plexus", "銳捷號配設"]];
const TABS: [Tab, string][] = [["gear", "裝備"], ["nodes", "星圖"], ["synd", "集團"], ["skills", "內蘊"], ["helminth", "Helminth"]];
const NOTES: Record<Tab, string> = {
  gear: "練到滿級就勾，匯入 profile 的話會帶入目前等級，練過的排前面。+N 是練滿能拿的段位經驗，40 級裝備的 31–40 級也算。創始人限定的三件預設略過。",
  nodes: "點「一般」「鋼韌」標記通過。+N 是首通還能拿的段位經驗，一般與鋼韌之道各給一次；銳捷號兩邊都沒有。",
  synd: "用 −／+ 調到目前段位。六大集團互相敵對，不打算刷的按「略過」。",
  skills: "用 −／+ 調到目前等級，每級 1,500 段位經驗。",
  helminth: "只列非 Prime、非 Umbra 的戰甲，新戰甲上線首日就能吞噬。",
};

// ---------- 狀態 ----------
const FOUNDERS = DATA.items.filter(i => i.founder).map(i => `gear:${i.id}`);
const KNOWN: Known = {
  done: new Set(DATA.items.map(x => x.id)),
  levels: new Map(DATA.items.map(x => [x.id, x.max])),
  nodes: new Set(DATA.nodes.map(x => x.id)),
  ranks: new Map([...DATA.synd, ...DATA.skills].map(x => [x.id, x.max])),
  fed: new Set(DATA.helminth.map(x => x.id)),
  skip: new Set([...DATA.items.map(x => `gear:${x.id}`), ...DATA.nodes.map(x => `nodes:${x.id}`), ...DATA.synd.map(x => `synd:${x.id}`),
    ...DATA.skills.map(x => `skills:${x.id}`), ...DATA.helminth.map(x => `helminth:${x.id}`)]),
};
interface Ui { tab: Tab; onlyLeft: boolean; steel: boolean; xpOnly: boolean }
let marks: Marks = { ...emptyMarks(), skip: [...FOUNDERS] };
const ui: Ui = { tab: "gear", onlyLeft: true, steel: true, xpOnly: false };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const s = JSON.parse(raw) as { marks?: unknown; ui?: Partial<Ui> };
    marks = cleanMarks(s.marks, KNOWN).marks;
    const u = s.ui ?? {};
    if (TABS.some(([t]) => t === u.tab)) ui.tab = u.tab as Tab;
    ui.onlyLeft = u.onlyLeft !== false; ui.steel = u.steel !== false; ui.xpOnly = u.xpOnly === true;
  }
} catch { /* 壞掉或被擋就從空的開始 */ }
let undo: Marks | null = null;   // 批次勾選或匯入前的狀態；之後再動手改就失效
let q = "", chip = "";

const say = (text: string, bad = false): void => { const m = $("msg"); m.className = bad ? "msg small bad" : "msg small"; m.textContent = text; };
function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify({ marks, ui })); } catch { say("瀏覽器拒絕存檔，重新整理後會遺失，請先匯出。", true); }
}
const copy = (): Marks => structuredClone({ ...marks, levels: { ...marks.levels }, nodes: { ...marks.nodes }, ranks: { ...marks.ranks } });
// 單項修改：復原只給批次與匯入用，動手改之後就收起來
function edit(f: () => void): void { undo = null; say(""); f(); persist(); render(); }
function bulk(text: string, f: () => void): void { const before = copy(); f(); undo = before; say(text); persist(); render(); }
const toggle = (xs: string[], id: string): string[] => (xs.includes(id) ? xs.filter(x => x !== id) : [...xs, id]);

// ---------- 每個分頁的資料 ----------
interface Row { key: string; id: string; zh: string; en: string; done: boolean; meta: Child[]; lead?: HTMLElement; rank?: [number, number]; right: string; wiki?: string }
interface Group { id: string; title: string; rows: Row[]; left: number; total: number; bulk: HTMLElement[] }
const skipped = (tab: Tab, id: string): boolean => marks.skip.includes(`${tab}:${id}`);
const nodes = (): typeof DATA.nodes => ui.xpOnly ? DATA.nodes.filter(n => n.xp > 0) : DATA.nodes;
const systems = (): string[] => [...new Set(nodes().map(n => n.sys))];
const rankOf = (id: string): number => marks.ranks[id] ?? 0;
const box = (act: string, id: string, on: boolean, label: string): HTMLElement => {
  const b = h("input", { type: "checkbox", "data-act": act, "data-id": id, "aria-label": label }) as HTMLInputElement;
  b.checked = on;
  return b;
};
const tag = (text: string): HTMLElement => h("span", { class: "tag" }, text);
const pill = (id: string, which: "normal" | "sp", on: boolean, name: string): HTMLElement =>
  h("button", { type: "button", class: "pill", "data-node": id, "data-which": which, "aria-pressed": String(on), "aria-label": `${name} ${which === "sp" ? "鋼韌之道" : "一般"}` }, which === "sp" ? "鋼韌" : "一般");
const bulkBtn = (kind: string, group: string, text: string): HTMLElement => h("button", { type: "button", class: "link", "data-bulk": kind, "data-group": group }, text);

// 某分頁某組的項目 ID（不含略過）
function members(tab: Tab, group: string): string[] {
  const xs = tab === "gear" ? DATA.items.filter(i => i.cat === group) : tab === "nodes" ? nodes().filter(n => n.sys === group)
    : tab === "synd" ? DATA.synd : tab === "skills" ? DATA.skills.filter(s => s.group === group) : DATA.helminth;
  return xs.map(x => x.id).filter(id => !skipped(tab, id));
}
const spRequired = (ids: string[]): string[] => { const opt = new Set(DATA.nodes.filter(n => n.spOpt).map(n => n.id)); return ids.filter(id => !opt.has(id)); };

function isDone(tab: Tab, id: string): boolean {
  switch (tab) {
    case "gear": return marks.done.includes(id);
    case "nodes": return nodeState(NODE.get(id)!, marks.nodes[id], ui.steel).done;
    case "helminth": return marks.fed.includes(id);
    default: return rankOf(id) >= (KNOWN.ranks.get(id) ?? 0);
  }
}
const NODE = new Map(DATA.nodes.map(n => [n.id, n]));
const groupIds = (tab: Tab): [string, string][] =>
  tab === "gear" ? CATS : tab === "nodes" ? systems().map(s => [s, s]) : tab === "synd" ? [["all", "集團"]]
    : tab === "skills" ? [["railjack", "銳捷號"], ["drifter", "漂泊者"]] : [["all", "可吞噬的戰甲"]];
function tally(tab: Tab): { left: number; total: number } {
  const ids = groupIds(tab).flatMap(([g]) => members(tab, g));
  return { left: ids.filter(id => !isDone(tab, id)).length, total: ids.length };
}

function row(tab: Tab, id: string): Row {
  const done = isDone(tab, id), key = `${tab}:${id}`;
  if (tab === "gear") {
    const i = ITEM.get(id)!, lv = marks.levels[id] ?? 0;
    return { key, id, zh: i.zh, en: i.en, done, lead: box("done", id, done, i.zh), meta: [i.mr > 0 && tag(`段位 ${i.mr}`), lv > 0 ? h("span", { class: "tag on" }, `${lv}/${i.max}`) : i.max === 40 && tag("40 級")],
      right: done ? "已滿" : `+${fmt(itemXp(i, lv))}`, wiki: i.en };
  }
  if (tab === "nodes") {
    const n = NODE.get(id)!, s = nodeState(n, marks.nodes[id], ui.steel);
    return { key, id, zh: n.zh, en: n.en === n.zh ? n.sysEn : `${n.en} · ${n.sysEn}`, done,
      meta: [tag(n.mission), pill(id, "normal", s.normal, n.zh), ui.steel && !n.spOpt && pill(id, "sp", s.sp, n.zh)], right: done ? "完成" : s.left ? `+${fmt(s.left)}` : "" };
  }
  if (tab === "helminth") {
    const x = FRAME.get(id)!;
    return { key, id, zh: x.zh, en: x.en, done, lead: box("fed", id, done, x.zh), meta: [], right: "", wiki: x.en };
  }
  const x = RANKED.get(id)!, at = rankOf(id);
  return { key, id, zh: x.zh, en: x.en, done, meta: [], rank: [at, x.max], right: done ? "已滿" : tab === "skills" ? `+${fmt((x.max - at) * 1500)}` : "" };
}
const ITEM = new Map<string, Item>(DATA.items.map(i => [i.id, i]));
const FRAME = new Map(DATA.helminth.map(x => [x.id, x]));
const RANKED = new Map([...DATA.synd, ...DATA.skills].map(x => [x.id, x]));

function groups(): Group[] {
  const tab = ui.tab, out: Group[] = [];
  for (const [g, title] of groupIds(tab)) {
    if (chip && chip !== g) continue;
    const ids = members(tab, g), all = ids.map(id => row(tab, id));
    if (tab === "gear") all.sort((a, b) => Number(!!marks.levels[b.id]) - Number(!!marks.levels[a.id]));   // 穩定排序，其餘維持字母序
    const rows = all.filter(r => (!ui.onlyLeft || !r.done) && (!q || `${r.zh} ${r.en}`.toLowerCase().includes(q)));
    const bulks: HTMLElement[] = [];
    // 搜尋時不給批次，免得動到沒顯示的項目
    if (!q && ids.length) {
      if (tab === "gear") bulks.push(bulkBtn("gear", g, ids.every(id => marks.done.includes(id)) ? "全部取消" : "整類全滿"));
      if (tab === "nodes") {
        bulks.push(bulkBtn("normal", g, ids.every(id => marks.nodes[id]) ? "一般全部取消" : "一般全通"));
        const sp = spRequired(ids);
        if (ui.steel && sp.length) bulks.push(bulkBtn("sp", g, sp.every(id => marks.nodes[id] === 2) ? "鋼韌全部取消" : "鋼韌全通"));
      }
      if (tab === "synd" || tab === "skills") bulks.push(bulkBtn("rank", g, ids.every(id => isDone(tab, id)) ? "全部歸零" : "全部已滿"));
      if (tab === "helminth") bulks.push(bulkBtn("fed", g, ids.every(id => marks.fed.includes(id)) ? "全部取消" : "全部餵完"));
    }
    // 全部完成的組也要留著標題，才按得到取消
    if (rows.length || (!q && bulks.length && (chip === g || groupIds(tab).length === 1))) out.push({ id: g, title, rows, left: all.filter(r => !r.done).length, total: all.length, bulk: bulks });
  }
  return out;
}

// ---------- 渲染 ----------
function rowEl(r: Row): HTMLElement {
  const step = (d: number, text: string, off: boolean): HTMLElement =>
    h("button", { type: "button", class: "step", "data-step": String(d), "data-id": r.id, disabled: off, "aria-label": `${r.zh} ${d > 0 ? "加" : "減"} 1 級` }, text);
  return h("li", { class: `row${r.done ? " done" : ""}` },
    r.lead ?? null,
    h("div", { class: "name" }, h("b", {}, r.zh), r.en !== r.zh && h("span", { class: "en" }, r.en), ...r.meta),
    r.rank ? h("div", { class: "prog" }, step(-1, "−", r.rank[0] <= 0), meter(r.rank[0], r.rank[1]), h("span", { class: "num" }, `${r.rank[0]}/${r.rank[1]}`), step(1, "+", r.rank[0] >= r.rank[1])) : null,
    h("span", { class: "num right" }, r.right),
    r.wiki ? h("a", { href: `https://wiki.warframe.com/w/${encodeURIComponent(r.wiki.replaceAll(" ", "_"))}#Acquisition`, target: "_blank", rel: "noopener noreferrer", "aria-label": `${r.zh} 的取得方式（wiki）` }, "取得") : null,
    h("button", { type: "button", class: "link", "data-skip": r.key, "aria-label": `略過 ${r.zh}` }, "略過"));
}
function meter(a: number, b: number): HTMLElement {
  const fill = h("i");
  fill.style.width = `${b ? (a / b) * 100 : 0}%`;
  return h("span", { class: "meter", "aria-hidden": "true" }, fill);
}
function render(): void {
  // 重畫後把焦點還給同一個控制項，鍵盤操作才不會每按一次就跳回頁首
  const f = document.activeElement as HTMLElement | null;
  const sel = f && $("list").contains(f) ? ["act", "id", "node", "which", "step", "bulk", "group"].filter(k => f.dataset[k] !== undefined).map(k => `[data-${k}="${CSS.escape(f.dataset[k]!)}"]`).join("") : "";
  $("tabs").replaceChildren(...TABS.map(([id, label]) => {
    const t = tally(id);
    return h("button", { type: "button", "data-tab": id, "aria-pressed": String(ui.tab === id) }, h("span", {}, label), h("b", { class: "num" }, fmt(t.left)), h("small", { class: "num" }, `共 ${fmt(t.total)}`));
  }));
  const gs0 = groupIds(ui.tab);
  $("chips").replaceChildren(...(ui.tab === "gear" || ui.tab === "nodes" ? [["", "全部"] as [string, string], ...gs0] : []).map(([id, label]) =>
    h("button", { type: "button", "data-chip": id, "aria-pressed": String(chip === id) }, label)));
  $<HTMLInputElement>("only-left").checked = ui.onlyLeft;
  $<HTMLInputElement>("steel").checked = ui.steel;
  $<HTMLInputElement>("xp-only").checked = ui.xpOnly;
  $("steel-wrap").hidden = $("xp-wrap").hidden = ui.tab !== "nodes";
  $("note").textContent = NOTES[ui.tab];
  $("undo").hidden = !undo;

  const list: HTMLElement[] = [], gs = groups();
  if (!gs.some(g => g.rows.length)) list.push(h("p", { class: "empty" }, q ? "沒有符合的項目。" : "這裡都刷完了。"));
  for (const g of gs) list.push(h("section", {},
    h("div", { class: "g-head" }, h("h2", {}, g.title), h("span", { class: "bulk" }, ...g.bulk), h("span", { class: "num muted small" }, `剩 ${g.left} / ${g.total}`)),
    h("ul", { class: "rows" }, ...g.rows.map(rowEl))));
  const sk = marks.skip.filter(k => k.startsWith(`${ui.tab}:`));
  if (sk.length) list.push(h("details", { class: "skipped" }, h("summary", {}, `已略過 ${sk.length} 項`),
    h("ul", { class: "rows" }, ...sk.map(k => {
      const id = k.slice(ui.tab.length + 1), x = ITEM.get(id) ?? NODE.get(id) ?? RANKED.get(id) ?? FRAME.get(id)!;
      return h("li", { class: "row done" }, h("div", { class: "name" }, h("b", {}, x.zh), x.en !== x.zh && h("span", { class: "en" }, x.en)), h("button", { type: "button", class: "link", "data-unskip": k, "aria-label": `還原 ${x.zh}` }, "還原"));
    }))));
  $("list").replaceChildren(...list);
  if (sel) $("list").querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  $("foot").textContent = `資料 ${DATA.date}：DE Public Export 與 Warframe wiki。非官方工具，與 Digital Extremes 無關。`;
}

// ---------- 事件 ----------
function runBulk(kind: string, group: string): void {
  const tab = ui.tab, ids = members(tab, group), title = groupIds(tab).find(([g]) => g === group)?.[1] ?? "";
  if (kind === "gear") {
    const all = ids.every(id => marks.done.includes(id));
    bulk(`${title}：${all ? "已全部取消" : "已全部標為練滿"}。`, () => {
      marks.done = all ? marks.done.filter(x => !ids.includes(x)) : [...new Set([...marks.done, ...ids])];
      for (const id of ids) delete marks.levels[id];
    });
  } else if (kind === "fed") {
    const all = ids.every(id => marks.fed.includes(id));
    bulk(all ? "已全部取消。" : "已全部標為餵完。", () => { marks.fed = all ? marks.fed.filter(x => !ids.includes(x)) : [...new Set([...marks.fed, ...ids])]; });
  } else if (kind === "rank") {
    const all = ids.every(id => isDone(tab, id));
    bulk(`${title}：${all ? "已歸零" : "已全部標為滿級"}。`, () => { for (const id of ids) if (all) delete marks.ranks[id]; else marks.ranks[id] = KNOWN.ranks.get(id)!; });
  } else if (kind === "normal") {
    const all = ids.every(id => marks.nodes[id]);
    bulk(`${title}：一般${all ? "已全部取消（鋼韌一併取消）" : "已全部標為通過"}。`, () => { for (const id of ids) if (all) delete marks.nodes[id]; else marks.nodes[id] ??= 1; });
  } else if (kind === "sp") {
    const sp = spRequired(ids), all = sp.every(id => marks.nodes[id] === 2);
    bulk(`${title}：鋼韌之道${all ? "已全部取消" : "已全部標為通過（一般一併標記）"}。`, () => { for (const id of sp) marks.nodes[id] = all ? 1 : 2; });
  }
}
document.addEventListener("click", e => {
  const b = (e.target as Element).closest<HTMLElement>("button");
  if (!b) return;
  const d = b.dataset;
  if (d.themeSet) setTheme(d.themeSet as Theme);
  else if (d.tab) { ui.tab = d.tab as Tab; chip = ""; persist(); render(); }
  else if (d.chip !== undefined) { chip = d.chip; render(); }
  else if (d.bulk) runBulk(d.bulk, d.group!);
  else if (d.node) edit(() => { const m = toggleNode(marks.nodes[d.node!], d.which as "normal" | "sp"); if (m === undefined) delete marks.nodes[d.node!]; else marks.nodes[d.node!] = m; });
  else if (d.step) edit(() => {
    const id = d.id!, v = Math.max(0, Math.min(KNOWN.ranks.get(id)!, rankOf(id) + Number(d.step)));
    if (v) marks.ranks[id] = v; else delete marks.ranks[id];
  });
  else if (d.skip) edit(() => { marks.skip.push(d.skip!); });
  else if (d.unskip) edit(() => { marks.skip = marks.skip.filter(x => x !== d.unskip); });
});
$("list").addEventListener("change", e => {
  const { act, id } = (e.target as HTMLElement).dataset;
  if (!id) return;
  if (act === "done") edit(() => { marks.done = toggle(marks.done, id); delete marks.levels[id]; });
  if (act === "fed") edit(() => { marks.fed = toggle(marks.fed, id); });
});
$("q").addEventListener("input", e => { q = (e.target as HTMLInputElement).value.trim().toLowerCase(); render(); });
for (const [id, k] of [["only-left", "onlyLeft"], ["steel", "steel"], ["xp-only", "xpOnly"]] as const)
  $(id).addEventListener("change", e => {
    ui[k] = (e.target as HTMLInputElement).checked;
    if (ui.tab === "nodes" && chip && !systems().includes(chip)) chip = "";   // 選中的星球可能整個被篩掉
    persist(); render();
  });
$("undo").addEventListener("click", () => { if (undo) { marks = undo; undo = null; say("已復原。"); persist(); render(); } });
$("export").addEventListener("click", () => {
  const now = new Date(), pad = (n: number) => String(n).padStart(2, "0");
  const url = URL.createObjectURL(new Blob([JSON.stringify(makeExport(marks, now.getTime()))], { type: "application/json" }));
  const a = h("a", { href: url, download: `wf-grind-list-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  say("已匯出。");
});
function importText(text: string): void {
  try {
    const r = readImport(text, KNOWN, DATA.items, copy()), m = r.marks;
    const head = r.kind === "profile" ? "已匯入 DE 的 profile，Helminth 與略過不變" : "已匯入";
    const counts = `裝備 ${m.done.length} 件已滿、${Object.keys(m.levels).length} 件練到一半、節點 ${Object.keys(m.nodes).length}、Helminth ${m.fed.length}、略過 ${m.skip.length}`;
    bulk(`${head}：${counts}。${r.hadProgress ? "" : "檔案裡沒有進度，保留目前的。"}${r.dropped ? `另有 ${r.dropped} 筆不認得，已忽略。` : ""}`, () => { marks = m; });
    $<HTMLTextAreaElement>("paste").value = "";
  } catch (err) { say(err instanceof SaveError ? err.message : `匯入失敗：${String(err)}`, true); }
}
$<HTMLInputElement>("file").addEventListener("change", async e => {
  const input = e.target as HTMLInputElement, f = input.files?.[0];
  if (f) {
    // 讀取途中檔案被改寫、移走或沒有權限時會失敗
    let text: string | null = null;
    try { text = await f.text(); } catch { say("讀不到這個檔案，可能被移動或改寫了，請再選一次。", true); }
    if (text !== null) importText(text);
  }
  input.value = "";   // 同一個檔案可以再選一次
});
$("do-paste").addEventListener("click", () => importText($<HTMLTextAreaElement>("paste").value));
render();
showTheme();
