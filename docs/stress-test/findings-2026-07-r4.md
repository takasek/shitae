# findings r4（2026-07-15）— 設計者レビュー用

対象: r3 で導入・変更された構文の再検証 — set（E029/E030/W105 拡張）・E027・E028・R005・gate 動的解決（ADR-0015）・モジュール同一性（ADR-0017）+ 積み残し（singleton `show(X##v)` の lint 化判断）。
証拠: `spec-review-2026-07-r4.md`（境界トレース + `oracle/run-boundary-r4.mjs` 実測）・`spec-internal-review-r4.md`（内部整合）・`oracle/questions-r4.md`+`answers-r4.md`+`grading-r4.md`（意味論オラクル）・`probes/{fitness,smarthome}-r4/grading.md`（実書きプローブ）。

**まず良い報せ**: E028/E029/E030/W105/R005 の本則・set 意味論・ADR-0017 正規化はすべて仕様どおりで regression なし。オラクルは 7 問中 6 正解（確信度較正も良好）。r3 で SPEC に足した誘導文（C2 の variant 分割 + set・出口固定慣用句・show 巻き戻し注意）は sonnet プローブに全て届いた。**B1 は 3 経路独立収束の最強シグナル**。

---

## A: 実装が SPEC に未追随（修正は実装側）

### A1: module 修飾つき裸 variant（`mod::##v`）が nav/overlay 全域で name 空のまま素通り

`show(mod::##a)` は `{module:"mod", name:"", variant:"a"}` で無診断受理（E027 は module なしの裸 `##v` しか見ない）。`push(mod::##v)` / `present(mod::##v, @s)` も同形で素通り（E023 は kind:'variant' しか見ない）。runtime に渡ると name "" の component への遷移・掲示（黙って落ちる系）。`set(mod::##v)` だけ E029 で偶然塞がるが AST は `name:"##v", variant:""` と誤トークン化。修正: nav/overlay の字句分割で module 修飾つき裸 variant を検出し、それぞれ既存コード（E023/E027/E029）へ振る。
証拠: c34 o4 + /tmp 横展開実測（spec-review R4-3）。

### A2: import 先ファイルの診断が check で報告されない（exit 0）

CLI `check` はエントリモジュールの parse/check 診断しか印字しない（cli/src/index.ts:69-77 — diagnosticsMap には全モジュール分収集済み）。import 先が構文エラーでも exit 0。simulate/mermaid も同様。B2（診断の横断範囲）と合わせて方針を決めてから修正。
証拠: /tmp 切り分け実測（spec-review R4-4）。

### A3: 要素行の `mod::部品` が `name:":部品"` に黙って崩れる

element-line の ref は文法上 `::` を持たない（それ自体は C1 の論点）が、書いてしまった場合に parser がエラーにせず `mod` 消失・`:` 残留の壊れた ref として受理する。未定義 component 扱いですらない幽霊名。修正: 文法どおりエラーにする（C1 で要素行 `::` を許すなら不要になる — C1 の判断待ち）。
証拠: smarthome S1 の申告 + parser 直呼び裏取り。

### A4: overlay 掲示中 component の裸 gate がアクティブ画面の body で判定される【A/B 境界 — 要設計者判断】

SPEC「裸参照は host component（**その行動が書かれている component**）の現在 variant」に対し、simulator `gateEnabled`（simulator.ts:175-183）は host gate を常に `currentFrame()` で判定し、`overlayInteractions()` 経由でも同じ——ミニプレイヤーの `> タップ(曲名?) -> push(プレイヤー)` は曲名要素を持たない画面の上では黙って無効。ただし内部整合レビューは「SPEC の言い回し自体が『host がフレームに積まれている』前提で、overlay への適用は明文でない」と指摘（⚠️）——字義優先なら A（実装修正: overlay 由来の interaction は掲示 component 自身の表示 variant で判定）、明文がないと見るなら B。**提案: 「overlay の裸 gate は掲示中 component 自身の表示 variant の実効 body で判定する」を SPEC に明文化して実装を追随**（SPEC L253 の字義・「overlay の interaction は表示中 variant の実効 body から来る」との一貫性・ADR-0015 は doc common 限定の決定でありこの経路を覆っていない）。
証拠: コード確定（spec-review R4-7）+ 内部整合レビュー §4（独立到達）。

### A5（軽微）: `set(X)` が E029 と空 variant の W105 を二重出力

