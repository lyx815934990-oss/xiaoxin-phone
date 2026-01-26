// 微信 UI 组件库 - 可复用的 UI 组件

window.XiaoxinWeChatComponents = (function () {
    // ========== 当前活动聊天页面管理 ==========
    // 用于跟踪玩家当前正在查看的聊天页面ID（角色ID或群聊ID）
    var currentActiveChatId = null;

    // 设置当前活动的聊天页面ID
    function setActiveChatId(chatId) {
        if (chatId) {
            currentActiveChatId = chatId;
            console.info(
                "[小馨手机][微信组件] 设置当前活动聊天页面ID:",
                chatId
            );
        }
    }

    // 清除当前活动的聊天页面ID
    function clearActiveChatId() {
        if (currentActiveChatId) {
            console.info(
                "[小馨手机][微信组件] 清除当前活动聊天页面ID:",
                currentActiveChatId
            );
        }
        currentActiveChatId = null;
    }

    // 获取当前活动的聊天页面ID
    function getActiveChatId() {
        return currentActiveChatId;
    }

    // 检查指定的聊天ID是否是当前活动的聊天页面
    function isActiveChat(chatId) {
        return currentActiveChatId === chatId;
    }

    // ========== 清除未读消息红点 ==========
    // 当玩家点击或停留在聊天页面时，清除该角色的未读消息红点
    function clearUnreadBadge(chatId) {
        if (!chatId) {
            console.warn("[小馨手机][微信组件] 清除红点失败：未提供聊天ID");
            return false;
        }

        // 验证聊天ID是否匹配当前活动聊天页面，避免误清除
        if (!isActiveChat(chatId)) {
            console.warn(
                "[小馨手机][微信组件] 清除红点失败：聊天ID不匹配。当前活动:",
                currentActiveChatId,
                "请求:",
                chatId
            );
            return false;
        }

        if (window.XiaoxinWeChatDataHandler) {
            var currentUnread =
                window.XiaoxinWeChatDataHandler.getUnreadCount(chatId);
            if (currentUnread > 0) {
                window.XiaoxinWeChatDataHandler.clearUnreadCount(chatId);
                console.info(
                    "[小馨手机][微信组件] 清除未读消息红点:",
                    chatId,
                    "原未读数:",
                    currentUnread
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
                        "[小馨手机][微信组件] 触发红点更新事件失败:",
                        e
                    );
                }
                return true;
            }
        }
        return false;
    }

    // ========== 获取未读消息总数 ==========
    function getTotalUnreadCount() {
        var totalUnread = 0;
        if (window.XiaoxinWeChatDataHandler) {
            try {
                var allChats =
                    window.XiaoxinWeChatDataHandler.getAllChats() || {};
                Object.keys(allChats).forEach(function (userId) {
                    var count =
                        window.XiaoxinWeChatDataHandler.getUnreadCount(userId);
                    if (typeof count === "number" && count > 0) {
                        totalUnread += count;
                    }
                });
            } catch (e) {
                console.warn("[小馨手机][微信组件] 获取未读消息数失败:", e);
            }
        }
        return totalUnread;
    }

    // ========== 更新标题栏未读数显示 ==========
    function updateHeaderTitle($headerTitle) {
        if (!$headerTitle || !$headerTitle.length) return;

        var totalUnread = getTotalUnreadCount();
        if (totalUnread > 0) {
            $headerTitle.text("微信（" + totalUnread + "）");
        } else {
            $headerTitle.text("微信");
        }
    }

    // ========== 获取未读好友申请数 ==========
    function getPendingFriendRequestCount() {
        var count = 0;
        if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getFriendRequests === "function") {
            try {
                var requests = window.XiaoxinWeChatDataHandler.getFriendRequests() || [];
                // 只统计角色向玩家发起的、状态为pending的申请
                count = requests.filter(function (req) {
                    return req.direction === "role_to_player" && req.status === "pending";
                }).length;
            } catch (e) {
                console.warn("[小馨手机][微信组件] 获取未读好友申请数失败:", e);
            }
        }
        return count;
    }

    // ========== 更新导航栏"微信"按钮红点 ==========
    function updateTabBarBadge($tabBar) {
        if (!$tabBar || !$tabBar.length) return;

        var $chatTab = $tabBar.find('[data-tab="chat"]');
        if (!$chatTab.length) return;

        var $badge = $chatTab.find(".xiaoxin-wechat-tab-badge");
        var totalUnread = getTotalUnreadCount();

        if (totalUnread > 0) {
            if ($badge.length === 0) {
                // 创建红点
                $badge = $('<div class="xiaoxin-wechat-tab-badge"></div>');
                $chatTab.append($badge);
            }
            $badge.text(totalUnread > 99 ? "99+" : totalUnread);
            $badge.addClass("show");

            // 根据数字位数调整样式
            $badge.removeClass("single-digit double-digit triple-digit");
            if (totalUnread < 10) {
                $badge.addClass("single-digit");
            } else if (totalUnread < 100) {
                $badge.addClass("double-digit");
            } else {
                $badge.addClass("triple-digit");
            }
        } else {
            if ($badge.length > 0) {
                $badge.removeClass("show");
                $badge.text("");
            }
        }
    }

    // ========== 更新导航栏"通讯录"按钮红点 ==========
    function updateContactsTabBadge($tabBar) {
        if (!$tabBar || !$tabBar.length) return;

        var $contactsTab = $tabBar.find('[data-tab="contacts"]');
        if (!$contactsTab.length) return;

        var $badge = $contactsTab.find(".xiaoxin-wechat-tab-badge");
        var pendingCount = getPendingFriendRequestCount();

        if (pendingCount > 0) {
            if ($badge.length === 0) {
                // 创建红点
                $badge = $('<div class="xiaoxin-wechat-tab-badge"></div>');
                $contactsTab.append($badge);
            }
            $badge.text(pendingCount > 99 ? "99+" : pendingCount);
            $badge.addClass("show");

            // 根据数字位数调整样式
            $badge.removeClass("single-digit double-digit triple-digit");
            if (pendingCount < 10) {
                $badge.addClass("single-digit");
            } else if (pendingCount < 100) {
                $badge.addClass("double-digit");
            } else {
                $badge.addClass("triple-digit");
            }
        } else {
            if ($badge.length > 0) {
                $badge.removeClass("show");
                $badge.text("");
            }
        }
    }

    // ========== 更新所有未读提示 ==========
    function updateAllUnreadBadges($root) {
        if (!$root || !$root.length) return;

        // 更新标题栏
        var $headerTitle = $root.find(".xiaoxin-wechat-header-title");
        updateHeaderTitle($headerTitle);

        // 更新导航栏
        var $tabBar = $root.find(".xiaoxin-wechat-tab-bar");
        updateTabBarBadge($tabBar);
        updateContactsTabBadge($tabBar);
    }

    // ========== 全局消息弹窗 ==========
    var notificationQueue = []; // 消息弹窗队列
    var isShowingNotification = false; // 是否正在显示弹窗
    var currentNotificationTimer = null; // 当前弹窗的定时器

    // 检查玩家是否在微信主页或聊天页面
    function isInWeChatPage() {
        // 检查是否在微信主页（聊天列表）
        var isInChatMain =
            $(".xiaoxin-wechat-chat-main").length > 0 &&
            $(".xiaoxin-wechat-chat-detail-main").length === 0;

        // 检查是否在聊天详情页面
        var isInChatDetail = $(".xiaoxin-wechat-chat-screen").length > 0;

        return isInChatMain || isInChatDetail;
    }

    // 获取联系人信息
    function getContactInfo(contactId) {
        if (!window.XiaoxinWeChatDataHandler) {
            return null;
        }

        var contacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
        var contact = contacts.find(function (c) {
            var cId = String(c.id || "").trim();
            var cWechatId = String(c.wechatId || "").trim();
            var cCharId = String(c.characterId || "").trim();
            var userIdStr = String(contactId).trim();

            return (
                cId === userIdStr ||
                cId === "contact_" + userIdStr ||
                userIdStr === "contact_" + cId ||
                cWechatId === userIdStr ||
                cCharId === userIdStr ||
                cId.replace(/^contact_/, "") ===
                    userIdStr.replace(/^contact_/, "")
            );
        });

        return contact;
    }

    // 格式化消息预览
    function formatMessagePreview(message) {
        if (!message) return "[消息]";

        if (message.type === "system") {
            return message.content || "[系统消息]";
        } else if (message.type === "redpacket") {
            // 红包消息：显示为"[微信红包]备注"
            var note = message.note || message.greeting || "恭喜发财, 大吉大利";
            return "[微信红包]" + note;
        } else if (message.type === "image") {
            return "[图片]";
        } else if (message.type === "emoji") {
            return "[动画表情]";
        } else if (message.type === "call_voice") {
            return "[语音通话]";
        } else if (message.type === "call_video") {
            return "[视频通话]";
        } else if (message.type === "voice") {
            // 语音消息：格式为 [语音]XX"
            // 兼容不同来源的时长字段（按优先级顺序）
            var rawDuration =
                message.duration_sec ||
                message.duration ||
                (message.payload && message.payload.duration_sec) ||
                (message.payload && message.payload.duration);

            // 调试日志
            if (!rawDuration || rawDuration === 0 || rawDuration === "0") {
                console.warn(
                    "[小馨手机][微信组件] 语音消息缺少时长信息:",
                    message
                );
            }

            var duration = parseInt(rawDuration, 10);
            if (isNaN(duration) || duration <= 0) {
                console.warn(
                    "[小馨手机][微信组件] 语音消息时长无效，使用默认值1秒:",
                    "原始值:",
                    rawDuration,
                    "消息对象:",
                    message
                );
                duration = 1;
            }
            if (duration > 60) {
                duration = 60;
            }
            return "[语音]" + duration + '"';
        } else if (message.type === "transfer") {
            // 转账消息：显示为"[转账]"
            return "[转账]";
        } else if (message.content) {
            var preview = message.content
                .replace(/<br\s*\/?>/gi, " ")
                .replace(/<[^>]+>/g, "")
                .replace(/&nbsp;/gi, " ")
                .trim();
            if (preview.length > 30) {
                preview = preview.substring(0, 30) + "...";
            }
            return preview || "[消息]";
        }

        return "[消息]";
    }

    // 显示消息弹窗
    function showNotification(contactId, message) {
        // 如果玩家在微信主页或聊天页面，不显示弹窗
        if (isInWeChatPage()) {
            console.info(
                "[小馨手机][微信组件] 玩家在微信页面，不显示消息弹窗:",
                contactId
            );
            return;
        }

        // 获取联系人信息
        var contact = getContactInfo(contactId);
        if (!contact) {
            console.warn(
                "[小馨手机][微信组件] 未找到联系人信息，不显示弹窗:",
                contactId
            );
            return;
        }

        // 获取联系人显示名称（优先使用备注，其次昵称）
        var displayName =
            contact.remark || contact.nickname || contact.name || "未知";

        // 获取联系人头像
        var avatarUrl =
            contact.avatar ||
            "/scripts/extensions/third-party/小馨手机/image/头像/微信默认头像.jpg";

        // 格式化消息预览
        var messagePreview = formatMessagePreview(message);

        // 如果是通话消息，弹窗统一显示为"[未接通话]"
        if (message.type === "call_voice" || message.type === "call_video") {
            messagePreview = "[未接通话]";
        }

        // 创建弹窗元素
        var $notification = $(
            '<div class="xiaoxin-wechat-notification"></div>'
        );

        var $avatar = $(
            '<div class="xiaoxin-wechat-notification-avatar"></div>'
        );
        $avatar.css("background-image", "url(" + avatarUrl + ")");

        var $content = $(
            '<div class="xiaoxin-wechat-notification-content"></div>'
        );

        var $name = $(
            '<div class="xiaoxin-wechat-notification-name">' +
                escapeHtml(displayName) +
                "</div>"
        );

        var $message = $(
            '<div class="xiaoxin-wechat-notification-message">' +
                escapeHtml(messagePreview) +
                "</div>"
        );

        $content.append($name, $message);
        $notification.append($avatar, $content);

        // 添加到页面（添加到手机屏幕容器中，确保相对于手机容器定位）
        var $phoneScreen = $(".xiaoxin-phone-screen");
        if ($phoneScreen.length === 0) {
            // 如果找不到手机屏幕，尝试找手机容器
            $phoneScreen = $(".xiaoxin-phone-container");
            if ($phoneScreen.length === 0) {
                // 如果都找不到，添加到 body（降级方案）
                $phoneScreen = $("body");
                // 如果添加到 body，需要改回 fixed 定位
                $notification.css("position", "fixed");
            }
        }
        $phoneScreen.append($notification);

        // 触发弹出动画
        setTimeout(function () {
            $notification.addClass("show");
        }, 10);

        // 点击弹窗，跳转到聊天页面
        $notification.on("click", function () {
            hideNotification($notification, function () {
                // 触发跳转到聊天页面的事件
                if (window.XiaoxinWeChatApp) {
                    // 需要找到微信应用的根元素
                    var $wechatRoot = $(".xiaoxin-wechat-root");
                    if ($wechatRoot.length > 0 && window.XiaoxinWeChatApp) {
                        // 调用微信应用的跳转方法（需要检查是否有这个方法）
                        console.info(
                            "[小馨手机][微信组件] 点击弹窗，跳转到聊天页面:",
                            contactId
                        );
                        // 触发自定义事件，让微信应用处理跳转
                        var jumpEvent = new CustomEvent(
                            "xiaoxin-wechat-jump-to-chat",
                            {
                                detail: {
                                    contactId: contactId,
                                    contact: contact,
                                },
                            }
                        );
                        window.dispatchEvent(jumpEvent);
                    }
                }
            });
        });

        // 3秒后自动隐藏（清除之前的定时器，避免冲突）
        if (currentNotificationTimer) {
            clearTimeout(currentNotificationTimer);
        }
        currentNotificationTimer = setTimeout(function () {
            hideNotification($notification);
        }, 3000);

        console.info(
            "[小馨手机][微信组件] 显示消息弹窗:",
            contactId,
            "联系人:",
            displayName
        );
    }

    // 隐藏消息弹窗
    function hideNotification($notification, callback) {
        if (!$notification || !$notification.length) {
            if (callback) callback();
            isShowingNotification = false;
            // 处理队列中的下一条消息
            processNotificationQueue();
            return;
        }

        // 清除定时器
        if (currentNotificationTimer) {
            clearTimeout(currentNotificationTimer);
            currentNotificationTimer = null;
        }

        // 添加隐藏类，触发往上滑动且渐隐的动画
        $notification.removeClass("show");
        $notification.addClass("hiding");

        // 动画完成后移除元素
        setTimeout(function () {
            $notification.remove();
            isShowingNotification = false;
            if (callback) callback();
            // 处理队列中的下一条消息
            processNotificationQueue();
        }, 300); // 动画时长300ms
    }

    // 处理消息弹窗队列
    function processNotificationQueue() {
        if (isShowingNotification || notificationQueue.length === 0) {
            return;
        }

        isShowingNotification = true;
        var notification = notificationQueue.shift();
        showNotification(notification.contactId, notification.message);

        // 注意：showNotification 内部已经设置了3秒后自动隐藏的定时器
        // 隐藏完成后会自动调用 processNotificationQueue 处理下一条
    }

    // 添加消息到弹窗队列
    function addNotificationToQueue(contactId, message) {
        // 如果玩家在微信主页或聊天页面，不添加到队列
        if (isInWeChatPage()) {
            return;
        }

        notificationQueue.push({
            contactId: contactId,
            message: message,
        });

        // 如果当前没有显示弹窗，立即处理
        if (!isShowingNotification) {
            processNotificationQueue();
        }
    }

    // 工具函数：转义HTML
    function escapeHtml(text) {
        if (!text) return "";
        return $("<div>").text(text).html();
    }

    // 初始化消息弹窗监听
    function initNotificationListener() {
        // 监听消息显示完成事件
        window.addEventListener("xiaoxin-message-displayed", function (event) {
            var contactId = event.detail && event.detail.contactId;
            var message = event.detail && event.detail.message;

            if (!contactId || !message) return;

            // 检查玩家是否在微信主页或聊天页面
            if (isInWeChatPage()) {
                // 在微信页面，不显示弹窗
                return;
            }

            // 检查玩家是否在该联系人的聊天页面
            if (
                window.XiaoxinWeChatComponents &&
                window.XiaoxinWeChatComponents.isActiveChat &&
                window.XiaoxinWeChatComponents.isActiveChat(contactId)
            ) {
                // 在该联系人的聊天页面，不显示弹窗
                return;
            }

            // 添加到弹窗队列
            addNotificationToQueue(contactId, message);
        });

        console.info("[小馨手机][微信组件] 消息弹窗监听器已初始化");
    }

    // 自动初始化
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            initNotificationListener();
        });
    } else {
        initNotificationListener();
    }

    return {
        // 活动聊天页面管理
        setActiveChatId: setActiveChatId,
        clearActiveChatId: clearActiveChatId,
        getActiveChatId: getActiveChatId,
        isActiveChat: isActiveChat,
        // 红点清除
        clearUnreadBadge: clearUnreadBadge,
        // 未读消息统计
        getTotalUnreadCount: getTotalUnreadCount,
        getPendingFriendRequestCount: getPendingFriendRequestCount,
        // UI更新
        updateHeaderTitle: updateHeaderTitle,
        updateTabBarBadge: updateTabBarBadge,
        updateContactsTabBadge: updateContactsTabBadge,
        updateAllUnreadBadges: updateAllUnreadBadges,
        // 消息弹窗
        showNotification: showNotification,
        addNotificationToQueue: addNotificationToQueue,
        isInWeChatPage: isInWeChatPage,
    };
})();
