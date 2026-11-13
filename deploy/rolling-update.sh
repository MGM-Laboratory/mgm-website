#!/usr/bin/env bash
# Updates the copies of the website on a host one at a time, so the other copy of each service keeps answering while one restarts.
#
# usage  ./rolling-update.sh <version>        for example ./rolling-update.sh 1.1.0
#
# What it needs on the host. Docker with the compose plugin (v2), curl and bash 3.2 or newer, so it runs on Linux and on macOS. A
# compose file with one service for each copy, api-1, api-2, web-1 and web-2 in compose.production.example.yml, listening on the
# host ports of the env file. A reverse proxy that stops sending requests to a copy that is down, because that is what keeps the
# site up while a copy restarts. Run it in tmux or screen, so a dropped ssh connection does not stop it half way.
#
# What it does, in this order. It checks that the services exist, then pulls the images of the version, which also proves that the
# tag exists, and only then sets IMAGE_TAG in the env file. When the pull fails it changes nothing, and an interrupt before the
# first copy puts the env file back as it was. Then for each copy in order, the API copies first and the web copies after them, it
# recreates that one copy with no dependencies and polls its health route until the answer is status ok and the container runs the
# image of the version that was asked for, twice in a row. It goes on to the next copy only when the one before is healthy. When a
# copy does not become healthy it stops, says which copies are already new and which are still old, and prints the command that
# goes back. Nothing is rolled back by itself.
#
# The health route of the API is /api/health and the one of the web app is /healthz. Neither one tells its version, so the version
# is read from the image of the running container, which is the tag that compose started it with.
#
# Going back to an older version is allowed only when ROLLBACK_OK is set to that version, because a newer version may have applied
# a database migration that the older version cannot run on. Read the changelog first, because a newer version may have added migrations.
#
# Settings, all optional, given as environment variables
#   COMPOSE_DIR   the folder with the compose file and the env file, default the folder of this script
#   COPIES        the copies in update order, as service:port:path or service:port:path:host separated by spaces. The default is the
#                 four copies of the example, on the ports and the bind addresses of the env file, which are 4010, 4011, 3010 and
#                 3011 on 127.0.0.1 when unset. The host is the address to poll, and it is 127.0.0.1 when it is left out.
#   TIMEOUT       seconds to wait for one copy to become healthy, default 120
#   ROLLBACK_OK   the version that you confirm to go back to
#   DRY_RUN       1, true or yes prints the steps and changes nothing, but it still checks the services
set -euo pipefail

die() {
  echo "$*" >&2
  exit 1
}

version="${1:?usage rolling-update.sh <version>, for example 1.1.0}"
version="${version#v}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
script="$script_dir/$(basename "${BASH_SOURCE[0]}")"
compose_dir="${COMPOSE_DIR:-$script_dir}"
# the services of the compose file load .env too, so the file name is not a setting, or the two could name different files
env_file=".env"
timeout="${TIMEOUT:-120}"

case "${DRY_RUN:-0}" in
  1 | true | yes) dry_run=1 ;;
  0 | false | no | "") dry_run=0 ;;
  *) die "DRY_RUN must be 1, true, yes, 0, false or no, got ${DRY_RUN}" ;;
esac

for tool in docker curl; do
  command -v "$tool" >/dev/null || die "$tool is not installed"
done

[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "The version must look like 1.2.3, got $version"
[[ "$timeout" =~ ^[0-9]+$ ]] || die "TIMEOUT must be a number of seconds, got $timeout"

cd "$compose_dir"
[ -f "$env_file" ] || die "$env_file was not found in $compose_dir"

# env_value prints the last value of a setting in the env file, without quotes or a carriage return
env_value() {
  sed -n "s/^$1=//p" "$env_file" | tail -1 | tr -d "\r\"'"
}

# poll_host turns a bind address into an address that curl can reach on this host
poll_host() {
  case "$1" in
    "" | 0.0.0.0 | "::" | "[::]") echo 127.0.0.1 ;;
    *) echo "$1" ;;
  esac
}

