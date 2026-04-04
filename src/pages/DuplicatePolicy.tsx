import { ArrowLeft, MapPin, AlertTriangle, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function DuplicatePolicy() {
 return (
 <div className="min-h-screen bg-background">
 <div className="max-w-3xl mx-auto px-4 py-8">
 {/* Header */}
 <div className="mb-8">
 <Link to="/">
 <Button variant="ghost" size="sm" className="mb-4">
 <ArrowLeft className="w-4 h-4 mr-2" />
 Volver
 </Button>
 </Link>
 <h1 className="text-3xl font-bold">Política de Duplicados</h1>
 <p className="text-muted-foreground mt-2">Cómo gestionamos las ubicaciones duplicadas</p>
 </div>

 {/* Content */}
 <div className="prose dark:prose-invert max-w-none space-y-6">
 <section>
 <h2 className="text-xl font-semibold mb-3">¿Qué es un duplicado?</h2>
 <p className="text-muted-foreground">
 Un duplicado es una ubicación que ya existe en la base de datos y coincide con un punto 
 nuevo que intentas subir. La detección se basa en la proximidad geográfica entre puntos.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-semibold mb-3">Umbral de detección</h2>
 <p className="text-muted-foreground mb-4">
 Utilizamos un umbral único para todos los tipos de ubicación:
 </p>
 
 <div className="p-4 bg-muted/30 rounded-lg border">
 <div className="flex items-center gap-2 mb-2">
 <MapPin className="w-5 h-5 text-primary" />
 <span className="font-medium">Todas las ubicaciones</span>
 <Badge variant="secondary">5 metros</Badge>
 </div>
 <p className="text-sm text-muted-foreground">
 Solo se consideran duplicados los puntos que están a menos de 5 metros de distancia entre sí.
 Este umbral estricto evita falsos positivos y permite tener puntos cercanos pero distintos.
 </p>
 </div>
 </section>

 <section>
 <h2 className="text-xl font-semibold mb-3">¿Qué ocurre con los duplicados?</h2>
 <div className="space-y-4">
 <div className="flex gap-3 p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
 <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
 <div>
 <p className="font-medium text-amber-500">Se omiten automáticamente</p>
 <p className="text-sm text-muted-foreground mt-1">
 Cuando se detecta un duplicado, el punto nuevo NO se añade a la base de datos. 
 Se mantiene la versión existente para preservar cualquier enriquecimiento previo.
 </p>
 </div>
 </div>

 <div className="flex gap-3 p-4 bg-green-500/10 rounded-lg border border-green-500/20">
 <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
 <div>
 <p className="font-medium text-green-500">Se preservan los datos enriquecidos</p>
 <p className="text-sm text-muted-foreground mt-1">
 Si la ubicación existente ya fue enriquecida con descripciones, imágenes, etiquetas 
 o metadatos, toda esa información se conserva intacta.
 </p>
 </div>
 </div>
 </div>
 </section>

 <section>
 <h2 className="text-xl font-semibold mb-3">Proceso de subida</h2>
 <ol className="list-decimal list-inside text-muted-foreground space-y-2">
 <li>Se analiza el archivo subido y se extraen las ubicaciones con coordenadas GPS válidas</li>
 <li>Cada ubicación se compara con la base de datos existente usando los umbrales definidos</li>
 <li>Se muestra un resumen con el número de ubicaciones nuevas y duplicadas detectadas</li>
 <li>El usuario puede revisar los duplicados antes de confirmar la importación</li>
 <li>Solo las ubicaciones nuevas se añaden a la base de datos</li>
 </ol>
 </section>

 <section>
 <h2 className="text-xl font-semibold mb-3">Gestión manual de duplicados</h2>
 <p className="text-muted-foreground">
 Además de la detección automática durante la subida, puedes acceder al panel de 
 "Detección de Duplicados" desde el menú principal para:
 </p>
 <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
 <li>Revisar posibles duplicados existentes en tu colección</li>
 <li>Fusionar ubicaciones similares manualmente</li>
 <li>Comparar datos entre puntos duplicados</li>
 <li>Eliminar duplicados seleccionados</li>
 </ul>
 </section>

 <section>
 <h2 className="text-xl font-semibold mb-3">Preguntas frecuentes</h2>
 <div className="space-y-4">
 <div>
 <p className="font-medium">¿Puedo forzar la subida de un duplicado?</p>
 <p className="text-sm text-muted-foreground mt-1">
 No directamente. Si necesitas actualizar una ubicación existente, edítala desde 
 el panel de detalles en lugar de subirla de nuevo.
 </p>
 </div>
 <div>
 <p className="font-medium">¿Los umbrales son configurables?</p>
 <p className="text-sm text-muted-foreground mt-1">
 Actualmente los umbrales son fijos y están optimizados para la mayoría de casos de uso.
 </p>
 </div>
 <div>
 <p className="font-medium">¿Qué pasa si dos usuarios suben la misma ubicación?</p>
 <p className="text-sm text-muted-foreground mt-1">
 Cada usuario mantiene su propia colección. La detección de duplicados solo se aplica 
 dentro del contexto de cada usuario y sus documentos.
 </p>
 </div>
 </div>
 </section>
 </div>
 </div>
 </div>
 );
}
