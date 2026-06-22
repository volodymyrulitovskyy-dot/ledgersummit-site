-- Create users table for RBAC and profile data
create table if not exists med2.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text null,
  role text not null default 'user',
  allowed_screens text[] not null default '{home,checklist,calendar}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login timestamptz null
);

-- Helpful indexes
create index if not exists idx_users_email on med2.users(email);

-- Add index on exception owner for filtering
create index if not exists idx_exceptions_owner on med2.exceptions(owner_user_id);
