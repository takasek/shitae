# end-to-end 利用評価

限定した一連の仕事を完遂した。README/AI_GUIDEから独自モデルを作り、ブラウザ操作で案を直し、固定版で保存モデルを再検討し、実際の検討途中を別process・別担当へ渡し、一件の要件変更後に経路を作り直せた。受入項目を消化するだけでなく、予約状態の寿命、保存表示の帰属、比較取消後の動線を具体化できた。処理系の不具合・回帰は確認しなかった。次は新規機能を増やさず、短い目的・途中分岐の説明を添える運用で実利用を続ける。[候補表](candidates.md)。

## 対象と評価方法

2026-10-16 JST、origin/mainの `bbd99d4a772e9a74532840c6656477699abfb054` を専用worktreeへ固定した。primaryの未追跡作業は変更しなかった。lockfileからinstall/buildし、再生中の版更新なし。環境・engine/modelId・再実行は [README](README.md)、[environment](evidence/environment.json)、[metadata](evidence/metadata.json)、[HTML identity](evidence/html-identities.json)に分けた。

履歴は #8=`9f47b1f`、#9/#10=`3844800`/`e92e543`、#13=`4b56240`、#18/#12=`cd7fb9c`/`0f06ddb`等、#19=`59b25f6`、#11=`15df3ab`/`d26d2f4`/`d807d7f`/`4f72833` が評価HEADへ含まれることを確認した。GitHub読取でも指定8issueは全件CLOSEDだった。履歴とissueの完了だけを実利用の成功根拠にはしなかった。

親は既存評価を知る担当、作成担当は過去のモデル・解答・操作列を渡さない別コンテキスト、受取担当も作者会話を引き継がない別コンテキスト。新しいSessionだけを初見利用とは呼ばない。初見作成はagentによる記述評価、GUI実行は親による操作。独立受取は自身でCLIと実ブラウザを操作した。

期待はモデルとSPECのsingleton、frame木、overlay、逐次resultから先に固定した（[予想](evidence/expectations.md)）。製品ソースを先に読んで期待を合わせていない。CLIとGUIの一致は補助であり、要件から独立に定めた帰属・戻り先・存在/不在も照合した。

## 1. 自然文から検索・予約フローを作る

題材は図書資料一冊の検索と予約。設計の問いは「確認取消後の戻り先と、確定した予約の再訪時の寿命」。検索語照合・任意資料ID・通信・実予約・レイアウトは表現しない。予約状態は代表一冊のsingleton、検索入力/結果は検索画面のvariant、確認は独立したpresentの期間とした。[初見担当の事前期待と作成負担](evidence/fresh-author.md)。既存exampleの写経や全機能の詰込みは行っていない。

READMEからfrozen install/build、check、simulateの標準出力保存、固有ファイル名、共有先に必要なものを発見できた。初見担当はREADME/AI_GUIDE各一読で30行の初版を作成。SPEC/session-usageへの追加参照0回、構文修正0回、check一回で診断なし。これはエラー訂正の使いやすさを示す評価ではない。

実ブラウザでは次を確認した。

| 目的・操作 | 事前期待 | 実際と設計上の収穫 |
| --- | --- | --- |
| 検索→代表資料→予約→取消 | 検索結果を失わず予約前の詳細へ戻る | 一致。モーダルを取消すだけで検索画面へ飛ばさないことを確認。[取消](evidence/fresh-cancel.txt) |
| 予約し直す→確定 | 確認を畳み予約済み詳細へ | 一致。effect→dismiss→gotoの順序をログで確認。実予約をしたとは扱わない。[確定](evidence/fresh-confirm.txt) |
| 戻る→同じ資料を再訪 | 予約済みを保持し二重の予約入口を出さない | 一致。検索結果のスタックと予約状態の寿命を分離できた |
| 戻る→検索し直す→検索→再訪 | 検索を作り直しても同じ代表資料の予約済みは残る | 一致。[再訪](evidence/fresh-revisit.txt) |

