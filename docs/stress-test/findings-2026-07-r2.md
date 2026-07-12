# shitae SPEC stress-test round 2 — findings 集約（2026-07-12）

round 1 の Phase 4 反映（SPEC pass1/pass2・E012-E021・frame 木 runtime）直後の再検査。焦点は新規/変更構文: document common・switch/frame 木・overlay・collection 対称参照。

- **手トレース + CLI/runtime 実測**（S1-S17 — `spec-review-2026-07-r2.md`、境界例 `cases/c11-c17`、トレース `oracle/run-oracle-r2.mjs` 9 本 = 手トレース 9/9 的中）
- **SPEC 単体内部整合レビュー**（R1-R10 — `spec-internal-review-r2.md`、sonnet 独立視点）
- **実書きプローブ 3 本 + オラクル 8 問**（`probes/{podcast,delivery,photosns}-r2/grading.md`・`oracle/grading-r2.md`。sonnet×2 + haiku×1 + オラクル sonnet×1）

**収束の注記**（独立到達 = 確度高）: back(X) 矛盾（S12 = R3 = oracle Q2 の三重）、裸 ##variant 禁止未施行（S1 = R2）、再 show 未規定（S2 = R7 = oracle Q7）、shadow×`*`（S5 = R8）、switch 入れ子トラップ（S11 = oracle Q1）、**永続状態の需要（3 プローブ全てが独立申告）**、前方参照の一般規定不安（podcast = delivery）。

**round-1 regression**: A1-A4・A6・A7 解消確認。**A5（presence gate 下流実装）のみ未解消のまま継続**。

判定: ❌ = 矛盾・欠陥 / ⚠️ = 未規定 / 💭 = 設計議論。

---

## A. 実装が SPEC に追いついていない（修正は実装側 — 仕様は既に明確）

| # | 内容 | 出典 |
|---|---|---|
| A1 ❌ | **presence gate が依然未実装**（round-1 A5 継続）。`existsGated` の消費者は resolver の「shadow 一致で無視」のみ。simulator は gate 付き interaction を常に有効表示 | c16 |
| A2 ❌ | document common の裸 `##variant` 禁止が未施行 — 診断ゼロで素通りし、simulator では「現在画面の variant 切替」として動く。診断コード表にも欠番 | S1 = R2 |
| A3 ❌ | `show(X##v)` の variant が runtime/simulator で捨てられる（AST には乗る）。「掲示時の variant を選ぶ」が実行状態に存在しない | S2、oracle Q7 |
| A4 ❌ | shadow の空白畳み込み未実装（quote 剥ぎ・`?` 無視は実装済み、空白だけ生比較） | S4 (c17) |
| A5 ❌ | 3 階層 shadow の document common 階層が未実装 — simulator は doc common を別枠常時表示し、同一 (行動, 対象) の variant/共通定義と照合しない。同名ボタンが 2 つ並ぶ | S6 (c11) |
| A6 ❌ | simulator の `dismiss()` が素の push フレームを「無名セッション」誤認して pop（SPEC: mismatch は no-op。runtime は正しく R002） | S7 |
| A7 ❌ | simulator の switch 近似が中断フレームを**破棄**（resume = slice）。「中断＝破棄しない」の核と乖離。正解器としての採点誤誘導リスク | S9 |
| A8 ⚠️ | 掲示中 component の interaction が simulator で操作不能（帯に名前が出るだけ） | S8 |
| A9 ❌ | mermaid: quoted variant 名のノード ID が宣言側と edge 側で不一致（sanitize 経路 2 つ）+ ラベル内 quote 未エスケープ → 出力が mermaid として不正 | podcast 実測 |
| A10 ❌ | `show(*トースト)` が `*` を名前に取り込み `"*トースト"` という別 ID を黙って作る。E021 は nav-target 限定で overlay 引数はノーチェック | S3 (c13) |
| A11 ❌ | 記号の name 混入がさらに 2 系統: 要素行の `?`（`ストーリーサムネイル?` が要素名になり gate と永遠に不一致）・要素行の `[label]`（inline 内で名前に混入）。`行動()` の空対象参照も name="" で素通り | photosns 実測 |

A10/A11 は「文法にない記号が name に食われて別名になる」同族。個別 E 化か、name への記号混入を一括で lint するか、は B12 の設計判断とセット。

## B. SPEC の明示決定が要る未規定（優先度順）

### B1 ⚠️ 裸 `##variant` の解決規則 — 字句ホストか実行時カレントか【oracle が発掘した上位の穴】

SPEC は裸 `##variant` を「同一 component 内の variant」と言うだけで、**「同一」がどの component か**を定義していない。書かれた場所（字句ホスト）と実行時のアクティブ component は、(a) document common から継承された interaction、(b) 掲示中 overlay の interaction、(c) `switch/push/present(##v, …)` のフレーム新規作成、で乖離する。実装は常に実行時カレント（`navTargetToLocation`）。オラクル被験者は Q5 で「決められない」を正当報告。
決定案: 「裸 `##variant` は**実行時にアクティブな component** に対して解決される」を明記（実装・驚き最小と一致。継承 interaction が variant を切り替える用途とも整合）。あわせてフレーム作成系（switch/present/push(X,@S)）への裸 `##v` は S14 のとおり無警告でフレームが増えて危険 — 禁止（E 化）を推奨。

