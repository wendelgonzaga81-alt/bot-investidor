// Dados de mercado da B3 via brapi.dev e indicadores calculados em código.
// Nada aqui é estimado pela IA: o modelo só recebe o que estas funções retornam.

const BRAPI = "https://brapi.dev/api/v2/stocks";
const TZ = "America/Sao_Paulo";

export const SCAN_UNIVERSE = [
  "PETR4", "VALE3", "ITUB4", "BBDC4", "BBAS3", "B3SA3", "ABEV3", "WEGE3", "RENT3", "SUZB3",
  "PRIO3", "ELET3", "RADL3", "EQTL3", "GGBR4", "JBSS3", "ITSA4", "LREN3", "VIVT3", "SBSP3",
];
// Tickers que a brapi libera sem token (documentação brapi.dev/docs).
const FREE_TICKERS = new Set(["PETR4", "VALE3", "ITUB4", "MGLU3"]);

export type Bar = { date: number; open: number; high: number; low: number; close: number; volume: number };

export type Analysis = {
  ticker: string;
  name: string | null;
  source: "brapi.dev";
  lastPrice: number | null;
  lastTradeTimeBrasilia: string | null;
  changes: { d1: number | null; d5: number | null; d20: number | null; d60: number | null };
  sma20: number | null;
  sma50: number | null;
  volumeVsMedian20: number | null;
  volatility20: number | null;
  high52w: number | null;
  low52w: number | null;
  score: number | null;
  coveragePct: number;
  components: Record<string, { weight: number; value: number | null; note: string }>;
  regime: string;
  signal: string;
  bias: "favorável" | "em observação" | "evidência insuficiente";
  bars: Bar[];
  warnings: string[];
};

type CacheEntry = { at: number; value: unknown };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

async function brapiGet(path: string): Promise<unknown> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const token = process.env.BRAPI_TOKEN;
  const res = await fetch(`${BRAPI}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`brapi ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  cache.set(path, { at: Date.now(), value: json });
  return json;
}

type BrapiResult = { symbol?: string; requestedSymbol?: string; data?: Record<string, unknown> } & Record<string, unknown>;

function resultsOf(json: unknown): BrapiResult[] {
  const r = (json as { results?: BrapiResult[] })?.results;
  return Array.isArray(r) ? r : [];
}
function dataOf(r: BrapiResult): Record<string, unknown> {
  return (r.data as Record<string, unknown>) ?? r;
}
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function fetchHistory(ticker: string): Promise<Bar[]> {
  let json: unknown;
  try {
    json = await brapiGet(`/historical?symbols=${ticker}&range=3mo&interval=1d&sortOrder=asc`);
  } catch {
    // Plano gratuito pode limitar a janela: tenta 1 mês.
    json = await brapiGet(`/historical?symbols=${ticker}&range=1mo&interval=1d&sortOrder=asc`);
  }
  const r = resultsOf(json)[0];
  const raw = r ? (dataOf(r).historicalDataPrice as unknown[]) : [];
  const bars = (Array.isArray(raw) ? raw : [])
    .map((b) => b as Record<string, unknown>)
    .map((b) => ({
      date: num(b.date) ?? 0,
      open: num(b.open) ?? NaN,
      high: num(b.high) ?? NaN,
      low: num(b.low) ?? NaN,
      close: num(b.close) ?? NaN,
      volume: num(b.volume) ?? 0,
    }))
    .filter((b) => b.date > 0 && Number.isFinite(b.close));
  bars.sort((a, b) => a.date - b.date);
  return bars;
}

async function fetchQuotes(tickers: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  if (tickers.length === 0) return out;
  const json = await brapiGet(`/quote?symbols=${tickers.join(",")}`);
  for (const r of resultsOf(json)) {
    const sym = String(r.symbol ?? r.requestedSymbol ?? "").toUpperCase();
    if (sym) out.set(sym, dataOf(r));
  }
  return out;
}

const pct = (a: number, b: number) => ((a - b) / b) * 100;
const round = (v: number | null, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const s = values.slice(-n);
  return s.reduce((a, b) => a + b, 0) / n;
}
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function changeOver(closes: number[], n: number): number | null {
  if (closes.length <= n) return null;
  return pct(closes[closes.length - 1], closes[closes.length - 1 - n]);
}
const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

