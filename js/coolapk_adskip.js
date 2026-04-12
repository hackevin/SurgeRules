// 酷安净化脚本 - 透明可审计版
// 原作者: @ddgksf2013，逻辑还原重写，移除 jsjiami 混淆
// 适用: Surge http-response
// 更新: 2025-09-27 V1.0.12 对应版本

(function () {
    const url = $request.url;

    let obj;
    try {
        obj = JSON.parse($response.body);
    } catch (e) {
        $done({});
        return;
    }

    // ---- 通用广告过滤函数 ----
    function isAdItem(item) {
        if (!item) return false;
        const type = (item.entityType || item.cardType || '').toLowerCase();
        const adTypes = ['sponsoredcard', 'ad', 'adcard', 'banner', 'promote', 'feed_ad'];
        if (adTypes.some(t => type.includes(t))) return true;
        if (item.url && /ad\.|sponsor|promote/i.test(item.url)) return true;
        return false;
    }

    function filterAdList(list) {
        if (!Array.isArray(list)) return list;
        return list.filter(item => !isAdItem(item));
    }

    // ---- 开屏广告：清空 splashAdvert 字段 ----
    // 接口: /v6/main/init
    if (url.includes('/main/init')) {
        if (obj?.data?.splashAdvert !== undefined) obj.data.splashAdvert = null;
        if (obj?.data?.hotSearchWord !== undefined) obj.data.hotSearchWord = [];
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ---- 首页广告：过滤 feed 列表中的广告卡片 ----
    // 接口: /v6/main/indexV8
    if (url.includes('/main/indexV8')) {
        if (obj?.data) obj.data = filterAdList(obj.data);
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ---- 推广广告 / 酷品页推广：过滤 data 列表 ----
    // 接口: /v6/dataList 、/v6/page/dataList
    if (url.includes('/dataList')) {
        if (obj?.data) obj.data = filterAdList(obj.data);
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ---- 评论广告：过滤评论列表中的广告条目 ----
    // 接口: /v6/feed/replyList
    if (url.includes('/feed/replyList')) {
        if (obj?.data) obj.data = filterAdList(obj.data);
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ---- 帖子详情广告：清除 relatedFeeds / recommend ----
    // 接口: /v6/feed/detail
    if (url.includes('/feed/detail')) {
        if (obj?.data?.relatedFeeds) obj.data.relatedFeeds = [];
        if (obj?.data?.recommendFeed) obj.data.recommendFeed = [];
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // 其他接口透传
    $done({});
})();
