#!/usr/bin/env node
// 產生 src/data.json（只在遊戲改版時手動跑；頁面執行時不連網）
// 裝備、戰甲與節點譯名：DE Public Export。節點清單與段位經驗：官方 wiki 的 Module:Missions/data。
// 兩邊都沒有的少數名稱寫在下面，取自遊戲內。
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const fetchText = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
};
const clean = s => s.replace(/<[^>]+>\s*/g, "").replace(/\s+/g, " ").trim();

// ---------- DE Public Export ----------
const index = async lang => {
  const r = await fetch(`https://origin.warframe.com/PublicExport/index_${lang}.txt.lzma`);
  if (!r.ok) throw new Error(`index ${r.status}`);
  let out;
  // 檔尾不標準，xz 解完會回非零；內容完整，取 stdout 即可
  try { out = execFileSync("xz", ["--format=lzma", "-dc"], { input: Buffer.from(await r.arrayBuffer()), stdio: ["pipe", "pipe", "ignore"] }); }
  catch (e) { out = e.stdout; }
  const files = out.toString("utf8").split(/\r?\n/);
  return async kind => {
    const f = files.find(x => x.startsWith(`Export${kind}_`));
    if (!f) throw new Error(`官方索引缺 Export${kind}`);
    // 官方 JSON 字串內含未跳脫的控制字元
    return JSON.parse((await fetchText(`https://content.warframe.com/PublicExport/Manifest/${f}`)).replace(/[\u0000-\u001f]+/g, " "))[`Export${kind}`];
  };
};
const [enIdx, tcIdx] = await Promise.all([index("en"), index("tc")]);
const load = async kind => {
  const [e, t] = await Promise.all([enIdx(kind), tcIdx(kind)]);
  return { e, zh: new Map(t.map(x => [x.uniqueName, x])) };
};

// ---------- 裝備 ----------
const FOUNDERS = new Set(["Excalibur Prime", "Skana Prime", "Lato Prime"]);
// 組合武器與組合寵物只有「主件」給段位經驗；PvP 變體不算
const modular = id => {
  if (id.includes("PvPVariant")) return null;
  if (id.includes("ModularMelee")) return id.includes("/Tip") ? ["zaw", 100] : null;
  if (/ModularPrimary|ModularSecondary|InfKitGun/.test(id)) return id.includes("Barrel") ? ["kitgun", 100] : null;
  if (id.includes("OperatorAmplifiers") || id.includes("SentTrainingAmplifier")) return id.includes("Barrel") ? ["amp", 100] : null;
  if (id.includes("Hoverboard")) return id.endsWith("Deck") ? ["kdrive", 200] : null;
  if (id.includes("MoaPetParts")) return id.includes("MoaPetHead") ? ["companion", 200] : null;
  if (id.includes("ZanukaPetParts")) return id.includes("ZanukaPetPartHead") ? ["companion", 200] : null;
  return undefined;
};
const CAT = { Suits: ["frame", 200], SpaceSuits: ["archwing", 200], MechSuits: ["mech", 200], Sentinels: ["companion", 200], KubrowPets: ["companion", 200],
  LongGuns: ["primary", 100], Pistols: ["secondary", 100], Melee: ["melee", 100], SpaceGuns: ["archgun", 100], SpaceMelee: ["archmelee", 100],
  SentinelWeapons: ["robotic", 100], OperatorAmps: ["amp", 100] };
const items = [], helminth = [], have = new Set();   // 官方清單偶有重複的 uniqueName
for (const kind of ["Warframes", "Weapons", "Sentinels"]) {
  const { e, zh } = await load(kind);
  for (const x of e) {
    const id = x.uniqueName, m = kind === "Weapons" ? modular(id) : undefined;
    if (m === null || have.has(id)) continue;
    // Venari 跟著 Khora，但獨立給段位經驗
    const c = m ?? (id.includes("/Khora/Kavat/") ? ["companion", 200] : CAT[x.productCategory]);
    if (!c || (!m && x.productCategory === "Pistols" && x.slot !== 0)) continue;
    const n = { en: clean(x.name), zh: clean(zh.get(id)?.name ?? x.name) };
    have.add(id);
    items.push({ id, cat: c[0], ...n, max: x.maxLevelCap ?? (c[0] === "mech" ? 40 : 30), mr: x.masteryReq ?? 0, pts: c[1], ...(FOUNDERS.has(n.en) ? { founder: true } : {}) });
    if (c[0] === "frame" && !/ (Prime|Umbra)$/.test(n.en)) helminth.push({ id, ...n });
  }
}
items.push({ id: "plexus", cat: "plexus", en: "Plexus", zh: "銳捷號配設", max: 30, mr: 0, pts: 200 });

// ---------- 星圖 ----------
const regions = await load("Regions");
const regEn = new Map(regions.e.map(x => [x.uniqueName, x]));
const sysZh = new Map(regions.e.map(x => [x.systemName, regions.zh.get(x.uniqueName)?.systemName ?? x.systemName]));
const sysOrder = new Map(regions.e.map(x => [x.systemName, x.systemIndex]));
const TYPES = { Survival: "生存", Defense: "防禦", "Mobile Defense": "移動防禦", Capture: "捕獲", Exterminate: "殲滅", Rescue: "救援", Sabotage: "破壞", Spy: "間諜",
  Interception: "攔截", Assassination: "刺殺", Excavation: "挖掘", Disruption: "中斷", "Free Roam": "自由探索", Skirmish: "前哨戰", "Skirmish + Assassinate": "前哨戰 + 刺殺",
  "Mirror Defense": "鏡像防禦", "Solar Rail Junction": "接合點" };
