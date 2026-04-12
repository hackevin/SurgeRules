// Quora 去广告脚本 - 透明可审计版
// 适用: Surge http-response
// 拦截 Quora API 响应，过滤广告条目和追踪字段

try {
    const obj = JSON.parse($response.body);

    if (!obj) {
        $done({});
        return;
    }

    // ---- 过滤 data 数组中的广告条目 ----
    if (Array.isArray(obj.data)) {
        obj.data = obj.data.filter(item => {
            if (!item) return false;
            if (item.adInfo || item.isSponsored) return false;
            const type = (item.__typename || item.type || '').toLowerCase();
            if (type.includes('ad') || type.includes('sponsor') || type.includes('promoted')) return false;
            return true;
        });
    }

    // ---- 过滤 sections 中的广告区块 ----
    if (Array.isArray(obj.sections)) {
        obj.sections = obj.sections.filter(sec => {
            if (!sec) return true;
            const type = (sec.type || sec.__typename || '').toLowerCase();
            return !type.includes('ad') && !type.includes('sponsor');
        });
    }

    // ---- 清除广告配置和追踪字段 ----
    if (obj.config) {
        delete obj.config.adConfig;
        delete obj.config.tracking;
        delete obj.config.adsEnabled;
    }

    $done({ body: JSON.stringify(obj) });

} catch(e) {
    // JSON 解析失败时透传原始响应
    $done({});
}
