# frame 意味論オラクル — runtime 実測解（2026-07）

`run-oracle.mjs` で runtime `reduce`（線形スタック実装）に遷移列を食わせた実測。
被験者（SPEC のみを読む agent）の予測と突合するための正解表。**spec の字義と実測が食い違う設問は、それ自体が finding**（spec-review-2026-07.md の S 番号を併記）。

エントリはすべて `ホーム`。

| # | 遷移列 | runtime 実測 | spec の字義 | 帰結 |
|---|---|---|---|---|
| Q1 | push(A); present(B); back() | no-op + R003（B に留まる） | barrier の床で back は外に出ない → no-op | 一致 |
| Q2 | present(A); present(B,@named); dismiss() | @named を飛ばして無名 A を破棄、子孫ごと → ホーム | 「直近の無名」の字義とは整合するが、名前付きを飛ばす・道連れの明文なし | S14 |
| Q3 | push(A,@S); goto(B); exit(@S) | @S 消失 → exit は R002 no-op、B に留まる | goto が既存セッションの begin を破壊するかは未規定 | S13 |
| Q4 | push(A); present(B); push(C); back(ホーム) | barrier を越えて ホーム まで pop | 「戻り先が見つからない場合（back barrier に当たる…）は no-op」と back(X) も対象に読める | S6 |
| Q5 | push(A); goto(##開いた); back(); push(A) | A は initial variant で開く | variant 指定なしの遷移は initial variant。back の「積まれた時点の variant」とは別事象 | 一致 |

## 追記（2026-07-12、仕様確定後の再実測）

ADR-0001（back の barrier 停止）・ADR-0006 B2（goto の begin 保存）・B4（R001 撤去）の実装後に再実行した結果、Q3 は「ホーム・警告なし」（被験者予測と一致）、Q4 は「C に留まり R003」（被験者予測と一致）になった。上表の「runtime 実測」列は修正前の記録として残す。5 問全問で被験者予測と実装が一致した。

## 被験者プロトコル（リセット後に実施）

sonnet subagent に SPEC.md のみを読ませ、Q1〜Q5 の遷移列ごとに「最終的に見えている画面（component）・スタック構造・警告の有無」を予測させ、確信度（高/中/低）を自己申告させる。
確信度「中/低」が付いた設問が spec の曖昧座標。Q2〜Q4 は spec が未規定なので、被験者が「予測できない」と申告するのが最良の結果（できてしまったら類推で埋めた証拠）。
