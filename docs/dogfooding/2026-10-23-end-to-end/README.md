# #69 修正後の総合再評価（2026-10-23 JST）

評価 SHA: `1eed5fb0330d8c61206ab8632de8ee1e5085044e`。

#63〜#68 が反映された版を固定し、元レポートの反例・対照、11 module の二予約模型、新しい題材の作成・変更・独立引継ぎを確認した。評価用の新規ファイルだけを追加し、製品・SPEC・既存ガイド・過去証拠は変更していない。評価中はcommit・push・PR・issue 書込みを行わず、評価完了後に利用者の指示で記録をPR化し、#69へ結果と残件を反映する。結論と未完了範囲は [report.md](report.md)、候補は [candidates.md](candidates.md)。[独立レビュー](independent-review.md)は指摘なし。

## 固定対象・環境

| 項目 | 記録 |
| --- | --- |
| 基準ブランチ | origin の HEAD は main。fetch と `git ls-remote --symref origin HEAD` で確認 |
| checkout | `/Users/m5/.codex/worktrees/issue-69-reevaluation/shitae`（Codex 登録済み専用 worktree） |
| 前回評価 | [2026-10-21](../2026-10-21-end-to-end/README.md)、`365a8c07262a1110451678d7bc2e1027fd2038a2`。今回 SHA の祖先と確認 |
| 直接の比較元 | #69 に記載された元レポート対象 `0e49fc7e8bebf9b49c4533c2532ec0ee32037ad5` と添付再現パック |
| OS / Node / pnpm | macOS 27.0.1 (26A434) arm64 / v26.5.0 / 10.33.2 |
| ブラウザー | Codex in-app browser。版番号は未取得 |
| engineVersion | `683237908597a9e4f75adbb85d54f4a48397f388a4d5d60fb45f9a8b1ad950c7` |
| 評価者 | 親 agent、会話を引き継がない初見作成 agent、独立受取 agent、最終証拠レビュー agent。ブラウザーは親が担当 |
| 配信 | 127.0.0.1:8769 の一時 HTTP。終了時の停止確認は evidence/server-stop.txt |

固定 lockfile から install・build した。全898テスト、全 package の型検査成功（[集計](evidence/validation.json)、[build](evidence/build.log)、[tests](evidence/tests.log)、[typecheck](evidence/types.log)）。評価中に engine を更新していない。モデルごとの完全な modelId / manifest は対応 scenario の model に保存されている。

前回以降には #42、#43、#45〜#49 の修正とガイド、#52/#53 の情報設計・概念説明、#54〜#57 の操作詳細・保存共有・静的マップ案内、#63〜#68 の module 同一性・診断・要約・古い確認の設計例がある。追加された利用記録 `docs/design/2026-10-22-usability/`、`2026-10-22-concept-guide/`、`evidence/simulator-guidance-47-56-57/`、`evidence/issue-67-validation.md`、`evidence/checker-65-64/` と `stale-confirmation.md` の確認範囲を照合した。これらの過去成功は今回の再実行と区別した。

## 入口と保存物

CLI は `check` / `simulate` / `session` / `session --replay`、JSON Lines の query（actions / state / metadata）・dispatch・exportScenario を利用した。handle は各操作前に公開 actions の応答から取得し、accepted / rejected は実際の branches から選ぶ。自由文 effect を実サービスの成功とは扱わない。

GUI の使用文言は「操作の再生ファイルを保存」「操作の再生ファイルを読み込む」「記録N · 操作」「この時点から続ける…」→「この時点から続ける」、「残っている作業（現在の経路外 N件）」。[実画面の記録](evidence/browser/)に保存した。ページ内の Session・内部関数に scenario を注入せず、実ファイル選択と保存を使用した。

| 題材 | モデル・HTML | 今回の保存物 |
| --- | --- | --- |
| module 同一性 | [元モデルと同一 bytes のコピー](models/module/main.shitae)、[HTML](evidence/module.html) | [GUI 実保存](scenarios/module-gui.scenario.json)、[別 CLI で継続](scenarios/module-gui-continued.scenario.json) |
| 二予約・対策版 | [11 module の入口](source-pack/workshop/r2_1/main.shitae)、[新版 HTML](evidence/workshop.html) | [新規記録](scenarios/workshop-r2_1.scenario.json)、[別 process 継続](scenarios/workshop-r2_1-continued.scenario.json) |
| 二予約・旧反例 / 保守版 | source-pack/workshop/r2 / refactor_candidate | scenarios/workshop-r2 / workshop-refactor_candidate および continued |
| 初見の見学予約 | [作者 brief](author/handoff-brief.md)、author/v1 と author/v2 | 各 visit.scenario.json、[受取側の新規記録](recipient/v2-continued.scenario.json) |

source-pack は元の添付を保全したコピー。SHA256SUMS.txt の79対象すべて一致し、元の旧 HTML / model / scenario を残した。元ディレクトリに後から追加された runs はコピー先から除いた。今回の実行結果は evidence 配下だけに置いた。旧 scenario の hash・ID・engine を編集していない。

## 再確認する手順

同じ commit の checkout で README の install・build を実施し、対応するモデルと scenario の組で公開 CLI を起動する。

```sh
node packages/cli/dist/index.js session docs/dogfooding/2026-10-23-end-to-end/models/module/main.shitae --replay docs/dogfooding/2026-10-23-end-to-end/scenarios/module-gui.scenario.json
node packages/cli/dist/index.js session docs/dogfooding/2026-10-23-end-to-end/source-pack/workshop/r2_1/main.shitae --replay docs/dogfooding/2026-10-23-end-to-end/scenarios/workshop-r2_1.scenario.json
```

同じ process に `{"id":"inspect","command":"query","select":["state","actions","metadata"]}` を送る。元13例の再確認には source-pack/minimal/run_minimal.py を使い、SHITAE_CLI と既存でない SHITAE_OUTPUT を指定する。evidence/*-used.py は実際に使った評価スクリプトの記録で、この checkout の絶対パスを含む。既存出力を上書きせず、新規の出力先を用意してから使う。

作成担当は過去の解答・評価・製品実装を読まず、受取担当には brief と対応物だけを渡した。共有 filesystem のため OS による隔離ではなく、指示と読取申告による。詳しくは [作者報告](author/report.md) と [受取報告](recipient/assessment.md)。AI の利用成功を人による初心者評価・正式受入へ読み替えない。
