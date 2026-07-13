# ADR-0013: singleton の共有スコープは定義ファイル単位 — レジストリキーは (module, component)

- Status: accepted（2026-07-14、設計者承認）
- 出典: stress-test r3 — findings B1。**3 経路独立到達**（コード検分 / オラクル被験者の読者期待 / SPEC 内部整合レビュー）＋オラクル S5 ライブ証拠

## Context

ADR-0011 は singleton を「document 内で単一インスタンス」と定めたが、モジュール分割時の「document」の境界を規定しなかった。実装は全モジュールの singleton 名を素の component 名で単一集合に合流し（simulator `extract.ts`）、runtime の共有レジストリ `sharedVariants` も component 名のみをキーにして `Location.module` を無視していた。

帰結（オラクル S5 で実測）: エントリ A の**通常** `# クーポン` へ `push(クーポン##通常)` すると共有レジストリが汚染され、import 先 B の `#! クーポン` が**自分に存在しない variant ##通常** で開く。オラクル被験者（SPEC のみ参照）は「`::` で名前空間が完全に分離される原則から、同名でも状態共有の根拠は無い」と確信度高で逆を予測——読者期待と実装が正面衝突していた。

## Decision

- singleton の「document」は**定義ファイル（モジュール）**を指す。`#! X` の共有 variant は「X を定義したファイル」を単位に一意。
- 共有レジストリのキーは **(module, component)** の組。別モジュールの同名 component（通常・singleton とも）は無関係——variant を共有せず、singleton 扱いにも巻き込まれない。
- どのモジュールから `mod::X` で参照しても、同一の (mod, X) レジストリを読む・書く（モジュール越し参照で共有が切れることはない）。

document common の「そのファイルの全 component に共通」と同じ整理（ファイル＝モジュール＝名前空間の原則を singleton にも適用）。

## Consequences

- SPEC: singleton 節に「document ＝ 定義ファイル。別モジュールの同名 component とは無関係」を明記（document common 節と相似の 1 段落）。
- 実装: runtime `singletons` / `sharedVariants` のキーを module 込みに変更。`initialState` への注入も (module, name) の組で。simulator `extract.ts` の全モジュール横断・素名合流を廃止し、モジュールごとの集合に分離。
- エントリモジュールの module 表現（現行 `null`）とモジュール名文字列の正規化は実装詳細——キーの一意性が保たれれば良い。
