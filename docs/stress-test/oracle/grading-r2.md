# オラクル r2 採点（正解 = runtime reduce 実測、`run-oracle-r2.mjs`）

被験者: sonnet ×1（SPEC のみ）。設問は switch/frame 木/overlay の r2 新意味論に集中。
Q↔T 対応: Q1=T1 / Q2=T2 / Q3=T3 / Q4=T4 / Q5=T6 / Q6=T7 / Q7=T8 / Q8=T5。

## 正解表（実測）

| Q | 遷移列 | active | 木・警告 |
|---|---|---|---|
| Q1 | present(ホーム,@tabHome); push(記事,@reading); switch(検索,@tabSearch); exit(@reading) | ホーム | 検索タブは @reading フレームの**子**として作られ、exit(@reading) の**道連れで消滅**。警告なし |
| Q2 | push(A,@S); push(B); back(ホーム); exit(@S) | ホーム | back(ホーム) は barrier なしフレーム境界を**越え**、子フレームを @S ごと破棄。exit(@S) は R002 |
| Q3 | present(A,@S); push(B); switch(A,@S) | B | 自フレームへの resume = no-op。**最上段のまま**（A へは戻らない） |
| Q4 | present(A,@S); present(B); present(C,@T) ; dismiss() | A | named @T を素通りして直近の無名 B を破棄、@T は子孫として道連れ。警告なし |
| Q5 | switch(##展開,@weird) | ホーム##展開 | 同一 component 別 variant の**新規フレーム**（barrier, @weird）が生まれる。警告なし |
| Q6 | present(ホーム,@tabHome); switch(検索,@tabSearch); switch(通知,@tabNotif); exit(@tabSearch) | 通知 | 遠隔破棄: 兄弟の検索タブを裏で破棄、アクティブは動かない。警告なし |
| Q7 | show(ミニプレイヤー##再生中); show(ミニプレイヤー##一時停止) | （フレーム不変） | overlays = {ミニプレイヤー} の 1 要素。**variant は実行状態に存在しない**（AST で捨てられる）— SPEC は再 show の variant 更新を未規定 |
| Q8 | push(A,@S); back(); exit(@S) | ホーム | back() が子フレームを begin マーカーごと破棄 → exit(@S) は R002 |

## 被験者予測との突合

被験者は session limit で途中死したが、予測本文（`subject-predictions-r2.md`）は全 8 問 + 総括まで書き終えていた — そのまま採点対象。

| Q | 予測 | 確信度 | 判定 |
|---|---|---|---|
| Q1 | ホーム。検索タブは exit(@reading) の道連れ | 中 | ✅ 完全一致。「設計上のトラップだが仕様は警告を義務付けていない」と独立指摘（S11 と収束） |
| Q2 | ホーム（両解釈一致）。R002 の有無は**解釈依存で決められない** | 低（解釈） | ✅ 画面正解 + 曖昧座標の正確な報告。対応表「同じ F」と「戻り先が無いとき」の緊張を字面から特定（S12・内部レビュー R3 と三重収束）。実装は「越えて破棄 + R002」side |
| Q3 | B のまま（A へ戻らない） | 高 | ✅ |
| Q4 | A。@T は道連れ | 高 | ✅ |
| Q5 | **決められない** — 裸 ##variant の母体解決が字句ホストか実行時カレントか未規定 | 低 | ✅ 正当な拒否 + **新発見**: SPEC は裸 `##variant` の解決規則（字句 vs 実行時）を一度も明言していない。実装は実行時カレント。document common 継承・overlay 由来の interaction では両解釈が乖離する — S14 を一般化する上位の穴 |
| Q6 | 通知。検索タブを遠隔破棄、画面不動 | 高 | ✅ |
| Q7 | 集合 1 エントリ、**variant は一時停止に上書き** | 中 | ⚠️ 読者期待は「集合が variant を保持し再 show で更新」— 実装は variant を**そもそも保持しない**（S2）。読者の推論の方が SPEC の字義（`##variant` 指定は掲示時の variant を選ぶ）に忠実。S2 修正の仕様側方向を支持する実測 |
| Q8 | ホーム + R002 | 高 | ✅ |

**総合**: 6/8 完全正解、確信度「高」の誤りゼロ。round-1 で最も危険だった「高確信 × 実装乖離」パターンは、今回は Q7（中確信）のみ — しかも乖離の原因は実装未追随（S2）で、読者側が正しい。「決められない」2 件（Q2 警告・Q5）はどちらも SPEC の実在の穴の正確な座標報告として機能した。
