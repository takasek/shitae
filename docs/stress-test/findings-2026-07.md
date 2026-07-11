# shitae SPEC stress-test — findings 集約（2026-07）

3 系統の独立手法の結果を統合した、設計者判断のための一覧。

- **手トレース + CLI 実測**（S1〜S21 — `spec-review-2026-07.md`、境界例は `cases/`）
- **SPEC 単体の内部整合レビュー**（R1〜R18 — `spec-internal-review.md`、subagent 独立視点）
- **実書きプローブ 6 本 + オラクル 5 問**（`probes/*/grading.md`・`oracle/grading.md`。被験者は SPEC のみを読む sonnet×5 + haiku×1）

**収束の注記**: 手法間で独立に同一の穴へ到達したものは確度が高い。shadow 一致単位（S7=R2）、document common の ##参照（S10=R4）、参照 2 段（S11=R10）、循環 import（S15=R14）、重複定義（S17=R6）、bare name 衝突（R9 = music プローブ実体験）、multi-transition（プローブ 4/6 本が独立使用）など。

判定: ❌ = 矛盾・欠陥 / ⚠️ = 未規定（明示決定が要る） / 💭 = 設計議論・アイデア。

---

## A. 実装が SPEC に追いついていない（黙って落ちる系 — 修正は実装側）

仕様どおり書いた文書が診断ゼロで壊れる。**検証済み example（battle）自体が 3 つ踏んでいる**。

| # | 内容 | 出典 |
|---|---|---|
| A1 ❌ | document common が parser で黙殺（AST に置き場が無い）。battle 冒頭 2 行も消えている | S1 |
| A2 ❌ | `switch` が TransitionWord に無く自然文 effect 化。battle のタブ 2 箇所で実測 | S2 |
| A3 ❌ | `-> R -> R` は構文エラー明記なのに 2 個目以降を黙って破棄 | S3 |
| A4 ❌ | quoted name が要素行では quote 剥がし・対象参照では quote 残存 — 同一表記が別値になり照合全滅 | S4 |
| A5 ❌ | presence gate `?` が AST 止まりで全下流（simulator/mermaid/xstate/checker/runtime）未参照 | S5 |
| A6 ❌ | runtime R001 が SPEC 正典例（present(ホーム,@loggedIn) → exit(@loggedIn)）を「ねじれ」警告 | S21 + music |
| A7 ⚠️ | runtime は線形スタックで frame 木規則群（兄弟規則・遠隔破棄・アクティブパス走査）未実装。switch 不在では等価と spec 自身が言うため A2 解消とセットで | S18 |

## B. SPEC の明示決定が要る未規定（優先度順）

### B1 ⚠️ result-list に transition を複数並べたときの逐次意味論【最優先】

`switch(X,@S) ; push(Y)`（通知→タブ切替→スレッド）、`dismiss() ; push(完了)`、`exit(@S) ; push(アルバム詳細)`、`dismiss() ; back()` — **プローブ 4/6 本が独立にこの形を必要とし、全員が確信度 低〜中で外挿した**。banking の被験者は「前の遷移で変わった状態に後続が効くか」まで正確に疑問化。
決定案: 「result は左から順に適用し、遷移は直前の遷移が変えた状態に対して効く」の 1 文 + 例を追加。ほぼ全プローブの頻出 idiom なので明文化の費用対効果が最大。

### B2 ⚠️ goto と既存セッションの begin 地点【オラクルで読者期待と実装が正反対】

`push(A,@S) → goto(B) → exit(@S)`: 実装は goto がフレームを全置換して begin マーカーを消し exit は no-op（R002）。オラクル被験者は SPEC の字義から「exit は効く」を**確信度 高**で予測 — 最も危険な乖離パターン。
決定案: 読者期待に合わせ「goto は component 置換でもフレームの begin マーカーを保存する」を推奨（spec の「goto はセッションを開始できない」理由づけとは独立に成立する）。逆に倒すなら「goto は現在フレームの begin を破壊する」を明記。

### B3 ⚠️ back(X) と barrier（+ back(X##variant) のデッドシンタックス）

実装は壁を越えて pop、spec の字義は「barrier に当たると no-op」とも読める（オラクル Q4 で被験者は no-op を予測）。さらに EBNF は `back(X##v)` を許すが「戻り系は積まれた時点の variant へ戻る」と両立しない（R7 ❌）。
決定案: back(X) は barrier で止まる（exit/dismiss だけが壁を越えて畳める、の役割分担を保つ）+ back の引数から `##variant` を落とす。

