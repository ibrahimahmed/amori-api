-- Consolidate notes columns: rename person_notes to notes
-- The old 'notes' (string) column data was already migrated to 'person_notes' (array)

-- Step 1: Drop the old notes column (data already migrated in 002)
ALTER TABLE people DROP COLUMN IF EXISTS notes;

-- Step 2: Rename person_notes to notes
ALTER TABLE people RENAME COLUMN person_notes TO notes;

-- Step 3: Update the index name
DROP INDEX IF EXISTS idx_people_person_notes;
CREATE INDEX IF NOT EXISTS idx_people_notes ON people USING GIN(notes);

