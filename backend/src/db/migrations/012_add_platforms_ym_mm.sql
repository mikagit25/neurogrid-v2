-- 012: add Yandex Market (ym) and Megamarket/SberMegaMarket (mm) platforms

-- Drop the old constraint and recreate with new platforms
ALTER TABLE marketplace_connections
  DROP CONSTRAINT marketplace_connections_platform_check;

ALTER TABLE marketplace_connections
  ADD CONSTRAINT marketplace_connections_platform_check
  CHECK (platform = ANY(ARRAY['wb','ozon','ym','mm','amazon','etsy']));

-- Drop old unique constraint (one connection per platform per user)
-- and re-add — logic stays the same, just allows new values
-- (constraint itself doesn't reference platform values, no change needed for it)
