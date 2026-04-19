Unificación de criterios — validación y norma única

&nbsp;

Antes de plantear cualquier cambio, contrasto cada una de tus afirmaciones contra el código actual y las memorias. Marco lo que cuadra, lo que necesita matiz y lo que está mal modelado hoy.

&nbsp;

&nbsp;

&nbsp;

1. "Tres estados de documento: importado / mesa de trabajo / catálogo o itinerario"

&nbsp;

Matiz necesario. En BBDD documents.status tiene 4 valores: draft / in_review / published / archived (ver docs/adr/... y document-visibility.ts). En la práctica el usuario solo maneja 3 niveles funcionales (memoria mem://features/content/document-lifecycle-v3):

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

Nivel funcional

&nbsp;

&nbsp;

&nbsp;

documents.status

&nbsp;

&nbsp;

&nbsp;

Significado

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

Importado / Mesa de trabajo

&nbsp;

&nbsp;

&nbsp;

draft (e in_review como variante)

&nbsp;

&nbsp;

&nbsp;

Privado del usuario, no proyectado al catálogo común

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

Publicado en Catálogo

&nbsp;

&nbsp;

&nbsp;

published

&nbsp;

&nbsp;

&nbsp;

Visible en mapa global de toda la app

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

Eliminar el estado: Archivado. Si se borra se borra definitivamente,

&nbsp;

&nbsp;

&nbsp;

archived

&nbsp;

&nbsp;

&nbsp;

Borrar definitivo

&nbsp;

"Itinerario" no es un estado de documento: un documento puede contener rutas (itinerarios) y/o puntos. Son ejes ortogonales.

&nbsp;

Conclusión: correcto en espíritu, pero el estado se llama status y "itinerario" no es un estado sino un tipo de contenido dentro del documento.

&nbsp;

&nbsp;

&nbsp;

2. "Eso define dónde se ve (catálogo (mapa general) / itinerario (solo desde itinerarios) / mesa de trabajo (solo desde archivos importados)"

&nbsp;

Casi correcto, con un matiz importante (Opción 3 ya implantada).

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

status='published' → puntos del documento visibles en mapa global (isLocationVisibleInGlobalMap, helper único).

&nbsp;

&nbsp;

&nbsp;

status='draft' → puntos visibles solo dentro de la vista del documento.

&nbsp;

&nbsp;

&nbsp;

Las rutas siguen una regla aparte (memoria mem://logic/routes/visibility-rules-v2): NUNCA se muestran por defecto en el mapa global, ni siquiera si el documento está published. Solo aparecen si:

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

El usuario las activa explícitamente desde el panel Itinerarios, o

&nbsp;

&nbsp;

&nbsp;

Se está viendo el documento que las contiene.

&nbsp;

Conclusión: la visibilidad de puntos la dicta status. La visibilidad de rutas la dicta el toggle de Itinerarios o la vista de documento, no el status del documento.

&nbsp;

&nbsp;

&nbsp;

3. "Hay puntos canónicos de catálogo y waypoints ligados a rutas"

&nbsp;

Correcto, pero hoy esa distinción no es estricta en el modelo.

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

Puntos canónicos de catálogo: puntos enriquecidos,o no o vacios cuya ficha proviene del catálogo común V2 (heredada o vinculada a un place_id común). Memoria mem://technical/enrichment/inheritance-logic. Son puntos al que el usuario a decidido añadir a su lista de catalogo tal y como los ha importado, con info, vacios o enriquedos. 

&nbsp;

&nbsp;

&nbsp;

Waypoints de ruta: puntos cuya razón de ser es ser intermedio de una ruta (route_waypoints). Memoria mem://logic/content/waypoint-identity-rule lo enuncia: "los waypoints son siempre waypoints". 

&nbsp;

Hoy ambos viven en la misma tabla locations y se distinguen por:

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

Pertenencia a una ruta (route_waypoints.location_id).

&nbsp;

&nbsp;

&nbsp;

Origen del enriquecimiento (catálogo heredado vs. enriquecido por usuario vs. sin enriquecer).

&nbsp;

Conclusión: correcto conceptualmente. La distinción ya existe; lo que falta es una única señal canónica (enrichmentOrigin) que el código pueda consultar sin recalcularla. (crear esa una única señal canónica)

&nbsp;

&nbsp;

&nbsp;

4. "Los canónicos siempre visibles en mapa general, los waypoints solo al hacer click en la ruta"

&nbsp;

Aquí hay una desviación respecto al código actual. Hoy:

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

Todo punto (sea waypoint o no) cuyo documento padre esté published se muestra en el mapa global.

&nbsp;

&nbsp;

&nbsp;

No hay un filtro tipo "ocultar waypoints en global, mostrar solo al abrir la ruta".

&nbsp;

Tu propuesta es más estricta: separar visibilidad por tipo de punto. Esto requiere validar si quieres aplicarlo. Lo dejo como pregunta antes de tocar nada.

&nbsp;

&nbsp;

&nbsp;

5. "Los colores siguen la misma lógica independientemente de la capa"

&nbsp;

Correcto y es exactamente la norma que falta consolidar. La matriz transversal (sin nombres de docs ni números) debe ser:

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

Origen del enriquecimiento del punto

&nbsp;

&nbsp;

&nbsp;

Forma

&nbsp;

&nbsp;

&nbsp;

Paleta

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

Enriquecido del catálogo común (heredado/vinculado)

&nbsp;

&nbsp;

&nbsp;

Círculo pequeño

&nbsp;

&nbsp;

&nbsp;

Gris

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

Enriquecido por el usuario (manual o sobre importado)

&nbsp;

&nbsp;

&nbsp;

Círculo pequeño

&nbsp;

&nbsp;

&nbsp;

Verde

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

Importado con descripción original (sin IA)

&nbsp;

&nbsp;

&nbsp;

Círculo pequeño

&nbsp;

&nbsp;

&nbsp;

Gris

&nbsp;

&nbsp;

Vacío (sin descripción ni IA)

Círculo pequeño

Naranja

Esta matriz aplica igual en mapa global, vista de documento, popup y miniaturas de listas. El status del documento padre solo determina visibilidad, no paleta.

Tres preguntas antes de cerrar la norma

Necesito que me confirmes tres decisiones para dejar la regla cerrada y aplicable a todo (cualquier usuario, cualquier documento, cualquier estado). Te las explico en cristiano y con ejemplos.

Pregunta 1 — ¿Qué se ve en el mapa general cuando publicas un documento?

Imagina que importas un KML con 2.000 puntos y lo marcas como "Publicado en Catálogo". De esos 2.000 puntos, pongamos que 50 están enriquecidos con ficha IA, 1.800 son importados con descripción de texto, 100 están vacíos y 50 son waypoints intermedios de rutas.

Opción A — Verlos todos (lo que pasa hoy):

En el mapa general aparecen los 2.000. Cada uno con su color y forma según su estado. El mapa se llena.

Pregunta 2 — ¿Cómo distinguimos "azul cielo" (catálogo común) de "verde" (tu enriquecimiento)? 

Ya no hay azul cielo.!

Pregunta 3 — ¿Y las rutas? ¿Se ven en el general cuando publicas el documento?

Hoy las rutas nunca aparecen en el mapa general por defecto: solo cuando las activas en el panel Itinerarios o cuando abres el documento que las contiene.

Opción A — Dejarlo igual:

Las rutas siguen ocultas en el general. Para verlas, abres el documento o las activas en Itinerarios.