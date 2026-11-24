import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readImport, SYND_TAGS, SKILL_TAGS } from "../src/import.ts";
import { emptyMarks, makeExport, SaveError, type Known, type Marks } from "../src/save.ts";
import type { Item } from "../src/data.ts";

const item = (id: string, max = 30, pts = 100, founder = false): Item => ({ id, en: id, zh: id, cat: "primary", max, pts, mr: 0, ...(founder ? { founder } : {}) });
const items = [item("/W"), item("/K", 40), item("/F", 30, 200), item("/P", 30, 100, true), item("plexus", 30, 200)];
const known: Known = { done: new Set(items.map(i => i.id)), levels: new Map(items.map(i => [i.id, i.max])), nodes: new Set(["N", "M", "O"]), ranks: new Map([["Hex", 5], ["RedVeil", 5], ["railjack-Piloting", 10]]), fed: new Set(["/H"]),
  skip: new Set(["gear:/W", "gear:/P", "nodes:N", "synd:RedVeil", "skills:railjack-Piloting", "helminth:/H"]) };
const cur = (): Marks => ({ ...emptyMarks(), done: ["/F"], fed: ["/H"], skip: ["gear:/P", "nodes:N"] });
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));
const run = (o: unknown, c = cur()) => readImport(typeof o === "string" ? o : JSON.stringify(o), known, items, c);
const profile = { Results: [{ AccountId: { $oid: "SECRETID" }, DisplayName: "SECRETNAME", GuildName: "SECRETGUILD", PlayerLevel: 9,
  LoadOutInventory: { XPInfo: [{ ItemType: "/W", XP: 450_000 }, { ItemType: "/K", XP: 500 * 32 * 32 }, { ItemType: "/F", XP: 899_999 }, { ItemType: "/Lotus/Types/Game/CrewShip/RailJack/DefaultHarness", XP: 900_000 }, { ItemType: "/unknown", XP: 1 }] },
  Missions: [{ Tag: "N", Completes: 2 }, { Tag: "M", Completes: 1, Tier: 1 }, { Tag: "O", Completes: 0 }, { Tag: "zzz", Completes: 1 }],
  Affiliations: [{ Tag: "HexSyndicate", Title: 4, Standing: 5 }, { Tag: "RedVeilSyndicate", Title: -2 }], PlayerSkills: { LPS_PILOTING: 7, LPP_SPACE: 3 } }] };

test("DE profile：換算成勾選，Helminth 與略過不動", () => {
  const r = run(profile);
  assert.equal(r.kind, "profile");
  assert.deepEqual(plain(r.marks), { done: ["/W", "plexus"], levels: { "/K": 32, "/F": 29 }, nodes: { N: 1, M: 2 }, ranks: { Hex: 4, "railjack-Piloting": 7 }, fed: ["/H"], skip: ["gear:/P", "nodes:N"] });
  assert.doesNotMatch(JSON.stringify(r), /SECRET/);
});
test("DE profile：40 級裝備 450k 是 30/40，800k 才滿", () => {
  const at = (XP: number) => run({ LoadOutInventory: { XPInfo: [{ ItemType: "/K", XP }] } }).marks;
  assert.deepEqual(plain(at(450_000).levels), { "/K": 30 }); assert.deepEqual(at(799_999).done, []); assert.deepEqual(at(800_000).done, ["/K"]);
});
test("DE profile：持有創始人裝備就不再略過", () => {
  assert.deepEqual(run({ LoadOutInventory: { XPInfo: [{ ItemType: "/P", XP: 10 }] } }).marks.skip, ["nodes:N"]);
});
test("被 HTML 包住的 JSON 也讀得到", () => {
  const esc = JSON.stringify(profile).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  for (const w of [`<html><head></head><body>${esc}</body></html>`, `<!DOCTYPE html>\n<html><head><style>a{b:c}</style></head><body><pre>${esc}</pre></body></html>`])
    assert.deepEqual(plain(run(w).marks), plain(run(profile).marks));
});
const pf = (o: object = {}) => ({ version: 1, exportedAt: "x", at: 1, subsumed: ["/H", "/nope"], skip: ["/W", "N", "RedVeilSyndicate", "LPS_PILOTING", "h:/H", "??"],
  progress: { level: 9, xp: { "/W": 450_000, "/K": 8000 }, nodes: { N: { n: 1, sp: false }, M: { n: 1, sp: true }, O: { n: 0, sp: false } }, synd: { HexSyndicate: { title: 3, standing: 1 } }, skills: { LPS_PILOTING: 2 } }, ...o });
test("進度檔：進度、Helminth、略過都帶過來", () => {
  const r = run(pf(), emptyMarks());
  assert.equal(r.kind, "progress");
  assert.deepEqual(plain({ ...r.marks, skip: [...r.marks.skip].sort() }), { done: ["/W"], levels: { "/K": 4 }, nodes: { N: 1, M: 2 }, ranks: { Hex: 3, "railjack-Piloting": 2 }, fed: ["/H"],
    skip: ["gear:/P", "gear:/W", "helminth:/H", "nodes:N", "skills:railjack-Piloting", "synd:RedVeil"] });
  assert.equal(r.dropped, 2);
});
test("進度檔沒有進度時，保留目前的進度", () => {
  const r = run(pf({ progress: null }), { ...cur(), fed: [] });
  assert.deepEqual(r.marks.done, ["/F"]); assert.deepEqual(r.marks.fed, ["/H"]);
});
test("自己的匯出檔照舊，沒有 levels 的也收", () => {
  const m: Marks = { ...emptyMarks(), done: ["/W"], levels: { "/K": 31 } }, r = run(makeExport(m, 1));
  assert.equal(r.kind, "own"); assert.deepEqual(plain(r.marks), plain(m));
  const e = plain(makeExport(m, 1)); delete e.marks.levels;
  assert.deepEqual(plain(run(e).marks.levels), {});
});
test("已滿的不會同時有等級，超出範圍的等級不收", () => {
  const r = run(makeExport({ ...emptyMarks(), done: ["/W"], levels: { "/W": 5, "/K": 40, "/F": 0, "/nope": 3 } }, 1));
  assert.deepEqual(plain(r.marks.levels), {});
});
test("inventory、錯誤頁與壞檔拒絕並說明", () => {
  for (const [t, re] of [["", /空的/], ["Could not find requested account", /找不到這個帳號/], ["<html><body>nope</body></html>", /JSON/], ['{"Results":[', /JSON/], ['{"Results":[]}', /找不到這個帳號/],
    ['{"XPInfo":[],"InfestedFoundry":{}}', /inventory/], ['{"a":1}', /認不出/], ["[]", /認不出/], ['{"Results":[null]}', /認不出/],
    [JSON.stringify(pf({ version: 2 })), /版本/], [JSON.stringify(pf({ subsumed: 1 })), /壞/], [JSON.stringify(pf({ progress: { xp: 1 } })), /壞/]] as const)
    assert.throws(() => run(t), (e: Error) => e instanceof SaveError && re.test(e.message), t);
});
test("對照表指向存在的集團與內蘊，且全部涵蓋", async () => {
  const D = JSON.parse(await readFile(new URL("../src/data.json", import.meta.url), "utf8")), ids = (k: string) => D[k].map((x: { id: string }) => x.id).sort();
  assert.deepEqual(Object.values(SYND_TAGS).sort(), ids("synd")); assert.deepEqual(Object.values(SKILL_TAGS).sort(), ids("skills"));
});
