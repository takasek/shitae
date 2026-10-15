# Session CLI: 最初の一往復

本書は commit `0d0d814` 時点の最初の区切りの記録。現在の機能と検証範囲は [実装版の使い方](session-usage.md) を参照。

2026-10-14。Issue #18 の承認済み [契約](session-contract.md) を段階実装する最初の区切り。共通 Session と runtime を使い、「操作一覧の照会 → 分岐を選んで実行 → 現在地の確認」を同じ process で実行できる。GUI 接続と残りの query/command は後続段階であり、Issue #18 全体の完了を表さない。

## 使用方法

workspace を build した後に、次を起動する。

```bash
node packages/cli/dist/index.js session docs/design/session-fixtures/roundtrip.shitae
```

stdin/stdout は JSON Lines。最初に次の一行を送る。起動時には stdout に prompt や通知を出さない。

```json
{"id":"a1","command":"query","select":["actions"]}
```

返った `data.actions.items` から `actionText: "購入する"` の操作と、その `branches` から `label: "成功"` の分岐を選ぶ。返った handle と branch ID を次の dispatch に使う。handle は同じ process 内で取得したものを使い、別 process の実演記録から転記しない。

```json
{"id":"d1","command":"dispatch","handle":"<今回の照会で取得した handle>","branch":"<成功分岐の ID>"}
{"id":"q1","command":"query"}
```

dispatch が返す summary の現在地は `完了` になり、最後の query も同じ現在地を返す。dispatch 応答に全状態・操作一覧・履歴を添えない。受理された dispatch の後は revision が更新されるので、次の操作の handle は actions query で取り直す。EOF で応答の write を完了して終了する。処理中の入力は行順に受け付け、条件を自動評価しない。

実測した全 request/response は [cli-roundtrip-v1.json](evidence/cli-roundtrip-v1.json)。この記録の handle は記録した Session だけのもの。改行込み UTF-8 の出力量は操作一覧 1,471 bytes、dispatch 335 bytes、summary query 206 bytes。これはこのモデルとファイルパスでの実測であり、全モデルの上限ではない。

## 現在の出力形

通常 response は `id / ok / protocolVersion / revision / summary`。dispatch は今回の `receipt` を追加する。拒否 response は `id / ok / protocolVersion / error / revision`。JSON 構文/型/余分な request field の不正は `INVALID_REQUEST`、この段階にない command は `UNKNOWN_COMMAND` とし、process を継続する。

| 項目 | 現在の形 |
| --- | --- |
| `summary` | `location`（module/component/表示 variant）、cursor/latest の観測点 ID、保持観測点数 |
| `data.actions.items[]` | handle、構造化 action、actionText、scope、source、placement、host、enabled、gate、prelude、branches |
| `branches[]` | id、label、results の resultIndex/source。空配列なら branch を指定しない |
| `placement` | root（本体 `main` または `overlay:<component>`）、包含 element index の path、配置 source。定義 source と区別する |
| `data.actions.controls.back` | 組込み戻るの handle、kind、source:null、enabled、reason。モデルに back interaction がなくても使える |
| `receipt` | operationId、前後で変わった領域名、今回の観測点 count/firstId/lastId、今回の effects/diagnostics |
| `effects[]` | resultIndex/source/text。自由文の記録であり実 I/O は行わない |
| `diagnostics[]` | resultIndex/source/diagnostic（runtime の severity/code/message/span） |

現段階の gate は `kind / enabled / unresolved`。手動値の scope/origin と gate 試験値は後続で接続する。操作にはアクティブ component/document common、掲示中 overlay、包含部品の有効な操作を列挙する。shadow、外側上書き、gate は Session 内で解決する。source は AST の span を保持し、提供された実ファイルパスを付ける。

分岐の欠落/誤指定・無効 gate・未知/別 Session/古い handle は prelude より前に拒否し、state/history/effect/revision/operation counter を変えない。受理された no-op は revision/operation ID を更新し、診断のない transition no-op は観測点を追加しない。query は実行状態を変更しない。

## 検証と後続範囲

実装前に runtime の二反例、Session の入口、CLI の四ケースを Red で確認した。Astra の独立レビューで外側上書きの二反例が見つかり、それぞれを Red にしてから修正した。レビュー後の回帰は Session 9 件、CLI 23 件（うち新規 Session 4 件）が成功。全体テスト/typecheck と TDD の根拠は [first-slice-validation.json](evidence/first-slice-validation.json)、独立レビューの結果は [independent-review.md](evidence/independent-review.md) に記録する。

この区切りで公開している command は query と dispatch、select は省略/空配列または actions のみ。state/metadata/history/observation query、reset、setTestVariant、seek、モデル同一性/全参照ファイルの正準化、gate 試験値と値の由来、GUI 接続、#12 の表示、実ブラウザ、保存済みモデルの再ドッグフーディングは後続段階。未接続の select は `INVALID_REQUEST` として明示的に拒否し、全契約が実装済みとは扱わない。
