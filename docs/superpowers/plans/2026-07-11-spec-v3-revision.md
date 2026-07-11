# SPEC v3 改訂（Plan A: 文書のみ）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設計書 `docs/superpowers/specs/2026-07-11-dsl-v3-design.md` の項目 1・2・3・5 を SPEC.md / AI_GUIDE.md / example に反映する（文書のみ。処理系は Plan B、stroke は Plan C）。

**Architecture:** SPEC.md を節単位で改訂し、AI_GUIDE.md と example を追随させる。各タスク＝1 論理変更＝1 コミット。処理系のコードは一切触らない。

**Tech Stack:** Markdown、Python（docs/ 直下の検証スクリプトのみ）。

## Global Constraints

- 文書中の文は意味の切れ目でない場所で改行しない（ユーザー CLAUDE.md の文章ルール）。
- `.mmd`（example-battle.mmd / example-ecommerce.mmd）は**再生成しない**。現行 transpiler は switch を知らないため、再生成は Plan B 完了後に行う。
- 項目 4（lint: 遷移語忘れ）は checker の実装なので Plan B。項目 6（stroke）は Plan C。この計画では SPEC.md に stroke の記述を追加しない。
- `import`/`::` の example 追加（設計書で「同時に検討」）は本計画ではスコープ外として見送る。ユーザーレビューで必要と判断されたら別タスク化する。
- コミットメッセージは Conventional Commits、本文末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 作業ブランチ: `spec-v3-design`（作成済み、origin/main 起点）。

---

### Task 1: SPEC.md — document 共通ブロック

**Files:**
- Modify: `docs/SPEC.md`（EBNF の `document` 規則、「二層モデル」の直後に新節）

**Interfaces:**
- Produces: SPEC 用語「document 共通部」（最初の `#` より前の body）。共通性の階層「姿固有 > component 共通 > document 共通」。Task 2・5・6 がこの用語を参照する。

- [ ] **Step 1: EBNF の document 規則を変更**

`docs/SPEC.md` の EBNF ブロック内、次の 1 行を Edit で置換する。

old:
```
document        = { import } , { component } ;
```

new:
```
document        = { import } , document-common , { component } ;
document-common = single-body ;                      (* 最初の "#" より前。全 component に共通。空でもよい *)
```

- [ ] **Step 2: 「二層モデル」節の直後に新節を追加**

`docs/SPEC.md` で、「二層モデル」節の末尾（`遷移は「component の間」も…計 6 語。一覧は「遷移語」を参照。` の段落と、その後の `---` 区切りの間）に、以下の節を挿入する。

```markdown
### document 共通部（最初の `#` より前）

最初の `#` より前に書いた要素行・インタラクション行は、**そのファイルの全 component に共通**する部分になる。`##` より前が全姿に共通であるのと相似形で、共通性は 3 階層になる：**姿固有 > component 共通（`##` より前） > document 共通（`#` より前）**。

用途は「どの画面でも起こるインタラクション」——deep link、プッシュ通知、セッション切れによる強制ログアウトなど。エントリポイントはファイル先頭の component の 1 つだが、任意の画面から始まりうる遷移（deep link 等）は document 共通のインタラクションとして表せる。

```
> プッシュ通知をタップ -> push(記事詳細)
> セッション切れ -> goto(ログイン)

# スプラッシュ
...
```

