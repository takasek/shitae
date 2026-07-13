# SPEC stress-test r3 — 境界例トレース + CLI 実測（2026-07-13）

対象: r2 で導入・変更された構文（singleton `#!`・presence gate 構造的判定・overlay Map・document common 3階層 shadow・E022〜E026/W104・collection shadow・canonical quoted name）。起点 = origin/main `9091bce`。cases は `cases/c18-r3-*` 〜 `c29-r3-*`（r1 の c01〜c17 と並存）。

## ❌ 矛盾（SPEC の字義と実測の食い違い）

### R3-1: `show(##v)` の裸 variant が無診断で素通りする

SPEC は記号一覧・EBNF 注記・オーバーレイ節で「裸 `##variant` は母体が無いため書けない」と規定するが、診断コード表に対応コードが無く、parser は `show(##一)` を **overlay target `{name: "", variant: "一"}`** として無診断で受理する（c24 実測）。下流では空文字名 component の掲示という無意味な状態になる。非対称も確認: `hide(##一)` は **E020**（「hide に ##variant」）で止まる——エラーにはなるが、指摘内容が「variant 指定不要」であり「母体が無い」という本質と別（hide の裸 ## は E020 の字義「`hide()` に `##variant` を書いた」に偶然引っかかっている）。

- 期待（字義）: show/hide とも裸 `##` はエラー（E022/E023 と同族の「母体なし」系）
- 実測: show = 無診断、hide = E020

### R3-2: nav-target の quoted name 内 `##` / `::` が quote より先に分解される

SPEC「quoted name は component 名・variant 名・alias・参照・行動対象などすべての name 位置で有効。正準値は quote を剥いだ文字列」。定義ヘッダ `# "a##b"` は正準値 `a##b` になるが（実測 ✅）、**nav-target 参照側**は quote の内側で `##`/`::` を分解し、quote 文字が name に残留する:

- `push("a##b")` → component `"a`, variant `b"`（c25 実測）
- `push("a::b")` → module `"a`, name `b"`
- 対照: `push("My Screen")`（構造記号なし）✅、`push("a.b")` ✅、`m::"q q"` ✅

mermaid で実害を実証: 定義ノード `a__b` に対し参照エッジは `_a_b_` へ向かい dangling（c25 の mermaid 出力）。

### R3-3: 行動対象の `?` 付き参照で quote・前後空白が name に残留する

`?`（presence gate）を後置した行動対象だけ、字句正規化（quote 剥ぎ・trim）が効かない:

- `試す( "My Button" ?)` → name `"My Button" `（quote + 末尾空白残留）、existsGated=true
- `試す( ボタン ?)` → name `ボタン `（bare でも末尾空白残留）
- 対照: `試す("My Button")` / `試す( ボタン )`（`?` 無し）→ 正準 ✅

帰結: gate の対象解決（要素名 `My Button` と照合不能）・shadow 一致判定（`referencesEqual` は name の生値比較）・presence 判定がすべて壊れる。正準値規定（SPEC「quoted name」）と shadow 完全一致基準（「操作は variant に属する」）への実装未追随。

## ⚠️ 未定義（SPEC が決めていない）

### R3-4: singleton の「document 内で単一」— モジュール分割時の document 境界

SPEC「singleton component」節は「document 内で単一インスタンス」と言うが、モジュール分割時に document がファイル単位か合成後のプログラム全体かを規定しない。実装は**全モジュール横断・素の component 名キー**で合流する（`extract.ts` が全 doc の `singletonNames` を単一 Set に合流、runtime `sharedVariants` は `Map<component名, variant>` で `Location.module` を無視）。帰結: モジュール A の通常 `# クーポン` と モジュール B の `#! クーポン` が同名なら、A のクーポンも singleton 扱いになり variant を B と共有する（c20 のコード検分。`::` 名前空間の存在意義と衝突）。

### R3-5: アクティブ最上段が未定義 component のときの document common 帰属

SPEC「実行時に有効な document common はアクティブフレームの最上段 component が**定義されているファイル**のもの」。未定義 component（どのファイルにも定義が無い）が最上段のとき適用不能。実装は `navTargetToLocation` が参照元の module を継承する（B の画面から push した未定義画面には B の doc common が効く）。驚き最小だが SPEC は無言（c21）。

## 💭 議論（設計判断が要るもの）

### R3-6: singleton の collection 宣言 `*バッジ`

`#! バッジ` を `*バッジ` と collection 宣言しても無診断（c19）。「単一インスタンス」と「複数ある」の緊張。意味論上は「N 個の見た目コピーが全て同じ variant を映す」と読めなくもない（未読バッジ一覧が一括で既読になる、は実用例になりうる）。lint（warning）候補か、意味を SPEC に明記するか。

## ✅ SPEC どおりを実測確認したもの

| case | 内容 | 結果 |
|---|---|---|
| c26 | E023 全 3 形（push/present/switch + 裸##）+ E022（doc common） | 全発火 ✅ |
| c27 | `#!` × `#` 同名・`#!` 二重定義 | E005 ×2 ✅ |
| c22 | 3階層 shadow: `?` は一致判定外（component common が doc common を shadow）・`*` 込み一致（variant が doc common の `スクロール(*項目)` を shadow）・`*` 違いは両立 | resolver 実測 ✅ |
| c23 | セッション無し `push(##v)` は E023 対象外・runtime は (アクティブ component, v) を現在フレームに積む | AST + `navTargetToLocation` ✅ |
| c29 | document common の **member 参照** gate は判定可能扱い（`buildGate` は hasHost=false でも member を kind:'member' にする。always-on 落ちは裸参照のみ） | ✅（SPEC の字義とも整合） |
| c19 | `全部見る(*バッジ?)` — `*` を剥いで判定 | 受理 ✅ |
| c18 | singleton + member gate（共有 variant で判定）静的受理 | ✅（runtime 挙動は Phase 2b オラクルで検証） |

## 実測サマリ

- check 無診断: c18, c19, c20a/b, c21a/b, c23, **c24（❌ R3-1）**, c25（❌ R3-2 は AST/mermaid で発現）, c29
- check 診断あり: c22（W103×2 想定内）, c26（E022+E023×3）, c27（E005×2 + W103×3）
- AST 検分スクリプト: `/tmp/r3_ast*.mjs`, `/tmp/r3_shadow.mjs`（使い捨て）