function formatBrasilia(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(d);
}

/**
 * Score de -100 a +100. Pesos: tendência 20, momentum 15, volume 15, amplitude/setor 10,
 * fundamentos 15, catalisadores 10, macro 10, risco/liquidez 5.
 * Cada componente vale de -1 a +1; componentes sem dado ficam fora e reduzem a cobertura.
 * O score é normalizado pelos pesos disponíveis e multiplicado por 100.
 */
function scoreOf(a: {
  last: number; sma20: number | null; sma50: number | null; d20: number | null; d5: number | null;
  volRatio: number | null; vol20: number | null; avgDailyValue: number | null; pe: number | null;
}) {
  const c: Analysis["components"] = {
    tendencia: { weight: 20, value: null, note: "preço vs MM20 e MM50" },
    momentum: { weight: 15, value: null, note: "variação de 20 e 5 pregões" },
    volume: { weight: 15, value: null, note: "volume do último pregão vs mediana de 20, na direção do dia" },
    amplitude_setor: { weight: 10, value: null, note: "não disponível nesta versão" },
    fundamentos: { weight: 15, value: null, note: "P/L quando informado pela fonte" },
    catalisadores: { weight: 10, value: null, note: "não disponível em código; ver notícias" },
    macro: { weight: 10, value: null, note: "não disponível nesta versão" },
    risco_liquidez: { weight: 5, value: null, note: "volatilidade de 20 pregões e volume financeiro" },
  };
  if (a.sma20 !== null) {
    let t = a.last > a.sma20 ? 0.5 : -0.5;
    if (a.sma50 !== null) t += a.last > a.sma50 ? 0.25 : -0.25, t += a.sma20 > a.sma50 ? 0.25 : -0.25;
    c.tendencia.value = clamp(t);
  }
  if (a.d20 !== null) {
    const m = clamp(a.d20 / 10) * 0.7 + (a.d5 !== null ? clamp(a.d5 / 5) * 0.3 : 0);
    c.momentum.value = clamp(m);
  }
  if (a.volRatio !== null && a.d5 !== null) {
    const strength = clamp((a.volRatio - 1) / 1.5, 0, 1);
    c.volume.value = (a.d5 >= 0 ? 1 : -1) * strength;
  }
  if (a.pe !== null) {
    c.fundamentos.value = a.pe <= 0 ? -0.5 : a.pe < 8 ? 0.5 : a.pe < 15 ? 0.2 : a.pe < 25 ? -0.1 : -0.4;
  }
  if (a.vol20 !== null) {
    let r = a.vol20 < 25 ? 0.5 : a.vol20 < 40 ? 0 : -0.5;
    if (a.avgDailyValue !== null && a.avgDailyValue < 20_000_000) r -= 0.5;
    c.risco_liquidez.value = clamp(r);
  }
  let total = 0, used = 0;
  for (const k of Object.keys(c)) {
    const comp = c[k];
    if (comp.value !== null) { total += comp.value * comp.weight; used += comp.weight; }
  }
  const score = used >= 30 ? Math.round((total / used) * 100) : null;
  return { score, coveragePct: used, components: c };
}

