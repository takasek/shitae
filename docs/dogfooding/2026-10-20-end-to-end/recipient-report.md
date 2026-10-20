# 独立受取・再開記録

2026-10-20。作者の会話・補助script・評価結論を受け取らない別contextのAI一名による評価。人間の理解度・所要時間の評価ではない。処理系HEADは `3c68321001771faab35a35fc212056f54bb02bf1`、build済engineは `278103a97da5319e8f97bb3218d6508b7cfd2a8d3ebd479aed3faf00f75f5116`。依存・build・製品・原本を変更していない。

## 受取から説明できたこと

最初に新しいGUI Sessionへ `scenarios/astra-gui-ghost.scenario.json` を公開ファイル選択から読み込んだ。通知はdispatch 8 / seek 1 / reset 0 / 手動試験0の照合成功。現在地は「ノードからソースへ / 記録8 / 観測1 / 文書A」で、保持10観測点、ghost 1、破棄0だった。

操作来歴から、開始→文書Aを開く→A編集→保存の成功条件を選択→B切替→B編集→A切替→図のみ→ノードからソースへ→その操作の第1結果まで巻戻し、と説明できた。保存は条件「成功」が選ばれた記録であり、実際のディスク保存成功を証明しない。

部品状態を表示すると、作業面Aは並列（DSL由来）、状態Aは保存済（DSL）、図の状態Aは最新（初期）、正規化Aは非表示（DSL）だった。CLI stateで画面外の状態Bが未保存（DSL）であることも確認した。モデル `models/saved/astra/models/proposed.shitae:13,33,50,60` は保存状態A/Bを別singletonへ割り当てており、有限2文書の所属を表す。任意個文書の状態管理の証明にはならない。

「ノードからソースへ」の詳細を展開すると、第1結果は `set(作業面A##並列)`、第2結果は「該当行へ移動しエディタへフォーカス」で、後者だけがghostだった。すなわち図中心からソースへ戻る際に並列へ変更する結果までは現在経路に含まれ、自由文effectの観測点は巻戻し先より後ろにある。実エディタへfocusする実処理を確認したとは扱わない（`docs/design/session-usage.md:74`）。

## 選んだ次の一操作と結果

「切替(B)」を選んだ。理由は、Aが保存済のままBの未保存状態が残るかを、受取の問いに沿って確かめるため。GUIと、別processで受取scenarioをreplayしたCLIで、それぞれ同じ一操作を実行した。

GUIは文書Bへ移り、保存状態に `状態B ##未保存 / 共有(singleton) / DSL` と `B.pfdsl — Edited` を表示した。CLIも文書B、A保存済、B未保存、作業面A並列を返した。新操作により旧ghostの第2結果が破棄され、保持11 / ghost 0 / 破棄1となった。GUIは「分岐・破棄1観測点（記録8 / 観測2）」と旧操作の「完了点は破棄済み」を表示した。破棄点は記録に残るが、移動ボタンとして復元されないことを確認した。

CLIは同一process内で4要求（before query、dispatch、after query、exportScenario）を送り、全応答ok。dispatch handleはbefore応答から取得した。JSONLは `evidence/recipient/cli-requests.jsonl` と `cli-responses.jsonl`、全量からの要約は `verification-summary.json`。再開後の保存物は `scenarios/recipient-resumed.scenario.json`。GUIの前後状態は `gui-before.txt` / `gui-after.txt`、画像は `gui-after.png`。

## 保存・共有・再生成の理解

画面の保存範囲説明は、破棄経路・reset前・ghost・手動試験も全記録へ含め、モデル本文・DOM・表示設定を含めず、読込後も現在の表示設定を使う、と明記していた。通常文書 `docs/design/session-usage.md:70-74` も、同じentry名・全参照moduleのsource bytes・engineが必要であり、checkbox/fold/focus/graph設定は復元対象外と説明している。この範囲は理解できた。

受取scenarioのmodel欄はengine/modelId/entryModule/sourceBasis/manifestの識別情報で、モデル本文ではない。状態の表示ラベル等はscenarioに現れるため、「モデルの文字が一切ない」という意味ではない。編集・再生成には別渡しモデルが要る。GUI HTMLは閲覧・実行用、scenarioは記録と再生用、`.shitae`は編集・生成用として区別できた。

