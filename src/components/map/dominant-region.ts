/**
 * dominant-region — Helper único para "elegir la región más densa de un
 * subconjunto disperso de POIs y devolver sus bounds".
 *
 * Caso de uso canónico: filtro por usuario seguido cuyo subconjunto cruza
 * varios continentes. El centro geométrico de los bounds globales cae en
 * mar abierto (Atlántico/Pacífico). Aterrizar ahí es información cero.
 *
 * Algoritmo: grid-bucket de 5° lat × 5° lng, contamos puntos por celda y
 * elegimos la celda con más puntos como semilla. Expandimos a celdas
 * vecinas (8-conexa) hasta que la suma deja de crecer significativamente.
 * Devolvemos los bounds de los puntos contenidos en esa región.
 *
 * Ver mem://logic/map/subset-fit-contract.
 */

const CELL_DEG = 5;

export interface DominantRegionResult {
  /** Puntos contenidos en la región elegida. */
  points: Array<[number, number]>;
  /** Total del subset (para ratio). */
  totalCount: number;
  /** Cobertura: points.length / totalCount. */
  coverage: number;
}

function cellKey(lat: number, lng: number): string {
  const cy = Math.floor(lat / CELL_DEG);
  const cx = Math.floor(lng / CELL_DEG);
  return `${cy}:${cx}`;
}

/**
 * Devuelve los puntos del cluster geográfico mayor del subconjunto.
 * Si el subset es <2 puntos o suficientemente compacto, devuelve TODOS
 * los puntos (caller debería usar bounds globales sin transformar).
 */
export function pickDominantRegion(
  pts: Array<[number, number]>,
): DominantRegionResult {
  const total = pts.length;
  if (total <= 2) {
    return { points: [...pts], totalCount: total, coverage: 1 };
  }

  // 1) Bucket por celda.
  const buckets = new Map<string, Array<[number, number]>>();
  for (const p of pts) {
    const key = cellKey(p[0], p[1]);
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }

  // 2) Celda semilla: la más poblada.
  let seedKey = '';
  let seedCount = 0;
  for (const [k, v] of buckets) {
    if (v.length > seedCount) {
      seedCount = v.length;
      seedKey = k;
    }
  }
  if (!seedKey) {
    return { points: [...pts], totalCount: total, coverage: 1 };
  }

  // 3) Crecimiento 8-conexo greedy: añadir vecinas con ≥1 punto.
  const visited = new Set<string>([seedKey]);
  const queue: string[] = [seedKey];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const [cy, cx] = cur.split(':').map(Number);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && dx === 0) continue;
        const nk = `${cy + dy}:${cx + dx}`;
        if (visited.has(nk)) continue;
        if (buckets.has(nk)) {
          visited.add(nk);
          queue.push(nk);
        }
      }
    }
  }

  // 4) Recolectar puntos del cluster expandido.
  const collected: Array<[number, number]> = [];
  for (const k of visited) {
    const list = buckets.get(k);
    if (list) collected.push(...list);
  }

  return {
    points: collected,
    totalCount: total,
    coverage: collected.length / total,
  };
}

/**
 * Decide si los bounds globales son "demasiado dispersos" y conviene
 * acotar a la región dominante. Umbral: span > 40° lat ó > 60° lng.
 */
export function shouldUseDominantRegion(pts: Array<[number, number]>): boolean {
  if (pts.length < 3) return false;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of pts) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  return latSpan > 40 || lngSpan > 60;
}
