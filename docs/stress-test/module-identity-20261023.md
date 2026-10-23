# module 同一性の回帰検証（#63 → #66）

2026-10-23 JST。起点は origin/main `0495f75`。設計判断は [ADR-0026](../adr/0026-overlay-identity-is-module-component.md)、公開 CLI / ブラウザー用のモデルは [main.shitae](cases/module-identity-20261023/main.shitae) と同じフォルダの a/b。

## TDD

- #63: production 変更前に runtime の4例が挙動で失敗（既存97例成功）。CLI は要求 ID のテスト不備を訂正した後、別module誤復帰・未訪問誤一致・barrier内誤一致の3例が挙動で失敗し、同file別aliasの対照は成功。修正後 runtime 101/101、CLI 40/40。
- #66: production 変更前に runtime の2例、Session の1例、GUI の1例で挙動の失敗を確認。修正後 runtime 103/103、Session 43/43、GUI 284/284、公開CLI 41/41。
- #63 の独立レビューで、中断中の子孫を先に exit していたテストの前提不足を指摘。flow の子 tab を生かしたまま flow へ復帰してから back する形に訂正し、事前に3フレームが存在することも検証した。

## 検証結果

- `pnpm -r build`、`pnpm -r typecheck`、`pnpm -r test` 成功。全件859テスト（parser 246、resolver 37、runtime 103、mermaid 20、xstate 35、checker 50、Session 43、GUI 284、CLI 41）。
- CLI のモデル check 成功。公開 CLI で同名overlay二枚、同file別alias、singleton明示/省略variant、異名overlayとの共存、exit後寿命、lexical hide を確認。export → 別 process の `--replay` → state一致 → hide/再show/継続操作を回帰テストで検証。
- 旧HTML内の旧Sessionで実際に記録した scenario を新版CLIに渡し、exit 1 / stdout空 / `ENGINE_MISMATCH` を確認。照合の緩和・自動migrationは行わない。
- 実ブラウザー（Codex in-app browser）: ShowA → HideB 後も a::Notice が残る。Both → Again 後は a::Notice が Ready、b::Notice が Idle で共存し、aだけ Check(signal) を操作できる。bカードの Close でbだけ消える。再show後、Controller内の無修飾HideAでaだけ消え、bは残る。BackFlow → ReturnA は ALabel の Home へ戻り、b のoverlayは残る。
- ブラウザーの結果はAIによる操作確認であり、人間の初心者評価・アクセシビリティ受入を表すものではない。

## 独立レビュー

ADR の転記元整合レビューと最終差分レビューを別コンテキストで実施。最終レビューは指摘なし。runtime/Session/CLI/GUIと履歴・保存に対する298件を独立再実行し成功。engineVersionの入力ハッシュも独立再計算して一致を確認。実ブラウザー確認は実装担当が行った。

## 保存物

同じ checkout の `build/module-identity-20261023/` に旧HTML・旧モデル・旧scenario・起点ソースarchive・旧buildのarchive・新版HTML/モデル・ブラウザー画像・Red/Greenと全件検証ログ・SHA256SUMSを保存した。生成物はGit追跡外で、テストモデルとこの記録は追跡する。旧ソースは起点commitから復元でき、旧HTMLは旧実行プログラムを内包する。新版で新規記録する際は新版のengineVersionを使う。
