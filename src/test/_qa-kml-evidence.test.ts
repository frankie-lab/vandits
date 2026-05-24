import { describe, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { serializePoiKml } from '@/domains/content/lib/exporters/poi-kml';
import { mapToPoiExportRecord } from '@/domains/content/lib/poi-export-mapper';
import { makeTorreHerculesFixture } from '@/test/fixtures/poi-torre-hercules-export';
import { makeMazingerZFixture } from '@/test/fixtures/poi-mazinger-z-export';

mkdirSync('/mnt/documents', { recursive: true });

function build(fixture: any, fileName: string, label: string) {
  const loc = fixture();
  const rec = mapToPoiExportRecord(loc, { scope: 'internal', currentUserId: loc.ownerUserId });
  if (!rec) throw new Error(`${label}: no record`);
  const kml = serializePoiKml([rec], { scope: 'internal', documentName: `qa-${label}`, target: 'gurumaps' });
  writeFileSync(`/mnt/documents/${fileName}`, kml);
  console.log(`\n=== ${label} — ${kml.length} bytes — /mnt/documents/${fileName} ===`);
  console.log(kml);
  console.log(`--- checks (${label}) ---`);
  console.log('CDATA:', kml.includes('<![CDATA['));
  console.log('no <p>:', !/<p[\s>]/.test(kml));
  console.log('no <br>:', !kml.includes('<br/>') && !kml.includes('<br>'));
  console.log('no <b>:', !/<b[\s>]/.test(kml));
  console.log('emoji 📍:', kml.includes('📍'));
  console.log('emoji 🔗:', kml.includes('🔗'));
  console.log('footer:', /— Vandits · \d{4}-\d{2}-\d{2}/.test(kml));
}

describe('QA kml evidence', () => {
  it('builds both fixtures', () => {
    build(makeTorreHerculesFixture, 'qa-pr-export-6-torre-hercules.kml', 'torre-hercules');
    build(makeMazingerZFixture, 'qa-pr-export-6-mazinger-z.kml', 'mazinger-z');
  });
});
