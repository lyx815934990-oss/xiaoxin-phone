// 微信消息解析器 - 接收全局监听器的消息并解析

window.XiaoxinWeChatParser = (function () {
    // ========== 工具：判断是否与当前玩家账号信息冲突（防止AI把玩家联系方式写进角色字段） ==========
    function _isSameAsPlayerContact(value) {
        try {
            if (!value) return false;
            var v = String(value).trim();
            if (!v) return false;

            var acc =
                window.XiaoxinWeChatAccount &&
                typeof window.XiaoxinWeChatAccount.getCurrentAccount ===
                    "function"
                    ? window.XiaoxinWeChatAccount.getCurrentAccount()
                    : null;
            if (!acc) return false;

            var playerPhone = String(acc.phone || acc.tel || acc.mobile || "")
                .trim();
            var playerWechatId = String(
                acc.wechatId || acc.wxid || acc.id || ""
            ).trim();

            return (playerPhone && v === playerPhone) || (playerWechatId && v === playerWechatId);
        } catch (e) {
            return false;
        }
    }

    // ========== 工具：清理角色好友申请中的联系方式字段 ==========
    function _sanitizeRoleFriendRequestKv(kv) {
        if (!kv) return kv;
        // 这些字段必须是“角色自己的”，如果误等于玩家账号信息，直接清空，避免污染联系人/申请记录
        if (kv["电话号码"] && _isSameAsPlayerContact(kv["电话号码"])) {
            console.warn(
                "[小馨手机][微信解析] 检测到角色好友申请误用了玩家手机号，已清空该字段:",
                kv["电话号码"]
            );
            kv["电话号码"] = "";
        }
        if (kv["微信号"] && _isSameAsPlayerContact(kv["微信号"])) {
            console.warn(
                "[小馨手机][微信解析] 检测到角色好友申请误用了玩家微信号，已清空该字段:",
                kv["微信号"]
            );
            kv["微信号"] = "";
        }
        return kv;
    }

    // ========== 工具：安全解析形如 `字段=值` 的行 ==========
    function _parseKeyValueLines(blockText) {
        var result = {};
        if (!blockText) return result;

        // 将 <br> 标签统一当作换行处理，兼容 DOM 拼出来的一行多字段情况
        var normalized = String(blockText).replace(/<br\s*\/?>/gi, "\n");

        var lines = normalized
            .split(/\r?\n/)
            .map(function (line) {
                return line.trim();
            })
            .filter(function (line) {
                return line && line.indexOf("=") !== -1;
            });

        lines.forEach(function (line) {
            // 一行里可能有多个 “键=值” 对，用正则全部提取出来
            var pairRegex = /([^=\s]+)\s*=\s*([^=]+?)(?=(?:\s+[^=\s]+=\s*)|$)/g;
            var m;
            while ((m = pairRegex.exec(line)) !== null) {
                var key = (m[1] || "")
                    .trim()
                    .replace(/^[\uFEFF\xEF\xBB\xBF]+/, "");
                var value = (m[2] || "").trim();
                if (!key) continue;
                result[key] = value;
            }
        });

        return result;
    }

    // ========== 解析玩家/角色好友申请指令 ==========
    // 支持：
    // - [wx_friend_apply] ... [/wx_friend_apply]    （玩家发出的好友申请）
    // - [wx_friend_request] ... [/wx_friend_request]（角色发出的好友申请）
    function parseFriendRequestsFromText(rawText, messageMeta) {
        if (!rawText || typeof rawText !== "string") {
            return [];
        }

        var requests = [];

        // 玩家 -> 角色
        var applyRegex = /\[wx_friend_apply\]([\s\S]*?)\[\/wx_friend_apply\]/gi;
        var match;
        while ((match = applyRegex.exec(rawText)) !== null) {
            var body = match[1] || "";
            var kv = _parseKeyValueLines(body);
            if (!kv["角色ID"]) {
                continue;
            }

            // 处理角色ID：如果格式是 "contact_X"，提取出数字部分
            var roleIdRaw = kv["角色ID"] || "";
            var roleIdClean = String(roleIdRaw).trim();
            // 如果角色ID是 "contact_1" 格式，提取出 "1"
            if (roleIdClean.indexOf("contact_") === 0) {
                roleIdClean = roleIdClean.replace(/^contact_/, "");
            }

            // 优先从格式中的"时间"字段读取，如果没有则使用 messageMeta 中的时间
            var requestTime = kv["时间"] || "";
            var requestTimestamp = null;
            var requestRawTime = requestTime || (messageMeta && messageMeta.rawTime ? messageMeta.rawTime : "");
            
            // 如果格式中有时间字段，解析它
            if (requestTime) {
                var normalizedTimeStr = requestTime
                    .replace(/-/g, "/")
                    .replace(/年/g, "/")
                    .replace(/月/g, "/")
                    .replace(/日/g, " ")
                    .replace(/星期[一二三四五六日]/g, "")
                    .trim();
                var parsed = Date.parse(normalizedTimeStr);
                if (!isNaN(parsed)) {
                    requestTimestamp = parsed;
                    console.info(
                        "[小馨手机][微信解析] 从好友申请格式中解析时间:",
                        requestTime,
                        "->",
                        requestTimestamp
                    );
                }
            }
            
            // 如果没有解析到时间戳，使用 messageMeta 中的时间
            if (!requestTimestamp) {
                requestTimestamp = messageMeta && messageMeta.time ? messageMeta.time : null;
            }

            requests.push({
                direction: "player_to_role",
                roleId: roleIdClean, // 使用清理后的角色ID
                roleIdOriginal: roleIdRaw, // 保留原始值用于调试
                greeting: kv["打招呼内容"] || "",
                remark: kv["备注"] || "",
                tags: kv["标签"] || "",
                permissions: kv["朋友权限"] || "",
                extra: kv,
                raw: match[0],
                timestamp: requestTimestamp,
                time: requestTimestamp, // 兼容旧字段
                rawTime: requestRawTime, // 原始时间字符串（优先使用格式中的时间字段）
                sourceMessageId:
                    messageMeta && messageMeta.id ? messageMeta.id : null,
            });
        }

        // 角色 -> 玩家
        var roleRegex =
            /\[wx_friend_request\]([\s\S]*?)\[\/wx_friend_request\]/gi;
        while ((match = roleRegex.exec(rawText)) !== null) {
            var body2 = match[1] || "";
            var kv2 = _parseKeyValueLines(body2);
            kv2 = _sanitizeRoleFriendRequestKv(kv2);
            if (!kv2["角色ID"]) {
                continue;
            }

            // 清理角色ID（兼容 contact_ 前缀）
            var roleIdRaw2 = kv2["角色ID"] || "";
            var roleIdClean2 = String(roleIdRaw2).trim();
            if (roleIdClean2.indexOf("contact_") === 0) {
                roleIdClean2 = roleIdClean2.replace(/^contact_/, "");
            }

            // 优先从格式中的"时间"字段读取，如果没有则使用 messageMeta 中的时间
            var requestTime2 = kv2["时间"] || "";
            var requestTimestamp2 = null;
            var requestRawTime2 = requestTime2 || (messageMeta && messageMeta.rawTime ? messageMeta.rawTime : "");
            
            // 如果格式中有时间字段，解析它
            if (requestTime2) {
                var normalizedTimeStr2 = requestTime2
                    .replace(/-/g, "/")
                    .replace(/年/g, "/")
                    .replace(/月/g, "/")
                    .replace(/日/g, " ")
                    .replace(/星期[一二三四五六日]/g, "")
                    .trim();
                var parsed2 = Date.parse(normalizedTimeStr2);
                if (!isNaN(parsed2)) {
                    requestTimestamp2 = parsed2;
                    console.info(
                        "[小馨手机][微信解析] 从角色好友申请格式中解析时间:",
                        requestTime2,
                        "->",
                        requestTimestamp2
                    );
                }
            }
            
            // 如果没有解析到时间戳，使用 messageMeta 中的时间
            if (!requestTimestamp2) {
                requestTimestamp2 = messageMeta && messageMeta.time ? messageMeta.time : null;
            }

            requests.push({
                direction: "role_to_player",
                roleId: roleIdClean2,
                roleIdOriginal: roleIdRaw2,
                greeting: kv2["申请理由"] || "",
                remark: kv2["微信昵称"] || "",
                tags: "",
                permissions: "",
                extra: kv2,
                raw: match[0],
                timestamp: requestTimestamp2,
                time: requestTimestamp2, // 兼容旧字段
                rawTime: requestRawTime2, // 原始时间字符串（优先使用格式中的时间字段）
                sourceMessageId:
                    messageMeta && messageMeta.id ? messageMeta.id : null,
            });
        }

        return requests;
    }

    // ========== 解析角色响应好友申请指令 ==========
    // 支持：[wx_friend_apply_response] ... [/wx_friend_apply_response]
    // 支持一次性解析多个响应标签，返回数组
    function parseFriendApplyResponse(rawText, messageMeta) {
        if (!rawText || typeof rawText !== "string") {
            return null;
        }

        var regex =
            /\[wx_friend_apply_response\]([\s\S]*?)\[\/wx_friend_apply_response\]/gi;
        var responses = [];
        var match;

        // 循环匹配所有响应标签
        while ((match = regex.exec(rawText)) !== null) {
            var body = match[1] || "";
            var kv = _parseKeyValueLines(body);

            var roleId = kv["角色ID"] || kv["角色id"] || kv["roleId"] || "";
            var status = kv["状态"] || kv["status"] || "";

            if (!roleId || !status) {
                console.warn("[小馨手机][微信解析] 好友申请响应缺少必填字段:", kv);
                continue; // 跳过这个响应，继续处理下一个
            }

            // 标准化状态值
            var normalizedStatus = "";
            if (
                status === "同意" ||
                status.toLowerCase() === "accepted" ||
                status.toLowerCase() === "accept"
            ) {
                normalizedStatus = "accepted";
            } else if (
                status === "拒绝" ||
                status.toLowerCase() === "rejected" ||
                status.toLowerCase() === "reject"
            ) {
                normalizedStatus = "rejected";
            } else if (status === "搁置" || status.toLowerCase() === "pending") {
                normalizedStatus = "pending";
            } else {
                console.warn(
                    "[小馨手机][微信解析] 未知的好友申请响应状态:",
                    status
                );
                continue; // 跳过这个响应，继续处理下一个
            }

            // 优先从格式中的"时间"字段读取，如果没有则使用 messageMeta 中的时间
            var responseTime = kv["时间"] || "";
            var responseTimestamp = null;
            var responseRawTime = responseTime || (messageMeta && messageMeta.rawTime ? messageMeta.rawTime : "");
            
            // 如果格式中有时间字段，解析它
            if (responseTime) {
                var normalizedTimeStr = responseTime
                    .replace(/-/g, "/")
                    .replace(/年/g, "/")
                    .replace(/月/g, "/")
                    .replace(/日/g, " ")
                    .replace(/星期[一二三四五六日]/g, "")
                    .replace(/\s+/g, " ") // 将多个连续空格替换为单个空格
                    .trim();
                var parsed = Date.parse(normalizedTimeStr);
                if (!isNaN(parsed)) {
                    responseTimestamp = parsed;
                    console.info(
                        "[小馨手机][微信解析] 从好友申请响应格式中解析时间:",
                        responseTime,
                        "规范化后:",
                        normalizedTimeStr,
                        "->",
                        responseTimestamp
                    );
                } else {
                    console.warn(
                        "[小馨手机][微信解析] 无法解析好友申请响应时间:",
                        responseTime,
                        "规范化后:",
                        normalizedTimeStr
                    );
                }
            }
            
            // 如果没有解析到时间戳，使用 messageMeta 中的时间
            if (!responseTimestamp && messageMeta && messageMeta.time) {
                responseTimestamp = messageMeta.time;
                console.info(
                    "[小馨手机][微信解析] 使用 messageMeta 中的时间:",
                    responseTimestamp
                );
            }

            responses.push({
                roleId: String(roleId).trim(),
                status: normalizedStatus,
                raw: match[0],
                timestamp: responseTimestamp, // 优先使用格式中的时间，其次使用 messageMeta 中的时间
                time: responseTimestamp, // 兼容旧字段
                rawTime: responseRawTime, // 原始时间字符串（优先使用格式中的时间字段）
                sourceMessageId:
                    messageMeta && messageMeta.id ? messageMeta.id : null,
            });
        }

        // 如果只解析到一个响应，为了向后兼容，返回单个对象而不是数组
        if (responses.length === 1) {
            return responses[0];
        }
        // 如果解析到多个响应，返回数组
        if (responses.length > 1) {
            return responses;
        }
        // 如果没有解析到任何响应，返回 null
        return null;
    }

    // 解析联系方式数据
    function parseContacts(contacts, messageId) {
        if (!contacts || contacts.length === 0) {
            return;
        }

        if (!window.XiaoxinWeChatDataHandler) {
            console.warn("[小馨手机][微信解析] 数据处理器未加载");
            return;
        }

        console.info(
            "[小馨手机][微信解析] 开始处理联系人数据，数量:",
            contacts.length
        );

        contacts.forEach(function (contact) {
            try {
                // 检查联系人是否已存在（根据手机号或微信号）
                var existingContacts =
                    window.XiaoxinWeChatDataHandler.getContacts() || [];
                var existingContact = existingContacts.find(function (c) {
                    return (
                        c.phone === contact.phone ||
                        c.phoneNumber === contact.phone ||
                        c.wechatId === contact.wechatId ||
                        c.wechat_id === contact.wechatId ||
                        c.wechatID === contact.wechatId
                    );
                });

                // 默认：只是剧情中出现过联系方式，还没加为好友
                // 如果 contact 中没有显式设置 isFriend，默认为 false（待添加状态）
                if (contact.isFriend !== true && contact.isFriend !== false) {
                    contact.isFriend = false;
                }
                if (!contact.friendStatus) {
                    contact.friendStatus = contact.isFriend
                        ? "friend"
                        : "pending";
                }

                if (!existingContact) {
                    // 添加新联系人（待添加状态，还不是好友）
                    window.XiaoxinWeChatDataHandler.addContact(contact);
                    console.info(
                        "[小馨手机][微信解析] 已添加潜在联系人（待添加）:",
                        contact.nickname || contact.wechatId,
                        "好友状态:",
                        contact.friendStatus
                    );

                    // 触发自定义事件（注意：这里不触发"已添加到通讯录"，因为还不是好友）
                    if (typeof window.CustomEvent !== "undefined") {
                        var event = new CustomEvent("xiaoxin-contact-added", {
                            detail: { contact: contact },
                        });
                        window.dispatchEvent(event);
                    }
                } else {
                    // 更新联系人信息（保留原来的好友状态）
                    var merged = Object.assign({}, existingContact, contact);
                    // 如果之前已经是好友，就保持 isFriend=true / friendStatus='friend'
                    if (existingContact.isFriend === true) {
                        merged.isFriend = true;
                        merged.friendStatus = "friend";
                    } else if (contact.isFriend !== true) {
                        // 如果新数据不是好友，保持原来的状态（可能是 pending）
                        merged.isFriend = existingContact.isFriend || false;
                        merged.friendStatus =
                            existingContact.friendStatus || "pending";
                    }
                    window.XiaoxinWeChatDataHandler.addContact(merged);
                    console.info(
                        "[小馨手机][微信解析] 已更新联系人:",
                        merged.nickname || merged.wechatId,
                        "好友状态:",
                        merged.friendStatus
                    );

                    // 触发自定义事件
                    if (typeof window.CustomEvent !== "undefined") {
                        var event = new CustomEvent("xiaoxin-contact-updated", {
                            detail: { contact: merged },
                        });
                        window.dispatchEvent(event);
                    }
                }
            } catch (error) {
                console.error(
                    "[小馨手机][微信解析] 处理联系人时出错:",
                    error,
                    contact
                );
            }
        });
    }

    return {
        parseContacts: parseContacts,
        parseFriendRequestsFromText: parseFriendRequestsFromText,
        parseFriendApplyResponse: parseFriendApplyResponse,
    };
})();
