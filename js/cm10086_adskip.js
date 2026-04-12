// 中国移动客户端去广告
// 原作者: chatgpt
// 版本: 2026-04-10

(function () {
  // 中国移动首页净化（思路级）
  let body = $response.body;
  
  try {
    let obj = JSON.parse(body);
  
    // 常见广告字段清理
    if (obj.data) {
      delete obj.data.ad;
      delete obj.data.ads;
      delete obj.data.banner;
      delete obj.data.adList;
      delete obj.data.activityList;
    }
  
    // 递归过滤（弱版本）
    function clean(o) {
      if (Array.isArray(o)) {
        return o.filter(i => !i?.type?.includes("ad"));
      }
      return o;
    }
  
    if (obj.data && obj.data.cards) {
      obj.data.cards = clean(obj.data.cards);
    }
  
    $done({ body: JSON.stringify(obj) });
  
  } catch (e) {
    $done({});
  }
})();
