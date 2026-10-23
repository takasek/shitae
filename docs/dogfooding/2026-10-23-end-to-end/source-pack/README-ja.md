# shitae 深掘り追補の最小再現パック

対象製品: [0e49fc7e8bebf9b49c4533c2532ec0ee32037ad5](https://github.com/takasek/shitae/tree/0e49fc7e8bebf9b49c4533c2532ec0ee32037ad5)

このパックは架空の小モデルと二予約模型です。実サービスへの予約・通知・認証操作は行いません。製品修正パッチは含みません。全60ケースの実験一式ではなく、重要な反例と正常対照を選びました。

## 1 戻り先と診断を再検査する

必要なものはPython 3、Node.js、上のSHAを公式READMEに沿ってbuildしたshitaeです。以下はこのREADMEのあるディレクトリから実行します。

```bash
export SHITAE_CLI="/absolute/path/to/shitae/packages/cli/dist/index.js"
python3 minimal/run_minimal.py
```

**このスクリプトの成功条件は「仕様に適合すること」です。不具合が再現したら成功、というテストではありません。**

- SPEC_PASS: そのケースの小さな仕様assertionを満たした。
- SPEC_FAIL: 仕様assertionと違う。期待値と実値を行に表示する。
- 対象SHAでは既知の5ケースがSPEC_FAIL、正常対照8ケースがSPEC_PASSとなり、スクリプト全体の終了コードは1になります。修正後は該当5ケースもSPEC_PASSになるのが期待です。check自体の終了コードとは別です。
- 出力はminimal/runs/の新しい時刻ディレクトリに保存します。過去の記録やモデルは上書きしません。任意の出力先をSHITAE_OUTPUTで指定できますが、既存ディレクトリなら停止します。
- この配布スクリプトは公開CLIだけを使い、操作ごとに新しいhandleを照会します。全仕様・全操作の網羅テストではありません。

特定ケースだけなら末尾にディレクトリ名を付けます。

```bash
python3 minimal/run_minimal.py 49-qualified-back-collision 50-qualified-back-absent
```

| ケース | 仕様上の期待 | 対象SHAの観測 |
|---|---|---|
| 49 | back(a::Home)はa::Homeへ戻る | b::Homeへ誤って戻る |
| 50 | 未訪問b::Homeへのbackは動かない | a::Homeへ誤って戻る |
| 51 / 58 | 別素名／同じfileの別aliasは正しく戻る | 正常対照 |
| 19 | remote通常部品のcollectionは合法 | 無関係なlocal singletonに引かれE028 |
| 20 | remote singletonのcollectionはE028 | 見逃す |
| 25 / 26 / 27 | local要素と明示module行動対象は定義に従う | 正常対照 |
| 38 | document commonのsingleton明示variant showにもW106 | 状態はCleanに戻るがW106がない |
| 31 / 39 / 40 | component内ではW106、省略時と通常部品では警告不要 | 正常対照 |

backの暫定回避は、moduleをまたいでもcomponentの素名を一意にすることです（51が対照）。a::Homeのようにmodule修飾を付けるだけでは回避できません。恒久的な命名制約を推奨する意味ではありません。

49/50と19/20は旧SHA [604e19b7a1449739de2c3a3552f4baf8da18820b](https://github.com/takasek/shitae/tree/604e19b7a1449739de2c3a3552f4baf8da18820b) でも再現済みです。W106は旧版の定義・該当ソースがあることを確認しましたが、旧版で38を再実行した証拠はありません。

## 2 overlayは設計確認を伴う別枠

overlay-contract/には4例を分けました。ここは「素名slot共有」を意図したか設計確認が残るため、上の自動PASS/FAILには混ぜていません。

- 54-hide-unposted-module: a::Noticeだけを掲示し、未掲示b::Noticeをhideするとaが消えます。
- 58-overlay-source-lexical-hide: ShowB → ShowController → overlay内のHideLocal。a::Controllerのhide(Notice)でb::Noticeが消えます。a::Noticeは掲示していません。
- 55-overlay-alias-samefile-control: 同じfileの別aliasが同じoverlayを指す正常対照。
- 56-overlay-distinctname-control: 別素名のoverlayが共存する正常対照。

任意の例を生成してブラウザで操作できます。以下の出力先は新しく作り、既存HTMLを上書きしないでください。

```bash
node "$SHITAE_CLI" check overlay-contract/54-hide-unposted-module/main.shitae
node "$SHITAE_CLI" simulate overlay-contract/54-hide-unposted-module/main.shitae > overlay-example.html
```

解決済みmodule＋componentを同一性とするなら、未掲示の別moduleをhideしても既掲示分は消えないはずです。global slotを意図するなら、名前空間・lexical hideとの例外を仕様上で決着させる必要があります。新しいoverlay ID構文や修正パッチは同梱していません。

## 3 二予約模型の旧反例 修正 保守

各workshopディレクトリには、全11ソース、対応するsimulator.html、必要なscenarioがあります。HTMLはブラウザだけで開けますが、初期状態から始まります。保存記録を読み込んだ状態をHTMLへ埋め込んだものではありません。

- r2: 旧反例。stale-A.scenario.jsonは15操作のCLI記録。A遠隔確認を保留し、Aを現地破棄してBを始め、古いA確認を確定すると、B作業が残るのにBookingsの復帰索引が通常へ戻ります。
- r2_1: work.shitaeだけを修正。stale-A-blocked.scenario.jsonは対応するCLI修正確認。古い確定は無効で、B作業・存在行・復帰先を保持します。同じ予約・同じ起点の新世代を古い確認から破棄することは許す政策であり、世代固定の保護ではありません。
- r2_1/handoff-38-gui.scenario.json: 作者がGUIから実際に保存し、CLIで一致再生した38操作の中断地点です。その後の別読者の48操作地点のGUIファイルではありません。
- refactor_candidate: 4workflowの選択/reviewで重複した取消操作を、各file内の包含部品へ抽出。取消定義8→4、索引set92→84。11fileは維持し、行数は増えています。
- refactor_candidate/handoff-38-cli.scenario.json: CLIで新しく作った対応経路。GUI保存物ではありません。
- refactor_candidate/replayed-and-continued-cli.scenario.json: 別process再生後、acceptedで確定値を変えて継続したCLI保存記録です。

同じモデルと対応scenarioの再生例:

```bash
node "$SHITAE_CLI" session workshop/r2/main.shitae --replay workshop/r2/stale-A.scenario.json
```

起動したCLIの標準入力へ次の1行を入力すると公開状態と有効操作を照会できます。終了は標準入力のEOFです。

```json
{"id":"inspect","command":"query","select":["state","actions"]}
```

同じ方法でr2_1やrefactor_candidateの対応する組を使用します。元のr2_1/handoff-38-gui.scenario.jsonをrefactor_candidateへ渡すと、変更4moduleのMODEL_MISMATCHで拒否されるのが現行契約です。意味が同じでもsource bytesが変われば自動移行されません。scenarioのID・hash・handleを書き換えて回避しないでください。

GUIファイル読込はこの評価では未確認です。別読者によるライブ継続48操作地点と、保守候補11操作地点はChromeでダウンロード完了表示を確認しましたが、保存実体をCLIへ回収していません。それらと、ここに収めたCLI保存・再生成功を同一の証拠とは扱いません。

## 4 読む順と確認先

まず追補PDFの結論、戻り先指定back、古い確認の状態比較を読み、必要な例だけ再現してください。R0/R1の全模型、全60プローブ、評価用の大きな生ログは入れていません。

- [backとmodule](https://github.com/takasek/shitae/blob/0e49fc7e8bebf9b49c4533c2532ec0ee32037ad5/docs/SPEC.md#L525-L533)
- [名前空間](https://github.com/takasek/shitae/blob/0e49fc7e8bebf9b49c4533c2532ec0ee32037ad5/docs/SPEC.md#L630-L648)
- [E028とW106](https://github.com/takasek/shitae/blob/0e49fc7e8bebf9b49c4533c2532ec0ee32037ad5/docs/SPEC.md#L764-L775)
- [presence gate](https://github.com/takasek/shitae/blob/0e49fc7e8bebf9b49c4533c2532ec0ee32037ad5/docs/SPEC.md#L250-L265)

SHA256SUMS.txtは配布ファイルの内容確認用です。ソースは各凍結版からバイトを変えずコピーしています。スクリーンショット、製品repo、node_modules、評価者の内部連絡、承認情報は含めません。
