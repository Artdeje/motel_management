-- Run this once in Supabase SQL Editor before server/db/schema.sql.
-- It preserves the existing schema while mapping its MySQL DATETIME type
-- to PostgreSQL timestamptz.
DO $$
BEGIN
  CREATE DOMAIN datetime AS timestamptz;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
