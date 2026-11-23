-- Palette builder database (Supabase). Run once in the SQL Editor on a new project.
-- Palettes are private: each signed-in user can only see and change their own.
create table if not exists palettes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default 'Untitled palette',
  notes text not null default '',
  colours jsonb not null default '[]',  -- [{ref, hex, cmyk, weight, recipe}]
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table palettes enable row level security;

create policy "Owner can read"   on palettes for select using (owner = auth.uid());
create policy "Owner can add"    on palettes for insert with check (owner = auth.uid());
create policy "Owner can edit"   on palettes for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "Owner can delete" on palettes for delete using (owner = auth.uid());

-- Newer Supabase projects don't grant table access to signed-in users by default.
grant select, insert, update, delete on table public.palettes to authenticated;

-- Paints you own (Michael Harding colour numbers), private to each user.
create table if not exists owned_paints (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  paint_no text not null,
  created_at timestamptz not null default now(),
  primary key (owner, paint_no)
);
alter table owned_paints enable row level security;
create policy "Owner can read owned"   on owned_paints for select using (owner = auth.uid());
create policy "Owner can add owned"    on owned_paints for insert with check (owner = auth.uid());
create policy "Owner can delete owned" on owned_paints for delete using (owner = auth.uid());
grant select, insert, delete on table public.owned_paints to authenticated;
