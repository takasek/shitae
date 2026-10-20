#!/bin/sh
# 薄い client 用: <dir>/req.jsonl への追記を stdin として CLI session を起動し、応答を <dir>/resp.jsonl に書く。
# 使い方: sh tools/run-session.sh <dir> <model.shitae> [--replay <scenario.json>]
dir="$1"; shift
mkdir -p "$dir" && : > "$dir/req.jsonl" && : > "$dir/resp.jsonl"
root="$(cd "$(dirname "$0")/../../../.." && pwd)"
tail -n +1 -f "$dir/req.jsonl" | node "$root/packages/cli/dist/index.js" session "$@" > "$dir/resp.jsonl" 2> "$dir/stderr.txt"
echo "session exit=$?" >> "$dir/stderr.txt"
