# shitae SPEC stress-test round 2 — 手トレース + CLI/runtime 実測（2026-07-12）

round 1（`spec-review-2026-07.md`）の Phase 4 反映（SPEC pass1/pass2・E012〜E021・frame 木 runtime・simulator 整合）後の再検査。焦点は新規/変更構文: document common・switch/frame 木・overlay show/hide・collection 対称参照・ADR-0006 決定の実装追随。

境界例: `cases/c11*〜c17*.shitae`。runtime トレース: `oracle/run-oracle-r2.mjs`（9 本、手トレース予測 9/9 的中）。

判定: ❌ = 矛盾・欠陥 / ⚠️ = 未規定 / 💭 = 設計議論。

---

## round-1 A 系の regression 検査

| # | round-1 finding | 現状 |
|---|---|---|
| A1 | document common が parser で黙殺 | ✅ 解消（c11 が AST・simulator に乗る） |
| A2 | `switch` が effect 化 | ✅ 解消（c12 pass、mermaid edge 描画、runtime 対応） |
| A3 | `-> R -> R` 黙って破棄 | ✅ 解消（E012 発火） |
| A4 | quoted name の正準値不整合 | ✅ 解消（c17: `"閉じる"` と `閉じる` が shadow 照合で一致） |
| A5 | presence gate が AST 止まり | ❌ **未解消**。`existsGated` の消費者は resolver の「shadow 一致で無視する」のみ。simulator は gate 付き interaction を常に有効表示（c16）。SPEC は操作的定義を持つのに実行系が判定しない |
| A6 | R001 ねじれ警告 | ✅ 撤去済み（src に R001 なし） |
| A7 | 線形スタック | ✅ runtime はフレーム木化。ただし simulator は線形近似のまま（下記 S9・S10） |

## 新規 findings（S 番号は r2 通し）

### S1 ❌ document common の裸 `##variant` 禁止が未実施・診断コード欠番

SPEC「document common」は裸 `##variant` を**禁止**と明記するが、c11b は診断ゼロで pass。AST には `{kind:'variant'}` がそのまま乗り、simulator では「現在画面の variant 切替」として動く（禁止した理由＝母体不定、がそのまま実挙動になっている）。診断コード表にも該当コードが無い — 規範だけあって施行も欠番もない。

### S2 ❌ `show(X##v)` の variant 指定が全下流で捨てられる

EBNF は `show(X##v)` を許し「掲示時の variant を選ぶ」と規定。parser は AST に variant を保持する（c13 実測）が、runtime `reduceOverlay` も simulator extract も `target.name` しか見ない。`show(ミニプレイヤー##再生中)` と `show(ミニプレイヤー##一時停止)` が同一の掲示になり、掲示中 variant という概念が実行状態に存在しない。

付随の未規定（⚠️）: 掲示中に別 variant で再 `show` したら variant は更新されるのか、no-op か。SPEC は集合の追加/除去しか定義していない。掲示中 component の interaction が `goto(##v)` を実行したときオーバーレイの variant が変わるのかも未規定（オーバーレイはフレームに居ないので `goto(##v)` の「現在フレームの最上段」規則が適用できない）。

### S3 ❌ `show(*トースト)` が `*` を名前に取り込んで黙って通る

E021 は transition の nav-target 専用で、overlay 引数はチェック外。`show(*トースト)` は **name = `"*トースト"`** として AST に乗る（実測）。以後 `hide(トースト)` と照合不能な別 ID になる。文法上 overlay 引数に `*` は書けないのだから、E021 相当をかけるか名前から弾くべき。

### S4 ❌ shadow の空白畳み込みが未実装

SPEC B6「行動文字列は字句正規化後（空白の畳み込み等）の比較」。実装（resolver `actionMatches`）は `act1.text === act2.text` の生比較。c17 実測: `ダブル タップ(項目)` と `ダブル  タップ(項目)`（空白 2 個）が shadow されず両方残る。quote 剥ぎ ✓・`?` 無視 ✓ は実装済みなので、空白だけ欠け。

### S5 ⚠️ shadow 一致と `*`（collection 対称参照）の交差が未規定

SPEC B6 の字義は「対象参照は quote を剥いだ **name** の等価」— ADR-0004 より前の文言で、`*` 前置に言及がない。実装 `referencesEqual` も `collection` フラグを比較しない → `スクロール(*手札)` と `スクロール(手札)` は互いに shadow する。しかし ADR-0004 の意味論では両者は**別の対象**（全体 vs 1 インスタンス）。SPEC の明示決定が要る（驚き最小は「`*` の有無は一致判定に**含める**＝別行動」side と思われるが、`?` を含めない決定との対称性の整理が要る）。

### S6 ❌ 3 階層 shadow が document common 階層で未実装

SPEC「shadow 規則も同じ原理で拡張される（variant 固有 > component common > document 共通）」。simulator は document common を別枠（「どの画面でも」帯）で常時表示し、component 側の同一 (行動, 対象) と照合しない。c11 実測: ホームの各 variant に `タップ(戻る)` が居るのに、document common の `タップ(戻る) -> back()` も並んで押せる — 同一行動のボタンが 2 つ、挙動が異なる。

### S7 ❌ simulator の `dismiss()` が「無 session の push フレーム」を無名セッション扱いで pop

simulator の線形 stack は全フレームが `sessionName` を持ち、素の `push` も `null`。`dismiss()` は `sessionName === null` の直近フレームを探すため、**素の push 直後の dismiss() が pop として成立してしまう**。SPEC では mismatch（無名セッション不在なら no-op + 警告可）。runtime は正しく R002 no-op。simulator だけ乖離。

### S8 ⚠️ 掲示中 component の interaction が simulator で操作不能

