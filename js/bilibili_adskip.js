// bilibili_adskip.js
// B站 iOS 客户端去广告脚本
// 覆盖：开屏广告、推荐页广告卡片、直播间广告、底部Tab净化
// 参考：app2smile/rules bilibili-json.js
// 适用：Surge http-response

(function () {
    var url = $request.url;
    var body;

    try {
        body = JSON.parse($response.body);
    } catch (e) {
        $done({});
        return;
    }

    if (!body) {
        $done({});
        return;
    }

    // ---- 开屏广告：清除 show 字段 ----
    // 接口: /x/v2/splash/show 、/x/v2/splash/list
    if (url.includes('/x/v2/splash')) {
        if (body.data && body.data.show) {
            delete body.data.show;
        }
        // 同时清空 splash list
        if (body.data && body.data.list) {
            body.data.list = [];
        }
        $done({ body: JSON.stringify(body) });
        return;
    }

    // ---- 推荐页广告卡片过滤 ----
    // 接口: /x/v2/feed/index
    if (url.includes('/x/v2/feed/index')) {
        if (body.data && Array.isArray(body.data.items)) {
            body.data.items = body.data.items.filter(function (item) {
                var cardType = item.card_type;
                var cardGoto = item.card_goto;

                if (!cardType || !cardGoto) return true;

                // Banner 广告
                if (cardType === 'banner_v8' && cardGoto === 'banner') {
                    if (Array.isArray(item.banner_item)) {
                        return !item.banner_item.some(function (v) {
                            return v.type === 'ad';
                        });
                    }
                }

                // 信息流广告 (cm_v2)
                if (cardType === 'cm_v2') {
                    var adGotos = [
                        'ad_web_s', 'ad_av', 'ad_web_gif',
                        'ad_player', 'ad_inline_3d', 'ad_inline_eggs',
                        'ad_inline_av'
                    ];
                    if (adGotos.indexOf(cardGoto) !== -1) return false;
                }

                // 双列广告
                if (cardType === 'cm_double_v9' && cardGoto === 'ad_inline_av') return false;

                // 游戏推广卡
                if (cardType === 'small_cover_v10' && cardGoto === 'game') return false;

                // 通用广告类型标记
                if (cardType.indexOf('ad') !== -1) return false;

                return true;
            });
        }
        $done({ body: JSON.stringify(body) });
        return;
    }

    // ---- 底部 Tab 净化 ----
    // 接口: /x/v2/resource/show/tab/v2 （移除会员购、游戏中心等）
    if (url.includes('/resource/show/tab')) {
        if (body.data) {
            // 顶部右上角按钮
            if (Array.isArray(body.data.top)) {
                body.data.top = body.data.top.filter(function (item) {
                    return item.name !== '游戏中心';
                });
                fixPos(body.data.top);
            }
            // 底部 Tab
            if (Array.isArray(body.data.bottom)) {
                body.data.bottom = body.data.bottom.filter(function (item) {
                    return item.name !== '会员购' && item.tab_id !== '会员购Bottom';
                });
                fixPos(body.data.bottom);
            }
        }
        $done({ body: JSON.stringify(body) });
        return;
    }

    // ---- 直播间广告 ----
    // 接口: /xlive/app-room/v1/index/getInfoByRoom
    if (url.includes('/xlive/app-room/') && url.includes('/getInfoByRoom')) {
        if (body.data) {
            // 清除直播间浮层广告
            if (body.data.activity_init_info) {
                delete body.data.activity_init_info;
            }
            // 清除直播间底部广告条
            if (body.data.video_connection_info) {
                delete body.data.video_connection_info;
            }
        }
        $done({ body: JSON.stringify(body) });
        return;
    }

    // ---- 我的页面：清除广告入口 ----
    // 接口: /x/v2/account/mine
    if (url.includes('/x/v2/account/mine')) {
        if (body.data) {
            // 清除顶部推广 banner
            if (body.data.banner) {
                delete body.data.banner;
            }
            // 清除推荐会员购入口
            if (body.data.vip_shop_entrance) {
                delete body.data.vip_shop_entrance;
            }
        }
        $done({ body: JSON.stringify(body) });
        return;
    }

    // 其他接口透传
    $done({});

    // 修复 pos 字段
    function fixPos(arr) {
        for (var i = 0; i < arr.length; i++) {
            arr[i].pos = i + 1;
        }
    }
})();
