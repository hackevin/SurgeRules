// spotify_header.js
// 删除 customize 接口缓存请求头，强制获取最新服务端配置
// 原作者: app2smile
// 自托管适配: hackevin
 
(function () {
    let headers = $request.headers;
    delete headers['If-None-Match'];
    $done({ headers });
})();
