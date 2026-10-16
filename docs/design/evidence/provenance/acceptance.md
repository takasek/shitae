# #23 操作来歴の検証記録

2026-10-16。起点は取得済み `origin/main` の `7a0a958`。#27 の先頭候補 #23 は OPEN、進行中PRなしだったため選択した。primaryの未追跡ファイルを保持し、別checkoutで実装した。実装commitは `4d53ac4`、イベント表示の回帰修正は `3c0e155`。仕様は [使い方](../../session-provenance.md)、第一段階全体は [#27](https://github.com/takasek/shitae/issues/27)。この記録は #27 全体の統合利用評価を代替しない。

## TDD と決定的な検査

production変更前に `packages/session/test/provenance.test.ts` を追加し、4件とも未対応selectの `INVALID_REQUEST` で失敗することを確認した。GUIは「操作来歴」が未表示、CLIは新query fieldの拒否で失敗した後に接続した。追加の反例では裸variant参照、named sessionの表示、nullページ指定の3件が失敗し、表示/validationを修正して通過した。最初のテスト準備時のimport誤りとfixtureのゲート宣言不足は、それぞれ修正後に再実行しており、機能のRedには数えない。

| 契約 | 根拠・結果 |
| --- | --- |
| 操作名、条件、実行順結果、host/配置、journal参照 | Sessionの独立期待でChoose/okと結果0/1/2、step/observationを固定。返値改変の隔離も確認 |
| 結果途中・複数seek・redo | 1結果がframe変化とR005診断の2観測を生成するモデルで、その間へseekし区分別件数を確認 |
| retained/ghost/discardedの混在 | 結果内・操作内の分類を確認。no-opはghostを保持し、次の観測で切り捨て、reset前もjournalに残す |
| 無観測no-op・組込みback・手動試験 | no-opに架空の完了点を作らない。backとDSL操作を区別。reset後に旧点へseekできない |
| 複数配置/module・包含/overlay | CLI別processテストで同じCardの2配置、import、overlay、built-in back、試験値、reset、複数seekを照合 |
| 別process replay | liveと別processのsummary/page/全9step詳細/reviewを一致確認。単なるCLI/GUI一致とは別に独立期待を検証 |
| 読取不変性 | state/actions/history/revision/全scenarioをquery・表示・書出し前後で比較。default query/dispatchの既存応答検査も通過 |
| schema/digestの維持 | scenario.ts、StateView、HistoryItem、originの意味に変更なし。表示注釈は別記録。engineVersionは既存生成規則に従い更新 |
| 不完全な記録の識別 | metadataなし/AST-onlyのsummary/page/reviewはavailable:false、理由つき。detailはSCENARIO_UNSUPPORTED |
| 故障を検出できること | [反例検査](counterexamples.json)。ghostをretained、discardedをghost、観測ordinalを0へ潰す3変異が全てassertionで失敗。原状復帰後4件通過 |

実行した全件テストは759件、全パッケージのtypecheck/buildは通過。イベント表示の追加差分ではsimulatorのtypecheckと全件testを再実行した。[集約記録](checks.json) を参照。変異検査は `node docs/design/evidence/provenance/check-counterexamples.mjs` で再実行できる。別の編集がないcheckoutで使い、検査対象ファイルをfinallyで元へ戻す。

独立コードレビューは実装会話を渡さない別agentへ、#23/#27、最終差分、AGENTS、保存契約だけを渡して実施した。[受領記録](independent-review.md) のとおり修正必須所見なし。独立プローブで1結果の複数点→seek→no-op→back分岐→reset→replayと、生成GUIの表示・書出し・観測点移動を確認した。このコードレビュー自体は実ブラウザ/利用者検収の証拠には数えない。

## 実ブラウザと保存物照合

検証用HTMLは [生成スクリプト](build-fixtures.mjs) で作る。`pnpm -r build` 後、出力先の絶対パスを引数として渡す。tickets/audioの各v1/v2のHTMLと、v1のscenario、照会結果を生成する。oracle.jsonは照合補助であり、独立期待/受取人への説明には使わない。

予約題材のv1を実iabで開き、読込ボタンでscenarioを選択した。操作2/4を展開し、確定のdismiss直後の点は保持、確定記録/goto完了の2点は破棄、日程変更のgoto別日程はghostと確認した。[画面](browser-tickets.png) は日程変更の途中を選択している。結果2の観測点をクリックして別日程へredoし、現在地の変化を確認した。