自然文で「予約済みを残す」とだけ書くより、再検索を挟む経路でその持続範囲を明確にできた。一方、初版の予約済み案内には持続範囲の説明がないため、第二版は「検索結果へ戻っても予約は残ります」を一行追加した。要件を増やす変更ではなく、同じ設計の伝達を補った。v1/v2のモデル・HTMLは別名で保持。第二版もcheck診断なし・生成成功、親の別ブラウザタブで検索→詳細→確認→確定を行い追加文を確認した。[第二版の表示](evidence/fresh-v2-confirm.txt) / [画面内へスクロールした画像](evidence/fresh-v2-visible.png)。モデル構造の回避的な書換えは不要だった。

検査と生成は区別した。保存済みSol proposedはW103が31件でもcheck exit 0、空の葉と確認して継続。補助的に、通常componentへのsetを含む意図的な誤りを別 [probe](models/diagnostic-probe.shitae) としてcheckした。E030は行と「#!にするか遷移で書き換える」を示しexit 1、一方simulateはexit 0で完全なHTMLを返した。新規利用モデルで遭遇した誤りではない。指示に沿ってsingletonへ直した [別コピー](models/diagnostic-corrected.shitae) はcheck exit 0。[診断証拠](evidence/diagnostic-probe.txt)。生成成功で検査を省略できないことを確認した。

## 2. 保存済みモデルで実際の問いを解く

原モデルを変更せず、旧保存先の全ファイルのSHA256を記録した。Astraにはcurrent/proposed/inline最小例、Solにはcurrent/proposed/recovery、共通再現にalias-memberがあり、計7モデル。Astraのrecoveryという別ファイルは存在しない。全7モデルcheck exit 0、生成exit 0、HTML終端あり。警告はSol current 30、proposed 31、recovery 9件のW103、他は0。[検査一覧](evidence/model-checks.json)。旧verify.pyは旧証拠を更新するため実行せず、今回の出力先で通常のcheck/simulateを使った。

### Astra proposed と current の比較

A編集→保存[成功]→Bへ切替→B編集の後、Aは保存済、Bは未保存。GUIのB表示は `B.pfdsl — Edited`、Aへ戻ると `A.pfdsl — Saved`。部品状態表示でそれぞれのsingletonと由来DSLが読め、CLI stateでも状態A/状態Bを確認できた。操作前の予想に一致した。

currentの同じ経路は、A=保存済/B=未保存でも共通通知はA保存を原因とする `Saved.` のまま。statusそのものの破損ではなく、表示の原因が文書Bの編集中にも残る設計だった。[current比較CLI](evidence/astra-current-comparison.jsonl)。proposedの文書名付き状態表示は「どの文書の保存か」を判断できる。この差は実ファイル保存の安全性を証明しない。

proposedでAへ戻り、図のみ→包含作業面の「ノードからソースへ」を選ぶと作業面A=並列、DSL由来になり、図とソースが両方現れた。[GUI](evidence/astra-reveal.txt) / [状態を画面内へ出した画像](evidence/astra-state-visible.png)。focus移動はeffectの記録にとどまる。状態照会で問いが解け、裸goto等への書換えや実装参照は不要だった。

CLIでは最初の一覧からhandleを選び、一操作のaction詳細で保存の分岐を読み、実応答の[成功] IDを選択した。受理後は毎回actionsを取り直し、帰属の問いが必要な地点だけstateを照会。[全送受信](evidence/astra-cli.jsonl)。一覧・詳細・実行・状態の粒度で作業でき、先に全状態取得harnessを作る必要はなかった。

### Sol proposed の比較取消・構文復帰・空画面

Conflictで通知あり、Reviewで通知をhideしてVersionReviewをpresent、KeepEditingで比較をdismissしてSplitと通知が戻り、DocumentStatus=Conflict/DSLを保持した。[GUI記録](evidence/sol-keep-editing.txt)。確認画面と通知の二重入口が同時に残る挙動はこの経路にはなかった。

後述の結果途中から図表示へ分岐した後、ParseErrorでDiagramView=Error、graph不在のNodeDoubleClickは無効。ValidInputでReady/Validへ戻り有効になり、NodeDoubleClickでSplitになった。[Error](evidence/sol-parse-error.txt) / [復帰](evidence/sol-parse-recovered.txt)。公開CLIでも必要な一操作のgate/結果詳細、receiptのoperationIdに絞ったhistory、そこから得た観測IDのobservationを読めた。[再開後照会](evidence/sol-diverged-replay.jsonl)。途中のeffect直後はまだDiagram、次の結果でSplitという順序も確認した。

