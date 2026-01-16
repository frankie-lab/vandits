-- Enable realtime for locations table to allow live updates during enrichment
ALTER PUBLICATION supabase_realtime ADD TABLE public.locations;