「検討手順を表示」「検討手順を書出し」「イベントを表示」の切替の前後で、実際にダウンロードしたscenarioの全bytesが一致した。[ブラウザ保存物](browser-resaved.scenario.json) を別CLI processへreplayし、再exportの全内容と、[手順テキスト](browser-review.txt) の完全一致も確認した。[照合結果](browser-validation.json) を参照。

イベント非表示時に非currentイベントの完了点が残る反例をテストで先に検出し、現在点だけを例外とする既存ルールに揃えた。独立レビューでも旧条件の不具合を再現し、修正後は6件通過。最終bundleを実ブラウザで開き直し、手動試験→確認→イベント非表示で、過去のイベント移動先0・現在イベントの移動先1・操作見出し1を[画面](browser-events.png) と [DOM件数](browser-event-toggle.json) で確認した。

## 独立受取と派生モデル

受取人には目的・問いとHTML/scenarioだけを最初に渡し、分岐/resetの有無や答えを教えなかった。JSON本文・原モデル・実装・oracleを読まず、製品のUIから説明し、次の一操作と再保存を行う。初回報告を確定した後に変更要件とv2、編集/再生成用の全モデルを渡す。旧scenarioの版越えreplayは行わず、製品生成の手順を参照して人が選び直す。

音楽は [受取人報告](audio-recipient.md)、[v1生成手順](audio-review.txt)、[v1継続保存](audio-recipient-v1.scenario.json)、[v2保存](audio-recipient-v2.scenario.json) を参照。reset前の手動試験/確認、resetで破棄した3観測点、show→push、組込みback後も残るプレイヤー、overlayからの停止、現在地を説明した。追加「再生」と再保存を実施。v2の新要件「準備中→準備完了→再生中」は手順を参照し既存6操作を再入力、新しい1操作を追加して再検討した。文字転記・追加質問・条件選択誤りは0。再保存物は別CLIで全exportを照合した。[照合結果](recipient-validation.json) に残す。

予約は [受取人報告](tickets-recipient.md) のとおり、空席選択、仮予約→確認→確定、dismiss直後への巻戻し、日程変更への分岐、確定記録/goto完了の2観測点の破棄、日程変更途中の現在地とgoto別日程のghostを説明できた。次の1操作としてghost完了点を選んで別日程へ進み、[再保存](tickets-recipient-v1.scenario.json) した。現在まで6点/ghost0/破棄2となり、別CLIで全export一致と、親の独立したブラウザ操作で同じ論理経路を採った保存物との一致を確認した。追加質問・選択誤り・製品値の再入力は0。履歴上で確定の結果途中へ戻った検討と、実サービスの確定取消ができることは区別している。

音楽と予約の受取人は同一agentで、モデル作者/記録作成者とは会話を共有しない。予約の最初の担当では自動承認審査がlocalhostアクセスを拒否した。ユーザーの明示承認後はbrowser inventoryが空で、別ブラウザへの迂回はせず、同じ正規iab手順を使える担当に引き継いだ。2題材目ではUIの学習経験がある。複数の人間利用者への一般化や速度改善は主張しない。

必須範囲は「異なる題材の引継ぎ」（予約/音楽）と「派生モデルで同じ問いを再検討」（音楽v2）。予約v2も追加で試したが、前担当は手順DLのpath取得待機から再開後にブラウザ接続不可となった。[新しい独立担当](tickets-reconsider-extra.md) は生成手順を参照して予約v2の変更/取り消しをUI操作で観測したが、保存実体の確認は未了。この追加ケースは受入根拠に含めない。AGENTSの作業方針再評価に従い、継続・追加確認の打切り・方式変更を比較し、実装の新しい反例ではなく追加確認の範囲だったため、既存の必須条件を縮小せずここで区切った。独立レビューでも、#23に各題材すべてで派生まで要求する文言がないことを確認した。

## 境界

保存通知の「N操作」は既存表示のままで、種類別件数/保存範囲/版対応の通知整理は #24 に残る。モデルのmetadataが変われば厳密replayで拒否される契約も維持する。検討手順は自動対応付け・機械的な版越え再生ではない。#27の最後の統合利用評価や#24/#28/#25の実装は含めない。

音楽HTMLのcheckerは意図したsingleton共有値のshow書換えにW106を出した。構文/参照errorは0。受取人の初回撮影では内側スクロールによりプレイヤーが画像に写らず、通常スクロール後は画像とAXの両方で確認できた。内容喪失の不具合としては扱っていない。
