import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFile, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("./run-session.sh", import.meta.url));

for (const code of [0, 23]) {
  test(`session exit ${code} stops the feeder and records the status`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "shitae-run-session-test-"));
    let child;
    let timer;
    try {
      // Record the real feeder PID without inspecting unrelated processes.
      const tail = join(dir, "tail");
      await writeFile(tail, '#!/bin/sh\necho $$ > "$SESSION_TEST_DIR/feeder.pid"\nexec /usr/bin/tail "$@"\n');
      await chmod(tail, 0o755);
      const stub = join(dir, "node");
      await writeFile(stub, `#!/bin/sh\nhead -n 1\necho diagnostic >&2\nexit ${code}\n`);
      await chmod(stub, 0o755);
      child = spawn("sh", [helper, dir, "unused.shitae"], {
        detached: true,
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, SESSION_TEST_DIR: dir },
        stdio: "ignore",
      });
      const exited = new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (status, signal) => resolve({ status, signal }));
      });
      const deadline = Date.now() + 3000;
      while (true) {
        try {
          await readFile(join(dir, "feeder.pid"));
          break;
        } catch (error) {
          if (error.code !== "ENOENT" || Date.now() >= deadline) throw error;
          await delay(20);
        }
      }
      await appendFile(join(dir, "req.jsonl"), '{"id":"probe"}\n');
      const result = await Promise.race([
        exited,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("helper hung after session exited")), 4000);
        }),
      ]);
      assert.deepEqual(result, { status: code, signal: null });
      assert.equal(await readFile(join(dir, "resp.jsonl"), "utf8"), '{"id":"probe"}\n');
      assert.equal(await readFile(join(dir, "stderr.txt"), "utf8"), `diagnostic\nsession exit=${code}\n`);
      const feeder = Number((await readFile(join(dir, "feeder.pid"), "utf8")).trim());
      assert.ok(feeder > 0, "feeder PID was captured");
      assert.throws(() => process.kill(feeder, 0), { code: "ESRCH" });
    } finally {
      clearTimeout(timer);
      if (child?.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      }
      await rm(dir, { recursive: true, force: true });
    }
  });
}
