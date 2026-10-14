# Issue #18 の受入確認と残件

2026-10-14。PR 作成前に [#18](https://github.com/takasek/shitae/issues/18) の現行本文、含まれる [#12](https://github.com/takasek/shitae/issues/12)、SPEC、承認済み [契約](session-contract.md) と最終差分を照合した。本文の取得版は [#18](evidence/acceptance/issue-18.json)、[#12](evidence/acceptance/issue-12.json)、[#11](evidence/acceptance/issue-11.json) に保存した。依頼基準は `e985f4e`、一覧縮小までの実装は `b8f8660`。表示修正 commit `0f06ddb` は任意状態表示の module 識別／名前重複抑止だけで、モデル・Session/runtime・CLI の実行意味を変更していない。

## 受入の照合

| 要件 | 判定と根拠 |
| --- | --- |
| SPEC の独立期待値による実行意味 | 通過。runtime と Session の固定期待テストで switch復帰／push先保持、presentを挟むswitch祖先、非アクティブ子孫破棄、barrier、singleton明示resume、通常試験値と実frame/overlayの分離を検証。[runtime TDD](evidence/runtime-switch-tdd.json)、`packages/session/test/acceptance.test.ts` と `history.test.ts`。CLI/GUI 一致だけを oracle にしていない |
| 共通Sessionと既存GUIの接続 | 通過。状態・操作・gate・結果ごとの観測・snapshot/seekはSession、GUIは描画／command／fold/focus。公開CLIと生成GUIで6ケース54手順・70観測点を照合。[回帰](evidence/compact-actions/regression.json)。構造だけの code 移動としていない |
| 保存モデルの回帰と意図した差 | 通過。Sol/Astraのcurrent/proposedは未編集。旧GUI44比較で現在地差0、activePath差1はSPECに合わせたswitch祖先の差。比較基準 `0d0d814` の simulator source は依頼基準 `e985f4e` と同じ。[旧版比較](evidence/session-regression.json) |
| agentが同一processで操作／分岐／現在地を往復 | 通過。4つの生CLI process、114要求、35 dispatchの34成功＋意図した無効操作1件。[実入出力](evidence/compact-actions/cli-runs.json)。request拒否後の継続、EOF、stderr/stdout分離、起動失敗はCLIテストで検証 |
| 小さな通常応答と任意の詳細照会 | 通過。既定 query はsummary、commandは今回receiptだけ。一覧は7選択フィールド、結果／定義はhandle指定のaction詳細。state/metadata/history/observationは明示照会。330包含／31module／101frame／103履歴でも通常応答を限定。40一覧照会290,500→81,311 bytes、全応答382,379→173,190 bytes。[一覧縮小](session-compact-actions.md) |
| handle、分岐検証とqueryの無変更性 | 通過。unknown/foreign/stale、disabled、branch欠落／不正をprelude前に拒否。reset/seekもrevision更新。詳細改変は隔離され、queryはcounter/cursor/effectを変えない。Session/CLI固定期待テストで確認 |
| 作用範囲と由来、途中巻戻しとghost | 通過。frame/overlay、singleton共有、包含初期、component試験値を分け、initial/DSL/manual-testを保持。同値DSL書込み、結果途中、手動試験、reset、ghost保持／分岐時破棄を検証。公開CLIのseekは提供せず、過去の詳細は無handleで照会可能 |
| 処理系版、全参照moduleとモデル同一性、定義／配置source | 通過。source bytes、正準module、engine、entryをhashし、symlink alias合流、同basename別ファイル、import先だけの変更、移動後同一性を確認。操作sourceはaction詳細、包含sourceはstate。定義位置と配置位置を分けている |
| #12任意表示 | 通過。既定off、値のscope/origin、複数配置、inline/未定義/循環/variantなし/未定義variant名、変更／seek/resetへの追随、keyboard/fold/focusを検証。最後に同名moduleの識別と名前重複を修正し、失敗テスト→224テスト成功→実ブラウザ確認。[追加確認](evidence/acceptance/browser.json) |
| Solの状態とAstraの作業面／保存／正規化表示 | 通過。既存実ブラウザ評価に加え、Sol Conflict/Invalid/ValidとAstra正規化の非表示→表示を公開CLIと実ブラウザで追加照合。[CLI](evidence/acceptance/model-probe.json)、[DOM](evidence/acceptance/browser.json)。effect本文を実保存／focusの成功にしていない |
| 配布、実ブラウザ、再ドッグフーディング | 通過。自己完結HTML一枚を維持。loopback HTTPから8ページを開きサーバー終了後も操作可。最後の表示修正は別3ページで実操作。console警告/エラーなし。[利用評価](session-browser-evaluation.md)。file URL と他ブラウザを確認したとは扱わない |

## PR 前の修正と検証

最終照合と Astra の独立 probe で、#12 の「同名 component を module で区別」「aliasと実名が同じなら重複表示しない」という受入漏れが一致した。表示用反例で Red（1 failed/223 passed）を確認してから修正した。unique名は従来の短い表示、同名ならmoduleを添え、同じ名前は一度だけ表示する。表示用名前集計はquery値から作り、stateの再解決はしない。README の古い「ブラウザ確認が残る」という案内も更新した。

`b8f8660` の全パッケージ734テストは今回の全体実行で成功。表示修正後は変更対象simulator全224テスト、依存を含むbuild、simulator typecheckを再検証して成功した。最終パッケージ合計735は、未変更の通過済み511と修正後224の合計である（内訳は [検証JSON](evidence/acceptance/validation.json)）。最終版で全体を再実行したとの主張はしない。Session/runtime/CLIとモデルを変えていないため、通過済み全件を繰り返していない。

Astra は実装会話を引き継がず、現行IssueとSPEC、最終差分、原記録から独立レビューした。Session22、runtime97、CLI session6、GUI接続／表示保持6テストを独立実行し成功。表示不足の修正も確認し、他の未解消コード指摘はない。実ブラウザと利用評価は保存証拠のレビューであり、reviewer自身のブラウザ再操作ではない。最終文書の読戻し結果は [独立レビュー記録](evidence/independent-review.md) に記載する。

## 残件と完了の範囲

#18 の必須受入に未完了作業はない。既存モデルを知る1 agentの固定目標による評価で、モデル本文の追加読取0はloaderと事前知識を除いた手集計、handle/branch手動転記0はclient内保持という意味。未知利用者の発見しやすさ、速度、理解改善、全ブラウザ／支援技術への一般保証は残る証拠の限界であり、今回の受入をそれらの効果証明へ広げない。

| 後続事項 | 今回の判断 |
| --- | --- |
| #11 シナリオのexport/import・永続的replay | 対象外。操作／分岐の手動転記はclient内保持で不要になったが、process終了後の復帰や他作業者へ渡すには、今回も生JSON/DOM/画像を別保存した。同一process内seek/ghostで代替できる範囲と分け、モデル版付きsidecar保存・再生は#11に残す |
| 公開CLI seek | 初版必須にしないという契約どおり。CLIは過去observationのread-only照会、GUIは内部seek |
| receiver説明、表示設定永続化、全frame木の新GUI | 明示保留。任意状態表示とアクティブ経路表示を完了し、これらを前倒ししない |
| 状態表示on時の情報密度／一覧の絞込み | 改善候補。既定off・foldで調整可能。一覧は結果量から切離したが、候補数／名前／配置／branchラベルによる増加は残る |
| 実I/O、daemon/MCP、クラウド保存、期待値DSL、editor連携 | 対象外。自由文effectを外部動作の成功へ変換しない |

この確認は通常PRを作れるローカル受入まで。PR作成後のCIと人間の最終レビューは別に確認し、mergeとIssue closeは実行しない。
