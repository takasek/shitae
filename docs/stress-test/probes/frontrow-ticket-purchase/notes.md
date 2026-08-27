# FrontRow ticket-purchase probe

## Source

出典は [FrontRow 公式リポジトリ](https://github.com/majdukovic/frontrow) で、ライセンスは MIT である。対象は公式 README の `tests/maestro/tickets/buy.yaml` である。

## Preconditions

デモユーザーで決定論的な OSS コントロールをセットアップし、イベントタブと安定した test ID を利用できることを前提とする。

## Expected trace and success criteria

イベントタブ、`evt_001` の詳細、購入画面、`Ticket purchased`、My Tickets が順に visible になることが評価上の成功条件である。

## Representation gaps

`assertVisible` と安定した test-ID は評価層の契約であり、shitae のコア DSL に first-class assertion と test-ID 契約はない。