parser が E029 を出しつつ variant:"" の set ノードで復帰し、checker が `W105: set(学習##) の ''` を重ねる。エラー済み構文へのノイズ。修正: E029 発報時は復帰ノードを checker 対象から外すか variant:"" を W105 判定から除外。
証拠: c30 a2。

---

## B: SPEC の明示決定が要る未規定

### B1: 無修飾 component 参照の module 解決規則【3 経路独立収束・要設計者判断】

- **runtime 実測（M2）**: mod 定義の掲示中ミニプレイヤーの interaction にある無修飾 `set(状態##停止)` は、発火時のアクティブフレームの module（エントリ=null）に解決され、(null, 状態) は singleton でないため**黙って no-op**。
- **オラクル Q2（読者期待）**: 被験者（sonnet・確信度中）は「モジュール同一性＝ファイル」「`::` の解決は書かれたファイルの import 表」から「無修飾も書かれたファイル基準」と外挿し「書き換わる」と予測——実装と正面衝突。
- **内部整合レビュー §5**: 「`::` はレキシカル基準と宣言、doc common はアクティブ基準の言い回し。overlay の無修飾参照はどちらとも明言されておらず一意に確定できない」と独立指摘。

r3 B1（singleton モジュール境界）と同型の「`::` 原則からの外挿を実装が裏切る」構図。doc common ではレキシカル基準とアクティブ基準が常に一致する（有効な doc common ＝アクティブ画面のファイルのもの）ため、挙動が分かれるのは **overlay 掲示中 component の interaction だけ**。
**判断が要る点**: 無修飾参照（set・show/hide・nav-target とも）の module 帰属。候補 (i) **レキシカル（その interaction が書かれたファイル）**——読者期待・`::` の一般原則・ADR-0017「解決は書かれたファイルの import 表」と一貫。実装は extract 時に字句ホストの module を焼き込む。候補 (ii) 動的（発火時のアクティブ module）——現実装。裸 `##v` の動的解決（ADR-0007）との類比はあるが、`##v` が「アクティブ画面の variant を切り替える」意図的な動的束縛なのに対し、component 名は書き手が特定の定義を指しているのが通常。**提案: (i) レキシカル**。なお member gate は評価が動的（`gate.module ?? currentFrame().module`）で収集が字句（sourceModule）と内部でも非対称——決定に合わせて統一する。

### B2: 診断のモジュール横断範囲（checker の cross-module skip + A2 と合流)

checker は `target.module !== null` を一律 skip（「locally checkable でない」設計）だが、CLI は全 documents を保持しており判定材料はある。帰結: `set(mod::通常##x)`（別ファイルの定義済み非 singleton）が E030 にならない・`set(mod::クーポン##ない)` が W105 にならない（c32 実測）。SPEC の E030/W105 条件文に module 限定はない。**判断が要る点**: check をプロジェクト単位（エントリ + 全 import 先の診断を報告・cross-module 参照も検査)に広げるか、単一ファイル検査を正とし SPEC 側へ「診断は定義ファイル内のみ」と明記するか。**提案: プロジェクト単位**（A2 の「黙って落ちる」解消と同じ改修枠。resolveProject は既に全 documents を受けている）。

### B3: R005 が執筆時に見えない — 静的近似 lint の検討【fitness で誤読再発】

fitness（haiku）は `push(ワークアウト実行, @workout)` → `push(結果, @workout)` の再 begin を確信度**高**で書いた（「フロー全体をセッション内で管理」）——r3 ticketing G1 と同一誤読が、SPEC 正面説明追加（ADR-0016 B4）後にも**別モデル・別課題で再発**。R005 は runtime 警告なので `check` では出ず、書き手は simulate で操作して初めて気づく。**判断が要る点**: 静的近似（例: 遷移グラフ上、begin(@S) から exit/dismiss(@S) を経ずに到達できる別の begin(@S) を warning）を checker/lint に足すか。過検出リスク（分岐で exit する経路があるケース）はあるが、「同一 @S の begin が 2 箇所以上あり、間に exit が静的に見えない」程度の保守的検出でも今回の誤読は 2 例とも捕まる。**提案: lint 推奨節への追加（処理系任意）から始める**。

### B4: singleton への `show(X##v)` の lint 化【r3 G2 積み残しの判断】

