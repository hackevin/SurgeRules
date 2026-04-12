// Reddit 去广告脚本 - 透明可审计版
// 功能：去除信息流广告、伪装 Premium、移除 NSFW 遮罩
// 适用：Surge http-response，拦截 gql-fed.reddit.com

(function () {
    const opName = $request?.body
        ? (() => { try { return JSON.parse($request.body)?.operationName || ''; } catch (e) { return ''; } })()
        : '';

    // 广告查询接口直接返回空
    if (/Ads/i.test(opName)) {
        $done({ body: '{}' });
        return;
    }

    let body;
    try {
        // 字符串替换：修改用户状态字段
        const raw = $response.body
            .replace(/"isObfuscated":true/g, '"isObfuscated":false')
            .replace(/"obfuscatedPath":"[^"]*"/g, '"obfuscatedPath":null')
            .replace(/"isNsfw":true/g, '"isNsfw":false')
            .replace(/"isNsfwMediaBlocked":true/g, '"isNsfwMediaBlocked":false')
            .replace(/"isNsfwContentShown":true/g, '"isNsfwContentShown":false')
            .replace(/"isAdPersonalizationAllowed":true/g, '"isAdPersonalizationAllowed":false')
            .replace(/"isThirdPartyInfoAdPersonalizationAllowed":true/g, '"isThirdPartyInfoAdPersonalizationAllowed":false')
            .replace(/"isPremiumMember":false/g, '"isPremiumMember":true')
            .replace(/"isEmployee":false/g, '"isEmployee":true');

        body = JSON.parse(raw);
        const data = body?.data ?? {};

        // 遍历所有顶层字段，过滤 feed 中的广告条目
        Object.keys(data).forEach(key => {
            const edges = data[key]?.feedItems?.edges ?? data[key]?.posts?.edges;
            if (!Array.isArray(edges)) return;

            const filtered = edges.filter(({ node } = {}) => {
                if (!node) return true;
                if (node.__typename === 'SubredditIdsPost') return false;
                if (node.adPayload) return false;
                if (Array.isArray(node.cells)) {
                    return !node.cells.some(cell => cell?.__typename === 'AdCell');
                }
                return true;
            });

            if (data[key]?.feedItems?.edges) data[key].feedItems.edges = filtered;
            if (data[key]?.posts?.edges) data[key].posts.edges = filtered;
        });

        body = JSON.stringify(body);
    } catch (e) {
        console.log('Reddit AdSkip Error:', e);
    }

    $done(body ? { body } : {});
})();