CloseLastDocumentの後はNoDocument。NavigationとStartActionsが残り、タブ・文書identity・source/diagram・通知・正規化表示はなくなった。[空画面](evidence/sol-empty.txt)。ただしParseError/ValidInput等のcomponent common操作は残る。これはモデル本文の定義どおりであり、文書不在時の実アプリ操作可否を保証するモデルではない。

探索でモデル側の別の不足も判明した。DocumentStatusは構文妥当性と外部変更状態を同じvariantで表しているため、最短のConflict→ParseError→ValidInputで通知は残るがstatusはValidになる。[公開CLIの最短経路](evidence/model-status-composition.jsonl) / [scenario](scenarios/sol-status-composition.scenario.json)。処理系は逐次setをそのまま実行しており、不具合とは分類しない。保存状態と構文状態の独立性をモデル設計で分ける問いが得られた。今回は修正していない。

### recovery と旧回帰

Sol recoveryのExternalChange→ReviewAndSaveHere→ChangedAgain[NewRevision]は、fresh disk observationのeffect後にConflictへ戻る。再度ReviewAndSaveHere→KeepEditingでもConflictに残り、bufferの表示がある。[送受信](evidence/recovery-cli.jsonl) / [保存](scenarios/recovery-review-again.scenario.json)。実データのeditor内容・ディスクrevisionを比較することは表現範囲外。ここは公開CLIによる確認で、recoveryの実ブラウザ操作はしていない。

旧機能の手作業総当たりはしなかった。751件の既存テストが全件成功（parser246/runtime97/resolver37/Mermaid20/XState35/checker29/Session32/simulator228/CLI27）。#8のstdout2テスト、#9のinline、#10のalias gate、Sessionとscenarioの回帰が含まれる。[全ログ](evidence/tests.log)。最小例では実ブラウザでinline群と名前付き群のNew/Save/Format表示を確認し、CLIでalias/named両gateがReadyで有効・Errorで無効、未定義参照は有効のままと確認した。[inline](evidence/inline-repro.txt) / [alias](evidence/alias-minimal.jsonl)。これら補助確認と実利用の観察を分ける。

## 3. 作業途中の保存・別process・別担当

Astraの保存表示を検討した途中をCLIからexportし、応答のscenario部分だけをUTF-8 JSONへ保存してprocess Aを終了（exit 0）。process Bの --replayでBの編集中へ戻り、新しいhandleでAへの切替→図のみ→ノードからソースへを続け、再保存した。Session UUIDは変わり古いhandleに依存しない。[checkpoint](scenarios/astra-cli-checkpoint.scenario.json) / [再開ログ](evidence/astra-replay.jsonl) / [継続版](scenarios/astra-cli-continued.scenario.json)。成功条件の選択も保存されている。

Solの比較取消の検討では、GUIでKeepEditingを完了後、ログの `dismiss → Workspace / Split` をクリックしてその結果直後へ戻した。後半の通知再表示がghost、cursor=6/latest=7。GUIの「シナリオを保存」を実際にクリックし、ダウンロードしたJSONを新しい名前で保存した。[画面](evidence/sol-ghost.png) / [保存物](scenarios/sol-gui-ghost.scenario.json)。親は保存前にsession-usageと保存契約で、破棄経路/reset前も共有されることを理解し、架空データのみと確認した。保存物を公開したり、実通信を行ったりしていない。

別CLI processがそのGUI保存物をreplayし、同じghostをhistoryで確認。その途中からDiagramOnlyを選び、未来の通知表示を捨てて別の検討を続け、再export・終了・さらに別processでreplayに成功した。[GUI→CLI](evidence/sol-gui-to-cli.jsonl) / [分岐保存](scenarios/sol-cli-diverged.scenario.json) / [再開](evidence/sol-diverged-replay.jsonl)。最終timelineから通知表示は消えるが、journalには元のKeepEditing全体とseekが残る。公開されていないCLI seekを作っていない。

