
-- Create enum for member operational status
CREATE TYPE public.member_status AS ENUM ('disponivel', 'em_deslocamento');

-- Add status column to org_members
ALTER TABLE public.org_members ADD COLUMN status public.member_status NOT NULL DEFAULT 'disponivel';
