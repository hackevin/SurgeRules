/**
 * 车来了 - 去底栏广告脚本
 * 原作者: ddgksf2013
 * 格式化 & 优化: Grok
 * 版本: 1.0.2 (原版)
 * 适用于 Surge / Quantumult X / Loon 等
 */

(function () {
    const version = "1.0.2";

    let body = $response.body;

    // 匹配被标记的广告/底栏内容（原脚本核心特征）
    let match = body.match(/[*]*YGKJ([\s\S]*?)YGKJ[*]*/);

    if (match && match[1]) {
        // 找到标记内容后，尝试清理底栏相关数据
        let cleaned = body.replace(/[*]*YGKJ([\s\S]*?)YGKJ[*]*/g, '');

        // 进一步清理可能的底栏字段（常见于车来了响应体）
        cleaned = cleaned.replace(/"bottomBar"[\s\S]*?},?/g, '');
        cleaned = cleaned.replace(/"bottom_ad"[\s\S]*?},?/g, '');
        cleaned = cleaned.replace(/"adList"[\s\S]*?\[\]/g, '"adList":[]');
        cleaned = cleaned.replace(/"hasAd"[\s\S]*?true/g, '"hasAd":false');

        // 如果清理后仍然是有效 JSON，则输出
        try {
            JSON.parse(cleaned);  // 验证是否仍是合法 JSON
            $done({ body: cleaned });
        } catch (e) {
            // 如果清理导致 JSON 损坏，回退到简单删除标记
            $done({ body: body.replace(/[*]*YGKJ([\s\S]*?)YGKJ[*]*/g, '') });
        }
    } else {
        // 未匹配到 YGKJ 标记时，尝试通用底栏清理
        let modified = body
            .replace(/"bottomBar"[\s\S]*?},?/g, '')
            .replace(/"bottom_ad"[\s\S]*?},?/g, '')
            .replace(/"adInfo"[\s\S]*?},?/g, '')
            .replace(/"hasBottomAd"[\s\S]*?true/g, '"hasBottomAd":false')
            .replace(/"showBottomBar"[\s\S]*?true/g, '"showBottomBar":false');

        $done({ body: modified });
    }
})();
