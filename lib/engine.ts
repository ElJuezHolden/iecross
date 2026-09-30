// Motor de evaluación de un once.
//
// Fórmula de duelo (verificada por la comunidad japonesa, ver /metodo):
//   poder = (estadística × (1 + zona%) + pasivas de estadística)
//           × (poder de técnica + pasivas de poder) × multiplicador de elemento × 0,01
// Elemento: +20 % si el elemento del jugador coincide con el de la técnica; ±10 % por ventaja
// frente al rival (desconocido aquí, así que neutro).
import benchJson from "@/data/bench.json";
import { autoGear } from "./gear";
import { COACH_BY_ID, PLAYER_BY_ID, TECH_BY_CODE, coachEffects, playerPassives, slotArea, slotConditionMet, zoneBonus } from "./data";
import type { Coach, Effect, Element, ParsedPassive, Player, Position, SlotDef, StatKey, TechType, Technique, Trigger } from "./types";

export const TYPE_STAT: Record<TechType, StatKey> = { Tiro: "kick", Regate: "technique", Bloqueo: "block", Parada: "catch" };
export const MAX_LEVEL = 440;

// ---------- Progresión: nivel del jugador y despertar (凸) ----------
//
// Pasivas de nivel: cada jugador tiene 3; la 1.ª se desbloquea a nivel 11, la 2.ª a 21 y la 3.ª a
// 31, y cada una sube +1 cada 30 niveles (11, 41, 71…). Cuadra con los datos (a nivel 440 van por
// Nv 15/14/14) y con las guías (a nivel 300 la 3.ª solo llegaba a Nv 9). Su efecto es lineal con el
// nivel de pasiva (p. ej. "Parada+" = 144 por nivel → 2016 a Nv 14).
//
// Despertar: rangos Normal(1) … Legendary+(10). En un ★3, 0凸 = Growing(3) y cada 凸 sube un
// rango hasta Legendary+ (7凸, 完凸). "TP+ máximo" llega a Nv1/2/3 en Advanced/Top/Legendary y la
// pasiva única de despertar en Advanced+/Top+/Legendary+.
export const AWAKEN_RANKS = ["Normal", "Normal+", "Growing", "Growing+", "Advanced", "Advanced+", "Top", "Top+", "Legendary", "Legendary+"];

export function passiveLevel(pp: ParsedPassive, playerLevel: number, stage: number): { lvl: number; max: number } {
  if (pp.source === "Despertar") {
    const lvl = pp.unlock === 8 ? (stage >= 9 ? 3 : stage >= 7 ? 2 : stage >= 5 ? 1 : 0) : stage >= 10 ? 3 : stage >= 8 ? 2 : stage >= 6 ? 1 : 0;
    return { lvl, max: 3 };
  }
  const start = 11 + ((((pp.unlock - 11) % 30) + 30) % 30);
  const at = (L: number) => (L >= start ? Math.floor((L - start) / 30) + 1 : 0);
  return { lvl: at(playerLevel), max: Math.max(1, at(MAX_LEVEL)) };
}

/** Las estadísticas de la base están a nivel 440. No hay datos de la curva; suponemos que crece
 *  de forma lineal desde un 10 % a nivel 1. Afecta igual a todos, así que pesa poco en el ranking. */
export const statScale = (L: number) => 0.1 + (0.9 * Math.min(MAX_LEVEL, Math.max(1, L))) / MAX_LEVEL;

// ---------- Disparadores ----------

/** Veces que, de media, está activo un efecto con ese disparador durante un partido (valores base;
 *  los que dependen del equipo se recalculan en triggerWeights). Los efectos que "terminan cuando
 *  tu equipo marca" se reinician, por eso son números bajos. */
export const TRIGGER_WEIGHT: Record<Trigger, number> = {
  start: 1,
  secondHalf: 0.5,
  selfDribbleWin: 1.2,
  allyDribbleWin: 2,
  mfDribbleWin: 1.6,
  allyDribbleLose: 0.6,
  selfBlockWin: 1,
  dfBlockWin: 1.5,
  allyBlockWin: 2,
  selfShootBlockWin: 0.5,
  selfShootBlockFail: 0.5,
  allyShootBlockFail: 0.8,
  allySave: 1.3,
  selfSave: 1.3,
  rivalStopsShot: 1,
  rivalShootBlockFail: 0.6,
  goalFor: 0.7,
  goalAgainst: 0.4,
  losing: 0.3,
  rivalHalf: 0.5,
  ownHalf: 0.5,
  penaltyArea: 0.6,
  receivePass: 1,
  chainShot: 0.4,
  useShot: 1,
  rivalElementShot: 0.25,
};

export const TRIGGER_LABEL: Record<Trigger, string> = {
  start: "todo el partido",
  secondHalf: "2.ª parte",
  selfDribbleWin: "al regatear con éxito",
  allyDribbleWin: "regates aliados",
  mfDribbleWin: "regates de MF",
  allyDribbleLose: "regate aliado fallido",
  selfBlockWin: "al robar un regate",
  dfBlockWin: "robos de defensas",
  allyBlockWin: "robos aliados",
  selfShootBlockWin: "al bloquear un tiro",
  selfShootBlockFail: "al fallar su bloqueo de tiro",
  allyShootBlockFail: "bloqueos de tiro fallidos",
  allySave: "paradas del portero",
  selfSave: "paradas propias",
  rivalStopsShot: "cuando te paran un tiro",
  rivalShootBlockFail: "bloqueo rival fallido",
  goalFor: "tras marcar",
  goalAgainst: "tras encajar",
  losing: "yendo por detrás",
  rivalHalf: "en campo rival",
  ownHalf: "en campo propio",
  penaltyArea: "en el área",
  receivePass: "al recibir pase",
  chainShot: "en cadenas de tiro",
  useShot: "al tirar",
  rivalElementShot: "tiro rival de un elemento",
};

