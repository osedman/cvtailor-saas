-- Profiles table (linked to auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  tailors_used integer not null default 0,
  plan text not null default 'free',  -- 'free' | 'pro'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper RPC to safely increment usage counter
create or replace function public.increment_tailors_used(user_id uuid)
returns void
language sql
security definer
as $$
  update public.profiles
  set tailors_used = tailors_used + 1,
      updated_at = now()
  where id = user_id;
$$;

-- Row level security
alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);
