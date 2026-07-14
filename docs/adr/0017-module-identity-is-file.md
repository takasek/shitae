# ADR-0017: モジュールの同一性はファイルで決まる — alias は参照側の表記にすぎない

- Status: accepted（2026-07-14、設計者承認「驚き最小。それでも重複し不定になるならできるだけ早いフェーズで compile error」）
- 出典: stress-test r3 の既知残課題（旧 HANDOFF-r3「simulator の module 語彙正規化」）。参照側の module（import の alias）と処理系内部のモジュールキー（ファイル名）が別語彙のまま突き合わされ、alias ≠ ファイル名のとき doc common 切替・singleton キー・gateTargets がズレていた

## Decision

- **モジュールの正準識別子はファイル**（`import` に書くモジュール名 = 拡張子省略のファイル名/パス）。alias は「そのファイル内で使う参照側の別名」にすぎない。
- **同一ファイルを別 alias で import しても同一モジュール**——同一の singleton 共有レジストリ・同一の document common を指す。
- **モジュール参照（`alias::X`）の解決は、参照が書かれたファイルの import 表経由のみ**。import 表に無い alias の参照は未解決のまま素通し（未定義 component と同じラフさの扱い。エラーにしない）。
- この解決規則の下で不定になる組み合わせは残らない——同一ファイル内の alias 重複は既存 E017（compile error）が塞いでいる。新しいエラーコードは導入しない（不定が見つかったら early-phase の compile error として追加する、が設計者方針）。

## Consequences

- SPEC「モジュール化」節に 1 文追記（alias は別名・同一性はファイル・別 alias 同一ファイルは同一モジュール）。
- resolver: alias → 正準モジュール名の解決ヘルパを一元提供（`Document.imports` から引く）。
- simulator extract: 変換時に全 module フィールド（transition target・overlay・set・member gate）を正準名へ正規化。以降 client 内の module 語彙は documents map のキー（ファイル名）に統一される。
- runtime は正準名を受け取る前提のまま不変（ADR-0013 の「module 語彙の正規化は呼び手の責任」をここで履行）。
- 合わせて runtime の overlay エントリに module を持たせ、module 修飾つき singleton の掲示解決（旧 HANDOFF-r3 残課題 2）を解消する。
