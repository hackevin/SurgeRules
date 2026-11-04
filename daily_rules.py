#!/usr/bin/env python3
"""
下载多个 AdGuard 规则 + Loyalsoldier 的 mihomo reject 规则，合并去重后按"平台-reject-类型"命名输出到 rules/:

  mihomo-reject.yaml / .txt              behavior: domain     (+.x.com / x.com，体积小、匹配快)
  mihomo-reject-classical.yaml / .txt    behavior: classical  (DOMAIN-SUFFIX/DOMAIN/WILDCARD/KEYWORD/REGEX，完整版)
  mihomo-reject-extra.yaml               behavior: classical  (只含 domain 规则集表达不了的: 通配符/关键字/正则)
  surge-reject.list                      Surge DOMAIN-SET     (.x.com 含子域 / x.com 精确)
  surge-reject-extra.list                Surge RULE-SET       (DOMAIN-KEYWORD / DOMAIN-WILDCARD)
  shadowrocket-reject.list               Shadowrocket RULE-SET 完整版(DOMAIN-SUFFIX/DOMAIN/KEYWORD/WILDCARD)
  shadowrocket-reject-extra.list         Shadowrocket RULE-SET 只含通配符/关键字
  Surge / Shadowrocket 没有 DOMAIN-REGEX(它们的正则只作用于 URL)，所以这两个平台不输出正则规则。

只依赖 Python 3.8+ 标准库。任何一个源下载失败都会直接退出(exit 1)，避免用残缺数据覆盖上一次的结果。

AdGuard -> 各平台转换表:
  ||x.com^ / ||x.com / ||*.x.com^ / .x.com^   mihomo domain: +.x.com   classical/surge/shadowrocket: DOMAIN-SUFFIX,x.com  (DOMAIN-SET: .x.com)
  |x.com^ / ://x.com^ / hosts 行 / 纯域名行     mihomo domain: x.com     classical/surge/shadowrocket: DOMAIN,x.com         (DOMAIN-SET: x.com)
  ||ad-*.x.com^ 等带 * 的                      domain 规则集: 丢弃       其余: DOMAIN-WILDCARD (* 任意字符)
  ||label.  (被截断, 任意后缀)                  domain 规则集: 丢弃       其余: DOMAIN-WILDCARD,label.*
  -ads1. / -banner728x90- 等子串片段            domain 规则集: 丢弃       其余: DOMAIN-KEYWORD
  /^label\\./                                  domain 规则集: 丢弃       其余: DOMAIN-WILDCARD,label.*  (见 ANCHORED_REGEX_AS)
  /^.+stat\\.kugou\\.com/ 等含字面量的主机名正则  domain 规则集: 丢弃       其余: DOMAIN-KEYWORD
  无字面量可提取的主机名正则                     仅 mihomo classical: DOMAIN-REGEX (兜底)
  IP、URL/路径正则、$badfilter 等修饰符、@@ 例外      全部丢弃(@@ 仅用于剔除同名条目)
"""
import ipaddress
import re
import sys
import time
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

ADGUARD_URLS = [
 #   "https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt",
    "https://adguardteam.github.io/HostlistsRegistry/assets/filter_29.txt",
 #   "https://adguardteam.github.io/HostlistsRegistry/assets/filter_18.txt",
 #   "https://adguardteam.github.io/HostlistsRegistry/assets/filter_50.txt",
    "https://adguardteam.github.io/HostlistsRegistry/assets/filter_21.txt",
]
MIHOMO_URLS = [
    "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/reject.txt",
]

# 纯域名 / hosts 行本身是"精确匹配"语义(filter_18 就是)。想连子域一起拦就改成 True。
PLAIN_AS_WILDCARD = False
# /^admarvel\./ 这类"主机名以 xxx. 开头"的正则: 
#   "wildcard" -> DOMAIN-WILDCARD,admarvel.*  (与原正则语义完全一致，推荐)
#   "keyword"  -> DOMAIN-KEYWORD,admarvel.    (更宽: 会连 support.appsflyer.com 这类子域也拦)
ANCHORED_REGEX_AS = "wildcard"
MIN_KEYWORD_LEN = 5

OUT_DIR = Path(__file__).resolve().parent / "rules"
LEGACY_FILES = ["reject.yaml", "reject.txt", "reject-classical.yaml", "reject-classical.txt", "reject-extra.yaml"]
BJ = timezone(timedelta(hours=8))

DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z0-9-]{2,63}$"
)
WC_RE = re.compile(r"^[a-z0-9_*.-]+$")
KW_RE = re.compile(r"^[a-z0-9._-]+$")
LOCAL_NAMES = {
    "localhost", "localhost.localdomain", "local", "broadcasthost",
    "ip6-localhost", "ip6-loopback", "ip6-localnet", "ip6-mcastprefix",
    "ip6-allnodes", "ip6-allrouters", "ip6-allhosts", "0.0.0.0",
}


class Rules:
    def __init__(self):
        self.wild, self.exact, self.allow = set(), set(), set()   # domain 规则集可用
        self.wc, self.kw, self.rx = set(), set(), set()           # 仅 classical 可用

    def update(self, o):
        for n in ("wild", "exact", "allow", "wc", "kw", "rx"):
            getattr(self, n).update(getattr(o, n))

    def add_pattern(self, p, stats, label):
        """把 * 模式加入规则；形如 *xxx* 的纯子串自动降级为 DOMAIN-KEYWORD。"""
        if p.startswith("*") and p.endswith("*") and len(p) > 2 and "*" not in p[1:-1]:
            if len(p) - 2 >= MIN_KEYWORD_LEN:
                self.kw.add(p[1:-1])
                stats[f"仅 classical: {label} -> DOMAIN-KEYWORD"] += 1
            else:
                stats["丢弃: 关键字过短(易误杀)"] += 1
        else:
            self.wc.add(p)
            stats[f"仅 classical: {label} -> DOMAIN-WILDCARD"] += 1


def fetch(url, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "rule-merge/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", errors="ignore")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"下载失败: {url} ({last})")


def is_ip(s):
    try:
        ipaddress.ip_address(s)
        return True
    except ValueError:
        return False


def norm_domain(s):
    """返回合法的小写域名(punycode)，否则返回 None。"""
    s = s.strip().lower()
    if not s.isascii():
        try:
            s = s.encode("idna").decode("ascii")
        except UnicodeError:
            return None
    if is_ip(s) or s in LOCAL_NAMES or not DOMAIN_RE.match(s):
        return None
    return s


# ---------------------------------------------------------------- 正则 -> keyword / wildcard / regex
def longest_literal(pat):
    """去掉 [..] {..} \\d \\w 等之后，取最长的字面量片段。"""
    s = re.sub(r"\[[^\]]*\]", "|", pat)
    s = re.sub(r"\{[^}]*\}", "|", s)
    s = s.replace("\\.", "\x00")
    s = re.sub(r"\\[a-zA-Z]", "|", s)
    s = s.replace("\x00", ".")
    runs = re.split(r"[^a-z0-9._-]+", s.lower())
    return max(runs, key=len) if runs else ""


def convert_regex(line, R, stats):
    m = re.fullmatch(r"/(.+)/", line)
    if not m:
        stats["丢弃: 正则带修饰符/URL 级规则"] += 1
        return
    pat = m.group(1)
    # URL / 路径 / 端口 / IP 类正则: 与域名无关，classical 也表达不了
    if "/" in pat or ":" in pat or re.match(r"\^?\(?\d+(\\)?\.\d", pat):
        stats["丢弃: 正则(IP/URL/路径)"] += 1
        return
    low = pat.lower()

    # ^label\.   -> 主机名以 label. 开头
    m1 = re.fullmatch(r"\^([a-z0-9_-]+)\\\.", low)
    if m1:
        label = m1.group(1)
        if ANCHORED_REGEX_AS == "wildcard":
            R.wc.add(f"{label}.*")
            stats["仅 classical: 正则 ^label\\. -> DOMAIN-WILDCARD"] += 1
        else:
            R.kw.add(f"{label}.")
            stats["仅 classical: 正则 ^label\\. -> DOMAIN-KEYWORD"] += 1
        return

    # ^.+literal  /  .*literal  -> 子串
    m2 = re.fullmatch(r"\^?\.[+*]((?:[a-z0-9_-]|\\\.)+)", low)
    if m2:
        kw = m2.group(1).replace("\\.", ".")
        if len(kw) >= MIN_KEYWORD_LEN:
            R.kw.add(kw)
            stats["仅 classical: 正则 -> DOMAIN-KEYWORD"] += 1
            return

    # 其它主机名正则: 有足够长的字面量 -> keyword(近似)；否则 DOMAIN-REGEX 兜底
    lit = longest_literal(low)
    if len(lit) >= 6 and KW_RE.match(lit):
        R.kw.add(lit)
        stats["仅 classical: 正则 -> DOMAIN-KEYWORD(取最长字面量, 近似)"] += 1
    elif "," in pat:
        stats["丢弃: 含逗号的正则(classical 按逗号分割，写不进去)"] += 1
    else:
        R.rx.add(pat)
        stats["仅 classical: 正则 -> DOMAIN-REGEX(兜底)"] += 1


