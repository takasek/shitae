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

dispatch は summary と今回の receipt、既定 query は summary だけを返す。受理された操作の後は新しい actions query で handle を取り直す。全状態や履歴を毎回受信する必要はない。[最初の実測往復](evidence/cli-roundtrip-v1.json) は縮小前の一覧形式の歴史的記録で、[現在の実測往復](evidence/compact-actions/roundtrip.json) は現在の一覧・一操作の詳細・実行・現在地確認を同一 process で記録している。

操作一覧の各項目は `handle / actionText / scope / placement / host / enabled / branches` だけを持つ。placement は root と path、branches は ID と表示ラベルだけ。AST、source、結果列、gate の詳細は送らない。必要な操作だけ handle を指定して読む。

```json
{"id":"x1","command":"query","select":["action"],"handle":"一覧で選んだ handle"}
```

`data.action` は元の定義 AST `definition`（全 results を含む）、source、gate、prelude と branch の結果参照を返す。照会は状態や handle を変えず、一覧からそのまま dispatch してもよい。無効操作の説明も読める。失効した handle は `STALE_HANDLE`、不明・別 Session の handle は `UNKNOWN_HANDLE`。組込み back の詳細は kind:"control"・enabled・reason・source:null で、DSL 定義を持たない。

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

操作名・条件・巻戻し・破棄済み経路を含む読取専用の照会と、変更後モデルで参照する手順の書出しは [操作来歴の使い方](session-provenance.md) を参照。

## シナリオの保存と別processでの再生

操作後、同じprocessへ明示exportを送る。

```json
{"id":"save","command":"exportScenario"}
```

成功応答の `scenario` 部分をUTF-8 JSONで `<任意名>.scenario.json` に保存する。応答外枠のid/ok/summary等は含めない。通常query/dispatch応答にはシナリオ全量を追加しない。既存ファイルへ保存するclientは一時ファイルへ完全に書いてから置換する。processを終了した後、同じモデル一式と保存物を指定して起動する。

```sh
node packages/cli/dist/index.js session docs/design/session-fixtures/trial-values.shitae --replay trial-values.scenario.json
```

起動中に全操作・分岐・観測・出力・最終状態を新Sessionで照合し、成功後に通常のJSON Linesを受け付ける。失敗はstderrと非0終了で伝え、部分的に再生したSessionでは操作を継続できない。再開後はactions queryで新しいhandleを得る。モデルを別directoryへ移せるが、entryの名前、参照moduleと全source bytes、engineVersionの一致が必要。空白だけのモデル変更も黙って補正しない。

GUIでは「シナリオを保存」で同じ形式をダウンロードし、「シナリオを読み込む」でファイルを選ぶ。読込失敗時は現在のSessionを保つ。成功時だけ新Sessionに切り替え、照合した操作数を表示する。読取開始から照合終了までは後続読込と実行操作を排他する。CLIで保存したものをGUIへ渡すことも、GUIで保存したものをCLIの起動へ渡すこともできる。

記録は起動からの受理操作、条件選択、手動試験、reset、結果途中のseekを含む。reset前や破棄したghostの経路も保存し、保存時のcursorとghostを再現する。query/拒否/表示設定は記録しない。DOM・画像・モデル本文は同梱せず、表示checkbox・fold/focus・graph設定は復元対象に含めない。自由文effectは保存やfocusの実処理にはならない。

ライブラリではsource-byte metadata付きの準備済みモデルを使い、両APIをawaitする。

```js
const saved = await session.exportScenario();
const restored = await replayScenario({ documents, entryModule, files, metadata }, saved);
```

metadataなし／AST-onlyのSessionでは `SCENARIO_UNSUPPORTED`。`replayScenario` が失敗した場合は新Sessionを返さない。[保存契約](scenario-replay-contract.md) と [process間・実ブラウザの受入記録](scenario-replay-acceptance.md) を参照。

## GUI

```sh
node packages/cli/dist/index.js simulate docs/design/session-fixtures/trial-values.shitae > trial-values.html
```

生成 HTML に Session/runtime を埋め込み、外部 script や CDN を参照しない。既存の画面・包含・overlay・統合ログ・gate drawer・stack・map を維持した。組込み「戻る」も照会された handle を dispatch する。統合ログのクリックは Session.seek、試験用 select は setTestVariant、「初期状態へ」は reset に接続する。

