# Issue #18: 共通 Session の契約案

Status: approved / 段階実装中。2026-10-14 にユーザーが本契約での実装を承認し、その後「操作一覧 → 分岐実行 → 現在地確認」を一本通し、実物を Astra が独立レビューする区切りを指定した。調査の固定版は `e985f4ee58ab76339df5b0f59144e1f1a5da91c8`。[最初の区切りの実装・出力形・未接続範囲](session-first-slice.md) を全体契約と区別する。これは新しい言語仕様ではなく、全 API が実装済みであることも表さない。

## 採用した方針

1. 初版 CLI は `shitae session <file>` の stdin/stdout JSON Lines とする。同じ process 内で query → dispatch → query を継続し、EOF で終了する。既存 `simulate` の入口を維持し、GUI の配布形は後述の方針で選ぶ。
2. singleton の手動試験変更は共有値そのものへの書込みにする。別の override 層を置かず、後続の DSL 書込みが勝つ。通常 component の試験値は component 単位の模擬値として分離し、包含表示と member gate だけへ適用する。frame/overlay の実状態は変えない。
3. 操作・部品・配置・result の定義 module と source span を詳細照会で取得できる必須情報にする。モデルへ戻る負担に直結するため。CLI は詳細に実ファイルパスも返し、直接 `toSimulator(documents, ...)` を呼ぶ場合はファイルパス未提供を `null` で表す。

2026-10-14 の通常応答に関する指定を反映し、command の応答と query の既定値は小さな要約とする。全状態、操作一覧、model manifest、履歴、結果途中の詳細は必要な項目を指定して照会する。JSON Lines であることを理由に毎回全データを返さない。

runtime の兄弟規則には後述の不一致がある。推奨は SPEC の規則へ runtime と既存の矛盾するテストを修正すること。既存 runtime の結果を Session の独立期待値として流用しない。

## 責務と配置

- `@shitae/runtime`: 既存 reducer。frame 木、barrier、switch の中断・復帰、singleton、overlay の意味はここに一つだけ置く。
- 新しい `@shitae/session`: DOM/Node 非依存のモデル準備と Session。resolver の実効 body/shadow、包含解決、gate、分岐選択、result の順次実行、query、観測履歴を持つ。runtime → Session の依存は作らない。
- `@shitae/simulator`: Session の query を描画し command を呼ぶ。静的な遷移マップの準備と fold/focus/表示設定を担当する。現在の実行・gate・snapshot 処理は Session へ移す。
- `@shitae/cli`: ファイル読込、モデル同一性の計算、JSON Lines、process の寿命。Session に DOM や Node の API を入れない。

Session は `Document` の集合と entry module、モデル metadata を受け取る。extract の状態・操作データの準備を Session 側へ移し、simulator は Session と静的 graph データを消費する。共有処理のために Session → simulator の逆依存や循環依存を作らない。

GUI の配布は自己完結 HTML 一枚を優先候補とする。通常の build/bundle で共通 Session/runtime を無理なく埋め込めるなら維持する。2026-10-14 のユーザー指定により、一枚化は必須の受入条件から外す。一枚化のために実行コードの複製、独自ローダー、大きな迂回や保守負担が必要になるなら、その前提を外して構成を選び直す。

代替の第一候補は、HTML と生成 JS/CSS をまとめた静的ファイル群。必要なら利用時に起動するローカル静的サーバーで開く。配布形の切替理由、`simulate` の出力方法と利用者が開く手順、サーバーが必要なら起動/終了手順を文書化し、選んだ形で実ブラウザ検証する。HTML 一枚を外すことだけを理由に再承認を要求しない。外部 CDN/クラウド配信や常駐サービスを追加する範囲には広げない。

配布形によらず、CLI と GUI が使う Session/runtime は同じ source から生成し、手作業で写した JavaScript を残さない。表示のための純粋な整形関数は GUI に置けるが、variant/gate/実効操作の再解決は置けない。外部ネットワークなしで利用できることと、共通 Session の実行・観測契約を保つことを受入条件とする。

