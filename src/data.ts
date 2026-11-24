// 公開資料的型別；內容由 scripts/gen-data.mjs 產生
import raw from "./data.json" with { type: "json" };

export interface Named { id: string; en: string; zh: string }
export type Cat = "frame" | "primary" | "secondary" | "melee" | "companion" | "robotic" | "archwing" | "archgun" | "archmelee"
  | "mech" | "zaw" | "kitgun" | "amp" | "kdrive" | "plexus";
export interface Item extends Named { cat: Cat; max: number; mr: number; pts: number; founder?: boolean }
export interface Node extends Named { sys: string; sysEn: string; mission: string; junction: boolean; xp: number; spOpt?: boolean }
export interface Synd extends Named { max: number }
export interface Skill extends Named { group: string; max: number }
interface Data { date: string; items: Item[]; nodes: Node[]; synd: Synd[]; skills: Skill[]; helminth: Named[] }

export const DATA = raw as unknown as Data;