/** Preferencias del usuario para puntuar los equipos. */
export interface Prefs {
  /** Peso relativo de cada parte (se normalizan) */
  attack: number;
  defense: number;
  dribble: number;
  block: number;
  /** 0 = la portería depende sobre todo de los bloqueos de tiro · 50 = normal · 100 = solo cuenta el portero */
  keeper: number;
  /** Multiplicador de las pasivas que dependen de lo que pase en el partido (0 = no contar, 1 = normal, 1.5 = optimista) */
  eventTrust: number;
  /** Penaliza fuerte los equipos sin la formación activa */
  requireFormation: boolean;
  /** Multiplicador de las pasivas que debilitan al rival (1 = normal) */
  debuffTrust?: number;
}

export const DEFAULT_PREFS: Prefs = { attack: 40, defense: 30, dribble: 15, block: 15, keeper: 50, eventTrust: 1, requireFormation: false };

export const PRESETS: { id: string; label: string; hint: string; prefs: Prefs }[] = [
  { id: "equilibrado", label: "Equilibrado", hint: "Lo recomendado por las guías: manda el tiro que rompe al portero", prefs: DEFAULT_PREFS },
  { id: "ofensivo", label: "Ofensivo", hint: "Marcar como sea", prefs: { ...DEFAULT_PREFS, attack: 60, defense: 20, dribble: 15, block: 5 } },
  { id: "muro", label: "Muro", hint: "Portería por encima de todo (en el meta suele bastar con 1-0)", prefs: { ...DEFAULT_PREFS, attack: 30, defense: 50, dribble: 5, block: 15, keeper: 65 } },
  { id: "portero", label: "Portero fuerte", hint: "Un portero con muchísimo poder propio (bruto o con sus pasivas, tipo Kino Aki), sin fiarlo todo a los bloqueos", prefs: { ...DEFAULT_PREFS, attack: 35, defense: 45, dribble: 10, block: 10, keeper: 90 } },
  { id: "control", label: "Control del medio", hint: "Ganar regates y robos", prefs: { ...DEFAULT_PREFS, attack: 30, defense: 20, dribble: 25, block: 25 } },
  { id: "debuff", label: "Debilitar al rival", hint: "Equipos que hunden al rival: bajan la Parada de su portero, el Bloqueo de su defensa o la Técnica de su medio (Caos, Géminis, Otonashi, Manga Hou…)", prefs: { ...DEFAULT_PREFS, debuffTrust: 1.8 } },
  { id: "acumular", label: "Acumulación", hint: "Confía en que tu equipo carga sus pasivas «cada vez que…» durante el partido (Hitomiko, Nikaidou, Endou Daisuke, Inazuma Japan)", prefs: { ...DEFAULT_PREFS, eventTrust: 1.4 } },
  { id: "seguro", label: "Potencia bruta", hint: "Solo lo que está garantizado: pasivas fijas y estadísticas, sin contar acumulaciones", prefs: { ...DEFAULT_PREFS, eventTrust: 0.25 } },
];

/** Equipamiento: lo que suma cada posición a todos los jugadores con esa posición recomendada. */
export type Gear = Partial<Record<Position, Partial<Record<StatKey, number>>>>;

/** Nivel máximo de equipamiento para un nivel mínimo de jugadores (sube cada 5 niveles). */
export const gearLevel = (playerLevel: number) => Math.floor(playerLevel / 5) * 5;

const gearFor = (gear: Gear | undefined, pos: Position): Record<StatKey, number> => ({
  kick: gear?.[pos]?.kick ?? 0,
  technique: gear?.[pos]?.technique ?? 0,
  block: gear?.[pos]?.block ?? 0,
  catch: gear?.[pos]?.catch ?? 0,
});

/** Técnicas del jugador más la 3.ª de un manual (秘伝書), si la tiene y no la sabía ya. La del manual se
 *  aprende directamente (sin esperar a nivel 31). */
export function withExtra(player: Player, code?: string): Technique[] {
  const extra = code ? TECH_BY_CODE.get(code) : undefined;
  if (!extra || player.techniques.some((t) => t.code === extra.code)) return player.techniques;
  return [...player.techniques, { ...extra, unlock: 1, fromBook: true }];
}

/** Opciones que el usuario puede ajustar. */
export interface EvalOptions {
  prefs?: Prefs;
  gear?: Gear;
  /** 3.ª técnica aprendida con manual (código de técnica) */
  extraTech?: (playerId: string) => string | undefined;
  techLevel: number; // 1-10
  /** Nivel mínimo de tus jugadores (1-440). */
  playerLevel?: number;
  /** Rango de despertar de cada jugador (1 Normal … 10 Legendary+). Por defecto 10. */
  awakening?: (playerId: string) => number;
  /** Elemento del rival (para ±10 %). */
  rivalElement?: Element | null;
  /** Sin informe de pasivas (para el optimizador) */
  fast?: boolean;
}

export const DEFAULT_OPTIONS: EvalOptions = { techLevel: 10 };

const BEATS: Record<Element, Element> = { Viento: "Montaña", Montaña: "Fuego", Fuego: "Bosque", Bosque: "Viento" };

