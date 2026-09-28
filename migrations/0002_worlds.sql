-- Several worlds per account: each save row can carry a small JSON summary
-- (name, day, mode) so the world list needs no full download.
ALTER TABLE saves ADD COLUMN info TEXT;
