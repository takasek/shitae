// actions 応答（data.actions.items）を 1 行 1 操作で表示する。
const a = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
for (const x of a) console.log(x.handle, "|", x.actionText, "|", x.enabled ? "enabled" : "disabled", "|", x.host?.component, "|", JSON.stringify(x.branches));
