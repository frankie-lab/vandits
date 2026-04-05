
-- Create ferry_routes table with real commercial ferry data
CREATE TABLE public.ferry_routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_name TEXT NOT NULL,
  origin_port_name TEXT NOT NULL,
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lng DOUBLE PRECISION NOT NULL,
  origin_country TEXT,
  destination_port_name TEXT NOT NULL,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  destination_country TEXT,
  operators TEXT[] DEFAULT '{}',
  estimated_duration_minutes INTEGER,
  distance_km DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT true,
  region TEXT DEFAULT 'mediterranean',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ferry_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ferry routes"
  ON public.ferry_routes FOR SELECT TO authenticated USING (true);

-- Index for spatial lookups
CREATE INDEX idx_ferry_routes_origin ON public.ferry_routes (origin_lat, origin_lng);
CREATE INDEX idx_ferry_routes_dest ON public.ferry_routes (destination_lat, destination_lng);
CREATE INDEX idx_ferry_routes_region ON public.ferry_routes (region);

-- Trigger for updated_at
CREATE TRIGGER update_ferry_routes_updated_at
  BEFORE UPDATE ON public.ferry_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- CÓRCEGA (France)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.ferry_routes (route_name, origin_port_name, origin_lat, origin_lng, origin_country, destination_port_name, destination_lat, destination_lng, destination_country, operators, estimated_duration_minutes, distance_km, region) VALUES
('Marseille - Bastia', 'Marseille', 43.2965, 5.3698, 'FR', 'Bastia', 42.6976, 9.4509, 'FR', ARRAY['Corsica Linea','La Méridionale'], 660, 370, 'mediterranean'),
('Marseille - Ajaccio', 'Marseille', 43.2965, 5.3698, 'FR', 'Ajaccio', 41.9192, 8.7386, 'FR', ARRAY['Corsica Linea','La Méridionale'], 690, 390, 'mediterranean'),
('Marseille - Porto-Vecchio', 'Marseille', 43.2965, 5.3698, 'FR', 'Porto-Vecchio', 41.5910, 9.2795, 'FR', ARRAY['Corsica Linea'], 780, 420, 'mediterranean'),
('Marseille - L''Île-Rousse', 'Marseille', 43.2965, 5.3698, 'FR', 'L''Île-Rousse', 42.6369, 8.9381, 'FR', ARRAY['Corsica Linea'], 690, 380, 'mediterranean'),
('Marseille - Propriano', 'Marseille', 43.2965, 5.3698, 'FR', 'Propriano', 41.6764, 8.9030, 'FR', ARRAY['Corsica Linea'], 720, 400, 'mediterranean'),
('Toulon - Bastia', 'Toulon', 43.1242, 5.9280, 'FR', 'Bastia', 42.6976, 9.4509, 'FR', ARRAY['Corsica Ferries'], 480, 310, 'mediterranean'),
('Toulon - Ajaccio', 'Toulon', 43.1242, 5.9280, 'FR', 'Ajaccio', 41.9192, 8.7386, 'FR', ARRAY['Corsica Ferries'], 540, 340, 'mediterranean'),
('Toulon - L''Île-Rousse', 'Toulon', 43.1242, 5.9280, 'FR', 'L''Île-Rousse', 42.6369, 8.9381, 'FR', ARRAY['Corsica Ferries'], 480, 300, 'mediterranean'),
('Nice - Bastia', 'Nice', 43.6961, 7.2715, 'FR', 'Bastia', 42.6976, 9.4509, 'FR', ARRAY['Corsica Ferries'], 360, 210, 'mediterranean'),
('Nice - Ajaccio', 'Nice', 43.6961, 7.2715, 'FR', 'Ajaccio', 41.9192, 8.7386, 'FR', ARRAY['Corsica Ferries'], 420, 280, 'mediterranean'),
('Nice - L''Île-Rousse', 'Nice', 43.6961, 7.2715, 'FR', 'L''Île-Rousse', 42.6369, 8.9381, 'FR', ARRAY['Corsica Ferries'], 330, 200, 'mediterranean'),
('Livorno - Bastia', 'Livorno', 43.5485, 10.3106, 'IT', 'Bastia', 42.6976, 9.4509, 'FR', ARRAY['Corsica Ferries','Moby Lines'], 240, 130, 'mediterranean'),
('Genova - Bastia', 'Genova', 44.4056, 8.9463, 'IT', 'Bastia', 42.6976, 9.4509, 'FR', ARRAY['Moby Lines'], 390, 230, 'mediterranean'),
('Savona - Bastia', 'Savona', 44.3091, 8.4772, 'IT', 'Bastia', 42.6976, 9.4509, 'FR', ARRAY['Corsica Ferries'], 360, 210, 'mediterranean'),
('Savona - L''Île-Rousse', 'Savona', 44.3091, 8.4772, 'IT', 'L''Île-Rousse', 42.6369, 8.9381, 'FR', ARRAY['Corsica Ferries'], 390, 220, 'mediterranean'),
('Piombino - Bastia', 'Piombino', 42.9267, 10.5283, 'IT', 'Bastia', 42.6976, 9.4509, 'FR', ARRAY['Corsica Ferries','Blu Navy'], 180, 100, 'mediterranean'),
('Bonifacio - Santa Teresa Gallura', 'Bonifacio', 41.3887, 9.1594, 'FR', 'Santa Teresa Gallura', 41.2414, 9.1878, 'IT', ARRAY['Moby Lines','Blu Navy'], 60, 15, 'mediterranean'),

