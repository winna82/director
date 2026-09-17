-- Library: named reels, soft deletes, and take posters.
--
-- Deletes purge media from storage immediately but keep the rows, stamped with
-- deleted_at, so history stays auditable. Every read filters deleted rows.

create table if not exists director_reels (
  id text primary key,
  user_id text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists director_reels_user_idx on director_reels (user_id, updated_at desc);

alter table director_scenes add column if not exists deleted_at timestamptz;
alter table director_takes add column if not exists deleted_at timestamptz;
-- Small JPEG thumbnail, generated on first request by /api/poster/$id.
alter table director_takes add column if not exists poster bytea;

-- Existing reels were implicit (scenes sharing reel_id). Name each after its
-- first scene's storyboard title.
insert into director_reels (id, user_id, title, created_at, updated_at)
select
  s.reel_id,
  s.user_id,
  coalesce(
    (
      select first.board_json::json ->> 'title'
      from director_scenes first
      where first.reel_id = s.reel_id and first.user_id = s.user_id
      order by first.scene_index, first.created_at
      limit 1
    ),
    ''
  ),
  min(s.created_at),
  max(s.updated_at)
from director_scenes s
group by s.reel_id, s.user_id
on conflict (id) do nothing;
