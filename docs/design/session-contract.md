# Issue #18: 共通 Session の契約案

Status: proposed。2026-10-14、`origin/main` の固定版 `e985f4ee58ab76339df5b0f59144e1f1a5da91c8` を調査。これは実装前の契約案であり、実装済み API や新しい言語仕様ではない。[Issue #18](https://github.com/takasek/shitae/issues/18) の工程 1 を対象とする。設計確認後に TDD で Session、GUI 接続、CLI、#12 の表示、再評価へ進む。

## 判断を求める点

1. 初版 CLI は `shitae session <file>` の stdin/stdout JSON Lines とする。同じ process 内で query → dispatch → query を継続し、EOF で終了する。既存 `simulate` は自己完結 HTML の生成を維持する。
2. singleton の手動試験変更は共有値そのものへの書込みにする。別の override 層を置かず、後続の DSL 書込みが勝つ。通常 component の試験値は component 単位の模擬値として分離し、包含表示と member gate だけへ適用する。frame/overlay の実状態は変えない。
3. 操作・部品・配置・result の定義 module と source span を初版の必須情報にする。モデルへ戻る負担に直結するため。CLI は実ファイルパスも返し、直接 `toSimulator(documents, ...)` を呼ぶ場合はファイルパス未提供を `null` で表す。

runtime の兄弟規則には後述の不一致がある。推奨は SPEC の規則へ runtime と既存の矛盾するテストを修正すること。既存 runtime の結果を Session の独立期待値として流用しない。

## 責務と配置

- `@shitae/runtime`: 既存 reducer。frame 木、barrier、switch の中断・復帰、singleton、overlay の意味はここに一つだけ置く。
- 新しい `@shitae/session`: DOM/Node 非依存のモデル準備と Session。resolver の実効 body/shadow、包含解決、gate、分岐選択、result の順次実行、query、観測履歴を持つ。runtime → Session の依存は作らない。
- `@shitae/simulator`: Session の query を描画し command を呼ぶ。静的な遷移マップの準備と fold/focus/表示設定を担当する。現在の実行・gate・snapshot 処理は Session へ移す。
- `@shitae/cli`: ファイル読込、モデル同一性の計算、JSON Lines、process の寿命。Session に DOM や Node の API を入れない。

Session は `Document` の集合と entry module、モデル metadata を受け取る。extract の状態・操作データの準備を Session 側へ移し、simulator は Session と静的 graph データを消費する。共有処理のために Session → simulator の逆依存や循環依存を作らない。

自己完結 HTML には同じ Session/runtime の実装を build 時に bundle して埋め込む。ブラウザ内の import、CDN、daemon、通信は要求しない。CLI が使う実装と HTML に埋める実装は同じ source から生成し、手作業で写した JavaScript を残さない。表示のための純粋な整形関数は GUI に置けるが、variant/gate/実効操作の再解決は置けない。

## モデルの同一性と位置

モデル metadata は `engineVersion`、`modelId`、`entryModule`、全参照 module の manifest を持つ。manifest の各項目は正準 module ID、source の SHA-256、提供済みなら source path。CLI は読込済み source の bytes から hash を求める。`modelId` は protocol version、engine の build 識別子、entry、正準 ID 順に並べた全 module の source hash に対する SHA-256。単なる entry の hash や package の `0.0.1` だけにはしない。engine build 識別子は実装 source と lockfile を入力とする build 時の値とし、GUI/CLI の共通 bundle とともに生成する。

同じファイルを別 alias で import しても一つの正準 module として扱う。異なるファイルを basename だけで合流させない。現在の CLI loader は module 名を訪問済み key に使っているため、この保証に必要な loader の確認と修正も実装時の受入に含める。source path 自体は modelId の入力にせず、移動した同じモデルを識別できるようにする。正準 ID の割当ては entry からの相対ファイル位置を基準とし、同じモデルを別ディレクトリへ丸ごと移した場合は同じ ID とする。

位置情報は `{module, file, span}`。component/variant/interaction/result の**定義位置**と、包含 element の**配置位置**を区別する。alias は配置の名前であり、解決後 component 名や操作識別子に置き換えない。匿名 inline・未定義参照には component の定義位置を捏造しない。

Session はモデルを読込時に固定する。process 中のファイル変更は自動反映しない。初版に hot reload、保存モデルへの実行結果書戻し、永続 replay 識別子を追加しない。

## query の値と作用範囲

query は JSON 化できる detached value を返す。呼出し側が結果を書き換えても Session は変わらない。Map/Set は配列に変換する。query 自体は revision、状態、履歴を変えない。

最小の query は metadata、revision、現在地、全 frame 木、アクティブ経路、overlay、singleton 共有値、通常 component 試験値、現在表示する包含木、実効操作、組込み controls、履歴と cursor を返す。内部 snapshot 自体を公開 JSON に載せない。CLI の result response にも同じ query を添える。

各表示値は `variant` と二つの軸を持つ。`scope` は値の作用範囲、`origin` はその値を最後に設定した由来。`singleton` と初期値であることは別に返す。保存されていない null を表示時に initial variant へ解決するが、未定義 variant 名を initial へ置換しない。

| 対象 | scope | 値の取得と由来 |
| --- | --- | --- |
| 通常 component の frame stack 要素 | `frame-location` | 保存された variant または initial。`initial` / `dsl` |
| 通常 component の overlay | `overlay-entry` | show 時の variant または initial。`initial` / `dsl` |
| singleton の全所在 | `singleton-shared` | 正準 module + component の共有値。`initial` / `dsl` / `manual-test` |
| 通常 component の包含表示（試験値なし） | `inclusion-initial` | component の initial。`initial`。独立 instance の実状態を表さない |
| 通常 component の包含表示（試験値あり） | `component-test` | 正準 module + component の模擬値。`manual-test`。同 component の全包含配置へ効く |
| 通常 component の member gate | `component-test` または `inclusion-initial` | 上記の試験値または initial。frame/overlay の実状態から推測しない |

同じ通常 component が frame、overlay、包含に同時に存在する場合、frame と overlay はそれぞれの保存値、包含と member gate は component 試験値を読む。この差は query に明記する。通常 component の `goto` を component 試験値へ転記しない。新しい instance 状態エンジンや collection の各 item 状態は作らない。

frame 木の snapshot は歴史上の共有値を復元するために持つ。一方、現時点で singleton の各 Location が独自の variant を所有することはない。戻る/復帰/表示は常に現在の共有値に追随する。

包含木の node は表示名、配置 path、配置 source、解決後 module/component、component source、variant、singleton、scope/origin、子を持つ。path は本体または overlay の root と element index の列で、同じ component の複数配置を区別する。path は現在 revision 内の配置識別であり、永続 instance ID ではない。inline は箱と子だけ、未定義は参照名と未解決状態だけを返す。循環は経路上の同じ正準 component の再訪で打ち切り、循環表示を返す。

## 手動試験変更

Session command `setTestVariant({module, component, variant})` を GUI の gate select に接続する。対象はモデルが列挙した定義済み member gate 対象。variant はその component の定義済み variant とし、不明な対象・不正値は実行前に拒否する。DSL 由来のラフな未定義値を拒否する規則とは別である。

- singleton: runtime の共有レジストリを変更し、由来を `manual-test` にする。frame、overlay、包含、gate が全て追随する。
- 通常 component: Session の試験値 Map だけを変更する。包含と member gate が追随する。frame/overlay の値は変えない。
- 同じ値を再設定しても手動試験 event を一件記録する。由来の変更も snapshot に残す。
- singleton への後続の `set`/明示 nav/show は共有値と由来を `dsl` に更新する。同じ variant を書いても由来は更新する。省略 nav/show、back、variant 書込みを伴わない resume は手動値を上書きしない。
- `seek` はその観測点の共有値・通常試験値・由来へ戻る。`reset` は全試験値と DSL 書込みを消し、初期状態へ戻す。

試験値の削除専用 command は初版に追加しない。初期姿を選ぶことと試験値なしは由来が異なる。試験値なしへ戻す操作は reset/seek で行う。

## 実効操作の列挙と dispatch

resolver の shadow 規則を使い、アクティブ画面、アクティブ module の document common、掲示中 overlay、表示中の包含部品から操作を列挙する。包含部品自身に document common を重複登録しない。外側上書きは SPEC の行動と対象の一致規則に従い、collection の有無・module・member を失わない構造情報で照合する。`actionText` の表示文字列を分解して操作の同一性を決めない。

操作項目は `handle`、行動と対象の構造、説明用 text、scope、定義 source、配置 path、host、gate の判定/対象/値の scope/origin、選択可能な branch、prelude/result の source を持つ。source component と作用する runtime 現在地は別の概念。receiver の事前説明 UI は追加しない。

包含・overlay の裸 gate はその表示 component の実効 body、document common の裸 gate はアクティブ画面の実効 bodyで判定する。member gate は定義 module と上表の値を読む。判定不能なモデル参照は SPEC の方針に従い有効とし、未解決であることを query に示す。host gate の無効操作も query には `enabled:false` と理由付きで含める。GUI は既存どおり host gate の無効行を隠し、member gate の無効行は表示して disabled にする。GUI には判定結果だけを渡す。

`handle` は Session 固有識別子 + revision + 現在の配置/操作を指す不透明値。別 Session の handle は拒否する。説明文字列や source line を dispatch key にしない。同じ query を繰り返した場合は同じ revision の handle を返す。

モデルに `back()` interaction がなくても既存 GUI の「← 戻る」を維持するため、query の `controls.back` に組込み back 操作の handle、enabled、無効理由を別枠で返す。Session が判定し、GUI は enabled のときだけボタンを表示する。アクティブ frame の stack が二段以上、または最下段で barrier がなく親へ抜けられるときに enabled とする。組込みは `kind:control`、定義/配置 source は `null` で、モデルの DSL 操作を捏造しない。

組込み handle も同じ dispatch へ渡す。branch は許可しない。enabled なら Session 内で runtime の引数なし back を実行し、通常 dispatch と同じ revision/operation ID/観測/ghost 処理を通す。無効なら `DISABLED_ACTION` として無変更で拒否する。モデルに定義された back interaction はこれと別であり、barrier 上で呼べば受理され runtime の no-op/診断を返す。GUI に任意 result/reducer を直接実行する入口を残さない。CLI からも query で得た組込み handle を dispatch でき、専用 back command は追加しない。

`dispatch({handle, branch})` は次の順序で検証し、一つでも失敗したら prelude の前で拒否する。

1. handle の構造、Session、revision を確認する（未知・他 Session は `UNKNOWN_HANDLE`、同 Session の古い revision は `STALE_HANDLE`）。
2. 現 revision でその実効操作があり、有効であることを確認する（`DISABLED_ACTION`）。
3. 条件ラベルがある操作は query が返した branch ID を必須とする。欠落は `BRANCH_REQUIRED`、不明な指定は `INVALID_BRANCH`。ラベルのない操作では branch を省略する。指定されたら `INVALID_BRANCH`。
4. prelude と選択した branch の結果列を順に実行する。条件は評価しない。source module は字句解決、裸 variant は各 result の実行時のアクティブ component へ解決する。

拒否された操作は、runtime 状態、試験値、由来、revision、operation counter、cursor、履歴、effect を変えない。未知 component への DSL nav、未定義 variant、失敗した back/exit、未知対象への DSL set は一律 API エラーにしない。result から返る runtime 診断は受理された操作の出力として扱う。

受理した dispatch と手動試験変更は、no-op を含めて revision と単調増加 operation ID を一回更新する。reset/seek も revision を更新し、それまでの handle を全て失効させる。operation ID は reset で再利用しない。seek は新しい DSL 操作ではない。query、表示 checkbox、fold/focus は revision を更新しない。

## 一操作と観測点・巻戻し

一つの dispatch は prelude + 選択 branch の全 result。全 result は途中で gate/操作集合を再判定して取消さず、逐次に実行する。処理中の query/command の割込みは受け付けない。一つの result が effect なら自由文の出力だけを記録し、実 I/O は行わない。

履歴は既存の統合 timeline（ADR-0023）と同じ観測点の列である。各観測点は operation ID、result の順番/source、kind、label、適用後の現在地、snapshot を持つ。operation ID が同じ複数の観測点を一操作として読める。query の公開履歴は snapshot を含まない。

dispatch response の各 observation には、その適用直後の snapshot から Session が作る detached な `view` も返す。view は全 frame 木/現在地、overlay、共有値/通常試験値と由来、包含木、操作の説明・branch・enabled・gate、controls の enabled/理由を含む。model metadata と履歴は最終 query にだけ含む。view の操作と controls には dispatch handle を付けない。過去の状態説明と現在の操作可能性を混同させず、CLI の公開 seek なしで各 result の状態と有効操作を検証できるようにする。最終 query だけが現在 revision の実行 handle を返す。

- 起動/reset: 初期観測点一件。reset は過去/ghost を捨て、初期観測点を作り直す。
- runtime 構成または値の由来が変わる transition: 一件の transition 観測点。遠隔 exit は現在地が同じでも木が変わるため記録する。singleton 書込みだけの switch-resume、同じ値への DSL 書込みで手動由来が変わる場合も記録する。
- effect、set、show、hide: 現在と同じ値/no-op でも一件の event 観測点。
- runtime 診断: 発生順に event 観測点。状態を変える result の観測点を先に置き、同じ適用後状態の診断を続ける。result が no-op で診断のみの場合は診断だけを置く。
- 状態も由来も変わらず診断のない transition: 観測点を追加しない。受理 response は operation ID と空の observations を返す。その operation を架空の timeline 行として記録しない。
- 手動試験: 一件の `manual-test` event 観測点。

snapshot は全 frame 木、active/nextFrame ID、overlay、singleton 共有値、通常 component 試験値、全値の由来を所有する。snapshot の Map/配列は live state と共有して破壊されない。seek で単調 revision や operation counter は巻き戻さない。

`seek(observationId)` は Session 内部 API として GUI から呼ぶ。存在しない ID は無変更で拒否。成功時はその snapshot 全体を復元し cursor を移し、後続は ghost として残す。ghost へも seek できる。新しい command の最初の観測点追加時にだけ cursor より先を破棄する。無効 dispatch や観測点のない no-op は ghost を捨てない。

結果途中へ seek した後に新しい操作を行っても、元操作の残り result を自動再開しない。復元した状態から新しい操作を列挙・選択する。破棄した ghost の observation ID は再利用しない。effect は実行 response の observations と歴史表示に現れるが、query/seek によって effect を再実行しない。

## 初版 CLI wire contract

コマンド案は `shitae session <file>`。起動時に全 import を読みモデルを固定する。process は stdin を行単位で逐次に読み、各 request に一つの JSON response line を stdout へ出す。起動時の unsolicited stdout や prompt は出さない。最初の状態は query で取る。

```json
{"id":"q1","command":"query"}
{"id":"d1","command":"dispatch","handle":"<query が返した handle>","branch":"<query が返した branch ID>"}
{"id":"q2","command":"query"}
{"id":"r1","command":"reset"}
{"id":"t1","command":"setTestVariant","module":"main","component":"Card","variant":"Ready"}
```

request ID は文字列または数値。response は `{id, ok:true, protocolVersion:1, query, operationId?, observations?}` または `{id, ok:false, error:{code,message}, revision}`。不正 JSON など ID を読めない場合は `id:null`。query の model metadata と revision は全 successful response に含む。

不正 JSON、command/必須 field/type の不正は `INVALID_REQUEST`、未知 command は `UNKNOWN_COMMAND` とし response 後も process を継続する。操作のエラーは前述の code。空行は無視する。末尾改行のない最終 JSON 行も処理する。EOF で stdout の write 完了後に自然終了する。初版 CLI では seek を公開しない。

全 module の parse error、ファイル読込失敗、entry component 不在は起動失敗とし stderr にファイル/行の診断を出して exit 1、stdout は空にする。check が出すラフな参照 warning や静的診断を新しい実行エラーへ昇格させない。正常起動後の request 拒否だけでは exit 1 にしない。stderr の文言は wire contract として解析させない。重大な内部不変条件違反は stderr と exit 1 とし、成功 response を捏造しない。

request ごとの observations は実行出力、query の history は過去の記録である。agent は effect の自由文から保存、I/O、focus 成功を推定しない。同じ process を保つ利用例を README に記載し、利用予定 agent の process 操作ツールで実際に query → dispatch → query を往復して接続を確認する。

## 既存 GUI から意図的に変わる経路

| 経路 | 現在の GUI | 共通 Session |
| --- | --- | --- |
| A 内 push → B へ switch → A 復帰 | 線形 stack を truncate して中断先を失う | runtime frame 木で保持し、A の最上段へ復帰 |
| 非アクティブ session の exit | 線形 stack に無ければ警告 | 木全体の遠隔破棄。現在地は維持 |
| switch の兄弟・barrier | stack 近似 | SPEC に合う runtime 木の規則 |
| singleton の手動変更 → DSL set → seek | 同じ Map、手動変更に履歴なし | 書込み順で DSL が勝ち、手動値と由来も復元 |
| 通常 component の試験値 | singleton と同じ Map | `component-test` と明示。実 frame/overlay と区別 |
| runtime の警告 | GUI 独自の発生条件・文言 | runtime 診断 code/source を共通出力 |
| 古い操作指定/誤 branch | index や未選択で prelude だけ実行し得る | command 検証後に実行。拒否時は無変更 |

HTML のレイアウト、操作ラベル、結果ごとの timeline、ghost のクリック復元、gate 試験、表示設定は維持する。stack 表示はアクティブ経路を frame stack の順に並べ、frame の底に barrier と begin marker を付ける。frame 木全体の新しい GUI は初版に追加しない。

#12 は「部品の状態を表示」を既定 off とし、Session の包含 query の値をそのまま補助表示する。初期姿、component 単位試験値、singleton の共有範囲を区別する。checkbox は実行状態/履歴/操作集合/gate を変えず、fold/focus を保つ。inline/未定義に実 component 状態を捏造しない。receiver 説明と表示設定の永続化は保留。

## runtime の既知の不一致（設計確認対象）

SPEC の「switch（中断と復帰）」と ADR-0008 は、最も近い switch 製祖先の兄弟、無ければ現在フレームの子、とする。`runtime/src/index.ts` の `switchParentId` は最初の present 製祖先で走査を止めてその子を選ぶ。既存 `runtime.test.ts` にも present anchor 直下の push から新タブを作ると anchor の子になる、という期待値がある。SPEC の字義との一致を既存 green で主張できない。

| 最小操作列（root は Entry） | SPEC からの独立期待 | 固定版 runtime |
| --- | --- | --- |
| `present(Home,@home); push(Detail,@reading); switch(B,@b)` | B の親は @reading | B の親は @home |
| 上記の後 `exit(@reading)` | @reading と子 B を破棄し Home へ戻る | 遠隔破棄で @reading だけ消え、B は残る |
| `present(Home,@home); switch(B,@b); present(Modal,@modal); switch(C,@c)` | C は B の兄弟、親は @home | C の親は @modal |
| 上記の後 `exit(@modal)` | @modal を遠隔破棄し C を維持 | @modal と C を破棄し B へ戻る |

実測は [runtime-switch-probe.mjs](evidence/runtime-switch-probe.mjs)、出力は [runtime-switch-baseline.json](evidence/runtime-switch-baseline.json)。probe の期待値は上表の固定値であり、CLI/GUI の一致や同じ関数を使った再計算を oracle にしない。`--expect-spec` は全期待を満たさなければ失敗する。

推奨は present での特別な打切りを削除して SPEC に揃える。上表の第一経路では今まで残った B が破棄されるという変更を明記する。anchor が必ず他タブを残す規則を意図する場合は SPEC 自体の設計変更になるため、その決定を先に設計者へ確認する。Session 側に補正ロジックを足して両方の意味を残さない。

## 受入表と TDD の順序

期待値は SPEC/承認済み契約から固定し、比較対象と同じ実装で生成しない。以下は実装時に red を先に確認する項目であり、契約案を書いたことを pass と数えない。

| ID | 操作/反例 | 独立期待と検証 |
| --- | --- | --- |
| S01 | A の詳細へ push → B → A | A の push 先へ復帰。非アクティブ frame の構成も一致 |
| S02 | switch の present/push 介在 | 上表の parent ID と破棄範囲。SPEC に揃える場合は runtime test を red → green |
| S03 | B から非アクティブ A を exit | A の subtree だけ消える。active B/overlay を維持 |
| S04 | barrier の内側で back/back(X)、名前不在 exit | 正しい no-op と runtime 診断。API 拒否にしない |
| S05 | singleton に明示 variant 付き switch-resume | resume 先位置は保存された先、共有書込みは全所在へ反映 |
| S06 | singleton 手動 → set → seek → ghost → reset | 値と origin が手動/DSL/手動/DSL/初期へ変わる |
| S07 | 通常 Card の複数包含 + frame + overlay | 試験値は全包含/member gate。frame/overlay は独立値のまま |
| S08 | effect → set → show → goto の途中へ seek | 各結果の frame/共有/overlay/試験値を復元。残りを再開しない |
| S09 | 未知/別 Session/古い handle、無効 gate、誤/欠落 branch | prelude の effect/set を含め一切無変更。reset/seek 後も古い handle は失効 |
| S10 | seek 後の拒否/無観測 no-op/新規 event | 最初の二つは ghost 維持、新規 event で未来を破棄。ID 再利用なし |
| S11 | outer override、3層 shadow、同 text 別 target/collection | 構造上同一の操作だけ上書き。同名同文を key にしない |
| S12 | module alias、同名 component、module 内 document common | 定義ファイルの共有を維持。動的裸 variant と字句 module を区別 |
| S13 | inline/未定義/循環/variantなし/未定義 variant | 捏造せず表示・操作可能性を説明。query 改変で Session を変えられない |
| S14 | Detail に back interaction がないモデルで組込み戻る | controls.back の handle で Home へ戻り、通常観測/revision を更新。barrier/根では disabled、古い handle で実行できない |
| C01 | 実 agent ツールで同一 CLI process を保持 | query の handle を dispatch し query の状態変化を読む。stdin が終了する一回実行だけを成功と数えない |
| C02 | 不正 JSON、request type、branch の後に正常 query | 各 response 一行、拒否後も継続、stderr/stdout 分離、EOF flush |
| C03 | import の source だけ変更、モデル移動、engine 変更 | 前二者はそれぞれ ID 変更/維持、engine 変更は ID 変更。全 manifest を照合 |
| G01 | S01–S14 の同じ操作/branch を CLI/GUI で実行 | CLI response の各 observation.view と GUI が同じ観測点へ seek した query の state/操作説明・branch・enabled/包含/gate/controls が一致。Session 固有 handle、revision、履歴 cursor は比較対象から外す。双方に同じ誤りがある場合を S 系 oracle が検出 |
| G02 | HTML をネットワークなしで実ブラウザ表示 | main/overlay/包含、timeline、gate drawer、map、操作、focus/fold を確認 |
| G03 | #12 表示 checkbox と keyboard 操作 | 値は query と一致。切替で state/history/操作/gate は変わらず focus/fold 維持 |
| D01 | 保存済み Sol/Astra の current/proposed モデル | 旧 GUI と同じであるべき経路、SPEC 修正による差、作者修正による差を別記録 |
| D02 | CLI とブラウザで再ドッグフーディング | 完遂、モデルへの参照回数、操作特定失敗、branch 誤り、転記量を実測。CLI の時間短縮/理解改善を事前に断定しない |

初期 fixture は [switch-contexts.shitae](session-fixtures/switch-contexts.shitae)、[trial-values.shitae](session-fixtures/trial-values.shitae)、[builtin-back.shitae](session-fixtures/builtin-back.shitae)。機械検査では parse/check、runtime probe では既知の不一致を確認する。この三つだけで S01–D02 を通過したとはしない。

固定版の検証結果は [validation.json](evidence/validation.json)。build と既存テスト 700 件は成功。typecheck は既存 `runtime/test/runtime.test.ts:37` の helper に必須 `module` がない TS2322 で失敗した。production と既存テストは変更していない。新しい Session/CLI/GUI の実行・ブラウザ接続・再ドッグフーディングはまだ検証していない。

[独立レビュー記録](evidence/independent-review.md) には、結果途中の CLI 観測と組込み戻るの入口に関する指摘・修正・再確認を残した。最終再確認で未解消の actionable finding はない。proposed な設計判断の採用を示すものではない。

実装の論理単位は (1) runtime 不一致修正、(2) Session の観測・操作・snapshot、(3) 共通 Session への GUI 接続と bundle、(4) CLI protocol と利用実証、(5) #12 表示、(6) 保存モデル回帰/再評価。各段階で必要な red → green と独立レビューを行い、変更がない全件検査を繰り返さない。SPEC に転記する場合は転記元の内部整合レビューを先に済ませる。本案のツール API は原則 SPEC へ追加しない。

初版の対象外は #11 の export/import、daemon、MCP、クラウド保存、自由文 effect の実処理、期待値 DSL、エディタ連携、check JSON、receiver 事前説明、新しい独立 instance 状態エンジン。履歴は同一 Session 内の探索用であり、永続保存や別モデルへの replay を保証しない。

## 一次資料

- [SPEC](../SPEC.md): document common、包含と外側上書き、通常 component/singleton、frame 木、switch、overlay、result の順次実行。
- [ADR-0008](../adr/0008-switch-sibling-rule-nearest-switch-ancestor.md): switch 祖先規則。
- [ADR-0022](../adr/0022-simulator-observability-ui.md) と [ADR-0023](../adr/0023-simulator-timeline-and-graph-granularity.md): 統合 timeline、全状態 snapshot、ghost、表示と実行の区別。
- `packages/runtime/src/index.ts`: RuntimeState、reduce、switchParentId、singleton の共有解決。
- `packages/simulator/src/extract.ts`: 字句 module 解決、shadow と branch 合成、包含参照、source span の現状欠落。
- `packages/simulator/src/simulator.ts`: 線形 stack、gate、sharedVariants の試験値兼用、result ごとの timeline、包含操作と外側上書き。
- `packages/cli/src/index.ts`: 既存ファイル読込と simulate の HTML 出力。
- [Issue #12](https://github.com/takasek/shitae/issues/12): 共通 query からの任意状態表示と保留境界。
