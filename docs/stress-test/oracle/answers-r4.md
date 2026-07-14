# オラクル r4 正解（runtime reduce 実測 — run-boundary-r4.mjs）

| 設問 | 実測ケース | 正解 |
|---|---|---|
| Q1 | R7 | アクティブは `確認` のまま・木不変。@co が生存しているため switch は **resume**（begin した verb が push でも対象になる）。`別枝` は開かれない |
| Q2 | M2 | **書き換わらない**。無修飾参照は発火時のアクティブフレームの module（エントリ=null）に解決され、(null, 状態) は singleton でないため no-op。SPEC はこの解決規則を未規定 — 「決められない」申告も正解扱い |
| Q3 | T5 | `学習##ハート切れ`。variant 省略遷移は singleton の共有現在値で開く（initial に戻らない） |
| Q4 | R5 | **出る**。R005 の祖先遡りは barrier（無名 present）を跨ぐ — アクティブパス上に生存する @co がある |
| Q5 | R4+R8 | (i) 出ない（R005 はアクティブパス上のみ。タブA 枝は非アクティブ）。(ii) `タブB`。exit はアクティブパスの直近 @a（push-begin の F3）を畳む。タブA 枝の @a は無傷 |
| Q6 | T6 | `ハート切れ`。singleton の掲示エントリは共有レジストリへの参照であり set が即時反映される |
| Q7 | T2 | no-op（アクティブ・共有とも不変、runtime 診断なし）。静的には checker が E030 を出す分担 |
