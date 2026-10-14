# 共通 Session の使い方と実装状況

Issue #18 の実装版。CLI と生成 GUI は同じ Session/runtime を使う。状態遷移、実効操作、gate、手動試験値、結果ごとの観測点と復元は Session が担当し、GUI は照会結果を描画する。build 時の通常 bundle を埋め込み、配布は自己完結 HTML 一枚を維持した。

## CLI

```sh
pnpm build
node packages/cli/dist/index.js session docs/design/session-fixtures/trial-values.shitae
```

同じ process の stdin に一行ずつ送る。stdout は request ごとに一行の JSON、起動エラーは stderr、EOF で終了する。最初の query は操作を選ぶために使う。

```json
{"id":"a1","command":"query","select":["actions"]}
```

返された `data.actions.items` の handle と、必要な場合は `branches` の ID を選び、dispatch へ渡す。条件ラベルを自動評価しない。

```json
{"id":"d1","command":"dispatch","handle":"query で得た handle","branch":"b0"}
{"id":"q1","command":"query"}
```

dispatch は summary と今回の receipt、既定 query は summary だけを返す。受理された操作の後は新しい actions query で handle を取り直す。全状態や履歴を毎回受信する必要はない。[最初の実測往復](evidence/cli-roundtrip-v1.json) は同一 process の実際の request/response を記録したもの。

詳細が必要なときだけ select に追加する。複数項目は一度に照会できる。

```json
{"id":"s1","command":"query","select":["state","actions","metadata"]}
{"id":"h1","command":"query","select":["history"],"history":{"operationId":1,"limit":2}}
{"id":"o1","command":"query","select":["observation"],"observationId":2}
```

history は既定20件、最大100件。`nextAfter` が null でなければ、その ID を次の history query の `after` に渡す。operationId は今回の receipt から得る。observation はその結果直後の state と handle を含まない actions を返し、現在状態を変えない。ID は手元の response から選ぶ。上の ID は形式の説明用で、別の Session での存在を保証しない。

member gate の定義済み試験対象は、state の `gateTargets` を照会して選ぶ。

```json
{"id":"t1","command":"setTestVariant","module":"trial-values","component":"Card","variant":"Ready"}
{"id":"r1","command":"reset"}
```

通常 Card の試験値は包含と member gate に作用し、frame と overlay の実値は上書きしない。singleton の試験値は共有値に作用する。値の scope と origin は state に明記し、DSL の同値書込みでも由来を DSL へ更新する。reset は初期状態と履歴に戻す。seek は GUI・内部 API 専用で、CLI command には公開しない。CLI でも保持中の ghost と結果途中を read-only で照会できる。

## GUI

```sh
node packages/cli/dist/index.js simulate docs/design/session-fixtures/trial-values.shitae > trial-values.html
```

生成 HTML に Session/runtime を埋め込み、外部 script や CDN を参照しない。既存の画面・包含・overlay・統合ログ・gate drawer・stack・map を維持した。組込み「戻る」も照会された handle を dispatch する。統合ログのクリックは Session.seek、試験用 select は setTestVariant、「初期状態へ」は reset に接続する。

「部品の状態を表示」は既定 off。on にすると参照先、variant、共有／画面／掲示／包含／部品試験の範囲と、初期／DSL／手動試験の由来を表示する。未定義参照と inline に架空の variant を付けない。切替は実行状態・履歴を変えず、包含の折畳みと対象 control の focus を保持する。古い描画から遅れて届いた操作は、描画時に保持した handle で拒否する。

CLI が生成する GUI と CLI Session の metadata は同一。engineVersion は共通エンジンの source・lockfile・生成手順等から build 時に生成し、modelId は全参照 source の bytes と正準 module ID、entry、protocol、engine を含む。同じ実ファイルの別 alias は合流し、別ファイルの basename は合流しない。source path 自体は modelId に含めない。

ライブラリから `toSimulator` に AST だけを渡す場合は、source bytes を復元できないため `sourceBasis:"ast"` と明示して AST の hash を使う。CLI の source-byte ID と同一だと扱わない。source-byte identity を持たせる場合は第4引数に `{files, metadata}` を渡す。Session の直接生成では metadata は準備側が渡し、省略時の metadata query は null を返す。CLI と通常の生成 GUI は常に準備済み metadata を渡す。

## 検証済みの範囲と残件

[回帰記録](evidence/session-regression.json) は6ケース54手順、描画された実 onclick 48件、意図した拒否2件、結果途中70観測点を公開 CLI と生成 GUI で照合した。history の全ページを読み、GUI で同じ観測点へ seek した state/actions と比較している。保存済み Sol/Astra の current/proposed の4モデルは変更していない。固定された試験シナリオによる機能回帰であり、利用者の探索時間・モデル参照回数・理解改善を測ったものではない。

旧 GUI（commit `0d0d814`）との34手順の現在地・アクティブ経路比較は一致した。契約 fixture の present を挟む switch は、旧線形近似 `[Entry,Home,Detail,B,Modal,C]` から SPEC の `[Entry,Home,Detail,C]` へ変わることを別記録した。非アクティブ subtree の破棄と resume は固定期待の Session/runtime テストで検証している。旧 GUI には保持 frame 木の表現がないため、旧版との比較を全 frame 同値の証拠にはしていない。

通常応答の UTF-8 bytes（改行込み）の実測は次のとおり。今回の自由文 effect／診断の量や ID の桁数による増加まで、一定サイズとは保証しない。

| 条件 | module | 包含 | frame（中断） | 履歴 | dispatch | 既定 query |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 小 | 1 | 0 | 1（0） | 2 | 325 | 196 |
| 大 | 31 | 330 | 101（99） | 103 | 341 | 206 |

[検証記録](evidence/session-validation.json) と [Astra 独立レビュー](evidence/independent-review.md) に TDD・再検証・修正の根拠を残した。全730テスト、build、typecheck が成功。GUI の実行コードを VM で動かす検証と、DOM mock による focus/fold 検証を、実ブラウザ確認と区別している。

未完了は G02（実ブラウザでの配布・表示操作）、G03 の実ブラウザ keyboard/focus/fold、および D02 の実ブラウザを含む利用評価。ブラウザツールが `file:` URL をポリシーで拒否したため、確認できたとは扱わない。外部ネットワーク不要の構成は生成物と VM で確認したが、実ブラウザの network 動作を観察したわけではない。自由文 effect に書かれた保存・focus などの実処理も行わない。

手元の HTML をブラウザで確認するときは、Card の包含を折り畳む→Tab/Space で状態表示を切り替える→checkbox の focus と折畳み維持を確認する。show-card と Card の手動試験値を変え、包含と overlay の独立表示、choose の分岐と結果途中の巻戻し、gate drawer、stack、map も確認する。この確認が残るため、Issue #18 全受入の完了とはしない。