// 不列入鋼韌之道完成條件（wiki The Steel Path）
const SP_OPTIONAL = new Set(["CrewBattleNode556", "CrewBattleNode560", "CrewBattleNode561", "SolNode701", "SolNode705"]);
// 沉降之地的檢查點不是獨立節點
const NOT_NODES = new Set(["SolNode253", "SolNode254", "SolNode255"]);
const lua = await fetchText("https://wiki.warframe.com/w/Module:Missions/data?action=raw");
const rows = lua.slice(lua.indexOf('["MissionDetails"]')).split("\n").filter(l => /InternalName = "/.test(l));
const field = (l, k) => new RegExp(`\\b${k} = "([^"]*)"`).exec(l)?.[1];
const numf = (l, k) => Number(new RegExp(`\\b${k} = (\\d+)`).exec(l)?.[1] ?? 0);
const nodes = [], seen = new Set();
for (const l of rows) {
  const id = field(l, "InternalName"), type = field(l, "Type") ?? "", planet = field(l, "Planet") ?? "", name = field(l, "Name");
  // wiki 的 IsHidden 含需任務解鎖的正式節點（Tyana Pass、渡域），官方清單有列的就收
  if (!id || !name || id.startsWith("/") || seen.has(id) || NOT_NODES.has(id) || (/IsHidden = true/.test(l) && !regEn.has(id))) continue;
  if (/^(Relay|Hub|Town|Conclave|PvP)/i.test(type) || /HUB|Hub|^Pvp|^EventNode/.test(id)) continue;
  const off = regEn.get(id), junction = type === "Solar Rail Junction";
  if (!off && !junction && !/IsRailjack = true/.test(l) && !numf(l, "MinLevel")) continue;
  seen.add(id);
  const sysEn = off?.systemName ?? planet, base = sysEn.replace(/ Proxima$/, "");
  const sys = sysEn.endsWith(" Proxima") ? `${base === "Veil" ? "面紗" : sysZh.get(base) ?? base}毗鄰星` : sysZh.get(sysEn) ?? sysEn;
  const target = junction ? name.replace(/ Junction$/, "") : "";
  nodes.push({ id, en: off ? clean(off.name) : name, zh: junction ? `${sysZh.get(target) ?? target}接合點` : clean(regions.zh.get(id)?.name ?? name),
    sys, sysEn, order: sysEn.endsWith(" Proxima") ? 100 : sysOrder.get(sysEn) ?? 99, mission: TYPES[type] ?? type, junction, xp: numf(l, "MasteryExp"),
    ...(SP_OPTIONAL.has(id) ? { spOpt: true } : {}) });
}

// wiki 沒有對應內部 ID 的官方節點（沉降之地）
for (const x of regions.e) if (!seen.has(x.uniqueName) && !NOT_NODES.has(x.uniqueName))
  nodes.push({ id: x.uniqueName, en: clean(x.name), zh: clean(regions.zh.get(x.uniqueName)?.name ?? x.name), sys: sysZh.get(x.systemName) ?? x.systemName, sysEn: x.systemName,
    order: x.systemIndex, mission: "The Descendia", junction: false, xp: 0 });

// ---------- 集團與內蘊（遊戲內名稱與最高等級） ----------
const synd = [["SteelMeridian", "Steel Meridian", "鋼鐵防線", 5], ["Arbiters", "Arbiters of Hexis", "均衡仲裁者", 5], ["Suda", "Cephalon Suda", "中樞蘇達", 5],
  ["Perrin", "The Perrin Sequence", "佩蘭數列", 5], ["RedVeil", "Red Veil", "血色面紗", 5], ["NewLoka", "New Loka", "新世間", 5], ["Conclave", "Conclave", "武形秘儀", 5],
  ["Ostron", "Ostron", "Ostron", 5], ["Quills", "The Quills", "夜羽", 5], ["Solaris", "Solaris United", "索拉里斯聯盟", 5], ["Vox", "Vox Solaris", "索拉里斯之聲", 5],
  ["Ventkids", "Ventkids", "通風小子", 5], ["Entrati", "Entrati", "源拓氏", 5], ["Necraloid", "Necraloid", "亡骸精靈", 3], ["Holdfasts", "The Holdfasts", "堅守者", 5],
  ["Kahl", "Kahl's Garrison", "駐屯地", 5], ["Cavia", "Cavia", "參研者", 5], ["Hex", "The Hex", "六煞幫", 5], ["Nightcap", "Nightcap", "睡帽", 5]]
  .map(([id, en, zh, max]) => ({ id, en, zh, max }));
const skills = [["railjack", "Tactical", "戰術"], ["railjack", "Piloting", "操縱"], ["railjack", "Gunnery", "重砲"], ["railjack", "Engineering", "工程"], ["railjack", "Command", "指揮"],
  ["drifter", "Combat", "戰鬥"], ["drifter", "Riding", "騎術"], ["drifter", "Opportunity", "機運"], ["drifter", "Endurance", "毅力"]]
  .map(([group, en, zh]) => ({ id: `${group}-${en}`, group, en, zh, max: 10 }));

const byEn = (a, b) => a.en.localeCompare(b.en, "en");
items.sort(byEn); helminth.sort(byEn);
nodes.sort((a, b) => a.order - b.order || a.sysEn.localeCompare(b.sysEn) || Number(a.junction) - Number(b.junction) || byEn(a, b));
const date = new Date().toISOString().slice(0, 10);
await writeFile(new URL("../src/data.json", import.meta.url), JSON.stringify({ date, items, nodes, synd, skills, helminth }));
console.log({ date, items: items.length, nodes: nodes.length, xp: nodes.reduce((a, n) => a + n.xp, 0), synd: synd.length, skills: skills.length, helminth: helminth.length });
console.log("未翻譯的任務類型:", [...new Set(nodes.map(n => n.mission))].filter(x => /^[A-Za-z]/.test(x)).join(", "));
