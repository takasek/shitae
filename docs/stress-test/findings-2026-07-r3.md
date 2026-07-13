# findings r3（2026-07-13）— 設計者レビュー用

対象: r2 で導入・変更された構文（singleton `#!`・presence gate 構造的判定・overlay Map・document common 3階層 shadow・E022〜E026/W104・canonical quoted name）。
証拠: `spec-review-2026-07-r3.md`（境界例トレース）・`spec-internal-review-r3.md`（内部整合）・`oracle/answers-r3.md`+`grading-r3.md`（意味論オラクル）・`probes/{ticketing,langlearn}-r3/grading.md`（実書きプローブ）。

手法 3 系統（手トレース+CLI 実測 / 実書きプローブ / 意味論オラクル）+ 内部整合レビューの独立実行。**B1 は 3 経路が独立到達した最強シグナル**。

---

## A: 実装が SPEC に未追随（修正は実装側）

### A1: nav-target の quoted name 内 `##`/`::` が quote より先に分解される

`push("a##b")` → component `"a` + variant `b"`（quote 文字が name に残留）。`push("a::b")` → module `"a` + name `b"`。定義側 `# "a##b"` は正準値 `a##b` になるので、定義と参照が二度と一致しない。mermaid で dangling node を実証（定義ノード `a__b` vs 参照エッジ先 `_a_b_`）。SPEC「quoted name は**すべての name 位置**で有効。正準値は quote を剥いだ文字列」への未追随。構造記号を含まない quoted（`"My Screen"`・`"a.b"`・`m::"q q"`）は正常 — nav-target の字句分割が quote 認識より先に走るのが原因。
証拠: c25 + spec-review R3-2。

### A2: `?` 付き行動対象の quote・前後空白が name に残留する

`試す( "My Button" ?)` → name `"My Button" `、`試す( ボタン ?)` → name `ボタン `。`?` 無しなら正常。帰結: presence gate の対象解決（要素名と照合不能 → 判定不能扱い＝意図せぬ always-on）・shadow 完全一致判定・正準値規定の三重破壊。
証拠: c25 + /tmp 切り分け実測 + spec-review R3-3。

### A3: `show(##v)` の裸 variant が無診断で素通りする

SPEC は 3 箇所（記号一覧・EBNF 注記・オーバーレイ節）で「裸 `##variant` は母体が無いため書けない」と規定するが診断コード表に対応が無く、parser は `{name:"", variant:"一"}` を無言で受理。対して `hide(##一)` は E020 に**偶然**引っかかってエラーになる（非対称）。新 E コード（E027 案: overlay verb の nav に裸 `##variant`）の追加が機械的に決まる — 表への追記（D 扱い）とセットで。
証拠: c24 + spec-review R3-1。

---

## B: SPEC の明示決定が要る未規定

### B1: singleton の「document 内で単一」— モジュール分割時の共有スコープ【3 経路独立到達・要設計者判断】

- **コード検分**: extract は全モジュールの singleton 名を素の名前で単一 Set に合流、runtime `sharedVariants` のキーは component 名のみで `Location.module` を無視。
- **オラクル S5（ライブ証拠）**: エントリ A の通常 `# クーポン` へ `push(クーポン##通常)` すると共有レジストリが汚染され、import 先 B の `#! クーポン` が**自分に存在しない variant ##通常** で開く。
- **読者期待**: オラクル被験者（sonnet・確信度高）は「`::` で名前空間が完全に分離される原則から、同名でも状態共有の根拠は無い」と予測 — 実装と正面衝突。内部整合レビューも「document common には分割時の専用節があるのに singleton には無い」と独立指摘。

**判断が要る点**: 「document」の境界。驚き最小候補は「定義ファイル（モジュール）単位で単一。レジストリキーは (module, component)」（被験者の期待・`::` の存在意義と一致）。決定後は実装修正（runtime キーの module 込み化・extract の注入単位）が伴う。

### B2: アクティブ最上段が未定義 component のときの document common 帰属【驚き最小で確定可能】

SPEC「最上段 component が**定義されているファイル**のもの」は未定義 component（どのファイルにも無い）に適用不能。実装は参照元の module を継承（`navTargetToLocation` が `target.module ?? current.module`）。「未定義 component は参照元ファイルに属するとみなす」の 1 文で確定できる。
証拠: c21 + spec-review R3-5。