# without COPIES the ports and the addresses of the copies are the ones of the env file, so a change there is followed here, and
# the script cannot poll another port than the one the copy listens on
if [ -n "${COPIES:-}" ]; then
  copies="$COPIES"
else
  api_host="$(poll_host "$(env_value API_BIND)")"
  web_host="$(poll_host "$(env_value WEB_BIND)")"
  api_1="$(env_value API_1_HOST_PORT)"
  api_2="$(env_value API_2_HOST_PORT)"
  web_1="$(env_value WEB_1_HOST_PORT)"
  web_2="$(env_value WEB_2_HOST_PORT)"
  copies="api-1:${api_1:-4010}:/api/health:${api_host} api-2:${api_2:-4011}:/api/health:${api_host}"
  copies="$copies web-1:${web_1:-3010}:/healthz:${web_host} web-2:${web_2:-3011}:/healthz:${web_host}"
fi

services=()
ports=()
paths=()
hosts=()
for copy in $copies; do
  [[ "$copy" =~ ^([A-Za-z0-9_.-]+):([0-9]+):(/[^:[:space:]]*)(:([A-Za-z0-9_.-]+))?$ ]] ||
    die "Every entry of COPIES must look like service:port:path or service:port:path:host, got $copy"
  service="${BASH_REMATCH[1]}"
  port="${BASH_REMATCH[2]}"
  host="${BASH_REMATCH[5]:-127.0.0.1}"
  [[ " ${services[*]:-} " != *" $service "* ]] || die "The service $service is listed twice in COPIES"
  [[ " ${ports[*]:-} " != *" $host:$port "* ]] || die "The address $host:$port is listed twice in COPIES"
  services+=("$service")
  ports+=("$host:$port")
  paths+=("${BASH_REMATCH[3]}")
  hosts+=("$host")
done
[ "${#services[@]}" -gt 0 ] || die "COPIES lists no service"

# only one update runs at a time, because two of them would fight over the env file and the same copy. A folder is the lock,
# because mkdir is atomic on every system, and the process id inside it shows a lock that a killed update left behind
lock=".rolling-update.lock"
if ! mkdir "$lock" 2>/dev/null; then
  holder="$(cat "$lock/pid" 2>/dev/null || true)"
  if [ -z "$holder" ]; then
    # the other update made the folder and has not written its process id yet
    sleep 2
    holder="$(cat "$lock/pid" 2>/dev/null || true)"
  fi
  if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then
    die "Another update is running on this host, process $holder"
  fi
  echo "Removing the lock of an update that is no longer running, process ${holder:-unknown}" >&2
  rm -f "$lock/pid"
  rmdir "$lock" 2>/dev/null || die "The lock $lock could not be removed, check that no update runs and remove it by hand"
  mkdir "$lock" 2>/dev/null || die "Another update took the lock a moment ago"
fi
echo "$$" >"$lock/pid"
release_lock() {
  rm -f "$lock/pid"
  rmdir "$lock" 2>/dev/null || true
}

# IMAGE_TAG is set for every compose command, because a value that is exported in the shell of the operator would otherwise win
# over the env file and the copies would start on another tag than the one that was pulled and checked. The host ports are
# cleared for the same reason, because the polling reads them from the env file and must see the ports that compose publishes
compose() {
  env -u API_1_HOST_PORT -u API_2_HOST_PORT -u WEB_1_HOST_PORT -u WEB_2_HOST_PORT -u API_BIND -u WEB_BIND \
    IMAGE_TAG="$version" docker compose --env-file "$env_file" "$@"
}

run() {
  if [ "$dry_run" = "1" ]; then
    echo "DRY RUN $*"
  else
    "$@"
  fi
}

# running_version prints the tag of the image of the container of a service, which is the version that compose started it with
running_version() {
  local id image
  id="$(compose ps -q "$1" 2>/dev/null | sed -n 1p)"
  [ -n "$id" ] || return 1
  image="$(docker inspect --format '{{.Config.Image}}' "$id" 2>/dev/null)" || return 1
  echo "${image##*:}"
}