-- ═══════════════════════════════════════════════════════════════
-- CERDEÑA (Italy)
-- ═══════════════════════════════════════════════════════════════
('Genova - Porto Torres', 'Genova', 44.4056, 8.9463, 'IT', 'Porto Torres', 40.8426, 8.4019, 'IT', ARRAY['Tirrenia','GNV'], 660, 450, 'mediterranean'),
('Genova - Olbia', 'Genova', 44.4056, 8.9463, 'IT', 'Olbia', 40.9226, 9.5015, 'IT', ARRAY['Tirrenia','Moby Lines','GNV'], 600, 420, 'mediterranean'),
('Genova - Arbatax', 'Genova', 44.4056, 8.9463, 'IT', 'Arbatax', 39.9340, 9.7060, 'IT', ARRAY['Tirrenia'], 780, 530, 'mediterranean'),
('Livorno - Olbia', 'Livorno', 43.5485, 10.3106, 'IT', 'Olbia', 40.9226, 9.5015, 'IT', ARRAY['Moby Lines','Grimaldi Lines'], 480, 300, 'mediterranean'),
('Livorno - Golfo Aranci', 'Livorno', 43.5485, 10.3106, 'IT', 'Golfo Aranci', 40.9889, 9.6128, 'IT', ARRAY['Corsica Ferries','Sardinia Ferries'], 420, 280, 'mediterranean'),
('Civitavecchia - Olbia', 'Civitavecchia', 42.0933, 11.7897, 'IT', 'Olbia', 40.9226, 9.5015, 'IT', ARRAY['Tirrenia','Grimaldi Lines','Moby Lines'], 330, 260, 'mediterranean'),
('Civitavecchia - Porto Torres', 'Civitavecchia', 42.0933, 11.7897, 'IT', 'Porto Torres', 40.8426, 8.4019, 'IT', ARRAY['Tirrenia','Grimaldi Lines'], 420, 310, 'mediterranean'),
('Civitavecchia - Cagliari', 'Civitavecchia', 42.0933, 11.7897, 'IT', 'Cagliari', 39.2148, 9.1107, 'IT', ARRAY['Tirrenia'], 840, 500, 'mediterranean'),
('Civitavecchia - Arbatax', 'Civitavecchia', 42.0933, 11.7897, 'IT', 'Arbatax', 39.9340, 9.7060, 'IT', ARRAY['Tirrenia'], 600, 380, 'mediterranean'),
('Napoli - Cagliari', 'Napoli', 40.8518, 14.2681, 'IT', 'Cagliari', 39.2148, 9.1107, 'IT', ARRAY['Tirrenia'], 810, 490, 'mediterranean'),
('Napoli - Olbia', 'Napoli', 40.8518, 14.2681, 'IT', 'Olbia', 40.9226, 9.5015, 'IT', ARRAY['GNV'], 600, 430, 'mediterranean'),
('Palermo - Cagliari', 'Palermo', 38.1157, 13.3615, 'IT', 'Cagliari', 39.2148, 9.1107, 'IT', ARRAY['Tirrenia'], 720, 390, 'mediterranean'),
('Barcelona - Porto Torres', 'Barcelona', 41.3874, 2.1686, 'ES', 'Porto Torres', 40.8426, 8.4019, 'IT', ARRAY['Grimaldi Lines'], 720, 560, 'mediterranean'),
('Toulon - Porto Torres', 'Toulon', 43.1242, 5.9280, 'FR', 'Porto Torres', 40.8426, 8.4019, 'IT', ARRAY['Corsica Ferries'], 540, 380, 'mediterranean'),
('Piombino - Olbia', 'Piombino', 42.9267, 10.5283, 'IT', 'Olbia', 40.9226, 9.5015, 'IT', ARRAY['Moby Lines'], 330, 230, 'mediterranean'),