### B3: document common における 裸 gate 参照（静的 always-on）と 裸 `##v`（動的解決）の非対称

同じ「doc common には字句上のホストが無い」前提から、`goto(##v)` は実行時のアクティブ component へ動的解決するのに、gate 裸参照は判定不能 → always-on と静的に諦める。gate も「発火時のアクティブ component の実効 body」で判定する選択肢はあり得る（doc common の「その対象を持つ画面でだけ有効な deep link」が書けるようになる）。現状維持なら理由づけを SPEC に 1 文（D に降格）。
証拠: spec-internal-review-r3 §3。

### B4: 同名 `@S` の連続 begin（入れ子）— 規定はあるが読者に届いていない

ticketing 被験者（haiku）は購入確認→支払い→完了で毎回 `push(X, @checkout)` と書き、notes に「@checkout **継続**」と明文化 — セッションを「フローのメンバーシップタグ」と誤読。実際は begin が入れ子になり `exit(@checkout)` は LIFO で直近 1 つ。要件「完了後必ずホームへ」が黙って壊れる。意味論自体は既定（同名 @S の LIFO）なので、(i) SPEC に「同名 @S を続けて begin すると何が起きるか」の正面説明を足す（D）、(ii) 「アクティブパス上に生存する同名 @S の再 begin」を lint 警告する（実装）、の 2 択（併用可）。
証拠: probes/ticketing-r3/grading.md G1。

---

## C: 表現力ギャップ（DSL 改善アイデア）

### C1: 遷移を伴わない variant 書き換えが無い【両プローブ独立収束・r3 最有力】

- langlearn（sonnet）: ハート自然回復（学習画面が非アクティブな間に起きる）を書く手段が無く自然文コメントに諦め。アクティブ時ですら `exit(@lesson) ; goto(##ハート切れ)` の chaining が要り、「戻り先が違う画面なら書けない」と限界を申告。
- ticketing（haiku）: 「カート 0 件でミニカート非表示」を書けず放置。
- 被験者提案: 遷移を伴わない variant 書換の専用 result 種別。なお singleton に限れば `show(X##v)` が事実上これだが、掲示という副作用が付く。

r2 の C1（singleton）が「状態の生存」を解いたのに対し、これは「状態への**遠隔書き込み**」— 次の表現力フロンティア。

### C2: gate は「対象自身の状態で対象自身への操作」専用 — 条件源の分離ができない

「ハートの状態で**レッスン開始ボタン**を制御」が書けない（gate 対象＝行動対象、member gate は対象自身の variant を見る）。sonnet は正しいイディオム（variant 分割）へ辿り着いたが「非対称に気づくまで時間がかかった」と申告し、**gate を 1 箇所も使わず完成**。haiku は逆に未定義参照へ飾り `?` を 3 箇所付けた（全て always-on の死に gate）。両者とも gate の実用に失敗 — 記法拡張（例 `行動(対象? if 条件源.要素)` 等）を議論するか、少なくとも「対象=条件源」型しか書けない旨と variant 分割への誘導を SPEC に明記（D）。

### C3: collection の空判定が書けない

`*座席?` は `*` を剥いで単一存在判定になる（ADR-0010 の帰結）ため「1 つ以上あるか」を gate にできない。haiku 申告・中優先度。condition label での注記が現行の回避。

### C4: singleton の collection 宣言 `*バッジ` が素通り

「単一インスタンス」×「複数ある」の緊張。意味論を与える（N 個の見た目コピーが同一 variant を映す＝一括既読バッジ等）か、lint 警告か。
証拠: c19 + spec-review R3-6。

---

## D: 文書改善（SPEC 改訂・診断メッセージ）

### D1: switch resume 経路の `X##v` 共有書換が SPEC 未転記【oracle 実証・優先】

ADR-0011 は「明示 `##v` の共有書換は resume 経路にも及ぶ（2026-07-13 設計者確定）」を持つが、SPEC は switch 節「X は無視される」と singleton 節「X##v は共有書換」を並記するのみ。オラクル被験者は両節を正しく読んだ上で「X 無視」を優先し**確信度高で誤答** — SPEC の字義だけでは設計者確定と逆に到達する。singleton 節へ 1 文追記。