## モデルの同一性と位置

モデル metadata は `engineVersion`、`modelId`、`entryModule`、全参照 module の manifest を持つ。manifest の各項目は正準 module ID、source の SHA-256、提供済みなら source path。CLI は読込済み source の bytes から hash を求める。`modelId` は protocol version、engine の build 識別子、entry、正準 ID 順に並べた全 module の source hash に対する SHA-256。単なる entry の hash や package の `0.0.1` だけにはしない。engine build 識別子は実装 source と lockfile を入力とする build 時の値とし、GUI/CLI の共通 bundle とともに生成する。

同じファイルを別 alias で import しても一つの正準 module として扱う。異なるファイルを basename だけで合流させない。現在の CLI loader は module 名を訪問済み key に使っているため、この保証に必要な loader の確認と修正も実装時の受入に含める。source path 自体は modelId の入力にせず、移動した同じモデルを識別できるようにする。正準 ID の割当ては entry からの相対ファイル位置を基準とし、同じモデルを別ディレクトリへ丸ごと移した場合は同じ ID とする。

位置情報は `{module, file, span}`。component/variant/interaction/result の**定義位置**と、包含 element の**配置位置**を区別する。alias は配置の名前であり、解決後 component 名や操作識別子に置き換えない。匿名 inline・未定義参照には component の定義位置を捏造しない。

Session はモデルを読込時に固定する。process 中のファイル変更は自動反映しない。初版に hot reload、保存モデルへの実行結果書戻し、永続 replay 識別子を追加しない。

## query の値と作用範囲

query は JSON 化できる detached value を返す。呼出し側が結果を書き換えても Session は変わらない。Map/Set は配列に変換する。query 自体は revision、状態、履歴を変えない。Session の query は以下の項目選択を提供し、GUI も必要な項目を選んで使う。CLI 側に状態・操作・gate の別の解決処理を置かない。

既定の query と全 successful command response は `revision` と `summary` だけを共通の状態情報として返す。summary は現在地（正準 module/component/表示 variant）、現在の観測点 ID、最新の観測点 ID、保持している観測点数。全 frame 木、包含木、操作一覧、manifest、履歴行は含まない。command は今回の実行出力を後述の receipt に返し、全 query を自動で添えない。

query の `select` に項目を列挙すると、指定した値だけを `data` に追加する。省略または空配列なら summary のみ。同じ項目の重複、未知の項目、対応しない追加引数は `INVALID_REQUEST` とする。複数項目の照会は同じ現在 revision から一度に作る。

| select 項目 | data に返す値 |
| --- | --- |
| `state` | 現在の全 frame 木、アクティブ経路、overlay、singleton 共有値、通常 component 試験値と由来、現在表示する包含木 |
| `actions` | 現在の操作 handle、表示名、scope/host/配置、enabled、branch ID/ラベル、組込み back の handle/可否。結果・定義・source・gate 詳細は含まない |
| `action` | handle で指定した現在の一操作の定義 AST、source、gate、prelude/branch の結果参照。組込み back は kind:"control"・source:null・可否/理由 |
| `metadata` | 処理系版、modelId、entry module、全参照 module の manifest |
| `history` | 指定ページの観測点の概要（ID、operation ID、result の順番/source、kind、label、記録時の現在地、ghost）、次ページ用 ID。snapshot/view は含まない |
| `observation` | 指定した観測点一件の概要と、snapshot から投影した詳細 view。現在の状態を変更しない |

`history` は `history:{after?, limit?, operationId?}` で照会する。after は直前ページの最後の観測点 ID で、その後を保持順に読む。省略時は先頭から。limit は既定 20、1–100 の整数。operationId を指定するとその操作の観測点に絞る。各ページは `items` と `nextAfter`（続きがなければ null）を返す。存在しない operationId は空ページ、保持されていない after は `UNKNOWN_OBSERVATION`。絞込みと after/limit は併用でき、after は同じ絞込みの前ページから得た ID とする。

