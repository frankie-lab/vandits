/**
 * Token glossary — etiquetas humanas + descripción de uso por token.
 *
 * La clave es la ruta del token en el JSON fuente, juntada con puntos
 * (sin distinguir light/dark; pareamos antes de buscar). Ejemplos:
 *   "color.primary"
 *   "poi.state.enriched"
 *   "popup.maxWidth"
 *
 * Si un token no está aquí, mostramos un fallback genérico — nunca el
 * nombre técnico crudo, que es ruido para alguien no técnico.
 */

export interface GlossaryEntry {
  /** Nombre humano corto (es). */
  label: string;
  /** 1–2 frases describiendo dónde/cómo se aplica. */
  usage: string;
}

export const TOKEN_GLOSSARY: Record<string, GlossaryEntry> = {
  // ─── Color · semánticos ────────────────────────────────────────────
  'color.background':         { label: 'Fondo de página',          usage: 'Fondo base de toda la app, detrás del mapa y los paneles.' },
  'color.foreground':         { label: 'Texto principal',          usage: 'Color por defecto del texto sobre el fondo de página.' },
  'color.card':               { label: 'Fondo de tarjeta',         usage: 'Tarjetas, paneles flotantes, diálogos, popups.' },
  'color.cardForeground':     { label: 'Texto sobre tarjeta',      usage: 'Texto dentro de tarjetas y paneles.' },
  'color.popover':            { label: 'Fondo de popover',         usage: 'Menús desplegables, tooltips densos, autocompletados.' },
  'color.popoverForeground':  { label: 'Texto sobre popover',      usage: 'Texto dentro de menús desplegables.' },
  'color.primary':            { label: 'Color de marca',           usage: 'Botones principales (CTA), anillo de foco, enlaces activos.' },
  'color.primaryForeground':  { label: 'Texto sobre marca',        usage: 'Color del texto dentro de botones primarios.' },
  'color.secondary':          { label: 'Color secundario',         usage: 'Botones secundarios y acentos azules (rutas, agua, mar).' },
  'color.secondaryForeground':{ label: 'Texto sobre secundario',   usage: 'Texto dentro de botones secundarios.' },
  'color.muted':              { label: 'Fondo sutil',              usage: 'Filas alternas, chips inactivos, separadores suaves.' },
  'color.mutedForeground':    { label: 'Texto atenuado',           usage: 'Texto auxiliar, descripciones, metadatos.' },
  'color.accent':             { label: 'Acento cálido',            usage: 'Hover de items de menú y resaltes suaves.' },
  'color.accentForeground':   { label: 'Texto sobre acento',       usage: 'Texto sobre fondos de acento.' },
  'color.destructive':        { label: 'Color de aviso/borrar',    usage: 'Botones de eliminar, errores duros, anillo de POI roto.' },
  'color.destructiveForeground': { label: 'Texto sobre destructivo', usage: 'Texto dentro de botones de eliminar.' },
  'color.border':             { label: 'Borde estándar',           usage: 'Bordes de tarjetas, inputs, separadores entre paneles.' },
  'color.input':              { label: 'Borde de input',           usage: 'Borde por defecto de inputs y selects.' },
  'color.ring':               { label: 'Anillo de foco',           usage: 'Halo de teclado al hacer foco con Tab.' },

  // ─── Tipografía ────────────────────────────────────────────────────
  'typography.fontFamily.display': { label: 'Fuente de titulares',  usage: 'Encabezados H1–H3 y números destacados.' },
  'typography.fontFamily.body':    { label: 'Fuente de cuerpo',     usage: 'Texto general, inputs, párrafos.' },
  'typography.fontFamily.mono':    { label: 'Fuente monoespaciada', usage: 'Códigos, identificadores técnicos, este panel.' },
  'typography.size.h1':       { label: 'Titular H1',                usage: 'Título principal de páginas y modales grandes.' },
  'typography.size.h2':       { label: 'Titular H2',                usage: 'Cabeceras de sección.' },
  'typography.size.h3':       { label: 'Titular H3',                usage: 'Cabeceras de panel y diálogos.' },
  'typography.size.h4':       { label: 'Titular H4',                usage: 'Subtítulos dentro de tarjetas.' },
  'typography.size.body':     { label: 'Texto cuerpo',              usage: 'Tamaño por defecto del texto general.' },
  'typography.size.sm':       { label: 'Texto pequeño',             usage: 'Etiquetas, ayuda contextual.' },
  'typography.size.caption':  { label: 'Pie / caption',             usage: 'Texto auxiliar bajo controles o gráficos.' },
  'typography.size.micro':    { label: 'Texto micro',               usage: 'Badges, contadores, anotaciones diminutas.' },

  // ─── Densidad ──────────────────────────────────────────────────────
  'density.controlHeight.sm': { label: 'Control pequeño',           usage: 'Chips, botones xs/sm.' },
  'density.controlHeight.md': { label: 'Control medio',             usage: 'Botones por defecto, selects.' },
  'density.controlHeight.lg': { label: 'Control grande',            usage: 'Inputs y CTAs principales en paneles.' },
  'density.controlHeight.xl': { label: 'Control extra',             usage: 'CTAs principales en hero y onboarding.' },
  'density.iconSize.xs':      { label: 'Icono xs',                  usage: 'Iconos inline dentro de texto.' },
  'density.iconSize.sm':      { label: 'Icono sm',                  usage: 'Iconos en chips y botones pequeños.' },
  'density.iconSize.md':      { label: 'Icono medio',               usage: 'Iconos por defecto en botones y menús.' },
  'density.iconSize.lg':      { label: 'Icono grande',              usage: 'Iconos en cabeceras y tarjetas destacadas.' },
  'density.iconSize.xl':      { label: 'Icono xl',                  usage: 'Iconos hero, ilustrativos.' },

  // ─── Motion ────────────────────────────────────────────────────────
  'motion.duration.instant':  { label: 'Duración instantánea',      usage: 'Cambios visuales sin animación perceptible.' },
  'motion.duration.fast':     { label: 'Duración rápida',           usage: 'Hover, focus, pequeños toggles.' },
  'motion.duration.base':     { label: 'Duración estándar',         usage: 'Apertura de menús, paneles, transiciones por defecto.' },
  'motion.duration.slow':     { label: 'Duración lenta',            usage: 'Animaciones de panel completo o vista de mapa.' },
  'motion.duration.xslow':    { label: 'Duración muy lenta',        usage: 'Transiciones de página o re-encuadre del mapa.' },
  'motion.easing.standard':   { label: 'Easing estándar',           usage: 'Curva por defecto para entrar/salir.' },
  'motion.easing.emphasized': { label: 'Easing enfático',           usage: 'Aperturas que merecen énfasis (modales).' },
  'motion.easing.decel':      { label: 'Easing de desaceleración',  usage: 'Entradas que terminan suaves.' },
  'motion.easing.accel':      { label: 'Easing de aceleración',     usage: 'Salidas que se aceleran al desaparecer.' },

  // ─── Radius ────────────────────────────────────────────────────────
  'radius.base':              { label: 'Radio base',                usage: 'Radio raíz del que derivan los demás.' },
  'radius.xs':                { label: 'Radio xs',                  usage: 'Chips y badges pequeños.' },
  'radius.sm':                { label: 'Radio pequeño',             usage: 'Inputs y botones por defecto.' },
  'radius.md':                { label: 'Radio medio',               usage: 'Tarjetas y paneles.' },
  'radius.lg':                { label: 'Radio grande',              usage: 'Modales y contenedores hero.' },
  'radius.xl':                { label: 'Radio extra',               usage: 'Imágenes destacadas, bloques especiales.' },

  // ─── Z-index ───────────────────────────────────────────────────────
  'zIndex.base':              { label: 'Capa base',                 usage: 'Contenido normal de la página.' },
  'zIndex.map':               { label: 'Mapa',                      usage: 'Lienzo Leaflet.' },
  'zIndex.mapOverlay':        { label: 'Overlay del mapa',          usage: 'Controles flotantes sobre el mapa.' },
  'zIndex.toolbar':           { label: 'Barra de herramientas',     usage: 'FloatingToolbar y barras laterales.' },
  'zIndex.toolbarRaised':     { label: 'Toolbar elevada',           usage: 'Cuando la toolbar tiene un menú abierto.' },
  'zIndex.popover':           { label: 'Popovers',                  usage: 'Menús desplegables, autocompletados.' },
  'zIndex.modal':             { label: 'Modal',                     usage: 'Diálogos y paneles modales (AdminPanel).' },
  'zIndex.modalNested':       { label: 'Modal anidado',             usage: 'Modal dentro de otro modal.' },
  'zIndex.modalTop':          { label: 'Modal superior',            usage: 'Confirmaciones críticas.' },
  'zIndex.toast':             { label: 'Toast',                     usage: 'Notificaciones efímeras.' },
  'zIndex.progressBar':       { label: 'Barra de progreso',         usage: 'Indicadores de carga globales.' },
  'zIndex.modalImport':       { label: 'Modal de import',           usage: 'Flujo de importación de archivos.' },
  'zIndex.max':               { label: 'Máximo',                    usage: 'Reservado, encima de todo.' },

  // ─── POI ───────────────────────────────────────────────────────────
  'poi.state.enriched':       { label: 'Punto enriquecido',         usage: 'Color verde del marker con descripción IA.' },
  'poi.state.imported':       { label: 'Punto importado',           usage: 'Color gris del marker sin enriquecer.' },
  'poi.state.empty':          { label: 'Punto vacío',               usage: 'Color naranja del marker sin descripción ni IA.' },
  'poi.ring.width':           { label: 'Grosor de anillo',          usage: 'Grosor de los anillos de salud apilados fuera del marker.' },
  'poi.ring.empty':           { label: 'Anillo "vacío"',            usage: 'Halo naranja indicando punto sin contenido.' },
  'poi.ring.chain':           { label: 'Anillo "cadena rota"',      usage: 'Halo amarillo indicando geografía incompleta.' },
  'poi.ring.error':           { label: 'Anillo "error"',            usage: 'Halo rojo indicando fallo de enriquecimiento.' },
  'poi.ring.collectionGap':   { label: 'Hueco de colección',        usage: 'Separación entre el marker y el anillo de colección.' },
  'poi.originBorder.my':      { label: 'Borde "mío"',               usage: 'Borde blanco que identifica un punto propio.' },
  'poi.originBorder.followed':{ label: 'Borde "seguido"',           usage: 'Borde dorado de puntos de usuarios seguidos.' },
  'poi.originBorder.service': { label: 'Borde "servicio"',          usage: 'Borde celeste de POIs de servicios externos.' },
  'poi.originBorder.catalog': { label: 'Borde "catálogo"',          usage: 'Borde lila de puntos catálogo.' },
  'poi.hero.size':            { label: 'Tamaño hero',               usage: 'Lado del marker-imagen a zoom alto.' },
  'poi.hero.thumbSize':       { label: 'Tamaño miniatura',          usage: 'Miniatura circular del marker enfocado.' },
  'poi.hero.radius':          { label: 'Radio hero',                usage: 'Redondeo del marker-imagen.' },
  'poi.hero.borderWidth':     { label: 'Borde hero',                usage: 'Grosor del borde de color de estado del marker-imagen.' },
  'poi.microDot.size':        { label: 'Tamaño micro-punto',        usage: 'Diámetro del punto a zoom muy bajo.' },

  // ─── Popup ─────────────────────────────────────────────────────────
  'popup.maxWidth':           { label: 'Ancho máximo',              usage: 'Tope de ancho de la ficha que abre el mapa.' },
  'popup.minWidth':           { label: 'Ancho mínimo',              usage: 'Suelo de ancho para evitar fichas estrechas.' },
  'popup.maxHeight':          { label: 'Alto máximo',               usage: 'Tope de altura antes de hacer scroll interno.' },
  'popup.header.height':      { label: 'Alto de cabecera',          usage: 'Altura fija de la cabecera del popup.' },
  'popup.header.padding':     { label: 'Padding de cabecera',       usage: 'Espacio interno de la cabecera.' },
  'popup.body.padding':       { label: 'Padding del cuerpo',        usage: 'Espacio alrededor del contenido principal.' },
  'popup.body.gap':           { label: 'Hueco entre bloques',       usage: 'Separación vertical entre secciones del popup.' },
  'popup.hero.ratio':         { label: 'Proporción de imagen',      usage: 'Relación 16:9 de la imagen destacada.' },
  'popup.actionRow.height':   { label: 'Alto de acciones',          usage: 'Altura de la fila de botones inferior.' },
  'popup.actionRow.gap':      { label: 'Hueco entre acciones',      usage: 'Separación entre los botones de acción.' },
  'popup.closeButton.size':   { label: 'Tamaño botón cerrar',       usage: 'Lado del botón X del popup.' },
  'popup.closeButton.offset': { label: 'Margen botón cerrar',       usage: 'Distancia del botón X al borde.' },

  // ─── Map ───────────────────────────────────────────────────────────
  'map.zoom.microMax':        { label: 'Zoom micro (máx.)',         usage: 'A partir de aquí los markers son micro-puntos.' },
  'map.zoom.compactMax':      { label: 'Zoom compacto (máx.)',      usage: 'Tope del modo compacto antes de pasar a estándar.' },
  'map.zoom.standardMax':     { label: 'Zoom estándar (máx.)',      usage: 'Tope del modo estándar antes del rich.' },
  'map.zoom.heroMin':         { label: 'Zoom imagen hero (mín.)',   usage: 'Desde aquí el tooltip muestra la imagen hero.' },
  'map.zoom.richMin':         { label: 'Zoom rich (mín.)',          usage: 'Desde aquí el marker se sustituye por la imagen.' },
  'map.pane.tile':            { label: 'Pane de tiles',             usage: 'Capa base del mapa (carta cartográfica).' },
  'map.pane.overlay':         { label: 'Pane de overlay',           usage: 'Polígonos y rutas sobre las tiles.' },
  'map.pane.marker':          { label: 'Pane de markers',           usage: 'POIs por defecto.' },
  'map.pane.markerFocused':   { label: 'Pane de markers enfocados', usage: 'Marker seleccionado, por encima del resto.' },
  'map.pane.tooltip':         { label: 'Pane de tooltips',          usage: 'Tooltips de hover sobre markers/rutas.' },
  'map.pane.popup':           { label: 'Pane de popups',            usage: 'Ficha completa abierta al hacer clic.' },

  // ─── Elevation ─────────────────────────────────────────────────────
  'elevation.shadow.sm':      { label: 'Sombra sm',                 usage: 'Tarjetas en reposo.' },
  'elevation.shadow.md':      { label: 'Sombra md',                 usage: 'Paneles flotantes (FloatingToolbar).' },
  'elevation.shadow.lg':      { label: 'Sombra lg',                 usage: 'Dropdowns y popovers.' },
  'elevation.shadow.xl':      { label: 'Sombra xl',                 usage: 'Modales y diálogos.' },
  'elevation.shadow.marker':  { label: 'Sombra de marker',          usage: 'Sombra bajo cada POI del mapa.' },
  'elevation.shadow.popup':   { label: 'Sombra de popup',           usage: 'Sombra de la ficha del mapa.' },
  'elevation.blur.sm':        { label: 'Blur pequeño',              usage: 'Fondos translúcidos sutiles.' },
  'elevation.blur.md':        { label: 'Blur medio',                usage: 'Backdrops de paneles.' },
  'elevation.blur.lg':        { label: 'Blur fuerte',               usage: 'Backdrops de modales.' },
};