`proposed.shitae` はimportが無く、CLI metadataのmanifestもproposed一件だった。隣のcurrent/inline-reproはこのentryの参照moduleではないためコピーしていない。全参照module一式はこの一ファイルで足りると判断した。同名・同bytesで `evidence/recipient/model/proposed.shitae` へコピーし、公開CLI simulateで `evidence/recipient/regenerated.html` を生成（exit 0、232557 bytes）。simconfigは受け取っておらず、状態replayに不要と判断した。元のgraph表示設定の再現は主張しない。

コピーしたモデルで新CLI processを起動し元scenarioをreplay、metadata/provenanceSummaryを照会したところ、同modelId `9500d179aec9b7f1dd819665bd7f2e7fa3aab73679200fb383cfe3308a5e50b6`、同engine、保持10/ghost1、同cursorを得た（`copied-replay.jsonl`）。コピー元先SHA256はともに `4df483ee831379ef3a52988950985072717e3cdba5a7e86181fad62568b8810a`。再生成HTMLのブラウザ描画はこの担当では未確認。

追加のCLI保存→新GUI読込は、担当タブをreloadし起動・記録0の新Sessionを確認してから `scenarios/astra-cli.scenario.json` を公開ファイル選択で読み込んだ。dispatch 8 / seek 0 / reset 0 / 手動試験0を照合、記録8観測2の完了点、保持11 / ghost0、A保存済・並列を表示した（`cli-to-new-gui.txt` / `.png`）。これは最初のghost保存物とは別の受取資料である。

## 迷い・参照・不足・検証限界

- 作者への意味確認の質問は0件。操作列は教わらず公開来歴から復元した。追加依頼としてCLI保存物読込と別directory再生成を親から受けた。
- モデル本文の意味を読む参照は1回。後に根拠行番号を読む参照を1回（計2回）。通常文書は最初のREADME/AI_GUIDE/session-usage検索1回、session-usage本文1回、session-provenance本文1回、AI_GUIDE本文1回、session-usageの根拠行番号確認1回。AGENTSと追跡shitae-authoring手順は各1回。既存メモリの軽いキーワード検索で過去の一般的shitae評価項目が見えたが、過去評価の詳細・作者会話・今回の補助script・結論は読んでいない。そのため完全な製品未経験者の評価ではない。
- 元の8 dispatchを手入力し直した回数は0。読込2回（ghost GUI、CLI保存物GUI）、CLI replay2 process（元モデル、コピー先モデル）。再開の一操作はGUI/CLI各1回。受取モデルへの編集0回。
- ghostは巻戻し後にまだ移動可能な後続点、破棄は新操作で切り離され記録にだけ残る点、とGUIと通常文書を合わせて理解できた。画面の「読込地点のsingleton」は画面上のA中心で、Bの詳細はCLI stateまたは切替で確認する必要があった。
- reset前が保存対象であることは画面と文書から説明できたが、最初の受取scenarioにはreset0件であり、この担当はresetを実行して復元検証していない。表示設定の完全な復元除外も仕様説明として理解した範囲で、fold/focus/graph全種の個別実測ではない。
- 最初のfilechooser待機・click・setFiles・読込確認の一呼出しが349秒かかった。内訳と原因は特定できない。追加読込はwaitForEvent timeoutMs:10000を明示し、全体約0.52秒で成功。downloadイベントは試していない。
- checkboxの表示変更後、同一call内で古いAX番号の操作を続けて「Could not check the click target's shadow root」になった1件がある。状態取得で最初の変更成功を確認し、新しいAXで操作し直した。製品の操作拒否や状態不整合とは判定しない。
- 追加の2個目tab作成は「IAB visibility is not supported in a subagent thread」で失敗したため、既存の担当tabのreloadで新Sessionを作った。親のtabには触れていない。
- 初回fetchはsandboxでFETCH_HEAD書込み不可、許可された昇格でfetchのみ成功。固定HEADは変わらず、依存/build更新・commit/push/外部書込みはしていない。

この一例では、状態と操作・選択条件・途中結果・巻戻し由来を説明して次の操作を再開できた。作者がなぜその検討順や成功条件を選んだかという設計上の意図は、操作記録だけから断定できない。今回は受取時に目的と問いが渡されていたため再開方針を決められた。