-- ═══════════════════════════════════════════════════════════════
-- BALEARES (Spain)
-- ═══════════════════════════════════════════════════════════════
('Barcelona - Palma de Mallorca', 'Barcelona', 41.3874, 2.1686, 'ES', 'Palma de Mallorca', 39.5696, 2.6502, 'ES', ARRAY['Trasmediterránea','Baleària','GNV'], 450, 260, 'mediterranean'),
('Barcelona - Ibiza', 'Barcelona', 41.3874, 2.1686, 'ES', 'Ibiza', 38.9067, 1.4206, 'ES', ARRAY['Trasmediterránea','Baleària','GNV'], 510, 310, 'mediterranean'),
('Barcelona - Mahón', 'Barcelona', 41.3874, 2.1686, 'ES', 'Mahón', 39.8885, 4.2658, 'ES', ARRAY['Trasmediterránea','Baleària'], 390, 230, 'mediterranean'),
('Barcelona - Alcúdia', 'Barcelona', 41.3874, 2.1686, 'ES', 'Alcúdia', 39.8536, 3.1184, 'ES', ARRAY['Baleària'], 360, 220, 'mediterranean'),
('Valencia - Palma de Mallorca', 'Valencia', 39.4699, -0.3763, 'ES', 'Palma de Mallorca', 39.5696, 2.6502, 'ES', ARRAY['Trasmediterránea','Baleària'], 450, 270, 'mediterranean'),
('Valencia - Ibiza', 'Valencia', 39.4699, -0.3763, 'ES', 'Ibiza', 38.9067, 1.4206, 'ES', ARRAY['Trasmediterránea','Baleària'], 300, 200, 'mediterranean'),
('Dénia - Ibiza', 'Dénia', 38.8409, 0.1107, 'ES', 'Ibiza', 38.9067, 1.4206, 'ES', ARRAY['Baleària'], 150, 110, 'mediterranean'),
('Dénia - Palma de Mallorca', 'Dénia', 38.8409, 0.1107, 'ES', 'Palma de Mallorca', 39.5696, 2.6502, 'ES', ARRAY['Baleària'], 270, 200, 'mediterranean'),

-- ═══════════════════════════════════════════════════════════════
-- SICILIA / ITALIA SUR
-- ═══════════════════════════════════════════════════════════════
('Villa San Giovanni - Messina', 'Villa San Giovanni', 38.2195, 15.6356, 'IT', 'Messina', 38.1938, 15.5540, 'IT', ARRAY['Caronte & Tourist','Blu Ferries'], 25, 5, 'mediterranean'),
('Napoli - Palermo', 'Napoli', 40.8518, 14.2681, 'IT', 'Palermo', 38.1157, 13.3615, 'IT', ARRAY['Tirrenia','GNV'], 630, 310, 'mediterranean'),
('Genova - Palermo', 'Genova', 44.4056, 8.9463, 'IT', 'Palermo', 38.1157, 13.3615, 'IT', ARRAY['GNV'], 1200, 720, 'mediterranean'),

-- ═══════════════════════════════════════════════════════════════
-- GRECIA
-- ═══════════════════════════════════════════════════════════════
('Piraeus - Heraklion', 'Piraeus', 37.9475, 23.6371, 'GR', 'Heraklion', 35.3387, 25.1442, 'GR', ARRAY['Minoan Lines','ANEK Lines'], 540, 310, 'mediterranean'),
('Piraeus - Chania', 'Piraeus', 37.9475, 23.6371, 'GR', 'Chania (Souda)', 35.4738, 24.0176, 'GR', ARRAY['ANEK Lines','Blue Star Ferries'], 540, 290, 'mediterranean'),
('Piraeus - Mykonos', 'Piraeus', 37.9475, 23.6371, 'GR', 'Mykonos', 37.4415, 25.3214, 'GR', ARRAY['Blue Star Ferries','SeaJets'], 180, 150, 'mediterranean'),
('Piraeus - Santorini', 'Piraeus', 37.9475, 23.6371, 'GR', 'Santorini', 36.3932, 25.4615, 'GR', ARRAY['Blue Star Ferries','SeaJets'], 300, 230, 'mediterranean'),
('Bari - Patras', 'Bari', 41.1171, 16.8719, 'IT', 'Patras', 38.2466, 21.7346, 'GR', ARRAY['Superfast Ferries','ANEK Lines'], 960, 520, 'mediterranean'),
('Brindisi - Igoumenitsa', 'Brindisi', 40.6476, 17.9427, 'IT', 'Igoumenitsa', 39.4950, 20.2685, 'GR', ARRAY['Grimaldi Lines'], 480, 280, 'mediterranean'),
('Ancona - Patras', 'Ancona', 43.6158, 13.5184, 'IT', 'Patras', 38.2466, 21.7346, 'GR', ARRAY['Superfast Ferries','ANEK Lines','Minoan Lines'], 1260, 740, 'mediterranean'),

