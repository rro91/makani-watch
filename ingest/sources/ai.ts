import Anthropic from "@anthropic-ai/sdk";
import type { Alert, Mode, Storm, TripSegment } from "../types.js";

// This is the ONLY place in the app where a threat judgement is phrased by
// an LLM instead of the deterministic rule engine (ingest/rules.ts). It
// never sets the numeric level — it only explains a level the rules already
// computed, using the same real fetched data the rest of the app shows. If
// this fails or no API key is configured, the app degrades to exactly what
// it was before this feature existed (no crash, no missing data elsewhere).
const MODEL = "claude-sonnet-5";

export interface AiUnnamedSystem {
  description: string;
  approxLat: number;
  approxLon: number;
  uncertaintyKm: number;
  confidence: "low" | "medium" | "high";
}

export interface AiInsight {
  briefing: string;
  unnamedSystem: AiUnnamedSystem | null;
}

export interface AiContext {
  now: Date;
  mode: Mode;
  currentIsland: string | null;
  tripSegments: TripSegment[];
  alerts: Alert[];
  storms: Storm[];
  outlookText: string | null;
  outlookFormation48h: number | null;
  outlookFormation7day: number | null;
  level: number;
  levelLabel: string;
  reasons: string[];
}

// A short-fuse NWS product (Watch/Warning/Advisory) or a CPHC outlook
// describes the next few days, not the next few weeks. Computed here in
// code rather than left to the model's own date arithmetic — see the
// hallucination this caught in production: a briefing claimed a family
// would be "traveling during" a Sept 25-28 flood watch when their trip
// didn't start until Oct 2, nine days after the alert was issued.
function daysUntilTripStart(now: Date, tripSegments: TripSegment[]): number | null {
  const first = tripSegments[0];
  if (!first) return null;
  const start = new Date(`${first.start}T00:00:00Z`);
  return Math.round((start.getTime() - now.getTime()) / 86_400_000);
}

const SYSTEM_PROMPT = `Jesteś asystentem bezpieczeństwa w aplikacji Makani Watch, która pomaga jednej rodzinie ocenić zagrożenia pogodowe podczas podróży po Hawajach.

Zasady, których musisz przestrzegać:
- Piszesz wyłącznie po polsku, prostym, bezpośrednim językiem, bez żargonu meteorologicznego bez wyjaśnienia go od razu.
- Bazujesz wyłącznie na danych, które dostajesz w wiadomości użytkownika. Nigdy nie zmyślaj faktów, dat, pozycji, nazw ani liczb, których tam nie ma.
- NIE oceniasz sam poziomu zagrożenia — poziom (0-5) jest już wyliczony przez reguły i podany Ci w danych jako "poziomZagrozenia". Twoim zadaniem jest go wytłumaczyć i skomentować, nigdy zmienić ani zasugerować innego.
- "briefing" to 3-5 zdań: co się dzieje, jak poważne to jest, i co to znaczy konkretnie dla tej rodziny i jej dat/wysp podanych w "trasa". Jeśli nic groźnego się nie dzieje, powiedz to wprost i krótko.
- WAŻNA ZASADA O DATACH: dostajesz pole "kontekstCzasowy.dniDoRozpoczeciaPodrozy" — to dokładnie policzona liczba dni od dziś do startu podróży, nie musisz i nie powinieneś sam liczyć dat. Aktywne alerty NWS i systemy opisane w prognozieCPHC dotyczą najbliższych dni (zwykle poniżej tygodnia), nie tygodni. Jeśli "dniDoRozpoczeciaPodrozy" jest większe niż 5, niemal na pewno KONKRETNE opisane zjawisko (ten alert, ten system z prognozyCPHC) zakończy się ZANIM rodzina wyleci — wyraźnie to napisz (np. "to zdarzenie powinno zakończyć się przed Waszym przylotem"). Nigdy nie pisz, że rodzina "podróżuje w trakcie" lub "trafi w" konkretne, krótkoterminowe zjawisko, jeśli dniDoRozpoczeciaPodrozy > 5 — to byłby błąd. Przykład błędu, którego NIE WOLNO Ci powtórzyć: dziś jest 23 września, alert dotyczy 25-28 września, podróż zaczyna się 2 października (9 dni później) — to się NIE pokrywa, mimo że oba terminy są "blisko dziś".
- Jeśli w polu "prognozaCPHC" jest opis systemu pogodowego bez oficjalnej nazwy i pozycji (system, który nie występuje w liście "sztormy"), spróbuj wywnioskować z opisu słownego przybliżoną pozycję (szerokość i długość geograficzna w stopniach dziesiętnych, longitude ujemne dla zachodniej długości) — ale WYŁĄCZNIE jeśli tekst daje wystarczająco konkretną wskazówkę (np. "several hundred miles southeast of the Big Island"). Jeśli nie potrafisz sensownie oszacować pozycji, ustaw "unnamedSystem" na null zamiast zgadywać.
- Odpowiadasz wyłącznie poprawnym obiektem JSON, bez żadnego tekstu, komentarza ani formatowania markdown przed lub po nim, dokładnie w tym kształcie:
{"briefing": "string", "unnamedSystem": null}
albo
{"briefing": "string", "unnamedSystem": {"description": "string", "approxLat": number, "approxLon": number, "uncertaintyKm": number, "confidence": "low"|"medium"|"high"}}`;

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

