# SPEC 境界レビュー r4（2026-07-14）

焦点: set（E029/E030/W105）・E027・E028・R005・gate 動的解決（ADR-0015）・ADR-0017 再検証。手法: 手トレース → CLI check / runtime reduce 直呼び（`oracle/run-boundary-r4.mjs`）で突合。ケースは `cases/c30-r4-*.shitae` 〜 `c35-r4-*.shitae`。

## 実測サマリ

| ケース | 対象 | 期待（手トレース） | 実測 | 判定 |
|---|---|---|---|---|
| c30 a1 `set()` | E029 | error | E029 | ✅ |
| c30 a2 `set(学習)` | E029 | error | E029 **+ W105（空 variant）** | ⚠️ R4-1 |
| c30 a3 `set(##通常)` | E029 | error | E029 | ✅ |
| c30 a4 `set(学習, @s)` | E029 | error | E029 | ✅ |
| c30 a5 `set(*学習##通常)` | E029 | error | E029 | ✅ |
| c30 a6 `set(学習##通常, @s)` | E029 | error | E029 | ✅ |
| c31 t2 `set(通常画面##x)` | E030 | error | E030 | ✅ |
| c31 t3 `set(未定義##v)` | 素通り | pass | pass | ✅ |
| c31 t4 `set(シングル##ない)` | W105 | warning | W105 | ✅ |
| c32 m3 `set(mod::通常##x)` | E030? | 未確定 | **無診断** | ⚠️ R4-2 |
| c32 m6 `set(mod::クーポン##ない)` | W105? | 未確定 | **無診断** | ⚠️ R4-2 |
| c32 m4 `set(壊れ::何か##v)`（未 import alias） | 素通し | pass | pass | ✅ ADR-0017 |
| c33 `set("ク ポン"##受取済)` | 正準値で解決 | pass | pass（W105 も正準名） | ✅ |
| c34 o1/o2 `show(##a)` `hide(##a)` | E027 | error | E027 | ✅（hide の E020→E027 付け替え済み） |
| c34 o3 `hide(ミニ##再生)` | E020 | error | E020 | ✅ |
| c34 o4 `show(mod::##a)` | E027 相当 | error | **無診断・name:"" で AST に着地** | ❌ R4-3 |
| c35 L6 `*バッジ`（宣言側） | E028 | error | E028 | ✅ |
| c35 L7 `*b: バッジ`（alias 付き宣言） | E028 | error | E028 | ✅ |
| c35 L9 `操作(*バッジ)`（参照側行動対象） | E028 | error | E028 | ✅ |
| c35 `show(*バッジ)` / `push(*バッジ)` / `set(*バッジ##通常)` | E024 / E021 / E029 | error | 各コードどおり | ✅（E028 と重複発火しない） |
| import 先に parse error（/tmp 切り分け） | 報告 | error | **黙殺・exit 0** | ❌ R4-4 |

runtime（`run-boundary-r4.mjs`）:

| ケース | 期待 | 実測 | 判定 |
|---|---|---|---|
| R1 push begin 中の再 begin | R005 | R005 | ✅ |
| R2 exit 後の再 begin | なし | なし | ✅ |
| R3 present 経路 | R005 | R005 | ✅ |
| R4 非アクティブパス上の同名 @S | なし | なし | ✅ |
| R5 barrier（無名 present）越しの祖先 begin | R005 | R005 | ✅ |
| R6 無名 present 多段 | なし | なし | ✅ |
| R7 push-begin セッションへの `switch(別枝, @co)` | 未確定 | **resume（別枝は開かれない）** | 💭 R4-5 |
| T1 set 遠隔書換（frame 木不変・共有のみ更新） | どおり | どおり | ✅ |
| T2 非 singleton への set（runtime） | no-op 無診断 | no-op | ✅（E030 は checker の分担） |
| T3 `set(mod::X##v)` | (mod,X) キー書換 | どおり | ✅ |
| T4 無修飾 set・singleton は別 module | no-op | no-op | 💭 R4-6 |
| T5 set 後の variant 省略 push | 共有現在値で開く | どおり | ✅ |
| T6 掲示中 singleton への set | overlayVariant 即時反映 | どおり | ✅ |
| M1 `show(mod::X)` + `set(mod::X##v)` | overlay エントリが module 保持・共有へ解決 | どおり | ✅ ADR-0017 |
| M2 掲示中 overlay（mod 定義）の無修飾 set | 未規定 | **アクティブ module に解決 → no-op** | ⚠️ R4-6 |

ADR-0017 正規化（c32 の simulate 出力検分）: `mod::`/`mod2::`（同一ファイルの別 alias）とも正準名 `c32-r4-set-module-b` へ正規化、singletons キーは (module, name) ✅。

## findings

### ❌ R4-3: module 修飾つき裸 variant（`mod::##v`）が nav/overlay 全域で name 空のまま素通りする

