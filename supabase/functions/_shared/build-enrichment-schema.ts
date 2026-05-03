/**
 * Construye dinámicamente la sección de reglas y el "shape" JSON
 * que la IA debe devolver, a partir de la configuración v2.
 *
 * Garantiza que campos desactivados NO se generan (ahorro de tokens)
 * y que el orden del JSON respeta el orden del editor.
 */
import {
  CARD_FIELD_CATALOG,
  CardFieldKey,
  EnrichmentCardConfigV2,
  getActiveFields,
} from './card-schema.ts';

export interface BuiltSchema {
  /** Bloque "REGLAS DE CONTENIDO" para inyectar en el system prompt */
  rulesBlock: string;
  /** Bloque "Responde en JSON con esta estructura exacta:" para inyectar en el system prompt */
  jsonShapeBlock: string;
  /** Lista ordenada de claves activas */
  activeKeys: CardFieldKey[];
}

export function buildEnrichmentSchema(
  cfg: EnrichmentCardConfigV2,
  opts: { effectiveMinLength: number },
): BuiltSchema {
  const active = getActiveFields(cfg);
  const activeKeys = active.map((f) => f.key);

  const rules: string[] = [];
  active.forEach((f, idx) => {
    const def = CARD_FIELD_CATALOG[f.key];
    const minLen = f.min_length ?? opts.effectiveMinLength;
    rules.push(`${idx + 1}. ${def.label}: ${def.promptHint({ minLength: minLen })}`);
  });

  // Construir JSON shape conservando orden
  const shape: Record<string, unknown> = {
    verified: true,
    verification_notes: 'Notas sobre coherencia',
  };

  for (const f of active) {
    const def = CARD_FIELD_CATALOG[f.key];
    let value: unknown = def.jsonShape;

    // datos_clave: añadir sub-bloques web/contacto sólo si toggles activos
    if (f.key === 'datos_clave') {
      const baseObj = { ...(def.jsonShape as Record<string, unknown>) };
      if (cfg.include_web) baseObj.web_referencia = 'Solo si existe';
      if (cfg.include_contact) {
        baseObj.datos_contacto = {
          telefono: 'Si disponible',
          email: 'Si disponible',
          horario: 'Si disponible',
          precio: 'Si aplicable',
        };
      }
      value = baseObj;
    }

    // indice_interes: añadir notas
    if (f.key === 'indice_interes') {
      shape.indice_interes = value;
      shape.indice_interes_notas = 'Breve justificación';
      continue;
    }

    shape[f.key] = value;
  }

  if (cfg.correct_coordinates) {
    shape.coordenadas_corregidas = {
      lat: 40.1234,
      lng: -3.5678,
      motivo: 'Punto desplazado X metros del lugar real',
    };
  }

  return {
    activeKeys,
    rulesBlock: `REGLAS DE CONTENIDO (sólo estos campos, en este orden):\n${rules.join('\n\n')}`,
    jsonShapeBlock:
      'Responde SIEMPRE en formato JSON con EXACTAMENTE estas claves y en este orden (no añadas otras):\n' +
      JSON.stringify(shape, null, 2),
  };
}
