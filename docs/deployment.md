# Deployment

The site runs from two Docker images on one host. `labmgm/mgm-website-backend` is the API and `labmgm/mgm-website-frontend` is the web app. CI builds, scans, signs and publishes them, as [`ci-cd.md`](ci-cd.md) explains. This page covers how to run them on a host and how to update them without downtime.

The folder `deploy/` holds three files.

- `compose.production.example.yml` runs two copies of the API and two copies of the web app, named `api-1`, `api-2`, `web-1` and `web-2`.
- `rolling-update.sh` updates the copies one at a time.
- `.env.example` lists the settings of the compose file and of the API.

## How the copies are laid out

- Every copy has a fixed name and its own host port. The ports listen on the loopback address by default, so only a reverse proxy on the same host reaches them. Set `API_BIND` and `WEB_BIND` to another address of the host when the proxy runs somewhere else.
- The web copies reach the API by the name `api`, which both API copies carry on the internal network. Docker leaves a copy out of that name once it has stopped, so a web copy can still reach the other API copy while one restarts. A request that arrives while an API copy is stopping can fail once, because the web app does not retry.
- The database is a separate container that other apps may share. Its Docker network has to exist already, and compose never creates or removes it. The name is `DB_NETWORK`, which is `postgres_postgres` by default.
- Every copy runs with a read only file system, no Linux capabilities, `no-new-privileges`, and limits for memory and CPU. The writable paths are tmpfs mounts. The web app also needs a writable folder for the cache of the image optimizer, `/app/apps/web/.next/cache`.
- Docker keeps at most `LOG_MAX_FILES` log files of `LOG_MAX_SIZE` for each copy, so the logs cannot fill the disk.
- The rate limit of the API counts in the memory of each copy, so the real limit is `THROTTLE_LIMIT` for each copy and not for the pair.
- The API holds an upload in memory while it stores the file, up to the upload limits in `.env`. Raise `API_MEMORY_LIMIT` when you raise a limit.
- The default address of the script and of the compose file is IPv4. A bind address in IPv6, such as `::1`, needs `COPIES` set by hand.

## First setup of a host

1. Create the database and its user in Postgres, with a password from `openssl rand -hex 64`. Send the statements on stdin to `psql`, so the password never appears in a command line.

   ```sql
   create database mgm_website_production;
   create user mgm_website_production_user with password '<password>';
   alter database mgm_website_production owner to mgm_website_production_user;
   ```

2. Make a folder for the site on the host. Copy `compose.production.example.yml` into it as `compose.yml`, copy `rolling-update.sh` into it, and copy `.env.example` into it as `.env`.
3. Fill in `.env`. Every setting has a comment. The settings of the apps are in [`configuration.md`](configuration.md). `ADMIN_PASSPHRASE`, `SESSION_SECRET` and the password in `DATABASE_URL` are secrets, so they stay only in this file.
4. Start the first version with the script, for example `./rolling-update.sh 1.1.0`. It pulls the images, writes `IMAGE_TAG` into `.env` and starts the four copies one at a time. On macOS a non interactive SSH session has no `docker` in its path, so start it from a login shell, for example with `zsh -lc`.
5. Point the reverse proxy at the copies. The API needs the two ports of `API_1_HOST_PORT` and `API_2_HOST_PORT` as upstreams, and the web app needs `WEB_1_HOST_PORT` and `WEB_2_HOST_PORT`. The proxy has to send the next request to the other copy when one copy is down, because that is what keeps the site up during an update.

   ```nginx
   upstream website_web {
     server 127.0.0.1:3010 max_fails=1 fail_timeout=5s;
     server 127.0.0.1:3011 max_fails=1 fail_timeout=5s;
   }

   location / {
     proxy_pass http://website_web;
     proxy_next_upstream error timeout http_502 http_503;
     proxy_set_header Host $host;
     proxy_set_header X-Forwarded-For $remote_addr;
   }
   ```

   The proxy has to overwrite `X-Forwarded-For` with the address of the client, as the example does, because the apps read that header to find the visitor. The web copies must therefore be reachable only through the proxy. A caller that reaches a copy directly can send any `X-Forwarded-For`, so keep `WEB_BIND` on the loopback address, or firewall the web ports to the proxy.