shadow 規則も同じ原理で拡張される：（行動文字列, 対象参照）が完全一致する定義が複数の階層にあれば、より特化した階層が勝つ（姿固有 > component 共通 > document 共通）。
```

- [ ] **Step 3: 検証**

Run: `grep -n 'document-common' docs/SPEC.md && grep -n 'document 共通部' docs/SPEC.md`
Expected: EBNF に 2 箇所（規則定義と参照）、新節見出しが 1 箇所出る。

- [ ] **Step 4: Commit**

```bash
git add docs/SPEC.md
git commit -m "docs(spec): document 共通ブロック（最初の # より前＝全 component 共通）を追加"
```

---

### Task 2: SPEC.md — switch とフレーム木

**Files:**
- Modify: `docs/SPEC.md`（予約語、二層モデルの遷移語数、遷移語の表、EBNF、「セッションスタックと LIFO」節の全面改稿、switch 新節）

**Interfaces:**
- Consumes: Task 1 の「document 共通部」用語（本タスクでは参照しないが同一ファイル）。
- Produces: SPEC 用語「フレーム」「フレーム木」「アクティブパス」「兄弟規則」、遷移語 `switch(X, @S)`。Task 5・6 が参照する。

- [ ] **Step 1: 予約語一覧に switch を追加**

old:
```
- 遷移語（複合）：`present`（= 壁ありの `push` ＋セッション） `dismiss`（= 直近の無名セッション、または `@S` を破棄）
```

new:
```
- 遷移語（複合）：`present`（= 壁ありの `push` ＋セッション） `dismiss`（= 直近の無名セッション、または `@S` を破棄） `switch`（= フレームの中断と復帰。resume-or-create）
```

- [ ] **Step 2: 二層モデル節の遷移語数を更新**

old:
```
遷移は「component の間」も「同一 component の姿の間」も同じ遷移語で書く（行き先で区別しない）。遷移語はコア 4 語（`push`/`back`/`goto`/`exit`）＋複合 2 語（`present`/`dismiss`）の計 6 語。一覧は「遷移語」を参照。
```

new:
```
遷移は「component の間」も「同一 component の姿の間」も同じ遷移語で書く（行き先で区別しない）。遷移語はコア 4 語（`push`/`back`/`goto`/`exit`）＋複合 3 語（`present`/`dismiss`/`switch`）の計 7 語。一覧は「遷移語」を参照。
```

- [ ] **Step 3: 遷移語節の冒頭と表を更新**

old:
```
コアは **`push` / `back` / `goto` / `exit`** の 4 語。**`present` / `dismiss`** は壁とセッションを一語に束ねた**複合語**（後述）。
```

new:
```
コアは **`push` / `back` / `goto` / `exit`** の 4 語。**`present` / `dismiss` / `switch`** は壁とセッションにまつわる意図を一語に束ねた**複合語**（後述）。
```

表の `dismiss` 行の直後に次の行を追加：

```
| `switch(X, @S)` | フレームの中断と復帰（タブ等の並行文脈）。@S が生きていれば中断位置へ復帰、無ければ X で新規開始（resume-or-create）。back の壁あり | △ |
```

- [ ] **Step 4: EBNF に switch-nav を追加**

old:
```
transition      = push-nav | present-nav | goto-nav | back-nav | exit-nav | dismiss-nav ;
```

new:
```
transition      = push-nav | present-nav | goto-nav | back-nav | exit-nav | dismiss-nav | switch-nav ;
```

`dismiss-nav` の規則行の直後に追加：

```
(* switch は中断・復帰の複合語。セッション必須（辞書のキーになるため省略不可） *)
switch-nav      = "switch" , "(" , nav-target , "," , session , ")" ;
```

- [ ] **Step 5: 「セッションスタックと LIFO」節をフレーム木に全面改稿**

節見出し `### セッションスタックと LIFO` から次の節見出し（`### present / dismiss は複合語`）の手前までを、以下に置換する。

