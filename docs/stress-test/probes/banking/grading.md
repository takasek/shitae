# banking プローブ採点（被験者: sonnet / SPEC のみ / CLI 不可）

CLI check: pass（診断ゼロ）。SPEC 照合レビュー: 概ね忠実。回避行動 2 件・spec 欠陥の証拠 3 件。

## どう正解したか

- present(ホーム, @loggedIn)・present(宛先選択, @送金)（barrier で「前に戻れない」を表現）・exit(@送金) の begin 地点意味論・取引詳細からの同名 @送金 再利用は、いずれも SPEC の意図どおりの正攻法。
- パスコード 3 回失敗を variant 連鎖（##パスコード1→2→3→ロック）で表現 — 原則 6 に忠実な正答だが、カウンタの variant 展開に本人も迷いを申告（→ F 側で指針要求として扱う）。

## 検出された spec の穴（notes の自己申告と一致）

1. **強制ログアウトを `goto(ログイン)` で書いた** — 要件「タブや送金途中も全て破棄」に対し、goto は現在フレーム最上段の置換でしかなく祖先フレームが残骸として残る。SPEC の document common 節の例自体が `goto(ログイン)` を載せており、**spec の例が誤誘導している**（battle.shitae の正解は exit(@loggedIn)）。document common から発火した遷移の作用域も未規定。
2. **`dismiss() ; push(完了)` — 1 つの result-list に transition を 2 つ連ねた**。「前の遷移で変わった状態に後続が効く」逐次意味論は spec に無い（被験者も確信度 中と申告）。
3. **「複数入口ウィザードの出口を固定画面にできない」** — exit(@S) は begin 地点固定。`exit(@S, 戻り先)` 相当が無いことを明確に言語化した（表現力ギャップ）。

## 確信度自己申告（座標）

高: `#`/`##`・分岐・push/back/goto。中: present/@S/exit（begin 地点）・dismiss（ダイアログ粒度への適用可否）・document common（作用域）。
→ 「中」の 3 点はすべて frame 木まわり。仕様の曖昧座標として findings に反映。
