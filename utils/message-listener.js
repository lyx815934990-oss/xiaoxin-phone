// 消息监听工具 - 负责监听角色在正文中的特定格式回复并触发相应显示

window.XiaoxinMessageListener = (function () {
    // ====== 全局世界时钟对象 ======
    if (!window.XiaoxinWorldClock) {
        window.XiaoxinWorldClock = {
            currentTimestamp: Date.now(), // 默认系统时间
            rawTime: "",
            // 返回当前 Date 对象
            now: function () {
                return new Date(this.currentTimestamp);
            },
            // 设置世界时间（毫秒）
            set: function (ts, raw) {
                if (ts && !isNaN(ts)) {
                    this.currentTimestamp = ts;
                    if (raw) this.rawTime = raw;
                    // 触发事件，给 UI / 状态栏刷新
                    window.dispatchEvent(
                        new CustomEvent("xiaoxin-world-time-changed", {
                            detail: { timestamp: ts, rawTime: raw || "" },
                        })
                    );
                }
            },
        };
    }
    // 用于避免重复处理的已处理消息ID集合
    var processedMessages = new Set();

    // ========== 玩家历史朋友圈自动生成（仅一次，满10轮触发） ==========
    var _playerHistoryGenInProgress = false;

    // 计算“人机对话回合数”：以 user+assistant 成对出现计 1 轮
    // 目标：必须达到 10 轮（10 次 user 输入 + 10 次 assistant 输出的配对）才触发玩家历史朋友圈
    function _getChatRoundCount() {
        try {
            // 优先用酒馆助手接口
            if (typeof getChatMessages === "function") {
                var msgs = getChatMessages() || [];
                var userCount = 0;
                var assistantCount = 0;
                for (var i = 0; i < msgs.length; i++) {
                    var m = msgs[i] || {};
                    if (m.is_user === true || m.role === "user") {
                        userCount++;
                    } else if (m.is_user === false || m.role === "assistant") {
                        assistantCount++;
                    }
                }
                return Math.min(userCount, assistantCount);
            }
        } catch (e) {}

        try {
            // 兜底：SillyTavern.chat
            if (window.SillyTavern && Array.isArray(window.SillyTavern.chat)) {
                var chat = window.SillyTavern.chat;
                var userCount2 = 0;
                var assistantCount2 = 0;
                for (var j = 0; j < chat.length; j++) {
                    var cm = chat[j] || {};
                    // 兼容不同字段
                    var isUser =
                        cm.is_user === true ||
                        cm.role === "user" ||
                        cm.name === "user" ||
                        cm.isUser === true;
                    var isAssistant =
                        cm.is_user === false ||
                        cm.role === "assistant" ||
                        cm.name === "assistant" ||
                        cm.isAssistant === true;
                    if (isUser) userCount2++;
                    else if (isAssistant) assistantCount2++;
                }
                return Math.min(userCount2, assistantCount2);
            }
        } catch (e2) {}

        return 0;
    }

    function _extractRecentChatForPrompt(maxMessages) {
        maxMessages = maxMessages || 20;
        try {
            var msgs = [];
            if (typeof getChatMessages === "function") {
                msgs = getChatMessages() || [];
            } else if (window.SillyTavern && Array.isArray(window.SillyTavern.chat)) {
                msgs = window.SillyTavern.chat || [];
            }
            if (!msgs.length) return "";

            var slice = msgs.slice(Math.max(0, msgs.length - maxMessages));
            var lines = [];
            for (var i = 0; i < slice.length; i++) {
                var m = slice[i] || {};
                var role =
                    m.is_user === true || m.role === "user" || m.name === "user"
                        ? "user"
                        : "assistant";
                var text =
                    m.content ||
                    m.mes ||
                    m.text ||
                    m.raw ||
                    m.original ||
                    "";
                text = String(text || "")
                    .replace(/\[\/?(moments|moment|moments-interactions|wx_contact|MSG|wx_friend_request|wx_friend_response)[^\]]*\]/gi, "")
                    .replace(/\s+/g, " ")
                    .trim();
                if (!text) continue;
                lines.push(role + ": " + text);
            }
            return lines.join("\n");
        } catch (e) {
            return "";
        }
    }

    function _parseMomentsJson(raw) {
        // 允许模型输出额外解释，截取 JSON 数组部分
        var txt = String(raw || "");
        var start = txt.indexOf("[");
        var end = txt.lastIndexOf("]");
        if (start === -1 || end === -1 || end <= start) {
            throw new Error("生文API返回不是JSON数组");
        }
        var jsonText = txt.slice(start, end + 1);
        var arr = JSON.parse(jsonText);
        if (!Array.isArray(arr)) {
            throw new Error("生文API返回不是数组");
        }
        return arr;
    }

    function _toTimestampMs(v) {
        if (!v) return null;
        if (typeof v === "number" && !isNaN(v)) return v;
        var s = String(v).trim();
        // 兼容 "2015-09-20 22:15:00"
        var normalized = s.replace(/-/g, "/");
        var t = Date.parse(normalized);
        if (!isNaN(t)) return t;
        return null;
    }

    async function _tryAutoGeneratePlayerHistoryMoments() {
        if (_playerHistoryGenInProgress) return;
        if (!window.XiaoxinWeChatDataHandler) return;
        if (typeof window.XiaoxinWeChatDataHandler.addMoment !== "function") return;

        // 满 10 轮（按用户消息数）
        var rounds = _getChatRoundCount();
        if (rounds < 10) return;

        // 已生成过则跳过
        try {
            if (typeof window.XiaoxinWeChatDataHandler.getPlayerHistoryLockState === "function") {
                var lockState = window.XiaoxinWeChatDataHandler.getPlayerHistoryLockState();
                if (lockState && lockState.generated === true) {
                    return;
                }
            }
        } catch (e) {}

        // 生文 API 可用性
        if (!window.XiaoxinAI || typeof window.XiaoxinAI.generateText !== "function") {
            return;
        }

        _playerHistoryGenInProgress = true;
        try {
            console.info("[小馨手机][玩家历史朋友圈] 满10轮触发，开始自动生成...");

            var recentChat = _extractRecentChatForPrompt(24);
            var systemPrompt =
                "你是一个“玩家朋友圈历史生成器”。请根据最近对话，生成玩家本人（author=player）的历史朋友圈，要求：\n" +
                "1) 只输出 JSON 数组，不要任何解释。\n" +
                "2) 生成 3-6 条，每条包含：type（文字/文字＋图片/图片/分享音乐之一）、content（字符串）、images（可选字符串数组，图片描述，不要URL）、location（可选字符串）、timestamp（过去时间，字符串如 2015-09-20 22:15:00 或毫秒时间戳）。\n" +
                "3) 禁止出现玩家真实个人隐私信息；不要生成任何联系方式块；不要生成任何玩家互动（点赞/评论/回复）。\n" +
                "4) 风格像真实朋友圈，贴合对话语气。\n";
            var userPrompt =
                "最近对话（仅供取材，可能已去除标签）：\n" +
                (recentChat || "(空)") +
                "\n\n请输出 JSON 数组：";

            var raw = await window.XiaoxinAI.generateText(
                [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                { temperature: 0.7, maxTokens: 1200 }
            );

            var items = _parseMomentsJson(raw);
            if (!items.length) {
                throw new Error("生文API返回空数组");
            }

            // 生成历史时间兜底（过去 30-365 天随机）
            function fallbackPastTs(idx) {
                var days = 30 + Math.floor(Math.random() * 335);
                var base = Date.now() - days * 86400000;
                return base - idx * 3600000;
            }

            var saved = 0;
            for (var i = 0; i < items.length; i++) {
                var it = items[i] || {};
                var ts = _toTimestampMs(it.timestamp);
                if (!ts) ts = fallbackPastTs(i);

                var moment = {
                    authorId: "player",
                    type: String(it.type || "文字"),
                    content: String(it.content || "").trim(),
                    timestamp: ts,
                    addedAt: Date.now(),
                    _explicitTimestampTag: true, // 允许写入玩家“历史朋友圈”
                };

                if (it.location) {
                    moment.location = String(it.location).trim();
                }

                if (Array.isArray(it.images) && it.images.length > 0) {
                    moment.images = it.images.map(function (x) {
                        return String(x || "").trim();
                    }).filter(Boolean);
                }

                // 音乐类型可选：允许模型用 music 字段（对象）
                if (it.music && typeof it.music === "object") {
                    moment.type = "music";
                    moment.music = it.music;
                }

                if (!moment.content && !(moment.images && moment.images.length) && !moment.music) {
                    continue;
                }

                window.XiaoxinWeChatDataHandler.addMoment(moment);
                saved++;
            }

            if (saved <= 0) {
                throw new Error("未写入任何有效朋友圈");
            }

            console.info("[小馨手机][玩家历史朋友圈] 自动生成并写入成功，数量:", saved);
        } catch (e) {
            console.error("[小馨手机][玩家历史朋友圈] 自动生成失败:", e);
            try {
                if (typeof toastr !== "undefined") {
                    toastr.error(
                        "生成玩家历史朋友圈失败：请先在手机主页设置中配置生文API（API地址/API Key/模型名称）。",
                        "小馨手机"
                    );
                }
            } catch (e2) {}
        } finally {
            _playerHistoryGenInProgress = false;
        }
    }

    // 检查消息是否在聊天记录中（已保留的消息）
    function isMessageInChatHistory(messageElement) {
        if (!messageElement) {
            return false;
        }

        var $message = $(messageElement);

        // 查找消息的父容器，检查是否在聊天记录区域
        var $parent = $message.closest(
            "#chat, .chat, #chatContainer, .chat-container, [id*='chat'], [class*='chat']"
        );
        if ($parent.length === 0) {
            return false;
        }

        // 检查消息是否在"草稿"、"临时"、"选择"或"候选"区域
        var $swipeContainer = $message.closest(
            ".swipe_message, .swipe-message, .swipe-container, [class*='swipe'], [class*='draft'], [class*='temp'], [class*='candidate'], [class*='alternative']"
        );
        if ($swipeContainer.length > 0) {
            return false;
        }

        // 检查消息是否在"消息列表"中（已发送的消息）
        var $mesContainer = $message.closest(".mes, [class*='mes']");
        if ($mesContainer.length > 0) {
            var $swipeCheck = $mesContainer.closest(
                "[class*='swipe'], [class*='draft'], [class*='temp']"
            );
            if ($swipeCheck.length === 0) {
                return true;
            }
        }

        // 如果消息在聊天记录区域，且不在任何临时容器中，也认为是已保留的
        return $message.closest(".mes_stash, [class*='stash']").length === 0;
    }

    // 解码常见 HTML 实体（尤其是 &amp; 会导致 URL 失效）
    function decodeHtmlEntities(text) {
        if (!text) return "";
        try {
            var temp = document.createElement("div");
            temp.innerHTML = String(text);
            return temp.textContent || temp.innerText || String(text);
        } catch (e) {
            // 兜底：手动解码常见实体
            return String(text)
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&amp;/g, "&");
        }
    }

    // 清理字段值中的 HTML 标签和多余内容（并解码实体，避免头像URL等被 &amp; 破坏）
    function cleanFieldValue(value) {
        if (!value) return "";
        return decodeHtmlEntities(String(value))
            .replace(/<br\s*\/?>/gi, "")
            .replace(/&lt;br\s*\/?.*?&gt;/gi, "") // 已被转义的 <br>
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;/gi, " ")
            .trim();
    }

    // ====== 任何用作 ID / wechatId / characterId 的字段必须先调用此函数 ======
    function cleanId(raw) {
        return cleanFieldValue(raw);
    }

    // 将常见 HTML 换行/段落标签规范为换行，避免 <p><br> 造成重复
    function normalizeHtmlNewlines(text) {
        if (!text) return "";
        return String(text)
            .replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, "\n")
            .replace(/<p[^>]*>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .trim();
    }

    // 解析时间标签 [time]...[/time]，更新全局世界观时间并隐藏标签
    // 返回处理后的内容和时间信息对象
    function parseTimeTag(messageContent) {
        if (!messageContent || typeof messageContent !== "string") {
            return {
                content: messageContent,
                timestamp: null,
                rawTime: "",
            };
        }
        var timeRegex = /\[time\]([\s\S]*?)\[\/time\]/i;
        var content = messageContent;
        var match;
        var foundTimestamp = null;
        var foundRawTime = "";

        while ((match = timeRegex.exec(content)) !== null) {
            var timeStr = cleanFieldValue(match[1] || "");
            if (timeStr) {
                // 解析时间字符串（支持中文格式）
                // 格式1: 2018年6月20日 星期三 07:59:00
                // 格式2: 2018-06-20 07:59:00
                // 格式3: 2018/06/20 07:59:00
                var normalizedTimeStr = timeStr
                    .replace(/-/g, "/")
                    .replace(/年/g, "/")
                    .replace(/月/g, "/")
                    .replace(/日/g, " ")
                    .replace(/星期[一二三四五六日]/g, "")
                    .trim();
                var ts = Date.parse(normalizedTimeStr);

                if (isNaN(ts)) {
                    console.warn(
                        "[小馨手机][消息监听] 无法解析时间标签:",
                        timeStr,
                        "规范化后:",
                        normalizedTimeStr
                    );
                    // 如果解析失败，不更新世界观时钟
                } else {
                    if (!window.XiaoxinWorldClock)
                        window.XiaoxinWorldClock = {};
                    window.XiaoxinWorldClock.raw = timeStr;
                    window.XiaoxinWorldClock.rawTime = timeStr; // 兼容字段名
                    window.XiaoxinWorldClock.currentTimestamp = ts;
                    window.XiaoxinWorldClock.timestamp =
                        window.XiaoxinWorldClock.currentTimestamp; // 兼容字段名
                    foundTimestamp = window.XiaoxinWorldClock.currentTimestamp;
                    foundRawTime = timeStr;

                    console.info(
                        "[小馨手机][消息监听] 更新世界观时间:",
                        "原始字符串:",
                        timeStr,
                        "时间戳:",
                        ts,
                        "日期:",
                        new Date(ts).toLocaleString("zh-CN")
                    );
                }
                try {
                    window.dispatchEvent(
                        new CustomEvent("xiaoxin-world-time-updated", {
                            detail: {
                                raw: window.XiaoxinWorldClock.raw,
                                rawTime: window.XiaoxinWorldClock.rawTime,
                                timestamp:
                                    window.XiaoxinWorldClock.currentTimestamp,
                            },
                        })
                    );
                } catch (e) {}
            }
            content =
                content.slice(0, match.index) +
                content.slice(match.index + match[0].length);
            timeRegex.lastIndex = 0;
        }
        return {
            content: content,
            timestamp:
                foundTimestamp ||
                (window.XiaoxinWorldClock &&
                window.XiaoxinWorldClock.currentTimestamp
                    ? window.XiaoxinWorldClock.currentTimestamp
                    : null),
            rawTime:
                foundRawTime ||
                (window.XiaoxinWorldClock && window.XiaoxinWorldClock.rawTime
                    ? window.XiaoxinWorldClock.rawTime
                    : ""),
        };
    }

    // 隐藏 DOM 中的 [time]...[/time] 标签
    function hideTimeTagsInDom(messageElement) {
        if (!messageElement) return;
        var $mes = $(messageElement).closest(".mes");
        if ($mes.length === 0) $mes = $(messageElement);
        var $messageText = $mes.find(
            ".mes_text, .mesText, .message-text, [class*='mes_text']"
        );
        if ($messageText.length === 0) $messageText = $mes;
        var html = $messageText.html() || "";
        var replaced = html.replace(/\[time\][\s\S]*?\[\/time\]/gi, "");
        if (replaced !== html) {
            $messageText.html(replaced);
        }
    }

    // 解析联系方式标签（支持 [wx_contact]...[/wx_contact] 格式）
    function parseContactTags(messageContent) {
        if (!messageContent || typeof messageContent !== "string") {
            return [];
        }

        var contacts = [];
        // 支持 [wx_contact]...[/wx_contact] 格式（方括号不会被HTML处理）
        var contactRegex = /\[wx_contact\]([\s\S]*?)\[\/wx_contact\]/gi;
        var match;

        while ((match = contactRegex.exec(messageContent)) !== null) {
            var contactContent = match[1];
            var contact = {};
            var previousLine = "";

            // 解析各个字段
            var lines = contactContent.split("\n");
            // 用于跟踪已处理的字段，避免重复处理
            var processedFields = {};

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line) {
                    previousLine = "";
                    continue;
                }

                var equalIndex = line.indexOf("=");

                // 处理"头像"和"URL"分开的情况
                if (previousLine === "头像" && equalIndex !== -1) {
                    var fieldName = line.substring(0, equalIndex).trim();
                    var fieldValue = line.substring(equalIndex + 1).trim();
                    if (fieldName === "URL" && fieldValue) {
                        // 避免重复处理头像URL
                        if (!processedFields["头像URL"]) {
                            contact.avatar = fieldValue;
                            processedFields["头像URL"] = true;
                        }
                        previousLine = "";
                        continue;
                    }
                }

                if (equalIndex === -1) {
                    previousLine = line;
                    continue;
                }

                var fieldName = line.substring(0, equalIndex).trim();
                var fieldValue = line.substring(equalIndex + 1).trim();

                if (fieldName && fieldValue) {
                    // 检查是否已经处理过该字段（避免重复处理，特别是角色ID）
                    var fieldKey = fieldName.toLowerCase();
                    if (processedFields[fieldKey]) {
                        console.warn(
                            "[小馨手机][消息监听] parseContactTags: 检测到重复字段，跳过:",
                            fieldName,
                            "=",
                            fieldValue
                        );
                        previousLine = "";
                        continue;
                    }

                    if (
                        fieldName === "角色ID" ||
                        fieldName === "角色id" ||
                        fieldName === "characterId" ||
                        fieldName === "character_id"
                    ) {
                        var cleanId = cleanFieldValue(fieldValue);
                        contact.characterId = parseInt(cleanId) || cleanId;
                        // 标记已处理，避免重复
                        processedFields["角色id"] = true;
                        processedFields["characterid"] = true;
                        processedFields["character_id"] = true;
                    } else if (
                        fieldName === "电话号码" ||
                        fieldName === "phone" ||
                        fieldName === "phoneNumber"
                    ) {
                        // 清理电话号码中的 HTML 和非数字字符，确保只保留纯数字
                        var rawPhone = cleanFieldValue(fieldValue);
                        var digitsOnly = rawPhone.replace(/[^\d]/g, "");
                        contact.phone = digitsOnly;
                        contact.phoneNumber = digitsOnly;
                        processedFields["电话号码"] = true;
                        processedFields["phone"] = true;
                        processedFields["phonenumber"] = true;
                    } else if (
                        fieldName === "微信号" ||
                        fieldName === "wechatId" ||
                        fieldName === "wechat_id" ||
                        fieldName === "wechatID"
                    ) {
                        var cleanWechat = cleanFieldValue(fieldValue);
                        contact.wechatId = cleanWechat;
                        contact.wechat_id = cleanWechat;
                        contact.wechatID = cleanWechat;
                        processedFields["微信号"] = true;
                        processedFields["wechatid"] = true;
                        processedFields["wechat_id"] = true;
                    } else if (
                        fieldName === "微信昵称" ||
                        fieldName === "nickname" ||
                        fieldName === "wechatNickname"
                    ) {
                        contact.nickname = cleanFieldValue(fieldValue);
                        processedFields["微信昵称"] = true;
                        processedFields["nickname"] = true;
                        processedFields["wechatnickname"] = true;
                    } else if (
                        fieldName === "备注" ||
                        fieldName === "remark" ||
                        fieldName === "note" ||
                        fieldName === "contactRemark"
                    ) {
                        contact.remark = cleanFieldValue(fieldValue);
                        contact.note = cleanFieldValue(fieldValue);
                        processedFields["备注"] = true;
                        processedFields["remark"] = true;
                        processedFields["note"] = true;
                        processedFields["contactremark"] = true;
                    } else if (
                        fieldName === "头像URL" ||
                        fieldName === "头像" ||
                        fieldName === "avatar" ||
                        fieldName === "avatarURL" ||
                        fieldName === "avatar_url"
                    ) {
                        // 清理头像URL中的HTML标签和空白字符
                        if (!contact.avatar) {
                            contact.avatar = cleanFieldValue(fieldValue);
                        }
                        processedFields["头像url"] = true;
                        processedFields["头像"] = true;
                        processedFields["avatar"] = true;
                        processedFields["avatarurl"] = true;
                        processedFields["avatar_url"] = true;
                    } else if (fieldName === "URL" && !contact.avatar) {
                        // 清理头像URL中的HTML标签和空白字符
                        contact.avatar = cleanFieldValue(fieldValue);
                        processedFields["url"] = true;
                    } else if (
                        fieldName === "朋友圈背景图URL" ||
                        fieldName === "朋友圈背景URL" ||
                        fieldName === "momentsBackgroundUrl" ||
                        fieldName === "momentsBackgroundURL"
                    ) {
                        // 朋友圈背景图URL，直接存入联系人字段，供朋友圈页面使用
                        contact.momentsBackground = cleanFieldValue(fieldValue);
                        processedFields["朋友圈背景图url"] = true;
                        processedFields["朋友圈背景url"] = true;
                        processedFields["momentsbackgroundurl"] = true;
                    } else if (fieldName === "地区" || fieldName === "region") {
                        contact.region = cleanFieldValue(fieldValue);
                        processedFields["地区"] = true;
                        processedFields["region"] = true;
                    } else if (fieldName === "性别" || fieldName === "gender") {
                        contact.gender = cleanFieldValue(fieldValue);
                        processedFields["性别"] = true;
                        processedFields["gender"] = true;
                    } else if (
                        fieldName === "个性签名" ||
                        fieldName === "signature" ||
                        fieldName === "motto" ||
                        fieldName === "personalSignature"
                    ) {
                        contact.signature = cleanFieldValue(fieldValue);
                        processedFields["个性签名"] = true;
                        processedFields["signature"] = true;
                        processedFields["motto"] = true;
                        processedFields["personalsignature"] = true;
                    } else if (
                        fieldName === "history_friend" ||
                        fieldName === "historyFriend" ||
                        fieldName === "历史好友" ||
                        fieldName === "历史联系人"
                    ) {
                        // 历史联系人标记：用于识别通过 [playerhistorymoments] 生成的联系人
                        var v = String(cleanFieldValue(fieldValue) || "")
                            .trim()
                            .toLowerCase();
                        contact.history_friend =
                            v === "true" || v === "1" || v === "yes" || v === "y";
                        processedFields["history_friend"] = true;
                        processedFields["historyfriend"] = true;
                        processedFields["历史好友"] = true;
                        processedFields["历史联系人"] = true;
                    } else if (
                        fieldName === "实名" ||
                        fieldName === "实名信息" ||
                        fieldName === "真实名称" ||
                        fieldName === "真实姓名" ||
                        fieldName === "realName" ||
                        fieldName === "real_name" ||
                        fieldName === "legalName" ||
                        fieldName === "legal_name" ||
                        fieldName === "fullName" ||
                        fieldName === "full_name"
                    ) {
                        // 微信实名信息（用于转账等场景的匿名实名制显示）
                        // 支持多种字段名：实名、真实名称、真实姓名等
                        var cleanedValue = cleanFieldValue(fieldValue);
                        contact.realName = cleanedValue;
                        contact.real_name = cleanedValue;
                        contact.legalName = cleanedValue;
                        contact.legal_name = cleanedValue;
                        contact.fullName = cleanedValue;
                        contact.full_name = cleanedValue;
                        processedFields["实名"] = true;
                        processedFields["实名信息"] = true;
                        processedFields["真实名称"] = true;
                        processedFields["真实姓名"] = true;
                        processedFields["realname"] = true;
                        processedFields["real_name"] = true;
                        processedFields["legalname"] = true;
                        processedFields["legal_name"] = true;
                        processedFields["fullname"] = true;
                        processedFields["full_name"] = true;
                    }
                }
                previousLine = "";
            }

            // 验证必填字段并生成ID
            if (
                contact.phone &&
                contact.wechatId &&
                contact.nickname &&
                contact.avatar
            ) {
                if (!contact.id) {
                    contact.id = contact.characterId
                        ? "contact_" + contact.characterId
                        : "contact_" +
                          Date.now() +
                          "_" +
                          Math.random().toString(36).substr(2, 9);
                }
                contacts.push(contact);
            }
        }

        return contacts;
    }

    // 工具函数：归一化角色/联系人ID
    // 目标：统一使用「角色ID字符串」作为内部ID（例如 "1"、"2"），避免一会儿是 contact_1、一会儿是 1
    // - 如果是 contact_ 前缀，则去掉前缀，只保留数字部分
    // - 如果是纯数字，直接返回该数字字符串
    // - 其他情况（如微信号 / 昵称），原样返回，用于兼容旧格式
    function normalizeContactId(id) {
        if (!id || typeof id !== "string") {
            return id;
        }
        var idStr = String(id).trim();
        // 如果已经是 contact_ 前缀，去掉前缀，统一为角色ID
        if (idStr.indexOf("contact_") === 0) {
            return idStr.replace(/^contact_/, "");
        }
        // 纯数字：直接作为角色ID使用
        if (/^\d+$/.test(idStr)) {
            return idStr;
        }
        // 其他情况（如昵称 / 微信号），直接返回
        return idStr;
    }

    // 解析朋友圈标签 [moments]...[/moments]，转换为内部使用的 moments 数组
    function parseMomentsFromText(messageContent) {
        if (!messageContent || typeof messageContent !== "string") {
            return [];
        }

        var moments = [];

        try {
            // 1. 找出所有 [moments]...[/moments] 区块
            var momentsBlockRegex = /\[moments\]([\s\S]*?)\[\/moments\]/gi;
            var blockMatch;
            while (
                (blockMatch = momentsBlockRegex.exec(messageContent)) !== null
            ) {
                var blockContent = blockMatch[1] || "";

                // 2. 在每个区块内查找 [moment ...]...[/moment]
                var momentRegex = /\[moment([^\]]*)\]([\s\S]*?)\[\/moment\]/gi;
                var momentMatch;
                while (
                    (momentMatch = momentRegex.exec(blockContent)) !== null
                ) {
                    var attrStr = momentMatch[1] || "";
                    var body = momentMatch[2] || "";

                    var moment = {};

                    // 2.1 解析属性写法的 id / author / type（如 [moment id="xxx" author="1" type="文字"]）
                    if (attrStr.trim()) {
                        var attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
                        var aMatch;
                        while ((aMatch = attrRegex.exec(attrStr)) !== null) {
                            var aName = aMatch[1];
                            var aValue = aMatch[2];
                            if (!aName) continue;
                            if (aName === "id") {
                                moment.id = aValue;
                            } else if (aName === "author") {
                                // 归一化 authorId：纯数字 → contact_数字
                                var normalizedAuthorId =
                                    normalizeContactId(aValue);
                                moment.authorId = normalizedAuthorId;
                                moment.author = normalizedAuthorId;
                            } else if (aName === "type") {
                                moment.type = aValue;
                            }
                        }
                    }

                    // 2.2 解析纯标签形式的 id / author / type（如 [id]xxx[/id]）
                    var simpleIdMatch = /\[id\]([\s\S]*?)\[\/id\]/i.exec(body);
                    if (simpleIdMatch && simpleIdMatch[1]) {
                        moment.id = cleanFieldValue(simpleIdMatch[1]);
                    }
                    var simpleAuthorMatch =
                        /\[author\]([\s\S]*?)\[\/author\]/i.exec(body);
                    if (simpleAuthorMatch && simpleAuthorMatch[1]) {
                        var authorVal = cleanFieldValue(simpleAuthorMatch[1]);
                        // 归一化 authorId：纯数字 → contact_数字
                        var normalizedAuthorId = normalizeContactId(authorVal);
                        moment.authorId = normalizedAuthorId;
                        moment.author = normalizedAuthorId;
                    }
                    var simpleTypeMatch = /\[type\]([\s\S]*?)\[\/type\]/i.exec(
                        body
                    );
                    if (simpleTypeMatch && simpleTypeMatch[1]) {
                        moment.type = cleanFieldValue(simpleTypeMatch[1]);
                    }

                    // 统一归一化朋友圈类型，便于后续渲染判断
                    if (moment.type) {
                        var typeNorm = String(moment.type).trim();
                        // 分享音乐 → 内部统一用 "music"
                        if (
                            typeNorm === "分享音乐" ||
                            typeNorm === "音乐" ||
                            typeNorm.toLowerCase() === "music_share"
                        ) {
                            moment.type = "music";
                        }
                    }

                    // 2.3 解析内容 [content]...[/content]
                    var contentMatch =
                        /\[content\]([\s\S]*?)\[\/content\]/i.exec(body);
                    if (contentMatch && contentMatch[1]) {
                        moment.content = cleanFieldValue(contentMatch[1]);
                    }

                    // 2.4 解析图片
                    // 2.4.1 简化写法：[images]描述1|描述2[/images]
                    var imagesMatch = /\[images\]([\s\S]*?)\[\/images\]/i.exec(
                        body
                    );
                    var images = [];
                    if (imagesMatch && imagesMatch[1]) {
                        var raw = cleanFieldValue(imagesMatch[1]);
                        if (raw) {
                            // 如果内部已经包含 [image] 子标签，则交由下一步解析
                            if (raw.indexOf("[image]") === -1) {
                                raw.split("|").forEach(function (part) {
                                    var desc = part.trim();
                                    if (desc) images.push(desc);
                                });
                            }
                        }
                    }

                    // 2.4.2 复杂写法：多层 [images][image][description]...[/description][/image]...[/images]
                    var imagesBlockMatch =
                        /\[images\]([\s\S]*?)\[\/images\]/i.exec(body);
                    if (imagesBlockMatch && imagesBlockMatch[1]) {
                        var imagesBlock = imagesBlockMatch[1];
                        var imageItemRegex = /\[image\]([\s\S]*?)\[\/image\]/gi;
                        var imageItemMatch;
                        while (
                            (imageItemMatch =
                                imageItemRegex.exec(imagesBlock)) !== null
                        ) {
                            var imgBody = imageItemMatch[1] || "";
                            var descMatch =
                                /\[description\]([\s\S]*?)\[\/description\]/i.exec(
                                    imgBody
                                );
                            if (descMatch && descMatch[1]) {
                                var desc = cleanFieldValue(descMatch[1]);
                                if (desc) images.push(desc);
                            }
                        }
                    }
                    if (images.length > 0) {
                        moment.images = images;
                    }

                    // 2.5 解析音乐 [music ...]...[/music]
                    var musicRegex = /\[music([^\]]*)\]([\s\S]*?)\[\/music\]/i;
                    var musicMatch = musicRegex.exec(body);
                    if (musicMatch) {
                        var musicAttrStr = musicMatch[1] || "";
                        var music = {};
                        var mAttrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
                        var mMatch;
                        while (
                            (mMatch = mAttrRegex.exec(musicAttrStr)) !== null
                        ) {
                            var mName = mMatch[1];
                            var mValue = mMatch[2];
                            if (!mName) continue;
                            if (mName === "title") music.title = mValue;
                            else if (mName === "artist") music.artist = mValue;
                            else if (mName === "platform")
                                music.platform = mValue;
                            else if (mName === "cover") music.cover = mValue;
                        }
                        moment.music = music;
                    }

                    // 2.6 解析位置 [location]...[/location]
                    var locationMatch =
                        /\[location\]([\s\S]*?)\[\/location\]/i.exec(body);
                    if (locationMatch && locationMatch[1]) {
                        var locName = cleanFieldValue(locationMatch[1]);
                        if (locName) {
                            moment.location = { name: locName };
                        }
                    }

                    // 2.7 解析时间 [timestamp]...[/timestamp]（可选）
                    var tsMatch =
                        /\[timestamp\]([\s\S]*?)\[\/timestamp\]/i.exec(body);
                    // 记录是否显式提供了 [timestamp] 标签（用于区分“历史”与“实时/未标注时间”的朋友圈）
                    // 注意：即使解析失败，只要标签存在也算“显式提供”（后续可用于风控/策略判断）
                    moment._explicitTimestampTag =
                        /\[timestamp\]([\s\S]*?)\[\/timestamp\]/i.test(body);
                    if (tsMatch && tsMatch[1]) {
                        var tsRaw = cleanFieldValue(tsMatch[1]);
                        if (tsRaw) {
                            // 尝试解析中文日期格式：2018年6月17日 01:15:00
                            var timestamp = null;

                            // 方法1：解析中文日期格式 YYYY年MM月DD日 HH:mm:ss
                            var chineseDateMatch =
                                /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/.exec(
                                    tsRaw
                                );
                            if (chineseDateMatch) {
                                var year = parseInt(chineseDateMatch[1], 10);
                                var month =
                                    parseInt(chineseDateMatch[2], 10) - 1; // 月份从0开始
                                var day = parseInt(chineseDateMatch[3], 10);
                                var hour = parseInt(chineseDateMatch[4], 10);
                                var minute = parseInt(chineseDateMatch[5], 10);
                                var second = parseInt(chineseDateMatch[6], 10);

                                var dateObj = new Date(
                                    year,
                                    month,
                                    day,
                                    hour,
                                    minute,
                                    second
                                );
                                if (!isNaN(dateObj.getTime())) {
                                    timestamp = dateObj.getTime();
                                }
                            }

                            // 方法2：如果方法1失败，尝试标准格式解析
                            if (!timestamp) {
                                // 尝试多种时间格式解析
                                var normalized = tsRaw
                                    .replace(/年|月/g, "/")
                                    .replace(/日/g, " ")
                                    .replace(/-/g, "/")
                                    .replace(/星期[一二三四五六日]/g, "")
                                    .trim();

                                // 处理单数月份和日期，添加前导零
                                normalized = normalized.replace(
                                    /\/(\d)\//g,
                                    "/0$1/"
                                );
                                normalized = normalized.replace(
                                    /\/(\d)\s/g,
                                    "/0$1 "
                                );
                                normalized = normalized.replace(
                                    /\s(\d):/g,
                                    " 0$1:"
                                );

                                var parsed = Date.parse(normalized);
                                if (!isNaN(parsed)) {
                                    timestamp = parsed;
                                    console.info(
                                        "[小馨手机][消息监听] 使用标准格式解析成功:",
                                        normalized,
                                        "->",
                                        timestamp,
                                        "日期:",
                                        new Date(timestamp)
                                    );
                                } else {
                                    console.warn(
                                        "[小馨手机][消息监听] 标准格式解析失败，原始值:",
                                        tsRaw,
                                        "规范化后:",
                                        normalized
                                    );
                                    // 尝试其他格式
                                    var altFormats = [
                                        tsRaw
                                            .replace(/年|月|日/g, "-")
                                            .replace(/\s+/g, " "),
                                        tsRaw.replace(/[年月日]/g, "-"),
                                        tsRaw,
                                    ];
                                    for (
                                        var f = 0;
                                        f < altFormats.length;
                                        f++
                                    ) {
                                        var altParsed = Date.parse(
                                            altFormats[f]
                                        );
                                        if (!isNaN(altParsed)) {
                                            timestamp = altParsed;
                                            console.info(
                                                "[小馨手机][消息监听] 使用备用格式解析成功:",
                                                altFormats[f],
                                                "时间戳:",
                                                timestamp
                                            );
                                            break;
                                        }
                                    }
                                }
                            }

                            if (timestamp) {
                                moment.timestamp = timestamp;
                            } else {
                                console.error(
                                    "[小馨手机][消息监听] 所有时间戳解析方法都失败，原始值:",
                                    tsRaw,
                                    "朋友圈ID:",
                                    moment.id
                                );
                                // 解析失败时不设置时间戳，让后续逻辑处理
                            }
                        }
                    }

                    // 如果没有显式时间戳，尝试使用世界观时间
                    // 注意：只有确实没有提供 [timestamp] 标签时才使用世界观时间
                    // 如果提供了但解析失败，不应该使用当前时间（会导致显示"刚刚"）
                    if (!moment.timestamp) {
                        // 检查是否尝试过解析时间戳（通过检查是否有 tsRaw）
                        var hasTimestampTag =
                            /\[timestamp\]([\s\S]*?)\[\/timestamp\]/i.test(
                                body
                            );
                        if (!hasTimestampTag) {
                            // 确实没有提供时间戳标签，使用世界观时间
                            console.info(
                                "[小馨手机][消息监听] 朋友圈没有时间戳标签，使用世界观时间。朋友圈ID:",
                                moment.id,
                                "authorId:",
                                moment.authorId
                            );
                            if (
                                window.XiaoxinWorldClock &&
                                window.XiaoxinWorldClock.currentTimestamp
                            ) {
                                moment.timestamp =
                                    window.XiaoxinWorldClock.currentTimestamp;
                            } else {
                                moment.timestamp = Date.now();
                            }
                        } else {
                            // 提供了时间戳标签但解析失败，记录错误但不使用当前时间
                            console.error(
                                "[小馨手机][消息监听] 朋友圈时间戳解析失败，但提供了时间戳标签，不设置时间戳。朋友圈ID:",
                                moment.id,
                                "authorId:",
                                moment.authorId,
                                "这可能导致显示异常"
                            );
                        }
                    }

                    // 统一 authorId 格式：联系人 id 一般为 "contact_数字"
                    // 但历史标签可能输出 author="5"（纯数字），会导致后续 UI 用 contact.id 匹配不到
                    if (moment.authorId) {
                        var authorStr = String(moment.authorId).trim();
                        if (
                            authorStr &&
                            authorStr.indexOf("contact_") !== 0 &&
                            /^\d+$/.test(authorStr)
                        ) {
                            moment.authorId = "contact_" + authorStr;
                            moment.author = moment.authorId;
                        }
                    }

                    // 确保有基础字段再推入
                    if (moment.id && moment.authorId) {
                        moments.push(moment);
                    }
                }
            }
        } catch (e) {
            console.warn("[小馨手机][消息监听] parseMomentsFromText 出错:", e);
        }

        return moments;
    }

    /**
     * 解析朋友圈互动标签 [moments-interactions]...[/moments-interactions]
     * 支持的子标签：
     * - [like momentId="xxx" liker="昵称或ID"][/like]
     * - [comment momentId="xxx" commenter="昵称或ID"][content]文本内容[/content][/comment]
     * - [reply momentId="xxx" replier="昵称或ID" replyTo="被回复者昵称或ID"][content]回复内容[/content][/reply]
     *
     * 返回结构化互动数组，交由数据层合并到对应的 moment 上
     */
    function parseMomentsInteractionsFromText(messageContent) {
        if (!messageContent || typeof messageContent !== "string") {
            console.warn(
                "[小馨手机][消息监听] parseMomentsInteractionsFromText: 输入内容为空或不是字符串"
            );
            return [];
        }

        var interactions = [];

        try {
            // 0. 先解码HTML实体并清理HTML标签
            // 创建一个临时DOM元素来解码HTML实体
            var tempDiv = document.createElement("div");
            tempDiv.innerHTML = messageContent;
            var decodedContent =
                tempDiv.textContent || tempDiv.innerText || messageContent;

            // 移除HTML标签（如 <br>, <q>, <p> 等）
            decodedContent = decodedContent.replace(/<[^>]+>/g, "");

            // 如果解码后内容为空，尝试手动解码常见实体
            if (
                decodedContent === messageContent ||
                decodedContent.trim().length === 0
            ) {
                decodedContent = messageContent
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, "&")
                    .replace(/<[^>]+>/g, ""); // 移除HTML标签
            }

            console.info(
                "[小馨手机][消息监听] parseMomentsInteractionsFromText: 原始内容长度:",
                messageContent.length,
                "解码后长度:",
                decodedContent.length
            );
            console.info(
                "[小馨手机][消息监听] parseMomentsInteractionsFromText: 解码后内容预览:",
                decodedContent.substring(0, 300)
            );

            // 1. 找出所有 [moments-interactions]...[/moments-interactions] 区块
            var blockRegex =
                /\[moments-interactions\]([\s\S]*?)\[\/moments-interactions\]/gi;
            var blockMatch;
            var blockCount = 0;
            while ((blockMatch = blockRegex.exec(decodedContent)) !== null) {
                blockCount++;
                var blockBody = blockMatch[1] || "";
                console.info(
                    "[小馨手机][消息监听] parseMomentsInteractionsFromText: 找到互动区块 #" +
                        blockCount,
                    "内容长度:",
                    blockBody.length,
                    "内容预览:",
                    blockBody.substring(0, 200)
                );

                // 1.1 点赞 [like ...]...[/like]
                // 支持两种格式：
                // 1. 属性格式（推荐）：[like momentId="xxx" liker="xxx"][/like]
                // 2. 标签嵌套格式（向后兼容）：[like][momentId]xxx[/momentId][liker]xxx[/liker][/like]
                var likeRegex = /\[like([^\]]*)\]([\s\S]*?)\[\/like\]/gi;
                var likeMatch;
                var likeCount = 0;
                while ((likeMatch = likeRegex.exec(blockBody)) !== null) {
                    likeCount++;
                    var likeAttrStr = likeMatch[1] || "";
                    var likeBody = likeMatch[2] || "";
                    console.info(
                        "[小馨手机][消息监听] parseMomentsInteractionsFromText: 找到点赞标签 #" +
                            likeCount,
                        "属性字符串:",
                        likeAttrStr,
                        "内容:",
                        likeBody.substring(0, 100)
                    );
                    var like = { type: "like" };

                    // 优先解析属性格式
                    var attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
                    var aMatch;
                    var hasAttrFormat = false;
                    while ((aMatch = attrRegex.exec(likeAttrStr)) !== null) {
                        var aName = aMatch[1];
                        var aValue = aMatch[2];
                        if (!aName) continue;
                        if (aName === "momentId") {
                            like.momentId = aValue;
                            hasAttrFormat = true;
                        } else if (aName === "liker") {
                            like.liker = aValue;
                            hasAttrFormat = true;
                        }
                    }

                    // 如果没有属性格式，尝试解析标签嵌套格式（向后兼容）
                    if (!hasAttrFormat && likeBody.trim()) {
                        var momentIdMatch =
                            /\[momentId\]([\s\S]*?)\[\/momentId\]/i.exec(
                                likeBody
                            );
                        if (momentIdMatch && momentIdMatch[1]) {
                            like.momentId = cleanFieldValue(momentIdMatch[1]);
                        }
                        var likerMatch = /\[liker\]([\s\S]*?)\[\/liker\]/i.exec(
                            likeBody
                        );
                        if (likerMatch && likerMatch[1]) {
                            like.liker = cleanFieldValue(likerMatch[1]);
                        }
                    }

                    // 归一化 liker ID：纯数字 → contact_数字
                    if (like.liker) {
                        like.liker = normalizeContactId(like.liker);
                    }

                    console.info(
                        "[小馨手机][消息监听] parseMomentsInteractionsFromText: 解析点赞结果:",
                        like
                    );
                    if (like.momentId && like.liker) {
                        interactions.push(like);
                        console.info(
                            "[小馨手机][消息监听] parseMomentsInteractionsFromText: 添加点赞互动"
                        );
                    } else {
                        console.warn(
                            "[小馨手机][消息监听] parseMomentsInteractionsFromText: 点赞数据不完整，momentId:",
                            like.momentId,
                            "liker:",
                            like.liker
                        );
                    }
                }
                console.info(
                    "[小馨手机][消息监听] parseMomentsInteractionsFromText: 区块中点赞数量:",
                    likeCount
                );

                // 1.2 评论 [comment ...]...[content]...[/content][/comment]
                var commentRegex =
                    /\[comment([^\]]*)\]([\s\S]*?)\[\/comment\]/gi;
                var commentMatch;
                while ((commentMatch = commentRegex.exec(blockBody)) !== null) {
                    var commentAttrStr = commentMatch[1] || "";
                    var commentBody = commentMatch[2] || "";
                    var comment = { type: "comment" };

                    var cAttrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
                    var cMatch;
                    while (
                        (cMatch = cAttrRegex.exec(commentAttrStr)) !== null
                    ) {
                        var cName = cMatch[1];
                        var cValue = cMatch[2];
                        if (!cName) continue;
                        if (cName === "momentId") {
                            comment.momentId = cValue;
                        } else if (cName === "commenter") {
                            comment.commenter = cValue;
                        }
                    }

                    // 优先解析独立的images和emoji标签
                    var imagesMatch = /\[images\]([\s\S]*?)\[\/images\]/i.exec(
                        commentBody
                    );
                    if (imagesMatch && imagesMatch[1]) {
                        var imagesContent = cleanFieldValue(imagesMatch[1]);
                        if (imagesContent) {
                            comment.images = imagesContent
                                .split("|")
                                .map(function (desc) {
                                    return desc.trim();
                                })
                                .filter(function (desc) {
                                    return desc.length > 0;
                                });
                        }
                    }

                    var emojiMatch = /\[emoji\]([\s\S]*?)\[\/emoji\]/i.exec(
                        commentBody
                    );
                    if (emojiMatch && emojiMatch[1]) {
                        comment.emoji = cleanFieldValue(emojiMatch[1]).trim();
                    }

                    // 解析content标签（文字内容）
                    var contentMatch =
                        /\[content\]([\s\S]*?)\[\/content\]/i.exec(commentBody);
                    var rawContent = "";
                    if (contentMatch && contentMatch[1]) {
                        rawContent = cleanFieldValue(contentMatch[1]);
                    }

                    // 如果已经有独立的images和emoji标签，content就是纯文字
                    // 如果没有独立的标签，但content中包含|分隔符，则向后兼容：自动分离
                    if (imagesMatch || emojiMatch) {
                        // 使用独立标签格式，content就是纯文字
                        comment.content = rawContent;
                    } else if (rawContent.indexOf("|") !== -1) {
                        // 向后兼容：content中包含|分隔符，自动分离
                        var contentParts = rawContent.split("|");
                        comment.content = (contentParts[0] || "").trim();

                        // 获取表情包列表（用于识别表情包文件名）
                        var emojiList = [];
                        if (
                            window.XiaoxinWeChatApp &&
                            typeof window.XiaoxinWeChatApp._getEmojiList ===
                                "function"
                        ) {
                            emojiList = window.XiaoxinWeChatApp._getEmojiList();
                        }

                        // 从content中解析图片描述和表情包
                        var imageDescs = [];
                        for (var k = 1; k < contentParts.length; k++) {
                            var part = contentParts[k].trim();
                            if (!part) continue;

                            // 检查是否是表情包文件名
                            if (emojiList.indexOf(part) !== -1) {
                                comment.emoji = part;
                            } else {
                                // 否则是图片描述
                                imageDescs.push(part);
                            }
                        }

                        if (imageDescs.length > 0) {
                            comment.images = imageDescs;
                        }
                    } else {
                        // 纯文字内容
                        comment.content = rawContent;
                    }

                    // 归一化 commenter ID：纯数字 → contact_数字
                    if (comment.commenter) {
                        comment.commenter = normalizeContactId(
                            comment.commenter
                        );
                    }

                    if (comment.momentId && comment.commenter) {
                        interactions.push(comment);
                    }
                }

                // 1.3 回复 [reply ...]...[content]...[/content][/reply]
                var replyRegex = /\[reply([^\]]*)\]([\s\S]*?)\[\/reply\]/gi;
                var replyMatch;
                while ((replyMatch = replyRegex.exec(blockBody)) !== null) {
                    var replyAttrStr = replyMatch[1] || "";
                    var replyBody = replyMatch[2] || "";
                    var reply = { type: "reply" };

                    var rAttrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
                    var rMatch;
                    while ((rMatch = rAttrRegex.exec(replyAttrStr)) !== null) {
                        var rName = rMatch[1];
                        var rValue = rMatch[2];
                        if (!rName) continue;
                        if (rName === "momentId") {
                            reply.momentId = rValue;
                        } else if (rName === "replier") {
                            reply.replier = rValue;
                        } else if (rName === "replyTo") {
                            reply.replyTo = rValue;
                        }
                    }

                    // 优先解析独立的images和emoji标签
                    var replyImagesMatch =
                        /\[images\]([\s\S]*?)\[\/images\]/i.exec(replyBody);
                    if (replyImagesMatch && replyImagesMatch[1]) {
                        var replyImagesContent = cleanFieldValue(
                            replyImagesMatch[1]
                        );
                        if (replyImagesContent) {
                            reply.images = replyImagesContent
                                .split("|")
                                .map(function (desc) {
                                    return desc.trim();
                                })
                                .filter(function (desc) {
                                    return desc.length > 0;
                                });
                        }
                    }

                    var replyEmojiMatch =
                        /\[emoji\]([\s\S]*?)\[\/emoji\]/i.exec(replyBody);
                    if (replyEmojiMatch && replyEmojiMatch[1]) {
                        reply.emoji = cleanFieldValue(
                            replyEmojiMatch[1]
                        ).trim();
                    }

                    // 解析content标签（文字内容）
                    var replyContentMatch =
                        /\[content\]([\s\S]*?)\[\/content\]/i.exec(replyBody);
                    var rawReplyContent = "";
                    if (replyContentMatch && replyContentMatch[1]) {
                        rawReplyContent = cleanFieldValue(replyContentMatch[1]);
                    }

                    // 如果已经有独立的images和emoji标签，content就是纯文字
                    // 如果没有独立的标签，但content中包含|分隔符，则向后兼容：自动分离
                    if (replyImagesMatch || replyEmojiMatch) {
                        // 使用独立标签格式，content就是纯文字
                        reply.content = rawReplyContent;
                    } else if (rawReplyContent.indexOf("|") !== -1) {
                        // 向后兼容：content中包含|分隔符，自动分离
                        var replyContentParts = rawReplyContent.split("|");
                        reply.content = (replyContentParts[0] || "").trim();

                        // 获取表情包列表（用于识别表情包文件名）
                        var emojiList = [];
                        if (
                            window.XiaoxinWeChatApp &&
                            typeof window.XiaoxinWeChatApp._getEmojiList ===
                                "function"
                        ) {
                            emojiList = window.XiaoxinWeChatApp._getEmojiList();
                        }

                        // 从content中解析图片描述和表情包
                        var replyImageDescs = [];
                        for (var k = 1; k < replyContentParts.length; k++) {
                            var part = replyContentParts[k].trim();
                            if (!part) continue;

                            // 检查是否是表情包文件名
                            if (emojiList.indexOf(part) !== -1) {
                                reply.emoji = part;
                            } else {
                                // 否则是图片描述
                                replyImageDescs.push(part);
                            }
                        }

                        if (replyImageDescs.length > 0) {
                            reply.images = replyImageDescs;
                        }
                    } else {
                        // 纯文字内容
                        reply.content = rawReplyContent;
                    }

                    // 归一化 replier 和 replyTo ID：纯数字 → contact_数字
                    if (reply.replier) {
                        reply.replier = normalizeContactId(reply.replier);
                    }
                    if (reply.replyTo) {
                        reply.replyTo = normalizeContactId(reply.replyTo);
                    }

                    if (reply.momentId && reply.replier && reply.replyTo) {
                        interactions.push(reply);
                    }
                }
            }
        } catch (e) {
            console.warn(
                "[小馨手机][消息监听] parseMomentsInteractionsFromText 出错:",
                e
            );
        }

        return interactions;
    }

    // 从酒馆消息数据中获取原始消息内容（包含标签）
    // 注意：如果正则表达式在"AI输出"阶段处理了消息，原始数据可能也被修改
    // 我们需要尝试从多个可能的字段获取，包括可能的原始字段
    function getRawMessageContentFromData() {
        // 尝试使用酒馆助手接口获取原始消息内容
        if (typeof getChatMessages === "function") {
            try {
                var messages = getChatMessages();
                console.info(
                    "[小馨手机][消息监听] getRawMessageContentFromData: 获取到消息数量:",
                    messages ? messages.length : 0
                );
                if (messages && messages.length > 0) {
                    // 从后往前查找最后一条消息（包括用户和AI消息，因为用户消息也可能包含 [MSG] 标签）
                    for (var i = messages.length - 1; i >= 0; i--) {
                        var msg = messages[i];
                        console.info(
                            "[小馨手机][消息监听] getRawMessageContentFromData: 检查消息",
                            i,
                            "role:",
                            msg.role,
                            "is_user:",
                            msg.is_user,
                            "name:",
                            msg.name
                        );

                        // 尝试多个字段获取内容（优先使用可能包含原始标签的字段）
                        // 注意：如果正则表达式处理了消息，这些字段可能都已经被修改
                        // 我们需要尝试所有可能的字段，包括原始字段
                        var rawContent =
                            msg.raw ||
                            msg.original ||
                            msg.originalMes ||
                            msg.originalText ||
                            msg.mes ||
                            msg.text ||
                            msg.content ||
                            "";

                        // 如果主要字段中没有标签，尝试检查所有字段
                        var hasWxContact = false;
                        var hasMsg = false;
                        var hasMoments = false;

                        if (rawContent && typeof rawContent === "string") {
                            hasWxContact =
                                rawContent.indexOf("[wx_contact]") !== -1;
                            hasMsg = rawContent.indexOf("[MSG]") !== -1;
                            hasMoments =
                                rawContent.indexOf("[moments]") !== -1 ||
                                rawContent.indexOf("[moments-interactions]") !==
                                    -1;
                        }

                        if (!hasWxContact && !hasMsg && !hasMoments) {
                            // 尝试从消息对象的所有字段中查找包含标签的内容
                            for (var key in msg) {
                                if (
                                    msg.hasOwnProperty(key) &&
                                    typeof msg[key] === "string"
                                ) {
                                    var fieldContent = msg[key];
                                    if (
                                        fieldContent.indexOf("[wx_contact]") !==
                                        -1
                                    ) {
                                        console.info(
                                            "[小馨手机][消息监听] getRawMessageContentFromData: 在字段",
                                            key,
                                            "中找到 [wx_contact] 标签"
                                        );
                                        rawContent = fieldContent;
                                        hasWxContact = true;
                                        break;
                                    } else if (
                                        fieldContent.indexOf("[MSG]") !== -1
                                    ) {
                                        console.info(
                                            "[小馨手机][消息监听] getRawMessageContentFromData: 在字段",
                                            key,
                                            "中找到 [MSG] 标签"
                                        );
                                        rawContent = fieldContent;
                                        hasMsg = true;
                                        break;
                                    } else if (
                                        fieldContent.indexOf("[moments]") !==
                                            -1 ||
                                        fieldContent.indexOf(
                                            "[moments-interactions]"
                                        ) !== -1
                                    ) {
                                        console.info(
                                            "[小馨手机][消息监听] getRawMessageContentFromData: 在字段",
                                            key,
                                            "中找到朋友圈标签"
                                        );
                                        rawContent = fieldContent;
                                        hasMoments = true;
                                        break;
                                    }
                                }
                            }
                        }

                        console.info(
                            "[小馨手机][消息监听] getRawMessageContentFromData: 消息",
                            i,
                            "内容长度:",
                            rawContent ? rawContent.length : 0,
                            "字段:",
                            {
                                mes: msg.mes ? msg.mes.length : 0,
                                text: msg.text ? msg.text.length : 0,
                                content: msg.content ? msg.content.length : 0,
                                raw: msg.raw ? msg.raw.length : 0,
                                original: msg.original
                                    ? msg.original.length
                                    : 0,
                                originalMes: msg.originalMes
                                    ? msg.originalMes.length
                                    : 0,
                                originalText: msg.originalText
                                    ? msg.originalText.length
                                    : 0,
                            }
                        );

                        if (rawContent && typeof rawContent === "string") {
                            // 显示内容预览
                            if (rawContent.length > 500) {
                                console.info(
                                    "[小馨手机][消息监听] getRawMessageContentFromData: 消息",
                                    i,
                                    "内容预览:",
                                    rawContent.substring(0, 500) + "..."
                                );
                            } else {
                                console.info(
                                    "[小馨手机][消息监听] getRawMessageContentFromData: 消息",
                                    i,
                                    "完整内容:",
                                    rawContent
                                );
                            }

                            // 检查是否包含联系方式标签、消息标签或朋友圈标签
                            var hasTag =
                                hasWxContact ||
                                hasMsg ||
                                hasMoments ||
                                rawContent.indexOf("[WX_CONTACT]") !== -1 ||
                                rawContent.indexOf("[/MSG]") !== -1 ||
                                rawContent.indexOf("[/moments]") !== -1 ||
                                rawContent.indexOf(
                                    "[/moments-interactions]"
                                ) !== -1;

                            console.info(
                                "[小馨手机][消息监听] getRawMessageContentFromData: 消息",
                                i,
                                "是否包含标签:",
                                hasTag,
                                "([wx_contact]:",
                                hasWxContact,
                                ", [MSG]:",
                                hasMsg,
                                ", [moments]:",
                                hasMoments,
                                ")"
                            );

                            if (hasTag) {
                                console.info(
                                    "[小馨手机][消息监听] 从酒馆消息数据中获取到原始消息内容，消息索引:",
                                    i
                                );
                                return rawContent;
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("[小馨手机][消息监听] 获取原始消息内容失败:", e);
            }
        } else {
            console.warn("[小馨手机][消息监听] getChatMessages 函数不存在");
        }

        // 尝试使用SillyTavern的chat接口
        if (
            window.SillyTavern &&
            window.SillyTavern.chat &&
            window.SillyTavern.chat.length > 0
        ) {
            try {
                console.info(
                    "[小馨手机][消息监听] getRawMessageContentFromData: 使用SillyTavern.chat，消息数量:",
                    window.SillyTavern.chat.length
                );
                // 从后往前查找最后一条消息（包括用户和AI消息）
                for (var i = window.SillyTavern.chat.length - 1; i >= 0; i--) {
                    var msg = window.SillyTavern.chat[i];
                    // 尝试多个字段
                    var rawContent =
                        msg.raw ||
                        msg.original ||
                        msg.originalMes ||
                        msg.originalText ||
                        msg.mes ||
                        msg.text ||
                        msg.content ||
                        "";

                    // 检查是否包含标签
                    var hasWxContact = false;
                    var hasMsg = false;

                    if (rawContent && typeof rawContent === "string") {
                        hasWxContact =
                            rawContent.indexOf("[wx_contact]") !== -1;
                        hasMsg = rawContent.indexOf("[MSG]") !== -1;
                    }

                    // 如果主要字段中没有标签，尝试检查所有字段
                    if (!hasWxContact && !hasMsg) {
                        for (var key in msg) {
                            if (
                                msg.hasOwnProperty(key) &&
                                typeof msg[key] === "string"
                            ) {
                                var fieldContent = msg[key];
                                if (
                                    fieldContent.indexOf("[wx_contact]") !== -1
                                ) {
                                    console.info(
                                        "[小馨手机][消息监听] getRawMessageContentFromData: SillyTavern.chat在字段",
                                        key,
                                        "中找到 [wx_contact] 标签"
                                    );
                                    rawContent = fieldContent;
                                    hasWxContact = true;
                                    break;
                                } else if (
                                    fieldContent.indexOf("[MSG]") !== -1
                                ) {
                                    console.info(
                                        "[小馨手机][消息监听] getRawMessageContentFromData: SillyTavern.chat在字段",
                                        key,
                                        "中找到 [MSG] 标签"
                                    );
                                    rawContent = fieldContent;
                                    hasMsg = true;
                                    break;
                                }
                            }
                        }
                    }

                    if (rawContent && typeof rawContent === "string") {
                        var hasTag =
                            hasWxContact ||
                            hasMsg ||
                            rawContent.indexOf("[WX_CONTACT]") !== -1 ||
                            rawContent.indexOf("[/MSG]") !== -1;

                        console.info(
                            "[小馨手机][消息监听] getRawMessageContentFromData: SillyTavern.chat消息",
                            i,
                            "内容长度:",
                            rawContent.length,
                            "是否包含标签:",
                            hasTag,
                            "([wx_contact]:",
                            hasWxContact,
                            ", [MSG]:",
                            hasMsg,
                            ")"
                        );
                        if (hasTag) {
                            console.info(
                                "[小馨手机][消息监听] 从SillyTavern.chat中获取到原始消息内容，消息索引:",
                                i
                            );
                            return rawContent;
                        }
                    }
                }
            } catch (e) {
                console.warn(
                    "[小馨手机][消息监听] 从SillyTavern.chat获取消息失败:",
                    e
                );
            }
        } else {
            console.warn("[小馨手机][消息监听] SillyTavern.chat 不存在或为空");
        }

        console.warn(
            "[小馨手机][消息监听] getRawMessageContentFromData: 未找到包含 [wx_contact] 或 [MSG] 标签的消息"
        );
        console.warn(
            "[小馨手机][消息监听] 提示：如果使用了正则表达式隐藏标签，请确保："
        );
        console.warn(
            "1. 正则表达式的作用范围设置为'仅格式显示'，这样只影响显示，不影响数据"
        );
        console.warn(
            "2. 优先使用 'raw'、'original'、'originalMes'、'originalText' 等原始字段"
        );
        console.warn(
            "3. 如果仍然无法读取，请检查正则表达式是否在数据保存前就修改了原始内容"
        );
        return null;
    }

    // 在聊天界面中自动隐藏 [MSG] 标签，完全隐藏整块内容
    // 注意：这里只修改 DOM 显示，不会修改 SillyTavern 的原始消息数据
    function hideMsgTagsInDom(messageElement) {
        try {
            if (!messageElement) {
                return;
            }

            var $mes = $(messageElement).closest(".mes");
            if ($mes.length === 0) {
                $mes = $(messageElement);
            }

            var $messageText = $mes.find(
                ".mes_text, .mesText, .message-text, [class*='mes_text']"
            );
            if ($messageText.length === 0) {
                $messageText = $mes;
            }

            var originalHtml = $messageText.html() || "";
            var originalText = $messageText.text() || "";
            var originalContent = originalText + " " + originalHtml;

            // 检查是否包含 [MSG] 标签
            if (
                !originalContent ||
                (originalContent.indexOf("[MSG]") === -1 &&
                    originalContent.indexOf("[/MSG]") === -1)
            ) {
                // 不包含 [MSG] 标签，跳过
                return;
            }

            // 保存原始内容到data属性（在隐藏之前）
            if (
                originalContent &&
                (originalContent.indexOf("[MSG]") !== -1 ||
                    originalContent.indexOf("[/MSG]") !== -1)
            ) {
                $mes.attr("data-original-msg-content", originalContent);
                $messageText.attr("data-original-msg-content", originalContent);
                console.info(
                    "[小馨手机][消息监听] hideMsgTagsInDom: 已保存 [MSG] 原始内容到data属性"
                );
            }

            // 完全隐藏 [MSG]...[/MSG] 块
            var msgPattern = /\[MSG\]([\s\S]*?)\[\/MSG\]/gi;
            var hasMsgTag = msgPattern.test(originalHtml);

            if (hasMsgTag) {
                // 重置正则（因为test会改变lastIndex）
                msgPattern = /\[MSG\]([\s\S]*?)\[\/MSG\]/gi;
                var replacedHtml = originalHtml.replace(
                    msgPattern,
                    function (match) {
                        // 完全隐藏，不保留任何内容
                        return "";
                    }
                );

                if (replacedHtml !== originalHtml) {
                    $messageText.html(replacedHtml);
                    console.info(
                        "[小馨手机][消息监听] hideMsgTagsInDom: 已在 DOM 中隐藏 [MSG] 标签块"
                    );
                }
            }
        } catch (e) {
            console.warn("[小馨手机][消息监听] hideMsgTagsInDom 出错:", e);
        }
    }

    // 在聊天界面中自动隐藏朋友圈标签和生成指令标签
    // 注意：这里只修改 DOM 显示，不会修改 SillyTavern 的原始消息数据
    function hideMomentsTagsInDom(messageElement) {
        try {
            if (!messageElement) {
                return;
            }

            var $mes = $(messageElement).closest(".mes");
            if ($mes.length === 0) {
                $mes = $(messageElement);
            }

            var $messageText = $mes.find(
                ".mes_text, .mesText, .message-text, [class*='mes_text']"
            );
            if ($messageText.length === 0) {
                $messageText = $mes;
            }

            var originalHtml = $messageText.html() || "";
            var originalText = $messageText.text() || "";
            var originalContent = originalText + " " + originalHtml;

            // 检查是否包含朋友圈相关标签
            var hasMomentsTag =
                originalContent.indexOf("[moments]") !== -1 ||
                originalContent.indexOf("[/moments]") !== -1 ||
                originalContent.indexOf("[moments-interactions]") !== -1 ||
                originalContent.indexOf("[/moments-interactions]") !== -1;

            if (!hasMomentsTag) {
                // 不包含朋友圈相关标签，跳过
                return;
            }

            // 保存原始内容到data属性（在隐藏之前）
            if (hasMomentsTag) {
                var existingOriginal = $mes.attr(
                    "data-original-moments-content"
                );
                if (!existingOriginal) {
                    $mes.attr("data-original-moments-content", originalContent);
                    $messageText.attr(
                        "data-original-moments-content",
                        originalContent
                    );
                    console.info(
                        "[小馨手机][消息监听] hideMomentsTagsInDom: 已保存朋友圈标签原始内容到data属性"
                    );
                }
            }

            // 隐藏朋友圈标签 [moments]...[/moments]
            var momentsPattern = /\[moments\]([\s\S]*?)\[\/moments\]/gi;
            var hasMoments = momentsPattern.test(originalHtml);
            if (hasMoments) {
                momentsPattern = /\[moments\]([\s\S]*?)\[\/moments\]/gi;
                originalHtml = originalHtml.replace(momentsPattern, "");
            }

            // 隐藏朋友圈互动标签 [moments-interactions]...[/moments-interactions]
            var interactionsPattern =
                /\[moments-interactions\]([\s\S]*?)\[\/moments-interactions\]/gi;
            var hasInteractions = interactionsPattern.test(originalHtml);
            if (hasInteractions) {
                interactionsPattern =
                    /\[moments-interactions\]([\s\S]*?)\[\/moments-interactions\]/gi;
                originalHtml = originalHtml.replace(interactionsPattern, "");
            }

            // 更新DOM
            if (hasMoments || hasInteractions) {
                $messageText.html(originalHtml);
                console.info(
                    "[小馨手机][消息监听] hideMomentsTagsInDom: 已在 DOM 中隐藏朋友圈相关标签"
                );
            }
        } catch (e) {
            console.warn("[小馨手机][消息监听] hideMomentsTagsInDom 出错:", e);
        }
    }

    // 在聊天界面中隐藏联系方式标签（整块 [wx_contact]...[/wx_contact] 直接移除，不做任何替换）
    // 注意：这里只修改 DOM 显示，不会修改 SillyTavern 的原始消息数据
    function hideContactTagsInDom(messageElement) {
        try {
            if (!messageElement) {
                return;
            }

            var $mes = $(messageElement).closest(".mes");
            if ($mes.length === 0) {
                $mes = $(messageElement);
            }

            var $messageText = $mes.find(
                ".mes_text, .mesText, .message-text, [class*='mes_text']"
            );
            if ($messageText.length === 0) {
                $messageText = $mes;
            }

            var originalHtml = $messageText.html() || "";
            if (!originalHtml || originalHtml.indexOf("[wx_contact]") === -1) {
                // DOM 中没有联系方式标签，可能已经被别的脚本处理了
                return;
            }

            // 保存原始内容到 data 属性（便于调试/回溯）
            try {
                var existingOriginal = $mes.attr(
                    "data-original-contact-content"
                );
                if (!existingOriginal) {
                    $mes.attr("data-original-contact-content", originalHtml);
                    $messageText.attr(
                        "data-original-contact-content",
                        originalHtml
                    );
                }
            } catch (e) {
                // ignore
                    }

            // 整块移除联系方式数据块，不进行任何“手机号替换”行为
            var replacedHtml = originalHtml.replace(
                /\[wx_contact\]([\s\S]*?)\[\/wx_contact\]/gi,
                ""
            );

            if (replacedHtml !== originalHtml) {
                $messageText.html(replacedHtml);
                console.info(
                    "[小馨手机][消息监听] hideContactTagsInDom: 已在 DOM 中移除 [wx_contact] 联系方式数据块"
                );
            }
        } catch (e) {
            console.warn("[小馨手机][消息监听] hideContactTagsInDom 出错:", e);
        }
    }

    // 在聊天界面中隐藏好友申请相关标签（[wx_friend_apply] / [wx_friend_request]），只保留正常对话内容
    // 注意：这里只修改 DOM 显示，不会修改 SillyTavern 的原始消息数据
    function hideFriendTagsInDom(messageElement) {
        try {
            if (!messageElement) {
                return;
            }

            var $mes = $(messageElement).closest(".mes");
            if ($mes.length === 0) {
                $mes = $(messageElement);
            }

            var $messageText = $mes.find(
                ".mes_text, .mesText, .message-text, [class*='mes_text']"
            );
            if ($messageText.length === 0) {
                $messageText = $mes;
            }

            var originalHtml = $messageText.html() || "";
            if (
                !originalHtml ||
                (originalHtml.indexOf("[wx_friend_apply]") === -1 &&
                    originalHtml.indexOf("[wx_friend_request]") === -1 &&
                    originalHtml.indexOf("[wx_friend_apply_response]") === -1)
            ) {
                // DOM 中没有好友申请相关标签，可能已经被别的脚本处理了
                return;
            }

            // 直接整块移除好友申请/响应指令，让界面只保留自然语言内容
            var replacedHtml = originalHtml
                .replace(
                    /\[wx_friend_apply\]([\s\S]*?)\[\/wx_friend_apply\]/gi,
                    ""
                )
                .replace(
                    /\[wx_friend_request\]([\s\S]*?)\[\/wx_friend_request\]/gi,
                    ""
                )
                .replace(
                    /\[wx_friend_apply_response\]([\s\S]*?)\[\/wx_friend_apply_response\]/gi,
                    ""
                );

            if (replacedHtml !== originalHtml) {
                $messageText.html(replacedHtml);
                console.info(
                    "[小馨手机][消息监听] hideFriendTagsInDom: 已在 DOM 中隐藏好友申请标签"
                );
            }
        } catch (e) {
            console.warn("[小馨手机][消息监听] hideFriendTagsInDom 出错:", e);
        }
    }

    // 处理单个消息（只处理已保留的消息）
    function processMessage(messageElement) {
        if (!messageElement) {
            console.info("[小馨手机][消息监听] processMessage: 消息元素为空");
            return;
        }

        // 检查消息是否已保留
        var isRetained = isMessageInChatHistory(messageElement);
        if (!isRetained) {
            console.info(
                "[小馨手机][消息监听] processMessage: 消息未保留，跳过"
            );
            return;
        }

        console.info(
            "[小馨手机][消息监听] processMessage: 消息已保留，开始处理"
        );

        var $mes = $(messageElement).closest(".mes");
        if ($mes.length === 0) {
            $mes = $(messageElement);
        }

        // 先自动隐藏 [MSG] 标签和朋友圈标签（在读取之前，但会先保存原始内容）
        hideMsgTagsInDom(messageElement);
        hideMomentsTagsInDom(messageElement);

        // 优先从酒馆消息数据中获取原始内容（包含标签）
        var content = getRawMessageContentFromData();

        // 如果无法从数据获取，则从DOM获取（尝试多种方式）
        if (!content) {
            var $messageText = $mes.find(
                ".mes_text, .mesText, .message-text, [class*='mes_text']"
            );
            if ($messageText.length === 0) {
                $messageText = $mes;
            }

            // 方法1: 尝试从data属性中获取原始内容（优先使用我们保存的）
            var dataContent =
                $mes.attr("data-original-msg-content") ||
                $mes.attr("data-original-content") ||
                $mes.attr("data-original") ||
                $mes.attr("data-raw") ||
                $mes.attr("data-content") ||
                $messageText.attr("data-original-msg-content") ||
                $messageText.attr("data-original-content") ||
                $messageText.attr("data-original") ||
                $messageText.attr("data-raw") ||
                $messageText.attr("data-content");

            // 检查是否包含任何相关标签（包括朋友圈标签）
            var hasRelevantTag =
                dataContent &&
                (dataContent.indexOf("[MSG]") !== -1 ||
                    dataContent.indexOf("[wx_contact]") !== -1 ||
                    dataContent.indexOf("[moments]") !== -1 ||
                    dataContent.indexOf("[moments-interactions]") !== -1);

            if (hasRelevantTag) {
                content = dataContent;
                console.info(
                    "[小馨手机][消息监听] processMessage: 从data属性获取原始内容",
                    "包含朋友圈标签:",
                    dataContent.indexOf("[moments]") !== -1
                );
            } else {
                // 方法2: 尝试从隐藏的input/textarea中获取
                var $hiddenInput = $mes.find(
                    "input[type='hidden'], textarea[style*='display:none'], textarea[style*='display: none']"
                );
                if ($hiddenInput.length > 0) {
                    var hiddenValue = $hiddenInput.val() || $hiddenInput.text();
                    var hasRelevantTagInHidden =
                        hiddenValue &&
                        (hiddenValue.indexOf("[MSG]") !== -1 ||
                            hiddenValue.indexOf("[wx_contact]") !== -1 ||
                            hiddenValue.indexOf("[moments]") !== -1 ||
                            hiddenValue.indexOf("[moments-interactions]") !==
                                -1);
                    if (hasRelevantTagInHidden) {
                        content = hiddenValue;
                        console.info(
                            "[小馨手机][消息监听] processMessage: 从隐藏input/textarea获取原始内容",
                            "包含朋友圈标签:",
                            hiddenValue.indexOf("[moments]") !== -1
                        );
                    }
                }

                // 方法3: 尝试从注释节点中获取
                if (!content) {
                    var mesElement = $mes[0];
                    if (mesElement) {
                        var walker = document.createTreeWalker(
                            mesElement,
                            NodeFilter.SHOW_COMMENT,
                            null,
                            false
                        );
                        var node;
                        while ((node = walker.nextNode())) {
                            var commentText =
                                node.textContent || node.nodeValue;
                            var hasRelevantTagInComment =
                                commentText &&
                                (commentText.indexOf("[MSG]") !== -1 ||
                                    commentText.indexOf("[wx_contact]") !==
                                        -1 ||
                                    commentText.indexOf("[moments]") !== -1 ||
                                    commentText.indexOf(
                                        "[moments-interactions]"
                                    ) !== -1);
                            if (hasRelevantTagInComment) {
                                content = commentText;
                                console.info(
                                    "[小馨手机][消息监听] processMessage: 从注释节点获取原始内容",
                                    "包含朋友圈标签:",
                                    commentText.indexOf("[moments]") !== -1
                                );
                                break;
                            }
                        }
                    }
                }

                // 方法4: 尝试从所有文本节点中获取（包括被CSS隐藏的）
                if (!content) {
                    var allText = "";
                    var walker = document.createTreeWalker(
                        $messageText[0] || $mes[0],
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    var textNode;
                    while ((textNode = walker.nextNode())) {
                        var nodeText =
                            textNode.textContent || textNode.nodeValue;
                        if (nodeText && nodeText.trim()) {
                            allText += nodeText + " ";
                        }
                    }
                    var hasRelevantTagInText =
                        allText &&
                        (allText.indexOf("[MSG]") !== -1 ||
                            allText.indexOf("[wx_contact]") !== -1 ||
                            allText.indexOf("[moments]") !== -1 ||
                            allText.indexOf("[moments-interactions]") !== -1);
                    if (hasRelevantTagInText) {
                        content = allText;
                        console.info(
                            "[小馨手机][消息监听] processMessage: 从文本节点获取原始内容",
                            "包含朋友圈标签:",
                            allText.indexOf("[moments]") !== -1
                        );
                    }
                }

                // 方法5: 最后尝试从HTML中获取（即使被隐藏）
                if (!content) {
                    var text = $messageText.text() || "";
                    var html = $messageText.html() || "";
                    content = text + " " + html;
                    console.info(
                        "[小馨手机][消息监听] processMessage: 无法从数据获取，使用DOM内容（可能已被正则隐藏）"
                    );
                }
            }
        } else {
            console.info(
                "[小馨手机][消息监听] processMessage: 成功从数据获取原始内容"
            );
        }

        console.info(
            "[小馨手机][消息监听] processMessage: 获取消息内容，长度:",
            content.length
        );
        if (content.length > 0) {
            console.info(
                "[小馨手机][消息监听] processMessage: 消息内容预览:",
                content.substring(0, 500)
            );
        }

        // 先处理时间标签 [time]...[/time]：更新世界观时间并从正文中移除，并隐藏 DOM 中的时间标签
        var timeInfo = parseTimeTag(content);
        content = timeInfo.content || content; // 使用处理后的内容
        hideTimeTagsInDom(messageElement);

        // 规范化 HTML 换行，去掉 <p><br> 等包装，防止重复解析
        content = normalizeHtmlNewlines(content);

        // 生成消息ID（基于内容）
        var messageId =
            $mes.attr("id") ||
            $mes.attr("data-mes-id") ||
            content.substring(0, 100).replace(/\s+/g, "_") +
                "_" +
                content.length;

        // 如果包含结构化标签（如 [MSG]/[moments]），用内容哈希附加一段，
        // 避免同一条“外层消息ID”（例如同一楼层被重生成/覆盖）导致重复跳过解析
        if (
            content &&
            (content.indexOf("[MSG]") !== -1 ||
                content.indexOf("[moments]") !== -1 ||
                content.indexOf("[/moments]") !== -1 ||
                content.indexOf("[moments-interactions]") !== -1 ||
                content.indexOf("[/moments-interactions]") !== -1)
        ) {
            var msgHash = 0;
            for (var i = 0; i < content.length; i++) {
                msgHash = (msgHash << 5) - msgHash + content.charCodeAt(i);
                msgHash = msgHash & msgHash;
            }
            messageId = messageId + "|tag|" + Math.abs(msgHash);
        }

        // 检查是否已处理过
        if (processedMessages.has(messageId)) {
            console.info(
                "[小馨手机][消息监听] processMessage: 消息已处理过，跳过，ID:",
                messageId
            );
            return;
        }

        // 是否包含联系方式标签（支持 [wx_contact] 格式）
        var hasContactTag =
            content.indexOf("[wx_contact]") !== -1 ||
            content.indexOf("[WX_CONTACT]") !== -1 ||
            content.toLowerCase().indexOf("[wx_contact]") !== -1;

        // 是否包含好友申请标签
        var hasFriendTag =
            content.indexOf("[wx_friend_apply]") !== -1 ||
            content.indexOf("[wx_friend_request]") !== -1;

        // 是否包含好友申请响应标签
        var hasFriendResponseTag =
            content.indexOf("[wx_friend_apply_response]") !== -1;

        // 是否包含微信私聊消息标签 [MSG]
        var hasChatMessageTag =
            content.indexOf("[MSG]") !== -1 || content.indexOf("[/MSG]") !== -1;

        // 是否包含朋友圈标签
        var hasMomentsTag =
            content.indexOf("[moments]") !== -1 ||
            content.indexOf("[/moments]") !== -1 ||
            content.indexOf("[moments-interactions]") !== -1 ||
            content.indexOf("[/moments-interactions]") !== -1;

        if (
            !hasContactTag &&
            !hasFriendTag &&
            !hasFriendResponseTag &&
            !hasChatMessageTag &&
            !hasMomentsTag
        ) {
            return;
        }

        // 先处理联系方式（但要在处理 [MSG] 之前，避免内容被修改）
        if (hasContactTag) {
            console.info(
                "[小馨手机][消息监听] processMessage: 发现联系方式标签，开始解析，消息ID:",
                messageId
            );
            var contacts = parseContactTags(content);
            if (contacts.length > 0) {
                console.info(
                    "[小馨手机][消息监听] processMessage: 解析到联系人数量:",
                    contacts.length,
                    contacts
                );
                // 先隐藏联系方式标签（DOM显示），但不修改 content 变量（用于后续解析 [MSG]）
                hideContactTagsInDom(messageElement);
                if (window.XiaoxinWeChatParser) {
                    if (
                        typeof window.XiaoxinWeChatParser.parseContacts ===
                        "function"
                    ) {
                        console.info(
                            "[小馨手机][消息监听] processMessage: 分发联系人数据给微信解析器"
                        );
                        window.XiaoxinWeChatParser.parseContacts(
                            contacts,
                            messageId
                        );
                    }
                }
            }
        }

        // 处理朋友圈标签：隐藏 DOM 中的标签，并将数据解析为结构化朋友圈和互动，写入数据层
        if (
            hasMomentsTag &&
            window.XiaoxinWeChatDataHandler &&
            typeof window.XiaoxinWeChatDataHandler.addMoment === "function"
        ) {
            console.info(
                "[小馨手机][消息监听] processMessage: 发现朋友圈标签，开始处理，消息ID:",
                messageId
            );
            console.info(
                "[小馨手机][消息监听] processMessage: 消息内容片段（前500字符）:",
                content.substring(0, 500)
            );
            // 隐藏朋友圈标签（DOM显示），但不修改 content 变量（避免影响原始消息）
            hideMomentsTagsInDom(messageElement);

            try {
                var parsedMoments = parseMomentsFromText(content) || [];
                console.info(
                    "[小馨手机][消息监听] processMessage: parseMomentsFromText 解析结果:",
                    parsedMoments.length,
                    "条朋友圈",
                    parsedMoments
                );
                if (parsedMoments.length > 0) {
                    var existing =
                        window.XiaoxinWeChatDataHandler.getMoments() || [];
                    var existingIds = {};
                    existing.forEach(function (m) {
                        if (m && m.id) {
                            existingIds[m.id] = true;
                        }
                        if (m && m._id) {
                            existingIds[m._id] = true;
                        }
                    });

                    // 生成唯一朋友圈ID的函数（与data-handler.js中的逻辑一致）
                    function generateUniqueMomentIdForListener(ids) {
                        ids = ids || {};
                        var maxAttempts = 100;
                        var attempt = 0;
                        var newId;

                        do {
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
                        } while (ids[newId] && attempt < maxAttempts);

                        if (attempt >= maxAttempts) {
                            newId =
                                "moment_" +
                                Date.now() +
                                "_" +
                                Math.random().toString(36).substr(2, 9);
                        }

                        return newId;
                    }

                    parsedMoments.forEach(function (m) {
                        if (!m || !m.id) {
                            // 如果没有ID，自动生成一个
                            m.id =
                                generateUniqueMomentIdForListener(existingIds);
                            console.info(
                                "[小馨手机][消息监听] 朋友圈没有ID，自动生成新ID:",
                                m.id,
                                "authorId:",
                                m.authorId || m.userId || m.author
                            );
                        } else if (existingIds[m.id]) {
                            // 已存在相同ID的朋友圈，自动生成新的唯一ID
                            var originalId = m.id;
                            m.id =
                                generateUniqueMomentIdForListener(existingIds);
                            console.warn(
                                "[小馨手机][消息监听] 检测到重复的朋友圈ID，自动生成新ID:",
                                "原ID:",
                                originalId,
                                "新ID:",
                                m.id,
                                "authorId:",
                                m.authorId || m.userId || m.author
                            );
                        }

                        // 将新ID加入映射，避免同一批解析的朋友圈之间重复
                        existingIds[m.id] = true;

                        console.info("[小馨手机][消息监听] 准备保存朋友圈:", {
                            id: m.id,
                            authorId: m.authorId || m.userId || m.author,
                            type: m.type,
                            content: (m.content || "").substring(0, 30) + "...",
                        });
                        // addMoment会再次检查ID重复和内容重复，确保唯一性
                        window.XiaoxinWeChatDataHandler.addMoment(m);
                    });
                    console.info(
                        "[小馨手机][消息监听] processMessage: 本次消息解析到朋友圈数量:",
                        parsedMoments.length,
                        "实际保存数量:",
                        parsedMoments.filter(function (m) {
                            return m && m.id && !existingIds[m.id];
                        }).length
                    );

                    // 注意：这里不做任何“自动跳转/自动刷新到朋友圈页面”的行为。
                    // addMoment 内部会触发 xiaoxin-moments-updated，用于红点提示与需要时的页面刷新；
                    // 页面是否进入朋友圈由玩家自行操作。
                }

                // 额外解析本条消息中的互动数据 [moments-interactions]
                var interactions =
                    parseMomentsInteractionsFromText(content) || [];
                if (interactions.length > 0) {
                    console.info(
                        "[小馨手机][消息监听] processMessage: 本次消息解析到朋友圈互动数量:",
                        interactions.length
                    );

                    // 重新获取所有朋友圈（包括刚刚添加的）
                    var allMoments =
                        window.XiaoxinWeChatDataHandler.getMoments() || [];
                    // 同时将刚刚解析的朋友圈也加入映射（确保同一消息中的朋友圈能被找到）
                    parsedMoments.forEach(function (m) {
                        if (m && m.id) {
                            // 检查是否已经在 allMoments 中
                            var exists = allMoments.some(function (existing) {
                                return existing && existing.id === m.id;
                            });
                            if (!exists) {
                                allMoments.push(m);
                            }
                        }
                    });

                    var momentMap = {};
                    allMoments.forEach(function (m) {
                        if (m && m.id) {
                            momentMap[m.id] = m;
                        }
                    });

                    console.info(
                        "[小馨手机][消息监听] 朋友圈映射表，共",
                        Object.keys(momentMap).length,
                        "条朋友圈，ID列表:",
                        Object.keys(momentMap)
                    );

                    // 记录需要延迟处理的互动数据（找不到对应朋友圈的）
                    var pendingInteractions = [];

                    interactions.forEach(function (it) {
                        if (!it || !it.momentId) {
                            console.warn(
                                "[小馨手机][消息监听] 互动数据缺少momentId:",
                                it
                            );
                            return;
                        }
                        var target = momentMap[it.momentId];
                        if (!target) {
                            console.warn(
                                "[小馨手机][消息监听] 找不到对应的朋友圈，momentId:",
                                it.momentId,
                                "所有朋友圈ID:",
                                Object.keys(momentMap),
                                "将延迟处理"
                            );
                            // 保存到待处理列表，稍后重试
                            pendingInteractions.push(it);
                            return;
                        }

                        // === 归一化并去重目标朋友圈现有互动数据（避免重复扫描导致重复显示） ===
                        try {
                            // likes: 统一ID格式并去重
                            if (!Array.isArray(target.likes))
                                target.likes = target.likes || [];
                            target.likes = Array.from(
                                new Set(
                                    target.likes
                                        .map(function (v) {
                                            return normalizeContactId(
                                                String(v || "").trim()
                                            );
                                        })
                                        .filter(function (v) {
                                            return v;
                                        })
                                )
                            );

                            // comments: 统一 author/replyTo 的ID格式，并按关键字段去重
                            if (!Array.isArray(target.comments))
                                target.comments = target.comments || [];
                            var seenCommentKeys = new Set();
                            target.comments = target.comments
                                .map(function (c) {
                                    if (!c) return c;
                                    var authorNorm = c.author
                                        ? normalizeContactId(
                                              String(c.author).trim()
                                          )
                                        : "";
                                    var replyToNorm = c.replyTo
                                        ? normalizeContactId(
                                              String(c.replyTo).trim()
                                          )
                                        : "";
                                    return Object.assign({}, c, {
                                        author: authorNorm || c.author,
                                        replyTo: replyToNorm || c.replyTo,
                                    });
                                })
                                .filter(function (c) {
                                    if (!c) return false;
                                    var key =
                                        String(c.type || "") +
                                        "|" +
                                        String(c.author || "") +
                                        "|" +
                                        String(c.replyTo || "") +
                                        "|" +
                                        String((c.content || "").trim()) +
                                        "|" +
                                        (Array.isArray(c.images)
                                            ? c.images.join("|")
                                            : "") +
                                        "|" +
                                        String(c.emoji || "");
                                    if (seenCommentKeys.has(key)) return false;
                                    seenCommentKeys.add(key);
                                    return true;
                                });
                        } catch (e) {
                            console.warn(
                                "[小馨手机][消息监听] 归一化/去重现有互动数据失败:",
                                e
                            );
                        }

                        // 点赞
                        if (it.type === "like" && it.liker) {
                            console.info(
                                "[小馨手机][消息监听] 处理点赞，momentId:",
                                it.momentId,
                                "liker:",
                                it.liker
                            );
                            if (!Array.isArray(target.likes)) {
                                target.likes = [];
                            }
                            if (target.likes.indexOf(it.liker) === -1) {
                                target.likes.push(it.liker);
                                console.info(
                                    "[小馨手机][消息监听] 添加点赞，当前点赞列表:",
                                    target.likes
                                );
                            } else {
                                console.info(
                                    "[小馨手机][消息监听] 点赞已存在，跳过"
                                );
                            }
                        }

                        // 评论
                        if (it.type === "comment" && it.commenter) {
                            console.info(
                                "[小馨手机][消息监听] 处理评论，momentId:",
                                it.momentId,
                                "commenter:",
                                it.commenter,
                                "content:",
                                (it.content || "").substring(0, 30)
                            );
                            if (!Array.isArray(target.comments)) {
                                target.comments = [];
                            }

                            // 使用新的格式：content、images、emoji 已经分别解析
                            var commentTextContent = (it.content || "").trim();
                            var commentImageDescs = it.images || [];
                            var commentEmojiFile = it.emoji || null;

                            // 构建用于去重的唯一标识（包含所有内容）
                            var commentUniqueKey =
                                it.momentId +
                                "_" +
                                it.commenter +
                                "_" +
                                commentTextContent +
                                "_" +
                                commentImageDescs.join("|") +
                                "_" +
                                (commentEmojiFile || "");

                            // 检查是否已存在相同的评论
                            var isDuplicate = target.comments.some(function (
                                c
                            ) {
                                var cKey =
                                    it.momentId +
                                    "_" +
                                    c.author +
                                    "_" +
                                    (c.content || "").trim() +
                                    "_" +
                                    (c.images ? c.images.join("|") : "") +
                                    "_" +
                                    (c.emoji || "");
                                return (
                                    cKey === commentUniqueKey &&
                                    c.type === "text"
                                );
                            });

                            if (!isDuplicate) {
                                // 生成基于内容的稳定ID（用于去重）
                                var commentIdHash = 0;
                                for (
                                    var i = 0;
                                    i < commentUniqueKey.length;
                                    i++
                                ) {
                                    var char = commentUniqueKey.charCodeAt(i);
                                    commentIdHash =
                                        (commentIdHash << 5) -
                                        commentIdHash +
                                        char;
                                    commentIdHash =
                                        commentIdHash & commentIdHash; // 转换为32位整数
                                }
                                var commentId =
                                    "comment_" +
                                    Math.abs(commentIdHash).toString(36);

                                var commentObj = {
                                    id: commentId,
                                    // 统一为归一化后的 author，避免 "2" vs "contact_2" 导致重复
                                    author: normalizeContactId(
                                        String(it.commenter).trim()
                                    ),
                                    content: commentTextContent, // 文字内容
                                    type: "text",
                                    timestamp: Date.now(),
                                };

                                // 如果有图片描述，添加到评论中
                                if (commentImageDescs.length > 0) {
                                    commentObj.images = commentImageDescs;
                                }

                                // 如果有表情包，添加到评论中
                                if (commentEmojiFile) {
                                    commentObj.emoji = commentEmojiFile;
                                }

                                target.comments.push(commentObj);
                            }
                        }

                        // 回复评论
                        if (it.type === "reply" && it.replier) {
                            console.info(
                                "[小馨手机][消息监听] 处理回复，momentId:",
                                it.momentId,
                                "replier:",
                                it.replier,
                                "replyTo:",
                                it.replyTo,
                                "content:",
                                (it.content || "").substring(0, 30)
                            );
                            if (!Array.isArray(target.comments)) {
                                target.comments = [];
                            }

                            // 使用新的格式：content、images、emoji 已经分别解析
                            var replyTextContent = (it.content || "").trim();
                            var replyImageDescs = it.images || [];
                            var replyEmojiFile = it.emoji || null;
                            var replyTo = (it.replyTo || "").trim();

                            // 构建用于去重的唯一标识（包含所有内容）
                            var replyUniqueKey =
                                it.momentId +
                                "_" +
                                it.replier +
                                "_" +
                                replyTo +
                                "_" +
                                replyTextContent +
                                "_" +
                                replyImageDescs.join("|") +
                                "_" +
                                (replyEmojiFile || "");

                            // 检查是否已存在相同的回复
                            var isDuplicateReply = target.comments.some(
                                function (c) {
                                    if (
                                        c.author !== it.replier ||
                                        c.type !== "reply"
                                    ) {
                                        return false;
                                    }
                                    var cKey =
                                        it.momentId +
                                        "_" +
                                        c.author +
                                        "_" +
                                        (c.replyTo || "").trim() +
                                        "_" +
                                        (c.content || "").trim() +
                                        "_" +
                                        (c.images ? c.images.join("|") : "") +
                                        "_" +
                                        (c.emoji || "");
                                    return cKey === replyUniqueKey;
                                }
                            );

                            if (!isDuplicateReply) {
                                // 生成基于内容的稳定ID（用于去重）
                                var replyIdHash = 0;
                                for (
                                    var j = 0;
                                    j < replyUniqueKey.length;
                                    j++
                                ) {
                                    var char2 = replyUniqueKey.charCodeAt(j);
                                    replyIdHash =
                                        (replyIdHash << 5) -
                                        replyIdHash +
                                        char2;
                                    replyIdHash = replyIdHash & replyIdHash; // 转换为32位整数
                                }
                                var replyId =
                                    "comment_" +
                                    Math.abs(replyIdHash).toString(36);

                                var replyComment = {
                                    id: replyId,
                                    // 统一为归一化后的 author/replyTo，避免重复
                                    author: normalizeContactId(
                                        String(it.replier).trim()
                                    ),
                                    replyTo: normalizeContactId(
                                        String(replyTo).trim()
                                    ),
                                    replyContent: replyTextContent, // 保存文字内容（用于显示"回复 XXX: 文字内容"）
                                    content: replyTextContent, // 文字内容
                                    type: "reply",
                                    timestamp: Date.now(),
                                };

                                // 如果有图片描述，添加到回复中
                                if (replyImageDescs.length > 0) {
                                    replyComment.images = replyImageDescs;
                                }

                                // 如果有表情包，添加到回复中
                                if (replyEmojiFile) {
                                    replyComment.emoji = replyEmojiFile;
                                }

                                target.comments.push(replyComment);
                            }
                        }

                        // 确保 likes 和 comments 是数组
                        if (!Array.isArray(target.likes)) {
                            target.likes = target.likes || [];
                        }
                        if (!Array.isArray(target.comments)) {
                            target.comments = target.comments || [];
                        }

                        console.info(
                            "[小馨手机][消息监听] 更新朋友圈互动数据，momentId:",
                            target.id,
                            "更新后点赞数:",
                            target.likes.length,
                            "更新后评论数:",
                            target.comments.length,
                            "点赞列表:",
                            target.likes,
                            "评论列表:",
                            target.comments.map(function (c) {
                                return {
                                    author: c.author,
                                    content: (c.content || "").substring(0, 20),
                                    type: c.type,
                                };
                            })
                        );

                        // 使用深拷贝确保数组被正确保存
                        var updates = {
                            likes: target.likes.slice(), // 创建数组副本
                            comments: target.comments.slice(), // 创建数组副本
                        };

                        window.XiaoxinWeChatDataHandler.updateMoment(
                            target.id,
                            updates
                        );

                        // 验证保存结果
                        var savedMoment =
                            window.XiaoxinWeChatDataHandler.getMoments().find(
                                function (m) {
                                    return m.id === target.id;
                                }
                            );
                        if (savedMoment) {
                            console.info(
                                "[小馨手机][消息监听] 朋友圈数据已更新，验证结果:",
                                {
                                    momentId: savedMoment.id,
                                    savedLikesCount:
                                        (savedMoment.likes &&
                                            savedMoment.likes.length) ||
                                        0,
                                    savedCommentsCount:
                                        (savedMoment.comments &&
                                            savedMoment.comments.length) ||
                                        0,
                                    savedLikes: savedMoment.likes || [],
                                    savedComments: (
                                        savedMoment.comments || []
                                    ).map(function (c) {
                                        return {
                                            author: c.author,
                                            content: (
                                                c.content || ""
                                            ).substring(0, 20),
                                        };
                                    }),
                                }
                            );
                        } else {
                            console.error(
                                "[小馨手机][消息监听] 朋友圈数据更新后找不到对应的朋友圈，momentId:",
                                target.id
                            );
                        }
                    });

                    // 如果有成功处理的互动数据，立即刷新朋友圈页面
                    var processedCount =
                        interactions.length - pendingInteractions.length;
                    if (processedCount > 0) {
                        console.info(
                            "[小馨手机][消息监听] 成功处理了",
                            processedCount,
                            "条朋友圈互动，立即刷新朋友圈页面"
                        );
                        // 延迟一下，确保数据已经保存完成
                        setTimeout(function () {
                            if (
                                window.XiaoxinWeChatApp &&
                                typeof window.XiaoxinWeChatApp
                                    .refreshMomentsPage === "function"
                            ) {
                                window.XiaoxinWeChatApp.refreshMomentsPage();
                            }
                        }, 200);
                    }

                    // 如果有待处理的互动数据（找不到对应朋友圈的），延迟处理
                    if (pendingInteractions.length > 0) {
                        console.info(
                            "[小馨手机][消息监听] 有",
                            pendingInteractions.length,
                            "条互动数据找不到对应朋友圈，延迟处理"
                        );
                        setTimeout(function () {
                            // 重新获取所有朋友圈
                            var allMomentsRetry =
                                window.XiaoxinWeChatDataHandler.getMoments() ||
                                [];
                            var momentMapRetry = {};
                            allMomentsRetry.forEach(function (m) {
                                if (m && m.id) {
                                    momentMapRetry[m.id] = m;
                                }
                            });

                            pendingInteractions.forEach(function (it) {
                                var target = momentMapRetry[it.momentId];
                                if (!target) {
                                    console.warn(
                                        "[小馨手机][消息监听] 延迟处理: 仍然找不到对应的朋友圈，momentId:",
                                        it.momentId,
                                        "所有朋友圈ID:",
                                        Object.keys(momentMapRetry)
                                    );
                                    return;
                                }

                                console.info(
                                    "[小馨手机][消息监听] 延迟处理: 找到朋友圈，开始处理互动，momentId:",
                                    it.momentId,
                                    "类型:",
                                    it.type
                                );

                                // 处理点赞
                                if (it.type === "like" && it.liker) {
                                    if (!Array.isArray(target.likes)) {
                                        target.likes = [];
                                    }
                                    if (target.likes.indexOf(it.liker) === -1) {
                                        target.likes.push(it.liker);
                                        console.info(
                                            "[小馨手机][消息监听] 延迟处理: 添加点赞，当前点赞列表:",
                                            target.likes
                                        );
                                    }
                                }

                                // 处理评论
                                if (it.type === "comment" && it.commenter) {
                                    if (!Array.isArray(target.comments)) {
                                        target.comments = [];
                                    }

                                    var commentTextContent = (
                                        it.content || ""
                                    ).trim();
                                    var commentImageDescs = it.images || [];
                                    var commentEmojiFile = it.emoji || null;

                                    var commentUniqueKey =
                                        it.momentId +
                                        "_" +
                                        it.commenter +
                                        "_" +
                                        commentTextContent +
                                        "_" +
                                        commentImageDescs.join("|") +
                                        "_" +
                                        (commentEmojiFile || "");

                                    var isDuplicate = target.comments.some(
                                        function (c) {
                                            var cKey =
                                                it.momentId +
                                                "_" +
                                                c.author +
                                                "_" +
                                                (c.content || "").trim() +
                                                "_" +
                                                (c.images
                                                    ? c.images.join("|")
                                                    : "") +
                                                "_" +
                                                (c.emoji || "");
                                            return (
                                                cKey === commentUniqueKey &&
                                                c.type === "text"
                                            );
                                        }
                                    );

                                    if (!isDuplicate) {
                                        var commentIdHash = 0;
                                        for (
                                            var i = 0;
                                            i < commentUniqueKey.length;
                                            i++
                                        ) {
                                            var char =
                                                commentUniqueKey.charCodeAt(i);
                                            commentIdHash =
                                                (commentIdHash << 5) -
                                                commentIdHash +
                                                char;
                                            commentIdHash =
                                                commentIdHash & commentIdHash;
                                        }
                                        var commentId =
                                            "comment_" +
                                            Math.abs(commentIdHash).toString(
                                                36
                                            );

                                        var commentObj = {
                                            id: commentId,
                                            author: it.commenter,
                                            content: commentTextContent,
                                            type: "text",
                                            timestamp: Date.now(),
                                        };

                                        if (commentImageDescs.length > 0) {
                                            commentObj.images =
                                                commentImageDescs;
                                        }
                                        if (commentEmojiFile) {
                                            commentObj.emoji = commentEmojiFile;
                                        }

                                        target.comments.push(commentObj);
                                        console.info(
                                            "[小馨手机][消息监听] 延迟处理: 添加评论"
                                        );
                                    }
                                }

                                // 处理回复
                                if (it.type === "reply" && it.replier) {
                                    if (!Array.isArray(target.comments)) {
                                        target.comments = [];
                                    }

                                    var replyTextContent = (
                                        it.content || ""
                                    ).trim();
                                    var replyImageDescs = it.images || [];
                                    var replyEmojiFile = it.emoji || null;
                                    var replyTo = (it.replyTo || "").trim();

                                    var replyUniqueKey =
                                        it.momentId +
                                        "_" +
                                        it.replier +
                                        "_" +
                                        replyTo +
                                        "_" +
                                        replyTextContent +
                                        "_" +
                                        replyImageDescs.join("|") +
                                        "_" +
                                        (replyEmojiFile || "");

                                    var isDuplicateReply = target.comments.some(
                                        function (c) {
                                            if (
                                                c.author !== it.replier ||
                                                c.type !== "reply"
                                            ) {
                                                return false;
                                            }
                                            var cKey =
                                                it.momentId +
                                                "_" +
                                                c.author +
                                                "_" +
                                                (c.replyTo || "").trim() +
                                                "_" +
                                                (c.content || "").trim() +
                                                "_" +
                                                (c.images
                                                    ? c.images.join("|")
                                                    : "") +
                                                "_" +
                                                (c.emoji || "");
                                            return cKey === replyUniqueKey;
                                        }
                                    );

                                    if (!isDuplicateReply) {
                                        var replyIdHash = 0;
                                        for (
                                            var j = 0;
                                            j < replyUniqueKey.length;
                                            j++
                                        ) {
                                            var char2 =
                                                replyUniqueKey.charCodeAt(j);
                                            replyIdHash =
                                                (replyIdHash << 5) -
                                                replyIdHash +
                                                char2;
                                            replyIdHash =
                                                replyIdHash & replyIdHash;
                                        }
                                        var replyId =
                                            "comment_" +
                                            Math.abs(replyIdHash).toString(36);

                                        var replyComment = {
                                            id: replyId,
                                            author: it.replier,
                                            replyTo: replyTo,
                                            replyContent: replyTextContent,
                                            content: replyTextContent,
                                            type: "reply",
                                            timestamp: Date.now(),
                                        };

                                        if (replyImageDescs.length > 0) {
                                            replyComment.images =
                                                replyImageDescs;
                                        }
                                        if (replyEmojiFile) {
                                            replyComment.emoji = replyEmojiFile;
                                        }

                                        target.comments.push(replyComment);
                                        console.info(
                                            "[小馨手机][消息监听] 延迟处理: 添加回复"
                                        );
                                    }
                                }

                                // 保存更新
                                window.XiaoxinWeChatDataHandler.updateMoment(
                                    target.id,
                                    target
                                );
                                console.info(
                                    "[小馨手机][消息监听] 延迟处理: 朋友圈数据已更新，momentId:",
                                    target.id,
                                    "点赞数:",
                                    (target.likes && target.likes.length) || 0,
                                    "评论数:",
                                    (target.comments &&
                                        target.comments.length) ||
                                        0
                                );
                            });

                            // 刷新朋友圈页面
                            if (
                                window.XiaoxinWeChatApp &&
                                typeof window.XiaoxinWeChatApp
                                    .refreshMomentsPage === "function"
                            ) {
                                window.XiaoxinWeChatApp.refreshMomentsPage();
                            }
                        }, 500); // 延迟500ms，确保朋友圈数据已经保存
                    }

                    // 注意：刷新逻辑已移到上面，在成功处理互动后立即刷新
                }
            } catch (e) {
                console.warn(
                    "[小馨手机][消息监听] processMessage: 解析朋友圈标签或互动出错:",
                    e
                );
            }
        }

        // 再处理好友申请指令（不改变正文显示）
        if (
            hasFriendTag &&
            window.XiaoxinWeChatParser &&
            window.XiaoxinWeChatDataHandler
        ) {
            try {
                // 先在 DOM 中隐藏好友申请标签块，避免对话里出现生硬格式
                hideFriendTagsInDom(messageElement);

                if (
                    typeof window.XiaoxinWeChatParser
                        .parseFriendRequestsFromText === "function"
                ) {
                    // 从消息中提取时间标签（如果有）
                    var timeInfo = parseTimeTag(content);
                    var worldTime =
                        timeInfo && timeInfo.timestamp
                            ? timeInfo.timestamp
                            : window.XiaoxinWorldClock &&
                              window.XiaoxinWorldClock.currentTimestamp
                            ? window.XiaoxinWorldClock.currentTimestamp
                            : Date.now();
                    var rawTimeStr =
                        timeInfo && timeInfo.rawTime
                            ? timeInfo.rawTime
                            : window.XiaoxinWorldClock &&
                              window.XiaoxinWorldClock.rawTime
                            ? window.XiaoxinWorldClock.rawTime
                            : "";
                    var reqs =
                        window.XiaoxinWeChatParser.parseFriendRequestsFromText(
                            content,
                            {
                                time: worldTime,
                                rawTime: rawTimeStr,
                                id: messageId,
                            }
                        );
                    if (Array.isArray(reqs) && reqs.length > 0) {
                        reqs.forEach(function (r) {
                            // 确保使用世界观时间
                            if (!r.timestamp || r.timestamp === Date.now()) {
                                r.timestamp = worldTime;
                            }
                            if (!r.rawTime && rawTimeStr) {
                                r.rawTime = rawTimeStr;
                            }
                            window.XiaoxinWeChatDataHandler.addFriendRequest(r);
                        });
                    }
                }
            } catch (e) {
                console.error("[小馨手机][消息监听] 解析好友申请指令失败:", e);
            }
        }

        // 处理角色响应好友申请指令（根据角色ID和状态更新联系人好友状态）
        if (
            hasFriendResponseTag &&
            window.XiaoxinWeChatParser &&
            window.XiaoxinWeChatDataHandler
        ) {
            try {
                // 在 DOM 中隐藏好友申请响应标签块，避免对话里出现生硬格式
                hideFriendTagsInDom(messageElement);

                if (
                    typeof window.XiaoxinWeChatParser
                        .parseFriendApplyResponse === "function"
                ) {
                    // 从消息中提取时间标签（如果有）
                    var timeInfo = parseTimeTag(content);
                    var worldTime =
                        timeInfo && timeInfo.timestamp
                            ? timeInfo.timestamp
                            : window.XiaoxinWorldClock &&
                              window.XiaoxinWorldClock.currentTimestamp
                            ? window.XiaoxinWorldClock.currentTimestamp
                            : Date.now();
                    var rawTimeStr =
                        timeInfo && timeInfo.rawTime
                            ? timeInfo.rawTime
                            : window.XiaoxinWorldClock &&
                              window.XiaoxinWorldClock.rawTime
                            ? window.XiaoxinWorldClock.rawTime
                            : "";
                    var response =
                        window.XiaoxinWeChatParser.parseFriendApplyResponse(
                            content,
                            {
                                time: worldTime,
                                rawTime: rawTimeStr,
                                id: messageId,
                            }
                        );

                    // 处理单个响应或响应数组
                    var responses = Array.isArray(response)
                        ? response
                        : response
                        ? [response]
                        : [];

                    if (responses.length > 0) {
                        console.info(
                            "[小馨手机][消息监听] 解析到好友申请响应数量:",
                            responses.length
                        );

                        responses.forEach(function (resp) {
                            if (!resp || !resp.roleId || !resp.status) {
                                console.warn(
                                    "[小馨手机][消息监听] 跳过无效的好友申请响应:",
                                    resp
                                );
                                return;
                            }

                            // 确保响应对象包含世界观时间
                            // 只有在确实没有时间信息时才使用世界观时间
                            // 如果 rawTime 存在但 timestamp 为 null，说明时间解析失败，应该尝试重新解析
                            if (!resp.timestamp) {
                                // 如果有原始时间字符串，尝试重新解析
                                if (resp.rawTime) {
                                    var normalizedTimeStr = resp.rawTime
                                        .replace(/-/g, "/")
                                        .replace(/年/g, "/")
                                        .replace(/月/g, "/")
                                        .replace(/日/g, " ")
                                        .replace(/星期[一二三四五六日]/g, "")
                                        .replace(/\s+/g, " ") // 将多个连续空格替换为单个空格
                                        .trim();
                                    var parsed = Date.parse(normalizedTimeStr);
                                    if (!isNaN(parsed)) {
                                        resp.timestamp = parsed;
                                        console.info(
                                            "[小馨手机][消息监听] 重新解析好友申请响应时间成功:",
                                            resp.rawTime,
                                            "->",
                                            resp.timestamp
                                        );
                                    } else {
                                        // 如果重新解析也失败，才使用世界观时间
                                        console.warn(
                                            "[小馨手机][消息监听] 无法解析好友申请响应时间，使用世界观时间:",
                                            resp.rawTime
                                        );
                                        resp.timestamp = worldTime;
                                    }
                                } else {
                                    // 如果没有原始时间字符串，使用世界观时间
                                    resp.timestamp = worldTime;
                                }
                            }
                            if (!resp.rawTime && rawTimeStr) {
                                resp.rawTime = rawTimeStr;
                            }

                            console.info(
                                "[小馨手机][消息监听] 处理好友申请响应:",
                                resp
                            );

                            if (
                                typeof window.XiaoxinWeChatDataHandler
                                    .processFriendApplyResponse === "function"
                            ) {
                                var success =
                                    window.XiaoxinWeChatDataHandler.processFriendApplyResponse(
                                        resp
                                    );
                                if (success) {
                                    console.info(
                                        "[小馨手机][消息监听] 成功处理好友申请响应，角色ID:",
                                        resp.roleId,
                                        "状态:",
                                        resp.status,
                                        "时间:",
                                        resp.timestamp,
                                        "原始时间:",
                                        resp.rawTime
                                    );
                                } else {
                                    console.warn(
                                        "[小馨手机][消息监听] 处理好友申请响应失败，可能未找到对应联系人，角色ID:",
                                        resp.roleId
                                    );
                                }
                            } else {
                                console.warn(
                                    "[小馨手机][消息监听] processFriendApplyResponse 方法不存在"
                                );
                            }
                        });
                    }
                } else {
                    console.warn(
                        "[小馨手机][消息监听] parseFriendApplyResponse 方法不存在"
                    );
                }
            } catch (e) {
                console.error("[小馨手机][消息监听] 解析好友申请响应失败:", e);
            }
        }

        // 处理微信私聊消息 [MSG] 标签（必须在处理联系方式之后，使用原始的 content 变量）
        if (
            hasChatMessageTag &&
            window.XiaoxinWeChatParser &&
            window.XiaoxinWeChatDataHandler
        ) {
            try {
                // 检查消息来源（是 AI 输出还是用户输入）
                var isAIMessage = false;
                try {
                    // 方法1: 通过消息元素的类名判断（更可靠）
                    var $mes = $(messageElement).closest(".mes");
                    if ($mes.length > 0) {
                        // 检查消息元素是否有 AI 消息的特征类名
                        var hasAIClass = $mes.hasClass("mes_assistant") ||
                                       $mes.hasClass("assistant") ||
                                       $mes.hasClass("ai-message") ||
                                       $mes.find(".mes_assistant, .assistant, .ai-message").length > 0;

                        // 检查消息元素是否有用户消息的特征类名
                        var hasUserClass = $mes.hasClass("mes_user") ||
                                          $mes.hasClass("user") ||
                                          $mes.hasClass("user-message") ||
                                          $mes.find(".mes_user, .user, .user-message").length > 0;

                        if (hasAIClass && !hasUserClass) {
                            isAIMessage = true;
                            console.info(
                                "[小馨手机][消息监听] 通过消息元素类名判断为 AI 消息"
                            );
                        } else if (hasUserClass && !hasAIClass) {
                            isAIMessage = false;
                            console.info(
                                "[小馨手机][消息监听] 通过消息元素类名判断为用户消息"
                            );
                        }
                    }

                    // 方法2: 如果方法1无法判断，尝试通过消息数据判断
                    if (typeof isAIMessage === "undefined" || isAIMessage === false) {
                        if (typeof getChatMessages === "function") {
                            var messages = getChatMessages();
                            if (messages && messages.length > 0) {
                                // 获取最后一条消息（应该是当前正在处理的消息）
                                var lastMsg = messages[messages.length - 1];
                                // 判断是否是 AI 消息：is_user 为 false 或 role 为 assistant
                                var isAIMessageFromData =
                                    lastMsg.is_user === false ||
                                    lastMsg.role === "assistant" ||
                                    (lastMsg.role !== "user" && lastMsg.is_user !== true);

                                if (isAIMessageFromData) {
                                    isAIMessage = true;
                                    console.info(
                                        "[小馨手机][消息监听] 通过消息数据判断为 AI 消息:",
                                        "is_user:",
                                        lastMsg.is_user,
                                        "role:",
                                        lastMsg.role
                                    );
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn("[小馨手机][消息监听] 检查消息来源失败:", e);
                }

                console.info(
                    "[小馨手机][消息监听] 消息来源检查结果:",
                    "isAIMessage:",
                    isAIMessage
                );

                console.info(
                    "[小馨手机][消息监听] processMessage: 发现微信私聊消息标签，开始解析，消息ID:",
                    messageId,
                    "isAIMessage:",
                    isAIMessage
                );

                // 检查消息是否来自历史聊天记录 [historychat] 标签
                var isFromHistoryChat = content.indexOf("[historychat]") !== -1;
                if (isFromHistoryChat) {
                    console.info(
                        "[小馨手机][消息监听] 检测到 [historychat] 标签，标记所有消息为历史消息"
                    );
                }

                // 解析 [MSG]...[/MSG] 标签内的所有消息（仅支持新格式 字段=值）
                var msgPattern = /\[MSG\]([\s\S]*?)\[\/MSG\]/g;
                var match;
                var parsedMessages = [];

                // 解析 [wx_redpacket_receive]...[/wx_redpacket_receive] 标签（兼容旧格式）
                var wxRedpacketReceivePattern =
                    /\[wx_redpacket_receive\]([\s\S]*?)\[\/wx_redpacket_receive\]/g;
                var wxMatch;
                while (
                    (wxMatch = wxRedpacketReceivePattern.exec(content)) !== null
                ) {
                    var wxContent = wxMatch[1].trim();
                    if (!wxContent) continue;

                    // 解析字段=值格式
                    var wxMsgObj = parseKeyValueFormat(wxContent);

                    // 转换为标准 [MSG] 格式的 redpacket_receive 消息
                    if (wxMsgObj.id && wxMsgObj.recipient) {
                        // 生成消息ID（如果没有则使用原id）
                        var convertedMsgId =
                            wxMsgObj.id ||
                            "wxid-" +
                                Date.now() +
                                "-" +
                                Math.random().toString(36).substr(2, 8);

                        // 确定时间
                        var convertedTime = wxMsgObj.time || "";
                        if (
                            !convertedTime &&
                            window.XiaoxinWorldClock &&
                            window.XiaoxinWorldClock.rawTime
                        ) {
                            convertedTime = window.XiaoxinWorldClock.rawTime;
                        }
                        if (!convertedTime) {
                            convertedTime = formatTime(new Date());
                        }

                        // 确定from和to
                        // recipient是领取者，from应该是领取者，to应该是红包发送者（玩家）
                        var convertedFrom = wxMsgObj.recipient;
                        var convertedTo = "player";

                        // 生成通知内容
                        var claimedByName =
                            wxMsgObj.recipient_name ||
                            wxMsgObj.recipient ||
                            "对方";
                        var convertedContent = claimedByName + "领取了你的红包";

                        // 尝试查找对应的红包消息以获取redpacket_id
                        var targetRedpacketId = wxMsgObj.redpacket_id || "";
                        if (
                            !targetRedpacketId &&
                            window.XiaoxinWeChatDataHandler
                        ) {
                            // 如果没有redpacket_id，尝试查找最近的红包消息
                            try {
                                var allChats =
                                    window.XiaoxinWeChatDataHandler.getAllChats();
                                var foundRedpacket = null;

                                // 遍历所有聊天记录，查找最近的红包消息
                                Object.keys(allChats).forEach(function (
                                    userId
                                ) {
                                    var messages = allChats[userId] || [];
                                    messages.forEach(function (msg) {
                                        if (
                                            msg.type === "redpacket" &&
                                            !msg.claimed
                                        ) {
                                            // 找到未领取的红包，使用它的redpacket_id
                                            var msgRedpacketId =
                                                msg.redpacket_id ||
                                                (msg.payload &&
                                                    msg.payload.redpacket_id) ||
                                                "";
                                            if (
                                                msgRedpacketId &&
                                                (!foundRedpacket ||
                                                    msg.timestamp >
                                                        foundRedpacket.timestamp)
                                            ) {
                                                foundRedpacket = {
                                                    redpacket_id:
                                                        msgRedpacketId,
                                                    timestamp:
                                                        msg.timestamp || 0,
                                                };
                                            }
                                        }
                                    });
                                });

                                if (foundRedpacket) {
                                    targetRedpacketId =
                                        foundRedpacket.redpacket_id;
                                    console.info(
                                        "[小馨手机][消息监听] 从最近的红包消息中找到redpacket_id:",
                                        targetRedpacketId
                                    );
                                }
                            } catch (e) {
                                console.warn(
                                    "[小馨手机][消息监听] 查找红包消息失败:",
                                    e
                                );
                            }
                        }

                        // 构建标准格式的消息对象
                        var convertedMsg = {
                            id: convertedMsgId,
                            time: convertedTime,
                            from: convertedFrom,
                            to: convertedTo,
                            type: "redpacket_receive",
                            redpacket_id: targetRedpacketId,
                            claimed_by: convertedFrom,
                            content: convertedContent,
                        };

                        // 添加到parsedMessages，格式化为字段=值格式
                        var convertedMsgContent =
                            "id=" +
                            convertedMsg.id +
                            "\n" +
                            "time=" +
                            convertedMsg.time +
                            "\n" +
                            "from=" +
                            convertedMsg.from +
                            "\n" +
                            "to=" +
                            convertedMsg.to +
                            "\n" +
                            "type=redpacket_receive\n" +
                            "redpacket_id=" +
                            convertedMsg.redpacket_id +
                            "\n" +
                            "claimed_by=" +
                            convertedMsg.claimed_by +
                            "\n" +
                            "content=" +
                            convertedMsg.content;

                        // 将转换后的消息内容插入到content中，替换原标签
                        content = content.replace(
                            wxMatch[0],
                            "[MSG]\n" + convertedMsgContent + "\n[/MSG]"
                        );

                        console.info(
                            "[小馨手机][消息监听] 检测到 [wx_redpacket_receive] 标签，已转换为标准格式:",
                            convertedMsg
                        );
                    }
                }

                // 格式化时间为 YYYY-MM-DD HH:mm:ss
                function formatTime(date) {
                    function pad(n) {
                        return n < 10 ? "0" + n : String(n);
                    }
                    return (
                        date.getFullYear() +
                        "-" +
                        pad(date.getMonth() + 1) +
                        "-" +
                        pad(date.getDate()) +
                        " " +
                        pad(date.getHours()) +
                        ":" +
                        pad(date.getMinutes()) +
                        ":" +
                        pad(date.getSeconds())
                    );
                }

                // 解析 字段=值 格式的工具函数
                function parseKeyValueFormat(msgContent) {
                    var msgObj = {};
                    var lines = msgContent.split(/\r?\n/);
                    lines.forEach(function (line) {
                        line = line.trim();
                        if (!line || line.indexOf("=") === -1) return;

                        // 修复：只分割第一个 "="，剩余部分都是值（支持URL中包含=字符）
                        var equalIndex = line.indexOf("=");
                        if (equalIndex === -1) return;

                        var key = line.substring(0, equalIndex).trim();
                        var value = line.substring(equalIndex + 1).trim(); // 从第一个=之后的所有内容都是值

                        // 解码 HTML 实体，特别是 &amp; 会导致 URL 失效
                        value = value.replace(/&amp;/g, "&");

                        if (key) {
                            msgObj[key] = value;
                            // 调试：记录image字段的解析
                            if (key === "image") {
                                console.info(
                                    "[小馨手机][消息监听] 解析image字段:",
                                    "键:",
                                    key,
                                    "值长度:",
                                    value.length,
                                    "值前100字符:",
                                    value.substring(0, 100),
                                    "值后50字符:",
                                    value.length > 50 ? value.substring(value.length - 50) : value,
                                    "完整值:",
                                    value
                                );
                            }
                        }
                    });
                    return msgObj;
                }

                while ((match = msgPattern.exec(content)) !== null) {
                    var msgContent = match[1].trim();
                    if (!msgContent) continue;

                    // 解析新格式：字段=值
                    // 支持多条消息，每条消息以 id= 开头
                    if (
                        msgContent.indexOf("=") !== -1 &&
                        msgContent.indexOf("id=") !== -1
                    ) {
                        // 按 id= 分割多条消息
                        var messageBlocks = [];
                        var lines = msgContent.split(/\r?\n/);
                        var currentBlock = [];

                        lines.forEach(function (line) {
                            line = line.trim();
                            if (!line) return;

                            // 如果遇到新的 id=，说明是新消息的开始
                            if (
                                line.indexOf("id=") === 0 &&
                                currentBlock.length > 0
                            ) {
                                // 保存当前消息块
                                messageBlocks.push(currentBlock.join("\n"));
                                currentBlock = [line];
                            } else {
                                currentBlock.push(line);
                            }
                        });

                        // 添加最后一条消息
                        if (currentBlock.length > 0) {
                            messageBlocks.push(currentBlock.join("\n"));
                        }

                        // 解析每条消息
                        // 先处理 call_voice 消息（状态变化），再处理 call_voice_text 消息（显示文本）
                        var callVoiceMessages = []; // 存储 call_voice 消息
                        var callVoiceTextMessages = []; // 存储 call_voice_text 消息
                        var otherMessages = []; // 存储其他消息
                        var callIdMap = {}; // 映射：消息ID -> 通话ID，用于 call_voice_text 的 call_id 匹配

                        messageBlocks.forEach(function (blockContent) {
                            var msgObj = parseKeyValueFormat(blockContent);

                            // 分类消息：先处理 call_voice（状态），再处理 call_voice_text（文本）
                            if (
                                msgObj.type === "call_voice" ||
                                msgObj.type === "call_video"
                            ) {
                                callVoiceMessages.push({
                                    blockContent: blockContent,
                                    msgObj: msgObj,
                                });

                                // 记录消息ID到通话ID的映射
                                if (
                                    msgObj.id &&
                                    (msgObj.call_id || msgObj.callId)
                                ) {
                                    var callId =
                                        msgObj.call_id || msgObj.callId || "";
                                    var msgId = msgObj.id;

                                    // 记录消息ID到通话ID的映射
                                    callIdMap[msgId] = callId;

                                    // 记录 call_wxid-xxx 格式的映射（用于 call_voice_text 消息）
                                    // 注意：call_voice_text 的 call_id 可能是 call_wxid-消息ID 格式
                                    // 例如：call_wxid-X7k3P2n1（消息ID是 wxid-X7k3P2n1）
                                    callIdMap["call_wxid-" + msgId] = callId;

                                    // 如果消息ID本身包含 wxid- 前缀，也需要记录不带前缀的版本
                                    // 例如：消息ID是 wxid-X7k3P2n1，call_voice_text 的 call_id 可能是 call_wxid-X7k3P2n1
                                    if (msgId.startsWith("wxid-")) {
                                        var msgIdWithoutPrefix = msgId.replace(
                                            /^wxid-/,
                                            ""
                                        );
                                        callIdMap[
                                            "call_wxid-" + msgIdWithoutPrefix
                                        ] = callId;
                                    }

                                    console.info(
                                        "[小馨手机][消息监听] 记录通话ID映射:",
                                        "消息ID:",
                                        msgId,
                                        "通话ID:",
                                        callId,
                                        "映射键:",
                                        [
                                            msgId,
                                            "call_wxid-" + msgId,
                                            msgId.startsWith("wxid-")
                                                ? "call_wxid-" +
                                                  msgId.replace(/^wxid-/, "")
                                                : null,
                                        ].filter(Boolean)
                                    );
                                }
                            } else if (msgObj.type === "call_voice_text") {
                                callVoiceTextMessages.push({
                                    blockContent: blockContent,
                                    msgObj: msgObj,
                                });
                            } else {
                                otherMessages.push({
                                    blockContent: blockContent,
                                    msgObj: msgObj,
                                });
                            }
                        });

                        // 按顺序处理：先处理 call_voice（状态变化），再处理 call_voice_text（显示文本），最后处理其他消息
                        var allMessagesInOrder = callVoiceMessages
                            .concat(callVoiceTextMessages)
                            .concat(otherMessages);

                        allMessagesInOrder.forEach(function (item) {
                            var blockContent = item.blockContent;
                            var msgObj = item.msgObj;

                            // call_voice_text 消息不添加到聊天记录，但需要处理显示
                            if (msgObj.type === "call_voice_text") {
                                console.info(
                                    "[小馨手机][消息监听] 处理语音通话文本消息，消息ID:",
                                    msgObj.id,
                                    "call_id:",
                                    msgObj.call_id || msgObj.callId
                                );

                                // 处理 call_voice_text 消息，显示在通话页面中
                                // 获取当前玩家ID
                                var currentAccount = window.XiaoxinWeChatAccount
                                    ? window.XiaoxinWeChatAccount.getCurrentAccount()
                                    : null;
                                var playerWechatId = currentAccount
                                    ? currentAccount.wechatId ||
                                      currentAccount.id ||
                                      "player"
                                    : "player";
                                var msgFromStr = String(
                                    msgObj.from || ""
                                ).trim();
                                var playerWechatIdStr = String(
                                    playerWechatId || ""
                                ).trim();

                                // 判断是否是角色发送的消息
                                // 兼容：from="user" 也表示玩家（本扩展部分指令使用 user）
                                var isFromRole =
                                    msgFromStr !== "player" &&
                                    msgFromStr !== "user" &&
                                    msgFromStr !== playerWechatIdStr;

                                // 处理 call_voice_text 消息，显示在通话页面中
                                // ⚠️ 重要：必须严格匹配 call_id，确保不同通话的文本消息不会混淆显示
                                var callIdFromText =
                                    msgObj.call_id || msgObj.callId || "";
                                var characterId = msgObj.from || "";
                                var textContent =
                                    msgObj.text || msgObj.content || "";

                                // 如果 call_id 是消息ID格式（call_wxid-xxx），需要找到对应的实际通话ID
                                // 实际通话ID应该是 call_out_xxx 格式（玩家发起的）或 call_xxx 格式（角色发起的）
                                var actualCallId = null;

                                // 如果 call_id 不是消息ID格式，直接使用
                                if (
                                    callIdFromText &&
                                    !callIdFromText.startsWith("call_wxid-")
                                ) {
                                    actualCallId = callIdFromText;
                                    console.info(
                                        "[小馨手机][消息监听] call_voice_text 消息的 call_id 不是消息ID格式，直接使用:",
                                        actualCallId
                                    );
                                }

                                // 如果 call_id 是消息ID格式（call_wxid-xxx），从映射中查找
                                if (
                                    !actualCallId &&
                                    callIdFromText &&
                                    callIdFromText.startsWith("call_wxid-")
                                ) {
                                    // 从映射中查找对应的通话ID
                                    actualCallId = callIdMap[callIdFromText];

                                    // 如果直接查找失败，尝试提取消息ID部分
                                    if (!actualCallId) {
                                        // call_wxid-X7k3P2n1 -> X7k3P2n1
                                        var extractedMsgId =
                                            callIdFromText.replace(
                                                /^call_wxid-/,
                                                ""
                                            );
                                        // 尝试查找 wxid-X7k3P2n1 的映射
                                        var fullMsgId =
                                            "wxid-" + extractedMsgId;
                                        if (callIdMap[fullMsgId]) {
                                            actualCallId = callIdMap[fullMsgId];
                                            console.info(
                                                "[小馨手机][消息监听] 通过提取消息ID找到通话ID:",
                                                "call_id:",
                                                callIdFromText,
                                                "提取的消息ID:",
                                                extractedMsgId,
                                                "完整消息ID:",
                                                fullMsgId,
                                                "-> 通话ID:",
                                                actualCallId
                                            );
                                        }
                                    }

                                    if (actualCallId) {
                                        console.info(
                                            "[小馨手机][消息监听] 从映射中找到通话ID:",
                                            "call_id:",
                                            callIdFromText,
                                            "-> 通话ID:",
                                            actualCallId
                                        );
                                    } else {
                                        console.warn(
                                            "[小馨手机][消息监听] 无法从映射中找到通话ID:",
                                            callIdFromText,
                                            "可用映射:",
                                            Object.keys(callIdMap)
                                        );
                                    }
                                }

                                // ⚠️ 重要：必须严格验证 call_id 是否匹配当前通话
                                // 如果消息中的 call_id 不匹配当前通话的 callId，应该跳过显示
                                var currentCallId = null;
                                if (
                                    window.XiaoxinIncomingCall &&
                                    window.XiaoxinIncomingCall.currentCall
                                ) {
                                    var currentCall =
                                        window.XiaoxinIncomingCall.currentCall;
                                    if (currentCall && currentCall.callId) {
                                        currentCallId = currentCall.callId;
                                    }
                                }

                                // 如果没有找到 actualCallId，无法确定是哪个通话的消息，跳过显示
                                if (!actualCallId) {
                                    console.warn(
                                        "[小馨手机][消息监听] 无法确定通话ID，跳过显示语音通话文本消息:",
                                        "call_id:",
                                        callIdFromText,
                                        "characterId:",
                                        characterId
                                    );
                                    return; // 不添加到聊天记录
                                }

                                // 如果有当前通话，必须严格匹配 call_id
                                if (currentCallId && actualCallId !== currentCallId) {
                                    return; // 不是当前通话的消息，跳过显示
                                }

                                // ⚠️ 重要：如果没有当前通话，必须跳过显示，避免不同角色的通话消息混淆
                                // 只有在有当前通话且 call_id 匹配时，才允许显示消息
                                if (!currentCallId) {
                                    return; // 没有当前通话，跳过显示
                                }

                                if (isFromRole && actualCallId) {
                                    // 延迟处理，确保状态变化事件先触发
                                    setTimeout(function () {
                                        if (
                                            window.XiaoxinIncomingCall &&
                                            typeof window.XiaoxinIncomingCall
                                                .displayCallVoiceTextMessage ===
                                                "function"
                                        ) {
                                            console.info(
                                                "[小馨手机][消息监听] 显示语音通话文本消息:",
                                                "call_id:",
                                                actualCallId,
                                                "characterId:",
                                                characterId,
                                                "text:",
                                                textContent.substring(0, 50) +
                                                    "..."
                                            );

                                            var pendingMessage = {
                                                id: msgObj.id,
                                                time: msgObj.time || "",
                                                from: msgObj.from,
                                                to: msgObj.to,
                                                type: "call_voice_text",
                                                text: textContent,
                                                call_id: actualCallId,
                                                callId: actualCallId,
                                            };

                                            window.XiaoxinIncomingCall.displayCallVoiceTextMessage(
                                                pendingMessage,
                                                characterId,
                                                actualCallId
                                            );
                                        } else {
                                            console.warn(
                                                "[小馨手机][消息监听] XiaoxinIncomingCall.displayCallVoiceTextMessage 不可用"
                                            );
                                        }
                                    }, 200); // 延迟200ms，确保状态变化事件先触发
                                } else if (isFromRole && !actualCallId) {
                                    console.warn(
                                        "[小馨手机][消息监听] 无法确定通话ID，跳过显示语音通话文本消息:",
                                        "call_id:",
                                        callIdFromText,
                                        "characterId:",
                                        characterId
                                    );
                                }

                                return; // 不添加到聊天记录
                            }

                            // 转换格式为统一的消息对象格式
                            if (
                                msgObj.id &&
                                msgObj.type &&
                                msgObj.from &&
                                msgObj.to
                            ) {
                                // 检测并纠正错误的格式：如果 type=text 但 content 是图片文件名，应该转换为 type=image
                                var contentStr = String(msgObj.content || "").trim();
                                var isImageFilename = /\.(jpeg|jpg|png|gif|webp|bmp|svg)$/i.test(contentStr);

                                if (msgObj.type === "text" && isImageFilename) {
                                    console.warn(
                                        "[小馨手机][消息监听] 检测到错误的格式：type=text 但 content 是图片文件名，自动转换为 type=image:",
                                        "原 type:",
                                        msgObj.type,
                                        "content:",
                                        contentStr,
                                        "消息ID:",
                                        msgObj.id
                                    );
                                    // 将 type 改为 image，并将 content 作为 desc（图片描述）
                                    msgObj.type = "image";
                                    msgObj.desc = contentStr; // 图片文件名作为描述
                                    msgObj.content = ""; // 清空 content，因为图片消息应该使用 desc
                                }

                                // 将新格式转换为统一的消息对象结构
                                // 优先使用消息中的 time 字段，如果没有则使用世界观时间
                                var msgTime = msgObj.time;
                                if (!msgTime) {
                                    // 如果没有 time 字段，使用世界观时间
                                    if (
                                        window.XiaoxinWorldClock &&
                                        window.XiaoxinWorldClock.rawTime
                                    ) {
                                        msgTime =
                                            window.XiaoxinWorldClock.rawTime;
                                        console.info(
                                            "[小馨手机][消息监听] 消息中没有time字段，使用世界观时间:",
                                            msgTime
                                        );
                                    } else if (
                                        window.XiaoxinWorldClock &&
                                        window.XiaoxinWorldClock
                                            .currentTimestamp
                                    ) {
                                        // 如果有时间戳，格式化为时间字符串
                                        var worldDate = new Date(
                                            window.XiaoxinWorldClock.currentTimestamp
                                        );
                                        msgTime = formatTime(worldDate);
                                        console.info(
                                            "[小馨手机][消息监听] 消息中没有time字段，从世界观时间戳生成:",
                                            msgTime
                                        );
                                    } else {
                                        // 最后才使用现实时间（不推荐）
                                        msgTime = formatTime(new Date());
                                        console.warn(
                                            "[小馨手机][消息监听] 消息中没有time字段且无世界观时间，使用现实时间（不推荐）:",
                                            msgTime
                                        );
                                    }
                                }

                                // 玩家消息不再延迟，直接使用指令中的原始时间
                                // 这样可以确保消息按正确的时间顺序显示
                                console.info(
                                    "[小馨手机][消息监听] 玩家消息使用指令中的原始时间:",
                                    "时间:",
                                    msgTime
                                );
                                // 统一将解析结果转换为带 payload 的结构
                                // 对于语音消息, 额外保留 duration_sec 字段, 方便前端显示时长
                                // 对于图片消息, 保留 desc 和 aspect_ratio 字段
                                var payload = {
                                    content: msgObj.content || "",
                                };

                                // 处理语音消息
                                if ((msgObj.type || "text") === "voice") {
                                    // 支持 duration 和 duration_sec 两种字段名
                                    var durationValue =
                                        msgObj.duration_sec ||
                                        msgObj.duration ||
                                        0;
                                    payload.duration_sec =
                                        typeof durationValue === "string"
                                            ? parseInt(durationValue, 10) || 0
                                            : typeof durationValue === "number"
                                            ? durationValue
                                            : 0;
                                    // 支持 text 字段作为语音文字转写内容（优先级高于 content）
                                    // 如果同时存在 text 和 content，优先使用 text
                                    payload.content =
                                        msgObj.text ||
                                        msgObj.content ||
                                        "";
                                }

                                // 处理语音通话消息
                                if ((msgObj.type || "text") === "call_voice") {
                                    // 检查是否是历史消息
                                    var isHistoricalCall = false;
                                    // 方法1：检查 isHistorical 标记
                                    if (msgObj.isHistorical === true) {
                                        isHistoricalCall = true;
                                    }
                                    // 方法2：检查时间戳（如果消息时间早于当前时间超过1分钟，认为是历史消息）
                                    if (!isHistoricalCall && msgTime) {
                                        try {
                                            var messageTime = new Date(msgTime).getTime();
                                            var currentTime = Date.now();
                                            // 如果消息时间早于当前时间超过1分钟，认为是历史消息
                                            if (messageTime && messageTime < currentTime - 60000) {
                                                isHistoricalCall = true;
                                            }
                                        } catch (e) {
                                            // 时间解析失败，不认为是历史消息
                                        }
                                    }

                                    // 如果是历史通话，保留原始状态，不要强制改为 ended
                                    // 注意：accepted 是中间状态，不应该显示气泡，应该在渲染时跳过
                                    // 只有在渲染时才会根据状态决定是否显示气泡
                                    payload.state = msgObj.state || "ringing";
                                    if (isHistoricalCall) {
                                        console.info(
                                            "[小馨手机][消息监听] 检测到历史通话消息，保留原始状态:",
                                            msgObj.id,
                                            "状态:",
                                            payload.state
                                        );
                                    }
                                    payload.with = msgObj.with || msgObj.from;
                                    // 支持 duration 和 duration_sec 两种字段名
                                    // 确保转换为数字类型（秒）
                                    var durationValue =
                                        msgObj.duration_sec ||
                                        msgObj.duration ||
                                        0;
                                    payload.duration_sec =
                                        typeof durationValue === "string"
                                            ? parseInt(durationValue, 10) || 0
                                            : typeof durationValue === "number"
                                            ? durationValue
                                            : 0;
                                    payload.note = msgObj.note || "";
                                }

                                // 处理视频通话消息
                                if ((msgObj.type || "text") === "call_video") {
                                    // 检查是否是历史消息
                                    var isHistoricalCall = false;
                                    // 方法1：检查 isHistorical 标记
                                    if (msgObj.isHistorical === true) {
                                        isHistoricalCall = true;
                                    }
                                    // 方法2：检查时间戳（如果消息时间早于当前时间超过1分钟，认为是历史消息）
                                    if (!isHistoricalCall && msgTime) {
                                        try {
                                            var messageTime = new Date(msgTime).getTime();
                                            var currentTime = Date.now();
                                            // 如果消息时间早于当前时间超过1分钟，认为是历史消息
                                            if (messageTime && messageTime < currentTime - 60000) {
                                                isHistoricalCall = true;
                                            }
                                        } catch (e) {
                                            // 时间解析失败，不认为是历史消息
                                        }
                                    }

                                    // 如果是历史通话，保留原始状态，不要强制改为 ended
                                    // 注意：accepted 是中间状态，不应该显示气泡，应该在渲染时跳过
                                    // 只有在渲染时才会根据状态决定是否显示气泡
                                    payload.state = msgObj.state || "ringing";
                                    if (isHistoricalCall) {
                                        console.info(
                                            "[小馨手机][消息监听] 检测到历史通话消息，保留原始状态:",
                                            msgObj.id,
                                            "状态:",
                                            payload.state
                                        );
                                    }
                                    payload.with = msgObj.with || msgObj.from;
                                    payload.duration_sec =
                                        msgObj.duration_sec || 0;
                                    payload.note = msgObj.note || "";
                                }

                                // 处理红包消息
                                if ((msgObj.type || "text") === "redpacket") {
                                    payload.redpacket_id =
                                        msgObj.redpacket_id || "";
                                    payload.amount = msgObj.amount || 0;
                                    // 红包备注的优先级：note > greeting > content（因为红包的备注可能在content字段中）
                                    payload.note =
                                        msgObj.note ||
                                        msgObj.greeting ||
                                        msgObj.content ||
                                        "";
                                    payload.content = msgObj.content || "";
                                    if (msgObj.sticker) {
                                        payload.sticker = msgObj.sticker;
                                    }
                                }

                                // 处理领取红包消息（支持 redpacket_claim 和 redpacket_receive 两种类型）
                                if (
                                    (msgObj.type || "text") ===
                                        "redpacket_claim" ||
                                    (msgObj.type || "text") ===
                                        "redpacket_receive"
                                ) {
                                    payload.redpacket_id =
                                        msgObj.redpacket_id || "";
                                    payload.claimed_by =
                                        msgObj.claimed_by || "";
                                    if (msgObj.content) {
                                        payload.content = msgObj.content;
                                    }
                                }

                                // 处理图片消息
                                if ((msgObj.type || "text") === "image") {
                                    // ✅ 优先保留 image= 字段（URL / data:image / local:...）
                                    // 否则会被下游当成"图片描述"触发 AI 生图，导致本地图片被替换
                                    // ⚠️ 重要：优先检查 msgObj.image（从 [MSG] 标签直接解析），然后检查 payload.image
                                    var imageField = String(
                                        msgObj.image ||
                                        (msgObj.payload && msgObj.payload.image) ||
                                        ""
                                    ).trim();
                                    var descField = String(msgObj.desc || "").trim();

                                    // 兼容：如果没有 image=，才把 desc/content 当作“图片描述”
                                    var imageDesc = "";
                                    if (!imageField) {
                                        imageDesc = descField || String(msgObj.content || "").trim();
                                        // 验证：如果 desc 中包含多个描述（用 | 或换行分隔），只取第一个
                                        if (imageDesc) {
                                            var descParts = imageDesc.split(/[|\n]/);
                                            if (descParts.length > 1) {
                                                console.warn(
                                                    "[小馨手机][消息监听] 检测到一条图片消息包含多个描述，只使用第一个:",
                                                    msgObj.id
                                                );
                                                imageDesc = descParts[0].trim();
                                            }
                                        }
                                    }

                                    // 统一写入 payload：
                                    // - 有 image=：优先当作图片URL使用，并保留 desc 作为说明
                                    // - 无 image=：desc 作为生成提示词
                                    if (imageField) {
                                        payload.image = imageField;
                                        payload.content = imageField;
                                        payload.desc = descField || "";
                                        // ⚠️ 重要：如果已有图片URL，标记为已处理，避免刷新后重复生成
                                        convertedMsg._processed = true;
                                    } else {
                                        payload.desc = imageDesc || "";
                                    }
                                    // 图片比例（可选）
                                    if (msgObj.aspect_ratio) {
                                        payload.aspect_ratio =
                                            msgObj.aspect_ratio;
                                    }
                                    // 图片数量（用于验证，一条消息只能有一张图片）
                                    payload.count = 1; // 强制设置为1，确保一条消息只有一张图片
                                }

                                // 处理照片消息
                                if ((msgObj.type || "text") === "photo") {
                                    // 优先保留 image= 字段（URL / data:image / local:...）
                                    var imageField = String(msgObj.image || "").trim();
                                    var descField = String(msgObj.desc || "").trim();

                                    // 统一写入 payload：
                                    // - 有 image=：使用图片URL，并保留 desc 作为说明
                                    // - 无 image=：使用 content 或 desc
                                    if (imageField) {
                                        payload.image = imageField;
                                        payload.content = imageField;
                                        payload.desc = descField || "";
                                    } else {
                                        payload.content = String(msgObj.content || "").trim();
                                        payload.desc = descField || "";
                                    }
                                    // 同时保留 msgObj.image 字段，以便 chat.js 等地方可以直接访问
                                    if (imageField) {
                                        msgObj.image = imageField;
                                    }
                                }

                                // 处理转账消息
                                if ((msgObj.type || "text") === "transfer") {
                                    payload.amount = msgObj.amount || "";
                                    payload.note = msgObj.note || "";
                                    payload.content = msgObj.content || "转账";
                                }

                                // 生成唯一的消息ID，确保不会重复
                                var messageId = msgObj.id || "";

                                // 如果消息ID为空或已存在，生成新的唯一ID
                                if (!messageId) {
                                    // 使用时间戳+随机数+内容哈希生成唯一ID
                                    var contentHash = "";
                                    try {
                                        var contentStr =
                                            JSON.stringify(payload) || "";
                                        // 简单的哈希函数（基于内容的字符码和）
                                        var hash = 0;
                                        for (
                                            var i = 0;
                                            i < contentStr.length;
                                            i++
                                        ) {
                                            var char = contentStr.charCodeAt(i);
                                            hash = (hash << 5) - hash + char;
                                            hash = hash & hash; // 转换为32位整数
                                        }
                                        contentHash = Math.abs(hash)
                                            .toString(36)
                                            .substr(0, 8);
                                    } catch (e) {
                                        contentHash = Math.random()
                                            .toString(36)
                                            .substr(2, 8);
                                    }
                                    messageId =
                                        "wxid-" +
                                        Date.now() +
                                        "-" +
                                        contentHash +
                                        "-" +
                                        Math.random().toString(36).substr(2, 6);
                                } else {
                                    // 检查消息ID是否已存在
                                    var chats = window.XiaoxinWeChatDataHandler
                                        ? window.XiaoxinWeChatDataHandler.getAllChats()
                                        : {};
                                    var allMessages = [];
                                    Object.keys(chats).forEach(function (
                                        userId
                                    ) {
                                        var userMessages = chats[userId] || [];
                                        allMessages =
                                            allMessages.concat(userMessages);
                                    });

                                    var idExists = allMessages.some(function (
                                        msg
                                    ) {
                                        return msg.id === messageId;
                                    });

                                    if (idExists) {
                                        // 如果ID已存在，不要跳过（会导致世界书重复ID时“丢消息”）
                                        // 改为：自动生成新的唯一ID，确保本条消息仍能被加入队列并显示
                                        var oldId = messageId;
                                        var contentHash2 = "";
                                        try {
                                            var contentStr2 =
                                                JSON.stringify(payload) || "";
                                            var hash2 = 0;
                                            for (
                                                var i2 = 0;
                                                i2 < contentStr2.length;
                                                i2++
                                            ) {
                                                var char2 = contentStr2.charCodeAt(i2);
                                                hash2 = (hash2 << 5) - hash2 + char2;
                                                hash2 = hash2 & hash2;
                                            }
                                            contentHash2 = Math.abs(hash2)
                                                .toString(36)
                                                .substr(0, 8);
                                        } catch (e) {
                                            contentHash2 = Math.random()
                                                .toString(36)
                                                .substr(2, 8);
                                        }
                                        messageId =
                                            "wxid-" +
                                            Date.now() +
                                            "-" +
                                            contentHash2 +
                                            "-" +
                                            Math.random().toString(36).substr(2, 6);
                                        console.warn(
                                            "[小馨手机][消息监听] 检测到重复消息ID，已自动重生成以避免丢消息:",
                                            "原ID:",
                                            oldId,
                                            "新ID:",
                                            messageId,
                                            "from:",
                                            msgObj.from,
                                            "to:",
                                            msgObj.to
                                        );
                                    }
                                }

                                var convertedMsg = {
                                    id: messageId,
                                    time: msgTime,
                                    from: msgObj.from,
                                    to: msgObj.to,
                                    type: msgObj.type || "text",
                                    payload: payload,
                                    // 保留 call_id 字段，用于通话状态匹配
                                    call_id:
                                        msgObj.call_id || msgObj.callId || null,
                                    callId:
                                        msgObj.call_id || msgObj.callId || null,
                                };
                                // 对于 photo 类型消息，保留 image 字段到 convertedMsg，以便 chat.js 等地方可以直接访问
                                if ((msgObj.type || "text") === "photo" && msgObj.image) {
                                    convertedMsg.image = String(msgObj.image).trim();
                                }
                                parsedMessages.push(convertedMsg);
                                console.info(
                                    "[小馨手机][消息监听] 解析到微信私聊消息:",
                                    convertedMsg.id,
                                    "from:",
                                    convertedMsg.from,
                                    "to:",
                                    convertedMsg.to,
                                    "content:",
                                    convertedMsg.payload.content
                                );
                            }
                        });

                        // 第二步：处理所有 call_voice_text 消息（在 call_voice 消息处理完成后）
                        // 延迟处理，确保状态变化事件先触发，currentCall.callId 已设置
                        if (callVoiceTextMessages.length > 0) {
                            setTimeout(function () {
                                console.info(
                                    "[小馨手机][消息监听] 开始处理 call_voice_text 消息，数量:",
                                    callVoiceTextMessages.length
                                );

                                callVoiceTextMessages.forEach(function (item) {
                                    var msgObj = item.msgObj;

                                    console.info(
                                        "[小馨手机][消息监听] 处理语音通话文本消息，消息ID:",
                                        msgObj.id,
                                        "call_id:",
                                        msgObj.call_id || msgObj.callId
                                    );

                                    // 处理 call_voice_text 消息，显示在通话页面中
                                    // 获取当前玩家ID
                                    var currentAccount =
                                        window.XiaoxinWeChatAccount
                                            ? window.XiaoxinWeChatAccount.getCurrentAccount()
                                            : null;
                                    var playerWechatId = currentAccount
                                        ? currentAccount.wechatId ||
                                          currentAccount.id ||
                                          "player"
                                        : "player";
                                    var msgFromStr = String(
                                        msgObj.from || ""
                                    ).trim();
                                    var playerWechatIdStr = String(
                                        playerWechatId || ""
                                    ).trim();

                                    // 判断是否是角色发送的消息
                                    // 兼容：from="user" 也表示玩家
                                    var isFromRole =
                                        msgFromStr !== "player" &&
                                        msgFromStr !== "user" &&
                                        msgFromStr !== playerWechatIdStr;

                                    // 处理 call_voice_text 消息，显示在通话页面中
                                    // 注意：call_voice_text 的 call_id 可能是消息ID格式（call_wxid-xxx），需要找到对应的实际通话ID
                                    var callIdFromText =
                                        msgObj.call_id || msgObj.callId || "";
                                    var characterId = msgObj.from || "";
                                    var textContent =
                                        msgObj.text || msgObj.content || "";

                                    // 优先使用当前通话的 callId
                                    var actualCallId = null;

                                    // 检查是否有当前活跃的通话
                                    if (
                                        window.XiaoxinIncomingCall &&
                                        window.XiaoxinIncomingCall.currentCall
                                    ) {
                                        var currentCall =
                                            window.XiaoxinIncomingCall
                                                .currentCall;
                                        if (currentCall && currentCall.callId) {
                                            // 如果有当前通话，使用当前通话的 callId
                                            actualCallId = currentCall.callId;
                                            console.info(
                                                "[小馨手机][消息监听] 使用当前通话的 callId:",
                                                actualCallId
                                            );
                                        }
                                    }

                                    // 如果 call_id 是消息ID格式（call_wxid-xxx），从映射中查找
                                    if (
                                        !actualCallId &&
                                        callIdFromText &&
                                        callIdFromText.startsWith("call_wxid-")
                                    ) {
                                        // 从映射中查找对应的通话ID
                                        actualCallId =
                                            callIdMap[callIdFromText];
                                        if (actualCallId) {
                                            console.info(
                                                "[小馨手机][消息监听] 从映射中找到通话ID:",
                                                "call_id:",
                                                callIdFromText,
                                                "-> 通话ID:",
                                                actualCallId
                                            );
                                        } else {
                                            console.warn(
                                                "[小馨手机][消息监听] 无法从映射中找到通话ID:",
                                                callIdFromText
                                            );
                                        }
                                    }

                                    // 如果 call_id 不是消息ID格式，直接使用
                                    if (
                                        !actualCallId &&
                                        callIdFromText &&
                                        !callIdFromText.startsWith("call_wxid-")
                                    ) {
                                        actualCallId = callIdFromText;
                                    }

                                    // 如果仍然没有找到，尝试使用当前通话的 callId（最后的后备方案）
                                    if (
                                        !actualCallId &&
                                        window.XiaoxinIncomingCall &&
                                        window.XiaoxinIncomingCall.currentCall
                                    ) {
                                        var currentCall =
                                            window.XiaoxinIncomingCall
                                                .currentCall;
                                        if (currentCall && currentCall.callId) {
                                            actualCallId = currentCall.callId;
                                            console.info(
                                                "[小馨手机][消息监听] 使用当前通话的 callId 作为后备方案:",
                                                actualCallId
                                            );
                                        }
                                    }

                                    if (isFromRole && actualCallId) {
                                        if (
                                            window.XiaoxinIncomingCall &&
                                            typeof window.XiaoxinIncomingCall
                                                .displayCallVoiceTextMessage ===
                                                "function"
                                        ) {
                                            console.info(
                                                "[小馨手机][消息监听] 显示语音通话文本消息:",
                                                "call_id:",
                                                actualCallId,
                                                "characterId:",
                                                characterId,
                                                "text:",
                                                textContent.substring(0, 50) +
                                                    "..."
                                            );

                                            var pendingMessage = {
                                                id: msgObj.id,
                                                time: msgObj.time || "",
                                                from: msgObj.from,
                                                to: msgObj.to,
                                                type: "call_voice_text",
                                                text: textContent,
                                                call_id: actualCallId,
                                                callId: actualCallId,
                                            };

                                            window.XiaoxinIncomingCall.displayCallVoiceTextMessage(
                                                pendingMessage,
                                                characterId,
                                                actualCallId
                                            );
                                        } else {
                                            console.warn(
                                                "[小馨手机][消息监听] XiaoxinIncomingCall.displayCallVoiceTextMessage 不可用"
                                            );
                                        }
                                    } else if (isFromRole && !actualCallId) {
                                        console.warn(
                                            "[小馨手机][消息监听] 无法确定通话ID，跳过显示语音通话文本消息:",
                                            "call_id:",
                                            callIdFromText,
                                            "characterId:",
                                            characterId
                                        );
                                    }
                                });
                            }, 300); // 延迟300ms，确保状态变化事件先触发，currentCall.callId 已设置
                        }
                    }
                }

                // 将解析到的消息添加到数据处理器
                if (
                    parsedMessages.length > 0 &&
                    typeof window.XiaoxinWeChatDataHandler.addChatMessage ===
                        "function"
                ) {
                    // 获取当前玩家ID（多种方式尝试）
                    var currentAccount = null;
                    if (
                        window.XiaoxinWeChatAccount &&
                        typeof window.XiaoxinWeChatAccount.getCurrentAccount ===
                            "function"
                    ) {
                        currentAccount =
                            window.XiaoxinWeChatAccount.getCurrentAccount();
                    } else if (
                        window.XiaoxinWeChatDataHandler &&
                        typeof window.XiaoxinWeChatDataHandler.getAccount ===
                            "function"
                    ) {
                        currentAccount =
                            window.XiaoxinWeChatDataHandler.getAccount();
                    }

                    var playerWechatId = null;
                    if (currentAccount) {
                        playerWechatId =
                            currentAccount.wechatId ||
                            currentAccount.id ||
                            null;
                    }

                    // 如果仍然没有获取到，尝试从消息中推断（如果 from 字段不是角色ID，可能是玩家ID）
                    // 但这是最后的后备方案，不推荐
                    if (!playerWechatId) {
                        console.warn(
                            "[小馨手机][消息监听] 无法获取玩家ID，尝试从消息中推断"
                        );
                        // 不设置 playerWechatId，让后续逻辑处理
                    }

                    console.info(
                        "[小馨手机][消息监听] 当前玩家ID:",
                        playerWechatId || "(未获取到)",
                        "账号信息:",
                        currentAccount
                    );

                    // 获取所有联系人，用于匹配消息中的ID
                    var allContacts =
                        window.XiaoxinWeChatDataHandler.getContacts() || [];

                    // 根据wechatId或其他ID查找联系人的辅助函数
                    function findContactByWechatId(wechatId) {
                        if (!wechatId) return null;
                        var wechatIdStr = String(wechatId).trim();
                        return allContacts.find(function (contact) {
                            var cWechatId = cleanId(contact.wechatId);
                            var cWechatId2 = cleanId(contact.wechat_id);
                            var cWechatId3 = cleanId(contact.wechatID);
                            var cId = cleanId(contact.id);
                            var cCharId = String(
                                contact.characterId || ""
                            ).trim();

                            return (
                                cWechatId === wechatIdStr ||
                                cWechatId2 === wechatIdStr ||
                                cWechatId3 === wechatIdStr ||
                                cId === wechatIdStr ||
                                cId === "contact_" + wechatIdStr ||
                                wechatIdStr === "contact_" + cId ||
                                cCharId === wechatIdStr ||
                                cId.replace(/^contact_/, "") ===
                                    wechatIdStr.replace(/^contact_/, "")
                            );
                        });
                    }

                    // 收集所有 redpacket_claim 消息，延迟处理
                    var redpacketClaimMessages = [];

                    // 统一净化 from / to 字段，去掉 <br> 等标签，并移除 role_ 前缀
                    parsedMessages.forEach(function (msgObj) {
                        msgObj.from = cleanId(msgObj.from).replace(
                            /^role_/i,
                            ""
                        );
                        msgObj.to = cleanId(msgObj.to).replace(/^role_/i, "");

                        var msgFromStr = String(msgObj.from || "").trim();
                        var msgToStr = String(msgObj.to || "").trim();
                        var playerWechatIdStr = playerWechatId
                            ? String(playerWechatId).trim()
                            : "";

                        // ⚠️ 重要：如果消息是 AI 输出的，且 from=player/user/玩家ID，说明 AI 错误地标记了消息方向
                        // 需要修正：from 应该是角色ID（从 to 字段获取），to 应该是 player
                        if (typeof isAIMessage !== "undefined" && isAIMessage) {
                            // 如果 from=player 或 from 是玩家ID，说明 AI 错误地标记了消息方向
                            var isFromPlayer =
                                msgFromStr.toLowerCase() === "player" ||
                                msgFromStr.toLowerCase() === "user" ||
                                (playerWechatIdStr && msgFromStr === playerWechatIdStr);

                            if (isFromPlayer && msgToStr && msgToStr.toLowerCase() !== "player") {
                                // AI 错误地标记了消息方向，需要修正
                                // 原来的 from=player, to=角色ID 应该修正为 from=角色ID, to=player
                                console.warn(
                                    "[小馨手机][消息监听] ⚠️ 检测到 AI 错误地标记了消息方向，正在修正:",
                                    "原始 from:",
                                    msgFromStr,
                                    "原始 to:",
                                    msgToStr
                                );

                                // 交换 from 和 to
                                var correctedFrom = msgToStr; // 角色ID
                                var correctedTo = "player"; // 玩家

                                msgObj.from = correctedFrom;
                                msgObj.to = correctedTo;

                                console.info(
                                    "[小馨手机][消息监听] 已修正消息方向:",
                                    "修正后 from:",
                                    correctedFrom,
                                    "修正后 to:",
                                    correctedTo
                                );

                                // 更新局部变量
                                msgFromStr = correctedFrom;
                                msgToStr = correctedTo;
                            }
                        }

                        // 确定聊天对象（联系人）的ID
                        // 消息中的 from/to 可能是 wechatId，需要匹配到联系人的 id
                        var messageContactWechatId = null;

                        // 判断是否是玩家发送的消息
                        // 如果 playerWechatId 未获取到，尝试通过其他方式判断
                        var isPlayerMessage = false;
                        // 兼容：from="user" 也表示玩家
                        if (msgFromStr === "player" || msgFromStr === "user") {
                            isPlayerMessage = true;
                        } else if (playerWechatIdStr) {
                            // 有玩家ID，直接比较
                            isPlayerMessage = msgFromStr === playerWechatIdStr;
                        } else {
                            // 没有玩家ID，通过消息格式推断：
                            // 如果 to 字段是角色ID格式（不是 "player"），且 from 字段不是角色ID格式，可能是玩家消息
                            // 但这种方法不可靠，优先尝试从消息的 from 字段判断是否是玩家
                            // 如果 from 字段看起来像微信号（wxid_开头），且 to 字段是角色ID，可能是玩家消息
                            var fromLooksLikeWechatId =
                                msgFromStr.startsWith("wxid_") ||
                                msgFromStr.startsWith("wxid-");
                            var toLooksLikeCharacterId =
                                msgToStr &&
                                !msgToStr.toLowerCase().includes("player") &&
                                msgToStr !== msgFromStr;

                            if (
                                fromLooksLikeWechatId &&
                                toLooksLikeCharacterId
                            ) {
                                // 可能是玩家消息，但需要进一步确认
                                // 检查 to 字段是否在联系人列表中（如果是，说明 from 是玩家）
                                var toContact = findContactByWechatId(msgToStr);
                                if (toContact) {
                                    // to 字段是联系人，说明 from 是玩家
                                    isPlayerMessage = true;
                                    console.warn(
                                        "[小馨手机][消息监听] 通过推断判断为玩家消息（未获取到玩家ID）:",
                                        "from:",
                                        msgFromStr,
                                        "to:",
                                        msgToStr
                                    );
                                }
                            }
                        }

                        if (isPlayerMessage) {
                            // 玩家发送的消息，联系人是 to 字段（角色ID）
                            // 绝对不能使用 from 字段（玩家的微信号）作为联系人！
                            if (
                                !msgToStr ||
                                msgToStr === playerWechatIdStr ||
                                msgToStr.toLowerCase() === "player"
                            ) {
                                console.error(
                                    "[小馨手机][消息监听] 玩家消息的to字段无效，跳过处理:",
                                    "from:",
                                    msgFromStr,
                                    "to:",
                                    msgToStr
                                );
                                return; // 跳过这条消息，避免创建错误的聊天记录
                            }
                            messageContactWechatId = msgToStr;
                        } else {
                            // 角色发送的消息，联系人是 from 字段（角色ID）
                            messageContactWechatId = msgFromStr;
                        }

                        console.info(
                            "[小馨手机][消息监听] 确定聊天对象ID:",
                            "from:",
                            msgFromStr,
                            "to:",
                            msgToStr,
                            "playerWechatId:",
                            playerWechatIdStr,
                            "isPlayerMessage:",
                            isPlayerMessage,
                            "messageContactWechatId:",
                            messageContactWechatId
                        );

                        // 查找匹配的联系人
                        var matchedContact = findContactByWechatId(
                            messageContactWechatId
                        );
                        var contactId = null;

                        if (matchedContact) {
                            // 找到匹配的联系人，使用联系人的唯一ID
                            contactId = matchedContact.id;
                            console.info(
                                "[小馨手机][消息监听] 找到匹配的联系人:",
                                messageContactWechatId,
                                "->",
                                contactId,
                                "昵称:",
                                matchedContact.nickname || matchedContact.name
                            );
                        } else {
                            // 没找到匹配的联系人，尝试使用所有联系人列表查找
                            // 可能是角色ID（如 "2"）需要匹配到 contact.id（如 "contact_2"）
                            var fallbackContact = allContacts.find(function (
                                contact
                            ) {
                                var cId = String(contact.id || "").trim();
                                var cCharId = cleanId(contact.characterId);
                                var cWechatId = String(
                                    contact.wechatId || ""
                                ).trim();

                                return (
                                    cId === messageContactWechatId ||
                                    cCharId === messageContactWechatId ||
                                    cWechatId === messageContactWechatId ||
                                    cId ===
                                        "contact_" + messageContactWechatId ||
                                    messageContactWechatId ===
                                        "contact_" + cId ||
                                    cId.replace(/^contact_/, "") ===
                                        messageContactWechatId ||
                                    messageContactWechatId.replace(
                                        /^contact_/,
                                        ""
                                    ) === cId.replace(/^contact_/, "")
                                );
                            });

                            if (fallbackContact) {
                                contactId = fallbackContact.id;
                                console.info(
                                    "[小馨手机][消息监听] 通过备用匹配找到联系人:",
                                    messageContactWechatId,
                                    "->",
                                    contactId,
                                    "昵称:",
                                    fallbackContact.nickname ||
                                        fallbackContact.name
                                );
                            } else {
                                // 仍然没找到，尝试更宽松的匹配
                                // 对于玩家发送的消息，如果to字段是角色ID，尝试直接匹配
                                // 检查 from="player" 的情况（历史消息生成）
                                var isPlayerMessage =
                                    msgFromStr === "player" ||
                                    msgFromStr === "user" ||
                                    msgFromStr === playerWechatIdStr;
                                if (isPlayerMessage && msgToStr) {
                                    // 玩家发送的消息，to字段应该是角色ID
                                    // 尝试匹配角色ID（characterId）
                                    var roleContact = allContacts.find(
                                        function (contact) {
                                            var cCharId = String(
                                                contact.characterId || ""
                                            ).trim();
                                            var cId = String(
                                                contact.id || ""
                                            ).trim();
                                            var cWechatId = String(
                                                contact.wechatId || ""
                                            ).trim();

                                            return (
                                                cCharId === msgToStr ||
                                                cId === msgToStr ||
                                                cWechatId === msgToStr ||
                                                cId === "contact_" + msgToStr ||
                                                msgToStr === "contact_" + cId ||
                                                cId.replace(/^contact_/, "") ===
                                                    msgToStr ||
                                                msgToStr.replace(
                                                    /^contact_/,
                                                    ""
                                                ) ===
                                                    cId.replace(/^contact_/, "")
                                            );
                                        }
                                    );

                                    if (roleContact) {
                                        contactId = roleContact.id;
                                        console.info(
                                            "[小馨手机][消息监听] 通过角色ID匹配找到联系人（玩家消息）:",
                                            msgToStr,
                                            "->",
                                            contactId,
                                            "昵称:",
                                            roleContact.nickname ||
                                                roleContact.name
                                        );
                                    } else {
                                        // 仍然没找到，对于玩家消息，必须使用 to 字段（角色ID）作为 contactId
                                        // 绝对不能使用 from 字段（玩家的微信号）！
                                        if (isPlayerMessage) {
                                            // 玩家消息，使用 to 字段（角色ID）作为 contactId
                                            contactId = msgToStr;
                                            console.warn(
                                                "[小馨手机][消息监听] 未找到匹配的联系人（玩家消息），使用to字段作为contactId:",
                                                "to:",
                                                msgToStr,
                                                "contactId:",
                                                contactId,
                                                "注意：这是玩家发送给角色的消息，必须使用to字段（角色ID）"
                                            );
                                        } else {
                                            // 角色消息，使用 from 字段（角色ID）作为 contactId
                                            contactId = messageContactWechatId;
                                            console.warn(
                                                "[小馨手机][消息监听] 未找到匹配的联系人，使用消息ID:",
                                                messageContactWechatId
                                            );
                                        }
                                    }
                                } else {
                                    // 仍然没找到，对于玩家消息，必须使用 to 字段（角色ID）作为 contactId
                                    if (isPlayerMessage) {
                                        // 玩家消息，使用 to 字段（角色ID）作为 contactId
                                        contactId = msgToStr;
                                        console.warn(
                                            "[小馨手机][消息监听] 未找到匹配的联系人（玩家消息），使用to字段作为contactId:",
                                            "to:",
                                            msgToStr,
                                            "contactId:",
                                            contactId,
                                            "注意：这是玩家发送给角色的消息，必须使用to字段（角色ID）"
                                        );
                                    } else {
                                        // 角色消息，使用 from 字段（角色ID）作为 contactId
                                        contactId = messageContactWechatId;
                                        console.warn(
                                            "[小馨手机][消息监听] 未找到匹配的联系人，使用消息ID:",
                                            messageContactWechatId
                                        );
                                    }
                                }
                            }
                        }

                        // 检查消息是否已存在（避免重复添加）
                        var chats =
                            window.XiaoxinWeChatDataHandler.getAllChats();
                        var existingChat = chats[contactId] || [];
                        var messageExists = existingChat.some(function (msg) {
                            return msg.id === msgObj.id;
                        });

                        if (messageExists) {
                            // 检查已存在的消息是否已处理过（对于历史消息）
                            var existingMessage = existingChat.find(function (msg) {
                                return msg.id === msgObj.id;
                            });

                            // 如果是历史消息且已处理过，直接跳过
                            if (existingMessage && existingMessage.isHistorical && existingMessage._processed) {
                                console.info(
                                    "[小馨手机][消息监听] 历史消息已处理过，跳过重复添加:",
                                    msgObj.id
                                );
                                return;
                            }

                            console.info(
                                "[小馨手机][消息监听] 消息已存在，跳过:",
                                msgObj.id
                            );
                            return;
                        }

                        // 转换消息格式为数据处理器需要的格式
                        // 判断消息方向：直接使用 isPlayerMessage 的结果
                        // 如果 playerWechatId 未获取到，isPlayerMessage 已经通过推断逻辑判断过了
                        var isOutgoing = isPlayerMessage;

                        // 最终检查：确保玩家消息的 isOutgoing = true，角色消息的 isOutgoing = false
                        // 同时确保 contactId 正确（玩家消息必须使用 to 字段，不能使用 from 字段）
                        if (isOutgoing) {
                            // 玩家发送的消息
                            // 确保 contactId 不是玩家的微信号（from 字段）
                            var contactIdIsPlayerId = false;
                            if (playerWechatIdStr) {
                                contactIdIsPlayerId =
                                    contactId === msgFromStr ||
                                    contactId === playerWechatIdStr;
                            } else {
                                // 如果没有 playerWechatId，检查 contactId 是否等于 from 字段（可能是玩家的微信号）
                                // 如果 contactId 等于 from，且 from 看起来像微信号，可能是错误的
                                var fromLooksLikeWechatId =
                                    msgFromStr.startsWith("wxid_") ||
                                    msgFromStr.startsWith("wxid-");
                                contactIdIsPlayerId =
                                    contactId === msgFromStr &&
                                    fromLooksLikeWechatId;
                            }

                            if (contactIdIsPlayerId) {
                                console.error(
                                    "[小馨手机][消息监听] 致命错误：玩家消息的contactId被错误设置为玩家的微信号！",
                                    "from:",
                                    msgFromStr,
                                    "to:",
                                    msgToStr,
                                    "contactId:",
                                    contactId,
                                    "应该使用to字段（角色ID）作为contactId"
                                );
                                // 强制使用 to 字段作为 contactId
                                if (
                                    msgToStr &&
                                    msgToStr !== msgFromStr &&
                                    msgToStr.toLowerCase() !== "player"
                                ) {
                                    contactId = msgToStr;
                                    console.warn(
                                        "[小馨手机][消息监听] 已修正contactId为to字段:",
                                        contactId
                                    );
                                } else {
                                    console.error(
                                        "[小馨手机][消息监听] 无法修正contactId，to字段无效，跳过消息"
                                    );
                                    return; // 跳过这条消息
                                }
                            }
                        } else {
                            // 角色发送的消息
                            // 确保 contactId 不是玩家的微信号
                            var contactIdIsPlayerIdForRole = false;
                            if (playerWechatIdStr) {
                                contactIdIsPlayerIdForRole =
                                    contactId === playerWechatIdStr;
                            } else {
                                // 如果没有 playerWechatId，检查 contactId 是否等于 to 字段（可能是玩家的微信号）
                                var toLooksLikeWechatId =
                                    msgToStr &&
                                    (msgToStr.startsWith("wxid_") ||
                                        msgToStr.startsWith("wxid-"));
                                contactIdIsPlayerIdForRole =
                                    contactId === msgToStr &&
                                    toLooksLikeWechatId;
                            }

                            if (contactIdIsPlayerIdForRole) {
                                console.error(
                                    "[小馨手机][消息监听] 致命错误：角色消息的contactId被错误设置为玩家的微信号！",
                                    "from:",
                                    msgFromStr,
                                    "to:",
                                    msgToStr,
                                    "contactId:",
                                    contactId,
                                    "应该使用from字段（角色ID）作为contactId"
                                );
                                // 强制使用 from 字段作为 contactId
                                if (msgFromStr && msgFromStr !== msgToStr) {
                                    contactId = msgFromStr;
                                    console.warn(
                                        "[小馨手机][消息监听] 已修正contactId为from字段:",
                                        contactId
                                    );
                                } else {
                                    console.error(
                                        "[小馨手机][消息监听] 无法修正contactId，from字段无效，跳过消息"
                                    );
                                    return; // 跳过这条消息
                                }
                            }
                        }

                        console.info(
                            "[小馨手机][消息监听] 消息方向判断:",
                            "from:",
                            msgObj.from,
                            "to:",
                            msgObj.to,
                            "playerWechatId:",
                            playerWechatId,
                            "isOutgoing:",
                            isOutgoing,
                            "contactId:",
                            contactId
                        );

                        function sanitizeContent(val) {
                            return cleanFieldValue(val || "");
                        }

                        // 解析时间戳（支持中文格式）
                        var msgTimestamp = null; // 先设为null，优先使用世界观时间
                        if (msgObj.time) {
                            // 尝试解析时间字符串（支持多种格式）
                            var timeStr = String(msgObj.time).trim();
                            // 支持格式：2018年06月20日 07:55:01 或 2026-01-08 12:02:34
                            var normalizedTimeStr = timeStr
                                .replace(/-/g, "/")
                                .replace(/年|月|日|星期[一二三四五六日]/g, " ");
                            var parsed = Date.parse(normalizedTimeStr);
                            if (!isNaN(parsed)) {
                                msgTimestamp = parsed;
                                console.info(
                                    "[小馨手机][消息监听] 成功解析消息时间:",
                                    timeStr,
                                    "->",
                                    msgTimestamp
                                );
                            } else {
                                console.warn(
                                    "[小馨手机][消息监听] 无法解析消息时间:",
                                    timeStr
                                );
                            }
                        }

                        // 如果消息中没有time字段或解析失败，优先使用世界观时间
                        if (!msgTimestamp) {
                            // 优先使用全局世界观时钟的时间
                            if (
                                window.XiaoxinWorldClock &&
                                window.XiaoxinWorldClock.currentTimestamp
                            ) {
                                msgTimestamp =
                                    window.XiaoxinWorldClock.currentTimestamp;
                                console.info(
                                    "[小馨手机][消息监听] 消息中没有time字段或解析失败，使用世界观时间:",
                                    msgTimestamp,
                                    "原始时间:",
                                    window.XiaoxinWorldClock.rawTime ||
                                        window.XiaoxinWorldClock.raw ||
                                        ""
                                );
                            } else {
                                // 最后才使用现实时间（不推荐）
                                msgTimestamp = Date.now();
                                console.warn(
                                    "[小馨手机][消息监听] 消息中没有time字段且无世界观时间，使用现实时间（不推荐）"
                                );
                            }
                        }

                        // 确定 rawTime：优先使用消息中的 time 字段，如果没有则使用世界观时间的原始字符串
                        var msgRawTime = msgObj.time || "";
                        if (!msgRawTime && window.XiaoxinWorldClock) {
                            msgRawTime =
                                window.XiaoxinWorldClock.rawTime ||
                                window.XiaoxinWorldClock.raw ||
                                "";
                        }

                        // 玩家消息不再延迟，直接使用指令中的原始时间
                        // 这样可以确保消息按正确的时间顺序显示
                        if (isOutgoing) {
                            console.info(
                                "[小馨手机][消息监听] 玩家消息使用指令中的原始时间:",
                                "时间戳:",
                                msgTimestamp,
                                "时间字符串:",
                                msgRawTime || msgObj.time
                            );
                        }

                        // 玩家发送的消息，from 字段统一设置为 "user"（不暴露玩家微信号）
                        var chatMessage = {
                            id: msgObj.id,
                            type: msgObj.type,
                            from: isPlayerMessage ? "user" : msgObj.from,
                            content: sanitizeContent(
                                msgObj.payload && msgObj.payload.content
                                    ? msgObj.payload.content
                                    : ""
                            ),
                            sender: msgObj.from,
                            timestamp: msgTimestamp,
                            rawTime: msgRawTime, // 原始世界观时间字符串
                            isOutgoing: isOutgoing,
                            // 如果消息来自 [historychat] 标签，标记为历史消息
                            isHistorical: isFromHistoryChat || msgObj.isHistorical === true || msgObj.isHistorical === "true",
                        };

                        // ⚠️ 重要：用于存储已存在的消息（用于图片消息等）
                        var existingMessage = null;

                        // 根据消息类型处理不同内容
                        if (msgObj.type === "image") {
                            // ⚠️ 重要：先检查是否已有消息存在，如果有且已处理，保留其 _processed 标记和图片URL
                            try {
                                if (
                                    window.XiaoxinWeChatDataHandler &&
                                    typeof window.XiaoxinWeChatDataHandler.getChatMessages === "function"
                                ) {
                                    var contactId = msgObj.to === "player" || msgObj.to === "user"
                                        ? msgObj.from
                                        : (msgObj.to || msgObj.from);
                                    var existingMessages = window.XiaoxinWeChatDataHandler.getChatMessages(contactId) || [];

                                    // 首先通过消息ID查找
                                    if (msgObj.id) {
                                        existingMessage = existingMessages.find(function(m) {
                                            return m.id === msgObj.id;
                                        });
                                    }

                                    // ⚠️ 重要：如果通过ID没找到，检查消息正文中是否包含图片消息id
                                    // 例如：消息正文中提到 "wxid-X3y8Z9v0"，应该更新该消息而不是创建新消息
                                    if (!existingMessage) {
                                        // 从消息正文中提取图片消息id（格式：wxid-xxx）
                                        var contentText = String(msgObj.content || "").trim();
                                        var descText = String((msgObj.payload && msgObj.payload.desc) || msgObj.desc || "").trim();
                                        var allText = (contentText + " " + descText).trim();

                                        // 匹配 wxid- 开头的消息id
                                        var imageIdMatch = allText.match(/wxid-[\w\-]+/i);
                                        if (imageIdMatch) {
                                            var extractedImageId = imageIdMatch[0];
                                            console.info(
                                                "[小馨手机][消息监听] 从消息正文中提取到图片消息id:",
                                                extractedImageId
                                            );

                                            // 在所有聊天记录中查找该消息id
                                            var allChats = window.XiaoxinWeChatDataHandler.getAllChats() || {};
                                            var foundMessage = null;
                                            Object.keys(allChats).forEach(function(userId) {
                                                if (foundMessage) return;
                                                var messages = allChats[userId] || [];
                                                foundMessage = messages.find(function(m) {
                                                    return m.id === extractedImageId && m.type === "image";
                                                });
                                            });

                                            if (foundMessage) {
                                                existingMessage = foundMessage;
                                                console.info(
                                                    "[小馨手机][消息监听] 通过消息正文中的图片消息id找到已存在消息:",
                                                    "提取的消息id:",
                                                    extractedImageId,
                                                    "已存在消息ID:",
                                                    existingMessage.id,
                                                    "原消息ID:",
                                                    msgObj.id
                                                );
                                                // 使用已存在消息的ID，确保消息ID一致
                                                msgObj.id = existingMessage.id;
                                                chatMessage.id = existingMessage.id;
                                            }
                                        }
                                    }

                                    // 如果通过ID没找到，尝试通过时间戳和描述匹配（用于处理消息ID不一致的情况）
                                    if (!existingMessage && msgObj.time) {
                                        var msgTime = msgObj.time;
                                        var msgDesc = (msgObj.payload && msgObj.payload.desc) || msgObj.desc || "";
                                        existingMessage = existingMessages.find(function(m) {
                                            // 匹配条件：相同类型、相同时间、相同描述（或描述相似）
                                            if (m.type !== "image") return false;
                                            if (m.rawTime !== msgTime && m.time !== msgTime) return false;
                                            if (msgDesc) {
                                                var mDesc = m.desc || m.image_desc || "";
                                                // 如果描述匹配或相似，认为是同一条消息
                                                return mDesc === msgDesc || mDesc.indexOf(msgDesc) !== -1 || msgDesc.indexOf(mDesc) !== -1;
                                            }
                                            return false;
                                        });

                                        if (existingMessage) {
                                            console.info(
                                                "[小馨手机][消息监听] 通过时间戳和描述匹配到已存在消息:",
                                                "原消息ID:",
                                                msgObj.id,
                                                "已存在消息ID:",
                                                existingMessage.id,
                                                "时间:",
                                                msgTime
                                            );
                                            // 使用已存在消息的ID，确保消息ID一致
                                            msgObj.id = existingMessage.id;
                                            chatMessage.id = existingMessage.id;
                                        }
                                    }

                                    if (existingMessage) {
                                        console.info(
                                            "[小馨手机][消息监听] 找到已存在消息:",
                                            "消息ID:",
                                            existingMessage.id,
                                            "_processed:",
                                            existingMessage._processed,
                                            "image:",
                                            existingMessage.image ? existingMessage.image.substring(0, 50) + "..." : "(空)"
                                        );
                                    }
                                }
                            } catch (e) {
                                console.warn("[小馨手机][消息监听] 检查已存在消息失败:", e);
                            }

                            // ✅ 优先使用 payload.image 或 msgObj.image 作为真正的图片URL（含 local: / data:image / http）
                            // ⚠️ 重要：检查 msgObj.image（从 [MSG] 标签直接解析）和 payload.image（从 payload 中读取）
                            var payloadImage = "";
                            if (msgObj.payload && msgObj.payload.image) {
                                payloadImage = String(msgObj.payload.image).trim();
                            } else if (msgObj.image) {
                                // 如果 payload.image 不存在，检查 msgObj.image（从 [MSG] 标签直接解析）
                                payloadImage = String(msgObj.image).trim();
                            }

                            // ⚠️ 重要：如果已有消息存在且有有效的图片URL，优先使用已存在的图片URL
                            // 无论是否有 _processed 标记，只要已有消息有 image 字段（有效URL），就应该使用，不再生成
                            // ⚠️ 关键修复：即使 payloadImage 已存在，如果已存在消息有 image 字段，也应该优先使用已存在消息的 image
                            if (existingMessage && existingMessage.image) {
                                var existingImageStr = String(existingMessage.image || "").trim();
                                var isExistingImageUrl =
                                    existingImageStr.startsWith("http://") ||
                                    existingImageStr.startsWith("https://") ||
                                    existingImageStr.startsWith("/") ||
                                    existingImageStr.toLowerCase().startsWith("local:") ||
                                    existingImageStr.startsWith("data:image") ||
                                    /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(existingImageStr);

                                // ⚠️ 关键修复：如果已存在消息有有效的图片URL，无论 payloadImage 是否为空，都应该使用已存在消息的 image
                                // 这样可以确保即使 AI 再次输出相同的 desc，也会使用已生成的图片，而不是重新生成
                                if (isExistingImageUrl) {
                                    payloadImage = existingImageStr;
                                    console.info(
                                        "[小馨手机][消息监听] 使用已存在消息的图片URL（无论是否有_processed标记，无论payloadImage是否为空）:",
                                        "原消息ID:",
                                        msgObj.id,
                                        "已存在消息ID:",
                                        existingMessage.id,
                                        "_processed:",
                                        existingMessage._processed,
                                        "图片URL:",
                                        payloadImage.substring(0, 50) + "..."
                                    );
                                }
                            }

                            var imageDescRaw = "";
                            if (msgObj.payload) {
                                imageDescRaw =
                                    msgObj.payload.desc ||
                                    msgObj.payload.content ||
                                    "";
                            }
                            // 如果 payload 中没有 desc，尝试从 msgObj.desc 获取
                            if (!imageDescRaw) {
                                imageDescRaw = String(msgObj.desc || "").trim();
                            }

                            // 如果 desc 为空，尝试从 content 获取（兼容旧格式）
                            if (!imageDescRaw && msgObj.content) {
                                imageDescRaw = sanitizeContent(msgObj.content);
                            }

                            // 如果有图片URL（无论是 payload.image 还是 msgObj.image）：这是"已经有图片URL"的情况，绝对不能再当描述去生图
                            if (payloadImage) {
                                chatMessage.image = payloadImage;
                                chatMessage.content = payloadImage;
                                // ⚠️ 重要：标记为已处理，避免刷新后重复生成
                                // 如果已有消息存在且已处理，也保留 _processed 标记
                                chatMessage._processed = true;
                                // 如果已有消息存在且已处理，确保使用已存在的 _processed 标记
                                if (existingMessage && existingMessage._processed === true) {
                                    chatMessage._processed = true;
                                    console.info(
                                        "[小馨手机][消息监听] 保留已存在消息的 _processed 标记:",
                                        msgObj.id
                                    );
                                }
                                // 额外保存描述，供渲染端用作说明（不会触发生图）
                                if (imageDescRaw) {
                                    chatMessage.image_desc = imageDescRaw;
                                }

                                // 图片比例（可选）
                                if (msgObj.payload && msgObj.payload.aspect_ratio) {
                                    chatMessage.aspect_ratio =
                                        msgObj.payload.aspect_ratio;
                                } else if (msgObj.aspect_ratio) {
                                    // 兼容直接从 msgObj 读取
                                    chatMessage.aspect_ratio =
                                        msgObj.aspect_ratio;
                                }

                                // 确保一条消息只有一张图片
                                chatMessage.imageCount = 1;

                                console.info(
                                    "[小馨手机][消息监听] 解析图片消息（已有URL）:",
                                    "id:",
                                    msgObj.id,
                                    "image:",
                                    payloadImage.substring(0, 80) + "...",
                                    "desc:",
                                    imageDescRaw
                                        ? imageDescRaw.substring(0, 50) + "..."
                                        : "(空)",
                                    "_processed:",
                                    chatMessage._processed
                                );
                            } else {
                                // 没有 payload.image，才把 desc 当作“图片描述/表情包”，可能需要生图
                                var imageDesc = imageDescRaw || "";

                                // 检测是否是表情包（ID、URL或描述）
                                var isSticker = false;
                                var stickerContent = imageDesc.trim();

                                if (stickerContent) {
                                    // 1. 检查是否是表情包ID（以 sticker_ 开头）
                                    if (stickerContent.startsWith("sticker_")) {
                                        isSticker = true;
                                    }
                                    // 2. 检查是否是URL格式的表情包
                                    else if (
                                        stickerContent.startsWith("http://") ||
                                        stickerContent.startsWith("https://") ||
                                        stickerContent.startsWith("data:image") ||
                                        (stickerContent.startsWith("/") &&
                                            !stickerContent.startsWith(
                                                "/scripts"
                                            ))
                                    ) {
                                        // 可能是URL格式的表情包，需要进一步检查
                                        // 检查是否是表情包列表中的URL
                                        try {
                                            if (
                                                window.XiaoxinWeChatApp &&
                                                typeof window.XiaoxinWeChatApp
                                                    ._getEmojiList ===
                                                    "function"
                                            ) {
                                                var emojiList =
                                                    window.XiaoxinWeChatApp._getEmojiList() ||
                                                    [];
                                                if (
                                                    emojiList.indexOf(
                                                        stickerContent
                                                    ) !== -1
                                                ) {
                                                    isSticker = true;
                                                }
                                            }
                                        } catch (e) {
                                            console.warn(
                                                "[小馨手机][消息监听] 检查表情包URL失败:",
                                                e
                                            );
                                        }
                                    }
                                    // 3. 检查是否是表情包描述（匹配玩家上传的表情包描述）
                                    else {
                                        try {
                                            if (
                                                window.XiaoxinWeChatDataHandler &&
                                                typeof window
                                                    .XiaoxinWeChatDataHandler
                                                    .getAllStickers ===
                                                    "function"
                                            ) {
                                                var allStickers =
                                                    window.XiaoxinWeChatDataHandler.getAllStickers() ||
                                                    [];
                                                // 查找描述匹配的表情包
                                                var matchedSticker =
                                                    allStickers.find(function (
                                                        sticker
                                                    ) {
                                                        var desc =
                                                            sticker.description ||
                                                            sticker.desc ||
                                                            "";
                                                        // 完全匹配或包含匹配
                                                        return (
                                                            desc ===
                                                                stickerContent ||
                                                            desc.indexOf(
                                                                stickerContent
                                                            ) !== -1 ||
                                                            stickerContent.indexOf(
                                                                desc
                                                            ) !== -1
                                                        );
                                                    });

                                                if (matchedSticker) {
                                                    isSticker = true;
                                                    // 使用表情包的ID或URL作为content
                                                    stickerContent =
                                                        matchedSticker.id ||
                                                        matchedSticker.url ||
                                                        matchedSticker.src ||
                                                        matchedSticker.path ||
                                                        stickerContent;
                                                }
                                            }
                                        } catch (e) {
                                            console.warn(
                                                "[小馨手机][消息监听] 检查表情包描述失败:",
                                                e
                                            );
                                        }
                                    }
                                }

                                // 如果是表情包，转换为 emoji 类型
                                if (isSticker) {
                                    console.info(
                                        "[小馨手机][消息监听] 检测到表情包，将 image 类型转换为 emoji:",
                                        "原始内容:",
                                        imageDesc.substring(0, 50),
                                        "表情包标识:",
                                        stickerContent.substring(0, 50)
                                    );
                                    chatMessage.type = "emoji";
                                    chatMessage.content = stickerContent;
                                    // 清除图片相关字段
                                    delete chatMessage.image;
                                    delete chatMessage.aspect_ratio;
                                    delete chatMessage.imageCount;
                                } else {
                                    // 是真正的"图片描述"（没有 image=）
                                    // ⚠️ 重要：如果已有消息存在且有有效的图片URL，无论是否有 _processed 标记，都应该使用它
                                    if (existingMessage && existingMessage.image) {
                                        var existingImageStr = String(existingMessage.image || "").trim();
                                        var isExistingImageUrl =
                                            existingImageStr.startsWith("http://") ||
                                            existingImageStr.startsWith("https://") ||
                                            existingImageStr.startsWith("/") ||
                                            existingImageStr.toLowerCase().startsWith("local:") ||
                                            existingImageStr.startsWith("data:image") ||
                                            /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(existingImageStr);

                                        if (isExistingImageUrl) {
                                            // 已有消息有有效的图片URL，使用已存在的图片URL
                                            chatMessage.image = existingImageStr;
                                            chatMessage.content = existingImageStr;
                                            chatMessage._processed = true; // 标记为已处理，避免重复生成
                                            console.info(
                                                "[小馨手机][消息监听] 保留已存在消息的图片URL（无论是否有_processed标记）:",
                                                "消息ID:",
                                                msgObj.id,
                                                "已存在消息ID:",
                                                existingMessage.id,
                                                "_processed:",
                                                existingMessage._processed,
                                                "图片URL:",
                                                existingImageStr.substring(0, 50) + "..."
                                            );
                                        } else {
                                            // 已有消息有 image 字段但不是有效URL，使用描述文本
                                            chatMessage.content = imageDesc;
                                            chatMessage.image = imageDesc; // 供后续生成图片用
                                        }
                                    } else {
                                        // 没有已存在的消息，或已存在的消息没有 image 字段，使用描述文本
                                        chatMessage.content = imageDesc;
                                        chatMessage.image = imageDesc; // 供后续生成图片用
                                    }

                                    // 图片比例（可选）
                                    if (msgObj.payload && msgObj.payload.aspect_ratio) {
                                        chatMessage.aspect_ratio =
                                            msgObj.payload.aspect_ratio;
                                    } else if (msgObj.aspect_ratio) {
                                        // 兼容直接从 msgObj 读取
                                        chatMessage.aspect_ratio =
                                            msgObj.aspect_ratio;
                                    }

                                    // 确保一条消息只有一张图片
                                    chatMessage.imageCount = 1;

                                    console.info(
                                        "[小馨手机][消息监听] 解析图片描述消息（无 image 字段）:",
                                        "id:",
                                        msgObj.id,
                                        "desc:",
                                        imageDesc
                                            ? imageDesc.substring(0, 50) + "..."
                                            : "(空)",
                                        "aspect_ratio:",
                                        chatMessage.aspect_ratio || "默认(1:1)"
                                    );
                                }
                            }
                        } else if (msgObj.type === "emoji" && msgObj.payload) {
                            // 处理表情包消息
                            var emojiContent =
                                msgObj.payload.content || msgObj.content || "";

                            // 优化：识别 content=[表情包]xxx 格式，提取表情包文件名
                            // 如果 content 以 [表情包] 开头，提取后面的内容作为表情包文件名
                            var emojiMatch = /^\[表情包\](.*)$/i.exec(emojiContent);
                            if (emojiMatch && emojiMatch[1]) {
                                emojiContent = emojiMatch[1].trim();
                                console.info(
                                    "[小馨手机][消息监听] 检测到 [表情包] 格式，提取表情包文件名:",
                                    emojiContent
                                );
                            }

                            chatMessage.content = sanitizeContent(emojiContent);
                            console.info(
                                "[小馨手机][消息监听] 解析表情包消息:",
                                "id:",
                                msgObj.id,
                                "content:",
                                emojiContent
                                    ? emojiContent.substring(0, 50) + "..."
                                    : "(空)"
                            );
                        } else if (msgObj.type === "photo" && msgObj.payload) {
                            // 处理照片消息
                            // 优先使用 payload.image 作为真正的图片URL（含 local: / data:image / http）
                            var payloadImage =
                                (msgObj.payload.image &&
                                    String(msgObj.payload.image).trim()) ||
                                "";
                            var photoDescRaw =
                                msgObj.payload.desc ||
                                msgObj.payload.content ||
                                "";

                            // 如果有图片URL，使用它作为content和image
                            if (payloadImage) {
                                chatMessage.content = payloadImage;
                                chatMessage.image = payloadImage;
                                chatMessage.desc = photoDescRaw || "";
                            } else {
                                // 没有图片URL，使用content或desc
                                chatMessage.content = msgObj.payload.content || "";
                                chatMessage.desc = photoDescRaw || "";
                            }
                        } else if (msgObj.type === "voice" && msgObj.payload) {
                            chatMessage.content = msgObj.payload.content || "";
                            chatMessage.duration =
                                msgObj.payload.duration_sec || 0;
                        } else if (
                            msgObj.type === "transfer" &&
                            msgObj.payload
                        ) {
                            // 处理转账消息
                            chatMessage.content =
                                msgObj.payload.content ||
                                msgObj.content ||
                                "转账";
                            chatMessage.amount = parseFloat(
                                msgObj.payload.amount || msgObj.amount || 0
                            );
                            chatMessage.note =
                                msgObj.payload.note || msgObj.note || "";
                        } else if (
                            msgObj.type === "redpacket" &&
                            msgObj.payload
                        ) {
                            // 处理红包消息
                            // ⚠️ 重要：确保 type 字段被正确设置为 "redpacket"
                            chatMessage.type = "redpacket";
                            chatMessage.redpacket_id =
                                msgObj.payload.redpacket_id ||
                                msgObj.redpacket_id ||
                                "";
                            chatMessage.amount = parseFloat(
                                msgObj.payload.amount || msgObj.amount || 0
                            );
                            // 红包备注的优先级：note > greeting > content（因为红包的备注可能在content字段中）
                            chatMessage.note =
                                msgObj.payload.note ||
                                msgObj.note ||
                                msgObj.payload.greeting ||
                                msgObj.greeting ||
                                msgObj.payload.content ||
                                msgObj.content ||
                                "";
                            // ⚠️ 重要：红包消息的 content 字段不应该包含 [MSG] 标签
                            // 如果 content 包含 [MSG] 标签，清空它，避免在渲染时被过滤掉
                            var redpacketContent = msgObj.payload.content || msgObj.content || "";
                            if (redpacketContent && typeof redpacketContent === "string") {
                                // 如果 content 包含 [MSG] 标签，清空它
                                if (redpacketContent.indexOf("[MSG]") !== -1 || redpacketContent.indexOf("[/MSG]") !== -1) {
                                    console.warn(
                                        "[小馨手机][消息监听] 红包消息的 content 字段包含 [MSG] 标签，已清空:",
                                        "消息ID:",
                                        msgObj.id,
                                        "原始content:",
                                        redpacketContent.substring(0, 50)
                                    );
                                    redpacketContent = "";
                                }
                            }
                            chatMessage.content = redpacketContent;
                            console.info(
                                "[小馨手机][消息监听] 红包消息解析完成:",
                                "消息ID:",
                                chatMessage.id,
                                "type:",
                                chatMessage.type,
                                "redpacket_id:",
                                chatMessage.redpacket_id,
                                "amount:",
                                chatMessage.amount,
                                "note:",
                                chatMessage.note,
                                "content:",
                                chatMessage.content ? (chatMessage.content.length > 50 ? chatMessage.content.substring(0, 50) + "..." : chatMessage.content) : "(空)"
                            );
                            if (msgObj.payload.sticker || msgObj.sticker) {
                                chatMessage.sticker =
                                    msgObj.payload.sticker || msgObj.sticker;
                            }
                            console.info(
                                "[小馨手机][消息监听] 解析红包消息:",
                                "id:",
                                msgObj.id,
                                "redpacket_id:",
                                chatMessage.redpacket_id,
                                "amount:",
                                chatMessage.amount,
                                "note:",
                                chatMessage.note
                            );
                        } else if (msgObj.type === "redpacket_claim") {
                            // 处理领取红包消息
                            chatMessage.redpacket_id =
                                (msgObj.payload && msgObj.payload.redpacket_id) ||
                                msgObj.redpacket_id ||
                                "";

                            // 领取者ID：redpacket_claim 的 from 字段就是领取者（角色ID）
                            var fromField =
                                msgObj.from ||
                                (msgObj.payload && msgObj.payload.from) ||
                                "";
                            var claimedByRaw =
                                (msgObj.payload && msgObj.payload.claimed_by) ||
                                msgObj.claimed_by ||
                                fromField ||
                                "";

                            // 如果 claimed_by 是 "player" 或 "0"，或者是 from=player，转换为玩家的实际ID
                            var claimedByToSet = claimedByRaw;
                            if (
                                claimedByRaw === "player" ||
                                claimedByRaw === "0" ||
                                fromField === "player" ||
                                String(fromField || "").trim().toLowerCase() === "player"
                            ) {
                                // 获取当前玩家账号信息
                                var currentAccount = window.XiaoxinWeChatAccount
                                    ? window.XiaoxinWeChatAccount.getCurrentAccount()
                                    : null;
                                if (currentAccount) {
                                    claimedByToSet = String(
                                        currentAccount.id ||
                                        currentAccount.wechatId ||
                                        "player"
                                    ).trim();
                                    console.info(
                                        "[小馨手机][消息监听] redpacket_claim 初始处理：将 'player' 转换为实际ID:",
                                        claimedByToSet
                                    );
                                }
                            }

                            // 确保 claimed_by 不为空（最低限度使用 fromField）
                            if (!claimedByToSet && fromField) {
                                claimedByToSet = String(fromField).trim();
                            }

                            chatMessage.claimed_by = claimedByToSet;

                            // 获取领取者的显示名称（优先使用备注，无备注则使用微信昵称）
                            var claimerName = chatMessage.claimed_by || "";

                            // 如果领取者是玩家，使用玩家账号信息
                            if (
                                claimedByToSet === "player" ||
                                (currentAccount && (
                                    String(claimedByToSet).trim() === String(currentAccount.id || "").trim() ||
                                    String(claimedByToSet).trim() === String(currentAccount.wechatId || "").trim()
                                ))
                            ) {
                                if (currentAccount) {
                                    claimerName = currentAccount.nickname || currentAccount.name || "你";
                                } else {
                                    claimerName = "你";
                                }
                            } else {
                                // 查找领取者（角色）的联系人信息
                                if (chatMessage.claimed_by) {
                                    var claimerContact = findContactByWechatId(
                                        chatMessage.claimed_by
                                    );
                                    if (claimerContact) {
                                        // 优先使用备注，无备注则使用微信昵称
                                        claimerName =
                                            claimerContact.remark ||
                                            claimerContact.note ||
                                            claimerContact.nickname ||
                                            chatMessage.claimed_by;
                                    } else {
                                        // 如果找不到联系人，至少使用角色ID而不是空字符串
                                        claimerName = chatMessage.claimed_by;
                                    }
                                } else {
                                    // 如果 claimed_by 也不存在，使用空字符串（这种情况不应该发生）
                                    claimerName = "";
                                }
                            }

                            // 查找红包发送者的昵称（从红包消息中获取）
                            // 这里先收集信息，稍后在延迟处理时获取发送者信息

                            // 注意：不要在这里将 chatMessage.type 改为 redpacket_claim_notification
                            // 因为此时还没有获取到发送者信息，会导致 senderName 等字段为 undefined
                            // 我们只收集信息，在延迟处理时统一创建通知消息

                            // 收集 redpacket_claim 消息信息，延迟处理（确保所有消息都已添加到聊天记录）
                            if (chatMessage.redpacket_id) {
                                // ⚠️ 重要：保存 from 字段作为备用，因为 from 就是角色ID
                                redpacketClaimMessages.push({
                                    redpacket_id: chatMessage.redpacket_id,
                                    claimed_by: chatMessage.claimed_by || fromField, // 如果 claimed_by 为空，使用 from 字段
                                    from: fromField, // 保存 from 字段作为备用
                                    claimerName: claimerName,
                                    userId: contactId, // 存储 userId 以便后续查找
                                    timestamp: chatMessage.timestamp,
                                    rawTime: chatMessage.rawTime,
                                });
                                // 不在这里输出大量调试日志（领取通知由延迟处理生成）

                                // 重要：不要将 redpacket_claim 消息添加到聊天记录
                                // 我们会在延迟处理时创建完整的 redpacket_claim_notification 消息
                                // 跳过这条消息，不添加到聊天记录
                                return; // 跳过，不添加到聊天记录
                            }
                        } else if (
                            msgObj.type === "redpacket_receive" &&
                            msgObj.payload
                        ) {
                            // 处理红包领取通知（显示文本消息，同时更新红包状态）
                            chatMessage.type = "text"; // 作为文本消息显示
                            chatMessage.redpacket_id =
                                msgObj.payload.redpacket_id ||
                                msgObj.redpacket_id ||
                                "";
                            chatMessage.claimed_by =
                                msgObj.payload.claimed_by ||
                                msgObj.claimed_by ||
                                "";
                            chatMessage.content =
                                msgObj.payload.content || msgObj.content || "";

                            // 查找对应的红包消息并更新状态
                            try {
                                if (
                                    chatMessage.redpacket_id &&
                                    window.XiaoxinWeChatDataHandler
                                ) {
                                    var allChats =
                                        window.XiaoxinWeChatDataHandler.getAllChats();
                                    var updated = false;

                                    // 遍历所有聊天记录，查找对应的红包消息
                                    Object.keys(allChats).forEach(function (
                                        userId
                                    ) {
                                        var messages = allChats[userId] || [];
                                        var chatUpdated = false;

                                        messages.forEach(function (msg) {
                                            var msgRedpacketId =
                                                msg.redpacket_id ||
                                                (msg.payload &&
                                                    msg.payload.redpacket_id) ||
                                                "";
                                            if (
                                                msg.type === "redpacket" &&
                                                msgRedpacketId ===
                                                    chatMessage.redpacket_id
                                            ) {
                                                msg.claimed = true;
                                                msg.status = "claimed";
                                                msg.claimed_by =
                                                    chatMessage.claimed_by;
                                                chatUpdated = true;
                                                updated = true;
                                                console.info(
                                                    "[小馨手机][消息监听] 更新红包状态为已领取:",
                                                    "userId:",
                                                    userId,
                                                    "redpacket_id:",
                                                    chatMessage.redpacket_id,
                                                    "claimed_by:",
                                                    chatMessage.claimed_by
                                                );
                                            }
                                        });

                                        if (chatUpdated) {
                                            // 使用updateChatMessage方法更新消息
                                            messages.forEach(function (msg) {
                                                if (
                                                    msg.type === "redpacket" &&
                                                    (msg.redpacket_id ||
                                                        (msg.payload &&
                                                            msg.payload
                                                                .redpacket_id)) ===
                                                        chatMessage.redpacket_id
                                                ) {
                                                    window.XiaoxinWeChatDataHandler.updateChatMessage(
                                                        userId,
                                                        msg.id,
                                                        {
                                                            claimed: true,
                                                            status: "claimed",
                                                            claimed_by:
                                                                chatMessage.claimed_by,
                                                        }
                                                    );
                                                }
                                            });
                                        }
                                    });

                                    if (updated) {
                                        // 触发聊天更新事件，刷新UI
                                        try {
                                            if (
                                                typeof window.CustomEvent !==
                                                "undefined"
                                            ) {
                                                var event = new CustomEvent(
                                                    "xiaoxin-chat-updated",
                                                    {
                                                        detail: {
                                                            redpacket_claimed: true,
                                                            redpacket_id:
                                                                chatMessage.redpacket_id,
                                                        },
                                                    }
                                                );
                                                window.dispatchEvent(event);
                                            }
                                        } catch (e) {
                                            console.warn(
                                                "[小馨手机][消息监听] 触发聊天更新事件失败:",
                                                e
                                            );
                                        }
                                    }
                                }
                            } catch (e) {
                                console.warn(
                                    "[小馨手机][消息监听] 更新红包状态失败:",
                                    e
                                );
                            }

                            console.info(
                                "[小馨手机][消息监听] 解析领取红包消息:",
                                "redpacket_id:",
                                chatMessage.redpacket_id,
                                "claimed_by:",
                                chatMessage.claimed_by
                            );
                        } else if (
                            (msgObj.type === "call_voice" ||
                                msgObj.type === "call_video") &&
                            msgObj.payload
                        ) {
                            // 处理语音/视频通话消息
                            chatMessage.callState =
                                msgObj.payload.state || "ringing";
                            chatMessage.callWith =
                                msgObj.payload.with || msgObj.from;
                            // 支持 duration 和 duration_sec 两种字段名
                            // 确保转换为数字类型（秒），优先使用 duration_sec
                            var durationValue =
                                msgObj.payload.duration_sec ||
                                msgObj.payload.duration ||
                                0;
                            chatMessage.duration =
                                typeof durationValue === "string"
                                    ? parseInt(durationValue, 10) || 0
                                    : typeof durationValue === "number"
                                    ? durationValue
                                    : 0;
                            chatMessage.note = msgObj.payload.note || "";
                            // 存储 call_id，用于匹配同一条通话的消息
                            var callIdFromMsg =
                                msgObj.call_id || msgObj.callId || "";
                            if (callIdFromMsg) {
                                chatMessage.call_id = callIdFromMsg;
                                chatMessage.callId = callIdFromMsg;
                            }

                            // 如果是角色响应玩家发起的通话，监听角色对通话的处理状态
                            // 判断条件：消息的 from 是角色ID，to 是玩家，且包含 call_id 字段
                            var isRoleResponseToPlayerCall = false;
                            // 从原始 msgObj 中获取 call_id（parseKeyValueFormat 解析的结果）
                            // 注意：msgObj 是经过 parseKeyValueFormat 解析的，应该包含所有字段
                            var callIdFromMsg =
                                msgObj.call_id || msgObj.callId || "";

                            console.info(
                                "[小馨手机][消息监听] 处理通话消息:",
                                "type:",
                                msgObj.type,
                                "from:",
                                msgObj.from,
                                "to:",
                                msgObj.to,
                                "state:",
                                chatMessage.callState,
                                "call_id:",
                                callIdFromMsg,
                                "msgObj keys:",
                                Object.keys(msgObj)
                            );

                            if (msgObj.from && msgObj.to) {
                                // 获取当前玩家ID
                                var currentAccount = window.XiaoxinWeChatAccount
                                    ? window.XiaoxinWeChatAccount.getCurrentAccount()
                                    : null;
                                var playerWechatId = currentAccount
                                    ? currentAccount.wechatId ||
                                      currentAccount.id ||
                                      "player"
                                    : "player";
                                var msgToStr = String(msgObj.to || "").trim();
                                var msgFromStr = String(
                                    msgObj.from || ""
                                ).trim();
                                var playerWechatIdStr = String(
                                    playerWechatId || ""
                                ).trim();

                                // 判断 to 是否是玩家：可能是 "player" 字符串，也可能是实际的玩家ID
                                var isToPlayer =
                                    msgToStr === playerWechatIdStr ||
                                    msgToStr.toLowerCase() === "player";

                                console.info(
                                    "[小馨手机][消息监听] 判断是否是角色响应玩家的通话:",
                                    "msgToStr:",
                                    msgToStr,
                                    "playerWechatIdStr:",
                                    playerWechatIdStr,
                                    "msgFromStr:",
                                    msgFromStr,
                                    "callIdFromMsg:",
                                    callIdFromMsg,
                                    "isToPlayer:",
                                    isToPlayer,
                                    "from 不匹配:",
                                    msgFromStr !== playerWechatIdStr
                                );

                                // 如果 to 是玩家，且 from 不是玩家，说明是角色响应玩家的通话
                                if (
                                    isToPlayer &&
                                    msgFromStr !== playerWechatIdStr &&
                                    callIdFromMsg
                                ) {
                                    isRoleResponseToPlayerCall = true;
                                    console.info(
                                        "[小馨手机][消息监听] ✓ 检测到角色响应玩家的通话:",
                                        "call_id:",
                                        callIdFromMsg,
                                        "state:",
                                        chatMessage.callState,
                                        "from:",
                                        msgObj.from,
                                        "to:",
                                        msgObj.to,
                                        "type:",
                                        chatMessage.type
                                    );
                                } else {
                                    console.info(
                                        "[小馨手机][消息监听] ✗ 不是角色响应玩家的通话:",
                                        "原因:",
                                        !isToPlayer
                                            ? "to 不是玩家"
                                            : msgFromStr === playerWechatIdStr
                                            ? "from 是玩家"
                                            : !callIdFromMsg
                                            ? "缺少 call_id"
                                            : "未知"
                                    );
                                }
                            }

                            if (
                                isRoleResponseToPlayerCall &&
                                chatMessage.callState
                            ) {
                                var callState =
                                    chatMessage.callState.toLowerCase();
                                var callId = callIdFromMsg;

                                // 只处理 accepted/connected/rejected/unanswered/ended 状态
                                if (
                                    callState === "accepted" ||
                                    callState === "connected" ||
                                    callState === "rejected" ||
                                    callState === "unanswered" ||
                                    callState === "ended"
                                ) {
                                    // 触发通话状态变化事件
                                    if (
                                        typeof window.CustomEvent !==
                                        "undefined"
                                    ) {
                                        var statusEvent = new CustomEvent(
                                            "xiaoxin-call-status-changed",
                                            {
                                                detail: {
                                                    state: callState,
                                                    call_id: callId,
                                                    callId: callId,
                                                    messageId: chatMessage.id,
                                                    from: msgObj.from,
                                                    to: msgObj.to,
                                                    // 传递时间信息，便于前端精确计算通话时长
                                                    timestamp:
                                                        chatMessage.timestamp ||
                                                        null,
                                                    rawTime:
                                                        chatMessage.rawTime ||
                                                        null,
                                                },
                                            }
                                        );
                                        window.dispatchEvent(statusEvent);
                                        console.info(
                                            "[小馨手机][消息监听] 触发通话状态变化事件:",
                                            "state:",
                                            callState,
                                            "call_id:",
                                            callId,
                                            "from:",
                                            msgObj.from,
                                            "to:",
                                            msgObj.to,
                                            "messageId:",
                                            chatMessage.id
                                        );
                                    } else {
                                        console.warn(
                                            "[小馨手机][消息监听] CustomEvent 不可用，无法触发通话状态变化事件"
                                        );
                                    }
                                } else {
                                    console.info(
                                        "[小馨手机][消息监听] 通话状态不是 accepted/connected/rejected/unanswered，忽略:",
                                        callState
                                    );
                                }
                            }

                            // 只有在状态为ended/missed/unanswered时，才显示为未接来电消息
                            // 如果是ringing状态且是角色给玩家来电，检查是否是新消息，只有新消息才显示来电弹窗
                            // 注意：即使是历史消息，如果是AI刚刚实时生成的（isAIMessage），ringing状态也应该显示弹窗
                            var isHistoricalCallMessage = false;
                            // 方法1：检查 isHistorical 标记，但如果是AI实时消息，即使标记为历史也允许显示弹窗
                            if (chatMessage.isHistorical === true) {
                                // 如果是AI实时消息（刚刚生成的），即使是历史内容，ringing状态也应该显示弹窗
                                // 只有在消息已经在聊天记录中存在时，才认为是真正的历史消息
                                if (!isAIMessage) {
                                    isHistoricalCallMessage = true;
                                } else {
                                    // AI实时消息：检查消息是否已经在聊天记录中
                                    // 如果不在聊天记录中，说明是新消息，应该显示弹窗
                                    // 这个检查会在后面的 checkCallHistory 函数中进行
                                    console.info(
                                        "[小馨手机][消息监听] AI实时消息，即使标记为历史，ringing状态也允许显示弹窗，消息ID:",
                                        chatMessage.id
                                    );
                                }
                            }
                            // 方法2：检查时间戳（如果消息时间早于当前时间超过2分钟，认为是历史消息，不显示弹窗）
                            // ⚠️ 但对 ringing 来电不适用：世界观时间可能远早于现实时间（如 2018），
                            // 这会导致“新来电”被错误当作历史而不弹窗。
                            // ringing 是否显示弹窗应由“是否刚收到消息/是否已处理过”决定，而不是 timestamp 差值。
                            if (
                                !isHistoricalCallMessage &&
                                chatMessage.callState !== "ringing" &&
                                chatMessage.timestamp &&
                                !isAIMessage
                            ) {
                                var messageTime = chatMessage.timestamp;
                                var currentTime = Date.now();
                                // 如果消息时间早于当前时间超过2分钟（120000毫秒），认为是历史消息，不显示弹窗
                                if (messageTime < currentTime - 120000) {
                                    isHistoricalCallMessage = true;
                                    console.info(
                                        "[小馨手机][消息监听] 消息时间早于当前时间超过2分钟，不显示来电弹窗，消息ID:",
                                        chatMessage.id,
                                        "消息时间:",
                                        new Date(messageTime).toLocaleString(),
                                        "当前时间:",
                                        new Date(currentTime).toLocaleString(),
                                        "时间差:",
                                        (currentTime - messageTime) / 1000,
                                        "秒"
                                    );
                                }
                            }

                            if (
                                chatMessage.callState === "ringing" &&
                                !chatMessage.isOutgoing &&
                                !isHistoricalCallMessage &&
                                window.XiaoxinIncomingCall
                            ) {
                                // 先检查玩家是否在当前角色的聊天页面
                                // 如果在聊天页面，跳过所有历史检查，直接显示全屏页面（因为这是角色主动发起的通话）
                                var isInChatPage = false;
                                if (window.XiaoxinWeChatComponents) {
                                    var activeChatId =
                                        window.XiaoxinWeChatComponents.getActiveChatId();
                                    if (activeChatId === contactId) {
                                        isInChatPage = true;
                                    }
                                }

                                // 如果不在聊天页面，才检查本地标记（避免在聊天页面时被阻止显示）
                                if (!isInChatPage) {
                                    // 优先检查本地标记：是否已接听或已处理为未响应
                                    try {
                                        var handledKeyAccept =
                                            "wx_call_accept_" + chatMessage.id;
                                        var handledKeyTimeout =
                                            "wx_call_timeout_" + chatMessage.id;
                                        // 检查本地标记（只检查localStorage，因为sessionStorage在页面刷新后会清空）
                                        // 如果localStorage中有标记，说明这个来电在之前的会话中已经被处理过
                                        var handledInLocalStorage = false;
                                        if (window.localStorage) {
                                            var acceptMark =
                                                localStorage.getItem(
                                                    handledKeyAccept
                                                );
                                            var timeoutMark =
                                                localStorage.getItem(
                                                    handledKeyTimeout
                                                );
                                            if (acceptMark || timeoutMark) {
                                                handledInLocalStorage = true;
                                            }
                                        }

                                        // 如果localStorage中有标记，说明是历史来电，不显示弹窗
                                        if (handledInLocalStorage) {
                                            console.info(
                                                "[小馨手机][消息监听] localStorage标记该来电已处理，不显示来电弹窗，消息ID:",
                                                chatMessage.id,
                                                "接听标记:",
                                                localStorage.getItem(
                                                    handledKeyAccept
                                                ),
                                                "超时标记:",
                                                localStorage.getItem(
                                                    handledKeyTimeout
                                                )
                                            );
                                            return;
                                        }

                                        // sessionStorage中的标记只用于当前会话，不影响新来电的判断
                                        // 但如果是当前会话中刚处理的，也应该跳过（避免重复处理）
                                        var handledInSession = false;
                                        if (window.sessionStorage) {
                                            var acceptMarkSession =
                                                sessionStorage.getItem(
                                                    handledKeyAccept
                                                );
                                            var timeoutMarkSession =
                                                sessionStorage.getItem(
                                                    handledKeyTimeout
                                                );
                                            if (
                                                acceptMarkSession ||
                                                timeoutMarkSession
                                            ) {
                                                handledInSession = true;
                                            }
                                        }

                                        if (handledInSession) {
                                            console.info(
                                                "[小馨手机][消息监听] sessionStorage标记该来电在当前会话已处理，不显示来电弹窗，消息ID:",
                                                chatMessage.id
                                            );
                                            return;
                                        }
                                    } catch (e) {
                                        console.warn(
                                            "[小馨手机][消息监听] 检查本地来电处理标记出错:",
                                            e
                                        );
                                    }
                                } else {
                                    console.info(
                                        "[小馨手机][消息监听] 玩家在当前角色聊天页面，跳过localStorage/sessionStorage检查，直接显示全屏页面，消息ID:",
                                        chatMessage.id
                                    );
                                }
                                // 检查消息是否是新消息（不是历史消息）
                                // 主要方法：
                                // 1. 检查消息是否已经在聊天记录中
                                // 2. 检查是否有对应的接听/拒接/未接来电响应消息
                                // 如果消息已经在聊天记录中，或者已有响应消息，说明是历史消息，不显示弹窗

                                // 延迟检查，确保聊天记录已完全加载
                                var checkCallHistory = function () {
                                    var isNewMessage = true;
                                    var isProcessed = false;

                                    if (window.XiaoxinWeChatDataHandler) {
                                        try {
                                            var chatHistory =
                                                window.XiaoxinWeChatDataHandler.getChatHistory(
                                                    contactId
                                                ) || [];

                                            console.info(
                                                "[小馨手机][消息监听] 检查来电消息历史，消息ID:",
                                                chatMessage.id,
                                                "聊天记录数量:",
                                                chatHistory.length,
                                                "联系人ID:",
                                                contactId,
                                                "消息时间:",
                                                chatMessage.timestamp ? new Date(chatMessage.timestamp).toLocaleString() : "无时间戳",
                                                "当前时间:",
                                                new Date().toLocaleString()
                                            );

                                            // 检查0: 如果是历史聊天记录中的消息（isHistorical=true），不显示弹窗
                                            if (chatMessage.isHistorical === true && !isAIMessage) {
                                                console.info(
                                                    "[小馨手机][消息监听] 检测到历史聊天记录中的消息，不显示来电弹窗，消息ID:",
                                                    chatMessage.id
                                                );
                                                return false; // 不显示弹窗
                                            }

                                            // 检查0.5: 检查消息时间是否早于当前时间超过2分钟（历史消息不显示弹窗）
                                            // ⚠️ 同上：对 ringing 来电不做这项检查，避免世界观时间导致误判。
                                            if (
                                                chatMessage.callState !==
                                                    "ringing" &&
                                                chatMessage.timestamp &&
                                                !isAIMessage
                                            ) {
                                                var messageTime = chatMessage.timestamp;
                                                var currentTime = Date.now();
                                                var timeDiff = currentTime - messageTime;
                                                // 如果消息时间早于当前时间超过2分钟（120000毫秒），不显示弹窗
                                                if (timeDiff > 120000) {
                                                    console.info(
                                                        "[小馨手机][消息监听] 消息时间早于当前时间超过2分钟，不显示来电弹窗，消息ID:",
                                                        chatMessage.id,
                                                        "消息时间:",
                                                        new Date(messageTime).toLocaleString(),
                                                        "当前时间:",
                                                        new Date(currentTime).toLocaleString(),
                                                        "时间差:",
                                                        timeDiff / 1000,
                                                        "秒"
                                                    );
                                                    return false; // 不显示弹窗
                                                }
                                            }

                                            // 检查1: 是否有相同ID的消息
                                            var existingMessage =
                                                chatHistory.find(function (
                                                    msg
                                                ) {
                                                    return (
                                                        msg.id ===
                                                        chatMessage.id
                                                    );
                                                });
                                            if (existingMessage) {
                                                isNewMessage = false;
                                                console.info(
                                                    "[小馨手机][消息监听] 检测到消息已在聊天记录中，不显示来电弹窗，消息ID:",
                                                    chatMessage.id
                                                );
                                                return false; // 不显示弹窗
                                            }

                                            // 检查2: 是否有对应的接听/拒接/未接来电响应消息
                                            // 检查是否有包含这个消息ID的接听指令（[wx_call_accept]）
                                            // 或未接来电消息（callState为ended/missed/unanswered，且originalCallMessageId匹配）
                                            var callMessageId = chatMessage.id;

                                            // 检查是否有接听指令（玩家发送的消息中包含 [wx_call_accept] 和这个消息ID）
                                            var hasAcceptResponse =
                                                chatHistory.some(function (
                                                    msg
                                                ) {
                                                    // 检查是否是玩家消息（支持多种判断方式）
                                                    var isPlayerMessage =
                                                        msg.isOutgoing ===
                                                            true ||
                                                        msg.sender ===
                                                            "player" ||
                                                        (msg.type === "text" &&
                                                            msg.isOutgoing !==
                                                                false);

                                                    if (
                                                        isPlayerMessage &&
                                                        msg.content
                                                    ) {
                                                        var content = String(
                                                            msg.content
                                                        );
                                                        // 检查是否包含接听指令和消息ID（不区分大小写，处理换行符）
                                                        var hasAcceptTag =
                                                            content.indexOf(
                                                                "[wx_call_accept]"
                                                            ) !== -1 ||
                                                            content
                                                                .toLowerCase()
                                                                .indexOf(
                                                                    "[wx_call_accept]"
                                                                ) !== -1;
                                                        var hasMessageId =
                                                            content.indexOf(
                                                                "消息ID=" +
                                                                    callMessageId
                                                            ) !== -1 ||
                                                            content.indexOf(
                                                                "消息id=" +
                                                                    callMessageId
                                                            ) !== -1 ||
                                                            content.indexOf(
                                                                "消息ID = " +
                                                                    callMessageId
                                                            ) !== -1 ||
                                                            content.indexOf(
                                                                "消息id = " +
                                                                    callMessageId
                                                            ) !== -1;

                                                        if (
                                                            hasAcceptTag &&
                                                            hasMessageId
                                                        ) {
                                                            console.info(
                                                                "[小馨手机][消息监听] 找到接听响应消息，消息ID:",
                                                                msg.id,
                                                                "内容预览:",
                                                                content.substring(
                                                                    0,
                                                                    100
                                                                )
                                                            );
                                                            return true;
                                                        }
                                                    }
                                                    return false;
                                                });

                                            // 检查是否有未接来电消息（状态为ended/missed/unanswered，且originalCallMessageId匹配）
                                            var hasMissedCallResponse =
                                                chatHistory.some(function (
                                                    msg
                                                ) {
                                                    if (
                                                        msg.type ===
                                                            "call_voice" &&
                                                        (msg.callState ===
                                                            "ended" ||
                                                            msg.callState ===
                                                                "missed" ||
                                                            msg.callState ===
                                                                "unanswered") &&
                                                        msg.originalCallMessageId ===
                                                            callMessageId
                                                    ) {
                                                        return true;
                                                    }
                                                    return false;
                                                });

                                            if (
                                                hasAcceptResponse ||
                                                hasMissedCallResponse
                                            ) {
                                                isProcessed = true;
                                                isNewMessage = false;
                                                console.info(
                                                    "[小馨手机][消息监听] 检测到来电消息已有响应（接听/未接），不显示来电弹窗，消息ID:",
                                                    callMessageId,
                                                    "接听响应:",
                                                    hasAcceptResponse,
                                                    "未接响应:",
                                                    hasMissedCallResponse
                                                );
                                                return false; // 不显示弹窗
                                            } else {
                                                console.info(
                                                    "[小馨手机][消息监听] 消息不在聊天记录中，认为是新消息，消息ID:",
                                                    chatMessage.id,
                                                    "聊天记录总数:",
                                                    chatHistory.length,
                                                    "检查的消息ID:",
                                                    callMessageId
                                                );
                                            }

                                            return isNewMessage; // 返回是否应该显示弹窗
                                        } catch (e) {
                                            console.warn(
                                                "[小馨手机][消息监听] 检查聊天记录时出错:",
                                                e
                                            );
                                            // 如果检查出错，默认认为是新消息（安全起见，显示弹窗）
                                            return true;
                                        }
                                    }
                                    // 如果没有数据处理器，默认显示弹窗
                                    return true;
                                };

                                // 延迟检查，确保聊天记录已完全加载（页面刷新后需要时间加载）
                                setTimeout(function () {
                                    // 再次检查玩家是否在当前角色的聊天页面（因为setTimeout中的变量作用域）
                                    // 如果在聊天页面，直接显示全屏页面，跳过历史检查（因为这是角色主动发起的通话）
                                    var isInChatPage = false;
                                    if (window.XiaoxinWeChatComponents) {
                                        var activeChatId =
                                            window.XiaoxinWeChatComponents.getActiveChatId();
                                        if (activeChatId === contactId) {
                                            isInChatPage = true;
                                        }
                                    }

                                    // 获取联系人信息
                                    var contact =
                                        matchedContact ||
                                        findContactByWechatId(contactId) ||
                                        allContacts.find(function (c) {
                                            return c.id === contactId;
                                        });

                                    if (!contact) {
                                        console.warn(
                                            "[小馨手机][消息监听] 未找到联系人信息，无法显示来电，联系人ID:",
                                            contactId
                                        );
                                        return;
                                    }

                                    // 确保联系人有characterId
                                    if (!contact.characterId && msgObj.from) {
                                        contact.characterId = msgObj.from;
                                    }
                                    // 保存消息ID到contact对象，以便在超时处理中使用
                                    contact._incomingCallMessageId =
                                        chatMessage.id;

                                    // 如果玩家在当前角色聊天页面，直接显示全屏通话页面（跳过历史检查）
                                    if (isInChatPage) {
                                        console.info(
                                            "[小馨手机][消息监听] 玩家在当前角色聊天页面，直接显示全屏通话页面（跳过历史检查），联系人ID:",
                                            contactId
                                        );
                                        // 直接显示全屏通话页面（showFullScreenCall 内部会初始化 currentCall）
                                        if (
                                            window.XiaoxinIncomingCall &&
                                            typeof window.XiaoxinIncomingCall
                                                .showFullScreen === "function"
                                        ) {
                                            window.XiaoxinIncomingCall.showFullScreen(
                                                contact
                                            );
                                        } else {
                                            // 如果 showFullScreen 不可用，回退到显示弹窗
                                            console.warn(
                                                "[小馨手机][消息监听] showFullScreen 方法不可用，回退到显示弹窗"
                                            );
                                            window.XiaoxinIncomingCall.show(
                                                contact
                                            );
                                        }
                                        return; // 直接返回，不进行历史检查
                                    }

                                    // 如果不在聊天页面，进行历史检查
                                    var shouldShow = checkCallHistory();

                                    if (!shouldShow) {
                                        console.info(
                                            "[小馨手机][消息监听] 检查后发现来电消息已处理，不显示弹窗，消息ID:",
                                            chatMessage.id
                                        );
                                        return; // 不显示弹窗
                                    }

                                    // 不在聊天页面，显示来电弹窗
                                    console.info(
                                        "[小馨手机][消息监听] 检测到新角色来电，显示来电弹窗，联系人ID:",
                                        contactId
                                    );
                                    window.XiaoxinIncomingCall.show(contact);
                                    // ringing状态的通话消息不显示在聊天记录中，也不添加到消息队列
                                    // 但保持弹窗显示，等待30秒超时或用户操作
                                }, 500); // 延迟500ms，确保聊天记录已加载

                                return;
                            } else if (
                                // 如果是角色响应玩家发起的通话（rejected/unanswered），不显示在角色侧
                                // 因为已经在玩家侧显示了（通过 generateCallRejectedMessage）
                                (chatMessage.callState === "rejected" ||
                                    chatMessage.callState === "unanswered") &&
                                !chatMessage.isOutgoing &&
                                isRoleResponseToPlayerCall
                            ) {
                                console.info(
                                    "[小馨手机][消息监听] 角色响应玩家发起的通话的",
                                    chatMessage.callState,
                                    "状态消息，不显示在角色侧（已在玩家侧显示）",
                                    "from:",
                                    msgObj.from,
                                    "to:",
                                    msgObj.to
                                );
                                return; // 不处理此消息
                            } else if (
                                // 如果是角色挂断玩家发起的通话（ended），需要显示在玩家侧
                                // 因为角色已经在正文中输出了 state=ended 消息，需要将其添加到聊天记录
                                // 但需要调整消息方向，使其显示在玩家侧（因为这是玩家发起的通话的结果）
                                chatMessage.callState === "ended" &&
                                !chatMessage.isOutgoing &&
                                isRoleResponseToPlayerCall
                            ) {
                                // ⚠️ 关键修正：
                                // 这里的 isRoleResponseToPlayerCall 只能代表“to=player 且 from!=player 且有 call_id”，
                                // 它并不能区分“角色主动来电” vs “玩家主动拨号后角色挂断”。
                                // 对于“角色主动来电”的通话，ended 气泡必须显示在角色侧，不能被强制翻到玩家侧。
                                // 我们用 localStorage 记录该 call_id 的 initiator（player/role），只在 initiator=player 时才翻转。
                                var shouldFlipEndedToPlayerSide = true;
                                try {
                                    var _callIdKey =
                                        (chatMessage.call_id ||
                                            chatMessage.callId ||
                                            "") + "";
                                    if (_callIdKey && window.localStorage) {
                                        var initiatorMark = localStorage.getItem(
                                            "wx_call_initiator_" + _callIdKey
                                        );
                                        if (
                                            initiatorMark &&
                                            String(initiatorMark).toLowerCase() ===
                                                "role"
                                        ) {
                                            shouldFlipEndedToPlayerSide = false;
                                        }
                                    }
                                } catch (e) {}

                                if (!shouldFlipEndedToPlayerSide) {
                                    console.info(
                                        "[小馨手机][消息监听] 检测到角色主动来电的 ended 消息，保持显示在角色侧，不翻转",
                                        "call_id:",
                                        chatMessage.call_id || chatMessage.callId,
                                        "from:",
                                        msgObj.from,
                                        "to:",
                                        msgObj.to
                                    );
                                    // 不翻转方向，继续走后续逻辑（不要 return）
                                } else {
                                console.info(
                                    "[小馨手机][消息监听] 角色挂断玩家发起的通话，调整消息方向为玩家侧",
                                    "from:",
                                    msgObj.from,
                                    "to:",
                                    msgObj.to
                                );
                                // 调整消息方向：角色挂断玩家发起的通话，应该显示在玩家侧
                                chatMessage.isOutgoing = true;
                                // 继续处理消息，不要 return
                                }
                            } else if (
                                // 只有在状态为ended/missed/unanswered时，才显示为未接来电消息
                                (chatMessage.callState === "ended" ||
                                    chatMessage.callState === "missed" ||
                                    chatMessage.callState === "unanswered") &&
                                !chatMessage.isOutgoing
                            ) {
                                // 未接来电消息，正常显示
                                console.info(
                                    "[小馨手机][消息监听] 检测到未接来电消息，状态:",
                                    chatMessage.callState
                                );
                            } else if (
                                // 玩家发起的 ringing 状态的通话消息，不应该显示在聊天记录中
                                // 只有通话结束、拒绝或未应答时才显示一条气泡
                                chatMessage.callState === "ringing" &&
                                chatMessage.isOutgoing
                            ) {
                                console.info(
                                    "[小馨手机][消息监听] 玩家发起的 ringing 状态通话消息，不显示在聊天记录中（只有结束/拒绝/未应答时才显示）",
                                    "call_id:",
                                    chatMessage.call_id || chatMessage.callId,
                                    "from:",
                                    msgObj.from,
                                    "to:",
                                    msgObj.to
                                );
                                return; // 不处理此消息，不添加到聊天记录
                            } else {
                                // 其他状态的通话消息（如connected、ringing等中间状态），不显示
                                console.info(
                                    "[小馨手机][消息监听] 通话消息状态为",
                                    chatMessage.callState,
                                    "，不显示消息"
                                );
                                return; // 不处理此消息
                            }
                        }

                        // 添加到对应联系人的聊天记录（统一使用联系人ID）
                        // redpacket_claim 和 redpacket_claim_notification 类型的消息不在这里添加
                        // redpacket_claim 会在延迟处理时创建完整的 redpacket_claim_notification 消息
                        if (
                            chatMessage.type !== "redpacket_claim" &&
                            chatMessage.type !== "redpacket_claim_notification"
                        ) {
                            // 在添加消息之前，先检查消息是否已存在（避免页面刷新后重复添加）
                            if (window.XiaoxinWeChatDataHandler) {
                                var existingChats =
                                    window.XiaoxinWeChatDataHandler.getAllChats() ||
                                    {};
                                var existingMessages =
                                    existingChats[contactId] || [];

                                // 检查方式1：根据消息ID检查
                                var messageExistsById = false;
                                if (chatMessage.id) {
                                    messageExistsById = existingMessages.some(
                                        function (msg) {
                                            return msg.id === chatMessage.id;
                                        }
                                    );
                                }

                                // 检查方式3：对于红包消息（redpacket），按 redpacket_id 去重
                                // 确保红包消息不会重复显示，和文本消息一样持久显示
                                var messageExistsByRedpacketId = false;
                                if (
                                    !messageExistsById &&
                                    chatMessage.type === "redpacket" &&
                                    chatMessage.redpacket_id
                                ) {
                                    var currentRedpacketId = chatMessage.redpacket_id;
                                    var existingRedpacketMessage = existingMessages.find(
                                        function (msg) {
                                            if (msg.type === "redpacket") {
                                                var msgRedpacketId =
                                                    msg.redpacket_id ||
                                                    (msg.payload && msg.payload.redpacket_id) ||
                                                    "";
                                                return msgRedpacketId === currentRedpacketId;
                                            }
                                            return false;
                                        }
                                    );
                                    if (existingRedpacketMessage) {
                                        messageExistsByRedpacketId = true;
                                        console.info(
                                            "[小馨手机][消息监听] 红包消息已存在（根据redpacket_id），跳过重复添加:",
                                            "redpacket_id:",
                                            currentRedpacketId,
                                            "existing_id:",
                                            existingRedpacketMessage.id,
                                            "new_id:",
                                            chatMessage.id
                                        );
                                    }
                                }

                                // 检查方式2：对于通话消息（call_voice/call_video），按 call_id 去重
                                // 特别是对于 ended 状态的消息，应该只显示一条（使用 duration 最大的那条）
                                var messageExistsByCallId = false;
                                if (
                                    !messageExistsById &&
                                    (chatMessage.type === "call_voice" ||
                                        chatMessage.type === "call_video") &&
                                    chatMessage.callState === "ended"
                                ) {
                                    var currentCallId =
                                        chatMessage.call_id ||
                                        chatMessage.callId ||
                                        chatMessage.callWith ||
                                        null;
                                    if (currentCallId) {
                                        // 查找是否有相同 call_id 的 ended 消息
                                        var existingEndedMessage =
                                            existingMessages.find(function (
                                                msg
                                            ) {
                                                if (
                                                    (msg.type === "call_voice" ||
                                                        msg.type ===
                                                            "call_video") &&
                                                    msg.callState === "ended"
                                                ) {
                                                    var msgCallId =
                                                        msg.call_id ||
                                                        msg.callId ||
                                                        msg.callWith ||
                                                        null;
                                                    return (
                                                        msgCallId ===
                                                        currentCallId
                                                    );
                                                }
                                                return false;
                                            });
                                        if (existingEndedMessage) {
                                            messageExistsByCallId = true;
                                            // 如果新消息是历史消息而旧消息不是，优先使用历史消息的时长；
                                            // 否则，在同类型（历史/实时）之间才比较 duration，取更大的那个。
                                            // ⚠️ 需要正确解析 duration（可能是数字或 "MM:SS" 格式的字符串）
                                            var parseDuration = function(dur) {
                                                if (typeof dur === "number") {
                                                    return dur;
                                                } else if (typeof dur === "string") {
                                                    // 检查是否是 "MM:SS" 格式
                                                    var mmssMatch = dur.match(/^(\d{1,2}):(\d{2})$/);
                                                    if (mmssMatch) {
                                                        var minutes = parseInt(mmssMatch[1], 10);
                                                        var seconds = parseInt(mmssMatch[2], 10);
                                                        return minutes * 60 + seconds;
                                                    } else {
                                                        // 不是 "MM:SS" 格式，尝试直接解析为数字
                                                        var parsed = parseInt(dur, 10);
                                                        return isNaN(parsed) ? 0 : parsed;
                                                    }
                                                }
                                                return 0;
                                            };

                                            var newDuration = parseDuration(
                                                chatMessage.duration || chatMessage.duration_sec || 0
                                            );
                                            var existingDuration = parseDuration(
                                                existingEndedMessage.duration ||
                                                existingEndedMessage.duration_sec ||
                                                0
                                            );

                                            var existingIsHistorical =
                                                existingEndedMessage.isHistorical === true;
                                            var newIsHistorical =
                                                chatMessage.isHistorical === true;

                                            var shouldUpdate = false;

                                            // 情况1：新消息是世界书/历史消息，旧消息是实时消息 → 一定用新消息（世界书为准）
                                            if (newIsHistorical && !existingIsHistorical) {
                                                shouldUpdate = true;
                                            }
                                            // 情况2：两条都是历史或都是实时 → 取 duration 较大的那条
                                            else if (
                                                newIsHistorical === existingIsHistorical &&
                                                newDuration > existingDuration
                                            ) {
                                                shouldUpdate = true;
                                            }

                                            if (shouldUpdate) {
                                                existingEndedMessage.duration =
                                                    newDuration;
                                                existingEndedMessage.duration_sec =
                                                    newDuration;
                                                if (
                                                    window.XiaoxinWeChatDataHandler &&
                                                    typeof window
                                                        .XiaoxinWeChatDataHandler
                                                        .updateChatMessage ===
                                                        "function"
                                                ) {
                                                    window.XiaoxinWeChatDataHandler.updateChatMessage(
                                                        contactId,
                                                        existingEndedMessage.id,
                                                        {
                                                            duration: newDuration,
                                                            duration_sec:
                                                                newDuration,
                                                        }
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }

                                // 检查方式3：根据消息内容+时间戳+发送者检查（防止ID不一致导致的重复）
                                var messageExistsByContent = false;
                                if (
                                    !messageExistsById &&
                                    !messageExistsByCallId &&
                                    chatMessage.content &&
                                    chatMessage.timestamp
                                ) {
                                    messageExistsByContent =
                                        existingMessages.some(function (msg) {
                                            // 检查内容、时间戳和发送方向是否一致
                                            var contentMatch =
                                                msg.content ===
                                                chatMessage.content;
                                            var timestampMatch =
                                                Math.abs(
                                                    (msg.timestamp || 0) -
                                                        (chatMessage.timestamp ||
                                                            0)
                                                ) < 60000; // 时间差小于1分钟
                                            var directionMatch =
                                                msg.isOutgoing ===
                                                chatMessage.isOutgoing;

                                            // 如果内容、时间戳和方向都匹配，认为是同一条消息
                                            return (
                                                contentMatch &&
                                                timestampMatch &&
                                                directionMatch
                                            );
                                        });
                                }

                                if (
                                    messageExistsById ||
                                    messageExistsByCallId ||
                                    messageExistsByRedpacketId ||
                                    messageExistsByContent
                                ) {
                                    // 检查已存在的消息是否已处理过（对于历史消息）
                                    var existingMessage = null;
                                    if (messageExistsById && chatMessage.id) {
                                        existingMessage = existingMessages.find(function (msg) {
                                            return msg.id === chatMessage.id;
                                        });
                                    } else if (messageExistsByCallId) {
                                        // 对于通话消息，通过 call_id 查找
                                        var currentCallId =
                                            chatMessage.call_id ||
                                            chatMessage.callId ||
                                            chatMessage.callWith ||
                                            null;
                                        if (currentCallId) {
                                            existingMessage = existingMessages.find(function (msg) {
                                                if (
                                                    (msg.type === "call_voice" ||
                                                        msg.type === "call_video") &&
                                                    msg.callState === "ended"
                                                ) {
                                                    var msgCallId =
                                                        msg.call_id ||
                                                        msg.callId ||
                                                        msg.callWith ||
                                                        null;
                                                    return msgCallId === currentCallId;
                                                }
                                                return false;
                                            });
                                        }
                                    } else if (messageExistsByRedpacketId) {
                                        // 对于红包消息，通过 redpacket_id 查找
                                        var currentRedpacketId = chatMessage.redpacket_id;
                                        if (currentRedpacketId) {
                                            existingMessage = existingMessages.find(function (msg) {
                                                if (msg.type === "redpacket") {
                                                    var msgRedpacketId =
                                                        msg.redpacket_id ||
                                                        (msg.payload && msg.payload.redpacket_id) ||
                                                        "";
                                                    return msgRedpacketId === currentRedpacketId;
                                                }
                                                return false;
                                            });
                                        }
                                    } else if (messageExistsByContent) {
                                        existingMessage = existingMessages.find(function (msg) {
                                            var contentMatch =
                                                msg.content === chatMessage.content;
                                            var timestampMatch =
                                                Math.abs(
                                                    (msg.timestamp || 0) -
                                                        (chatMessage.timestamp || 0)
                                                ) < 60000;
                                            var directionMatch =
                                                msg.isOutgoing === chatMessage.isOutgoing;
                                            return contentMatch && timestampMatch && directionMatch;
                                        });
                                    }

                                    // 如果是历史消息且已处理过，直接跳过
                                    if (existingMessage && existingMessage.isHistorical && existingMessage._processed) {
                                        console.info(
                                            "[小馨手机][消息监听] 历史消息已处理过，跳过重复添加:",
                                            contactId,
                                            "消息ID:",
                                            chatMessage.id
                                        );
                                        return; // 跳过后续处理
                                    }

                                    console.info(
                                        "[小馨手机][消息监听] 消息已存在于聊天记录中，跳过添加:",
                                        contactId,
                                        "消息ID:",
                                        chatMessage.id,
                                        "通过ID匹配:",
                                        messageExistsById,
                                        "通过红包ID匹配:",
                                        messageExistsByRedpacketId,
                                        "通过内容匹配:",
                                        messageExistsByContent
                                    );
                                    // 消息已存在，跳过添加，但继续处理消息队列（如果是角色消息）
                                    // ⚠️ 重要：红包消息应该立即显示，不需要进入队列
                                    if (
                                        chatMessage.type === "redpacket" &&
                                        window.XiaoxinWeChatChatUI &&
                                        typeof window.XiaoxinWeChatChatUI.refreshChatScreen === "function"
                                    ) {
                                        // 红包消息已存在，直接刷新聊天界面确保显示
                                        setTimeout(function() {
                                            window.XiaoxinWeChatChatUI.refreshChatScreen(contactId);
                                        }, 100);
                                        console.info(
                                            "[小馨手机][消息监听] 红包消息已存在，刷新聊天界面确保显示:",
                                            contactId,
                                            "redpacket_id:",
                                            chatMessage.redpacket_id
                                        );
                                        return; // 跳过后续处理
                                    }
                                    // 检查消息是否已在队列中或已显示（仅对非红包消息）
                                    if (
                                        chatMessage.isOutgoing === false &&
                                        chatMessage.type !== "redpacket" &&
                                        window.XiaoxinMessageQueue
                                    ) {
                                        var isDisplayed =
                                            window.XiaoxinMessageQueue.isMessageDisplayed(
                                                contactId,
                                                chatMessage.id
                                            );
                                        var isInQueue =
                                            window.XiaoxinMessageQueue.isMessageInQueue(
                                                contactId,
                                                chatMessage.id
                                            );
                                        if (!isDisplayed && !isInQueue) {
                                            // 消息不在队列中，说明是历史消息，不需要加入队列
                                            console.info(
                                                "[小馨手机][消息监听] 历史消息不在队列中，跳过队列处理:",
                                                contactId,
                                                "消息ID:",
                                                chatMessage.id
                                            );
                                        }
                                    }
                                    return; // 跳过后续处理
                                }
                            }

                            // ⚠️ 重要：对于图片消息，如果找到已存在消息，直接跳过添加，避免重复生成
                            // 无论是否有 _processed 标记，只要消息已存在，就不应该重复添加
                            // ⚠️ 关键修复：如果消息已处理过（_processed = true），无论消息ID是否匹配，都应该跳过添加
                            if (chatMessage.type === "image") {
                                // 首先检查是否有已处理的消息（通过内容、时间戳等匹配）
                                if (!existingMessage) {
                                    // 如果通过ID没找到，尝试通过内容、时间戳等匹配已处理的消息
                                    var processedMessage = existingMessages.find(function (msg) {
                                        if (msg.type === "image" && msg._processed === true) {
                                            // 检查时间戳是否相近（1分钟内）
                                            var timestampMatch =
                                                Math.abs(
                                                    (msg.timestamp || 0) -
                                                        (chatMessage.timestamp || 0)
                                                ) < 60000;
                                            // 检查方向是否相同
                                            var directionMatch =
                                                msg.isOutgoing === chatMessage.isOutgoing;
                                            // 如果时间戳和方向都匹配，认为是同一条消息
                                            return timestampMatch && directionMatch;
                                        }
                                        return false;
                                    });
                                    if (processedMessage) {
                                        existingMessage = processedMessage;
                                        console.info(
                                            "[小馨手机][消息监听] 通过内容、时间戳匹配到已处理的图片消息，跳过添加:",
                                            "contactId:",
                                            contactId,
                                            "消息ID:",
                                            chatMessage.id,
                                            "已存在消息ID:",
                                            existingMessage.id,
                                            "_processed:",
                                            existingMessage._processed
                                        );
                                    }
                                }

                                if (existingMessage) {
                                    var existingImageStr = String(existingMessage.image || existingMessage.content || "").trim();
                                    var isExistingImageUrl =
                                        existingImageStr.startsWith("http://") ||
                                        existingImageStr.startsWith("https://") ||
                                        existingImageStr.startsWith("/") ||
                                        existingImageStr.toLowerCase().startsWith("local:") ||
                                        existingImageStr.startsWith("data:image") ||
                                        /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(existingImageStr);

                                    // 如果已存在消息有有效的图片URL，直接跳过添加
                                    if (isExistingImageUrl) {
                                        console.info(
                                            "[小馨手机][消息监听] 图片消息已存在且有有效图片URL，跳过添加，避免重复生成:",
                                            "contactId:",
                                            contactId,
                                            "消息ID:",
                                            chatMessage.id,
                                            "已存在消息ID:",
                                            existingMessage.id,
                                            "_processed:",
                                            existingMessage._processed,
                                            "图片URL:",
                                            existingImageStr.substring(0, 50) + "..."
                                        );
                                        return; // 跳过添加消息
                                    }

                                    // 即使没有有效的图片URL，如果消息已存在，也应该跳过添加（避免创建重复消息）
                                    // 因为消息已经存在，应该更新现有消息而不是创建新消息
                                    console.info(
                                        "[小馨手机][消息监听] 图片消息已存在（即使没有有效图片URL），跳过添加，避免创建重复消息:",
                                        "contactId:",
                                        contactId,
                                        "消息ID:",
                                        chatMessage.id,
                                        "已存在消息ID:",
                                        existingMessage.id,
                                        "_processed:",
                                        existingMessage._processed
                                    );
                                    return; // 跳过添加消息
                                }
                            }

                            // ⚠️ 重要：在调用 addChatMessage 之前，确保如果找到已存在消息，使用已存在消息的ID
                            // 这样可以避免在 data-handler.js 中生成新的ID
                            if (existingMessage && existingMessage.id) {
                                var oldChatMessageId = chatMessage.id;
                                chatMessage.id = existingMessage.id;
                                if (oldChatMessageId !== existingMessage.id) {
                                    console.info(
                                        "[小馨手机][消息监听] 在调用 addChatMessage 之前，确保使用已存在消息的ID:",
                                        "原消息ID:",
                                        oldChatMessageId || "(空)",
                                        "已存在消息ID:",
                                        existingMessage.id
                                    );
                                }
                            }

                            window.XiaoxinWeChatDataHandler.addChatMessage(
                                contactId,
                                chatMessage
                            );
                        } else {
                            console.info(
                                "[小馨手机][消息监听] redpacket_claim 消息不添加到聊天记录，只更新红包状态:",
                                chatMessage.redpacket_id
                            );
                        }

                        // 如果是角色发送的消息（isOutgoing === false），加入消息显示队列
                        // ⚠️ 重要：红包消息应该立即显示，不需要进入队列，和文本消息一样持久显示
                        if (chatMessage.isOutgoing === false) {
                            // 红包消息应该立即显示，不需要进入队列
                            if (chatMessage.type === "redpacket") {
                                console.info(
                                    "[小馨手机][消息监听] 红包消息立即显示，跳过队列处理:",
                                    contactId,
                                    "消息ID:",
                                    chatMessage.id,
                                    "redpacket_id:",
                                    chatMessage.redpacket_id
                                );
                                // 直接刷新聊天界面，确保红包消息立即显示
                                setTimeout(function() {
                                    if (window.XiaoxinWeChatChatUI &&
                                        typeof window.XiaoxinWeChatChatUI.refreshChatScreen === "function") {
                                        window.XiaoxinWeChatChatUI.refreshChatScreen(contactId);
                                    }
                                }, 100);
                                return; // 跳过队列处理
                            }

                            // 检查是否是历史消息
                            // 1. 优先检查 isHistorical 标记
                            // 2. 如果标记不存在，根据时间戳判断：消息时间早于当前世界观时间10分钟，视为历史消息
                            var isHistoricalMessage = false;

                            // 检查 isHistorical 标记（明确标记为历史消息）
                            if (chatMessage.isHistorical === true ||
                                chatMessage.isHistorical === "true" ||
                                String(chatMessage.isHistorical).toLowerCase() === "true") {
                                isHistoricalMessage = true;
                                console.info(
                                    "[小馨手机][消息监听] 检测到明确标记为历史消息，跳过队列:",
                                    contactId,
                                    "消息ID:",
                                    chatMessage.id,
                                    "isHistorical:",
                                    chatMessage.isHistorical
                                );
                            } else if (chatMessage.timestamp) {
                                // 根据时间戳判断：如果消息时间早于当前世界观时间10分钟，视为历史消息
                                var currentWorldTime = null;
                                if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.currentTimestamp) {
                                    currentWorldTime = window.XiaoxinWorldClock.currentTimestamp;
                                } else {
                                    // 如果没有世界观时间，使用现实时间
                                    currentWorldTime = Date.now();
                                }

                                var messageTime = chatMessage.timestamp;
                                var timeDiff = currentWorldTime - messageTime;
                                var tenMinutes = 10 * 60 * 1000; // 10分钟的毫秒数

                                if (timeDiff > tenMinutes) {
                                    isHistoricalMessage = true;
                                    // 自动标记为历史消息
                                    chatMessage.isHistorical = true;
                                    console.info(
                                        "[小馨手机][消息监听] 根据时间戳判断为历史消息（早于当前时间" + Math.round(timeDiff / 60000) + "分钟），跳过队列:",
                                        contactId,
                                        "消息ID:",
                                        chatMessage.id,
                                        "消息时间:",
                                        new Date(messageTime).toLocaleString("zh-CN"),
                                        "当前世界观时间:",
                                        new Date(currentWorldTime).toLocaleString("zh-CN")
                                    );
                                }
                            }

                            // 如果是历史消息，跳过队列，直接添加到聊天记录并刷新页面
                            if (isHistoricalMessage) {
                                console.info(
                                    "[小馨手机][消息监听] 检测到历史消息，跳过队列，直接显示:",
                                    contactId,
                                    "消息ID:",
                                    chatMessage.id,
                                    "消息时间:",
                                    chatMessage.timestamp ? new Date(chatMessage.timestamp).toLocaleString() : "无时间戳"
                                );

                                // 历史消息不进入队列，直接显示
                                // 不需要延迟刷新，因为历史消息应该一次性全部显示
                                // 但为了确保所有历史消息都已添加，仍然延迟刷新
                                setTimeout(function() {
                                    if (window.XiaoxinWeChatChatUI &&
                                        typeof window.XiaoxinWeChatChatUI.refreshChatScreen === "function") {
                                        window.XiaoxinWeChatChatUI.refreshChatScreen(contactId);
                                    }
                                }, 100); // 缩短延迟时间，历史消息应该快速显示

                                return; // 跳过队列处理
                            }

                            // 再次检查是否是历史消息（防止遗漏）
                            // 如果消息被标记为历史消息，不应该进入队列
                            if (isHistoricalMessage ||
                                chatMessage.isHistorical === true ||
                                chatMessage.isHistorical === "true" ||
                                String(chatMessage.isHistorical).toLowerCase() === "true") {
                                console.warn(
                                    "[小馨手机][消息监听] 历史消息不应该进入队列，但检测到队列处理逻辑，跳过:",
                                    contactId,
                                    "消息ID:",
                                    chatMessage.id
                                );
                                return; // 跳过队列处理
                            }

                            // 检查消息队列管理器是否已加载
                            if (window.XiaoxinMessageQueue) {
                                window.XiaoxinMessageQueue.addMessage(
                                    contactId,
                                    chatMessage
                                );
                                console.info(
                                    "[小馨手机][消息监听] 已将角色消息加入显示队列:",
                                    contactId,
                                    "消息ID:",
                                    chatMessage.id
                                );
                            } else {
                                // 如果队列管理器未加载，延迟重试（最多等待5秒）
                                var retryCount = 0;
                                var maxRetries = 50; // 5秒 = 50 * 100ms
                                var retryInterval = setInterval(function () {
                                    retryCount++;
                                    if (window.XiaoxinMessageQueue) {
                                        clearInterval(retryInterval);
                                        window.XiaoxinMessageQueue.addMessage(
                                            contactId,
                                            chatMessage
                                        );
                                        console.info(
                                            "[小馨手机][消息监听] 延迟加入显示队列成功:",
                                            contactId,
                                            "消息ID:",
                                            chatMessage.id
                                        );
                                    } else if (retryCount >= maxRetries) {
                                        clearInterval(retryInterval);
                                        console.warn(
                                            "[小馨手机][消息监听] 消息队列管理器未在5秒内加载，消息将直接显示:",
                                            contactId,
                                            "消息ID:",
                                            chatMessage.id
                                        );
                                    }
                                }, 100);
                            }
                        }
                    });

                    // 延迟处理所有 redpacket_claim 消息，确保所有消息都已添加到聊天记录
                    if (redpacketClaimMessages.length > 0) {
                        // 使用 setTimeout 确保所有消息都已保存到聊天记录
                        setTimeout(function () {
                            console.info(
                                "[小馨手机][消息监听] 开始延迟处理 redpacket_claim 消息，数量:",
                                redpacketClaimMessages.length
                            );

                            // 在延迟处理时重新获取联系人列表，确保能获取最新的备注和昵称
                            var allContactsForClaim =
                                window.XiaoxinWeChatDataHandler.getContacts() ||
                                [];

                            // 获取当前账号信息（用于判断领取者是否是玩家）
                            var currentAccountForClaim =
                                window.XiaoxinWeChatAccount
                                    ? window.XiaoxinWeChatAccount.getCurrentAccount()
                                    : null;

                            // 定义查找联系人的函数（用于延迟处理）
                            // 注意：cleanId 函数在模块级别定义，应该可以在延迟处理中访问
                            function findContactByWechatIdForClaim(wechatId) {
                                if (!wechatId) return null;
                                var wechatIdStr = String(wechatId).trim();

                                // 定义 cleanId 的本地版本（如果模块级别的不可用）
                                function localCleanId(raw) {
                                    if (typeof cleanId === "function") {
                                        return cleanId(raw);
                                    }
                                    // 如果 cleanId 不可用，使用简单的清理逻辑
                                    if (!raw) return "";
                                    return String(raw)
                                        .trim()
                                        .replace(/<br\s*\/?>/gi, "")
                                        .replace(/\s+/g, " ");
                                }

                                // 尝试多种匹配方式
                                var matchedContact = allContactsForClaim.find(
                                    function (contact) {
                                        var cWechatId = localCleanId(
                                            contact.wechatId
                                        );
                                        var cWechatId2 = localCleanId(
                                            contact.wechat_id
                                        );
                                        var cWechatId3 = localCleanId(
                                            contact.wechatID
                                        );
                                        var cId = localCleanId(contact.id);
                                        var cCharId = String(
                                            contact.characterId || ""
                                        ).trim();
                                        var cIdWithoutPrefix = cId.replace(
                                            /^contact_/,
                                            ""
                                        );
                                        var wechatIdStrWithoutPrefix =
                                            wechatIdStr.replace(
                                                /^contact_/,
                                                ""
                                            );

                                        // 尝试多种匹配方式，确保能匹配到角色ID
                                        return (
                                            cWechatId === wechatIdStr ||
                                            cWechatId2 === wechatIdStr ||
                                            cWechatId3 === wechatIdStr ||
                                            cId === wechatIdStr ||
                                            cId === "contact_" + wechatIdStr ||
                                            wechatIdStr === "contact_" + cId ||
                                            cCharId === wechatIdStr ||
                                            String(cCharId) === String(wechatIdStr) || // 确保类型一致
                                            cIdWithoutPrefix ===
                                                wechatIdStrWithoutPrefix ||
                                            cIdWithoutPrefix === wechatIdStr ||
                                            String(cIdWithoutPrefix) === String(wechatIdStr) || // 确保类型一致
                                            wechatIdStrWithoutPrefix ===
                                                cIdWithoutPrefix ||
                                            String(wechatIdStrWithoutPrefix) === String(cCharId) // 确保类型一致
                                        );
                                    }
                                );

                                if (matchedContact) {
                                    console.info(
                                        "[小馨手机][消息监听] 找到领取者联系人:",
                                        "claimed_by:",
                                        wechatIdStr,
                                        "contact.id:",
                                        matchedContact.id,
                                        "contact.wechatId:",
                                        matchedContact.wechatId,
                                        "contact.characterId:",
                                        matchedContact.characterId,
                                        "contact.remark:",
                                        matchedContact.remark,
                                        "contact.nickname:",
                                        matchedContact.nickname
                                    );
                                } else {
                                    // 如果第一次查找失败，尝试更宽松的匹配（数字ID匹配）
                                    if (/^\d+$/.test(wechatIdStr)) {
                                        matchedContact = allContactsForClaim.find(
                                            function (contact) {
                                                var cCharId = String(
                                                    contact.characterId || ""
                                                ).trim();
                                                var cId = localCleanId(contact.id);
                                                var cIdWithoutPrefix = cId.replace(
                                                    /^contact_/,
                                                    ""
                                                );

                                                // 尝试匹配数字ID
                                                return (
                                                    cCharId === wechatIdStr ||
                                                    String(cCharId) === String(wechatIdStr) ||
                                                    cIdWithoutPrefix === wechatIdStr ||
                                                    String(cIdWithoutPrefix) === String(wechatIdStr)
                                                );
                                            }
                                        );

                                        if (matchedContact) {
                                            console.info(
                                                "[小馨手机][消息监听] 通过数字ID匹配找到领取者联系人:",
                                                "claimed_by:",
                                                wechatIdStr,
                                                "contact.id:",
                                                matchedContact.id,
                                                "contact.characterId:",
                                                matchedContact.characterId,
                                                "contact.remark:",
                                                matchedContact.remark,
                                                "contact.nickname:",
                                                matchedContact.nickname
                                            );
                                        }
                                    }

                                    if (!matchedContact) {
                                        console.warn(
                                            "[小馨手机][消息监听] 未找到领取者联系人:",
                                            "claimed_by:",
                                            wechatIdStr,
                                            "所有联系人ID:",
                                            allContactsForClaim.map(function (c) {
                                                return {
                                                    id: c.id,
                                                    wechatId: c.wechatId,
                                                    characterId: c.characterId,
                                                    remark: c.remark,
                                                    nickname: c.nickname,
                                                };
                                            })
                                        );
                                    }
                                }

                                return matchedContact;
                            }

                            redpacketClaimMessages.forEach(function (
                                claimInfo
                            ) {
                                try {
                                    if (
                                        claimInfo.redpacket_id &&
                                        window.XiaoxinWeChatDataHandler
                                    ) {
                                        var allChats =
                                            window.XiaoxinWeChatDataHandler.getAllChats();
                                        var updated = false;

                                        // 遍历所有聊天记录，查找对应的红包消息
                                        Object.keys(allChats).forEach(function (
                                            userId
                                        ) {
                                            var messages =
                                                allChats[userId] || [];

                                            messages.forEach(function (msg) {
                                                // 尝试多种方式获取红包ID
                                                var msgRedpacketId =
                                                    msg.redpacket_id ||
                                                    (msg.payload &&
                                                        msg.payload
                                                            .redpacket_id) ||
                                                    "";

                                                // 如果redpacket_id匹配，或者消息ID匹配（向后兼容）
                                                var redpacketIdMatch =
                                                    msgRedpacketId &&
                                                    msgRedpacketId ===
                                                        claimInfo.redpacket_id;
                                                var msgIdMatch =
                                                    !msgRedpacketId &&
                                                    msg.id ===
                                                        claimInfo.redpacket_id;

                                                if (
                                                    msg.type === "redpacket" &&
                                                    (redpacketIdMatch ||
                                                        msgIdMatch)
                                                ) {
                                                    // 如果 claimed_by 是 "player" 或 "0"，转换为玩家的实际ID
                                                    // 优先使用账号的 id 字段（微信注册时保存的微信ID）
                                                    // ⚠️ 重要：如果 claimed_by 为空，使用 from 字段（from 就是角色ID）
                                                    var claimedByToUpdate =
                                                        claimInfo.claimed_by || claimInfo.from || "";
                                                    if (
                                                        claimedByToUpdate ===
                                                            "player" ||
                                                        claimedByToUpdate ===
                                                            "0"
                                                    ) {
                                                        if (
                                                            currentAccountForClaim
                                                        ) {
                                                            claimedByToUpdate =
                                                                String(
                                                                    currentAccountForClaim.id ||
                                                                        currentAccountForClaim.wechatId ||
                                                                        "player"
                                                                ).trim();
                                                            console.info(
                                                                "[小馨手机][消息监听] redpacket_claim 延迟处理：将 'player' 转换为实际ID:",
                                                                claimedByToUpdate
                                                            );
                                                        }
                                                    }

                                                    // ⚠️ 确保 claimed_by 总是被设置（优先使用 from 字段）
                                                    if (!claimedByToUpdate && claimInfo.from) {
                                                        claimedByToUpdate = String(claimInfo.from).trim();
                                                        console.info(
                                                            "[小馨手机][消息监听] redpacket_claim 延迟处理：使用 from 字段作为 claimed_by:",
                                                            claimedByToUpdate
                                                        );
                                                    }

                                                    // 使用updateChatMessage方法更新消息
                                                    var updateResult =
                                                        window.XiaoxinWeChatDataHandler.updateChatMessage(
                                                            userId,
                                                            msg.id,
                                                            {
                                                                claimed: true,
                                                                status: "claimed",
                                                                claimed_by:
                                                                    claimedByToUpdate,
                                                                claimed_time:
                                                                    claimInfo.timestamp ||
                                                                    msg.timestamp ||
                                                                    Date.now(),
                                                            }
                                                        );

                                                    if (updateResult) {
                                                        updated = true;

                                                        // 获取红包发送者的昵称
                                                        var senderName = "";

                                                        // 判断红包发送者是玩家还是角色
                                                        // 注意：isOutgoing 可能为 true、false 或 undefined
                                                        // 如果 msg.isOutgoing 未定义，尝试通过其他方式判断
                                                        var isRedpacketFromPlayer = false;
                                                        if (
                                                            msg.isOutgoing ===
                                                            true
                                                        ) {
                                                            isRedpacketFromPlayer = true;
                                                        } else if (
                                                            msg.isOutgoing ===
                                                            false
                                                        ) {
                                                            isRedpacketFromPlayer = false;
                                                        } else {
                                                            // 如果 isOutgoing 未定义，尝试通过其他方式判断
                                                            // 检查消息的 payload 中的 from 和 to 字段
                                                            var msgFrom =
                                                                (msg.payload &&
                                                                    msg.payload
                                                                        .from) ||
                                                                msg.from ||
                                                                "";
                                                            var msgTo =
                                                                (msg.payload &&
                                                                    msg.payload
                                                                        .to) ||
                                                                msg.to ||
                                                                "";
                                                            var msgFromStr =
                                                                String(msgFrom)
                                                                    .trim()
                                                                    .toLowerCase();
                                                            var msgToStr =
                                                                String(msgTo)
                                                                    .trim()
                                                                    .toLowerCase();

                                                            // 如果 from 是 "player" 或 to 不是 "player" 且 from 不是角色ID，可能是玩家发送的
                                                            // 但更可靠的方式是：如果 to 字段是角色ID（userId），且 from 是 "player"，则是玩家发送的
                                                            if (
                                                                msgFromStr ===
                                                                    "player" ||
                                                                msgFromStr ===
                                                                    "玩家"
                                                            ) {
                                                                isRedpacketFromPlayer = true;
                                                            } else if (
                                                                msgToStr ===
                                                                    "player" ||
                                                                msgToStr ===
                                                                    "玩家"
                                                            ) {
                                                                // 如果 to 是 player，说明是角色发送给玩家的，所以发送者是角色
                                                                isRedpacketFromPlayer = false;
                                                            } else {
                                                                // 如果都不匹配，尝试通过 currentAccountForClaim 判断
                                                                if (
                                                                    currentAccountForClaim
                                                                ) {
                                                                    var playerWechatId =
                                                                        currentAccountForClaim.wechatId ||
                                                                        currentAccountForClaim.id ||
                                                                        null;
                                                                    if (
                                                                        playerWechatId
                                                                    ) {
                                                                        var playerWechatIdStr =
                                                                            String(
                                                                                playerWechatId
                                                                            ).trim();
                                                                        if (
                                                                            msgFromStr ===
                                                                            playerWechatIdStr.toLowerCase()
                                                                        ) {
                                                                            isRedpacketFromPlayer = true;
                                                                        }
                                                                    }
                                                                }
                                                            }

                                                            console.warn(
                                                                "[小馨手机][消息监听] 红包消息的 isOutgoing 未定义，通过其他方式判断:",
                                                                "msg.id:",
                                                                msg.id,
                                                                "msg.isOutgoing:",
                                                                msg.isOutgoing,
                                                                "msgFrom:",
                                                                msgFrom,
                                                                "msgTo:",
                                                                msgTo,
                                                                "isRedpacketFromPlayer:",
                                                                isRedpacketFromPlayer
                                                            );
                                                        }

                                                        console.info(
                                                            "[小馨手机][消息监听] 判断红包发送者:",
                                                            "msg.id:",
                                                            msg.id,
                                                            "msg.isOutgoing:",
                                                            msg.isOutgoing,
                                                            "isRedpacketFromPlayer:",
                                                            isRedpacketFromPlayer,
                                                            "msg.sender:",
                                                            msg.sender,
                                                            "userId:",
                                                            userId,
                                                            "msg.payload:",
                                                            msg.payload
                                                                ? {
                                                                      from: msg
                                                                          .payload
                                                                          .from,
                                                                      to: msg
                                                                          .payload
                                                                          .to,
                                                                  }
                                                                : null
                                                        );

                                                        if (
                                                            isRedpacketFromPlayer
                                                        ) {
                                                            // 红包是玩家发送的，获取玩家昵称
                                                            // 使用延迟处理时获取的 currentAccountForClaim
                                                            if (
                                                                currentAccountForClaim &&
                                                                currentAccountForClaim.nickname
                                                            ) {
                                                                senderName =
                                                                    currentAccountForClaim.nickname;
                                                            } else {
                                                                senderName =
                                                                    "你";
                                                            }
                                                            console.info(
                                                                "[小馨手机][消息监听] 红包是玩家发送的:",
                                                                "senderName:",
                                                                senderName
                                                            );
                                                        } else {
                                                            // 红包是角色发送的，获取角色昵称（优先使用备注，无备注则使用微信昵称）
                                                            if (msg.sender) {
                                                                var senderContact =
                                                                    findContactByWechatIdForClaim(
                                                                        msg.sender
                                                                    );
                                                                if (
                                                                    senderContact
                                                                ) {
                                                                    senderName =
                                                                        senderContact.remark ||
                                                                        senderContact.note ||
                                                                        senderContact.nickname ||
                                                                        msg.sender;
                                                                } else {
                                                                    senderContact =
                                                                        findContactByWechatIdForClaim(
                                                                            userId
                                                                        );
                                                                    if (
                                                                        senderContact
                                                                    ) {
                                                                        senderName =
                                                                            senderContact.remark ||
                                                                            senderContact.note ||
                                                                            senderContact.nickname ||
                                                                            userId;
                                                                    } else {
                                                                        senderName =
                                                                            msg.sender ||
                                                                            "未知";
                                                                    }
                                                                }
                                                            } else {
                                                                var senderContact =
                                                                    findContactByWechatIdForClaim(
                                                                        userId
                                                                    );
                                                                if (
                                                                    senderContact
                                                                ) {
                                                                    senderName =
                                                                        senderContact.remark ||
                                                                        senderContact.note ||
                                                                        senderContact.nickname ||
                                                                        userId;
                                                                } else {
                                                                    senderName =
                                                                        "未知";
                                                                    console.warn(
                                                                        "[小馨手机][消息监听] 未找到红包发送者联系人:",
                                                                        "userId:",
                                                                        userId,
                                                                        "msg.sender:",
                                                                        msg.sender,
                                                                        "msg.isOutgoing:",
                                                                        msg.isOutgoing
                                                                    );
                                                                }
                                                            }
                                                            console.info(
                                                                "[小馨手机][消息监听] 红包是角色发送的:",
                                                                "senderName:",
                                                                senderName,
                                                                "userId:",
                                                                userId,
                                                                "msg.sender:",
                                                                msg.sender
                                                            );
                                                        }

                                                        // 检查是否已经存在该红包的领取通知（避免重复）
                                                        var existingNotification =
                                                            messages.find(
                                                                function (m) {
                                                                    return (
                                                                        m.type ===
                                                                            "redpacket_claim_notification" &&
                                                                        m.redpacket_id ===
                                                                            claimInfo.redpacket_id
                                                                    );
                                                                }
                                                            );

                                                        if (
                                                            !existingNotification
                                                        ) {
                                                            // 重新获取领取者的显示名称（优先使用备注，无备注则使用微信昵称）
                                                            // 使用转换后的 claimed_by 值
                                                            // 注意：初始值使用角色ID而不是"未知"，如果找不到联系人至少显示角色ID
                                                            var claimedByIdForName =
                                                                claimedByToUpdate ||
                                                                claimInfo.claimed_by;
                                                            var finalClaimerName =
                                                                claimedByIdForName || "未知";

                                                            if (
                                                                claimedByIdForName
                                                            ) {
                                                                // 如果 claimed_by 是玩家，直接使用玩家账号信息
                                                                if (
                                                                    claimedByIdForName ===
                                                                        "player" ||
                                                                    claimedByIdForName ===
                                                                        "0"
                                                                ) {
                                                                    if (
                                                                        currentAccountForClaim
                                                                    ) {
                                                                        finalClaimerName =
                                                                            currentAccountForClaim.nickname ||
                                                                            currentAccountForClaim.name ||
                                                                            "我";
                                                                        console.info(
                                                                            "[小馨手机][消息监听] 领取者是玩家，使用账号名称:",
                                                                            finalClaimerName
                                                                        );
                                                                    } else {
                                                                        finalClaimerName =
                                                                            "我";
                                                                    }
                                                                } else {
                                                                    // 在延迟处理时重新查找联系人，确保获取最新的备注和昵称
                                                                    var claimerContact =
                                                                        findContactByWechatIdForClaim(
                                                                            claimedByIdForName
                                                                        );
                                                                    if (
                                                                        claimerContact
                                                                    ) {
                                                                        // 优先使用备注，无备注则使用微信昵称
                                                                        finalClaimerName =
                                                                            claimerContact.remark ||
                                                                            claimerContact.note ||
                                                                            claimerContact.nickname ||
                                                                            claimedByIdForName;
                                                                        console.info(
                                                                            "[小馨手机][消息监听] 获取领取者名称:",
                                                                            "claimed_by:",
                                                                            claimedByIdForName,
                                                                            "remark:",
                                                                            claimerContact.remark,
                                                                            "nickname:",
                                                                            claimerContact.nickname,
                                                                            "finalClaimerName:",
                                                                            finalClaimerName
                                                                        );
                                                                    } else {
                                                                        // 如果找不到联系人，优先使用之前收集的名称，但如果之前收集的名称是"未知"或空，则使用角色ID
                                                                        if (
                                                                            claimInfo.claimerName &&
                                                                            claimInfo.claimerName !== "未知" &&
                                                                            claimInfo.claimerName !== claimedByIdForName
                                                                        ) {
                                                                            finalClaimerName = claimInfo.claimerName;
                                                                        } else {
                                                                            // 如果之前收集的名称是"未知"、空或角色ID，至少使用角色ID而不是"未知"
                                                                            finalClaimerName = claimedByIdForName || "未知";
                                                                        }
                                                                        console.warn(
                                                                            "[小馨手机][消息监听] 未找到领取者联系人:",
                                                                            claimedByIdForName,
                                                                            "使用名称:",
                                                                            finalClaimerName
                                                                        );
                                                                    }
                                                                }
                                                            }

                                                            // 判断领取者是否是玩家
                                                            // 使用更新后的 claimed_by 值（已经转换为实际ID）
                                                            var isClaimerPlayer = false;
                                                            var claimedByIdForCheck =
                                                                claimedByToUpdate ||
                                                                claimInfo.claimed_by;
                                                            if (
                                                                claimedByIdForCheck
                                                            ) {
                                                                var claimedByIdStr =
                                                                    String(
                                                                        claimedByIdForCheck
                                                                    )
                                                                        .trim()
                                                                        .toLowerCase();
                                                                // 检查是否是明确的玩家标识
                                                                isClaimerPlayer =
                                                                    claimedByIdStr ===
                                                                        "player" ||
                                                                    claimedByIdStr ===
                                                                        "0" ||
                                                                    claimedByIdStr ===
                                                                        "玩家" ||
                                                                    claimedByIdStr ===
                                                                        "你";
                                                                // 通过当前账号信息判断（优先使用账号的 id 字段）
                                                                if (
                                                                    !isClaimerPlayer &&
                                                                    currentAccountForClaim
                                                                ) {
                                                                    // 优先使用账号的 id 字段（微信注册时保存的微信ID）
                                                                    var playerId =
                                                                        String(
                                                                            currentAccountForClaim.id ||
                                                                                ""
                                                                        )
                                                                            .trim()
                                                                            .toLowerCase();
                                                                    var playerWechatId =
                                                                        String(
                                                                            currentAccountForClaim.wechatId ||
                                                                                ""
                                                                        )
                                                                            .trim()
                                                                            .toLowerCase();
                                                                    var claimedByIdStr2 =
                                                                        String(
                                                                            claimedByIdForCheck
                                                                        )
                                                                            .trim()
                                                                            .toLowerCase();

                                                                    // 优先匹配 id 字段
                                                                    if (
                                                                        playerId &&
                                                                        playerId ===
                                                                            claimedByIdStr2
                                                                    ) {
                                                                        isClaimerPlayer = true;
                                                                    }
                                                                    // 其次匹配 wechatId 字段
                                                                    else if (
                                                                        playerWechatId &&
                                                                        playerWechatId ===
                                                                            claimedByIdStr2
                                                                    ) {
                                                                        isClaimerPlayer = true;
                                                                    }
                                                                }
                                                            } else {
                                                                // 如果没有 claimed_by，可能是玩家领取（需要根据消息来源判断）
                                                                // 这里暂时不处理，因为通常会有 claimed_by
                                                            }

                                                            console.info(
                                                                "[小馨手机][消息监听] 判断领取者身份:",
                                                                "claimed_by:",
                                                                claimInfo.claimed_by,
                                                                "isClaimerPlayer:",
                                                                isClaimerPlayer,
                                                                "isSenderPlayer:",
                                                                isRedpacketFromPlayer,
                                                                "senderName:",
                                                                senderName
                                                            );

                                                            // 创建红包领取系统消息
                                                            // ⚠️ 确保 claimed_by 字段总是被设置（优先使用转换后的ID，否则使用原始ID或from字段）
                                                            var finalClaimedBy = claimedByToUpdate || claimInfo.claimed_by || claimInfo.from || "";

                                                            // ⚠️ 重要：确保 claimed_by 和 from 字段都被设置
                                                            // 如果 finalClaimedBy 为空，使用 claimInfo.from（from 就是角色ID）
                                                            var finalClaimedByValue = finalClaimedBy || claimInfo.from || "";
                                                            var finalFromValue = claimInfo.from || finalClaimedByValue || "";

                                                            var notificationMessage =
                                                                {
                                                                    id:
                                                                        "redpacket_claim_notification_" +
                                                                        claimInfo.redpacket_id,
                                                                    type: "redpacket_claim_notification",
                                                                    content: "", // 内容在UI中渲染
                                                                    timestamp:
                                                                        claimInfo.timestamp ||
                                                                        msg.timestamp,
                                                                    rawTime:
                                                                        claimInfo.rawTime ||
                                                                        msg.rawTime,
                                                                    redpacket_id:
                                                                        claimInfo.redpacket_id,
                                                                    claimed_by:
                                                                        finalClaimedByValue, // 使用转换后的ID或原始ID或from字段
                                                                    from:
                                                                        finalFromValue, // ⚠️ 重要：设置 from 字段（角色ID）
                                                                    claimerName:
                                                                        finalClaimerName, // 使用重新获取的名称
                                                                    senderName:
                                                                        senderName ||
                                                                        "你",
                                                                    isClaimerPlayer:
                                                                        isClaimerPlayer, // 标记领取者是否是玩家
                                                                    isSenderPlayer:
                                                                        isRedpacketFromPlayer, // 标记发送者是否是玩家
                                                                    isOutgoing: false, // 系统消息
                                                                };

                                                            // 添加到聊天记录
                                                            window.XiaoxinWeChatDataHandler.addChatMessage(
                                                                userId,
                                                                notificationMessage
                                                            );

                                                            console.info(
                                                                "[小馨手机][消息监听] 添加红包领取系统消息:",
                                                                "claimerName:",
                                                                finalClaimerName,
                                                                "claimed_by:",
                                                                claimedByToUpdate ||
                                                                    claimInfo.claimed_by, // 使用转换后的ID
                                                                "redpacket_id:",
                                                                claimInfo.redpacket_id
                                                            );
                                                        } else {
                                                            console.info(
                                                                "[小馨手机][消息监听] 红包领取系统消息已存在，跳过:",
                                                                "redpacket_id:",
                                                                claimInfo.redpacket_id
                                                            );
                                                        }

                                                        console.info(
                                                            "[小馨手机][消息监听] redpacket_claim 更新红包状态为已领取并添加系统消息:",
                                                            "userId:",
                                                            userId,
                                                            "msgId:",
                                                            msg.id,
                                                            "redpacket_id:",
                                                            claimInfo.redpacket_id,
                                                            "claimed_by:",
                                                            claimedByToUpdate ||
                                                                claimInfo.claimed_by, // 使用转换后的ID
                                                            "claimerName:",
                                                            finalClaimerName ||
                                                                claimInfo.claimerName, // 使用重新获取的名称
                                                            "senderName:",
                                                            senderName
                                                        );
                                                    } else {
                                                        console.warn(
                                                            "[小馨手机][消息监听] redpacket_claim 更新红包状态失败（updateChatMessage返回false）:",
                                                            "userId:",
                                                            userId,
                                                            "msgId:",
                                                            msg.id
                                                        );
                                                    }
                                                }
                                            });
                                        });

                                        if (updated) {
                                            // 触发聊天更新事件，刷新UI
                                            try {
                                                if (
                                                    typeof window.CustomEvent !==
                                                    "undefined"
                                                ) {
                                                    var event = new CustomEvent(
                                                        "xiaoxin-chat-updated",
                                                        {
                                                            detail: {
                                                                redpacket_claimed: true,
                                                                redpacket_id:
                                                                    claimInfo.redpacket_id,
                                                            },
                                                        }
                                                    );
                                                    window.dispatchEvent(event);
                                                }
                                            } catch (e) {
                                                console.warn(
                                                    "[小馨手机][消息监听] 触发聊天更新事件失败:",
                                                    e
                                                );
                                            }
                                        } else {
                                            console.warn(
                                                "[小馨手机][消息监听] redpacket_claim 未找到匹配的红包消息:",
                                                "redpacket_id:",
                                                claimInfo.redpacket_id,
                                                "所有聊天记录:",
                                                Object.keys(allChats)
                                            );
                                        }
                                    }
                                } catch (e) {
                                    console.warn(
                                        "[小馨手机][消息监听] redpacket_claim 更新红包状态失败:",
                                        e
                                    );
                                }
                            });
                        }, 100); // 延迟100ms，确保所有消息都已保存
                    }

                    // 触发聊天更新事件，通知UI刷新（按联系人分组）
                    // 注意：需要复用上面的 contactId 匹配逻辑，确保使用相同的 contactId
                    var contactMessagesMap = {};
                    parsedMessages.forEach(function (msgObj) {
                        // 确定聊天对象（联系人）的ID（使用相同的匹配逻辑）
                        var messageContactWechatId = null;
                        var msgFromStr = String(msgObj.from || "").trim();
                        var msgToStr = String(msgObj.to || "").trim();
                        var playerWechatIdStr = String(
                            playerWechatId || ""
                        ).trim();

                        if (msgFromStr === playerWechatIdStr) {
                            messageContactWechatId = msgToStr;
                        } else {
                            messageContactWechatId = msgFromStr;
                        }

                        var matchedContact = findContactByWechatId(
                            messageContactWechatId
                        );
                        var contactId = null;

                        if (matchedContact) {
                            contactId = matchedContact.id;
                        } else {
                            // 使用备用匹配逻辑（与上面相同）
                            var fallbackContact = allContacts.find(function (
                                contact
                            ) {
                                var cId = String(contact.id || "").trim();
                                var cCharId = String(
                                    contact.characterId || ""
                                ).trim();
                                var cWechatId = String(
                                    contact.wechatId || ""
                                ).trim();

                                return (
                                    cId === messageContactWechatId ||
                                    cCharId === messageContactWechatId ||
                                    cWechatId === messageContactWechatId ||
                                    cId ===
                                        "contact_" + messageContactWechatId ||
                                    messageContactWechatId ===
                                        "contact_" + cId ||
                                    cId.replace(/^contact_/, "") ===
                                        messageContactWechatId ||
                                    messageContactWechatId.replace(
                                        /^contact_/,
                                        ""
                                    ) === cId.replace(/^contact_/, "")
                                );
                            });

                            if (fallbackContact) {
                                contactId = fallbackContact.id;
                            } else {
                                contactId = messageContactWechatId;
                            }
                        }

                        if (!contactMessagesMap[contactId]) {
                            contactMessagesMap[contactId] = [];
                        }
                        // ⚠️ 重要：构建消息对象时，需要包含所有字段，特别是红包消息的特殊字段
                        var messageObj = {
                            id: msgObj.id,
                            type: msgObj.type,
                            content:
                                msgObj.payload && msgObj.payload.content
                                    ? msgObj.payload.content
                                    : "",
                            sender: msgObj.from,
                            timestamp: (function () {
                                // 解析时间戳（支持中文格式）
                                if (msgObj.time) {
                                    var timeStr = String(msgObj.time).trim();
                                    var normalizedTimeStr = timeStr
                                        .replace(/-/g, "/")
                                        .replace(
                                            /年|月|日|星期[一二三四五六日]/g,
                                            " "
                                        );
                                    var parsed = Date.parse(normalizedTimeStr);
                                    if (!isNaN(parsed)) {
                                        return parsed;
                                    }
                                }
                                // 如果无法解析，使用世界观时间
                                if (
                                    window.XiaoxinWorldClock &&
                                    window.XiaoxinWorldClock.currentTimestamp
                                ) {
                                    return window.XiaoxinWorldClock
                                        .currentTimestamp;
                                }
                                // 最后才使用现实时间
                                return Date.now();
                            })(),
                        };

                        // ⚠️ 重要：如果是红包消息，需要包含所有红包相关字段
                        if (msgObj.type === "redpacket") {
                            messageObj.redpacket_id = msgObj.payload && msgObj.payload.redpacket_id
                                ? msgObj.payload.redpacket_id
                                : msgObj.redpacket_id || "";
                            messageObj.amount = msgObj.payload && msgObj.payload.amount
                                ? parseFloat(msgObj.payload.amount)
                                : msgObj.amount ? parseFloat(msgObj.amount) : 0;
                            messageObj.note = msgObj.payload && msgObj.payload.note
                                ? msgObj.payload.note
                                : msgObj.note || msgObj.payload && msgObj.payload.greeting
                                    ? msgObj.payload.greeting
                                    : msgObj.greeting || "";
                            console.info(
                                "[小馨手机][消息监听] 构建红包消息对象用于事件:",
                                "消息ID:",
                                messageObj.id,
                                "redpacket_id:",
                                messageObj.redpacket_id,
                                "amount:",
                                messageObj.amount,
                                "note:",
                                messageObj.note
                            );
                        }

                        contactMessagesMap[contactId].push(messageObj);
                    });

                    // 为每个联系人触发一次更新事件
                    Object.keys(contactMessagesMap).forEach(function (
                        contactId
                    ) {
                        var event = new CustomEvent("xiaoxin-chat-updated", {
                            detail: {
                                userId: contactId,
                                messages: contactMessagesMap[contactId],
                            },
                        });
                        window.dispatchEvent(event);
                    });

                    console.info(
                        "[小馨手机][消息监听] 成功处理",
                        parsedMessages.length,
                        "条微信私聊消息"
                    );
                } else if (parsedMessages.length > 0) {
                    console.warn(
                        "[小馨手机][消息监听] addChatMessage 方法不存在，无法添加消息"
                    );
                }
            } catch (e) {
                console.error("[小馨手机][消息监听] 解析微信私聊消息失败:", e);
            }
        }

        // 标记为已处理
        processedMessages.add(messageId);

        // 满 10 轮后自动生成玩家历史朋友圈（仅一次）
        setTimeout(function () {
            _tryAutoGeneratePlayerHistoryMoments();
        }, 0);
    }

    // 扫描当前聊天中已保留的消息
    function scanRetainedMessages() {
        console.info("[小馨手机][消息监听] 开始扫描已保留的消息...");

        var chatSelectors = [
            "#chat",
            ".chat",
            "#chatContainer",
            ".chat-container",
            "[id*='chat']",
            "[class*='chat']",
        ];

        var chatContainer = null;
        for (var i = 0; i < chatSelectors.length; i++) {
            chatContainer = document.querySelector(chatSelectors[i]);
            if (chatContainer) {
                console.info(
                    "[小馨手机][消息监听] 找到聊天容器:",
                    chatSelectors[i],
                    chatContainer
                );
                break;
            }
        }

        if (!chatContainer) {
            console.warn(
                "[小馨手机][消息监听] scanRetainedMessages: 未找到聊天容器"
            );
            return;
        }

        // 尝试多种消息选择器
        var messageSelectors = [
            ".mes",
            "[class*='mes']",
            ".message",
            "[class*='message']",
        ];

        var $allMessages = $();
        for (var j = 0; j < messageSelectors.length; j++) {
            var $found = $(chatContainer).find(messageSelectors[j]);
            if ($found.length > 0) {
                console.info(
                    "[小馨手机][消息监听] 使用选择器",
                    messageSelectors[j],
                    "找到",
                    $found.length,
                    "个消息元素"
                );
                $allMessages = $found;
                break;
            }
        }

        if ($allMessages.length === 0) {
            // 如果找不到，尝试直接查找所有可能的消息元素
            $allMessages = $(chatContainer)
                .find("div")
                .filter(function () {
                    var $el = $(this);
                    var text = $el.text() || "";
                    var html = $el.html() || "";
                    var content = text + html;
                    // 如果包含联系方式标签/朋友圈标签/朋友圈互动标签，认为是消息
                    return (
                        content.indexOf("[wx_contact]") !== -1 ||
                        content.indexOf("[moments]") !== -1 ||
                        content.indexOf("[moments-interactions]") !== -1
                    );
                });
            console.info(
                "[小馨手机][消息监听] 通过内容搜索找到",
                $allMessages.length,
                "个可能的消息元素"
            );
        }

        console.info(
            "[小馨手机][消息监听] scanRetainedMessages: 总共找到消息数量:",
            $allMessages.length
        );

        var processedCount = 0;
        var skippedCount = 0;

        $allMessages.each(function () {
            var $mes = $(this);

            // 跳过候选消息
            var $swipeCheck = $mes.closest(
                "[class*='swipe'], [class*='draft'], [class*='temp'], [class*='candidate'], [class*='alternative']"
            );
            if ($swipeCheck.length > 0) {
                skippedCount++;
                console.info(
                    "[小馨手机][消息监听] 跳过候选消息（在swipe容器中）"
                );
                return;
            }

            // 检查消息是否已保留
            var isRetained = isMessageInChatHistory($mes[0]);
            if (!isRetained) {
                skippedCount++;
                console.info("[小馨手机][消息监听] 消息未保留，跳过");
                return;
            }

            // 先确保原始内容被保存到data属性（如果还没有保存的话）
            // 这会检查DOM中是否有朋友圈标签，如果有则保存到data属性
            hideMomentsTagsInDom($mes[0]);
            hideMsgTagsInDom($mes[0]);

            // 优先从data属性中获取原始内容（包含隐藏的标签）
            var $messageText = $mes.find(
                ".mes_text, .mesText, .message-text, [class*='mes_text']"
            );
            if ($messageText.length === 0) {
                $messageText = $mes;
            }

            // 方法1: 优先从data属性中获取原始内容（包括朋友圈标签的原始内容）
            var dataContent =
                $mes.attr("data-original-moments-content") ||
                $mes.attr("data-original-msg-content") ||
                $mes.attr("data-original-content") ||
                $mes.attr("data-original") ||
                $mes.attr("data-raw") ||
                $mes.attr("data-content") ||
                $messageText.attr("data-original-moments-content") ||
                $messageText.attr("data-original-msg-content") ||
                $messageText.attr("data-original-content") ||
                $messageText.attr("data-original") ||
                $messageText.attr("data-raw") ||
                $messageText.attr("data-content");

            var content = null;

            // 检查data属性中是否包含相关标签
            if (
                dataContent &&
                (dataContent.indexOf("[moments]") !== -1 ||
                    dataContent.indexOf("[moments-interactions]") !== -1 ||
                    dataContent.indexOf("[wx_contact]") !== -1 ||
                    dataContent.indexOf("[MSG]") !== -1)
            ) {
                content = dataContent;
                console.info(
                    "[小馨手机][消息监听] scanRetainedMessages: 从data属性获取原始内容",
                    "包含朋友圈标签:",
                    dataContent.indexOf("[moments]") !== -1
                );
            }

            // 方法2: 如果data属性中没有，尝试从DOM的HTML中读取（即使标签被隐藏，HTML中可能还有）
            if (!content) {
                // 尝试从HTML中读取（包括被CSS隐藏的内容）
                var html = $messageText.html() || "";
                var text = $messageText.text() || "";
                // 也尝试从整个消息元素的HTML中读取
                var mesHtml = $mes.html() || "";

                // 检查HTML中是否包含标签（即使被隐藏了）
                if (
                    html.indexOf("[moments]") !== -1 ||
                    html.indexOf("[moments-interactions]") !== -1 ||
                    html.indexOf("[wx_contact]") !== -1 ||
                    html.indexOf("[MSG]") !== -1 ||
                    mesHtml.indexOf("[moments]") !== -1 ||
                    mesHtml.indexOf("[moments-interactions]") !== -1 ||
                    mesHtml.indexOf("[wx_contact]") !== -1 ||
                    mesHtml.indexOf("[MSG]") !== -1
                ) {
                    content = mesHtml || html || text;
                    console.info(
                        "[小馨手机][消息监听] scanRetainedMessages: 从DOM HTML中获取到包含标签的内容"
                    );
                } else {
                    // 如果HTML中也没有，尝试从文本节点中读取（包括被CSS隐藏的文本）
                    var allText = "";
                    try {
                        var walker = document.createTreeWalker(
                            $mes[0],
                            NodeFilter.SHOW_TEXT,
                            null,
                            false
                        );
                        var textNode;
                        while ((textNode = walker.nextNode())) {
                            var nodeText =
                                textNode.textContent || textNode.nodeValue;
                            if (nodeText && nodeText.trim()) {
                                allText += nodeText + " ";
                            }
                        }
                        if (
                            allText.indexOf("[moments]") !== -1 ||
                            allText.indexOf("[moments-interactions]") !== -1 ||
                            allText.indexOf("[wx_contact]") !== -1 ||
                            allText.indexOf("[MSG]") !== -1
                        ) {
                            content = allText;
                            console.info(
                                "[小馨手机][消息监听] scanRetainedMessages: 从文本节点中获取到包含标签的内容"
                            );
                        }
                    } catch (e) {
                        console.warn(
                            "[小馨手机][消息监听] scanRetainedMessages: 遍历文本节点失败:",
                            e
                        );
                    }
                }

                // 如果还是没有，使用普通DOM内容（可能已经被处理过）
                if (!content) {
                    content = text + " " + html;
                    console.info(
                        "[小馨手机][消息监听] scanRetainedMessages: 使用普通DOM内容（可能已被处理）"
                    );
                }
            }

            console.info(
                "[小馨手机][消息监听] 检查消息内容，长度:",
                content.length,
                "是否包含标签:",
                content.indexOf("[wx_contact]") !== -1
            );

            // 如果内容很长，只显示前500个字符
            if (content.length > 500) {
                console.info(
                    "[小馨手机][消息监听] 消息内容预览:",
                    content.substring(0, 500) + "..."
                );
            } else {
                console.info("[小馨手机][消息监听] 消息完整内容:", content);
            }

            // 处理包含联系方式标签或朋友圈标签的消息
            var hasContactTag = content.indexOf("[wx_contact]") !== -1;
            var hasMomentsTag =
                content.indexOf("[moments]") !== -1 ||
                content.indexOf("[moments-interactions]") !== -1;

            if (hasContactTag || hasMomentsTag) {
                console.info(
                    "[小馨手机][消息监听] 发现包含标签的已保留消息，开始处理",
                    "联系方式:",
                    hasContactTag,
                    "朋友圈:",
                    hasMomentsTag
                );
                processMessage($mes[0]);
                processedCount++;
            } else {
                skippedCount++;
                console.info(
                    "[小馨手机][消息监听] 消息已保留但不包含相关标签，跳过"
                );
            }
        });

        console.info(
            "[小馨手机][消息监听] scanRetainedMessages: 扫描完成，处理:",
            processedCount,
            "跳过:",
            skippedCount
        );

        // 额外：直接从DOM中查找所有包含朋友圈标签的内容，强制处理
        console.info("[小馨手机][消息监听] 开始强制扫描DOM中的朋友圈标签...");
        var $allElements = $(chatContainer || document.body);
        var momentsFound = 0;
        $allElements.each(function () {
            var $el = $(this);
            var html = $el.html() || "";
            var text = $el.text() || "";
            var content = html + " " + text;

            if (
                content.indexOf("[moments]") !== -1 ||
                content.indexOf("[moments-interactions]") !== -1
            ) {
                console.info(
                    "[小馨手机][消息监听] 在DOM中发现朋友圈标签，元素:",
                    $el[0]
                );
                console.info(
                    "[小馨手机][消息监听] 内容片段:",
                    content.substring(0, 500)
                );

                // 尝试找到包含这个消息的 .mes 元素
                var $mes = $el.closest(".mes");
                if ($mes.length === 0) {
                    // 如果当前元素就是消息容器，尝试向上查找
                    $mes = $el.parents(".mes").first();
                }

                if ($mes.length > 0) {
                    console.info("[小馨手机][消息监听] 找到消息元素，强制处理");
                    try {
                        processMessage($mes[0]);
                        momentsFound++;
                    } catch (e) {
                        console.error(
                            "[小馨手机][消息监听] 强制处理消息失败:",
                            e
                        );
                    }
                } else {
                    // 如果找不到 .mes，直接尝试解析内容
                    console.info(
                        "[小馨手机][消息监听] 未找到消息元素，直接解析内容"
                    );
                    try {
                        // 解析朋友圈数据
                        var parsedMoments = parseMomentsFromText(content) || [];
                        if (parsedMoments.length > 0) {
                            console.info(
                                "[小馨手机][消息监听] 直接解析到朋友圈数量:",
                                parsedMoments.length
                            );
                            parsedMoments.forEach(function (m) {
                                if (
                                    m &&
                                    m.id &&
                                    window.XiaoxinWeChatDataHandler
                                ) {
                                    console.info(
                                        "[小馨手机][消息监听] 直接保存朋友圈:",
                                        m.id,
                                        "authorId:",
                                        m.authorId || m.userId || m.author
                                    );
                                    window.XiaoxinWeChatDataHandler.addMoment(
                                        m
                                    );
                                    momentsFound++;
                                }
                            });
                        }

                        // 解析互动数据 [moments-interactions]
                        var parsedInteractions =
                            parseMomentsInteractionsFromText(content) || [];
                        if (parsedInteractions.length > 0) {
                            console.info(
                                "[小馨手机][消息监听] 直接解析到朋友圈互动数量:",
                                parsedInteractions.length
                            );

                            // 获取所有朋友圈，构建映射表
                            var allMoments =
                                window.XiaoxinWeChatDataHandler.getMoments() ||
                                [];
                            var momentMap = {};
                            allMoments.forEach(function (m) {
                                if (m && m.id) {
                                    momentMap[m.id] = m;
                                }
                            });

                            // 处理互动数据
                            parsedInteractions.forEach(function (it) {
                                if (!it || !it.momentId) {
                                    console.warn(
                                        "[小馨手机][消息监听] 强制扫描: 互动数据缺少momentId:",
                                        it
                                    );
                                    return;
                                }
                                var target = momentMap[it.momentId];
                                if (!target) {
                                    console.warn(
                                        "[小馨手机][消息监听] 强制扫描: 找不到对应的朋友圈，momentId:",
                                        it.momentId,
                                        "所有朋友圈ID:",
                                        Object.keys(momentMap)
                                    );
                                    return;
                                }

                                // 处理点赞
                                if (it.type === "like" && it.liker) {
                                    if (!Array.isArray(target.likes)) {
                                        target.likes = [];
                                    }
                                    if (target.likes.indexOf(it.liker) === -1) {
                                        target.likes.push(it.liker);
                                        console.info(
                                            "[小馨手机][消息监听] 强制扫描: 添加点赞，momentId:",
                                            it.momentId,
                                            "liker:",
                                            it.liker
                                        );
                                    }
                                }

                                // 处理评论
                                if (it.type === "comment" && it.commenter) {
                                    if (!Array.isArray(target.comments)) {
                                        target.comments = [];
                                    }
                                    var commentTextContent = (
                                        it.content || ""
                                    ).trim();
                                    var commentImageDescs = it.images || [];
                                    var commentEmojiFile = it.emoji || null;

                                    var commentUniqueKey =
                                        it.momentId +
                                        "_" +
                                        it.commenter +
                                        "_" +
                                        commentTextContent +
                                        "_" +
                                        commentImageDescs.join("|") +
                                        "_" +
                                        (commentEmojiFile || "");

                                    var isDuplicate = target.comments.some(
                                        function (c) {
                                            var cKey =
                                                it.momentId +
                                                "_" +
                                                c.author +
                                                "_" +
                                                (c.content || "").trim() +
                                                "_" +
                                                (c.images
                                                    ? c.images.join("|")
                                                    : "") +
                                                "_" +
                                                (c.emoji || "");
                                            return (
                                                cKey === commentUniqueKey &&
                                                c.type === "text"
                                            );
                                        }
                                    );

                                    if (!isDuplicate) {
                                        var commentIdHash = 0;
                                        for (
                                            var i = 0;
                                            i < commentUniqueKey.length;
                                            i++
                                        ) {
                                            var char =
                                                commentUniqueKey.charCodeAt(i);
                                            commentIdHash =
                                                (commentIdHash << 5) -
                                                commentIdHash +
                                                char;
                                            commentIdHash =
                                                commentIdHash & commentIdHash;
                                        }
                                        var commentId =
                                            "comment_" +
                                            Math.abs(commentIdHash).toString(
                                                36
                                            );

                                        var commentObj = {
                                            id: commentId,
                                            author: it.commenter,
                                            content: commentTextContent,
                                            type: "text",
                                            timestamp: Date.now(),
                                        };

                                        if (commentImageDescs.length > 0) {
                                            commentObj.images =
                                                commentImageDescs;
                                        }
                                        if (commentEmojiFile) {
                                            commentObj.emoji = commentEmojiFile;
                                        }

                                        target.comments.push(commentObj);
                                        console.info(
                                            "[小馨手机][消息监听] 强制扫描: 添加评论，momentId:",
                                            it.momentId,
                                            "commenter:",
                                            it.commenter
                                        );
                                    }
                                }

                                // 处理回复
                                if (it.type === "reply" && it.replier) {
                                    if (!Array.isArray(target.comments)) {
                                        target.comments = [];
                                    }

                                    var replyTextContent = (
                                        it.content || ""
                                    ).trim();
                                    var replyImageDescs = it.images || [];
                                    var replyEmojiFile = it.emoji || null;
                                    var replyTo = (it.replyTo || "").trim();

                                    var replyUniqueKey =
                                        it.momentId +
                                        "_" +
                                        it.replier +
                                        "_" +
                                        replyTo +
                                        "_" +
                                        replyTextContent +
                                        "_" +
                                        replyImageDescs.join("|") +
                                        "_" +
                                        (replyEmojiFile || "");

                                    var isDuplicateReply = target.comments.some(
                                        function (c) {
                                            if (
                                                c.author !== it.replier ||
                                                c.type !== "reply"
                                            ) {
                                                return false;
                                            }
                                            var cKey =
                                                it.momentId +
                                                "_" +
                                                c.author +
                                                "_" +
                                                (c.replyTo || "").trim() +
                                                "_" +
                                                (c.content || "").trim() +
                                                "_" +
                                                (c.images
                                                    ? c.images.join("|")
                                                    : "") +
                                                "_" +
                                                (c.emoji || "");
                                            return cKey === replyUniqueKey;
                                        }
                                    );

                                    if (!isDuplicateReply) {
                                        var replyIdHash = 0;
                                        for (
                                            var j = 0;
                                            j < replyUniqueKey.length;
                                            j++
                                        ) {
                                            var char2 =
                                                replyUniqueKey.charCodeAt(j);
                                            replyIdHash =
                                                (replyIdHash << 5) -
                                                replyIdHash +
                                                char2;
                                            replyIdHash =
                                                replyIdHash & replyIdHash;
                                        }
                                        var replyId =
                                            "comment_" +
                                            Math.abs(replyIdHash).toString(36);

                                        var replyComment = {
                                            id: replyId,
                                            author: it.replier,
                                            replyTo: replyTo,
                                            replyContent: replyTextContent,
                                            content: replyTextContent,
                                            type: "reply",
                                            timestamp: Date.now(),
                                        };

                                        if (replyImageDescs.length > 0) {
                                            replyComment.images =
                                                replyImageDescs;
                                        }
                                        if (replyEmojiFile) {
                                            replyComment.emoji = replyEmojiFile;
                                        }

                                        target.comments.push(replyComment);
                                        console.info(
                                            "[小馨手机][消息监听] 强制扫描: 添加回复，momentId:",
                                            it.momentId,
                                            "replier:",
                                            it.replier,
                                            "replyTo:",
                                            replyTo
                                        );
                                    }
                                }

                                // 更新朋友圈数据
                                var updates = {
                                    likes: target.likes.slice(),
                                    comments: target.comments.slice(),
                                };
                                window.XiaoxinWeChatDataHandler.updateMoment(
                                    target.id,
                                    updates
                                );
                            });

                            console.info(
                                "[小馨手机][消息监听] 强制扫描: 处理了",
                                parsedInteractions.length,
                                "条互动数据"
                            );
                        }
                    } catch (e) {
                        console.error("[小馨手机][消息监听] 直接解析失败:", e);
                    }
                }
            }
        });
        console.info(
            "[小馨手机][消息监听] 强制扫描完成，找到朋友圈数量:",
            momentsFound
        );
    }

    // 简单的DOM监听（只监听新增的消息）
    function startListening() {
        var chatSelectors = [
            "#chat",
            ".chat",
            "#chatContainer",
            ".chat-container",
            "[id*='chat']",
            "[class*='chat']",
        ];

        var chatContainer = null;
        for (var i = 0; i < chatSelectors.length; i++) {
            chatContainer = document.querySelector(chatSelectors[i]);
            if (chatContainer) {
                break;
            }
        }

        if (!chatContainer) {
            // 延迟重试
            setTimeout(function () {
                startListening();
            }, 1000);
            return;
        }

        // 使用MutationObserver监听新消息
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.nodeType === 1) {
                            var $node = $(node);
                            var $messages = $node.find(".mes");

                            // 如果节点本身就是消息
                            if ($node.hasClass("mes")) {
                                $messages = $messages.add($node);
                            }

                            // 立即处理消息：自动隐藏 [MSG] 标签和朋友圈标签（会先保存原始内容）
                            $messages.each(function () {
                                var $mes = $(this);
                                // 自动隐藏 [MSG] 标签（会先保存原始内容到data属性）
                                hideMsgTagsInDom($mes[0]);
                                // 自动隐藏朋友圈标签和生成指令标签
                                hideMomentsTagsInDom($mes[0]);
                            });

                            // 延迟处理，确保消息已稳定
                            setTimeout(function () {
                                $messages.each(function () {
                                    var $mes = $(this);
                                    var $swipeCheck = $mes.closest(
                                        "[class*='swipe'], [class*='draft'], [class*='temp'], [class*='candidate'], [class*='alternative']"
                                    );
                                    if (
                                        $swipeCheck.length === 0 &&
                                        isMessageInChatHistory($mes[0])
                                    ) {
                                        processMessage($mes[0]);
                                    }
                                });
                            }, 500);
                        }
                    });
                }
            });
        });

        observer.observe(chatContainer, {
            childList: true,
            subtree: true,
        });

        console.info(
            "[小馨手机][消息监听] 已开始监听消息，容器:",
            chatContainer
        );

        // 立即扫描一次已存在的消息（延迟多次扫描，确保消息已稳定）
        setTimeout(function () {
            scanRetainedMessages();
        }, 500);

        setTimeout(function () {
            scanRetainedMessages();
        }, 2000);

        setTimeout(function () {
            scanRetainedMessages();
        }, 5000);

        // 额外延迟扫描，确保所有消息都已保留
        setTimeout(function () {
            scanRetainedMessages();
        }, 10000);

        // 将scanRetainedMessages暴露到全局，方便手动触发
        if (typeof window !== "undefined") {
            window.XiaoxinScanMoments = function () {
                console.info("[小馨手机][消息监听] 手动触发扫描朋友圈数据");
                scanRetainedMessages();
            };

            // 添加一个更激进的扫描函数：从消息数据和DOM中搜索朋友圈标签
            window.XiaoxinForceScanMoments = function () {
                console.info(
                    "[小馨手机][消息监听] ========== 强制扫描朋友圈数据 =========="
                );

                if (
                    !window.XiaoxinWeChatDataHandler ||
                    typeof window.XiaoxinWeChatDataHandler.addMoment !==
                        "function"
                ) {
                    console.error("[小馨手机][消息监听] 数据处理器未加载");
                    return;
                }

                var totalFound = 0;
                var totalSaved = 0;

                // 方法1: 从酒馆消息数据中获取
                if (typeof getChatMessages === "function") {
                    console.info(
                        "[小馨手机][消息监听] 方法1: 从酒馆消息数据中扫描..."
                    );
                    try {
                        var messages = getChatMessages();
                        console.info(
                            "[小馨手机][消息监听] 获取到消息数量:",
                            messages ? messages.length : 0
                        );

                        if (messages && messages.length > 0) {
                            for (var i = 0; i < messages.length; i++) {
                                var msg = messages[i];
                                // 检查所有可能的字段
                                var fieldsToCheck = [
                                    "raw",
                                    "original",
                                    "originalMes",
                                    "originalText",
                                    "mes",
                                    "text",
                                    "content",
                                ];
                                for (var j = 0; j < fieldsToCheck.length; j++) {
                                    var fieldName = fieldsToCheck[j];
                                    var fieldValue = msg[fieldName];
                                    if (
                                        fieldValue &&
                                        typeof fieldValue === "string"
                                    ) {
                                        if (
                                            fieldValue.indexOf("[moments]") !==
                                                -1 ||
                                            fieldValue.indexOf(
                                                "[moments-interactions]"
                                            ) !== -1
                                        ) {
                                            console.info(
                                                "[小馨手机][消息监听] 在消息",
                                                i,
                                                "的字段",
                                                fieldName,
                                                "中找到朋友圈标签"
                                            );
                                            console.info(
                                                "[小馨手机][消息监听] 内容预览:",
                                                fieldValue.substring(0, 500)
                                            );

                                            try {
                                                // 解析朋友圈数据
                                                var parsedMoments =
                                                    parseMomentsFromText(
                                                        fieldValue
                                                    ) || [];
                                                console.info(
                                                    "[小馨手机][消息监听] 解析到朋友圈数量:",
                                                    parsedMoments.length
                                                );

                                                if (parsedMoments.length > 0) {
                                                    var existing =
                                                        window.XiaoxinWeChatDataHandler.getMoments() ||
                                                        [];
                                                    var existingIds = {};
                                                    existing.forEach(function (
                                                        m
                                                    ) {
                                                        if (m && m.id) {
                                                            existingIds[
                                                                m.id
                                                            ] = true;
                                                        }
                                                        if (m && m._id) {
                                                            existingIds[
                                                                m._id
                                                            ] = true;
                                                        }
                                                    });

                                                    // 生成唯一朋友圈ID的函数（与data-handler.js中的逻辑一致）
                                                    function generateUniqueMomentIdForListener(
                                                        ids
                                                    ) {
                                                        ids = ids || {};
                                                        var maxAttempts = 100;
                                                        var attempt = 0;
                                                        var newId;

                                                        do {
                                                            var chars =
                                                                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                                                            var randomPart = "";
                                                            for (
                                                                var i = 0;
                                                                i < 8;
                                                                i++
                                                            ) {
                                                                randomPart +=
                                                                    chars.charAt(
                                                                        Math.floor(
                                                                            Math.random() *
                                                                                chars.length
                                                                        )
                                                                    );
                                                            }
                                                            newId =
                                                                "moment-" +
                                                                randomPart;
                                                            attempt++;
                                                        } while (
                                                            ids[newId] &&
                                                            attempt <
                                                                maxAttempts
                                                        );

                                                        if (
                                                            attempt >=
                                                            maxAttempts
                                                        ) {
                                                            newId =
                                                                "moment_" +
                                                                Date.now() +
                                                                "_" +
                                                                Math.random()
                                                                    .toString(
                                                                        36
                                                                    )
                                                                    .substr(
                                                                        2,
                                                                        9
                                                                    );
                                                        }

                                                        return newId;
                                                    }

                                                    parsedMoments.forEach(
                                                        function (m) {
                                                            if (!m || !m.id) {
                                                                // 如果没有ID，自动生成一个
                                                                m.id =
                                                                    generateUniqueMomentIdForListener(
                                                                        existingIds
                                                                    );
                                                                console.info(
                                                                    "[小馨手机][消息监听] 朋友圈没有ID，自动生成新ID:",
                                                                    m.id,
                                                                    "authorId:",
                                                                    m.authorId ||
                                                                        m.userId ||
                                                                        m.author
                                                                );
                                                            } else if (
                                                                existingIds[
                                                                    m.id
                                                                ]
                                                            ) {
                                                                // 已存在相同ID的朋友圈，自动生成新的唯一ID
                                                                var originalId =
                                                                    m.id;
                                                                m.id =
                                                                    generateUniqueMomentIdForListener(
                                                                        existingIds
                                                                    );
                                                                console.warn(
                                                                    "[小馨手机][消息监听] 检测到重复的朋友圈ID，自动生成新ID:",
                                                                    "原ID:",
                                                                    originalId,
                                                                    "新ID:",
                                                                    m.id,
                                                                    "authorId:",
                                                                    m.authorId ||
                                                                        m.userId ||
                                                                        m.author
                                                                );
                                                            }

                                                            // 将新ID加入映射，避免同一批解析的朋友圈之间重复
                                                            existingIds[
                                                                m.id
                                                            ] = true;

                                                            console.info(
                                                                "[小馨手机][消息监听] 保存朋友圈:",
                                                                {
                                                                    id: m.id,
                                                                    authorId:
                                                                        m.authorId ||
                                                                        m.userId ||
                                                                        m.author,
                                                                    type: m.type,
                                                                    content: (
                                                                        m.content ||
                                                                        ""
                                                                    ).substring(
                                                                        0,
                                                                        50
                                                                    ),
                                                                }
                                                            );
                                                            // addMoment会再次检查ID重复和内容重复，确保唯一性
                                                            window.XiaoxinWeChatDataHandler.addMoment(
                                                                m
                                                            );
                                                            totalSaved++;
                                                        }
                                                    );
                                                    totalFound +=
                                                        parsedMoments.length;
                                                }

                                                // 解析互动数据
                                                var interactions =
                                                    parseMomentsInteractionsFromText(
                                                        fieldValue
                                                    ) || [];
                                                console.info(
                                                    "[小馨手机][消息监听] 解析到互动数量:",
                                                    interactions.length
                                                );

                                                if (interactions.length > 0) {
                                                    var allMoments =
                                                        window.XiaoxinWeChatDataHandler.getMoments() ||
                                                        [];
                                                    var momentMap = {};
                                                    allMoments.forEach(
                                                        function (m) {
                                                            if (m && m.id) {
                                                                momentMap[
                                                                    m.id
                                                                ] = m;
                                                            }
                                                        }
                                                    );

                                                    interactions.forEach(
                                                        function (it) {
                                                            if (
                                                                !it ||
                                                                !it.momentId
                                                            ) {
                                                                console.warn(
                                                                    "[小馨手机][消息监听] 强制扫描: 互动数据缺少momentId:",
                                                                    it
                                                                );
                                                                return;
                                                            }
                                                            var target =
                                                                momentMap[
                                                                    it.momentId
                                                                ];
                                                            if (!target) {
                                                                console.warn(
                                                                    "[小馨手机][消息监听] 强制扫描: 找不到对应的朋友圈，momentId:",
                                                                    it.momentId,
                                                                    "所有朋友圈ID:",
                                                                    Object.keys(
                                                                        momentMap
                                                                    )
                                                                );
                                                                return;
                                                            }

                                                            // 点赞
                                                            if (
                                                                it.type ===
                                                                    "like" &&
                                                                it.liker
                                                            ) {
                                                                console.info(
                                                                    "[小馨手机][消息监听] 强制扫描: 处理点赞，momentId:",
                                                                    it.momentId,
                                                                    "liker:",
                                                                    it.liker
                                                                );
                                                                if (
                                                                    !Array.isArray(
                                                                        target.likes
                                                                    )
                                                                ) {
                                                                    target.likes =
                                                                        [];
                                                                }
                                                                if (
                                                                    target.likes.indexOf(
                                                                        it.liker
                                                                    ) === -1
                                                                ) {
                                                                    target.likes.push(
                                                                        it.liker
                                                                    );
                                                                    console.info(
                                                                        "[小馨手机][消息监听] 强制扫描: 添加点赞，当前点赞列表:",
                                                                        target.likes
                                                                    );
                                                                }
                                                            }

                                                            // 评论
                                                            if (
                                                                it.type ===
                                                                    "comment" &&
                                                                it.commenter
                                                            ) {
                                                                console.info(
                                                                    "[小馨手机][消息监听] 强制扫描: 处理评论，momentId:",
                                                                    it.momentId,
                                                                    "commenter:",
                                                                    it.commenter
                                                                );
                                                                if (
                                                                    !Array.isArray(
                                                                        target.comments
                                                                    )
                                                                ) {
                                                                    target.comments =
                                                                        [];
                                                                }

                                                                var commentTextContent =
                                                                    (
                                                                        it.content ||
                                                                        ""
                                                                    ).trim();
                                                                var commentImageDescs =
                                                                    it.images ||
                                                                    [];
                                                                var commentEmojiFile =
                                                                    it.emoji ||
                                                                    null;

                                                                var commentUniqueKey =
                                                                    it.momentId +
                                                                    "_" +
                                                                    it.commenter +
                                                                    "_" +
                                                                    commentTextContent +
                                                                    "_" +
                                                                    commentImageDescs.join(
                                                                        "|"
                                                                    ) +
                                                                    "_" +
                                                                    (commentEmojiFile ||
                                                                        "");

                                                                var isDuplicate =
                                                                    target.comments.some(
                                                                        function (
                                                                            c
                                                                        ) {
                                                                            var cKey =
                                                                                it.momentId +
                                                                                "_" +
                                                                                c.author +
                                                                                "_" +
                                                                                (
                                                                                    c.content ||
                                                                                    ""
                                                                                ).trim() +
                                                                                "_" +
                                                                                (c.images
                                                                                    ? c.images.join(
                                                                                          "|"
                                                                                      )
                                                                                    : "") +
                                                                                "_" +
                                                                                (c.emoji ||
                                                                                    "");
                                                                            return (
                                                                                cKey ===
                                                                                    commentUniqueKey &&
                                                                                c.type ===
                                                                                    "text"
                                                                            );
                                                                        }
                                                                    );

                                                                if (
                                                                    !isDuplicate
                                                                ) {
                                                                    var commentIdHash = 0;
                                                                    for (
                                                                        var k = 0;
                                                                        k <
                                                                        commentUniqueKey.length;
                                                                        k++
                                                                    ) {
                                                                        var char =
                                                                            commentUniqueKey.charCodeAt(
                                                                                k
                                                                            );
                                                                        commentIdHash =
                                                                            (commentIdHash <<
                                                                                5) -
                                                                            commentIdHash +
                                                                            char;
                                                                        commentIdHash =
                                                                            commentIdHash &
                                                                            commentIdHash;
                                                                    }
                                                                    var commentId =
                                                                        "comment_" +
                                                                        Math.abs(
                                                                            commentIdHash
                                                                        ).toString(
                                                                            36
                                                                        );

                                                                    var commentObj =
                                                                        {
                                                                            id: commentId,
                                                                            author: it.commenter,
                                                                            content:
                                                                                commentTextContent,
                                                                            type: "text",
                                                                            timestamp:
                                                                                Date.now(),
                                                                        };

                                                                    if (
                                                                        commentImageDescs.length >
                                                                        0
                                                                    ) {
                                                                        commentObj.images =
                                                                            commentImageDescs;
                                                                    }

                                                                    if (
                                                                        commentEmojiFile
                                                                    ) {
                                                                        commentObj.emoji =
                                                                            commentEmojiFile;
                                                                    }

                                                                    target.comments.push(
                                                                        commentObj
                                                                    );
                                                                    console.info(
                                                                        "[小馨手机][消息监听] 强制扫描: 添加评论，当前评论数:",
                                                                        target
                                                                            .comments
                                                                            .length
                                                                    );
                                                                }
                                                            }

                                                            // 回复
                                                            if (
                                                                it.type ===
                                                                    "reply" &&
                                                                it.replier
                                                            ) {
                                                                console.info(
                                                                    "[小馨手机][消息监听] 强制扫描: 处理回复，momentId:",
                                                                    it.momentId,
                                                                    "replier:",
                                                                    it.replier,
                                                                    "replyTo:",
                                                                    it.replyTo
                                                                );
                                                                if (
                                                                    !Array.isArray(
                                                                        target.comments
                                                                    )
                                                                ) {
                                                                    target.comments =
                                                                        [];
                                                                }

                                                                var replyTextContent =
                                                                    (
                                                                        it.content ||
                                                                        ""
                                                                    ).trim();
                                                                var replyImageDescs =
                                                                    it.images ||
                                                                    [];
                                                                var replyEmojiFile =
                                                                    it.emoji ||
                                                                    null;
                                                                var replyTo = (
                                                                    it.replyTo ||
                                                                    ""
                                                                ).trim();

                                                                var replyUniqueKey =
                                                                    it.momentId +
                                                                    "_" +
                                                                    it.replier +
                                                                    "_" +
                                                                    replyTo +
                                                                    "_" +
                                                                    replyTextContent +
                                                                    "_" +
                                                                    replyImageDescs.join(
                                                                        "|"
                                                                    ) +
                                                                    "_" +
                                                                    (replyEmojiFile ||
                                                                        "");

                                                                var isDuplicateReply =
                                                                    target.comments.some(
                                                                        function (
                                                                            c
                                                                        ) {
                                                                            if (
                                                                                c.author !==
                                                                                    it.replier ||
                                                                                c.type !==
                                                                                    "reply"
                                                                            ) {
                                                                                return false;
                                                                            }
                                                                            var cKey =
                                                                                it.momentId +
                                                                                "_" +
                                                                                c.author +
                                                                                "_" +
                                                                                (
                                                                                    c.replyTo ||
                                                                                    ""
                                                                                ).trim() +
                                                                                "_" +
                                                                                (
                                                                                    c.content ||
                                                                                    ""
                                                                                ).trim() +
                                                                                "_" +
                                                                                (c.images
                                                                                    ? c.images.join(
                                                                                          "|"
                                                                                      )
                                                                                    : "") +
                                                                                "_" +
                                                                                (c.emoji ||
                                                                                    "");
                                                                            return (
                                                                                cKey ===
                                                                                replyUniqueKey
                                                                            );
                                                                        }
                                                                    );

                                                                if (
                                                                    !isDuplicateReply
                                                                ) {
                                                                    var replyIdHash = 0;
                                                                    for (
                                                                        var k = 0;
                                                                        k <
                                                                        replyUniqueKey.length;
                                                                        k++
                                                                    ) {
                                                                        var char =
                                                                            replyUniqueKey.charCodeAt(
                                                                                k
                                                                            );
                                                                        replyIdHash =
                                                                            (replyIdHash <<
                                                                                5) -
                                                                            replyIdHash +
                                                                            char;
                                                                        replyIdHash =
                                                                            replyIdHash &
                                                                            replyIdHash;
                                                                    }
                                                                    var replyId =
                                                                        "reply_" +
                                                                        Math.abs(
                                                                            replyIdHash
                                                                        ).toString(
                                                                            36
                                                                        );

                                                                    var replyComment =
                                                                        {
                                                                            id: replyId,
                                                                            author: it.replier,
                                                                            replyTo:
                                                                                replyTo,
                                                                            content:
                                                                                replyTextContent,
                                                                            type: "reply",
                                                                            timestamp:
                                                                                Date.now(),
                                                                        };

                                                                    if (
                                                                        replyImageDescs.length >
                                                                        0
                                                                    ) {
                                                                        replyComment.images =
                                                                            replyImageDescs;
                                                                    }

                                                                    if (
                                                                        replyEmojiFile
                                                                    ) {
                                                                        replyComment.emoji =
                                                                            replyEmojiFile;
                                                                    }

                                                                    target.comments.push(
                                                                        replyComment
                                                                    );
                                                                    console.info(
                                                                        "[小馨手机][消息监听] 强制扫描: 添加回复，当前评论数:",
                                                                        target
                                                                            .comments
                                                                            .length
                                                                    );
                                                                }
                                                            }

                                                            window.XiaoxinWeChatDataHandler.updateMoment(
                                                                target.id,
                                                                target
                                                            );
                                                        }
                                                    );

                                                    console.info(
                                                        "[小馨手机][消息监听] 强制扫描: 互动数据已更新"
                                                    );
                                                }
                                            } catch (e) {
                                                console.error(
                                                    "[小馨手机][消息监听] 解析朋友圈失败:",
                                                    e
                                                );
                                            }
                                            break; // 找到一个字段就够了
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error(
                            "[小馨手机][消息监听] 从消息数据扫描失败:",
                            e
                        );
                    }
                }

                // 方法2: 从DOM的data属性中获取
                console.info(
                    "[小馨手机][消息监听] 方法2: 从DOM的data属性中扫描..."
                );
                try {
                    var $allElements = $(
                        "[data-original-moments-content], [data-original-msg-content], [data-original-content], [data-original], [data-raw]"
                    );
                    console.info(
                        "[小馨手机][消息监听] 找到",
                        $allElements.length,
                        "个包含data属性的元素"
                    );

                    $allElements.each(function () {
                        var $el = $(this);
                        var content =
                            $el.attr("data-original-moments-content") ||
                            $el.attr("data-original-msg-content") ||
                            $el.attr("data-original-content") ||
                            $el.attr("data-original") ||
                            $el.attr("data-raw") ||
                            "";

                        if (
                            content &&
                            (content.indexOf("[moments]") !== -1 ||
                                content.indexOf("[moments-interactions]") !==
                                    -1)
                        ) {
                            console.info(
                                "[小馨手机][消息监听] 在data属性中找到朋友圈标签"
                            );
                            try {
                                var parsedMoments =
                                    parseMomentsFromText(content) || [];
                                if (parsedMoments.length > 0) {
                                    var existing =
                                        window.XiaoxinWeChatDataHandler.getMoments() ||
                                        [];
                                    var existingIds = {};
                                    existing.forEach(function (m) {
                                        if (m && m.id) {
                                            existingIds[m.id] = true;
                                        }
                                    });

                                    parsedMoments.forEach(function (m) {
                                        if (!m || !m.id) return;
                                        if (!existingIds[m.id]) {
                                            window.XiaoxinWeChatDataHandler.addMoment(
                                                m
                                            );
                                            existingIds[m.id] = true;
                                            totalSaved++;
                                        }
                                    });
                                    totalFound += parsedMoments.length;
                                }
                            } catch (e) {
                                console.error(
                                    "[小馨手机][消息监听] 解析data属性中的朋友圈失败:",
                                    e
                                );
                            }
                        }
                    });
                } catch (e) {
                    console.error(
                        "[小馨手机][消息监听] 从DOM data属性扫描失败:",
                        e
                    );
                }

                // 方法3: 从整个页面HTML中搜索（最后尝试）
                console.info(
                    "[小馨手机][消息监听] 方法3: 从整个页面HTML中扫描..."
                );
                try {
                    var pageHtml =
                        document.documentElement.innerHTML ||
                        document.body.innerHTML ||
                        "";

                    // 扫描朋友圈数据
                    var momentsRegex = /\[moments\]([\s\S]*?)\[\/moments\]/gi;
                    var match;
                    var htmlFoundCount = 0;

                    while ((match = momentsRegex.exec(pageHtml)) !== null) {
                        htmlFoundCount++;
                        var momentsContent = match[0];
                        console.info(
                            "[小馨手机][消息监听] 在HTML中找到朋友圈标签 #" +
                                htmlFoundCount
                        );

                        try {
                            var parsedMoments =
                                parseMomentsFromText(momentsContent) || [];
                            if (parsedMoments.length > 0) {
                                var existing =
                                    window.XiaoxinWeChatDataHandler.getMoments() ||
                                    [];
                                var existingIds = {};
                                existing.forEach(function (m) {
                                    if (m && m.id) {
                                        existingIds[m.id] = true;
                                    }
                                });

                                parsedMoments.forEach(function (m) {
                                    if (!m || !m.id) return;
                                    if (!existingIds[m.id]) {
                                        window.XiaoxinWeChatDataHandler.addMoment(
                                            m
                                        );
                                        existingIds[m.id] = true;
                                        totalSaved++;
                                    }
                                });
                                totalFound += parsedMoments.length;
                            }
                        } catch (e) {
                            console.error(
                                "[小馨手机][消息监听] 解析HTML中的朋友圈失败:",
                                e
                            );
                        }
                    }
                    console.info(
                        "[小馨手机][消息监听] 在HTML中找到朋友圈标签数量:",
                        htmlFoundCount
                    );

                    // 扫描互动数据
                    var interactionsRegex =
                        /\[moments-interactions\]([\s\S]*?)\[\/moments-interactions\]/gi;
                    var interactionsMatch;
                    var interactionsFoundCount = 0;
                    var interactionsProcessedCount = 0;

                    while (
                        (interactionsMatch =
                            interactionsRegex.exec(pageHtml)) !== null
                    ) {
                        interactionsFoundCount++;
                        var interactionsContent = interactionsMatch[0];
                        console.info(
                            "[小馨手机][消息监听] 在HTML中找到互动标签 #" +
                                interactionsFoundCount
                        );
                        console.info(
                            "[小馨手机][消息监听] 互动标签内容预览:",
                            interactionsContent.substring(0, 500)
                        );

                        try {
                            var interactions =
                                parseMomentsInteractionsFromText(
                                    interactionsContent
                                ) || [];
                            console.info(
                                "[小馨手机][消息监听] 从HTML解析到互动数量:",
                                interactions.length
                            );
                            if (interactions.length > 0) {
                                console.info(
                                    "[小馨手机][消息监听] 解析到的互动数据:",
                                    interactions
                                );
                            } else {
                                console.warn(
                                    "[小馨手机][消息监听] 警告：找到了互动标签但解析结果为空，内容:",
                                    interactionsContent.substring(0, 200)
                                );
                            }

                            if (interactions.length > 0) {
                                var allMoments =
                                    window.XiaoxinWeChatDataHandler.getMoments() ||
                                    [];
                                var momentMap = {};
                                allMoments.forEach(function (m) {
                                    if (m && m.id) {
                                        momentMap[m.id] = m;
                                    }
                                });

                                interactions.forEach(function (it) {
                                    if (!it || !it.momentId) {
                                        console.warn(
                                            "[小馨手机][消息监听] HTML扫描: 互动数据缺少momentId:",
                                            it
                                        );
                                        return;
                                    }

                                    // 尝试多种ID匹配方式（支持数字1和字母l的混淆）
                                    var target = momentMap[it.momentId];
                                    if (!target) {
                                        // 尝试替换1和l
                                        var altId1 = it.momentId.replace(
                                            /1/g,
                                            "l"
                                        );
                                        var altId2 = it.momentId.replace(
                                            /l/g,
                                            "1"
                                        );
                                        if (momentMap[altId1]) {
                                            target = momentMap[altId1];
                                            console.info(
                                                "[小馨手机][消息监听] HTML扫描: 通过ID替换找到朋友圈，原ID:",
                                                it.momentId,
                                                "匹配ID:",
                                                altId1
                                            );
                                        } else if (momentMap[altId2]) {
                                            target = momentMap[altId2];
                                            console.info(
                                                "[小馨手机][消息监听] HTML扫描: 通过ID替换找到朋友圈，原ID:",
                                                it.momentId,
                                                "匹配ID:",
                                                altId2
                                            );
                                        }
                                    }

                                    if (!target) {
                                        console.warn(
                                            "[小馨手机][消息监听] HTML扫描: 找不到对应的朋友圈，momentId:",
                                            it.momentId,
                                            "所有朋友圈ID:",
                                            Object.keys(momentMap).slice(0, 10)
                                        );
                                        return;
                                    }

                                    console.info(
                                        "[小馨手机][消息监听] HTML扫描: 找到朋友圈，momentId:",
                                        target.id,
                                        "当前点赞数:",
                                        (target.likes && target.likes.length) ||
                                            0,
                                        "当前评论数:",
                                        (target.comments &&
                                            target.comments.length) ||
                                            0,
                                        "当前点赞列表:",
                                        target.likes,
                                        "当前评论列表:",
                                        (target.comments || []).map(function (
                                            c
                                        ) {
                                            return {
                                                author: c.author,
                                                type: c.type,
                                                content: (
                                                    c.content || ""
                                                ).substring(0, 20),
                                            };
                                        })
                                    );

                                    var updated = false;

                                    // 点赞
                                    if (it.type === "like" && it.liker) {
                                        console.info(
                                            "[小馨手机][消息监听] HTML扫描: 处理点赞，momentId:",
                                            it.momentId,
                                            "liker:",
                                            it.liker
                                        );
                                        if (!Array.isArray(target.likes)) {
                                            target.likes = [];
                                        }
                                        // 检查点赞是否已存在（支持ID和显示名称匹配）
                                        var likerExists = false;
                                        var existingLikesList =
                                            target.likes || [];
                                        for (
                                            var li = 0;
                                            li < existingLikesList.length;
                                            li++
                                        ) {
                                            var existingLiker = String(
                                                existingLikesList[li]
                                            ).trim();
                                            var newLiker = String(
                                                it.liker
                                            ).trim();
                                            if (existingLiker === newLiker) {
                                                likerExists = true;
                                                break;
                                            }
                                        }

                                        if (!likerExists) {
                                            target.likes.push(it.liker);
                                            updated = true;
                                            console.info(
                                                "[小馨手机][消息监听] HTML扫描: 添加点赞，liker:",
                                                it.liker,
                                                "当前点赞列表:",
                                                target.likes
                                            );
                                        } else {
                                            console.info(
                                                "[小馨手机][消息监听] HTML扫描: 点赞已存在，跳过，liker:",
                                                it.liker,
                                                "现有列表:",
                                                target.likes
                                            );
                                        }
                                    }

                                    // 评论
                                    if (it.type === "comment" && it.commenter) {
                                        console.info(
                                            "[小馨手机][消息监听] HTML扫描: 处理评论，momentId:",
                                            it.momentId,
                                            "commenter:",
                                            it.commenter
                                        );
                                        if (!Array.isArray(target.comments)) {
                                            target.comments = [];
                                        }

                                        var commentTextContent = (
                                            it.content || ""
                                        ).trim();
                                        var commentImageDescs = it.images || [];
                                        var commentEmojiFile = it.emoji || null;

                                        // 检查评论是否已存在（更宽松的匹配，不包含momentId）
                                        var isDuplicate = false;
                                        for (
                                            var ci = 0;
                                            ci < target.comments.length;
                                            ci++
                                        ) {
                                            var c = target.comments[ci];
                                            if (c.type !== "text") continue;

                                            // 匹配作者、内容和类型（不包含momentId，因为同一个朋友圈下的评论）
                                            var authorMatch =
                                                String(c.author).trim() ===
                                                String(it.commenter).trim();
                                            var contentMatch =
                                                (c.content || "").trim() ===
                                                commentTextContent.trim();
                                            var imagesMatch =
                                                (c.images
                                                    ? c.images.join("|")
                                                    : "") ===
                                                commentImageDescs.join("|");
                                            var emojiMatch =
                                                (c.emoji || "") ===
                                                (commentEmojiFile || "");

                                            if (
                                                authorMatch &&
                                                contentMatch &&
                                                imagesMatch &&
                                                emojiMatch
                                            ) {
                                                isDuplicate = true;
                                                console.info(
                                                    "[小馨手机][消息监听] HTML扫描: 评论重复，作者:",
                                                    it.commenter,
                                                    "内容:",
                                                    commentTextContent.substring(
                                                        0,
                                                        20
                                                    )
                                                );
                                                break;
                                            }
                                        }

                                        if (!isDuplicate) {
                                            // 构建用于去重的唯一标识
                                            var commentUniqueKey =
                                                it.momentId +
                                                "_" +
                                                it.commenter +
                                                "_" +
                                                commentTextContent +
                                                "_" +
                                                commentImageDescs.join("|") +
                                                "_" +
                                                (commentEmojiFile || "");

                                            var commentIdHash = 0;
                                            for (
                                                var k = 0;
                                                k < commentUniqueKey.length;
                                                k++
                                            ) {
                                                var char =
                                                    commentUniqueKey.charCodeAt(
                                                        k
                                                    );
                                                commentIdHash =
                                                    (commentIdHash << 5) -
                                                    commentIdHash +
                                                    char;
                                                commentIdHash =
                                                    commentIdHash &
                                                    commentIdHash;
                                            }
                                            var commentId =
                                                "comment_" +
                                                Math.abs(
                                                    commentIdHash
                                                ).toString(36);

                                            var commentObj = {
                                                id: commentId,
                                                author: it.commenter,
                                                content: commentTextContent,
                                                type: "text",
                                                timestamp: Date.now(),
                                            };

                                            if (commentImageDescs.length > 0) {
                                                commentObj.images =
                                                    commentImageDescs;
                                            }

                                            if (commentEmojiFile) {
                                                commentObj.emoji =
                                                    commentEmojiFile;
                                            }

                                            target.comments.push(commentObj);
                                            updated = true;
                                            console.info(
                                                "[小馨手机][消息监听] HTML扫描: 添加评论，当前评论数:",
                                                target.comments.length,
                                                "评论内容:",
                                                commentTextContent.substring(
                                                    0,
                                                    30
                                                )
                                            );
                                        } else {
                                            console.info(
                                                "[小馨手机][消息监听] HTML扫描: 评论已存在，跳过"
                                            );
                                        }
                                    }

                                    // 回复
                                    if (it.type === "reply" && it.replier) {
                                        console.info(
                                            "[小馨手机][消息监听] HTML扫描: 处理回复，momentId:",
                                            it.momentId,
                                            "replier:",
                                            it.replier,
                                            "replyTo:",
                                            it.replyTo
                                        );
                                        if (!Array.isArray(target.comments)) {
                                            target.comments = [];
                                        }

                                        var replyTextContent = (
                                            it.content || ""
                                        ).trim();
                                        var replyImageDescs = it.images || [];
                                        var replyEmojiFile = it.emoji || null;
                                        var replyTo = (it.replyTo || "").trim();

                                        var replyUniqueKey =
                                            it.momentId +
                                            "_" +
                                            it.replier +
                                            "_" +
                                            replyTo +
                                            "_" +
                                            replyTextContent +
                                            "_" +
                                            replyImageDescs.join("|") +
                                            "_" +
                                            (replyEmojiFile || "");

                                        // 检查回复是否已存在（更宽松的匹配）
                                        var isDuplicateReply = false;
                                        for (
                                            var ri = 0;
                                            ri < target.comments.length;
                                            ri++
                                        ) {
                                            var c = target.comments[ri];
                                            if (c.type !== "reply") continue;

                                            // 匹配作者、回复对象、内容和类型
                                            var authorMatch =
                                                String(c.author).trim() ===
                                                String(it.replier).trim();
                                            var replyToMatch =
                                                (c.replyTo || "").trim() ===
                                                replyTo.trim();
                                            var contentMatch =
                                                (c.content || "").trim() ===
                                                replyTextContent.trim();
                                            var imagesMatch =
                                                (c.images
                                                    ? c.images.join("|")
                                                    : "") ===
                                                replyImageDescs.join("|");
                                            var emojiMatch =
                                                (c.emoji || "") ===
                                                (replyEmojiFile || "");

                                            if (
                                                authorMatch &&
                                                replyToMatch &&
                                                contentMatch &&
                                                imagesMatch &&
                                                emojiMatch
                                            ) {
                                                isDuplicateReply = true;
                                                break;
                                            }
                                        }

                                        if (!isDuplicateReply) {
                                            var replyIdHash = 0;
                                            var replyUniqueKeyForHash =
                                                it.replier +
                                                "_" +
                                                replyTo +
                                                "_" +
                                                replyTextContent +
                                                "_" +
                                                replyImageDescs.join("|") +
                                                "_" +
                                                (replyEmojiFile || "");
                                            for (
                                                var k = 0;
                                                k <
                                                replyUniqueKeyForHash.length;
                                                k++
                                            ) {
                                                var char =
                                                    replyUniqueKeyForHash.charCodeAt(
                                                        k
                                                    );
                                                replyIdHash =
                                                    (replyIdHash << 5) -
                                                    replyIdHash +
                                                    char;
                                                replyIdHash =
                                                    replyIdHash & replyIdHash;
                                            }
                                            var replyId =
                                                "reply_" +
                                                Math.abs(replyIdHash).toString(
                                                    36
                                                );

                                            var replyComment = {
                                                id: replyId,
                                                author: it.replier,
                                                replyTo: replyTo,
                                                content: replyTextContent,
                                                type: "reply",
                                                timestamp: Date.now(),
                                            };

                                            if (replyImageDescs.length > 0) {
                                                replyComment.images =
                                                    replyImageDescs;
                                            }

                                            if (replyEmojiFile) {
                                                replyComment.emoji =
                                                    replyEmojiFile;
                                            }

                                            target.comments.push(replyComment);
                                            updated = true;
                                            console.info(
                                                "[小馨手机][消息监听] HTML扫描: 添加回复，replier:",
                                                it.replier,
                                                "replyTo:",
                                                replyTo,
                                                "当前评论数:",
                                                target.comments.length,
                                                "回复内容:",
                                                replyTextContent.substring(
                                                    0,
                                                    30
                                                )
                                            );
                                        } else {
                                            console.info(
                                                "[小馨手机][消息监听] HTML扫描: 回复已存在，跳过，replier:",
                                                it.replier,
                                                "replyTo:",
                                                replyTo,
                                                "内容:",
                                                replyTextContent.substring(
                                                    0,
                                                    20
                                                ),
                                                "现有评论数:",
                                                target.comments.length
                                            );
                                        }
                                    }

                                    if (updated) {
                                        console.info(
                                            "[小馨手机][消息监听] HTML扫描: 准备更新朋友圈，momentId:",
                                            target.id,
                                            "更新前点赞数:",
                                            (target.likes &&
                                                target.likes.length) ||
                                                0,
                                            "更新前评论数:",
                                            (target.comments &&
                                                target.comments.length) ||
                                                0
                                        );
                                        window.XiaoxinWeChatDataHandler.updateMoment(
                                            target.id,
                                            target
                                        );

                                        // 验证更新是否成功
                                        var updatedMoment =
                                            window.XiaoxinWeChatDataHandler.getMoments().find(
                                                function (m) {
                                                    return m.id === target.id;
                                                }
                                            );
                                        console.info(
                                            "[小馨手机][消息监听] HTML扫描: 更新后验证，momentId:",
                                            target.id,
                                            "更新后点赞数:",
                                            (updatedMoment &&
                                                updatedMoment.likes &&
                                                updatedMoment.likes.length) ||
                                                0,
                                            "更新后评论数:",
                                            (updatedMoment &&
                                                updatedMoment.comments &&
                                                updatedMoment.comments
                                                    .length) ||
                                                0
                                        );

                                        interactionsProcessedCount++;
                                    } else {
                                        console.warn(
                                            "[小馨手机][消息监听] HTML扫描: 互动数据未更新，可能已存在或数据不完整，momentId:",
                                            it.momentId,
                                            "type:",
                                            it.type
                                        );
                                    }
                                });

                                console.info(
                                    "[小馨手机][消息监听] HTML扫描: 处理了",
                                    interactionsProcessedCount,
                                    "条互动数据，总互动数:",
                                    interactions.length
                                );
                            }
                        } catch (e) {
                            console.error(
                                "[小馨手机][消息监听] 解析HTML中的互动数据失败:",
                                e
                            );
                        }
                    }
                    console.info(
                        "[小馨手机][消息监听] 在HTML中找到互动标签数量:",
                        interactionsFoundCount
                    );
                } catch (e) {
                    console.error("[小馨手机][消息监听] 从HTML扫描失败:", e);
                }

                console.info(
                    "[小馨手机][消息监听] ========== 强制扫描完成 =========="
                );
                console.info(
                    "[小馨手机][消息监听] 总共找到朋友圈数量:",
                    totalFound
                );
                console.info("[小馨手机][消息监听] 实际保存数量:", totalSaved);
                console.info(
                    "[小馨手机][消息监听] 当前所有朋友圈数量:",
                    window.XiaoxinWeChatDataHandler.getMoments().length
                );
                console.info(
                    "[小馨手机][消息监听] 处理了互动数据数量:",
                    interactionsProcessedCount
                );

                // 如果处理了互动数据，尝试刷新朋友圈页面
                if (interactionsProcessedCount > 0) {
                    console.info(
                        "[小馨手机][消息监听] 检测到互动数据更新，尝试刷新朋友圈页面"
                    );
                    setTimeout(function () {
                        if (
                            window.XiaoxinWeChatApp &&
                            typeof window.XiaoxinWeChatApp
                                .refreshMomentsPage === "function"
                        ) {
                            window.XiaoxinWeChatApp.refreshMomentsPage();
                        }
                    }, 200);
                }

                // 返回结果，方便调用者知道是否成功
                return {
                    found: totalFound,
                    saved: totalSaved,
                    total: window.XiaoxinWeChatDataHandler.getMoments().length,
                    interactionsProcessed: interactionsProcessedCount,
                };
            };

            // 自动执行强制扫描（延迟执行，确保所有数据都已加载）
            setTimeout(function () {
                if (window.XiaoxinForceScanMoments) {
                    console.info(
                        "[小馨手机][消息监听] 自动执行强制扫描朋友圈数据"
                    );
                    window.XiaoxinForceScanMoments();
                }
            }, 3000);

            setTimeout(function () {
                if (window.XiaoxinForceScanMoments) {
                    console.info(
                        "[小馨手机][消息监听] 第二次自动执行强制扫描朋友圈数据"
                    );
                    window.XiaoxinForceScanMoments();
                }
            }, 8000);
        }
    }

    // 获取当前聊天中的所有联系人ID（用于过滤通讯录显示）
    function getContactsFromCurrentChat() {
        var contactIds = new Set();
        var chatSelectors = [
            "#chat",
            ".chat",
            "#chatContainer",
            ".chat-container",
            "[id*='chat']",
            "[class*='chat']",
        ];

        var chatContainer = null;
        for (var i = 0; i < chatSelectors.length; i++) {
            chatContainer = document.querySelector(chatSelectors[i]);
            if (chatContainer) {
                break;
            }
        }

        if (!chatContainer) {
            return [];
        }

        var $allMessages = $(chatContainer).find(".mes");

        $allMessages.each(function () {
            var $mes = $(this);
            var $swipeCheck = $mes.closest(
                "[class*='swipe'], [class*='draft'], [class*='temp'], [class*='candidate'], [class*='alternative']"
            );
            if ($swipeCheck.length > 0) {
                return;
            }

            if (isMessageInChatHistory($mes[0])) {
                // 优先从酒馆消息数据中获取原始内容（包含标签）
                var content = getRawMessageContentFromData();

                // 如果无法从数据获取，则从DOM获取
                if (!content) {
                    var $messageText = $mes.find(
                        ".mes_text, .mesText, .message-text, [class*='mes_text']"
                    );
                    if ($messageText.length === 0) {
                        $messageText = $mes;
                    }
                    var text = $messageText.text() || "";
                    var html = $messageText.html() || "";
                    content = text + " " + html;
                }

                if (content && content.indexOf("[wx_contact]") !== -1) {
                    var contacts = parseContactTags(content);
                    contacts.forEach(function (contact) {
                        if (contact.id) {
                            contactIds.add(contact.id);
                        }
                    });
                }
            }
        });

        return Array.from(contactIds);
    }

    // 初始化
    function init() {
        console.info("[小馨手机][消息监听] 初始化消息监听器");

        // 等待数据处理器和解析器加载完成
        var checkInterval = setInterval(function () {
            if (window.XiaoxinWeChatDataHandler && window.XiaoxinWeChatParser) {
                clearInterval(checkInterval);
                console.info(
                    "[小馨手机][消息监听] 数据处理器和解析器已加载，开始监听"
                );
                startListening();

                // 监听联系人更新事件，当有联系人被添加为好友时，重新扫描历史消息
                // 这样可以解析之前未处理的互动数据（因为互动数据只能被共同好友看到）
                window.addEventListener(
                    "xiaoxin-contact-updated",
                    function (event) {
                        var detail = event.detail || {};
                        var contact = detail.contact;
                        var status = detail.status;
                        var skipFriendAddedFlow = detail.skipFriendAddedFlow || false;

                        // 如果标记了跳过好友添加流程（pending_verify 状态），不扫描
                        if (skipFriendAddedFlow) {
                            console.info(
                                "[小馨手机][消息监听] 跳过好友添加流程（pending_verify），不重新扫描历史消息"
                            );
                            return;
                        }

                        // 只有当联系人被添加为好友时，才重新扫描
                        if (
                            contact &&
                            (status === "accepted" ||
                                contact.friendStatus === "friend" ||
                                contact.isFriend === true)
                        ) {
                            console.info(
                                "[小馨手机][消息监听] 检测到联系人被添加为好友，重新扫描历史消息以解析互动数据，联系人ID:",
                                contact.id || contact.characterId
                            );
                            // 延迟一下，确保联系人数据已经更新完成
                            setTimeout(function () {
                                scanRetainedMessages();
                            }, 500);
                        }
                    }
                );
            } else {
                if (!window.XiaoxinWeChatDataHandler) {
                    console.info("[小馨手机][消息监听] 等待数据处理器加载...");
                }
                if (!window.XiaoxinWeChatParser) {
                    console.info("[小馨手机][消息监听] 等待解析器加载...");
                }
            }
        }, 100);

        // 10秒后停止检查
        setTimeout(function () {
            clearInterval(checkInterval);
            if (!window.XiaoxinWeChatDataHandler) {
                console.warn(
                    "[小馨手机][消息监听] 数据处理器未在10秒内加载完成"
                );
            }
            if (!window.XiaoxinWeChatParser) {
                console.warn("[小馨手机][消息监听] 解析器未在10秒内加载完成");
            }
        }, 10000);
    }

    // 暴露一个手动触发玩家历史朋友圈生成的入口，便于其他模块/页面兜底调用
    function forceGeneratePlayerHistoryMoments() {
        _tryAutoGeneratePlayerHistoryMoments();
    }

    // 兼容全局调用
    window.XiaoxinForceGeneratePlayerHistoryMoments =
        forceGeneratePlayerHistoryMoments;

    // ========== 批量添加历史聊天记录 ==========
    // 用于一次性添加多条历史消息，这些消息不会进入消息队列，会直接显示
    function addHistoricalChatMessages(contactId, messages) {
        if (!window.XiaoxinWeChatDataHandler ||
            typeof window.XiaoxinWeChatDataHandler.addChatMessage !== "function") {
            console.warn("[小馨手机][消息监听] addChatMessage 方法不存在，无法添加历史消息");
            return;
        }

        if (!Array.isArray(messages) || messages.length === 0) {
            console.warn("[小馨手机][消息监听] 历史消息列表为空或不是数组");
            return;
        }

        console.info(
            "[小馨手机][消息监听] 开始批量添加历史聊天记录:",
            contactId,
            "消息数量:",
            messages.length
        );

        // 批量添加所有历史消息到聊天记录
        messages.forEach(function(message, index) {
            // 标记为历史消息
            message.isHistorical = true;

            // 确保消息有时间戳
            if (!message.timestamp && message.rawTime) {
                // 解析时间戳
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
                }
            }

            // 如果没有时间戳，使用一个过去的时间（根据索引递减）
            if (!message.timestamp) {
                // 从当前时间往前推，每条消息间隔1分钟
                var baseTime = Date.now() - (messages.length - index) * 60000;
                message.timestamp = baseTime;
                console.warn(
                    "[小馨手机][消息监听] 历史消息缺少时间戳，使用默认时间:",
                    message.id,
                    "时间:",
                    new Date(message.timestamp).toLocaleString()
                );
            }

            // 添加消息到聊天记录
            try {
                window.XiaoxinWeChatDataHandler.addChatMessage(contactId, message);
            } catch (e) {
                console.error(
                    "[小馨手机][消息监听] 添加历史消息失败:",
                    contactId,
                    "消息ID:",
                    message.id,
                    "错误:",
                    e
                );
            }
        });

        // 延迟刷新聊天页面，确保所有消息都已添加
        setTimeout(function() {
            if (window.XiaoxinWeChatChatUI &&
                typeof window.XiaoxinWeChatChatUI.refreshChatScreen === "function") {
                window.XiaoxinWeChatChatUI.refreshChatScreen(contactId);
                console.info(
                    "[小馨手机][消息监听] 已刷新聊天页面以显示历史消息:",
                    contactId
                );
            } else {
                console.warn(
                    "[小馨手机][消息监听] refreshChatScreen 方法不存在，无法刷新聊天页面"
                );
            }
        }, 300);

        console.info(
            "[小馨手机][消息监听] 批量添加历史聊天记录完成:",
            contactId,
            "消息数量:",
            messages.length
        );
    }

    return {
        init: init,
        parseContactTags: parseContactTags,
        parseMomentsFromText: parseMomentsFromText,
        getContactsFromCurrentChat: getContactsFromCurrentChat,
        scanRetainedMessages: scanRetainedMessages,
        isMessageInChatHistory: isMessageInChatHistory,
        forceGeneratePlayerHistoryMoments: forceGeneratePlayerHistoryMoments,
        addHistoricalChatMessages: addHistoricalChatMessages,
    };
})();

// 自动初始化
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
        if (window.XiaoxinMessageListener) {
            window.XiaoxinMessageListener.init();
        }
    });
} else {
    if (window.XiaoxinMessageListener) {
        window.XiaoxinMessageListener.init();
    }
}