`observation` は `observationId` が必須。現在点より未来の ghost も保持中なら読める。reset または新しい分岐で破棄した ID は `UNKNOWN_OBSERVATION` として無変更で拒否する。ページをまたぐ照会の間に command が入れば履歴が変わり得るため、複数 response の revision が違う場合は同じ履歴版として扱わない。query で過去の観測値を読むことと、seek で実行状態を復元することは別である。内部 snapshot 自体を公開 JSON に載せない。

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

`actions` を選んだ query は選択に必要な情報だけを返す。各項目は `handle`、`actionText`、`scope`、`placement:{root,path}`、`host:{module,component,variant}`、`enabled`、`branches:[{id,label}]`。同じ表示名でも所属と配置で区別し、返された handle をそのまま dispatch へ渡す。結果列、AST、定義／配置 source、gate の詳細、prelude/result の参照は一覧に含めない。receiver の事前説明 UI は追加しない。

詳細は `query({select:["action"],handle})` で現在の一操作だけを照会する。DSL 操作では一覧情報に加え、行動と対象の構造、定義／配置 source、gate の判定/対象/値の scope/origin、prelude と branch の resultIndex/source、元の interaction AST `definition`（action、全 results、span）を返す。元の module 修飾や結果の順序・ラベルを維持し、`source.module` が字句解決の基準になる。source component と作用する runtime 現在地は別の概念。条件の評価や実行は行わない。詳細は detached で、照会は state/revision/cursor/history/operation counter を変えない。

外側上書きを行う操作の詳細には、実際に除外した既定操作の `source`、`host`、`placement` を `overrides` 配列で添える。inline 内を含む配置ごとに記録し、該当しなければ空配列を返す。過去 observation でもその時点の実効操作から同じ注釈を得る。GUI はこの注釈を説明に使い、上書きの一致規則を再計算しない。注釈は compact な `actions` 一覧と scenario の保存・digest 射影には含めない。

`action` 選択には文字列 handle が必須で、他の選択だけのときに handle を指定したら `INVALID_REQUEST`。不明・別 Session の handle は `UNKNOWN_HANDLE`、失効した handle は `STALE_HANDLE`。無効操作も現在の handle で詳細を読める。dispatch と同じ寿命であり、過去 observation の説明を現在の実行 handle に変換しない。

包含・overlay の裸 gate はその表示 component の実効 body、document common の裸 gate はアクティブ画面の実効 bodyで判定する。member gate は定義 module と上表の値を読む。判定不能なモデル参照は SPEC の方針に従い有効とし、未解決であることを詳細 query に示す。host gate の無効操作も一覧には `enabled:false` として含め、理由は詳細で読む。GUI は既存どおり host gate の無効行を隠し、member gate の無効行は表示して disabled にする。GUI は必要な gate/対象/source 表示を詳細 query で読み、判定を独自に再計算しない。

`handle` は Session 固有識別子 + revision + 現在の配置/操作を指す不透明値。別 Session の handle は拒否する。説明文字列や source line を dispatch key にしない。同じ query を繰り返した場合は同じ revision の handle を返す。

モデルに `back()` interaction がなくても既存 GUI の「← 戻る」を維持するため、`data.actions.controls.back` に組込み back 操作の `handle` と `enabled` を別枠で返す。無効理由はその handle の詳細 query で読む。Session が判定し、GUI は enabled のときだけボタンを表示する。アクティブ frame の stack が二段以上、または最下段で barrier がなく親へ抜けられるときに enabled とする。組込み詳細は `{handle,kind:"control",source:null,enabled,reason}` で、モデルの DSL 操作や definition AST を捏造しない。

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

履歴は既存の統合 timeline（ADR-0023）と同じ観測点の列である。各観測点は operation ID、result の順番/source、kind、label、適用後の現在地、snapshot を持つ。operation ID が同じ複数の観測点を一操作として読める。公開履歴は明示的な history query でページごとに取得し、snapshot や詳細 view は含まない。

