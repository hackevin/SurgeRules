/*
 * 墨迹天气去广告脚本 - 托管自用版
 * 修改自 ddgksf2013
 */

(function () {
    let obj;
    try {
        obj = JSON.parse($response.body);
    } catch (e) {
        $done({});
        return;
    }

    if ($request.url.indexOf("v6/ad/get_ad") !== -1) {
        if (obj.data && obj.data.ad_list) {
            obj.data.ad_list = []; // 清空广告列表
        }
        if (obj.data && obj.data.common_ad) {
            obj.data.common_ad = {};
        }
    }

    if ($request.url.indexOf("v6/config/get_config") !== -1) {
        // 移除配置中的开屏广告链接
        if (obj.data && obj.data.splash_config) {
            delete obj.data.splash_config;
        }
    }

    $done({ body: JSON.stringify(obj) });
})();