SPEC「掲示中の component の interaction はどのフレームがアクティブでも有効」。simulator のオーバーレイ帯は component 名の表示のみで、interaction を押せない。ミニプレイヤーの「タップ(曲名) -> push(プレイヤー)」（c13）が実行不能。

### S9 ⚠️ simulator の switch 近似が「中断＝保持」を破る

simulator は resume を `stack.slice(0, idx+1)`（対象より上を**破棄**）で近似。SPEC の switch は「中断（破棄しない）」が核。タブ A で深く潜る → タブ B → タブ A 復帰、で潜った状態が消える。コード内コメントは近似と認めているが、simulator は stress-test の正解器の 1 つ — 採点誤誘導リスクあり。少なくとも制限を利用者向けに明示するか、frame 木（@shitae/runtime）へ載せ替えるか。

### S10 ⚠️ document common のモジュール横断スコープ

SPEC は「**そのファイルの**全 component に共通」（ファイル単位スコープ）。simulator はエントリモジュールの document common を import 先の画面にも常時表示し、import 先ファイル自身の document common は無視する。「auth::ログイン画面を表示中、エントリファイルの deep link は効くのか？ auth.shitae 自身の document common は？」に SPEC も答えていない（ファイル単位と書いてあるだけで、実行時にどのファイルの common が生きるかは未規定）。

### S11 ⚠️ switch の入れ子トラップ — 兄弟規則が push/present フレームを親にする（T1）

タブ内で `push(記事, @reading)` → 記事から `switch(検索, @tabSearch)` すると、現在フレームが switch 製でないため検索タブは**push フレームの子**になる。`exit(@reading)` が検索タブを子孫として道連れ破棄（T1 実測: 警告なしで検索タブ消滅）。兄弟規則の動機（「exit がタブを道連れにする事故を防ぐ」）が、タブ以外のフレームを挟んだ瞬間に再発する。実装は SPEC の字義に忠実 — 穴は SPEC 側。決定候補: (a) 現状を仕様とし「タブバー部品の switch はタブフレーム直下でだけ押される」を慣用句側の前提として明記、(b) 兄弟規則を「最も近い switch 製祖先の兄弟にする」へ強化。

### S12 ⚠️ back(X) のフレーム越えと対応表の矛盾（T2）

「フレーム木」節は back(X) の走査を「アクティブパス（祖先方向）」と言い、実装も barrier なしフレーム境界を**越えて**遡り、越えた子フレームを begin マーカーごと破棄する（T2 実測: `back(ホーム)` が @S を消し、後続 `exit(@S)` が R002）。しかし verb 対応表の back(X) 行は before/after とも「**同じ F**」と書く — フレーム越え動作と矛盾。また「越えた子フレームは破棄される（begin マーカー喪失）」はどこにも書かれていない。表の修正 + 破棄の明記が要る。

### S13 💭 タブ再タップが「タブの底へ戻る」にならない（T3）

`switch(A, @S)` で自分のフレームへ resume すると最上段のまま（T3: B に居続ける）。SPEC の字義（中断位置へ復帰）どおりだが、実 UI のタブ再タップは「タブのルートへ戻る」が通例。慣用句（`switch` 後に `back(A)` 等）を示すか、SPEC に「再タップで底へ戻したければ…」の一言があると誤設計を防げる。

### S14 ⚠️ `switch(##v, @S)`（裸 variant target の新規作成）が黙って通る（T6）

文法は nav-target に `##v` を許すため `switch(##展開, @weird)` が「同一 component 別 variant の新フレーム」を作る（T6 実測）。variant 切替のつもりで書いた読者はフレームが増えると思っていない。goto(##v) との差が劇的なのに無警告。E 化（switch/present/push のフレーム新規作成系に裸 ##v を禁じる）か、意味の明文化が要る。

### S15 ⚠️ 同名 @S の解決規則が exit と switch で非対称

exit/dismiss は「まずアクティブパスを LIFO → 無ければ木全体で最新」。switch 復帰は「木全体で最新」のみ（アクティブパス優先なし）。実装も同じ。意図的ならよいが、SPEC は非対称であることを明示していない（読者は同じ規則と思って読む）。

### S16 💭 mermaid の overlay 不可視・member 参照ラベル落ち

`show`/`hide` は mermaid に一切現れない（c13: プレイヤー→ミニプレイヤーの関係が消える）。edge label も `タップ(タブバー.検索)` が `タップ(タブバー)` に落ちる。図示の網羅性の問題（D 系）。

### S17 ✅ 新診断は全部実発火

c15/c15b で E012・E013・E014・E015・E016・E017・E019・E020、c14 で E021 の発火を確認。cascade で他の診断が止まることもない。

## 実測サマリ

| case | 予測 | 実測 | 一致 |
|---|---|---|---|
| c11 document common 正常系 | 診断ゼロ | 診断ゼロ | ✓ |
| c11b 裸 ##variant | SPEC 禁止（コード欠番） | 素通り | ✓（S1） |
| c12 switch 慣用句 + ##v target | 診断ゼロ | 診断ゼロ | ✓（S14） |
| c13 overlay 境界 | show(*X) 挙動不明 | `*` が名前に混入 | S3 |
| c14 対称参照 + E021 | E021×1 | E021×1 | ✓ |
| c15 新 E コード 7 種 | 各 1 発火 | 各 1 発火 | ✓ |
| c15b E017 | E017 | E017 | ✓ |
| c16 gate 操作定義 | 診断ゼロ（実行系未判定） | 診断ゼロ | ✓（A5 未解消） |
| c17 shadow 一致単位 | quote✓ ?✓ 空白✗ | 同左 | ✓（S4） |
| T1〜T9 runtime | 手トレース 9 本 | 9/9 一致 | ✓ |