結果途中の詳細は `query({select:["observation"], observationId})` で必要な一件だけ読む。Session はその適用直後の snapshot から detached な `view` を作る。view は全 frame 木/現在地、overlay、共有値/通常試験値と由来、包含木、操作の説明・branch・enabled・gate、controls の enabled/理由を含む。model manifest と履歴は含まない。過去 view の操作と controls には dispatch handle を付けない。過去の状態説明と現在の操作可能性を混同させず、CLI の公開 seek なしで各 result の状態と有効操作を検証できるようにする。現在状態の `actions` と `action` query は現在 revision の実行 handle を返す。

- 起動/reset: 初期観測点一件。reset は過去/ghost を捨て、初期観測点を作り直す。
- runtime 構成または値の由来が変わる transition: 一件の transition 観測点。遠隔 exit は現在地が同じでも木が変わるため記録する。singleton 書込みだけの switch-resume、同じ値への DSL 書込みで手動由来が変わる場合も記録する。
- effect、set、show、hide: 現在と同じ値/no-op でも一件の event 観測点。
- runtime 診断: 発生順に event 観測点。状態を変える result の観測点を先に置き、同じ適用後状態の診断を続ける。result が no-op で診断のみの場合は診断だけを置く。
- 状態も由来も変わらず診断のない transition: 観測点を追加しない。receipt の観測点数は 0、first/last ID は null。その operation を架空の timeline 行として記録しない。
- 手動試験: 一件の `manual-test` event 観測点。

snapshot は全 frame 木、active/nextFrame ID、overlay、singleton 共有値、通常 component 試験値、全値の由来を所有する。snapshot の Map/配列は live state と共有して破壊されない。seek で単調 revision や operation counter は巻き戻さない。

`seek(observationId)` は Session 内部 API として GUI から呼ぶ。存在しない ID は無変更で拒否。成功時はその snapshot 全体を復元し cursor を移し、後続は ghost として残す。ghost へも seek できる。新しい command の最初の観測点追加時にだけ cursor より先を破棄する。無効 dispatch や観測点のない no-op は ghost を捨てない。

結果途中へ seek した後に新しい操作を行っても、元操作の残り result を自動再開しない。復元した状態から新しい操作を列挙・選択する。破棄した ghost の observation ID は再利用しない。effect は実行 response の receipt と、照会した歴史表示に現れるが、query/seek によって effect を再実行しない。

## 初版 CLI wire contract

コマンド案は `shitae session <file>`。起動時に全 import を読みモデルを固定する。process は stdin を行単位で逐次に読み、各 request に一つの JSON response line を stdout へ出す。起動時の unsolicited stdout や prompt は出さない。最初の状態は query で取る。

```json
{"id":"q1","command":"query"}
{"id":"a1","command":"query","select":["actions"]}
{"id":"x1","command":"query","select":["action"],"handle":"<一覧で選んだ handle>"}
{"id":"d1","command":"dispatch","handle":"<query が返した handle>","branch":"<query が返した branch ID>"}
{"id":"q2","command":"query"}
{"id":"s1","command":"query","select":["state"]}
{"id":"m1","command":"query","select":["metadata"]}
{"id":"h1","command":"query","select":["history"],"history":{"operationId":7,"limit":20}}
{"id":"o1","command":"query","select":["observation"],"observationId":42}
{"id":"r1","command":"reset"}
{"id":"t1","command":"setTestVariant","module":"main","component":"Card","variant":"Ready"}
```

request ID は文字列または数値。successful response は `{id, ok:true, protocolVersion:1, revision, summary, receipt?, data?}`。summary の形は `{location:{module,component,variant}, cursorObservationId, latestObservationId, observationCount}`。query の明示した select 項目だけを data に返し、select が空なら data は省略する。dispatch/setTestVariant/reset の response は data を持たない。model manifest、全状態、操作一覧、全履歴、途中 view を command 応答へ自動追加しない。

dispatch/setTestVariant は今回の操作の `receipt` を返す。形は `{operationId, changed, observations:{count,firstId,lastId}, effects, diagnostics}`。changed は前後で変わった領域の名前だけ（`frames`、`overlays`、`sharedVariants`、`testVariants`、`origins`）で、全値や patch は返さない。effects/diagnostics は今回の実行で発生した出力だけを result の順番/source 付きで返し、過去のものを再送しない。観測点 ID の全列挙や各 view は返さない。今回の観測点を読むときは operationId で history query を絞り、その ID で observation query を行う。reset は小さな summary を返し、初期観測点の ID から詳細を照会できる。

