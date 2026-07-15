# HANDOFF: stress-test r4 Phase 4（承認済み修正の適用）

実行者への前提: このリポジトリは shitae（UI ラフスケッチ記述言語）の処理系。`docs/SPEC.md` が唯一の正。作業前に `docs/SPEC.md`・`docs/GLOSSARY.md`・`.claude/CLAUDE.md` を読む。作業ブランチは `spec-stress-test-r4`（続きで作業。main 直接禁止）。`git fetch origin` してから開始。

**設計者承認は取得済み**（2026-07-15）: `findings-2026-07-r4.md` の提案どおり全承認 + C1 は「要素行の `::` を許す（文法拡張）」で確定。この文書の判断を再議論しない。findings と食い違いを見つけたら作業を止めて設計者に確認。

## 規律（違反は差し戻し）

- **TDD 厳守**: red → green → refactor。production コードは失敗するテストの後にのみ書く。テスト先行の証跡がないコミットは差し戻し。
- **1 タスク 1 コミット**（Conventional Commits・常に green）。ADR・SPEC 改訂・各パッケージ実装は別コミット。
- `docs/examples/*.shitae` は parser 統合テストのフィクスチャ。触ったら `pnpm -r test` で追随確認（「docs のみ」の変更はこの repo に存在しない）。
- 各タスクの受け入れ基準は本文書に確定済み。**受け入れ基準の変更が必要になったら実装で辻褄を合わせず設計者に確認**。
- 意味論の核（T5/T6）は本文書の手トレース期待値と一字ずつ突合してから commit。

## タスク列（この順で。T1→T2→T3 は直列、T4 以降は SPEC 改訂後）

### T1: ADR 起草（4 本、`docs/adr/`）

1 判断 1 ADR。既存 ADR（0013〜0017 が近い書式）に倣う。Status はいずれも `accepted（2026-07-15、設計者承認）`、出典は `stress-test r4 findings <番号>`。

- **ADR-0018**（findings B1）: 無修飾 component 参照の module 解決は**レキシカル（その interaction が書かれたファイル）**。
  - 決定: `set(X##v)` / `show(X)` / `push(X)` 等の無修飾参照は、その行が書かれたファイルのモジュールに帰属する。`::` の一般原則（「参照が書かれたファイルの import 表による」）の無修飾への拡張。発火時のアクティブ module では**ない**。
  - 根拠: 3 経路収束（runtime M2 実測の黙 no-op / オラクル Q2 の読者期待 / 内部整合レビュー §5）。doc common では両基準が常に一致するため挙動が分かれるのは overlay 掲示中 component の interaction のみ。
  - 実装方針: **正規化は呼び手（simulator extract）の責任**（ADR-0013 の路線）。extract が SimAction 生成時に `body.target.module ?? sourceModule` で字句ホストの module を焼き込む。runtime の `?? current.module` fallback は最後の防衛として残すが、extract を通る限り到達しない。member gate の評価（`gate.module ?? currentFrame().module`）も収集（sourceModule）と同じレキシカル基準に統一。
- **ADR-0019**（findings A4）: overlay 掲示中 component の裸 gate は**掲示中 component 自身の表示 variant の実効 body**で判定する。
  - ADR-0015（doc common の動的解決）はこの経路を覆わない——doc common は「字句ホストが無い」から動的解決するのであり、overlay の interaction には字句ホスト（overlay 自身）がある。SPEC L253 の字義どおりに戻す。
- **ADR-0020**（findings C1+A3）: element-line の ref に `[module ::]` を許す。
  - 文法: `ref = [module-name , "::"] , name`（element-line 側）。alias（`x: mod::部品`）・collection（`*mod::部品`）とも組めるが、collection × 他モジュール singleton は E028 の対象（B2 のプロジェクト単位検査で検出可能になる）。
  - presence gate の裸参照判定・W101/W103 への波及はテストで確認（module 付き ref の存在判定は「そのモジュールの component」で解決）。
  - これに伴い A3（`mod::部品` が `name:":部品"` に崩れる）は正パース化で解消。
