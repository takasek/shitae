# SPEC stress-test レビュー + CLI 実測ログ（2026-07）

pfdsl ADR-0020 の手法（境界例の手トレース + CLI 実測突合）を shitae に適用した記録。
SPEC.md（唯一の正）の normative な記述ごとに境界例（`cases/*.shitae`）を作り、spec の字義で pass / error / 未定義まで詰め、CLI（`node packages/cli/dist/index.js check`）と AST ダンプ・実装読解で突合した。
spec の字義と実測の食い違いはそれ自体が finding。

判定記号: ❌ = 矛盾・欠陥（spec または実装の修正を要する） / ⚠️ = 未定義・暗黙（明示決定を要する） / 💭 = 設計議論の余地（現状維持も可）。

agent 実書きプローブの記録は `probes/*/`、frame 木オラクルは `oracle/` を参照。

---

## 1. spec ↔ 実装の乖離（黙って落ちる系）

### S1 ❌ document common が parser で黙殺される

SPEC「document common（最初の `#` より前）」は全 component 共通の要素・インタラクション（deep link・強制ログアウト等）を定めるが、AST に document common の置き場が無く（top-level は imports / components のみ）、最初の `#` より前の行は parser 内の使い捨て配列に流れて**診断なしで消える**（`parser.ts` の `currentElements()` / `currentInteractions()` が builder 不在時に `[]` を返す）。
検証済み example の `docs/examples/battle.shitae` 冒頭 2 行（プッシュ通知・セッション切れ）も現状は消えている。

### S2 ❌ `switch` が TransitionWord に無く、自然文 effect に化ける

SPEC の予約語は 7 語（コア 4 + compound 3）だが、実装の `TransitionWord`（`packages/ast/src/index.ts:89`）は `switch` を欠く 6 語。
`switch(ランキング, @tabRanking)` は「transition verb なしの自然文 = 副作用」規則に落ちて effect として黙ってパースされる（battle.shitae の 2 箇所で実測）。
エラーにならないのは shitae 自身の effect フォールバック規則のせいで、**予約語の追加が既存文書を静かに壊す**構造問題でもある（→ S19）。

### S3 ❌ 矢印重複 `-> R -> R` は「構文エラー」明記だが、実測は黙って破棄

SPEC は「矢印 `->` は 1 行に 1 つだけ。重ねるのは構文エラー」と 2 箇所で明記する。
実測（c09）: `> タップ(保存) -> goto(詳細) -> back()` は診断ゼロで、2 つ目の矢印以降（`back()`）が AST から消失する。

### S4 ❌ quoted name の値が出現位置で食い違う（quote 剥がしの非対称）

要素行の `"料金 // 税込"` は name = `料金 // 税込`（quote を剥ぐ）だが、行動対象の `タップ("料金 // 税込")` は name = `"料金 // 税込"`（quote が残る）（c06 実測）。
同じ表記が別の値になるため、要素と対象参照の照合（presence gate・shadow・要素参照）が quoted name では全滅する。
なお quote 内の `//` `->` `;` はいずれも正しく名前の一部になった（lexer は quote を優先する）。spec 側にも「quoted name の正準値は quote を剥いだ文字列」という規定は無い（⚠️ 併記）。

### S5 ❌ presence gate（`?`）が完全未実装

parser は `existsGated` を AST に載せるが、simulator・mermaid・xstate・checker・runtime のどれも参照していない（grep 全滅）。
SPEC が 1 節を割く主要機能が下流で無効。

### S6 ❌ `back(X)` の barrier 越え: 実装「壁を越えてよい」vs spec の字義

runtime（`packages/runtime/src/index.ts` back(X) 分岐）はコメント付きで壁を越えて pop する。
SPEC「戻り先が無いとき」は「`back()` / `back(X)` / … で戻り先が見つからない場合（back barrier に当たる、…）は no-op」と back(X) も barrier 対象に読める。
ただし spec 側も「barrier に当たる」が back() のみを指すのか back(X) を含むのか一文で曖昧（⚠️ 併記）。どちらかに明示決定が要る。

