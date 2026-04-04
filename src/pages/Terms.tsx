import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Terms() {
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
 <h1 className="text-3xl font-bold">Términos de Uso</h1>
 <p className="text-muted-foreground mt-2">Última actualización: Enero 2026</p>
 </div>

 {/* Content */}
 <div className="prose dark:prose-invert max-w-none space-y-6">
 <section>
 <h2 className="text-xl font-semibold mb-3">1. Aceptación de los términos</h2>
 <p className="text-muted-foreground">
 Al utilizar VANDITS y subir archivos de ubicaciones geográficas, aceptas estos términos de uso en su totalidad. 
 Si no estás de acuerdo con alguna parte de estos términos, no debes utilizar el servicio.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-semibold mb-3">2. Uso del servicio</h2>
 <p className="text-muted-foreground">
 VANDITS es una plataforma para gestionar y compartir ubicaciones geográficas. El usuario se compromete a:
 </p>
 <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
 <li>Utilizar el servicio de forma responsable y legal</li>
 <li>No subir contenido que infrinja derechos de terceros</li>
 <li>No compartir información personal sensible de otras personas sin su consentimiento</li>
 <li>Mantener la confidencialidad de sus credenciales de acceso</li>
 </ul>
 </section>

 <section>
 <h2 className="text-xl font-semibold mb-3">3. Propiedad del contenido</h2>
 <p className="text-muted-foreground">
 El usuario mantiene la propiedad de los datos que sube a la plataforma. Al subir contenido, 
 el usuario otorga a VANDITS una licencia no exclusiva para almacenar, procesar y mostrar 
 dicho contenido según la configuración de visibilidad elegida.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-semibold mb-3">4. Datos geográficos</h2>
 <p className="text-muted-foreground">
 Los archivos subidos deben contener coordenadas GPS válidas. El sistema validará automáticamente 
 el formato y descartará los puntos que no cumplan con los requisitos técnicos. El usuario 
 es responsable de la exactitud de las ubicaciones que comparte.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-semibold mb-3">5. Privacidad y visibilidad</h2>
 <p className="text-muted-foreground">
 El usuario puede configurar la visibilidad de sus ubicaciones como:
 </p>
 <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
 <li><strong>Público:</strong> Visible para todos los usuarios</li>
 <li><strong>Seguidores:</strong> Visible solo para seguidores aceptados</li>
 <li><strong>Privado:</strong> Visible solo para el propietario</li>
 </ul>
 </section>

 <section>
 <h2 className="text-xl font-semibold mb-3">6. Contenido prohibido</h2>
 <p className="text-muted-foreground">
 Está prohibido subir ubicaciones que:
 </p>
 <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
 <li>Revelen información privada de terceros sin consentimiento</li>
 <li>Estén relacionadas con actividades ilegales</li>
 <li>Contengan información falsa o engañosa</li>
 <li>Infrinjan derechos de propiedad intelectual</li>
 </ul>
 </section>

 <section>
 <h2 className="text-xl font-semibold mb-3">7. Limitación de responsabilidad</h2>
 <p className="text-muted-foreground">
 VANDITS proporciona el servicio "tal cual" sin garantías de ningún tipo. No nos hacemos 
 responsables de la precisión de los datos geográficos ni de las decisiones tomadas 
 basándose en la información de la plataforma.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-semibold mb-3">8. Modificaciones</h2>
 <p className="text-muted-foreground">
 Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios 
 serán efectivos desde su publicación. El uso continuado del servicio implica la aceptación 
 de los términos modificados.
 </p>
 </section>
 </div>
 </div>
 </div>
 );
}
