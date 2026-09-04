import "server-only";
import { cache } from "react";

/**
 * Company insights (profile, key metrics, analyst ratings, news sentiment) —
 * all from Finnhub's free tier, which is US-equities-only, same limitation
 * already documented in lib/market-data/sources/finnhub.ts. NSE-listed
 * symbols (.NS/.BO) are short-circuited before any fetch: Finnhub returns
 * empty/zeroed bodies for them rather than a clean 404, which would
 * otherwise look like real (if boring) data instead of "unavailable."
 *
 * Every field is independently optional so the page can render whatever
 * came back instead of an all-or-nothing failure — same "honest about data
 * quality" posture as staleness/conflict handling elsewhere in this app.
 */

const BASE_URL = "https://finnhub.io/api/v1";
const TIMEOUT_MS = 6000;

export interface CompanyProfile {
  name: string;
  logo: string | null;
  industry: string | null;
  exchange: string | null;
  marketCapitalization: number | null;
  shareOutstanding: number | null;
  ipo: string | null;
  weburl: string | null;
  currency: string | null;
}

export interface KeyMetrics {
  peTTM: number | null;
  epsTTM: number | null;
  week52High: number | null;
  week52Low: number | null;
  netMarginTTM: number | null;
  revenueGrowthTTM: number | null;
  dividendYieldTTM: number | null;
  beta: number | null;
}

export interface AnalystRatingPeriod {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface NewsSentiment {
  bullishPercent: number | null;
  bearishPercent: number | null;
  articlesInLastWeek: number | null;
  sectorAverageBullishPercent: number | null;
}

export interface CompanyInsights {
  symbol: string;
  available: boolean;
  unavailableReason: string | null;
  profile: CompanyProfile | null;
  metrics: KeyMetrics | null;
  analystRatings: AnalystRatingPeriod[];
  sentiment: NewsSentiment | null;
}

function hasIndianSuffix(symbol: string): boolean {
  return /\.(NS|BO)$/i.test(symbol);
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { "X-Finnhub-Token": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface FinnhubProfile2 {
  name?: string;
  logo?: string;
  finnhubIndustry?: string;
  exchange?: string;
  marketCapitalization?: number;
  shareOutstanding?: number;
  ipo?: string;
  weburl?: string;
  currency?: string;
}

interface FinnhubMetricResponse {
  metric?: {
    peBasicExclExtraTTM?: number;
    epsInclExtraItemsTTM?: number;
    ["52WeekHigh"]?: number;
    ["52WeekLow"]?: number;
    netProfitMarginTTM?: number;
    revenueGrowthTTMYoy?: number;
    dividendYieldIndicatedAnnual?: number;
    beta?: number;
  };
}

interface FinnhubRecommendation {
  period?: string;
  strongBuy?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  strongSell?: number;
}

interface FinnhubNewsSentiment {
  sentiment?: { bullishPercent?: number; bearishPercent?: number };
  buzz?: { articlesInLastWeek?: number };
  sectorAverageBullishPercent?: number;
}

export const getCompanyInsights = cache(async (rawSymbol: string): Promise<CompanyInsights> => {
  const symbol = rawSymbol.trim().toUpperCase();

  if (hasIndianSuffix(symbol)) {
    return {
      symbol,
      available: false,
      unavailableReason:
        "Company financials, analyst ratings, and news sentiment need a US-equities data provider — our free Finnhub tier doesn't cover NSE-listed stocks yet.",
      profile: null,
      metrics: null,
      analystRatings: [],
      sentiment: null,
    };
  }

  if (!process.env.FINNHUB_API_KEY) {
    return {
      symbol,
      available: false,
      unavailableReason: "No Finnhub API key configured.",
      profile: null,
      metrics: null,
      analystRatings: [],
      sentiment: null,
    };
  }

  const [profileRaw, metricRaw, recommendationRaw, sentimentRaw] = await Promise.all([
    fetchJson<FinnhubProfile2>(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`),
    fetchJson<FinnhubMetricResponse>(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`),
    fetchJson<FinnhubRecommendation[]>(`/stock/recommendation?symbol=${encodeURIComponent(symbol)}`),
    fetchJson<FinnhubNewsSentiment>(`/news-sentiment?symbol=${encodeURIComponent(symbol)}`),
  ]);

  const profile: CompanyProfile | null =
    profileRaw && profileRaw.name
      ? {
          name: profileRaw.name,
          logo: profileRaw.logo || null,
          industry: profileRaw.finnhubIndustry || null,
          exchange: profileRaw.exchange || null,
          marketCapitalization: profileRaw.marketCapitalization ?? null,
          shareOutstanding: profileRaw.shareOutstanding ?? null,
          ipo: profileRaw.ipo || null,
          weburl: profileRaw.weburl || null,
          currency: profileRaw.currency || null,
        }
      : null;

  const m = metricRaw?.metric;
  const metrics: KeyMetrics | null = m
    ? {
        peTTM: m.peBasicExclExtraTTM ?? null,
        epsTTM: m.epsInclExtraItemsTTM ?? null,
        week52High: m["52WeekHigh"] ?? null,
        week52Low: m["52WeekLow"] ?? null,
        netMarginTTM: m.netProfitMarginTTM ?? null,
        revenueGrowthTTM: m.revenueGrowthTTMYoy ?? null,
        dividendYieldTTM: m.dividendYieldIndicatedAnnual ?? null,
        beta: m.beta ?? null,
      }
    : null;

  const analystRatings: AnalystRatingPeriod[] = (recommendationRaw ?? [])
    .filter((r): r is Required<FinnhubRecommendation> =>
      typeof r.period === "string" &&
      typeof r.strongBuy === "number" &&
      typeof r.buy === "number" &&
      typeof r.hold === "number" &&
      typeof r.sell === "number" &&
      typeof r.strongSell === "number",
    )
    .slice(0, 4)
    .map((r) => ({
      period: r.period,
      strongBuy: r.strongBuy,
      buy: r.buy,
      hold: r.hold,
      sell: r.sell,
      strongSell: r.strongSell,
    }));

  const sentiment: NewsSentiment | null = sentimentRaw
    ? {
        bullishPercent: sentimentRaw.sentiment?.bullishPercent ?? null,
        bearishPercent: sentimentRaw.sentiment?.bearishPercent ?? null,
        articlesInLastWeek: sentimentRaw.buzz?.articlesInLastWeek ?? null,
        sectorAverageBullishPercent: sentimentRaw.sectorAverageBullishPercent ?? null,
      }
    : null;

  const available = Boolean(profile || metrics || analystRatings.length > 0 || sentiment);

  return {
    symbol,
    available,
    unavailableReason: available ? null : "No data returned for this symbol.",
    profile,
    metrics,
    analystRatings,
    sentiment,
  };
});
