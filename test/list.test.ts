import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { itemXp, nodeState, toggleNode } from "../src/calc.ts";
import { cleanMarks, emptyMarks, makeExport, parseExport, SaveError, type Known, type Marks } from "../src/save.ts";

const D = JSON.parse(await readFile(new URL("../src/data.json", import.meta.url), "utf8"));
const known: Known = { done: new Set(["/W"]), nodes: new Set(["N", "M"]), ranks: new Map([["Hex", 5]]), fed: new Set(["/F"]), skip: new Set(["gear:/W"]) };
const marks = (): Marks => ({ done: ["/W"], nodes: { N: 1, M: 2 }, ranks: { Hex: 3 }, fed: ["/F"], skip: ["gear:/W"] });
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));

test("匯出再匯入完全一致", () => {
  const r = parseExport(JSON.stringify(makeExport(marks(), 1)), known);
  assert.deepEqual(plain(r.marks), marks()); assert.equal(r.dropped, 0);
});
test("只收自己的檔案；DE 的 profile 與 inventory 一律拒絕", () => {
  for (const t of ["", "<html>", "[]", "5", "null", "{}", '{"Results":[{"LoadOutInventory":{"XPInfo":[]}}]}', '{"XPInfo":[],"InfestedFoundry":{}}', '{"format":"wf-grind-left","version":1}'])
    assert.throws(() => parseExport(t, known), SaveError, t);
});
test("版本與結構檢查", () => {
  const f = (o: object) => JSON.stringify({ ...makeExport(marks(), 1), ...o });
  assert.throws(() => parseExport(f({ version: 2 }), known), /較新/);
  for (const o of [{ version: 0 }, { version: "1" }, { marks: null }, { marks: { ...marks(), done: 1 } }, { marks: { ...marks(), nodes: [] } }, { marks: { ...marks(), ranks: null } }])
    assert.throws(() => parseExport(f(o), known), SaveError, JSON.stringify(o));
});
test("不認得或型別不對的丟掉並計數，等級夾在上限內，多餘欄位不留", () => {
  const r = cleanMarks({ done: ["/W", "/W", "/X", 3], nodes: { N: 3, M: 2, __proto__x: 1 }, ranks: { Hex: 99, Nope: 1 }, fed: ["<img>"], skip: ["a"], who: "SECRET" }, known);
  assert.deepEqual(plain(r.marks), { done: ["/W"], nodes: { M: 2 }, ranks: { Hex: 5 }, fed: [], skip: [] });
  assert.equal(r.dropped, 7); assert.doesNotMatch(JSON.stringify(r), /SECRET/);
  assert.deepEqual(plain(cleanMarks({ ranks: { Hex: -1 } }, known).marks.ranks), {});
  assert.deepEqual(plain(cleanMarks(JSON.parse('{"nodes":{"__proto__":1}}'), known).marks), plain(emptyMarks()));
  assert.deepEqual(plain(cleanMarks("x", known).marks), plain(emptyMarks()));
});
test("節點：點數、完成判定", () => {
  const n = { xp: 63 };
  assert.deepEqual(nodeState(n, undefined, true), { normal: false, sp: false, left: 126, done: false });
  assert.deepEqual(nodeState(n, 1, true), { normal: true, sp: false, left: 63, done: false });
  assert.deepEqual(nodeState(n, 2, true), { normal: true, sp: true, left: 0, done: true });
  assert.deepEqual(nodeState(n, 1, false), { normal: true, sp: false, left: 0, done: true });
  assert.equal(nodeState({ xp: 0, spOpt: true }, 1, true).done, true);
  assert.equal(nodeState({ xp: 0, spOpt: true }, undefined, true).done, false);
});
test("節點：勾選連動", () => {
  assert.equal(toggleNode(undefined, "normal"), 1); assert.equal(toggleNode(1, "normal"), undefined); assert.equal(toggleNode(2, "normal"), undefined);
  assert.equal(toggleNode(undefined, "sp"), 2); assert.equal(toggleNode(1, "sp"), 2); assert.equal(toggleNode(2, "sp"), 1);
});
test("資料：星圖合計 27,569、銳捷號 41 個節點為 0、ID 不重複", () => {
  const sum = (xs: { xp: number }[]) => xs.reduce((a, n) => a + n.xp, 0), rj = D.nodes.filter((n: { sysEn: string }) => n.sysEn.endsWith("Proxima"));
  assert.equal(sum(D.nodes), 27_569); assert.equal(rj.length, 41); assert.equal(sum(rj), 0);
  const opt = D.nodes.filter((n: { spOpt?: boolean }) => n.spOpt); assert.equal(opt.length, 5); assert.equal(sum(opt), 0);
  for (const k of ["items", "nodes", "synd", "skills", "helminth"]) assert.equal(new Set(D[k].map((x: { id: string }) => x.id)).size, D[k].length, k);
});
test("資料：40 級裝備 54 件；可吞戰甲＝所有非 Prime／Umbra 戰甲", () => {
  assert.equal(D.items.filter((i: { max: number }) => i.max === 40).length, 54);
  assert.equal(itemXp({ max: 40, pts: 100 }), 4000); assert.equal(itemXp({ max: 30, pts: 200 }), 6000);
  const want = D.items.filter((i: { cat: string; en: string }) => i.cat === "frame" && !/ (Prime|Umbra)$/.test(i.en)).map((i: { id: string }) => i.id).sort();
  assert.deepEqual(D.helminth.map((h: { id: string }) => h.id).sort(), want);
});
