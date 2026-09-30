import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const body = Barlow({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const title = Barlow_Condensed({ variable: "--font-title", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "IE Cross · Generador de equipos",
  description: "Marca los jugadores que tienes en Inazuma Eleven Cross y genera los equipos más fuertes con ellos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${body.variable} ${title.variable} antialiased`}>
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
            <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap font-display text-xl font-extrabold tracking-wide">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-bolt text-bolt-ink">⚡</span>
              IE CROSS <span className="text-bolt">XI</span>
            </Link>
            <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto whitespace-nowrap px-1 text-sm font-semibold sm:ml-auto">
              <Link className="rounded-md px-3 py-1.5 hover:bg-panel-2" href="/">Mi plantilla</Link>
              <Link className="rounded-md px-3 py-1.5 hover:bg-panel-2" href="/top">Equipos top</Link>
              <Link className="rounded-md px-3 py-1.5 hover:bg-panel-2" href="/jugadores">Jugadores</Link>
              <Link className="rounded-md px-3 py-1.5 hover:bg-panel-2" href="/editor">Editor</Link>
              <Link className="rounded-md px-3 py-1.5 hover:bg-panel-2" href="/metodo">Cómo calculamos</Link>
              <Link className="rounded-md bg-bolt px-3 py-1.5 text-bolt-ink hover:brightness-110" href="/equipos">Generar equipos</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted">
          Datos del juego vía <a className="underline" href="https://iecrossdatabase.pages.dev">IE Cross Database</a> (RR_o). Proyecto fan, sin relación con LEVEL-5.
        </footer>
      </body>
    </html>
  );
}
