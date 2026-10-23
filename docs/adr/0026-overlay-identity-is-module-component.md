# ADR-0026: overlay は定義ファイルと component で識別する

- Status: Accepted
- Date: 2026-10-23
- Issue: #66

## Context

module の同一性は定義ファイルであり、import alias は別名にすぎない（ADR-0017）。一方、overlay の「component 名が ID」という説明と素名だけの実装は、別ファイルに同名の component がある場合、lexical な show/hide の対象解決と食い違っていた。

## Decision

設計者が承認した「所属モジュール＋部品名」を採用する。overlay の同一性は解決済みの定義ファイルと component 名の組とする。variant は同一性に含めない。

- 別ファイルの同名 component は別の overlay として同時に掲示できる。未掲示の対象を hide しても、他のファイルの同名 overlay は変化しない。
- 同一ファイルを別 import alias で参照しても、同一の overlay を指す。同じ定義への再 show は既存の表示を更新する。
- 無修飾参照は既存の lexical 解決に従う。overlay 自身の操作内では、その定義ファイルを基準に show/hide の対象を解決する。
- 通常 component の再 show は表示 variant を上書きし、省略時は initial に戻す。singleton の共有 variant と省略形/明示形の規則は維持する。
- overlay は frame 木と独立し、exit/back/dismiss で消えず、hide するまで残る。presence gate はそれぞれの掲示中 component の表示 variant で判定する。

追加記法、専用の定義ファイル、ID 宣言は不要。1 ファイルなら従来どおり show(通知)/hide(通知)、分割時は既存の show(a::通知) 等を使う。同一定義の複数 instance やユーザー指定 ID は追加しない。

## Consequences

runtime の集合、Session の列挙・placement・操作 handle・観測・履歴、GUI のカードと操作を同じ識別単位に揃える。内部キーはユーザー向け component 名として表示しない。曖昧な同名表示には既存の module 修飾表示を使う。

runtime/Session の変更は engineVersion に反映する。旧保存物の厳密な版照合を維持し、自動 migration は追加しない。旧 HTML・モデル・実行版を保存し、新版で新規記録して export、別 process の replay、継続を確認する。
