// 小红书净化脚本 - 透明可审计版
// 适用: Surge http-response，拦截 edith.xiaohongshu.com API
// 功能: 过滤信息流广告卡片、清除广告字段、去水印字段

(function () {
    const url = $request.url;

    let obj;
    try {
        obj = JSON.parse($response.body);
    } catch (e) {
        $done({});
        return;
    }

    if (!obj) {
        $done({});
        return;
    }

    // ---- 通用广告条目过滤函数 ----
    function isAdItem(item) {
        if (!item) return false;
        const modelType = (item.model_type || '').toLowerCase();
        if (modelType.includes('ad')) return false;
        if (Array.isArray(item.note_attributes) && item.note_attributes.includes('ad')) return false;
        if (typeof item.note_attributes === 'string' && item.note_attributes.includes('ad')) return false;
        if (item.ads_info) return false;
        if (item.ad_info) return false;
        if (item.sponsored) return false;
        return true;
    }

    // ---- 过滤顶层 data 数组（推荐流、搜索流等）----
    if (Array.isArray(obj.data)) {
        obj.data = obj.data.filter(isAdItem);
    }

    // ---- 过滤 data.items 数组（部分接口结构）----
    if (obj.data?.items && Array.isArray(obj.data.items)) {
        obj.data.items = obj.data.items.filter(isAdItem);
    }

    // ---- 清除广告分组字段 ----
    if (obj.data?.ads_groups !== undefined) {
        delete obj.data.ads_groups;
    }
    if (obj.data?.ad_config !== undefined) {
        delete obj.data.ad_config;
    }

    // ---- 去水印字段（部分版本有效）----
    if (obj.data?.note_list && Array.isArray(obj.data.note_list)) {
        obj.data.note_list.forEach(note => {
            if (note?.video?.consumer) {
                delete note.video.consumer.origin_video_key;
                delete note.video.consumer.video_key;
            }
        });
    }

    $done({ body: JSON.stringify(obj) });
})();
