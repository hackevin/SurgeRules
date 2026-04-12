// 中国联通净化脚本 - Surge 版
// 原作者: @ddgksf2013，转换适配: Surge http-response
// 根据请求 URL 分别处理各接口

(function () {
    const url = $request.url;
    let body = $response.body;

    try {
        // ---- 热搜词：清空 113000004 字段 ----
        if (/\/search_service\/search\/searchScrollWord/.test(url)) {
            let obj = JSON.parse(body);
            if (obj['113000004'] !== undefined) {
                obj['113000004'] = [];
            }
            $done({ body: JSON.stringify(obj) });
            return;
        }

        // ---- 首页底部 ICON：删除推广字段 ----
        if (/\/clientIndex\/homefusion\/fuInter/.test(url)) {
            let obj = JSON.parse(body);
            if (obj['HomeFusion.backGroundQuery'] !== undefined) {
                delete obj['HomeFusion.backGroundQuery'];
            }
            if (obj['HomeFusion.bottomLabel'] && obj['HomeFusion.bottomLabel'].bottomMallKey !== undefined) {
                delete obj['HomeFusion.bottomLabel'].bottomMallKey;
            }
            $done({ body: JSON.stringify(obj) });
            return;
        }

        // ---- 借钱 / 积分 / 彩铃 / 横幅 / 本地图片推广：清空 data ----
        if (/\/clientMyPage\/v\d\/api\/(myWallet|myPoints|myColorfulRingtone|newUserInfo|getDeviceInfo)/.test(url)) {
            let obj = JSON.parse(body);
            obj.data = {};
            $done({ body: JSON.stringify(obj) });
            return;
        }

        // 其他情况透传
        $done({});

    } catch (e) {
        // JSON 解析失败，透传原始响应
        $done({});
    }
})();
