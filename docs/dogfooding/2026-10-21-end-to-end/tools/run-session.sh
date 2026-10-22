#!/bin/sh
# 薄い client 用: <dir>/req.jsonl への追記を stdin として CLI session を起動し、応答を <dir>/resp.jsonl に書く。
# 使い方: sh tools/run-session.sh <dir> <model.shitae> [--replay <scenario.json>]
dir="$1"; shift
mkdir -p "$dir" && : > "$dir/req.jsonl" && : > "$dir/resp.jsonl" || exit 1
root="$(cd "$(dirname "$0")/../../../.." && pwd)"
transport="$(mktemp -d "${TMPDIR:-/tmp}/shitae-session.XXXXXX")" || exit 1
feeder=
cleanup() {
  if [ -n "$feeder" ]; then
    kill "$feeder" 2>/dev/null || :
    wait "$feeder" 2>/dev/null || :
  fi
  rm -rf "$transport"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
mkfifo "$transport/input" || exit 1
tail -n +1 -f "$dir/req.jsonl" > "$transport/input" &
feeder=$!
node "$root/packages/cli/dist/index.js" session "$@" < "$transport/input" > "$dir/resp.jsonl" 2> "$dir/stderr.txt"
status=$?
echo "session exit=$status" >> "$dir/stderr.txt"
exit "$status"
