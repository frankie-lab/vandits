// Shared image search across external sources.
//
// Used by `enrich-location` (first-pass enrichment) and the
// `recover-missing-images` edge function (retroactive recovery).
//
// Key properties:
//  - Sources run in parallel via Promise.allSettled (no early-return on
//    Wikipedia failure). Final pick is by priority:
//      wikipedia > wikimedia_commons > wikimedia_geosearch > wikidata >
//      openverse > osm
//  - Each source uses externalFetch (UA + Accept) and withRetry (3 attempts
//    on 429/5xx). OSM/Overpass is opt-in, single attempt, no retry.
//  - Returns rich attribution metadata (license, author, attribution,
//    fetched_at) — required by Wikimedia/Commons/Openverse.
//  - Returns telemetry: { sourcesTried, sourcesSucceeded, finalSource,
//    durationMs, allTransient } so callers can log and decide whether to
//    mark a "recovery_attempted_at" timestamp.

import {
  externalFetch,
  fetchJsonWithRetry,
  withRetry,
} from "./external-fetch.ts";

export type ImageSourceCode =
  | "wikipedia"
  | "wikimedia_commons"
  | "wikimedia_geosearch"
  | "wikidata"
  | "openverse"
  | "osm";

export const IMAGE_SOURCE_PRIORITY: ImageSourceCode[] = [
  "wikipedia",
  "wikimedia_commons",
  "wikimedia_geosearch",
  "wikidata",
  "openverse",
  "osm",
];

export interface ImageHit {
  url: string;
  source: ImageSourceCode;
  /** Human-friendly title (filename / page title). */
  title?: string;
  license?: string;
  author?: string;
  attribution?: string;
  fetched_at: string;
}

export interface ImageSearchInput {
  placeName: string;
  placeType?: string;
  country?: string;
  region?: string;
  coordinates?: { lat: number; lng: number };
}

export interface ImageSearchOptions {
  /** Subset of sources to consult. Defaults to all except OSM. */
  sources?: ImageSourceCode[];
  /** Opt-in OSM/Overpass (rarely useful, strict policy). */
  includeOsm?: boolean;
}

export interface SourceTelemetry {
  sourcesTried: ImageSourceCode[];
  sourcesSucceeded: ImageSourceCode[];
  /** Sources that failed with a transient/unknown error (not a definitive
   *  4xx "no match"). Useful to decide whether to retry later. */
  sourcesTransientFail: ImageSourceCode[];
  finalSource: ImageSourceCode | null;
  durationMs: number;
}

export interface ImageSearchResult {
  hit: ImageHit | null;
  telemetry: SourceTelemetry;
}

// ---------------------------------------------------------------------------
// Per-source implementations. Each returns ImageHit | null. They MAY throw
// — withRetry handles transients; the orchestrator catches definitives.
// ---------------------------------------------------------------------------

const NOW = () => new Date().toISOString();

const EXCLUDE_TITLE_RX =
  /(flag|bandera|coat of arms|escudo|logo|map\b|mapa\b|portrait|retrato|book|libro|signature|firma)/i;

