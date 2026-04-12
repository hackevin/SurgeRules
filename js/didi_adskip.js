// 滴滴出行净化脚本 - 完整合并版
// 原作者: ZenmoFeiShi (Didichuxing.js)
// jsonjq 逻辑实现: Surge 适配
// 更新: 2025-05-29

(function () {
    const url = $request.url;

    if (!$response.body) {
        $done({});
        return;
    }

    let obj;
    try {
        obj = JSON.parse($response.body);
    } catch (e) {
        $done({});
        return;
    }

    // ================================================================
    // ✅ 通用广告处理（所有接口共用）
    // ================================================================
    try {
        if (obj?.data?.instances?.oversea_main_banner) {
            delete obj.data.instances.oversea_main_banner;
        }
    } catch (e) {
        console.log('移除广告条错误: ' + e);
    }

    // ================================================================
    // ✅ 场景列表：移除优惠商城
    // 接口: /gulfstream/pre-sale/v1/other/pGetSceneList
    // ================================================================
    if (url.includes('/other/pGetSceneList')) {
        if (obj?.data?.scene_list instanceof Array) {
            obj.data.scene_list = obj.data.scene_list.filter(item => item.text !== '优惠商城');
        }
        if (obj?.data?.show_data instanceof Array) {
            obj.data.show_data.forEach(block => {
                if (block.scene_ids instanceof Array) {
                    block.scene_ids = block.scene_ids.filter(id => id !== 'scene_coupon_mall');
                }
            });
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ================================================================
    // ✅ 首页核心布局：精简顶部导航和底部 Tab
    // 接口: /homepage/v1/core 或 /homepage/v2/core 等
    // ================================================================
    if (url.includes('/homepage/') && url.includes('/core')) {
        const keepNavIds = ['dache_anycar', 'driverservice', 'bike', 'carmate', 'nav_more_v3'];
        if (obj.data?.order_cards?.nav_list_card?.data) {
            obj.data.order_cards.nav_list_card.data = obj.data.order_cards.nav_list_card.data.filter(
                item => keepNavIds.includes(item.nav_id)
            );
        }
        const keepBottomNavIds = ['v6x_home', 'home_page', 'user_center'];
        if (obj.data?.disorder_cards?.bottom_nav_list?.data) {
            obj.data.disorder_cards.bottom_nav_list.data = obj.data.disorder_cards.bottom_nav_list.data.filter(
                item => keepBottomNavIds.includes(item.id)
            );
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ================================================================
    // ✅ 顶部横幅：移除元图推广横幅
    // 接口: /ota/na/yuantu/infoList
    // ================================================================
    if (url.includes('/ota/na/yuantu/infoList')) {
        if (obj.data?.disorder_cards?.top_banner_card?.data?.[0]?.T === 'yuentu_top_banner') {
            obj.data.disorder_cards.top_banner_card.data.shift();
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ================================================================
    // ✅ 用户中心（/usercenter/me）：清除营销入口
    // 接口: /common/vN/usercenter/me
    // ================================================================
    if (url.includes('/usercenter/me')) {
        const excludedTitles = ['天天领福利', '金融服务', '更多服务', '企业服务', '安全中心'];
        if (obj.data?.cards) {
            obj.data.cards = obj.data.cards.filter(card => !excludedTitles.includes(card.title));
            obj.data.cards.forEach(card => {
                if (card.tag === 'wallet') {
                    if (card.items) {
                        card.items = card.items.filter(item => item.title === '优惠券');
                    }
                    if (card.card_type === 4 && card.bottom_items) {
                        card.bottom_items = card.bottom_items.filter(item =>
                            item.title === '省钱套餐' || item.title === '出行里程'
                        );
                    }
                }
            });
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ================================================================
    // ✅ 海外首页布局
    // 接口: /homepage/v1/oversea/layout
    // ================================================================
    if (url.includes('/oversea/layout')) {
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ================================================================
    // ✅ 钱包首页：清除借贷、折扣推广卡片（原 jsonjq 逻辑）
    // 接口: /passenger-wallet/api/v6/wallet/homepage
    // ================================================================
    if (url.includes('/wallet/homepage')) {
        try {
            const card0 = obj?.data?.cardList?.[0];
            if (card0?.detailData) {
                delete card0.detailData.myCreditLimit;
                if (Array.isArray(card0.detailData.discountList)) {
                    card0.detailData.discountList = card0.detailData.discountList.slice(0, 3);
                }
            }
            if (Array.isArray(obj?.data?.cardList)) {
                obj.data.cardList = obj.data.cardList.slice(0, 1);
            }
        } catch (e) {
            console.log('钱包处理错误: ' + e);
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ================================================================
    // ✅ 打车首页布局：删除 xp-card-01 推广卡（原 jsonjq 逻辑）
    // 接口: /gulfstream/porsche/v1/dache_homepage_layout
    // ================================================================
    if (url.includes('/dache_homepage_layout')) {
        try {
            if (obj?.data?.instances?.['xp-card-01'] !== undefined) {
                delete obj.data.instances['xp-card-01'];
            }
        } catch (e) {
            console.log('首页布局处理错误: ' + e);
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ================================================================
    // ✅ 行程中布局：删除推广组件（原 jsonjq 逻辑）
    // 接口: /gulfstream/passenger-center/v2/other/pInTripLayout
    // ================================================================
    if (url.includes('/pInTripLayout')) {
        try {
            if (Array.isArray(obj?.data?.order_components)) {
                if (obj.data.order_components[8]?.data !== undefined) {
                    delete obj.data.order_components[8].data;
                }
                obj.data.order_components = obj.data.order_components.filter(
                    c => c?.name !== 'passenger_common_casper'
                );
            }
        } catch (e) {
            console.log('行程中处理错误: ' + e);
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // ================================================================
    // ✅ 用户中心布局：清除营销卡片（原 jsonjq 逻辑）
    // 接口: /common/v5/usercenter/layout
    // ================================================================
    if (url.includes('/usercenter/layout')) {
        try {
            const instances = obj?.data?.instances;
            if (instances && typeof instances === 'object') {
                delete instances.center_widget_list;
                delete instances.center_tool_card;
                delete instances.center_marketing_card;

                const viewInfo = instances?.center_wallet_finance_card?.data?.view_info;
                if (Array.isArray(viewInfo)) {
                    instances.center_wallet_finance_card.data.view_info = viewInfo.slice(0, 1);
                } else if (viewInfo && typeof viewInfo === 'object') {
                    delete viewInfo['1'];
                    delete viewInfo['2'];
                    delete viewInfo['3'];
                }
            }
        } catch (e) {
            console.log('用户中心布局处理错误: ' + e);
        }
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // 其他接口透传
    $done({ body: JSON.stringify(obj) });
})();