```markdown
### フレーム木

処理系は内部的に**フレーム木**を持つ。**フレーム**＝ (component, 姿) の組を積むスタック 1 本＋壁の有無。ルートはエントリポイントを積んだ無名フレームで、**アクティブなフレームは常に 1 つ**。ユーザーが木を直接操作する記法はない（意味を与えるための内部モデル）。

- `push(X)` / `goto(X)` / `back()` は現在フレームのスタックを操作する（積む／最上段を置き換える／降ろす）。
- `push(X, @S)` / `present(X, @S)` は現在フレームの**子**フレーム @S を作ってアクティブにする（begin 地点＝親フレーム内のその位置）。壁を立てるのは present のみ。
- `switch(X, @S)` は中断と復帰（次節）。
- 戻り系（`back` / `exit` / `dismiss`）の走査は**アクティブパス**（現在フレームから祖先方向）のみ。中断中の兄弟フレームは見ない。`exit(@S)` / `dismiss(@S)` の「新しい方から最初の @S」規則はアクティブパス上でそのまま適用する——@S が一意なら範囲破棄、同名複数なら直近まで（LIFO）、の説明も変わらない。
- `exit(@S)` / `dismiss(@S)` は @S と**その子孫フレームを全部**破棄し、begin 地点へ戻る。子孫ごと破棄なので「ログアウトでタブ全滅」が規則の追加なしに導かれる。
- 戻り系はスタックに積まれた時点の姿へ戻る（初期姿にリセットしない）。`goto(##姿)` は現在フレームの最上段の姿を書き換える——後で戻ってきたときは書き換え後の姿が見える。

switch を使わないドキュメントでは木は一本道になり、従来どおり「単一のセッションスタック」として読める。

### switch（中断と復帰）

`push` / `present` が**開始**、`exit` / `dismiss` が**破棄**であるのに対し、`switch` は**中断と復帰**。「離れても破棄されず、戻れば続きから」という並行文脈——タブナビゲーションが代表——を表す。開始・破棄しか無い世界では「離れる＝破棄」しかできず、タブ（各タブのスタックを保持したまま行き来する）が書けない。

- **`switch(X, @S)`** — @S が生存していれば、現在フレームを**中断**（破棄しない）して @S の中断位置（そのフレームの最上段の (component, 姿)）へ復帰する。このとき X は無視される（ツールは定義と異なる X を警告してよい）。@S が無ければ（未作成または破棄済み）、フレームを新規作成して X で開く。resume-or-create の一語。
- 引数はこの 1 形式のみ。セッションは辞書のキーなので省略できず、resume 専用形（`switch(@S)`）も持たない——常に resume-or-create なので、初回と復帰を書き分けなくてよい。
- **壁あり**（present と同様）。switch 先のフレームの底で `back()` しても元のフレームへは漏れない（no-op）。
- **兄弟規則**：switch でフレームを新規作成するとき、現在フレームが switch 製なら**兄弟**（現在フレームと同じ親の子）、switch 製でなければ**子**にする。これにより、タブ群は訪問順によらず常に横並びになる（「常に子」にすると木の形が訪問順に依存し、`exit(タブ1)` が後から訪れたタブ 2 を道連れにする事故が起きる）。
- 中断中（非アクティブ）の @S への `exit(@S)` は**可**。そのフレームを裏で破棄し、画面（アクティブフレーム）は動かない。
- 破棄済み @S への `switch(X, @S)` は再作成（まっさらの X で開き直す）。「再ログインでタブが初期状態」が規則の追加なしに導かれる。

**タブの慣用句**。タブの 1 枚目（ホームタブ）だけが switch 製でないと、ホームタブのタップが `switch` で重複フレームを作ってしまう。そこで**タブ群への入場自体を名前付きフレームで行う**（例：ログイン成功時の `present(ホーム, @tabHome)`）。ホームタブが他タブの親（錨）になる非対称は許容する——「ホームタブがルート」という実装プラットフォームの通例とも一致する。

```
# ログイン
> タップ(ログインボタン) -> [成功] present(ホーム, @tabHome)   // ホームタブ＝錨フレーム

# ホーム
タブバー
> タップ(タブバー.検索) -> switch(検索, @tabSearch)
> タップ(タブバー.ホーム) -> switch(ホーム, @tabHome)   // 生存中なので復帰。重複生成しない
> ログアウト -> exit(@tabHome)   // 子孫ごと破棄＝全タブ破棄
```
```

- [ ] **Step 6: 遷移語に関する既存記述の整合を確認・修正**

以下を grep し、switch と矛盾する記述が残っていないか確認する。

Run: `grep -n '6 語\|複合 2 語\|計 6\|push.*present.*のみ' docs/SPEC.md`
Expected: ヒットなし（Step 2 で置換済みのはず）。ヒットしたら該当行を 7 語・複合 3 語に修正する。

また「セッションを開始できるのは積む側（`push` / `present`）のみ」の段落（「セッション（`@S`）」節内）を次のとおり修正する。

old:
```
- セッションを開始できるのは積む側（`push` / `present`）のみ。`goto` は不可、`back` は画面方向なので無関係。
```

new:
```
- セッションを開始できるのは積む側（`push` / `present`）と `switch`（新規作成時）のみ。`goto` は不可、`back` は画面方向なので無関係。
```

- [ ] **Step 7: 検証**

Run: `grep -c 'switch' docs/SPEC.md`
Expected: 10 以上（予約語・表・EBNF・新節・慣用句）。

Run: `grep -n 'セッションスタック' docs/SPEC.md`
Expected: ヒットなし（節ごと置換済み）。「スタックが積むのは (component, 姿)」の旧段落もフレーム木節に統合されて残っていないこと。

- [ ] **Step 8: Commit**

```bash
git add docs/SPEC.md
git commit -m "docs(spec): switch（中断・復帰）を導入しセッションスタックをフレーム木に改稿"
```

---

### Task 3: SPEC.md — 姿はインスタンスごとに独立

**Files:**
- Modify: `docs/SPEC.md`（「操作は姿に属する」節の末尾、「2 種類のガード的なもの」小節の後ろ）

**Interfaces:**
- Produces: SPEC の段落「姿はインスタンスごとに独立」。Task 5 が要約を参照する。

- [ ] **Step 1: 小節を追加**

「操作は姿に属する（条件式を持たない理由）」節の末尾（shadow の段落 `**共通部分と姿固有部分で同じ行動が衝突したとき**…` の直後、次の `---` の手前）に以下を挿入する。

```markdown
### 姿はインスタンスごとに独立

同じ component を複数の場所に置いたとき（画面 A と画面 B に同じ「プロフィールカード」等）、各インスタンスの姿は**独立**している。一方のインスタンスで `goto(##フォロー済)` しても、他方のインスタンスの姿は変わらない。

インスタンス間で姿を同期させたい（A でフォローしたら B のカードも変わる）は、共有データの関心であり実装の領分——shitae はデータを持たないと決めたが、姿がデータの代理をする以上この問題は姿に滲み出る。shitae は言語では扱わず（共有姿の記法を持たず）、同期するという事実が設計上重要なら自然文で注記する（`> タップ(フォロー) -> フォローする ; 他画面のカードにも反映される ; goto(##フォロー済)`）。simulator 上でインスタンス間の姿が食い違って見えるのはラフの代償として許容する。
```

- [ ] **Step 2: 検証**

Run: `grep -n '姿はインスタンスごとに独立' docs/SPEC.md`
Expected: 1 箇所。

- [ ] **Step 3: Commit**

```bash
git add docs/SPEC.md
git commit -m "docs(spec): 姿はインスタンスごとに独立（同期は実装の領分）を明記"
```

---

### Task 4: SPEC.md — `?` の motivation を追記

**Files:**
- Modify: `docs/SPEC.md`（「2 種類のガード的なもの」の 1. 存在ゲートの段落）

**Interfaces:**
- Produces: `?` が opt-in である理由の明文。Task 5・6 が参照する。

- [ ] **Step 1: 存在ゲートの段落に理由を追記**

「2 種類のガード的なもの」の 1.（存在ゲート）の段落末尾、`XState の `guard`（同じ状態でも式の真偽で可否が変わる動的な制御）とは異なる。` の直後に、同じ段落として続けて以下を追記する。

```
`?` が opt-in（既定は「対象不在でも常在」）なのは、**要素行に書いていない対象への行動を許す**ため。ラフの段階では、まだ要素行に置いていない・置くかどうか未定の対象へ行動を書くことが普通にある（`> タップ(投了) -> goto(##リザルト)` と書くとき「投了」ボタンを要素行に置き終えている必要はない）。存在を自動で行動の条件にすると、これらの行動が黙って無効になり、ラフさの核が壊れる。だから既定は常在とし、存在を条件にしたいときだけ書き手が `?` で opt-in する。典型の使いどころは共通部分（`##` より前）に置いた行動で、「その対象を持つ姿でだけ有効」にしたいとき。
```

- [ ] **Step 2: 検証**

Run: `grep -n 'opt-in（既定は「対象不在でも常在」）' docs/SPEC.md`
Expected: 1 箇所。

- [ ] **Step 3: Commit**

```bash
git add docs/SPEC.md
git commit -m "docs(spec): 存在ゲート ? が opt-in である理由（未定義対象への行動を許すラフさ）を明記"
```

---

### Task 5: AI_GUIDE.md を v3 に追随

**Files:**
- Modify: `docs/AI_GUIDE.md`

**Interfaces:**
- Consumes: Task 1「document 共通部」、Task 2「フレーム木」「switch」「兄弟規則」、Task 3「姿の独立性」、Task 4「? の motivation」。

- [ ] **Step 1: 予約語に switch を追加**

old:
```
- 遷移語（複合）：`present`（壁ありセッションの開始）`dismiss`（直近の無名セッションの破棄）。糖衣ではなく、コア 4 語に「壁」を組み合わせた複合語（壁は `push` 単体では表せない）。
```

new:
```
- 遷移語（複合）：`present`（壁ありセッションの開始）`dismiss`（直近の無名セッションの破棄）`switch`（フレームの中断と復帰。タブ等）。糖衣ではなく、コア 4 語に「壁」「中断・復帰」を組み合わせた複合語。
```

- [ ] **Step 2: 「構文（最小要約）」に document 共通部と switch を追加**

構文ブロック内、`import auth as auth` の行の直前に以下の 2 行を追加する。

```
> ... -> switch(検索, @tabSearch)  ← 中断と復帰（タブ）。@S 生存なら復帰、無ければ検索で新規開始
（最初の # より前の行）           ← document 共通部＝全 component に共通（deep link・通知・強制ログアウト等）
```

- [ ] **Step 3: 「遷移語の使い分け」に switch を追加**

`dismiss` の行の直後に追加：

```
- **`switch(X, @S)`** … フレームの**中断と復帰**（タブ等の並行文脈）。@S が生きていれば中断位置へ復帰（X は無視）、無ければ X で新規開始（resume-or-create）。**@S 必須**。壁あり。
```

- [ ] **Step 4: 「スタックと戻り先」小節をフレーム木で書き直す**

old（小節全体）:
```
### スタックと戻り先

処理系はスタックに **(component, 姿) の組**を積む（`push`/`present` が積み、`back`/`exit`/`dismiss` が戻る）。戻り先はその組が積まれた時点の姿。`goto(##姿)` は積まず、現在のエントリ（スタック最上段）の姿を書き換えるだけ。

戻り先が無い（back の壁・該当する `@S`・積む先のどれも無い）ときの `back`/`exit`/`dismiss` は **no-op**。ツールは警告してよいが、エラーにはしない。
```

new:
```
### フレーム木と戻り先

処理系は**フレーム木**を持つ。フレーム＝ (component, 姿) の組を積むスタック 1 本。`push(X, @S)`/`present(X, @S)` は子フレームを作り、`switch` は中断・復帰（生存フレームへ移る／新規作成。新規作成時、現在フレームが switch 製なら兄弟、でなければ子）。`exit(@S)`/`dismiss(@S)` は @S を**子孫ごと**破棄して begin 地点へ（ログアウトでタブ全滅）。中断中の @S への exit も可（画面は動かない）。戻り系の走査はアクティブパス（現在フレーム→祖先）のみ。戻り先はその組が積まれた時点の姿。`goto(##姿)` は積まず、現在フレーム最上段の姿を書き換えるだけ。

タブは「ログイン成功で `present(ホーム, @tabHome)`（錨フレーム）、各タブへ `switch(X, @tabX)`、ホームタブへ戻るのも `switch(ホーム, @tabHome)`」が慣用句。

戻り先が無い（back の壁・該当する `@S`・積む先のどれも無い）ときの `back`/`exit`/`dismiss` は **no-op**。ツールは警告してよいが、エラーにはしない。
```

- [ ] **Step 5: 「共通と姿固有の優先順位」を 3 階層に更新**

old:
```
共通節（`##` より前）と姿固有節に**同じ (行動, 対象参照) の組**が両方にあれば、姿固有側が共通側を **shadow**（特化が勝つ）。外部からの要素参照が部品定義側の挙動を上書きするのと同じ原理。
```

new:
```
document 共通部（最初の `#` より前＝全 component 共通）・component 共通節（`##` より前＝全姿共通）・姿固有節に**同じ (行動, 対象参照) の組**があれば、より特化した側が **shadow**（姿固有 > component 共通 > document 共通）。外部からの要素参照が部品定義側の挙動を上書きするのと同じ原理。
```

- [ ] **Step 6: チェックリストに 3 項目追加、姿の独立性を全体像に 1 行追加**

チェックリストの末尾（`- [ ] `?`（存在ゲート）は…` の直後）に追加：

```
- [ ] タブ（離れても状態が残る並行文脈）は `switch(X, @S)` か。`goto` はタブの状態を捨て、`push` は積み上がる。
- [ ] `switch` に @S を渡したか（省略不可。resume 専用形は無い）。
- [ ] どの画面でも起こる遷移（deep link・通知・強制ログアウト）は document 共通部（最初の `#` より前）に書いたか。
```

「全体像」の箇条書き末尾（`- 実行の起点：…` の直後）に追加：

```
- 同じ component を複数箇所に置いたとき、各インスタンスの**姿は独立**（同期は実装の領分。設計上重要なら自然文で注記）。
```

- [ ] **Step 7: 検証**

Run: `grep -c 'switch' docs/AI_GUIDE.md`
Expected: 6 以上。

Run: `grep -n 'document 共通部' docs/AI_GUIDE.md`
Expected: 3 箇所（構文要約・優先順位・チェックリスト）。

- [ ] **Step 8: Commit**

```bash
git add docs/AI_GUIDE.md
git commit -m "docs(guide): AI_GUIDE を v3（switch・フレーム木・document 共通部・姿の独立性）に追随"
```

---

### Task 6: example-battle を v3 記法に更新し検証スクリプトを追随

**Files:**
- Modify: `docs/example-battle.shitae`
- Modify: `docs/check_refs.py`

**Interfaces:**
- Consumes: Task 2 のタブ慣用句、Task 4 の `?` の典型使いどころ（共通部の行動）。
- Produces: v3 の全機能（switch・document 共通部・`?`）が登場する検証済み example。Plan B のテストフィクスチャ元ネタになる。

- [ ] **Step 1: check_refs.py の遷移語に switch を追加**

old:
```python
    nav_pat = re.compile(r'\b(push|goto|present|back)\s*\(([^)]*)\)')
```

new:
```python
    nav_pat = re.compile(r'\b(push|goto|present|back|switch)\s*\(([^)]*)\)')
```

- [ ] **Step 2: example-battle.shitae 冒頭のコメントブロックを更新**

old:
```
// alias / 集合(*) / バリエーション(##) / 共通部分(##より前) / 姿替え(goto) / ログイン後モード(present+exit) /
// モード/モーダル(present・dismiss) / 戻れない置換(goto) / 姿指定の遷移(##) /
// 行動(対象) / 行動の自然文 / 条件ラベル([...]) / 副作用の自然文 /
// 未定の自然文 / 内部要素の外部参照と上書き / component の再利用 /
// inline によるグルーピング / セッション(@S)を push・present で開始し exit・dismiss で破棄
// がすべて登場する。組み込み component は使わない（すべて対等な名前）。
```

new:
```
// alias / 集合(*) / バリエーション(##) / 共通部分(##より前) / document 共通部(最初の # より前) /
// 姿替え(goto) / ログイン後モード(present+exit) / タブ(switch・錨フレーム) /
// モード/モーダル(present・dismiss) / 戻れない置換(goto) / 姿指定の遷移(##) /
// 行動(対象) / 行動の自然文 / 条件ラベル([...]) / 存在ゲート(?) / 副作用の自然文 /
// 未定の自然文 / 内部要素の外部参照と上書き / component の再利用 /
// inline によるグルーピング / セッション(@S)を push・present で開始し exit・dismiss で破棄
// がすべて登場する。組み込み component は使わない（すべて対等な名前）。
```

- [ ] **Step 3: document 共通部を追加**

`// ───────` 区切り行と `# スプラッシュ` の間に挿入する。

```
// document 共通部（最初の # より前）＝全 component に共通
> プッシュ通知をタップ -> push(記事詳細)
> セッション切れを検知 -> goto(ログイン)

```

- [ ] **Step 4: ログインとホームをタブ慣用句に変更**

ログインの present を錨フレーム名に変える。

old:
```
> タップ(ログインボタン) ->
>     [成功] 認証する ; present(ホーム, @loggedIn)   // 成功でログイン後モードへ
```

new:
```
> タップ(ログインボタン) ->
>     [成功] 認証する ; present(ホーム, @loggedIn)   // ログイン後モード＝ホームタブの錨フレーム
```

ホームにタブバーを追加し、ランキングタブへの switch を足す。

old:
```
# ホーム
プロフィールカード
*メニュー
フィード: {
  *サムネイル
}
> タップ(プロフィールカード.本体) -> push(マイページ)   // 内部要素を外から上書き：自分のカードはマイページへ
> タップ(対戦をさがす) -> push(マッチング)
```

new:
```
# ホーム
タブバー: { ホームタブ ; ランキングタブ }
プロフィールカード
*メニュー
フィード: {
  *サムネイル
}
> タップ(タブバー.ランキングタブ) -> switch(ランキング, @tabRanking)   // タブ＝中断・復帰。ホーム側の状態は破棄されない
> タップ(プロフィールカード.本体) -> push(マイページ)   // 内部要素を外から上書き：自分のカードはマイページへ
> タップ(対戦をさがす) -> push(マッチング)
```

- [ ] **Step 5: ランキング component を追加**

`# 設定` の定義の直前に挿入する。

```
# ランキング
タブバー: { ホームタブ ; ランキングタブ }
*順位行
> タップ(タブバー.ホームタブ) -> switch(ホーム, @loggedIn)   // 錨フレーム＝ホームタブへ復帰（生存中なので新規生成しない）
> タップ(順位行) -> push(マイページ)   // 他人のページも同じ component（姿は独立）

```

- [ ] **Step 6: 対戦 component に `?` の使用例を入れる**

共通部分（`## 開始` より前）に投了の行動を `?` 付きで移し、`##対戦中` に要素「投了」を追加、`##対戦中` の投了行を削除する。

old:
```
# 対戦
合図   // ## より前 = 全姿に共通
me: プロフィールカード
opponent: プロフィールカード
> タップ(opponent.本体) -> 相手のプロフィールを開くか未定   // 外から上書き。仕様未定
## 開始
> タップ(合図) -> goto(##対戦中)   // 同一 component の別の姿へ
## 対戦中
タイマー
*手札
> タップ(手札) ->
>     [決着] goto(##リザルト)
>     [続行] 盤面が更新される
> 長押し(手札) -> present(カード詳細)   // 同じ対象に別の行動
> タップ(投了) -> goto(##リザルト)
```

new:
```
# 対戦
合図   // ## より前 = 全姿に共通
me: プロフィールカード
opponent: プロフィールカード
> タップ(opponent.本体) -> 相手のプロフィールを開くか未定   // 外から上書き。仕様未定
> タップ(投了?) -> goto(##リザルト)   // ? = 存在ゲート。投了ボタンを持つ姿（##対戦中）でだけ有効
## 開始
> タップ(合図) -> goto(##対戦中)   // 同一 component の別の姿へ
## 対戦中
タイマー
投了
*手札
> タップ(手札) ->
>     [決着] goto(##リザルト)
>     [続行] 盤面が更新される
> 長押し(手札) -> present(カード詳細)   // 同じ対象に別の行動
```

- [ ] **Step 7: 検証スクリプトを実行**

Run: `cd /Users/m5/works/shitae/docs && python3 check_refs.py && python3 check_modals.py`
Expected: check_refs.py がエラー 0 件（`switch(ランキング, ...)` の「ランキング」が定義済みとして解決される）。check_modals.py の指摘が Task 実施前から増えていない。

- [ ] **Step 8: Commit**

```bash
git add docs/example-battle.shitae docs/check_refs.py
git commit -m "docs(examples): example-battle に v3 記法（switch タブ・document 共通部・存在ゲート ?）を導入"
```

---

## Self-Review 記録

- 設計書項目 1（switch/フレーム木）→ Task 2・6。項目 2（document 共通ブロック）→ Task 1・5・6。項目 3（姿の独立性）→ Task 3・5。項目 5（? 説明強化＋example）→ Task 4・6。項目 4（lint）と 6（stroke）は Plan B / Plan C に委譲（Global Constraints に明記）。
- `.mmd` 非再生成の理由と時期（Plan B 後）を Global Constraints に明記。
- Task 6 Step 5 の `switch(ホーム, @loggedIn)` は Task 2 の慣用句（錨フレーム）の実例——設計書の `@tabHome` と名前が違うのは、example では「ログイン後モード」と「ホームタブの錨」が同一フレームであることを示すため（コメントで説明済み）。
