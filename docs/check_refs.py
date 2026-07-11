import re, sys

def parse_and_check(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    components = {}   # component名 -> set(姿名)
    cur_comp = None
    cur_variations = set()

    # パス1: component と姿を収集
    for raw in lines:
        # 行コメント除去
        line = raw.split('//')[0].rstrip()
        if not line.strip():
            continue
        # インタラクション行（行頭 '>'）は姿収集に無関係なので剥がして無視
        line = re.sub(r'^>\s*', '', line)
        if not line.strip():
            continue
        # 姿定義 ## 名前
        m = re.match(r'^##\s+(\S.*)$', line)
        if m and cur_comp:
            cur_variations.add(m.group(1).strip())
            components[cur_comp] = cur_variations
            continue
        # component定義 # 名前（## は上で処理済み）
        m = re.match(r'^#\s+(\S.*)$', line)
        if m:
            cur_comp = m.group(1).strip()
            cur_variations = set()
            components[cur_comp] = cur_variations
            continue

    return components, lines

def check_refs(path):
    components, lines = parse_and_check(path)
    errors = []
    warnings = []
    cur_comp = None

    # 全遷移先参照を集める
    # 遷移語(行き先) を拾う。行き先は component / component##姿 / ##姿 / module::component[##姿]
    nav_pat = re.compile(r'\b(push|goto|present|back|switch)\s*\(([^)]*)\)')

    for i, raw in enumerate(lines, 1):
        line = raw.split('//')[0]
        if not line.strip():
            continue
        # 現在のcomponent追跡（## でない # 行）
        m = re.match(r'^#\s+(\S.*)$', line)
        if m and not line.startswith('##'):
            cur_comp = m.group(1).strip()
            continue
        # インタラクション行（行頭 '>'）を剥がす。'->' の有無に関わらず
        # （継続行も遷移語を含み得るため）遷移抽出の対象にする
        line = re.sub(r'^>\s*', '', line)

        for mm in nav_pat.finditer(line):
            word, arg = mm.group(1), mm.group(2).strip()
            if arg == '':
                continue  # back() など
            # 第1引数が行き先。セッション(@)はスキップ対象（present/pushの第2引数）
            # カンマ分割して各引数を見る
            args = [a.strip() for a in arg.split(',')]
            target = args[0]
            # 第1引数が @ で始まる = セッション参照（exit/dismiss/back(@) など）→ 行き先ではない
            if target.startswith('@'):
                continue
            # 自然文（副作用）は nav_pat に一致しないのでここには来ない

            # target を解析: [module::]name[##姿] または ##姿
            # モジュール参照は外部ファイルなのでチェック対象外（存在確認できない）
            if '::' in target:
                continue

            # ##姿 のみ（同一component内の姿）
            m_self = re.match(r'^##(\S+)$', target)
            if m_self:
                shape = m_self.group(1)
                if cur_comp is None:
                    errors.append(f"{path}:{i}: 同一component姿参照 ##{shape} だが現在のcomponent不明")
                elif shape not in components.get(cur_comp, set()):
                    errors.append(f"{path}:{i}: {word}(##{shape}) — '{cur_comp}' に姿 '{shape}' が無い")
                continue

            # component[##姿]
            m_full = re.match(r'^([^#]+)(##(\S+))?$', target)
            if m_full:
                comp = m_full.group(1).strip()
                shape = m_full.group(3)
                if comp not in components:
                    errors.append(f"{path}:{i}: {word}({target}) — component '{comp}' が未定義")
                elif shape is not None and shape not in components[comp]:
                    errors.append(f"{path}:{i}: {word}({target}) — '{comp}' に姿 '{shape}' が無い")
                # 姿を持つcomponentに姿指定なしでpush/goto → デフォルト姿（警告のみ）
                elif shape is None and components[comp]:
                    pass  # 最初の姿がデフォルト、で合法
            else:
                warnings.append(f"{path}:{i}: 行き先 '{target}' を解析できず")

    return components, errors, warnings

for path in ['example-battle.shitae', 'example-ecommerce.shitae']:
    comps, errors, warnings = check_refs(path)
    print(f"\n===== {path} =====")
    print(f"定義された component: {len(comps)} 個")
    for c, vs in comps.items():
        vtxt = f"  姿: {', '.join(sorted(vs))}" if vs else "  (単一の姿)"
        print(f"  #{c}{vtxt}")
    print(f"\n  エラー: {len(errors)} 件")
    for e in errors:
        print("   ✗", e)
    print(f"  警告: {len(warnings)} 件")
    for w in warnings:
        print("   ⚠", w)