# ---------------------------------------------------------------- 通配符 / 截断片段
def build_wildcards(anchor, body, had_caret):
    if anchor == "sub":
        anchor, body = "plain", "." + body
    p = body.lower()
    if not WC_RE.match(p) or "**" in p:
        return None
    if not had_caret and not p.endswith("*"):
        p += "*"   # 没有 ^ 结尾: 后面还可以接任意字符(截断的 "label." 即变成 "label.*")
    if len(re.sub(r"[^a-z0-9]", "", p)) < 4:
        return None
    if anchor == "domain":                      # || 同时匹配本身和所有子域
        return [p] if p.startswith("*") else [p, "*." + p]
    if anchor in ("exact", "scheme"):
        return [p]
    return [p if p.startswith("*") else "*" + p]


def parse_adguard(text, R, stats):
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line[0] in "!#[":
            continue

        is_allow = line.startswith("@@")
        if is_allow:
            line = line[2:]

        if line.startswith("/"):
            if is_allow:
                stats["丢弃: 不支持的 @@ 规则"] += 1
            else:
                convert_regex(line, R, stats)
            continue

        # 修饰符: 只接受 $important，其余(badfilter/dnsrewrite/client/denyallow...)会改变语义
        if "$" in line:
            line, _, mods = line.partition("$")
            if mods.strip() != "important":
                stats["丢弃: 带修饰符($badfilter等)"] += 1
                continue

        # hosts 格式: 0.0.0.0 example.com [alias ...]
        if not line.startswith(("|", ".", ":")):
            parts = line.split(" #")[0].split("\t#")[0].split()
            if len(parts) >= 2 and is_ip(parts[0]):
                for d in parts[1:]:
                    nd = norm_domain(d)
                    if nd:
                        (R.wild if PLAIN_AS_WILDCARD else R.exact).add(nd)
                        stats["转换: hosts 行"] += 1
                continue

        if line.startswith("||"):
            anchor, body = "domain", line[2:]
        elif line.startswith("://"):
            anchor, body = "scheme", line[3:]
        elif line.startswith("|"):
            anchor, body = "exact", line[1:]
        elif line.startswith("."):
            anchor, body = "sub", line[1:]
        else:
            anchor, body = "plain", line

        had_caret = False
        if body.endswith("^|"):
            body, had_caret = body[:-2], True
        elif body.endswith("^"):
            body, had_caret = body[:-1], True
        elif body.endswith("|"):
            body = body[:-1]

        if body.startswith("*.") and anchor == "domain" and "*" not in body[2:]:
            body = body[2:]                      # ||*.example.com^ == ||example.com^ 的子域部分 -> +.

        has_star = "*" in body
        if not has_star and is_ip(body):
            stats["丢弃: IP 地址"] += 1
            continue
        d = None if has_star else norm_domain(body)

        if is_allow:
            if d and anchor in ("domain", "exact", "sub", "scheme"):
                R.allow.add(d)
                stats["例外(@@): 记录"] += 1
            else:
                stats["丢弃: 不支持的 @@ 规则"] += 1
            continue

        if d:
            if anchor in ("domain", "sub"):
                R.wild.add(d)
                stats["转换: ||x^ / .x^ -> +.x"] += 1
            elif anchor in ("exact", "scheme"):
                R.exact.add(d)
                stats["转换: |x^ / ://x^ -> x(精确)"] += 1
            elif had_caret:      # 无锚点的 x^ : 子串 + 末尾锚定
                R.wc.add("*" + d)
                stats["仅 classical: 无锚点 x^ -> DOMAIN-WILDCARD"] += 1
            else:
                (R.wild if PLAIN_AS_WILDCARD else R.exact).add(d)
                stats["转换: 纯域名行"] += 1
            continue

        pats = build_wildcards(anchor, body, had_caret)
        if not pats:
            stats["丢弃: 不完整/非域名片段"] += 1
            continue
        label = "通配符" if has_star else "截断/子串片段"
        for p in pats:
            R.add_pattern(p, stats, label)


