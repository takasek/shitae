# podcast-r2 採点（被験者: sonnet、SPEC のみ）

## CLI 実測

- `check`: **診断ゼロ pass**
- `mermaid`: **transpiler バグ発見** — quoted variant `## "1.5x"` のノード ID が宣言側 `再生速度__1_5x_`・edge 参照側 `再生速度_1_5x` で不一致（sanitize 経路が 2 つある）。さらにラベルが `["## "1.5x""]` と内側 quote 未エスケープで mermaid 構文として不正。**probe が処理系バグを踏み抜いた**（quoted name の下流対応もれ、round-1 A4 の残党）
- `show(ミニプレイヤー)` は mermaid に一切現れず、ミニプレイヤー系のノードが孤島になる（spec-review-r2 S16）

## 正答した点（どう正解したか）

- タブ慣用句: `present(ホーム, @tabHome)` anchor + switch 3 本 — SPEC の例をほぼ写経（確信度 高と自己申告どおり）
- ミニプレイヤー = overlay `show()`: **新構文を正しく選択**。「フルプレイヤーを閉じてもミニプレイヤー残存」を hide しないことで表現 — overlay がフレームと独立という核を正しく読んだ
- overlay component 内の `present(フルプレイヤー)` — 掲示中 interaction の全画面有効を前提に書いた。ただし「overlay 発の遷移がどのフレームに効くか」は SPEC 未規定（アクティブフレームに効く、が驚き最小）
- `exit(@tabHome)` でログアウト → begin 地点（ログイン）— 正しい

## 回避行動・spec 欠陥の証拠

1. **タブバーの switch 群を 3 画面に複製**（ホーム・検索・ライブラリで同文 9 行）。round-1 messenger と同一の回避 — **C6（タブバー部品化の正攻法）が SPEC のタブ慣用句に未反映**であることの再現。独立被験者 2 ラウンド連続で同じ複製に至った = 最強シグナル継続
2. `フルプレイヤー` の要素行に bare `再生速度`（component 名と一致）— SPEC が警告してよいとする lint（W 系）が未実装で無音
3. 再生速度の variant 切替を部品側 interaction に書いたが、再 present で initial variant に戻る（「フレームを生き延びる値」が無い）— notes で自己申告あり。C 系（データの代理としての variant の限界）
4. 通知 deep link で「開いているモーダルを畳んでから遷移」が書けない — `exit(@S) ; push(X)` は @S を名指しできる時だけ。「今開いてる何かを全部畳む」汎用形が無い（notes 申告）

## notes の申告要約

- 曖昧: `タブバー.検索`（未定義 component への member 参照）の正当性、variant 名に `.` を含めてよいか（quoted で回避）、通知時に modal が開いていたら push はどこに積まれるか
- 諦め: 再生速度の永続、汎用 collapse-then-navigate、フルプレイヤー表示中のミニプレイヤー除外（SPEC 既知の制限）、エピソードのパラメタ化（設計上の対象外）