- **ADR-0021**（驚き最小バッチ r4 — findings A1/A2/A5/B2/B3/B4/C2）:
  - A1: module 修飾つき裸 variant（`mod::##v`）は既存コードへ振る——nav 新規作成系は E023、overlay は E027、set は E029（AST を正しくトークン化した上で）。
  - A2+B2: **check はプロジェクト単位**。エントリ + 全 import 先の parse/check 診断を報告し、error があれば exit 1。checker の cross-module skip を解除し、`resolveProject` の結果から他モジュールの定義を引いて E030/W105/E028 を module 修飾参照にも適用する。
  - A5: `set(X)`（E029 発報済み）の復帰ノードに W105 を重ねない。
  - B3: R005 の静的近似は**実装しない**。SPEC「lint 推奨」節に 1 行足すのみ（「begin(@S) から exit/dismiss(@S) を経ずに到達しうる別の begin(@S)」を処理系は警告してよい）。
  - B4: **W106 新設**（checker）: singleton への `show(X##v)`（明示 variant）。メッセージは「共有状態の書き換えを伴う。表示だけなら show(X)、遷移せず書き換えるなら set(X##v) ; show(X) に分解できる」の方向で誘導。error にしない。
  - C2: 見送り + D 降格——「モジュール横断の共通事象は各ファイルの document common に複製する」を SPEC モジュール化節に 1 文。

### T2: 転記元整合レビュー【subagent 必須・CLAUDE.md 規律】

SPEC へ転記する前に、起草した ADR 4 本 + findings-2026-07-r4.md の内部整合を**別視点の subagent（sonnet 1 体）**にレビューさせる。観点: ADR 間の矛盾（特に ADR-0018 のレキシカル原則と ADR-0015 の doc common 動的解決の境界説明・ADR-0019 との整合）、findings の記述と ADR の決定のズレ、既存 ADR（0007/0013/0015/0017）との衝突。指摘は設計者エスカレーション要否を仕分けてから反映。

### T3: SPEC 改訂（2 pass・別コミット）

- **意味論 pass**: ADR-0018（モジュール化節 + オーバーレイ節に無修飾解決の規則と overlay の例）・ADR-0019（「操作は variant に属する」節の裸参照規則に overlay の 1 文 + オーバーレイ節 L552 の「その variant」を明確化）・ADR-0020（EBNF・記号一覧・モジュール化節）。
- **小物 pass**: 診断表（E023/E027/E029 の条件文へ module 修飾裸 variant を明記・W106 追加・E030/W105/E028 の適用範囲がプロジェクト単位である旨）・lint 推奨節（B3）・D1〜D10（findings の各 1 文。D6 は switch 節、D9 はセッション節 or verb 表、D8 は診断メッセージ側なので実装タスク T4 に回す）。
- 改訂後、`docs/examples` への影響なしを `pnpm -r test` で確認。

### T4: parser 実装（TDD。1 修正 1 コミット）

| 対象 | 受け入れ基準（red テストにする） |
|---|---|
| A1 nav | `push(mod::##v)` / `present(mod::##v, @s)` / `switch(mod::##v, @s)` → E023。`goto(mod::##v)` は…**注意**: 裸 `##v` の goto は合法（variant change）だが module 修飾つきは「mod のアクティブ component」が定まらないため不正——E023 の対象外なので**同コードにせず要検討**。ADR-0021 起草時に「goto/back の `mod::##v` をどのコードにするか」を確定してから書く（E016 類推 or E023 拡張。迷ったら設計者確認） |
| A1 overlay | `show(mod::##v)` / `hide(mod::##v)` → E027 |
| A1 set | `set(mod::##v)` → E029 のまま、ただし AST は `{module:"mod", name:"", variant:"v"}` に正しくトークン化（`name:"##v"` の崩れを直す） |
| A3/C1 | 要素行 `mod::部品` → `{kind:"ref", module:"mod", name:"部品"}`。`x: mod::部品`・`*mod::部品` も同様。既存の裸 ref に regression なし |
| A5 | `set(学習)` → E029 のみ（W105 が重ならない。checker 側で対処してもよい——実装位置は任せる） |

### T5: simulator/runtime 実装（意味論の核。受け入れ基準と一字ずつ突合）

- **ADR-0018（レキシカル化）**: extract の SimAction 生成（transition target・overlay・set）で `module: norm(body.target.module ?? sourceModule)` に変更（現状は `?? null`）。member gate 評価の `?? currentFrame().module` も extract 時焼き込みに統一。
  - 受け入れ 1（新規テスト・extract）: mod ファイル内の interaction の無修飾 `set(状態##停止)` → SimAction の module が `"mod"`（正準名）。
  - 受け入れ 2（`docs/stress-test/oracle/run-boundary-r4.mjs` の M2 相当を simulator 経由で再現）: mod 定義の掲示中ミニの set 発火で **shared が `(mod,状態)=停止` になる**（r4 実測の no-op から挙動が変わる——これが本修正の眼目）。M2 のコメントも「レキシカル化後の期待」へ更新。
  - runtime 側は変更なし（fallback は残す）。runtime の docstring に「module 解決は呼び手責務（ADR-0018）」を追記。
- **ADR-0019（overlay gate）**: simulator `gateEnabled` に「判定対象 component」を引数化するか、overlay 経由の interaction に host 情報を持たせる（実装形は任せる）。
  - 受け入れ（手トレース確定済み）: `# ミニ` の `## 再生` body に要素 `曲名` と `> タップ(曲名?) -> push(プレイヤー)`、アクティブ画面 `ホーム`（曲名なし）で `show(ミニ##再生)` 中 → **gate on（interaction 有効）**。逆に `## 一時停止`（曲名なし）を表示中なら gate off。アクティブ画面側の body は判定に使わない。doc common 裸 gate の動的解決（ADR-0015）は現状維持——regression テストを添える。
- **A2+B2（プロジェクト単位 check）**:
  - 受け入れ 1: `cli check docs/stress-test/cases/c32-r4-set-module-a.shitae` で m3 に **E030**・m6 に **W105** が出て exit 1。
  - 受け入れ 2: import 先に parse error のある構成で check → その診断がファイル名つきで報告され exit 1（現状は exit 0）。診断の `printDiags` がエントリのファイルパスを全診断に貼る既存バグに注意（module ごとの実ファイルパスで出す）。
- **B4（W106）**: 受け入れ: `#! クーポン` + `show(クーポン##未受取)` → W106。`show(クーポン)`・非 singleton への `show(X##v)`・`set(X##v)` には出ない。

### T6: 統合・昇格・完了確認

- smarthome プローブ（`docs/stress-test/probes/smarthome-r4/*.shitae` 3 ファイル）は誤りゼロの良品——`docs/examples/` へ昇格し統合テストに追加（モジュール分割 + singleton overlay + set の実例が examples に無いため価値が高い）。昇格時に W106 が新たに出ないか確認（起動行は set+show 分解形なので出ないはず）。fitness は誤り含みのため昇格しない。
- `docs/stress-test/oracle/run-boundary-r4.mjs` を再実行し、出力の変化が ADR-0018 の意図どおりか確認（M2 のみ変わる。R1〜R8・T1〜T6・M1 は不変のはず——変わったら regression）。
- 診断コード表と実装の突合（新 W106・E023/E027/E029 の条件文言）。
- `pnpm -r test` green で完了。完了後この HANDOFF を削除するコミットを最後に積む（完走済み HANDOFF は残さない運用）。

## 未確定として残してよいもの（やらない）

- B3 の checker 実装(lint 推奨節の文言のみ)・C3(variant 直交軸)・C4(キー付き singleton)——見送り確定。
- r5 の再 stress-test(この HANDOFF の範囲外)。

## ハマりどころ（r4 で実測済みの罠）

- `goto(mod::##v)` のコード割当だけは T4 表内の注意どおり ADR 起草時に確定が要る（findings では E023 系に丸めたが goto は E023 の対象外という穴がある）。
- checker のプロジェクト単位化で `check` の署名が変わる——cli/mermaid/simulate の 3 呼び出し箇所すべて追随。
- extract のレキシカル化で「エントリモジュールの module 表現が null」の正規化（ADR-0013 の実装詳細）に注意——sourceModule がエントリのとき null のままか正準名かでキーがズレる。既存テスト（extract.test.ts の正規化テスト）を先に読む。
- Edit ツールで `\u0000`（singletonKey の区切り）を含む行を触るとエスケープが生の制御文字で着地する既知の罠。該当行は sed か文字列連結で回避。
