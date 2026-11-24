// Busca e leitura de páginas via Firecrawl (servidor apenas; chave em FIRECRAWL_API_KEY).
const API = "https://api.firecrawl.dev/v2";

function key(): string {
  const k = process.env.FIRECRAWL_API_KEY;
  if (!k) throw new Error("FIRECRAWL_API_KEY não configurada no servidor.");
  return k;
}

export type SearchHit = { title: string; url: string; description: string };

export async function searchWeb(query: string, limit = 5): Promise<SearchHit[]> {
  const res = await fetch(`${API}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: Math.min(Math.max(limit, 1), 8), sources: ["web", "news"] }),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Firecrawl search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: unknown };
  const data = json.data as Record<string, unknown> | unknown[] | undefined;
  const lists: unknown[] = Array.isArray(data)
    ? data
    : [...((data?.web as unknown[]) ?? []), ...((data?.news as unknown[]) ?? [])];
  return lists.slice(0, 10).map((h) => {
    const o = h as Record<string, unknown>;
    return {
      title: String(o.title ?? ""),
      url: String(o.url ?? ""),
      description: String(o.description ?? o.snippet ?? "").slice(0, 500),
      ...(o.date ? { date: String(o.date) } : {}),
    };
  });
}

export async function readPage(url: string): Promise<{ url: string; title: string | null; markdown: string }> {
  if (!/^https:\/\//.test(url)) throw new Error("Apenas URLs https são aceitas.");
  const host = new URL(url).hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(":")
  ) {
    throw new Error("Endereço não permitido.");
  }
  const res = await fetch(`${API}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: 12000 }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Firecrawl scrape ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: { markdown?: string; metadata?: { title?: string } } };
  const md = json.data?.markdown ?? "";
  return { url, title: json.data?.metadata?.title ?? null, markdown: md.slice(0, 12000) };
}