### B2 ⚠️ switch 兄弟規則の入れ子トラップ【S11 = oracle Q1】

タブ内で `push(記事, @reading)` → そこから `switch(検索, @tabSearch)` すると検索タブが push フレームの**子**になり、`exit(@reading)` が**検索タブを無警告で道連れ破棄**（T1 実測）。兄弟規則の動機（exit がタブを道連れにする事故の防止）が、タブ以外のフレームを 1 枚挟むと再発する。実装は SPEC の字義に忠実 — 穴は SPEC 側。
決定案: (a) 現状を仕様とし「タブバーの switch はタブフレーム直下でだけ有効」を慣用句の前提として明記、(b) 兄弟規則を「**最も近い switch 製祖先**の兄弟にする（無ければ子）」へ強化。読者期待は (b) 寄り（oracle 被験者・photosns/podcast とも「タブは常に横並び」前提で書いた）。

### B3 ⚠️ back(X) の探索範囲 — 対応表と本文の矛盾【三重収束 S12 = R3 = oracle Q2】

対応表は「F のスタックを X まで遡る／見つかれば**同じ F**」、本文は「走査は**アクティブパス**（祖先方向）」。実装は barrier なしフレーム境界を越えて遡り、**越えた子フレームを begin マーカーごと破棄**する（T2: back(ホーム) が @S を消し、後続 exit(@S) が R002）。越えた子の破棄はどこにも書かれていない。
決定案: 実装挙動（越える + 破棄。barrier では停止 = ADR-0001 維持）を正として対応表を書き直し、「越えた子フレームは begin マーカーごと破棄される」を明記。

### B4 ⚠️ 再 show の variant 更新と show の variant 省略時既定【S2 = R7 = oracle Q7 / R5】

掲示中に別 variant で再 `show` → 更新か no-op か未規定。オラクル被験者は集合意味論から「更新」を導出（読者期待）。variant 省略時の既定も未規定（「initial variant で開く」規則は transition 限定と明記されているため流用できない）。
決定案: 「オーバーレイ集合の各エントリは (component 名, 表示 variant) を持つ。再 show は表示 variant を上書き。省略時は initial variant」を明記 → A3 の実装追随とセット。

### B5 ⚠️ 掲示中 component の variant を変える手段【R6】

overlay はフレームに居ないので `goto(##v)`（現在フレームの最上段書き換え）が適用できない。掲示中の interaction が `goto(##v)` を発火したら、B1 の「実行時カレント」解決だと**背後のアクティブ画面**の variant が書き換わる — 書き手の意図（ミニプレイヤー自身の再生⇄一時停止）と真逆。
決定案: B4 で variant を集合エントリに持たせた上で、「掲示中 component の interaction 内の裸 `##v` 遷移はそのオーバーレイの表示 variant を切り替える」と定めるか、`hide → show(X##v)` を慣用句として明示するか。B1 の解決規則の唯一の例外になりうるため設計者判断。

### B6 ⚠️ shadow 一致と `*` の交差【S5 = R8】

B6（round-1）の文言「対象参照は quote を剥いだ name の等価」は ADR-0004 以前のもので `*` に言及なし。実装も `collection` フラグを比較せず、`スクロール(*手札)` と `スクロール(手札)` が shadow し合う。意味的には別対象（全体 vs 1 インスタンス）。
決定案: 「`*` の有無は一致判定に**含める**（別の対象参照として両立）」を明記。`?` を含めない決定との対称性は「`?` は同一行動への条件付与、`*` は対象そのものの変更」という理由づけで整理できる。

### B7 ⚠️ document common の残り穴【R1 / S10】

(a) gate 裸参照は「host component の現在 variant」を見るが document common には host が無い — 判定不能。決定案: 「host 不在は判定不能 → always-on」で既存フォールバックを拡張。
(b) モジュール横断スコープ: SPEC は「そのファイルの全 component に共通」（ファイル単位）だが、実行時に import 先の画面を表示中どのファイルの document common が生きるかは未規定。simulator はエントリファイルのものを全画面に適用し、import 先ファイル自身のものを無視する。決定案: 「アクティブ画面が属するファイルの document common が有効」（字義に忠実）か「エントリファイルのもののみ」（実装現状）かを明示。

### B8 ⚠️ 同名 @S の解決が exit と switch で非対称【S15】

exit/dismiss は「アクティブパス LIFO → 無ければ木全体で最新」、switch 復帰は「木全体で最新」のみ。実装も同じ。意図的なら「switch にはアクティブパス優先が無い」ことを一言明記するだけ。

### B9 ⚠️ 小物（各 1 文で潰せる）