# healthy succeeds only when the health route of one copy answers status ok and the container runs the version that was asked for
healthy() {
  local service="$1" address="$2" path="$3" body tag
  body="$(curl -sS --max-time 5 "http://${address}${path}" 2>/dev/null)" || return 1
  echo "$body" | tr -d '[:space:]'
  echo
  echo "$body" | tr -d '[:space:]' | grep -q '"status":"ok"' || return 1
  tag="$(running_version "$service")" || return 1
  [ "$tag" = "$version" ]
}

# older succeeds when the first version is older than the second one, both written as 1.2.3
older() {
  local IFS=.
  # shellcheck disable=SC2206
  local a=($1) b=($2)
  local i
  for i in 0 1 2; do
    if [ "${a[$i]}" -lt "${b[$i]}" ]; then return 0; fi
    if [ "${a[$i]}" -gt "${b[$i]}" ]; then return 1; fi
  done
  return 1
}

# the tag of the env file as it is now, and the whole file byte for byte. The x keeps the newlines at the end, and it is cut off again
previous="$(env_value IMAGE_TAG)"
env_original="$(
  cat "$env_file"
  printf x
)"
env_original="${env_original%x}"
changed=0
updated=()
# 1 from the moment the first copy is recreated, because from then on a copy may run the new version
copy_started=0

# restore_tag puts the env file back as it was, for a step that fails before any copy is touched. Without it the env file would name
# a version that no copy runs, and a later docker compose up -d would recreate every copy on it at once
restore_tag() {
  [ "$changed" = "1" ] || return 0

  if printf '%s' "$env_original" >"$env_file"; then
    changed=0
    return 0
  fi

  echo "IMAGE_TAG in $env_file could not be put back, set it to ${previous:-not set} by hand before anything runs docker compose up -d" >&2
  return 1
}

on_signal() {
  echo >&2
  if [ "$copy_started" = "0" ]; then
    restore_tag || true
  fi
  echo "Interrupted. IMAGE_TAG in $env_file is $([ "$changed" = "1" ] && echo "$version" || echo "${previous:-not set}"), copies updated so far ${updated[*]:-none}." >&2
  echo "Check the copies with docker compose ps and run the update again when they are fine." >&2
  release_lock
  exit 130
}
trap on_signal INT TERM HUP
trap release_lock EXIT

# the web copies take ADMIN_PASSPHRASE from the env file without a check of their own, and an empty value would start them with the
# admin sign in closed, so the script stops before it touches anything
[ -n "$(env_value ADMIN_PASSPHRASE)" ] || die "ADMIN_PASSPHRASE is not set in $env_file, nothing was changed"
# the API refuses to start without SESSION_SECRET, and the web copies would close the admin sign in, so the script checks it too
session_secret="$(env_value SESSION_SECRET)"
[ "${#session_secret}" -ge 32 ] || die "SESSION_SECRET in $env_file is not set or has fewer than 32 characters, nothing was changed"

echo "Checking that the services exist"
known="$(compose config --services)"
for service in "${services[@]}"; do
  grep -qxF -- "$service" <<<"$known" || die "The service $service is not in the compose file, nothing was changed. The services are $(echo "$known" | tr '\n' ' ')"
done