---

## 2. 暗黙になっており定義したほうがよい制約

### S7 ⚠️ shadow「(行動文字列, 対象参照) 完全一致」の判定単位が未規定

c01 実測 + `resolver mergeInteractions` 読解:
- 空白差（`タップ (戻る)`）は lexer 正規化で一致する（spec は正規化を規定しない）
- quoted 差（`"戻る"` vs `戻る`）は S4 の非対称のせいで不一致
- presence gate 差（`戻る?` vs `戻る`）は実装が `existsGated` を無視して**一致（shadow する）**

`?` を一致判定に含むか・文字列正規化の規則を spec が明示すべき。

### S8 ⚠️ presence gate の「対象が存在する」の判定基準が未規定

「その variant に対象が存在する時」の存在が、(a) 要素行の実体名と照合か alias 名と照合か（参照は alias で引く規則との整合）、(b) inline 内の要素（`箱: { 投了 }` — `.` 1 段では裸名で届かない位置）を数えるか、(c) collection `*投了` を数えるか、いずれも読み取れない（c02）。
実装が無い（S5）ため実測でも確定しない。gate を実装する前に spec の決定が要る。

### S9 ⚠️ 存在しない variant への遷移が全て素通り

`goto(単一##特別)`（variant を持たない component への variant 指定）、`goto(##無いvariant)`（未定義 variant）とも診断なし（c03）。
未定義 component への遷移は「ラフに置いただけ」で正当だが、**定義済み component の未定義 variant** は typo の公算が大きい。W102（variant 名を component 位置に書いた）だけが手当てされていて非対称。

### S10 ⚠️ document common からの `##variant` 参照の意味が未規定

`##X` は「同一 component 内の variant」だが、document common には「同一 component」が存在しない。
遷移元の component の `##X`（動的）か、エラーか。実装は S1 で document common ごと捨てるため観測不能（c03）。

### S11 ⚠️ 参照 2 段 `箱.内箱.b` が member = "内箱.b" として素通り

EBNF は `.` 1 段までだが、実測は 2 段目以降を member 名に丸めて診断なし（c05）。
inline の入れ子（`{ a ; { 内箱: { b } } }`）は EBNF 上書けるのに内側へ参照が届かない「書けるが指せない」構造も未言及。

### S12 ⚠️ nav-target への `?`（`push(次?)`）が名前に取り込まれる

EBNF 上 `?` は行動対象のみだが、実測は `次?` という名前の component への遷移として素通り（c10）。
presence gate の位置制約（行動対象のみ）を spec が散文でも明示し、処理系はエラーにすべき境界。

### S13 ⚠️ `goto`（component）が begin 地点を消す — セッションの生死が未規定

runtime は component への goto で最上段フレームを `beginsSession: null` に全置換する。
`push(X, @S)` → X で `goto(Y)` → `exit(@S)` は @S がスタックに無く no-op（R002 警告）になる。
SPEC は「goto は積まずに begin 地点を消すため、畳む基点になれない」を goto がセッションを**開始できない**理由として書くだけで、**既存セッションの begin 地点を goto が破壊する**かは未規定。

### S14 ⚠️ `dismiss()` は名前付きセッションを飛ばして「直近の無名」を破棄する

c04: ホーム → present(A)（無名）→ present(B, @named) → B で `dismiss()`。
実装（closeSession の name=null 走査）は @named を飛ばして A を破棄し、@named ごと畳んでホームに戻る。
「直近に開いた無名セッション」の字義とは整合するが、「名前付きを飛ばす」「飛ばした名前付きは子孫として道連れ」は明文が無い。

### S15 ⚠️ 循環 import・同名 alias の二重 import が未規定（診断なし）

a→b→a の相互 import は visited set で黙って許容、`import x as m` の同名 alias 再定義も診断なし（c07）。
許すなら許すと、上書きなら上書きと明示が要る。

### S16 ⚠️ 同一 condition label の再出現の帰属

