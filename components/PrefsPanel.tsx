"use client";
import { useState } from "react";
import { DEFAULT_PREFS, PRESETS, type Prefs } from "@/lib/engine";

function Slider({ label, hint, value, min, max, step = 1, format, onChange }: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block" title={hint}>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <b className="tabular-nums text-bolt">{format(value)}</b>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--bolt)]" />
      <div className="-mt-1 text-[11px] text-muted">{hint}</div>
    </label>
  );
}

const norm = (p: Prefs) => ({ ...p, debuffTrust: p.debuffTrust ?? 1 });
const same = (a: Prefs, b: Prefs) => {
  const x = norm(a);
  const y = norm(b);
  return (Object.keys(x) as (keyof Prefs)[]).every((k) => x[k] === y[k]);
};

export function PrefsPanel({ prefs, onChange }: { prefs: Prefs; onChange: (p: Prefs) => void }) {
  const [open, setOpen] = useState(false);
  const active = PRESETS.find((p) => same(p.prefs, prefs));
  const sum = prefs.attack + prefs.defense + prefs.dribble + prefs.block || 1;
  const pct = (v: number) => `${Math.round((v / sum) * 100)}%`;
  const set = (patch: Partial<Prefs>) => onChange({ ...prefs, ...patch });

  return (
    <div className="rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">Estilo</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            title={p.hint}
            onClick={() => onChange(p.prefs)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${active?.id === p.id ? "bg-bolt text-bolt-ink" : "bg-panel-2 hover:bg-line"}`}
          >
            {p.label}
          </button>
        ))}
        {!active && <span className="rounded-full border border-bolt/60 px-3 py-1 text-sm text-bolt">Personalizado</span>}
        <button onClick={() => setOpen(!open)} className="ml-auto text-sm font-semibold text-bolt hover:underline">
          {open ? "Ocultar ajustes" : "⚙ Personalizar"}
        </button>
      </div>
      {active && !open && <p className="-mt-1 px-3 pb-3 text-xs text-muted">{active.hint}</p>}

      {open && (
        <div className="grid gap-x-8 gap-y-4 border-t border-line p-4 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Qué importa más</h3>
            <Slider label="Ataque" hint="Que tus tiros superen al portero rival" value={prefs.attack} min={0} max={100} format={() => pct(prefs.attack)} onChange={(v) => set({ attack: v })} />
            <Slider label="Portería" hint="Portero + bloqueos de tiro frente al tiro rival" value={prefs.defense} min={0} max={100} format={() => pct(prefs.defense)} onChange={(v) => set({ defense: v })} />
            <Slider label="Regate" hint="Pasar a la defensa rival con técnicas de regate" value={prefs.dribble} min={0} max={100} format={() => pct(prefs.dribble)} onChange={(v) => set({ dribble: v })} />
            <Slider label="Robo" hint="Frenar los regates rivales" value={prefs.block} min={0} max={100} format={() => pct(prefs.block)} onChange={(v) => set({ block: v })} />
          </div>
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Cómo se juega</h3>
            <Slider
              label="Portero o bloqueadores"
              hint="Izquierda: la portería se apoya en los bloqueos de tiro de la defensa. Derecha: todo recae en el poder del portero (bruto o con sus pasivas)."
              value={prefs.keeper}
              min={0}
              max={100}
              step={5}
              format={(v) => (v < 35 ? "Bloqueadores" : v > 65 ? "Portero" : "Mixto")}
              onChange={(v) => set({ keeper: v })}
            />
            <Slider
              label="Confianza en pasivas de partido"
              hint="Las que se cargan «cada vez que…» (acumulaciones). Bájala para priorizar potencia garantizada; súbela si tu equipo suele cargarlas bien."
              value={prefs.eventTrust}
              min={0}
              max={1.5}
              step={0.05}
              format={(v) => (v === 0 ? "No contar" : v < 0.6 ? `Poca (×${v.toFixed(2)})` : v <= 1.05 ? `Normal (×${v.toFixed(2)})` : `Optimista (×${v.toFixed(2)})`)}
              onChange={(v) => set({ eventTrust: v })}
            />
            <Slider
              label="Peso de debilitar al rival"
              hint="Pasivas que bajan la Parada del portero rival, el Bloqueo de su defensa o la Técnica de su medio (Caos, Géminis…). Súbelo para priorizar equipos que hunden al rival."
              value={prefs.debuffTrust ?? 1}
              min={0}
              max={2.5}
              step={0.1}
              format={(v) => (v === 0 ? "No contar" : v < 0.8 ? `Poco (×${v.toFixed(1)})` : v <= 1.2 ? `Normal (×${v.toFixed(1)})` : `Mucho (×${v.toFixed(1)})`)}
              onChange={(v) => set({ debuffTrust: v })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs.requireFormation} onChange={(e) => set({ requireFormation: e.target.checked })} />
              Exigir la formación activa (cumplir los requisitos de casilla)
            </label>
            <button onClick={() => onChange(DEFAULT_PREFS)} className="text-xs text-muted hover:text-text">Restablecer</button>
          </div>
        </div>
      )}
    </div>
  );
}
