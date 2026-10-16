# 2026-10-16 shitae end-to-end ドッグフーディング

作成、設計探索、保存、独立担当への引継ぎ、モデル変更後の再検討を実施した。限定した仕事は完遂できた。次は新しい言語機能を追加せず、目的と探索経路の短い引継ぎメモを添えて実利用を続ける。詳しくは [report.md](report.md)。

## 固定版・環境

- repository: takasek/shitae、HEAD `bbd99d4a772e9a74532840c6656477699abfb054`。2026-10-16 JST に origin/main を取得した。
- primary は `a3ebaed` / main、未追跡の `.agents/` と `.worktrees/` があり保持した。専用 detached worktree `/private/tmp/shitae-e2e-20261016-01a1424a` を取得済み origin/main から作成した。
- macOS 27.0.1 (26A434)、Darwin arm64、Node v26.5.0、pnpm 10.33.2。
- 実ブラウザ: Codex In-app Browser、UA Chrome/155.0.0.0（macOS UAのIntel表記はUAの値で、実機architectureではない）。通常の自動操作タブ、loopback HTTP、1280×720の証拠画像。ブラウザ配布の完全なpatch versionは取得していない。
- engineVersion: `8679f277b326f64507795d692a3db785158368fa94379ed58fe3127f18ffb8db`。
- modelId は [metadata.json](evidence/metadata.json)、生成HTML側は [html-identities.json](evidence/html-identities.json)。全体環境は [environment.json](evidence/environment.json)。
- 評価者: 親 Codex agent（過去文脈あり）、初見作成担当 `fresh_author`、独立引継ぎ担当 `handoff_recipient`。後二者は `fork_turns=none`。親のブラウザ実行結果と初見作成担当の直接観察を混同しない。

`pnpm install --frozen-lockfile` と `pnpm -r build` をこの checkout で実施した。以後 source/lockfile/対象版を更新していない。回帰検証のpretestは同じsourceを再buildするが、CLI再開・生成HTMLのengineVersionは変わっていない。古いdistは使っていない。[install](evidence/install.log) / [build](evidence/build.log) / [tests](evidence/tests.log)。

## 実施範囲と入口

| 作業 | 成果物・証拠 |
| --- | --- |
| README/AI_GUIDEから検索・資料予約を作成 | [初見担当記録](evidence/fresh-author.md)、[v1モデル](models/fresh-library-v1.shitae)、[v1 HTML](models/fresh-library-v1.html)、[v2モデル](models/fresh-library-v2.shitae)、[v2 HTML](models/fresh-library-v2.html) |
| 保存モデル7本のcheck・生成、Astra/Sol proposedの実ブラウザ探索 | [検査一覧](evidence/model-checks.json)、[操作前の予想](evidence/expectations.md)、[原本hash](evidence/original-hashes.json) |
| CLI→終了→別process、GUI→CLI、CLI→新GUI、ghostから分岐 | [scenarios/](scenarios/)、[Astra CLI](evidence/astra-cli.jsonl)、[再開](evidence/astra-replay.jsonl)、[GUI→CLI](evidence/sol-gui-to-cli.jsonl) |
| 独立担当の閲覧・再開・再生成 | [共有brief](evidence/handoff-brief.md)、[引継ぎ結果](evidence/handoff-recipient.md) |
| 取消後Sourceへ戻す一件の要件変更 | [意図](evidence/design-change.md)、[派生モデル](models/sol-source-cancel/proposed.shitae)、[変更前コピー](models/sol-original/proposed.shitae)、[変更後HTML](evidence/sol-source-cancel.html) |
| 次の優先度 | [candidates.md](candidates.md) |

## 再実行

以下はこの固定checkoutのrootで実行する。HTMLを既存の証拠名へ再生成しないこと。scenarioは応答の `scenario` 部分だけをUTF-8 JSONとして保存済み。

```sh
node packages/cli/dist/index.js check docs/dogfooding/2026-10-16-end-to-end/models/fresh-library-v2.shitae
node packages/cli/dist/index.js session docs/dogfooding/2026-10-16-end-to-end/models/sol-original/proposed.shitae --replay docs/dogfooding/2026-10-16-end-to-end/scenarios/sol-cli-diverged.scenario.json
```

同じprocessへ最初に `{"id":"actions","command":"query","select":["actions"]}` を送り、実応答のhandleを選ぶ。受理操作後は取り直す。公開手順は [session-usage](../../design/session-usage.md)。補助clientは [thin-client.mjs](evidence/thin-client.mjs) のJSONL送受信・記録と新規ファイル保存のみ。操作の選択と必要時の照会は評価者が行った。全状態や全履歴を毎操作取るharnessは使っていない。別担当はこのclientを読まず、自身の [薄いclient](evidence/handoff-client.py) を使った。

保存済みHTMLの閲覧には、必要ならこの保存先だけを一時的にHTTP公開する。

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs/dogfooding/2026-10-16-end-to-end
```

`http://127.0.0.1:8766/evidence/sol-proposed.html` または `models/fresh-library-v2.html` を開き、終了時にサーバーを停止する。今回のサーバーは評価終了時に停止した。file URLは未確認。

閲覧・再開にはHTML、対応scenario、処理系版を渡す。編集・再生成にはモデル本文と全参照module、simconfigがあればそれも必要。今回の共有モデルはimportなし一枚、simconfigなし。scenarioにモデル本文はない。reset前や破棄した経路も保存に含まれ、表示設定は含まれない。今回の架空データ以外を追加していない。

## 保存境界

製品コード、SPEC、既存ガイド、原モデル、旧証拠の変更なし。issue作成・更新、commit、push、PR作成なし。[最終検証](evidence/final-verification.json)に原本hash一致と差分境界を記録する。評価専用worktreeは成果物を保持するため残している。

報告・証拠は別コンテキストの [独立レビュー](evidence/independent-review.md) を実施済み。