`show(mod::##a)` は `{module:"mod", name:"", variant:"a"}` の overlay target として無言で受理（E027 は module なしの裸 `##v` しか見ない）。横展開の実測で `push(mod::##v)` / `present(mod::##v, @s)` も同形の `{kind:"component", module:"mod", name:"", variant:"v"}` で素通りと確認（E023 は kind:'variant' しか見ない）。runtime に渡ると name "" の component への遷移・掲示になる（黙って落ちる系）。`set(mod::##v)` だけは E029 で偶然塞がるが、AST は `name:"##v", variant:""` と誤トークン化しており、診断メッセージの根拠と実態がズレている。

### ❌ R4-4: import 先ファイルの診断が check で報告されない

CLI `check` はエントリモジュールの parse/check 診断しか出力しない（cli/src/index.ts:69-77 — diagnosticsMap には全モジュール分収集済みなのに entry しか印字しない）。import 先が構文エラーでも exit 0。simulate/mermaid も同様にエントリの parse error しか見ない。

### ⚠️ R4-1: `set(X)`（##なし）が E029 + 空 variant の W105 を二重出力

parser が E029 を出しつつ variant:"" の set ノードで復帰し、checker が `W105: set(学習##) の ''` を重ねる。エラー済み構文へのノイズ診断。復帰ノードが runtime まで流れると空文字 variant の共有書換になりうる（check エラーで止まる運用なら実害小）。

### ⚠️ R4-2: module 修飾 set の E030/W105 が cross-module で盲目

checker は `target.module !== null` を一律 skip（checker/src/index.ts:100,152 「cross-module refs are not locally checkable」）。しかし CLI は全 documents を保持しており、判定材料はある。SPEC 診断コード表の E030/W105 条件文に module 限定は無い — 字義どおりなら `set(mod::通常##x)`（別ファイルの定義済み非 singleton）は E030 のはず。設計判断（診断のモジュール横断範囲）が要る。

### ❌ R4-7: overlay 掲示中 component の裸 gate が「アクティブ画面の body」で判定される（コード確定・SPEC 字義と乖離）

SPEC「裸参照は **host component（その行動が書かれている component）** の現在 variant の body 直下を見る」。simulator の `gateEnabled`（simulator.ts:175-183）は kind='host' の gate を常に `currentFrame()` で判定し、`overlayInteractions()` から呼ばれた場合も同じ——掲示中 component の interaction の gate が、自分の表示 variant でなくアクティブ画面の body で判定される。doc common の動的解決（ADR-0015）は正しく実装されているが、その経路が overlay 由来の interaction まで巻き込んでいる。ミニプレイヤーの `> タップ(曲名?) -> push(プレイヤー)` は、曲名要素を持たない画面の上では黙って無効になる。

### 💭 R4-5: switch が push-begin のセッションへ verb 越しに resume する

`push(確認, @co)` のあと `switch(別枝, @co)` → @co が生存しているため resume、別枝は開かれない（アクティブは確認のまま・木不変）。SPEC「@S が生きていれば中断位置へ復帰」の字義どおりだが、begin した verb と switch の対応について SPEC は何も言わない。読者が「push で始めたセッションは switch の resume 対象になる」と予測できるか未検証 → オラクル課題化。

### 💭 R4-6: 無修飾 component 参照の module 解決規則が SPEC 未規定

runtime は set/overlay/nav とも「発火時のアクティブフレームの module」で解決する（reduceStateWrite の `action.target.module ?? current.module` ほか）。同一ファイル内で完結する通常フローでは字句ホスト＝アクティブ module で一致するが、**overlay 掲示中 component の interaction**は別 module の画面上で発火しうる——mod 定義のミニプレイヤーの `set(状態##停止)`（無修飾）は、アクティブ画面が entry 側だと (entry, 状態) に解決され黙って no-op（M2 実証）。member gate の評価も動的（`gate.module ?? currentFrame().module`）だが、simulator の gateTargets **収集**は字句 sourceModule（extract.ts:265）——解決規則が内部でも非対称。SPEC は「別名:: の解決は参照が書かれたファイルの import 表による」（alias の話）までで、無修飾参照の module 帰属を規定していない。

### ✅ 再検証パス（regression なし）

- E029 全形状・E030・W105（同一ファイル内）・E028 全境界（宣言側・alias 付き・参照側行動対象）・E027（show/hide とも。hide の E020→E027 付け替え含む）・R005 全境界（barrier 越し遡り・非アクティブパス除外・無名除外・exit 後解除）
- set 意味論（遠隔書換・no-op 分担・共有現在値遷移・掲示中反映）= ADR-0014 どおり
- ADR-0017（別 alias 同一ファイル正規化・(module,name) singleton キー・未 import alias 素通し・overlay エントリ module）= ADR どおり
- quoted name × set（c33）= 正準値で解決（r3 A1/A2 の修正が set にも効いている）