def parse_mihomo(text, R, stats):
    """解析 Loyalsoldier 的 domain 规则(yaml payload 或纯文本)。"""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("payload"):
            continue
        if line.startswith("- "):
            line = line[2:].strip()
        line = line.strip("'\"").strip().lower()
        if "," in line:  # classical 格式，不属于 domain behavior
            stats["丢弃(mihomo源): classical 格式"] += 1
            continue
        if line.startswith("+."):
            d = norm_domain(line[2:])
            if d:
                R.wild.add(d)
        elif line.startswith("."):
            d = norm_domain(line[1:])
            if d:
                R.wild.add(d)
        else:
            d = norm_domain(line)
            if d:
                R.exact.add(d)


# ---------------------------------------------------------------- 合并去重
def covered_by_parent(domain, wild):
    parts = domain.split(".")
    return any(".".join(parts[i:]) in wild for i in range(1, len(parts)))


def merge(R):
    removed = len((R.wild | R.exact) & R.allow)
    wild = R.wild - R.allow
    exact = R.exact - wild - R.allow
    wild = {d for d in wild if not covered_by_parent(d, wild)}
    exact = {d for d in exact if not covered_by_parent(d, wild)}
    return wild, exact, removed


def drop_covered_by_keywords(domains, keywords):
    kws = list(keywords)
    return {d for d in domains if not any(k in d for k in kws)}


def sort_key(d):
    return d.split(".")[::-1]


# ---------------------------------------------------------------- 输出
def body_of(path):
    if not path.exists():
        return None
    return [l for l in path.read_text(encoding="utf-8").splitlines() if not l.startswith("#")]


def write_if_changed(path, header, body_lines, yaml_payload):
    """yaml_payload=True: 每行加 '  - ' 并用单引号包住(正则/通配符里的特殊字符更安全)。"""
    if yaml_payload:
        body = ["payload:"] + ["  - '" + l.replace("'", "''") + "'" for l in body_lines]
    else:
        body = body_lines
    if body_of(path) == body:
        print(f"{path.name}: 内容无变化，跳过写入")
        return
    path.write_text(header + "\n".join(body) + "\n", encoding="utf-8")
    print(f"{path.name}: 已更新 ({len(body_lines)} 条)")