export async function analyzeTickers(tickersIn: string[]): Promise<Analysis[]> {
  const tickers = [...new Set(tickersIn.map((t) => t.trim().toUpperCase()).filter((t) => /^[A-Z0-9^]{4,8}$/.test(t)))].slice(0, 25);
  const hasToken = Boolean(process.env.BRAPI_TOKEN);
  let quotes = new Map<string, Record<string, unknown>>();
  try {
    const allowed = hasToken ? tickers : tickers.filter((t) => FREE_TICKERS.has(t));
    quotes = await fetchQuotes(allowed);
  } catch {
    // segue só com histórico
  }
  const results = await Promise.all(
    tickers.map(async (ticker): Promise<Analysis> => {
      const warnings: string[] = [];
      if (!hasToken && !FREE_TICKERS.has(ticker)) {
        warnings.push("BRAPI_TOKEN não configurado: a brapi só libera PETR4, VALE3, ITUB4 e MGLU3 sem token.");
      }
      let bars: Bar[] = [];
      try {
        bars = await fetchHistory(ticker);
      } catch (e) {
        warnings.push(`Histórico indisponível: ${(e as Error).message}`);
      }
      const q = quotes.get(ticker) ?? {};
      const closes = bars.map((b) => b.close);
      const lastBar = bars.at(-1);
      const last = num(q.regularMarketPrice) ?? lastBar?.close ?? null;
      const timeRaw = q.regularMarketTime;
      const lastTime =
        typeof timeRaw === "string" ? new Date(timeRaw) : lastBar ? new Date(lastBar.date * 1000) : null;
      const s20 = sma(closes, 20);
      const s50 = sma(closes, 50);
      const vols = bars.map((b) => b.volume);
      const med20 = median(vols.slice(-21, -1));
      const volRatio = med20 && lastBar ? lastBar.volume / med20 : null;
      const rets = closes.slice(-21).map((c, i, arr) => (i === 0 ? null : Math.log(c / arr[i - 1]))).filter((x): x is number => x !== null);
      const vol20 =
        rets.length >= 15
          ? Math.sqrt(rets.reduce((a, r) => a + (r - rets.reduce((x, y) => x + y, 0) / rets.length) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252) * 100
          : null;
      const avgDailyValue =
        bars.length >= 20 ? bars.slice(-20).reduce((a, b) => a + b.close * b.volume, 0) / 20 : null;
      const d1 = num(q.regularMarketChangePercent) ?? changeOver(closes, 1);
      const d5 = changeOver(closes, 5), d20 = changeOver(closes, 20), d60 = changeOver(closes, 60);
      const pe = num(q.priceEarnings);
      const sc = last !== null ? scoreOf({ last, sma20: s20, sma50: s50, d20, d5, volRatio, vol20, avgDailyValue, pe }) : { score: null, coveragePct: 0, components: {} };
      let regime = "não determinado";
      if (vol20 !== null && vol20 > 45) regime = "alta volatilidade";
      else if (s20 !== null && s50 !== null && last !== null) {
        regime = last > s20 && s20 > s50 ? "tendência de alta" : last < s20 && s20 < s50 ? "tendência de baixa" : "lateral";
      }
      let signal = "sem sinal";
      if (sc.score !== null) {
        if (Math.abs(sc.score) >= 50 && sc.coveragePct >= 50) signal = "confirmado";
        else if (Math.abs(sc.score) >= 25) signal = "em formação";
      }
      const bias: Analysis["bias"] = sc.score === null ? "evidência insuficiente" : sc.score >= 25 ? "favorável" : "em observação";
      if (bars.length < 50) warnings.push(`Histórico curto (${bars.length} pregões): MM50 e variação de 60 pregões podem faltar.`);
      return {
        ticker,
        name: typeof q.shortName === "string" ? q.shortName : null,
        source: "brapi.dev",
        lastPrice: round(last),
        lastTradeTimeBrasilia: lastTime ? formatBrasilia(lastTime) : null,
        changes: { d1: round(d1), d5: round(d5), d20: round(d20), d60: round(d60) },
        sma20: round(s20),
        sma50: round(s50),
        volumeVsMedian20: round(volRatio),
        volatility20: round(vol20, 1),
        high52w: num(q.fiftyTwoWeekHigh),
        low52w: num(q.fiftyTwoWeekLow),
        score: sc.score,
        coveragePct: sc.coveragePct,
        components: sc.components,
        regime,
        signal,
        bias,
        bars,
        warnings,
      };
    }),
  );
  return results;
}

/** Versão enxuta para enviar ao modelo (sem a série completa). */
export function forModel(a: Analysis) {
  const { bars, ...rest } = a;
  return { ...rest, pregoesNaSerie: bars.length, ultimoPregao: bars.at(-1) ? formatBrasilia(new Date(bars.at(-1)!.date * 1000)) : null };
}

export async function scanB3() {
  const tickers = process.env.BRAPI_TOKEN ? SCAN_UNIVERSE : [...FREE_TICKERS].filter((t) => t !== "MGLU3");
  const all = await analyzeTickers(tickers);
  const ranked = all
    .filter((a) => a.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return {
    universo: tickers,
    universoReduzido: !process.env.BRAPI_TOKEN,
    ranking: ranked,
    semDados: all.filter((a) => a.score === null).map((a) => ({ ticker: a.ticker, warnings: a.warnings })),
  };
}
