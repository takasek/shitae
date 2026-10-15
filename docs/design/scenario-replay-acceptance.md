# #11 保存・別process再生の受入

2026-10-15。実装は共通Sessionのjournal/export/replay、CLIのexportScenarioと起動時--replay、生成GUIのダウンロード/ファイル読込。runtime reducer、言語仕様、保存済みSol/Astraモデルは変更していない。設計基準は `b47e243`、実装commitは共通処理 `15df3ab`、CLI `d26d2f4`、GUI `d807d7f`。[契約](scenario-replay-contract.md) と [使い方](session-usage.md#シナリオの保存と別processでの再生) を参照。

## 中心受入：保存してprocessを終了し、別processで再現

[再実行可能な受入script](evidence/scenario-replay/accept-processes.mjs) は既存の固定モデル操作114要求を再実行し、保存後のprocess Aのexit 0を待ってから、別directoryへ同じモデルをコピーしてprocess Bを起動する。Bの再exportとAの保存物を全文比較し、全step・結果途中の観測digest・effect/diagnostic・最終投影まで同じと確認した。

| 保存モデル | dispatch（成功） | journal step | process A → B | 最終現在地 |
| --- | --- | --- | --- | --- |
| Sol current | 6（6） | 6 | 28423 → 28424、双方exit 0 | Workspace / NoDocument |
| Sol proposed | 13（12） | 12 | 28425 → 28427、双方exit 0 | Workspace / Source |
| Astra current | 6（6） | 6 | 28429 → 28430、双方exit 0 | 文書A / 保存済 |
| Astra proposed | 10（10） | 10 | 28431 → 28432、双方exit 0 | 文書A / variantなし |

合計4モデル、114要求、35 dispatchの34成功と意図した拒否1件。拒否はjournalへ追加されない。起動/終了時刻、source/engine/model、保存物hash・bytes、各操作の現在地と比較結果は [process-acceptance.json](evidence/scenario-replay/process-acceptance.json) に保存した。受入scriptを再実行するとPID/時刻は更新される。[4つのsidecar](evidence/scenario-replay/) は操作handleや絶対source pathを含まない。

## GUIとCLIの相互引継ぎ、実ブラウザ

macOSのCodex in-app browserへ、loopback HTTPで生成HTMLを読み込んだ。試験モデルで以下を実操作した。

1. chooseの[yes]を選択し、Cardの試験値をReadyへ変更。
2. set(Badge)直後へ巻戻して保存ファイルをダウンロード。journalはdispatch・手動試験・seekの3 step。
3. HTMLを再読込して初期状態に戻し、ファイル選択から保存物を読込。「3操作を照合」が表示され、Screen / Start、Badge / On・DSL由来、三つのghostを復元。その後「部品の状態を表示」を手動でonにして画像を撮影した。画像のon表示を、表示設定もシナリオから復元した証拠とはしない。
4. 未知formatVersionの保存物を選択し、SCENARIO_FORMATで拒否。表示されたtimelineと実行controlのhandle属性は前後一致。続けてopen-cardを実操作し、Card / Readyへ進めた。

[復元画像](evidence/scenario-replay/browser-restored.jpg)、[拒否画像](evidence/scenario-replay/browser-rejected.jpg)、[観察JSON](evidence/scenario-replay/browser-observation.json)、[生成HTMLのhash](evidence/scenario-replay/browser-artifacts.json) を保存した。console warn/errorはこの観察で0件。検証サーバー終了と接続拒否を確認後も、既に読み込んだHTMLで「戻る」を実操作しScreen / Startへ戻れた。

ブラウザがダウンロードした [3 stepの保存物](evidence/scenario-replay/browser-trial.scenario.json) を別の実CLI processへ渡し、exit 0、scenario全文一致、Screen / Startとghost三件を確認した（[記録](evidence/scenario-replay/browser-to-cli.json)、PID 85063）。逆に、実CLIで保存したSol proposedの12 stepを新しい生成HTMLへファイル選択で読込。「12操作を照合」とWorkspace / Sourceを実画面で確認した（[記録](evidence/scenario-replay/browser-cli-to-gui.json)）。

ブラウザの再読込は新Sessionの確認であり、OSのブラウザprocess終了の証拠ではない。process終了/起動の証拠は前節の実CLI A/Bに分けた。file URL、他ブラウザ、他OS、支援技術一般の保証や自由文effectの実I/O成功は含めない。

## TDD・検証・独立レビュー

最初のSession契約テストは未実装exportで7 failed / 22 passedを確認してからproductionコードを追加し、29件成功。CLIはexport入口の未実装で2 failed / 25 passed後に27件成功。GUIは保存/読込関数がない3 failedを確認してから接続し、異realm plain objectの反例も修正した。

独立レビューの形式検査/診断とGUI読取競合は、それぞれ失敗テストを先に追加してから修正した。[独立レビュー記録](evidence/scenario-replay/independent-review.md) に原指摘・再確認・証拠の限界を記載する。未解消指摘はない。

全packageのbuildとtypecheckが成功。全体750テストを一括実行して成功した後、GUI読取競合の変更についてsimulator全228件（うちscenario 4件）とsimulator typecheckを再実行して成功した。最終合計751は未変更523＋修正後228の合算であり、751件を最終版で一括実行したとはしていない。[検証集計](evidence/scenario-replay/validation.json) に内訳とTDD結果を保存した。

## 契約の反例と範囲

| 契約の受入 | 確認 |
| --- | --- |
| R01 / R02 | 実CLIの4モデル・8process、別directory、全文再export一致。Sessionテストでdocuments Map順反転も一致 |
| R03 | engine、entry source bytes、manifest source hash、AST-only/metadataなしの拒否をテスト。CLIでモデル改変・壊れたJSON・起動引数不正のstdoutなし非0終了 |
| R04 / R05 | 複数配置と組込み戻るの別descriptor、定義位置改変、branch欠落/改変の拒否をテスト。候補0/複数とdisabledは既存API再検証で停止する。名前やindexへの補正を行わない |
| R06 / R07 | 手動/DSL由来、通常部品試験値、結果途中seek、ghost破棄、reset、無観測no-op、破棄済/前方/無観測step参照の拒否をSessionテスト。実ブラウザでseek/ghost/継続操作 |
| R08 / R09 | 同じ最終現在地でも途中観測/出力/最終投影の改変で拒否。final内部欠落/未知fieldはdispatch 0回。不完全hash記録はexport拒否。GUI不一致/ファイル読取失敗/重複読取時はlive状態保持 |
| R10 / R11 | 実CLI→実ブラウザ、実ブラウザ→新CLIの往復、読込成功/拒否/操作継続。独立reviewerのVM往復は別証拠 |

保存先への任意ファイル書込APIは追加していない。CLIはJSON応答を返し、ファイル永続化はclientが担当する。GUIは完全なJSONを新規ダウンロードし、自動上書きしない。自由文effectの実行、期待値DSL、版migration、クラウド保存などへの拡張は行っていない。#11の受入実装はローカルで完了し、GitHub上のIssue完了・PR公開・main統合はこの記録によって実行済みとはしない。
