// Equipos top: arquetipos del meta calculados con TODA la base. Cada uno fija su núcleo (los
// jugadores que definen la estrategia) y deja al optimizador completar el once. Sale de guías
// japonesas (Game8, AppMedia, inacross-guide) y del análisis de todas las pasivas de la base.
import type { Prefs } from "./engine";

export interface Archetype {
  id: string;
  title: string;
  /** Entrenadores entre los que elegir (vacío = todos) */
  coachIds: string[];
  /** Solo jugadores con esta etiqueta de equipo (equipos «puros») */
  tag?: string;
  /** Jugadores que tienen que estar (ids) */
  core: string[];
  prefs?: Partial<Prefs>;
  summary: string;
  keys: string[];
}

export const ARCHETYPES: Archetype[] = [
  {
    id: "hitomiko",
    title: "Hitomiko · tiros largos de Bosque y Viento",
    coachIds: ["71013"],
    core: ["10003", "4008", "4003", "10002", "1166"],
    prefs: { eventTrust: 1.2 },
    summary:
      "El equipo más usado en PvP. Cada tiro que te paran suma +40 al poder de todas las técnicas de Bosque y Viento (acumulable hasta que marcas), así que se tira mucho, también desde el medio con Tenma. Fei remata y reparte poder a los FW de Bosque; Kirino y Kinako cierran atrás y alimentan a Kino Aki.",
    keys: ["Fei Rune y Matsukaze Tenma", "Kirino + Kinako atrás", "Kino Aki en portería", "Mucho tiro lejano para cargar la formación"],
  },
  {
    id: "muro",
    title: "Endou Daisuke · muro de Kino Aki",
    coachIds: ["71012"],
    core: ["1166", "2044", "10002", "4003", "1145"],
    prefs: { keeper: 70 },
    summary:
      "Portería casi imbatible: Kino Aki recibe +80 del entrenador, +62 a su Mano celestial de Hibiki Seigou (versión Young Inazuma) jugando fuera de la portería y se carga cada vez que un bloqueo de tiro falla. Kinako, Kirino y Nishigaki (Malcolm) son bloqueadores que además le suben la Parada. Cada parada da +50 de tiro a todo el equipo para el contraataque.",
    keys: ["Kino Aki + Hibiki Seigou (Young Inazuma)", "Kinako, Kirino y Nishigaki bloqueando tiros", "Un rematador de Fuego arriba"],
  },
  {
    id: "nikaidou",
    title: "Nikaidou · presión con tiros parados",
    coachIds: ["71010"],
    core: ["1168", "2053", "4010"],
    prefs: { eventTrust: 1.2, attack: 50, defense: 25, dribble: 15, block: 10 },
    summary:
      "Cada tiro que el rival para o bloquea da +400 de Tiro a TODO tu equipo, acumulable. Sugata tira de lejos para cargar el contador, Natsumi gana poder de tiro cada vez que te bloquean y Tsurugi (Kenjou) remata con todo acumulado.",
    keys: ["Raimon Natsumi", "Sugata Gen tirando de lejos", "Kenjou Kyousuke de rematador", "FW de Montaña, Fuego y Viento para activar la formación"],
  },
  {
    id: "caos",
    title: "Caos · asfixia al rival",
    coachIds: [],
    tag: "Caos",
    core: [],
    prefs: { debuffTrust: 1.6 },
    summary:
      "Once entero de Caos para activar sus pasivas de «3 o más Caos»: Rione baja −1433 la Parada del portero rival, Clara −896 y Gocker −747 la Técnica de sus medios, Droll −747 el Bloqueo de su defensa. Además se acumulan: Clara le quita −1171 de Parada al portero por cada robo de tus defensas. Gazelle y Torch rematan contra un portero debilitado.",
    keys: ["Los 11 de Caos (portero Grent)", "Gazelle y Torch arriba", "Clara y Gocker robando para acumular debilitaciones"],
  },
  {
    id: "geminis",
    title: "Tormenta de Géminis · regate y derribo",
    coachIds: [],
    tag: "Gemini Storm",
    core: [],
    prefs: { debuffTrust: 1.6, dribble: 25 },
    summary:
      "Los 11 de Gemini Storm. Con 3+ de Géminis, Gigu, Ganimede y Karon bajan −750 la Técnica de los medios rivales y Pandora −747 el Bloqueo de su defensa. Cada regate con éxito de Reize (−1067), Io y Pandora (−853) hunde todavía más el Bloqueo rival, acumulable hasta que marcas, y Reem lo hace al tirar.",
    keys: ["Los 11 de Gemini Storm (portero Gorleo)", "Reize, Io y Pandora regateando", "Reem y Diam arriba"],
  },
  {
    id: "debuff-mixto",
    title: "Debilitación máxima (mezcla)",
    coachIds: [],
    core: ["2029", "2024", "1167", "1120"],
    prefs: { debuffTrust: 1.8 },
    summary:
      "Lo mejor de cada casa para hundir al rival: Rione y Clara (Caos) contra su portero, Otonashi Haruna le baja −1089 el Tiro a sus delanteros por cada regate y Manga Hou le quita −1687 de Parada al portero en cada regate. El resto lo elige el optimizador.",
    keys: ["Rione y Clara (con 3+ Caos)", "Otonashi Haruna", "Manga Hou"],
  },
  {
    id: "japon",
    title: "Inazuma Japan · acumulación",
    coachIds: ["73023"],
    tag: "Inazuma Japan",
    core: [],
    prefs: { eventTrust: 1.3 },
    summary:
      "Los 18 de Inazuma Japan tienen 26 pasivas que se cargan durante el partido y Kudou les da +87 al poder de tiro de los FW y de regate de los MF. Gouenji (Japón) suma +3510 de Tiro con 3+ Raimon o Inazuma Japan, Fubuki +3584, y Toramaru reparte poder de tiro al regatear.",
    keys: ["Gouenji y Fubuki (Japón) arriba", "Kidou (Japón) en el medio", "Tachimukai o Endou en portería"],
  },
  {
    id: "zeus",
    title: "Zeus · medio de regateadores",
    coachIds: ["71011"],
    tag: "Zeus",
    core: [],
    summary:
      "Cada regate con éxito de un MF sube +10 el poder de TODAS las técnicas del equipo (acumulable) y el entrenador da +60 al tiro de los Zeus. Afuro Terumi (Hora celestial) es la pieza clave: regatea y remata.",
    keys: ["Afuro Terumi", "5 MF regateadores de Zeus", "Portero de Montaña"],
  },
];
