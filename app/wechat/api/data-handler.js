// 微信数据处理器 - 作为微信应用与 data-manager.js 之间的桥梁
// 支持按聊天文件和角色卡独立存储，支持多账号切换

window.XiaoxinWeChatDataHandler = (function () {
    // ========== 数据键定义 ==========
    var DATA_KEYS = {
        CHATS: "wechat_chats", // 聊天记录
        CONTACTS: "wechat_contacts", // 联系人列表
        MOMENTS: "wechat_moments", // 朋友圈数据
        MOMENTS_LAST_SEEN: "wechat_moments_last_seen", // 最近一次查看朋友圈列表的时间戳
        MOMENTS_UNREAD: "wechat_moments_unread", // 朋友圈未读数量（类似微信私聊未读）
        PLAYER_HISTORY_LOCK: "wechat_player_history_lock_v1", // 玩家历史朋友圈“一次性”锁
        UNREAD: "wechat_unread", // 未读消息数
        SETTINGS: "wechat_settings", // 微信设置
        FRIEND_REQUESTS: "wechat_friend_requests_v1", // 好友申请记录
        TAGS: "wechat_tags_v1", // 标签库（用于"我的标签"）
        STICKER_CATEGORIES: "wechat_sticker_categories", // 表情包分组
        STICKERS: "wechat_stickers", // 玩家上传的表情包
        REDPACKET_SUMMARY: "wechat_redpacket_summary", // 红包汇总数据
        WALLET: "wechat_wallet", // 钱包数据
    };

    // ========== 获取账号相关的数据键 ==========
    function _getAccountDataKey(baseKey) {
        if (window.XiaoxinWeChatAccount) {
            return window.XiaoxinWeChatAccount.getAccountDataKey(baseKey);
        }
        return baseKey;
    }

    // ========== 获取数据（带账号隔离） ==========
    function _getData(key, defaultValue) {
        if (!window.XiaoxinDataManager) {
            console.warn("[小馨手机][微信数据] DataManager 未加载");
            return defaultValue;
        }

        var accountKey = _getAccountDataKey(key);
        return window.XiaoxinDataManager.getCharacterData(
            accountKey,
            defaultValue
        );
    }

    // ========== 设置数据（带账号隔离） ==========
    function _setData(key, value) {
        if (!window.XiaoxinDataManager) {
            console.warn("[小馨手机][微信数据] DataManager 未加载");
            return;
        }

        var accountKey = _getAccountDataKey(key);
        window.XiaoxinDataManager.setCharacterData(accountKey, value);
    }

    // ========== 账号管理（兼容旧接口） ==========
    function getAccount() {
        if (window.XiaoxinWeChatAccount) {
            return window.XiaoxinWeChatAccount.getCurrentAccount();
        }
        return null;
    }

    function setAccount(account) {
        if (!window.XiaoxinWeChatAccount) {
            console.warn("[小馨手机][微信数据] AccountManager 未加载");
            return false;
        }

        // 如果账号不存在，创建新账号
        if (!account.id) {
            account = window.XiaoxinWeChatAccount.createAccount(account);
        } else {
            // 检查账号是否存在
            var accounts = window.XiaoxinWeChatAccount.getAccountList();
            var exists = accounts.some(function (acc) {
                return acc.id === account.id;
            });

            if (!exists) {
                // 账号不存在，创建新账号
                account = window.XiaoxinWeChatAccount.createAccount(account);
            } else {
                // 更新账号信息
                window.XiaoxinWeChatAccount.updateAccount(account.id, account);
            }
        }

        // 设置为当前账号
        if (account && account.id) {
            window.XiaoxinWeChatAccount.setCurrentAccountId(account.id);
        }

        return true;
    }

    // ========== 初始化数据（清除当前账号的所有数据） ==========
    function initializeData() {
        console.info("[小馨手机][微信数据] 初始化数据（清除当前账号数据）");

        // 清除当前账号的所有数据
        Object.values(DATA_KEYS).forEach(function (key) {
            var accountKey = _getAccountDataKey(key);
            if (window.XiaoxinDataManager) {
                window.XiaoxinDataManager.clearCharacterData(accountKey);
            }
        });
    }

    // ========== 聊天记录管理 ==========
    function getChatHistory(userId) {
        var chats = _getData(DATA_KEYS.CHATS, {});
        return chats[userId] || [];
    }

    function addChatMessage(userId, message) {
        // 检查是否是语音通话文本消息，如果是则跳过（不添加到聊天记录）
        // ⚠️ 重要：红包消息不应该被过滤，即使 content 字段包含 [MSG] 标签
        if (message.type !== "redpacket") {
            var msgContent = message.content || "";
            if (
                msgContent.indexOf("[MSG]") !== -1 &&
                msgContent.indexOf("[/MSG]") !== -1 &&
                (msgContent.indexOf("type=call_voice_text") !== -1 ||
                    msgContent.indexOf("type=call_voice_text\n") !== -1)
            ) {
                console.info(
                    "[小馨手机][微信数据] 跳过语音通话文本消息，不添加到聊天记录，消息ID:",
                    message.id
                );
                return; // 不添加到聊天记录
            }
        }

        var chats = _getData(DATA_KEYS.CHATS, {});
        if (!chats[userId]) {
            chats[userId] = [];
        }

        // 检查消息是否已存在（根据ID去重）
        // 如果ID重复，根据消息类型决定是覆盖更新还是跳过
        if (message.id) {
            var existingIndex = chats[userId].findIndex(function (msg) {
                return msg.id === message.id;
            });
            if (existingIndex !== -1) {
                var existingMessage = chats[userId][existingIndex];
                // 如果是历史消息且已经处理过，直接跳过，避免重复添加
                if (message.isHistorical && existingMessage._processed) {
                    console.info(
                        "[小馨手机][微信数据] 历史消息已处理过，跳过重复添加:",
                        message.id,
                        "userId:",
                        userId
                    );
                    return;
                }
                // 重生成/编辑：用新内容覆盖旧消息，保持同一个ID，确保最新内容展示
                // ⚠️ 重要：保留原有的 isHistorical 标记，避免历史消息标记丢失
                // ⚠️ 重要：保留原有的 _processed 标记和 image/content 字段，避免图片消息重复生成
                var existingIsHistorical = chats[userId][existingIndex].isHistorical;
                var existingProcessed = chats[userId][existingIndex]._processed;
                var existingImage = chats[userId][existingIndex].image;
                var existingContent = chats[userId][existingIndex].content;

                chats[userId][existingIndex] = Object.assign(
                    {},
                    chats[userId][existingIndex],
                    message
                );

                // 如果原有消息是历史消息，确保标记不被覆盖
                if (existingIsHistorical === true || existingIsHistorical === "true" ||
                    String(existingIsHistorical).toLowerCase() === "true") {
                    chats[userId][existingIndex].isHistorical = existingIsHistorical;
                }

                // ⚠️ 重要：如果原有消息已处理（_processed = true）且有图片URL，且新消息没有 _processed 标记或图片URL，保留原有的标记和URL
                // 这样可以避免消息监听器处理消息时覆盖掉已生成的图片URL
                if (existingProcessed === true) {
                    // 检查原有消息是否有有效的图片URL
                    var hasExistingImageUrl = false;
                    if (existingImage && typeof existingImage === "string") {
                        var existingImageStr = existingImage.trim();
                        hasExistingImageUrl =
                            existingImageStr.startsWith("http://") ||
                            existingImageStr.startsWith("https://") ||
                            existingImageStr.startsWith("/") ||
                            existingImageStr.toLowerCase().startsWith("local:") ||
                            existingImageStr.startsWith("data:image") ||
                            /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(existingImageStr);
                    }

                    // 如果原有消息有有效的图片URL，且新消息没有 _processed 标记或没有有效的图片URL，保留原有的标记和URL
                    // 检查新消息是否有有效的图片URL
                    var hasNewImageUrl = false;
                    if (message.image && typeof message.image === "string") {
                        var newImageStr = message.image.trim();
                        hasNewImageUrl =
                            newImageStr.startsWith("http://") ||
                            newImageStr.startsWith("https://") ||
                            newImageStr.startsWith("/") ||
                            newImageStr.toLowerCase().startsWith("local:") ||
                            newImageStr.startsWith("data:image") ||
                            /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(newImageStr);
                    }

                    if (hasExistingImageUrl && (!message._processed || !hasNewImageUrl)) {
                        chats[userId][existingIndex]._processed = true;
                        if (existingImage) {
                            chats[userId][existingIndex].image = existingImage;
                        }
                        if (existingContent && hasExistingImageUrl) {
                            chats[userId][existingIndex].content = existingContent;
                        }
                        console.info(
                            "[小馨手机][微信数据] 保留原有消息的 _processed 标记和图片URL:",
                            message.id,
                            "userId:",
                            userId
                        );
                    }
                }
                _setData(DATA_KEYS.CHATS, chats);
                console.info(
                    "[小馨手机][微信数据] 复用已有消息ID，覆盖更新消息内容:",
                    message.id,
                    "userId:",
                    userId
                );
                return;
            }
        } else {
            // ⚠️ 重要：如果没有ID，先检查是否已有已处理且有图片URL的消息（可能是图片生成后消息监听器再次处理）
            // 如果找到，复用那个消息的ID，避免生成新ID导致重复消息
            if (message.type === "image" && message.image) {
                var existingProcessedMessage = chats[userId].find(function (msg) {
                    // 检查是否是已处理的图片消息，且图片URL匹配
                    if (msg.type === "image" && msg._processed === true && msg.image) {
                        var msgImageStr = String(msg.image || "").trim();
                        var messageImageStr = String(message.image || "").trim();
                        // 如果图片URL相同或相似（去掉查询参数后比较），认为是同一条消息
                        var msgImageBase = msgImageStr.split("?")[0].split("#")[0];
                        var messageImageBase = messageImageStr.split("?")[0].split("#")[0];
                        if (msgImageBase === messageImageBase && msgImageBase) {
                            return true;
                        }
                    }
                    return false;
                });

                if (existingProcessedMessage && existingProcessedMessage.id) {
                    // 找到已处理的图片消息，复用ID并跳过添加，避免重复消息
                    console.info(
                        "[小馨手机][微信数据] 消息没有ID，但找到已处理的图片消息，跳过重复添加:",
                        existingProcessedMessage.id,
                        "userId:",
                        userId,
                        "图片URL:",
                        message.image.substring(0, 50) + "..."
                    );
                    return;
                }
            }

            // 如果没有找到已处理的消息，自动生成一个
            message.id =
                "wxid-" +
                Date.now() +
                "-" +
                Math.random().toString(36).substr(2, 9);
            console.info(
                "[小馨手机][微信数据] 消息没有ID，自动生成:",
                message.id,
                "userId:",
                userId
            );
        }

        // 添加时间戳（只有在消息完全没有时间戳时才使用现实时间）
        // 注意：不应该覆盖已有的 timestamp，即使它是 null 或 0
        // 因为消息可能使用世界观时间，timestamp 可能很小（如 2018 年的时间戳）
        if (message.timestamp === undefined || message.timestamp === null) {
            // 如果有 rawTime，尝试解析它
            if (message.rawTime) {
                try {
                    var timeStr = String(message.rawTime).trim();
                    var normalizedTimeStr = timeStr
                        .replace(/-/g, "/")
                        .replace(/年/g, "/")
                        .replace(/月/g, "/")
                        .replace(/日/g, " ")
                        .replace(/星期[一二三四五六日]/g, "")
                        .trim()
                        .replace(/\s+/g, " ");
                    var parsed = Date.parse(normalizedTimeStr);
                    if (!isNaN(parsed)) {
                        message.timestamp = parsed;
                        console.info(
                            "[小馨手机][微信数据] 从rawTime解析时间戳:",
                            timeStr,
                            "->",
                            message.timestamp
                        );
                    } else {
                        // 解析失败，使用世界观时间
                        if (
                            window.XiaoxinWorldClock &&
                            window.XiaoxinWorldClock.currentTimestamp
                        ) {
                            message.timestamp =
                                window.XiaoxinWorldClock.currentTimestamp;
                            console.info(
                                "[小馨手机][微信数据] rawTime解析失败，使用世界观时间:",
                                message.timestamp
                            );
                        } else {
                            message.timestamp = Date.now();
                            console.warn(
                                "[小馨手机][微信数据] 无法获取世界观时间，使用现实时间（不推荐）:",
                                message.id
                            );
                        }
                    }
                } catch (e) {
                    console.warn(
                        "[小馨手机][微信数据] 解析rawTime失败:",
                        e,
                        message.id
                    );
                    // 解析出错，使用世界观时间
                    if (
                        window.XiaoxinWorldClock &&
                        window.XiaoxinWorldClock.currentTimestamp
                    ) {
                        message.timestamp =
                            window.XiaoxinWorldClock.currentTimestamp;
                    } else {
                        message.timestamp = Date.now();
                    }
                }
            } else {
                // 没有 rawTime，使用世界观时间
                if (
                    window.XiaoxinWorldClock &&
                    window.XiaoxinWorldClock.currentTimestamp
                ) {
                    message.timestamp =
                        window.XiaoxinWorldClock.currentTimestamp;
                    console.info(
                        "[小馨手机][微信数据] 没有rawTime，使用世界观时间:",
                        message.timestamp
                    );
                } else {
                    message.timestamp = Date.now();
                    console.warn(
                        "[小馨手机][微信数据] 无法获取世界观时间，使用现实时间（不推荐）:",
                        message.id
                    );
                }
            }
        }

        chats[userId].push(message);
        _setData(DATA_KEYS.CHATS, chats);

        // 如果这是转账消息且接收者是玩家，更新零钱余额
        if (
            message.type === "transfer" &&
            message.to === "player" &&
            message.amount
        ) {
            try {
                var transferAmount = parseFloat(message.amount);
                if (!isNaN(transferAmount) && transferAmount > 0) {
                    // 更新零钱余额（通过内部函数直接调用）
                    var walletData = _getData(DATA_KEYS.WALLET, {
                        balance: 0,
                        lctBalance: 0,
                        lctInterest: 0,
                        cards: [],
                        transactions: [],
                    });
                    walletData.balance =
                        (walletData.balance || 0) + transferAmount;
                    _setData(DATA_KEYS.WALLET, walletData);

                    // 添加交易记录
                    var timeStr = "";
                    if (message.rawTime) {
                        timeStr = message.rawTime;
                    } else if (message.timestamp) {
                        var transferDate = new Date(message.timestamp);
                        var year = transferDate.getFullYear();
                        var month = String(
                            transferDate.getMonth() + 1
                        ).padStart(2, "0");
                        var day = String(transferDate.getDate()).padStart(
                            2,
                            "0"
                        );
                        var hours = String(transferDate.getHours()).padStart(
                            2,
                            "0"
                        );
                        var minutes = String(
                            transferDate.getMinutes()
                        ).padStart(2, "0");
                        var seconds = String(
                            transferDate.getSeconds()
                        ).padStart(2, "0");
                        timeStr =
                            year +
                            "-" +
                            month +
                            "-" +
                            day +
                            " " +
                            hours +
                            ":" +
                            minutes +
                            ":" +
                            seconds;
                    } else {
                        timeStr = new Date().toLocaleString("zh-CN");
                    }
                    // 获取发送者名称
                    var senderName = "未知";
                    if (message.from || message.sender) {
                        var allContacts = getContacts() || [];
                        var senderId = String(
                            message.from || message.sender || ""
                        ).trim();
                        var senderContact = allContacts.find(function (c) {
                            var cWechatId = String(c.wechatId || "").trim();
                            var cWechatId2 = String(c.wechat_id || "").trim();
                            var cId = String(c.id || "").trim();
                            var cCharId = String(c.characterId || "").trim();
                            var cIdWithoutPrefix = cId.replace(/^contact_/, "");
                            var senderIdWithoutPrefix = senderId.replace(
                                /^contact_/,
                                ""
                            );
                            return (
                                cWechatId === senderId ||
                                cWechatId2 === senderId ||
                                cId === senderId ||
                                cId === "contact_" + senderId ||
                                senderId === "contact_" + cId ||
                                cCharId === senderId ||
                                cIdWithoutPrefix === senderIdWithoutPrefix ||
                                senderIdWithoutPrefix === cIdWithoutPrefix
                            );
                        });
                        if (senderContact) {
                            senderName =
                                senderContact.remark ||
                                senderContact.nickname ||
                                senderContact.name ||
                                "未知";
                        } else if (message.senderName) {
                            senderName = message.senderName;
                        }
                    }
                    // 添加交易记录
                    if (!walletData.transactions) {
                        walletData.transactions = [];
                    }
                    walletData.transactions.unshift({
                        title: "微信转账 - " + senderName,
                        amount: transferAmount,
                        time: timeStr,
                        icon: "money-bill-transfer",
                    });
                    // 限制最多保存100条记录
                    if (walletData.transactions.length > 100) {
                        walletData.transactions = walletData.transactions.slice(
                            0,
                            100
                        );
                    }
                    _setData(DATA_KEYS.WALLET, walletData);

                    console.info(
                        "[小馨手机][微信数据] 已更新零钱余额（收到转账），增加金额:",
                        transferAmount,
                        "发送者:",
                        senderName
                    );
                }
            } catch (e) {
                console.warn("[小馨手机][微信数据] 处理转账消息时出错:", e);
            }
        }

        // 如果这是 redpacket_claim 类型的消息，自动更新对应的原始红包消息状态
        if (message.type === "redpacket_claim" && message.redpacket_id) {
            var redpacketId = message.redpacket_id;
            var claimedBy = message.claimed_by || message.to || "player";
            var claimTime = message.timestamp || message.time || Date.now();

            // 如果 claimed_by 是 "player" 字符串，获取玩家的实际ID
            // 优先使用账号的 id 字段（微信注册时保存的微信ID）
            if (claimedBy === "player" || claimedBy === "0") {
                // 获取当前玩家信息
                var currentAccount = null;
                if (window.XiaoxinWeChatAccount) {
                    currentAccount =
                        window.XiaoxinWeChatAccount.getCurrentAccount();
                }
                if (currentAccount) {
                    claimedBy = String(
                        currentAccount.id || currentAccount.wechatId || "player"
                    ).trim();
                    console.info(
                        "[小馨手机][微信数据] redpacket_claim 消息中 claimed_by 是 'player'，转换为实际ID:",
                        claimedBy
                    );
                }
            }

            // 在所有聊天中查找对应的红包消息
            Object.keys(chats).forEach(function (chatUserId) {
                var chatMessages = chats[chatUserId] || [];
                chatMessages.forEach(function (msg) {
                    // 匹配红包ID
                    var msgRedpacketId =
                        msg.redpacket_id ||
                        (msg.payload && msg.payload.redpacket_id) ||
                        msg.id;

                    if (
                        msgRedpacketId === redpacketId &&
                        msg.type === "redpacket"
                    ) {
                        // 更新红包消息状态
                        msg.claimed = true;
                        msg.status = "claimed";
                        msg.claimed_by = claimedBy;
                        msg.claimed_time = claimTime;
                        if (message.claim_amount !== undefined) {
                            msg.claim_amount = message.claim_amount;
                        }
                        if (message.claimerName) {
                            msg.claimerName = message.claimerName;
                        }

                        console.info(
                            "[小馨手机][微信数据] 根据 redpacket_claim 消息自动更新红包状态:",
                            "redpacket_id:",
                            redpacketId,
                            "claimed_by:",
                            claimedBy,
                            "chatUserId:",
                            chatUserId
                        );
                    }
                });
            });

            // 保存更新后的数据
            _setData(DATA_KEYS.CHATS, chats);
        }

        // 注意：角色消息的未读数不再在这里增加
        // 未读数应该在消息通过队列显示完成时增加（在 message-queue.js 中处理）
        // 这样可以确保未读数与消息显示状态同步

        console.info("[小馨手机][微信数据] 添加聊天消息:", userId, message);
    }

    // 更新已存在的聊天消息（用于更新图片URL等）
    function updateChatMessage(userId, messageId, updates) {
        var chats = _getData(DATA_KEYS.CHATS, {});
        if (!chats[userId]) return false;

        var updated = false;
        chats[userId] = chats[userId].map(function (msg) {
            if (msg.id === messageId) {
                // 保存原始时间戳和原始时间字符串（防止被覆盖）
                var originalTimestamp = msg.timestamp;
                var originalRawTime = msg.rawTime;

                // ⚠️ 重要：保存原有的 _processed 标记和 image/content 字段，避免图片消息重复生成
                var existingProcessed = msg._processed;
                var existingImage = msg.image;
                var existingContent = msg.content;

                // 合并更新
                Object.assign(msg, updates);

                // 确保时间戳和原始时间字符串不会被覆盖（除非明确传递）
                // 如果 updates 中没有 timestamp 或 rawTime，恢复原始值
                if (!updates.hasOwnProperty("timestamp")) {
                    msg.timestamp = originalTimestamp;
                }
                if (!updates.hasOwnProperty("rawTime")) {
                    msg.rawTime = originalRawTime;
                }

                // ⚠️ 重要：如果原有消息已处理（_processed = true）且有图片URL，无论新更新如何，都应该保留原有的标记和URL
                // 这样可以避免消息监听器处理消息时覆盖掉已生成的图片URL，导致重复生成图片
                // ⚠️ 关键修复：即使新更新设置了 _processed=true 和图片URL，只要原有消息已处理且有图片URL，就保留原有的
                // 除非新更新的图片URL和原有的完全相同（去掉查询参数后比较），才允许更新
                if (existingProcessed === true) {
                    // 检查原有消息是否有有效的图片URL
                    var hasExistingImageUrl = false;
                    var existingImageBase = "";
                    if (existingImage && typeof existingImage === "string") {
                        var existingImageStr = existingImage.trim();
                        hasExistingImageUrl =
                            existingImageStr.startsWith("http://") ||
                            existingImageStr.startsWith("https://") ||
                            existingImageStr.startsWith("/") ||
                            existingImageStr.toLowerCase().startsWith("local:") ||
                            existingImageStr.startsWith("data:image") ||
                            /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(existingImageStr);
                        if (hasExistingImageUrl) {
                            // 去掉查询参数和锚点，用于比较
                            existingImageBase = existingImageStr.split("?")[0].split("#")[0];
                        }
                    }

                    // 如果原有消息有有效的图片URL，检查新更新的图片URL是否和原有的相同
                    if (hasExistingImageUrl && existingImageBase) {
                        var newImageBase = "";
                        var hasNewImageUrl = false;
                        if (updates.image && typeof updates.image === "string") {
                            var newImageStr = updates.image.trim();
                            hasNewImageUrl =
                                newImageStr.startsWith("http://") ||
                                newImageStr.startsWith("https://") ||
                                newImageStr.startsWith("/") ||
                                newImageStr.toLowerCase().startsWith("local:") ||
                                newImageStr.startsWith("data:image") ||
                                /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(newImageStr);
                            if (hasNewImageUrl) {
                                // 去掉查询参数和锚点，用于比较
                                newImageBase = newImageStr.split("?")[0].split("#")[0];
                            }
                        }

                        // ⚠️ 关键修复：只有当新更新的图片URL和原有的完全相同（去掉查询参数后）时，才允许更新
                        // 否则，无论新更新如何，都保留原有的图片URL
                        if (newImageBase && newImageBase === existingImageBase) {
                            // 新更新的图片URL和原有的相同，允许更新（可能是添加了查询参数等）
                            console.info(
                                "[小馨手机][微信数据] 新更新的图片URL和原有的相同，允许更新:",
                                messageId,
                                "userId:",
                                userId,
                                "图片URL:",
                                newImageBase.substring(0, 50) + "..."
                            );
                        } else {
                            // 新更新的图片URL和原有的不同，保留原有的
                            msg._processed = true;
                            if (existingImage) {
                                msg.image = existingImage;
                            }
                            if (existingContent && hasExistingImageUrl) {
                                msg.content = existingContent;
                            }
                            console.info(
                                "[小馨手机][微信数据] 更新聊天消息时保留原有消息的 _processed 标记和图片URL（新更新的图片URL不同）:",
                                messageId,
                                "userId:",
                                userId,
                                "原有图片URL:",
                                existingImageBase.substring(0, 50) + "...",
                                "新图片URL:",
                                newImageBase ? newImageBase.substring(0, 50) + "..." : "(无)"
                            );
                        }
                    } else if (hasExistingImageUrl) {
                        // 原有消息有图片URL但格式可能有问题，仍然保留
                        msg._processed = true;
                        if (existingImage) {
                            msg.image = existingImage;
                        }
                        if (existingContent && hasExistingImageUrl) {
                            msg.content = existingContent;
                        }
                        console.info(
                            "[小馨手机][微信数据] 更新聊天消息时保留原有消息的 _processed 标记和图片URL:",
                            messageId,
                            "userId:",
                            userId
                        );
                    }
                }

                updated = true;
                console.info(
                    "[小馨手机][微信数据] 更新聊天消息:",
                    userId,
                    messageId,
                    "更新内容:",
                    updates,
                    "保留时间戳:",
                    msg.timestamp,
                    "保留原始时间:",
                    msg.rawTime
                );
            }
            return msg;
        });

        if (updated) {
            _setData(DATA_KEYS.CHATS, chats);
            return true;
        }
        return false;
    }

    // 标记指定语音消息为已读（用于语音未读红点和主页预览颜色）
    function markVoiceMessageRead(userId, messageId) {
        var chats = _getData(DATA_KEYS.CHATS, {});
        if (!chats[userId]) return;

        var updated = false;
        chats[userId] = chats[userId].map(function (msg) {
            if (msg.id === messageId && msg.type === "voice") {
                if (msg.voice_read !== true) {
                    msg.voice_read = true;
                    updated = true;
                }
            }
            return msg;
        });

        if (updated) {
            _setData(DATA_KEYS.CHATS, chats);
            console.info(
                "[小馨手机][微信数据] 标记语音消息为已读:",
                userId,
                messageId
            );
        }
    }

    function clearChatHistory(userId) {
        var chats = _getData(DATA_KEYS.CHATS, {});
        if (chats[userId]) {
            delete chats[userId];
            _setData(DATA_KEYS.CHATS, chats);
        }
    }

    function getAllChats() {
        return _getData(DATA_KEYS.CHATS, {});
    }

    // ========== 联系人管理 ==========
    function getContacts() {
        return _getData(DATA_KEYS.CONTACTS, []);
    }

    function addContact(contact) {
        var contacts = getContacts();

        // 兼容：有些模型/渲染会把 URL 里的 & 转义成 &amp;，导致资料卡背景图/头像请求失败
        function sanitizeUrl(raw) {
            if (!raw) return raw;
            try {
                // 解码 HTML 实体
                var temp = document.createElement("div");
                temp.innerHTML = String(raw);
                var decoded = temp.textContent || temp.innerText || String(raw);
                // 清理常见包裹
                decoded = decoded
                    .replace(/^url\((['"]?)(.+?)\1\)$/i, "$2")
                    .trim();
                return decoded;
            } catch (e) {
                return String(raw).replace(/&amp;/g, "&").trim();
            }
        }

        if (contact) {
            if (contact.avatar) contact.avatar = sanitizeUrl(contact.avatar);
            if (contact.momentsBackground)
                contact.momentsBackground = sanitizeUrl(
                    contact.momentsBackground
                );
        }

        // 确保好友状态字段存在
        if (contact.isFriend !== true && contact.isFriend !== false) {
            contact.isFriend = false;
        }
        if (!contact.friendStatus) {
            contact.friendStatus = contact.isFriend ? "friend" : "pending";
        }

        // 检查是否已存在（根据ID）
        var existingIndex = -1;
        for (var i = 0; i < contacts.length; i++) {
            if (contacts[i].id === contact.id) {
                existingIndex = i;
                break;
            }
        }

        if (existingIndex === -1) {
            // 添加新联系人
            contacts.push(contact);
            _setData(DATA_KEYS.CONTACTS, contacts);
            console.info(
                "[小馨手机][微信数据] 添加联系人:",
                contact,
                "好友状态:",
                contact.friendStatus
            );
        } else {
            // 更新联系人信息
            var old = contacts[existingIndex];
            var merged = Object.assign({}, old, contact);
            // 再次清洗，保证旧数据里带 &amp; 的 URL 也能被修复
            if (merged.avatar) merged.avatar = sanitizeUrl(merged.avatar);
            if (merged.momentsBackground)
                merged.momentsBackground = sanitizeUrl(merged.momentsBackground);

            // 如果旧数据已经是好友，或者新数据显式设置为好友，保持好友状态
            if (old.isFriend === true || contact.isFriend === true) {
                merged.isFriend = true;
                merged.friendStatus = "friend";
            } else if (contact.isFriend === false) {
                // 如果新数据显式设置为非好友，更新状态
                merged.isFriend = false;
                merged.friendStatus = contact.friendStatus || "pending";
            } else {
                // 否则保留旧状态
                merged.isFriend = old.isFriend || false;
                merged.friendStatus = old.friendStatus || "pending";
            }

            contacts[existingIndex] = merged;
            _setData(DATA_KEYS.CONTACTS, contacts);
            console.info(
                "[小馨手机][微信数据] 更新联系人:",
                merged,
                "好友状态:",
                merged.friendStatus
            );
        }
    }

    function removeContact(contactId) {
        var contacts = getContacts();
        contacts = contacts.filter(function (c) {
            return c.id !== contactId;
        });
        _setData(DATA_KEYS.CONTACTS, contacts);
        console.info("[小馨手机][微信数据] 删除联系人:", contactId);
    }

    function getContact(contactId) {
        var contacts = getContacts();
        for (var i = 0; i < contacts.length; i++) {
            if (contacts[i].id === contactId) {
                return contacts[i];
            }
        }
        return null;
    }

    // ========== 未读消息管理 ==========
    function getUnreadCount(userId) {
        var unread = _getData(DATA_KEYS.UNREAD, {});
        return unread[userId] || 0;
    }

    function setUnreadCount(userId, count) {
        var unread = _getData(DATA_KEYS.UNREAD, {});
        unread[userId] = count;
        _setData(DATA_KEYS.UNREAD, unread);
    }

    function incrementUnreadCount(userId) {
        var count = getUnreadCount(userId);
        setUnreadCount(userId, count + 1);
        // 触发全局红点更新事件
        try {
            if (typeof window.CustomEvent !== "undefined") {
                var badgeEvent = new CustomEvent(
                    "xiaoxin-unread-count-updated"
                );
                window.dispatchEvent(badgeEvent);
            }
        } catch (e) {
            console.warn("[小馨手机][微信数据] 触发红点更新事件失败:", e);
        }
    }

    function clearUnreadCount(userId) {
        var unread = _getData(DATA_KEYS.UNREAD, {});
        if (unread[userId]) {
            delete unread[userId];
            _setData(DATA_KEYS.UNREAD, unread);
        }
    }

    // ========== 朋友圈管理 ==========
    function getMoments() {
        return _getData(DATA_KEYS.MOMENTS, []);
    }

    // 获取朋友圈未读数量（类似微信私聊的未读数）
    function getMomentsUnreadCount() {
        return _getData(DATA_KEYS.MOMENTS_UNREAD, 0) || 0;
    }

    // 设置朋友圈未读数量
    function setMomentsUnreadCount(count) {
        if (count < 0) count = 0;
        _setData(DATA_KEYS.MOMENTS_UNREAD, count);
    }

    // 获取最近一次查看朋友圈列表的时间戳（基于账号隔离）
    function getMomentsLastSeen() {
        return _getData(DATA_KEYS.MOMENTS_LAST_SEEN, 0);
    }

    // 更新最近一次查看朋友圈列表的时间戳（通常在进入朋友圈主页面时调用）
    function setMomentsLastSeen(timestamp) {
        if (!timestamp) {
            timestamp = Date.now();
        }
        _setData(DATA_KEYS.MOMENTS_LAST_SEEN, timestamp);
    }

    // 获取玩家历史朋友圈“一次性锁”状态（供外部判断是否已生成）
    function getPlayerHistoryLockState() {
        return _getData(DATA_KEYS.PLAYER_HISTORY_LOCK, {
            generated: false,
            importUntil: 0,
        });
    }

    // 归一化作者ID（兼容 contact_ 前缀）
    function _normalizeAuthorId(rawId) {
        if (!rawId) return "";
        return String(rawId).trim().replace(/^contact_/, "");
    }

    // 生成唯一的朋友圈ID
    function generateUniqueMomentId(existingIds) {
        existingIds = existingIds || {};
        var maxAttempts = 100; // 最多尝试100次
        var attempt = 0;
        var newId;

        do {
            // 生成8位随机字符（符合世界书规则：moment- + 8位随机字符）
            var chars =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            var randomPart = "";
            for (var i = 0; i < 8; i++) {
                randomPart += chars.charAt(
                    Math.floor(Math.random() * chars.length)
                );
            }
            newId = "moment-" + randomPart;
            attempt++;
        } while (existingIds[newId] && attempt < maxAttempts);

        if (attempt >= maxAttempts) {
            // 如果100次都重复，使用时间戳+随机数作为后备方案
            newId =
                "moment_" +
                Date.now() +
                "_" +
                Math.random().toString(36).substr(2, 9);
        }

        return newId;
    }

    function addMoment(moment) {
        var moments = getMoments();

        // ========== 玩家身份保护：只允许一次性的"历史朋友圈"导入，禁止实时朋友圈 ==========
        // 约定：玩家朋友圈 authorId/author/userId 可能为 "user"（推荐）或 "player"（兼容旧格式）
        var authorKey = _normalizeAuthorId(
            moment.authorId || moment.userId || moment.author || ""
        );
        var authorKeyLower = String(authorKey).toLowerCase();
        // 仅当作者显式为"user"或"player"时，才视为玩家朋友圈（不再用账户ID匹配，避免角色ID=玩家ID导致不计未读）
        var isPlayerMoment = authorKeyLower === "user" || authorKeyLower === "player";
        if (isPlayerMoment) {
            // 先确保时间戳已设置（如果没有，会在后面设置）
            var momentTimestamp = moment.timestamp || Date.now();
            var now = Date.now();

            // 判断是否是历史朋友圈：
            // 1. 有时间戳标签（_explicitTimestampTag === true）
            // 2. 且时间戳明显早于当前时间（早于1小时，即3600000毫秒）
            // 只有同时满足这两个条件，才视为历史朋友圈并受锁限制
            var timeDiff = now - momentTimestamp;
            var isHistoricalMoment = moment._explicitTimestampTag === true && timeDiff > 3600000; // 1小时 = 3600000毫秒

            if (!isHistoricalMoment) {
                // 实时朋友圈：没有时间戳标签，或时间戳接近当前时间（1小时内）
                console.info(
                    "[小馨手机][微信数据] 检测到玩家实时朋友圈，允许添加:",
                    {
                        id: moment.id,
                        type: moment.type,
                        content: (moment.content || "").substring(0, 50) + "...",
                        hasTimestampTag: moment._explicitTimestampTag === true,
                        timestamp: momentTimestamp ? new Date(momentTimestamp).toLocaleString() : "无",
                        timeDiff: timeDiff > 0 ? (timeDiff / 1000 / 60).toFixed(1) + "分钟前" : "未来时间"
                    }
                );
                // 实时朋友圈不受历史朋友圈锁限制，直接允许
            } else {
                // 历史朋友圈：有时间戳标签且时间明显早于当前时间（1小时以上）
                // ⚠️ 重要：只有自动生成的历史朋友圈才受锁限制，玩家主动发布的应该允许
                // 检查是否是自动生成的（通过 _autoGenerated 标记判断）
                var isAutoGenerated = moment._autoGenerated === true;

                if (isAutoGenerated) {
                    // 自动生成的历史朋友圈：受"只允许一次"的锁限制
                    console.info(
                        "[小馨手机][微信数据] 检测到玩家自动生成的历史朋友圈（时间早于当前1小时以上），应用锁限制:",
                        {
                            id: moment.id,
                            type: moment.type,
                            content: (moment.content || "").substring(0, 50) + "...",
                            timestamp: new Date(momentTimestamp).toLocaleString(),
                            timeDiff: (timeDiff / 1000 / 60 / 60).toFixed(1) + "小时前"
                        }
                    );
                    // “只允许生成一次”的持久化锁：一旦玩家历史朋友圈已经生成过，则后续一律拒绝
                    // 但要允许同一轮/短时间内批量导入多条历史朋友圈，因此使用一个短暂的 import 窗口
                    var lockState = _getData(DATA_KEYS.PLAYER_HISTORY_LOCK, {
                        generated: false,
                        importUntil: 0,
                    });
                    if (lockState && lockState.generated === true) {
                        // 如果仍处于导入窗口内，允许继续写入同一批历史朋友圈
                        if (!(lockState.importUntil && now <= lockState.importUntil)) {
                            console.warn(
                                "[小馨手机][微信数据] 拒绝重复生成玩家历史朋友圈（只允许一次）:",
                                {
                                    id: moment.id,
                                    type: moment.type,
                                    content:
                                        (moment.content || "").substring(0, 50) + "...",
                                }
                            );
                            return;
                        }
                    } else {
                        // 首次进入：开启 3 秒导入窗口，允许同一批次导入多条历史朋友圈
                        _setData(DATA_KEYS.PLAYER_HISTORY_LOCK, {
                            generated: true,
                            importUntil: now + 3000,
                        });
                    }
                } else {
                    // 玩家主动发布的历史朋友圈：允许添加，不受锁限制
                    console.info(
                        "[小馨手机][微信数据] 检测到玩家主动发布的历史朋友圈（时间早于当前1小时以上），允许添加:",
                        {
                            id: moment.id,
                            type: moment.type,
                            content: (moment.content || "").substring(0, 50) + "...",
                            timestamp: new Date(momentTimestamp).toLocaleString(),
                            timeDiff: (timeDiff / 1000 / 60 / 60).toFixed(1) + "小时前",
                            note: "玩家主动发布，不受历史朋友圈锁限制"
                        }
                    );
                    // 玩家主动发布的朋友圈不受锁限制，直接允许
                }
            }
        }

        // 添加时间戳（朋友圈在世界观中的发生时间）
        if (!moment.timestamp) {
            moment.timestamp = Date.now();
        }

        // 记录“写入微信数据仓库”的实际时间，用于未读红点判断
        // 注意：历史朋友圈的 timestamp 可能早于当前时间很多年，但只要是“刚刚生成/导入”的，也应该触发红点
        if (!moment.addedAt) {
            moment.addedAt = Date.now();
        }

        // 构建已存在的ID映射（包括所有历史朋友圈ID）
        var existingIds = {};
        moments.forEach(function (m) {
            if (m && m.id) {
                existingIds[m.id] = true;
            }
            if (m && m._id) {
                existingIds[m._id] = true;
            }
        });

        // 添加ID（如果没有）
        if (!moment.id) {
            moment.id = generateUniqueMomentId(existingIds);
            console.info(
                "[小馨手机][微信数据] 朋友圈没有ID，自动生成新ID:",
                moment.id,
                "authorId:",
                moment.authorId || moment.userId || moment.author
            );
        } else {
            // 如果收到的朋友圈 ID 已存在，则直接跳过，避免重复渲染
            if (existingIds[moment.id]) {
                console.warn(
                    "[小馨手机][微信数据] 检测到重复的朋友圈ID，跳过添加:",
                    moment.id,
                    "authorId:",
                    moment.authorId || moment.userId || moment.author
                );
                return;
            }
        }

        // 检查是否已存在相同作者、相同内容的朋友圈（避免重复生成历史朋友圈）
        // 只检查内容相似度，如果内容、作者、类型都相同，且时间戳接近（1小时内），则认为是重复
        var isDuplicateContent = false;
        if (moment.content && moment.authorId) {
            var contentHash = String(moment.content).trim().substring(0, 100); // 取前100字符作为内容标识
            var duplicateMoment = moments.find(function (m) {
                if (!m || !m.authorId || !m.content) return false;
                var mAuthorId = String(m.authorId).trim();
                var momentAuthorId = String(moment.authorId).trim();
                if (mAuthorId !== momentAuthorId) return false;

                var mContentHash = String(m.content).trim().substring(0, 100);
                if (mContentHash !== contentHash) return false;

                // 如果类型也相同，且时间戳接近（1小时内），则认为是重复
                if (m.type === moment.type) {
                    var timeDiff = Math.abs(
                        (m.timestamp || 0) - (moment.timestamp || 0)
                    );
                    if (timeDiff < 3600000) {
                        // 1小时 = 3600000毫秒
                        return true;
                    }
                }
                return false;
            });

            if (duplicateMoment) {
                isDuplicateContent = true;
                console.warn(
                    "[小馨手机][微信数据] 检测到重复的朋友圈内容（相同作者、相似内容、相同类型），跳过添加:",
                    {
                        原朋友圈ID: duplicateMoment.id,
                        新朋友圈ID: moment.id,
                        authorId:
                            moment.authorId || moment.userId || moment.author,
                        content:
                            (moment.content || "").substring(0, 50) + "...",
                    }
                );
            }
        }

        // 如果检测到重复内容，跳过添加
        if (isDuplicateContent) {
            return;
        }

        // 再次检查ID是否重复（防止在生成新ID后又有冲突，极小概率）
        var existingIndex = moments.findIndex(function (m) {
            return m.id === moment.id || m._id === moment.id;
        });

        if (existingIndex !== -1) {
            console.warn(
                "[小馨手机][微信数据] 检测到朋友圈ID冲突，跳过添加:",
                moment.id
            );
            return;
        }

        // 确保 likes 和 comments 字段存在（如果不存在则初始化为空数组）
        if (!Array.isArray(moment.likes)) {
            moment.likes = moment.likes || [];
        }
        if (!Array.isArray(moment.comments)) {
            moment.comments = moment.comments || [];
        }

        moments.unshift(moment); // 最新的在前面
        _setData(DATA_KEYS.MOMENTS, moments);

        console.info("[小馨手机][微信数据] 添加朋友圈动态:", {
            id: moment.id,
            authorId: moment.authorId || moment.userId || moment.author,
            type: moment.type,
            content: (moment.content || "").substring(0, 30) + "...",
            timestamp: moment.timestamp,
            totalMomentsCount: moments.length,
        });

        // 增加朋友圈未读数量（仅统计“角色”的朋友圈，不包含玩家自己）
        if (!isPlayerMoment) {
            try {
                var currentUnread = getMomentsUnreadCount();
                setMomentsUnreadCount(currentUnread + 1);
            } catch (e) {
                console.warn(
                    "[小馨手机][微信数据] 更新朋友圈未读数量失败:",
                    e
                );
            }
        }

        // 触发朋友圈更新事件（用于红点提醒等UI）
        try {
            if (typeof window.CustomEvent !== "undefined") {
                var event = new CustomEvent("xiaoxin-moments-updated", {
                    detail: {
                        latestTimestamp: moment.timestamp,
                        addedAt: moment.addedAt,
                    },
                });
                window.dispatchEvent(event);
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信数据] 触发朋友圈更新事件失败:",
                e
            );
        }
    }

    function removeMoment(momentId) {
        var moments = getMoments();
        moments = moments.filter(function (m) {
            return m.id !== momentId;
        });
        _setData(DATA_KEYS.MOMENTS, moments);
    }

    function updateMoment(momentId, updates) {
        var moments = getMoments();
        var momentIndex = moments.findIndex(function (m) {
            return m.id === momentId;
        });
        if (momentIndex !== -1) {
            // 更新朋友圈数据
            var targetMoment = moments[momentIndex];
            Object.assign(targetMoment, updates);

            // 确保 likes 和 comments 字段存在且是数组
            if (!Array.isArray(targetMoment.likes)) {
                targetMoment.likes = targetMoment.likes || [];
            }
            if (!Array.isArray(targetMoment.comments)) {
                targetMoment.comments = targetMoment.comments || [];
            }

            _setData(DATA_KEYS.MOMENTS, moments);
            console.info(
                "[小馨手机][微信数据] 更新朋友圈动态:",
                momentId,
                "点赞数:",
                (targetMoment.likes && targetMoment.likes.length) || 0,
                "评论数:",
                (targetMoment.comments && targetMoment.comments.length) || 0
            );
            return true;
        }
        return false;
    }

    // ========== 好友申请记录管理 ==========
    function getFriendRequests() {
        return _getData(DATA_KEYS.FRIEND_REQUESTS, []);
    }

    function _saveFriendRequests(list) {
        _setData(DATA_KEYS.FRIEND_REQUESTS, Array.isArray(list) ? list : []);
    }

    // from: "player" | "role"
    function addFriendRequest(request) {
        var list = getFriendRequests();
        var now = Date.now();

        var extra = request && request.extra ? request.extra : {};

        // ========== 防污染：避免AI把玩家联系方式写进“角色好友申请”字段 ==========
        function _isSameAsPlayerContact(value) {
            try {
                if (!value) return false;
                var v = String(value).trim();
                if (!v) return false;

                var acc = getAccount();
                if (!acc) return false;
                var playerPhone = String(
                    acc.phone || acc.tel || acc.mobile || ""
                ).trim();
                var playerWechatId = String(
                    acc.wechatId || acc.wxid || acc.id || ""
                ).trim();

                return (
                    (playerPhone && v === playerPhone) ||
                    (playerWechatId && v === playerWechatId)
                );
            } catch (e) {
                return false;
            }
        }

        // 生成来源描述
        function deriveSource() {
            var raw =
                (request && request.source) ||
                extra["来源"] ||
                extra["来源方式"] ||
                extra["来源渠道"] ||
                extra["来源描述"] ||
                "";
            if (raw) return String(raw).trim();

            // 推断：有电话号码→手机号搜索；有微信号→微信号搜索；有群聊字段→群聊XXX添加
            if (extra["群聊"] || extra["群名称"] || extra["群聊名称"]) {
                var groupName =
                    extra["群聊"] || extra["群名称"] || extra["群聊名称"];
                return "群聊" + String(groupName).trim() + "添加";
            }
            if (extra["电话号码"] || request.phone || request.phoneNumber) {
                return "手机号搜索";
            }
            if (extra["微信号"] || request.wechatId) {
                return "微信号搜索";
            }
            return "";
        }
        var derivedSource = deriveSource();

        if (
            request &&
            request.direction === "role_to_player" &&
            extra &&
            typeof extra === "object"
        ) {
            if (extra["电话号码"] && _isSameAsPlayerContact(extra["电话号码"])) {
                console.warn(
                    "[小馨手机][微信数据] 检测到角色好友申请误用了玩家手机号，已清空 extra.电话号码:",
                    extra["电话号码"]
                );
                extra["电话号码"] = "";
            }
            if (extra["微信号"] && _isSameAsPlayerContact(extra["微信号"])) {
                console.warn(
                    "[小馨手机][微信数据] 检测到角色好友申请误用了玩家微信号，已清空 extra.微信号:",
                    extra["微信号"]
                );
                extra["微信号"] = "";
            }
        }

        // 尝试从 extra 中兜底读取字段，避免键名不一致或前面解析遗漏
        var fallbackGreeting =
            request.greeting ||
            extra["打招呼内容"] ||
            extra["打招呼内容："] ||
            extra["申请理由"] ||
            "";
        var fallbackRemark =
            request.remark ||
            extra["备注"] ||
            extra["微信备注"] ||
            extra["微信昵称"] ||
            "";

        var normalized = Object.assign(
            {
                id:
                    (request && request.id) ||
                    "fr_" + now + "_" + Math.random().toString(36).substr(2, 8),
                direction: (request && request.direction) || "player_to_role",
                roleId:
                    (request && request.roleId) ||
                    (extra && extra["角色ID"]) ||
                    "",
                greeting: fallbackGreeting,
                remark: fallbackRemark,
                avatar: (request && request.avatar) || "",
                nickname: (request && request.nickname) || "",
                tags: (request && request.tags) || "",
                permissions: (request && request.permissions) || "",
                status: (request && request.status) || "pending", // pending / accepted / expired
                timestamp: (request && request.timestamp) || now,
            source: derivedSource,
                // 用于去重：来源于哪条酒馆消息
                sourceMessageId: (request && request.sourceMessageId) || null,
            },
            request || {}
        );

        // 统一角色ID格式，便于后续去重
        function normalizeRoleId(value) {
            var str = String(value || "").trim();
            if (str.indexOf("contact_") === 0) {
                str = str.replace(/^contact_/, "");
            }
            return str;
        }

        // 如果能在联系人列表中找到对应角色，则补齐头像和昵称/备注
        try {
            if (normalized.roleId && typeof getContacts === "function") {
                var contacts = getContacts() || [];
                var roleIdStr = String(normalized.roleId).trim();
                var related = contacts.find(function (c) {
                    // 联系人id可能是 contact_1，roleId可能是 1
                    var cId = String(c.id || "").trim();
                    var cCharId = String(c.characterId || "").trim();
                    return (
                        cId === roleIdStr ||
                        cId === "contact_" + roleIdStr ||
                        cCharId === roleIdStr
                    );
                });
                if (related) {
                    normalized.contact = related;
                    if (!normalized.avatar && related.avatar) {
                        normalized.avatar = related.avatar;
                    }
                    if (!normalized.nickname && related.nickname) {
                        normalized.nickname = related.nickname;
                    }
                    // 备注优先使用微信备注，其次昵称
                    if (!normalized.remark) {
                        if (related.remark) {
                            normalized.remark = related.remark;
                        } else if (related.nickname) {
                            normalized.remark = related.nickname;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信数据] 尝试关联联系人到好友申请时出错:",
                e
            );
        }
        // 去重：多种方式去重，避免重复记录
        // 1. 优先按 sourceMessageId 去重（同一条消息）
        // 2. 如果没有 sourceMessageId，按 roleId + direction + timestamp（3天内）去重
        var normalizedRoleIdStr = normalizeRoleId(normalized.roleId);
        var existingIndex = -1;
        if (normalized.sourceMessageId) {
            existingIndex = list.findIndex(function (item) {
                // 同一条酒馆消息里可能包含多个角色的好友申请
                return (
                    item.sourceMessageId === normalized.sourceMessageId &&
                    item.direction === normalized.direction &&
                    normalizeRoleId(item.roleId) === normalizedRoleIdStr
                );
            });
        }

        // 如果没有找到，尝试按 roleId + direction + 时间（3天内）去重
        if (existingIndex === -1 && normalized.roleId) {
            var threeDaysMs = 3 * 24 * 60 * 60 * 1000;
            var normalizedTime = normalized.timestamp || now;
            existingIndex = list.findIndex(function (item) {
                var itemRoleIdStr = normalizeRoleId(item.roleId);

                // 匹配角色ID和方向（同一方向同一角色只保留一条记录）
                if (
                    itemRoleIdStr !== normalizedRoleIdStr ||
                    item.direction !== normalized.direction
                ) {
                    return false;
                }
                // 不再用时间窗口判断是否重复：同一角色同一方向的申请天然应去重
                return true;
            });
        }

        if (existingIndex !== -1) {
            // 更新已有记录，但保留原有的状态（如果新记录没有明确的状态）
            var existing = list[existingIndex];
            var merged = Object.assign({}, existing, normalized);
            // 如果原有记录已经有状态（非pending），且新记录没有明确状态，保留原有状态
            if (
                existing.status &&
                existing.status !== "pending" &&
                (!normalized.status || normalized.status === "pending")
            ) {
                merged.status = existing.status;
            }
            list[existingIndex] = merged;
            _saveFriendRequests(list);
            console.info(
                "[小馨手机][微信数据] 更新已有好友申请记录(去重):",
                merged
            );
            return;
        }

        list.unshift(normalized);
        _saveFriendRequests(list);
        console.info("[小馨手机][微信数据] 记录好友申请:", normalized);
    }

    function updateFriendRequest(id, updates) {
        var list = getFriendRequests();
        var index = list.findIndex(function (r) {
            return r.id === id;
        });
        if (index === -1) return false;
        Object.assign(list[index], updates || {});
        _saveFriendRequests(list);
        console.info("[小馨手机][微信数据] 更新好友申请:", id, updates);
        return true;
    }

    // 玩家在"新的朋友"页面手动接受某条好友申请（通常是角色向玩家发起的申请）
    function acceptFriendRequest(id) {
        var list = getFriendRequests();
        var index = list.findIndex(function (r) {
            return r.id === id;
        });
        if (index === -1) {
            console.warn(
                "[小馨手机][微信数据] 接受好友申请失败，未找到请求ID:",
                id
            );
            return false;
        }

        var request = list[index];
        // 已经处理过的申请不重复处理（pending_verify 状态允许继续处理）
        if (request.status && request.status !== "pending" && request.status !== "pending_verify") {
            console.info(
                "[小馨手机][微信数据] 好友申请已处理，忽略再次接受:",
                id,
                request.status
            );
            return false;
        }

        // 对于角色主动添加玩家的申请（role_to_player），标记为 pending_verify，需要玩家在验证页面点击"完成"后才真正标记为 accepted
        // 对于玩家主动添加角色的申请（player_to_role），保持原有逻辑，直接标记为 accepted
        if (request.direction === "role_to_player") {
            // 角色主动添加玩家：标记为 pending_verify，等待玩家在验证页面完成验证
            request.status = "pending_verify";
            console.info(
                "[小馨手机][微信数据] 角色主动添加玩家，标记为 pending_verify，等待验证页面完成:",
                id
            );
        } else {
            // 玩家主动添加角色：直接标记为 accepted（保持原有逻辑）
            request.status = "accepted";
        }
        list[index] = request;
        _saveFriendRequests(list);

        // 尝试创建或更新联系人（但不立即标记为好友，除非是玩家主动添加角色）
        try {
            var roleIdStr = String(request.roleId || "").trim();
            var contacts = getContacts() || [];
            var contactIndex = contacts.findIndex(function (c) {
                var cId = String(c.id || "").trim();
                var cCharId = String(c.characterId || "").trim();
                return (
                    cId === roleIdStr ||
                    cId === "contact_" + roleIdStr ||
                    cCharId === roleIdStr
                );
            });

            var isRoleToPlayer = request.direction === "role_to_player";

            if (contactIndex !== -1) {
                var contact = contacts[contactIndex];
                // 只有玩家主动添加角色时才立即标记为好友
                if (!isRoleToPlayer) {
                    contact.isFriend = true;
                    contact.friendStatus = "friend";
                } else {
                    // 角色主动添加玩家：不立即标记为好友，等待验证页面完成
                    // 保持现有状态或设置为 pending
                    if (!contact.isFriend) {
                        contact.friendStatus = "pending";
                    }
                }
                contacts[contactIndex] = contact;
                _setData(DATA_KEYS.CONTACTS, contacts);

                // 通知UI联系人已更新（但不触发好友添加的完整流程，避免刷新）
                if (typeof window.CustomEvent !== "undefined") {
                    var contactEvent = new CustomEvent(
                        "xiaoxin-contact-updated",
                        {
                            detail: {
                                contact: contact,
                                skipFriendAddedFlow: isRoleToPlayer // 标记跳过好友添加流程，避免刷新
                            },
                        }
                    );
                    window.dispatchEvent(contactEvent);
                }
                // 同步到请求对象，方便 UI 直接取用
                request.contact = contact;
                list[index] = request;
                _saveFriendRequests(list);
            } else {
                // 如果联系人不存在（常见于角色主动申请但未提供/未写入联系人块），这里用申请信息创建一个联系人
                var extra = (request && request.extra) || {};
                var newContact = {
                    id: "contact_" + roleIdStr,
                    characterId: roleIdStr,
                    wechatId: extra["微信号"] || extra["微信ID"] || extra["wxid"] || "",
                    phone: extra["电话号码"] || extra["手机号"] || extra["电话"] || "",
                    nickname:
                        extra["微信昵称"] ||
                        extra["昵称"] ||
                        request.remark ||
                        ("联系人" + roleIdStr),
                    avatar: extra["头像URL"] || extra["头像"] || "",
                    momentsBackground:
                        extra["朋友圈背景URL"] ||
                        extra["朋友圈背景"] ||
                        extra["朋友圈背景url"] ||
                        "",
                    region: extra["地区"] || "",
                    gender: extra["性别"] || "",
                    // 只有玩家主动添加角色时才立即标记为好友
                    isFriend: !isRoleToPlayer,
                    friendStatus: isRoleToPlayer ? "pending" : "friend",
                    tags: [],
                };

                contacts.push(newContact);
                _setData(DATA_KEYS.CONTACTS, contacts);

                // 同步到请求对象，方便 UI 直接取用
                request.contact = newContact;
                list[index] = request;
                _saveFriendRequests(list);

                if (typeof window.CustomEvent !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent("xiaoxin-contact-updated", {
                            detail: {
                                contact: newContact,
                                skipFriendAddedFlow: isRoleToPlayer // 标记跳过好友添加流程，避免刷新
                            },
                        })
                    );
                }
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信数据] 接受好友申请时更新联系人状态失败:",
                e
            );
        }

        // 触发好友申请更新事件，刷新"新的朋友"页面
        // 但对于 pending_verify 状态，不触发事件，避免刷新覆盖验证页面
        try {
            if (typeof window.CustomEvent !== "undefined" && request.status !== "pending_verify") {
                var event = new CustomEvent("xiaoxin-friend-request-updated", {
                    detail: {
                        roleId: request.roleId,
                        status: request.status,
                        requests: list,
                    },
                });
                window.dispatchEvent(event);
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信数据] 触发好友申请更新事件失败(acceptFriendRequest):",
                e
            );
        }

        console.info("[小馨手机][微信数据] 玩家已接受好友申请:", request);
        return true;
    }

    // 完成好友验证（在验证页面点击"完成"按钮时调用）
    function completeFriendVerification(requestId, remark, tags, permissionType, hideMyMoments, hideTheirMoments) {
        var list = getFriendRequests();
        var index = list.findIndex(function (r) {
            return r.id === requestId;
        });
        if (index === -1) {
            console.warn(
                "[小馨手机][微信数据] 完成好友验证失败，未找到请求ID:",
                requestId
            );
            return false;
        }

        var request = list[index];
        // 只有 pending_verify 状态才能完成验证
        if (request.status !== "pending_verify") {
            console.warn(
                "[小馨手机][微信数据] 完成好友验证失败，请求状态不是 pending_verify:",
                request.status
            );
            return false;
        }

        // 标记为已接受
        request.status = "accepted";
        list[index] = request;
        _saveFriendRequests(list);

        // 更新联系人的好友状态
        try {
            var roleIdStr = String(request.roleId || "").trim();
            var contacts = getContacts() || [];
            var contactIndex = contacts.findIndex(function (c) {
                var cId = String(c.id || "").trim();
                var cCharId = String(c.characterId || "").trim();
                return (
                    cId === roleIdStr ||
                    cId === "contact_" + roleIdStr ||
                    cCharId === roleIdStr
                );
            });

            if (contactIndex !== -1) {
                var contact = contacts[contactIndex];
                contact.isFriend = true;
                contact.friendStatus = "friend";
                // 更新备注和标签
                if (remark !== undefined && remark !== null) {
                    contact.remark = String(remark).trim();
                }
                if (Array.isArray(tags)) {
                    contact.tags = tags.slice();
                }
                // 更新朋友权限设置
                if (permissionType !== undefined && permissionType !== null) {
                    contact.permissionType = permissionType;
                }
                if (hideMyMoments !== undefined && hideMyMoments !== null) {
                    contact.hideMyMoments = hideMyMoments;
                }
                if (hideTheirMoments !== undefined && hideTheirMoments !== null) {
                    contact.hideTheirMoments = hideTheirMoments;
                }
                contacts[contactIndex] = contact;
                _setData(DATA_KEYS.CONTACTS, contacts);

                // 通知UI联系人已更新
                if (typeof window.CustomEvent !== "undefined") {
                    var contactEvent = new CustomEvent(
                        "xiaoxin-contact-updated",
                        {
                            detail: { contact: contact },
                        }
                    );
                    window.dispatchEvent(contactEvent);
                }
                // 同步到请求对象
                request.contact = contact;
                list[index] = request;
                _saveFriendRequests(list);
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信数据] 完成好友验证时更新联系人状态失败:",
                e
            );
        }

        // 触发好友申请更新事件
        try {
            if (typeof window.CustomEvent !== "undefined") {
                var event = new CustomEvent("xiaoxin-friend-request-updated", {
                    detail: {
                        roleId: request.roleId,
                        status: request.status,
                        requests: list,
                    },
                });
                window.dispatchEvent(event);
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信数据] 触发好友申请更新事件失败(completeFriendVerification):",
                e
            );
        }

        console.info("[小馨手机][微信数据] 玩家已完成好友验证:", request);
        return true;
    }

    // 玩家拒绝某条好友申请（通常是角色向玩家发起的申请）
    function rejectFriendRequest(id) {
        var list = getFriendRequests();
        var index = list.findIndex(function (r) {
            return r.id === id;
        });
        if (index === -1) {
            console.warn(
                "[小馨手机][微信数据] 拒绝好友申请失败，未找到请求ID:",
                id
            );
            return false;
        }

        var request = list[index];
        // 已经处理过的申请不重复处理
        if (request.status && request.status !== "pending") {
            console.info(
                "[小馨手机][微信数据] 好友申请已处理，忽略再次拒绝:",
                id,
                request.status
            );
            return false;
        }

        // 标记为已拒绝
        request.status = "rejected";
        list[index] = request;
        _saveFriendRequests(list);

        // 尝试更新对应联系人的好友状态
        try {
            var roleIdStr = String(request.roleId || "").trim();
            var contacts = getContacts() || [];
            var contactIndex = contacts.findIndex(function (c) {
                var cId = String(c.id || "").trim();
                var cCharId = String(c.characterId || "").trim();
                return (
                    cId === roleIdStr ||
                    cId === "contact_" + roleIdStr ||
                    cCharId === roleIdStr
                );
            });
            if (contactIndex !== -1) {
                var contact = contacts[contactIndex];
                contact.isFriend = false;
                contact.friendStatus = "rejected";
                contacts[contactIndex] = contact;
                _setData(DATA_KEYS.CONTACTS, contacts);

                // 通知UI联系人已更新
                if (typeof window.CustomEvent !== "undefined") {
                    var contactEvent = new CustomEvent(
                        "xiaoxin-contact-updated",
                        {
                            detail: { contact: contact },
                        }
                    );
                    window.dispatchEvent(contactEvent);
                }
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信数据] 拒绝好友申请时更新联系人状态失败:",
                e
            );
        }

        // 触发好友申请更新事件，刷新"新的朋友"页面
        try {
            if (typeof window.CustomEvent !== "undefined") {
                var event = new CustomEvent("xiaoxin-friend-request-updated", {
                    detail: {
                        roleId: request.roleId,
                        status: request.status,
                        requests: list,
                    },
                });
                window.dispatchEvent(event);
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信数据] 触发好友申请更新事件失败(rejectFriendRequest):",
                e
            );
        }

        console.info("[小馨手机][微信数据] 玩家已拒绝好友申请:", request);
        return true;
    }

    // ========== 处理角色响应好友申请 ==========
    function processFriendApplyResponse(response) {
        if (!response || !response.roleId || !response.status) {
            console.warn("[小馨手机][微信数据] 无效的好友申请响应:", response);
            return false;
        }

        var roleId = String(response.roleId).trim();
        var status = response.status; // "accepted" | "rejected" | "pending"

        // 1. 更新联系人好友状态
        var contacts = getContacts();
        var contactIndex = contacts.findIndex(function (c) {
            // 支持多种ID匹配方式：
            // 1. 直接匹配 id === roleId
            // 2. 匹配 id === "contact_" + roleId（标准格式）
            // 3. 匹配 characterId === roleId
            var cId = String(c.id || "").trim();
            var cCharId = String(c.characterId || "").trim();
            var roleIdStr = String(roleId).trim();

            return (
                cId === roleIdStr ||
                cId === "contact_" + roleIdStr ||
                cCharId === roleIdStr
            );
        });

            if (contactIndex === -1) {
                // 如果找不到联系人，尝试从好友申请记录中查找并创建
                console.warn(
                    "[小馨手机][微信数据] 未找到角色ID对应的联系人，尝试从好友申请记录中查找:",
                    roleId
                );
                var requests = getFriendRequests();
                var roleIdStrForMatch = String(roleId).trim();
                var relatedRequest = requests.find(function (req) {
                    var reqRoleIdStr = String(req.roleId || "").trim();
                    // 匹配角色ID：支持直接匹配或 "contact_" 前缀匹配
                    var roleIdMatch =
                        reqRoleIdStr === roleIdStrForMatch ||
                        reqRoleIdStr === "contact_" + roleIdStrForMatch ||
                        reqRoleIdStr.replace(/^contact_/, "") ===
                            roleIdStrForMatch ||
                        roleIdStrForMatch.replace(/^contact_/, "") === reqRoleIdStr;
                    return roleIdMatch && req.direction === "player_to_role";
                });

                if (relatedRequest && relatedRequest.contact) {
                    // 从好友申请记录中获取联系人信息并创建
                    var newContact = Object.assign({}, relatedRequest.contact, {
                        id: relatedRequest.contact.id || "contact_" + roleId,
                        characterId: roleId,
                        isFriend: status === "accepted",
                        friendStatus:
                            status === "accepted"
                                ? "friend"
                                : status === "rejected"
                                ? "rejected"
                                : "pending",
                    });
                    addContact(newContact);
                    console.info(
                        "[小馨手机][微信数据] 从好友申请记录创建联系人:",
                        newContact
                    );

                    // 重新查找
                    contacts = getContacts();
                    contactIndex = contacts.findIndex(function (c) {
                        var cId = String(c.id || "").trim();
                        var cCharId = String(c.characterId || "").trim();
                        var roleIdStr = String(roleId).trim();
                        return (
                            cId === roleIdStr ||
                            cId === "contact_" + roleIdStr ||
                            cCharId === roleIdStr
                        );
                    });
                } else {
                    // ⚠️ 如果找不到好友申请记录，但响应是"同意"，尝试从最近的消息中查找[wx_contact]数据块
                    if (status === "accepted") {
                        console.warn(
                            "[小馨手机][微信数据] 未找到好友申请记录，但响应是同意，尝试从最近的消息中查找[wx_contact]数据块:",
                            roleId
                        );
                        // 尝试从消息监听器中获取最近的联系方式数据
                        if (window.XiaoxinMessageListener && typeof window.XiaoxinMessageListener.getRecentContactData === "function") {
                            var recentContactData = window.XiaoxinMessageListener.getRecentContactData(roleId);
                            if (recentContactData) {
                                var newContact = Object.assign({}, recentContactData, {
                                    id: recentContactData.id || "contact_" + roleId,
                                    characterId: roleId,
                                    isFriend: true,
                                    friendStatus: "friend",
                                });
                                addContact(newContact);
                                console.info(
                                    "[小馨手机][微信数据] 从最近的消息中创建联系人:",
                                    newContact
                                );

                                // 重新查找
                                contacts = getContacts();
                                contactIndex = contacts.findIndex(function (c) {
                                    var cId = String(c.id || "").trim();
                                    var cCharId = String(c.characterId || "").trim();
                                    var roleIdStr = String(roleId).trim();
                                    return (
                                        cId === roleIdStr ||
                                        cId === "contact_" + roleIdStr ||
                                        cCharId === roleIdStr
                                    );
                                });
                            } else {
                                // 如果缓存中也没有，尝试从当前消息内容中解析[wx_contact]数据块
                                console.warn(
                                    "[小馨手机][微信数据] 缓存中也没有联系方式数据，尝试从消息内容中解析[wx_contact]数据块:",
                                    roleId
                                );
                                // 尝试从消息监听器中获取原始消息内容
                                if (window.XiaoxinMessageListener && typeof window.XiaoxinMessageListener.getRawMessageContent === "function") {
                                    var rawContent = window.XiaoxinMessageListener.getRawMessageContent();
                                    if (rawContent && rawContent.indexOf("[wx_contact]") !== -1) {
                                        // 解析[wx_contact]数据块
                                        if (typeof window.XiaoxinMessageListener.parseContactTags === "function") {
                                            var parsedContacts = window.XiaoxinMessageListener.parseContactTags(rawContent);
                                            var matchedContact = parsedContacts.find(function(c) {
                                                var cId = String(c.characterId || c.id || "").trim();
                                                var roleIdStr = String(roleId).trim();
                                                return cId === roleIdStr ||
                                                       cId === "contact_" + roleIdStr ||
                                                       cId.replace(/^contact_/, "") === roleIdStr ||
                                                       roleIdStr.replace(/^contact_/, "") === cId;
                                            });
                                            if (matchedContact) {
                                                var newContact = Object.assign({}, matchedContact, {
                                                    id: matchedContact.id || "contact_" + roleId,
                                                    characterId: roleId,
                                                    isFriend: true,
                                                    friendStatus: "friend",
                                                });
                                                addContact(newContact);
                                                console.info(
                                                    "[小馨手机][微信数据] 从消息内容中解析并创建联系人:",
                                                    newContact
                                                );

                                                // 重新查找
                                                contacts = getContacts();
                                                contactIndex = contacts.findIndex(function (c) {
                                                    var cId = String(c.id || "").trim();
                                                    var cCharId = String(c.characterId || "").trim();
                                                    var roleIdStr = String(roleId).trim();
                                                    return (
                                                        cId === roleIdStr ||
                                                        cId === "contact_" + roleIdStr ||
                                                        cCharId === roleIdStr
                                                    );
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (contactIndex === -1) {
                    console.warn(
                        "[小馨手机][微信数据] 仍然未找到角色ID对应的联系人:",
                        roleId,
                        "当前联系人列表:",
                        contacts.map(function (c) {
                            return {
                                id: c.id,
                                characterId: c.characterId,
                                nickname: c.nickname,
                            };
                        })
                    );
                    // ⚠️ 如果响应是"同意"但找不到联系人，仍然返回false，但记录更详细的日志
                    if (status === "accepted") {
                        console.error(
                            "[小馨手机][微信数据] ⚠️ 好友申请已同意，但无法创建联系人。请确保在响应前已输出[wx_contact]数据块，角色ID:",
                            roleId
                        );
                    }
                    return false;
                }
            }

        var contact = contacts[contactIndex];
        var updated = false;

        if (status === "accepted") {
            // 同意：设置为好友
            if (!contact.isFriend || contact.friendStatus !== "friend") {
                contact.isFriend = true;
                contact.friendStatus = "friend";

                // 保存好友通过的时间戳（优先使用响应对象中的时间）
                var acceptedTimestamp = null;
                var acceptedRawTime = "";

                // 1. 优先从响应对象获取时间（从格式指令中解析的）
                if (response) {
                    // 优先使用 rawTime 来解析时间（更可靠）
                    if (response.rawTime) {
                        var normalizedTimeStr = response.rawTime
                            .replace(/-/g, "/")
                            .replace(/年/g, "/")
                            .replace(/月/g, "/")
                            .replace(/日/g, " ")
                            .replace(/星期[一二三四五六日]/g, "")
                            .trim();
                        var parsed = Date.parse(normalizedTimeStr);
                        if (!isNaN(parsed)) {
                            acceptedTimestamp = parsed;
                            acceptedRawTime = response.rawTime;
                            console.info(
                                "[小馨手机][微信数据] 从响应对象的 rawTime 解析好友通过时间:",
                                acceptedRawTime,
                                "->",
                                acceptedTimestamp
                            );
                        }
                    }

                    // 如果没有 rawTime，但有 timestamp，检查是否是世界观时间
                    if (!acceptedTimestamp && response.timestamp) {
                        var currentRealTime = Date.now();
                        var timestampAge = currentRealTime - response.timestamp;
                        // 如果时间戳不是最近的时间（超过1分钟），或者时间戳明显是过去的时间（小于2020年），可能是有效的世界观时间
                        if (timestampAge > 60000 || response.timestamp < 1577836800000) {
                            acceptedTimestamp = response.timestamp;
                            acceptedRawTime = response.rawTime || "";
                            console.info(
                                "[小馨手机][微信数据] 使用响应对象中的时间戳作为好友通过时间:",
                                acceptedTimestamp,
                                "原始时间:",
                                acceptedRawTime
                            );
                        }
                    }
                }

                // 2. 如果响应对象没有有效的时间，尝试从好友申请记录中获取时间
                if (!acceptedTimestamp) {
                    try {
                        var requests = getFriendRequests();
                        var roleIdStrForMatch = String(roleId).trim();
                        var relatedRequest = requests.find(function (req) {
                            var reqRoleIdStr = String(req.roleId || "").trim();
                            var roleIdMatch =
                                reqRoleIdStr === roleIdStrForMatch ||
                                reqRoleIdStr === "contact_" + roleIdStrForMatch ||
                                reqRoleIdStr.replace(/^contact_/, "") ===
                                    roleIdStrForMatch ||
                                roleIdStrForMatch.replace(/^contact_/, "") ===
                                    reqRoleIdStr;
                            return (
                                roleIdMatch && 
                                req.direction === "player_to_role" &&
                                req.status === "accepted"
                            );
                        });
                        
                        if (relatedRequest && relatedRequest.timestamp) {
                            acceptedTimestamp = relatedRequest.timestamp;
                            acceptedRawTime = relatedRequest.rawTime || "";
                            console.info(
                                "[小馨手机][微信数据] 从好友申请记录中获取好友通过时间:",
                                acceptedTimestamp,
                                "原始时间:",
                                acceptedRawTime
                            );
                        }
                    } catch (e) {
                        console.warn(
                            "[小馨手机][微信数据] 从好友申请记录获取时间失败:",
                            e
                        );
                    }
                }
                
                // 3. 如果仍然没有时间，检查联系人是否已有 friendAcceptedAt（避免覆盖历史时间）
                if (!acceptedTimestamp && contact.friendAcceptedAt) {
                    // 如果联系人已经有历史时间，保留它（不更新为当前时间）
                    acceptedTimestamp = contact.friendAcceptedAt;
                    acceptedRawTime = contact.friendAcceptedRawTime || "";
                    console.info(
                        "[小馨手机][微信数据] 保留联系人已有的好友通过时间（历史时间）:",
                        acceptedTimestamp,
                        "原始时间:",
                        acceptedRawTime
                    );
                }
                
                // 4. 只有在确实没有时间的情况下，才使用全局世界观时钟（避免覆盖历史时间）
                if (!acceptedTimestamp) {
                    if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.currentTimestamp) {
                        acceptedTimestamp = window.XiaoxinWorldClock.currentTimestamp;
                        acceptedRawTime = window.XiaoxinWorldClock.rawTime || window.XiaoxinWorldClock.raw || "";
                        console.info(
                            "[小馨手机][微信数据] 使用全局世界观时钟时间作为好友通过时间:",
                            acceptedTimestamp,
                            "原始时间:",
                            acceptedRawTime
                        );
                    } else {
                        // 最后才使用现实时间（不推荐）
                        acceptedTimestamp = Date.now();
                        console.warn(
                            "[小馨手机][微信数据] 无法获取世界观时间，使用现实时间作为好友通过时间（不推荐）"
                        );
                    }
                }

                // 保存好友通过时间
                contact.friendAcceptedAt = acceptedTimestamp;
                contact.friendAcceptedRawTime = acceptedRawTime;

                updated = true;
                console.info(
                    "[小馨手机][微信数据] 角色同意好友申请，更新为好友:",
                    roleId,
                    "通过时间:",
                    acceptedTimestamp,
                    "原始时间:",
                    acceptedRawTime
                );

                // 自动创建聊天记录和系统消息
                try {
                    // 查找对应的好友申请记录，获取打招呼内容
                    var requests = getFriendRequests();
                    var roleIdStrForMatch = String(roleId).trim();
                    var relatedRequest = requests.find(function (req) {
                        var reqRoleIdStr = String(req.roleId || "").trim();
                        var roleIdMatch =
                            reqRoleIdStr === roleIdStrForMatch ||
                            reqRoleIdStr === "contact_" + roleIdStrForMatch ||
                            reqRoleIdStr.replace(/^contact_/, "") ===
                                roleIdStrForMatch ||
                            roleIdStrForMatch.replace(/^contact_/, "") ===
                                reqRoleIdStr;
                        return (
                            roleIdMatch && req.direction === "player_to_role"
                        );
                    });

                    // 确定聊天对象的ID（使用联系人的ID或微信号）
                    var chatUserId =
                        contact.id || contact.wechatId || "contact_" + roleId;

                    // 检查是否已有聊天记录，如果没有则创建
                    var existingChats = getChatHistory(chatUserId);
                    var shouldCreateChat = existingChats.length === 0;

                    if (shouldCreateChat) {
                        // 使用世界观时间，而不是现实时间
                        // 优先使用响应对象中的时间（从格式或时间标签解析的）
                        var responseTime = null;
                        var responseRawTime = "";

                        // 1. 优先从响应对象获取时间（如果是从格式或时间标签解析的）
                        if (response) {
                            // 优先使用 rawTime 来解析时间（更可靠）
                            if (response.rawTime) {
                                var normalizedTimeStr = response.rawTime
                                    .replace(/-/g, "/")
                                    .replace(/年/g, "/")
                                    .replace(/月/g, "/")
                                    .replace(/日/g, " ")
                                    .replace(/星期[一二三四五六日]/g, "")
                                    .trim();
                                var parsed = Date.parse(normalizedTimeStr);
                                if (!isNaN(parsed)) {
                                    responseTime = parsed;
                                    responseRawTime = response.rawTime;
                                    console.info(
                                        "[小馨手机][微信数据] 从响应对象的 rawTime 解析时间:",
                                        responseRawTime,
                                        "->",
                                        responseTime
                                    );
                                }
                            }

                            // 如果没有 rawTime，但有 timestamp，检查是否是世界观时间
                            if (!responseTime && response.timestamp) {
                                var currentRealTime = Date.now();
                                var timestampAge =
                                    currentRealTime - response.timestamp;
                                // 如果时间戳不是最近的时间（超过1分钟），或者时间戳明显是过去的时间（小于2020年），可能是有效的世界观时间
                                // 2020年1月1日的时间戳大约是 1577836800000
                                if (
                                    timestampAge > 60000 ||
                                    response.timestamp < 1577836800000
                                ) {
                                    // 时间戳可能是世界观时间（2018年的时间戳会小于2020年的时间戳）
                                    responseTime = response.timestamp;
                                    responseRawTime = response.rawTime || "";
                                    console.info(
                                        "[小馨手机][微信数据] 使用响应对象中的时间戳:",
                                        responseTime,
                                        "原始时间:",
                                        responseRawTime
                                    );
                                } else {
                                    console.warn(
                                        "[小馨手机][微信数据] 响应对象的时间戳可能是现实时间，跳过:",
                                        response.timestamp
                                    );
                                }
                            }
                        }

                        // 2. 如果响应对象没有有效的时间，使用全局世界观时钟
                        if (!responseTime) {
                            if (
                                window.XiaoxinWorldClock &&
                                window.XiaoxinWorldClock.currentTimestamp
                            ) {
                                responseTime =
                                    window.XiaoxinWorldClock.currentTimestamp;
                                responseRawTime =
                                    window.XiaoxinWorldClock.rawTime ||
                                    window.XiaoxinWorldClock.raw ||
                                    "";
                                console.info(
                                    "[小馨手机][微信数据] 使用全局世界观时钟时间:",
                                    responseTime,
                                    "原始时间:",
                                    responseRawTime
                                );
                            } else {
                                // 最后才使用现实时间（不推荐）
                                responseTime = Date.now();
                                console.warn(
                                    "[小馨手机][微信数据] 无法获取世界观时间，使用现实时间（不推荐）"
                                );
                            }
                        }

                        var greetingContent = "";

                        // 如果有打招呼内容，先添加打招呼消息
                        // 使用好友申请的时间（如果有），否则使用响应时间减去几秒
                        var greetingTime =
                            relatedRequest && relatedRequest.timestamp
                                ? relatedRequest.timestamp
                                : responseTime - 2000; // 比系统消息早2秒
                        var greetingRawTime =
                            relatedRequest && relatedRequest.rawTime
                                ? relatedRequest.rawTime
                                : "";
                        if (relatedRequest && relatedRequest.greeting) {
                            greetingContent = relatedRequest.greeting.trim();
                            if (greetingContent) {
                                addChatMessage(chatUserId, {
                                    type: "text",
                                    content: greetingContent,
                                    sender: "player",
                                    timestamp: greetingTime,
                                    rawTime: greetingRawTime, // 保存原始时间字符串
                                });
                                console.info(
                                    "[小馨手机][微信数据] 已添加打招呼消息到聊天记录:",
                                    greetingContent,
                                    "时间:",
                                    greetingTime,
                                    "原始时间:",
                                    greetingRawTime
                                );
                            }
                        }

                        // 添加系统消息：XXX通过了你的朋友验证请求，以上是打招呼的消息
                        // 必须使用角色的微信昵称，而不是备注
                        var roleDisplayName =
                            contact.nickname ||
                            contact.wechatNickname ||
                            contact.name ||
                            "对方";
                        var systemMessage =
                            roleDisplayName +
                            "通过了你的朋友验证请求，以上是打招呼的消息。";

                        // ⚠️ 系统消息必须使用好友申请同意的时间（acceptedTimestamp），而不是当前世界观时间
                        // 确保历史联系人的系统消息显示正确的时间
                        var systemMessageTime = acceptedTimestamp || responseTime;
                        var systemMessageRawTime = acceptedRawTime || responseRawTime;
                        
                        addChatMessage(chatUserId, {
                            type: "system",
                            content: systemMessage,
                            timestamp: systemMessageTime,
                            rawTime: systemMessageRawTime, // 保存原始时间字符串
                        });
                        console.info(
                            "[小馨手机][微信数据] 已添加系统消息到聊天记录:",
                            systemMessage,
                            "时间戳:",
                            responseTime,
                            "原始时间:",
                            responseRawTime
                        );

                        // 当角色第一次通过好友申请时，增加未读消息数（显示红点）
                        // 检查是否已有未读消息，如果没有则设置为1
                        var currentUnread = getUnreadCount(chatUserId);
                        if (currentUnread === 0) {
                            incrementUnreadCount(chatUserId);
                            console.info(
                                "[小馨手机][微信数据] 角色第一次通过好友申请，增加未读消息数:",
                                chatUserId
                            );

                            // 触发全局红点更新事件
                            try {
                                if (typeof window.CustomEvent !== "undefined") {
                                    var badgeEvent = new CustomEvent(
                                        "xiaoxin-unread-count-updated"
                                    );
                                    window.dispatchEvent(badgeEvent);
                                }
                            } catch (e) {
                                console.warn(
                                    "[小馨手机][微信数据] 触发红点更新事件失败:",
                                    e
                                );
                            }
                        }

                        // 触发聊天更新事件，通知UI刷新聊天列表
                        try {
                            if (typeof window.CustomEvent !== "undefined") {
                                var chatEvent = new CustomEvent(
                                    "xiaoxin-chat-updated",
                                    {
                                        detail: {
                                            userId: chatUserId,
                                            contact: contact,
                                        },
                                    }
                                );
                                window.dispatchEvent(chatEvent);
                                console.info(
                                    "[小馨手机][微信数据] 已触发聊天更新事件，userId:",
                                    chatUserId
                                );
                            }
                        } catch (e) {
                            console.warn(
                                "[小馨手机][微信数据] 触发聊天更新事件失败:",
                                e
                            );
                        }
                    }
                } catch (e) {
                    console.error(
                        "[小馨手机][微信数据] 创建聊天记录时出错:",
                        e
                    );
                }
            }
        } else if (status === "rejected") {
            // 拒绝：保持非好友状态
            if (contact.isFriend || contact.friendStatus === "friend") {
                contact.isFriend = false;
                contact.friendStatus = "rejected";
                updated = true;
                console.info("[小馨手机][微信数据] 角色拒绝好友申请:", roleId);
            }
        } else if (status === "pending") {
            // 搁置：保持待验证状态
            if (contact.isFriend || contact.friendStatus === "friend") {
                contact.isFriend = false;
                contact.friendStatus = "pending";
                updated = true;
                console.info("[小馨手机][微信数据] 角色搁置好友申请:", roleId);
            }
        }

        if (updated) {
            contacts[contactIndex] = contact;
            _setData(DATA_KEYS.CONTACTS, contacts);

            // 触发联系人更新事件，通知UI刷新
            try {
                if (typeof window.CustomEvent !== "undefined") {
                    var event = new CustomEvent("xiaoxin-contact-updated", {
                        detail: {
                            contact: contact,
                            roleId: roleId,
                            status: status,
                        },
                    });
                    window.dispatchEvent(event);
                    console.info("[小馨手机][微信数据] 已触发联系人更新事件");
                }
            } catch (e) {
                console.warn("[小馨手机][微信数据] 触发联系人更新事件失败:", e);
            }
        }

        // 2. 更新好友申请记录（如果有）
        // 注意：需要匹配 roleId，但 roleId 可能是字符串或数字，需要统一比较
        // 同时需要处理 roleId 格式不一致的问题（如 "contact_1" vs "1"）
        var requests = getFriendRequests();
        var requestUpdated = false;
        var roleIdStr = String(roleId).trim();

        requests = requests.map(function (req) {
            var reqRoleIdStr = String(req.roleId || "").trim();
            // 匹配角色ID：支持直接匹配或 "contact_" 前缀匹配
            var roleIdMatch =
                reqRoleIdStr === roleIdStr ||
                reqRoleIdStr === "contact_" + roleIdStr ||
                reqRoleIdStr.replace(/^contact_/, "") === roleIdStr ||
                roleIdStr.replace(/^contact_/, "") === reqRoleIdStr;

            // 匹配方向，不限制当前状态（可以更新任何状态）
            if (roleIdMatch && req.direction === "player_to_role") {
                if (status === "accepted") {
                    req.status = "accepted";
                    requestUpdated = true;
                    console.info(
                        "[小馨手机][微信数据] 更新好友申请记录状态为已添加:",
                        reqRoleIdStr,
                        "->",
                        roleIdStr
                    );
                } else if (status === "rejected") {
                    req.status = "rejected";
                    requestUpdated = true;
                    console.info(
                        "[小馨手机][微信数据] 更新好友申请记录状态为已拒绝:",
                        reqRoleIdStr,
                        "->",
                        roleIdStr
                    );
                } else if (status === "pending") {
                    req.status = "pending";
                    requestUpdated = true;
                    console.info(
                        "[小馨手机][微信数据] 更新好友申请记录状态为搁置:",
                        reqRoleIdStr,
                        "->",
                        roleIdStr
                    );
                }
            }
            return req;
        });

        if (requestUpdated) {
            _saveFriendRequests(requests);
            console.info(
                "[小馨手机][微信数据] 同步更新好友申请记录状态:",
                roleId,
                status
            );
        }

        // 3. 好友关系变更后，尝试强制扫描一次历史消息以解析朋友圈/互动标签
        // 说明：
        // - 历史楼层中的 [moments] / [moments-interactions] 只有在成为好友后才真正对玩家可见
        // - 之前依赖 MessageListener 自己监听事件，但它运行在酒馆主页面的 window 上，
        //   而微信应用和数据层通常在 iframe 内，两者的 CustomEvent 不一定在同一个 window 上触发
        // - 这里在数据层直接调用消息监听器的 scanRetainedMessages（优先从父窗口获取），
        //   确保每次好友添加成功后都会强制把历史朋友圈/互动解析一遍，无需用户手动刷新酒馆页面
        try {
            if (status === "accepted") {
                var hostWindow = null;
                if (typeof window !== "undefined") {
                    if (window.parent && window.parent !== window) {
                        hostWindow = window.parent;
                    } else {
                        hostWindow = window;
                    }
                }
                if (
                    hostWindow &&
                    hostWindow.XiaoxinMessageListener &&
                    typeof hostWindow.XiaoxinMessageListener
                        .scanRetainedMessages === "function"
                ) {
                    console.info(
                        "[小馨手机][微信数据] 好友申请已同意，调用消息监听器重新扫描历史消息以解析朋友圈/互动标签"
                    );
                    // 延迟一点点，让联系人状态/聊天列表等先写入完成
                    setTimeout(function () {
                        try {
                            hostWindow.XiaoxinMessageListener.scanRetainedMessages();
                        } catch (innerErr) {
                            console.warn(
                                "[小馨手机][微信数据] 调用 scanRetainedMessages 失败:",
                                innerErr
                            );
                        }
                    }, 300);
                } else {
                    console.info(
                        "[小馨手机][微信数据] 好友申请已同意，但未找到全局 XiaoxinMessageListener.scanRetainedMessages，可见性刷新将依赖下次页面初始化"
                    );
                }
            }
        } catch (bridgeErr) {
            console.warn(
                "[小馨手机][微信数据] 好友添加后尝试触发历史消息扫描时出错:",
                bridgeErr
            );
        }

        // 无论是否更新了记录，只要处理了响应，都触发事件通知UI刷新
        // 这样即使记录状态已经是其他值，UI也能刷新显示最新状态
        if (updated || requestUpdated) {
            try {
                if (typeof window.CustomEvent !== "undefined") {
                    var event = new CustomEvent(
                        "xiaoxin-friend-request-updated",
                        {
                            detail: {
                                roleId: roleId,
                                status: status,
                                requests: requests || getFriendRequests(),
                            },
                        }
                    );
                    window.dispatchEvent(event);
                    console.info(
                        "[小馨手机][微信数据] 已触发好友申请更新事件，roleId:",
                        roleId,
                        "status:",
                        status
                    );
                }
            } catch (e) {
                console.warn(
                    "[小馨手机][微信数据] 触发好友申请更新事件失败:",
                    e
                );
            }
        }

        return updated || requestUpdated;
    }

    // ========== 标签库管理 ==========
    function getAllTags() {
        var tags = _getData(DATA_KEYS.TAGS, []);
        if (!Array.isArray(tags)) tags = [];
        return Array.from(
            new Set(
                tags
                    .filter(function (t) {
                        return t && String(t).trim();
                    })
                    .map(function (t) {
                        return String(t).trim();
                    })
            )
        );
    }

    function addTag(tagName) {
        if (!tagName) return;
        var name = String(tagName).trim();
        if (!name) return;
        var tags = getAllTags();
        if (tags.indexOf(name) === -1) {
            tags.push(name);
            _setData(DATA_KEYS.TAGS, tags);
            console.info("[小馨手机][微信数据] 添加标签:", name);
        }
    }

    function removeTags(tagNames) {
        var list = Array.isArray(tagNames) ? tagNames : [tagNames];
        list = list
            .map(function (t) {
                return String(t || "").trim();
            })
            .filter(function (t) {
                return t;
            });
        if (!list.length) return 0;

        // 1) 从标签库移除
        var tags = getAllTags();
        var before = tags.length;
        tags = tags.filter(function (t) {
            return list.indexOf(t) === -1;
        });
        _setData(DATA_KEYS.TAGS, tags);

        // 2) 同步清理所有联系人中引用到的 tags
        try {
            var contacts = getContacts();
            var changed = false;
            contacts = contacts.map(function (c) {
                if (!c || !Array.isArray(c.tags) || c.tags.length === 0)
                    return c;
                var newTags = c.tags
                    .map(function (t) {
                        return String(t || "").trim();
                    })
                    .filter(function (t) {
                        return t && list.indexOf(t) === -1;
                    });
                if (newTags.length !== c.tags.length) {
                    changed = true;
                    return Object.assign({}, c, { tags: newTags });
                }
                return c;
            });
            if (changed) {
                _setData(DATA_KEYS.CONTACTS, contacts);
            }
        } catch (e) {
            console.warn("[小馨手机][微信数据] 清理联系人标签失败:", e);
        }

        var removed = before - tags.length;
        if (removed > 0) {
            console.info(
                "[小馨手机][微信数据] 删除标签:",
                list,
                "removed:",
                removed
            );
        }
        return removed;
    }

    // ========== 设置管理 ==========
    function getSettings() {
        return _getData(DATA_KEYS.SETTINGS, {});
    }

    function setSettings(settings) {
        var current = getSettings();
        Object.assign(current, settings);
        _setData(DATA_KEYS.SETTINGS, current);
    }

    // ========== 角色专用聊天背景管理 ==========
    function getContactChatBackground(contactId) {
        if (!contactId) return null;
        try {
            var settings = getSettings();
            var chatBackgrounds = settings.chatBackgrounds || {};
            return chatBackgrounds[contactId] || null;
        } catch (e) {
            console.warn("[小馨手机][微信数据] 获取角色专用聊天背景失败:", e);
            return null;
        }
    }

    function setContactChatBackground(contactId, background, scale) {
        if (!contactId) return false;
        try {
            var settings = getSettings();
            if (!settings.chatBackgrounds) {
                settings.chatBackgrounds = {};
            }
            if (background) {
                settings.chatBackgrounds[contactId] = {
                    background: background,
                    scale: scale || 100
                };
            } else {
                // 删除该角色的专用背景
                delete settings.chatBackgrounds[contactId];
            }
            setSettings(settings);
            return true;
        } catch (e) {
            console.warn("[小馨手机][微信数据] 设置角色专用聊天背景失败:", e);
            return false;
        }
    }

    // ========== 获取玩家发送的第一条消息时间 ==========
    // 用于全局时间显示基准
    function getFirstPlayerMessageTime() {
        try {
            var allChats = getAllChats();
            var firstPlayerMessage = null;
            var firstTimestamp = null;

            // 遍历所有聊天记录，找到最早的玩家消息
            Object.keys(allChats).forEach(function (userId) {
                var chatHistory = allChats[userId] || [];
                chatHistory.forEach(function (msg) {
                    // 判断是否为玩家消息
                    if (
                        msg.isOutgoing === true ||
                        msg.sender === "player" ||
                        (msg.type === "text" && msg.isOutgoing !== false)
                    ) {
                        // 优先使用 timestamp，如果没有则从 rawTime 解析
                        var msgTimestamp = msg.timestamp;
                        if (!msgTimestamp && msg.rawTime) {
                            var timeStr = String(msg.rawTime).trim();
                            var parsed = Date.parse(
                                timeStr
                                    .replace(/-/g, "/")
                                    .replace(
                                        /年|月|日|星期[一二三四五六日]/g,
                                        " "
                                    )
                            );
                            if (!isNaN(parsed)) {
                                msgTimestamp = parsed;
                            }
                        }

                        if (msgTimestamp) {
                            if (
                                !firstTimestamp ||
                                msgTimestamp < firstTimestamp
                            ) {
                                firstTimestamp = msgTimestamp;
                                firstPlayerMessage = {
                                    timestamp: msgTimestamp,
                                    rawTime: msg.rawTime || "",
                                    userId: userId,
                                };
                            }
                        }
                    }
                });
            });

            return firstPlayerMessage;
        } catch (e) {
            console.warn("[小馨手机][微信数据] 获取第一条玩家消息时间失败:", e);
            return null;
        }
    }

    // ========== 表情包分组管理 ==========
    function getStickerCategories() {
        return _getData(DATA_KEYS.STICKER_CATEGORIES, []);
    }

    function saveStickerCategories(categories) {
        _setData(DATA_KEYS.STICKER_CATEGORIES, categories);
    }

    function addStickerCategory(category) {
        var categories = getStickerCategories();
        categories.push(category);
        saveStickerCategories(categories);
        return category;
    }

    function updateStickerCategory(categoryId, updates) {
        var categories = getStickerCategories();
        var index = categories.findIndex(function (cat) {
            return cat.id === categoryId;
        });
        if (index >= 0) {
            categories[index] = Object.assign({}, categories[index], updates);
            saveStickerCategories(categories);
            return categories[index];
        }
        return null;
    }

    function removeStickerCategory(categoryId) {
        var categories = getStickerCategories();
        var filtered = categories.filter(function (cat) {
            return cat.id !== categoryId;
        });
        saveStickerCategories(filtered);
        return filtered.length < categories.length;
    }

    // ========== 表情包管理 ==========
    function getStickers(categoryId) {
        var allStickers = _getData(DATA_KEYS.STICKERS, {});
        return allStickers[categoryId] || [];
    }

    function saveStickers(categoryId, stickers) {
        var allStickers = _getData(DATA_KEYS.STICKERS, {});
        allStickers[categoryId] = stickers;
        _setData(DATA_KEYS.STICKERS, allStickers);
    }

    function addSticker(categoryId, sticker) {
        var stickers = getStickers(categoryId);
        stickers.push(sticker);
        saveStickers(categoryId, stickers);
        return sticker;
    }

    function removeSticker(categoryId, stickerId) {
        var stickers = getStickers(categoryId);
        var filtered = stickers.filter(function (sticker) {
            return sticker.id !== stickerId;
        });
        saveStickers(categoryId, filtered);
        return filtered.length < stickers.length;
    }

    // 获取所有表情包（用于聊天和朋友圈）
    function getAllStickers() {
        var allStickers = _getData(DATA_KEYS.STICKERS, {});
        var result = [];
        Object.keys(allStickers).forEach(function (categoryId) {
            var stickers = allStickers[categoryId] || [];
            stickers.forEach(function (sticker) {
                result.push(sticker);
            });
        });
        return result;
    }

    // ========== 导出 ==========
    // ========== 红包汇总数据管理 ==========
    // 红包汇总数据使用和消息数据完全相同的保存机制（_getData/_setData）
    // 这样无论是否有角色卡，都能正确访问数据
    function saveRedpacketSummary(playerWechatId, year, redpacketData) {
        if (!playerWechatId) {
            console.warn(
                "[小馨手机][微信数据] 保存红包汇总数据失败：缺少玩家微信ID"
            );
            return;
        }

        // 使用和消息数据相同的机制（_getData/_setData）
        var summaryData = _getData(DATA_KEYS.REDPACKET_SUMMARY, {});
        if (!summaryData[playerWechatId]) {
            summaryData[playerWechatId] = {};
        }

        // 保存该年份的数据（只保存必要的字段，避免存储过多数据）
        var simplifiedData = redpacketData.map(function (item) {
            return {
                messageId: item.message.id,
                redpacketId: item.message.redpacket_id || item.message.id,
                senderId: item.message.from || item.message.sender || "",
                senderName: item.senderContact
                    ? item.senderContact.remark ||
                      item.senderContact.nickname ||
                      item.senderContact.name ||
                      ""
                    : "",
                amount: item.message.amount || 0,
                claimAmount:
                    item.message.claim_amount || item.message.amount || 0,
                claimTime: item.claimTime,
                claimDate: new Date(item.claimTime).toISOString().split("T")[0],
            };
        });

        summaryData[playerWechatId][year] = simplifiedData;

        // 使用和消息数据相同的机制（_setData）
        _setData(DATA_KEYS.REDPACKET_SUMMARY, summaryData);

        console.info(
            "[小馨手机][微信数据] 保存红包汇总数据:",
            "playerWechatId:",
            playerWechatId,
            "year:",
            year,
            "红包数量:",
            simplifiedData.length,
            "数据键:",
            _getAccountDataKey(DATA_KEYS.REDPACKET_SUMMARY)
        );
    }

    // 读取红包汇总数据（按微信ID和年份）
    // 尝试从多个可能的数据键读取，确保无论是否有角色卡都能访问
    function getRedpacketSummary(playerWechatId, year) {
        if (!playerWechatId) {
            return [];
        }

        if (!window.XiaoxinDataManager) {
            return [];
        }

        // 尝试从当前账号的数据键读取
        var summaryData = _getData(DATA_KEYS.REDPACKET_SUMMARY, {});

        // 如果当前账号的数据键没有数据，尝试从基础键读取（没有角色卡时的情况）
        if (!summaryData || Object.keys(summaryData).length === 0) {
            var baseKeyData = window.XiaoxinDataManager.getCharacterData(
                DATA_KEYS.REDPACKET_SUMMARY,
                {}
            );
            if (baseKeyData && Object.keys(baseKeyData).length > 0) {
                summaryData = baseKeyData;
                console.info(
                    "[小馨手机][微信数据] 从基础键读取红包汇总数据:",
                    "数据键:",
                    DATA_KEYS.REDPACKET_SUMMARY
                );
            }
        }

        // 如果还是没有数据，尝试从所有可能的账号键读取并合并
        if (!summaryData || Object.keys(summaryData).length === 0) {
            // 获取所有账号
            var accounts = [];
            if (window.XiaoxinWeChatAccount) {
                accounts = window.XiaoxinWeChatAccount.getAccountList() || [];
            }

            // 尝试从每个账号的数据键读取
            for (var i = 0; i < accounts.length; i++) {
                var accountId = accounts[i].id;
                if (accountId) {
                    var accountKey =
                        DATA_KEYS.REDPACKET_SUMMARY + "_account_" + accountId;
                    var accountData =
                        window.XiaoxinDataManager.getCharacterData(
                            accountKey,
                            {}
                        );
                    if (accountData && Object.keys(accountData).length > 0) {
                        // 合并数据
                        if (!summaryData) {
                            summaryData = {};
                        }
                        Object.keys(accountData).forEach(function (playerId) {
                            if (!summaryData[playerId]) {
                                summaryData[playerId] = {};
                            }
                            Object.keys(accountData[playerId] || {}).forEach(
                                function (y) {
                                    if (!summaryData[playerId][y]) {
                                        summaryData[playerId][y] = [];
                                    }
                                    // 合并该年份的数据，去重
                                    var existingIds = new Set(
                                        summaryData[playerId][y].map(function (
                                            item
                                        ) {
                                            return item.messageId;
                                        })
                                    );
                                    (accountData[playerId][y] || []).forEach(
                                        function (item) {
                                            if (
                                                !existingIds.has(item.messageId)
                                            ) {
                                                summaryData[playerId][y].push(
                                                    item
                                                );
                                                existingIds.add(item.messageId);
                                            }
                                        }
                                    );
                                }
                            );
                        });
                        console.info(
                            "[小馨手机][微信数据] 从账号键读取并合并红包汇总数据:",
                            "账号ID:",
                            accountId,
                            "数据键:",
                            accountKey
                        );
                    }
                }
            }
        }

        if (
            summaryData &&
            summaryData[playerWechatId] &&
            summaryData[playerWechatId][year]
        ) {
            console.info(
                "[小馨手机][微信数据] 读取红包汇总数据成功:",
                "playerWechatId:",
                playerWechatId,
                "year:",
                year,
                "红包数量:",
                summaryData[playerWechatId][year].length
            );
            return summaryData[playerWechatId][year] || [];
        }

        return [];
    }

    // 清除红包汇总数据（可选，用于清理旧数据）
    // 如果提供了 year 参数，只清除该年份的数据；否则清除所有年份的数据
    function clearRedpacketSummary(playerWechatId, year) {
        if (!playerWechatId) {
            return;
        }

        // 使用和消息数据相同的机制（_getData/_setData）
        var summaryData = _getData(DATA_KEYS.REDPACKET_SUMMARY, {});
        if (summaryData[playerWechatId]) {
            if (year !== undefined && year !== null) {
                // 只清除指定年份的数据
                if (summaryData[playerWechatId][year]) {
                    delete summaryData[playerWechatId][year];
                    _setData(DATA_KEYS.REDPACKET_SUMMARY, summaryData);
                    console.info(
                        "[小馨手机][微信数据] 清除红包汇总数据:",
                        playerWechatId,
                        "年份:",
                        year
                    );
                }
            } else {
                // 清除所有年份的数据
                delete summaryData[playerWechatId];
                _setData(DATA_KEYS.REDPACKET_SUMMARY, summaryData);
                console.info(
                    "[小馨手机][微信数据] 清除红包汇总数据:",
                    playerWechatId
                );
            }
        }
    }

    return {
        // 账号管理（兼容旧接口）
        getAccount: getAccount,
        setAccount: setAccount,
        initializeData: initializeData,

        // 聊天记录
        getChatHistory: getChatHistory,
        addChatMessage: addChatMessage,
        updateChatMessage: updateChatMessage,
        markVoiceMessageRead: markVoiceMessageRead,
        clearChatHistory: clearChatHistory,
        getAllChats: getAllChats,
        getFirstPlayerMessageTime: getFirstPlayerMessageTime,

        // 联系人
        getContacts: getContacts,
        addContact: addContact,
        removeContact: removeContact,
        getContact: getContact,

        // 红包汇总数据管理
        saveRedpacketSummary: saveRedpacketSummary,
        getRedpacketSummary: getRedpacketSummary,
        clearRedpacketSummary: clearRedpacketSummary,

        // 未读消息
        getUnreadCount: getUnreadCount,
        setUnreadCount: setUnreadCount,

        // 表情包分组
        getStickerCategories: getStickerCategories,
        saveStickerCategories: saveStickerCategories,
        addStickerCategory: addStickerCategory,
        updateStickerCategory: updateStickerCategory,
        removeStickerCategory: removeStickerCategory,

        // 表情包
        getStickers: getStickers,
        saveStickers: saveStickers,
        addSticker: addSticker,
        removeSticker: removeSticker,
        getAllStickers: getAllStickers,

        // 数据键（供外部使用）
        DATA_KEYS: DATA_KEYS,
        incrementUnreadCount: incrementUnreadCount,
        clearUnreadCount: clearUnreadCount,

        // 朋友圈
        getMoments: getMoments,
        getMomentsUnreadCount: getMomentsUnreadCount,
        setMomentsUnreadCount: setMomentsUnreadCount,
        getMomentsLastSeen: getMomentsLastSeen,
        setMomentsLastSeen: setMomentsLastSeen,
        getPlayerHistoryLockState: getPlayerHistoryLockState,
        addMoment: addMoment,
        removeMoment: removeMoment,
        updateMoment: updateMoment,

        // 好友申请
        getFriendRequests: getFriendRequests,
        addFriendRequest: addFriendRequest,
        updateFriendRequest: updateFriendRequest,
        acceptFriendRequest: acceptFriendRequest,
        completeFriendVerification: completeFriendVerification,
        rejectFriendRequest: rejectFriendRequest,
        processFriendApplyResponse: processFriendApplyResponse,

        // 标签库
        getAllTags: getAllTags,
        addTag: addTag,
        removeTags: removeTags,

        // 设置
        getSettings: getSettings,
        setSettings: setSettings,
        // 角色专用聊天背景
        getContactChatBackground: getContactChatBackground,
        setContactChatBackground: setContactChatBackground,

        // 表情包分组
        getStickerCategories: getStickerCategories,
        saveStickerCategories: saveStickerCategories,
        addStickerCategory: addStickerCategory,
        updateStickerCategory: updateStickerCategory,
        removeStickerCategory: removeStickerCategory,

        // 表情包
        getStickers: getStickers,
        saveStickers: saveStickers,
        addSticker: addSticker,
        removeSticker: removeSticker,
        getAllStickers: getAllStickers,

        // 控制台查看当前角色卡的表情包列表（详细版）
        // 使用方法：在浏览器控制台输入 window.XiaoxinWeChatDataHandler.showStickers()
        showStickers: function () {
            console.log("=== 当前角色卡的表情包数据（详细） ===");
            var currentCharId = null;
            if (
                window.XiaoxinDataManager &&
                typeof window.XiaoxinDataManager.getCurrentCharacterId ===
                    "function"
            ) {
                currentCharId =
                    window.XiaoxinDataManager.getCurrentCharacterId();
                console.log("角色卡ID:", currentCharId);
            }

            var allStickers = _getData(DATA_KEYS.STICKERS, {});
            console.log("表情包分组数量:", Object.keys(allStickers).length);

            Object.keys(allStickers).forEach(function (categoryId) {
                var stickers = allStickers[categoryId] || [];
                console.log(
                    "\n分组ID:",
                    categoryId,
                    "表情包数量:",
                    stickers.length
                );
                if (stickers.length > 0) {
                    console.table(
                        stickers.map(function (sticker, index) {
                            return {
                                序号: index + 1,
                                表情包ID: sticker.id || "无ID",
                                描述:
                                    sticker.description ||
                                    sticker.desc ||
                                    "无描述",
                                URL长度: (
                                    sticker.url ||
                                    sticker.src ||
                                    sticker.path ||
                                    ""
                                ).length,
                                类型: (
                                    sticker.url ||
                                    sticker.src ||
                                    sticker.path ||
                                    ""
                                ).startsWith("data:image")
                                    ? "本地上传"
                                    : "网络URL",
                            };
                        })
                    );
                }
            });

            var allStickersList = getAllStickers();
            console.log("\n=== 所有表情包汇总 ===");
            console.log("总数量:", allStickersList.length);
            console.log(
                "表情包ID列表:",
                allStickersList
                    .map(function (s) {
                        return s.id;
                    })
                    .filter(function (id) {
                        return id;
                    })
            );

            return allStickers;
        },

        // 控制台查看红包消息和领取通知的详细信息
        // 使用方法：在浏览器控制台输入 window.XiaoxinWeChatDataHandler.showRedpackets()
        showRedpackets: function () {
            console.log("=== 红包消息和领取通知详情 ===");

            if (!window.XiaoxinWeChatDataHandler) {
                console.error("XiaoxinWeChatDataHandler 未加载");
                return;
            }

            var allChats = getAllChats();
            var redpacketMessages = [];
            var claimNotifications = [];

            // 遍历所有聊天记录
            Object.keys(allChats).forEach(function (userId) {
                var messages = allChats[userId] || [];

                messages.forEach(function (msg) {
                    if (msg.type === "redpacket") {
                        redpacketMessages.push({
                            userId: userId,
                            message: msg,
                        });
                    } else if (msg.type === "redpacket_claim_notification") {
                        claimNotifications.push({
                            userId: userId,
                            message: msg,
                        });
                    }
                });
            });

            console.log(
                "\n=== 红包消息列表（共 " +
                    redpacketMessages.length +
                    " 条）==="
            );
            if (redpacketMessages.length === 0) {
                console.log("没有找到红包消息");
            } else {
                redpacketMessages.forEach(function (item, index) {
                    var msg = item.message;
                    console.log("\n【红包消息 #" + (index + 1) + "】");
                    console.log("聊天对象ID:", item.userId);
                    console.log("消息ID:", msg.id);
                    console.log(
                        "红包ID:",
                        msg.redpacket_id ||
                            (msg.payload && msg.payload.redpacket_id) ||
                            "无"
                    );
                    console.log("isOutgoing:", msg.isOutgoing);
                    console.log("sender:", msg.sender);
                    console.log(
                        "payload.from:",
                        msg.payload ? msg.payload.from : "无payload"
                    );
                    console.log(
                        "payload.to:",
                        msg.payload ? msg.payload.to : "无payload"
                    );
                    console.log("claimed:", msg.claimed);
                    console.log("claimed_by:", msg.claimed_by);
                    console.log(
                        "timestamp:",
                        msg.timestamp,
                        msg.timestamp
                            ? new Date(msg.timestamp).toLocaleString()
                            : ""
                    );
                    console.log("rawTime:", msg.rawTime);
                    console.log("完整消息对象:", msg);
                });
            }

            console.log(
                "\n=== 红包领取通知列表（共 " +
                    claimNotifications.length +
                    " 条）==="
            );
            if (claimNotifications.length === 0) {
                console.log("没有找到红包领取通知");
            } else {
                claimNotifications.forEach(function (item, index) {
                    var msg = item.message;
                    console.log("\n【领取通知 #" + (index + 1) + "】");
                    console.log("聊天对象ID:", item.userId);
                    console.log("消息ID:", msg.id);
                    console.log("红包ID:", msg.redpacket_id);
                    console.log("claimed_by:", msg.claimed_by);
                    console.log("claimerName:", msg.claimerName);
                    console.log("senderName:", msg.senderName);
                    console.log("isClaimerPlayer:", msg.isClaimerPlayer);
                    console.log("isSenderPlayer:", msg.isSenderPlayer);
                    console.log(
                        "timestamp:",
                        msg.timestamp,
                        msg.timestamp
                            ? new Date(msg.timestamp).toLocaleString()
                            : ""
                    );
                    console.log("rawTime:", msg.rawTime);
                    console.log("完整消息对象:", msg);
                });
            }

            // 尝试匹配红包消息和领取通知
            console.log("\n=== 红包消息与领取通知匹配 ===");
            redpacketMessages.forEach(function (redpacketItem) {
                var redpacketId =
                    redpacketItem.message.redpacket_id ||
                    (redpacketItem.message.payload &&
                        redpacketItem.message.payload.redpacket_id) ||
                    redpacketItem.message.id;

                console.log("\n【红包ID: " + redpacketId + "】");
                console.log("红包消息:", {
                    userId: redpacketItem.userId,
                    id: redpacketItem.message.id,
                    isOutgoing: redpacketItem.message.isOutgoing,
                    sender: redpacketItem.message.sender,
                    claimed: redpacketItem.message.claimed,
                    claimed_by: redpacketItem.message.claimed_by,
                });

                var matchedNotifications = claimNotifications.filter(function (
                    notifItem
                ) {
                    return notifItem.message.redpacket_id === redpacketId;
                });

                if (matchedNotifications.length > 0) {
                    console.log(
                        "匹配的领取通知（" +
                            matchedNotifications.length +
                            " 条）:"
                    );
                    matchedNotifications.forEach(function (notifItem, idx) {
                        console.log("  通知 #" + (idx + 1) + ":", {
                            userId: notifItem.userId,
                            id: notifItem.message.id,
                            claimerName: notifItem.message.claimerName,
                            senderName: notifItem.message.senderName,
                            isClaimerPlayer: notifItem.message.isClaimerPlayer,
                            isSenderPlayer: notifItem.message.isSenderPlayer,
                        });
                    });
                } else {
                    console.log("未找到匹配的领取通知");
                }
            });

            // 获取当前账号信息
            var currentAccount = null;
            if (window.XiaoxinWeChatAccount) {
                currentAccount =
                    window.XiaoxinWeChatAccount.getCurrentAccount();
            }
            console.log("\n=== 当前账号信息 ===");
            console.log("账号:", currentAccount);

            return {
                redpackets: redpacketMessages,
                notifications: claimNotifications,
            };
        },

        // ========== 钱包数据管理 ==========
        getWalletData: function () {
            var walletData = _getData(DATA_KEYS.WALLET, {
                balance: 0, // 零钱
                lctBalance: 0, // 零钱通余额
                lctInterest: 0, // 零钱通累计收益
                lctLastUpdateTime: null, // 上次计算利息的时间（世界观时间戳）
                cards: [], // 银行卡列表
                transactions: [], // 账单明细
            });
            return walletData;
        },

        updateWalletBalance: function (amount) {
            var walletData = this.getWalletData();
            walletData.balance = (walletData.balance || 0) + amount;
            if (walletData.balance < 0) {
                walletData.balance = 0;
            }
            _setData(DATA_KEYS.WALLET, walletData);
            return walletData.balance;
        },

        updateLctBalance: function (amount) {
            var walletData = this.getWalletData();

            // 先计算一次利息（如果之前有余额）
            if (walletData.lctBalance > 0 && walletData.lctLastUpdateTime) {
                this.calculateLctDailyInterest();
                walletData = this.getWalletData(); // 重新获取更新后的数据
            }

            walletData.lctBalance = (walletData.lctBalance || 0) + amount;
            if (walletData.lctBalance < 0) {
                walletData.lctBalance = 0;
            }

            // 如果余额为0，重置利息计算时间
            if (walletData.lctBalance <= 0) {
                walletData.lctLastUpdateTime = null;
            }
            // 如果存入金额大于0，记录当前世界观时间作为利息计算的起始时间
            else if (amount > 0) {
                // 只使用世界观时间，不使用系统时间
                var currentWorldTime = null;
                if (window.XiaoxinWorldClock) {
                    currentWorldTime =
                        window.XiaoxinWorldClock.currentTimestamp ||
                        window.XiaoxinWorldClock.timestamp ||
                        null;
                }
                // 如果没有世界观时间，不设置初始时间（避免使用系统时间）
                if (currentWorldTime) {
                    // 如果是第一次存入或之前余额为0，设置初始时间
                    if (!walletData.lctLastUpdateTime) {
                        walletData.lctLastUpdateTime = currentWorldTime;
                    }
                } else {
                    console.info(
                        "[小馨手机][微信钱包] 无法获取世界观时间，暂不设置零钱通初始时间"
                    );
                }
            }

            _setData(DATA_KEYS.WALLET, walletData);
            return walletData.lctBalance;
        },

        // 计算零钱通每日利息（根据世界观时间推进）
        calculateLctDailyInterest: function () {
            var walletData = this.getWalletData();
            var balance = walletData.lctBalance || 0;

            // 如果没有余额，不需要计算利息
            if (balance <= 0) {
                return 0;
            }

            // 获取当前世界观时间（只使用世界观时间，不使用系统时间）
            var currentWorldTime = null;
            if (window.XiaoxinWorldClock) {
                currentWorldTime =
                    window.XiaoxinWorldClock.currentTimestamp ||
                    window.XiaoxinWorldClock.timestamp ||
                    null;
            }

            // 如果没有世界观时间，不计算利息（避免使用系统时间导致错误计算）
            if (!currentWorldTime) {
                console.info(
                    "[小馨手机][微信钱包] 无法获取世界观时间，跳过利息计算"
                );
                return 0;
            }

            // 如果没有上次更新时间，设置为当前世界观时间
            if (!walletData.lctLastUpdateTime) {
                walletData.lctLastUpdateTime = currentWorldTime;
                _setData(DATA_KEYS.WALLET, walletData);
                return 0;
            }

            // 计算时间差（毫秒）
            var timeDiff = currentWorldTime - walletData.lctLastUpdateTime;

            // 如果时间差小于0，说明时间倒退了，不计算利息
            if (timeDiff < 0) {
                return 0;
            }

            // 计算经过的天数（向下取整）
            var daysPassed = Math.floor(timeDiff / (24 * 60 * 60 * 1000));

            // 如果还没有过一天，不计算利息
            if (daysPassed < 1) {
                return 0;
            }

            // 七日年化收益率 2.5%
            var annualRate = 0.025;
            // 每日收益率
            var dailyRate = annualRate / 365;

            // 计算总利息（余额 × 每日收益率 × 经过的天数）
            var totalInterest = balance * dailyRate * daysPassed;

            // 更新累计收益
            walletData.lctInterest =
                (walletData.lctInterest || 0) + totalInterest;

            // 更新上次计算时间（使用当前世界观时间减去不足一天的部分）
            var remainingTime = timeDiff % (24 * 60 * 60 * 1000);
            walletData.lctLastUpdateTime = currentWorldTime - remainingTime;

            _setData(DATA_KEYS.WALLET, walletData);

            console.info("[小馨手机][微信钱包] 零钱通利息计算:", {
                balance: balance,
                daysPassed: daysPassed,
                interest: totalInterest,
                totalInterest: walletData.lctInterest,
            });

            return totalInterest;
        },

        addLctInterest: function (amount) {
            var walletData = this.getWalletData();
            walletData.lctInterest = (walletData.lctInterest || 0) + amount;
            // 注意：不更新 lctBalance，保持本金不变，这样利息计算基于原始本金（单利）
            // 显示的总额 = lctBalance + lctInterest
            _setData(DATA_KEYS.WALLET, walletData);
            return walletData.lctInterest;
        },

        addWalletCard: function (cardInfo) {
            var walletData = this.getWalletData();
            if (!walletData.cards) {
                walletData.cards = [];
            }
            walletData.cards.push(cardInfo);
            _setData(DATA_KEYS.WALLET, walletData);
            return walletData.cards;
        },

        removeWalletCard: function (cardIndex) {
            var walletData = this.getWalletData();
            if (walletData.cards && walletData.cards[cardIndex]) {
                walletData.cards.splice(cardIndex, 1);
                _setData(DATA_KEYS.WALLET, walletData);
            }
            return walletData.cards || [];
        },

        addWalletTransaction: function (transaction) {
            var walletData = this.getWalletData();
            if (!walletData.transactions) {
                walletData.transactions = [];
            }
            // 添加到列表开头
            walletData.transactions.unshift(transaction);
            // 限制最多保存100条记录
            if (walletData.transactions.length > 100) {
                walletData.transactions = walletData.transactions.slice(0, 100);
            }
            _setData(DATA_KEYS.WALLET, walletData);
            return walletData.transactions;
        },
    };
})();
