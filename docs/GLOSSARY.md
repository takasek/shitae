# shitae Glossary — 用語集

shitae の概念語の正準名。SPEC・AI_GUIDE・スキル・examples はこの語彙で書く。構文記号・遷移語の意味の詳細は `SPEC.md`（唯一の正）を引く。

## 入門での読み方

[予約の例で試す入門](TUTORIAL.md)では、次の順に役割名と元の用語を導入する。DSLの識別子や予約語は変更しない。

| 段階 | 扱うこと | 用語 |
|---|---|---|
| 下書きを書く | 何が見え、どの操作で何が起こるか | 画面・部品の定義（component）、状態パターン（variant）、操作、結果 |
| 動かしたときの残り方を決める | 何が一緒に終わり、何が別に残るか | 作業のまとまり（session）、状態を共有する部品（singleton）、画面とは独立して残る表示（overlay） |
| 設計を確かめる | 人がケースを選び、状態と戻り先を観察する | 分岐選択、状態の手動試験、履歴の閲覧、確認して再開 |

定義は書いた内容、実行中の状態は現在選ばれている状態パターンや残っている作業を指す。手動試験や履歴の再開は、それらを確かめるシミュレータの機能であり、DSLの操作定義とは区別する。

## 構造

| 用語 | 記号 | 意味 |
|------|------|------|
| **component** | `#` | 画面・部品の定義。遷移先に使えば画面、別の定義の要素に置けば部品として使う同じ定義単位。組み込みの特権 component は無い |
| **variant** | `##` | 状態パターン。その状態で何が見え、どの操作が定義されるかの組合せ（読込中／表示中、未予約／予約済など）。共通部分も含む。操作可否には presence gate も関わる。旧称: 姿 |
| **initial variant** | — | 最初に定義された variant（`##` が無ければ単一 variant）。通常 component を variant 指定なしで新しく開く既定。singleton は保持中の共有 variant を優先する（[SPEC](SPEC.md#initial-variant-とエントリポイント)） |
| **single variant** | — | `##` を 1 つも書かない component が持つ、ただ 1 つの variant（＝従来の画面） |
| **variant change** | `goto(##X)` | 各結果を適用する時点のアクティブ画面の variant を切り替えること。包含部品・overlay の定義元自身とは限らず、先行結果で作用先も変わる（[例](AI_GUIDE.md#子に書いた操作はどこを変えるか)）。旧称: 姿替え |
| **two-layer model** | `#` / `##` | component と variant の 2 階層で shitae ができているという構図 |
| **element line** | 行頭 `>` なし | その variant で何が見えるかを書く行（要素行） |
| **interaction line** | 行頭 `>` | その variant で何ができるかを書く行（インタラクション行） |
| **action** | `行動(対象)` | interaction の左辺。自然文の行動＋任意の対象参照 |
| **result** | `->` の右 | interaction の右辺に並ぶ遷移・副作用。`;` か継続行で区切る |
| **component common** | `##` より前 | その component の全 variant に共通する element / interaction |
| **document common** | 最初の `#` より前 | そのファイルの全 component に共通する element / interaction（deep link・通知・強制ログアウト等） |
| **shadow** | — | (行動, 対象参照) が完全一致する定義が複数階層にあるとき、特化した側が勝つ規則（variant 固有 > component common > document common） |
| **alias** | `名前: 実体` | 要素や inline に呼び名を与える。参照は alias 名で引く |
| **collection** | `*`（前置） | 複数あるという宣言。旧称: 集合。参照すると 1 インスタンスを指す |
| **inline component** | `{ ... }` | その場限りの component（要素のみ。variant・interaction は持てない） |
| **quoted name** | `"..."` | 空白を含む名前を囲む（エスケープ機構なし） |
| **module / namespace** | `import` / `::` | ファイル＝モジュール＝名前空間。`import x as y` で読み込み `y::component` で参照 |

## 名前の識別単位

| 名前・表示 | 識別するもの・範囲 |
|---|---|
| 定義ファイル＋component 名 | component 定義の識別単位。同一ファイルを別 import alias で参照しても同じ定義。別ファイルの同名 component は別定義。singleton の共有単位もこの組 |
| `@作業名` | 実行中の作業範囲を探す名前。同名で複数回 begin でき、一意な instance ID でも module 固有名でもない。探索順は [SPEC のフレーム木](SPEC.md#フレーム木)を参照 |
| body 内の alias（`呼び名: 部品`） | その body 内の要素の呼び名。表示だけでなく、操作対象や `部品.呼び名` などの参照にも使う（[記号一覧のスコープと優先順位](SPEC.md#記号一覧これで全部)） |
| 表示文字列 | UI に見える文字列だけでは定義や実行中の instance を一意に識別できない。定義ファイル・component・作業位置などを合わせて読む |
| overlay | 解決済みの定義ファイル＋component 名で識別。variant は ID に含まない。同一ファイルへの別 import alias は同じ overlay、別ファイルの同名 component は別 overlay（[SPEC](SPEC.md#オーバーレイshow--hide)、[ADR-0026](adr/0026-overlay-identity-is-module-component.md)） |

## 遷移

| 用語 | 記号 | 意味 |
|------|------|------|
| **transition verb** | — | 遷移を表す予約語。コア 4 語 `push` `back` `goto` `exit` ＋ compound verb 3 語 |
| **compound verb** | — | 壁・セッションにまつわる意図を一語に束ねた複合遷移語: `present` `dismiss` `switch` |
| **overlay verb** | `show` / `hide` | フレーム木を操作しない別カテゴリの予約語。掲示中 component 集合に対する追加・除去 |
| **overlay / 画面とは独立して残る表示** | `show(X)` / `hide(X)` | アクティブフレームと独立に常時表示される component の集合（ミニプレイヤー・PiP・バナー等）。フレームではないので `back`/`exit` の走査対象外。`hide` で明示的に外すまで残る |
| **session** | `@S` | まとめて終了する作業のまとまり。`push`/`present`/`switch`（新規作成時）で開始する。終了すると内側の作業も破棄する。共有状態と独立表示は別に残る。ログイン状態や実行全体に限らない |
| **back barrier** | — | モード内から通常の `back` で外に出られない性質。旧称: back の壁。`present` と `switch` が立てる |
| **mismatch** | — | `push` したものを `dismiss` で閉じる等のねじれた組み合わせ。エラーにせず、処理系は実行時に警告してよい |

## 共有状態

| 用語 | 記号 | 意味 |
|---|---|---|
| **singleton** | `#!` | 状態を共有する部品。同じ定義の一か所で状態パターンを変えると、ほかの使用箇所にも反映される。共有は同じ実行内、同じ定義ファイルの component ごと。永続保存や利用者間共有ではない |
| **state verb** | `set(X##v)` | singleton の共有状態パターンを変える。画面の移動や独立表示の開始はしない |

## 構造で判定する存在と、人が選ぶ分岐

| 用語 | 記号 | 意味 |
|------|------|------|
| **presence gate** | `行動(対象?)` | 対象の存在による操作可否の判定。`?` を付けたときだけ、参照先の現在の状態パターンの実効 body（共通＋固有）に対象要素があるかを処理系が調べる。画面上の可視性とは異なる。未定義の参照先など判定不能な場合は有効とする |
| **always-on** | `?` なし | presence gate を付けない行動の既定。書かれた variant のスコープで常に有効。旧称: 常在 |
| **condition label** | `[...]` | 試すケースの目印。成功／失敗などをシミュレータでは人が選ぶ。処理系は業務条件を自動判定しない。旧称: 条件ラベル／分岐ガード |

## 状態と条件式の区別

shitae は状態を扱う。データ値や任意の条件式で計算するのではなく、名前を付けた状態パターンで表す。`state` は状態一般を指す語として使えるが、定義された一つのパターンを指すときは `variant` と書く。

- **guard** は任意の式を評価する動的ガードと紛れるため、presence gate や condition label の同義語として使わない。
- **switch**（variant change の意味で） — transition verb の `switch` と衝突する。

## 内部構造を調べるときの用語

| 用語 | 意味 |
|---|---|
| **frame / frame tree** | frame は (component, variant) を積むスタック1本と、戻る境界などを持つ実行中の単位。その親子構造が frame tree。単に「画面」とは訳さない |
| **anchor frame** | タブ群への入場を担う名前付き frame（例: `present(ホーム, @tabHome)`）。旧称: 錨フレーム |
