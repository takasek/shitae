# 原モデルの台帳

全7本を変更せず先に評価した。SHA256 はバイト列から計算し、旧台帳にも一致する。

| モデル（旧保存先からの相対path） | SHA256 | W103 |
| --- | --- | --- |
| astra/models/current.shitae | `05c29e9748933be7d8dd14f912a4a6c630b195bcec65fedc69d93778949baf7f` | 0 |
| astra/models/inline-repro.shitae | `b92d43daee3f9fe4ff5654e4061262cb64c58a1c9063b69bfa12c26bb4e354ab` | 0 |
| astra/models/proposed.shitae | `4df483ee831379ef3a52988950985072717e3cdba5a7e86181fad62568b8810a` | 0 |
| sol/models/current.shitae | `4e0ae2bbac9557df599a2282b421beaac65dce4d33c36ef3c37f50e5c1a943da` | 30 |
| sol/models/proposed.shitae | `acc1cd09372ee07d350ae9cdb0283fd7080fa7f53263dc53cb1bf5cc166edc3b` | 31 |
| sol/models/recovery.shitae | `8357da6b4d9241e44d9e028668f100ec82485e61b25f545852ea0c9bb5a92ae4` | 9 |
| reproductions/alias-member.shitae | `a66d49a3866cac39b7085e98f0fc66b251042b9b7d630c09de2bc4101cb8af7e` | 0 |

派生モデルは `derived/`、新規の独立課題モデルは `guide-evaluation/` に分離した。原本のSHAは `evidence/original-sha256.json` に旧ディレクトリ全量とともに保存。