-- ═══════════════════════════════════════════════════════════════
-- NORTE DE EUROPA
-- ═══════════════════════════════════════════════════════════════
('Dover - Calais', 'Dover', 51.1279, 1.3134, 'GB', 'Calais', 50.9513, 1.8587, 'FR', ARRAY['P&O Ferries','DFDS'], 90, 50, 'northern_europe'),
('Portsmouth - Caen', 'Portsmouth', 50.7989, -1.0872, 'GB', 'Caen (Ouistreham)', 49.2838, -0.2479, 'FR', ARRAY['Brittany Ferries'], 360, 230, 'northern_europe'),
('Portsmouth - Saint-Malo', 'Portsmouth', 50.7989, -1.0872, 'GB', 'Saint-Malo', 48.6493, -2.0076, 'FR', ARRAY['Brittany Ferries'], 660, 340, 'northern_europe'),
('Plymouth - Roscoff', 'Plymouth', 50.3755, -4.1427, 'GB', 'Roscoff', 48.7264, -3.9826, 'FR', ARRAY['Brittany Ferries'], 360, 190, 'northern_europe'),
('Bilbao - Portsmouth', 'Bilbao', 43.3489, -3.0298, 'ES', 'Portsmouth', 50.7989, -1.0872, 'GB', ARRAY['Brittany Ferries'], 1440, 920, 'northern_europe'),
('Santander - Plymouth', 'Santander', 43.4623, -3.8100, 'ES', 'Plymouth', 50.3755, -4.1427, 'GB', ARRAY['Brittany Ferries'], 1200, 850, 'northern_europe'),
('Helsinki - Tallinn', 'Helsinki', 60.1699, 24.9384, 'FI', 'Tallinn', 59.4370, 24.7536, 'EE', ARRAY['Tallink','Viking Line','Eckerö Line'], 120, 80, 'northern_europe'),
('Stockholm - Helsinki', 'Stockholm', 59.3293, 18.0686, 'SE', 'Helsinki', 60.1699, 24.9384, 'FI', ARRAY['Viking Line','Tallink'], 1020, 480, 'northern_europe'),
('Stockholm - Turku', 'Stockholm', 59.3293, 18.0686, 'SE', 'Turku', 60.4518, 22.2666, 'FI', ARRAY['Viking Line','Tallink'], 660, 320, 'northern_europe'),

-- ═══════════════════════════════════════════════════════════════
-- CANARIAS / MARRUECOS
-- ═══════════════════════════════════════════════════════════════
('Algeciras - Tánger Med', 'Algeciras', 36.1275, -5.4433, 'ES', 'Tánger Med', 35.8839, -5.5021, 'MA', ARRAY['Trasmediterránea','FRS','Baleària'], 60, 30, 'mediterranean'),
('Tarifa - Tánger', 'Tarifa', 36.0143, -5.6013, 'ES', 'Tánger Ville', 35.7867, -5.8028, 'MA', ARRAY['FRS','Inter Shipping'], 60, 25, 'mediterranean'),
('Barcelona - Tánger Med', 'Barcelona', 41.3874, 2.1686, 'ES', 'Tánger Med', 35.8839, -5.5021, 'MA', ARRAY['GNV','Grimaldi Lines'], 1800, 1050, 'mediterranean'),
('Huelva - Las Palmas', 'Huelva', 37.2614, -6.9505, 'ES', 'Las Palmas', 28.1235, -15.4363, 'ES', ARRAY['Naviera Armas','Fred Olsen'], 1560, 1050, 'canarias'),
('Cádiz - Las Palmas', 'Cádiz', 36.5271, -6.2886, 'ES', 'Las Palmas', 28.1235, -15.4363, 'ES', ARRAY['Trasmediterránea','Naviera Armas'], 1680, 1100, 'canarias');