分析（spec-review R4-8）: error 化は不可（ADR-0011 の正当な意味論）、意味論変更も不可（switch resume 書換との一貫性）。**lint の筋が良い根拠: ADR-0014 以後、singleton への `show(X##v)` には固有の役割がない**——常に `set(X##v) ; show(X)` へ分解可能で、分解形の方が書換と掲示の意図が分離して読める。「set への書き換えを提案する」警告は誤用にも意図的書換にも従える提案で**偽陽性がない**。
r4 の追加材料: fitness（haiku）は同型使用を 3 箇所（巻き戻し実害はなし）。smarthome（sonnet）は**自発的に set+show 分解形を選び**、しかも「explicit-variant show が警告の対象になるのか SPEC から判断が割れた」と存在しない警告を予期する申告——読者側に警告への期待が既にある。
**選択肢**: (a) SPEC「lint 推奨」節に 1 行（処理系任意） / (b) W コード新設（checker 常時） / (c) 見送り。**提案: (b)**——静的に確実に判定でき（singleton 性 + 明示 variant）、偽陽性なしの論拠が立ち、読者が警告を予期している。

---

## C: 表現力ギャップ（DSL 改善アイデア）

### C1: 要素行にモジュール修飾（`::`）が書けない【smarthome 実書きの回避行動】

「他モジュールで定義した component を画面の要素として置く」が文法上不可能（`::` は行動対象と nav-target のみ）。被験者はローカル同名 placeholder 要素 + 遷移先だけ `devices::` 修飾で回避し、「見えている物と遷移先が別名前空間の同名語になり初見の書き手が事故りやすい」と申告。モジュール分割を使うと部品カタログ（デバイス・共通部品）を別ファイルに切るのは自然な構成で、その要素配置が毎回この回避を要求する。**候補: element-line の ref に `[module ::] name` を許す**（EBNF 1 箇所 + presence gate の member 解決は既に module を持つ）。A3（黙って崩れる）はこの判断とセット。

### C2: 「全モジュール共通の外部事象」を 1 箇所に書けない

doc common はアクティブ画面のファイル単位（ADR-0016 B2 で確定済みの意味論）なので、「どの画面でも起こりうる外部事象」（通信途絶・セッション切れ）はモジュールごとに複製するしかない。smarthome 被験者はスコープ限定を正しく認識した上で「複製か祈りしかない」と申告。**候補**: 見送り（複製 + 自然文で足りる）/ エントリファイルの doc common を全モジュールに効かせる特例 / 専用記法。特例は「ファイル＝名前空間」の原則を崩すので、見送り + SPEC に「モジュール横断の共通事象は各ファイルに複製する」の 1 文（D 降格）が驚き最小か。

### C3: variant の直交 2 軸（オンライン/オフライン × 電源）の合成記法【見送り想定・記録のみ】

組合せ爆発の申告。並行状態は「扱わないもの」明記の領分——被験者も 1 軸に絞る正しい回避をした。記録のみ。

### C4: キー付き singleton（「1 種類 n 個の独立共有状態」の中間粒度）【見送り想定・記録のみ】

props 不保持の帰結として component 複製が正解（被験者も確信度高で複製を選択)。台数スケールでラフの速さが失われる申告は事実だが、shitae はラフスケッチであり 10 台の実在デバイスを列挙する時点でラフの粒度を超えている、が既定路線の整理。記録のみ。

---

## D: 文書改善（SPEC 改訂・診断メッセージ）

### D1: ADR-0014「未定義 component への set は素通り」の SPEC 未転記

E030 の条件「定義済みの非 singleton」から間接的に導けるだけで、gate の「判定不能なら always-on」のような明示フォールバック文がない（内部整合レビュー §1 ⚠️・c31 実測は素通りで ADR どおり）。singleton 節 set 段落に 1 文。

### D2: E027 の show 側の EBNF 注記がない

