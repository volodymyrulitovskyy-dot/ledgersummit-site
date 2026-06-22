ALTER TABLE med2.users
ADD COLUMN IF NOT EXISTS user_name TEXT;

UPDATE med2.users
SET user_name = INITCAP(REPLACE(REPLACE(REPLACE(SPLIT_PART(email, '@', 1), '.', ' '), '_', ' '), '-', ' '))
WHERE COALESCE(BTRIM(user_name), '') = ''
  AND COALESCE(BTRIM(email), '') <> '';