通常応答の大きさは summary と今回の操作の出力に依存し、保持履歴数・全 frame 数・包含木・全 module 数には比例させない。effect 自由文や多数の診断を生む一操作の出力までは一定 byte 数と保証せず、省略や黙った切捨てはしない。actions は選択候補数・表示名・配置・branch ラベルに応じて大きくなり得るが、結果本文／source の長さや結果数には比例させない。action/state/metadata/observation の明示照会は対象モデルや状態に応じて大きくなり得る。history は limit で件数を制限する。

拒否 response は `{id, ok:false, protocolVersion:1, error:{code,message}, revision}`。不正 JSON など ID を読めない場合は `id:null`。command 後は revision が更新されるため、次の操作には `select:["actions"]` で新しい handle を取得する。通常応答の changed を状態の完全な差分や新しい handle の代用にはしない。

不正 JSON、command/必須 field/type の不正は `INVALID_REQUEST`、未知 command は `UNKNOWN_COMMAND` とし response 後も process を継続する。操作のエラーは前述の code。空行は無視する。末尾改行のない最終 JSON 行も処理する。EOF で stdout の write 完了後に自然終了する。初版 CLI では seek を公開しない。

全 module の parse error、ファイル読込失敗、entry component 不在は起動失敗とし stderr にファイル/行の診断を出して exit 1、stdout は空にする。check が出すラフな参照 warning や静的診断を新しい実行エラーへ昇格させない。正常起動後の request 拒否だけでは exit 1 にしない。stderr の文言は wire contract として解析させない。重大な内部不変条件違反は stderr と exit 1 とし、成功 response を捏造しない。

receipt の effects/diagnostics は今回の実行出力、history/observation query は過去の記録である。query は state、revision、cursor、ghost、履歴、operation counter、effect を変えず、途中状態の照会で現在の handle を失効させない。agent は effect の自由文から保存、I/O、focus 成功を推定しない。同じ process を保つ利用例を README に記載し、利用予定 agent の process 操作ツールで実際に actions query → dispatch → summary query を往復し、必要なときに詳細照会することを確認する。

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

既存 GUI のレイアウト、操作ラベル、結果ごとの timeline、ghost のクリック復元、gate 試験、表示設定は維持する。stack 表示はアクティブ経路を frame stack の順に並べ、frame の底に barrier と begin marker を付ける。frame 木全体の新しい GUI は初版に追加しない。

#12 は「部品の状態を表示」を既定 off とし、Session の包含 query の値をそのまま補助表示する。初期姿、component 単位試験値、singleton の共有範囲を区別する。checkbox は実行状態/履歴/操作集合/gate を変えず、fold/focus を保つ。inline/未定義に実 component 状態を捏造しない。receiver 説明と表示設定の永続化は保留。

## runtime の不一致（固定版の記録と修正）

SPEC の「switch（中断と復帰）」と ADR-0008 は、最も近い switch 製祖先の兄弟、無ければ現在フレームの子、とする。`runtime/src/index.ts` の `switchParentId` は最初の present 製祖先で走査を止めてその子を選ぶ。既存 `runtime.test.ts` にも present anchor 直下の push から新タブを作ると anchor の子になる、という期待値がある。SPEC の字義との一致を既存 green で主張できない。

| 最小操作列（root は Entry） | SPEC からの独立期待 | 固定版 runtime |
| --- | --- | --- |
| `present(Home,@home); push(Detail,@reading); switch(B,@b)` | B の親は @reading | B の親は @home |
| 上記の後 `exit(@reading)` | @reading と子 B を破棄し Home へ戻る | 遠隔破棄で @reading だけ消え、B は残る |
| `present(Home,@home); switch(B,@b); present(Modal,@modal); switch(C,@c)` | C は B の兄弟、親は @home | C の親は @modal |
| 上記の後 `exit(@modal)` | @modal を遠隔破棄し C を維持 | @modal と C を破棄し B へ戻る |