`[成功] A ; [失敗] B ; [成功] C` — spec は「次の**別の**ラベルが現れるまで」と言うが、同一ラベルの再出現時に C が最初の [成功] 群と合流するのか独立の選択肢なのか読み取れない（c08）。
実装は resolver（effectiveResults）がラベルを引き継ぎ、simulator（extract.ts）は隣接同名のみ合併するため**分裂した 2 つの選択肢**になる。

### S17 ⚠️ 診断コードレジストリが spec に無い

実装が発行する E003 / E005 / E006 / E007 / E010 / P 系 / W101〜W103 / R001〜R004 が spec のどこにも列挙されていない。
E005（component 二重定義）・E006（variant 二重定義）に至っては**エラーであるという規定自体が spec に無い**（c10 で実測エラー）。
pfdsl レビューの F8 と同型 — spec §に「コード / 条件 / severity」の表を置き、実装との突合を機械化できる形にする。

### S18 ⚠️ runtime は線形スタックで、frame 木の規則群が未実装

switch（S2）に加え、exit/dismiss の「アクティブパス走査 → 見つからなければ木全体から遠隔破棄」「@S と子孫フレームを全部破棄」「switch の兄弟規則」は runtime に対応物が無い。
switch を使わない文書では木は一本道（SPEC 自身の言明）なので現状の線形近似は S2 が直るまでの過渡と整理できるが、その旨をどこにも書いていない。

---

## 3. 設計議論（💭）

### S19 💭 「認識しない語は自然文 effect」フォールバックの功罪

未定・自然文を許すラフさの核である一方、(a) transition verb の typo（`gotoo(X)`）、(b) 予約語の将来追加（switch が現に踏んだ）、(c) verb 書き忘れ（`-> 完了`）がすべて**黙って副作用**になる。
spec は (c) を「ラフさの代償」と明記するが、「`語(引数)` の形をした effect」（関数呼び出し形の自然文）だけは lint が疑ってよい、のような回収可能性を spec が示す余地がある。

### S20 💭 エントリポイント規則と「ファイル先頭の component」の脆さ

エントリ = ファイル先頭の component は、example のように「枝葉の画面を後ろにまとめる」書き方と相性が良いが、先頭に部品定義を書いた文書が黙って壊れる。処理系警告の指針が無い。

---

## 4. 実測サマリ

| case | 例 | spec の字義 | 実測 | 帰結 |
|---|---|---|---|---|
| c01 | shadow の空白差/quoted 差/gate 差 | 「完全一致」の単位が読めない | 空白=一致・quote=不一致・gate=無視で一致 | S4 S7 |
| c02 | gate の存在判定（alias 越し・inline 内） | 読めない | gate 自体未実装 | S5 S8 |
| c03 | 未定義 variant への遷移・doc common の ##参照 | 読めない | 全て素通り・doc common は消失 | S9 S10 S1 |
| c04 | 名前付きを挟んだ dismiss() | 「直近の無名」 | 名前付きを飛ばし子孫ごと破棄 | S14 |
| c05 | 参照 2 段・inline 入れ子 | EBNF は 1 段まで | member="内箱.b" で素通り | S11 |
| c06 | quote 内の `//` `->` `;` | 名前の一部のはず | 名前の一部になるが quote 剥がしが非対称 | S4 |
| c07 | 循環 import・同名 alias | 未規定 | 診断なしで許容 | S15 |
| c08 | 空 result-list・同一ラベル再出現 | EBNF は 1 個以上・「別の」が曖昧 | E003 エラー / 選択肢が分裂 | S16 S17 |
| c09 | 矢印重複・先行なし継続行 | どちらも構文エラー明記 | E010 のみ。矢印重複は黙って破棄 | S3 |
| c10 | 重複定義・push(次?) | 未規定 / EBNF 外 | E005・E006 エラー / `次?` 名で素通り | S17 S12 |
| battle | document common・switch | 主要機能 | 黙殺 / effect 化 | S1 S2 |
