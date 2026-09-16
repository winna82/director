# Director

Grok directs multi-shot coverage. Imagine rolls the film.

Repo: https://github.com/winna82/director

The GitHub tree is landing in batches. For a complete Railway deploy **today**, unzip `director-railway.zip` over this repo (or clone, then copy the zip contents on top) and push.

## Railway

1. New service from this repo (Dockerfile)
2. Add Postgres → `DATABASE_URL`
3. Add a Bucket and connect it to the service
4. Set env:
   - `XAI_API_KEY` from https://console.x.ai (this is who pays for video)
   - `BETTER_AUTH_SECRET` random string
   - `BETTER_AUTH_URL` your public Railway URL
   - `PORT=8080` if Railway does not set it

Sign-in is per-user in this app. Video generation uses `XAI_API_KEY`, not the Grok chat account.
