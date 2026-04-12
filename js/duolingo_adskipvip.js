// duolingo_cn.js
// 适用于 ios-api-2.duolingo.cn，修改用户数据解锁无限体力

(function () {
    var url = $request ? $request.url : '';

    // http-request 类型：拦截广告配置接口
    if ($request && url.includes('/ads/')) {
        $done({
            status: "HTTP/1.1 200 OK",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adsEnabled: false, showAds: false })
        });
        return;
    }

    // http-response 类型：修改用户数据解锁体力
    var body = $response.body;
    var obj;
    try {
        obj = JSON.parse(body);
    } catch (e) {
        $done({});
        return;
    }

    if (obj.health) {
        obj.health.useHealth = false;
        obj.health.unlimitedHeartsAvailable = true;
        obj.health.hearts = obj.health.maxHearts || 5;
        obj.health.eligibleForFreeRefill = false;
        obj.health.secondsUntilNextHeartSegment = null;
    }

    if (obj.hasPlus !== undefined) {
        obj.hasPlus = true;
    }

    if (obj.courses) {
        obj.courses.forEach(function (course) {
            course.healthEnabled = false;
        });
    }

    $done({ body: JSON.stringify(obj) });
})();
