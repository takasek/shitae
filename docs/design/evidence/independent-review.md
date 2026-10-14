# 共通 Session 契約案の独立レビュー記録

2026-10-14。実装会話を引き継がない別 agent が、Issue #18/#12 の現行本文、SPEC、runtime/simulator/CLI の一次コード、ADR-0008/0022/0023 と契約案を照合した。対象 base は `e985f4ee58ab76339df5b0f59144e1f1a5da91c8`。対象成果物は [session-contract.md](../session-contract.md)、fixtures、runtime probe。本記録はレビューの結果をまとめたものであり、新 Session の実装受入を表さない。

## 指摘と修正

1. CLI を seek 非公開としたまま、各 result の途中状態を GUI と比較する経路がなかった。dispatch response の各 observation に、snapshot から Session が投影した detached な `view` を追加した。過去 view は操作 handle を持たず、最終 query のみ現在 revision の handle を持つ。G01 の比較対象を具体化した。読戻しで解消確認。
2. 既存 GUI の組込み「← 戻る」をモデル interaction なしで実行する Session 入口がなかった。query の `controls.back` に組込み handle と可否を追加し、共通 dispatch の revision/operation/history/ghost 処理へ接続した。`builtin-back.shitae` を反例 fixture として追加。追記と runtime の back 規則を照合し、解消確認。

最終再確認で未解消の actionable finding なし。CLI 方式、試験値の作用範囲/source 必須化、runtime と SPEC の不一致をどう直すかは、契約案の proposed な設計判断として残る。

## 独立実行

- fixture 三件の CLI check は全て exit 0。switch-contexts は空 component 由来の W103 六件、他二件は診断なし。
- runtime probe `--expect-spec` は exit 1。四観測すべての SPEC 不一致を記載どおり再現。
- 新 Session の実行意味、CLI/GUI 接続、実ブラウザ、再ドッグフーディングは未実装・未検証。

既存 build/test/typecheck の実装側の検証結果は [validation.json](validation.json) に分離して記録した。レビューで契約を読んだこと、既存テストが通ったこと、CLI/GUI が同じコードを使う予定であることを新実装の正しさの証拠にはしない。

## 通常応答の縮小に関する改訂レビュー

2026-10-14、初版契約 commit `5b075552b95ebff1bd022e7085758ab65e2d6295` からの改訂。ユーザーの「通常の応答は小さくして、全状態・履歴・結果途中の詳細は必要なときだけ照会する」という要求を、実装会話を引き継がない別 agent が差分・関連全文・SPEC・ADR-0023・必要な一次コードから照合した。初版で dispatch に付けた詳細 view は、今回の契約では observation query に移した。

通常応答/既定 query は summary と今回の実行 receipt、全状態/操作/metadata/履歴/途中 view は明示 query とする。履歴はページ単位で、過去の観測値の照会は現在状態を変更せず実行 handle を返さない。C04/C05 の応答量・詳細照会の受入と G01 の比較手順も更新した。

指摘は一件。G01 を receipt.operationId からの観測点照会だけにすると、receipt のない reset/拒否と観測点のない no-op を比較できなかった。観測ありの受理操作、reset、拒否/無観測 no-op の比較経路をそれぞれ定義し、内部 seek/分岐と公開 CLI の境界を明記した。修正箇所の読戻しと diff check で解消を確認し、未解消・新規の actionable finding はない。

本改訂の文書検証は [compact-response-validation.json](compact-response-validation.json)。JSON Lines の例とローカルリンク、差分の整形を検査した。production/fixture は変更しておらず、既存全件テストの再実行は行っていない。実 response の byte 数、pagination 実行、CLI/GUI 接続は未実装のため未検証。

## HTML 一枚の条件を緩める改訂レビュー

2026-10-14、契約 commit `818ce95` からの改訂。ユーザーの「HTML 一枚が難しくなれば前提を外してよい、保てれば維持してよい」という指定に合わせ、一枚化を優先候補とし必須条件から外した。代替の静的ファイル群と必要時だけのローカル静的サーバー、選定理由/出力方法/開き方の文書化、選んだ形での実ブラウザ検証を定めた。

実装会話を引き継がない別 agent が差分と関連本文を照合し、配布方針・G02・対象外の整合と、通常応答/共通 Session の実行・観測契約/CLI protocol が変わらないことを確認した。actionable finding なし。JSON Lines 例十件、ローカルリンク、Markdown fence、diff check も成功。production/fixture は未変更で全件テストは再実行していない。配布形の選定・実装・実ブラウザ動作は今後の検証対象である。

