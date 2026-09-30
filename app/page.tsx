"use client";
import { withBase } from "@/lib/paths";
import { useMemo, useState } from "react";
import Link from "next/link";
import { COACHES, PLAYERS, TEAMS } from "@/lib/data";
import { coachLevel, stageOf, useProfiles } from "@/lib/store";
import { AWAKEN_RANKS, MAX_LEVEL, gearLevel } from "@/lib/engine";
import { MAIN_STAT, autoGear } from "@/lib/gear";

const GEAR_STATS = [
  ["kick", "Tiro"],
  ["technique", "Técnica"],
  ["block", "Bloqueo"],
  ["catch", "Parada"],
] as const;
import { ElementDot, Face, PosBadge, ProfileBar, Stars, TechOptions } from "@/components/ui";
import { BooksCard } from "@/components/BooksCard";
import type { Element, Position } from "@/lib/types";

const POSITIONS: Position[] = ["GK", "DF", "MF", "FW"];
const ELEMENTS: Element[] = ["Fuego", "Viento", "Bosque", "Montaña"];

export default function RosterPage() {
  const ctx = useProfiles();
  const { profile, update } = ctx;
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<Position | "">("");
  const [el, setEl] = useState<Element | "">("");
  const [team, setTeam] = useState("");
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [bulk, setBulk] = useState<null | "mark" | "unmark">(null);

  const owned = useMemo(() => new Set(profile?.owned ?? []), [profile]);
  const locked = useMemo(() => new Set(profile?.locked ?? []), [profile]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return PLAYERS.filter(
      (p) =>
        (!pos || p.position === pos) &&
        (!el || p.element === el) &&
        (!team || p.team === team) &&
        (!onlyOwned || owned.has(p.id)) &&
        (!onlyPinned || locked.has(p.id)) &&
        (!s || [p.name, ...p.aliases, p.team, ...p.tags].join(" ").toLowerCase().includes(s)),
    ).sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || b.stars - a.stars || b.stats.power - a.stats.power);
  }, [q, pos, el, team, onlyOwned, owned, onlyPinned, locked]);

  if (!profile) return <p className="text-muted">Cargando…</p>;

  const pinned = new Set(profile.locked);
  const toggle = (id: string) =>
    update((p) =>
      p.owned.includes(id)
        ? { ...p, owned: p.owned.filter((x) => x !== id), locked: p.locked.filter((x) => x !== id) }
        : { ...p, owned: [...p.owned, id] },
    );
  const togglePin = (id: string) =>
    update((p) => ({
      ...p,
      locked: p.locked.includes(id) ? p.locked.filter((x) => x !== id) : p.locked.length >= 11 ? p.locked : [...p.locked, id],
    }));
  const setMany = (ids: string[], on: boolean) =>
    update((p) =>
      on
        ? { ...p, owned: [...new Set([...p.owned, ...ids])] }
        : { ...p, owned: p.owned.filter((x) => !ids.includes(x)), locked: p.locked.filter((x) => !ids.includes(x)) },
    );

  return (
    <div className="space-y-5">
      <section>
        <h1 className="font-display text-4xl font-extrabold tracking-wide">Mi plantilla</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Marca los jugadores y entrenadores que tienes. Con eso generamos los equipos más fuertes que puedes montar, calculando
          estadísticas, zonas, técnicas, elementos y todas las pasivas que se activan entre ellos.
        </p>
      </section>

      <ProfileBar ctx={ctx} />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nombre, equipo, etiqueta…"
              className="min-w-48 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-bolt"
            />
            <select value={pos} onChange={(e) => setPos(e.target.value as Position | "")} className="rounded-lg border border-line bg-panel px-2 py-2 text-sm">
              <option value="">Posición</option>
              {POSITIONS.map((x) => <option key={x}>{x}</option>)}
            </select>
            <select value={el} onChange={(e) => setEl(e.target.value as Element | "")} className="rounded-lg border border-line bg-panel px-2 py-2 text-sm">
              <option value="">Elemento</option>
              {ELEMENTS.map((x) => <option key={x}>{x}</option>)}
            </select>
            <select value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-lg border border-line bg-panel px-2 py-2 text-sm">
              <option value="">Equipo</option>
              {TEAMS.map((x) => <option key={x}>{x}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} /> Solo los míos
            </label>
            <label className="flex items-center gap-1.5 text-sm text-muted" title="Los fijados salen obligatoriamente en todos los equipos generados">
              <input type="checkbox" checked={onlyPinned} onChange={(e) => setOnlyPinned(e.target.checked)} /> Solo fijados 📌
            </label>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>
              <b className="text-text">{profile.owned.length}</b> de {PLAYERS.length} marcados · mostrando {list.length}
              {profile.locked.length > 0 && (
                <>
                  {" · "}
                  <button onClick={() => setOnlyPinned(!onlyPinned)} className="font-bold text-bolt hover:underline" title="Salen obligatoriamente en todos los equipos generados. Pulsa para verlos.">
                    📌 {profile.locked.length} fijados
                  </button>
                </>
              )}
            </span>
            <button className="ml-auto hover:text-text" onClick={() => setBulk("mark")}>Marcar los mostrados</button>
            <button className="hover:text-text" onClick={() => setBulk("unmark")}>Desmarcar</button>
          </div>
          {bulk && (() => {
            // Cuántos cambian de verdad: los que no estaban marcados (o sí, al desmarcar)
            const affected = list.filter((p) => (bulk === "mark" ? !owned.has(p.id) : owned.has(p.id))).length;
            return (
              <div className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm ${bulk === "unmark" ? "border-bad/50 bg-bad/10" : "border-bolt/50 bg-bolt/10"}`}>
                <span>
                  {affected === 0 ? (
                    <>No hay nada que cambiar: {bulk === "mark" ? "ya tienes marcados todos los que se muestran." : "ninguno de los que se muestran está marcado."}</>
                  ) : bulk === "mark" ? (
                    <>
                      ¿Marcar como tuyos <b>{affected}</b> {affected === 1 ? "jugador más" : "jugadores más"} (todos los que se muestran ahora)?
                    </>
                  ) : (
                    <>
                      ⚠ ¿Desmarcar <b>{affected}</b> {affected === 1 ? "jugador" : "jugadores"} de tu plantilla? Dejarán de contar para los equipos y se les quita el fijado (su despertar y
                      3.ª técnica se guardan por si los vuelves a marcar).
                    </>
                  )}
                </span>
                <div className="ml-auto flex gap-2">
                  {affected > 0 && (
                    <button
                      onClick={() => {
                        setMany(list.map((p) => p.id), bulk === "mark");
                        setBulk(null);
                      }}
                      className={`rounded-lg px-3 py-1.5 font-semibold ${bulk === "unmark" ? "bg-bad text-white" : "bg-bolt text-bolt-ink"}`}
                    >
                      {bulk === "mark" ? `Sí, marcar ${affected}` : `Sí, desmarcar ${affected}`}
                    </button>
                  )}
                  <button onClick={() => setBulk(null)} className="rounded-lg border border-line px-3 py-1.5 hover:text-text">
                    {affected > 0 ? "Cancelar" : "Cerrar"}
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {list.map((p) => {
              const on = owned.has(p.id);
              const st = stageOf(profile, p.id);
              return (
                <div
                  key={p.id}
                  className={`relative rounded-lg border transition ${
                    on ? "border-bolt bg-panel-2 shadow-[0_0_0_1px_var(--bolt)]" : "border-line bg-panel opacity-70 hover:opacity-100"
                  }`}
                >
                  <button onClick={() => toggle(p.id)} className="flex w-full items-center gap-2 p-2 text-left">
                    <Face p={p} size={44} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{p.name}</div>
                      <div className="flex items-center gap-1.5">
                        <PosBadge pos={p.position} /> <ElementDot el={p.element} /> <Stars n={p.stars} />
                      </div>
                      <div className="truncate text-[11px] text-muted">{p.team}</div>
                    </div>
                    <span className={`absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-xs font-black ${on ? "bg-bolt text-bolt-ink" : "border border-line text-transparent"}`}>✓</span>
                    {locked.has(p.id) && (
                      <span className="absolute right-7 top-1 rounded-full bg-bolt px-1 text-xs" title="Fijado: sale en todos los equipos generados">
                        📌
                      </span>
                    )}
                  </button>
                  {on && (
                    <label className="flex items-center gap-1 border-t border-line/70 px-2 py-1 text-[11px] text-muted" title="Rango de despertar: sube las pasivas de despertar (TP+ en Advanced/Top/Legendary, pasiva única en Advanced+/Top+/Legendary+)">
                      <button
                        type="button"
                        title={pinned.has(p.id) ? "Fijado: saldrá en todos los equipos. Pulsa para quitar." : "Fijar: que salga sí o sí en los equipos"}
                        onClick={(e) => {
                          e.preventDefault();
                          togglePin(p.id);
                        }}
                        className={`rounded px-1 ${pinned.has(p.id) ? "bg-bolt text-bolt-ink" : "grayscale hover:grayscale-0"}`}
                      >
                        📌
                      </button>
                      Despertar
                      <select
                        value={st}
                        onChange={(e) => update((pr) => ({ ...pr, stages: { ...pr.stages, [p.id]: Number(e.target.value) } }))}
                        className={`ml-auto rounded border border-line bg-panel px-1 py-0.5 text-[11px] ${st >= 6 ? "text-bolt" : "text-text"}`}
                      >
                        {AWAKEN_RANKS.map((r, i) => (
                          <option key={r} value={i + 1} disabled={p.stars >= 3 && i + 1 < 3}>
                            {p.stars >= 3 && i + 1 >= 3 ? `${i - 2}凸 · ` : ""}
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {on && (
                    <label className="flex items-center gap-1 border-t border-line/70 px-2 py-1 text-[11px] text-muted" title="3.ª técnica aprendida con un manual (秘伝書). Cualquier jugador puede aprender cualquier técnica.">
                      📘
                      <select
                        value={profile.extraTech?.[p.id] ?? ""}
                        onChange={(e) =>
                          update((pr) => {
                            const extraTech = { ...pr.extraTech };
                            if (e.target.value) extraTech[p.id] = e.target.value;
                            else delete extraTech[p.id];
                            return { ...pr, extraTech };
                          })
                        }
                        className={`ml-auto min-w-0 flex-1 rounded border border-line bg-panel px-1 py-0.5 text-[11px] ${profile.extraTech?.[p.id] ? "text-bolt" : "text-muted"}`}
                      >
                        <option value="">3.ª técnica: ninguna</option>
                        <TechOptions exclude={p.techniques.map((t) => t.code)} />
                      </select>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-3">
          <div className="rounded-xl border border-line bg-panel p-3">
            <h2 className="font-display text-xl font-bold">Entrenadores</h2>
            <p className="mb-2 text-xs text-muted">Nivel de cada uno (— = no lo tienes). Su pasiva escala mucho con el nivel.</p>
            <div className="space-y-1.5">
              {COACHES.map((c) => {
                const lv = coachLevel(profile, c.id);
                return (
                  <div key={c.id} className={`flex items-center gap-2 ${lv ? "" : "opacity-50"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={withBase(c.assets.small.replace(/^assets\//, ""))} alt="" className="h-8 w-8 rounded bg-panel-2" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{c.name}</div>
                      <div className="truncate text-[11px] text-muted">{c.formation.name}</div>
                    </div>
                    <select
                      value={lv}
                      onChange={(e) => update((p) => ({ ...p, coaches: { ...p.coaches, [c.id]: Number(e.target.value) } }))}
                      className="rounded border border-line bg-panel-2 px-1 py-0.5 text-sm"
                    >
                      {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i === 0 ? "—" : `Nv ${i}`}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-line bg-panel p-3">
            <h2 className="font-display text-xl font-bold">Nivel de tus jugadores</h2>
            <p className="mb-2 text-xs text-muted">
              El nivel mínimo de tu plantilla. Las pasivas de nivel suben +1 cada 30 niveles (se desbloquean en 11, 21 y 31) y la
              2.ª técnica se aprende a nivel 31.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={MAX_LEVEL}
                value={profile.level}
                onChange={(e) => update((p) => ({ ...p, level: Number(e.target.value) }))}
                className="flex-1 accent-[var(--bolt)]"
              />
              <input
                type="number"
                min={1}
                max={MAX_LEVEL}
                value={profile.level}
                onChange={(e) => update((p) => ({ ...p, level: Math.max(1, Math.min(MAX_LEVEL, Number(e.target.value) || 1)) }))}
                className="w-16 rounded border border-line bg-panel-2 px-1 py-0.5 text-right text-sm"
              />
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Pasivas de nivel a Nv {profile.level}: {[11, 21, 31].map((s) => (profile.level >= s ? Math.floor((profile.level - s) / 30) + 1 : 0)).join(" / ")} (máx. 15/14/14)
            </p>
          </div>
          <BooksCard profile={profile} update={update} />
          <div className="rounded-xl border border-line bg-panel p-3">
            <h2 className="font-display text-xl font-bold">Equipamiento</h2>
            <p className="mb-2 text-xs text-muted">
              Límite de equipo con tu nivel: <b className="text-bolt">Lv {gearLevel(profile.level)}</b> (sube cada 5 niveles). 6 piezas por
              posición; cada una suma a todos los jugadores de esa posición recomendada.
            </p>
            <div className="mb-2 flex overflow-hidden rounded-lg border border-line text-xs">
              {(["auto", "manual"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => update((p) => ({ ...p, gearMode: m, gear: m === "manual" && !p.gear ? autoGear(p.level).gear : p.gear }))}
                  className={`flex-1 px-2 py-1 ${(profile.gearMode ?? "auto") === m ? "bg-bolt font-semibold text-bolt-ink" : "bg-panel-2"}`}
                >
                  {m === "auto" ? "Automático (6 piezas al límite)" : "Manual"}
                </button>
              ))}
            </div>
            {(profile.gearMode ?? "auto") === "auto" ? (
              <table className="w-full text-xs tabular-nums">
                <thead className="text-muted">
                  <tr>
                    <th />
                    {GEAR_STATS.map(([, label]) => <th key={label} className="pb-1 text-right font-normal">{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(["FW", "MF", "DF", "GK"] as const).map((pos) => {
                    const ag = autoGear(profile.level);
                    return (
                      <tr key={pos} title={ag.estimated[pos] ? "Estimado: faltan datos reales de alguna pieza de esta posición" : "Datos reales del juego"}>
                        <td className="pr-1">
                          <PosBadge pos={pos} />
                          {ag.estimated[pos] && <span className="ml-0.5 text-bolt">*</span>}
                        </td>
                        {GEAR_STATS.map(([key]) => (
                          <td key={key} className={`py-0.5 text-right ${MAIN_STAT[pos] === key ? "font-bold text-text" : "text-muted"}`}>
                            +{(ag.gear[pos]?.[key] ?? 0).toLocaleString("es")}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            {(profile.gearMode ?? "auto") === "auto" && (
              <p className="mt-1 text-[11px] text-muted"><span className="text-bolt">*</span> Estimado a partir de las piezas conocidas (ya tenemos FW y MF casi completos).</p>
            )}
            {(profile.gearMode ?? "auto") === "manual" && <table className="w-full text-xs">
              <thead className="text-muted">
                <tr>
                  <th />
                  {GEAR_STATS.map(([, label]) => <th key={label} className="pb-1 font-normal">{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {(["FW", "MF", "DF", "GK"] as const).map((pos) => (
                  <tr key={pos}>
                    <td className="pr-1"><PosBadge pos={pos} /></td>
                    {GEAR_STATS.map(([key]) => (
                      <td key={key} className="p-0.5">
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={profile.gear?.[pos]?.[key] || ""}
                          placeholder="0"
                          onChange={(e) =>
                            update((p) => ({
                              ...p,
                              gear: { ...p.gear, [pos]: { ...p.gear?.[pos], [key]: Math.max(0, Number(e.target.value) || 0) } },
                            }))
                          }
                          className="w-full rounded border border-line bg-panel-2 px-1 py-0.5 text-right tabular-nums"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>}
          </div>
          <div className="rounded-xl border border-line bg-panel p-3">
            <h2 className="font-display text-xl font-bold">Técnicas</h2>
            <label className="mt-1 flex items-center justify-between text-sm text-muted">
              Nivel medio de tus técnicas
              <select
                value={profile.techLevel}
                onChange={(e) => update((p) => ({ ...p, techLevel: Number(e.target.value) }))}
                className="rounded border border-line bg-panel-2 px-1 py-0.5 text-text"
              >
                {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>Nv {i + 1}</option>)}
              </select>
            </label>
          </div>
          <Link
            href="/equipos"
            className={`block rounded-xl bg-bolt px-4 py-3 text-center font-display text-xl font-extrabold text-bolt-ink ${profile.owned.length < 11 ? "pointer-events-none opacity-40" : "hover:brightness-110"}`}
          >
            ⚡ Generar equipos
          </Link>
          {profile.owned.length < 11 && <p className="text-center text-xs text-muted">Marca al menos 11 jugadores.</p>}
        </aside>
      </div>
    </div>
  );
}
