
-- Tabla de compatibilidad entre modos de transporte
CREATE TABLE public.transport_mode_compatibility (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  carrier_code TEXT NOT NULL,
  carried_code TEXT NOT NULL,
  is_compatible BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(carrier_code, carried_code)
);

ALTER TABLE public.transport_mode_compatibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read compatibility"
  ON public.transport_mode_compatibility FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Masters can manage compatibility"
  ON public.transport_mode_compatibility FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role));

-- Matriz de compatibilidad: qué vehículo propio puede ir dentro de qué medio
-- Carriers: ferry, airline, train, public_bus
-- Carried: own_car, rental_car, motorcycle, camper_van, motorhome, car_caravan, bicycle, rental_boat

-- FERRY como carrier
INSERT INTO public.transport_mode_compatibility (carrier_code, carried_code, is_compatible, notes) VALUES
  ('ferry', 'own_car', true, 'Coches aceptados en la mayoría de ferries'),
  ('ferry', 'rental_car', true, 'Verificar política de la empresa de alquiler'),
  ('ferry', 'motorcycle', true, 'Motos aceptadas en ferries'),
  ('ferry', 'camper_van', true, 'Furgonetas aceptadas, tarifa mayor por tamaño'),
  ('ferry', 'motorhome', true, 'Autocaravanas aceptadas con restricciones de tamaño'),
  ('ferry', 'car_caravan', true, 'Coche+caravana aceptado, tarifa por metros lineales'),
  ('ferry', 'bicycle', true, 'Bicicletas fácilmente aceptadas'),
  ('ferry', 'rental_boat', false, 'Un barco no puede subir a un ferry');

-- AIRLINE como carrier
INSERT INTO public.transport_mode_compatibility (carrier_code, carried_code, is_compatible, notes) VALUES
  ('airline', 'own_car', false, 'Imposible transportar coche en avión comercial'),
  ('airline', 'rental_car', false, 'Imposible transportar coche en avión'),
  ('airline', 'motorcycle', false, 'No se transportan motos en vuelos comerciales'),
  ('airline', 'camper_van', false, 'Imposible'),
  ('airline', 'motorhome', false, 'Imposible'),
  ('airline', 'car_caravan', false, 'Imposible'),
  ('airline', 'bicycle', true, 'Posible embalada como equipaje especial, coste extra'),
  ('airline', 'rental_boat', false, 'Imposible');

-- TRAIN como carrier
INSERT INTO public.transport_mode_compatibility (carrier_code, carried_code, is_compatible, notes) VALUES
  ('train', 'own_car', false, 'Solo trenes especiales (Eurotunnel) admiten coches'),
  ('train', 'rental_car', false, 'Solo trenes especiales admiten coches'),
  ('train', 'motorcycle', false, 'Generalmente no admitido en trenes convencionales'),
  ('train', 'camper_van', false, 'No admitido en trenes'),
  ('train', 'motorhome', false, 'No admitido en trenes'),
  ('train', 'car_caravan', false, 'No admitido en trenes'),
  ('train', 'bicycle', true, 'Admitido en la mayoría de trenes, a veces con reserva'),
  ('train', 'rental_boat', false, 'Imposible');

-- PUBLIC_BUS como carrier
INSERT INTO public.transport_mode_compatibility (carrier_code, carried_code, is_compatible, notes) VALUES
  ('public_bus', 'own_car', false, 'Imposible'),
  ('public_bus', 'rental_car', false, 'Imposible'),
  ('public_bus', 'motorcycle', false, 'Imposible'),
  ('public_bus', 'camper_van', false, 'Imposible'),
  ('public_bus', 'motorhome', false, 'Imposible'),
  ('public_bus', 'car_caravan', false, 'Imposible'),
  ('public_bus', 'bicycle', true, 'Posible en bodega en algunos buses interurbanos'),
  ('public_bus', 'rental_boat', false, 'Imposible');

-- PRIVATE_PLANE como carrier
INSERT INTO public.transport_mode_compatibility (carrier_code, carried_code, is_compatible, notes) VALUES
  ('private_plane', 'own_car', false, 'Imposible en avioneta'),
  ('private_plane', 'rental_car', false, 'Imposible'),
  ('private_plane', 'motorcycle', false, 'Imposible'),
  ('private_plane', 'camper_van', false, 'Imposible'),
  ('private_plane', 'motorhome', false, 'Imposible'),
  ('private_plane', 'car_caravan', false, 'Imposible'),
  ('private_plane', 'bicycle', false, 'Muy limitado en avionetas'),
  ('private_plane', 'rental_boat', false, 'Imposible');

-- TAXI como carrier
INSERT INTO public.transport_mode_compatibility (carrier_code, carried_code, is_compatible, notes) VALUES
  ('taxi', 'bicycle', true, 'Posible si cabe en el maletero o con portabicis');
