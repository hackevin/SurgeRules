// 高德地图去广告脚本 - 透明可审计版
// 原作者: @ddgksf2013，逻辑还原重写，移除混淆
// 适用: Surge http-response
// 更新: 2025-12-06 V1.0.28 对应版本

(function () {
    const url = $request.url;

    let obj;
    try {
        obj = JSON.parse($response.body);
    } catch (e) {
        $done({});
        return;
    }

    // ---- 开屏广告：将展示时长设为 0 ----
    // 接口: /ws/valueadded/alimama/splash_screen
    if (url.includes('splash_screen')) {
        if (obj?.data?.ad) {
            for (let item of obj.data.ad) {
                item.set.display_time = 0;
                if (item.creative?.[0]) {
                    item.creative[0].start_time = 0x8585fb80;
                    item.creative[0].end_time   = 0x8585fb80;
                }
            }
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ---- 首页底部处理：过滤非导航卡片 ----
    // 接口: /ws/faas/amap-navigation/main-page
    if (url.includes('main-page')) {
        obj?.data?.pullList  && (obj.data.pullList  = []);
        obj?.data?.pull3List && (obj.data.pull3List = []);
        obj?.data?.pull3?.msgs && (obj.data.pull3.msgs = []);
        if (obj?.data?.cardList) {
            obj.data.cardList = Object.values(obj.data.cardList).filter(
                item => item.dataType === 'FrequentDestination' || item.dataType === 'FrequentLocation'
            );
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ---- 我的页面：清理广告卡片，只保留订单和常用 ----
    // 接口: /ws/shield/dsp/profile/index/nodefaas
    if (url.includes('nodefaas')) {
        delete obj?.data?.advertInfo;
        if (obj?.data?.cardList) {
            obj.data.cardList = Object.values(obj.data.cardList).filter(
                item => item.dataType === 'MyOrderCard' || item.dataType === 'FrequentLocation'
            );
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ---- 附近页面：清理推荐列表 ----
    // 接口: /ws/shield/search/nearbyrec_smart
    if (url.includes('nearbyrec_smart')) {
        obj?.data?.recList && (obj.data.recList = []);
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ---- 打车页面：清理推广资源 ----
    // 接口: /ws/promotion-web/resource
    if (url.includes('promotion-web/resource')) {
        const propsToDelete = ['adInfo', 'bannerInfo', 'activityInfo', 'couponInfo', 'marketInfo', 'tipInfo'];
        if (obj?.data) {
            for (const prop of propsToDelete) {
                obj.data?.[prop] && (obj.data[prop] = []);
            }
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ---- 消息/推送通知：清空消息列表 ----
    // 接口: /ws/msgbox/pull
    if (url.includes('msgbox/pull')) {
        obj?.msgs && (obj.msgs = []);
        obj?.pull3?.msgs && (obj.pull3.msgs = []);
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ---- 底部 Tab 角标通知：清空 noticeList ----
    // 接口: /ws/message/notice/list
    if (url.includes('message/notice/list')) {
        obj?.data?.noticeList && (obj.data.noticeList = []);
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ---- 搜索框热词：清空 AI 推荐热词 ----
    // 接口: /ws/shield/search/new_hotword
    if (url.includes('new_hotword')) {
        const keywords = ['hotword', 'recommend', 'his_input_tip', 'defaultTip', 'aiNative', 'ai_', 'banner'];
        Object.keys(obj?.data || {}).forEach(key => {
            if (keywords.some(kw => key.includes(kw))) {
                obj.data[key] = { status: 1, version: '', value: '' };
            }
        });
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ---- 首页右中广告 / updatable：清理广告字段 ----
    // 接口: /ws/shield/frogserver/aocs/updatable
    if (url.includes('updatable')) {
        const propsToDelete = ['advert', 'scene', 'bannerInfo', 'couponInfo', 'activityInfo'];
        if (obj?.data) {
            propsToDelete.forEach(p => { delete obj.data[p]; });
            if (obj.data.cardList) {
                obj.data.cardList = obj.data.cardList.filter(
                    item => !propsToDelete.includes(item)
                );
            }
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // 其他接口透传
    $done({});
})();
