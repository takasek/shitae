# ADR-0021: 驚き最小バッチ r4 — 小物の確定（module 修飾裸 variant・プロジェクト単位 check・W106・R005/C2 見送り）

- Status: accepted（2026-07-15、設計者承認）
- 出典: stress-test r4 — findings A1/A2/A5/B2/B3/B4/C2。いずれも既存コードへ振るだけで一意に決まるか、設計者が方針を一言で確定したもの

## A1: module 修飾つき裸 variant（`mod::##v`）— 既存コードへ振る

**決定**: `mod::##v` は AST を正しくトークン化した上で、既存の診断コードへ振る。

- nav 新規作成系（`push(mod::##v, @S)` / `present(mod::##v[, @S])` / `switch(mod::##v, @S)`）→ **E023**
  （フレーム新規作成系の nav-target が裸 `##variant`。module 修飾があっても「同一 component 内の variant」
  という裸 variant の性質は変わらないため既存条件文に含める）。
- overlay（`show(mod::##v)` / `hide(mod::##v)`）→ **E027**（母体 component が無い。同上）。
- `set(mod::##v)` → 既存どおり **E029** のまま。ただし AST は `{module:"mod", name:"", variant:"v"}` に
  正しくトークン化する（現状の `name:"##v", variant:""` という誤トークン化を直す）。
- `goto(mod::##v)` のコード割当は**本 ADR では確定しない**——裸 `##v` の `goto` は合法（variant change）
  だが module 修飾つきは「mod のアクティブ component」が定まらないため不正であり、E023 の対象外（E023 は
  フレーム新規作成系限定）という穴がある。T4 実装時に E016 類推か E023 拡張かを検討し、判断が付かなければ
  設計者に確認する。

## A2+B2: check はプロジェクト単位

**決定**: `check` はエントリ + 全 import 先の parse/check 診断を報告し、error があれば exit 1 とする。

- checker の cross-module skip（`target.module !== null` を一律 skip）を解除し、`resolveProject` の結果
  から他モジュールの定義を引いて **E030 / W105 / E028** を module 修飾参照にも適用する。
- CLI（cli/mermaid/simulate の 3 呼び出し箇所すべて）が import 先モジュールの診断も収集・報告するよう
  追随する——現状 diagnosticsMap には全モジュール分収集済みだが、印字がエントリモジュール分に限定されている。
- 診断の `printDiags` がエントリのファイルパスを全診断に貼る既存バグに注意——module ごとの実ファイルパス
  で出す。

## A5: `set(X)` の W105 二重出力を解消

**決定**: `set(X)`（`##variant` を伴わない）は E029 発報済みの構文エラーであり、その復帰ノード（variant:""）
に checker が W105 を重ねて出すのはノイズ。E029 発報時の復帰ノードを checker 対象から外すか、variant:"" を
W105 判定から除外する（実装位置は任せる）。

## B3: R005 の静的近似 — 実装しない

**決定**: fitness プローブで再発した「フロー全体をセッション内で管理」誤読（begin(@S) → 別の begin(@S) を
exit/dismiss を経ずに書く）は runtime 警告（R005）でしか検出できない。静的近似 lint（遷移グラフ上、
begin(@S) から exit/dismiss(@S) を経ずに到達しうる別の begin(@S) を warning）は、過検出リスク（分岐で
exit する経路があるケースを誤検出しうる）を踏まえ、**checker には実装しない**。SPEC「lint 推奨」節に
1 行足すのみ（処理系が警告してもよい、という位置づけに留める）。

## B4: singleton への `show(X##v)`（明示 variant）— W106 新設

**決定**: **W106**（checker）を新設する。singleton への `show(X##v)`（明示 variant）に対して警告する。
error にはしない（ADR-0011 の正当な意味論であり、意味論変更も不可——switch resume 書換との一貫性）。
メッセージは「共有状態の書き換えを伴う。表示だけなら `show(X)`、遷移せず書き換えるなら
`set(X##v) ; show(X)` に分解できる」の方向で誘導する。

判断根拠: ADR-0014 以後、singleton への `show(X##v)` には固有の役割がなく、常に `set(X##v) ; show(X)` へ
分解可能で、分解形の方が書換と掲示の意図が分離して読める。「set への書き換えを提案する」警告は誤用にも
意図的書換にも従える提案で偽陽性がない。r4 では smarthome プローブが自発的に set+show 分解形を選び、かつ
「explicit-variant show が警告の対象になるか SPEC から判断が割れた」と存在しない警告を予期する申告をして
いる——読者側に警告への期待が既にある。

## C2: モジュール横断の共通事象 — 見送り + D 降格

**決定**: 新機能は導入しない。「モジュール横断の共通事象は各ファイルの document common に複製する」を
SPEC モジュール化節に 1 文足すのみ。doc common はアクティブ画面のファイル単位（ADR-0016 B2 で確定済み）
という既定の帰結であり、専用記法・エントリファイル特例は「ファイル＝名前空間」の原則を崩すため見送る。

## Consequences

- 診断コード表: **W106** 追加。E023/E027/E029 の条件文へ module 修飾裸 variant を明記。E030/W105/E028 の
  適用範囲がプロジェクト単位である旨を注記。
- 実装: parser（A1 のトークン化・E023/E027 への振り分け）→ checker（A2+B2 のプロジェクト単位化・A5・
  W106）。B3・C2 は SPEC 文言のみで実装作業なし。
- SPEC 文書改訂は findings D1〜D10 と合流して 2 pass（意味論 / 小物）で行う（T3）。
- goto(mod::##v) のコード割当は T4 実装時に確定する未決事項として残る。
