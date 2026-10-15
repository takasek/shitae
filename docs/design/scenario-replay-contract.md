# #11: モデル版付きシナリオの保存・照合・再生

2026-10-15に設計者が方針を承認し、formatVersion 1として実装した契約。調査基準は main の `da4457a229aba9a80004fae0e611f68d7827ef56`（[PR #20](https://github.com/takasek/shitae/pull/20) のマージ）。言語仕様・実行意味は変更しない。[設計時の独立レビュー](evidence/scenario-replay-design-review.md) と [実装の受入・レビュー記録](scenario-replay-acceptance.md) を分けて記録する。

## 1. 事実確認と残った目的

[#8](https://github.com/takasek/shitae/issues/8) と [#18](https://github.com/takasek/shitae/issues/18) は completed、PR #20 は merged。[#12](https://github.com/takasek/shitae/issues/12) の表示も同PRに含まれ、[受入記録](session-acceptance.md) と最終表示修正・[独立レビュー](evidence/independent-review.md) が対応する。今回、#12に版固定の根拠を紐付けて completed とした。過去のブラウザ確認を今回の再操作とは扱わない。

共通Sessionは同一processでの操作・照会、手動試験値、結果ごとのsnapshot、seekとghostを既に持つ。一方、[残件](session-acceptance.md#残件と完了の範囲) に、process終了後・別作業者への引継ぎには生JSON・DOM・画像を別保存したと明記されている。[#11](https://github.com/takasek/shitae/issues/11) の不足はこの保存・復帰であり、別の実行エンジンは要らない。

目標は「保存済みモデルで操作 → シナリオ保存 → process終了 → 別processで同じモデルとシナリオを読込 → 同じ経路・状態を再現」。モデル一式は別に渡し、sidecarが照合する。モデル本文・DOM・画像の梱包は初版に含めない。

## 2. 保存方式の比較と推奨

| 方式 | 得られるものと不足 | 判断 |
| --- | --- | --- |
| 最終snapshotだけ保存 | 現在状態は復元できても、選択操作・分岐・途中経路の再現を証明できない。内部状態形式を永続APIにする | 採用しない |
| 現在のtimelineから操作を逆算 | reset前・分岐で捨てた未来・観測点のない受理操作が失われる。結果ラベルから元操作を一意に戻せない | 採用しない |
| 受理コマンドのjournalと観測照合値を保存し、初期状態から再実行 | 既存Sessionのdispatch／setTestVariant／reset／seekを使い、経路も照合できる。巻戻しの足跡も記録が必要 | 推奨 |

記録はSession生成時から開始し、GUIとCLIの共通境界に置く。旧版のhistory/JSON応答だけから完全なシナリオへ変換できるとはしない。記録開始前の状態を途中から取り込む機能は初版に含めない。

## 3. 保存物と版の契約

一つのUTF-8 JSONファイル `<任意名>.scenario.json` とする。既存の `<basename>.simconfig.json` はgraph.split用のまま。[ADR-0023](../adr/0023-simulator-timeline-and-graph-granularity.md) の設定を実行シナリオに混ぜない。

| 項目 | 内容 |
| --- | --- |
| `format` / `formatVersion` | `shitae-scenario` / `1`。未知版は拒否。自動migrationをしない |
| `protocolVersion` | 記録・再生に使うSession protocol版（現在1） |
| `model` | 既存metadataの `engineVersion / modelId / entryModule / sourceBasis / manifest`。manifestはfileを除き、moduleとsourceSha256を保存 |
| `initialDigest` | 起動直後の正規化観測値のSHA-256 |
| `steps` | 連番1からの受理コマンドと、実行後・生成観測点・出力の照合値 |
| `final` | 最終の正規化現在状態とdigest、保持timelineとcursorの対応を含む照合値 |

`engineVersion` はpackageの表示versionではなく、既存buildのsource・lockfile等による識別値を使う。`modelId` にはengineも含まれるため、engine不一致を先に報告し、同じengineならentry・sourceBasis・全参照moduleのhashとmodelIdを照合する。import先だけの変更も不一致。改行・空白だけのモデル変更もsource bytesが違えば拒否する。

初版のexport/importは `sourceBasis:"source-bytes"` と完全なmetadataを必須にする。metadataなし／AST hashのみのSessionは理由付きで非対応とする。CLIと通常の生成HTMLは既にこのmetadataを持つ。AST-onlyの利用を、source bytes同一性の保証へ昇格させない。

sourceの絶対file pathは保存しない。moduleとspanを照合し、再生環境のfile pathを診断時に付ける。配置ディレクトリが違っても正準module・entry・bytesが同じなら許可する。名前の変更やmodule集合の違いを補正しない。モデルの自動取得、sidecar内のpathを使ったファイル探索は行わない。

## 4. コマンドの永続表現

一時的なhandle、revision、operationId、observationId、branchの `b0` 等は永続識別子にしない。操作名や行番号だけで対応させない。同一モデル・engine・直前状態の下で次のdescriptorを**全項目完全一致**させ、現在の操作集合からちょうど一件を選ぶ。

### dispatch

DSL操作の `operation` は次を持つ。

- `kind:"interaction"`、`scope`、`host`（正準module・component・表示variant/null）。
- `placement` のroot・包含index path・配置source（module＋span、root配置ではnull）。同じ部品の複数配置とmain/overlayを区別する。
- 定義 `source`（module＋span）と、action AST・全results ASTの正規化SHA-256 `definitionDigest`。actionTextは説明表示に使えるが照合の代わりにしない。
- 選択 `branch` はnull、または完全なcondition labelとそのbranchに属する順序付きresult参照（resultIndex＋module＋span）。同じlabelの結果をまとめる現行Sessionの単位を使う。preludeもdefinitionDigestに含める。

定義は `query(action)` から取得する。実行時のenabled/gateはdescriptor自体に埋めず、候補の厳密照合後に再検査する。0件は操作不一致、複数件は曖昧として停止。類似名・最寄り行・候補配列indexへのfallbackを禁止する。モデル版固定のindex pathは識別条件の一部であり、モデル編集を跨ぐ安定IDとは呼ばない。

組込み戻るは `operation:{kind:"control",name:"back"}`、branch:null。DSLで書いたback操作とは区別する。どちらも再生直前に新しいhandleを取得する。branchも照合した現在候補の一時IDに変換して既存dispatchへ渡す。

### 手動試験・reset・seek

| kind | 永続データと意味 |
| --- | --- |
| `setTestVariant` | 正準module・component・variant。通常部品のcomponent単位試験値とsingleton共有値は既存Sessionが判定。対象・variant不一致は拒否 |
| `reset` | payloadなし。既存の初期化を再実行。実行timelineは消すが、シナリオjournalからはreset以前を消さない |
| `seek` | 対象のjournal内観測参照 `{step, observation}`。`step:0,observation:0` は起動。通常stepのobservationはそのコマンドが生成した観測点の0始まり順序。resetも一件生成、seek自体は生成しない |

再生時にjournal内観測参照→その新SessionのobservationIdの対応表を作る。各resultIndexだけでは診断等の複数観測点を区別できないため、実際の生成順序を使う。resetで旧参照を無効化し、ghost破棄時は捨てた参照を無効化する。過去stepを指していても、その時点で保持されていない観測へのseekは拒否する。前方参照は禁止。

seek・resetはGUI/内部APIで実現済み。公開CLIで任意seekを提供することは、この設計の前提にしない。再生器が同じ内部APIを使う。

受理されたno-opも一stepとする。拒否されたcommand、query、export、表示checkbox、fold/focus、graph設定は記録しない。拒否された操作を成功経路へ混ぜない。記録処理の失敗時は不完全なjournalをexport可能にせず、明示エラーにする。

## 5. 結果途中・ghost・resetを保存する規則

dispatchは既存どおりprelude＋選択branchを最後まで実行する。一操作の結果途中へ戻るときは、その後にseek stepを記録する。再生でもdispatchを完了してからseekする。元操作の未消化resultを自動再開する仕組みは追加しない。

例として「step1が生成した2番目の観測点まで巻戻し → 別操作」は `dispatch(1), seek({step:1,observation:1}), dispatch(3)` と残す。step3でSessionのghostが捨てられても、journalのstep1は残る。最終timelineだけからこの経路を復元しない。

保存時にcursorが途中で未来がghostのままでも、journal末尾のseekと保持timelineから同じ状態へ戻す。無観測no-op／拒否でghostを捨てないという現行規則を保持する。resetはtimelineを消すがjournalには残り、再生はその前も順に検証する。

この保存には探索中に放棄した経路やreset前のeffect文字列も含まれる。現在timelineだけのexportとは表示しない。初版にjournalの編集・圧縮・部分export・複数分岐scenario管理を追加しない。

## 6. 正規化と照合の範囲

hash入力はformatVersion 1が定めるJSON正規化を使う。object keyを再帰的にUTF-16 code unit昇順に並べ、後述の集合配列を整列してから、その他の配列順序を維持する。文字列はUnicode正規化・trimをせず、UTF-8のcompact JSONに対するSHA-256（小文字hex）とする。有限数・null・boolean・string・array・objectだけを許可し、undefined/NaN等を拒否する。schemaの未知field・欠落・不正参照も拒否する。Map/Setは定めた配列へ投影してから正規化する。

StateViewの `componentValues / sharedVariants / testVariants / gateTargets` とmodelのmanifestは集合として扱い、正準module・component（manifestはmoduleのみ）の組を同じ文字列比較で整列する。重複キーは拒否する。これらはdocumentsのMap挿入順に依存して公開されるが、既存modelIdはその順序を含まないためである。timeline・frame/stack・activePath・overlay・包含/配置・result・branch・操作候補は意味のある順序を保持する。同じsource bytesの準備済みモデルでdocumentsのMapだけを逆順にしても、初期digestと再生結果が一致することを反例に加える。

比較対象は次の閉じた投影とし、query応答全体をそのままhashしない。

- 現在地とStateViewの全意味値：保持frame木（中断frameを含む）、stack、親子・session・barrier、activePath、overlay、singleton、通常試験値、scope/origin、包含とgate対象。frame IDとnextFrameIdは既存の決定的な値を維持して比較する。
- 現在の操作候補：handleを除いたdescriptor、branch、enabled/gateと組込み戻るのenabled/reason。操作一覧の順序は維持する。sourceはすべてfileを除きmodule/spanへ投影する。
- timeline：保持される観測の順序、journal内観測参照、所属step、kind/label/result参照、location、ghost、cursor。生のobservationId/operationIdはjournal参照に置換する。

各stepに実行後の上記投影の `afterDigest`、新たに生成した各観測の `viewDigest`（その瞬間のstate/actions/location）、出力の `output` と `outputDigest` を持つ。outputはreceiptの `{effects, diagnostics, changed}` を順序付きで投影し、Session固有IDは含めない。自由文effect・診断の本文とresult参照も保存する。receiptのないreset/seekのoutputはnull、起動はinitialDigestと起動観測として扱う。outputDigestはこのoutputの正規化hashとする。finalには最後の現在状態投影も保存して照合結果を説明できるようにし、各stepの全文snapshotは保存しない。

最初はinitialDigestを照合し、各step後に生成観測数・全viewDigest・outputDigest・afterDigest、最後にfinalを照合する。step NのbeforeはinitialまたはN-1の検証済みafterである。直前stateが違うのに、たまたま同名操作が存在するだけで続けない。viewDigestは生成時に記録し、後でghostが捨てられても失わない。

これは記録値との自動同値照合であり、利用者が存在/不在・戻り先などを書く期待値DSLではない。最終DOM文字列・画像pixel・focus・foldの一致はこの同値条件に含めない。自由文effectは再生結果の文字列であり、実ファイル保存・外部I/O・focus移動の成功を表さない。再生でも外部動作を発火しない。

## 7. 読込・失敗・公開の境界

1. JSONとschema、連番・観測参照を検証する。未知format/versionや不完全ファイルを拒否する。
2. 利用者が別途指定したローカルモデルを通常loaderで読み、engine・全metadataを厳密照合する。現GUI/CLIのlive Sessionは変更しない。
3. 同じ準備済みモデルから隔離した新Sessionを生成する。initialDigestを検証する。
4. 各stepの操作descriptor/branch/試験対象/観測参照を照合し、その新Sessionのcommandへ変換して実行する。受理時だけ再生journalへ記録し、結果を比較する。
5. 全stepとfinal一致後だけ、新SessionをGUIの表示対象／CLIの継続操作対象として公開する。以後の操作は再構成したjournalへ追記する。再exportしたシナリオの実行契約部分は元と同じになる。

不一致では最初の失敗step・分類・期待/実際の識別情報またはdigestを返す。分類はformat不正、engine不一致、model不一致、候補なし／曖昧、branch不一致、disabled、観測参照不正、観測/出力/最終状態不一致。source差はmodule別hashで示す。候補類似度で修復せず、失敗step以降は実行しない。

結果照合で失敗するまで隔離Session内では前のstepを実行済みだが、失敗Sessionは公開・継続・保存の対象にしない。再生effectも検証結果が成功するまで通常のlive実行出力として表示しない。既存Sessionの状態・履歴・revision・handleは成功失敗とも変更しない。成功後の切替時に旧画面のhandleを持ち越さない。

exportは一コマンドの途中で割り込まず、直前commandの完了点を保存する。CLIの通常JSON応答にはjournal全量を混ぜず明示exportで返す。CLI応答の `scenario` をファイルへ保存するのは呼出clientの責務で、直接書くclientは同一directoryの一時ファイルへ完全に書いた後に置換し、失敗時は既存ファイルを保つ。GUIでは完全なJSONからの明示ダウンロード＋ファイル選択を入口とし、既存simconfig保存とボタン/保存先を区別する。自動上書き・クラウド送信を追加しない。

## 8. 実装の入口

`exportScenario()` と `replayScenario(...)` は非同期APIで、呼出側はawaitする。SHA-256はNode/ブラウザ共通のWebCryptoを使う。既存commandは同期のまま観測値を取り込み、export時にはその呼出境界までのhash完了を待つ。[使い方](session-usage.md#シナリオの保存と別processでの再生) に公開CLI/GUIの入口を記載する。

1. Session共通境界に `exportScenario()` と、準備済みモデル＋保存物から新Sessionを返す `replayScenario(...)` を追加する。journal・descriptor・投影は一か所が所有し、runtime reducerは再利用する。
2. CLIは明示export要求と `session <model> --replay <scenario>` の起動入口を追加する。replay成功後だけ通常JSON Linesを受け付け、失敗はstderr＋非0終了。新processでの実受入を先に通す。
3. GUIはシナリオ保存/読込と照合結果表示を接続する。生成HTMLにある同じモデルmetadataで照合し、成功時だけSessionを切り替える。自己完結HTMLを維持し、CLIと同じ保存物を往復できることを確認する。

productionコードは以下の失敗テストを先に作ってから実装する。各論理変更をgreenにして分ける。別agentに要件・最終差分・一次資料を渡し、実装会話を引き継がない独立レビューを行う。SPECへの転記、実行意味変更、新しい期待値構文は不要。

## 9. 受入と反例

| ID | 操作／反例 | 合格条件 |
| --- | --- | --- |
| R01 | 保存済みSol/Astraモデルで操作・分岐選択・保存、process Aを終了しprocess Bで読込 | 全stepの観測・現在地・frame木・値/由来・操作/gateとfinalが一致。Aのhandleを再利用しない |
| R02 | 別directory/別作業者に同じモデル一式とsidecarを渡す。準備済みdocumentsのMap挿入順だけを逆転する | 正準moduleとbytes一致なら成功。絶対path差・集合の列挙順差で拒否しない |
| R03 | entry/import先の1byte変更、module不足、engineだけ変更、AST-only metadata | 個別理由で再生前に拒否。live Sessionのstate/history/revision/handleは不変 |
| R04 | 同名操作、複数包含配置、main/overlay、外側上書き、同名component別module | 正しい一候補だけに束縛。descriptor改変の0件/複数件を拒否。名前/index fallbackでは通らない |
| R05 | branch欠落・別label・result参照改変、disabled gate | prelude/effect前に拒否。選択条件を自動評価しない |
| R06 | singleton手動 → DSL set → seek、通常部品試験とoverlay/frameの異なるvariant | scope/originと共有性が一致。試験値を個別instance値として復元しない |
| R07 | 多結果dispatchの途中へseek、ghostへredo、途中から別操作、reset、無観測no-op | 同じcursor/ghost/保持timeline。reset前・捨てた未来もjournal再生で検証。破棄済/前方/無観測stepへのseekは拒否 |
| R08 | 最終locationは同じだが途中観測・中断frame・effect/diagnostic・由来が異なる保存物 | 最初の異なるstepで拒否。final一致だけで成功にしない |
| R09 | 不正JSON/未知版/未知field/欠落/打切り、保存失敗、途中再生失敗 | 明示失敗・既存保存物/live Session保持・失敗Session非公開。黙った部分成功なし |
| R10 | CLIで保存→GUI読込、GUIでseek/手動試験→保存→別CLI、読込後に操作し再保存 | 同じ契約で往復。通常応答の増大なし。query/export/表示設定がjournalを変えない |
| R11 | 実ブラウザで保存・新規HTML読込・ファイル選択・成功/不一致表示・継続操作 | VM/DOM mockとは別に記録。ブラウザで保存物を渡せることを確認し、実I/O成功と混同しない |

R01が中心受入。保存物・モデルhash・engine・両processの終了/起動と比較結果を残す。R04–R08にはSPECに基づき再生実装から独立に定めた状態期待を併用し、記録と再生が同じバグを持つだけの一致を正しさとしない。既存のruntime/Session受入を再利用し、変更した境界の反例を追加する。

## 10. 採用した方針と対象外

採用したのは、(a) source bytesとengineの完全一致を要求するローカルsidecar、(b) snapshot復元ではなく受理コマンドの初期状態からの再生、(c) 結果途中・ghost・reset前も含むjournal、(d) 不一致時は停止して新Sessionを公開しない方式、の四点。

daemon/MCP、別のruntime、条件の自動評価、期待値DSL、版migration、シナリオ編集UI、モデル自動取得、クラウド保存、実I/O、DOM/画像の同梱、fold/focus/表示設定の永続化、汎用デバッガは対象外。

## 一次資料

- [Sessionの型・操作列挙・履歴・コマンド](../../packages/session/src/index.ts)、[StateView](../../packages/session/src/views.ts)：handleはSession UUID/revisionに依存し、resetでtimelineを消し、observe時にghostを破棄する。
- [metadata生成](../../packages/session/src/model.ts)、[engine生成](../../packages/session/scripts/build-engine.mjs)、[CLI loader](../../packages/cli/src/model.ts)：sourceBasis、全module、正準module、engineを含む既存identityを使用する。
- [CLI protocol](../../packages/cli/src/session.ts)、[使い方](session-usage.md)：公開commandはquery/dispatch/reset/setTestVariant/exportScenario。読込はsessionの起動引数で行う。公開seekは追加していない。
- [共通Sessionの契約](session-contract.md)、[受入と残件](session-acceptance.md)、[実ブラウザ評価](session-browser-evaluation.md)：既存機能と保存・引継ぎに残る不足を区別する。