// ---------- Rival de referencia ----------
// No sabemos contra quién juegas, así que cada duelo se mide contra el "meta": el mejor once que se
// puede montar con TODA la base (nivel 440, 完凸, entrenadores y técnicas a nivel 10). Lo calcula
// scripts/calibrate.ts y queda en data/bench.json. Tu equipo puntúa según cuánto se acerca a él.
export type Role = "shot" | "catch" | "dribble" | "block";
export interface BenchRole {
  stat: number;
  power: number;
  mult: number; // elemento × crítico medio del meta
}
export let BENCH: Record<Role, BenchRole> = benchJson as Record<Role, BenchRole>;
/** Solo para la calibración. */
export function setBench(b: Record<Role, BenchRole>) {
  BENCH = b;
}

/** Estadística del meta en un rol, a tu nivel y con el equipamiento completo de ese nivel. */
const ROLE_POS: Record<Role, Position> = { shot: "FW", catch: "GK", dribble: "MF", block: "DF" };
const ROLE_STAT: Record<Role, StatKey> = { shot: "kick", catch: "catch", dribble: "technique", block: "block" };
export function benchStat(r: Role, level: number) {
  const g = autoGear(level).gear[ROLE_POS[r]]?.[ROLE_STAT[r]] ?? 0;
  return BENCH[r].stat * statScale(level) + g;
}

const duel = (stat: number, power: number, mult: number) => (Math.max(0, stat) * Math.max(0, power) * mult) / 100;
/** Probabilidad de ganar un duelo según la ratio de poderes: 50 % en empate, ~15 % a la mitad de
 *  poder, ~85 % al doble. Nunca se aplana del todo, así que el optimizador siempre ve mejoras. */
export const winProb = (ratio: number) => {
  const r = Math.pow(Math.max(0, ratio), 1.5);
  return r / (r + 1);
};

// ---------- Estructuras de resultado ----------

export interface PowerMod {
  value: number;
  types?: TechType[];
  elements?: Element[];
  name?: string;
}

export interface TechCalc {
  tech: Technique;
  basePower: number;
  power: number; // tras pasivas
  stat: number; // estadística efectiva usada
  elemMatch: boolean;
  crit: number;
  tpCost: number;
  range: number;
  duel: number; // poder final de duelo (esperado, con crítico)
}

export interface MemberCalc {
  index: number;
  slot: SlotDef;
  player: Player;
  area: number;
  zone: { rank: string | null; bonus: number };
  activity: number;
  stage: number;
  statBuff: Record<StatKey, number>;
  stat: Record<StatKey, number>;
  powerMods: PowerMod[];
  critAdd: { value: number; types?: TechType[]; elements?: Element[]; name?: string }[];
  tpMax: number;
  tpCostCut: { value: number; name?: string }[];
  techs: TechCalc[];
  best: Partial<Record<TechType, TechCalc>>;
}

export type PassiveStatus = "activa" | "requisito" | "sin-objetivo" | "despertar" | "nivel" | "sin-uso";

export interface PassiveReport {
  owner: string; // nombre (o entrenador / formación)
  ownerId?: string;
  name: string;
  description: string;
  status: PassiveStatus;
  detail: string;
  targets: string[];
  weight: number; // multiplicador por disparador
  trigger: Trigger;
  level?: { lvl: number; max: number };
  conditional: boolean; // tiene requisito de etiqueta/elemento
}

/** Refuerzo de una fuente (jugador, entrenador o formación) a un compañero concreto. */
export interface Combo {
  from: string;
  to: string;
  toId: string;
  /** Poder de duelo que le añade en su técnica más relevante (aprox.) */
  delta: number;
  what: string[];
}

/** Motor de una estrategia: un disparador con peso > 0 que alimenta pasivas acumulables. */
export interface Engine {
  trigger: Trigger;
  weight: number;
  feeders: string[]; // quién lo provoca
  beneficiaries: string[]; // pasivas que se cargan
}

export interface Evaluation {
  score: number;
  parts: { attack: number; defense: number; dribble: number; block: number };
  members: MemberCalc[];
  formationActive: boolean;
  conditions: { slot: number; ok: boolean; label: string }[];
  passives: PassiveReport[];
  rival: Record<Role, { stat: number; power: number; duel: number }>;
  shooters: { member: MemberCalc; tech: TechCalc; p: number; weight: number }[];
  keeper?: { member: MemberCalc; tech?: TechCalc; p: number };
  blockers: { member: MemberCalc; tech: TechCalc; p: number }[];
  dribblers: { member: MemberCalc; tech: TechCalc; p: number }[];
  tacklers: { member: MemberCalc; tech: TechCalc; p: number }[];
  engines: Engine[];
  combos: Combo[];
}

export interface Lineup {
  coachId: string;
  coachLevel: number;
  /** 11 casillas, en el orden de la formación; id de jugador o null */
  slots: (string | null)[];
}

// ---------- Utilidades ----------

function matchesFilter(e: Effect, m: MemberCalc): boolean {
  const f = e.filter;
  if (!f) return true;
  if (f.positions) {
    if (f.recommended) {
      if (!f.positions.includes(m.slot.position) || !f.positions.includes(m.player.position)) return false;
    } else if (!f.positions.includes(m.player.position)) return false;
  }
  if (f.elements && !f.elements.includes(m.player.element)) return false;
  if (f.tags && !f.tags.some((t) => m.player.tags.includes(t))) return false;
  return true;
}

