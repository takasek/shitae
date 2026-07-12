# delivery-r2 採点（被験者: sonnet、SPEC のみ。session limit で途中死 — 成果物は完結しており全量採点）

被験者は死の直前に自己レビューで対象参照の自己参照 2 箇所を発見・修正中だった（通知の result に記録）。ファイルは修正後の状態で残っており一貫している。

## CLI 実測

- `check`: **診断ゼロ pass**
- 6 プローブ通算（r1+r2）で最も正確な新構文運用: overlay（show/hide + bare action + 外部イベントでの hide）、`exit(@checkout) ; push(ホーム)` 出口固定慣用句 ×4、member 参照 gate `品目.在庫あり?`（SPEC の日付/予約例の正確な転用）

## 正答した点（どう正解したか）

- チェックアウトを `present(@checkout)` にした判断 — barrier の意味（暗黙 back での静かな離脱を防ぐ）を正しく推論して push から乗り換えた。SPEC の barrier 直交表を実際の設計判断に使えた例
- `dismiss()` が @checkout を巻き込まないことを frame 列の手追いで確認（確信度 中）— oracle Q4 と同じ規則を独立に正しく適用。ただし「文章 1 回では予測できず、手で frame 列に落として初めて納得」と申告 — worked example 需要の直接証言
- 品切れの二重防御（一覧 gate + 詳細 variant からの interaction 除去）— gate と variant の役割分担の正しい理解

## 回避行動・spec 欠陥の証拠

1. **クーポン「受取済」が表現不能** — present は毎回 initial variant で開く + variant はインスタンス独立 → 「一度受け取ったら以後どこから開いても受取済」が原理的に書けず、毎回未受取で開く**不正確な近似を確信度 低で採用**。欲しい記法として「document スコープのシングルトン component（複数回の present が同一インスタンスの variant を共有）」を具体提案
2. カートの中身・選択住所の画面間反映 — 「データを持たない」設計方針の理解の上で、ドメイン中心データを持つアプリでは制約が早く効くと申告
3. 「詳細画面を開いた後に外部要因で品切れに変わる」— 特定インスタンス向け外部イベントの置き場が無く諦め
4. 通常 component 本体からの前方参照の可否 — SPEC が document common にだけ「前方参照可」と書くため、裏読みで不安に（podcast 被験者と独立収束）

## notes の質

(e) 誤読しやすい箇所 5 点は全て実在の仕様理解の急所（back(X) の variant 不要・goto の主眼・present≠push(X,@S) の差・gate は値を見ない・dismiss の素通り規則）。モデル勾配: sonnet はここまで正確に運用できる — 残る誤読は仕様の記述密度の問題。