const PRIMITIVE_FAMILY_USAGE: Record<string, string> = {
  neutral: 'Escala neutra (grises/blancos/negros). La consumen fondos, textos, bordes y separadores.',
  brand:   'Escala de marca (naranja). La consume el color de marca, anillo de foco, acentos cálidos.',
  info:    'Escala azul informativa. La consumen acentos secundarios y elementos de mar/agua.',
  danger:  'Escala roja. La consumen botones destructivos y estados de error.',
};

/** Devuelve label + usage, o un fallback genérico si la clave no existe. */
export function lookupGlossary(key: string): GlossaryEntry {
  const direct = TOKEN_GLOSSARY[key];
  if (direct) return direct;

  // Primitivos de color: "color.primitives.neutral.0" → "Neutral 0"
  const primMatch = key.match(/^color\.primitives\.([a-z]+)\.([0-9]+)$/);
  if (primMatch) {
    const [, family, step] = primMatch;
    const cap = family.charAt(0).toUpperCase() + family.slice(1);
    return {
      label: `${cap} ${step}`,
      usage: PRIMITIVE_FAMILY_USAGE[family] ?? 'Color primitivo. Editar afecta a todos los tokens semánticos que lo referencian.',
    };
  }

  return {
    label: '—',
    usage: 'Sin descripción curada. Es un token técnico de soporte.',
  };
}
