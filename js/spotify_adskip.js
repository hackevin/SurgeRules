// spotify_adskip.js
// 过滤 Spotify iOS 播放队列中的广告 track

(function () {
    var body = $response.body;
    
    if (!body || body.length === 0) {
        $done({});
        return;
    }
    
    // 防止 Protobuf / 二进制响应导致 illegal buffer
    if (typeof body !== 'string' || body.charCodeAt(0) < 32 && body.charCodeAt(0) !== 9 && body.charCodeAt(0) !== 10 && body.charCodeAt(0) !== 13) {
        $done({});
        return;
    }
    
    // 快速判断是否为 JSON（必须以 { 或 [ 开头）
    var firstChar = body.trimLeft().charAt(0);
    if (firstChar !== '{' && firstChar !== '[') {
        $done({});
        return;
    }
    
    try {
        var obj = JSON.parse(body);
    
        // 过滤 pages 中的广告 track
        if (obj && obj.pages) {
            obj.pages = obj.pages.map(function(page) {
                if (page && page.tracks) {
                    page.tracks = page.tracks.filter(function(track) {
                        // 广告 track 的 provider 或 metadata 含有 ad 标识
                        if (!track) return false;
                        var provider = (track.provider || '').toLowerCase();
                        var reason = (track.reason || '').toLowerCase();
                        var isAd = provider.indexOf('ad') !== -1 || reason === 'ad';
                        return !isAd;
                    });
                }
                return page;
            });
        }
    
        // 过滤 next_tracks 中的广告
        if (obj && obj.next_tracks) {
            obj.next_tracks = obj.next_tracks.filter(function(track) {
                if (!track) return false;
                var provider = (track.provider || '').toLowerCase();
                return provider.indexOf('ad') === -1;
            });
        }
    
        $done({ body: JSON.stringify(obj) });
    
    } catch(e) {
        // JSON 解析失败时透传原始响应（防止破坏正常播放）
        $done({});
    }
})();
