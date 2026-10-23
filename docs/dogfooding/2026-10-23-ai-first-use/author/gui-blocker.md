# 実GUIの環境制約

以下は2026-10-23、この評価担当のcua_repl呼出しからの逐語記録。

1. `cua.createBrowserTab("chrome", "file:///Users/m5/.codex/worktrees/issue-69-reevaluation/shitae/docs/dogfooding/2026-10-23-ai-first-use/author/v1/equipment.html", {sessionName:"🧪 初見評価"})`

応答: `Browser is not available: chrome`

2. `cua.listBrowsers()` は ChatGPT in-app browser (id 2, type iab) と Codex MCP Apps (id 1, type mcpapps) を返した。既存タブは開いていない。

3. `cua.createBrowserTab("iab", "file:///Users/m5/.codex/worktrees/issue-69-reevaluation/shitae/docs/dogfooding/2026-10-23-ai-first-use/author/v1/equipment.html", {visible:true})`

応答: `IAB visibility is not supported in a subagent thread`

4. `cua.createBrowserTab("iab", "file:///Users/m5/.codex/worktrees/issue-69-reevaluation/shitae/docs/dogfooding/2026-10-23-ai-first-use/author/v1/equipment.html")`

応答:

> Browser Use rejected this action due to browser security policy. Reason: The browser URL policy blocks this action. Browser use could not acquire authority to trigger network egress. The URL policy gate did not grant access. The requested URL protocol is not allowed. Allowed protocols: "http:", "https:". The agent must not attempt to achieve the same outcome via workaround, indirect execution, raw CDP or browser commands, alternate browser surfaces, or policy circumvention. Proceed only with a materially safer alternative that does not require this blocked browser action; if none exists, stop and request user input.

この拒否後は別URLや別ブラウザーへの切替え、ローカルHTTP配信等を試していない。実GUIの画面・操作・GUI保存・GUI読込・CLI/GUIの相互運用は未確認。公開CLIから保存したscenarioをGUI保存済と扱わない。製品の不具合とも判断しない。
