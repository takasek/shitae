# frame 木 受け入れ基準（手トレース正解）— runtime frame 木化タスク用

SPEC「フレーム木」「switch（中断と復帰）」「present / dismiss は compound verb」節を設計者が手トレースした正解表。runtime を線形スタックから frame 木に書き換えるタスクの受け入れ基準。実装後、これらを vitest で表現して green にする。各ケースの「最終アクティブ画面」「木の形」「警告」が一致すること。

記法: フレームを `名前[製法,barrier,@session]{stack}` で表す。製法 = push/present/switch/root。stack は下→上。`*` = アクティブ。

## T1: タブ慣用句（present anchor + switch 兄弟）

エントリ `起動`。
1. `present(ホーム, @tabHome)` → root{起動} の子に F1[present,barrier,@tabHome]{ホーム} を作りアクティブ。
2. `switch(検索, @tabSearch)` → @tabSearch 不在。現在 F1 は switch 製でない → **F1 の子**に F2[switch,barrier,@tabSearch]{検索}。アクティブ F2。
3. `switch(ランキング, @tabRank)` → @tabRank 不在。現在 F2 は switch 製 → **兄弟**（F2 の親 = F1 の子）に F3[switch,barrier,@tabRank]{ランキング}。アクティブ F3。
4. `switch(検索, @tabSearch)` → @tabSearch 生存（F2）→ 復帰。F3 中断、アクティブ F2。木は不変。
5. 最終: root{起動} > F1{ホーム}(中断) 、F1 の子に F2{検索}(*) と F3{ランキング}(中断)。**アクティブ画面 = 検索**。警告なし。

## T2: 兄弟規則（switch 製から switch は兄弟）

エントリ `ホーム`（root、switch 製でない）。
1. `switch(検索, @s2)` → 不在。root は switch 製でない → root の子 F_a[switch,barrier,@s2]{検索}。アクティブ F_a。
2. `switch(設定, @s3)` → 不在。現在 F_a は switch 製 → 兄弟（root の子）F_b[switch,barrier,@s3]{設定}。アクティブ F_b。
3. 最終: root{ホーム} の子に F_a{検索}・F_b{設定} が横並び。**アクティブ = 設定**。もし「常に子」だと F_b が F_a の子になり `exit(@s2)` が設定を道連れにする事故 → 兄弟規則で防ぐ。

## T3: switch の barrier

エントリ `root`。
1. `switch(X, @s)` → 不在 → root の子 F[switch,barrier,@s]{X}。アクティブ F。
2. `back()` → F の最下段、barrier あり → **no-op + R003**。アクティブ X のまま。

## T4: 中断フレームの遠隔 exit（画面は動かない）

T1 の途中状態を使う。エントリ `起動`、`present(ホーム,@tabHome)`、`switch(検索,@tabSearch)`、`switch(ホーム,@tabHome)`（F1 に復帰、F2=検索 は中断）。この時点でアクティブ = F1{ホーム}。
1. `exit(@tabSearch)` → @tabSearch(F2) はアクティブパス（root→F1）に無い → 木全体から探して**遠隔破棄**（F2 を子孫ごと消す）。アクティブフレーム F1 は**動かない**。**アクティブ画面 = ホームのまま**、警告なし。

## T5: exit で子孫タブ全滅（ログアウト）

T1 の最終状態（F1 present@tabHome、その子に F2 検索・F3 ランキング、アクティブ F2）から。
1. `exit(@tabHome)` → @tabHome(F1) はアクティブパス（root→F1→F2）上にある → F1 と子孫（F2, F3）を全部破棄、begin 地点（root=起動）へ。**アクティブ画面 = 起動**。警告なし。

## T6: push@S 子フレームの底で back → 親へ抜ける（barrier なし）

エントリ `ホーム`。
1. `push(記事, @reading)` → ホーム(root) の子 F[push,**barrier なし**,@reading]{記事}。アクティブ F。
2. `push(関連, )` → セッションなし → F に積む。F{記事,関連}。
3. `back()` → F 最上段を降ろす。F{記事}。アクティブ F。
4. `back()` → F 最下段、barrier なし → **F を破棄して親（root=ホーム）へ抜ける**。**アクティブ画面 = ホーム**。警告なし。
（対比: present/switch 製の子なら手順 4 で barrier に阻まれ no-op。）

## T7: 破棄済み @S への switch は再作成

エントリ `ホーム`。
1. `present(タブ, @t)` → 子 F[present,barrier,@t]{タブ}。アクティブ F。
2. `exit(@t)` → F 破棄、root へ。
3. `switch(タブ, @t)` → @t 破棄済み（不在）→ 新規作成。root は switch 製でない → root の子に新 F'[switch,barrier,@t]{タブ}。アクティブ F'（まっさらの initial variant）。

## 既存オラクル（線形部分、frame 木化後も不変であること）

run-oracle.mjs の Q1〜Q5 は frame 木化後も同じ結果（Q1: B で R003 / Q2: ホーム / Q3: ホーム / Q4: C で R003 / Q5: A 閉じた）。switch を使わない木は一本道になる、という SPEC の主張の検証を兼ねる。