## 最初の CLI 一往復の Astra 独立レビュー

2026-10-14、ユーザーの指定で最初の一往復を実装し、実際の入出力を示した後、実装会話を引き継がない Astra（gpt-6-astra）へレビューを依頼した。対象は `@shitae/session`、CLI の session 入口、runtime の switch 修正、関連テストと実演記録。全体契約の GUI/詳細照会/手動試験/seek/model identity は後続範囲として区別した。

P2 が一件、反例が二つあった。module 修飾付き外側操作が包含部品の内部操作を隠せず、CLI で内部 effect を発火できた。また common/variant の同名 alias を配置名だけで照合し、別 body の無関係な操作まで隠していた。二反例を回帰テストに追加し Red を確認した後、宣言 single-body の alias を AST element identity へ束縛し、非 alias の参照は正準 module/component と照合するよう修正した。

Astra の再確認は Session 9/9 と追加独立反例 5/5 が成功。追加反例は alias の component 名より高い優先度、明示 module の alias 回避、別 module の同名 component、collection の区別、body 間の同名 alias。未解消の actionable finding なし。runtime 修正も SPEC/ADR-0008 に一致すると確認した。

最初のレビューでは Session 7/7、新規 CLI 4/4 を独立実行した。保存済み roundtrip は新しい同一 CLI process で再現し、Session 固有 handle 以外の全応答が一致、exit 0、stderr 空、現在地「完了」を確認した。過去の保存 PID/採取過程そのものを独立に証明したとは扱わない。再レビューでは CLI 全件/GUI/詳細照会を再実行していない。レビュー agent は編集/commit/push を行っていない。

使用方法と現在の実装範囲は [session-first-slice.md](../session-first-slice.md)、実演は [cli-roundtrip-v1.json](cli-roundtrip-v1.json)、実装側の検証は [first-slice-validation.json](first-slice-validation.json)。この段階の実装とレビューを Issue #18 全体の受入完了とはしない。

## 詳細照会と snapshot のレビュー

Astra を実装会話なしで起動し、state/history/observation、手動試験、seek/reset、CLI 接続を点検した。通常 overlay の初期値の由来が inclusion だけ DSL と表示される P2 と、history.limit:null を省略扱いする P3 を独立 probe で再現した。両方の反例で red（2 failed / 12 passed）を確認後、保存 variant の投影と undefined のみの既定値処理へ修正した。Astra の再レビューで両方の修正、明示/未定義/singleton overlay の副作用なしを確認。Session 14/14 と CLI 対象 5/5 を独立再実行し、未解消の指摘はない。metadata/GUI/ブラウザはこのレビュー範囲に含めていない。

## モデル準備・GUI 共通化のレビュー

metadata/正準 loader と GUI を、それぞれ実装会話を渡さない Astra で独立レビューした。モデル準備では循環 import、symlink alias 合流、import 先だけの bytes 変更、移動後の ID、metadata の改変隔離、engine source/lock の hash 変化を確認し、実行コードに指摘なし。最終 build で並行作業中に変わった lockfile と生成 engineVersion を揃えた。

GUI レビューは追加4テストと examples 全6モデルの起動・実 onclick 16件を独立実行し、確定した実行コードの指摘なし。追加の focus テストには、DOM 再生成で旧 activeElement が残り復元欠落を検出できない P2 があった。setter で focus を失わせ、新 DOM 内の所属・個別 select の参照一致・旧 select との不一致を検証する形に修正した。focus 呼出しだけを外す反例は失敗し、通常1/1は成功することを Astra が独立確認した。

公開 CLI と生成 GUI の比較 script を Astra が一次読取・再実行し、54手順・実 onclick 48件・拒否2件・70観測点の一致を確認。固定値だった sourceReads を fixedFixtureLoads へ改名し、利用者の参照回数の測定とは扱わない。Session の追加固定期待も独立レビューした。子孫破棄の証拠不足は実子frame Child を作り解消、規模比較の証拠不足は実際に包含330/module31/frame101を作る小／大比較で解消した。公開 CLI の応答 bytes も独立再現した。その後、中断99frameへ resume する条件を加え、同じ bytes を再確認した。

実ブラウザの G02 と G03 keyboard/focus/fold は未確認。ブラウザツールの file URL 拒否を記録し、VM と DOM mock の成功をその代替とはしない。
