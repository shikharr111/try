-- Contact / feedback messages from the website's floating "Contact" button.
-- Anyone (signed in or not) may INSERT; nobody can read them through the API. The site owner reads them in the
-- Supabase dashboard (Table Editor -> contact_messages).
create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  email      text not null check (char_length(email) between 3 and 200 and email like '%@%'),
  message    text not null check (char_length(btrim(message)) between 5 and 2000),
  utm        jsonb check (utm is null or pg_column_size(utm) <= 2000)
);
alter table public.contact_messages enable row level security;
create policy contact_insert on public.contact_messages for insert to anon, authenticated with check (true);
revoke all on public.contact_messages from anon, authenticated;
grant insert on public.contact_messages to anon, authenticated;