独立引継ぎ担当には [brief](evidence/handoff-brief.md) とHTML・scenario・固定版、編集用モデル一式だけを渡した。元会話、作者の補助script、旧報告は渡していない。受取人は以下を自力で説明した。

- 現在地はDiagram、状態はConflict/DSLとReady/初期、通知はなし。
- KeepEditingを完了した後、そのdismiss直後へseekし、通知再表示前から図表示へ分岐した。
- condition labelの選択はこの保存物ではなし。分岐は結果途中から別経路へ進んだ意味。

別directoryに同じbytesのモデルを置き、check（W103は31件）と再生成に成功。modelId/engineは同じ、HTMLの差は埋込みsource path二箇所のみ。公開CLI --replayと新しい実ブラウザタブの「シナリオを読み込む」が成功し、双方で自分が選んだSourceOnlyを一操作実行した。CLIの再exportには受領5操作と新規1操作が残った。[独立受取記録](evidence/handoff-recipient.md) / [GUI読込](evidence/handoff-browser-loaded.txt) / [継続](evidence/handoff-browser-source.txt)。受取人から作者への追加質問0、モデル再入力0、scenario手修正0。

負担も残った。GUIログは主に結果名で、操作名・結果途中からの分岐経緯はscenario JSONとモデル本文を突き合わせる必要があった。scenario全量を一度に読むと出力が省略され、要点抽出でもう一度読んだ。部品状態表示は新しいGUIでoffのため手動でonにした。表示設定非保存は理解できた。

HTML・scenario・版と必要モデルは一括で渡したため、「HTMLだけを先に渡された初見人が段階的に理解できるか」は未評価。新しいSessionへの読込成功をこの初見理解の証拠へ拡張しない。元processのメモリ、古いhandle、作者scriptに依存せず再開したことは確認できた。

## 4. 要件を一箇所変えて再検討

比較取消で編集へ戻った際、Split全体を再表示するよりソースに集中させる案を選んだ。変更は派生コピーのKeepEditing一行へ `goto(Workspace##Source)` を加えるだけ。通知とConflictは残す。[事前意図](evidence/design-change.md)。原本・source bytes一致コピー・派生コピーを別にした。

旧scenarioを変更モデルへ渡すとCLIはexit 1のMODEL_MISMATCH。expected/actualのmodule `proposed` のsource hashとmodelIdが異なり、engineは一致していた。不一致対象は分かったが、長いJSONの比較が必要だった。[診断](evidence/model-mismatch.txt)。全source bytesを照合する現行契約どおりで、回帰ではない。旧engineのscenarioは今回使っていない。

GUIでは先にSourceへ進めたSessionへ不一致の保存物を読込ませた。エラー後もSourceと元の起動→Source履歴が残り、Splitへ進んでConflict→Review→KeepEditingを続けられた。[読込前](evidence/mismatch-before.txt) / [読込後](evidence/mismatch-after.txt) / [画像](evidence/mismatch-gui.png)。変更後はSource、通知あり、DocumentStatus=Conflict/DSL。CLIでも同じ三操作を新規に選び、保存した。[新案CLI](evidence/changed-cli.jsonl) / [新案scenario](scenarios/sol-source-cancel.scenario.json) / [GUI](evidence/changed-keep-editing.txt)。モデル本文やscenarioの手修正による移行は行っていない。

元モデルへ戻した再開は独立担当のbytes一致コピーで成功した。一方、新モデルの比較にはConflict/Review/KeepEditingの3操作を選び直す必要があった（条件ラベルなし）。CLIは各一覧からhandleを取り直した。GUI側は読込失敗前のSourceからSplitへ進む一操作も必要だった。旧モデルへ転記0、scenario編集0。現行の厳密版固定は適切で、経路の作り直しは将来の利便性課題として分ける。

## 5. 参照・失敗・負担の台帳

機械的なhash/生成内部の読取を除き、人が内容へ戻る読取・検索の呼出し単位で記録する。文書の検索と本文読取は別の呼出しとして数える。時間改善率・一般的な利用時間は測定していない。

