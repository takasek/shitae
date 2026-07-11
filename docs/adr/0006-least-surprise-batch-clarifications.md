# ADR-0006: 驚き最小原則による未規定箇所の一括明確化

- Status: accepted（2026-07-12。設計者が「驚き最小で決まるものは機械的に確定してよい」と一括承認。個別判断を要した 5 件は ADR-0001〜0005）
- 出典: stress-test 2026-07 findings B 群 + 転記元整合レビューの残余指摘

## Decision（各 1 行。番号は findings-2026-07.md の B 群）

- **B1** result-list の複数遷移は**左から順に適用**し、後続は直前の遷移が変えた状態に効く。慣用句 `exit(@S) ; push(固定先)`（ADR-0005 の前提）。
- **B2** `goto`（component 置換）は現在フレームの **begin マーカーを保存**する（オラクルで読者期待を実測 — 実装の「破壊」は修正対象）。
- **B4** `dismiss()` は名前付きセッションを**飛ばして直近の無名**を破棄（飛ばしたものは子孫として道連れ）。named 指定時の `exit(@S)` と `dismiss(@S)` は**同義**（開始 verb を問わない。runtime R001 の present→exit 警告は誤りで撤去）。
- **B6** shadow の「完全一致」= 行動文字列は字句正規化後の比較、対象参照は quote を剥いだ name の等価、`?` は一致判定に**含めない**。
- **B7** document common からの裸 `##variant` は**禁止**（`component##variant` を要求）。SPEC の document common 例は `goto(ログイン)` → `exit(@loggedIn)` に差し替え。前方参照は可。
- **B8** alias は宣言された single-body に**ローカルで component 名より優先**。component 名と一致する bare 要素名は警告対象。inline の入れ子は 1 段まで（超えたらエラー、component へ昇格を促す）。
- **B9** 補遺: 同名 @S の遠隔破棄は**作成が最も新しいもの**。barrier なし子フレームの底での `back()` は子フレームを破棄して**親フレームへ抜ける**。`switch(X, @S)` は開始 verb を問わず生存中の @S へ復帰できる。frame 木のプロセス跨ぎ生存は shitae の意味論の**範囲外**（注記のみ）。
- **B10** 継続行は `#`/`##` 境界を越えない。同一 condition label の再出現は**合流**（同一条件の再指定）。collection の順序は未保証。循環 import は許容、同名 alias の再 import は**エラー**。component/variant の重複定義はエラー（実装 E005/E006 に規定を追随）。component 0 個の文書は不正。free-text は丸括弧を含めない（含む場合は quoted name）。quoted name の正準値は quote を剥いだ文字列。診断コードレジストリ表を SPEC に新設。
- **gate × overlay は別軸**: gate は構造的 presence のみで掲示状態を見ない。オーバーレイ component の interaction は掲示中のみ有効（overlay 節の規則）。gate の存在判定は「その参照表記で解決できる要素があるか」に統一（裸参照は body 直下、member 参照は 1 段先まで。`*` 前置参照の照合は `*` を剥いだ名）。
- **overlay verb の正式語は `show` / `hide`**。設計原則 3 は「キーワードは transition verb と overlay verb のみ」に改める。

## Consequences

SPEC 改訂（2 pass）でこの表を全反映し、実装（parser/resolver/runtime/simulator）を TDD で追随させる。個別の背景・証拠は findings-2026-07.md と probes/oracle の採点記録を参照。
