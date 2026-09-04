import "server-only";
import type { NewsArticle } from "@/lib/thesis/types";

const NEWS_URL = "https://finnhub.io/api/v1/company-news";
const TIMEOUT_MS = 6000;

interface FinnhubNewsItem {
  headline?: string;
  summary?: string;
  source?: string;
  datetime?: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Recent company news for a thesis-relevance check (phase7.md task 1).
 * Returns [] — not an error — when Finnhub has nothing for this
 * symbol/window. That's the expected, common case for quieter stocks, and
 * also covers symbols Finnhub doesn't support at all (e.g. NSE-listed
 * stocks — same limitation as lib/market-data/sources/finnhub.ts's quote
 * support). An empty array here is what lets the prompt state "no recent
 * news" plainly instead of the caller needing a separate error path.
 */
export async function getCompanyNews(
  symbol: string,
  { days = 5, maxArticles = 5 }: { days?: number; maxArticles?: number } = {},
): Promise<NewsArticle[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return [];

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const url = `${NEWS_URL}?symbol=${encodeURIComponent(symbol)}&from=${isoDate(from)}&to=${isoDate(to)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      // Header, not query string — keeps the key out of any logged URL.
      headers: { "X-Finnhub-Token": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    console.warn(
      `[getCompanyNews] ${symbol} fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }

  if (!res.ok) {
    console.warn(`[getCompanyNews] ${symbol} HTTP ${res.status}`);
    return [];
  }

  let items: FinnhubNewsItem[];
  try {
    items = (await res.json()) as FinnhubNewsItem[];
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];

  return items
    .filter(
      (i): i is Required<FinnhubNewsItem> =>
        typeof i.headline === "string" &&
        typeof i.summary === "string" &&
        typeof i.source === "string" &&
        typeof i.datetime === "number",
    )
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, maxArticles)
    .map((i) => ({ headline: i.headline, summary: i.summary, source: i.source, datetime: i.datetime }));
}
