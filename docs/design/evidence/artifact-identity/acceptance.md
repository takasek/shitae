# #24 保存物と版の対応付けの受入記録

2026-10-16。更新済みorigin/main `34c250f`（#23のPR #29を含む）を起点に実装。#24はOPEN、重複する進行中PRなしと照合した。主checkoutの未追跡ファイルを保持し、専用worktreeを使用した。対象は [#24](https://github.com/takasek/shitae/issues/24) だけで、[#27](https://github.com/takasek/shitae/issues/27) の最後の統合利用評価、#28、#25には進めていない。

表示とAPIの使い方は [保存物と版の対応付け](../../scenario-artifact-identity.md)。全受入項目について以下の範囲で確認し、#24内の未達はない。agentの評価を人間一般へ広げず、制御fixtureのengine差を過去リリースの互換性評価へ広げない。

## TDD・決定的な検査

production変更前に、Sessionは短い不一致理由がないため新テスト1件失敗、GUIは版識別/種類別件数/保存名で3件失敗、CLIはsource差の短い理由がないため1件失敗することを確認した。実装後に全て通過。既存テストの期待保存名も新契約へ追随した。

| 受入条件 | 確認と結果 |
| --- | --- |
| engineのみの不一致 | Session/CLI/GUIでENGINE_MISMATCH、モデル未照合、再開/再記録の案内を確認。expected/actualにはmodelも含め全識別情報を保持 |
| entry・module追加/不足・参照先だけのsource差・空白差 | Sessionの固定期待、実ファイルを使うCLI別process、GUI受取評価A〜Gで理由の方向・module名を確認。空白と意味の差は自動判定しない |
| 厳密照合・終了コード | CLIはexit 1でstdoutなし。正常replayは別process exportと一致。同じ12文字prefixの別modelIdも拒否 |
| GUI失敗時の保持 | state/actions/history/revisionとexportの不変性をVMで確認。実ブラウザBでは先行「再生」後の詳細/来歴を保持し、拒否後に組込みbackを実行できた |
| 識別表示・保存名 | 同名mainの別engine/modelを表示で区別。実保存名にmodel/engineの先頭12文字。短縮IDが補助であることと完全情報による読込照合を案内 |
| 件数・保存範囲 | GUI固定期待でdispatch 2/seek 2/reset 1/手動試験1、ghost 2観測点/破棄済み5観測点。条件選択と破棄/reset前も残る。step合計を「6操作」と表示しない |
| 含まれない情報・表示設定 | モデル本文/DOM/表示設定の非保存と必要な配布物を表示。VM/実ブラウザでcheckboxを変更してから読込んでも現在設定を保持 |
| 既存保存契約 | schema、hash投影、StateView、HistoryItem、照合順序と実行意味に変更なし。engineVersionは既存build規則で再生成し、hash入力範囲は変えない |

全体テスト763件、全パッケージのtypecheck/buildが通過。[集約結果](checks.json)。独立レビュー後の文言修正・最終CSS変更ではSimulator buildとGUIテスト8件を再実行して通過した。コード上のリファクタは追加していない。

[反例検査](check-counterexamples.mjs) は「未照合モデルを照合済みと表示」「完全actual識別情報の欠落」「dispatchに全種類のstepを合算」の3故障を意図的に注入し、すべてassertionで検出した。[集約](counterexamples.json) と各logを保存。finallyで原状復帰した後にSession scenario 11件/GUI scenario 8件を再実行して通過した。

## 実ブラウザ・保存物の照合

親担当は予約題材でscenario読込後のdispatch 3/seek 2/reset 0/手動試験0を確認。その後最終文言のHTMLを開き直し、空席条件を選んで確認へ進み、model/engine付きの名前で[保存](browser-saved.scenario.json)した。[保存成功画面](browser-save.jpg)。この保存物は別CLI processでreplayし、全exportの一致とsummaryの種類別件数を確認した。[照合結果](browser-saved-validation.json)。

独立受取人は目的・問いとA〜GのHTML/元scenarioだけを渡され、JSON本文・モデル本文・実装・oracleを読まず、製品UIで判断した。[初回回答](recipient.md)。Aで正常読込、B〜Gのengine/entry/module集合/source差を短い理由から説明し、対応する元HTML/モデル/処理系で再開する場合と、新しい版で記録し直す場合を選べた。engine拒否からmodel一致を断定できないこと、短縮IDは保証ではないことも説明した。追加質問なし。

Aの読込件数はdispatch 4/seek 0/reset 1/手動試験1。受取人はreset前を含む記録と、モデル本文/DOM/表示設定が含まれないことを説明し、次の「再生」を実行して[再保存](recipient-saved.scenario.json)した。[保存画面](recipient-A-resaved.jpg)。親が別CLI processで全export一致とdispatch 5/seek 0/reset 1/手動試験1を確認した。[照合結果](recipient-saved-validation.json)。

Bでは先行「再生」→不一致読込→詳細/来歴保持→組込みbackによる継続を確認。[拒否](recipient-B-rejected.jpg)/[継続](recipient-B-continued.jpg)。C〜Gの拒否画面も同ディレクトリに保存した。表示設定はアクションOFF/部品状態ONのまま正常読込できた。[画面](recipient-A-display-retained.jpg)。

受取人の720px高の初回画像では、下段stack/mapが大きく上段の診断が途中で切れていた。下段全体を最大40vhに抑え、双方の独立scrollを維持した。最終CSSは独立コードレビューで追加所見なし。受取担当の再確認時にはiabが利用不可となったため同担当では再検証できなかった。親担当の既存正規iabは利用でき、最終HTMLを新たに読み込み、1280×720で[理由と次の行動の全表示](browser-final-diagnostic.jpg)と[拒否後の継続](browser-final-continued.jpg)を確認した。viewport設定は確認後に解除した。この最終表示確認は親担当の証拠として区別する。

## 独立レビュー・証拠の境界

[独立コードレビュー](independent-review.md) は実装会話を渡さない別agentが実施。simconfigの案内を「遷移マップの分割設定」に限定するP2を修正し、読戻しで解消。実ブラウザ受取人とは別担当。最終CSSも確認して追加所見なし。

受取用HTML/scenarioはbuild後に `node docs/design/evidence/artifact-identity/build-fixtures.mjs <出力先の絶対パス>` で再生成できる。Bは渡したmetadataのengineだけを変えた制御fixtureで、歴史的な処理系リリースではない。A〜Gに永続schemaの追加はしていない。受取後の保存物を検査する入口は `validate-browser-save.mjs <tickets|audio> <scenario絶対パス> <保存名prefix>`。

本変更でSession sourceが変わるためengineVersionも変わる。旧engineのscenarioを新engineで再生できるとは主張しない。#27全体の別題材・別担当での共有から設計変更後の再検討までの統合利用評価は、この子issueの受入とは別に残る。