6. Make the API reachable from the browser. The contact form, the calendar download and the status light of the site call the API from the browser, at the address that was built into the web image as `NEXT_PUBLIC_API_URL`. CI takes that address from the repository variable `NEXT_PUBLIC_API_URL`, and it is `http://localhost:4000/api` when the variable is not set, which does not work for a visitor. Set the variable before the release builds the images, route that public address to the API copies in the proxy, and set `CORS_ORIGIN` to the public origin of the site.

   ```nginx
   upstream website_api {
     server 127.0.0.1:4010 max_fails=1 fail_timeout=5s;
     server 127.0.0.1:4011 max_fails=1 fail_timeout=5s;
   }

   server {
     server_name api.example.org;
     location / {
       proxy_pass http://website_api;
       proxy_next_upstream error timeout http_502 http_503;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $remote_addr;
     }
   }
   ```

   The API trusts no proxy until `TRUST_PROXY` names it, so the contact form, which calls the API from the browser, would share one rate limit bucket for all visitors, because the API would see the address of the proxy. With one proxy in front, set `TRUST_PROXY=1` in the `.env` file. Use the hop count and not `loopback`, because Docker passes a connection to a published port from the address of the bridge network, so the API never sees a loopback peer. Keep the count equal to the real number of proxies, and let the proxy overwrite `X-Forwarded-For` as the example does, because a count that is too high lets a caller choose its own address when the proxy only appends to the header. When a CDN such as Cloudflare sits in front of this proxy, `$remote_addr` is the address of the CDN, so the buckets are per edge address unless the proxy restores the visitor address first, for example with the real IP module of nginx.

The API creates its tables when it starts, so there is no migration step. Read the changelog before an update anyway, because a new version may add tables or columns.

## Updating to a new version

Run the update in `tmux` or `screen`, so a dropped connection does not stop it half way.

1. Read the changelog of the release, and the settings that are new or changed.
2. Run the script as a dry run. It checks that the services exist and prints each step, and it changes nothing.

   ```bash
   DRY_RUN=1 ./rolling-update.sh 1.2.0
   ```

3. Run it for real.

   ```bash
   ./rolling-update.sh 1.2.0
   ```

For each copy, in the order `api-1`, `api-2`, `web-1`, `web-2`, the script recreates that copy and polls its health route until the answer is `status` `ok` and the container runs the image of the new version, twice in a row. It starts the next copy only after that. The health route of the API is `/api/health` and the one of the web app is `/healthz`.

The script pulls the images before it changes anything. When the pull fails, for example because the tag does not exist, nothing was changed. An interrupt before the first copy puts `.env` back as it was.

### When a copy does not become healthy

The script stops at once. It says which copies already run the new version and which still run the old one, and it prints the command that goes back. It never rolls back by itself, and it never touches the database. Do not run `docker compose up -d` at that point, because `IMAGE_TAG` already names the new version and compose would recreate every copy on it. Read the logs of the failed copy with `docker compose logs <service>` first. When the API answers `status` `error`, the database may be the problem and the new version may not be at fault.

### Going back to an older version

The script refuses to install an older version than the one that runs, unless `ROLLBACK_OK` names that version. This is on purpose. A newer version may have changed the database in a way that an older version cannot run on.

```bash
ROLLBACK_OK=1.1.0 ./rolling-update.sh 1.1.0
```

## Settings of the script

The script reads these environment variables. All of them are optional.

| Variable      | Default                        | Purpose                                                                         |
| ------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| `COMPOSE_DIR` | the folder of the script       | The folder with `compose.yml` and `.env`.                                       |
| `COPIES`      | the four copies of the example | The copies in update order, as `service:port:path` or `service:port:path:host`. |
| `TIMEOUT`     | `120`                          | Seconds to wait for one copy to become healthy.                                 |
| `ROLLBACK_OK` | unset                          | The older version that you confirm to go back to.                               |
| `DRY_RUN`     | `0`                            | `1`, `true` or `yes` prints the steps and changes nothing.                      |

Only one update runs at a time. The script keeps a lock folder named `.rolling-update.lock` next to `.env`, and it removes the lock of an update that was killed.

## Checking an image

Every image is signed with Sigstore. [`ci-cd.md`](ci-cd.md) has the `cosign verify` command. Run it for the tag before the first start on a new host, and whenever an image comes from somewhere else than the Docker Hub copy of this repository.

## Old image versions

After an update, once every copy is healthy and the site works, remove the images of the earlier versions by name with `docker rmi <repository>:<tag>`. Do not use `docker image prune` on a host that runs other apps, because it removes their unused images too.