def main():
    R = Rules()
    stats = Counter()

    for url in ADGUARD_URLS:
        one, s = Rules(), Counter()
        parse_adguard(fetch(url), one, s)
        print(f"[AdGuard] {url.rsplit('/', 1)[-1]}: +.={len(one.wild)} 精确={len(one.exact)} "
              f"通配符={len(one.wc)} 关键字={len(one.kw)} 正则={len(one.rx)} 例外={len(one.allow)}")
        stats.update(s)
        R.update(one)

    for url in MIHOMO_URLS:
        one = Rules()
        parse_mihomo(fetch(url), one, stats)
        print(f"[mihomo ] {url.rsplit('/', 1)[-1]}: +.={len(one.wild)} 精确={len(one.exact)}")
        R.update(one)

    print("\n--- 转换/丢弃统计 ---")
    for k, v in sorted(stats.items()):
        print(f"{v:>9}  {k}")

    before = len(R.wild) + len(R.exact)
    wild, exact, removed = merge(R)
    items = sorted([(d, True) for d in wild] + [(d, False) for d in exact], key=lambda x: sort_key(x[0]))
    total = len(items)
    print(f"\n[domain] 合并前 {before} 条 -> 去重后 {total} 条 (+. {len(wild)} / 精确 {len(exact)}); @@例外剔除 {removed} 条")

    if total < 1000:  # 简单保护，防止异常数据覆盖结果
        print("结果条目过少，疑似数据异常，放弃写入", file=sys.stderr)
        sys.exit(1)

    # classical: 被关键字覆盖的域名没必要再写
    c_wild = drop_covered_by_keywords(wild, R.kw)
    c_exact = drop_covered_by_keywords(exact, R.kw)
    suffix_lines = [f"DOMAIN-SUFFIX,{d}" for d in sorted(c_wild, key=sort_key)]
    domain_lines = [f"DOMAIN,{d}" for d in sorted(c_exact, key=sort_key)]
    extra_lines = (
        [f"DOMAIN-KEYWORD,{k}" for k in sorted(R.kw)]
        + [f"DOMAIN-WILDCARD,{p}" for p in sorted(R.wc)]
        + [f"DOMAIN-REGEX,{r}" for r in sorted(R.rx)]
    )
    classical_lines = suffix_lines + domain_lines + extra_lines
    print(f"[classical] DOMAIN-SUFFIX {len(suffix_lines)} / DOMAIN {len(domain_lines)} / "
          f"KEYWORD {len(R.kw)} / WILDCARD {len(R.wc)} / REGEX {len(R.rx)}; "
          f"被关键字覆盖而省略 {len(wild) - len(c_wild) + len(exact) - len(c_exact)} 条")

    now = datetime.now(BJ).strftime("%Y-%m-%d %H:%M:%S (UTC+8)")

    def header(desc, n, usage):
        return f"# 描述: {desc}\n# 更新时间: {now}\n# 规则数量: {n}\n# 用法: {usage}\n"

    OUT_DIR.mkdir(exist_ok=True)

    # ---------------- mihomo ----------------
    d_lines = [f"{'+.' if w else ''}{d}" for d, w in items]
    h = header("AdGuard 广告/追踪规则 + Loyalsoldier reject 合并去重后的 mihomo domain 规则集", total,
               "mihomo rule-providers: behavior: domain (yaml 文件 format: yaml, txt 文件 format: text)")
    write_if_changed( OUT_DIR / "mihomo-reject.yaml", h, d_lines, True)
    write_if_changed( OUT_DIR / "mihomo-reject.txt", h, d_lines, False)

    h = header("AdGuard + Loyalsoldier reject 合并去重后的 mihomo classical 完整规则集"
               "(DOMAIN-SUFFIX/DOMAIN/WILDCARD/KEYWORD/REGEX)", len(classical_lines),
               "mihomo rule-providers: behavior: classical")
    write_if_changed( OUT_DIR / "mihomo-reject-classical.yaml", h, classical_lines, True)
    write_if_changed( OUT_DIR / "mihomo-reject-classical.txt", h, classical_lines, False)

    h = header("domain 规则集表达不了的部分(通配符/关键字/正则)，与 mihomo-reject.yaml 搭配使用",
               len(extra_lines), "mihomo rule-providers: behavior: classical")
    write_if_changed( OUT_DIR / "mihomo-reject-extra.yaml", h, extra_lines, True)

    # ---------------- surge / shadowrocket (无 DOMAIN-REGEX) ----------------
    nore_extra = ([f"DOMAIN-KEYWORD,{k}" for k in sorted(R.kw)]
                  + [f"DOMAIN-WILDCARD,{p}" for p in sorted(R.wc)])
    sd_lines = [f"{'.' if w else ''}{d}" for d, w in items]       # DOMAIN-SET: .x.com 含子域, x.com 精确
    sr_lines = suffix_lines + domain_lines + nore_extra

    h = header("AdGuard + Loyalsoldier reject 合并去重后的 Surge 域名集(.x.com 含子域 / x.com 精确)", len(sd_lines),
               "Surge: DOMAIN-SET,<本文件URL>,REJECT")
    write_if_changed( OUT_DIR / "surge-reject.list", h, sd_lines, False)

    h = header("domain-set 表达不了的部分(通配符/关键字)，与 surge-reject.txt 搭配使用", len(nore_extra),
               "Surge: RULE-SET,<本文件URL>,REJECT")
    write_if_changed( OUT_DIR / "surge-reject-extra.list", h, nore_extra, False)

    h = header("AdGuard + Loyalsoldier reject 合并去重后的 Shadowrocket 完整规则集"
               "(DOMAIN-SUFFIX/DOMAIN/KEYWORD/WILDCARD)", len(sr_lines),
               "Shadowrocket: RULE-SET,<本文件URL>,REJECT")
    write_if_changed( OUT_DIR / "shadowrocket-reject.list", h, sr_lines, False)

    h = header("只含通配符/关键字的部分", len(nore_extra), "Shadowrocket: RULE-SET,<本文件URL>,REJECT")
    write_if_changed( OUT_DIR / "shadowrocket-reject-extra.list", h, nore_extra, False)

    # 清理旧命名的文件(改名前生成的)，Actions 提交时会一并删除
    for old in ("reject.yaml", "reject.txt", "reject-classical.yaml",
                "reject-classical.txt", "reject-extra.yaml"):
        f = OUT_DIR / old
        if f.exists():
            f.unlink()
            print(f"已删除旧文件: {old}")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
