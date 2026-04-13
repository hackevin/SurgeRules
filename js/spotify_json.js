// spotify_json.js
// 歌手/专辑列表伪装：将 iPhone 平台标识替换为 iPad，使列表正常展示
// 原作者: app2smile
// 自托管适配: hackevin
 
(function () {
    let url = $request.url;
 
    if (url.includes('com:443')) {
        url = url.replace(/com:443/, 'com');
    }
 
    if (url.includes('platform=iphone')) {
        url = url.replace(/platform=iphone/, 'platform=ipad');
    }
 
    $done({ url });
})();
