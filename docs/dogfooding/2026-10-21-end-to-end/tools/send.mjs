// 薄い JSON Lines client: 1 要求を req.jsonl に追記し、同じ id の応答行を resp.jsonl から待って表示する。
// 使い方: node send.mjs <dir> '<json>' [jqlikePath]
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [dir, json, path] = process.argv.slice(2);
const req = JSON.parse(json);
const respFile = join(dir, "resp.jsonl");
const before = readFileSync(respFile, "utf8").split("\n").filter(Boolean).length;
appendFileSync(join(dir, "req.jsonl"), JSON.stringify(req) + "\n");
const deadline = Date.now() + 10000;
while (Date.now() < deadline) {
  const lines = readFileSync(respFile, "utf8").split("\n").filter(Boolean).slice(before);
  const hit = lines.map((l) => JSON.parse(l)).find((r) => r.id === req.id);
  if (hit) {
    let out = hit;
    for (const k of (path ?? "").split(".").filter(Boolean)) out = out?.[k];
    console.log(JSON.stringify(out, null, 1));
    process.exit(hit.ok ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 100));
}
console.error("timeout waiting for", req.id);
process.exit(2);
