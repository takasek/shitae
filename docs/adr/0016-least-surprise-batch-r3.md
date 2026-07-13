# ADR-0016: 驚き最小バッチ r3 — 小物の確定（E027/E028/R005・doc common 帰属・文書明記方針）

- Status: accepted（2026-07-14、設計者承認）
- 出典: stress-test r3 — findings A3/B2/B4/C2/C3/C4。いずれも驚き最小で一意に決まるか、設計者が方針を一言で確定したもの

## B2: アクティブ最上段が未定義 component のときの document common 帰属

**決定**: 未定義 component は**参照元ファイルに属する**とみなす。B のファイルの画面から push した未定義 component の表示中は、B の document common が効く。実装（`navTargetToLocation` の `target.module ?? current.module`）の現状どおり。SPEC に 1 文追記。

## A3: overlay verb の裸 `##variant` — E027 新設・show/hide 統一

**決定**: `show(##v)` / `hide(##v)` はともに **E027**（overlay verb の引数が裸 `##variant`。母体 component が無い）。従来 `hide(##v)` は E020（「hide に ##variant」）に偶然引っかかっていたが、指摘の本質（母体なし）が違うため E027 へ付け替える。E020 は `hide(X##v)`（component 付き）専用に戻る。

## B4: 同名 `@S` の連続 begin — SPEC 正面説明 + R005 実行時警告

**決定**: 意味論は変えない（同名 @S の begin は入れ子になり、exit/dismiss は LIFO で直近——既定どおり）。対策 2 本:
1. SPEC「セッション」節に「同名 @S を続けて begin すると何が起きるか」の正面説明を追加（セッションは『フロー全体に付けるタグ』ではない、begin は 1 回、を明記）。
2. **R005**（runtime warning）: アクティブパス上に**生存する同名 @S** がある状態での再 begin（`push`/`present`）を警告。プローブ実証の誤読（毎遷移に `@checkout` タグ付け → 出口が壊れる）を実行時に可視化する。**`switch` は対象外**——switch の resume-or-create は木全体で @S の生存を見るため、新規作成に分岐した時点でアクティブパス上にも同名 @S は存在し得ず、この警告条件は switch では論理的に到達不能（転記元整合レビュー G6）。

## C4: singleton × collection — E028 新設

**決定**: singleton に `*` を付けるのは**エラー**（E028）。「単一インスタンス」と「複数ある」は矛盾する。
- 対象: 宣言側の要素行（`*バッジ` で バッジ が解決可能な singleton）と、参照側の行動対象（`行動(*バッジ)`）の両方。
- checker で検出（parser は名前の singleton 性を知らない）。未定義名・解決不能は従来どおり素通り。
- nav-target の `*` は既存 E021 がカバー（変更なし）。

## C2: gate の「対象=条件源」制約 — 記法追加せず明記のみ

**決定**: gate は「対象自身の状態で対象自身への操作を制御する」型のみ、と SPEC に明記。対象と条件源が別のケース（ハートの状態でレッスン開始ボタンを制御）は variant 分割＋`set`（ADR-0014）で表す、への誘導を書く。条件源分離記法はガード式への半歩であり導入しない。

## C3: collection の空判定 — 注記のみ

**決定**: 記法を追加しない。`*手札?` が `*` を剥いで単一判定になるのは ADR-0010 のとおり。「collection が空でないこと」を条件にしたければ condition label で注記する、と SPEC collection 節に 1 文。

## Consequences

- 診断コード表: E027・E028・R005 追加、E020 の条件文言を「`hide(X##v)`（component 付き）」に限定明確化。ADR-0014 の E029/E030/W105 拡張と合わせて一括改訂。
- 実装: parser（E027。hide 裸## の E020 発火を E027 へ）→ checker（E028）→ runtime（R005）。
- SPEC 文書改訂は findings D1〜D8 と合流して 2 pass（意味論 / 小物）で行う。