実測は [runtime-switch-probe.mjs](evidence/runtime-switch-probe.mjs)、出力は [runtime-switch-baseline.json](evidence/runtime-switch-baseline.json)。probe の期待値は上表の固定値であり、CLI/GUI の一致や同じ関数を使った再計算を oracle にしない。`--expect-spec` は全期待を満たさなければ失敗する。

承認した修正は present での特別な打切りを削除して SPEC に揃えること。上表の第一経路では今まで残った B が破棄される。最初の実装区切りで runtime を修正し、[TDD 記録](evidence/runtime-switch-tdd.json) のとおり四観測が SPEC と一致した。Session 側に補正ロジックを足して両方の意味を残さない。

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
| C01 | 実 agent ツールで同一 CLI process を保持 | actions query の handle を dispatch し summary query の状態変化を読む。更新後は新しい handle を取る。stdin が終了する一回実行だけを成功と数えない |
| C02 | 不正 JSON、request type、branch の後に正常 query | 各 response 一行、拒否後も継続、stderr/stdout 分離、EOF flush |
| C03 | import の source だけ変更、モデル移動、engine 変更 | 前二者はそれぞれ ID 変更/維持、engine 変更は ID 変更。全 manifest を照合 |
| C04 | 同じ短い操作の前に履歴/中断 frame/包含/module を増やす | 通常 command response と既定 query に全状態/履歴/manifest/操作/view が混入しない。response schema と実 byte 数を確認。今回の effect/診断と ID の桁数による増加は区別 |
| C05 | history の複数ページ/operation 絞込み、途中 observation 照会 | 全観測点を重複・欠落なく読める。query で state/revision/cursor/ghost/effect を変えない。破棄済み ID は無変更拒否、無観測 no-op は空ページ |
| C06 | 小さい操作一覧と handle 指定の任意詳細 | 一覧は選択用フィールドだけで結果本文／source に比例しない。詳細なしで分岐を選んで実行できる。詳細は全定義／結果／gate を無変更で返し、改変隔離と stale/unknown/foreign handle 拒否を確認。GUI は同 revision の詳細ごとに全候補を再走査しない |
| G01 | S01–S14 の CLI 公開操作と branch を CLI/GUI で照合 | 観測ありの受理操作は receipt.operationId で history query を絞り、全ページの各 ID を observation query で読む。reset は summary の初期観測点 ID を observation query で読む。拒否と無観測 no-op は明示 state/actions query で前後を比較する。各 view は GUI が同じ観測点へ seek した state と、一覧の各 handle の action query（組込み back も含む）から得た詳細と照合し、state/操作説明・branch・enabled/包含/gate/controls が一致。歴史表示に含まれない definition AST と Session 固有 handle、revision、履歴 cursor は値比較から外し、拒否/no-op 等の revision 規則は S09/S10 で別に確認する。双方に同じ誤りがある場合を S 系 oracle が検出 |
| G02 | 選んだ配布形式を外部ネットワークなしで実ブラウザ表示 | HTML 一枚または静的ファイル群の開き方を確認。ローカルサーバーが必要なら起動/終了も確認。main/overlay/包含、timeline、gate drawer、map、操作、focus/fold を検証。一枚化自体は必須としない |
| G03 | #12 表示 checkbox と keyboard 操作 | 値は query と一致。切替で state/history/操作/gate は変わらず focus/fold 維持 |
| D01 | 保存済み Sol/Astra の current/proposed モデル | 旧 GUI と同じであるべき経路、SPEC 修正による差、作者修正による差を別記録 |
| D02 | CLI とブラウザで再ドッグフーディング | 完遂、モデルへの参照回数、操作特定失敗、branch 誤り、転記量を実測。CLI の時間短縮/理解改善を事前に断定しない |