function slotActivity(area: number): number {
  // Las bandas de la defensa apenas intervienen (según guías japonesas); el centro, siempre.
  if (area === 8 || area === 10) return 0.45;
  if (area === 4 || area === 6) return 0.8;
  if (area === 1 || area === 3) return 0.9;
  return 1;
}

const hasType = (m: MemberCalc, t: TechType) => m.techs.some((x) => x.tech.type === t);
const shootBlocker = (m: MemberCalc) => m.slot.position !== "GK" && m.techs.some((x) => x.tech.shootBlock && x.tech.type === "Bloqueo");
const maxShotRange = (m: MemberCalc) => Math.max(0, ...m.techs.filter((x) => x.tech.type === "Tiro").map((x) => x.range));

/** Cuánto tira cada jugador: los FW siempre; los MF solo si su tiro llega desde el medio (tiro lejano). */
function shootPropensity(m: MemberCalc): number {
  if (!hasType(m, "Tiro")) return 0;
  if (m.slot.position === "FW") return 1;
  const r = maxShotRange(m);
  if (m.slot.position === "MF") return r >= 29 ? 0.9 : r >= 23 ? 0.6 : 0.25;
  return r >= 29 ? 0.3 : 0.1;
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Frecuencia de cada disparador según la composición del once, y quién lo alimenta. */
function triggerWeights(members: MemberCalc[]) {
  const w: Record<Trigger, number> = { ...TRIGGER_WEIGHT };
  const feeders: Partial<Record<Trigger, string[]>> = {};
  const names = (xs: MemberCalc[]) => xs.map((m) => m.player.name);

  const shooters = members.filter((m) => shootPropensity(m) > 0);
  const S = shooters.reduce((s, m) => s + shootPropensity(m), 0);
  w.rivalStopsShot = clamp(0.5 * S, 0.3, 3);
  feeders.rivalStopsShot = names(shooters.filter((m) => shootPropensity(m) >= 0.6));
  w.useShot = 1;

  const blockers = members.filter(shootBlocker);
  const B = blockers.reduce((s, m) => s + m.activity * (m.slot.position === "DF" ? 1 : m.slot.position === "MF" ? 0.7 : 0.3), 0);
  w.allyShootBlockFail = clamp(0.45 * B, 0, 2.5);
  feeders.allyShootBlockFail = names(blockers);
  feeders.selfShootBlockFail = feeders.selfShootBlockWin = names(blockers);

  const gk = members.find((m) => m.slot.position === "GK");
  w.allySave = w.selfSave = gk && hasType(gk, "Parada") ? clamp(1.1 + 0.15 * B, 0, 2.2) : 0.3;
  feeders.allySave = gk ? [gk.player.name, ...names(blockers)] : [];

  const mfDrib = members.filter((m) => m.slot.position === "MF" && hasType(m, "Regate"));
  w.mfDribbleWin = clamp(0.6 * mfDrib.reduce((s, m) => s + m.activity, 0), 0, 2.5);
  feeders.mfDribbleWin = names(mfDrib);
  const drib = members.filter((m) => (m.slot.position === "MF" || m.slot.position === "FW") && hasType(m, "Regate"));
  w.allyDribbleWin = clamp(0.5 * drib.reduce((s, m) => s + m.activity, 0), 0, 3);
  feeders.allyDribbleWin = feeders.allyDribbleLose = names(drib);

  const dfBlk = members.filter((m) => m.slot.position === "DF" && hasType(m, "Bloqueo"));
  w.dfBlockWin = clamp(0.5 * dfBlk.reduce((s, m) => s + m.activity, 0), 0, 2.5);
  feeders.dfBlockWin = names(dfBlk);
  const blk = members.filter((m) => (m.slot.position === "DF" || m.slot.position === "MF") && hasType(m, "Bloqueo"));
  w.allyBlockWin = clamp(0.45 * blk.reduce((s, m) => s + m.activity, 0), 0, 3);
  feeders.allyBlockWin = names(blk);

  return { w, feeders };
}

function ownerFactor(tr: Trigger, m: MemberCalc): number {
  switch (tr) {
    case "selfDribbleWin":
      return (hasType(m, "Regate") ? 1 : 0.15) * m.activity;
    case "selfBlockWin":
      return (hasType(m, "Bloqueo") ? 1 : 0.3) * m.activity;
    case "selfShootBlockWin":
    case "selfShootBlockFail":
      return shootBlocker(m) ? m.activity : 0;
    case "useShot":
      return shootPropensity(m);
    default:
      return 1;
  }
}

function describeTargets(e: Effect): string {
  if (e.scope === "self") return "propio";
  const bits: string[] = [];
  if (e.filter?.positions) bits.push(e.filter.positions.join("/") + (e.filter.recommended ? " en su posición" : ""));
  if (e.filter?.elements) bits.push(e.filter.elements.join("/"));
  if (e.filter?.tags) bits.push(e.filter.tags.join(" o "));
  return (e.side === "rival" ? "rivales " : "aliados ") + (bits.join(" · ") || "todos");
}

// ---------- Evaluación ----------

export function evaluate(lineup: Lineup, opts: EvalOptions = DEFAULT_OPTIONS): Evaluation {
  const coach = COACH_BY_ID.get(lineup.coachId) as Coach;
  const slots = coach.formation.slots;
  const lvl = Math.max(1, Math.min(10, opts.techLevel)) - 1;
  const L = Math.max(1, Math.min(MAX_LEVEL, opts.playerLevel ?? MAX_LEVEL));
  const sScale = statScale(L);
  const fast = !!opts.fast;

  const members: MemberCalc[] = [];
  lineup.slots.forEach((pid, i) => {
    if (!pid) return;
    const player = PLAYER_BY_ID.get(pid);
    if (!player) return;
    const slot = slots[i];
    const area = slotArea(slot.fieldX, slot.fieldY);
    const m: MemberCalc = {
      index: i,
      slot,
      player,
      area,
      zone: zoneBonus(player, area),
      activity: slotActivity(area),
      stage: opts.awakening ? opts.awakening(pid) : 10,
      // el equipamiento se suma desde el principio, como cualquier bonificación fija
      statBuff: gearFor(opts.gear, player.position),
      stat: { kick: 0, technique: 0, block: 0, catch: 0 },
      powerMods: [],
      critAdd: [],
      tpMax: player.stats.tp,
      tpCostCut: [],
      techs: [],
      best: {},
    };
    // Técnicas conocidas a este nivel (la 2.ª se aprende a nivel 31); el poder se calcula luego.
    for (const tech of withExtra(player, opts.extraTech?.(pid))) {
      if (tech.unlock > L) continue;
      const lv = tech.levels[Math.min(lvl, tech.levels.length - 1)];
      m.techs.push({ tech, basePower: lv.power, power: lv.power, stat: 0, elemMatch: tech.element === player.element, crit: lv.critical, tpCost: lv.tp, range: lv.range, duel: 0 });
    }
    members.push(m);
  });

  const prefs = opts.prefs ?? DEFAULT_PREFS;
  const { w: TW, feeders } = triggerWeights(members);
  if (prefs.eventTrust !== 1)
    for (const t of Object.keys(TW) as Trigger[]) if (t !== "start" && t !== "secondHalf") TW[t] *= prefs.eventTrust;

  const rivalMod: Record<Role, { stat: number; power: number }> = {
    shot: { stat: 0, power: 0 },
    catch: { stat: 0, power: 0 },
    dribble: { stat: 0, power: 0 },
    block: { stat: 0, power: 0 },
  };
  const reports: PassiveReport[] = [];

  // Para "Combos clave": quién refuerza a quién (se valora al final, cuando ya hay poderes)
  const links: { from: string; to: MemberCalc; e: Effect; w: number }[] = [];
  let source = "";
  const apply = (e: Effect, owner: MemberCalc | null, weight: number): string[] => {
    const w = e.value * weight * (e.side === "rival" ? (prefs.debuffTrust ?? 1) : 1);
    if (e.side === "rival") {
      const elemFactor = e.filter?.elements ? 0.25 : 1;
      const roles = new Set<Role>();
      if (e.kind === "stat") {
        for (const s of e.stats ?? []) roles.add(s === "kick" ? "shot" : s === "technique" ? "dribble" : s === "block" ? "block" : "catch");
      } else if (e.kind === "power") {
        if (e.techTypes) for (const t of e.techTypes) roles.add(t === "Tiro" ? "shot" : t === "Regate" ? "dribble" : t === "Bloqueo" ? "block" : "catch");
        else for (const p of e.filter?.positions ?? ["FW", "MF", "DF", "GK"]) roles.add(p === "FW" ? "shot" : p === "MF" ? "dribble" : p === "DF" ? "block" : "catch");
      } else return [];
      for (const r of roles) {
        if (e.kind === "stat") rivalMod[r].stat += w * elemFactor;
        else rivalMod[r].power += w * elemFactor;
      }
      return [...roles].map((r) => ({ shot: "tiro rival", catch: "portero rival", dribble: "regate rival", block: "defensa rival" })[r]);
    }
    const targets = e.scope === "self" ? (owner ? [owner] : []) : members.filter((m) => matchesFilter(e, m));
    for (const m of targets) {
      if (!fast && m !== owner && w > 0 && (e.kind === "stat" || e.kind === "power")) links.push({ from: source, to: m, e, w });
      switch (e.kind) {
        case "stat":
          for (const s of e.stats ?? []) m.statBuff[s] += w;
          break;
        case "power":
          m.powerMods.push({ value: w, types: e.techTypes, elements: e.techElements, name: e.techName });
          break;
        case "crit":
          m.critAdd.push({ value: w, types: e.techTypes, elements: e.techElements, name: e.techName });
          break;
        case "tpMax":
          m.tpMax += w;
          break;
        case "tpCost":
          m.tpCostCut.push({ value: w, name: e.techName });
          break;
        default:
          break;
      }
    }
    // Técnica con nombre: solo cuenta si algún objetivo la tiene
    if (e.techName) return targets.filter((m) => m.player.techniques.some((t) => t.name === e.techName)).map((m) => m.player.name);
    return targets.map((m) => m.player.name);
  };

  // Para el "plan de juego": qué pasivas acumulables cuelgan de cada disparador
  const engineUse = new Map<Trigger, Set<string>>();
  const noteEngine = (tr: Trigger, label: string) => {
    if (tr === "start" || tr === "secondHalf") return;
    if (!engineUse.has(tr)) engineUse.set(tr, new Set());
    engineUse.get(tr)!.add(label);
  };

  // --- Entrenador y formación ---
  const ce = coachEffects(coach, lineup.coachLevel);
  const conditions = slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.condition)
    .map(({ s, i }) => {
      const pid = lineup.slots[i];
      const p = pid ? PLAYER_BY_ID.get(pid) : undefined;
      return { slot: s.slot, ok: slotConditionMet(s.condition, p), label: `${s.condition!.type}: ${s.condition!.value}` };
    });
  const formationActive = conditions.every((c) => c.ok);
  const coachPass = coach.growth.find((g) => g.level === lineup.coachLevel) ?? coach.growth[coach.growth.length - 1];
  {
    const targets = new Set<string>();
    source = `${coach.name} (entrenador)`;
    for (const e of ce.coach) {
      apply(e, null, TW[e.trigger]).forEach((t) => targets.add(t));
      noteEngine(e.trigger, `${coach.name} (entrenador)`);
    }
    const tr = ce.coach[0]?.trigger ?? "start";
    if (!fast)
      reports.push({
        owner: coach.name,
        name: coachPass.coachPassive.name,
        description: coachPass.coachPassive.description,
        status: targets.size ? "activa" : "sin-objetivo",
        detail: targets.size ? "" : "Ningún jugador del once cumple el objetivo",
        targets: [...targets],
        weight: TW[tr],
        trigger: tr,
        conditional: false,
      });
  }
  {
    const targets = new Set<string>();
    source = `${coach.formation.name} (formación)`;
    if (formationActive)
      for (const e of ce.formation) {
        apply(e, null, TW[e.trigger]).forEach((t) => targets.add(t));
        noteEngine(e.trigger, `${coach.formation.name} (formación)`);
      }
    const tr = ce.formation[0]?.trigger ?? "start";
    if (!fast)
      reports.push({
        owner: coach.formation.name,
        name: coach.formation.activePassive.name,
        description: coach.formation.activePassive.description,
        status: !formationActive ? "requisito" : targets.size ? "activa" : "sin-objetivo",
        detail: formationActive ? "" : "Faltan requisitos de casilla de la formación",
        targets: [...targets],
        weight: TW[tr],
        trigger: tr,
        conditional: conditions.length > 0,
      });
  }

  // --- Pasivas de jugadores ---
  for (const m of members) {
    for (const pp of playerPassives(m.player)) {
      const level = passiveLevel(pp, L, m.stage);
      const tr0 = pp.effects[0]?.trigger ?? "start";
      const base = {
        owner: m.player.name,
        ownerId: m.player.id,
        name: pp.name,
        description: pp.description,
        conditional: !!pp.requirement,
        level,
        trigger: tr0,
      };
      if (level.lvl === 0) {
        if (!fast)
          reports.push({
            ...base,
            status: pp.source === "Despertar" ? "despertar" : "nivel",
            detail: pp.source === "Despertar" ? `Se desbloquea en ${pp.unlock === 8 ? "Advanced" : "Advanced+"}` : "Nivel del jugador insuficiente",
            targets: [],
            weight: 0,
          });
        continue;
      }
      const reqOk = requirementMet(pp, members);
      if (!reqOk.ok) {
        if (!fast) reports.push({ ...base, status: "requisito", detail: reqOk.detail, targets: [], weight: 0 });
        continue;
      }
      const scale = level.lvl / level.max;
      source = m.player.name;
      const targets = new Set<string>();
      let weight = 0;
      for (const e of pp.effects) {
        let wgt = TW[e.trigger] * ownerFactor(e.trigger, m);
        if (!e.stacks && e.trigger !== "start" && e.trigger !== "secondHalf") wgt = Math.min(wgt, 0.8);
        weight = Math.max(weight, wgt);
        if (wgt > 0) noteEngine(e.trigger, `${m.player.name}: ${pp.name}`);
        apply(e, m, wgt * scale).forEach((t) => targets.add(t));
      }
      const onlyMisc = pp.effects.every((e) => e.kind === "foul" || e.kind === "speed" || e.kind === "range" || e.kind === "chainRate");
      if (!fast)
        reports.push({
          ...base,
          status: weight === 0 ? "sin-uso" : targets.size || onlyMisc ? "activa" : "sin-objetivo",
          detail:
            weight === 0
              ? "Este jugador no puede provocar el disparador"
              : targets.size || onlyMisc
                ? pp.requirement
                  ? reqOk.detail
                  : ""
                : "Nadie en el once recibe el efecto",
          targets: [...targets],
          weight,
        });
    }
  }

  // --- Poder de cada técnica ---
  for (const m of members) {
    for (const s of ["kick", "technique", "block", "catch"] as StatKey[]) {
      m.stat[s] = m.player.stats[s] * sScale * (1 + m.zone.bonus / 100) + m.statBuff[s];
    }
    for (const tc of m.techs) {
      const tech = tc.tech;
      const lv = tech.levels[Math.min(lvl, tech.levels.length - 1)];
      let power = lv.power;
      for (const pm of m.powerMods) {
        if (pm.name && pm.name !== tech.name) continue;
        if (pm.types && !pm.types.includes(tech.type)) continue;
        if (pm.elements && !pm.elements.includes(tech.element)) continue;
        power += pm.value;
      }
      let crit = lv.critical;
      for (const c of m.critAdd) {
        if (c.name && c.name !== tech.name) continue;
        if (c.types && !c.types.includes(tech.type)) continue;
        if (c.elements && !c.elements.includes(tech.element)) continue;
        crit += c.value;
      }
      let tpCost = lv.tp;
      for (const c of m.tpCostCut) if (!c.name || c.name === tech.name) tpCost -= c.value;
      tpCost = Math.max(5, tpCost);
      let mult = 1 + (tc.elemMatch ? 0.2 : 0);
      if (opts.rivalElement) {
        if (BEATS[tech.element] === opts.rivalElement) mult += 0.1;
        else if (BEATS[opts.rivalElement] === tech.element) mult -= 0.1;
      }
      const critFactor = 1 + (Math.min(100, crit) / 100) * (lv.criticalBonus / 100);
      const stat = m.stat[TYPE_STAT[tech.type]];
      Object.assign(tc, { power, stat, crit, tpCost, duel: duel(stat, power, mult) * critFactor });
      const cur = m.best[tech.type];
      if (!cur || tc.duel > cur.duel) m.best[tech.type] = tc;
    }
  }

  // --- Rival de referencia modificado por nuestras pasivas de debilitación ---
  const rival = {} as Evaluation["rival"];
  for (const r of Object.keys(BENCH) as Role[]) {
    const stat = benchStat(r, L) + rivalMod[r].stat;
    const power = BENCH[r].power + rivalMod[r].power;
    rival[r] = { stat, power, duel: duel(stat, power, BENCH[r].mult) };
  }

  // --- Partes de la puntuación ---
  // Ataque: la guía japonesa insiste en que manda el "一発" (un tiro que rompa al portero),
  // así que pesa mucho el mejor tirador.
  const tpUses = (m: MemberCalc, t: TechCalc) => Math.min(1, m.tpMax / t.tpCost / 3);
  const shooters = members
    .filter((m) => m.best.Tiro && shootPropensity(m) >= 0.5)
    .map((m) => {
      const t = m.best.Tiro!;
      const weight = Math.min(1, shootPropensity(m) + 0.1) * (m.slot.position === "FW" ? 1 : 0.6);
      const p = winProb(t.duel / rival.catch.duel) * (0.85 + 0.15 * tpUses(m, t));
      return { member: m, tech: t, p, weight };
    })
    .sort((a, b) => b.p * b.weight - a.p * a.weight);
  const shotW = [0.55, 0.3, 0.15];
  let attack = shooters.slice(0, 3).reduce((s, x, i) => s + shotW[i] * x.p * x.weight, 0);
  const chainers = members.filter((m) => m.techs.some((t) => t.tech.chain && t.tech.type === "Tiro")).length;
  if (chainers >= 2) attack = Math.min(1, attack * 1.04);

  // Defensa: portero + bloqueos de tiro de la defensa
  const gkMember = members.find((m) => m.slot.position === "GK");
  let keeper: Evaluation["keeper"];
  let saveP = 0;
  if (gkMember) {
    const t = gkMember.best.Parada;
    const d = t ? t.duel : duel(gkMember.stat.catch, 40, 1);
    saveP = winProb(d / rival.shot.duel) * (t ? 0.85 + 0.15 * tpUses(gkMember, t) : 0.6);
    keeper = { member: gkMember, tech: t, p: saveP };
  }
  const blockers = members
    .filter(shootBlocker)
    .map((m) => {
      const t = m.techs.filter((x) => x.tech.shootBlock && x.tech.type === "Bloqueo").sort((a, b) => b.duel - a.duel)[0];
      return { member: m, tech: t, p: winProb(t.duel / rival.shot.duel) * m.activity * (m.slot.position === "DF" ? 1 : 0.7) };
    })
    .sort((a, b) => b.p - a.p)
    .slice(0, 2);
  // keeper 50 = modelo normal; por encima, la portería tiende a "solo el portero"; por debajo, los
  // bloqueos de tiro pesan más.
  const kp = prefs.keeper;
  const blockF = 0.3 * (kp < 50 ? 1 + (50 - kp) / 50 : 1);
  const leak = (1 - saveP) * blockers.reduce((s, b) => s * (1 - blockF * b.p), 1);
  const defense = kp > 50 ? (1 - leak) * (1 - (kp - 50) / 50) + saveP * ((kp - 50) / 50) : 1 - leak;

  // Medio campo: regates (MF/FW) contra la defensa rival, y robos (DF/MF) contra el regate rival
  const dribblers = members
    .filter((m) => m.best.Regate && (m.slot.position === "MF" || m.slot.position === "FW"))
    .map((m) => ({ member: m, tech: m.best.Regate!, p: winProb(m.best.Regate!.duel / rival.block.duel) * m.activity }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3);
  const tacklers = members
    .filter((m) => m.best.Bloqueo && (m.slot.position === "DF" || m.slot.position === "MF"))
    .map((m) => ({ member: m, tech: m.best.Bloqueo!, p: winProb(m.best.Bloqueo!.duel / rival.dribble.duel) * m.activity }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 4);
  const avgTop = (xs: { p: number }[], n: number) => xs.slice(0, n).reduce((s, x) => s + x.p, 0) / n;
  const dribble = avgTop(dribblers, 3);
  const block = avgTop(tacklers, 4);

  // Combos: cuánto poder de duelo aporta cada fuente a cada compañero (en su técnica más relevante)
  const comboMap = new Map<string, Combo>();
  const STAT_NAME: Record<StatKey, string> = { kick: "Tiro", technique: "Técnica", block: "Bloqueo", catch: "Parada" };
  for (const { from, to, e, w } of links) {
    let delta = 0;
    let what = "";
    if (e.kind === "stat") {
      for (const s of e.stats ?? []) {
        const t = to.techs.filter((x) => TYPE_STAT[x.tech.type] === s).sort((a, b) => b.duel - a.duel)[0];
        if (t && t.stat > 0) delta += (w * t.duel) / t.stat;
      }
      what = `+${Math.round(w)} ${(e.stats ?? []).map((s) => STAT_NAME[s]).join("/")}`;
    } else {
      const t = to.techs
        .filter((x) => (!e.techName || x.tech.name === e.techName) && (!e.techTypes || e.techTypes.includes(x.tech.type)) && (!e.techElements || e.techElements.includes(x.tech.element)))
        .sort((a, b) => b.duel - a.duel)[0];
      if (t && t.power > 0) delta = (w * t.duel) / t.power;
      what = `+${Math.round(w)} poder${e.techName ? ` a «${e.techName}»` : e.techTypes ? ` de ${e.techTypes.join("/")}` : ""}`;
    }
    if (delta <= 0) continue;
    const key = `${from}→${to.player.id}`;
    const c = comboMap.get(key) ?? { from, to: to.player.name, toId: to.player.id, delta: 0, what: [] };
    c.delta += delta;
    if (!c.what.includes(what)) c.what.push(what);
    comboMap.set(key, c);
  }
  const combos = [...comboMap.values()].sort((a, b) => b.delta - a.delta);

  const engines: Engine[] = fast
    ? []
    : [...engineUse.entries()]
        .map(([trigger, set]) => ({ trigger, weight: TW[trigger], feeders: feeders[trigger] ?? [], beneficiaries: [...set] }))
        .sort((a, b) => b.beneficiaries.length * b.weight - a.beneficiaries.length * a.weight);

  const parts = { attack, defense, dribble, block };
  const wSum = prefs.attack + prefs.defense + prefs.dribble + prefs.block || 1;
  let score = (100 * (prefs.attack * attack + prefs.defense * defense + prefs.dribble * dribble + prefs.block * block)) / wSum;
  if (prefs.requireFormation && !formationActive) score *= 0.6;
  return { score, parts, members, formationActive, conditions, passives: reports, rival, shooters, keeper, blockers, dribblers, tacklers, engines, combos };
}

// ---------- Poder de cada técnica de un jugador, sin equipo ----------

export interface SoloTech {
  tech: Technique;
  known: boolean; // ya aprendida al nivel dado
  power: number; // poder de técnica (nivel de técnica + pasivas propias)
  base: number; // duelo solo con estadística y técnica
  full: number; // + mejor zona + pasivas propias siempre activas
  tp: number;
  range: number;
}

/** Poder aproximado de cada técnica del jugador por sí solo: sin entrenador, sin compañeros y sin
 *  pasivas que dependan del partido o de requisitos de equipo. */
export function soloTechniques(player: Player, opts: EvalOptions & { stage?: number }): SoloTech[] {
  const L = Math.max(1, Math.min(MAX_LEVEL, opts.playerLevel ?? MAX_LEVEL));
  const lvl = Math.max(1, Math.min(10, opts.techLevel)) - 1;
  const stage = opts.stage ?? 10;
  const sScale = statScale(L);
  const zone = Math.max(0, ...player.zones.map((z) => z.bonus));
  const statBuff: Record<StatKey, number> = gearFor(opts.gear, player.position);
  const mods: PowerMod[] = [];
  const crits: PowerMod[] = [];
  const cuts: { value: number; name?: string }[] = [];
  for (const pp of playerPassives(player)) {
    if (pp.requirement) continue;
    const { lvl: pl, max } = passiveLevel(pp, L, stage);
    if (!pl) continue;
    for (const e of pp.effects) {
      if (e.side !== "ally" || e.scope !== "self" || e.trigger !== "start") continue;
      const v = (e.value * pl) / max;
      if (e.kind === "stat") for (const s of e.stats ?? []) statBuff[s] += v;
      else if (e.kind === "power") mods.push({ value: v, types: e.techTypes, elements: e.techElements, name: e.techName });
      else if (e.kind === "crit") crits.push({ value: v, types: e.techTypes, elements: e.techElements, name: e.techName });
      else if (e.kind === "tpCost") cuts.push({ value: v, name: e.techName });
    }
  }
  const hits = (m: PowerMod, t: Technique) =>
    (!m.name || m.name === t.name) && (!m.types || m.types.includes(t.type)) && (!m.elements || m.elements.includes(t.element));
  return withExtra(player, opts.extraTech?.(player.id)).map((tech) => {
    const lv = tech.levels[Math.min(lvl, tech.levels.length - 1)];
    const key = TYPE_STAT[tech.type];
    const mult = 1 + (tech.element === player.element ? 0.2 : 0);
    const stat0 = player.stats[key] * sScale;
    const power = lv.power + mods.filter((m) => hits(m, tech)).reduce((s, m) => s + m.value, 0);
    const crit = lv.critical + crits.filter((m) => hits(m, tech)).reduce((s, m) => s + m.value, 0);
    const critF = (c: number) => 1 + (Math.min(100, c) / 100) * (lv.criticalBonus / 100);
    return {
      tech,
      known: tech.unlock <= L,
      power,
      base: duel(stat0, lv.power, mult) * critF(lv.critical),
      full: duel(stat0 * (1 + zone / 100) + statBuff[key], power, mult) * critF(crit),
      tp: Math.max(5, lv.tp - cuts.filter((c) => !c.name || c.name === tech.name).reduce((s, c) => s + c.value, 0)),
      range: lv.range,
    };
  });
}

function requirementMet(pp: ParsedPassive, members: MemberCalc[]): { ok: boolean; detail: string } {
  const r = pp.requirement;
  if (!r) return { ok: true, detail: "" };
  const n = members.filter((m) =>
    r.tags ? r.tags.some((t) => m.player.tags.includes(t)) : r.elements ? r.elements.includes(m.player.element) : false,
  ).length;
  const what = r.tags ? r.tags.join(" o ") : (r.elements ?? []).join("/");
  return { ok: n >= r.count, detail: `${n}/${r.count} ${what}` };
}

export { describeTargets };
