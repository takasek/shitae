# External validation matrix (2026-08)

| Probe | External evidence | What maps well | Evaluation-layer boundary |
| --- | --- | --- | --- |
| GUIOdyssey research-to-note | CC BY 4.0; episode 7872483543119388; Opera + Simplenote; Pixel 7 Pro; 18 steps | Intra-app states and navigation | Cross-app clipboard causality is natural-language only |
| GUIOdyssey language-setting | CC BY 4.0; episode 6991725180034358; Calendar + Setting; Pixel Tablet; 15 steps | Intra-app settings navigation | OS locale propagation and assertions are natural-language only |
| FrontRow ticket purchase | MIT; official `tests/maestro/tickets/buy.yaml`; deterministic OSS control | Event/detail/purchase/ticket navigation | `assertVisible` and stable test IDs are evaluation-layer contracts, not core DSL |
| Nextcloud share retry | OPEN issue #14414; opened 2025-01-15; pinned Android 14/S21+/3.30.7/30.0.0 environment | Intra-app upload states and retry navigation | External events, background workers, network preconditions, and expected-vs-actual belong to evaluation metadata |
| Mattermost message post | Apache-2.0; commit `ebc1f1382bb0334c0f679467bb6cc97fa6b8c0ae`; `MM-T4782_1`; Detox mobile E2E | Channel navigation and enabled/disabled send-control variants | Visibility, value, test-ID, random message, and API assertions remain evaluation-layer facts |

Sources: [GUIOdyssey repository](https://github.com/OpenGVLab/GUI-Odyssey), [GUIOdyssey dataset](https://huggingface.co/datasets/hflqf88888/GUIOdyssey), [FrontRow](https://github.com/majdukovic/frontrow), [Nextcloud issue #14414](https://github.com/nextcloud/android/issues/14414), and [Mattermost Mobile](https://github.com/mattermost/mattermost-mobile/tree/ebc1f1382bb0334c0f679467bb6cc97fa6b8c0ae).

## CLI verification (2026-08-24)

| Probe | check | simulate | mermaid | Artifact handling |
| --- | --- | --- | --- | --- |
| GUIOdyssey research-to-note | exit 0; no diagnostics | exit 0; HTML stdout 29,476 bytes | exit 0; Mermaid stdout 1,247 bytes | Not stored in repo |
| GUIOdyssey language-setting | exit 0; no diagnostics | exit 0; HTML stdout 30,033 bytes | exit 0; Mermaid stdout 1,098 bytes | Not stored in repo |
| FrontRow ticket purchase | exit 0; no diagnostics | exit 0; HTML stdout 31,677 bytes | exit 0; Mermaid stdout 1,802 bytes | Not stored in repo |
| Nextcloud share retry | exit 0; no diagnostics | exit 0; HTML stdout 32,721 bytes | exit 0; Mermaid stdout 1,177 bytes | Not stored in repo |
| Mattermost message post | exit 0; no diagnostics | exit 0; HTML stdout 27,137 bytes | exit 0; Mermaid stdout 595 bytes | Not stored in repo |

The FrontRow Mermaid output included `チケット購入_購入済み --タップ(マイチケットタブ)--> マイチケット一覧`, confirming the document-common tab mapping.

## Overall conclusion

The five probes show that shitae represents app-local states and navigation compactly. Cross-app effects, OS-wide locale propagation, visibility and test-ID assertions, production network timing, and service-side API confirmation are evaluation-layer facts rather than missing core syntax. Mattermost also shows that enabled/disabled controls can be represented naturally as variants, while visibility, value, test-ID, and API assertions remain in the evaluation layer. `check`, `simulate`, and `mermaid` perform static validation or artifact generation only; they do not replay the observed real service. No core syntax addition is proposed.
