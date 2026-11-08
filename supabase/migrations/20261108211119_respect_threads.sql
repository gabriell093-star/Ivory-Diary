create table public.respect_threads (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  character_name text not null default '',
  universe text not null default '',
  sections jsonb not null default '{
    "introduction":{"description":"","images":[]},
    "terminology":{"description":"","link":"","images":[]},
    "cosmology":{"description":"","link":"","images":[]},
    "personality":{"description":"","link":"","images":[]},
    "statistic":{"description":"","link":"","images":[]},
    "hax_ability":{"description":"","link":"","images":[]},
    "resistance":{"description":"","link":"","images":[]}
  }'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint respect_threads_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint respect_threads_title_length check (char_length(btrim(title)) between 1 and 180),
  constraint respect_threads_character_name_length check (char_length(character_name) <= 160),
  constraint respect_threads_universe_length check (char_length(universe) <= 160),
  constraint respect_threads_sections_object check (
    jsonb_typeof(sections) = 'object'
    and sections ?& array['introduction','terminology','cosmology','personality','statistic','hax_ability','resistance']
  )
);

create index if not exists respect_threads_public_updated_idx
  on public.respect_threads (is_published, updated_at desc);

alter table public.respect_threads enable row level security;

drop policy if exists "Public can read published Respect Threads" on public.respect_threads;
create policy "Public can read published Respect Threads"
  on public.respect_threads
  for select
  to anon, authenticated
  using (is_published = true);

revoke all on table public.respect_threads from anon, authenticated;
grant select on table public.respect_threads to anon, authenticated;
grant all on table public.respect_threads to service_role;
