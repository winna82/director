create table if not exists director_scenes (
  id text primary key,
  user_id text not null,
  reel_id text not null,
  scene_index integer not null default 1,
  parent_id text,
  brief text not null default '',
  mode text not null default 'automatic',
  aspect_ratio text not null default '16:9',
  duration integer not null default 10,
  board_json text,
  continuity_json text,
  sequence_json text,
  shot_jobs_json text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists director_scenes_user_idx on director_scenes (user_id, updated_at desc);

create table if not exists director_takes (
  id text primary key,
  user_id text not null,
  scene_id text not null,
  kind text not null,
  shot_id text,
  request_id text,
  access_key text not null,
  storage text not null,
  object_key text,
  content_type text not null default 'video/mp4',
  byte_size integer,
  created_at timestamptz not null default now()
);
create index if not exists director_takes_scene_idx on director_takes (user_id, scene_id);

create table if not exists director_take_blobs (
  take_id text primary key,
  user_id text not null,
  body bytea not null
);
