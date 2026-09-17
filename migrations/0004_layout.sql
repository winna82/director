-- How a scene's clip uses the frame: 'single' (sequential full-frame shots),
-- 'split' (two panels) or 'grid' (2x2 panels). Existing scenes are single frame.
alter table director_scenes add column if not exists layout text not null default 'single';
