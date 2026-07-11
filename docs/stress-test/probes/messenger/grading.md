# messenger プローブ採点（被験者: sonnet / SPEC のみ / CLI 不可）

CLI check: pass（診断ゼロ）。SPEC 照合レビュー: タブ慣用句・anchor frame を正しく適用。外挿 1 件・構造的躓き 2 件。

## どう正解したか

- タブ = switch + anchor frame（`# 起動` を立てて `present(チャット一覧, @tabChat)`）は SPEC のタブ慣用句を正確に読解・適用した正答。
- 未読/既読をリスト行部品（# スレッド行）の variant で表現 — 原則 6 の綺麗な適用（本人も「綺麗に書けた点」と申告）。
- inline が variant を持てない制約に自力で気づき、# component へ昇格 — SPEC の EBNF 注記で確信したと申告（記号一覧の説明だけでは見落としやすい、という文書指摘つき）。

## 検出された spec の穴

1. **`switch(チャット一覧, @tabChat) ; push(スレッド)` を 3 箇所で使用** — 「タブを切り替えた上で特定の場所へジャンプ」（通知・deep link の定番）に対する言い回しが spec に無く、result-list の EBNF から外挿した。banking と独立に同じ穴に到達。
2. **switch は中断位置復帰であり「タブの先頭」ではない** — 通知でスレッドへ飛ぶとき、既にスレッドを開いていたらその上に積まれる。現実のアプリ挙動との食い違いの解決指針が無い。
3. **エントリポイントがタブ 1 枚目を兼ねられない** — エントリは無名ルートフレームなので @tabChat が付かず、`# 起動` という薄い component を発明して回避。spec の慣用句が「入場遷移」を前提にしており、入場が無いケース（起動即タブ）の指針が無い。

## 確信度自己申告（座標）

高: component/variant・collection・present/dismiss。中: alias にラベル文字列を実体として使う用法・未定義 component への `.` 参照の作図規約・switch+push 複合・document common の複合遷移。
