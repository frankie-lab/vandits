import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapGooglePlace } from './google-places-mapper.ts';

Deno.test('mapGooglePlace: propaga placeId + provider=google', () => {
  const out = mapGooglePlace(
    {
      id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      displayName: { text: 'Elevador del Monte de San Pedro' },
      location: { latitude: 43.37792, longitude: -8.431581 },
      formattedAddress: 'A Coruña, España',
    },
    'fallback',
  );
  assertEquals(out?.placeId, 'ChIJN1t_tDeuEmsRUsoyG83frY4');
  assertEquals(out?.provider, 'google');
  assertEquals(out?.source, 'google-places');
  assertEquals(out?.name, 'Elevador del Monte de San Pedro');
});

Deno.test('mapGooglePlace: sin id deja placeId undefined pero conserva provider', () => {
  const out = mapGooglePlace(
    { displayName: { text: 'X' }, location: { latitude: 0, longitude: 0 } },
    'fallback',
  );
  assertEquals(out?.placeId, undefined);
  assertEquals(out?.provider, 'google');
});

Deno.test('mapGooglePlace: sin coords devuelve null', () => {
  assertEquals(mapGooglePlace({ id: 'abc' }, 'fallback'), null);
});

Deno.test('mapGooglePlace: usa fallbackName cuando no hay displayName', () => {
  const out = mapGooglePlace(
    { id: 'abc', location: { latitude: 1, longitude: 2 } },
    'fallback',
  );
  assertEquals(out?.name, 'fallback');
});
