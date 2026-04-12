
-- Create enum for document status
CREATE TYPE public.document_status AS ENUM ('draft', 'in_review', 'published', 'archived');

-- Add status column to documents
ALTER TABLE public.documents 
ADD COLUMN status public.document_status NOT NULL DEFAULT 'draft';
