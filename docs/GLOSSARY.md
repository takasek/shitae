# shitae Glossary — 用語集

shitae の概念語の正準名。SPEC・AI_GUIDE・スキル・examples はこの語彙で書く。構文記号・遷移語の意味の詳細は `SPEC.md`（唯一の正）を引く。

## 構造

| 用語 | 記号 | 意味 |
|------|------|------|
| **component** | `#` | 設計の唯一の単位。画面でも部品でもある。組み込みの特権 component は無い |
| **variant** | `##` | 1 つの component が取りうる見た目の状態（読込中／表示中、未フォロー／フォロー済 など）。旧称: 姿。Figma の component variants と同じ発想。状態を条件式でなく variant の列挙で表す |
| **initial variant** | — | variant 指定なしの遷移で開く、最初に定義された variant |
| **single variant** | — | `##` を 1 つも書かない component が持つ、ただ 1 つの variant（＝従来の画面） |
| **variant change** | `goto(##X)` | 同一 component 内で variant を切り替えること。旧称: 姿替え |
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

## 遷移

| 用語 | 記号 | 意味 |
|------|------|------|
| **transition verb** | — | 遷移を表す予約語。コア 4 語 `push` `back` `goto` `exit` ＋ compound verb 3 語 |
| **compound verb** | — | 壁・セッションにまつわる意図を一語に束ねた複合遷移語: `present` `dismiss` `switch` |
| **session** | `@S` | 開始して、まとめて破棄する、ひとまとまりの期間。`push`/`present`/`switch`（新規作成時）で開始し `exit`/`dismiss` で破棄 |
| **back barrier** | — | モード内から通常の `back` で外に出られない性質。旧称: back の壁。`present` と `switch` が立てる |
| **frame / frame tree** | — | 処理系の内部モデル。frame ＝ (component, variant) を積むスタック 1 本＋barrier の有無。frame が木をなす |
| **anchor frame** | — | タブ群への入場を担う名前付き frame（例: `present(ホーム, @tabHome)`）。旧称: 錨フレーム |
| **mismatch** | — | `push` したものを `dismiss` で閉じる等のねじれた組み合わせ。エラーにせず、処理系は実行時に警告してよい |

## 条件（どちらも評価しない）

| 用語 | 記号 | 意味 |
|------|------|------|
| **presence gate** | `行動(対象?)` | opt-in の静的な注記。その variant に対象が存在する時だけ行動が有効。旧称: 存在ゲート |
| **always-on** | `?` なし | presence gate を付けない行動の既定。書かれた variant のスコープで常に有効。旧称: 常在 |
| **condition label** | `[...]` | 分岐の目印となる注記。評価しない。旧称: 条件ラベル／分岐ガード |

## 避けた語（採用しない理由）

- **state** — 設計原則「状態は条件式ではなく variant で表す」と自己矛盾するため使わない。
- **guard** — XState の動的ガード（評価式）と紛れる。shitae の条件は評価しない注記のみ。
- **switch**（variant change の意味で） — transition verb の `switch` と衝突する。
