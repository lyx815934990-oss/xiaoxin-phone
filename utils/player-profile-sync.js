// 玩家微信资料同步脚本
// 监听账号更新事件，自动同步玩家微信资料到酒馆全局变量

(function () {
    "use strict";

    console.info("[小馨手机][玩家资料同步] 脚本加载中...");

    // 等待页面加载完成
    $(function () {
        // 尝试多种方式访问 replaceVariables 函数
        function getReplaceVariablesFunction() {
            // 方法1：直接使用 replaceVariables（如果可用）
            if (typeof replaceVariables === "function") {
                return replaceVariables;
            }
            // 方法2：通过 window.parent 访问
            try {
                if (window.parent && window.parent !== window && typeof window.parent.replaceVariables === "function") {
                    return window.parent.replaceVariables;
                }
            } catch (e) {
                // 跨域限制，忽略错误
            }
            // 方法3：通过 window.top 访问
            try {
                if (window.top && window.top !== window && typeof window.top.replaceVariables === "function") {
                    return window.top.replaceVariables;
                }
            } catch (e) {
                // 跨域限制，忽略错误
            }
            return null;
        }

        // 同步玩家微信资料到酒馆变量
        function syncPlayerProfileToVariables() {
            var replaceVarsFunc = getReplaceVariablesFunction();

            if (!replaceVarsFunc) {
                console.warn(
                    "[小馨手机][玩家资料同步] replaceVariables 函数不可用，无法同步变量"
                );
                return false;
            }

            try {
                // 获取当前账号信息
                var account =
                    (window.XiaoxinWeChatAccount &&
                        typeof window.XiaoxinWeChatAccount.getCurrentAccount === "function" &&
                        window.XiaoxinWeChatAccount.getCurrentAccount()) ||
                    (window.XiaoxinWeChatDataHandler &&
                        typeof window.XiaoxinWeChatDataHandler.getAccount === "function" &&
                        window.XiaoxinWeChatDataHandler.getAccount()) ||
                    null;

                if (!account) {
                    console.warn(
                        "[小馨手机][玩家资料同步] 无法获取账号信息"
                    );
                    return false;
                }

                // 构建要同步的变量对象
                var variablesToSync = {
                    player_wechat_nickname: account.nickname || account.name || "微信用户",
                    player_wechat_id: account.wechatId || account.id || "未设置",
                    player_wechat_gender: account.gender || account.sex || "未设置",
                    player_wechat_region: account.region || account.location || "未设置",
                    player_wechat_signature: account.signature || account.sign || account.desc || "未设置",
                    player_wechat_phone: account.phone || account.mobile || "未绑定",
                    player_wechat_avatar: account.avatar || "",
                    player_wechat_avatar_description: account.avatarDescription || "",
                    player_wechat_moments_background: account.momentsBackground || "",
                    player_wechat_moments_background_description: account.momentsBackgroundDescription || ""
                };

                // 更新全局变量
                replaceVarsFunc(variablesToSync, { type: "global" });
                console.info(
                    "[小馨手机][玩家资料同步] 已同步更新玩家微信资料变量到酒馆变量",
                    variablesToSync
                );
                return true;
            } catch (e) {
                console.warn(
                    "[小馨手机][玩家资料同步] 同步变量失败:",
                    e
                );
                return false;
            }
        }

        // 监听账号更新事件
        if (typeof window.addEventListener === "function") {
            window.addEventListener("xiaoxin-account-updated", function (event) {
                console.info(
                    "[小馨手机][玩家资料同步] 收到账号更新事件:",
                    event.detail
                );
                // 延迟一点时间，确保账号数据已保存
                setTimeout(function () {
                    syncPlayerProfileToVariables();
                }, 100);
            });
        }

        // 页面加载时立即同步一次
        setTimeout(function () {
            syncPlayerProfileToVariables();
        }, 500);

        // 定期检查并同步（每5秒检查一次，最多检查10次）
        var checkCount = 0;
        var maxChecks = 10;
        var checkInterval = setInterval(function () {
            checkCount++;
            if (syncPlayerProfileToVariables() || checkCount >= maxChecks) {
                clearInterval(checkInterval);
                if (checkCount >= maxChecks) {
                    console.warn(
                        "[小馨手机][玩家资料同步] 已达到最大检查次数，停止定期检查"
                    );
                }
            }
        }, 5000);

        console.info("[小馨手机][玩家资料同步] 脚本已加载，开始监听账号更新事件");
    });
})();

