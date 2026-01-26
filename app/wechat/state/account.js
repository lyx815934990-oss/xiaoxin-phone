// 微信账号管理模块 - 负责管理每个聊天文件中的多个微信账号

window.XiaoxinWeChatAccount = (function () {
    var ACCOUNT_LIST_KEY = "wechat_accounts"; // 账号列表
    var CURRENT_ACCOUNT_KEY = "wechat_current_account"; // 当前使用的账号ID

    // ========== 生成微信ID ==========
    function generateWeChatId() {
        var chars =
            "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var result = "wxid_";
        for (var i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // ========== 获取账号列表 ==========
    function getAccountList() {
        if (!window.XiaoxinDataManager) {
            console.warn("[小馨手机][微信账号] DataManager 未加载");
            return [];
        }

        var accounts =
            window.XiaoxinDataManager.getCharacterData(ACCOUNT_LIST_KEY, []) ||
            [];
        return Array.isArray(accounts) ? accounts : [];
    }

    // ========== 保存账号列表 ==========
    function setAccountList(accounts) {
        if (!window.XiaoxinDataManager) {
            console.warn("[小馨手机][微信账号] DataManager 未加载");
            return;
        }

        window.XiaoxinDataManager.setCharacterData(
            ACCOUNT_LIST_KEY,
            accounts || []
        );
    }

    // ========== 获取当前账号ID ==========
    function getCurrentAccountId() {
        if (!window.XiaoxinDataManager) {
            return null;
        }

        var accountId =
            window.XiaoxinDataManager.getCharacterData(
                CURRENT_ACCOUNT_KEY,
                null
            ) || null;

        // 如果当前账号ID存在，验证账号是否还在列表中
        if (accountId) {
            var accounts = getAccountList();
            var exists = accounts.some(function (acc) {
                return acc.id === accountId;
            });
            if (!exists) {
                // 账号不存在，清除当前账号ID
                setCurrentAccountId(null);
                return null;
            }
        }

        return accountId;
    }

    // ========== 设置当前账号ID ==========
    function setCurrentAccountId(accountId) {
        if (!window.XiaoxinDataManager) {
            return;
        }

        // 验证账号是否存在
        if (accountId) {
            var accounts = getAccountList();
            var exists = accounts.some(function (acc) {
                return acc.id === accountId;
            });
            if (!exists) {
                console.warn("[小馨手机][微信账号] 账号不存在:", accountId);
                return;
            }
        }

        window.XiaoxinDataManager.setCharacterData(
            CURRENT_ACCOUNT_KEY,
            accountId
        );
    }

    // ========== 获取当前账号信息 ==========
    function getCurrentAccount() {
        var accountId = getCurrentAccountId();
        if (!accountId) {
            return null;
        }

        var accounts = getAccountList();
        for (var i = 0; i < accounts.length; i++) {
            if (accounts[i].id === accountId) {
                return accounts[i];
            }
        }

        return null;
    }

    // ========== 创建新账号 ==========
    function createAccount(accountInfo) {
        if (!window.XiaoxinDataManager) {
            console.warn("[小馨手机][微信账号] DataManager 未加载");
            return null;
        }

        var accounts = getAccountList();

        // 生成账号ID
        var accountId = generateWeChatId();
        while (
            accounts.some(function (acc) {
                return acc.id === accountId;
            })
        ) {
            accountId = generateWeChatId();
        }

        // 创建账号对象
        var account = {
            id: accountId,
            wechatId: accountInfo.wechatId || accountId,
            nickname: accountInfo.nickname || "微信用户",
            avatar: accountInfo.avatar || "",
            phone: accountInfo.phone || "",
            createdAt: accountInfo.createdAt || Date.now(),
        };

        // 添加可选字段（如果提供了）
        if (accountInfo.gender !== undefined) {
            account.gender = accountInfo.gender;
        }
        if (accountInfo.region !== undefined) {
            account.region = accountInfo.region;
        }
        if (accountInfo.signature !== undefined) {
            account.signature = accountInfo.signature;
        }
        if (accountInfo.avatarDescription !== undefined) {
            account.avatarDescription = accountInfo.avatarDescription;
        }

        // 添加到列表
        accounts.push(account);
        setAccountList(accounts);

        // 如果这是第一个账号，自动设置为当前账号
        if (accounts.length === 1) {
            setCurrentAccountId(accountId);
        }

        console.info("[小馨手机][微信账号] 创建新账号:", account);
        return account;
    }

    // ========== 更新账号信息 ==========
    function updateAccount(accountId, updates) {
        var accounts = getAccountList();
        var index = -1;

        for (var i = 0; i < accounts.length; i++) {
            if (accounts[i].id === accountId) {
                index = i;
                break;
            }
        }

        if (index === -1) {
            console.warn("[小馨手机][微信账号] 账号不存在:", accountId);
            return false;
        }

        // 更新账号信息
        Object.assign(accounts[index], updates);
        setAccountList(accounts);

        console.info("[小馨手机][微信账号] 更新账号:", accountId, updates);
        return true;
    }

    // ========== 删除账号 ==========
    function deleteAccount(accountId) {
        var accounts = getAccountList();
        var index = -1;

        for (var i = 0; i < accounts.length; i++) {
            if (accounts[i].id === accountId) {
                index = i;
                break;
            }
        }

        if (index === -1) {
            console.warn("[小馨手机][微信账号] 账号不存在:", accountId);
            return false;
        }

        // 如果删除的是当前账号，切换到其他账号
        var currentId = getCurrentAccountId();
        if (currentId === accountId) {
            accounts.splice(index, 1);
            if (accounts.length > 0) {
                // 切换到第一个账号
                setCurrentAccountId(accounts[0].id);
            } else {
                // 没有账号了，清除当前账号ID
                setCurrentAccountId(null);
            }
        } else {
            accounts.splice(index, 1);
        }

        setAccountList(accounts);

        // 清除该账号的所有数据
        _clearAccountData(accountId);

        console.info("[小馨手机][微信账号] 删除账号:", accountId);
        return true;
    }

    // ========== 切换账号 ==========
    function switchAccount(accountId) {
        var accounts = getAccountList();
        var exists = accounts.some(function (acc) {
            return acc.id === accountId;
        });

        if (!exists) {
            console.warn("[小馨手机][微信账号] 账号不存在:", accountId);
            return false;
        }

        setCurrentAccountId(accountId);
        console.info("[小馨手机][微信账号] 切换到账号:", accountId);
        return true;
    }

    // ========== 清除账号数据 ==========
    function _clearAccountData(accountId) {
        if (!window.XiaoxinDataManager) {
            return;
        }

        // 清除该账号相关的所有数据
        // 这里需要根据实际的数据结构来清除
        // 例如：聊天记录、联系人、朋友圈等
        var keys = [
            "wechat_chats",
            "wechat_contacts",
            "wechat_moments",
            "wechat_unread",
        ];

        keys.forEach(function (key) {
            // 获取数据
            var data = window.XiaoxinDataManager.getCharacterData(key, {});
            if (typeof data === "object" && data !== null) {
                // 清除该账号相关的数据
                // 这里假设数据是按账号ID组织的对象
                if (data[accountId]) {
                    delete data[accountId];
                    window.XiaoxinDataManager.setCharacterData(key, data);
                }
            }
        });
    }

    // ========== 获取账号数据键（用于存储账号相关的数据） ==========
    function getAccountDataKey(baseKey) {
        var accountId = getCurrentAccountId();
        if (!accountId) {
            return baseKey;
        }
        return baseKey + "_account_" + accountId;
    }

    // ========== 导出 ==========
    return {
        generateWeChatId: generateWeChatId,
        getAccountList: getAccountList,
        getCurrentAccountId: getCurrentAccountId,
        getCurrentAccount: getCurrentAccount,
        setCurrentAccountId: setCurrentAccountId,
        createAccount: createAccount,
        updateAccount: updateAccount,
        deleteAccount: deleteAccount,
        switchAccount: switchAccount,
        getAccountDataKey: getAccountDataKey,
    };
})();