// Central/Eastern Pacific basin sanity box — rejects an obviously
// hallucinated position (e.g. on land, wrong hemisphere) rather than
// trusting the model blindly.
function isPlausibleBasinPosition(lat: number, lon: number): boolean {
  return lat >= -5 && lat <= 40 && lon >= -180 && lon <= -95;
}

export async function generateAiInsight(ctx: AiContext): Promise<AiInsight | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // feature is opt-in: no secret configured yet, skip silently

  const client = new Anthropic({ apiKey });

  const payload = {
    tryb: ctx.mode,
    aktualnaWyspa: ctx.currentIsland,
    trasa: ctx.tripSegments.map((s) => ({
      wyspa: s.islandLabel,
      od: s.start,
      do: s.end,
    })),
    kontekstCzasowy: {
      dzisiejszaData: ctx.now.toISOString().slice(0, 10),
      dniDoRozpoczeciaPodrozy: daysUntilTripStart(ctx.now, ctx.tripSegments),
    },
    poziomZagrozenia: ctx.level,
    etykietaPoziomu: ctx.levelLabel,
    powodyPoziomu: ctx.reasons,
    aktywneAlerty: ctx.alerts.map((a) => ({
      zdarzenie: a.event,
      waznosc: a.severity,
      obszar: a.areaDesc,
      naglowek: a.headline,
      opis: a.description,
      instrukcja: a.instruction,
    })),
    sztormy: ctx.storms.map((s) => ({
      nazwa: s.name,
      klasyfikacja: s.classificationLabel,
      kategoria: s.category,
      wiatrKmh: s.intensityKmh,
      odlegloscKm: s.distanceKmToTrip,
    })),
    prognozaCPHC: ctx.outlookText,
    szansaFormowania48h: ctx.outlookFormation48h,
    szansaFormowania7dni: ctx.outlookFormation7day,
  };

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (!textBlock) return null;

    const parsed = JSON.parse(stripCodeFence(textBlock.text)) as {
      briefing?: unknown;
      unnamedSystem?: unknown;
    };
    if (typeof parsed.briefing !== "string" || parsed.briefing.trim() === "") {
      return null;
    }

    let unnamedSystem: AiUnnamedSystem | null = null;
    const candidate = parsed.unnamedSystem as Partial<AiUnnamedSystem> | null;
    if (
      candidate &&
      typeof candidate.approxLat === "number" &&
      typeof candidate.approxLon === "number" &&
      typeof candidate.description === "string" &&
      isPlausibleBasinPosition(candidate.approxLat, candidate.approxLon)
    ) {
      // Verified empirically: the model tends to place the point much
      // closer to the named reference island than "a few hundred miles"
      // (the phrasing NHC actually uses) implies, while self-reporting a
      // tight uncertainty that doesn't cover its own error. Don't trust the
      // model's own uncertainty claim — floor it at the low end of what
      // "a few hundred miles" means, and never call that "high" confidence.
      const MIN_UNCERTAINTY_KM = 500;
      const reportedUncertainty =
        typeof candidate.uncertaintyKm === "number" ? candidate.uncertaintyKm : 0;
      unnamedSystem = {
        description: candidate.description,
        approxLat: candidate.approxLat,
        approxLon: candidate.approxLon,
        uncertaintyKm: Math.max(reportedUncertainty, MIN_UNCERTAINTY_KM),
        confidence: candidate.confidence === "medium" ? "medium" : "low",
      };
    }

    return { briefing: parsed.briefing, unnamedSystem };
  } catch (err) {
    console.error(
      "[makani-watch] AI insight failed (degrading gracefully):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
