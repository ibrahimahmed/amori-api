-- Add person_notes array column to people table
-- This allows storing multiple notes per person

-- Add the new person_notes column as TEXT array
ALTER TABLE people ADD COLUMN IF NOT EXISTS person_notes TEXT[] DEFAULT '{}';

-- Migrate existing notes to person_notes array (if notes is not null)
UPDATE people 
SET person_notes = ARRAY[notes]
WHERE notes IS NOT NULL AND notes != '' AND (person_notes IS NULL OR person_notes = '{}');

-- Create index for better query performance on person_notes
CREATE INDEX IF NOT EXISTS idx_people_person_notes ON people USING GIN(person_notes);
