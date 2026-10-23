# Checker #65 → #64 検証記録

検証日: 2026-10-23 JST。開始版: `0495f75`（更新済み origin/main）。

## 対象と参照基準

- [#65](https://github.com/takasek/shitae/issues/65): document common の singleton 明示 show に既存 W106 を適用。元 result 単位で一度だけ走査する。
- [#64](https://github.com/takasek/shitae/issues/64): E028 を参照先の singleton 定義で判定。宣言・body ローカル alias・inline 内宣言・member を検査する。
- SPEC「alias のスコープと優先順位」「singleton component」「モジュール化」「collection」、ADR-0016 C4、ADR-0020 を参照。
- alias は interaction が書かれた single-body 内だけで優先し、要素宣言の右辺を再び body alias として引かない。明示 module 修飾は import 表で解決する。
- member は owner 自身ではなくその要素 alias の参照先を検査。現在 variant が静的に一意でないため各 variant の実効 body を調べ、違反する定義がある行動対象に一度だけ報告する。member の参照先が他モジュールなら、その定義元の import 表を使う。
- inline の外側の collection は子に伝播しない。未定義・未解決・project context 不在は従来どおり素通り。

## Red → Green

依存 install と全体 build を済ませ、実際の診断の欠落・誤検出で失敗したことを確認してから production コードを変更した。

| 段階 | コマンド | Red | Green |
| --- | --- | --- | --- |
| #65 checker | `pnpm --filter @shitae/checker exec vitest run test/singleton-show.test.ts` | 2 failed / 2 passed。document common の local / import alias 明示 show が W106 なし | 4 passed |
| #65 CLI | `pnpm --filter @shitae/cli exec vitest run test/cli.test.ts -t 'issue #65'` | 2 failed / 2 passed。公開 check でも同じ欠落 | 4 passed |
| #64 checker | `pnpm --filter @shitae/checker exec vitest run test/singleton-collection.test.ts` | 16 failed / 4 passed。module 同名衝突・inline・alias・member の誤検出/見逃し | 20 passed |
| #64 CLI | `pnpm --filter @shitae/cli exec vitest run test/cli.test.ts -t 'issue #64'` | 6 failed / 3 passed。終了コードと E028 の不一致 | 9 passed |

#65 後に checker 全54件・CLI 全40件を検証し、独立した commit `f51655b` にした。#64 後の全件検証は `pnpm -r test` 883 passed（parser 246 / resolver 37 / runtime 97 / checker 74 / XState 35 / Mermaid 20 / session 42 / simulator 283 / CLI 49）。`pnpm typecheck` も全 package 成功。CLI pretest が依存を含め再 build する。初回型検査で union の絞り込み不足を検出して修正し、その後の型検査で成功を確認した。

runtime / resolver / session / engineVersion / 保存形式は変更していない。GUI の見た目や人間による操作受入の主張は含まない。

独立レビューでは実装時の会話・推論を渡さない別 agent が GitHub の要件・SPEC・ADR と差分を照合し、重大な指摘なし。checker 74/74 件を別途実行して成功した。CLI・元13例・Red証跡は実装側の確認であり、レビュー側での独立再実行はしていない。

## 添付元の13例

入力: `shitae-deep-repro-20261023.zip`、SHA-256 `ffc313aef2c9caf113e95d99f6a61383a2fa612c1ad729d6034355e2247cf362`。

収録 `minimal/run_minimal.py`（SHA-256 `ab28c4ddfc356a57e77b0b528141f0334b7942ad4ee784020048b65c427adcf0`）と plan / models を変更せず、`SHITAE_CLI=<checkout>/packages/cli/dist/index.js python3 <extracted>/minimal/run_minimal.py` で実行。公開 check / session の結果は [original-minimal-results.json](original-minimal-results.json) に保存した。

#65 後・#64 前は19・20・49・50の4例が FAIL。#64 後は11例 PASS / 2例 FAIL。

| ケース | 修正後 |
| --- | --- |
| 19 / 20（#64） | PASS。合法な cross-module collection を許容、不正な singleton collection は E028 |
| 25 / 26 / 27（#64 control） | PASS |
| 31 / 38（#65） | PASS。W106 が出る。38 の Save → Next → Notify 後は共有値 Clean |
| 39 / 40（#65 control） | PASS。W106 なし。39 は共有値 Saved を保持 |
| 49 qualified-back-collision | FAIL。期待 a::Home、実際 b::Home。今回範囲外の既存 back 問題 |
| 50 qualified-back-absent | FAIL。期待 main::Details、実際 a::Home。今回範囲外の既存 back 問題 |
| 51 / 58（back control） | PASS |

元スクリプトは全13例を実行したため終了コード1。今回の対象9例はいずれも PASS であり、残る2失敗を修正済みとは扱わない。
