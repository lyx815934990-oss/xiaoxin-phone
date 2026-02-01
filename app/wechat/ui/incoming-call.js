// 来电弹窗组件
window.XiaoxinIncomingCall = (function () {
    var $incomingCallDialog = null;
    var $incomingCallFullScreen = null;
    var $floatingCallIcon = null;
    var $activeCallScreen = null; // 通话中的界面
    var currentCall = null;
    var timeoutTimer = null;
    var dotsAnimationTimer = null;
    var fullScreenDotsAnimationTimer = null;
    var timeoutHandled = false; // 标记是否已经处理过超时
    var callDurationTimer = null; // 通话时长计时器
    var callStartTime = null; // 通话开始时间（现实时间，毫秒）
    var callStartWorldTime = null; // 通话接通时的世界观时间（毫秒）
    var callStartWorldRawTime = null; // 通话接通时的世界观时间（字符串格式）
    var isMicrophoneMuted = false; // 麦克风是否静音
    var waitingTypingTimer = null; // 等待对方接听时的打字机计时器

    // ====== 获取“最新世界观时间”（用于玩家操作生成的指令 time=） ======
    // 背景：世界观时间可能通过正文中的 [time]...[/time] 更新，但玩家可能在消息监听器尚未处理完时立即点击“拒接/接听”，
    // 这会导致 XiaoxinWorldClock 仍是旧时间，从而玩家最新指令显示到更早的时间段里。
    // 策略：优先取 XiaoxinWorldClock，但同时从当前酒馆 DOM 中抽取最新 [time] 标签，取两者中“更晚”的那个。
    function _parseWorldTimeStringToTs(timeStr) {
        if (!timeStr) return null;
        try {
            var normalized = String(timeStr)
                .replace(/-/g, "/")
                .replace(/年/g, "/")
                .replace(/月/g, "/")
                .replace(/日/g, " ")
                .replace(/星期[一二三四五六日]/g, "")
                .trim()
                .replace(/\s+/g, " ");
            var ts = Date.parse(normalized);
            return isNaN(ts) ? null : ts;
        } catch (e) {
            return null;
        }
    }

    function _getLatestWorldTimeFromDom() {
        try {
            // 从酒馆聊天楼层中找最近出现的 [time]...[/time]
            // 注意：message-listener 会尝试隐藏 time 标签，但在某些场景下仍会残留在 DOM/文本中。
            var $messages = $(".mes .mes_text, .mes .mesText, .mes .message-text");
            if (!$messages.length) return null;
            for (var i = $messages.length - 1; i >= 0; i--) {
                var text = $($messages[i]).text() || $($messages[i]).html() || "";
                if (!text) continue;
                var m = /\[time\]([\s\S]*?)\[\/time\]/i.exec(text);
                if (m && m[1]) {
                    var raw = String(m[1]).trim();
                    var ts = _parseWorldTimeStringToTs(raw);
                    if (ts) return { rawTime: raw, timestamp: ts };
                }
            }
        } catch (e) {}
        return null;
    }

    function _formatTsToRawTime(ts) {
        var d = new Date(ts || Date.now());
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, "0");
        var day = String(d.getDate()).padStart(2, "0");
        var hh = String(d.getHours()).padStart(2, "0");
        var mm = String(d.getMinutes()).padStart(2, "0");
        var ss = String(d.getSeconds()).padStart(2, "0");
        return y + "-" + m + "-" + day + " " + hh + ":" + mm + ":" + ss;
    }

    function getBestWorldRawTime() {
        var clockTs =
            window.XiaoxinWorldClock &&
            (window.XiaoxinWorldClock.currentTimestamp ||
                window.XiaoxinWorldClock.timestamp)
                ? window.XiaoxinWorldClock.currentTimestamp ||
                  window.XiaoxinWorldClock.timestamp
                : null;
        var clockRaw =
            window.XiaoxinWorldClock &&
            (window.XiaoxinWorldClock.rawTime || window.XiaoxinWorldClock.raw)
                ? window.XiaoxinWorldClock.rawTime || window.XiaoxinWorldClock.raw
                : "";

        var domInfo = _getLatestWorldTimeFromDom();
        var domTs = domInfo ? domInfo.timestamp : null;
        var domRaw = domInfo ? domInfo.rawTime : "";

        // 取更晚的时间
        if (domTs && (!clockTs || domTs > clockTs)) {
            return domRaw || _formatTsToRawTime(domTs);
        }
        if (clockRaw && clockRaw.trim()) return clockRaw;
        if (clockTs) return _formatTsToRawTime(clockTs);
        if (domTs) return domRaw || _formatTsToRawTime(domTs);
        return _formatTsToRawTime(Date.now());
    }
    var hangupCommandGenerated = false; // 标记是否已生成挂断指令，防止重复生成
    var rejectedMessageGenerated = false; // 标记是否已生成拒绝/未响应消息，防止重复生成
    var rejectedMessageTimer = null; // 待执行的拒绝/未响应消息生成定时器

    // 显示来电弹窗
    function showIncomingCall(contact) {
        if (!contact) {
            console.warn("[小馨手机][来电弹窗] 联系人信息为空");
            return;
        }

        // 如果已有来电弹窗且是同一个联系人，不重复显示
        if ($incomingCallDialog && currentCall && currentCall.contact) {
            var currentContactId =
                currentCall.contact.characterId || currentCall.contact.id || "";
            var newContactId = contact.characterId || contact.id || "";
            if (currentContactId === newContactId) {
                console.info(
                    "[小馨手机][来电弹窗] 同一联系人的来电弹窗已存在，不重复显示"
                );
                return;
            }
            // 如果是不同联系人，先关闭旧的
            closeIncomingCall();
        }

        console.info("[小馨手机][来电弹窗] 显示来电弹窗，联系人:", contact);

        // 初始化：不需要清空sessionStorage，因为我们要依赖它来防止重复输入
        // 输入前会检查输入框内容，确保不会重复输入相同消息ID的指令

        // 保存当前来电信息
        currentCall = {
            contact: contact,
            startTime: Date.now(),
            callType: "call_voice", // 默认为语音通话，可以根据实际情况修改
            messageId: contact._incomingCallMessageId || null, // 从contact对象获取消息ID
            accumulatedTextDuration: 0, // 累计文本时长（用于根据文本内容计算通话时长）
        };

        // 获取联系人信息
        // 显示名称优先使用备注，这是正确的UI行为
        var contactName =
            contact.remark || contact.nickname || contact.name || "未知";
        var contactAvatar =
            contact.avatar ||
            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";

        // 重要：验证联系人ID字段，确保通话匹配使用的是ID而非显示名称
        var contactIdForDebug =
            contact.characterId || contact.id || contact.wechatId;
        console.info(
            "[小馨手机][来电弹窗] 显示来电弹窗，联系人ID:",
            contactIdForDebug,
            "显示名称:",
            contactName,
            "联系人详情:",
            {
                id: contact.id,
                characterId: contact.characterId,
                wechatId: contact.wechatId,
                remark: contact.remark,
                nickname: contact.nickname,
                name: contact.name,
            }
        );

        // 创建弹窗HTML
        $incomingCallDialog = $(
            '<div class="xiaoxin-incoming-call-dialog">' +
                '<div class="xiaoxin-incoming-call-content">' +
                '<div class="xiaoxin-incoming-call-avatar"></div>' +
                '<div class="xiaoxin-incoming-call-info">' +
                '<div class="xiaoxin-incoming-call-name">' +
                escapeHtml(contactName) +
                "</div>" +
                '<div class="xiaoxin-incoming-call-text">' +
                '<span class="xiaoxin-incoming-call-text-main">邀请你语音通话</span>' +
                '<span class="xiaoxin-incoming-call-text-dots"></span>' +
                "</div>" +
                "</div>" +
                '<div class="xiaoxin-incoming-call-actions">' +
                '<button class="xiaoxin-incoming-call-ignore-btn" title="忽略">忽略</button>' +
                '<button class="xiaoxin-incoming-call-reject" title="拒接">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="xiaoxin-call-reject-icon">' +
                '<path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="white"/>' +
                "</svg>" +
                "</button>" +
                '<button class="xiaoxin-incoming-call-accept" title="接听">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="white"/>' +
                "</svg>" +
                "</button>" +
                "</div>" +
                "</div>" +
                "</div>"
        );

        // 设置头像背景图（和聊天页面一样的方式）
        $incomingCallDialog
            .find(".xiaoxin-incoming-call-avatar")
            .css("background-image", "url(" + contactAvatar + ")");

        // 添加到页面（添加到手机屏幕容器中，确保相对于手机容器定位）
        var $phoneScreen = $(".xiaoxin-phone-screen");
        if ($phoneScreen.length === 0) {
            // 如果找不到手机屏幕，尝试找手机容器
            $phoneScreen = $(".xiaoxin-phone-container");
            if ($phoneScreen.length === 0) {
                // 如果都找不到，尝试找 .mobile-phone-container
                $phoneScreen = $(".mobile-phone-container");
                if ($phoneScreen.length === 0) {
                    // 如果都找不到，添加到 body（降级方案）
                    $phoneScreen = $("body");
                    // 如果添加到 body，需要改回 fixed 定位
                    $incomingCallDialog.css("position", "fixed");
                }
            }
        }
        $phoneScreen.append($incomingCallDialog);

        // 启动打字机效果（循环显示...）
        startDotsAnimation();

        // 绑定忽略按钮事件
        $incomingCallDialog
            .find(".xiaoxin-incoming-call-ignore-btn")
            .on("click", function (e) {
                e.stopPropagation();
                console.info("[小馨手机][来电弹窗] 用户点击忽略");
                // 只隐藏弹窗，但不清除超时定时器，让30秒超时处理继续执行
                hideIncomingCall();
                // 显示悬浮图标
                showFloatingCallIcon(contact);
            });

        // 绑定拒接按钮事件
        $incomingCallDialog
            .find(".xiaoxin-incoming-call-reject")
            .on("click", function (e) {
                e.stopPropagation();
                console.info("[小馨手机][来电弹窗] 用户点击拒接");
                // 生成拒接指令并插入到输入框
                handleCallReject(contact);
                // 关闭来电弹窗
                closeIncomingCall();
            });

        // 绑定接听按钮事件
        $incomingCallDialog
            .find(".xiaoxin-incoming-call-accept")
            .on("click", function (e) {
                e.stopPropagation();
                console.info("[小馨手机][来电弹窗] 用户点击接听");
                // 输入接听指令到酒馆正文
                var callId = handleCallAccept(contact);
                // 显示通话中界面，传递 callId
                if (callId) {
                    showActiveCallScreen(contact, {
                        callId: callId,
                        direction: "incoming",
                    });
                } else {
                    showActiveCallScreen(contact);
                }
                closeIncomingCall();
            });

        // 重置超时处理标记
        timeoutHandled = false;

        // 30秒超时处理
        // 注意：即使弹窗被隐藏（hideIncomingCall），定时器仍然继续运行
        timeoutTimer = setTimeout(function () {
            // 防止重复处理
            if (timeoutHandled) {
                console.warn(
                    "[小馨手机][来电弹窗] 30秒超时处理已被执行过，跳过"
                );
                return;
            }
            timeoutHandled = true;

            console.info(
                "[小馨手机][来电弹窗] 30秒超时，自动输入未响应来电数据并生成未接来电消息"
            );
            // 先输入未响应数据到酒馆输入框
            handleCallTimeout();
            // 然后自动生成未接来电消息并添加到聊天记录
            generateMissedCallMessage(contact);
            // 然后关闭全屏页面（如果存在）
            if ($incomingCallFullScreen) {
                closeFullScreenCall();
            }
            // 最后关闭弹窗（这会清除定时器）
            closeIncomingCall();
        }, 30000);

        console.info(
            "[小馨手机][来电弹窗] 已启动30秒超时计时器，将在30秒后输入未响应数据"
        );

        // 显示弹窗动画
        setTimeout(function () {
            $incomingCallDialog.addClass("show");
        }, 10);

        // 点击弹窗内容区域，进入全屏来电页面
        $incomingCallDialog
            .find(".xiaoxin-incoming-call-content")
            .on("click", function (e) {
                // 如果点击的是按钮，不触发全屏
                if ($(e.target).closest("button").length > 0) {
                    return;
                }
                e.stopPropagation();
                console.info(
                    "[小馨手机][来电弹窗] 用户点击弹窗，进入全屏来电页面"
                );
                showFullScreenCall(contact);
            });
    }

    // 显示全屏来电页面
    function showFullScreenCall(contact) {
        // 隐藏灵动岛通话状态（当全屏来电页面显示时，恢复默认状态）
        if (
            window.XiaoxinDynamicIslandCall &&
            typeof window.XiaoxinDynamicIslandCall.hideCallState === "function"
        ) {
            window.XiaoxinDynamicIslandCall.hideCallState();
            console.info(
                "[小馨手机][全屏来电] 全屏来电页面显示，已隐藏灵动岛通话状态"
            );
        }

        // 先隐藏弹窗
        if ($incomingCallDialog) {
            hideIncomingCall();
        }

        if (!contact) {
            console.warn("[小馨手机][全屏来电] 联系人信息为空");
            return;
        }

        // 获取消息ID
        var messageId = contact._incomingCallMessageId || null;

        // 如果已有全屏页面，检查是否是同一个消息ID
        if (
            $incomingCallFullScreen &&
            $incomingCallFullScreen.hasClass("show")
        ) {
            // 检查是否是同一个消息ID（避免重复显示）
            if (currentCall && currentCall.messageId === messageId) {
                console.info(
                    "[小馨手机][全屏来电] 全屏页面已显示且是同一个消息ID，跳过重复显示，消息ID:",
                    messageId
                );
                return; // 不重复显示
            }
            // 如果是不同的消息ID，先关闭旧的全屏页面
            closeFullScreenCall();
        }

        // 如果 currentCall 还没有初始化，先初始化它（可能直接调用 showFullScreenCall 的情况）
        if (!currentCall || !currentCall.contact) {
            currentCall = {
                contact: contact,
                startTime: Date.now(),
                callType: "call_voice", // 默认为语音通话，可以根据实际情况修改
                messageId: messageId, // 从contact对象获取消息ID
                accumulatedTextDuration: 0, // 累计文本时长（用于根据文本内容计算通话时长）
            };
        } else {
            // 如果已存在，更新消息ID（确保消息ID正确）
            currentCall.messageId = messageId;
        }

        console.info("[小馨手机][全屏来电] 显示全屏来电页面，联系人:", contact);

        // 获取联系人信息
        // 显示名称优先使用备注，这是正确的UI行为
        var contactName =
            contact.remark || contact.nickname || contact.name || "未知";
        var contactAvatar =
            contact.avatar ||
            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";

        // 重要：验证联系人ID字段
        var contactIdForDebug =
            contact.characterId || contact.id || contact.wechatId;
        console.info(
            "[小馨手机][全屏来电] 联系人ID:",
            contactIdForDebug,
            "显示名称:",
            contactName
        );

        // 创建全屏来电页面HTML
        $incomingCallFullScreen = $(
            '<div class="xiaoxin-incoming-call-fullscreen">' +
                '<div class="xiaoxin-incoming-call-fullscreen-background"></div>' +
                '<div class="xiaoxin-incoming-call-fullscreen-content">' +
                '<button class="xiaoxin-incoming-call-fullscreen-ignore-btn" title="忽略">' +
                '<span class="xiaoxin-incoming-call-fullscreen-ignore-text">忽略</span>' +
                "</button>" +
                '<div class="xiaoxin-incoming-call-fullscreen-avatar"></div>' +
                '<div class="xiaoxin-incoming-call-fullscreen-name">' +
                escapeHtml(contactName) +
                "</div>" +
                '<div class="xiaoxin-incoming-call-fullscreen-text">' +
                '<span class="xiaoxin-incoming-call-fullscreen-text-main">邀请你语音通话</span>' +
                '<span class="xiaoxin-incoming-call-fullscreen-text-dots"></span>' +
                "</div>" +
                '<div class="xiaoxin-incoming-call-fullscreen-actions">' +
                '<button class="xiaoxin-incoming-call-fullscreen-reject" title="拒接">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="xiaoxin-call-fullscreen-reject-icon">' +
                '<path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="white"/>' +
                "</svg>" +
                "</button>" +
                '<button class="xiaoxin-incoming-call-fullscreen-accept" title="接听">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="white"/>' +
                "</svg>" +
                "</button>" +
                "</div>" +
                "</div>" +
                "</div>"
        );

        // 设置背景头像（模糊效果）
        $incomingCallFullScreen
            .find(".xiaoxin-incoming-call-fullscreen-background")
            .css("background-image", "url(" + contactAvatar + ")");

        // 设置头像
        $incomingCallFullScreen
            .find(".xiaoxin-incoming-call-fullscreen-avatar")
            .css("background-image", "url(" + contactAvatar + ")");

        // 添加到页面（添加到手机屏幕容器中）
        var $phoneScreen = $(".xiaoxin-phone-screen");
        if ($phoneScreen.length === 0) {
            $phoneScreen = $(".xiaoxin-phone-container");
            if ($phoneScreen.length === 0) {
                $phoneScreen = $(".mobile-phone-container");
                if ($phoneScreen.length === 0) {
                    $phoneScreen = $("body");
                    $incomingCallFullScreen.css("position", "fixed");
                }
            }
        }
        $phoneScreen.append($incomingCallFullScreen);

        // 启动打字机效果（循环显示...）
        startFullScreenDotsAnimation();

        // 绑定忽略按钮事件
        $incomingCallFullScreen
            .find(".xiaoxin-incoming-call-fullscreen-ignore-btn")
            .on("click", function (e) {
                e.stopPropagation();
                console.info("[小馨手机][全屏来电] 用户点击忽略");
                // 只隐藏全屏页面，但不清除超时定时器
                hideFullScreenCall();
                // 显示悬浮图标
                showFloatingCallIcon(contact);
            });

        // 绑定拒接按钮事件
        $incomingCallFullScreen
            .find(".xiaoxin-incoming-call-fullscreen-reject")
            .on("click", function (e) {
                e.stopPropagation();
                console.info("[小馨手机][全屏来电] 用户点击拒接");
                // 生成拒接指令并插入到输入框
                handleCallReject(contact);
                // 关闭全屏来电和来电弹窗
                closeFullScreenCall();
                closeIncomingCall();
            });

        // 绑定接听按钮事件
        $incomingCallFullScreen
            .find(".xiaoxin-incoming-call-fullscreen-accept")
            .on("click", function (e) {
                e.stopPropagation();
                console.info("[小馨手机][全屏来电] 用户点击接听");
                // 输入接听指令到酒馆正文
                handleCallAccept(contact);
                // 显示通话中界面
                showActiveCallScreen(contact);
                closeFullScreenCall();
                closeIncomingCall();
            });

        // 显示全屏页面动画
        setTimeout(function () {
            $incomingCallFullScreen.addClass("show");
        }, 10);
    }

    // 隐藏全屏来电页面（只隐藏，不清除超时定时器）
    function hideFullScreenCall() {
        if (fullScreenDotsAnimationTimer) {
            clearInterval(fullScreenDotsAnimationTimer);
            fullScreenDotsAnimationTimer = null;
        }

        if ($incomingCallFullScreen) {
            $incomingCallFullScreen.removeClass("show");
            setTimeout(function () {
                if ($incomingCallFullScreen) {
                    $incomingCallFullScreen.remove();
                    $incomingCallFullScreen = null;
                }
            }, 300);
        }
    }

    // 关闭全屏来电页面（完全关闭，清除所有定时器）
    function closeFullScreenCall() {
        if (fullScreenDotsAnimationTimer) {
            clearInterval(fullScreenDotsAnimationTimer);
            fullScreenDotsAnimationTimer = null;
        }

        if ($incomingCallFullScreen) {
            $incomingCallFullScreen.removeClass("show");
            setTimeout(function () {
                if ($incomingCallFullScreen) {
                    $incomingCallFullScreen.remove();
                    $incomingCallFullScreen = null;
                }
            }, 300);
        }
    }

    // 启动全屏页面打字机效果（循环显示...）
    function startFullScreenDotsAnimation() {
        if (fullScreenDotsAnimationTimer) {
            clearInterval(fullScreenDotsAnimationTimer);
        }

        var $dots = $incomingCallFullScreen.find(
            ".xiaoxin-incoming-call-fullscreen-text-dots"
        );
        if (!$dots.length) {
            return;
        }

        var dotsCount = 0;
        var maxDots = 3;

        fullScreenDotsAnimationTimer = setInterval(function () {
            if (!$incomingCallFullScreen || !$incomingCallFullScreen.length) {
                clearInterval(fullScreenDotsAnimationTimer);
                return;
            }
            dotsCount = (dotsCount + 1) % (maxDots + 1);
            var dotsText = ".".repeat(dotsCount);
            $dots.text(dotsText);
        }, 500); // 每500ms更新一次
    }

    // 显示悬浮来电图标
    function showFloatingCallIcon(contact, isActiveCall, isWaitingMode) {
        // 如果已有悬浮图标，先移除
        if ($floatingCallIcon) {
            removeFloatingCallIcon();
        }

        if (!contact) {
            console.warn("[小馨手机][悬浮图标] 联系人信息为空");
            return;
        }

        // 判断是否在通话中
        var isCalling = isActiveCall || $activeCallScreen !== null;
        // 判断是否是等待接听状态
        var isWaiting =
            isWaitingMode === true ||
            (currentCall && currentCall.direction === "outgoing");

        console.info(
            "[小馨手机][悬浮图标] 显示悬浮图标，联系人:",
            contact,
            "通话中:",
            isCalling,
            "等待接听:",
            isWaiting
        );

        // 根据通话状态选择不同的图标和标题
        var title = isCalling
            ? isWaiting
                ? "点击进入等待接听页面"
                : "点击进入通话页面"
            : "点击进入来电页面";

        // 创建悬浮图标HTML
        if (isCalling) {
            if (isWaiting) {
                // 等待接听：使用绿色填充电话图标（白色背景，圆角矩形）+ 绿色"等待接听"文字（在图标内部）
                $floatingCallIcon = $(
                    '<div class="xiaoxin-floating-call-icon xiaoxin-floating-call-icon-active xiaoxin-floating-call-icon-waiting" title="' +
                        title +
                        '">' +
                        '<div class="xiaoxin-floating-call-icon-container">' +
                        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="xiaoxin-floating-call-phone-icon">' +
                        '<path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="#07c160"/>' +
                        "</svg>" +
                        '<div class="xiaoxin-floating-call-waiting-text">等待接听</div>' +
                        "</div>" +
                        "</div>"
                );
            } else {
                // 通话中：使用绿色填充电话图标（白色背景，圆角矩形）+ 通话计时器（在图标内部）
                $floatingCallIcon = $(
                    '<div class="xiaoxin-floating-call-icon xiaoxin-floating-call-icon-active" title="' +
                        title +
                        '">' +
                        '<div class="xiaoxin-floating-call-icon-container">' +
                        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="xiaoxin-floating-call-phone-icon">' +
                        '<path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="#07c160"/>' +
                        "</svg>" +
                        '<div class="xiaoxin-floating-call-duration">00:00</div>' +
                        "</div>" +
                        "</div>"
                );
            }
        } else {
            // 来电等待：使用原有图标
            var iconUrl =
                "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微信来电等待接听图标.png";
            $floatingCallIcon = $(
                '<div class="xiaoxin-floating-call-icon" title="' +
                    title +
                    '">' +
                    '<img src="' +
                    iconUrl +
                    '" alt="来电等待" />' +
                    "</div>"
            );
        }

        // 保存通话状态，用于点击事件判断
        $floatingCallIcon.data("isActiveCall", isCalling);
        $floatingCallIcon.data("isWaiting", isWaiting);

        // 如果是通话中状态且不是等待接听，立即更新计时器显示
        if (isCalling && !isWaiting && callStartTime) {
            var elapsed = Math.floor((Date.now() - callStartTime) / 1000);
            var minutes = Math.floor(elapsed / 60);
            var seconds = elapsed % 60;
            var timeStr =
                String(minutes).padStart(2, "0") +
                ":" +
                String(seconds).padStart(2, "0");
            $floatingCallIcon
                .find(".xiaoxin-floating-call-duration")
                .text(timeStr);
        }

        // 添加到页面（添加到手机屏幕容器中）
        var $phoneScreen = $(".xiaoxin-phone-screen");
        if ($phoneScreen.length === 0) {
            $phoneScreen = $(".xiaoxin-phone-container");
            if ($phoneScreen.length === 0) {
                $phoneScreen = $(".mobile-phone-container");
                if ($phoneScreen.length === 0) {
                    $phoneScreen = $("body");
                    $floatingCallIcon.css("position", "fixed");
                }
            }
        }
        $phoneScreen.append($floatingCallIcon);

        // 使用jQuery UI实现拖动功能
        var interactionState = {
            hasDragged: false,
            dragStartTime: 0,
            dragStartPosition: null,
            isDragging: false,
            clickHandled: false,
        };

        if ($.fn.draggable) {
            // 先绑定mousedown，记录初始状态
            $floatingCallIcon.on("mousedown", function (e) {
                interactionState.hasDragged = false;
                interactionState.isDragging = false;
                interactionState.clickHandled = false;
                interactionState.dragStartTime = Date.now();
                var $icon = $(this);
                interactionState.dragStartPosition = {
                    left: $icon.position().left,
                    top: $icon.position().top,
                };
            });

            // 绑定click事件，优先处理点击
            $floatingCallIcon.on("click", function (e) {
                // 如果已经拖动过，不处理点击
                if (
                    interactionState.hasDragged ||
                    interactionState.isDragging
                ) {
                    return;
                }
                // 如果点击事件在合理时间内完成，认为是点击
                var clickDuration = Date.now() - interactionState.dragStartTime;
                if (clickDuration < 500 && !interactionState.clickHandled) {
                    interactionState.clickHandled = true;
                    e.stopPropagation();
                    e.preventDefault();
                    console.info("[小馨手机][悬浮图标] 用户点击悬浮图标");
                    // 根据悬浮图标的状态判断：如果是在通话中，显示通话中界面；否则显示全屏来电页面
                    var isActiveCall =
                        $floatingCallIcon.data("isActiveCall") ||
                        $activeCallScreen !== null;
                    var isWaiting =
                        $floatingCallIcon.data("isWaiting") ||
                        (currentCall && currentCall.direction === "outgoing");
                    if (isActiveCall) {
                        // 如果是等待接听状态，传递 waitingMode 选项
                        showActiveCallScreen(contact, {
                            waitingMode: isWaiting,
                            callId:
                                currentCall && currentCall.callId
                                    ? currentCall.callId
                                    : null,
                            direction:
                                currentCall && currentCall.direction
                                    ? currentCall.direction
                                    : "incoming",
                        });
                    } else {
                        showFullScreenCall(contact);
                    }
                }
            });

            $floatingCallIcon.draggable({
                containment:
                    $phoneScreen.length > 0 ? $phoneScreen[0] : "parent",
                scroll: false,
                cursor: "pointer", // 默认光标为pointer
                distance: 8, // 拖动距离阈值，超过8px才认为是拖动
                delay: 200, // 延迟200ms后才开始拖动
                start: function (event, ui) {
                    interactionState.isDragging = true;
                    // 如果已经处理了点击，不再处理拖动
                    if (interactionState.clickHandled) {
                        return false; // 阻止拖动
                    }
                },
                drag: function (event, ui) {
                    // 检查拖动距离
                    var distance = Math.sqrt(
                        Math.pow(
                            ui.position.left -
                                interactionState.dragStartPosition.left,
                            2
                        ) +
                            Math.pow(
                                ui.position.top -
                                    interactionState.dragStartPosition.top,
                                2
                            )
                    );
                    // 如果拖动距离超过8px，认为是拖动
                    if (distance > 8) {
                        interactionState.hasDragged = true;
                        // 只有在真正拖动时才添加dragging类
                        if (!$(this).hasClass("dragging")) {
                            $(this).addClass("dragging");
                        }
                    }
                },
                stop: function () {
                    var $icon = $(this);
                    $icon.removeClass("dragging");
                    interactionState.isDragging = false;

                    // 只有在明确没有拖动的情况下，且点击事件未处理，才触发点击
                    if (
                        !interactionState.hasDragged &&
                        !interactionState.clickHandled
                    ) {
                        setTimeout(function () {
                            if (!interactionState.clickHandled) {
                                interactionState.clickHandled = true;
                                console.info(
                                    "[小馨手机][悬浮图标] 用户点击悬浮图标，进入全屏来电页面"
                                );
                                showFullScreenCall(contact);
                            }
                        }, 150);
                    }
                },
            });
        } else {
            console.warn(
                "[小馨手机][悬浮图标] jQuery UI draggable 不可用，使用原生拖动"
            );
            // 降级方案：使用原生拖动
            makeDraggable($floatingCallIcon, $phoneScreen, contact);
        }

        // 显示动画
        setTimeout(function () {
            $floatingCallIcon.addClass("show");
        }, 10);
    }

    // 原生拖动实现（降级方案）
    function makeDraggable($element, $container, contact) {
        var isDragging = false;
        var startX, startY, initialX, initialY;
        var hasMoved = false;
        var dragStartTime = 0;
        var dragTimer = null;

        $element.on("mousedown", function (e) {
            isDragging = false;
            hasMoved = false;
            dragStartTime = Date.now();
            startX = e.clientX;
            startY = e.clientY;

            // 延迟200ms后才开始拖动判定
            dragTimer = setTimeout(function () {
                $element.addClass("dragging");
            }, 200);

            var offset = $element.offset();
            var containerOffset =
                $container.length > 0
                    ? $container.offset()
                    : { top: 0, left: 0 };
            initialX = offset.left - containerOffset.left;
            initialY = offset.top - containerOffset.top;

            $(document).on("mousemove.floatingIcon", function (e) {
                var deltaX = e.clientX - startX;
                var deltaY = e.clientY - startY;
                var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                // 如果移动距离超过10px，认为是拖动
                if (distance > 10) {
                    hasMoved = true;
                    isDragging = true;
                    // 清除延迟定时器
                    if (dragTimer) {
                        clearTimeout(dragTimer);
                        dragTimer = null;
                    }
                    $element.addClass("dragging");
                }

                if (isDragging) {
                    var newX = initialX + deltaX;
                    var newY = initialY + deltaY;

                    // 限制在容器内
                    var containerWidth =
                        $container.length > 0
                            ? $container.width()
                            : window.innerWidth;
                    var containerHeight =
                        $container.length > 0
                            ? $container.height()
                            : window.innerHeight;
                    var elementWidth = $element.outerWidth();
                    var elementHeight = $element.outerHeight();

                    newX = Math.max(
                        0,
                        Math.min(newX, containerWidth - elementWidth)
                    );
                    newY = Math.max(
                        0,
                        Math.min(newY, containerHeight - elementHeight)
                    );

                    $element.css({
                        left: newX + "px",
                        top: newY + "px",
                    });
                }
            });

            $(document).on("mouseup.floatingIcon", function () {
                // 清除延迟定时器
                if (dragTimer) {
                    clearTimeout(dragTimer);
                    dragTimer = null;
                }
                $(document).off("mousemove.floatingIcon mouseup.floatingIcon");
                var dragDuration = Date.now() - dragStartTime;
                setTimeout(function () {
                    $element.removeClass("dragging");
                    // 如果没有移动或拖动时间很短，认为是点击
                    if ((!hasMoved || dragDuration < 300) && contact) {
                        console.info(
                            "[小馨手机][悬浮图标] 用户点击悬浮图标，进入全屏来电页面"
                        );
                        showFullScreenCall(contact);
                    }
                }, 100);
            });

            e.preventDefault();
        });
    }

    // 移除悬浮图标
    function removeFloatingCallIcon() {
        if ($floatingCallIcon) {
            // 如果使用了jQuery UI draggable，先销毁
            if ($.fn.draggable && $floatingCallIcon.data("ui-draggable")) {
                $floatingCallIcon.draggable("destroy");
            }
            $floatingCallIcon.remove();
            $floatingCallIcon = null;
        }
    }

    // 隐藏来电弹窗（只隐藏，不清除超时定时器）
    function hideIncomingCall() {
        if (dotsAnimationTimer) {
            clearInterval(dotsAnimationTimer);
            dotsAnimationTimer = null;
        }

        if ($incomingCallDialog) {
            $incomingCallDialog.removeClass("show");
            setTimeout(function () {
                if ($incomingCallDialog) {
                    $incomingCallDialog.remove();
                    $incomingCallDialog = null;
                }
                // 注意：不设置 currentCall = null，保持定时器继续运行
            }, 300);
        }
    }

    // 关闭来电弹窗（完全关闭，清除所有定时器）
    function closeIncomingCall() {
        if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            timeoutTimer = null;
        }
        if (dotsAnimationTimer) {
            clearInterval(dotsAnimationTimer);
            dotsAnimationTimer = null;
        }

        // 重置超时处理标记
        timeoutHandled = false;

        if ($incomingCallDialog) {
            $incomingCallDialog.removeClass("show");
            setTimeout(function () {
                if ($incomingCallDialog) {
                    $incomingCallDialog.remove();
                    $incomingCallDialog = null;
                }
                currentCall = null;
            }, 300);
        }

        // 移除悬浮图标
        removeFloatingCallIcon();
    }

    // 启动打字机效果（循环显示...）
    function startDotsAnimation() {
        if (dotsAnimationTimer) {
            clearInterval(dotsAnimationTimer);
        }

        var $dots = $incomingCallDialog.find(
            ".xiaoxin-incoming-call-text-dots"
        );
        var dotsCount = 0;
        var maxDots = 3;

        dotsAnimationTimer = setInterval(function () {
            dotsCount = (dotsCount + 1) % (maxDots + 1);
            var dotsText = ".".repeat(dotsCount);
            $dots.text(dotsText);
        }, 500); // 每500ms更新一次
    }

    // 处理接听来电
    // 处理拒接通话（角色主动来电时，玩家点击拒接按钮）
    function handleCallReject(contact) {
        if (!contact) {
            console.warn(
                "[小馨手机][来电弹窗] 联系人信息为空，无法生成拒接指令"
            );
            return null;
        }

        var characterId = contact.characterId || contact.id || "";
        if (!characterId) {
            console.warn("[小馨手机][来电弹窗] 角色ID为空，无法生成拒接指令");
            return null;
        }

        // 获取消息ID（从contact对象或currentCall中获取）
        var messageId =
            contact._incomingCallMessageId || currentCall.messageId || "";

        if (!messageId) {
            console.warn("[小馨手机][来电弹窗] 未找到消息ID，无法生成拒接指令");
            return null;
        }

        // 生成唯一的通话ID（用于识别是哪一条来电，必须包含）
        // 确保不会与历史通话ID重复
        var callId = generateUniqueCallId("call_", messageId);

        // 生成消息ID（用于拒接消息）
        var rejectMessageId =
            "wxid_reject_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 9);

        // 生成拒接时间标签：读取“最新世界观时间”（含 DOM 中的 [time] 标签兜底）
        var rejectRawTime = getBestWorldRawTime();

        // 构建拒接指令（必须包含call_id，角色侧显示"已拒绝"）
        var rejectCommand = `<Request：根据剧情，线上消息必须使用[MSG]格式输出>
[MSG]
id=${rejectMessageId}
time=${rejectRawTime}
from=user
to=${characterId}
type=call_voice
state=rejected
with=${characterId}
call_id=${callId}
duration_sec=0
note=已拒绝
[/MSG]`;

        // 将拒接指令插入到酒馆输入框（不自动发送）
        try {
            // 找到酒馆输入框
            var tavernInput = document.getElementById("send_textarea");
            if (!tavernInput) {
                // 尝试其他可能的输入框选择器
                var inputSelectors = [
                    "#send_textarea textarea",
                    "textarea#send_textarea",
                    "#send_textarea_mobile",
                    ".send_textarea",
                    "#message_in",
                    "#user-input",
                ];
                for (var i = 0; i < inputSelectors.length; i++) {
                    tavernInput = document.querySelector(inputSelectors[i]);
                    if (tavernInput) {
                        break;
                    }
                }
            }

            if (tavernInput) {
                // 获取当前输入框内容
                var currentText = tavernInput.value || "";

                // 如果当前内容不为空，添加换行
                if (currentText.trim()) {
                    currentText += "\n";
                }

                // 追加拒接指令
                currentText += rejectCommand;

                // 设置输入框的值（只设置值，不触发任何可能自动发送的事件）
                tavernInput.value = currentText;

                // 只触发 input 和 change 事件，不触发 keydown/keypress/keyup 等可能触发发送的事件
                // 也不聚焦输入框，避免意外触发发送
                tavernInput.dispatchEvent(
                    new Event("input", { bubbles: true })
                );
                tavernInput.dispatchEvent(
                    new Event("change", { bubbles: true })
                );

                console.info(
                    "[小馨手机][来电弹窗] 已插入拒接指令到酒馆输入框（不自动发送），通话ID:",
                    callId
                );
            } else {
                console.warn(
                    "[小馨手机][来电弹窗] 未找到酒馆输入框，无法插入拒接指令"
                );
            }
        } catch (e) {
            console.error(
                "[小馨手机][来电弹窗] 插入拒接指令到酒馆输入框失败:",
                e
            );
        }

        // 在本地记录该来电已被拒接，避免刷新后再次弹出
        try {
            var handledKeyReject = "wx_call_reject_" + messageId;
            if (window.sessionStorage) {
                sessionStorage.setItem(handledKeyReject, "rejected");
            }
            if (window.localStorage) {
                localStorage.setItem(handledKeyReject, "rejected");
            }
        } catch (e) {
            console.warn("[小馨手机][来电弹窗] 记录来电已拒接状态失败:", e);
        }

        // 生成角色侧的"已拒绝"消息（类似未应答的处理）
        generateRejectedCallMessage(contact, callId, messageId);

        return callId;
    }

    // 生成拒接通话消息并添加到聊天记录（角色侧显示"已拒绝"）
    function generateRejectedCallMessage(contact, callId, originalMessageId) {
        if (!contact) {
            console.warn(
                "[小馨手机][来电弹窗] 联系人信息为空，无法生成拒接通话消息"
            );
            return;
        }

        var contactId = contact.id || contact.wechatId || "";
        if (!contactId) {
            console.warn(
                "[小馨手机][来电弹窗] 联系人ID为空，无法生成拒接通话消息"
            );
            return;
        }

        // 获取当前世界观时间
        var currentTime = window.XiaoxinWorldClock
            ? window.XiaoxinWorldClock.now()
            : new Date();
        var timestamp = currentTime.getTime();
        var rawTime = window.XiaoxinWorldClock
            ? window.XiaoxinWorldClock.rawTime
            : null;

        // 如果没有世界观时间，使用现实时间格式化
        if (!rawTime) {
            var year = currentTime.getFullYear();
            var month = String(currentTime.getMonth() + 1).padStart(2, "0");
            var day = String(currentTime.getDate()).padStart(2, "0");
            var hours = String(currentTime.getHours()).padStart(2, "0");
            var minutes = String(currentTime.getMinutes()).padStart(2, "0");
            var seconds = String(currentTime.getSeconds()).padStart(2, "0");
            rawTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }

        // 生成消息ID
        var messageId =
            "wx_call_rejected_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 9);

        // 判断是语音通话还是视频通话（根据当前来电类型，默认为语音通话）
        var callType =
            currentCall && currentCall.callType
                ? currentCall.callType
                : "call_voice";

        // 创建拒接通话消息对象（角色侧显示"已拒绝"）
        var rejectedCallMessage = {
            id: messageId,
            type: callType, // call_voice 或 call_video
            timestamp: timestamp,
            rawTime: rawTime,
            isOutgoing: false, // 角色发送的消息，显示在角色侧
            callState: "rejected", // 已拒绝状态
            callWith: contact.characterId || contact.id || "",
            duration: 0,
            note: "已拒绝", // 角色侧显示"已拒绝"
            content: "", // 拒接通话消息没有文本内容
            callId: callId, // 保存通话ID，用于区分不同的通话
            call_id: callId, // 兼容两种字段名
            originalCallMessageId: originalMessageId, // 保存原始来电消息ID
        };

        console.info(
            "[小馨手机][来电弹窗] 生成拒接通话消息（角色侧）:",
            rejectedCallMessage
        );

        // 添加到聊天记录
        if (window.XiaoxinWeChatDataHandler) {
            // 检查是否已经存在相同通话ID的相同类型消息（防止重复添加）
            var hasDuplicate = false;
            try {
                var existingMessages =
                    window.XiaoxinWeChatDataHandler.getChatMessages(
                        contactId
                    ) || [];
                hasDuplicate = existingMessages.some(function (msg) {
                    // 获取消息中的通话ID（支持两种字段名）
                    var msgCallId = msg.call_id || msg.callId || null;
                    return (
                        msg.isOutgoing === false &&
                        msg.callState === "rejected" &&
                        msg.note === "已拒绝" &&
                        msg.type === callType &&
                        msgCallId === callId // 通话ID必须相同
                    );
                });
            } catch (e) {
                console.warn(
                    "[小馨手机][来电弹窗] 检查重复消息时出错，继续添加消息:",
                    e
                );
            }

            if (hasDuplicate) {
                console.info(
                    "[小馨手机][来电弹窗] 聊天记录中已存在相同通话ID的拒接通话消息，跳过添加"
                );
                return;
            }

            window.XiaoxinWeChatDataHandler.addChatMessage(
                contactId,
                rejectedCallMessage
            );
            // 清除通话ID缓存，确保新消息的通话ID能被识别
            clearUsedCallIdsCache();
            console.info(
                "[小馨手机][来电弹窗] 拒接通话消息已添加到聊天记录，联系人ID:",
                contactId
            );

            // 添加到消息队列，触发显示
            if (window.XiaoxinMessageQueue) {
                window.XiaoxinMessageQueue.addMessage(
                    contactId,
                    rejectedCallMessage
                );
                console.info(
                    "[小馨手机][来电弹窗] 拒接通话消息已添加到消息队列，将触发显示"
                );
            } else {
                console.warn(
                    "[小馨手机][来电弹窗] 消息队列管理器未加载，无法触发消息显示"
                );
            }
        } else {
            console.error(
                "[小馨手机][来电弹窗] 微信数据处理器未加载，无法添加拒接通话消息"
            );
        }
    }

    function handleCallAccept(contact) {
        if (!contact) {
            return;
        }

        var characterId = contact.characterId || contact.id || "";
        // 获取消息ID（从contact对象或currentCall中获取）
        var messageId =
            contact._incomingCallMessageId || currentCall.messageId || "";

        if (!messageId) {
            console.warn("[小馨手机][来电弹窗] 未找到消息ID，无法生成接听指令");
            return;
        }

        // 生成唯一的通话ID（用于识别是哪一条来电）
        // 确保不会与历史通话ID重复
        var callId = generateUniqueCallId("call_", messageId);

        // 立即设置 currentCall.callId，确保消息监听器能正确识别
        if (!currentCall) {
            currentCall = {};
        }
        currentCall.callId = callId;
        currentCall.messageId = messageId;
        currentCall.direction = "incoming";
        // 角色主动发起的通话，设置 initiator 为 "role"
        currentCall.initiator = "role";
        // 记录通话发起方：角色主动来电
        // 用于消息监听器在收到 state=ended 时不要把气泡翻到玩家侧
        try {
            if (window.localStorage && callId) {
                localStorage.setItem("wx_call_initiator_" + callId, "role");
            }
        } catch (e) {}
        if (currentCall.accumulatedTextDuration === undefined) {
            currentCall.accumulatedTextDuration = 0; // 初始化累计文本时长
        }
        console.info("[小馨手机][来电弹窗] 设置当前通话的 callId:", callId);

        // 生成接听时间标签：读取“最新世界观时间”（含 DOM 中的 [time] 标签兜底）
        var acceptRawTime = getBestWorldRawTime();
        if (!acceptRawTime) {
            var acceptDate = new Date(acceptTime);
            var year = acceptDate.getFullYear();
            var month = String(acceptDate.getMonth() + 1).padStart(2, "0");
            var day = String(acceptDate.getDate()).padStart(2, "0");
            var hours = String(acceptDate.getHours()).padStart(2, "0");
            var minutes2 = String(acceptDate.getMinutes()).padStart(2, "0");
            var seconds2 = String(acceptDate.getSeconds()).padStart(2, "0");
            acceptRawTime = `${year}-${month}-${day} ${hours}:${minutes2}:${seconds2}`;
        }

        // 构建接听指令（包含时间标签，便于世界书精确定位接听时间）
        var acceptCommand = `[wx_call_accept]
角色ID=${characterId}
消息ID=${messageId}
通话ID=${callId}
状态=已接听
[TIME:${acceptRawTime}]
[/TIME]
[/wx_call_accept]`;

        // 将接听指令作为玩家消息发送到酒馆正文
        try {
            // 找到酒馆输入框
            var tavernInput = document.getElementById("send_textarea");
            if (!tavernInput) {
                // 尝试其他可能的输入框选择器
                var inputSelectors = [
                    "#send_textarea textarea",
                    "textarea#send_textarea",
                    "#send_textarea_mobile",
                    ".send_textarea",
                    "#message_in",
                    "#user-input",
                ];
                for (var i = 0; i < inputSelectors.length; i++) {
                    tavernInput = document.querySelector(inputSelectors[i]);
                    if (tavernInput) {
                        break;
                    }
                }
            }

            if (tavernInput) {
                // 立即启动消息监听器（在发送指令之前就启动，确保能捕获到角色的回复）
                console.info(
                    "[小馨手机][来电弹窗] 在发送接听指令前启动消息监听器"
                );
                initCallMessageListener(contact);

                // 在本地记录该来电已被接听，避免刷新后再次弹出
                try {
                    var handledKeyAccept = "wx_call_accept_" + messageId;
                    if (window.sessionStorage) {
                        sessionStorage.setItem(handledKeyAccept, "accepted");
                    }
                    if (window.localStorage) {
                        localStorage.setItem(handledKeyAccept, "accepted");
                    }
                } catch (e) {
                    console.warn(
                        "[小馨手机][来电弹窗] 记录来电已接听状态失败:",
                        e
                    );
                }

                // 设置输入框的值
                tavernInput.value = acceptCommand;

                // 触发输入事件，让酒馆知道内容已更改
                tavernInput.dispatchEvent(
                    new Event("input", { bubbles: true })
                );
                tavernInput.dispatchEvent(
                    new Event("change", { bubbles: true })
                );

                // 聚焦到输入框
                tavernInput.focus();

                // 移动光标到末尾
                if (tavernInput.setSelectionRange) {
                    var length = acceptCommand.length;
                    tavernInput.setSelectionRange(length, length);
                }

                // 找到发送按钮并触发点击
                var sendButtonSelectors = [
                    "#send_but",
                    "#send_button",
                    "button[type='submit']",
                    ".send_button",
                    "[aria-label*='发送']",
                    "[title*='发送']",
                ];

                var sendButton = null;
                for (var j = 0; j < sendButtonSelectors.length; j++) {
                    sendButton = document.querySelector(sendButtonSelectors[j]);
                    if (sendButton) {
                        break;
                    }
                }

                // 如果找到发送按钮，触发点击
                if (sendButton) {
                    // 延迟一点时间，确保输入框内容已设置
                    setTimeout(function () {
                        sendButton.click();
                        console.info(
                            "[小馨手机][来电弹窗] 已发送接听指令到酒馆正文，消息ID:",
                            messageId
                        );
                    }, 100);
                } else {
                    // 如果找不到发送按钮，尝试触发回车键事件
                    setTimeout(function () {
                        var enterEvent = new KeyboardEvent("keydown", {
                            key: "Enter",
                            code: "Enter",
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true,
                        });
                        tavernInput.dispatchEvent(enterEvent);

                        var enterUpEvent = new KeyboardEvent("keyup", {
                            key: "Enter",
                            code: "Enter",
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true,
                        });
                        tavernInput.dispatchEvent(enterUpEvent);

                        console.info(
                            "[小馨手机][来电弹窗] 已通过回车键发送接听指令到酒馆正文，消息ID:",
                            messageId
                        );
                    }, 100);
                }
            } else {
                console.warn(
                    "[小馨手机][来电弹窗] 未找到酒馆输入框，无法发送接听指令"
                );
            }

            // 返回 callId，供调用者使用
            return callId;
        } catch (e) {
            console.error(
                "[小馨手机][来电弹窗] 发送接听指令到酒馆正文失败:",
                e
            );
        }

        // 返回 callId（即使出错也返回，确保调用者能获取到）
        return callId;
    }

    // 处理30秒超时
    function handleCallTimeout() {
        if (!currentCall || !currentCall.contact) {
            return;
        }

        var contact = currentCall.contact;
        var characterId = contact.characterId || contact.id || "";
        // 获取消息ID（从contact对象或currentCall中获取）
        var messageId =
            contact._incomingCallMessageId || currentCall.messageId || "";

        if (!messageId) {
            console.warn(
                "[小馨手机][来电弹窗] 未找到消息ID，无法生成带消息ID的未响应指令"
            );
            return; // 没有消息ID，不输入
        }

        // 构建未响应来电的数据指令（包含消息ID）
        var timeoutData = `[wx_call_timeout]
角色ID=${characterId}
消息ID=${messageId}
状态=未响应
[/wx_call_timeout]`;

        // 输入到酒馆输入框
        // 关键：只输入新的未响应指令，不输入历史指令
        try {
            var $input = $(
                "#send_textarea, #send_textarea_mobile, textarea[name='user'], textarea[placeholder*='输入'], textarea[placeholder*='输入']"
            );
            if ($input.length > 0) {
                var currentText = $input.val() || "";

                // 检查输入框中是否已经存在相同消息ID的未响应指令
                if (messageId) {
                    var existingPattern = new RegExp(
                        `\\[wx_call_timeout\\][\\s\\S]*?消息ID=${messageId.replace(
                            /[.*+?^${}()|[\]\\]/g,
                            "\\$&"
                        )}[\\s\\S]*?\\[/wx_call_timeout\\]`,
                        "g"
                    );
                    if (existingPattern.test(currentText)) {
                        console.info(
                            "[小馨手机][来电弹窗] 输入框中已存在该消息ID的未响应指令，跳过输入，消息ID:",
                            messageId
                        );
                        return; // 已存在，不重复输入
                    }
                }

                // 检查sessionStorage，防止在当前会话中重复输入
                var storageKey = `wx_call_timeout_${messageId}`;
                try {
                    if (sessionStorage.getItem(storageKey)) {
                        console.info(
                            "[小馨手机][来电弹窗] 该消息的未响应指令在当前会话中已处理过，跳过输入，消息ID:",
                            messageId
                        );
                        return; // 当前会话中已处理过，不重复输入
                    }
                } catch (e) {
                    console.warn(
                        "[小馨手机][来电弹窗] 检查sessionStorage时出错:",
                        e
                    );
                }

                // 关键修复：如果输入框中已经有任何未响应指令，先清空所有未响应指令，再输入新的
                // 这样可以确保只保留最新的未响应指令，而不是追加历史指令
                var timeoutPattern =
                    /\[wx_call_timeout\][\s\S]*?\[\/wx_call_timeout\]/g;
                var cleanedText = currentText
                    .replace(timeoutPattern, "")
                    .trim();

                // 如果清空后还有内容，用换行符连接；如果没有内容，直接使用新指令
                var newText = cleanedText
                    ? cleanedText + "\n" + timeoutData
                    : timeoutData;

                $input.val(newText);
                $input.trigger("input");

                // 标记为已处理（使用sessionStorage，页面刷新后自动清空）
                try {
                    sessionStorage.setItem(storageKey, "1");
                } catch (e) {
                    console.warn(
                        "[小馨手机][来电弹窗] 保存到sessionStorage时出错:",
                        e
                    );
                }

                // 同时在localStorage中记录该来电已处理为未响应，避免刷新后再次弹出
                try {
                    if (window.localStorage) {
                        localStorage.setItem(storageKey, "1");
                    }
                } catch (e) {
                    console.warn(
                        "[小馨手机][来电弹窗] 保存未响应状态到localStorage时出错:",
                        e
                    );
                }

                console.info(
                    "[小馨手机][来电弹窗] 已输入新的未响应来电数据到输入框，消息ID:",
                    messageId
                );
            } else {
                console.warn("[小馨手机][来电弹窗] 未找到输入框，无法输入数据");
            }
        } catch (e) {
            console.error("[小馨手机][来电弹窗] 输入超时数据失败:", e);
        }
    }

    // 生成未接来电消息并添加到聊天记录
    function generateMissedCallMessage(contact) {
        if (!contact) {
            console.warn(
                "[小馨手机][来电弹窗] 联系人信息为空，无法生成未接来电消息"
            );
            return;
        }

        var contactId = contact.id || contact.wechatId || "";
        if (!contactId) {
            console.warn(
                "[小馨手机][来电弹窗] 联系人ID为空，无法生成未接来电消息"
            );
            return;
        }

        // 获取当前世界观时间
        var currentTime = window.XiaoxinWorldClock
            ? window.XiaoxinWorldClock.now()
            : new Date();
        var timestamp = currentTime.getTime();
        var rawTime = window.XiaoxinWorldClock
            ? window.XiaoxinWorldClock.rawTime
            : null;

        // 如果没有世界观时间，使用现实时间格式化
        if (!rawTime) {
            var year = currentTime.getFullYear();
            var month = String(currentTime.getMonth() + 1).padStart(2, "0");
            var day = String(currentTime.getDate()).padStart(2, "0");
            var hours = String(currentTime.getHours()).padStart(2, "0");
            var minutes = String(currentTime.getMinutes()).padStart(2, "0");
            var seconds = String(currentTime.getSeconds()).padStart(2, "0");
            rawTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }

        // 生成消息ID
        var messageId =
            "wx_call_missed_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 9);

        // 判断是语音通话还是视频通话（根据当前来电类型，默认为语音通话）
        var callType =
            currentCall && currentCall.callType
                ? currentCall.callType
                : "call_voice";

        // 获取原始来电消息ID（如果有）
        var originalMessageId =
            currentCall && currentCall.messageId
                ? currentCall.messageId
                : contact._incomingCallMessageId || "";

        // 创建未接来电消息对象
        var missedCallMessage = {
            id: messageId,
            type: callType, // call_voice 或 call_video
            timestamp: timestamp,
            rawTime: rawTime,
            isOutgoing: false, // 角色发送的消息
            callState: "unanswered", // 未应答状态
            callWith: contact.characterId || contact.id || "",
            duration: 0,
            note: "未应答",
            content: "", // 未接来电消息没有文本内容
            originalCallMessageId: originalMessageId, // 保存原始来电消息ID
        };

        console.info(
            "[小馨手机][来电弹窗] 生成未接来电消息:",
            missedCallMessage
        );

        // 添加到聊天记录
        if (window.XiaoxinWeChatDataHandler) {
            window.XiaoxinWeChatDataHandler.addChatMessage(
                contactId,
                missedCallMessage
            );
            console.info(
                "[小馨手机][来电弹窗] 未接来电消息已添加到聊天记录，联系人ID:",
                contactId
            );

            // 添加到消息队列，触发显示和弹窗
            if (window.XiaoxinMessageQueue) {
                window.XiaoxinMessageQueue.addMessage(
                    contactId,
                    missedCallMessage
                );
                console.info(
                    "[小馨手机][来电弹窗] 未接来电消息已添加到消息队列，将触发显示和弹窗"
                );
            } else {
                console.warn(
                    "[小馨手机][来电弹窗] 消息队列管理器未加载，无法触发消息显示"
                );
            }
        } else {
            console.error(
                "[小馨手机][来电弹窗] 微信数据处理器未加载，无法添加未接来电消息"
            );
        }
    }

    // 生成通话被拒绝/未响应消息（显示在玩家侧）
    function generateCallRejectedMessage(contact, callState) {
        // 检查是否已生成过拒绝/未响应消息（防止重复生成）
        if (rejectedMessageGenerated) {
            console.info(
                "[小馨手机][通话中] 拒绝/未响应消息已生成过，跳过重复生成",
                "callState:",
                callState
            );
            return;
        }

        if (!contact) {
            console.warn(
                "[小馨手机][通话中] 联系人信息为空，无法生成拒绝/未响应消息"
            );
            return;
        }

        var contactId = contact.id || contact.wechatId || "";
        if (!contactId) {
            console.warn(
                "[小馨手机][通话中] 联系人ID为空，无法生成拒绝/未响应消息"
            );
            return;
        }

        // 获取当前世界观时间
        var currentTime = window.XiaoxinWorldClock
            ? window.XiaoxinWorldClock.now()
            : new Date();
        var timestamp = currentTime.getTime();
        var rawTime = window.XiaoxinWorldClock
            ? window.XiaoxinWorldClock.rawTime
            : null;

        // 如果没有世界观时间，使用现实时间格式化
        if (!rawTime) {
            var year = currentTime.getFullYear();
            var month = String(currentTime.getMonth() + 1).padStart(2, "0");
            var day = String(currentTime.getDate()).padStart(2, "0");
            var hours = String(currentTime.getHours()).padStart(2, "0");
            var minutes = String(currentTime.getMinutes()).padStart(2, "0");
            var seconds = String(currentTime.getSeconds()).padStart(2, "0");
            rawTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }

        // 生成消息ID
        var messageId =
            "wx_call_" +
            callState +
            "_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 9);

        // 判断是语音通话还是视频通话
        var callType =
            currentCall && currentCall.callType
                ? currentCall.callType
                : "call_voice";

        // 根据状态和通话方向设置显示文本
        // 检查是否是等待模式（玩家发起的通话）
        var isWaitingMode =
            ($activeCallScreen && $activeCallScreen.hasClass("waiting-call")) ||
            (currentCall && currentCall.direction === "outgoing");
        var callDirection =
            currentCall && currentCall.direction
                ? currentCall.direction
                : isWaitingMode
                ? "outgoing"
                : "incoming";
        var noteText = "";
        if (callState === "unanswered") {
            // 如果是玩家发起的通话，显示"对方无应答"；如果是角色发起的，显示"未响应"
            if (callDirection === "outgoing" || isWaitingMode) {
                noteText = "对方无应答";
            } else {
                noteText = "未响应";
            }
        } else if (callState === "rejected") {
            // 如果是玩家发起的通话，显示"对方已拒绝"；如果是角色发起的，显示"已拒绝"
            if (callDirection === "outgoing" || isWaitingMode) {
                noteText = "对方已拒绝";
            } else {
                noteText = "已拒绝";
            }
        } else {
            noteText = "未响应";
        }

        console.info(
            "[小馨手机][通话中] 生成拒绝/未响应消息",
            "callState:",
            callState,
            "callDirection:",
            callDirection,
            "isWaitingMode:",
            isWaitingMode,
            "noteText:",
            noteText
        );

        // 获取当前通话的 callId
        var currentCallId = (currentCall && currentCall.callId) || null;

        // 创建拒绝/未响应消息对象（显示在玩家侧）
        var rejectedMessage = {
            id: messageId,
            type: callType, // call_voice 或 call_video
            timestamp: timestamp,
            rawTime: rawTime,
            isOutgoing: true, // 显示在玩家侧
            callState: callState, // "unanswered" 或 "rejected"
            callWith: contact.characterId || contact.id || "",
            duration: 0,
            note: noteText, // 显示文本
            content: "", // 没有文本内容
            callId: currentCallId, // 保存通话ID，用于区分不同的通话
            call_id: currentCallId, // 兼容两种字段名
        };

        console.info(
            "[小馨手机][通话中] 生成拒绝/未响应消息:",
            rejectedMessage
        );

        // 添加到聊天记录
        if (window.XiaoxinWeChatDataHandler) {
            // 检查是否已经存在相同通话ID的相同类型消息（防止重复添加）
            // 只有当通话ID也相同时，才认为是重复消息
            var hasDuplicate = false;
            try {
                var existingMessages =
                    window.XiaoxinWeChatDataHandler.getChatHistory(contactId) ||
                    [];
                hasDuplicate = existingMessages.some(function (msg) {
                    // 获取消息中的通话ID（支持两种字段名）
                    var msgCallId = msg.callId || msg.call_id || null;

                    // 只有当通话ID也相同时，才认为是重复
                    // 如果当前通话没有 callId，则只检查其他条件（兼容旧逻辑）
                    if (currentCallId) {
                        return (
                            msg.isOutgoing === true &&
                            msg.callState === callState &&
                            msg.note === noteText &&
                            msg.type === callType &&
                            msgCallId === currentCallId // 通话ID必须相同
                        );
                    } else {
                        // 如果没有通话ID，检查时间戳是否非常接近（5秒内），避免同一通话重复生成
                        var timeDiff = Math.abs(
                            (msg.timestamp || 0) - timestamp
                        );
                        return (
                            msg.isOutgoing === true &&
                            msg.callState === callState &&
                            msg.note === noteText &&
                            msg.type === callType &&
                            timeDiff < 5000 // 5秒内认为是同一通话
                        );
                    }
                });
            } catch (e) {
                console.warn(
                    "[小馨手机][通话中] 检查重复消息时出错，继续添加消息:",
                    e
                );
                // 如果检查出错，继续添加消息（不阻止）
            }

            if (hasDuplicate) {
                console.info(
                    "[小馨手机][通话中] 聊天记录中已存在相同通话ID的拒绝/未响应消息，跳过添加",
                    "callState:",
                    callState,
                    "noteText:",
                    noteText,
                    "callId:",
                    currentCallId
                );
                // 即使跳过添加，也标记为已生成，避免重复处理
                rejectedMessageGenerated = true;
                return;
            }

            window.XiaoxinWeChatDataHandler.addChatMessage(
                contactId,
                rejectedMessage
            );
            // 清除通话ID缓存，确保新消息的通话ID能被识别
            clearUsedCallIdsCache();
            console.info(
                "[小馨手机][通话中] 拒绝/未响应消息已添加到聊天记录，联系人ID:",
                contactId
            );

            // 添加到消息队列，触发显示
            if (window.XiaoxinMessageQueue) {
                window.XiaoxinMessageQueue.addMessage(
                    contactId,
                    rejectedMessage
                );
                console.info(
                    "[小馨手机][通话中] 拒绝/未响应消息已添加到消息队列，将触发显示"
                );
            } else {
                console.warn(
                    "[小馨手机][通话中] 消息队列管理器未加载，无法触发消息显示"
                );
            }

            // 标记已生成拒绝/未响应消息
            rejectedMessageGenerated = true;
        } else {
            console.error(
                "[小馨手机][通话中] 微信数据处理器未加载，无法添加拒绝/未响应消息"
            );
        }
    }

    // 生成通话结束消息（显示通话时长）
    // durationSeconds: 通话时长（秒数，数字）
    function generateCallEndedMessage(contact, durationSeconds, callDirection) {
        if (!contact) {
            console.warn(
                "[小馨手机][通话中] 联系人信息为空，无法生成通话结束消息"
            );
            return;
        }

        var contactId = contact.id || contact.wechatId || "";
        if (!contactId) {
            console.warn(
                "[小馨手机][通话中] 联系人ID为空，无法生成通话结束消息"
            );
            return;
        }

        // 确保 durationSeconds 是数字
        var durationSec = typeof durationSeconds === "number"
            ? durationSeconds
            : (typeof durationSeconds === "string"
                ? parseInt(durationSeconds, 10)
                : 0);
        if (isNaN(durationSec) || durationSec < 0) {
            durationSec = 0;
        }

        // 格式化通话时长为 MM:SS
        var minutes = Math.floor(durationSec / 60);
        var seconds = durationSec % 60;
        var durationStr =
            String(minutes).padStart(2, "0") +
            ":" +
            String(seconds).padStart(2, "0");

        // 获取当前世界观时间
        var currentTime = window.XiaoxinWorldClock
            ? window.XiaoxinWorldClock.now()
            : new Date();
        var timestamp = currentTime.getTime();
        var rawTime = window.XiaoxinWorldClock
            ? window.XiaoxinWorldClock.rawTime
            : null;

        // 如果没有世界观时间，使用现实时间格式化
        if (!rawTime) {
            var year = currentTime.getFullYear();
            var month = String(currentTime.getMonth() + 1).padStart(2, "0");
            var day = String(currentTime.getDate()).padStart(2, "0");
            var hours = String(currentTime.getHours()).padStart(2, "0");
            var minutes = String(currentTime.getMinutes()).padStart(2, "0");
            var seconds = String(currentTime.getSeconds()).padStart(2, "0");
            rawTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }

        // 生成消息ID
        var messageId =
            "wx_call_ended_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 9);

        // 判断是语音通话还是视频通话
        var callType =
            currentCall && currentCall.callType
                ? currentCall.callType
                : "call_voice";

        // 获取通话ID（用于去重）
        var callId = currentCall && currentCall.callId ? currentCall.callId : null;

        // 判断消息显示在哪一侧
        // 规则：无论谁挂断，始终按照“谁主动发起通话”来决定显示侧
        // initiator = "player" -> 玩家侧；"role" -> 角色侧；
        // 如果没有 initiator，则回退到通话方向
        var initiator =
            currentCall && currentCall.initiator ? currentCall.initiator : null;
        var isOutgoing;
        if (initiator === "player") {
            isOutgoing = true;
        } else if (initiator === "role") {
            isOutgoing = false;
        } else {
            // 兼容旧逻辑：如果没有 initiator，根据 callDirection 判断
            // callDirection === "outgoing" 表示玩家发起，显示在玩家侧
            // callDirection === "incoming" 表示角色发起，显示在角色侧
            isOutgoing = callDirection === "outgoing";
        }

        console.info(
            "[小馨手机][通话中] 生成通话结束消息，判断显示侧:",
            "initiator:",
            initiator,
            "callDirection:",
            callDirection,
            "isOutgoing:",
            isOutgoing,
            "currentCall:",
            currentCall
                ? {
                      direction: currentCall.direction,
                      initiator: currentCall.initiator,
                      callId: currentCall.callId,
                  }
                : null
        );

        // 创建通话结束消息对象
        var callEndedMessage = {
            id: messageId,
            type: callType, // call_voice 或 call_video
            timestamp: timestamp,
            rawTime: rawTime,
            isOutgoing: isOutgoing, // 根据通话方向决定显示在哪一侧
            callState: "ended", // 通话结束状态
            callWith: contact.characterId || contact.id || "",
            call_id: callId, // 通话ID（用于去重，确保相同通话只显示一条结束消息）
            callId: callId, // 兼容字段
            duration: durationSec, // 通话时长（秒数，数字格式，用于正确解析）
            duration_sec: durationSec, // 兼容字段
            note: "通话时长" + durationStr, // 显示文本（MM:SS格式）
            content: "", // 通话结束消息没有文本内容
        };

        console.info("[小馨手机][通话中] 生成通话结束消息:", callEndedMessage);

        // 添加到聊天记录
        if (window.XiaoxinWeChatDataHandler) {
            window.XiaoxinWeChatDataHandler.addChatMessage(
                contactId,
                callEndedMessage
            );
            // 清除通话ID缓存，确保新消息的通话ID能被识别
            clearUsedCallIdsCache();
            console.info(
                "[小馨手机][通话中] 通话结束消息已添加到聊天记录，联系人ID:",
                contactId
            );

            // 添加到消息队列，触发显示
            if (window.XiaoxinMessageQueue) {
                window.XiaoxinMessageQueue.addMessage(
                    contactId,
                    callEndedMessage
                );
                console.info(
                    "[小馨手机][通话中] 通话结束消息已添加到消息队列，将触发显示"
                );
            } else {
                console.warn(
                    "[小馨手机][通话中] 消息队列管理器未加载，无法触发消息显示"
                );
            }
        } else {
            console.error(
                "[小馨手机][通话中] 微信数据处理器未加载，无法添加通话结束消息"
            );
        }
    }

    // HTML转义
    function escapeHtml(text) {
        var map = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
        };
        return String(text).replace(/[&<>"']/g, function (m) {
            return map[m];
        });
    }

    // 清理等待状态的打字机
    function clearWaitingTyping() {
        if (waitingTypingTimer) {
            clearInterval(waitingTypingTimer);
            waitingTypingTimer = null;
        }
    }

    // 显示通话状态弹窗
    function showCallStatusToast(text) {
        if (!$activeCallScreen) return;

        // 移除旧的弹窗
        var $oldToast = $activeCallScreen.find(
            ".xiaoxin-active-call-status-toast"
        );
        if ($oldToast.length > 0) {
            $oldToast.remove();
        }

        // 创建新的弹窗
        var $toast = $(
            '<div class="xiaoxin-active-call-status-toast">' +
                escapeHtml(text) +
                "</div>"
        );

        // 添加到等待文字的位置（等待模式下）或中间区域（通话中）
        var $targetContainer = $activeCallScreen
            .find(".xiaoxin-active-call-waiting")
            .parent();
        if ($targetContainer.length === 0) {
            $targetContainer = $activeCallScreen.find(
                ".xiaoxin-active-call-center"
            );
        }

        $targetContainer.append($toast);

        // 显示动画
        setTimeout(function () {
            $toast.addClass("show");
        }, 10);

        // 3秒后自动隐藏
        setTimeout(function () {
            $toast.removeClass("show");
            setTimeout(function () {
                $toast.remove();
            }, 300);
        }, 3000);
    }

    // 全局监听通话状态变化（角色处理：未响应/拒绝/接听）
    window.addEventListener("xiaoxin-call-status-changed", function (event) {
        var detail = (event && event.detail) || {};
        if (!detail) return;

        var detailCallId = detail.call_id || detail.callId || "";
        var state = (detail.state || "").toLowerCase();
        if (!state) return;

        if (!$activeCallScreen) {
            console.warn(
                "[小馨手机][通话状态] 通话界面不存在，忽略状态变化:",
                state
            );
            return;
        }

        // 检查是否是等待接听模式
        var isWaitingMode =
            $activeCallScreen.hasClass("waiting-call") ||
            (currentCall && currentCall.direction === "outgoing");

        // 检查 callId 是否匹配（如果是玩家发起的通话，需要匹配 callId）
        if (isWaitingMode && currentCall && currentCall.callId) {
            // 对于玩家发起的通话，必须匹配 callId
            if (detailCallId && detailCallId !== currentCall.callId) {
                console.info(
                    "[小馨手机][通话状态] callId 不匹配，忽略状态变化:",
                    "当前通话 callId:",
                    currentCall.callId,
                    "收到状态 callId:",
                    detailCallId
                );
                return; // 不是当前通话的状态变化
            }
        } else if (currentCall && currentCall.callId && detailCallId) {
            // 对于其他情况，如果提供了 callId，也需要匹配
            if (detailCallId !== currentCall.callId) {
                console.info(
                    "[小馨手机][通话状态] callId 不匹配，忽略状态变化:",
                    "当前通话 callId:",
                    currentCall.callId,
                    "收到状态 callId:",
                    detailCallId
                );
                return;
            }
        }

        console.info(
            "[小馨手机][通话状态] 处理状态变化:",
            state,
            "callId:",
            detailCallId,
            "当前通话 callId:",
            currentCall && currentCall.callId,
            "等待模式:",
            isWaitingMode
        );

        // 记录接听/连接时间戳（用于后续计算通话时长）
        if (state === "accepted" || state === "connected") {
            if (detail.timestamp) {
                currentCall.startTimestampFromEvent = detail.timestamp;
            } else if (detail.rawTime) {
                var parsedStart = Date.parse(
                    String(detail.rawTime)
                        .replace(/年|月/g, "/")
                        .replace(/日/, " ")
                );
                if (!isNaN(parsedStart)) {
                    currentCall.startTimestampFromEvent = parsedStart;
                }
            }
        }

        if (state === "unanswered") {
            // 如果已经生成过消息，直接返回，避免重复生成
            if (rejectedMessageGenerated) {
                console.info(
                    "[小馨手机][通话状态] 未响应消息已生成过，跳过重复处理"
                );
                return;
            }

            // 如果已有待执行的定时器，清除它，避免重复设置
            if (rejectedMessageTimer) {
                clearTimeout(rejectedMessageTimer);
                rejectedMessageTimer = null;
            }

            // 未响应：在等待文字位置显示灰色弹窗
            if (isWaitingMode) {
                var $waiting = $activeCallScreen.find(
                    ".xiaoxin-active-call-waiting"
                );
                if ($waiting.length > 0) {
                    $waiting.hide();
                }
                clearWaitingTyping();
            }
            showCallStatusToast("对方未响应");

            // 3秒后自动挂断通话并生成玩家侧消息
            rejectedMessageTimer = setTimeout(function () {
                rejectedMessageTimer = null; // 清除定时器引用
                if (currentCall && currentCall.contact) {
                    try {
                        // 生成未响应消息（显示在玩家侧）
                        generateCallRejectedMessage(
                            currentCall.contact,
                            "unanswered"
                        );
                    } catch (e) {
                        console.error(
                            "[小馨手机][通话状态] 生成未响应消息时出错:",
                            e
                        );
                    }
                    // 无论是否成功生成消息，都要自动挂断
                    // 自动挂断（跳过生成通话结束消息，因为已经生成了未响应消息）
                    hangupCall(true);
                }
            }, 3000);
        } else if (state === "rejected") {
            // 如果已经生成过消息，直接返回，避免重复生成
            if (rejectedMessageGenerated) {
                console.info(
                    "[小馨手机][通话状态] 拒绝消息已生成过，跳过重复处理"
                );
                return;
            }

            // 如果已有待执行的定时器，清除它，避免重复设置
            if (rejectedMessageTimer) {
                clearTimeout(rejectedMessageTimer);
                rejectedMessageTimer = null;
            }

            // 拒绝：在等待文字位置显示灰色弹窗
            if (isWaitingMode) {
                var $waiting = $activeCallScreen.find(
                    ".xiaoxin-active-call-waiting"
                );
                if ($waiting.length > 0) {
                    $waiting.hide();
                }
                clearWaitingTyping();
            }
            showCallStatusToast("对方已拒绝");

            // 3秒后自动挂断通话并生成玩家侧消息
            rejectedMessageTimer = setTimeout(function () {
                rejectedMessageTimer = null; // 清除定时器引用
                if (currentCall && currentCall.contact) {
                    try {
                        // 生成拒绝消息（显示在玩家侧）
                        generateCallRejectedMessage(
                            currentCall.contact,
                            "rejected"
                        );
                    } catch (e) {
                        console.error(
                            "[小馨手机][通话状态] 生成拒绝消息时出错:",
                            e
                        );
                    }
                    // 无论是否成功生成消息，都要自动挂断
                    // 自动挂断（跳过生成通话结束消息，因为已经生成了拒绝消息）
                    hangupCall(true);
                }
            }, 3000);
        } else if (state === "accepted" || state === "connected") {
            // 接听：在通话页面中显示灰色弹窗，并切换到通话中状态
            console.info(
                "[小馨手机][通话状态] 角色接听了通话，切换到通话中状态",
                "isWaitingMode:",
                isWaitingMode
            );

            if (isWaitingMode) {
                var $waiting = $activeCallScreen.find(
                    ".xiaoxin-active-call-waiting"
                );
                if ($waiting.length > 0) {
                    $waiting.hide();
                }
                clearWaitingTyping();

                // 切换到通话中状态
                $activeCallScreen.removeClass("waiting-call");

                // 显示通话中的元素
                var $duration = $activeCallScreen.find(
                    ".xiaoxin-active-call-duration"
                );
                if ($duration.length > 0) {
                    $duration.show().text("00:00");
                }

                var $inviteBtn = $activeCallScreen.find(
                    ".xiaoxin-active-call-invite-btn"
                );
                if ($inviteBtn.length > 0) {
                    $inviteBtn.show();
                }

                var $messages = $activeCallScreen.find(
                    ".xiaoxin-active-call-messages"
                );
                if ($messages.length > 0) {
                    $messages.show();
                }

                // 更新 currentCall 状态
                if (currentCall) {
                    currentCall.direction = "incoming"; // 接听后变为正常通话
                }

                // 启动计时器
                callStartTime = Date.now();
                // 记录通话接通时的世界观时间
                var currentTime = window.XiaoxinWorldClock
                    ? window.XiaoxinWorldClock.now()
                    : new Date();
                callStartWorldTime = currentTime.getTime();
                callStartWorldRawTime = window.XiaoxinWorldClock
                    ? window.XiaoxinWorldClock.rawTime
                    : null;
                if (!callStartWorldRawTime) {
                    var year = currentTime.getFullYear();
                    var month = String(currentTime.getMonth() + 1).padStart(
                        2,
                        "0"
                    );
                    var day = String(currentTime.getDate()).padStart(2, "0");
                    var hours = String(currentTime.getHours()).padStart(2, "0");
                    var minutes = String(currentTime.getMinutes()).padStart(
                        2,
                        "0"
                    );
                    var seconds = String(currentTime.getSeconds()).padStart(
                        2,
                        "0"
                    );
                    callStartWorldRawTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                }
                // 初始化累计文本时长（用于根据文本内容计算通话时长）
                if (currentCall) {
                    currentCall.accumulatedTextDuration = 0;
                }
                console.info("[小馨手机][通话中] 记录通话接通时间", {
                    callStartTime: callStartTime,
                    callStartWorldTime: callStartWorldTime,
                    callStartWorldRawTime: callStartWorldRawTime,
                    accumulatedTextDuration: currentCall
                        ? currentCall.accumulatedTextDuration
                        : 0,
                });
                startCallDurationTimer();

                // 更新悬浮按钮样式（从等待接听切换到通话中）
                // 注意：即使悬浮按钮当前被隐藏（因为通话页面显示），也要更新样式
                // 这样当用户最小化通话页面时，悬浮按钮会显示正确的样式
                if ($floatingCallIcon && $floatingCallIcon.length > 0) {
                    // 移除等待样式
                    $floatingCallIcon.removeClass(
                        "xiaoxin-floating-call-icon-waiting"
                    );
                    // 确保有通话中样式
                    if (
                        !$floatingCallIcon.hasClass(
                            "xiaoxin-floating-call-icon-active"
                        )
                    ) {
                        $floatingCallIcon.addClass(
                            "xiaoxin-floating-call-icon-active"
                        );
                    }
                    // 更新悬浮按钮内容：移除"等待接听"文字，显示计时器
                    var $waitingText = $floatingCallIcon.find(
                        ".xiaoxin-floating-call-waiting-text"
                    );
                    if ($waitingText.length > 0) {
                        $waitingText.remove();
                    }
                    // 确保有计时器显示
                    var $duration = $floatingCallIcon.find(
                        ".xiaoxin-floating-call-duration"
                    );
                    if ($duration.length === 0) {
                        // 需要找到图标容器，在容器内添加计时器
                        var $container = $floatingCallIcon.find(
                            ".xiaoxin-floating-call-icon-container"
                        );
                        if ($container.length > 0) {
                            $duration = $(
                                '<div class="xiaoxin-floating-call-duration">00:00</div>'
                            );
                            $container.append($duration);
                        } else {
                            // 如果没有容器，直接添加到悬浮图标
                            $duration = $(
                                '<div class="xiaoxin-floating-call-duration">00:00</div>'
                            );
                            $floatingCallIcon.append($duration);
                        }
                    }
                    $duration.show();
                    // 更新标题
                    $floatingCallIcon.attr("title", "点击进入通话页面");
                    // 更新数据属性
                    $floatingCallIcon.data("isWaiting", false);

                    console.info(
                        "[小馨手机][通话状态] 已更新悬浮按钮样式为通话中状态",
                        "悬浮按钮存在:",
                        $floatingCallIcon.length > 0,
                        "是否可见:",
                        $floatingCallIcon.is(":visible")
                    );
                } else {
                    console.warn(
                        "[小馨手机][通话状态] 悬浮按钮不存在，无法更新样式"
                    );
                }

                console.info(
                    "[小馨手机][通话状态] 已切换到通话中状态，开始计时"
                );
            }
            showCallStatusToast("已接通");

            // 注意：不在角色接听后立即触发灵动岛显示
            // 因为当通话页面显示时，应该隐藏灵动岛通话状态
            // 灵动岛只在通话页面隐藏时（最小化）才显示
        } else if (state === "ended") {
            // 通话中检测到挂断（可能是角色或玩家）
            console.info(
                "[小馨手机][通话状态] 检测到挂断通话（state=ended），即将显示提示并自动挂断",
                detail
            );

            // 计算通话时长：优先使用事件时间戳，回退到本地计时
            var endTimestamp = null;
            if (detail.timestamp) {
                endTimestamp = detail.timestamp;
            } else if (detail.rawTime) {
                var parsedEnd = Date.parse(
                    String(detail.rawTime)
                        .replace(/年|月/g, "/")
                        .replace(/日/, " ")
                );
                if (!isNaN(parsedEnd)) {
                    endTimestamp = parsedEnd;
                }
            }
            var durationOverrideSeconds = 0;
            if (
                endTimestamp &&
                currentCall &&
                currentCall.startTimestampFromEvent
            ) {
                durationOverrideSeconds = Math.max(
                    0,
                    Math.floor(
                        (endTimestamp - currentCall.startTimestampFromEvent) /
                            1000
                    )
                );
            }

            // 判断是谁挂断：from 不是 player 视为角色挂断
            var fromRole =
                detail.from && String(detail.from).toLowerCase() !== "player";
            if (currentCall) {
                currentCall.endedBy = fromRole ? "role" : "player";
            }

            // 注意：不再立即显示"对方已挂断"提示
            // 改为在所有打字机效果完成后再显示（在 checkAndAutoHangup 中处理）

            // 标记通话已结束，等待所有文字内容显示完毕后再自动挂断
            var callId = currentCall ? currentCall.callId : null;
            if (callId) {
                // 延迟一段时间后再标记通话结束，确保挂断前的文本消息有时间被添加到队列
                // 这样可以避免文本消息还没显示完就被挂断的问题
                setTimeout(function () {
                    // 再次检查通话ID是否仍然有效（防止通话已被手动挂断）
                    if (!currentCall || currentCall.callId !== callId) {
                        console.info(
                            "[小馨手机][通话状态] 通话ID已变更或通话已结束，跳过标记结束，原通话ID:",
                            callId
                        );
                        return;
                    }

                    callEndedFlags[callId] = {
                        fromRole: fromRole,
                        durationOverrideSeconds: durationOverrideSeconds,
                        toastShown: false, // 标记是否已显示"对方已挂断"提示
                    };
                    console.info(
                        "[小馨手机][通话状态] 已标记通话结束，等待文字内容显示完毕后自动挂断，通话ID:",
                        callId
                    );
                    // 检查是否可以自动挂断（如果队列为空且没有正在处理的消息）
                    checkAndAutoHangup(callId);
                }, 2000); // 延迟2秒，确保挂断前的文本消息有时间被添加到队列
            } else {
                // 如果没有通话ID，使用旧的逻辑（立即挂断）
                setTimeout(
                    function () {
                        if (currentCall && currentCall.contact) {
                            // 无论谁挂断，都应该生成通话结束消息
                            // 显示侧由 initiator 决定（在 generateCallEndedMessage 中处理）
                            hangupCall(false, durationOverrideSeconds);
                        }
                    },
                    fromRole ? 1200 : 0
                );
            }
        }
    });

    // 显示通话中的界面
    function showActiveCallScreen(contact, options) {
        if (!contact) {
            console.warn("[小馨手机][通话中] 联系人信息为空");
            return;
        }

        var opts = options || {};
        var isWaitingMode = opts.waitingMode === true;
        var callIdFromOpts = opts.callId || null;
        var callDirection = opts.direction || "incoming";

        // 如果已有通话界面，只需要显示它，不要重新创建
        if ($activeCallScreen) {
            // 界面已存在，只需要显示并更新显示
            // 恢复显示和点击事件
            $activeCallScreen.css({
                display: "flex",
                pointerEvents: "auto",
            });
            $activeCallScreen.addClass("show");
            // 隐藏悬浮按钮（当通话页面显示时，不显示悬浮按钮）
            if ($floatingCallIcon) {
                $floatingCallIcon.hide();
            }

            // 隐藏灵动岛通话状态（当通话页面显示时，恢复默认状态）
            if (
                window.XiaoxinDynamicIslandCall &&
                typeof window.XiaoxinDynamicIslandCall.hideCallState ===
                    "function"
            ) {
                window.XiaoxinDynamicIslandCall.hideCallState();
                console.info(
                    "[小馨手机][通话中] 通话页面显示，已隐藏灵动岛通话状态"
                );
            }
            // 等待模式下不更新计时器显示
            if (!isWaitingMode) {
                // 立即更新通话时长显示
                if (callStartTime) {
                    var elapsed = Math.floor(
                        (Date.now() - callStartTime) / 1000
                    );
                    var minutes = Math.floor(elapsed / 60);
                    var seconds = elapsed % 60;
                    var timeStr =
                        String(minutes).padStart(2, "0") +
                        ":" +
                        String(seconds).padStart(2, "0");
                    $activeCallScreen
                        .find(".xiaoxin-active-call-duration")
                        .text(timeStr);
                    // 同时更新悬浮按钮的计时器显示
                    if (
                        $floatingCallIcon &&
                        $floatingCallIcon.hasClass(
                            "xiaoxin-floating-call-icon-active"
                        ) &&
                        !$floatingCallIcon.hasClass(
                            "xiaoxin-floating-call-icon-waiting"
                        )
                    ) {
                        $floatingCallIcon
                            .find(".xiaoxin-floating-call-duration")
                            .text(timeStr);
                    }
                }
                // 确保计时器在运行
                if (!callDurationTimer && callStartTime) {
                    startCallDurationTimer();
                }
            }

            // 恢复显示已保存的消息历史（等待模式下不显示消息）
            if (!isWaitingMode) {
                // 使用 currentCall.callId，而不是通过 messageId 构造
                // 因为 callId 是通过 generateUniqueCallId 生成的唯一ID，不能简单构造
                var callId =
                    currentCall && currentCall.callId
                        ? currentCall.callId
                        : null;
                if (
                    callId &&
                    callMessageHistory[callId] &&
                    callMessageHistory[callId].length > 0
                ) {
                    console.info(
                        "[小馨手机][通话中] 恢复消息历史，通话ID:",
                        callId,
                        "消息数量:",
                        callMessageHistory[callId].length
                    );
                    restoreCallMessages(callId, contact);
                } else {
                    console.info(
                        "[小馨手机][通话中] 无需恢复消息历史，通话ID:",
                        callId,
                        "历史消息数量:",
                        callId && callMessageHistory[callId]
                            ? callMessageHistory[callId].length
                            : 0
                    );
                }

                // 注意：当通话页面显示时，不应该显示灵动岛通话状态
                // 灵动岛只在通话页面隐藏（最小化）时才显示
                // 因此这里不再调用 showCallState
            } else {
                // 等待模式下，重新启动等待文字的打字机效果
                var $waiting = $activeCallScreen.find(
                    ".xiaoxin-active-call-waiting"
                );
                if ($waiting.length === 0) {
                    $waiting = $(
                        '<div class="xiaoxin-active-call-waiting">等待对方接受邀请...</div>'
                    );
                    $activeCallScreen
                        .find(".xiaoxin-active-call-center")
                        .append($waiting);
                }
                clearWaitingTyping();
                var dots = 0;
                waitingTypingTimer = setInterval(function () {
                    dots = (dots + 1) % 4;
                    $waiting.text("等待对方接受邀请" + ".".repeat(dots));
                }, 500);
            }

            console.info("[小馨手机][通话中] 通话界面已存在，恢复显示");
            return;
        }

        // 关闭来电弹窗和全屏页面
        if ($incomingCallDialog) {
            closeIncomingCall();
        }
        if ($incomingCallFullScreen) {
            closeFullScreenCall();
        }

        console.info("[小馨手机][通话中] 显示通话中界面，联系人:", contact);

        // 获取联系人信息
        // 显示名称优先使用备注，这是正确的UI行为
        var contactName =
            contact.remark || contact.nickname || contact.name || "未知";
        var contactAvatar =
            contact.avatar ||
            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";

        // 重要：验证联系人ID字段
        var contactIdForDebug =
            contact.characterId || contact.id || contact.wechatId;
        console.info(
            "[小馨手机][通话中] 联系人ID:",
            contactIdForDebug,
            "显示名称:",
            contactName
        );

        // 更新当前通话信息（方向/ID）
        currentCall = currentCall || {};
        currentCall.callId = callIdFromOpts || currentCall.callId || null;
        currentCall.direction = callDirection;
        currentCall.contact = contact; // 保存联系人信息
        // 初始化发起方：outgoing 视为玩家发起，incoming 视为角色发起
        if (!currentCall.initiator) {
            currentCall.initiator =
                callDirection === "outgoing" ? "player" : "role";
        }
        // 初始化累计文本时长（如果还没有）
        if (currentCall.accumulatedTextDuration === undefined) {
            currentCall.accumulatedTextDuration = 0;
        }

        console.info(
            "[小馨手机][通话中] 更新当前通话信息:",
            "callId:",
            currentCall.callId,
            "direction:",
            currentCall.direction,
            "waitingMode:",
            isWaitingMode
        );

        // 注意：不在 showActiveCallScreen 中触发灵动岛显示
        // 因为当通话页面显示时，应该隐藏灵动岛通话状态
        // 灵动岛只在通话页面隐藏时（最小化）才显示

        // 只有在首次启动通话时才记录开始时间，如果通话已在进行则不重置
        if (!callStartTime && !isWaitingMode) {
            callStartTime = Date.now();
            console.info("[小馨手机][通话中] 通话开始，记录开始时间");
        } else if (!isWaitingMode) {
            console.info(
                "[小馨手机][通话中] 通话已在进行，继续使用原有开始时间"
            );
        } else {
            // 等待模式不计时
            callStartTime = null;
            callStartWorldTime = null;
            callStartWorldRawTime = null;
            stopCallDurationTimer();
        }
        // 如果界面已存在，保持麦克风状态；否则重置
        if (!$activeCallScreen) {
            isMicrophoneMuted = false;
        }

        // 创建通话中界面HTML
        $activeCallScreen = $(
            '<div class="xiaoxin-active-call-screen">' +
                '<div class="xiaoxin-active-call-background"></div>' +
                '<div class="xiaoxin-active-call-content">' +
                // 顶部状态栏
                '<div class="xiaoxin-active-call-header">' +
                '<button class="xiaoxin-active-call-minimize-btn" title="缩小为悬浮按钮">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M19 13H5v-2h14v2z" fill="white"/>' +
                "</svg>" +
                "</button>" +
                '<div class="xiaoxin-active-call-duration">00:00</div>' +
                '<button class="xiaoxin-active-call-invite-btn" title="邀请新的微信好友加入通话">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="white"/>' +
                "</svg>" +
                "</button>" +
                "</div>" +
                // 中间区域：头像和名称
                '<div class="xiaoxin-active-call-center">' +
                '<div class="xiaoxin-active-call-avatar"></div>' +
                '<div class="xiaoxin-active-call-name">' +
                escapeHtml(contactName) +
                "</div>" +
                // 语音通话文本消息显示区域
                '<div class="xiaoxin-active-call-messages"></div>' +
                "</div>" +
                // 底部控制按钮
                // 语音通话输入框（初始隐藏）
                '<div class="xiaoxin-active-call-input-wrapper" style="display: none;">' +
                '<div class="xiaoxin-active-call-input-container">' +
                '<textarea class="xiaoxin-active-call-input" placeholder="输入语音通话内容..." rows="3"></textarea>' +
                '<div class="xiaoxin-active-call-input-actions">' +
                '<button class="xiaoxin-active-call-input-cancel">取消</button>' +
                '<button class="xiaoxin-active-call-input-send">发送</button>' +
                "</div>" +
                "</div>" +
                "</div>" +
                '<div class="xiaoxin-active-call-controls">' +
                '<div class="xiaoxin-active-call-control-item">' +
                '<button class="xiaoxin-active-call-mic-btn" title="麦克风">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="xiaoxin-active-call-mic-icon">' +
                '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" fill="white"/>' +
                '<path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="white"/>' +
                "</svg>" +
                "</button>" +
                '<div class="xiaoxin-active-call-mic-label">点击说话</div>' +
                "</div>" +
                '<div class="xiaoxin-active-call-control-item">' +
                '<button class="xiaoxin-active-call-hangup-btn" title="挂断">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="xiaoxin-active-call-hangup-icon">' +
                '<path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.69.28-.26 0-.51-.1-.69-.28L.28 12.28c-.18-.18-.28-.43-.28-.69s.1-.51.28-.69C3.34 8.78 7.46 7.5 12 7.5s8.66 1.28 11.72 3.4c.18.18.28.43.28.69s-.1.51-.28.69l-2.13 2.13c-.18.18-.43.28-.69.28-.26 0-.51-.1-.69-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" fill="white"/>' +
                "</svg>" +
                "</button>" +
                '<div class="xiaoxin-active-call-hangup-label">挂断</div>' +
                "</div>" +
                "</div>" +
                "</div>" +
                "</div>"
        );

        // 设置背景头像（模糊效果）
        $activeCallScreen
            .find(".xiaoxin-active-call-background")
            .css("background-image", "url(" + contactAvatar + ")");

        // 设置头像
        $activeCallScreen
            .find(".xiaoxin-active-call-avatar")
            .css("background-image", "url(" + contactAvatar + ")");

        // 初始化语音通话文本消息监听
        initCallMessageListener(contact);

        // 添加到页面（添加到手机屏幕容器中）
        var $phoneScreen = $(".xiaoxin-phone-screen");
        if ($phoneScreen.length === 0) {
            $phoneScreen = $(".xiaoxin-phone-container");
            if ($phoneScreen.length === 0) {
                $phoneScreen = $(".mobile-phone-container");
                if ($phoneScreen.length === 0) {
                    $phoneScreen = $("body");
                    $activeCallScreen.css("position", "fixed");
                }
            }
        }
        $phoneScreen.append($activeCallScreen);

        // 显示界面动画
        setTimeout(function () {
            // 确保显示和点击事件可用
            $activeCallScreen.css({
                display: "flex",
                pointerEvents: "auto",
            });
            $activeCallScreen.addClass("show");
            // 隐藏悬浮按钮（当通话页面显示时，不显示悬浮按钮）
            if ($floatingCallIcon) {
                $floatingCallIcon.hide();
            }

            // 隐藏灵动岛通话状态（当通话页面显示时，恢复默认状态）
            if (
                window.XiaoxinDynamicIslandCall &&
                typeof window.XiaoxinDynamicIslandCall.hideCallState ===
                    "function"
            ) {
                window.XiaoxinDynamicIslandCall.hideCallState();
                console.info(
                    "[小馨手机][通话中] 通话页面显示，已隐藏灵动岛通话状态"
                );
            }
        }, 10);

        // 等待模式：隐藏计时/邀请，显示等待文字，保留最小化按钮
        if (isWaitingMode) {
            $activeCallScreen.addClass("waiting-call");
            $activeCallScreen.find(".xiaoxin-active-call-duration").hide();
            $activeCallScreen.find(".xiaoxin-active-call-invite-btn").hide();
            // 等待模式下保留最小化按钮，用于隐藏页面显示悬浮按钮
            // $activeCallScreen.find(".xiaoxin-active-call-minimize-btn").hide();
            $activeCallScreen.find(".xiaoxin-active-call-input-wrapper").hide();
            $activeCallScreen.find(".xiaoxin-active-call-messages").hide();

            var $waiting = $(
                '<div class="xiaoxin-active-call-waiting">等待对方接受邀请...</div>'
            );
            $activeCallScreen
                .find(".xiaoxin-active-call-center")
                .append($waiting);

            clearWaitingTyping();
            var dots = 0;
            waitingTypingTimer = setInterval(function () {
                dots = (dots + 1) % 4;
                $waiting.text("等待对方接受邀请" + ".".repeat(dots));
            }, 500);
        } else {
            clearWaitingTyping();
        }

        // 启动或恢复通话时长计时器（等待模式不计时）
        if (!isWaitingMode) {
            if (!callDurationTimer && callStartTime) {
                startCallDurationTimer();
            } else if (callDurationTimer && callStartTime) {
                var elapsed = Math.floor((Date.now() - callStartTime) / 1000);
                var minutes = Math.floor(elapsed / 60);
                var seconds = elapsed % 60;
                var timeStr =
                    String(minutes).padStart(2, "0") +
                    ":" +
                    String(seconds).padStart(2, "0");
                $activeCallScreen
                    .find(".xiaoxin-active-call-duration")
                    .text(timeStr);
                if (
                    $floatingCallIcon &&
                    $floatingCallIcon.hasClass(
                        "xiaoxin-floating-call-icon-active"
                    )
                ) {
                    $floatingCallIcon
                        .find(".xiaoxin-floating-call-duration")
                        .text(timeStr);
                }
            } else {
                startCallDurationTimer();
            }
        } else {
            stopCallDurationTimer();
        }

        // 绑定缩小按钮事件
        $activeCallScreen
            .find(".xiaoxin-active-call-minimize-btn")
            .on("click", function (e) {
                e.stopPropagation();
                console.info("[小馨手机][通话中] 用户点击缩小");
                minimizeActiveCall(contact, isWaitingMode);
            });

        // 绑定邀请按钮事件
        $activeCallScreen
            .find(".xiaoxin-active-call-invite-btn")
            .on("click", function (e) {
                e.stopPropagation();
                console.info("[小馨手机][通话中] 用户点击邀请好友");
                // TODO: 实现邀请好友功能
                if (window.toastr) {
                    toastr.info("邀请好友功能开发中", "小馨手机");
                }
            });

        // 绑定麦克风按钮事件（显示输入框）
        $activeCallScreen
            .find(".xiaoxin-active-call-mic-btn")
            .on("click", function (e) {
                e.stopPropagation();
                showCallInput(contact);
            });

        // 绑定挂断按钮事件
        $activeCallScreen
            .find(".xiaoxin-active-call-hangup-btn")
            .on("click", function (e) {
                e.stopPropagation();
                console.info("[小馨手机][通话中] 用户点击挂断");
                // 标记为玩家主动挂断
                if (!currentCall) {
                    currentCall = {};
                }
                currentCall.endedBy = "player";
                if (currentCall.accumulatedTextDuration === undefined) {
                    currentCall.accumulatedTextDuration = 0; // 确保有累计时长字段
                }
                hangupCall();
            });

        // 绑定输入框事件
        var $inputWrapper = $activeCallScreen.find(
            ".xiaoxin-active-call-input-wrapper"
        );
        var $input = $inputWrapper.find(".xiaoxin-active-call-input");
        var $cancelBtn = $inputWrapper.find(
            ".xiaoxin-active-call-input-cancel"
        );
        var $sendBtn = $inputWrapper.find(".xiaoxin-active-call-input-send");

        // 取消按钮
        $cancelBtn.on("click", function (e) {
            e.stopPropagation();
            hideCallInput();
        });

        // 发送按钮
        $sendBtn.on("click", function (e) {
            e.stopPropagation();
            var text = $input.val() || "";
            if (text.trim()) {
                sendCallVoiceText(contact, text);
            } else {
                hideCallInput();
            }
        });

        // 输入框回车发送（Shift+Enter换行）
        $input.on("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                var text = $input.val() || "";
                if (text.trim()) {
                    sendCallVoiceText(contact, text);
                } else {
                    hideCallInput();
                }
            }
        });

        // 点击输入框外部区域关闭
        $inputWrapper.on("click", function (e) {
            if ($(e.target).hasClass("xiaoxin-active-call-input-wrapper")) {
                hideCallInput();
            }
        });
    }

    // 关闭通话中界面
    function closeActiveCallScreen(shouldStopTimer) {
        // 清理消息监听器
        cleanupCallMessageListener();
        clearWaitingTyping();

        if ($activeCallScreen) {
            $activeCallScreen.removeClass("show");
            // 隐藏时设置 display: none 和 pointer-events: none，确保不会阻挡其他元素的点击
            $activeCallScreen.css({
                display: "none",
                pointerEvents: "none",
            });
            // 只有在真正挂断时才删除DOM元素，隐藏时保留DOM以便恢复消息
            if (shouldStopTimer) {
                // 重置通话时间
                callStartTime = null;
                callStartWorldTime = null;
                callStartWorldRawTime = null;
                hangupCommandGenerated = false;
                rejectedMessageGenerated = false;
                // 清除待执行的定时器
                if (rejectedMessageTimer) {
                    clearTimeout(rejectedMessageTimer);
                    rejectedMessageTimer = null;
                }
                setTimeout(function () {
                    if ($activeCallScreen) {
                        $activeCallScreen.remove();
                        $activeCallScreen = null;
                    }
                }, 300);
            }
        }
        // 如果只是隐藏界面（不停止计时器），显示悬浮按钮和灵动岛
        if (!shouldStopTimer) {
            // 显示悬浮按钮（当通话页面隐藏时，显示悬浮按钮）
            if ($floatingCallIcon) {
                $floatingCallIcon.show();
            }

            // 显示灵动岛通话状态（当通话页面隐藏时，显示灵动岛）
            if (
                currentCall &&
                currentCall.contact &&
                window.XiaoxinDynamicIslandCall
            ) {
                if (
                    typeof window.XiaoxinDynamicIslandCall.showCallState ===
                    "function"
                ) {
                    window.XiaoxinDynamicIslandCall.showCallState(
                        currentCall.contact
                    );
                    console.info(
                        "[小馨手机][通话中] 通话页面隐藏，已显示灵动岛通话状态",
                        currentCall.contact
                    );
                }
            }
        }
        // 只有明确要求停止计时器时才停止（比如挂断通话）
        if (shouldStopTimer) {
            stopCallDurationTimer();
        }
        // 否则计时器继续运行，即使界面被隐藏（仅用于显示，不影响实际通话时长）
    }

    // 启动通话时长计时器
    function startCallDurationTimer() {
        if (callDurationTimer) {
            clearInterval(callDurationTimer);
        }
        callDurationTimer = setInterval(function () {
            if (callStartTime) {
                var elapsed = Math.floor((Date.now() - callStartTime) / 1000);
                var minutes = Math.floor(elapsed / 60);
                var seconds = elapsed % 60;
                var timeStr =
                    String(minutes).padStart(2, "0") +
                    ":" +
                    String(seconds).padStart(2, "0");
                // 如果通话页面存在，更新显示
                if ($activeCallScreen) {
                    $activeCallScreen
                        .find(".xiaoxin-active-call-duration")
                        .text(timeStr);
                }
                // 如果悬浮按钮存在且是通话中状态，更新悬浮按钮的计时器显示
                if (
                    $floatingCallIcon &&
                    $floatingCallIcon.hasClass(
                        "xiaoxin-floating-call-icon-active"
                    )
                ) {
                    $floatingCallIcon
                        .find(".xiaoxin-floating-call-duration")
                        .text(timeStr);
                }
            }
        }, 1000);
    }

    // 停止通话时长计时器
    function stopCallDurationTimer() {
        if (callDurationTimer) {
            clearInterval(callDurationTimer);
            callDurationTimer = null;
        }
        callStartTime = null;
        callStartWorldTime = null;
        callStartWorldRawTime = null;
        hangupCommandGenerated = false;
        rejectedMessageGenerated = false;
        // 清除待执行的定时器
        if (rejectedMessageTimer) {
            clearTimeout(rejectedMessageTimer);
            rejectedMessageTimer = null;
        }
    }

    // 显示语音通话输入框
    function showCallInput(contact) {
        if (!$activeCallScreen || !$activeCallScreen.hasClass("show")) {
            return;
        }

        var $inputWrapper = $activeCallScreen.find(
            ".xiaoxin-active-call-input-wrapper"
        );
        var $input = $inputWrapper.find(".xiaoxin-active-call-input");

        // 显示输入框
        $inputWrapper.fadeIn(200);
        // 聚焦到输入框
        setTimeout(function () {
            $input.focus();
        }, 250);
    }

    // 隐藏语音通话输入框
    function hideCallInput() {
        if (!$activeCallScreen) {
            return;
        }

        var $inputWrapper = $activeCallScreen.find(
            ".xiaoxin-active-call-input-wrapper"
        );
        var $input = $inputWrapper.find(".xiaoxin-active-call-input");

        // 清空输入内容
        $input.val("");
        // 隐藏输入框
        $inputWrapper.fadeOut(200);
    }

    // 发送语音通话文本消息
    function sendCallVoiceText(contact, text) {
        if (!contact || !text || !text.trim()) {
            return;
        }

        var characterId = contact.characterId || contact.id || "";

        // 优先使用 currentCall.callId（玩家主动发起的通话）
        var callId = null;
        if (currentCall && currentCall.callId) {
            callId = currentCall.callId;
            console.info("[小馨手机][通话中] 使用当前通话的 callId:", callId);
        } else {
            // 如果没有 callId，尝试使用 messageId（角色发起的通话）
            var messageId =
                contact._incomingCallMessageId ||
                (currentCall && currentCall.messageId) ||
                "";

            if (!messageId) {
                console.warn(
                    "[小馨手机][通话中] 未找到消息ID或通话ID，无法发送语音通话文本消息",
                    "currentCall:",
                    currentCall
                );
                return;
            }

            callId = "call_" + messageId;
            console.info(
                "[小馨手机][通话中] 使用消息ID生成 callId:",
                "messageId:",
                messageId,
                "callId:",
                callId
            );
        }

        // 生成消息ID
        var voiceTextId =
            "wxid_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 9);

        // 获取世界观时间（用于计算基准时间戳）
        var worldTime = Date.now();
        var rawTime = "";
        if (window.XiaoxinWorldClock) {
            worldTime = window.XiaoxinWorldClock.currentTimestamp || Date.now();
            rawTime =
                window.XiaoxinWorldClock.rawTime ||
                window.XiaoxinWorldClock.raw ||
                "";
        }

        // 计算基准时间戳（用于字数动态时间推进）
        // 1. 获取最后一条消息的时间戳
        var lastMessageTimestamp = 0;
        var contactId = contact.id || contact.wechatId || characterId;
        if (window.XiaoxinWeChatDataHandler && contactId) {
            try {
                var chatMessages = window.XiaoxinWeChatDataHandler.getChatMessages(contactId);
                if (chatMessages && chatMessages.length > 0) {
                    // 找到最后一条消息（按时间戳排序）
                    var sortedMessages = chatMessages.slice().sort(function(a, b) {
                        return (b.timestamp || 0) - (a.timestamp || 0);
                    });
                    if (sortedMessages[0] && sortedMessages[0].timestamp) {
                        lastMessageTimestamp = sortedMessages[0].timestamp;
                    }
                }
            } catch (e) {
                console.warn("[小馨手机][通话中] 获取最后一条消息时间戳失败:", e);
            }
        }

        // 2. 从输入框中获取最后一个 [time] 标签时间（若存在）
        var inputTimeTimestamp = null;
        try {
            var tavernInputForTime = document.getElementById("send_textarea");
            if (!tavernInputForTime) {
                var inputSelectors = [
                    "#send_textarea textarea",
                    "textarea#send_textarea",
                    "#send_textarea_mobile",
                    ".send_textarea",
                    "#message_in",
                    "#user-input",
                ];
                for (var i = 0; i < inputSelectors.length; i++) {
                    tavernInputForTime = document.querySelector(inputSelectors[i]);
                    if (tavernInputForTime) break;
                }
            }
            if (tavernInputForTime && tavernInputForTime.value) {
                var inputText = String(tavernInputForTime.value);
                var timeRe = /\[time\]([\s\S]*?)\[\/time\]/gi;
                var matchTime;
                var lastTimeStr = "";
                while ((matchTime = timeRe.exec(inputText)) !== null) {
                    lastTimeStr = matchTime[1] || "";
                }
                if (lastTimeStr) {
                    var normalizedInputTimeStr = lastTimeStr
                        .replace(/-/g, "/")
                        .replace(/年/g, "/")
                        .replace(/月/g, "/")
                        .replace(/日/g, " ")
                        .replace(/星期[一二三四五六日]/g, "")
                        .trim();
                    var parsedInputTs = Date.parse(normalizedInputTimeStr);
                    if (!isNaN(parsedInputTs)) {
                        inputTimeTimestamp = parsedInputTs;
                    }
                }
            }
        } catch (e) {
            console.warn("[小馨手机][通话中] 从输入框解析 [time] 标签失败:", e);
        }

        // 3. 计算基准时间戳（取最大值）
        var baseTimestamp = worldTime;
        if (lastMessageTimestamp > baseTimestamp) {
            baseTimestamp = lastMessageTimestamp;
        }
        if (inputTimeTimestamp && inputTimeTimestamp > baseTimestamp) {
            baseTimestamp = inputTimeTimestamp;
        }

        // 4. 按字数动态追加时间：参考 100 字/分钟 ≈ 每字符 0.6 秒
        var charsPerMinute = 100;
        var chars = text.trim().length;
        var estimatedMs = Math.round((chars / charsPerMinute) * 60000);
        // 设定上下限：至少 5 秒，最多 5 分钟，避免极端值
        var minMs = 5000;
        var maxMs = 5 * 60 * 1000;
        if (estimatedMs < minMs) estimatedMs = minMs;
        if (estimatedMs > maxMs) estimatedMs = maxMs;

        var nextTimestamp = baseTimestamp + estimatedMs;
        var nextDate = new Date(nextTimestamp);

        // 5. 格式化时间字符串
        var timeStr = "";
        if (rawTime) {
            // 如果有世界观时间，需要根据时间推进量更新它
            // 这里简化处理：直接使用计算出的时间戳格式化
            var year = nextDate.getFullYear();
            var month = String(nextDate.getMonth() + 1).padStart(2, "0");
            var day = String(nextDate.getDate()).padStart(2, "0");
            var hours = String(nextDate.getHours()).padStart(2, "0");
            var minutes = String(nextDate.getMinutes()).padStart(2, "0");
            var seconds = String(nextDate.getSeconds()).padStart(2, "0");
            timeStr = year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds;
        } else {
            var year = nextDate.getFullYear();
            var month = String(nextDate.getMonth() + 1).padStart(2, "0");
            var day = String(nextDate.getDate()).padStart(2, "0");
            var hours = String(nextDate.getHours()).padStart(2, "0");
            var minutes = String(nextDate.getMinutes()).padStart(2, "0");
            var seconds = String(nextDate.getSeconds()).padStart(2, "0");
            timeStr = year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds;
        }

        console.info(
            "[小馨手机][通话中] 语音通话文本消息时间推进:",
            "文本长度:", chars,
            "基准时间戳:", baseTimestamp,
            "推进时间(ms):", estimatedMs,
            "最终时间戳:", nextTimestamp,
            "时间字符串:", timeStr
        );

        // 获取玩家信息
        var playerId = "player";
        var playerNickname = "玩家";
        var currentAccount = null;
        if (window.XiaoxinWeChatAccount) {
            currentAccount = window.XiaoxinWeChatAccount.getCurrentAccount();
        } else if (window.XiaoxinWeChatDataHandler) {
            currentAccount = window.XiaoxinWeChatDataHandler.getAccount();
        }
        if (currentAccount) {
            playerId = currentAccount.wechatId || currentAccount.id || "player";
            playerNickname =
                currentAccount.nickname || currentAccount.name || "玩家";
        }

            // 构建消息对象（待发送状态）
        var pendingMessage = {
            id: voiceTextId,
            type: "call_voice_text",
            content: text.trim(),
            text: text.trim(),
            timestamp: nextTimestamp, // 使用计算出的时间戳
            rawTime: timeStr, // 使用计算出的时间字符串
            sender: playerNickname,
            isOutgoing: true,
            isPending: true, // 标记为待发送状态
            from: playerId,
            to: characterId,
            call_id: callId,
            callId: callId,
        };

        // 立即显示在通话页面的消息列表中（待发送状态）
        displayCallVoiceTextMessage(pendingMessage, characterId, callId);

        // 构建指令格式
        // 玩家在通话中发送语音转写文本：使用字数动态时间推进后的时间
        var command = `[MSG]
id=${voiceTextId}
time=${timeStr}
from=user
to=${characterId}
type=call_voice_text
call_id=${callId}
text=${text.trim()}
[/MSG]
[time]${timeStr}[/time]`;

        // 插入到酒馆输入框（不自动发送，和角色主动来电的发送消息逻辑一样）
        // 使用和 chat.js 中 appendCommandToInput 一样的逻辑，只插入不发送
        var inserted = false;
        try {
            var tavernInput = document.getElementById("send_textarea");
            if (!tavernInput) {
                var inputSelectors = [
                    "#send_textarea textarea",
                    "textarea#send_textarea",
                    "#send_textarea_mobile",
                    ".send_textarea",
                    "#message_in",
                    "#user-input",
                ];
                for (var i = 0; i < inputSelectors.length; i++) {
                    tavernInput = document.querySelector(inputSelectors[i]);
                    if (tavernInput) {
                        break;
                    }
                }
            }

            if (tavernInput) {
                // 获取当前输入框内容
                var currentText = tavernInput.value || "";

                // 如果当前内容不为空，添加换行
                if (currentText.trim()) {
                    currentText += "\n";
                }

                // 追加新指令
                currentText += command;

                // 设置输入框的值（只设置值，不触发任何可能自动发送的事件）
                tavernInput.value = currentText;

                // 只触发 input 和 change 事件，不触发 keydown/keypress/keyup 等可能触发发送的事件
                // 也不聚焦输入框，避免意外触发发送
                tavernInput.dispatchEvent(
                    new Event("input", { bubbles: true })
                );
                tavernInput.dispatchEvent(
                    new Event("change", { bubbles: true })
                );

                inserted = true;
                console.info(
                    "[小馨手机][通话中] 已插入语音通话文本指令到酒馆输入框（不自动发送），消息ID:",
                    voiceTextId
                );
            } else {
                console.warn(
                    "[小馨手机][通话中] 未找到酒馆输入框，无法插入指令"
                );
            }
        } catch (e) {
            console.error(
                "[小馨手机][通话中] 插入语音通话文本指令到酒馆输入框失败:",
                e
            );
        }

        // 隐藏输入框
        hideCallInput();
    }

    // 切换麦克风状态（保留用于其他用途）
    function toggleMicrophone() {
        isMicrophoneMuted = !isMicrophoneMuted;
        var $micBtn = $activeCallScreen.find(".xiaoxin-active-call-mic-btn");
        var $micLabel = $activeCallScreen.find(
            ".xiaoxin-active-call-mic-label"
        );
        var $micIcon = $activeCallScreen.find(".xiaoxin-active-call-mic-icon");

        if (isMicrophoneMuted) {
            $micBtn.addClass("muted");
            $micLabel.text("点击说话");
            $micIcon.css("opacity", "0.5");
            console.info("[小馨手机][通话中] 麦克风已关闭");
        } else {
            $micBtn.removeClass("muted");
            $micLabel.text("点击说话");
            $micIcon.css("opacity", "1");
            console.info("[小馨手机][通话中] 麦克风已开启");
        }
    }

    // 挂断通话
    function hangupCall(skipEndedMessage, durationOverrideSeconds) {
        // skipEndedMessage: 如果为 true，则跳过生成通话结束消息（用于拒绝/未响应的情况）
        if (!currentCall || !currentCall.contact) {
            console.warn("[小馨手机][通话中] 挂断通话时，当前通话信息为空");
            // 仍然执行清理操作
            closeActiveCallScreen(true);
            if (window.XiaoxinDynamicIslandCall) {
                if (
                    typeof window.XiaoxinDynamicIslandCall.hideCallState ===
                    "function"
                ) {
                    window.XiaoxinDynamicIslandCall.hideCallState();
                }
            }
            return;
        }

        var contact = currentCall.contact;
        var contactId = contact.id || contact.wechatId || "";
        var callDirection = currentCall.direction || "incoming";

        // 计算通话时长（秒）
        // 优先使用本地实时计时（玩家眼睛能看到的通话时长），
        // 只有在本地开始时间缺失时，才回退到事件时间戳传入的 durationOverrideSeconds。
        var callDurationSeconds = 0;
        if (callStartTime) {
            callDurationSeconds = Math.max(
                0,
                Math.floor((Date.now() - callStartTime) / 1000)
            );
        } else if (typeof durationOverrideSeconds === "number") {
            callDurationSeconds = Math.max(0, durationOverrideSeconds);
        }

        // 格式化通话时长为 MM:SS
        var minutes = Math.floor(callDurationSeconds / 60);
        var seconds = callDurationSeconds % 60;
        var durationStr =
            String(minutes).padStart(2, "0") +
            ":" +
            String(seconds).padStart(2, "0");

        console.info("[小馨手机][通话中] 挂断通话", {
            contactId: contactId,
            callDirection: callDirection,
            duration: durationStr,
            callDurationSeconds: callDurationSeconds,
        });

        // 获取当前世界观时间
        var currentTime = window.XiaoxinWorldClock
            ? window.XiaoxinWorldClock.now()
            : new Date();
        var currentTimestamp = currentTime.getTime();
        var currentRawTime = window.XiaoxinWorldClock
            ? window.XiaoxinWorldClock.rawTime
            : null;

        // 如果没有世界观时间，使用现实时间格式化（确保精确到秒）
        if (!currentRawTime) {
            var year = currentTime.getFullYear();
            var month = String(currentTime.getMonth() + 1).padStart(2, "0");
            var day = String(currentTime.getDate()).padStart(2, "0");
            var hours = String(currentTime.getHours()).padStart(2, "0");
            var minutes = String(currentTime.getMinutes()).padStart(2, "0");
            var seconds = String(currentTime.getSeconds()).padStart(2, "0");
            currentRawTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } else {
            // 确保世界观时间也包含秒（如果格式不完整，补充秒）
            // 检查格式是否为 YYYY-MM-DD HH:mm:ss 或类似格式
            if (
                currentRawTime &&
                !currentRawTime.match(
                    /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日\s]\d{1,2}:\d{2}:\d{2}/
                )
            ) {
                // 如果格式不包含秒，尝试解析并补充
                var timeMatch = currentRawTime.match(
                    /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日\s]\d{1,2}:\d{2})/
                );
                if (timeMatch) {
                    var seconds = String(currentTime.getSeconds()).padStart(
                        2,
                        "0"
                    );
                    currentRawTime = timeMatch[1] + ":" + seconds;
                }
            }
        }

        // 计算通话时长（基于世界观时间和文本内容）
        var worldCallDurationSeconds = 0;

        // 优先使用累计的文本时长（根据文本内容计算，更准确）
        if (currentCall && currentCall.accumulatedTextDuration) {
            worldCallDurationSeconds = currentCall.accumulatedTextDuration;
            console.info(
                "[小馨手机][通话时长] 使用累计文本时长:",
                worldCallDurationSeconds
            );
        } else if (callDurationSeconds > 0) {
            // 如果已有本地精确通话时长，优先直接使用（与玩家在界面上看到的计时保持一致）
            worldCallDurationSeconds = callDurationSeconds;
        } else if (callStartWorldTime) {
            // 回退：根据世界观时间估算通话时长（主要用于页面刷新后本地开始时间丢失的情况）
            worldCallDurationSeconds = Math.max(
                0,
                Math.floor((currentTimestamp - callStartWorldTime) / 1000)
            );
        } else if (callStartTime) {
            // 最后兜底：使用现实时间计算
            worldCallDurationSeconds = Math.max(0, callDurationSeconds);
        }

        // 格式化世界观通话时长为 MM:SS
        var worldMinutes = Math.floor(worldCallDurationSeconds / 60);
        var worldSeconds = worldCallDurationSeconds % 60;
        var worldDurationStr =
            String(worldMinutes).padStart(2, "0") +
            ":" +
            String(worldSeconds).padStart(2, "0");

        // 生成消息ID
        var messageId =
            "wx_call_ended_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 9);

        // 判断是语音通话还是视频通话
        var callType =
            currentCall && currentCall.callType
                ? currentCall.callType
                : "call_voice";

        // 获取通话ID
        var callId = currentCall.callId || "";

        // 仅当不是“角色挂断”时，才向酒馆输入框写入挂断指令
        var shouldGenerateHangupCommand =
            !currentCall || currentCall.endedBy !== "role";

        // 检查是否已生成过挂断指令（防止重复生成）
        if (shouldGenerateHangupCommand) {
            if (hangupCommandGenerated) {
                console.info(
                    "[小馨手机][通话中] 挂断指令已生成过，跳过重复生成"
                );
            } else {
                // 生成挂断指令（包含时间标签和通话时长）
                var hangupCommand =
                    "[MSG]\n" +
                    "id=" +
                    messageId +
                    "\n" +
                    "type=" +
                    callType +
                    "\n" +
                    "state=ended\n" +
                    "call_id=" +
                    callId +
                    "\n" +
                    "duration=" +
                    worldCallDurationSeconds +
                    "\n";
                if (currentRawTime) {
                    hangupCommand +=
                        "[TIME:" + currentRawTime + "]\n" + "[/TIME]\n";
                }
                hangupCommand += "from=user\n";
                if (contact.characterId || contact.id) {
                    hangupCommand +=
                        "to=" + (contact.characterId || contact.id) + "\n";
                }
                hangupCommand += "[/MSG]";

                // 追加或替换挂断指令到酒馆输入框（不发送）
                try {
                    var tavernInput = document.getElementById("send_textarea");
                    if (!tavernInput) {
                        var inputSelectors = [
                            "#send_textarea textarea",
                            "textarea#send_textarea",
                            "#send_textarea_mobile",
                            ".send_textarea",
                            "#message_in",
                            "#user-input",
                        ];
                        for (var i = 0; i < inputSelectors.length; i++) {
                            tavernInput = document.querySelector(
                                inputSelectors[i]
                            );
                            if (tavernInput) break;
                        }
                    }
                    if (tavernInput) {
                        var currentText = tavernInput.value || "";

                        // ⚠️ 重要：挂断指令应该输入到最后一步（在所有语音通话文本内容之后）
                        // 检查输入框中是否已有相同 call_id 的挂断指令
                        // 使用正则表达式匹配 [MSG]...call_id=callId...[/MSG] 块
                        var callIdPattern = new RegExp(
                            "call_id\\s*=\\s*" +
                                callId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                            "i"
                        );
                        var msgBlockPattern = /\[MSG\][\s\S]*?\[\/MSG\]/g;
                        var hasExistingCommand = false;
                        var newText = currentText;

                        // 查找所有 [MSG]...[/MSG] 块
                        var matches = currentText.match(msgBlockPattern);
                        if (matches) {
                            for (var j = 0; j < matches.length; j++) {
                                var msgBlock = matches[j];
                                // 检查是否包含相同的 call_id 且是挂断指令（state=ended）
                                if (callIdPattern.test(msgBlock) && msgBlock.indexOf("state=ended") !== -1) {
                                    // 替换这个块为新的挂断指令
                                    newText = newText.replace(
                                        msgBlock,
                                        hangupCommand
                                    );
                                    hasExistingCommand = true;
                                    console.info(
                                        "[小馨手机][通话中] 找到已有的挂断指令，已替换",
                                        "call_id:",
                                        callId
                                    );
                                    break;
                                }
                            }
                        }

                        // 如果没有找到已有的挂断指令，则追加到最后（确保在所有语音通话文本内容之后）
                        if (!hasExistingCommand) {
                            // 移除所有已有的相同 call_id 的挂断指令（如果有的话，避免重复）
                            var allMsgBlocks = currentText.match(msgBlockPattern);
                            if (allMsgBlocks) {
                                for (var k = 0; k < allMsgBlocks.length; k++) {
                                    var msgBlock = allMsgBlocks[k];
                                    if (callIdPattern.test(msgBlock) && msgBlock.indexOf("state=ended") !== -1) {
                                        newText = newText.replace(msgBlock, "");
                                    }
                                }
                            }
                            
                            // 追加挂断指令到最后
                            if (newText.trim()) {
                                newText = newText.trim() + "\n" + hangupCommand;
                            } else {
                                newText = hangupCommand;
                            }
                            console.info(
                                "[小馨手机][通话中] 挂断指令已追加到最后（在所有语音通话文本内容之后）",
                                "call_id:",
                                callId
                            );
                        }

                        // 设置输入框的值
                        tavernInput.value = newText;
                        tavernInput.dispatchEvent(
                            new Event("input", { bubbles: true })
                        );

                        // 标记已生成挂断指令
                        hangupCommandGenerated = true;
                        console.info(
                            "[小馨手机][通话中] 挂断指令已处理（替换或追加）到酒馆输入框"
                        );
                    } else {
                        console.warn(
                            "[小馨手机][通话中] 未找到酒馆输入框，无法插入挂断指令"
                        );
                    }
                } catch (e) {
                    console.error("[小馨手机][通话中] 处理挂断指令失败:", e);
                }
            }
        }

        // 生成通话结束消息并显示在聊天页面（除非跳过）
        if (!skipEndedMessage) {
            generateCallEndedMessage(contact, worldCallDurationSeconds, callDirection);
        }

        // 清理通话数据（包括消息历史）
        if (currentCall && currentCall.callId) {
            cleanupCallData(currentCall.callId);
        }

        // 重置通话时间
        callStartTime = null;
        callStartWorldTime = null;
        callStartWorldRawTime = null;
        hangupCommandGenerated = false;
        rejectedMessageGenerated = false;
        // 清除待执行的定时器
        if (rejectedMessageTimer) {
            clearTimeout(rejectedMessageTimer);
            rejectedMessageTimer = null;
        }

        // 关闭界面并停止计时器
        closeActiveCallScreen(true);

        // 隐藏灵动岛通话状态
        if (window.XiaoxinDynamicIslandCall) {
            if (
                typeof window.XiaoxinDynamicIslandCall.hideCallState ===
                "function"
            ) {
                window.XiaoxinDynamicIslandCall.hideCallState();
                console.info("[小馨手机][通话中] 已隐藏灵动岛通话状态");
            }
        }

        console.info("[小馨手机][通话中] 通话已挂断");
    }

    // 缩小为悬浮按钮
    function minimizeActiveCall(contact, isWaitingMode) {
        // 如果通话已接通（不再是等待模式），更新 isWaitingMode
        if (currentCall && currentCall.direction !== "outgoing") {
            isWaitingMode = false;
        }
        // 关闭界面但不停止计时器，计时器继续运行
        closeActiveCallScreen(false);
        // 显示悬浮图标，标记为通话中状态或等待接听状态
        showFloatingCallIcon(contact, true, isWaitingMode);

        // 同步更新灵动岛通话状态（尤其是角色发起的来电被接听后）
        // 这里直接使用联系人信息，而不是依赖 closeActiveCallScreen 内的 currentCall
        if (window.XiaoxinDynamicIslandCall) {
            try {
                if (
                    typeof window.XiaoxinDynamicIslandCall.showCallState ===
                    "function"
                ) {
                    window.XiaoxinDynamicIslandCall.showCallState(
                        contact || (currentCall && currentCall.contact) || {}
                    );
                    console.info(
                        "[小馨手机][通话中] 缩小通话界面后，已主动刷新灵动岛通话状态"
                    );
                }
            } catch (e) {
                console.warn(
                    "[小馨手机][通话中] 缩小通话界面时刷新灵动岛通话状态出错:",
                    e
                );
            }
        }
    }

    // 语音通话文本消息监听器
    var callMessageObserver = null; // MutationObserver
    var callMessageListenerInterval = null;
    var lastProcessedMessageIds = {}; // 记录已处理的消息ID，避免重复显示
    var lastProcessedMessageContents = {}; // 记录已处理的消息内容（基于文本内容），避免重复显示
    // ⚠️ 重要：记录每个消息ID对应的内容哈希和sourceMessageId，用于检测楼层重新生成
    var messageSourceInfo = {}; // callId -> Map(messageId -> { contentHash, sourceId })
    var callMessageQueue = {}; // 消息队列，按通话ID分组，逐条显示
    // 记录已计入通话时长的消息ID，避免刷新/重复解析导致累计时长膨胀
    var durationCountedMessageIds = {}; // callId -> Set(message.id)
    var callMessageQueueProcessing = {}; // 标记每个通话ID是否正在处理队列
    var callMessageHistory = {}; // 消息历史记录，按通话ID分组，用于持久化显示
    var callEndedFlags = {}; // 标记每个通话ID是否已收到结束消息（state=ended）
    var callEndedAutoHangupTimers = {}; // 存储每个通话ID的自动挂断定时器
    var usedCallIds = null; // 缓存所有已使用的通话ID（null表示未初始化）

    // ========== 获取所有已使用的通话ID（从所有聊天历史中提取） ==========
    function getAllUsedCallIds() {
        // 总是从数据源获取最新的已使用ID列表，确保不会重复
        // 不使用缓存，因为新消息可能在其他地方被添加
        var allUsedCallIds = new Set();

        try {
            if (window.XiaoxinWeChatDataHandler) {
                // 获取所有聊天记录
                var allChats = window.XiaoxinWeChatDataHandler.getAllChats();
                if (allChats && typeof allChats === "object") {
                    Object.keys(allChats).forEach(function (userId) {
                        try {
                            // 获取该用户的所有消息
                            var messages =
                                window.XiaoxinWeChatDataHandler.getChatMessages(
                                    userId
                                ) || [];
                            messages.forEach(function (msg) {
                                // 提取通话ID（支持多种字段名）
                                var callId =
                                    msg.call_id ||
                                    msg.callId ||
                                    msg.callWith ||
                                    null;
                                if (callId && typeof callId === "string") {
                                    allUsedCallIds.add(callId);
                                }
                            });
                        } catch (e) {
                            console.warn(
                                "[小馨手机][通话ID] 获取用户聊天记录时出错:",
                                userId,
                                e
                            );
                        }
                    });
                }
            }
        } catch (e) {
            console.warn("[小馨手机][通话ID] 获取所有已使用通话ID时出错:", e);
        }

        console.info(
            "[小馨手机][通话ID] 已加载所有已使用的通话ID，数量:",
            allUsedCallIds.size
        );
        return allUsedCallIds;
    }

    // ========== 生成唯一的通话ID ==========
    function generateUniqueCallId(prefix, baseId) {
        // 获取所有已使用的通话ID
        var allUsedCallIds = getAllUsedCallIds();

        // 生成基础通话ID
        var callId = prefix + baseId;

        // 如果已使用，生成新的唯一ID
        var attempts = 0;
        var maxAttempts = 100; // 最多尝试100次
        while (allUsedCallIds.has(callId) && attempts < maxAttempts) {
            attempts++;
            // 添加随机后缀确保唯一性
            var randomSuffix =
                "_" +
                Date.now() +
                "_" +
                Math.random().toString(36).substr(2, 6);
            callId = prefix + baseId + randomSuffix;
        }

        if (attempts >= maxAttempts) {
            console.error(
                "[小馨手机][通话ID] 生成唯一通话ID失败，已尝试",
                maxAttempts,
                "次"
            );
            // 即使失败，也使用带时间戳的ID
            callId =
                prefix +
                baseId +
                "_" +
                Date.now() +
                "_" +
                Math.random().toString(36).substr(2, 9);
        }

        // 注意：不需要将新生成的ID添加到已使用列表，因为下次生成时会重新获取
        // 这样可以确保总是从数据源获取最新的已使用ID列表

        console.info(
            "[小馨手机][通话ID] 生成唯一通话ID:",
            callId,
            "尝试次数:",
            attempts
        );

        return callId;
    }

    // ========== 清除通话ID缓存（已废弃，不再使用缓存） ==========
    function clearUsedCallIdsCache() {
        // 不再使用缓存，此函数保留用于兼容性，但不执行任何操作
        // usedCallIds = null;
    }

    // ========== 根据文本长度计算通话时长（秒） ==========
    // 语音通话应该体现实时性，每条消息的时间推进应该很短（5-20秒）
    // 而不是像普通对话那样每条消息推进1-2分钟
    function calculateCallDurationFromText(text) {
        if (!text || typeof text !== "string") {
            return 0;
        }

        // 计算文本长度（去除括号内的描述，只计算实际说话内容）
        // 例如："（轻声笑了笑）嗯，我听到了。" -> 只计算"嗯，我听到了。"
        var cleanText = text
            .replace(/（[^）]*）/g, "")
            .replace(/\([^)]*\)/g, "")
            .trim();
        var charCount = cleanText.length;

        if (charCount === 0) {
            return 0;
        }

        // 检测语速变化提示
        var speedMultiplier = 1.0; // 默认语速倍数
        var speedKeywords = {
            // 快速相关
            fast: [
                "快速",
                "飞快",
                "急促",
                "急忙",
                "赶紧",
                "立刻",
                "马上",
                "迅速",
                "急迫",
            ],
            // 慢速相关
            slow: [
                "慢速",
                "缓慢",
                "慢慢",
                "缓缓",
                "拖长",
                "拉长",
                "慢条斯理",
                "不紧不慢",
            ],
        };

        var textLower = text.toLowerCase();
        var hasFastKeyword = speedKeywords.fast.some(function (keyword) {
            return textLower.indexOf(keyword.toLowerCase()) !== -1;
        });
        var hasSlowKeyword = speedKeywords.slow.some(function (keyword) {
            return textLower.indexOf(keyword.toLowerCase()) !== -1;
        });

        // 根据关键词调整语速
        if (hasFastKeyword) {
            speedMultiplier = 1.3; // 快速说话，语速提高30%
        } else if (hasSlowKeyword) {
            speedMultiplier = 0.8; // 慢速说话，语速降低20%
        }

        // 语音通话实时性优化：使用更快的语速计算（200-250字/分钟），体现实时通话特点
        // 这样每条消息的时间推进会更短（5-20秒），而不是1-2分钟
        var wordsPerMinute = 220 * speedMultiplier; // 使用220字/分钟（比普通对话更快）
        var secondsPerChar = 60 / wordsPerMinute;
        var durationSeconds = Math.ceil(charCount * secondsPerChar);

        // 语音通话的时间推进应该更短：最少3秒，最多20秒（体现实时性）
        // 如果计算出的时长超过20秒，说明文本很长，可以适当延长，但不超过30秒
        durationSeconds = Math.max(3, Math.min(durationSeconds, 30));

        console.info(
            "[小馨手机][通话时长] 根据文本计算通话时长（实时通话优化）:",
            {
                text: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
                charCount: charCount,
                speedMultiplier: speedMultiplier,
                durationSeconds: durationSeconds,
            }
        );

        return durationSeconds;
    }

    // ========== 根据文本内容更新通话开始时间（模拟时间流逝） ==========
    function updateCallTimeByText(text) {
        if (!callStartWorldTime || !text) {
            return;
        }

        // 计算这条消息应该增加的通话时长
        var durationSeconds = calculateCallDurationFromText(text);

        if (durationSeconds > 0) {
            // 更新通话开始时间（向前推移，模拟时间流逝）
            // 注意：这里不修改callStartWorldTime，而是通过累计时长来计算
            // 但我们需要记录累计的文本时长，用于最终计算
            if (!currentCall.accumulatedTextDuration) {
                currentCall.accumulatedTextDuration = 0;
            }
            currentCall.accumulatedTextDuration += durationSeconds;

            console.info("[小馨手机][通话时长] 累计文本时长:", {
                text: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
                durationSeconds: durationSeconds,
                accumulatedDuration: currentCall.accumulatedTextDuration,
            });
        }
    }

    function initCallMessageListener(contact) {
        if (!contact) {
            return;
        }

        var characterId = contact.characterId || contact.id || "";
        var messageId =
            contact._incomingCallMessageId || currentCall.messageId || "";
        var callId = "call_" + messageId;

        // 静默初始化，不输出日志

        // 清除旧的监听器
        if (callMessageObserver) {
            callMessageObserver.disconnect();
            callMessageObserver = null;
        }
        if (callMessageListenerInterval) {
            clearInterval(callMessageListenerInterval);
            callMessageListenerInterval = null;
        }

        // 初始化已处理消息ID记录
        if (!lastProcessedMessageIds[callId]) {
            lastProcessedMessageIds[callId] = new Set();
        }

        // 查找酒馆消息显示区域
        var messageAreaSelectors = [
            "#chat",
            ".chat",
            "#mes_text",
            ".mes_text",
            ".mes",
        ];

        var $messageArea = null;
        var messageAreaElement = null;
        for (var i = 0; i < messageAreaSelectors.length; i++) {
            $messageArea = $(messageAreaSelectors[i]);
            if ($messageArea.length > 0) {
                messageAreaElement = $messageArea[0];
                break;
            }
        }

        if (!messageAreaElement) {
            console.warn(
                "[小馨手机][通话中] 未找到酒馆消息显示区域，无法监听消息"
            );
            return;
        }

        // 处理消息的函数（延迟处理，确保消息监听器先处理）
        function processMessages() {
            // 即使通话页面还没显示，也要处理消息（先缓存，等页面显示后再显示）
            // 这样可以确保在接听指令发送后立即捕获角色的回复

            // 延迟处理，给消息监听器时间先处理并保存原始内容到 data 属性
            setTimeout(function () {
                try {
                    // ⚠️ 重要：每次处理消息前，先清理已处理消息记录，只保留当前可见楼层中的消息
                    // 这样可以确保当用户在同一楼层重新生成时，新生成的消息不会被旧记录跳过
                    // 注意：需要清理所有通话ID的缓存，因为可能在不同通话间切换
                    Object.keys(lastProcessedMessageIds).forEach(function(key) {
                        if (lastProcessedMessageIds[key]) {
                            lastProcessedMessageIds[key].clear();
                        }
                    });
                    Object.keys(lastProcessedMessageContents).forEach(function(key) {
                        if (lastProcessedMessageContents[key]) {
                            lastProcessedMessageContents[key].clear();
                        }
                    });
                    Object.keys(messageSourceInfo).forEach(function(key) {
                        if (messageSourceInfo[key]) {
                            messageSourceInfo[key].clear();
                        }
                    });

                    console.info("[小馨手机][通话中] 已清理所有已处理消息记录，准备重新扫描当前可见楼层");

                    // 获取所有消息元素
                    var $messages = $messageArea.find(".mes");
                    var foundMessages = [];
                    var messagesToHide = [];

                    // 遍历所有消息，查找包含 call_voice_text 的消息
                    $messages.each(function () {
                        var $mes = $(this);

                        // 如果已经隐藏，跳过
                        if ($mes.css("display") === "none") {
                            return;
                        }

                        // 优先从 data 属性中获取原始内容（消息监听器已保存）
                        var originalContent =
                            $mes.attr("data-original-msg-content") ||
                            $mes.attr("data-original-content") ||
                            $mes.attr("data-original") ||
                            $mes.attr("data-raw") ||
                            $mes.attr("data-content") ||
                            "";

                        // 如果 data 属性中没有，尝试从 DOM 中获取（可能消息监听器还没处理）
                        if (!originalContent) {
                            var $messageText = $mes.find(
                                ".mes_text, .mesText, .message-text, [class*='mes_text']"
                            );
                            if ($messageText.length === 0) {
                                $messageText = $mes;
                            }
                            originalContent =
                                $messageText.attr(
                                    "data-original-msg-content"
                                ) ||
                                $messageText.attr("data-original-content") ||
                                $messageText.attr("data-original") ||
                                $messageText.attr("data-raw") ||
                                $messageText.attr("data-content") ||
                                $mes.text() ||
                                $mes.html() ||
                                "";
                        }

                        // 检查是否包含 [MSG] 标签和 call_voice_text
                        if (
                            originalContent &&
                            originalContent.indexOf("[MSG]") !== -1 &&
                            originalContent.indexOf("[/MSG]") !== -1 &&
                            originalContent.indexOf("type=call_voice_text") !==
                                -1
                        ) {
                            // 提取 [MSG] 标签块
                            var msgMatches = originalContent.match(
                                /\[MSG\]([\s\S]*?)\[\/MSG\]/g
                            );
                            if (msgMatches && msgMatches.length > 0) {
                                for (var j = 0; j < msgMatches.length; j++) {
                                    var msgBlock = msgMatches[j];
                                    if (
                                        msgBlock.indexOf(
                                            "type=call_voice_text"
                                        ) !== -1
                                    ) {
                                        foundMessages.push(msgBlock);
                                    }
                                }
                            }

                            // 记录需要处理的消息元素（只隐藏 [MSG] 标签，保留正文）
                            messagesToHide.push({
                                $mes: $mes,
                                originalContent: originalContent,
                            });
                        }
                    });

                    // 处理找到的消息
                    if (foundMessages.length > 0) {
                        for (var k = 0; k < foundMessages.length; k++) {
                            parseCallVoiceTextMessage(
                                foundMessages[k],
                                characterId,
                                callId
                            );
                        }
                    }

                    // 隐藏 [MSG] 标签块（保留正文内容）
                    for (var h = 0; h < messagesToHide.length; h++) {
                        var item = messagesToHide[h];
                        var $mesToHide = item.$mes;
                        var originalContent = item.originalContent;

                        // 找到消息文本元素
                        var $messageText = $mesToHide.find(
                            ".mes_text, .mesText, .message-text, [class*='mes_text']"
                        );
                        if ($messageText.length === 0) {
                            $messageText = $mesToHide;
                        }

                        // 获取当前 HTML 内容
                        var currentHtml = $messageText.html() || "";

                        // 检查当前 HTML 中是否还有 [MSG] 标签（可能消息监听器还没处理，或者处理后又出现了）
                        var msgPattern = /\[MSG\]([\s\S]*?)\[\/MSG\]/gi;
                        var hasMsgTag = msgPattern.test(currentHtml);

                        if (hasMsgTag) {
                            // 重置正则（因为test会改变lastIndex）
                            msgPattern = /\[MSG\]([\s\S]*?)\[\/MSG\]/gi;
                            var replacedHtml = currentHtml.replace(
                                msgPattern,
                                function (match) {
                                    // 只隐藏 call_voice_text 类型的 [MSG] 块
                                    if (
                                        match.indexOf(
                                            "type=call_voice_text"
                                        ) !== -1
                                    ) {
                                        return "";
                                    }
                                    // 其他类型的 [MSG] 块保留（由消息监听器处理）
                                    return match;
                                }
                            );

                            if (replacedHtml !== currentHtml) {
                                $messageText.html(replacedHtml);
                            }
                        } else {
                            // 如果当前 HTML 中没有 [MSG] 标签（消息监听器已处理），
                            // 但原始内容中有 call_voice_text，说明消息监听器已经隐藏了所有 [MSG] 标签
                            // 这种情况下，正文内容应该已经显示了，不需要额外处理
                            // 但如果原始内容中只有 call_voice_text 而没有其他正文，则整个消息可能被隐藏了
                            // 我们需要确保正文内容显示出来

                            // 从原始内容中提取正文（去除所有 [MSG] 块）
                            var textContent = originalContent
                                .replace(
                                    /\[MSG\]([\s\S]*?)\[\/MSG\]/gi,
                                    function (match) {
                                        // 如果是 call_voice_text，则移除
                                        if (
                                            match.indexOf(
                                                "type=call_voice_text"
                                            ) !== -1
                                        ) {
                                            return "";
                                        }
                                        // 其他类型的 [MSG] 块也移除（因为消息监听器已经处理了）
                                        return "";
                                    }
                                )
                                .trim();

                            // 如果提取到了正文内容，且当前 HTML 为空或只包含空白，则显示正文
                            if (
                                textContent &&
                                (!currentHtml ||
                                    currentHtml.trim().length === 0)
                            ) {
                                $messageText.html(textContent);
                            }
                        }
                    }
                } catch (e) {
                    console.error("[小馨手机][通话中] 处理消息时出错:", e);
                }
            }, 200); // 延迟 200ms，确保消息监听器先处理
        }

        // 使用 MutationObserver 监听消息区域的变化
        if (typeof MutationObserver !== "undefined") {
            callMessageObserver = new MutationObserver(function (mutations) {
                processMessages();
            });

            callMessageObserver.observe(messageAreaElement, {
                childList: true, // 监听子节点的添加和删除
                subtree: true, // 监听所有后代节点
                characterData: true, // 监听文本内容的变化
            });

            // 静默启动，不输出日志
        }

        // 同时使用定时器作为备选方案
        callMessageListenerInterval = setInterval(function () {
            processMessages();
        }, 1000); // 每秒检查一次

        // 立即处理一次，以防有已存在的消息
        setTimeout(processMessages, 500);
    }

    // 解析语音通话文本消息
    function parseCallVoiceTextMessage(content, characterId, callId, sourceMessageId) {
        if (!content || !characterId || !callId) {
            return;
        }

        try {
            // 提取 [MSG] 标签内的内容
            var msgMatch = content.match(/\[MSG\]([\s\S]*?)\[\/MSG\]/);
            if (!msgMatch || !msgMatch[1]) {
                return;
            }

            var msgContent = msgMatch[1];
            var lines = msgContent.split("\n");

            // ⚠️ 重要：获取消息的 sourceMessageId（楼层ID），用于检测楼层重新生成
            // 如果没有传入 sourceMessageId，尝试从消息元素中获取
            if (!sourceMessageId) {
                // 尝试从当前正在处理的消息元素中获取 sourceMessageId
                // 注意：这里需要从调用处传递 sourceMessageId，暂时先设为 null
                sourceMessageId = null;
            }

            // 解析每条消息
            var currentMessage = {};
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line) {
                    continue;
                }

                // 解析字段=值格式
                var match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                    var key = match[1].trim();
                    var value = match[2].trim();

                    if (key === "id") {
                        // 如果遇到新的消息ID，处理上一条消息
                        if (
                            currentMessage.id &&
                            currentMessage.type === "call_voice_text"
                        ) {
                            // ⚠️ 检查消息是否已处理过，避免重复处理
                            var prevMessageCallId = currentMessage.call_id || currentMessage.callId || callId || "";
                            var prevMessageText = (currentMessage.text || currentMessage.content || "").trim();

                            var shouldSkip = false;
                            if (prevMessageCallId) {
                                if (!lastProcessedMessageIds[prevMessageCallId]) {
                                    lastProcessedMessageIds[prevMessageCallId] = new Set();
                                }
                                if (!lastProcessedMessageContents[prevMessageCallId]) {
                                    lastProcessedMessageContents[prevMessageCallId] = new Set();
                                }

                                if (lastProcessedMessageIds[prevMessageCallId].has(currentMessage.id)) {
                                    shouldSkip = true;
                                } else if (prevMessageText && lastProcessedMessageContents[prevMessageCallId].has(prevMessageText)) {
                                    shouldSkip = true;
                                }
                            }

                            if (!shouldSkip) {
                                displayCallVoiceTextMessage(
                                    currentMessage,
                                    characterId,
                                    callId
                                );
                            } else {
                                console.info(
                                    "[小馨手机][通话中] 循环解析时发现消息已处理过，跳过:",
                                    "消息ID:",
                                    currentMessage.id,
                                    "call_id:",
                                    prevMessageCallId
                                );
                            }
                        }
                        // 开始新消息
                        currentMessage = { id: value };
                    } else if (currentMessage.id) {
                        currentMessage[key] = value;
                    }
                }
            }

            // 处理最后一条消息
            if (
                currentMessage.id &&
                currentMessage.type === "call_voice_text"
            ) {
                // ⚠️ 检查消息是否已处理过（基于ID和内容），避免重复处理
                var messageCallIdForParse = currentMessage.call_id || currentMessage.callId || callId || "";
                var messageTextForParse = (currentMessage.text || currentMessage.content || "").trim();

                if (messageCallIdForParse) {
                    if (!lastProcessedMessageIds[messageCallIdForParse]) {
                        lastProcessedMessageIds[messageCallIdForParse] = new Set();
                    }
                    if (!lastProcessedMessageContents[messageCallIdForParse]) {
                        lastProcessedMessageContents[messageCallIdForParse] = new Set();
                    }

                    // ⚠️ 重要：检查消息是否已处理过，但需要考虑楼层重新生成的情况
                    // 计算内容哈希，用于检测内容变化
                    var contentHash = 0;
                    if (messageTextForParse) {
                        for (var i = 0; i < messageTextForParse.length; i++) {
                            contentHash = (contentHash << 5) - contentHash + messageTextForParse.charCodeAt(i);
                            contentHash = contentHash & contentHash;
                        }
                        contentHash = Math.abs(contentHash);
                    }

                    // 初始化消息来源信息记录
                    if (!messageSourceInfo[messageCallIdForParse]) {
                        messageSourceInfo[messageCallIdForParse] = new Map();
                    }

                    var existingSourceInfo = messageSourceInfo[messageCallIdForParse].get(currentMessage.id);

                    // ⚠️ 重要：获取消息的 sourceMessageId（楼层ID），用于检测楼层重新生成
                    var messageSourceId = null;
                    try {
                        if (window.XiaoxinMessageListener && window.XiaoxinMessageListener.currentSourceMessageId) {
                            messageSourceId = window.XiaoxinMessageListener.currentSourceMessageId;
                        }
                    } catch (e) {
                        // ignore
                    }

                    // 检查消息ID是否已处理过
                    if (lastProcessedMessageIds[messageCallIdForParse].has(currentMessage.id)) {
                        // 如果消息ID已存在，检查内容哈希和 sourceMessageId 是否相同
                        var isSameSource = existingSourceInfo &&
                                         existingSourceInfo.sourceId === messageSourceId &&
                                         existingSourceInfo.contentHash === contentHash;

                        if (isSameSource) {
                            // 内容哈希和 sourceMessageId 都相同，说明是重复处理，跳过
                            console.info(
                                "[小馨手机][通话中] 解析消息时发现消息已处理过（内容和sourceMessageId相同），跳过:",
                                "消息ID:",
                                currentMessage.id,
                                "sourceMessageId:",
                                messageSourceId,
                                "call_id:",
                                messageCallIdForParse
                            );
                            return; // 已处理过，跳过
                        } else {
                            // 内容哈希或 sourceMessageId 不同，说明楼层已重新生成，清除旧记录并重新处理
                            console.info(
                                "[小馨手机][通话中] 检测到楼层重新生成，清除旧记录并重新处理:",
                                "消息ID:",
                                currentMessage.id,
                                "旧sourceMessageId:",
                                existingSourceInfo ? existingSourceInfo.sourceId : "无",
                                "新sourceMessageId:",
                                messageSourceId,
                                "旧内容哈希:",
                                existingSourceInfo ? existingSourceInfo.contentHash : "无",
                                "新内容哈希:",
                                contentHash,
                                "call_id:",
                                messageCallIdForParse
                            );
                            // 不返回，继续处理
                        }
                    }

                    // 检查消息内容是否已处理过（但允许内容变化时重新处理）
                    if (messageTextForParse && lastProcessedMessageContents[messageCallIdForParse].has(messageTextForParse)) {
                        // 如果内容相同，检查是否来自同一楼层（通过 sourceMessageId 和内容哈希）
                        var isSameSource = existingSourceInfo &&
                                         existingSourceInfo.sourceId === messageSourceId &&
                                         existingSourceInfo.contentHash === contentHash;

                        if (isSameSource) {
                            console.info(
                                "[小馨手机][通话中] 解析消息时发现消息内容已处理过（内容和sourceMessageId相同），跳过:",
                                "消息ID:",
                                currentMessage.id,
                                "消息内容:",
                                messageTextForParse.substring(0, 50) + (messageTextForParse.length > 50 ? "..." : ""),
                                "sourceMessageId:",
                                messageSourceId,
                                "call_id:",
                                messageCallIdForParse
                            );
                            return; // 相同内容已处理过，跳过
                        } else {
                            // 内容相同但 sourceMessageId 或哈希不同，说明可能是楼层重新生成，允许处理
                            console.info(
                                "[小馨手机][通话中] 消息内容相同但sourceMessageId或哈希不同，可能是楼层重新生成，允许处理:",
                                "消息ID:",
                                currentMessage.id,
                                "旧sourceMessageId:",
                                existingSourceInfo ? existingSourceInfo.sourceId : "无",
                                "新sourceMessageId:",
                                messageSourceId,
                                "call_id:",
                                messageCallIdForParse
                            );
                        }
                    }

                    // 记录消息来源信息（包括 sourceMessageId 和内容哈希）
                    messageSourceInfo[messageCallIdForParse].set(currentMessage.id, {
                        contentHash: contentHash,
                        sourceId: messageSourceId
                    });
                }

                // 检查是否是待发送消息的确认（从酒馆正文中发送的消息）
                var messageId = currentMessage.id;
                if ($activeCallScreen && $activeCallScreen.length > 0) {
                    var $pendingMessage = $activeCallScreen.find(
                        '[data-message-id="' + messageId + '"]'
                    );
                    if ($pendingMessage.length > 0) {
                        // 移除pending状态
                        $pendingMessage.removeClass(
                            "xiaoxin-active-call-message-pending"
                        );
                        // 更新消息对象，移除pending标记
                        currentMessage.isPending = false;
                    }
                }

                displayCallVoiceTextMessage(
                    currentMessage,
                    characterId,
                    callId
                );
            }
        } catch (e) {
            console.error("[小馨手机][通话中] 解析消息时出错:", e);
        }
    }

    // 显示语音通话文本消息
    function displayCallVoiceTextMessage(message, characterId, callId) {
        if (!message || !message.id) {
            return;
        }

        // 检查是否已处理过（待发送状态的消息允许重复显示，用于更新状态）
        // ⚠️ 重要：必须使用消息中的 call_id，而不是传入的 callId 参数
        var messageCallIdForCheck = message.call_id || message.callId || callId || "";
        if (!messageCallIdForCheck) {
            console.warn(
                "[小馨手机][通话中] 消息没有 call_id，无法检查是否已处理:",
                message.id
            );
            return; // 没有 call_id，无法处理
        }

        if (!lastProcessedMessageIds[messageCallIdForCheck]) {
            lastProcessedMessageIds[messageCallIdForCheck] = new Set();
        }
        if (!lastProcessedMessageContents[messageCallIdForCheck]) {
            lastProcessedMessageContents[messageCallIdForCheck] = new Set();
        }

        // 获取消息文本内容用于去重
        var messageText = (message.text || message.content || "").trim();

        // 如果是待发送状态，允许显示（即使已处理过，因为可能需要更新状态）
        var isPending = message.isPending === true;

        // ⚠️ 重要：刷新后去重记录会被清空，但DOM中可能已有消息
        // 所以先检查DOM中是否已有消息（基于ID和内容），这是最可靠的检查方式
        var isMessageInDOM = false;
        if ($activeCallScreen && $activeCallScreen.hasClass("show")) {
            var $messagesContainer = $activeCallScreen.find(
                ".xiaoxin-active-call-messages"
            );
            if ($messagesContainer && $messagesContainer.length > 0) {
                // 先检查消息ID
                var $existingMessage = $messagesContainer.find(
                    '[data-message-id="' + message.id + '"]'
                );
                if ($existingMessage.length > 0) {
                    isMessageInDOM = true;
                } else if (messageText) {
                    // 如果消息ID不匹配，检查消息内容是否已存在（基于内容去重）
                    $messagesContainer.find(".xiaoxin-active-call-message-content").each(function() {
                        var existingText = $(this).text().trim();
                        if (existingText === messageText) {
                            isMessageInDOM = true;
                            return false; // 跳出循环
                        }
                    });
                }
            }
        }

        // ⚠️ 重要：如果DOM中已有消息，需要检查是否是楼层重新生成
        // 如果 sourceMessageId 不同，说明是楼层重新生成，应该清除旧消息并重新显示
        if (!isPending && isMessageInDOM) {
            // 检查是否是楼层重新生成
            var existingSourceInfo = messageSourceInfo[messageCallIdForCheck] ?
                                    messageSourceInfo[messageCallIdForCheck].get(message.id) : null;
            var isSameSource = existingSourceInfo &&
                             existingSourceInfo.sourceId === messageSourceId &&
                             existingSourceInfo.contentHash === contentHash;

            if (isSameSource) {
                // sourceMessageId 和内容哈希都相同，说明是重复处理，跳过
                console.info(
                    "[小馨手机][通话中] 消息已在DOM中显示且sourceMessageId相同，跳过显示:",
                    "消息ID:",
                    message.id,
                    "sourceMessageId:",
                    messageSourceId,
                    "call_id:",
                    messageCallIdForCheck
                );
                // 同时更新去重记录，避免后续重复检查
                lastProcessedMessageIds[messageCallIdForCheck].add(message.id);
                if (messageText) {
                    lastProcessedMessageContents[messageCallIdForCheck].add(messageText);
                }
                return; // DOM中已有且sourceMessageId相同，跳过
            } else {
                // sourceMessageId 或内容哈希不同，说明是楼层重新生成，清除旧消息并重新显示
                console.info(
                    "[小馨手机][通话中] 检测到楼层重新生成，清除DOM中的旧消息并重新显示:",
                    "消息ID:",
                    message.id,
                    "旧sourceMessageId:",
                    existingSourceInfo ? existingSourceInfo.sourceId : "无",
                    "新sourceMessageId:",
                    messageSourceId,
                    "call_id:",
                    messageCallIdForCheck
                );
                // 清除DOM中的旧消息
                if ($activeCallScreen && $activeCallScreen.hasClass("show")) {
                    var $messagesContainer = $activeCallScreen.find(
                        ".xiaoxin-active-call-messages"
                    );
                    if ($messagesContainer && $messagesContainer.length > 0) {
                        var $existingMessage = $messagesContainer.find(
                            '[data-message-id="' + message.id + '"]'
                        );
                        if ($existingMessage.length > 0) {
                            $existingMessage.remove();
                            console.info(
                                "[小馨手机][通话中] 已清除DOM中的旧消息:",
                                message.id
                            );
                        }
                    }
                }
                // 不返回，继续处理
            }
        }

        // ⚠️ 重要：检查消息是否已处理过，但需要考虑楼层重新生成的情况
        // 计算内容哈希，用于检测内容变化
        var contentHash = 0;
        if (messageText) {
            for (var i = 0; i < messageText.length; i++) {
                contentHash = (contentHash << 5) - contentHash + messageText.charCodeAt(i);
                contentHash = contentHash & contentHash;
            }
            contentHash = Math.abs(contentHash);
        }

        // ⚠️ 重要：获取消息的 sourceMessageId（楼层ID），用于检测楼层重新生成
        var messageSourceId = null;
        try {
            if (window.XiaoxinMessageListener && window.XiaoxinMessageListener.currentSourceMessageId) {
                messageSourceId = window.XiaoxinMessageListener.currentSourceMessageId;
            }
        } catch (e) {
            // ignore
        }

        // 初始化消息来源信息记录
        if (!messageSourceInfo[messageCallIdForCheck]) {
            messageSourceInfo[messageCallIdForCheck] = new Map();
        }

        var existingSourceInfo = messageSourceInfo[messageCallIdForCheck].get(message.id);

        // 检查消息ID是否已处理过（内存中的去重记录）
        if (!isPending && lastProcessedMessageIds[messageCallIdForCheck].has(message.id)) {
            // 如果消息ID已存在，检查内容哈希和 sourceMessageId 是否相同
            var isSameSource = existingSourceInfo &&
                             existingSourceInfo.sourceId === messageSourceId &&
                             existingSourceInfo.contentHash === contentHash;

            if (isSameSource) {
                // 内容哈希和 sourceMessageId 都相同，说明是重复处理，跳过
                console.info(
                    "[小馨手机][通话中] 消息已处理过（内容和sourceMessageId相同），跳过显示:",
                    "消息ID:",
                    message.id,
                    "sourceMessageId:",
                    messageSourceId,
                    "call_id:",
                    messageCallIdForCheck
                );
                return; // 已处理过且不是待发送状态，跳过
            } else {
                // 内容哈希或 sourceMessageId 不同，说明楼层已重新生成，清除旧记录并重新处理
                console.info(
                    "[小馨手机][通话中] 检测到楼层重新生成，清除旧记录并重新处理:",
                    "消息ID:",
                    message.id,
                    "旧sourceMessageId:",
                    existingSourceInfo ? existingSourceInfo.sourceId : "无",
                    "新sourceMessageId:",
                    messageSourceId,
                    "旧内容哈希:",
                    existingSourceInfo ? existingSourceInfo.contentHash : "无",
                    "新内容哈希:",
                    contentHash,
                    "call_id:",
                    messageCallIdForCheck
                );
                // 清除DOM中的旧消息（如果存在）
                if ($activeCallScreen && $activeCallScreen.hasClass("show")) {
                    var $messagesContainer = $activeCallScreen.find(
                        ".xiaoxin-active-call-messages"
                    );
                    if ($messagesContainer && $messagesContainer.length > 0) {
                        var $existingMessage = $messagesContainer.find(
                            '[data-message-id="' + message.id + '"]'
                        );
                        if ($existingMessage.length > 0) {
                            $existingMessage.remove();
                            console.info(
                                "[小馨手机][通话中] 已清除DOM中的旧消息:",
                                message.id
                            );
                        }
                    }
                }
                // 不返回，继续处理
            }
        }

        // 检查消息内容是否已处理过（但允许内容变化时重新处理）
        if (!isPending && messageText && lastProcessedMessageContents[messageCallIdForCheck].has(messageText)) {
            // 如果内容相同，检查是否来自同一楼层（通过 sourceMessageId 和内容哈希）
            var isSameSource = existingSourceInfo &&
                             existingSourceInfo.sourceId === messageSourceId &&
                             existingSourceInfo.contentHash === contentHash;

            if (isSameSource) {
                console.info(
                    "[小馨手机][通话中] 消息内容已处理过（内容和sourceMessageId相同），跳过显示:",
                    "消息ID:",
                    message.id,
                    "消息内容:",
                    messageText.substring(0, 50) + (messageText.length > 50 ? "..." : ""),
                    "sourceMessageId:",
                    messageSourceId,
                    "call_id:",
                    messageCallIdForCheck
                );
                return; // 相同内容已处理过，跳过
            } else {
                // 内容相同但 sourceMessageId 或哈希不同，说明可能是楼层重新生成，允许处理
                console.info(
                    "[小馨手机][通话中] 消息内容相同但sourceMessageId或哈希不同，可能是楼层重新生成，允许处理:",
                    "消息ID:",
                    message.id,
                    "旧sourceMessageId:",
                    existingSourceInfo ? existingSourceInfo.sourceId : "无",
                    "新sourceMessageId:",
                    messageSourceId,
                    "call_id:",
                    messageCallIdForCheck
                );
            }
        }

        // 记录消息来源信息（包括 sourceMessageId 和内容哈希）
        messageSourceInfo[messageCallIdForCheck].set(message.id, {
            contentHash: contentHash,
            sourceId: messageSourceId
        });

        // 检查通话ID是否匹配（支持 call_id 和 callId 两种字段名）
        var messageCallId = message.call_id || message.callId || "";

        // 获取当前通话的 callId（优先使用 currentCall.callId，其次使用传入的 callId 参数）
        var currentCallId = null;
        if (currentCall && currentCall.callId) {
            currentCallId = currentCall.callId;
        } else if (callId) {
            currentCallId = callId;
        }

        // ⚠️ 重要：如果没有当前通话，必须跳过显示，避免不同角色的通话消息混淆
        if (!currentCallId) {
            return; // 没有当前通话，跳过显示
        }

        // ⚠️ 重要：验证 call_id 匹配 - 消息必须有 call_id 且必须匹配当前通话
        // 如果消息没有 call_id，或者 call_id 不匹配当前通话，必须跳过显示
        if (!messageCallId) {
            return; // 消息没有 call_id，无法确定是哪个通话的消息，跳过显示
        }

        if (messageCallId !== currentCallId) {
            return; // 不是当前通话的消息
        }

        // 先判断是否是玩家消息（必须在角色ID检查之前，否则玩家消息会被误判）
        var msgFrom = message.from || "";
        var isPlayerMessage = false;

        // 获取当前玩家ID
        var currentAccount = null;
        if (window.XiaoxinWeChatAccount) {
            currentAccount = window.XiaoxinWeChatAccount.getCurrentAccount();
        } else if (window.XiaoxinWeChatDataHandler) {
            currentAccount = window.XiaoxinWeChatDataHandler.getAccount();
        }
        var playerId = currentAccount
            ? currentAccount.wechatId || currentAccount.id || "player"
            : "player";

        // 判断是否是玩家消息
        if (String(msgFrom) === String(playerId) || msgFrom === "player") {
            isPlayerMessage = true;
        }

        // 验证角色ID匹配：确保消息来自当前通话的角色（如果不是玩家消息）
        if (!isPlayerMessage) {
            var currentContactId = null;
            if (currentCall && currentCall.contact) {
                currentContactId = currentCall.contact.characterId || currentCall.contact.id || "";
            }

            // 如果提供了 characterId 参数，必须匹配
            if (characterId && msgFrom !== String(characterId)) {
                // 如果 currentCall 有联系人信息，也检查是否匹配
                if (!currentContactId || msgFrom !== String(currentContactId)) {
                    console.info(
                        "[小馨手机][通话中] 角色ID不匹配，跳过显示:",
                        "消息 from:",
                        msgFrom,
                        "当前角色 characterId:",
                        characterId,
                        "当前联系人ID:",
                        currentContactId
                    );
                    return; // 不是当前角色的消息
                }
            }
        }

        // ⚠️ 注意：不在这里标记为已处理，而是在消息真正显示到DOM后才标记
        // ⚠️ 重要：必须使用消息中的 call_id，而不是传入的 callId 参数，确保消息添加到正确的通话队列中
        var messageCallIdForProcessed = message.call_id || message.callId || "";

        // 如果消息没有 call_id，无法确定是哪个通话的消息，必须跳过
        if (!messageCallIdForProcessed) {
            return; // 没有 call_id，无法处理
        }

        // ⚠️ 重要：验证消息的 call_id 必须匹配当前通话的 callId，避免不同通话的消息混淆
        var currentCallIdForQueue = null;
        if (currentCall && currentCall.callId) {
            currentCallIdForQueue = currentCall.callId;
        }

        if (currentCallIdForQueue && messageCallIdForProcessed !== currentCallIdForQueue) {
            return; // 不是当前通话的消息，不添加到队列
        }

        if (!callMessageQueue[messageCallIdForProcessed]) {
            callMessageQueue[messageCallIdForProcessed] = [];
        }
        if (callMessageQueueProcessing[messageCallIdForProcessed] === undefined) {
            callMessageQueueProcessing[messageCallIdForProcessed] = false;
        }

        // ⚠️ 检查队列中是否已有相同的消息（基于ID和内容），避免重复添加到队列
        var messageTextForQueue = message.text || message.content || "";
        var isInQueue = callMessageQueue[messageCallIdForProcessed].some(function(queueItem) {
            if (queueItem.message.id === message.id) {
                return true; // 相同ID
            }
            if (messageTextForQueue) {
                var queueItemText = queueItem.message.text || queueItem.message.content || "";
                if (queueItemText.trim() === messageTextForQueue.trim()) {
                    return true; // 相同内容
                }
            }
            return false;
        });

        if (isInQueue) {
            console.info(
                "[小馨手机][通话中] 消息已在队列中，跳过添加到队列:",
                "消息ID:",
                message.id,
                "消息内容:",
                messageTextForQueue ? (messageTextForQueue.substring(0, 50) + (messageTextForQueue.length > 50 ? "..." : "")) : "",
                "call_id:",
                messageCallIdForProcessed
            );
            return; // 已在队列中，跳过
        }

        // 将消息添加到队列
        callMessageQueue[messageCallIdForProcessed].push({
            message: message,
            characterId: characterId,
            callId: messageCallIdForProcessed, // 使用消息中的 call_id
            isPlayerMessage: isPlayerMessage,
        });

        // 同时保存到消息历史（用于持久化）
        // ⚠️ 重要：必须使用消息中的 call_id，而不是传入的 callId 参数，确保消息保存到正确的通话历史中
        var messageCallIdForHistory = message.call_id || message.callId || callId || "";
        if (!messageCallIdForHistory) {
            console.warn(
                "[小馨手机][通话中] 消息没有 call_id，无法保存到历史:",
                message.id
            );
        } else {
            if (!callMessageHistory[messageCallIdForHistory]) {
                callMessageHistory[messageCallIdForHistory] = [];
            }
            // 检查是否已存在（避免重复）
            var existsInHistory = callMessageHistory[messageCallIdForHistory].some(function (item) {
                return item.message.id === message.id;
            });
            if (!existsInHistory) {
                callMessageHistory[messageCallIdForHistory].push({
                    message: message,
                    characterId: characterId,
                    callId: messageCallIdForHistory, // 使用消息中的 call_id
                    isPlayerMessage: isPlayerMessage,
                });
                console.info(
                    "[小馨手机][通话中] 保存消息到历史:",
                    "消息ID:",
                    message.id,
                    "call_id:",
                    messageCallIdForHistory,
                    "历史数量:",
                    callMessageHistory[messageCallIdForHistory].length
                );
            }
        }

        // 检查消息是否已经在通话页面中显示（避免重复显示）
        var isMessageAlreadyDisplayed = false;
        var messageTextForCheck = message.text || message.content || "";
        if ($activeCallScreen && $activeCallScreen.hasClass("show")) {
            var $messagesContainer = $activeCallScreen.find(
                ".xiaoxin-active-call-messages"
            );
            if ($messagesContainer && $messagesContainer.length > 0) {
                // 先检查消息ID
                var $existingMessage = $messagesContainer.find(
                    '[data-message-id="' + message.id + '"]'
                );
                if ($existingMessage.length > 0) {
                    isMessageAlreadyDisplayed = true;
                } else if (messageTextForCheck) {
                    // 如果消息ID不匹配，检查消息内容是否已存在（基于内容去重）
                    $messagesContainer.find(".xiaoxin-active-call-message-content").each(function() {
                        var existingText = $(this).text().trim();
                        if (existingText === messageTextForCheck.trim()) {
                            isMessageAlreadyDisplayed = true;
                            return false; // 跳出循环
                        }
                    });
                }
            }
        }

        // 如果消息已经在通话页面中显示，跳过添加到队列（避免重复显示）
        if (isMessageAlreadyDisplayed) {
            console.info(
                "[小馨手机][通话中] 消息已在通话页面中显示（基于ID或内容），跳过添加到队列:",
                "消息ID:",
                message.id,
                "消息内容:",
                messageTextForCheck ? (messageTextForCheck.substring(0, 50) + (messageTextForCheck.length > 50 ? "..." : "")) : ""
            );
            return; // 直接返回，不添加到队列
        }

        // ✅ 只有在“确实是新消息”（既不在DOM中，也未被计入过）时，才推进通话时长
        // 否则刷新/重复解析会把同一段文字重复计时，最终出现 6 分钟这种离谱时长。
        try {
            if (!durationCountedMessageIds[messageCallIdForProcessed]) {
                durationCountedMessageIds[messageCallIdForProcessed] = new Set();
            }
            if (!durationCountedMessageIds[messageCallIdForProcessed].has(message.id)) {
                var textContent = message.text || message.content || "";
                if (textContent && currentCall) {
                    updateCallTimeByText(textContent);
                    durationCountedMessageIds[messageCallIdForProcessed].add(message.id);
                }
            }
        } catch (e) {}

        // 处理消息队列（如果当前没有在处理）
        // ⚠️ 重要：必须使用消息中的 call_id，而不是传入的 callId 参数
        processCallMessageQueue(messageCallIdForProcessed);

        // 如果不在通话页面，且是角色发送的消息，在灵动岛显示文本
        var isInCallPage =
            $activeCallScreen && $activeCallScreen.hasClass("show");
        if (!isPlayerMessage && !isInCallPage) {
            var textContent = message.text || message.content || "";
            if (textContent && window.XiaoxinDynamicIslandCall) {
                if (
                    typeof window.XiaoxinDynamicIslandCall.showText ===
                    "function"
                ) {
                    window.XiaoxinDynamicIslandCall.showText(textContent);
                    console.info(
                        "[小馨手机][通话中] 已在灵动岛显示语音文本（不在通话页面）"
                    );
                }
            }
        }

        return; // 不再直接显示，而是通过队列处理
    }

    // 检查是否可以自动挂断（队列为空且已收到结束消息）
    function checkAndAutoHangup(callId) {
        if (!callId) {
            return;
        }

        // 检查是否已收到结束消息
        var endedFlag = callEndedFlags[callId];
        if (!endedFlag) {
            // 还没有收到结束消息，但可能正在处理中，延迟一下再检查
            // 这样可以处理 state=ended 消息在 call_voice_text 消息处理完毕后才到达的情况
            setTimeout(function () {
                checkAndAutoHangup(callId);
            }, 500);
            return;
        }

        // 检查队列是否为空且没有正在处理的消息（包括打字机效果）
        var queueEmpty =
            !callMessageQueue[callId] || callMessageQueue[callId].length === 0;
        var notProcessing = !callMessageQueueProcessing[callId];

        // 额外检查：确保没有正在进行的打字机效果
        // 检查通话页面中是否还有带有 "typing" 类的消息元素
        var hasTypingMessage = false;
        if ($activeCallScreen && $activeCallScreen.hasClass("show")) {
            var $messagesContainer = $activeCallScreen.find(
                ".xiaoxin-active-call-messages"
            );
            if ($messagesContainer && $messagesContainer.length > 0) {
                var $typingMessages = $messagesContainer.find(
                    ".xiaoxin-active-call-message-content.typing"
                );
                hasTypingMessage = $typingMessages.length > 0;
                if (hasTypingMessage) {
                    console.info(
                        "[小馨手机][通话状态] 检测到正在进行的打字机效果，等待完成，通话ID:",
                        callId,
                        "打字机消息数量:",
                        $typingMessages.length
                    );
                }
            }
        }

        if (queueEmpty && notProcessing && !hasTypingMessage) {
            // 如果已经有定时器在运行，清除它（避免重复挂断）
            if (callEndedAutoHangupTimers[callId]) {
                clearTimeout(callEndedAutoHangupTimers[callId]);
                callEndedAutoHangupTimers[callId] = null;
            }

            // 显示"对方已挂断"提示（仅当对方挂断且尚未显示过时）
            if (endedFlag.fromRole && !endedFlag.toastShown) {
                showCallStatusToast("对方已挂断");
                endedFlag.toastShown = true; // 标记已显示，避免重复显示
                console.info(
                    "[小馨手机][通话状态] 所有文字内容显示完毕，已显示'对方已挂断'提示，通话ID:",
                    callId
                );
            }

            console.info(
                "[小馨手机][通话状态] 所有文字内容显示完毕（队列为空、无处理中消息、无打字机效果），2秒后自动挂断，通话ID:",
                callId
            );

            // 等待2秒后自动挂断
            callEndedAutoHangupTimers[callId] = setTimeout(
                function () {
                    if (currentCall && currentCall.contact) {
                        var fromRole = endedFlag.fromRole;
                        var durationOverrideSeconds =
                            endedFlag.durationOverrideSeconds;
                        // 无论谁挂断，都应该生成通话结束消息
                        // 显示侧由 initiator 决定（在 generateCallEndedMessage 中处理）
                        hangupCall(false, durationOverrideSeconds);
                    }
                    // 清理定时器引用
                    callEndedAutoHangupTimers[callId] = null;
                },
                2000 // 等待2秒
            );
        } else {
            // 如果队列不为空、正在处理或还有打字机效果，延迟一下再检查
            // 这样可以确保在消息处理完毕后能正确触发检查
            if (!callEndedAutoHangupTimers[callId]) {
                // 只在没有定时器的情况下才设置延迟检查，避免重复设置
                // 如果有打字机效果，延迟更短以便更快检查（打字机效果完成后会立即移除typing类）
                var delay = hasTypingMessage ? 200 : 500;
                setTimeout(function () {
                    checkAndAutoHangup(callId);
                }, delay);
            }
        }
    }

    // 处理消息队列，逐条显示消息
    function processCallMessageQueue(callId) {
        // 如果正在处理队列，则跳过
        if (callMessageQueueProcessing[callId]) {
            return;
        }

        // 如果队列为空，检查是否可以自动挂断
        if (
            !callMessageQueue[callId] ||
            callMessageQueue[callId].length === 0
        ) {
            // 队列为空时，检查是否可以自动挂断
            checkAndAutoHangup(callId);
            return;
        }

        // 获取消息容器
        var $messagesContainer = null;
        if ($activeCallScreen && $activeCallScreen.hasClass("show")) {
            $messagesContainer = $activeCallScreen.find(
                ".xiaoxin-active-call-messages"
            );
        }

        // 如果消息容器不存在，延迟处理
        if (!$messagesContainer || $messagesContainer.length === 0) {
            setTimeout(function () {
                processCallMessageQueue(callId);
            }, 200);
            return;
        }

        // 标记为正在处理
        callMessageQueueProcessing[callId] = true;

        // 从队列中取出第一条消息
        var queueItem = callMessageQueue[callId].shift();
        if (!queueItem) {
            callMessageQueueProcessing[callId] = false;
            return;
        }

        var message = queueItem.message;
        var characterId = queueItem.characterId;
        var isPlayerMessage = queueItem.isPlayerMessage;
        var text = message.text || message.content || "";
        var isPending = message.isPending === true;

        // ⚠️ 重要：验证消息的 call_id 是否匹配当前通话，避免不同通话的消息混淆
        var messageCallId = message.call_id || message.callId || "";
        var currentCallId = null;
        if (currentCall && currentCall.callId) {
            currentCallId = currentCall.callId;
        }

        // 如果消息没有 call_id，或者 call_id 不匹配当前通话，跳过这条消息
        if (!messageCallId || (currentCallId && messageCallId !== currentCallId)) {
            // 标记为处理完成，继续处理下一条消息
            callMessageQueueProcessing[callId] = false;
            setTimeout(function () {
                processCallMessageQueue(callId);
            }, 100);
            return;
        }

        // 检查消息是否已经在通话页面中显示（避免重复显示）
        // 这种情况可能发生在：消息在灵动岛显示时被添加到队列，然后切换到全屏通话页面时恢复了历史消息
        var isMessageAlreadyDisplayed = false;
        if ($activeCallScreen && $activeCallScreen.hasClass("show")) {
            var $messagesContainer = $activeCallScreen.find(
                ".xiaoxin-active-call-messages"
            );
            if ($messagesContainer && $messagesContainer.length > 0) {
                // 先检查消息ID
                var $existingMessage = $messagesContainer.find(
                    '[data-message-id="' + message.id + '"]'
                );
                if ($existingMessage.length > 0) {
                    isMessageAlreadyDisplayed = true;
                } else if (text) {
                    // 如果消息ID不匹配，检查消息内容是否已存在（基于内容去重）
                    $messagesContainer.find(".xiaoxin-active-call-message-content").each(function() {
                        var existingText = $(this).text().trim();
                        if (existingText === text.trim()) {
                            isMessageAlreadyDisplayed = true;
                            return false; // 跳出循环
                        }
                    });
                }
            }
        }

        // 如果消息已经在通话页面中显示，跳过处理（避免重复显示）
        if (isMessageAlreadyDisplayed) {
            console.info(
                "[小馨手机][通话中] 消息已在通话页面中显示（基于ID或内容），跳过队列处理:",
                "消息ID:",
                message.id,
                "消息内容:",
                text ? (text.substring(0, 50) + (text.length > 50 ? "..." : "")) : ""
            );
            // 标记为处理完成，继续处理下一条消息
            callMessageQueueProcessing[callId] = false;
            // 延迟一小段时间后再处理下一条
            setTimeout(function () {
                processCallMessageQueue(callId);
                checkAndAutoHangup(callId);
            }, 100);
            return;
        }

        // 创建消息元素
        var messageClass = isPlayerMessage
            ? "xiaoxin-active-call-message-item xiaoxin-active-call-message-player"
            : "xiaoxin-active-call-message-item xiaoxin-active-call-message-character";

        // 如果是待发送状态，添加pending类
        if (isPending) {
            messageClass += " xiaoxin-active-call-message-pending";
        }

        var $messageItem = $(
            '<div class="' +
                messageClass +
                '" data-message-id="' +
                message.id +
                '">' +
                '<div class="xiaoxin-active-call-message-content typing"></div>' +
                "</div>"
        );

        var $content = $messageItem.find(
            ".xiaoxin-active-call-message-content"
        );

        // 添加到容器
        $messagesContainer.append($messageItem);

        // ⚠️ 重要：在消息真正显示到DOM后，立即标记为已处理（基于ID和内容）
        var messageCallIdForMark = callId || "";
        if (messageCallIdForMark) {
            if (!lastProcessedMessageIds[messageCallIdForMark]) {
                lastProcessedMessageIds[messageCallIdForMark] = new Set();
            }
            if (!lastProcessedMessageContents[messageCallIdForMark]) {
                lastProcessedMessageContents[messageCallIdForMark] = new Set();
            }
            lastProcessedMessageIds[messageCallIdForMark].add(message.id);
            // 同时记录消息内容，用于基于内容的去重
            var messageTextForMark = text.trim();
            if (messageTextForMark) {
                lastProcessedMessageContents[messageCallIdForMark].add(messageTextForMark);
            }
            console.info(
                "[小馨手机][通话中] 消息已显示到DOM，标记为已处理:",
                "消息ID:",
                message.id,
                "call_id:",
                messageCallIdForMark
            );
        }

        // 滚动到底部
        if ($messagesContainer[0]) {
            $messagesContainer[0].scrollTop =
                $messagesContainer[0].scrollHeight;
        }

        // 打字机效果，完成后处理下一条消息
        typewriterEffect($content, text, function () {
            // 打字完成后移除typing类
            $content.removeClass("typing");

            // 延迟一小段时间后再处理下一条（让用户有时间阅读）
            setTimeout(function () {
                // 标记为处理完成，处理下一条消息
                // 注意：必须在延迟后设置，确保打字机效果完全完成
                callMessageQueueProcessing[callId] = false;

                // 处理下一条消息
                processCallMessageQueue(callId);
                // processCallMessageQueue 在队列为空时会自动调用 checkAndAutoHangup
                // 但为了确保在消息处理完毕后能正确触发检查，这里也显式调用一次
                // 因为可能存在时序问题：state=ended 消息可能在 call_voice_text 消息处理完毕后才到达
                // 延迟一下再检查，确保打字机效果的DOM更新已经完成
                setTimeout(function () {
                    checkAndAutoHangup(callId);
                }, 100); // 额外延迟100ms，确保DOM更新完成
            }, 300); // 每条消息之间间隔300ms
        });
    }

    // 恢复显示已保存的消息历史
    function restoreCallMessages(callId, contact) {
        if (
            !callMessageHistory[callId] ||
            callMessageHistory[callId].length === 0
        ) {
            return;
        }

        if (!$activeCallScreen || !$activeCallScreen.hasClass("show")) {
            return;
        }

        var $messagesContainer = $activeCallScreen.find(
            ".xiaoxin-active-call-messages"
        );
        if (!$messagesContainer || $messagesContainer.length === 0) {
            return;
        }

        // 检查当前DOM中已显示的消息ID和内容（避免重复显示）
        var displayedMessageIds = new Set();
        var displayedMessageContents = new Set();
        $messagesContainer.find("[data-message-id]").each(function () {
            var messageId = $(this).attr("data-message-id");
            if (messageId) {
                displayedMessageIds.add(messageId);
            }
            // 同时收集已显示的消息内容（用于基于内容的去重）
            var $content = $(this).find(".xiaoxin-active-call-message-content");
            if ($content.length > 0) {
                var contentText = $content.text().trim();
                if (contentText) {
                    displayedMessageContents.add(contentText);
                }
            }
        });

        // 如果已经有消息显示，不清空，只添加缺失的消息
        // 如果没有消息显示，清空后重新显示所有历史消息
        var shouldClear = displayedMessageIds.size === 0;
        if (shouldClear) {
            $messagesContainer.empty();
            // 清空DOM后，也要清空已显示内容的记录
            displayedMessageContents.clear();
        }

        // 重新显示所有历史消息（只显示缺失的消息）
        var history = callMessageHistory[callId];
        // 获取当前通话的 callId，确保只显示属于当前通话的消息
        var currentCallId =
            currentCall && currentCall.callId ? currentCall.callId : null;

        // 标记已恢复的消息为已处理，避免队列再次处理
        if (!lastProcessedMessageIds[callId]) {
            lastProcessedMessageIds[callId] = new Set();
        }
        if (!lastProcessedMessageContents[callId]) {
            lastProcessedMessageContents[callId] = new Set();
        }

        // 从队列中移除已经恢复的消息（避免队列再次处理）
        if (callMessageQueue[callId] && callMessageQueue[callId].length > 0) {
            callMessageQueue[callId] = callMessageQueue[callId].filter(
                function (queueItem) {
                    var messageId = queueItem.message
                        ? queueItem.message.id
                        : null;
                    // 如果消息已经在DOM中显示，从队列中移除
                    if (messageId && displayedMessageIds.has(messageId)) {
                        console.info(
                            "[小馨手机][通话中] 从队列中移除已恢复的消息:",
                            messageId
                        );
                        return false; // 从队列中移除
                    }
                    return true; // 保留在队列中
                }
            );
        }

        var restoredCount = 0;
        for (var i = 0; i < history.length; i++) {
            var item = history[i];
            var message = item.message;
            var messageTextForRestore = (message.text || message.content || "").trim();

            // 检查消息是否已经在DOM中显示（基于ID）
            if (displayedMessageIds.has(message.id)) {
                // 已经在DOM中，标记为已处理，避免队列再次处理
                lastProcessedMessageIds[callId].add(message.id);
                if (messageTextForRestore) {
                    lastProcessedMessageContents[callId].add(messageTextForRestore);
                }
                continue; // 已经在DOM中，跳过
            }

            // 检查消息内容是否已经在DOM中显示（基于内容去重，防止刷新后重复显示）
            if (messageTextForRestore && displayedMessageContents.has(messageTextForRestore)) {
                console.info(
                    "[小馨手机][通话中] 恢复消息时发现内容已存在，跳过显示:",
                    "消息ID:",
                    message.id,
                    "消息内容:",
                    messageTextForRestore.substring(0, 50) + (messageTextForRestore.length > 50 ? "..." : "")
                );
                // 标记为已处理，避免队列再次处理
                lastProcessedMessageIds[callId].add(message.id);
                lastProcessedMessageContents[callId].add(messageTextForRestore);
                continue; // 相同内容已在DOM中，跳过
            }

            // 检查消息的 callId 是否匹配当前通话的 callId
            var messageCallId = message.call_id || message.callId || "";
            if (currentCallId && messageCallId !== currentCallId) {
                console.warn(
                    "[小馨手机][通话中] 跳过不属于当前通话的消息:",
                    "消息callId:",
                    messageCallId,
                    "当前通话callId:",
                    currentCallId
                );
                continue; // 跳过不属于当前通话的消息
            }

            // 标记为已处理，避免队列再次处理（基于ID和内容）
            lastProcessedMessageIds[callId].add(message.id);
            if (messageTextForRestore) {
                lastProcessedMessageContents[callId].add(messageTextForRestore);
                // 同时更新已显示内容的记录，防止后续重复
                displayedMessageContents.add(messageTextForRestore);
            }

            var isPlayerMessage = item.isPlayerMessage;
            var text = message.text || message.content || "";
            var isPending = message.isPending === true;

            // 创建消息元素
            var messageClass = isPlayerMessage
                ? "xiaoxin-active-call-message-item xiaoxin-active-call-message-player"
                : "xiaoxin-active-call-message-item xiaoxin-active-call-message-character";

            // 如果是待发送状态，添加pending类
            if (isPending) {
                messageClass += " xiaoxin-active-call-message-pending";
            }

            var $messageItem = $(
                '<div class="' +
                    messageClass +
                    '" data-message-id="' +
                    message.id +
                    '">' +
                    '<div class="xiaoxin-active-call-message-content">' +
                    escapeHtml(text) +
                    "</div>" +
                    "</div>"
            );

            // 添加到容器
            $messagesContainer.append($messageItem);
            restoredCount++;
        }

        // 滚动到底部
        if ($messagesContainer[0]) {
            $messagesContainer[0].scrollTop =
                $messagesContainer[0].scrollHeight;
        }

        console.info(
            "[小馨手机][通话中] 已恢复显示",
            restoredCount,
            "条历史消息（共",
            history.length,
            "条，已显示",
            displayedMessageIds.size,
            "条，跳过重复）"
        );
    }

    // 旧版本的直接显示函数（已废弃，保留用于延迟显示的情况）
    function displayCallVoiceTextMessageDirect(
        message,
        characterId,
        callId,
        isPlayerMessage
    ) {
        if (!message || !message.id) {
            return;
        }

        // ⚠️ 重要：检查是否有当前通话，避免不同角色的通话消息混淆
        var currentCallIdForCheck = null;
        if (currentCall && currentCall.callId) {
            currentCallIdForCheck = currentCall.callId;
        } else if (callId) {
            currentCallIdForCheck = callId;
        }

        if (!currentCallIdForCheck) {
            return; // 没有当前通话，跳过显示
        }

        // 检查是否已处理过（基于ID和内容去重）
        var messageCallIdForCheck = message.call_id || message.callId || callId || "";

        // ⚠️ 重要：验证 call_id 是否匹配当前通话
        if (messageCallIdForCheck && messageCallIdForCheck !== currentCallIdForCheck) {
            return; // 不是当前通话的消息
        }

        if (messageCallIdForCheck) {
            if (!lastProcessedMessageIds[messageCallIdForCheck]) {
                lastProcessedMessageIds[messageCallIdForCheck] = new Set();
            }
            if (!lastProcessedMessageContents[messageCallIdForCheck]) {
                lastProcessedMessageContents[messageCallIdForCheck] = new Set();
            }

            var messageTextForCheck = (message.text || message.content || "").trim();

            // 检查消息ID是否已处理过
            if (lastProcessedMessageIds[messageCallIdForCheck].has(message.id)) {
                console.info(
                    "[小馨手机][通话中] Direct显示：消息已处理过（基于ID），跳过:",
                    message.id
                );
                return;
            }

            // 检查消息内容是否已处理过
            if (messageTextForCheck && lastProcessedMessageContents[messageCallIdForCheck].has(messageTextForCheck)) {
                console.info(
                    "[小馨手机][通话中] Direct显示：消息内容已处理过（基于内容），跳过:",
                    message.id,
                    "内容:",
                    messageTextForCheck.substring(0, 50) + (messageTextForCheck.length > 50 ? "..." : "")
                );
                return;
            }
        }

        // 获取消息容器（如果通话页面还没显示，等待一下再显示）
        var $messagesContainer = null;
        if ($activeCallScreen && $activeCallScreen.hasClass("show")) {
            $messagesContainer = $activeCallScreen.find(
                ".xiaoxin-active-call-messages"
            );
        }

        // 如果通话页面还没显示，延迟显示消息
        if (!$messagesContainer || $messagesContainer.length === 0) {
            // 静默等待，不输出日志
            // 等待通话页面显示后再显示消息
            var checkInterval = setInterval(function () {
                if ($activeCallScreen && $activeCallScreen.hasClass("show")) {
                    $messagesContainer = $activeCallScreen.find(
                        ".xiaoxin-active-call-messages"
                    );
                    if ($messagesContainer && $messagesContainer.length > 0) {
                        clearInterval(checkInterval);
                        // 重新调用显示函数（但跳过已处理检查，因为已经标记过了）
                        var $msgContainer = $messagesContainer;
                        var text = message.text || message.content || "";

                        // 判断是否是玩家消息
                        var msgFrom = message.from || "";
                        var isPlayerMsg = false;
                        var currentAccount = null;
                        if (window.XiaoxinWeChatAccount) {
                            currentAccount =
                                window.XiaoxinWeChatAccount.getCurrentAccount();
                        } else if (window.XiaoxinWeChatDataHandler) {
                            currentAccount =
                                window.XiaoxinWeChatDataHandler.getAccount();
                        }
                        var playerId = currentAccount
                            ? currentAccount.wechatId ||
                              currentAccount.id ||
                              "player"
                            : "player";
                        if (
                            String(msgFrom) === String(playerId) ||
                            msgFrom === "player"
                        ) {
                            isPlayerMsg = true;
                        }

                        var messageClass = isPlayerMsg
                            ? "xiaoxin-active-call-message-item xiaoxin-active-call-message-player"
                            : "xiaoxin-active-call-message-item xiaoxin-active-call-message-character";

                        var $messageItem = $(
                            '<div class="' +
                                messageClass +
                                '">' +
                                '<div class="xiaoxin-active-call-message-content typing"></div>' +
                                "</div>"
                        );
                        var $content = $messageItem.find(
                            ".xiaoxin-active-call-message-content"
                        );
                        $msgContainer.append($messageItem);

                        // ⚠️ 重要：在消息真正显示到DOM后，立即标记为已处理（基于ID和内容）
                        if (messageCallIdForCheck) {
                            lastProcessedMessageIds[messageCallIdForCheck].add(message.id);
                            var messageTextForMark = text.trim();
                            if (messageTextForMark) {
                                lastProcessedMessageContents[messageCallIdForCheck].add(messageTextForMark);
                            }
                        }

                        typewriterEffect($content, text, function () {
                            $content.removeClass("typing");
                        });
                        $msgContainer[0].scrollTop =
                            $msgContainer[0].scrollHeight;
                    }
                }
            }, 100);

            // 最多等待5秒
            setTimeout(function () {
                clearInterval(checkInterval);
            }, 5000);
            return;
        }

        var text = message.text || message.content || "";

        if (!$messagesContainer || $messagesContainer.length === 0) {
            return;
        }

        // 创建消息元素（不显示发送者名称）
        var messageClass = isPlayerMessage
            ? "xiaoxin-active-call-message-item xiaoxin-active-call-message-player"
            : "xiaoxin-active-call-message-item xiaoxin-active-call-message-character";

        var $messageItem = $(
            '<div class="' +
                messageClass +
                '">' +
                '<div class="xiaoxin-active-call-message-content typing"></div>' +
                "</div>"
        );

        var $content = $messageItem.find(
            ".xiaoxin-active-call-message-content"
        );

        // 添加到容器
        $messagesContainer.append($messageItem);

        // ⚠️ 重要：在消息真正显示到DOM后，立即标记为已处理（基于ID和内容）
        if (messageCallIdForCheck) {
            lastProcessedMessageIds[messageCallIdForCheck].add(message.id);
            var messageTextForMark = text.trim();
            if (messageTextForMark) {
                lastProcessedMessageContents[messageCallIdForCheck].add(messageTextForMark);
            }
        }

        // 打字机效果
        typewriterEffect($content, text, function () {
            // 打字完成后移除typing类
            $content.removeClass("typing");
        });

        // 滚动到底部
        if ($messagesContainer[0]) {
            $messagesContainer[0].scrollTop =
                $messagesContainer[0].scrollHeight;
        }
    }

    // 打字机效果（速度调慢）
    function typewriterEffect($element, text, callback) {
        if (!text) {
            if (callback) {
                callback();
            }
            return;
        }

        var index = 0;
        var speed = 60; // 每个字符的延迟（毫秒），从30调整为60，速度更慢

        function type() {
            if (index < text.length) {
                $element.text(text.substring(0, index + 1));
                index++;
                setTimeout(type, speed);
            } else {
                if (callback) {
                    callback();
                }
            }
        }

        type();
    }

    // 清理消息监听器
    function cleanupCallMessageListener() {
        if (callMessageObserver) {
            callMessageObserver.disconnect();
            callMessageObserver = null;
        }
        if (callMessageListenerInterval) {
            clearInterval(callMessageListenerInterval);
            callMessageListenerInterval = null;
        }
        // 清理消息队列（但不清理消息历史，以便恢复显示）
        if (currentCall && currentCall.callId) {
            var callId = currentCall.callId;
            if (callMessageQueue[callId]) {
                callMessageQueue[callId] = [];
            }
            callMessageQueueProcessing[callId] = false;
        }
    }

    // 清理通话相关的所有数据（仅在真正挂断时调用）
    function cleanupCallData(callId) {
        if (callId) {
            // 清理消息队列
            if (callMessageQueue[callId]) {
                callMessageQueue[callId] = [];
            }
            callMessageQueueProcessing[callId] = false;
            // 清理消息历史（挂断后不再需要）
            if (callMessageHistory[callId]) {
                delete callMessageHistory[callId];
            }
            // 清理已处理消息ID记录
            if (lastProcessedMessageIds[callId]) {
                delete lastProcessedMessageIds[callId];
            }
            // 清理已处理消息内容记录
            if (lastProcessedMessageContents[callId]) {
                delete lastProcessedMessageContents[callId];
            }
            // 清理通话结束标记
            if (callEndedFlags[callId]) {
                delete callEndedFlags[callId];
            }
            // 清理自动挂断定时器
            if (callEndedAutoHangupTimers[callId]) {
                clearTimeout(callEndedAutoHangupTimers[callId]);
                callEndedAutoHangupTimers[callId] = null;
                delete callEndedAutoHangupTimers[callId];
            }
        }
    }

    return {
        show: showIncomingCall,
        close: closeIncomingCall,
        showFullScreen: showFullScreenCall,
        closeFullScreen: closeFullScreenCall,
        removeFloatingIcon: removeFloatingCallIcon,
        showActiveCall: showActiveCallScreen, // 新增：显示通话中界面
        closeActiveCall: closeActiveCallScreen, // 新增：关闭通话中界面
        displayCallVoiceTextMessage: displayCallVoiceTextMessage, // 新增：显示语音通话文本消息
        get currentCall() {
            return currentCall;
        }, // 新增：获取当前通话信息（使用 getter）
    };
})();
