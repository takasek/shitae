# shitae の一連の設計作業を通した評価（2026-10-21）

固定版の shitae で、自然文からのモデル作成、保存済みモデルの設計検討、保存・引継ぎ、設計変更後の再検討を行った。評価と新規記録のみ。製品・SPEC・既存ガイド・過去証拠は変更せず、commit・push・PR・issue 書込みを行っていない。手順は `.agents/skills/shitae-dogfooding/SKILL.md`（PR #41 で追加中、評価 SHA には未収録）に従った。

## 固定対象と環境

| 項目 | 値 |
| --- | --- |
| リポジトリ | takasek/shitae |
| 評価 SHA | `365a8c07262a1110451678d7bc2e1027fd2038a2` |
| 基準ブランチ | `main`（`git ls-remote --symref origin HEAD`） |
| 前回評価 | [2026-10-20-end-to-end](../2026-10-20-end-to-end/README.md)（評価 SHA `3c68321001771faab35a35fc212056f54bb02bf1`、評価 SHA の祖先であることを確認） |
| 前回以降の変更 | #38 履歴の閲覧と確認付き再開の分離（`2143d6a`、ADR-0025、`docs/design/gui-history-contract.md`）、#39 2026-10-14 評価記録の追加 |
| 前回以降に追加された評価記録 | `docs/design/2026-10-20-issue35/`、`docs/dogfooding/2026-10-14-post-fixes/` |
| 実施 checkout | `/Users/m5/works/shitae/.worktrees/dogfood-2026-10-21`（detached） |
| OS / Node / pnpm | macOS 27.0.1 (26A434) arm64 / v26.5.0 / 10.33.2 |
| lockfile SHA256 | `7913c3d67f06c818f70e61a07eb14a798956431a5dcdf2fcfbd36010066b6bf8` |
| engineVersion | `278103a97da5319e8f97bb3218d6508b7cfd2a8d3ebd479aed3faf00f75f5116`（前回と同じ。#38 は simulator のみの変更） |
| ブラウザ | Claude デスクトップアプリの built-in browser（版は取得できず未確認）。Claude in Chrome は拡張がページへスクリプトを注入できず（Chrome 再起動後も同じ）使用を断念 |
| 評価者 | 親（Claude Opus 5.5）、初見の作成担当（新規 subagent、Sonnet）、独立した引継ぎ担当（新規 subagent、Sonnet）。ファイル選択ダイアログの操作だけ人（利用者）が行った |
| 配信 | このディレクトリを 127.0.0.1:8765 で一時配信。終了時に停止し listener なしを確認 |

`pnpm install --frozen-lockfile` と `pnpm -r build` をこの checkout で実行した（[install](evidence/install.log)、[build](evidence/build.log)）。再生・再開の途中で処理系を更新していない。

## 使った公開入口の文言

- CLI: `node packages/cli/dist/index.js check|simulate|session <model>`、`session <model> --replay <file>`、JSON Lines の `query`（select: actions / action / state / history / observation / metadata / review）、`dispatch`、`exportScenario`（応答の `scenario` 部分を保存）。
- GUI: 「操作の再生ファイルを保存」「操作の再生ファイルを読み込む」（「ファイルを選択」）、「画面を見る」「この時点から続ける…」→確認画面の「この時点から続ける」／「位置の変更をやめる」、「履歴の閲覧を終える」、「初期状態へ」、「部品の状態を表示」、「画面外も含めて状態を確認する方法」。

## 読む順序

- [report.md](report.md): 作業ごとの効果・負担・問題・未確認範囲。
- [candidates.md](candidates.md): 既存 issue・前回の候補表と照合した改善候補。
- [author/author-notes.md](author/author-notes.md): 過去の記録を渡さない作成担当の新規作成・探索。
- [saved-expectations.md](saved-expectations.md): 保存済みモデルの操作前の問いと予想。
- [recipient/recipient-report.md](recipient/recipient-report.md): 会話・補助 script を渡さない引継ぎ担当の報告。

## 保存物の対応

| モデル | HTML | scenario / 用途 |
| --- | --- | --- |
| [Astra proposed](../2026-10-13-standalone/astra/models/proposed.shitae)（modelId `9500d179aec9…`） | [生成 HTML](evidence/astra-models-proposed.html) | [CLI 通常終了点](scenarios/astra-cli.scenario.json)、[別 process で継続](scenarios/astra-resumed.scenario.json)、[GUI 結果途中・ghost](scenarios/astra-gui-ghost.scenario.json)、[ghost 地点から CLI で別分岐](scenarios/astra-ghost-branched.scenario.json) |
| [Sol recovery](../2026-10-13-standalone/sol/models/recovery.shitae)（`1e6933bcad00…`） | [生成 HTML](evidence/sol-models-recovery.html) | [変更前の記録](scenarios/sol-recovery-v1.scenario.json) |
| [Sol recovery 派生（上書き対象の表示）](models/sol-recovery-target/recovery.shitae)（`3570a420dd27…`） | [生成 HTML](evidence/sol-recovery-target.html) | [変更後に記録し直したもの](scenarios/sol-recovery-v2.scenario.json) |
| 初見モデル [v1](author/library-v1.shitae) / [v2](author/library-v2.shitae) | [v1](author/library-v1.html) / [v2](author/library-v2.html) | 詳細は author-notes |

すべて単一 module、simconfig なし。scenario にモデル本文（ソース）は含まれない。生成 HTML には要素名・操作名・文字列を含む定義が埋め込まれている（report の「共有」参照）。表示設定は復元対象外。reset 前や破棄した経路・自由文 effect の文字列も保存されるため、架空のデータだけを使った。

## 隔離の限界

作成担当・引継ぎ担当は会話を継承しない新規 subagent だが、同じ filesystem にアクセスできる。資料の隔離は指示と、各担当が報告した読取パスの列挙による。両担当とも親ディレクトリの名前一覧が `ls` で目に入ったと申告し、中身は開いていないと報告した。

## 再実行入口

同じ SHA の checkout で固定 lockfile から build する。既存の成果物を上書きしないよう、出力先は新しいディレクトリにする。

```sh
pnpm install --frozen-lockfile
pnpm -r build
node packages/cli/dist/index.js session docs/dogfooding/2026-10-13-standalone/astra/models/proposed.shitae --replay docs/dogfooding/2026-10-21-end-to-end/scenarios/astra-gui-ghost.scenario.json
```

`tools/run-session.sh <出力dir> <model> [--replay <file>]` は要求ファイルへの追記を stdin にして CLI session を起動し、`tools/send.mjs <出力dir> '<json>' [path]` は 1 要求を送って同じ id の応答を待つだけの薄い client。出力先は引数で指定し、このディレクトリの evidence を上書きしないこと。

生成 HTML を開くときは、このディレクトリを一時配信して利用後に停止する。

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs/dogfooding/2026-10-21-end-to-end
```
