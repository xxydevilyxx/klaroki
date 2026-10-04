create extension if not exists pgcrypto;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  visitor_id text,
  session_id text,
  occurred_at timestamptz not null default now(),
  duration_ms integer,
  path text,
  page_title text,
  referrer text,
  device_type text,
  browser text,
  os text,
  screen_width integer,
  screen_height integer,
  language text,
  timezone text,
  country text,
  region text,
  ai_duration_ms integer,
  ai_success boolean,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists analytics_events_occurred_at_idx on public.analytics_events (occurred_at desc);
create index if not exists analytics_events_event_name_idx on public.analytics_events (event_name);
create index if not exists analytics_events_visitor_id_idx on public.analytics_events (visitor_id);
create index if not exists analytics_events_session_id_idx on public.analytics_events (session_id);

alter table public.analytics_events enable row level security;

create or replace function public.get_klaro_analytics(p_days integer default 30)
returns jsonb
language sql
stable
as $$
with bounds as (
  select now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))) as since
),
base as (
  select * from public.analytics_events, bounds where occurred_at >= bounds.since
),
sessions as (
  select
    count(distinct session_id) filter (where session_id is not null) as sessions,
    count(distinct visitor_id) filter (where visitor_id is not null) as visitors,
    count(*) filter (where event_name = 'page_view') as page_views,
    count(*) filter (where event_name = 'ai_interaction') as ai_interactions,
    count(*) filter (where event_name = 'ai_result' and ai_success is true) as ai_successes,
    count(*) filter (where event_name = 'ai_result' and ai_success is false) as ai_errors,
    round(coalesce(avg(duration_ms) filter (where event_name = 'session_end'), 0) / 1000.0, 1) as avg_session_seconds,
    round(coalesce(sum(duration_ms) filter (where event_name = 'session_end'), 0) / 60000.0, 1) as total_session_minutes,
    round(coalesce(avg(ai_duration_ms) filter (where event_name = 'ai_result' and ai_duration_ms is not null), 0) / 1000.0, 1) as avg_ai_seconds
  from base
),
devices as (
  select coalesce(jsonb_agg(jsonb_build_object('name', device_type, 'count', cnt) order by cnt desc), '[]'::jsonb) value
  from (select coalesce(device_type, 'Unbekannt') device_type, count(*) cnt from base where event_name = 'session_start' group by 1) x
),
browsers as (
  select coalesce(jsonb_agg(jsonb_build_object('name', browser, 'count', cnt) order by cnt desc), '[]'::jsonb) value
  from (select coalesce(browser, 'Unbekannt') browser, count(*) cnt from base where event_name = 'session_start' group by 1) x
),
operating_systems as (
  select coalesce(jsonb_agg(jsonb_build_object('name', os, 'count', cnt) order by cnt desc), '[]'::jsonb) value
  from (select coalesce(os, 'Unbekannt') os, count(*) cnt from base where event_name = 'session_start' group by 1) x
),
countries as (
  select coalesce(jsonb_agg(jsonb_build_object('name', country, 'count', cnt) order by cnt desc), '[]'::jsonb) value
  from (select coalesce(country, 'Unbekannt') country, count(*) cnt from base where event_name = 'session_start' group by 1) x
),
screens as (
  select coalesce(jsonb_agg(jsonb_build_object('name', screen, 'count', cnt) order by cnt desc), '[]'::jsonb) value
  from (select coalesce(case when screen_width is not null and screen_height is not null then screen_width::text || ' × ' || screen_height::text else null end, 'Unbekannt') screen, count(*) cnt from base where event_name = 'session_start' group by 1) x
),
languages as (
  select coalesce(jsonb_agg(jsonb_build_object('name', language, 'count', cnt) order by cnt desc), '[]'::jsonb) value
  from (select coalesce(language, 'Unbekannt') language, count(*) cnt from base where event_name = 'session_start' group by 1) x
),
referrers as (
  select coalesce(jsonb_agg(jsonb_build_object('name', referrer, 'count', cnt) order by cnt desc), '[]'::jsonb) value
  from (select coalesce(nullif(referrer, ''), 'Direkt / unbekannt') referrer, count(*) cnt from base where event_name = 'session_start' group by 1) x
),
pages as (
  select coalesce(jsonb_agg(jsonb_build_object('name', path, 'count', cnt) order by cnt desc), '[]'::jsonb) value
  from (select coalesce(path, '/') path, count(*) cnt from base where event_name = 'page_view' group by 1) x
),
interaction_types as (
  select coalesce(jsonb_agg(jsonb_build_object('name', metadata->>'type', 'count', cnt) order by cnt desc), '[]'::jsonb) value
  from (select coalesce(nullif(metadata->>'type',''), 'Sonstige') type, count(*) cnt from base where event_name = 'ui_interaction' group by 1) x
),
daily as (
  select coalesce(jsonb_agg(jsonb_build_object('date', day, 'visitors', visitors, 'ai_interactions', ai_interactions, 'page_views', page_views) order by day), '[]'::jsonb) value
  from (
    select occurred_at::date day,
      count(distinct visitor_id) filter (where event_name='session_start') visitors,
      count(*) filter (where event_name='ai_interaction') ai_interactions,
      count(*) filter (where event_name='page_view') page_views
    from base group by 1
  ) x
)
select jsonb_build_object(
  'period_days', greatest(1, least(coalesce(p_days, 30), 365)),
  'generated_at', now(),
  'summary', (select to_jsonb(sessions) from sessions),
  'devices', (select value from devices),
  'browsers', (select value from browsers),
  'operating_systems', (select value from operating_systems),
  'countries', (select value from countries),
  'screens', (select value from screens),
  'languages', (select value from languages),
  'referrers', (select value from referrers),
  'pages', (select value from pages),
  'interaction_types', (select value from interaction_types),
  'daily', (select value from daily)
);
$$;
