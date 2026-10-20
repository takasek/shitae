# shitae の一連の設計作業を通した評価（2026-10-20）

固定版の shitae で、自然文からのモデル作成、保存済みモデルの設計検討、保存・引継ぎ、設計変更後の再検討を行った。評価と新規記録のみ。製品・SPEC・既存ガイド・過去証拠は変更せず、commit・push・PR・issue 書込みを行わない。

## 固定対象と環境

| 項目 | 値 |
| --- | --- |
| リポジトリ | takasek/shitae |
| 評価 SHA | `3c68321001771faab35a35fc212056f54bb02bf1` |
| 対象取得 | origin fetch 後の origin/main。primary は未追跡 `.agents/`・`.worktrees/` があったため変更せず、新しい detached worktree で評価 |
| 実施 checkout | `/private/tmp/shitae-e2e-20261020-01a1570c` |
| OS | macOS 27.0.1 (26A434), arm64 |
| Node / pnpm | v26.5.0 / 10.33.2 |
| ブラウザ | ChatGPT in-app browser、ChatGPT.app 26.1013.40934 (20770)。内部ブラウザエンジンの版はツールから取得できず未確認 |
| engineVersion | `278103a97da5319e8f97bb3218d6508b7cfd2a8d3ebd479aed3faf00f75f5116` |
| 評価者 | Codex root、初見の author agent、独立した recipient agent。人間による受入ではない |
| 配信 | 今回のディレクトリだけを 127.0.0.1:8765 で一時配信。file URL は環境非対応。終了時停止 |

`pnpm install --frozen-lockfile`、`pnpm build` をこの checkout で実行した。sandbox 内の pnpm は registry 到達失敗による署名検証エラーで停止したため、同じコマンドを通常の昇格審査経由で実行した。署名検証の無効化や lockfile 更新はしていない。再生・再開を始めてから処理系を更新していない。

[環境と lockfile hash](evidence/environment.json)、[build](evidence/build-elevated.log)、[install](evidence/install.log)、[対象機能を含む履歴](evidence/feature-history.txt)、[既存 issue の読取](evidence/issues.json)を保存した。#11/#18/#23/#24/#28 の実装、#25 のガイド・派生例、#36 のモデル byte 保持を含む版である。#27/#35 の人向け評価は別の未完了事項として扱う。

## 読む順序

- [report.md](report.md): 効果、負担、候補、未確認範囲。
- [author-notes.md](author-notes.md): 過去の解答モデルを読まない新規作成・探索。
- [saved-expectations.md](saved-expectations.md): 保存済みモデルの操作前期待。
- [recipient-report.md](recipient-report.md): 作者の会話・補助 script を渡さない独立引継ぎ。
- [candidates.md](candidates.md): 既存 issue と照合した短い改善候補表。

## 保存物の対応

| モデル | HTML | scenario / 用途 |
| --- | --- | --- |
| [Astra proposed](models/saved/astra/models/proposed.shitae) | [生成 HTML](evidence/astra-models-proposed.html) | [CLI 通常終了点](scenarios/astra-cli.scenario.json)、[別 process で継続](scenarios/astra-resumed.scenario.json)、[GUI 結果途中・ghost](scenarios/astra-gui-ghost.scenario.json)、[別操作へ分岐後](scenarios/astra-ghost-branched.scenario.json) |
| [Sol proposed](models/saved/sol/models/proposed.shitae) | [生成 HTML](evidence/sol-models-proposed.html) | [競合・構文復帰・最後の文書を閉じる](scenarios/sol-cli.scenario.json) |
| [Sol recovery](models/saved/sol/models/recovery.shitae) | [生成 HTML](evidence/sol-models-recovery.html) | [再変更と取消](scenarios/recovery-cli.scenario.json) |
| [Astra current](models/saved/astra/models/current.shitae) | [生成 HTML](evidence/astra-models-current.html) | [共通通知の比較](scenarios/astra-current.scenario.json) |
| [初見モデル](models/author/library-v1.shitae) | [初案](evidence/author/library-v1.html)、[変更案](evidence/author/library-v2.html) | 詳細は author-notes |

保存済み7モデルの CLI/HTML の完全な `modelId` と `engineVersion` は [model-identities.json](evidence/model-identities.json) に記録し、全件で一致を確認した。Astra proposed は `9500d179aec9b7f1dd819665bd7f2e7fa3aab73679200fb383cfe3308a5e50b6`、Sol proposed は `6ea6e57467bbff453b0aed74fc8e222ab07a99014557dfb23fb00d6e2c428fe5`。同じ proposed という名前だけで選ばない。

新規図書予約モデルの前後も [author-identities.json](evidence/author-identities.json) でCLI/HTMLの完全な識別情報と一致を記録した。初案は `01022bc25e3f18857b85ffff05f1833e25b14cd920e55a58615f958c527aae6b`、変更案は `3d6bd2f2364c9bc254a4742a1052ed9935dc0b326b730b117cb737be0aa8e236`。

今回のモデルはすべて単一 module。simconfig は使っていない。HTML の閲覧・再開には対応する HTML と scenario と版情報を渡す。編集・再生成には models 以下の対象モデルも渡す。scenario にモデル本文は含まれない。表示 checkbox、fold/focus、graph 設定は復元対象外。reset 前や破棄した経路・effect 文字列も保存されるため、架空のデータだけを使った。

## 再実行入口

同じ SHA の checkout を用意し、上記の Node/pnpm と固定 lockfile で build する。既存の成果物を上書きせず、HTML の再生成先は新しい一時ディレクトリにする。

```sh
pnpm install --frozen-lockfile
pnpm build
node packages/cli/dist/index.js check docs/dogfooding/2026-10-20-end-to-end/models/saved/astra/models/proposed.shitae
node packages/cli/dist/index.js session docs/dogfooding/2026-10-20-end-to-end/models/saved/astra/models/proposed.shitae --replay docs/dogfooding/2026-10-20-end-to-end/scenarios/astra-gui-ghost.scenario.json
```

同じ process に順次 JSON Lines を送る。actions の応答から handle と branch を選び、受理操作後は取り直す。

```json
{"id":"where","command":"query","select":["actions","provenanceSummary"]}
{"id":"explain","command":"query","select":["review"]}
{"id":"save","command":"exportScenario"}
```

export 成功応答の `scenario` 部分だけを新しい UTF-8 JSON に保存する。全応答外枠や操作列の手編集を使わない。GUI の巻戻しには操作来歴を展開し、結果の途中の観測点を選ぶ。CLI に seek はない。

生成 HTML を開けない環境では、このディレクトリだけを一時配信する。利用後に Ctrl-C で停止する。

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs/dogfooding/2026-10-20-end-to-end
```

`http://127.0.0.1:8765/evidence/astra-models-proposed.html` などを開く。原本と旧証拠の保全は [original-hashes.json](evidence/original-hashes.json) と最終差分確認で検査する。旧 `verify.py` は旧 evidence を上書きするため使わなかった。

評価時の補助scriptは当時の実行の記録で、出力先がこの評価ディレクトリを指す。再実行する場合は新しい出力先へ変更し、保存済み証拠へ上書きしない。評価用HTTPサーバーは終了済み。最終保全確認は [final-validation.json](evidence/final-validation.json)。