### B4 ⚠️ dismiss() の無名走査と exit/dismiss の対応関係

実装は名前付き @S を飛ばして直近の無名を子孫ごと破棄（oracle Q2）。「named session なら exit と dismiss は同義」も読み取れない（music が迷い、A6 の R001 が矛盾を露呈）。
決定案: 「dismiss() は名前付きを飛ばして直近の無名を破棄（飛ばしたものは子孫として道連れ）」「named 指定時の exit(@S) と dismiss(@S) は同義（push 製/present 製を問わない）」を明記。

### B5 ⚠️ presence gate の「存在」の操作的定義

(a) alias 名か実体名か（S8）、(b) inline 内要素を数えるか（S8）、(c) collection は個数を問うのか宣言の有無か — 個数だと動的状態の密輸入になり原則 6 と緊張（R3）、(d) 対象が**別 component** のとき「その variant」はどちら側か — haiku 被験者は「参照先 component の現在 variant」と動的解釈した（reservation）。(e) nav-target への `?`（`push(次?)`）が黙って名前に取り込まれる（S12）。
決定案: R18-2 の提案が良い —「存在 = その variant の実効 body（共通＋固有）に、対象と同名の alias または ref が element-line として書かれているか。静的・構文的判定。collection は個数を問わない。対象が別 component の場合は要素参照の解決のみで gate は掛からない（または掛かる、を明示）」。`?` の出現位置は行動対象のみとし、他はエラー。

### B6 ⚠️ shadow「完全一致」の判定単位

空白正規化（実装は lexer で正規化＝一致）・quote の有無（A4 のせいで不一致）・`?` の有無（実装は無視して一致）。S7=R2 で二重検出。
決定案: 「行動文字列は字句正規化後の比較、対象参照は quote を剥いだ name の等価、`?` は一致判定に含めない」を明記。

### B7 ⚠️ document common の意味論一式

裸 `##variant` 参照の母体が無い（S10=R4）。document common から発火した遷移の作用域 — 「タブも送金途中も全部破棄」のつもりの `goto(ログイン)` が最上段置換にしかならない（banking。**SPEC の例自体が `goto(ログイン)` で誤誘導** — battle の正解は exit）。特定 component の除外不可（music: Now Playing 自身にミニプレイヤーを重ねたくない）。エントリポイント兼タブ 1 枚目問題（messenger が `# 起動` を発明）。前方参照の可否（music）。
決定案: 裸 ## は禁止（component##variant を要求）、spec の document common 例を `exit(@loggedIn)` に差し替え、前方参照 OK を一言、「起動 component」idiom を例示。

### B8 ⚠️ 名前解決とスコープ

bare name が component 名と衝突 — タブのボタン「ホーム」が画面「ホーム」への参照に化ける（R9、music が実地で衝突し改名回避 + 警告を提案）。alias のスコープ未規定。同名 alias が variant ごとに別実体でも「曖昧にならない」と言い切っている（R11）。同一 component 内・別 inline の同名要素（video）。参照 2 段が member 名に丸まって素通り（S11=R10 — inline 入れ子は書けるのに指せない）。
決定案: 「alias は宣言された single-body にローカルで component 名より優先」「component 名と一致する bare 要素名には警告（W 系）」「inline の入れ子は 1 段まで（それ以上は component へ昇格）」。

### B9 ⚠️ frame 木の残り穴

同名 @S の遠隔破棄でどれを消すか（R5）。barrier なし子フレームの底を back() で割ったときの親復帰（R8）。present 製セッションへの switch 復帰の可否（language）。アプリ再起動を跨ぐ @S の生存（language — switch の resume はプロセス生存前提か）。
決定案: R18-6 の「フレーム木の状態遷移を before/操作/after の表で書き下す」が根治。復帰対応表（push/present/switch × back/exit/dismiss/switch）を 1 枚置く。

### B10 ⚠️ 小物（各 1 文で潰せる）

継続行の `#`/`##` 境界越え禁止（R1）。同一 condition label 再出現の帰属（S16 — 実装は選択肢分裂）。collection の順序は未保証（video）。循環 import は許容・同名 alias 再 import は上書きかエラーか（S15=R14）。component/variant 重複定義はエラー（S17=R6 — 実装 E005/E006 に規定を追随）。component 0 個文書のエントリ未定義（R15）。free-text 内の括弧は対象参照に食われる（R12 — `いいね(2回目)` の `(2回目)` が対象化、実測確認済み）。quoted name の正準値は quote を剥いだ文字列（A4 の spec 側）。エスケープ無しの動機 1 文（R13）。診断コードレジストリ表を §新設（S17 — E/P/W/R 系を「コード/条件/severity/定義節」で列挙し実装と CI 突合）。