### D2: 一般規則側に singleton 除外ポインタが無い（内部整合レビューの矛盾 3 件）

「initial variant とエントリポイント」節・フレーム木節「戻り系は積まれた時点の variant」・verb 対応表（「新しい規則は含まない」宣言込み）が、singleton 節の明示的な適用除外と衝突。各所に「（singleton を除く。「singleton component」参照）」を追記。

### D3: 診断コードの cross-reference 破れ

E024 → オーバーレイ節に `*` 禁止の本文なし。W104 → 未定・分岐節に要素行 `[...]` の言及なし。E025 → E013 と違い具体例なし（軽微）。参照先に対応する 1 文ずつを追加。

### D4: doc common「どの画面でも」導入文とモジュール分割時の限定の食い違い

導入（用途説明）に「モジュール分割時はアクティブ画面のファイルのものだけが効く」の予告が無く、後段で挙動が変わる構成。導入部に 1 句追加。

### D5: document common / component common の**要素行**の意味論が本文に無い

EBNF は `document-common = single-body`（要素行可）だが、本文・例はインタラクション一辺倒。langlearn 被験者は「全画面にバッジ要素を載せる」用途を確信が持てず見送った（実書きの実害）。「共通要素は各 component の表示に乗る」のか否かを明記。

### D6: 継続行 `>` 落としの診断誘導

`> 行動 ->` + インデントのみの継続（`>` なし）は E003「空の result-list」+ W104 ×N になるが、どちらも「継続行に行頭 `>` が要る」へ誘導しない。E003 のメッセージに「次行を継続行にするなら行頭に `>`」のヒントを足す（または E003+W104 隣接時の専用ヒント）。
証拠: probes/langlearn-r3。

### D7: 「singleton への明示 `##v` は状態書換」の罠の顕在化

haiku は `show(クーポン##未受取)` を「表示 variant の選択」のつもりで書き、取得済みクーポンを巻き戻す導線を作った（oracle S2 の乖離と同族 — 明示 ##v の書換意味論は読者の予測を裏切る）。singleton 節に「よくある取り違え」として 1 例追加（`show(X)` で現在値がそのまま出る、が正解形）。

### D8: セッション無し `push(##v)` の用例なし（軽微）

挙動（アクティブ component の variant v を現在フレームに積む）は文法から導出可能でオラクル被験者も正答したが、用例ゼロ。1 行あれば安心材料。

---

## 承認判断の一覧（設計者チェックリスト)

| # | 種別 | 内容 | 提案 |
|---|---|---|---|
| A1 | 実装 | nav-target quoted の ##/:: 分解 | 修正（quote 認識を字句分割より先に） |
| A2 | 実装 | ? 付き対象の正準化漏れ | 修正（trim + quote 剥ぎ） |
| A3 | 実装+表 | show(##v) 素通り | 新 E コードで検出（hide も同コードへ統一するか要判断） |
| B1 | **設計判断** | singleton のモジュール境界 | 提案: 定義ファイル単位・(module, component) キー |
| B2 | 未規定 | 未定義 component の doc common 帰属 | 提案: 参照元ファイル継承（実装現状どおり・1 文追記） |
| B3 | 設計判断 | doc common 裸 gate の静的 always-on vs 動的解決 | 現状維持+理由 1 文 or 動的解決へ変更 |
| B4 | 文書+lint | 同名 @S 連続 begin の誤読 | SPEC 正面説明 + lint 警告の 2 択（併用可） |
| C1 | **新機能** | 遷移なし variant 書換 | 要ブレスト（両プローブ収束の最有力） |
| C2 | 新機能 or 文書 | gate の条件源分離 | 最低限 D（対象=条件源型のみと明記） |
| C3 | 新機能 | collection 空判定 gate | 見送り可（condition label で回避可能） |
| C4 | lint or 意味論 | `*singleton` | lint 警告が安価 |
| D1-D8 | 文書 | 上記 | 承認後に意味論 pass / 小物 pass で SPEC 改訂 |