- 前方参照の一般規定 — document common 節にだけ「可」と書かれ、通常 component 本体からの前方参照が裏読みで不安になる（podcast・delivery が独立に申告）。「参照は定義順と無関係」を総則へ
- 全角括弧 `（）` は free-text の一部（構造記号は半角のみ）を明記（podcast 確信度 低で回避）
- E001 と E012 の区別が表から読めない（R9）— E001「`> -> R`（行動が空）」E012「1 行に `->` 2 つ」の区別例を追記
- 「（B2）」孤立参照の除去（R4 — ADR 内部ラベルの漏れ）、エントリポイント表現ゆれ（R10）
- 外部イベント（配達完了・セッション切れ等）を行動の自然文として書くのは想定内である旨の一言（delivery 確信度 中）
- 未定義 variant への `goto(##X)` の lint（photosns が `goto(##通常)` を存在しない variant へ発射して無音）

## C. 表現力ギャップ（DSL 改善アイデア）

| # | ギャップ | 証拠 | アイデア |
|---|---|---|---|
| C1 💭 | **フレームを生き延びる状態**が書けない — クーポン受取済/カート点数（delivery）・再生速度（podcast）・既読バッジ（photosns）。**3 プローブ全てが独立申告 = 今回の最強シグナル** | present は毎回 initial variant + variant はインスタンス独立 | delivery 被験者の具体案: document スコープの**シングルトン component 宣言**（複数回の present/push が同一インスタンスの variant を共有）。オーバーレイが既にフレーム外状態を持つので、その一般化として筋は通る。導入判断は設計者マター（データ排除の原則との緊張） |
| C2 💭 | 「今開いているものを何であれ畳んでから遷移」の汎用形が無い — 通知 deep link が modal の上に積まれる | podcast・photosns が独立申告 | `exit(@S);push(X)` は @S 名指しが必要。root への収束を書く語彙（あるいは「deep link は present(@app) 級の外殻セッションを張る」慣用句の明文化）。ADR-0005 の再検討材料 |
| C3 💭 | タブバー部品化の正攻法が SPEC 未反映（round-1 C6 継続）— podcast は switch 群を 3 画面に複製、photosns はホームだけに置き他タブから戻れない構造に | 2 ラウンド× 複数被験者 | SPEC のタブ慣用句に「タブバー部品に switch 群を持たせ、各画面は要素として置く」を例示（文書だけで済む） |
| C4 💭 | 条件付き要素（variant を分けるほどでない要素の出し分け） | photosns が `[label]` を要素行に外挿 | 導入せず「variant で分けるか自然文注記」を明文化で足りる可能性が高い |
| C5 💭 | システム戻るジェスチャの語彙 | photosns が行動側に `back()` を発明 | 「行動は自然文で『戻るジェスチャ』等と書く」を一言例示 |
| C6 💭 | タブ再タップで「タブの底へ戻る」慣用句 | S13 (T3): resume は最上段のまま | 「switch 後に back(タブ底)」等の慣用句例示のみ |
| C7 💭 | 特定インスタンス向け外部イベント（詳細画面を開いた後に品切れへ変わる） | delivery 諦め申告 | condition label + 自然文で足りるか、実需の再観測待ち |

## D. 文書改善（規範は変えない）

- **switch 系 verb の後の `goto(##v)` が「切替後のフレーム」に効く worked example** — photosns が確信度高で誤適用（`switch(フィード);goto(##通常)` でバッジが消えると信じた）。B1 の 1 文はあるが例が無い
- **dismiss 素通り規則の frame 列 worked example** — delivery「文章 1 回では予測できず手で追って初めて納得」
- **兄弟規則の図解** — podcast「自分で図に描くまで確信が持てなかった」
- `.` 1 段制限（E014）が EBNF の近くから読めない（podcast）
- mermaid: overlay verb が完全不可視（show/hide の関係が図から消える）・edge ラベルの member 参照 `.検索` 落ち（S16）
- inline 入れ子 1 段制限は haiku が「知識として書き写しながら適用で violation」— E015 が実際に救った。lint の価値の実証として記録のみ

## 推奨する着手順

1. **B3（back(X) 対応表修正）+ B9 小物** — 三重収束済みで決定は自明側、文書 pass 1 回で潰せる
2. **B1（裸 ##variant の解決規則）+ B2（switch 入れ子）** — frame 木意味論の残り 2 大穴。設計者判断が要る
3. **B4-B5（overlay の variant 意味論）→ A3 実装追随** — 読者期待（更新）が実測済み
4. **A 系まとめて TDD 追随** — A2/A4/A5/A6/A9/A10/A11 は仕様が既に明確。A7/A8（simulator の switch/overlay）は工事規模が大きく、simulator を @shitae/runtime の frame 木に載せ替える判断を先に
5. **A1（gate 実装）** — round-1 から持ち越し。B7(a) の決定後に
6. **C1（永続状態）** — 最強シグナルだが原則（データを持たない）と衝突する新機構。設計者の議論マター。C3/C5/C6 は文書だけで安価

## 完了状態

- Phase 1-2b 完了。subagent 2 体が session limit で途中死したが成果物は完結（全量採点済み）
- `pnpm -r test`: examples/packages 無変更のため影響なし（stress-test 成果物は fixtures 外）
- **ここで停止 — 設計者レビュー待ち**。B 群の決定と C1/C2 の扱いの承認後に Phase 4（ADR → SPEC 改訂 → TDD 追随）へ