## C. 表現力ギャップ（DSL 改善アイデア — 後方互換不問）

| # | ギャップ | 証拠 | アイデア |
|---|---|---|---|
| C1 💭 | **オーバーレイ/常駐レイヤー**（PiP・ミニプレイヤー・トースト・着信バナー）— 「アクティブフレームは常に 1 つ」の外側 | video + music が独立到達。回避は document common + 自然文で「条件付き可視性」が落ちる | 遷移体系はいじらず「この component はアクティブフレームと独立に表示され続ける」という評価しない軽量注記（図示ヒント）。可視条件は自然文のまま |
| C2 💭 | **ウィザード複数入口で出口を固定できない** — exit(@S) は begin 地点固定 | banking（取引詳細から入ると exit がホームに戻らない） | `exit(@S, 戻り先)` 相当の戻り先上書き。exit の子孫破棄保証は保つ |
| C3 💭 | **カウント・反復**（パスコード 3 回・10 問・3 問） | banking は variant 3 連鎖、language は condition label 注記で回避 | 専用記法は増やさず「カウンタは variant 展開か label 注記」という指針を spec に明文化（何が variant で何がデータかの線引き） |
| C4 💭 | **interaction セットの cross-component 共有** — 選択式/入力式の「次へ」4 複製・「×」確認 2 複製 | language。タブバー部品化（music）では解けない種類 | 当面は「共通 interaction を持つ部品を置く」を正攻法として例示。mixin 的機構は原則 2 と衝突するため実需の再観測まで見送り可 |
| C5 💭 | collection 全体参照が常に inline 二重ラップ | R18 | 参照側も `*手札`（全体）/`手札`（単一）の対称記法 |
| C6 💭 | **タブバーの正攻法が spec から読めない** — messenger は 3 画面に switch 群を複製、music は部品化に自力到達 | 被験者間の対比 | 「タブバー部品に switch 群を持たせ、各画面は要素を置くだけ」を spec のタブ慣用句に追記。battle.shitae も部品化に書き換え |
| C7 💭 | self-transition の語彙（次エピソード・次の問題 — 画面は同じで中身が変わる） | video は effect で回避（確信 中）、language は self-goto | 「画面が変わらない変化は effect でよい」を明文化するだけで足りる可能性が高い |
| C8 💭 | typo・予約語追加が黙って effect 化する（A2 の構造原因） | S19。`gotoo(X)` も `switch(...)` も無音 | 「`語(引数)` の形をした effect」への lint（W 系）。予約語追加時の互換戦略として spec に一言 |
| C9 💭 | switch 復帰先の粒度 — 「タブの先頭へ」と「中断位置へ」の使い分け | messenger（通知でスレッド直行 vs 復帰位置） | B1 の複合遷移明文化で大半解決。必要なら「switch は常に中断位置。先頭に戻したければ switch 後に goto」を慣用句として例示 |

## D. 文書改善（規範は変えない）

- **フレーム木の worked example 不足** — 全 verb について「この操作でフレーム木がこう変わる」図解を要望（banking）。B9 の対応表と同時に解決
- 規範の分散: 「戻り先が無いとき」が 4 箇所重複（R16）、shadow の前方参照ポインタ欠落（R17）、inline の「variant・interaction 不可」を記号一覧にも（messenger）
- 「フォロー/フォロー解除」例が参照実装として極めて有効（video 証言）— B1・C1 等の新規則にも同格の最小例を付ける
- モデル勾配所見: haiku でも基本構文は完走。躓きは gate・barrier・複合遷移に集中 — モデル能力でなく仕様側の問題と切り分け済み（reservation/grading.md）

---

## 推奨する着手順

1. **B1（複合遷移の逐次意味論）** — 1 文 + 例で全プローブの最頻出不安を消す
2. **A 系の実装追随** — ただし A1/A2 は仕様確定（B7・B9）後に TDD で。A3/A4/A6 は仕様が既に明確なので先行可
3. **B2〜B4（frame 木の決定 3 点）** — オラクルで読者期待が判明している（B2 は「保存」側、B3 は「止まる」側が読者期待）
4. **B5〜B6（gate と shadow の操作的定義）** — gate 実装（A5）の前提
5. C 系は設計者の裁量。C6（タブ正攻法の明文化）と C7 は文書だけで済み安価
