# 操作来歴の照会と検討手順

Issue [#23](https://github.com/takasek/shitae/issues/23) の読取用 API。既存の実行エンジン、`history`、`StateView`、scenario formatVersion/protocolVersion 1 と digest 投影は維持する。表示情報は記録時に別に保持し、同じモデルでの replay でも再構成する。処理系ソースの変更により engineVersion は更新されるため、旧 engine の scenario を新 engine で再生できるという意味ではない。

## CLI とライブラリ

既定 query と dispatch の応答量は変えない。必要な情報を明示選択する。次の JSON Lines は同じ `shitae session <file>` process に送る。

```json
{"id":"counts","command":"query","select":["provenanceSummary"]}
{"id":"page","command":"query","select":["provenance"],"provenance":{"limit":20}}
{"id":"detail","command":"query","select":["provenanceStep"],"step":1}
{"id":"readable","command":"query","select":["review"]}
```

| select | 応答の内容 |
| --- | --- |
| `provenanceSummary` | 利用可否・理由、dispatch/seek/reset/setTestVariant 別の記録件数、結果件数、区分別観測点件数、現在地の所属操作・結果位置・観測順序 |
| `provenance` | 結果本文と観測点列を含めない記録一覧。既定20件・最大100件。`nextAfter` が null でなければ次の `provenance.after` に渡す。step は1始まりで増え、reset/破棄でも変えない |
| `provenanceStep` | 一つの記録の操作名・条件・host/配置、実行順の結果、各結果の観測点、巻戻し前の位置 `from` と移動先 `target`、破棄した観測参照 |
| `review` | 表示・保存に使える `text`。操作・条件・結果・現在地・巻戻し先・破棄範囲を時系列で記述する |

ライブラリも同じ `session.query({select, provenance, step})` を使う。観測点の `ref:{step, observation}` は scenario journal と同じ0始まりの観測参照。起動点は `{step:0, observation:0}`、reset後の起動点は reset 記録に属する。`resultPosition` は選択後の実行結果列内の0始まり位置、`resultIndex` は元の定義内の位置。`ordinal` は一結果内の0始まり観測順序（結果に属さない手動試験/resetでは記録内の順序）。表示は1始まりにする。

観測点の `status` は、保持中でcursorまでの `retained`、保持中でcursorより後の `ghost`、破棄/reset前でjournalにだけ残る `discarded`。結果・操作は観測点を集計した `counts` を返し、複数区分を一種類へ潰さない。`discarded` 配列はその記録で破棄した参照、`counts.discarded` はその記録に属し現在破棄されている観測点数で、意味が異なる。

`seekable` は現在保持中の点だけ true。`completionObservationId` は記録が生成した最後の観測点が保持中の場合だけ ID を返す。無観測 no-op や seek に完了点を作らず、操作完了後にその点が破棄されれば null にする。観測なしの結果は結果列には残る。CLI に seek command は追加しない。

metadataなし／sourceBasisがASTのライブラリ利用では、summary/page/reviewに `available:false` と理由を返す。空の完全な記録と解釈しない。detailは `SCENARIO_UNSUPPORTED` で拒否する。不明step、無効なページ指定、選択と対応しないオプションは `INVALID_REQUEST`。返値の変更はSessionに伝わらない。

## GUI

「操作来歴（統合ログ）」は新しい記録が上。操作名・条件・host/配置・結果数・観測点数を見出しとして表示し、展開すると各結果と観測点を読める。観測点は結果内の順序を付け、途中と完了点を区別する。保持中の観測点とghostだけを選んで移動できる。破棄経路は要約とマーカーで表示し、操作可能な履歴として復元しない。source-byte metadataがない生成HTMLでは利用不可の理由と既存timelineを表示する。

「検討手順を表示」で本文を選択・コピーでき、「検討手順を書出し」で `<entry>.review.txt` を保存できる。表示・展開・イベント表示の切替・書出しはSession/revision/journalを変更しない。読み込んだscenarioも同じ表示を使う。

「イベントを表示」をオフにすると現在点以外のイベント移動ボタンを隠す。操作見出しや結果数は残し、記録全体が消えたように見せない。現在のイベント観測点は現在地として表示する。

手順は変更後モデルで人が選び直すための参照で、自動migrationや版をまたぐ意味の保証ではない。目的・問い・期待は利用者が指定し、操作名や条件・結果が変わればモデルと照合して選び直す。保存前/読込後の版情報・不一致診断・保存通知の種類別件数は [保存物と版の対応付け](scenario-artifact-identity.md) を参照。

受入証拠と未検証範囲は [検証記録](evidence/provenance/acceptance.md) を参照。
