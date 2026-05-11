/**
 * Registry de los 16 catálogos "Pueblos más bonitos".
 * Cada adapter define listing URL(s) + regex para extraer fichas.
 * El registry está colocado en un solo archivo para mantener la implementación
 * compacta — añadir/quitar un adapter es 1 entrada en este array.
 *
 * Si una URL cambia o un sitio rompe, basta tocar su entrada aquí.
 */

import type { VillageCatalogAdapter } from './types.ts';

// Helper para convertir un slug en nombre legible
function slugToName(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function makeStandardBuilder(baseUrl: string, prefix: string) {
  return (m: RegExpExecArray): { url: string; name: string } | null => {
    const slug = m[1];
    if (!slug || slug.length < 2) return null;
    return { url: `${baseUrl}${prefix}${slug}`, name: slugToName(slug) };
  };
}

export const ADAPTERS: VillageCatalogAdapter[] = [
  // ES — lospueblosmasbonitosdeespana.org (estructura /pueblos/{slug}/)
  {
    code: 'search.village.es',
    name: 'Pueblos más bonitos de España',
    countryCodes: ['ES'],
    listingUrls: ['https://lospueblosmasbonitosdeespana.org/listado-pueblos/'],
    linkPattern: /href="https?:\/\/lospueblosmasbonitosdeespana\.org\/([a-z0-9-]+)\/?"/gi,
    buildEntry: (m) => {
      const slug = m[1];
      const SKIP = new Set([
        'listado-pueblos', 'contacto', 'aviso-legal', 'politica-de-privacidad',
        'politica-de-cookies', 'la-asociacion', 'noticias', 'tienda', 'eventos',
        'wp-content', 'wp-admin', 'feed', 'category', 'tag',
      ]);
      if (SKIP.has(slug)) return null;
      return {
        url: `https://lospueblosmasbonitosdeespana.org/${slug}/`,
        name: slugToName(slug),
      };
    },
  },

  // FR — les-plus-beaux-villages-de-france.org
  {
    code: 'search.village.fr',
    name: 'Plus Beaux Villages de France',
    countryCodes: ['FR'],
    listingUrls: ['https://www.les-plus-beaux-villages-de-france.org/fr/nos-plus-beaux-villages/'],
    linkPattern: /href="\/fr\/nos-plus-beaux-villages\/([a-z0-9-]+)\/?"/gi,
    buildEntry: makeStandardBuilder(
      'https://www.les-plus-beaux-villages-de-france.org',
      '/fr/nos-plus-beaux-villages/',
    ),
  },

  // IT — borghipiubelliditalia.it (i-borghi/{regione}/{slug}/)
  {
    code: 'search.village.it',
    name: "Borghi più belli d'Italia",
    countryCodes: ['IT'],
    listingUrls: ['https://borghipiubelliditalia.it/i-borghi/'],
    linkPattern: /href="https?:\/\/borghipiubelliditalia\.it\/borgo\/([a-z0-9-]+)\/?"/gi,
    buildEntry: makeStandardBuilder('https://borghipiubelliditalia.it', '/borgo/'),
  },

  // BE — beauxvillages.be (Wallonie)
  {
    code: 'search.village.be',
    name: 'Plus Beaux Villages de Wallonie',
    countryCodes: ['BE'],
    listingUrls: ['https://beauxvillages.be/nos-villages/'],
    linkPattern: /href="https?:\/\/beauxvillages\.be\/villages\/([a-z0-9-]+)\/?"/gi,
    buildEntry: makeStandardBuilder('https://beauxvillages.be', '/villages/'),
  },

  // CH — dieschoenstenschweizerdoerfer.ch
  {
    code: 'search.village.ch',
    name: 'Schönsten Schweizer Dörfer',
    countryCodes: ['CH'],
    listingUrls: ['https://www.dieschoenstenschweizerdoerfer.ch/de/doerfer/'],
    linkPattern: /href="\/de\/doerfer\/([a-z0-9-]+)\/?"/gi,
    buildEntry: makeStandardBuilder(
      'https://www.dieschoenstenschweizerdoerfer.ch',
      '/de/doerfer/',
    ),
  },

  // PT-AH — aldeiashistoricasdeportugal.com
  {
    code: 'search.village.pt_ah',
    name: 'Aldeias Históricas de Portugal',
    countryCodes: ['PT'],
    listingUrls: ['https://aldeiashistoricasdeportugal.com/aldeias/'],
    linkPattern: /href="https?:\/\/aldeiashistoricasdeportugal\.com\/aldeia\/([a-z0-9-]+)\/?"/gi,
    buildEntry: makeStandardBuilder('https://aldeiashistoricasdeportugal.com', '/aldeia/'),
  },

  // PT-AX — aldeiasdoxisto.pt
  {
    code: 'search.village.pt_ax',
    name: 'Aldeias do Xisto',
    countryCodes: ['PT'],
    listingUrls: ['https://aldeiasdoxisto.pt/aldeias'],
    linkPattern: /href="https?:\/\/aldeiasdoxisto\.pt\/aldeia\/([a-z0-9-]+)\/?"/gi,
    buildEntry: makeStandardBuilder('https://aldeiasdoxisto.pt', '/aldeia/'),
  },

  // DE-Sachsen — sachsensdoerfer.de
  {
    code: 'search.village.de_sx',
    name: 'Schönsten Dörfer Sachsens',
    countryCodes: ['DE'],
    listingUrls: ['https://www.sachsensdoerfer.de/doerfer/'],
    linkPattern: /href="https?:\/\/www\.sachsensdoerfer\.de\/doerfer\/([a-z0-9-]+)\/?"/gi,
    buildEntry: makeStandardBuilder('https://www.sachsensdoerfer.de', '/doerfer/'),
  },

  // UK — cotswolds.com (sección villages)
  {
    code: 'search.village.uk',
    name: 'Cotswolds Villages',
    countryCodes: ['GB'],
    listingUrls: ['https://www.cotswolds.com/things-to-do/towns-and-villages'],
    linkPattern: /href="(\/things-to-do\/[a-z0-9-]+-p\d+)"/gi,
    buildEntry: (m) => {
      const path = m[1];
      const slug = path.split('/').pop() ?? '';
      const namePart = slug.replace(/-p\d+$/, '');
      if (!namePart) return null;
      return { url: `https://www.cotswolds.com${path}`, name: slugToName(namePart) };
    },
  },

  // GR — visitgreece.gr (traditional villages)
  {
    code: 'search.village.gr',
    name: 'Visit Greece — Traditional Villages',
    countryCodes: ['GR'],
    listingUrls: ['https://www.visitgreece.gr/villages/'],
    linkPattern: /href="https?:\/\/www\.visitgreece\.gr\/villages\/([a-z0-9-]+)\/?"/gi,
    buildEntry: makeStandardBuilder('https://www.visitgreece.gr', '/villages/'),
  },

  // NL — holland.com (destinations / villages)
  {
    code: 'search.village.nl',
    name: 'Holland — Mooiste Dorpen',
    countryCodes: ['NL'],
    listingUrls: ['https://www.holland.com/global/tourism/destinations/cities.htm'],
    linkPattern: /href="(\/global\/tourism\/destinations\/[a-z0-9-]+\.htm)"/gi,
    buildEntry: (m) => {
      const path = m[1];
      const slug = path.split('/').pop()?.replace('.htm', '') ?? '';
      if (!slug || slug === 'cities') return null;
      return { url: `https://www.holland.com${path}`, name: slugToName(slug) };
    },
  },

  // CA-QC — beauxvillages.qc.ca
  {
    code: 'search.village.ca_qc',
    name: 'Plus Beaux Villages du Québec',
    countryCodes: ['CA'],
    listingUrls: ['https://www.beauxvillages.qc.ca/villages/'],
    linkPattern: /href="https?:\/\/www\.beauxvillages\.qc\.ca\/villages\/([a-z0-9-]+)\/?"/gi,
    buildEntry: makeStandardBuilder('https://www.beauxvillages.qc.ca', '/villages/'),
  },

  // JP — utsukushii-mura.jp (sitio en japonés, slugs ASCII en URL)
  {
    code: 'search.village.jp',
    name: 'Most Beautiful Villages in Japan',
    countryCodes: ['JP'],
    listingUrls: ['https://utsukushii-mura.jp/en/'],
    linkPattern: /href="https?:\/\/utsukushii-mura\.jp\/en\/([a-z0-9-]+)\/?"/gi,
    buildEntry: (m) => {
      const slug = m[1];
      const SKIP = new Set(['about', 'news', 'contact', 'privacy', 'sitemap']);
      if (SKIP.has(slug)) return null;
      return { url: `https://utsukushii-mura.jp/en/${slug}/`, name: slugToName(slug) };
    },
  },

  // CN — zhongguomeilixiangcun.com
  {
    code: 'search.village.cn',
    name: 'Most Beautiful Villages in China',
    countryCodes: ['CN'],
    listingUrls: ['https://www.zhongguomeilixiangcun.com/villages/'],
    linkPattern: /href="https?:\/\/www\.zhongguomeilixiangcun\.com\/villages\/([a-z0-9-]+)\/?"/gi,
    buildEntry: makeStandardBuilder('https://www.zhongguomeilixiangcun.com', '/villages/'),
  },

  // LB — villagesduliban.com
  {
    code: 'search.village.lb',
    name: 'Most Beautiful Villages of Lebanon',
    countryCodes: ['LB'],
    listingUrls: ['https://www.villagesduliban.com/villages/'],
    linkPattern: /href="https?:\/\/www\.villagesduliban\.com\/villages\/([a-z0-9-]+)\/?"/gi,
    buildEntry: makeStandardBuilder('https://www.villagesduliban.com', '/villages/'),
  },

  // GLOBAL — lpbvt.org (federación internacional)
  {
    code: 'search.village.global',
    name: 'Most Beautiful Villages in the World',
    countryCodes: ['*'],
    listingUrls: ['https://lpbvt.org/members/'],
    linkPattern: /href="https?:\/\/lpbvt\.org\/members\/([a-z0-9-]+)\/?"/gi,
    buildEntry: makeStandardBuilder('https://lpbvt.org', '/members/'),
  },
];

export function getAdapter(code: string): VillageCatalogAdapter | null {
  return ADAPTERS.find((a) => a.code === code) ?? null;
}

export function getAdaptersForCountry(countryCode: string | null): VillageCatalogAdapter[] {
  const out: VillageCatalogAdapter[] = [];
  for (const a of ADAPTERS) {
    if (a.countryCodes.includes('*')) {
      out.push(a);
    } else if (countryCode && a.countryCodes.includes(countryCode.toUpperCase())) {
      out.push(a);
    }
  }
  return out;
}