「部品の状態を表示」は既定 off。on にすると参照先、variant、共有／画面／掲示／包含／部品試験の範囲と、初期／DSL／手動試験の由来を表示する。未定義参照と inline に架空の variant を付けない。切替は実行状態・履歴を変えず、包含の折畳みと対象 control の focus を保持する。古い描画から遅れて届いた操作は、描画時に保持した handle で拒否する。

CLI が生成する GUI と CLI Session の metadata は同一。engineVersion は共通エンジンの source・lockfile・生成手順等から build 時に生成し、modelId は全参照 source の bytes と正準 module ID、entry、protocol、engine を含む。同じ実ファイルの別 alias は合流し、別ファイルの basename は合流しない。source path 自体は modelId に含めない。

ライブラリから `toSimulator` に AST だけを渡す場合は、source bytes を復元できないため `sourceBasis:"ast"` と明示して AST の hash を使う。CLI の source-byte ID と同一だと扱わない。source-byte identity を持たせる場合は第4引数に `{files, metadata}` を渡す。Session の直接生成では metadata は準備側が渡し、省略時の metadata query は null を返す。CLI と通常の生成 GUI は常に準備済み metadata を渡す。

## 検証済みの範囲

[回帰記録](evidence/session-regression.json) は6ケース54手順、描画された実 onclick 48件、意図した拒否2件、結果途中70観測点を公開 CLI と生成 GUI で照合した。history の全ページを読み、GUI で同じ観測点へ seek した state/actions と比較している。保存済み Sol/Astra の current/proposed の4モデルは変更していない。固定された試験シナリオによる機能回帰であり、利用者の探索時間・モデル参照回数・理解改善を測ったものではない。

旧 GUI（commit `0d0d814`）との34手順の現在地・アクティブ経路比較は一致した。契約 fixture の present を挟む switch は、旧線形近似 `[Entry,Home,Detail,B,Modal,C]` から SPEC の `[Entry,Home,Detail,C]` へ変わることを別記録した。非アクティブ subtree の破棄と resume は固定期待の Session/runtime テストで検証している。旧 GUI には保持 frame 木の表現がないため、旧版との比較を全 frame 同値の証拠にはしていない。

通常応答の UTF-8 bytes（改行込み）の実測は次のとおり。今回の自由文 effect／診断の量や ID の桁数による増加まで、一定サイズとは保証しない。

| 条件 | module | 包含 | frame（中断） | 履歴 | dispatch | 既定 query |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 小 | 1 | 0 | 1（0） | 2 | 325 | 196 |
| 大 | 31 | 330 | 101（99） | 103 | 341 | 206 |

[検証記録](evidence/session-validation.json) と [Astra 独立レビュー](evidence/independent-review.md) に TDD・再検証・修正の根拠を残した。全730テスト、build、typecheck が成功。GUI の実行コードを VM で動かす検証と、DOM mock による focus/fold 検証を、実ブラウザ確認と区別している。

その後、ユーザーの指定で一時ローカル HTTP サーバーを使い、G02/G03 の実ブラウザ操作と D02 の利用評価を完了した。[実ブラウザ確認と利用評価](session-browser-evaluation.md) に環境・手順・全入出力・画像・制限を記録した。8 HTMLを読み込み、サーバー終了後も操作が動き、観測資産に外部 URL はなかった。`file:` での開き方を確認したとは扱わない。自由文 effect に書かれた保存・focus などの実処理も行わない。

4モデルで35手順を実施し、34成功と意図した無効操作1件が CLI/GUI で対応した。その後の一覧縮小で、同じ114要求の再実行結果は一致し、一覧40回の出力は290,500から81,311 bytesへ約72%減った。詳細は必要時の一操作照会へ分けた。[一覧縮小の検証](session-compact-actions.md) に現在の形式と入出力を記録した。評価者はモデルを知る1 agentなので、時間短縮・理解改善は断定しない。以前の履歴ラベル修正後の対象267テストと、一覧縮小後の検証は別記録である。

手元で HTTP 経由で開く場合は、専用の一時ディレクトリに生成する。以下は起動後に表示 URL をブラウザで開き、確認が終わったら Ctrl-C でサーバーを終了する例。

```sh
preview_dir=$(mktemp -d)
node packages/cli/dist/index.js simulate docs/design/session-fixtures/trial-values.shitae > "$preview_dir/trial-values.html"
python3 -m http.server 8000 --bind 127.0.0.1 --directory "$preview_dir"
# ブラウザで http://127.0.0.1:8000/trial-values.html を開く
```
