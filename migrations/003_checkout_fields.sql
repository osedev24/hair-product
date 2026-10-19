ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