G01 は公開 CLI からも行える dispatch、手動試験、reset、query の接続比較とする。seek と巻戻し後の新規分岐は S06/S08/S10 で共通 Session 内部 API と GUI を検証し、CLI では保持された観測点の read-only query を照合する。初版で seek を公開しない以上、CLI から巻戻し後の新規分岐を実行できたとは数えない。

初期 fixture は [switch-contexts.shitae](session-fixtures/switch-contexts.shitae)、[trial-values.shitae](session-fixtures/trial-values.shitae)、[builtin-back.shitae](session-fixtures/builtin-back.shitae)。機械検査では parse/check、runtime probe では既知の不一致を確認する。この三つだけで S01–D02 を通過したとはしない。

契約作成時の固定版の検証結果は [validation.json](evidence/validation.json)。当時は build と既存テスト 700 件が成功、typecheck は既存 `runtime/test/runtime.test.ts:37` の helper に必須 `module` がない TS2322 で失敗した。当時の production/既存テストは未変更だった。最初の実装区切りでは helper も修正し、[現在の検証結果](evidence/first-slice-validation.json) に CLI の実演・テスト・typecheck を分けて記録した。GUI 接続・実ブラウザ・再ドッグフーディングは後続段階。

[独立レビュー記録](evidence/independent-review.md) には、契約改訂のレビューと最初の CLI 一往復の Astra 実装レビューを分けて残した。通常応答縮小の [文書検証結果](evidence/compact-response-validation.json) と、配布方針改訂の文書検査を、新 CLI/配布形の実測には数えない。最初の CLI 区切りの後、詳細照会・手動試験・seek/reset、モデル識別・正準 loader、GUI 共通化・#12 表示を実装した。[実装版の検証](session-usage.md) を参照。実ブラウザの G02/G03 と利用評価 D02 もローカル HTTP 経由で実施し、[評価記録](session-browser-evaluation.md) に証跡と限界を残した。Astra の独立レビューで未解消の actionable finding はない。D02 は1 agentと既存4モデルの固定目標であり、速度・理解改善の保証にはしない。

実装の論理単位は (1) runtime 不一致修正、(2) Session の観測・操作・snapshot、(3) 共通 Session への GUI 接続と配布形の選択、(4) CLI protocol と利用実証、(5) #12 表示、(6) 保存モデル回帰/再評価。各段階で必要な red → green と独立レビューを行い、変更がない全件検査を繰り返さない。SPEC に転記する場合は転記元の内部整合レビューを先に済ませる。本案のツール API は原則 SPEC へ追加しない。

初版の対象外は #11 の export/import、常駐 daemon、MCP、クラウド保存、自由文 effect の実処理、期待値 DSL、エディタ連携、check JSON、receiver 事前説明、新しい独立 instance 状態エンジン。必要時だけ起動する GUI 用ローカル静的サーバーは配布形の選択に含め、常駐 daemon とは区別する。履歴は同一 Session 内の探索用であり、永続保存や別モデルへの replay を保証しない。

## 一次資料

- [SPEC](../SPEC.md): document common、包含と外側上書き、通常 component/singleton、frame 木、switch、overlay、result の順次実行。
- [ADR-0008](../adr/0008-switch-sibling-rule-nearest-switch-ancestor.md): switch 祖先規則。
- [ADR-0022](../adr/0022-simulator-observability-ui.md) と [ADR-0023](../adr/0023-simulator-timeline-and-graph-granularity.md): 統合 timeline、全状態 snapshot、ghost、表示と実行の区別。
- `packages/runtime/src/index.ts`: RuntimeState、reduce、switchParentId、singleton の共有解決。
- `packages/simulator/src/extract.ts`: 字句 module 解決、shadow と branch 合成、包含参照、source span の現状欠落。
- `packages/simulator/src/simulator.ts`: 線形 stack、gate、sharedVariants の試験値兼用、result ごとの timeline、包含操作と外側上書き。
- `packages/cli/src/index.ts`: 既存ファイル読込と simulate の HTML 出力。
- [Issue #12](https://github.com/takasek/shitae/issues/12): 共通 query からの任意状態表示と保留境界。