async function srcWikipediaPage(input: ImageSearchInput): Promise<ImageHit | null> {
  const { placeName } = input;
  if (!placeName) return null;
  for (const lang of ["es", "en"]) {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageimages|info&piprop=thumbnail&pithumbsize=1000&titles=${encodeURIComponent(placeName)}&inprop=url&format=json&origin=*`;
    const data = await fetchJsonWithRetry<any>(url);
    const pages = Object.values(data?.query?.pages ?? {}) as any[];
    const page = pages.find((p) => p?.thumbnail?.source);
    if (page?.thumbnail?.source) {
      return {
        url: page.thumbnail.source,
        source: "wikipedia",
        title: `${lang}:${page.title}`,
        attribution: `Wikipedia (${lang}) — ${page.title}`,
        license: "CC BY-SA 4.0",
        fetched_at: NOW(),
      };
    }
  }
  return null;
}

async function srcCommonsByName(input: ImageSearchInput): Promise<ImageHit | null> {
  const { placeName, placeType, country, region } = input;
  if (!placeName) return null;
  const queries: string[] = [];
  if (region && placeType) queries.push(`"${placeName}" ${region} ${placeType}`);
  if (country) queries.push(`"${placeName}" ${country}`);
  queries.push(`"${placeName}"`);

  for (const q of queries) {
    const sUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srnamespace=6&srlimit=10&format=json&origin=*`;
    const data = await fetchJsonWithRetry<any>(sUrl);
    const results = (data?.query?.search ?? []) as any[];
    const filtered = results
      .filter((r) => /\.(jpe?g|png|webp)$/i.test(r.title))
      .filter((r) => !EXCLUDE_TITLE_RX.test(r.title));
    if (filtered.length === 0) continue;
    const best = filtered[0];
    const fileName = best.title.replace(/^File:/i, "");
    const iUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200&format=json&origin=*`;
    const iData = await fetchJsonWithRetry<any>(iUrl);
    const pages = iData?.query?.pages ?? {};
    const pageId = Object.keys(pages)[0];
    const info = pageId ? pages[pageId]?.imageinfo?.[0] : null;
    const thumb = info?.thumburl || info?.url;
    if (!thumb) continue;
    const meta = info?.extmetadata ?? {};
    return {
      url: thumb,
      source: "wikimedia_commons",
      title: fileName,
      author: meta?.Artist?.value?.replace(/<[^>]+>/g, "").trim(),
      license: meta?.LicenseShortName?.value,
      attribution: meta?.Attribution?.value?.replace(/<[^>]+>/g, "").trim()
        ?? `Wikimedia Commons — ${fileName}`,
      fetched_at: NOW(),
    };
  }
  return null;
}

async function srcCommonsGeo(input: ImageSearchInput): Promise<ImageHit | null> {
  const c = input.coordinates;
  if (!c) return null;
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggsnamespace=6&ggslimit=10&ggscoord=${c.lat}|${c.lng}&ggsradius=2000&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1200`;
  const data = await fetchJsonWithRetry<any>(url);
  const pages = data?.query?.pages ? Object.values(data.query.pages) as any[] : [];
  for (const p of pages) {
    const info = p?.imageinfo?.[0];
    if (!info) continue;
    const t = (p.title || "").toLowerCase();
    if (t.endsWith(".svg")) continue;
    if (EXCLUDE_TITLE_RX.test(t)) continue;
    if ((info.width ?? 0) < 600 || (info.height ?? 0) < 400) continue;
    const meta = info?.extmetadata ?? {};
    return {
      url: info.url,
      source: "wikimedia_geosearch",
      title: (p.title || "").replace(/^File:/i, ""),
      author: meta?.Artist?.value?.replace(/<[^>]+>/g, "").trim(),
      license: meta?.LicenseShortName?.value,
      attribution: meta?.Attribution?.value?.replace(/<[^>]+>/g, "").trim()
        ?? `Wikimedia Commons (nearby)`,
      fetched_at: NOW(),
    };
  }
  return null;
}

async function srcWikidata(input: ImageSearchInput): Promise<ImageHit | null> {
  const c = input.coordinates;
  if (!c) return null;
  const sparql = `SELECT ?item ?itemLabel ?image WHERE { SERVICE wikibase:around { ?item wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(${c.lng} ${c.lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "1" . } ?item wdt:P18 ?image . SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". } } LIMIT 5`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
  const data = await fetchJsonWithRetry<any>(url, {
    headers: { Accept: "application/sparql-results+json" },
  });
  const b = data?.results?.bindings?.[0];
  if (!b?.image?.value) return null;
  const filename = decodeURIComponent(b.image.value.split("/").pop() || "");
  return {
    url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1200`,
    source: "wikidata",
    title: b.itemLabel?.value || filename,
    attribution: `Wikidata / Commons — ${filename}`,
    license: "CC BY-SA",
    fetched_at: NOW(),
  };
}

async function srcOpenverse(input: ImageSearchInput): Promise<ImageHit | null> {
  if (!input.placeName) return null;
  const url = `https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(input.placeName)}&page_size=10&license_type=all-cc`;
  const data = await fetchJsonWithRetry<any>(url);
  for (const r of (data?.results ?? []) as any[]) {
    const t = (r.title || "").toLowerCase();
    if (EXCLUDE_TITLE_RX.test(t)) continue;
    if (r.width && r.height && (r.width < 600 || r.height < 400)) continue;
    return {
      url: r.url,
      source: "openverse",
      title: r.title || input.placeName,
      author: r.creator,
      license: r.license,
      attribution: `${r.creator ?? "Unknown"} via Openverse (${r.license ?? "CC"})`,
      fetched_at: NOW(),
    };
  }
  return null;
}

async function srcOsm(input: ImageSearchInput): Promise<ImageHit | null> {
  // OSM/Overpass: single attempt, no retry. Strict policy.
  const c = input.coordinates;
  if (!c) return null;
  const q = `[out:json][timeout:8];nwr(around:500,${c.lat},${c.lng})[image];out tags 5;`;
  const res = await externalFetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: q,
    headers: { "Content-Type": "text/plain" },
    timeoutMs: 9_000,
  });
  if (!res.ok) return null;
  const data = await res.json();
  for (const el of (data?.elements ?? []) as any[]) {
    const tags = el.tags || {};
    const url = tags.image;
    if (!url || !/^https?:\/\//i.test(url)) continue;
    return {
      url,
      source: "osm",
      title: tags.name || tags["name:es"] || tags["name:en"] || "POI OSM",
      attribution: `OpenStreetMap contributors — ${tags.name ?? "POI"}`,
      license: "ODbL",
      fetched_at: NOW(),
    };
  }
  return null;
}

const SOURCE_FNS: Record<ImageSourceCode, (i: ImageSearchInput) => Promise<ImageHit | null>> = {
  wikipedia: srcWikipediaPage,
  wikimedia_commons: srcCommonsByName,
  wikimedia_geosearch: srcCommonsGeo,
  wikidata: srcWikidata,
  openverse: srcOpenverse,
  osm: srcOsm,
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run all selected sources in parallel (Promise.allSettled), then pick by
 * fixed priority. Returns telemetry for logging / persistence.
 */
export async function searchImageFromSources(
  input: ImageSearchInput,
  opts: ImageSearchOptions = {},
): Promise<ImageSearchResult> {
  const t0 = Date.now();

  let sources = (opts.sources ?? IMAGE_SOURCE_PRIORITY).filter(
    (s) => s !== "osm" || opts.includeOsm,
  );
  // Dedup while keeping priority order.
  sources = Array.from(new Set(sources));

  const tried: ImageSourceCode[] = [];
  const succeeded: ImageSourceCode[] = [];
  const transient: ImageSourceCode[] = [];
  const hits = new Map<ImageSourceCode, ImageHit>();

  const tasks = sources.map(async (code) => {
    tried.push(code);
    try {
      // OSM is single-attempt; rest already use withRetry inside fetchJsonWithRetry.
      const fn = SOURCE_FNS[code];
      const hit = code === "osm"
        ? await fn(input)
        : await withRetry(() => fn(input), { attempts: 3, baseMs: 500, factor: 3, jitterMs: 200 });
      if (hit?.url) {
        hits.set(code, hit);
        succeeded.push(code);
      }
    } catch (err) {
      // Distinguish transient vs definitive. Response thrown by fetchJsonWithRetry
      // means non-OK after all retries -> still treat as transient if 5xx/429.
      if (err instanceof Response) {
        if (err.status === 429 || err.status === 408 || (err.status >= 500 && err.status < 600)) {
          transient.push(code);
        }
      } else {
        // Network/abort/unknown after retries.
        transient.push(code);
      }
      // Otherwise: definitive miss, just log.
      console.warn(`[image-search] ${code} failed:`, err instanceof Error ? err.message : err);
    }
  });

  await Promise.allSettled(tasks);

  // Priority pick.
  let finalHit: ImageHit | null = null;
  let finalSource: ImageSourceCode | null = null;
  for (const code of IMAGE_SOURCE_PRIORITY) {
    if (hits.has(code)) {
      finalHit = hits.get(code)!;
      finalSource = code;
      break;
    }
  }

  return {
    hit: finalHit,
    telemetry: {
      sourcesTried: tried,
      sourcesSucceeded: succeeded,
      sourcesTransientFail: transient,
      finalSource,
      durationMs: Date.now() - t0,
    },
  };
}

/** Did all consulted sources respond definitively (no transient errors)?
 *  Callers like `recover-missing-images` use this to decide whether to mark
 *  `image_recovery_attempted_at`. */
export function isAttemptComplete(t: SourceTelemetry): boolean {
  return t.sourcesTransientFail.length === 0;
}
