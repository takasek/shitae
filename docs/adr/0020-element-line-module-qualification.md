# ADR-0020: 要素行の ref に `[module ::]` を許す（文法拡張）

- Status: accepted（2026-07-15、設計者承認 — findings 提案どおり「要素行の `::` を許す」で確定）
- 出典: stress-test r4 — findings C1（表現力ギャップの実証）+ A3（黙って崩れるバグの解消）

## Context

`::` は現行文法では行動対象（interaction の対象）と nav-target（遷移先）にしか書けない。
「他モジュールで定義した component を画面の要素として置く」ことが文法上不可能で、smarthome プローブ
（実書き）の被験者はローカルに同名の placeholder 要素を置き、遷移先だけ `devices::` 修飾するという
回避行動を取った——見えている要素と遷移先が別名前空間の同名語になり、初見の書き手が事故りやすいと申告。

この文法制約により、要素行に `mod::部品` を書いてしまった場合（回避せず素直に書いた場合）、parser は
エラーにせず `mod` を消失させ `:` が残留した壊れた ref（`name:":部品"`）として受理していた（A3）。
未定義 component 扱いですらない幽霊名になり、実害は「素通りしたのに動かない」という驚きだった。

モジュール分割で部品カタログ（デバイス・共通部品）を別ファイルに切るのは自然な構成であり、その要素配置が
毎回この回避を要求するのは表現力ギャップと判断した。

## Decision

- element-line の ref に `[module-name , "::"]` を許す。EBNF:
  `ref = [ module-name , "::" ] , name`（element-line 側。interaction 対象・nav-target の `::` は
  既存のまま変更しない）。
- alias（`x: mod::部品`）・collection（`*mod::部品`）とも組める。
- collection × 他モジュール singleton の組み合わせは **E028** の対象——singleton に `*` は付けられない
  という既存規則が、module 修飾の有無に関わらず適用される。B2（プロジェクト単位検査）により、この違反が
  cross-module 参照でも検出可能になる。
- presence gate の裸参照判定・W101（alias 重複）/ W103（要素もインタラクションも持たない）への波及は
  実装時にテストで確認する（module 付き ref の存在判定は「そのモジュールの component」で解決する）。
- A3（`mod::部品` が `name:":部品"` に崩れる問題）は本 ADR の正パース化により**解消**する
  ——別修正は不要。

## Consequences

- SPEC: EBNF（element-line / ref）・記号一覧（`::` の説明に element-line も含める）・モジュール化節に
  反映（T3）。
- 実装: parser の element-line 字句分割で module 修飾を認識し `{kind:"ref", module:"mod", name:"部品"}`
  を生成する。既存の裸 ref（module なし）に regression がないことをテストで確認する（T4）。
