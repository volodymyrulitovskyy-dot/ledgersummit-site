-- Create schemas for month-end-dashboard-2
-- Run this SQL in your Supabase SQL Editor once before running migrations
-- (If permissions prevent Prisma from creating schemas automatically)

-- Main schema for the application tables
CREATE SCHEMA IF NOT EXISTS med2;

-- Shadow database schema for Prisma migrations
CREATE SCHEMA IF NOT EXISTS med2_shadow;

-- Grant necessary permissions for Supabase roles
GRANT USAGE ON SCHEMA med2 TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA med2 TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA med2 TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA med2 TO anon, authenticated, service_role;

-- Grant permissions for shadow schema
GRANT USAGE ON SCHEMA med2_shadow TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA med2_shadow TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA med2_shadow TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA med2_shadow TO anon, authenticated, service_role;

-- Set default privileges for future objects in med2
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA med2
GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA med2
GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA med2
GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- Set default privileges for future objects in med2_shadow
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA med2_shadow
GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA med2_shadow
GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA med2_shadow
GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