hide-nav にだけ「裸（hide(##v)）は E027」の注記があり、show 側は文法が name 必須というだけで E027 との対応が読めない（内部整合レビュー §2 ⚠️）。EBNF コメント 1 行。

### D3: R005 が push/present 限定である理由の先出し

セッション節は switch も begin できると並記した直後に R005 を push/present 限定で書き、理由（switch は resume-or-create ゆえ再 begin が起き得ない）は switch 節まで読まないと分からない（内部整合レビュー §2 💭）。R005 言及箇所に括弧 1 句。

### D4: セッション入れ子の「直近の 1 つ」とフレーム木「子孫ごと破棄」の接続

内側 @S がさらに子を持つケースで「1 フレームだけ消え子孫は残る」と誤読しうる（内部整合レビュー §3 💭）。セッション節の当該段落にフレーム木節への参照 1 句。

### D5: オーバーレイ節 singleton 特例から singleton 節への参照ポインタ追加（内部整合レビュー §6 💭）

### D6: switch の resume が begin した verb を問わないことの明文化

push-begin の @S へ `switch(X, @S)` すると resume する（R7 実測・オラクル Q1 は正答したが「自己参照ケースの明示記述なし」と申告・確信度中）。switch 節に「@S の begin が push/present によるものでも resume の対象になる」+ 自己参照（現在フレーム自身への switch は無変化）の 1 文。

### D7: error 診断の実行時扱いの一般規則がない

オラクル Q7 の申告——E030 検出後に処理系が result を無視して継続するのか文書全体を拒否するのかの一般規則が本文にない。診断コード節の導入に「error は文書を不正とし、runtime は当該 result を no-op として継続してよい（処理系分担）」相当の 1 文。

### D8: `> //`（interaction 行のコメントのみ）の診断誘導

fitness が「この variant では何も起きない」注記のつもりで `> // コメント` を書き E010 ×3。「継続行の前に interaction がありません」は意図（注記）への誘導にならない。E010 メッセージに「注記だけなら行頭 > を外して // で書く」ヒント（r3 D6 と同枠の改善）。

### D9: 無名 `dismiss()` が push-begin セッションに効かないことの正面明記

fitness は確信度**高**で「中断時に dismiss() でセッション破棄」と書いた（実測 R002 no-op・偶然 back() で 1 段戻るだけ）。dismiss の表の一文「直近のモーダルを閉じる」だけでは「セッション破棄の汎用動詞」と誤読される。セッション節 or verb 表に「push-begin の @S を畳むのは exit(@S)。無名 dismiss は present（barrier）にのみ効く」の 1 文。

### D10: 外部イベント記法の安心材料

fitness が「外部イベントであることを明示する方法がなく自然文注記に頼っている」と不安を申告——SPEC は既に「外部で起きることも行動の自然文として書くのは想定内」と明記済みで、新規性なし。行動節の当該文をプローブが見つけられていない可能性があるため、singleton 節の set 例（doc common の非アクティブ中の事象）から行動節へ参照を 1 本。

---

## 承認判断の一覧（設計者チェックリスト）

| # | 種別 | 内容 | 提案 |
|---|---|---|---|
| A1 | 実装 | `mod::##v` の素通り（nav/overlay）と set の AST 崩れ | 修正（E023/E027/E029 へ振る） |
| A2 | 実装 | import 先診断の黙殺 | B2 の方針決定とセットで修正 |
| A3 | 実装 | 要素行 `mod::部品` が `:部品` に崩れる | C1 の判断待ち（許すなら文法対応・許さないならエラー化） |
| A4 | **設計判断→実装** | overlay 裸 gate の判定先 | 提案: 掲示 component 自身の表示 variant と明文化し実装追随 |
| A5 | 実装 | set(X) の W105 ノイズ | 修正（軽微） |
| B1 | **設計判断** | 無修飾参照の module 解決【3 経路収束】 | 提案: レキシカル（書かれたファイル）基準 |
| B2 | 設計判断 | 診断のモジュール横断範囲 | 提案: プロジェクト単位の check |
| B3 | 設計判断 | R005 の静的近似 lint | 提案: lint 推奨節に追加（処理系任意） |
| B4 | 設計判断 | singleton `show(X##v)` の lint【積み残し】 | 提案: W コード新設（set への分解を提案・偽陽性なし） |
| C1 | 新機能 | 要素行の `::` | 要判断（回避行動の実証あり。A3 とセット） |
| C2 | 新機能 or 文書 | 全モジュール共通の外部事象 | 提案: 見送り + D 降格（複製を正と明記） |
| C3 | 新機能 | variant 直交軸の合成 | 提案: 見送り（「扱わないもの」の領分・記録のみ） |
| C4 | 新機能 | キー付き singleton | 提案: 見送り（ラフの粒度超え・記録のみ） |
| D1-D10 | 文書 | 上記 | 承認後に意味論 pass / 小物 pass で SPEC 改訂 |