# going back needs a confirmation, because a newer version may have changed the database in a way that the older one cannot run on
if [[ "$previous" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] && [ "$previous" != "$version" ] && older "$version" "$previous"; then
  echo "WARNING $version is older than $previous, which runs now. A newer version may have applied a database migration that $version cannot run on." >&2
  rollback_ok="${ROLLBACK_OK:-}"
  [ "${rollback_ok#v}" = "$version" ] || die "Going back needs ROLLBACK_OK=$version, nothing was changed"
fi

# compose pulls the images that the services of the compose file really use, so a compose file that names another image than the
# one of the release is caught here, before anything is changed. IMAGE_TAG is the version for this command, so the env file is not
# touched yet
echo "Pulling the images of the version for ${services[*]}, which also proves that the tag exists"
if [ "$dry_run" = "1" ]; then
  echo "DRY RUN docker compose pull ${services[*]}"
else
  compose pull "${services[@]}" || die "The images of $version could not be pulled, so nothing was changed. The tag may not exist or Docker Hub refused the pull"
fi

echo "Setting IMAGE_TAG to $version in $env_file"
if [ "$dry_run" = "1" ]; then
  echo "DRY RUN set IMAGE_TAG=$version in $env_file"
else
  # set before the write, so an interrupt in the middle of it puts the file back from the copy in memory
  changed=1
  if grep -q '^IMAGE_TAG=' "$env_file"; then
    # the file is written in place, so a link or the mode of the file stays as it is, which sed -i does not do on every system
    new_env="$(
      awk -v v="$version" '/^IMAGE_TAG=/ { print "IMAGE_TAG=" v; next } { print }' "$env_file"
      printf x
    )"
    printf '%s' "${new_env%x}" >"$env_file"
  else
    printf '\nIMAGE_TAG=%s\n' "$version" >>"$env_file"
  fi
fi

# the command that goes back, with the folder when it is not the default
go_back() {
  if [ -z "$previous" ]; then
    echo "nothing, because no earlier version was set in $env_file. Stop the copies with docker compose stop instead"
    return
  fi
  local target="$previous" prefix=""
  [ -z "${COMPOSE_DIR:-}" ] || prefix="${prefix}COMPOSE_DIR=${COMPOSE_DIR} "
  echo "${prefix}ROLLBACK_OK=${target} ${script} ${target}"
}

# half_done tells the operator what runs where after a copy failed, and why a plain docker compose up -d is a mistake now
half_done() {
  local failed="$1" index="$2" rest=() j
  for ((j = index + 1; j < ${#services[@]}; j++)); do
    rest+=("${services[$j]}")
  done
  echo "$failed was recreated on $version and is not healthy." >&2
  # a database that does not answer makes every API copy unhealthy, so going back to the old version would not help
  if [[ "${answer:-}" == *'"status":"error"'* ]]; then
    echo "The last answer says the health check failed, which for the API means the database does not answer. The new version may not be at fault, so check the database before going back." >&2
  fi
  echo "Already healthy on $version ${updated[*]:-none}. Still on ${previous:-the old version} ${rest[*]:-none}." >&2
  echo "IMAGE_TAG in $env_file names $version now, so do not run docker compose up -d before the copies are checked, because it would recreate every copy on $version." >&2
  echo "Nothing was rolled back. To go back run $(go_back), and read the logs with docker compose logs $failed first." >&2
}

for i in "${!services[@]}"; do
  service="${services[$i]}"
  address="${ports[$i]}"
  path="${paths[$i]}"

  echo "Updating $service on $address"
  copy_started=1
  if ! run compose up -d --no-deps --force-recreate "$service"; then
    echo "$service could not be recreated. Check docker compose ps and the logs of $service." >&2
    half_done "$service" "$i"
    exit 1
  fi

  if [ "$dry_run" = "1" ]; then
    updated+=("$service")
    continue
  fi

  ok=0
  answer=""
  start="$SECONDS"
  while [ $((SECONDS - start)) -lt "$timeout" ]; do
    if answer="$(healthy "$service" "$address" "$path")"; then
      ok=$((ok + 1))
      echo "$service healthy ($ok of 2) $answer"
      if [ "$ok" -ge 2 ]; then
        break
      fi
    else
      ok=0
      echo "$service not healthy yet after $((SECONDS - start))s, the last answer was ${answer:-none}"
    fi
    sleep 2
  done

  if [ "$ok" -lt 2 ]; then
    echo "$service did not become healthy within ${timeout} seconds." >&2
    half_done "$service" "$i"
    exit 1
  fi
  updated+=("$service")
done

echo "Done. ${updated[*]} run $version."