| 担当・資料 | 呼出し回数と理由 |
| --- | --- |
| 初見作成 | README1、AI_GUIDE1、SPEC0、session-usage0、実装0。ガイド再読0、構文修正0。初版作成後の自作モデル読戻し・v2差分は [本人台帳](evidence/fresh-author.md)参照 |
| 親・入口/契約 | README+AI_GUIDE合同読取1、session-usage2（初回の長い合同出力後に必要なCLI説明を単独再読）、scenario契約1、SPEC2（見出し検索と該当範囲読取）。旧README+候補表1 |
| 親・モデル本文 | Astra/Sol proposed+Sol recovery合同読取1、current2本合同読取1、fresh v1読取1、inline+alias最小例合同読取1。状態の帰属/動線/モデル側の合成不足確認が理由。製品実装コード0、回帰テスト箇所の検索2 |
| 独立受取 | brief1、モデル本文1、scenario2、README2、session-usage2、AI_GUIDE2、SPEC0、実装0。追加質問0。詳細は [受取台帳](evidence/handoff-recipient.md) |

発生した失敗は、モデルの意味上の誤動作とツールの操作失敗を分けた。初見/受取担当のskill pathは固定checkoutに未収録で元checkoutの明示skillを読む必要があった。受取担当のブラウザタブ作成・変数束縛失敗、親のCLI作業変数の参照失敗1回は評価用操作環境の失敗で、処理系の拒否ではない。親は同じCLI processで再照会して継続した。親の画像補完ではAXにbuttonと出たsummaryがDOMではgenericであり、locator一件失敗後、表示テキストで位置を合わせた。これもDSL操作失敗ではない。

HTTP起動/fetchの初回sandbox制約は正規の昇格経路で解消した。自動審査拒否の迂回はない。ブラウザの大きいモデルではカード内のscrollが必要で、最初の画像だけでは重要な部品状態が画面外だった。DOMの意味証拠と、対象を画面内へ出した追加画像を分けて保持した。画面外の情報まで画像で確認したとは言わない。

## 証明できた範囲と残件

実ブラウザ操作はloopback HTTP経由の生成HTMLで行い、保存・ファイル選択・読込成功/不一致・継続操作を確認した。VM/DOMスタブ/内部関数呼出しを実ブラウザ操作とは呼んでいない。今回追加のVM検証はしておらず、既存テスト中のheadless/VM検証は補助である。file URL、他ブラウザ/OS、通常打鍵・IME・支援技術、人間による初見操作は未確認。

scenarioのreset前保存は公開契約と既存回帰テストを参照し理解したが、今回の実作業の探索にはresetを挿入していない。実作業由来の途中seek/ghost破棄は実施した。任意個数の文書/実データ、実ファイル保存・通信・focus、PFDSL本体の受入は対象外。状態の由来を読み取れることと、モデルに書かれないデータ保持の証明は別である。

改善候補は [candidates.md](candidates.md)の3点に限定。処理系不具合・回帰0件（今回の実施範囲で未検出）、モデル側の合成不足、表示/共有理解の負担、意図した版固定を分けた。次に大きな機能を実装する根拠はまだない。まず共有briefの運用を実利用で続け、同じ読解負担が反復する場合に、操作/条件/seek先の短い来歴表示を検討する。

最終差分・原本hash・固定版は [final-verification.json](evidence/final-verification.json)で確認する。成果物は本ディレクトリに分離し、原モデル・旧証拠・製品コードを変更していない。外部書込み・commit/push/PR作成も行っていない。

独立レビューでは、実装会話を引き継がない別agentが報告と一次証拠を照合し、全8 scenarioを公開CLIの別processで再生、6件のexportと保存物の一致、モデル不一致拒否を確認した。修正必須の指摘なし。画像・保存DOMの照合と、レビュアー自身による実ブラウザ再操作を混同しない。[独立レビュー記録](evidence/independent-review.md)。

評価後、ユーザーの追加依頼で記録のPR化と3課題の起票を行った。機能追加を急がない判断の意味、公開範囲の変更と課題対応表は [公開追補](publication.md) に記録した。評価時の証拠と検証結果は保持している。
