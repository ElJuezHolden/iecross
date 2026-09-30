"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { COACHES, PLAYERS, PLAYER_BY_ID } from "@/lib/data";
import { ARCHETYPES } from "@/lib/archetypes";
import { DEFAULT_PREFS, evaluate, type Lineup, type Prefs } from "@/lib/engine";
import { effectiveGear, useProfiles } from "@/lib/store";
import { ProfileBar } from "@/components/ui";
import { TeamCard } from "@/components/TeamCard";

const TIER_CLASS = { SS: "bg-bolt text-bolt-ink", S: "bg-good text-bg", A: "bg-viento text-bg", B: "bg-panel-2 text-muted" } as const;

export default function TopPage() {
  const ctx = useProfiles();
  const { profile } = ctx;
  // Resultados etiquetados con la clave con la que se calcularon: si cambia, se ignoran solos.
  const [res, setRes] = useState<{ key: string; best: Record<string, Lineup>; done: number }>({ key: "", best: {}, done: 0 });
  const workers = useRef<Worker[]>([]);

  // Se recalcula al cambiar de perfil o de nivel/equipamiento (dependen de tu nivel)
  const key = profile ? `${profile.id}:${profile.level}:${profile.gearMode}` : "";
  useEffect(() => {
    if (!profile) return;
    workers.current.forEach((w) => w.terminate());
    workers.current = [];
    const n = Math.max(1, Math.min(ARCHETYPES.length, 6, (navigator.hardwareConcurrency || 4) - 1));
    const gear = effectiveGear(profile);
    const scores: Record<string, number> = {};
    for (let k = 0; k < n; k++) {
      const w = new Worker(new URL("../../lib/recommend.worker.ts", import.meta.url));
      workers.current.push(w);
      const mine = ARCHETYPES.filter((_, i) => i % n === k);
      let pending = mine.length;
      w.onmessage = (e) => {
        if (e.data.type === "result") {
          const a = ARCHETYPES.find((x) => `arch:${x.id}` === e.data.tag)!;
          // Para elegir entre entrenadores se usa el estilo del arquetipo
          const prefs = { ...DEFAULT_PREFS, ...a.prefs };
          const s = evaluate(e.data.lineup, { techLevel: 10, playerLevel: profile.level, gear, prefs }).score;
          if (s > (scores[a.id] ?? -Infinity)) {
            scores[a.id] = s;
            setRes((prev) => (prev.key === key ? { ...prev, best: { ...prev.best, [a.id]: e.data.lineup } } : { key, best: { [a.id]: e.data.lineup }, done: 0 }));
          }
        } else if (e.data.type === "done") {
          setRes((prev) => (prev.key === key ? { ...prev, done: prev.done + 1 } : { key, best: {}, done: 1 }));
          if (--pending === 0) w.terminate();
        }
      };
      for (const a of mine) {
        const pool = a.tag ? PLAYERS.filter((p) => p.tags.includes(a.tag!)).map((p) => p.id) : PLAYERS.map((p) => p.id);
        const coaches = (a.coachIds.length ? a.coachIds : COACHES.map((c) => c.id)).map((id) => ({ id, level: 10 }));
        w.postMessage({ tag: `arch:${a.id}`, pool, coaches, techLevel: 10, playerLevel: profile.level, stages: {}, locked: a.core, prefs: { ...DEFAULT_PREFS, ...a.prefs } as Prefs, gear });
      }
    }
    return () => workers.current.forEach((w) => w.terminate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const best = useMemo(() => (res.key === key ? res.best : {}), [res, key]);
  const done = res.key === key ? res.done : 0;

  const cards = useMemo(() => {
    if (!profile) return [];
    const gear = effectiveGear(profile);
    const owned = new Set(profile.owned);
    return ARCHETYPES.map((a) => {
      const l = best[a.id];
      if (!l) return { a };
      // Para comparar arquetipos entre sí, todos se puntúan con el estilo Equilibrado
      const ev = evaluate(l, { techLevel: 10, playerLevel: profile.level, gear, prefs: DEFAULT_PREFS });
      const s10 = ev.score / 5;
      const tier = (s10 >= 9.5 ? "SS" : s10 >= 8 ? "S" : s10 >= 6 ? "A" : "B") as keyof typeof TIER_CLASS;
      const ids = l.slots.filter((x): x is string => !!x);
      const missing = ids.filter((id) => !owned.has(id));
      return { a, l, ev, tier, have: ids.length - missing.length, missing };
    });
  }, [best, profile]);

  if (!profile) return <p className="text-muted">Cargando…</p>;

  return (
    <div className="space-y-5">
      <section>
        <h1 className="font-display text-4xl font-extrabold tracking-wide">Equipos top</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Los arquetipos más fuertes del juego, calculados con <b className="text-text">toda la base</b> (despertar máximo y entrenador a Nv 10) a tu
          nivel ({profile.level}) y con tu equipamiento. Cada uno fija las piezas que definen su estrategia y completa el resto con los mejores. Debajo
          de cada uno ves cuántos de esos jugadores tienes y cuáles te faltan. Todos se puntúan con el estilo Equilibrado para poder compararlos; el Tier sale
          de esa puntuación (SS desde 9,5).
          
        </p>
      </section>
      <ProfileBar ctx={ctx} />
      {done < ARCHETYPES.length && (
        <p className="text-sm text-muted">
          Calculando arquetipos… {Object.keys(best).length}/{ARCHETYPES.length}
        </p>
      )}

      <div className="space-y-6">
        {cards
          .slice()
          .sort((x, y) => (y.ev?.score ?? -1) - (x.ev?.score ?? -1))
          .map(({ a, l, ev, tier, have, missing }) => (
            <section key={a.id} className="space-y-2">
              <div className="rounded-xl border border-line bg-panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {tier && <span className={`rounded px-2 py-0.5 font-display text-sm font-extrabold ${TIER_CLASS[tier]}`}>Tier {tier}</span>}
                  <h2 className="font-display text-2xl font-bold">{a.title}</h2>
                  {ev && (
                    <span className={`ml-auto rounded-full px-3 py-1 text-sm font-semibold ${have === 11 ? "bg-good/20 text-good" : "bg-panel-2 text-muted"}`}>
                      Tienes {have}/11
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted">{a.summary}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  {a.keys.map((k) => (
                    <li key={k} className="rounded bg-panel-2 px-1.5 py-0.5">
                      {k}
                    </li>
                  ))}
                </ul>
                {missing && missing.length > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    Te faltan:{" "}
                    {missing.map((id, i) => (
                      <span key={id}>
                        {i > 0 && ", "}
                        <b className="text-text">{PLAYER_BY_ID.get(id)?.name}</b>
                        {a.core.includes(id) && <span className="text-bolt"> (clave)</span>}
                      </span>
                    ))}
                  </p>
                )}
              </div>
              {l && ev ? (
                <TeamCard ev={ev} coachId={l.coachId} coachLevel={l.coachLevel} pinned={a.core} />
              ) : (
                <p className="text-sm text-muted">Calculando…</p>
              )}
            </section>
          ))}
      </div>
    </div>
  );
}
