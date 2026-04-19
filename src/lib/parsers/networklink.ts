// Extracts <NetworkLink><Link><href>…</href></Link></NetworkLink> URLs from a KML string.
// KMZ files exported from Google My Maps often contain ONLY a NetworkLink instead of
// embedded geometry. Used by parseGeoFile to follow those links via an edge function.
export function extractKMLNetworkLinks(content: string): string[] {
  // Use a regex (not DOMParser) so this works in both browser and Deno without depending on
  // jsdom in tests, and to be robust against namespaces and whitespace.
  const urls: string[] = [];
  const linkBlockRegex = /<NetworkLink[\s\S]*?<\/NetworkLink>/gi;
  const hrefRegex = /<href>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/href>/i;
  const blocks = content.match(linkBlockRegex) || [];
  for (const block of blocks) {
    const m = block.match(hrefRegex);
    if (m && m[1]) {
      const url = m[1].trim();
      if (/^https?:\/\//i.test(url)) urls.push(url);
    }
  }
  return urls;
}
