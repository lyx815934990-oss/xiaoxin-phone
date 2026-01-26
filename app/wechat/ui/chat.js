// 微信聊天UI模块
window.XiaoxinWeChatChatUI = (function () {
    // ========== 模块级变量：存储每个聊天页面的 pendingMessages ==========
    var chatPendingMessages = {}; // key: userId, value: { msgId: msgObj }

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
                                "[小馨手机][微信聊天UI] 获取用户聊天记录时出错:",
                                userId,
                                e
                            );
                        }
                    });
                }
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信聊天UI] 获取所有已使用通话ID时出错:",
                e
            );
        }

        console.info(
            "[小馨手机][微信聊天UI] 已加载所有已使用的通话ID，数量:",
            allUsedCallIds.size
        );
        return allUsedCallIds;
    }

    // ========== 生成唯一的通话ID（用于玩家主动发起通话） ==========
    function generateUniqueCallIdForOutgoing(baseId) {
        // 获取所有已使用的通话ID
        var allUsedCallIds = getAllUsedCallIds();

        // 生成基础通话ID
        var callId = "call_out_" + baseId;

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
            callId = "call_out_" + baseId + randomSuffix;
        }

        if (attempts >= maxAttempts) {
            console.error(
                "[小馨手机][微信聊天UI] 生成唯一通话ID失败，已尝试",
                maxAttempts,
                "次"
            );
            // 即使失败，也使用带时间戳的ID
            callId =
                "call_out_" +
                baseId +
                "_" +
                Date.now() +
                "_" +
                Math.random().toString(36).substr(2, 9);
        }

        // 注意：不需要将新生成的ID添加到已使用列表，因为下次生成时会重新获取
        // 这样可以确保总是从数据源获取最新的已使用ID列表

        console.info(
            "[小馨手机][微信聊天UI] 生成唯一通话ID:",
            callId,
            "尝试次数:",
            attempts
        );

        return callId;
    }
    // ========== 渲染聊天界面 ==========
    function renderChatScreen(userId, options) {
        options = options || {};
        var contact = options.contact || {};
        var onBack = options.onBack || function () {};

        console.info(
            "[小馨手机][微信聊天UI] 渲染聊天界面，userId:",
            userId,
            "contact:",
            contact
        );

        // 统一使用联系人的 id 作为聊天对象的ID
        // 如果 contact.id 存在，优先使用它；否则使用 userId
        var chatUserId = contact && contact.id ? contact.id : userId;
        console.info("[小馨手机][微信聊天UI] 统一后的聊天对象ID:", chatUserId);

        // 设置当前活动的聊天页面ID（用于红点清除机制）
        if (
            window.XiaoxinWeChatComponents &&
            window.XiaoxinWeChatComponents.setActiveChatId
        ) {
            window.XiaoxinWeChatComponents.setActiveChatId(chatUserId);
        }

        // 清除该角色的未读消息红点（玩家点击或停留在聊天页面时）
        function clearUnreadBadgeIfActive() {
            if (
                window.XiaoxinWeChatComponents &&
                window.XiaoxinWeChatComponents.clearUnreadBadge
            ) {
                window.XiaoxinWeChatComponents.clearUnreadBadge(chatUserId);
            }
        }

        // 页面渲染时立即清除一次（玩家点击或停留在该角色的聊天页面）
        clearUnreadBadgeIfActive();

        // 主容器
        var $container = $('<div class="xiaoxin-wechat-chat-screen"></div>');
        // 设置 data-user-id 属性，方便后续查找和刷新
        $container.attr("data-user-id", chatUserId);
        // 保存 onBack 回调到全局对象，供 refreshChatScreen 使用
        // 使用一个唯一的 key 来保存，避免冲突
        var onBackKey = "xiaoxin_wechat_chat_onback_" + chatUserId;
        if (typeof window.XiaoxinWeChatChatOnBackCallbacks === "undefined") {
            window.XiaoxinWeChatChatOnBackCallbacks = {};
        }
        window.XiaoxinWeChatChatOnBackCallbacks[onBackKey] = onBack;
        // 同时保存 key 到容器，方便 refreshChatScreen 查找
        $container.data("onBackKey", onBackKey);

        // 顶部导航栏
        var $navBar = $('<div class="xiaoxin-wechat-chat-nav-bar"></div>');
        var $backBtn = $(
            '<div class="xiaoxin-wechat-chat-nav-back">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        $backBtn.on("click", function () {
            // 清除活动聊天页面ID（用户离开聊天页面）
            if (
                window.XiaoxinWeChatComponents &&
                window.XiaoxinWeChatComponents.clearActiveChatId
            ) {
                window.XiaoxinWeChatComponents.clearActiveChatId();
            }
            // 直接使用闭包中的 onBack，不要从 jQuery data 中获取
            // 因为 jQuery data 无法正确保存包含闭包变量的函数
            if (typeof onBack === "function") {
                try {
                    onBack();
                } catch (e) {
                    console.error(
                        "[小馨手机][微信聊天UI] 调用 onBack 回调失败:",
                        e
                    );
                }
            }
        });

        var displayName =
            contact.remark || contact.nickname || contact.name || "未知";
        var $navTitle = $(
            '<div class="xiaoxin-wechat-chat-nav-title">' +
                escapeHtml(displayName) +
                "</div>"
        );

        var $navMore = $('<div class="xiaoxin-wechat-chat-nav-more">⋯</div>');

        // 点击右上角"更多"按钮，打开聊天详情/聊天设置页面
        $navMore.on("click", function () {
            try {
                showChatSettingsPage($container, chatUserId, contact);
            } catch (e) {
                console.warn(
                    "[小馨手机][微信聊天UI] 打开聊天详情页面失败:",
                    e
                );
            }
        });

        $navBar.append($backBtn, $navTitle, $navMore);
        $container.append($navBar);

        // 聊天内容区域
        var $chatContent = $(
            '<div class="xiaoxin-wechat-chat-content-area"></div>'
        );
        var $messagesList = $(
            '<div class="xiaoxin-wechat-chat-messages-list"></div>'
        );

        // 应用聊天背景（使用与手机壁纸相同的尺寸计算方式）
        function applyChatBackground() {
            try {
                var background = null;
                var scale = 100;

                // 优先检查角色专用背景
                if (chatUserId && window.XiaoxinWeChatDataHandler && window.XiaoxinWeChatDataHandler.getContactChatBackground) {
                    var contactBg = window.XiaoxinWeChatDataHandler.getContactChatBackground(chatUserId);
                    if (contactBg && contactBg.background) {
                        background = contactBg.background;
                        scale = contactBg.scale || 100;
                    }
                }

                // 如果没有角色专用背景，使用全局背景
                if (!background) {
                    var settings =
                        window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.getSettings
                            ? window.XiaoxinWeChatDataHandler.getSettings()
                            : {};
                    background = settings.chatBackground;
                    scale = settings.chatBackgroundScale || 100;
                }

                if (background) {
                    // 使用与手机壁纸相同的格式：百分比宽度，高度自动
                    $chatContent.css({
                        "background-image": "url(" + background + ")",
                        "background-size": scale + "% auto",
                        "background-position": "center",
                        "background-repeat": "no-repeat",
                    });
                } else {
                    $chatContent.css({
                        "background-image": "none",
                        "background-size": "auto",
                        "background-position": "center",
                        "background-repeat": "no-repeat",
                    });
                }
            } catch (e) {
                console.warn("[小馨手机][微信聊天UI] 应用聊天背景时出错:", e);
            }
        }

        // 初始应用背景
        applyChatBackground();

        // 监听背景变化事件
        $(window).on("xiaoxin-wechat-chat-background-changed", function () {
            applyChatBackground();
        });

        // 获取当前账号信息
        var currentAccount = null;
        if (window.XiaoxinWeChatAccount) {
            currentAccount = window.XiaoxinWeChatAccount.getCurrentAccount();
        } else if (window.XiaoxinWeChatDataHandler) {
            currentAccount = window.XiaoxinWeChatDataHandler.getAccount();
        }

        var playerNickname = currentAccount
            ? currentAccount.nickname || "我"
            : "我";

        $chatContent.append($messagesList);
        $container.append($chatContent);

        // 底部输入栏
        var $inputBar = $('<div class="xiaoxin-wechat-chat-input-bar"></div>');
        // 使用自定义图标替换原来的 emoji 文本按钮
        var $voiceBtn = $(
            '<div class="xiaoxin-wechat-chat-input-voice"></div>'
        );
        // 确保语音按钮图标正确加载
        $voiceBtn.css("background-image", "url(/scripts/extensions/third-party/xiaoxin-phone/image/icon/语音按钮.jpg)");
        
        var $inputField = $(
            '<input type="text" class="xiaoxin-wechat-chat-input-field" placeholder="">'
        );
        var $emojiBtn = $(
            '<div class="xiaoxin-wechat-chat-input-emoji"></div>'
        );
        // 确保表情按钮图标正确加载
        $emojiBtn.css("background-image", "url(/scripts/extensions/third-party/xiaoxin-phone/image/icon/表情按钮.png)");
        
        var $addBtn = $('<div class="xiaoxin-wechat-chat-input-add"></div>');
        // 确保加号按钮图标正确加载
        $addBtn.css("background-image", "url(/scripts/extensions/third-party/xiaoxin-phone/image/icon/聊天功能按钮.jpg)");

        $inputBar.append($voiceBtn, $inputField, $emojiBtn, $addBtn);
        $container.append($inputBar);

        // ========== 加号按钮菜单栏 ==========
        var $menuBar = $('<div class="xiaoxin-wechat-chat-menu-bar"></div>');
        var $menuGrid = $('<div class="xiaoxin-wechat-chat-menu-grid"></div>');

        // 菜单按钮配置
        var menuItems = [
            {
                icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/照片图标.png",
                label: "照片",
            },
            {
                icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/视频通话图标.png",
                label: "视频通话",
            },
            {
                icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/红包图标.png",
                label: "红包",
            },
            {
                icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/转账图标.png",
                label: "转账",
            },
            {
                icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/个人名片图标.png",
                label: "个人名片",
            },
            {
                icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/音乐图标.png",
                label: "音乐",
            },
        ];

        // 创建菜单按钮
        menuItems.forEach(function (item) {
            var $menuItem = $(
                '<div class="xiaoxin-wechat-chat-menu-item"></div>'
            );
            var $menuIcon = $(
                '<div class="xiaoxin-wechat-chat-menu-icon"></div>'
            );
            // 设置图标背景图片
            var iconUrl = item.icon;
            console.info("[小馨手机][微信聊天UI] 设置菜单图标:", item.label, iconUrl);
            $menuIcon.css("background-image", "url(" + iconUrl + ")");
            var $menuLabel = $(
                '<div class="xiaoxin-wechat-chat-menu-label"></div>'
            ).text(item.label);
            $menuItem.append($menuIcon, $menuLabel);

            // 为照片按钮添加点击事件
            if (item.label === "照片") {
                $menuItem.on("click", function (e) {
                    e.stopPropagation();
                    // 关闭菜单
                    if (isMenuExpanded) {
                        toggleMenu();
                    }
                    if (
                        window.XiaoxinPhotoMessage &&
                        window.XiaoxinPhotoMessage.showPhotoMessageDialog
                    ) {
                        window.XiaoxinPhotoMessage.showPhotoMessageDialog();
                    }
                });
            }

            // 为视频通话按钮添加点击事件
            if (item.label === "视频通话") {
                $menuItem.on("click", function (e) {
                    e.stopPropagation();
                    showCallOptionsDialog();
                });
            }

            // 为红包按钮添加点击事件
            if (item.label === "红包") {
                $menuItem.on("click", function (e) {
                    e.stopPropagation();
                    // 关闭菜单
                    $menuBar.slideUp(200);
                    isMenuExpanded = false;

                    // 获取容器的父元素（用于替换整个容器）
                    var $parent = $container.parent();
                    if ($parent.length === 0) {
                        // 如果没有父元素，使用容器本身
                        $parent = $container;
                    }

                    // 渲染发红包页面
                    if (
                        window.XiaoxinWeChatRedPacketUI &&
                        window.XiaoxinWeChatRedPacketUI.renderSendRedPacketPage
                    ) {
                        // 清空父容器
                        $parent.empty();

                        // 渲染发红包页面
                        window.XiaoxinWeChatRedPacketUI.renderSendRedPacketPage(
                            $parent,
                            {
                                userId: chatUserId,
                                onBack: function () {
                                    // 返回聊天页面：重新渲染聊天界面
                                    if (
                                        window.XiaoxinWeChatChatUI &&
                                        window.XiaoxinWeChatChatUI
                                            .renderChatScreen
                                    ) {
                                        // 清空父容器
                                        $parent.empty();

                                        // 重新渲染聊天界面
                                        var $newChatContainer =
                                            window.XiaoxinWeChatChatUI.renderChatScreen(
                                                chatUserId,
                                                {
                                                    contact: contact,
                                                    onBack: onBack,
                                                }
                                            );

                                        // 将新的聊天容器添加到父容器
                                        $parent.append($newChatContainer);
                                    }
                                },
                            }
                        );
                    } else {
                        console.warn("[小馨手机][微信聊天UI] 红包UI模块未加载");
                        if (typeof toastr !== "undefined") {
                            toastr.warning("红包功能暂不可用", "小馨手机");
                        }
                    }
                });
            }

            // 为转账按钮添加点击事件
            if (item.label === "转账") {
                $menuItem.on("click", function (e) {
                    e.stopPropagation();
                    // 关闭菜单（用统一逻辑恢复消息列表 padding-bottom）
                    if (isMenuExpanded) {
                        toggleMenu();
                    }
                    showTransferPanel();
                });
            }

            $menuGrid.append($menuItem);
        });

        $menuBar.append($menuGrid);
        $container.append($menuBar);

        // ========== 转账面板（从底部滑出） ==========
        function showTransferPanel() {
            try {
                // 移除已有面板
                $container.find(".xiaoxin-wechat-transfer-overlay").remove();

                // 判断对方是否拉黑/删除玩家（粗略兜底字段，未定义则视为正常）
                function canTransferToContact(c) {
                    if (!c) return false;
                    var blocked =
                        c.isBlocked === true ||
                        c.blocked === true ||
                        c.blacklisted === true ||
                        c.friendStatus === "blocked";
                    var deleted =
                        c.isDeleted === true ||
                        c.deleted === true ||
                        c.removed === true ||
                        c.friendStatus === "deleted";
                    return !blocked && !deleted;
                }

                // 匿名实名制：*X / **X（按名字长度）
                function formatMaskedRealName(raw) {
                    var name = String(raw || "").trim();
                    if (!name) return "";
                    var lastChar = name.charAt(name.length - 1);
                    var stars = "*".repeat(Math.max(1, name.length - 1));
                    return stars + lastChar;
                }

                var displayName =
                    (contact &&
                        (contact.remark || contact.nickname || contact.name)) ||
                    "未知";
                var wechatId =
                    (contact &&
                        (contact.wechatId ||
                            contact.wechat_id ||
                            contact.wechatID ||
                            contact.id)) ||
                    "";
                var avatarUrl =
                    (contact && contact.avatar) ||
                    "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";

                var showRealName = canTransferToContact(contact);
                // 优先从联系方式中读取实名信息（从世界书解析的字段）
                var realNameRaw =
                    (contact &&
                        (contact.realName ||
                            contact.legalName ||
                            contact.fullName ||
                            contact.real_name ||
                            contact.legal_name ||
                            contact.full_name ||
                            contact.name ||
                            contact.nickname)) ||
                    "";
                var maskedRealName = showRealName
                    ? formatMaskedRealName(realNameRaw)
                    : "";
                var realNameSuffix = maskedRealName
                    ? "（" + maskedRealName + "）"
                    : "";

                // 全屏转账页面（不是弹窗）
                var $overlay = $(
                    '<div class="xiaoxin-wechat-transfer-overlay"></div>'
                );
                var $panel = $(
                    '<div class="xiaoxin-wechat-transfer-panel"></div>'
                );

                // 顶部栏
                var $topBar = $(
                    '<div class="xiaoxin-wechat-transfer-top-bar"></div>'
                );
                var $back = $(
                    '<div class="xiaoxin-wechat-transfer-back">' +
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        "</svg></div>"
                );
                var $title = $(
                    '<div class="xiaoxin-wechat-transfer-title"></div>'
                ).text("");
                $topBar.append($back, $title);

                // 收款人信息
                var $receiver = $(
                    '<div class="xiaoxin-wechat-transfer-receiver"></div>'
                );
                var $receiverAvatar = $(
                    '<div class="xiaoxin-wechat-transfer-avatar"></div>'
                );
                $receiverAvatar.css(
                    "background-image",
                    "url(" + avatarUrl + ")"
                );
                var $receiverInfo = $(
                    '<div class="xiaoxin-wechat-transfer-receiver-info"></div>'
                );
                var $receiverName = $(
                    '<div class="xiaoxin-wechat-transfer-receiver-name"></div>'
                ).text(displayName + realNameSuffix);
                var $receiverWechatId = $(
                    '<div class="xiaoxin-wechat-transfer-receiver-id"></div>'
                ).text("微信号：" + String(wechatId || ""));
                $receiverInfo.append($receiverName, $receiverWechatId);
                $receiver.append($receiverAvatar, $receiverInfo);

                // 金额输入区
                var $amountBox = $(
                    '<div class="xiaoxin-wechat-transfer-amount-box"></div>'
                );
                $amountBox.append(
                    '<div class="xiaoxin-wechat-transfer-amount-label">转账金额</div>'
                );
                var $amountRow = $(
                    '<div class="xiaoxin-wechat-transfer-amount-row"></div>'
                );
                var $yen = $(
                    '<div class="xiaoxin-wechat-transfer-yen">¥</div>'
                );
                var $amountText = $(
                    '<div class="xiaoxin-wechat-transfer-amount-text"></div>'
                );
                $amountRow.append($yen, $amountText);
                var $note = $(
                    '<div class="xiaoxin-wechat-transfer-note">添加转账说明</div>'
                );
                $amountBox.append($amountRow, $note);

                // 键盘（和红包键盘一样的布局）
                var $keyboard = $(
                    '<div class="xiaoxin-wechat-transfer-keyboard"></div>'
                );
                var $keyboardGrid = $(
                    '<div class="xiaoxin-wechat-transfer-keyboard-grid"></div>'
                );

                // 第一行：1, 2, 3, 删除键
                for (var i = 1; i <= 3; i++) {
                    var $key = $(
                        '<div class="xiaoxin-wechat-transfer-keyboard-key">' +
                            i +
                            "</div>"
                    );
                    $key.on("click", function () {
                        appendKey($(this).text());
                        renderAmount();
                    });
                    $keyboardGrid.append($key);
                }
                // 删除键（第一行右侧）
                var $deleteKey = $(
                    '<div class="xiaoxin-wechat-transfer-keyboard-key xiaoxin-wechat-transfer-keyboard-delete">' +
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<rect x="4" y="4" width="16" height="16" rx="3" fill="#666" />' +
                        '<path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        "</svg>" +
                        "</div>"
                );
                $deleteKey.on("click", function () {
                    appendKey("del");
                    renderAmount();
                });
                $keyboardGrid.append($deleteKey);

                // 第二行：4, 5, 6, 转账按钮（跨第2-4行）
                for (var i = 4; i <= 6; i++) {
                    var $key = $(
                        '<div class="xiaoxin-wechat-transfer-keyboard-key">' +
                            i +
                            "</div>"
                    );
                    $key.on("click", function () {
                        appendKey($(this).text());
                        renderAmount();
                    });
                    $keyboardGrid.append($key);
                }
                // 转账按钮（绿色，跨第2-4行）
                var $submit = $(
                    '<div class="xiaoxin-wechat-transfer-keyboard-key xiaoxin-wechat-transfer-keyboard-confirm">转账</div>'
                );
                $submit.on("click", function () {
                    var amt = parseFloat(amountStr);
                    if (!(amt > 0)) return;

                    // 显示付款方式选择弹窗
                    showPaymentMethodDialog(
                        amt,
                        function (paymentMethod, cardIndex) {
                            // 执行转账
                            executeTransfer(amt, paymentMethod, cardIndex);
                        }
                    );
                });

                // 执行转账
                function executeTransfer(amt, paymentMethod, cardIndex) {
                    // 校验余额
                    var walletData =
                        window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.getWalletData
                            ? window.XiaoxinWeChatDataHandler.getWalletData()
                            : null;
                    if (!walletData) {
                        if (typeof toastr !== "undefined") {
                            toastr.error("无法获取钱包数据", "小馨手机");
                        }
                        return;
                    }

                    var availableBalance = 0;
                    if (paymentMethod === "balance") {
                        // 零钱
                        availableBalance = walletData.balance || 0;
                        if (amt > availableBalance) {
                            if (typeof toastr !== "undefined") {
                                toastr.error("零钱余额不足", "小馨手机");
                            }
                            return;
                        }
                        // 扣款
                        if (window.XiaoxinWeChatDataHandler) {
                            window.XiaoxinWeChatDataHandler.updateWalletBalance(
                                -amt
                            );
                        }
                    } else if (paymentMethod === "lct") {
                        // 零钱通
                        var lctBalance = walletData.lctBalance || 0;
                        var lctInterest = walletData.lctInterest || 0;
                        availableBalance = lctBalance + lctInterest;
                        if (amt > availableBalance) {
                            if (typeof toastr !== "undefined") {
                                toastr.error("零钱通余额不足", "小馨手机");
                            }
                            return;
                        }
                        // 扣款（优先扣除本金，不足则扣除收益）
                        if (window.XiaoxinWeChatDataHandler) {
                            var deductFromBalance = Math.min(amt, lctBalance);
                            var deductFromInterest = amt - deductFromBalance;
                            if (
                                deductFromBalance > 0 &&
                                window.XiaoxinWeChatDataHandler.updateLctBalance
                            ) {
                                window.XiaoxinWeChatDataHandler.updateLctBalance(
                                    -deductFromBalance
                                );
                            }
                            if (
                                deductFromInterest > 0 &&
                                window.XiaoxinWeChatDataHandler.addLctInterest
                            ) {
                                window.XiaoxinWeChatDataHandler.addLctInterest(
                                    -deductFromInterest
                                );
                            }
                        }
                    } else if (paymentMethod === "card") {
                        // 银行卡（暂不支持，提示用户）
                        if (typeof toastr !== "undefined") {
                            toastr.info("银行卡转账功能待实现", "小馨手机");
                        }
                        return;
                    }

                    // 扣款 + 账单
                    var timeStr = "";
                    if (
                        window.XiaoxinWorldClock &&
                        window.XiaoxinWorldClock.rawTime
                    ) {
                        timeStr = window.XiaoxinWorldClock.rawTime;
                    } else {
                        var now = new Date();
                        timeStr =
                            now.getFullYear() +
                            "-" +
                            String(now.getMonth() + 1).padStart(2, "0") +
                            "-" +
                            String(now.getDate()).padStart(2, "0") +
                            " " +
                            String(now.getHours()).padStart(2, "0") +
                            ":" +
                            String(now.getMinutes()).padStart(2, "0");
                    }
                    if (window.XiaoxinWeChatDataHandler) {
                        window.XiaoxinWeChatDataHandler.addWalletTransaction({
                            title: "转账",
                            amount: -amt,
                            time: timeStr,
                            icon: "transfer",
                        });
                    }

                    // 发送转账消息
                    var noteText = $note.text();
                    var hasNote = noteText && noteText !== "添加转账说明";
                    var transferNote = hasNote ? noteText : "";

                    // 发送转账消息：与文本消息一致的机制
                    // - 先加入 pendingMessages 预览
                    // - 再把 [MSG] 指令植入酒馆输入框（不直接写入聊天记录）
                    sendTransferMessage(amt, transferNote);

                    // 关闭转账页面
                    closePanel();
                }

                // 显示付款方式选择弹窗
                function showPaymentMethodDialog(amount, callback) {
                    // 移除已有弹窗
                    $container
                        .find(".xiaoxin-wechat-transfer-payment-overlay")
                        .remove();

                    // 获取钱包数据
                    var walletData =
                        window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.getWalletData
                            ? window.XiaoxinWeChatDataHandler.getWalletData()
                            : null;
                    if (!walletData) {
                        walletData = {
                            balance: 0,
                            lctBalance: 0,
                            lctInterest: 0,
                            cards: [],
                        };
                    }

                    // 计算零钱通总金额
                    var lctBalance = walletData.lctBalance || 0;
                    var lctInterest = walletData.lctInterest || 0;
                    var lctTotal = lctBalance + lctInterest;

                    // 创建弹窗
                    var $overlay = $(
                        '<div class="xiaoxin-wechat-transfer-payment-overlay"></div>'
                    );
                    var $dialog = $(
                        '<div class="xiaoxin-wechat-transfer-payment-dialog"></div>'
                    );

                    // 标题栏
                    var $header = $(
                        '<div class="xiaoxin-wechat-transfer-payment-header"></div>'
                    );
                    var $title = $(
                        '<div class="xiaoxin-wechat-transfer-payment-title">选择付款方式</div>'
                    );
                    var $close = $(
                        '<div class="xiaoxin-wechat-transfer-payment-close">×</div>'
                    );
                    $header.append($title, $close);

                    // 内容区域
                    var $content = $(
                        '<div class="xiaoxin-wechat-transfer-payment-content"></div>'
                    );

                    // 零钱选项
                    var $balanceOption = $(
                        '<div class="xiaoxin-wechat-transfer-payment-option" data-method="balance"></div>'
                    );
                    var balance = walletData.balance || 0;
                    $balanceOption.append(
                        '<div class="xiaoxin-wechat-transfer-payment-option-icon">' +
                            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                            '<circle cx="12" cy="12" r="10" fill="#ffc107" stroke="#ffc107" stroke-width="2"/>' +
                            '<text x="12" y="16" font-size="14" font-weight="bold" fill="#fff" text-anchor="middle">¥</text>' +
                            "</svg>" +
                            "</div>",
                        '<div class="xiaoxin-wechat-transfer-payment-option-info">' +
                            '<div class="xiaoxin-wechat-transfer-payment-option-name">零钱</div>' +
                            '<div class="xiaoxin-wechat-transfer-payment-option-desc">剩余¥' +
                            balance.toFixed(2) +
                            "</div>" +
                            "</div>",
                        '<div class="xiaoxin-wechat-transfer-payment-option-check">' +
                            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                            '<path d="M20 6L9 17l-5-5" stroke="#07c160" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                            "</svg>" +
                            "</div>"
                    );
                    $balanceOption.addClass("selected");

                    // 零钱通选项
                    var $lctOption = $(
                        '<div class="xiaoxin-wechat-transfer-payment-option" data-method="lct"></div>'
                    );
                    $lctOption.append(
                        '<div class="xiaoxin-wechat-transfer-payment-option-icon">' +
                            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                            '<path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#ffc107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
                            '<path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#ffc107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
                            "</svg>" +
                            "</div>",
                        '<div class="xiaoxin-wechat-transfer-payment-option-info">' +
                            '<div class="xiaoxin-wechat-transfer-payment-option-name">零钱通</div>' +
                            '<div class="xiaoxin-wechat-transfer-payment-option-desc">剩余¥' +
                            lctTotal.toFixed(2) +
                            "</div>" +
                            "</div>",
                        '<div class="xiaoxin-wechat-transfer-payment-option-check"></div>'
                    );

                    // 银行卡选项
                    var $cardsSection = $(
                        '<div class="xiaoxin-wechat-transfer-payment-section">银行卡</div>'
                    );
                    var $cardsList = $(
                        '<div class="xiaoxin-wechat-transfer-payment-cards-list"></div>'
                    );

                    if (walletData.cards && walletData.cards.length > 0) {
                        walletData.cards.forEach(function (card, index) {
                            var $cardOption = $(
                                '<div class="xiaoxin-wechat-transfer-payment-option" data-method="card" data-card-index="' +
                                    index +
                                    '"></div>'
                            );
                            var cardNumber = card.number || "";
                            var maskedNumber =
                                cardNumber.length > 4
                                    ? "**** **** **** " + cardNumber.slice(-4)
                                    : cardNumber;
                            $cardOption.append(
                                '<div class="xiaoxin-wechat-transfer-payment-option-icon">' +
                                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                                    '<path d="M19 7H5C3.89543 7 3 7.89543 3 9V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V9C21 7.89543 20.1046 7 19 7Z" stroke="#07c160" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                                    '<path d="M3 10H21" stroke="#07c160" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                                    "</svg>" +
                                    "</div>",
                                '<div class="xiaoxin-wechat-transfer-payment-option-info">' +
                                    '<div class="xiaoxin-wechat-transfer-payment-option-name">' +
                                    (card.bankName || "银行卡") +
                                    "</div>" +
                                    '<div class="xiaoxin-wechat-transfer-payment-option-desc">' +
                                    maskedNumber +
                                    "</div>" +
                                    "</div>",
                                '<div class="xiaoxin-wechat-transfer-payment-option-check"></div>'
                            );
                            $cardsList.append($cardOption);
                        });
                    } else {
                        $cardsList.append(
                            '<div class="xiaoxin-wechat-transfer-payment-empty">暂无银行卡</div>'
                        );
                    }

                    $content.append(
                        $balanceOption,
                        $lctOption,
                        $cardsSection,
                        $cardsList
                    );
                    $dialog.append($header, $content);
                    $overlay.append($dialog);
                    $container.append($overlay);

                    // 显示动画
                    requestAnimationFrame(function () {
                        $overlay.addClass("show");
                    });

                    // 当前选中的付款方式
                    var selectedMethod = "balance";
                    var selectedCardIndex = null;

                    // 选择付款方式
                    function selectPaymentMethod(method, cardIndex) {
                        selectedMethod = method;
                        selectedCardIndex = cardIndex;
                        $content
                            .find(".xiaoxin-wechat-transfer-payment-option")
                            .removeClass("selected");
                        $content
                            .find(
                                ".xiaoxin-wechat-transfer-payment-option-check"
                            )
                            .empty();
                        var $selected = $content.find(
                            '[data-method="' + method + '"]'
                        );
                        if (cardIndex !== null && cardIndex !== undefined) {
                            $selected = $content.find(
                                '[data-method="' +
                                    method +
                                    '"][data-card-index="' +
                                    cardIndex +
                                    '"]'
                            );
                        }
                        $selected.addClass("selected");
                        $selected
                            .find(
                                ".xiaoxin-wechat-transfer-payment-option-check"
                            )
                            .html(
                                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                                    '<path d="M20 6L9 17l-5-5" stroke="#07c160" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                                    "</svg>"
                            );
                    }

                    // 点击选项
                    $content.on(
                        "click",
                        ".xiaoxin-wechat-transfer-payment-option",
                        function () {
                            var method = $(this).data("method");
                            var cardIndex = $(this).data("card-index");
                            selectPaymentMethod(method, cardIndex);
                        }
                    );

                    // 关闭弹窗
                    function closeDialog() {
                        $overlay.removeClass("show");
                        setTimeout(function () {
                            $overlay.remove();
                        }, 250);
                    }

                    $close.on("click", closeDialog);
                    $overlay.on("click", function (e) {
                        if (
                            $(e.target).hasClass(
                                "xiaoxin-wechat-transfer-payment-overlay"
                            )
                        ) {
                            closeDialog();
                        }
                    });

                    // 确认按钮
                    var $confirm = $(
                        '<div class="xiaoxin-wechat-transfer-payment-confirm">确认</div>'
                    );
                    $confirm.on("click", function () {
                        closeDialog();
                        callback(selectedMethod, selectedCardIndex);
                    });
                    $dialog.append($confirm);
                }
                $keyboardGrid.append($submit);

                // 第三行：7, 8, 9, 转账按钮（继续，不添加新元素）
                for (var i = 7; i <= 9; i++) {
                    var $key = $(
                        '<div class="xiaoxin-wechat-transfer-keyboard-key">' +
                            i +
                            "</div>"
                    );
                    $key.on("click", function () {
                        appendKey($(this).text());
                        renderAmount();
                    });
                    $keyboardGrid.append($key);
                }
                // 转账按钮继续（第三行，不添加新元素，CSS会处理跨行）

                // 第四行：., 0, 空白键, 转账按钮（继续）
                var $dotKey = $(
                    '<div class="xiaoxin-wechat-transfer-keyboard-key">.</div>'
                );
                $dotKey.on("click", function () {
                    appendKey(".");
                    renderAmount();
                });
                $keyboardGrid.append($dotKey);

                // 0键
                var $zeroKey = $(
                    '<div class="xiaoxin-wechat-transfer-keyboard-key">0</div>'
                );
                $zeroKey.on("click", function () {
                    appendKey("0");
                    renderAmount();
                });
                $keyboardGrid.append($zeroKey);

                // 空白键（占位）
                var $blankKey = $(
                    '<div class="xiaoxin-wechat-transfer-keyboard-key xiaoxin-wechat-transfer-keyboard-blank"></div>'
                );
                $keyboardGrid.append($blankKey);
                // 转账按钮继续（第四行，不添加新元素，CSS会处理跨行）

                $keyboard.append($keyboardGrid);
                $panel.append($topBar, $receiver, $amountBox, $keyboard);
                $overlay.append($panel);
                $container.append($overlay);

                // 动画：下一帧加 show
                requestAnimationFrame(function () {
                    $overlay.addClass("show");
                });

                function closePanel() {
                    $overlay.removeClass("show");
                    setTimeout(function () {
                        $overlay.remove();
                    }, 250);
                }

                $back.on("click", function () {
                    closePanel();
                });
                // 全屏页面不需要点击外部关闭，只通过返回按钮关闭

                var amountStr = "";
                function renderAmount() {
                    $amountText.text(amountStr || "");
                    $submit.prop("disabled", !(parseFloat(amountStr) > 0));
                }
                function appendKey(k) {
                    if (k === "del") {
                        amountStr = amountStr.slice(0, -1);
                        return;
                    }
                    if (k === ".") {
                        if (!amountStr) {
                            amountStr = "0.";
                            return;
                        }
                        if (amountStr.indexOf(".") !== -1) return;
                    }
                    // 小数最多2位
                    if (amountStr.indexOf(".") !== -1) {
                        var parts = amountStr.split(".");
                        if (parts[1] && parts[1].length >= 2) return;
                    }
                    // 前导0处理
                    if (amountStr === "0" && k !== ".") {
                        amountStr = k;
                        return;
                    }
                    amountStr += k;
                }

                $keyboard.on(
                    "click",
                    ".xiaoxin-wechat-transfer-key",
                    function () {
                        var k = $(this).data("key");
                        appendKey(String(k));
                        renderAmount();
                    }
                );

                $note.on("click", function () {
                    var noteText = prompt("添加转账说明（可选）", "");
                    if (noteText !== null) {
                        $note.text(noteText ? noteText : "添加转账说明");
                        $note.toggleClass("has-note", !!noteText);
                    }
                });

                $submit.on("click", function () {
                    var amt = parseFloat(amountStr);
                    if (!(amt > 0)) return;

                    // 校验余额
                    var walletData =
                        window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.getWalletData
                            ? window.XiaoxinWeChatDataHandler.getWalletData()
                            : null;
                    var balance = walletData ? walletData.balance || 0 : 0;
                    if (amt > balance) {
                        if (typeof toastr !== "undefined") {
                            toastr.error("零钱余额不足", "小馨手机");
                        }
                        return;
                    }

                    // 扣款 + 账单
                    var timeStr = "";
                    if (
                        window.XiaoxinWorldClock &&
                        window.XiaoxinWorldClock.rawTime
                    ) {
                        timeStr = window.XiaoxinWorldClock.rawTime;
                    } else if (
                        window.XiaoxinWorldClock &&
                        window.XiaoxinWorldClock.currentTimestamp
                    ) {
                        timeStr = new Date(
                            window.XiaoxinWorldClock.currentTimestamp
                        ).toLocaleString("zh-CN");
                    }
                    if (!timeStr) timeStr = new Date().toLocaleString("zh-CN");

                    if (
                        window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.updateWalletBalance &&
                        window.XiaoxinWeChatDataHandler.addWalletTransaction
                    ) {
                        window.XiaoxinWeChatDataHandler.updateWalletBalance(
                            -amt
                        );
                        window.XiaoxinWeChatDataHandler.addWalletTransaction({
                            title: "转账",
                            amount: -amt,
                            time: timeStr,
                            icon: "transfer",
                        });
                    }

                    // 写入聊天消息（本地显示）
                    var transferMsg = {
                        type: "transfer",
                        sender: "player",
                        content: "",
                        timestamp:
                            (window.XiaoxinWorldClock &&
                                (window.XiaoxinWorldClock.currentTimestamp ||
                                    window.XiaoxinWorldClock.timestamp)) ||
                            Date.now(),
                        rawTime:
                            (window.XiaoxinWorldClock &&
                                (window.XiaoxinWorldClock.rawTime ||
                                    window.XiaoxinWorldClock.raw)) ||
                            "",
                        payload: {
                            amount: amt,
                            note: $note.hasClass("has-note")
                                ? $note.text()
                                : "",
                        },
                    };
                    if (
                        window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.addChatMessage
                    ) {
                        window.XiaoxinWeChatDataHandler.addChatMessage(
                            chatUserId,
                            transferMsg
                        );
                    }

                    // 刷新消息列表
                    try {
                        refreshMessageList();
                        scrollToBottom(true);
                    } catch (e) {}

                    closePanel();
                });

                renderAmount();
            } catch (e) {
                console.error("[小馨手机][微信聊天UI] 打开转账面板失败:", e);
                if (typeof toastr !== "undefined") {
                    toastr.error("转账功能打开失败", "小馨手机");
                }
            }
        }

        // 菜单展开/折叠状态
        var isMenuExpanded = false;
        // 保存消息列表的原始 padding-bottom 值
        var originalMessagesListPaddingBottom = null;

        // ========== 表情包面板（从输入框下方滑出） ==========
        var $stickerBar = $(
            '<div class="xiaoxin-wechat-chat-sticker-bar"></div>'
        );

        // 表情包分组标签栏
        var $stickerTabs = $(
            '<div class="xiaoxin-wechat-chat-sticker-tabs"></div>'
        );

        // 表情包内容区域
        var $stickerContent = $(
            '<div class="xiaoxin-wechat-chat-sticker-content"></div>'
        );
        var $stickerGrid = $(
            '<div class="xiaoxin-wechat-chat-sticker-grid"></div>'
        );
        $stickerContent.append($stickerGrid);
        $stickerBar.append($stickerTabs, $stickerContent);
        $container.append($stickerBar);

        var isStickerExpanded = false;
        var originalMessagesListPaddingBottomForSticker = null;
        var currentStickerCategory = "default"; // 当前选中的分组

        // 初始化表情包分组（从存储中加载）
        function initializeStickerCategories() {
            // 默认表情包文件列表（与 wechat-app.js 中的列表保持一致）
            var defaultEmojiList = [
                "（嘲讽）急了.jpg",
                "（抽象）阴暗的爬行.gif",
                "下班了哈哈哈.jpg",
                "从四面八方亲你.gif",
                "你坏坏（撒娇）.jpg",
                "可爱猫猫脸.jpg",
                "哦哦你真牛啊（嘲讽emoji）.jpg",
                "啊？我吗？不合适吧.jpg",
                "好的好的（懒得鸟你）.jpg",
                "小熊跳舞（开心）.gif",
                "小狗西装：我讲两句.jpg",
                "小猫摊手要东西.jpg",
                "展示魅力.jpg",
                "忍住不笑emoji.jpg",
                "我保证.jpg",
                "我多么期盼多么遗憾.jpg",
                "每日行程超简单，起床然后受苦（疯了）.jpg",
                "没事没事我不重要（口是心非）.jpg",
                "猫猫卑微.jpg",
                "离了大谱.jpg",
                "脑子宕机（可爱）.gif",
                "花痴（涩涩）emoji.gif",
                "送你玫瑰花1.jpg",
            ];

            var defaultCategory = {
                id: "default",
                name: "默认",
                icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                getStickers: function () {
                    // 直接返回默认表情包文件名列表，不包含自定义表情包
                    return defaultEmojiList.slice();
                },
            };

            // 从存储中加载自定义分组
            var savedCategories = [];
            try {
                if (
                    window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler
                        .getStickerCategories === "function"
                ) {
                    savedCategories =
                        window.XiaoxinWeChatDataHandler.getStickerCategories() ||
                        [];
                }
            } catch (e) {
                console.warn("[小馨手机][微信聊天UI] 加载表情包分组失败:", e);
            }

            // 构建分组列表：默认分组 + 自定义分组
            var categories = [defaultCategory];
            savedCategories.forEach(function (savedCategory) {
                categories.push({
                    id: savedCategory.id,
                    name: savedCategory.name,
                    icon: savedCategory.icon,
                    getStickers: function () {
                        // 从存储中获取该分组的表情包
                        try {
                            if (
                                window.XiaoxinWeChatDataHandler &&
                                typeof window.XiaoxinWeChatDataHandler
                                    .getStickers === "function"
                            ) {
                                var stickers =
                                    window.XiaoxinWeChatDataHandler.getStickers(
                                        savedCategory.id
                                    ) || [];
                                // 返回完整的表情包对象（包含描述），而不仅仅是URL
                                return stickers.map(function (sticker) {
                                    return {
                                        url:
                                            sticker.url ||
                                            sticker.src ||
                                            sticker.path ||
                                            sticker,
                                        description: sticker.description || "",
                                    };
                                });
                            }
                        } catch (e) {
                            console.warn(
                                "[小馨手机][微信聊天UI] 获取分组表情包失败:",
                                e
                            );
                        }
                        return [];
                    },
                });
            });

            return categories;
        }

        // 表情包分组配置（每次需要时重新加载，确保数据最新）
        function getStickerCategories() {
            return initializeStickerCategories();
        }
        var stickerCategories = getStickerCategories();

        // 渲染分组标签栏
        function renderStickerTabs() {
            // 重新加载分组数据，确保数据最新
            stickerCategories = getStickerCategories();

            $stickerTabs.empty();
            stickerCategories.forEach(function (category) {
                var $tab = $(
                    '<div class="xiaoxin-wechat-chat-sticker-tab" data-category="' +
                        category.id +
                        '">' +
                        category.icon +
                        "</div>"
                );
                if (category.id === currentStickerCategory) {
                    $tab.addClass("active");
                }
                $tab.on("click", function (e) {
                    e.stopPropagation();
                    currentStickerCategory = category.id;
                    $stickerTabs
                        .find(".xiaoxin-wechat-chat-sticker-tab")
                        .removeClass("active");
                    $tab.addClass("active");
                    renderStickerGrid();
                });
                $stickerTabs.append($tab);
            });

            // 最右侧：虚线框加号（创建新分组）
            var $addCategoryTab = $(
                '<div class="xiaoxin-wechat-chat-sticker-tab xiaoxin-wechat-chat-sticker-tab-add">' +
                    '<div class="xiaoxin-wechat-chat-sticker-tab-add-icon">+</div>' +
                    "</div>"
            );
            $addCategoryTab.on("click", function (e) {
                e.stopPropagation();
                showCreateCategoryDialog();
            });
            $stickerTabs.append($addCategoryTab);
        }

        // 显示创建分组弹窗
        function showCreateCategoryDialog() {
            // 关闭表情包面板（如果展开）
            if (isStickerExpanded) {
                toggleSticker();
            }

            // 创建弹窗
            var $dialog = $(
                '<div class="xiaoxin-sticker-category-dialog">' +
                    '<div class="xiaoxin-sticker-category-dialog-backdrop"></div>' +
                    '<div class="xiaoxin-sticker-category-dialog-content">' +
                    '<div class="xiaoxin-sticker-category-dialog-header">' +
                    '<div class="xiaoxin-sticker-category-dialog-title">创建表情包分组</div>' +
                    '<button class="xiaoxin-sticker-category-dialog-close">✕</button>' +
                    "</div>" +
                    '<div class="xiaoxin-sticker-category-dialog-body">' +
                    '<div class="xiaoxin-sticker-category-preview-section">' +
                    '<div class="xiaoxin-sticker-category-preview-label">分组图标预览</div>' +
                    '<div class="xiaoxin-sticker-category-preview">' +
                    '<div class="xiaoxin-sticker-category-preview-icon" id="category-preview-icon"></div>' +
                    "</div>" +
                    "</div>" +
                    '<div class="xiaoxin-sticker-category-input-section">' +
                    '<div class="xiaoxin-sticker-category-input-label">分组名称</div>' +
                    '<input type="text" class="xiaoxin-sticker-category-name-input" placeholder="请输入分组名称" maxlength="10" style="background: #e4e4e4 !important; background-color: #e4e4e4 !important; border: none !important; outline: none !important; box-shadow: none !important;">' +
                    "</div>" +
                    '<div class="xiaoxin-sticker-category-icon-section">' +
                    '<div class="xiaoxin-sticker-category-icon-label">选择图标</div>' +
                    '<div class="xiaoxin-sticker-category-icon-options">' +
                    '<label class="xiaoxin-sticker-category-icon-option">' +
                    '<input type="radio" name="category-icon-type" value="text" checked>' +
                    "<span>文字</span>" +
                    "</label>" +
                    '<label class="xiaoxin-sticker-category-icon-option">' +
                    '<input type="radio" name="category-icon-type" value="image">' +
                    "<span>图片</span>" +
                    "</label>" +
                    "</div>" +
                    '<div class="xiaoxin-sticker-category-text-input-wrapper" id="category-text-input-wrapper">' +
                    '<input type="text" class="xiaoxin-sticker-category-text-input" placeholder="输入文字（1-2个字）" maxlength="2" style="background: #e4e4e4 !important; background-color: #e4e4e4 !important; border: none !important; outline: none !important; box-shadow: none !important;">' +
                    "</div>" +
                    '<div class="xiaoxin-sticker-category-image-input-wrapper" id="category-image-input-wrapper" style="display: none;">' +
                    '<input type="file" accept="image/*" class="xiaoxin-sticker-category-image-input" style="display: none;">' +
                    '<button class="xiaoxin-sticker-category-image-btn">本地上传</button>' +
                    '<div class="xiaoxin-sticker-category-image-divider" style="margin: 12px 0; text-align: center; color: #8e8e93; font-size: 14px;">或</div>' +
                    '<input type="text" class="xiaoxin-sticker-category-image-url-input" placeholder="输入图片URL" style="background: #e4e4e4 !important; background-color: #e4e4e4 !important; border: none !important; outline: none !important; box-shadow: none !important;">' +
                    '<div class="xiaoxin-sticker-category-image-preview"></div>' +
                    "</div>" +
                    "</div>" +
                    "</div>" +
                    '<div class="xiaoxin-sticker-category-dialog-footer">' +
                    '<button class="xiaoxin-sticker-category-dialog-cancel">取消</button>' +
                    '<button class="xiaoxin-sticker-category-dialog-create">创建</button>' +
                    "</div>" +
                    "</div>" +
                    "</div>"
            );

            $("body").append($dialog);

            var categoryName = "";
            var categoryIconType = "text";
            var categoryIconText = "";
            var categoryIconImage = null;
            var categoryIconImageUrl = null;

            // 更新预览
            function updatePreview() {
                var $preview = $("#category-preview-icon");
                $preview.empty();

                if (categoryIconType === "text" && categoryIconText) {
                    $preview.text(categoryIconText);
                } else if (
                    categoryIconType === "image" &&
                    categoryIconImageUrl
                ) {
                    var $img = $(
                        '<img style="width: 100%; height: 100%; object-fit: contain;">'
                    );
                    $img.attr("src", categoryIconImageUrl);
                    $preview.append($img);
                } else {
                    $preview.html(
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                    );
                }
            }

            // 图标类型切换
            $dialog
                .find('input[name="category-icon-type"]')
                .on("change", function () {
                    categoryIconType = $(this).val();
                    if (categoryIconType === "text") {
                        $("#category-text-input-wrapper").show();
                        $("#category-image-input-wrapper").hide();
                    } else {
                        $("#category-text-input-wrapper").hide();
                        $("#category-image-input-wrapper").show();
                    }
                    updatePreview();
                });

            // 文字输入 - 强制设置样式
            var $textInput = $dialog.find(
                ".xiaoxin-sticker-category-text-input"
            );
            var textInput = $textInput[0]; // 原生DOM元素
            function setTextInputStyle() {
                textInput.style.setProperty(
                    "background",
                    "#e4e4e4",
                    "important"
                );
                textInput.style.setProperty(
                    "background-color",
                    "#e4e4e4",
                    "important"
                );
                textInput.style.setProperty("border", "none", "important");
                textInput.style.setProperty("outline", "none", "important");
                textInput.style.setProperty("box-shadow", "none", "important");
                textInput.style.setProperty("color", "#000", "important");
                textInput.style.setProperty(
                    "-webkit-text-fill-color",
                    "#000",
                    "important"
                );
            }
            setTextInputStyle();
            $textInput.on("input", function () {
                categoryIconText = $(this).val();
                updatePreview();
                setTextInputStyle();
            });
            $textInput.on("focus focusin blur", function () {
                setTextInputStyle();
            });

            // 图片选择
            $dialog
                .find(".xiaoxin-sticker-category-image-btn")
                .on("click", function () {
                    $dialog
                        .find(".xiaoxin-sticker-category-image-input")
                        .click();
                });

            // 本地上传图片
            $dialog
                .find(".xiaoxin-sticker-category-image-input")
                .on("change", function (e) {
                    var file = e.target.files[0];
                    if (file) {
                        var reader = new FileReader();
                        reader.onload = function (e) {
                            categoryIconImageUrl = e.target.result;
                            $dialog
                                .find(".xiaoxin-sticker-category-image-preview")
                                .html(
                                    '<img src="' +
                                        categoryIconImageUrl +
                                        '" style="max-width: 100px; max-height: 100px; border-radius: 4px;">'
                                );
                            updatePreview();
                        };
                        reader.readAsDataURL(file);
                    }
                });

            // URL输入图片 - 强制设置样式
            var $urlInput = $dialog.find(
                ".xiaoxin-sticker-category-image-url-input"
            );
            var urlInput = $urlInput[0]; // 原生DOM元素
            function setUrlInputStyle() {
                urlInput.style.setProperty(
                    "background",
                    "#e4e4e4",
                    "important"
                );
                urlInput.style.setProperty(
                    "background-color",
                    "#e4e4e4",
                    "important"
                );
                urlInput.style.setProperty("border", "none", "important");
                urlInput.style.setProperty("outline", "none", "important");
                urlInput.style.setProperty("box-shadow", "none", "important");
                urlInput.style.setProperty("color", "#000", "important");
                urlInput.style.setProperty(
                    "-webkit-text-fill-color",
                    "#000",
                    "important"
                );
            }
            setUrlInputStyle();
            $urlInput.on("focus focusin blur", function () {
                setUrlInputStyle();
            });
            $urlInput.on("input", function () {
                setUrlInputStyle();
                var url = $(this).val().trim();
                if (url) {
                    // 验证URL格式
                    try {
                        new URL(url);
                        categoryIconImageUrl = url;
                        // 尝试加载图片预览
                        var $previewImg = $(
                            '<img style="max-width: 100px; max-height: 100px; border-radius: 4px;">'
                        );
                        $previewImg.attr("src", url);
                        $previewImg.on("load", function () {
                            $dialog
                                .find(".xiaoxin-sticker-category-image-preview")
                                .html($previewImg);
                            updatePreview();
                        });
                        $previewImg.on("error", function () {
                            $dialog
                                .find(".xiaoxin-sticker-category-image-preview")
                                .html(
                                    '<div style="color: #f44336; font-size: 12px;">图片加载失败，请检查URL</div>'
                                );
                            categoryIconImageUrl = null;
                        });
                        $dialog
                            .find(".xiaoxin-sticker-category-image-preview")
                            .html($previewImg);
                    } catch (e) {
                        // URL格式无效
                        $dialog
                            .find(".xiaoxin-sticker-category-image-preview")
                            .html(
                                '<div style="color: #f44336; font-size: 12px;">URL格式无效</div>'
                            );
                        categoryIconImageUrl = null;
                    }
                } else {
                    categoryIconImageUrl = null;
                    $dialog
                        .find(".xiaoxin-sticker-category-image-preview")
                        .empty();
                    updatePreview();
                }
            });

            // 分组名称输入 - 强制设置样式
            var $nameInput = $dialog.find(
                ".xiaoxin-sticker-category-name-input"
            );
            var nameInput = $nameInput[0]; // 原生DOM元素
            function setNameInputStyle() {
                nameInput.style.setProperty(
                    "background",
                    "#e4e4e4",
                    "important"
                );
                nameInput.style.setProperty(
                    "background-color",
                    "#e4e4e4",
                    "important"
                );
                nameInput.style.setProperty("border", "none", "important");
                nameInput.style.setProperty("outline", "none", "important");
                nameInput.style.setProperty("box-shadow", "none", "important");
                nameInput.style.setProperty("color", "#000", "important");
                nameInput.style.setProperty(
                    "-webkit-text-fill-color",
                    "#000",
                    "important"
                );
            }
            setNameInputStyle();
            $nameInput.on("input", function () {
                categoryName = $(this).val();
                setNameInputStyle();
            });
            $nameInput.on("focus focusin blur", function () {
                setNameInputStyle();
            });

            // 关闭弹窗
            function closeDialog() {
                $dialog.remove();
            }

            // 创建分组
            function createCategory() {
                if (!categoryName || categoryName.trim() === "") {
                    if (typeof toastr !== "undefined") {
                        toastr.warning("请输入分组名称", "小馨手机");
                    }
                    return;
                }

                var icon = "";
                if (categoryIconType === "text") {
                    if (!categoryIconText || categoryIconText.trim() === "") {
                        icon =
                            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                    } else {
                        var text = categoryIconText.trim().substring(0, 2);
                        // 简单转义HTML
                        text = text
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;")
                            .replace(/"/g, "&quot;")
                            .replace(/'/g, "&#039;");
                        icon =
                            '<div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 500;">' +
                            text +
                            "</div>";
                    }
                } else {
                    if (!categoryIconImageUrl) {
                        icon =
                            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                    } else {
                        icon =
                            '<img src="' +
                            categoryIconImageUrl +
                            '" style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px;">';
                    }
                }

                // 添加新分组
                var newCategory = {
                    id: "custom_" + Date.now(),
                    name: categoryName.trim(),
                    icon: icon,
                    getStickers: function () {
                        // 从存储中获取该分组的表情包
                        try {
                            if (
                                window.XiaoxinWeChatDataHandler &&
                                typeof window.XiaoxinWeChatDataHandler
                                    .getStickers === "function"
                            ) {
                                var stickers =
                                    window.XiaoxinWeChatDataHandler.getStickers(
                                        newCategory.id
                                    ) || [];
                                // 返回完整的表情包对象（包含描述），而不仅仅是URL
                                return stickers.map(function (sticker) {
                                    return {
                                        url:
                                            sticker.url ||
                                            sticker.src ||
                                            sticker.path ||
                                            sticker,
                                        description: sticker.description || "",
                                    };
                                });
                            }
                        } catch (e) {
                            console.warn(
                                "[小馨手机][微信聊天UI] 获取分组表情包失败:",
                                e
                            );
                        }
                        return [];
                    },
                };

                // 保存到持久化存储
                if (
                    window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler
                        .addStickerCategory === "function"
                ) {
                    window.XiaoxinWeChatDataHandler.addStickerCategory(
                        newCategory
                    );
                }

                currentStickerCategory = newCategory.id;

                closeDialog();

                // 重新渲染标签栏和网格（会自动重新加载数据）
                if (isStickerExpanded) {
                    renderStickerTabs();
                    renderStickerGrid();
                }

                if (typeof toastr !== "undefined") {
                    toastr.success("分组创建成功", "小馨手机");
                }
            }

            // 绑定事件
            $dialog
                .find(
                    ".xiaoxin-sticker-category-dialog-close, .xiaoxin-sticker-category-dialog-backdrop, .xiaoxin-sticker-category-dialog-cancel"
                )
                .on("click", closeDialog);
            $dialog
                .find(".xiaoxin-sticker-category-dialog-create")
                .on("click", createCategory);

            // 阻止内容区域点击关闭
            $dialog
                .find(".xiaoxin-sticker-category-dialog-content")
                .on("click", function (e) {
                    e.stopPropagation();
                });

            // 强制保持输入框样式 - 使用原生DOM API直接设置
            function forceInputStyle() {
                var inputs = $dialog.find(
                    ".xiaoxin-sticker-category-name-input, .xiaoxin-sticker-category-text-input, .xiaoxin-sticker-category-image-url-input"
                );
                inputs.each(function () {
                    var input = this; // 原生DOM元素
                    // 直接设置style属性，优先级最高
                    input.style.setProperty(
                        "background",
                        "#e4e4e4",
                        "important"
                    );
                    input.style.setProperty(
                        "background-color",
                        "#e4e4e4",
                        "important"
                    );
                    input.style.setProperty("border", "none", "important");
                    input.style.setProperty("outline", "none", "important");
                    input.style.setProperty("box-shadow", "none", "important");
                    input.style.setProperty(
                        "-webkit-box-shadow",
                        "none",
                        "important"
                    );
                    input.style.setProperty(
                        "-moz-box-shadow",
                        "none",
                        "important"
                    );
                    input.style.setProperty("color", "#000", "important");
                    input.style.setProperty(
                        "-webkit-text-fill-color",
                        "#000",
                        "important"
                    );
                });
            }

            // 持续强制样式
            var styleInterval = setInterval(forceInputStyle, 100);

            // 监听所有可能改变样式的事件
            $dialog
                .find(
                    ".xiaoxin-sticker-category-name-input, .xiaoxin-sticker-category-text-input, .xiaoxin-sticker-category-image-url-input"
                )
                .on("focus focusin blur focusout input change", function () {
                    forceInputStyle();
                });

            // 弹窗关闭时清除定时器
            var originalCloseDialog = closeDialog;
            closeDialog = function () {
                if (styleInterval) {
                    clearInterval(styleInterval);
                }
                originalCloseDialog();
            };

            // 初始预览
            updatePreview();
        }

        // 显示添加表情包弹窗
        function showAddStickerDialog() {
            // 关闭表情包面板（如果展开）
            if (isStickerExpanded) {
                toggleSticker();
            }

            // 创建弹窗
            var $dialog = $(
                '<div class="xiaoxin-add-sticker-dialog">' +
                    '<div class="xiaoxin-add-sticker-dialog-backdrop"></div>' +
                    '<div class="xiaoxin-add-sticker-dialog-content">' +
                    '<div class="xiaoxin-add-sticker-dialog-header">' +
                    '<div class="xiaoxin-add-sticker-dialog-title">添加表情包</div>' +
                    '<button class="xiaoxin-add-sticker-dialog-close">✕</button>' +
                    "</div>" +
                    '<div class="xiaoxin-add-sticker-dialog-body">' +
                    '<div class="xiaoxin-add-sticker-preview-section">' +
                    '<div class="xiaoxin-add-sticker-preview-label">表情包预览</div>' +
                    '<div class="xiaoxin-add-sticker-preview">' +
                    '<div class="xiaoxin-add-sticker-preview-icon" id="sticker-preview-icon"></div>' +
                    "</div>" +
                    "</div>" +
                    '<div class="xiaoxin-add-sticker-input-section">' +
                    '<div class="xiaoxin-add-sticker-input-label">表情包描述 <span style="color: #f44336;">*</span></div>' +
                    '<input type="text" class="xiaoxin-add-sticker-description-input" placeholder="例如：急了（嘲讽），好不好嘛（撒娇），哈哈（抽象搞笑）" maxlength="50" style="background: #e4e4e4 !important; background-color: #e4e4e4 !important; border: none !important; outline: none !important; box-shadow: none !important; color: #000 !important; -webkit-text-fill-color: #000 !important;">' +
                    "</div>" +
                    '<div class="xiaoxin-add-sticker-image-section">' +
                    '<div class="xiaoxin-add-sticker-image-label">选择表情包</div>' +
                    '<div class="xiaoxin-add-sticker-image-input-wrapper" id="sticker-image-input-wrapper">' +
                    '<input type="file" accept="image/*" class="xiaoxin-add-sticker-image-input" style="display: none;">' +
                    '<button class="xiaoxin-add-sticker-image-btn">本地上传</button>' +
                    '<div class="xiaoxin-add-sticker-image-divider" style="margin: 12px 0; text-align: center; color: #8e8e93; font-size: 14px;">或</div>' +
                    '<input type="text" class="xiaoxin-add-sticker-image-url-input" placeholder="输入图片URL" style="background: #e4e4e4 !important; background-color: #e4e4e4 !important; border: none !important; outline: none !important; box-shadow: none !important; color: #000 !important; -webkit-text-fill-color: #000 !important;">' +
                    '<div class="xiaoxin-add-sticker-image-preview"></div>' +
                    "</div>" +
                    "</div>" +
                    "</div>" +
                    '<div class="xiaoxin-add-sticker-dialog-footer">' +
                    '<button class="xiaoxin-add-sticker-dialog-cancel">取消</button>' +
                    '<button class="xiaoxin-add-sticker-dialog-add">添加</button>' +
                    "</div>" +
                    "</div>" +
                    "</div>"
            );

            $("body").append($dialog);

            var stickerDescription = "";
            var stickerImageUrl = null;

            // 更新预览
            function updatePreview() {
                var $preview = $("#sticker-preview-icon");
                $preview.empty();

                if (stickerImageUrl) {
                    var $img = $(
                        '<img style="width: 100%; height: 100%; object-fit: contain;">'
                    );
                    $img.attr("src", stickerImageUrl);
                    $preview.append($img);
                } else {
                    $preview.html(
                        '<div style="color: #8e8e93; font-size: 14px; text-align: center; padding: 20px;">选择图片或输入URL后显示预览</div>'
                    );
                }
            }

            // 本地上传图片
            $dialog
                .find(".xiaoxin-add-sticker-image-btn")
                .on("click", function () {
                    $dialog.find(".xiaoxin-add-sticker-image-input").click();
                });

            $dialog
                .find(".xiaoxin-add-sticker-image-input")
                .on("change", function (e) {
                    var file = e.target.files[0];
                    if (file) {
                        // 检查文件类型（支持图片和GIF）
                        if (!file.type.startsWith("image/")) {
                            if (typeof toastr !== "undefined") {
                                toastr.warning("请选择图片文件", "小馨手机");
                            }
                            return;
                        }

                        var reader = new FileReader();
                        reader.onload = function (e) {
                            stickerImageUrl = e.target.result;
                            $dialog
                                .find(".xiaoxin-add-sticker-image-preview")
                                .html(
                                    '<img src="' +
                                        stickerImageUrl +
                                        '" style="max-width: 100px; max-height: 100px; border-radius: 4px;">'
                                );
                            updatePreview();
                        };
                        reader.readAsDataURL(file);
                    }
                });

            // URL输入图片 - 强制设置样式
            var $urlInput = $dialog.find(
                ".xiaoxin-add-sticker-image-url-input"
            );
            var urlInput = $urlInput[0]; // 原生DOM元素
            function setUrlInputStyle() {
                urlInput.style.setProperty(
                    "background",
                    "#e4e4e4",
                    "important"
                );
                urlInput.style.setProperty(
                    "background-color",
                    "#e4e4e4",
                    "important"
                );
                urlInput.style.setProperty("border", "none", "important");
                urlInput.style.setProperty("outline", "none", "important");
                urlInput.style.setProperty("box-shadow", "none", "important");
                urlInput.style.setProperty("color", "#000", "important");
                urlInput.style.setProperty(
                    "-webkit-text-fill-color",
                    "#000",
                    "important"
                );
            }
            setUrlInputStyle();
            $urlInput.on("focus focusin blur", function () {
                setUrlInputStyle();
            });
            $urlInput.on("input", function () {
                setUrlInputStyle();
                var url = $(this).val().trim();
                if (url) {
                    // 验证URL格式
                    try {
                        new URL(url);
                        stickerImageUrl = url;
                        // 尝试加载图片预览
                        var $previewImg = $(
                            '<img style="max-width: 100px; max-height: 100px; border-radius: 4px;">'
                        );
                        $previewImg.attr("src", url);
                        $previewImg.on("load", function () {
                            $dialog
                                .find(".xiaoxin-add-sticker-image-preview")
                                .html($previewImg);
                            updatePreview();
                        });
                        $previewImg.on("error", function () {
                            $dialog
                                .find(".xiaoxin-add-sticker-image-preview")
                                .html(
                                    '<div style="color: #f44336; font-size: 12px;">图片加载失败，请检查URL</div>'
                                );
                            stickerImageUrl = null;
                        });
                        $dialog
                            .find(".xiaoxin-add-sticker-image-preview")
                            .html($previewImg);
                    } catch (e) {
                        // URL格式无效
                        $dialog
                            .find(".xiaoxin-add-sticker-image-preview")
                            .html(
                                '<div style="color: #f44336; font-size: 12px;">URL格式无效</div>'
                            );
                        stickerImageUrl = null;
                    }
                } else {
                    stickerImageUrl = null;
                    $dialog.find(".xiaoxin-add-sticker-image-preview").empty();
                    updatePreview();
                }
            });

            // 描述输入 - 强制设置样式
            var $descriptionInput = $dialog.find(
                ".xiaoxin-add-sticker-description-input"
            );
            var descriptionInput = $descriptionInput[0]; // 原生DOM元素
            function setDescriptionInputStyle() {
                descriptionInput.style.setProperty(
                    "background",
                    "#e4e4e4",
                    "important"
                );
                descriptionInput.style.setProperty(
                    "background-color",
                    "#e4e4e4",
                    "important"
                );
                descriptionInput.style.setProperty(
                    "border",
                    "none",
                    "important"
                );
                descriptionInput.style.setProperty(
                    "outline",
                    "none",
                    "important"
                );
                descriptionInput.style.setProperty(
                    "box-shadow",
                    "none",
                    "important"
                );
                descriptionInput.style.setProperty(
                    "color",
                    "#000",
                    "important"
                );
                descriptionInput.style.setProperty(
                    "-webkit-text-fill-color",
                    "#000",
                    "important"
                );
            }
            setDescriptionInputStyle();
            $descriptionInput.on("input", function () {
                stickerDescription = $(this).val();
                setDescriptionInputStyle();
            });
            $descriptionInput.on("focus focusin blur", function () {
                setDescriptionInputStyle();
            });

            // 关闭弹窗
            function closeDialog() {
                $dialog.remove();
            }

            // 添加表情包
            function addSticker() {
                // 验证描述
                if (!stickerDescription || stickerDescription.trim() === "") {
                    if (typeof toastr !== "undefined") {
                        toastr.warning("请输入表情包描述", "小馨手机");
                    }
                    return;
                }

                // 验证图片
                if (!stickerImageUrl) {
                    if (typeof toastr !== "undefined") {
                        toastr.warning("请选择图片或输入图片URL", "小馨手机");
                    }
                    return;
                }

                // 添加到当前分组
                var newSticker = {
                    id: "sticker_" + Date.now(),
                    url: stickerImageUrl,
                    description: stickerDescription.trim(),
                };

                // 保存到持久化存储
                if (
                    window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler.addSticker ===
                        "function"
                ) {
                    window.XiaoxinWeChatDataHandler.addSticker(
                        currentStickerCategory,
                        newSticker
                    );
                }

                closeDialog();

                // 重新渲染表情包网格（会自动重新加载数据）
                if (isStickerExpanded) {
                    renderStickerGrid();
                }

                if (typeof toastr !== "undefined") {
                    toastr.success("表情包添加成功", "小馨手机");
                }
            }

            // 绑定事件
            $dialog
                .find(
                    ".xiaoxin-add-sticker-dialog-close, .xiaoxin-add-sticker-dialog-backdrop, .xiaoxin-add-sticker-dialog-cancel"
                )
                .on("click", closeDialog);
            $dialog
                .find(".xiaoxin-add-sticker-dialog-add")
                .on("click", addSticker);

            // 阻止内容区域点击关闭
            $dialog
                .find(".xiaoxin-add-sticker-dialog-content")
                .on("click", function (e) {
                    e.stopPropagation();
                });

            // 强制保持输入框样式 - 使用原生DOM API直接设置
            function forceInputStyle() {
                var inputs = $dialog.find(
                    ".xiaoxin-add-sticker-description-input, .xiaoxin-add-sticker-image-url-input"
                );
                inputs.each(function () {
                    var input = this; // 原生DOM元素
                    // 直接设置style属性，优先级最高
                    input.style.setProperty(
                        "background",
                        "#e4e4e4",
                        "important"
                    );
                    input.style.setProperty(
                        "background-color",
                        "#e4e4e4",
                        "important"
                    );
                    input.style.setProperty("border", "none", "important");
                    input.style.setProperty("outline", "none", "important");
                    input.style.setProperty("box-shadow", "none", "important");
                    input.style.setProperty(
                        "-webkit-box-shadow",
                        "none",
                        "important"
                    );
                    input.style.setProperty(
                        "-moz-box-shadow",
                        "none",
                        "important"
                    );
                    input.style.setProperty("color", "#000", "important");
                    input.style.setProperty(
                        "-webkit-text-fill-color",
                        "#000",
                        "important"
                    );
                });
            }

            // 持续强制样式
            var styleInterval = setInterval(forceInputStyle, 100);

            // 监听所有可能改变样式的事件
            $dialog
                .find(
                    ".xiaoxin-add-sticker-description-input, .xiaoxin-add-sticker-image-url-input"
                )
                .on("focus focusin blur focusout input change", function () {
                    forceInputStyle();
                });

            // 弹窗关闭时清除定时器
            var originalCloseDialog = closeDialog;
            closeDialog = function () {
                if (styleInterval) {
                    clearInterval(styleInterval);
                }
                originalCloseDialog();
            };

            // 初始预览
            updatePreview();
        }

        function renderStickerGrid() {
            $stickerGrid.empty();

            // 重新加载分组数据，确保数据最新（特别是表情包列表）
            stickerCategories = getStickerCategories();

            // 获取当前分组的表情包列表
            var currentCategory = stickerCategories.find(function (cat) {
                return cat.id === currentStickerCategory;
            });
            if (!currentCategory) {
                currentCategory = stickerCategories[0];
                if (currentCategory) {
                    currentStickerCategory = currentCategory.id;
                }
            }

            var list = currentCategory.getStickers
                ? currentCategory.getStickers()
                : [];

            // 左上角：虚线框加号
            var $addSticker = $(
                '<div class="xiaoxin-wechat-chat-sticker-item xiaoxin-wechat-chat-sticker-add">' +
                    '<div class="xiaoxin-wechat-chat-sticker-add-plus">+</div>' +
                    "</div>"
            );
            $addSticker.on("click", function (e) {
                e.stopPropagation();
                // 只有自定义分组才能添加表情包
                if (currentStickerCategory === "default") {
                    if (typeof toastr !== "undefined") {
                        toastr.warning(
                            "默认分组不支持添加表情包，请先创建自定义分组",
                            "小馨手机"
                        );
                    }
                    return;
                }
                showAddStickerDialog();
            });
            $stickerGrid.append($addSticker);

            // 渲染表情包
            list.forEach(function (item) {
                var url = null;
                var description = "";

                if (typeof item === "string") {
                    // 默认分组：纯文件名格式，加上路径前缀
                    // 自定义分组：可能是URL、ID或对象格式
                    if (currentCategory.id === "default") {
                        // 默认分组：直接是文件名，加上路径前缀
                        url =
                            "/scripts/extensions/third-party/xiaoxin-phone/image/表情包/" +
                            item;
                        description = "表情包";
                    } else {
                        // 自定义分组：跳过表情包ID格式（sticker_开头），这些应该通过对象格式返回
                        if (item.startsWith("sticker_")) {
                            // 检查映射表中是否有对应的URL
                            if (
                                window.XiaoxinWeChatApp &&
                                window.XiaoxinWeChatApp._stickerIdMap &&
                                window.XiaoxinWeChatApp._stickerIdMap[item]
                            ) {
                                // 有映射，使用映射的URL
                                url =
                                    window.XiaoxinWeChatApp._stickerIdMap[item];
                            } else {
                                // 没有映射，跳过这个无效的ID
                                return;
                            }
                        } else {
                            // 使用 _getEmojiPath 来正确解析表情包路径（支持URL、文件名）
                            if (
                                window.XiaoxinWeChatApp &&
                                typeof window.XiaoxinWeChatApp._getEmojiPath ===
                                    "function"
                            ) {
                                url =
                                    window.XiaoxinWeChatApp._getEmojiPath(item);
                                // 检查返回的路径是否是无效的sticker_路径
                                if (url && url.includes("/表情包/sticker_")) {
                                    var pathParts = url.split("/");
                                    var lastPart =
                                        pathParts[pathParts.length - 1];
                                    // 如果最后一部分是sticker_开头且没有文件扩展名，说明是无效路径
                                    if (
                                        lastPart.startsWith("sticker_") &&
                                        !lastPart.match(/\.[a-zA-Z0-9]+$/)
                                    ) {
                                        // 是无效的sticker_路径，跳过
                                        return;
                                    }
                                }
                            } else {
                                // 降级处理：使用默认逻辑
                                if (
                                    item.startsWith("http://") ||
                                    item.startsWith("https://") ||
                                    item.startsWith("data:image") ||
                                    (item.startsWith("/") &&
                                        !item.startsWith("/scripts"))
                                ) {
                                    // 是URL格式，直接使用
                                    url = item;
                                } else if (
                                    item.startsWith("/scripts") &&
                                    item.includes("表情包/")
                                ) {
                                    // 已经是完整路径，直接使用
                                    url = item;
                                } else {
                                    // 可能是无效格式，跳过
                                    return;
                                }
                            }
                        }
                        description = "表情包";
                    }
                } else if (item && typeof item === "object") {
                    // 自定义表情包对象格式
                    url = item.url || item.src || item.path || item;
                    description = item.description || "表情包";
                }

                // 验证URL是否有效
                if (!url || url.trim() === "") return;

                // 如果URL是sticker_开头的路径（无效路径），跳过
                if (
                    url.includes("/表情包/sticker_") ||
                    url.includes("/表情包/sticker_")
                ) {
                    var pathParts = url.split("/");
                    var lastPart = pathParts[pathParts.length - 1];
                    // 如果最后一部分是sticker_开头且没有文件扩展名，说明是无效路径
                    if (
                        lastPart.startsWith("sticker_") &&
                        !lastPart.match(/\.[a-zA-Z0-9]+$/)
                    ) {
                        // 是无效的sticker_路径，跳过
                        console.warn(
                            "[小馨手机][微信聊天UI] 跳过无效的表情包路径:",
                            url
                        );
                        return;
                    }
                }

                var $cell = $(
                    '<div class="xiaoxin-wechat-chat-sticker-item">' +
                        '<img class="xiaoxin-wechat-chat-sticker-img" draggable="false" />' +
                        "</div>"
                );
                $cell.find("img").attr("src", url);
                $cell.on("click", function (e) {
                    e.stopPropagation();
                    // 表情包必须作为 emoji 消息发送（不是 image），避免被走“生图/图片”流程
                    // 约定：content 写入表情包路径或ID，渲染层会用 _getEmojiPath 解析
                    sendEmojiMessage(url || description || "表情包");
                    if (isStickerExpanded) {
                        toggleSticker();
                    }
                });
                $stickerGrid.append($cell);
            });
        }

        function _adjustMessagesPaddingForBar(barHeight, storeKey) {
            if (storeKey === "menu") {
                if (originalMessagesListPaddingBottom === null) {
                    originalMessagesListPaddingBottom =
                        $messagesList.css("padding-bottom");
                }
                var base = parseInt(originalMessagesListPaddingBottom) || 12;
                $messagesList.css("padding-bottom", base + barHeight + "px");
                return;
            }
            if (originalMessagesListPaddingBottomForSticker === null) {
                originalMessagesListPaddingBottomForSticker =
                    $messagesList.css("padding-bottom");
            }
            var base2 =
                parseInt(originalMessagesListPaddingBottomForSticker) || 12;
            $messagesList.css("padding-bottom", base2 + barHeight + "px");
        }

        function toggleSticker() {
            isStickerExpanded = !isStickerExpanded;

            if (isStickerExpanded) {
                // 与加号菜单互斥
                if (isMenuExpanded) {
                    toggleMenu();
                }

                renderStickerTabs();
                renderStickerGrid();

                $stickerBar.css("display", "flex");
                $stickerBar.css("visibility", "hidden");
                var barHeight = $stickerBar.outerHeight() || 0;
                $stickerBar.css("visibility", "visible");

                var translateY = -barHeight;
                $inputBar.css({
                    transform: "translateY(" + translateY + "px)",
                    transition: "transform 0.2s ease",
                });

                $inputBar.addClass(
                    "xiaoxin-wechat-chat-input-bar-menu-expanded"
                );

                $stickerBar.css({
                    bottom: "20px",
                    top: "auto",
                    transition: "bottom 0.2s ease",
                });

                $stickerBar.slideDown(200, function () {
                    _adjustMessagesPaddingForBar(barHeight, "sticker");
                    scrollToLastMessage();
                });
            } else {
                $inputBar.css({
                    transform: "translateY(0)",
                    transition: "transform 0.2s ease",
                });

                $inputBar.removeClass(
                    "xiaoxin-wechat-chat-input-bar-menu-expanded"
                );

                if (originalMessagesListPaddingBottomForSticker !== null) {
                    $messagesList.css(
                        "padding-bottom",
                        originalMessagesListPaddingBottomForSticker
                    );
                }

                $stickerBar.slideUp(200);
            }
        }

        // 表情按钮点击
        $emojiBtn.on("click", function (e) {
            e.stopPropagation();
            toggleSticker();
        });

        // 点击表情面板外部区域关闭
        $(document).on("click", function (e) {
            if (
                isStickerExpanded &&
                !$(e.target).closest(".xiaoxin-wechat-chat-input-emoji")
                    .length &&
                !$(e.target).closest(".xiaoxin-wechat-chat-sticker-bar").length
            ) {
                toggleSticker();
            }
        });

        // 阻止表情面板点击事件冒泡
        $stickerBar.on("click", function (e) {
            e.stopPropagation();
        });

        // 加号按钮点击事件
        $addBtn.on("click", function (e) {
            e.stopPropagation();
            // 与表情包面板互斥
            if (isStickerExpanded) {
                toggleSticker();
            }
            toggleMenu();
        });

        // 切换菜单展开/折叠
        function toggleMenu() {
            isMenuExpanded = !isMenuExpanded;

            if (isMenuExpanded) {
                // 先显示菜单栏（但不显示内容，用于计算高度）
                $menuBar.css("display", "block");
                $menuBar.css("visibility", "hidden");

                // 获取菜单栏的实际高度
                var menuBarHeight = $menuBar.outerHeight() || 0;

                // 恢复可见性
                $menuBar.css("visibility", "visible");

                // 输入栏往上移动菜单栏的高度，为菜单栏腾出空间
                var translateY = -menuBarHeight;
                $inputBar.css({
                    transform: "translateY(" + translateY + "px)",
                    transition: "transform 0.2s ease",
                });

                // 添加类，使输入栏底部区域显示菜单栏的背景色
                $inputBar.addClass(
                    "xiaoxin-wechat-chat-input-bar-menu-expanded"
                );

                // 菜单栏显示在输入框下方
                // 往上移动20px避免遮挡home条
                $menuBar.css({
                    bottom: "20px",
                    top: "auto",
                    transition: "bottom 0.2s ease",
                });

                // 展开菜单动画
                $menuBar.slideDown(200, function () {
                    // 调整消息列表的 padding-bottom
                    _adjustMessagesPaddingForBar(menuBarHeight, "menu");
                    // 菜单展开后，滚动消息列表确保最后一条消息可见
                    scrollToLastMessage();
                });
            } else {
                // 折叠菜单 - 同时开始输入框和菜单栏的动画，确保同步
                // 恢复输入栏位置（与菜单栏折叠动画同步）
                $inputBar.css({
                    transform: "translateY(0)",
                    transition: "transform 0.2s ease",
                });

                // 移除类，恢复输入栏底部区域的默认背景色
                $inputBar.removeClass(
                    "xiaoxin-wechat-chat-input-bar-menu-expanded"
                );

                // 恢复消息列表的原始 padding-bottom
                if (originalMessagesListPaddingBottom !== null) {
                    $messagesList.css(
                        "padding-bottom",
                        originalMessagesListPaddingBottom
                    );
                }

                // 菜单栏折叠动画
                $menuBar.slideUp(200);
            }
        }

        // 点击菜单外部区域关闭菜单
        $(document).on("click", function (e) {
            if (
                isMenuExpanded &&
                !$(e.target).closest(".xiaoxin-wechat-chat-input-add").length &&
                !$(e.target).closest(".xiaoxin-wechat-chat-menu-bar").length
            ) {
                toggleMenu();
            }
        });

        // 阻止菜单栏点击事件冒泡
        $menuBar.on("click", function (e) {
            e.stopPropagation();
        });

        // 滚动到消息列表底部，确保最后一条消息显示在移动后的输入框上方
        function scrollToLastMessage() {
            if (!$messagesList.length) return;

            // 获取消息列表容器
            var messagesListElement = $messagesList[0];
            if (!messagesListElement) return;

            // 等待DOM更新完成，确保输入框移动动画已经开始
            setTimeout(function () {
                // 获取当前展开的栏高度（菜单栏或表情包栏）
                var barHeight = 0;
                var barType = "";

                if (isMenuExpanded) {
                    barHeight = $menuBar.outerHeight() || 0;
                    barType = "menu";
                } else if (isStickerExpanded) {
                    barHeight = $stickerBar.outerHeight() || 0;
                    barType = "sticker";
                }

                if (barHeight <= 0) {
                    return; // 栏高度无效，不滚动
                }

                // 获取最后一条消息元素
                var $lastMessage = $messagesList
                    .find(".xiaoxin-wechat-chat-message-item")
                    .last();

                if ($lastMessage.length === 0) {
                    return; // 没有消息，不滚动
                }

                // 等待DOM更新
                setTimeout(function () {
                    // 获取消息列表的滚动高度和可视高度
                    var scrollHeight = messagesListElement.scrollHeight;
                    var clientHeight = messagesListElement.clientHeight;

                    // 计算目标滚动位置：滚动到底部，让最后一条消息显示在输入框上方
                    var targetScrollTop = scrollHeight - clientHeight;

                    console.info(
                        "[小馨手机][微信聊天UI] " +
                            barType +
                            "展开，滚动消息列表:",
                        "scrollHeight:",
                        scrollHeight,
                        "clientHeight:",
                        clientHeight,
                        "barHeight:",
                        barHeight,
                        "targetScrollTop:",
                        targetScrollTop
                    );

                    // 滚动到目标位置
                    messagesListElement.scrollTop = targetScrollTop;

                    // 验证滚动是否成功
                    setTimeout(function () {
                        var actualScrollTop = messagesListElement.scrollTop;
                        console.info(
                            "[小馨手机][微信聊天UI] 滚动完成，实际滚动位置:",
                            actualScrollTop,
                            "目标位置:",
                            targetScrollTop
                        );
                    }, 50);
                }, 10);
            }, 250); // 等待输入框和栏动画完全开始
        }

        // ========== 语音消息录入弹窗 ==========

        function openVoiceDialog() {
            // 覆盖层
            var $overlay = $(
                '<div class="xiaoxin-picker-overlay xiaoxin-voice-overlay"></div>'
            );
            var $dialog = $(
                '<div class="xiaoxin-picker xiaoxin-voice-dialog"></div>'
            );

            var $title = $(
                '<div class="xiaoxin-picker-title">发送语音消息</div>'
            );

            // 语音内容输入
            var $contentRow = $('<div class="xiaoxin-picker-row"></div>');
            var $contentLabel = $(
                '<div class="xiaoxin-picker-label">语音内容</div>'
            );
            var $contentControl = $(
                '<div class="xiaoxin-picker-control"></div>'
            );
            var $contentInput = $(
                '<textarea class="xiaoxin-voice-content-input" rows="4" placeholder="请输入语音要说的内容（将作为语音的文字转写）"></textarea>'
            );
            $contentControl.append($contentInput);
            $contentRow.append($contentLabel, $contentControl);

            // 时长输入
            var $durationRow = $('<div class="xiaoxin-picker-row"></div>');
            var $durationLabel = $(
                '<div class="xiaoxin-picker-label">语音时长(秒)</div>'
            );
            var $durationControl = $(
                '<div class="xiaoxin-picker-control"></div>'
            );
            var $durationInput = $(
                '<input type="number" class="xiaoxin-voice-duration-input" min="1" max="60" value="4" />'
            );
            var $durationHint = $(
                '<div class="xiaoxin-picker-hint">范围 1–60 秒，正常语速 1 分钟约 200–220 字</div>'
            );
            $durationControl.append($durationInput, $durationHint);
            $durationRow.append($durationLabel, $durationControl);

            // 按钮
            var $buttons = $('<div class="xiaoxin-picker-buttons"></div>');
            var $cancelBtn = $(
                '<button class="xiaoxin-picker-button xiaoxin-picker-button-cancel">取消</button>'
            );
            var $confirmBtn = $(
                '<button class="xiaoxin-picker-button xiaoxin-picker-button-confirm">发送</button>'
            );
            $buttons.append($cancelBtn, $confirmBtn);

            $dialog.append($title, $contentRow, $durationRow, $buttons);
            $overlay.append($dialog);
            $("body").append($overlay);

            console.info(
                "[小馨手机][微信聊天UI] 语音消息弹窗已创建并添加到DOM"
            );

            // 在手机页面上，需要相对于手机容器定位
            function adjustVoiceDialogPosition() {
                // 检测是否在手机页面上
                var isMobilePage =
                    $(window).width() < 768 ||
                    /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

                if (!isMobilePage) {
                    // 在电脑页面上，使用默认的fixed定位（相对于视口居中）
                    return;
                }

                // 查找手机容器
                var $phoneContainer = $(".xiaoxin-phone-container");
                if (!$phoneContainer.length) {
                    return;
                }

                var phoneRect = $phoneContainer[0].getBoundingClientRect();

                // 获取手机容器的缩放比例（从transform: scale中提取）
                var phoneScale = 1;
                var transform = $phoneContainer.css("transform");
                if (transform && transform !== "none") {
                    var matrix = transform.match(/matrix\(([^)]+)\)/);
                    if (matrix && matrix[1]) {
                        var values = matrix[1].split(",");
                        if (values.length >= 1) {
                            phoneScale = parseFloat(values[0]) || 1;
                        }
                    }
                }

                // 计算手机容器的实际显示区域（考虑缩放）
                var phoneScreenWidth = phoneRect.width / phoneScale || 393;
                var phoneScreenHeight = phoneRect.height / phoneScale || 790;

                // 获取弹窗内容区域
                var $picker = $overlay.find(".xiaoxin-picker");
                if (!$picker.length) return;

                // 计算弹窗应该显示的位置，使其相对于手机屏幕居中
                var pickerWidth = $picker.outerWidth() || 340;
                var pickerHeight = $picker.outerHeight() || 400;

                // 手机屏幕在视口中的位置
                var phoneScreenLeft = phoneRect.left;
                var phoneScreenTop = phoneRect.top;

                // 计算弹窗在手机屏幕中的居中位置
                var pickerLeft =
                    phoneScreenLeft + (phoneScreenWidth - pickerWidth) / 2;
                var pickerTop =
                    phoneScreenTop + (phoneScreenHeight - pickerHeight) / 2;

                // 确保弹窗在视口内
                var winWidth = $(window).width();
                var winHeight = $(window).height();
                pickerLeft = Math.max(
                    10,
                    Math.min(pickerLeft, winWidth - pickerWidth - 10)
                );
                pickerTop = Math.max(
                    10,
                    Math.min(pickerTop, winHeight - pickerHeight - 10)
                );

                // 设置遮罩层覆盖整个视口（保持原有行为）
                $overlay.css({
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                });

                // 设置弹窗内容的位置，使其相对于手机容器居中
                $picker.css({
                    position: "fixed",
                    left: pickerLeft + "px",
                    top: pickerTop + "px",
                    margin: 0,
                    transform: "none",
                });
            }

            // 初始定位
            adjustVoiceDialogPosition();

            // 监听窗口大小变化，重新调整位置
            var resizeHandler = function () {
                adjustVoiceDialogPosition();
            };
            $(window).on("resize.xiaoxinVoiceDialog", resizeHandler);

            // 弹窗关闭时移除监听
            var originalRemove = $overlay.remove;
            $overlay.remove = function () {
                $(window).off("resize.xiaoxinVoiceDialog", resizeHandler);
                return originalRemove.call(this);
            };

            $cancelBtn.on("click", function () {
                $overlay.remove();
            });

            $confirmBtn.on("click", function () {
                var text = ($contentInput.val() || "").trim();
                var duration = parseInt($durationInput.val(), 10);
                if (!text) {
                    if (typeof toastr !== "undefined") {
                        toastr.warning("请先输入语音内容", "小馨手机");
                    }
                    return;
                }
                if (isNaN(duration) || duration <= 0) {
                    duration = 1;
                }
                if (duration > 60) {
                    duration = 60;
                }

                sendVoiceMessage(text, duration);
                $overlay.remove();
            });
        }

        $voiceBtn.on("click", openVoiceDialog);

        // ========== 通话选择窗口（从底部滑出） ==========
        var $callOptionsDialog = null;

        // 追加指令到酒馆输入框
        function appendCommandToInput(command) {
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
                        if (tavernInput) break;
                    }
                }
                if (!tavernInput) {
                    console.warn(
                        "[小馨手机][微信聊天UI] 未找到输入框，无法插入指令"
                    );
                    return false;
                }
                var currentText = tavernInput.value || "";
                if (currentText.trim()) currentText += "\n";
                currentText += command;
                tavernInput.value = currentText;
                tavernInput.dispatchEvent(
                    new Event("input", { bubbles: true })
                );
                tavernInput.dispatchEvent(
                    new Event("change", { bubbles: true })
                );
                return true;
            } catch (e) {
                console.error("[小馨手机][微信聊天UI] 插入指令失败:", e);
                return false;
            }
        }

        // 将消息直接插入到酒馆正文中（通过输入框自动发送）
        function appendMessageToBody(messageContent) {
            try {
                // 查找输入框
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
                        if (tavernInput) break;
                    }
                }

                if (!tavernInput) {
                    console.warn(
                        "[小馨手机][微信聊天UI] 未找到输入框，无法插入消息"
                    );
                    return false;
                }

                // 保存当前输入框内容（如果有）
                var currentValue = tavernInput.value || "";

                // 设置输入框内容为通话指令
                tavernInput.value = messageContent;

                // 触发输入事件，确保酒馆能够识别内容
                tavernInput.dispatchEvent(
                    new Event("input", { bubbles: true })
                );
                tavernInput.dispatchEvent(
                    new Event("change", { bubbles: true })
                );

                // 聚焦输入框
                tavernInput.focus();

                // 尝试自动发送（延迟一点时间，确保输入框已更新）
                setTimeout(function () {
                    try {
                        // 方法1：查找发送按钮并点击
                        var sendButton = document.querySelector(
                            "#send_but, .send_but, [id*='send'][id*='but'], " +
                                "[class*='send'][class*='but'], " +
                                "button[type='submit'], " +
                                ".send-button, #send_button"
                        );

                        if (sendButton && sendButton.offsetParent !== null) {
                            // 按钮可见时才点击
                            sendButton.click();
                            console.info(
                                "[小馨手机][微信聊天UI] 已通过发送按钮自动发送消息"
                            );
                            return;
                        }

                        // 方法2：尝试触发 Ctrl+Enter 或 Enter 键
                        var enterEvent = new KeyboardEvent("keydown", {
                            key: "Enter",
                            code: "Enter",
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true,
                        });
                        tavernInput.dispatchEvent(enterEvent);

                        // 也尝试 keypress 和 keyup
                        var pressEvent = new KeyboardEvent("keypress", {
                            key: "Enter",
                            code: "Enter",
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true,
                        });
                        tavernInput.dispatchEvent(pressEvent);

                        var upEvent = new KeyboardEvent("keyup", {
                            key: "Enter",
                            code: "Enter",
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true,
                        });
                        tavernInput.dispatchEvent(upEvent);

                        console.info(
                            "[小馨手机][微信聊天UI] 已触发回车键事件尝试发送消息"
                        );
                    } catch (e) {
                        console.error(
                            "[小馨手机][微信聊天UI] 自动发送消息失败:",
                            e
                        );
                    }
                }, 200);

                console.info(
                    "[小馨手机][微信聊天UI] 已插入消息到输入框，等待自动发送:",
                    messageContent
                );
                return true;
            } catch (e) {
                console.error("[小馨手机][微信聊天UI] 插入消息到正文失败:", e);
                return false;
            }
        }

        // 启动玩家主动语音通话
        function startOutgoingVoiceCall() {
            // 生成唯一的通话ID，确保不会与历史通话ID重复
            var baseId =
                Date.now() + "_" + Math.random().toString(36).substr(2, 6);
            var callId = generateUniqueCallIdForOutgoing(baseId);
            var msgId = generateMsgId();

            // 记录通话发起方：玩家主动拨号
            // 用于消息监听器在收到 state=ended 时决定气泡显示在哪一侧
            try {
                if (window.localStorage && callId) {
                    localStorage.setItem("wx_call_initiator_" + callId, "player");
                }
            } catch (e) {}

            // world time
            var worldTs = 0;
            var rawWorldTime = "";
            if (window.XiaoxinWorldClock) {
                worldTs =
                    window.XiaoxinWorldClock.currentTimestamp ||
                    window.XiaoxinWorldClock.timestamp ||
                    0;
                rawWorldTime =
                    window.XiaoxinWorldClock.rawTime ||
                    window.XiaoxinWorldClock.raw ||
                    "";
            }
            if (!rawWorldTime) {
                var baseDate = worldTs > 0 ? new Date(worldTs) : new Date();
                // 确保时间格式包含秒：YYYY-MM-DD HH:mm:ss
                var year = baseDate.getFullYear();
                var month = String(baseDate.getMonth() + 1).padStart(2, "0");
                var day = String(baseDate.getDate()).padStart(2, "0");
                var hours = String(baseDate.getHours()).padStart(2, "0");
                var minutes = String(baseDate.getMinutes()).padStart(2, "0");
                var seconds = String(baseDate.getSeconds()).padStart(2, "0");
                rawWorldTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            }

            // 玩家/角色ID
            var currentAccount = window.XiaoxinWeChatAccount
                ? window.XiaoxinWeChatAccount.getCurrentAccount()
                : null;
            var playerId = currentAccount
                ? currentAccount.wechatId || currentAccount.id || "player"
                : "player";

            // 严格使用角色ID，优先顺序：characterId > id > wechatId > chatUserId
            // 注意：不使用 contact.nickname 或 contact.remark，这些仅用于显示
            var targetId =
                contact.characterId ||
                contact.id ||
                contact.wechatId ||
                chatUserId;

            // 获取被拨打角色的实名
            var charRealName =
                contact.realName ||
                contact.legalName ||
                contact.real_name ||
                contact.name ||
                contact.nickname ||
                "未知";

            // 获取玩家名称
            var playerName =
                currentAccount && (currentAccount.nickname || currentAccount.name)
                    ? currentAccount.nickname || currentAccount.name
                    : "{{user}}";

            console.info(
                "[小馨手机][微信聊天UI] 发起语音通话，目标角色ID:",
                targetId,
                "角色实名:",
                charRealName,
                "contact信息:",
                {
                    id: contact.id,
                    characterId: contact.characterId,
                    wechatId: contact.wechatId,
                    nickname: contact.nickname,
                    remark: contact.remark,
                    realName: contact.realName,
                    legalName: contact.legalName,
                    real_name: contact.real_name,
                    chatUserId: chatUserId,
                }
            );

            var command = `[MSG]
id=${msgId}
time=${rawWorldTime}
from=user
to=${targetId}
type=call_voice
state=ringing
with=${targetId}
call_id=${callId}
note=${playerName}对${charRealName}发起了语音通话
[/MSG]`;

            // 直接插入到正文中（使用输入框并自动发送）
            var inserted = appendMessageToBody(command);
            if (window.toastr) {
                if (inserted) {
                    toastr.success(
                        "已发起语音通话，消息已发送到正文",
                        "小馨手机"
                    );
                } else {
                    // 如果自动发送失败，提示用户手动发送
                    toastr.warning(
                        "无法自动发送消息，请手动在输入框中发送",
                        "小馨手机"
                    );
                    // 尝试将消息插入到输入框作为备选方案
                    appendCommandToInput(command);
                }
            }

            // 显示通话界面（等待对方接听）
            if (
                window.XiaoxinIncomingCall &&
                typeof window.XiaoxinIncomingCall.showActiveCall === "function"
            ) {
                window.XiaoxinIncomingCall.showActiveCall(contact, {
                    waitingMode: true,
                    callId: callId,
                    direction: "outgoing",
                });
            }

            // 触发灵动岛通话状态显示（等待接听状态，暂时不显示，等接听后显示）
            // 注意：等待状态下不显示灵动岛，等角色接听后再显示
        }

        function showCallOptionsDialog() {
            // 关闭菜单栏
            if (isMenuExpanded) {
                toggleMenu();
            }

            // 如果弹窗已存在，先移除
            if ($callOptionsDialog) {
                $callOptionsDialog.remove();
            }

            // 创建通话选择窗口
            $callOptionsDialog = $(
                '<div class="xiaoxin-call-options-dialog">' +
                    '<div class="xiaoxin-call-options-dialog-backdrop"></div>' +
                    '<div class="xiaoxin-call-options-dialog-content">' +
                    '<div class="xiaoxin-call-options-item" data-type="video">' +
                    '<div class="xiaoxin-call-options-icon xiaoxin-call-options-icon-video"></div>' +
                    '<div class="xiaoxin-call-options-label">视频通话</div>' +
                    "</div>" +
                    '<div class="xiaoxin-call-options-item" data-type="voice">' +
                    '<div class="xiaoxin-call-options-icon xiaoxin-call-options-icon-voice"></div>' +
                    '<div class="xiaoxin-call-options-label">语音通话</div>' +
                    "</div>" +
                    '<div class="xiaoxin-call-options-divider"></div>' +
                    '<div class="xiaoxin-call-options-item xiaoxin-call-options-cancel" data-type="cancel">' +
                    '<div class="xiaoxin-call-options-label">取消</div>' +
                    "</div>" +
                    "</div>" +
                    "</div>"
            );

            // 添加到页面
            $container.append($callOptionsDialog);

            // 获取元素引用
            var $backdrop = $callOptionsDialog.find(
                ".xiaoxin-call-options-dialog-backdrop"
            );
            var $videoItem = $callOptionsDialog.find('[data-type="video"]');
            var $voiceItem = $callOptionsDialog.find('[data-type="voice"]');
            var $cancelItem = $callOptionsDialog.find('[data-type="cancel"]');

            // 关闭弹窗函数
            function closeDialog() {
                if ($callOptionsDialog) {
                    $callOptionsDialog.removeClass("show");
                    setTimeout(function () {
                        if ($callOptionsDialog) {
                            $callOptionsDialog.remove();
                            $callOptionsDialog = null;
                        }
                    }, 300); // 等待动画完成
                }
            }

            // 视频通话按钮点击事件
            $videoItem.on("click", function (e) {
                e.stopPropagation();
                console.info("[小馨手机][微信聊天UI] 点击视频通话");
                // TODO: 实现视频通话功能
                if (window.toastr) {
                    toastr.info("视频通话功能开发中", "小馨手机");
                }
                closeDialog();
            });

            // 语音通话按钮点击事件
            $voiceItem.on("click", function (e) {
                e.stopPropagation();
                console.info("[小馨手机][微信聊天UI] 点击语音通话");
                startOutgoingVoiceCall();
                closeDialog();
            });

            // 取消按钮点击事件
            $cancelItem.on("click", function (e) {
                e.stopPropagation();
                closeDialog();
            });

            // 点击背景关闭
            $backdrop.on("click", closeDialog);

            // 显示弹窗动画（从底部滑出）
            setTimeout(function () {
                $callOptionsDialog.addClass("show");
            }, 10);
        }

        // 发送转账消息（构造 [MSG] 数据块 + 预览）
        // 注意：与文本消息一致：不直接写入聊天记录，只做预览 + 植入酒馆输入框
        function sendTransferMessage(amount, note) {
            var msgId = generateMsgId();

            // ===== 读取最新世界观时间，并在其基础上延后 30 秒，确保排序正确（与文本一致） =====
            var lastWorldTimestamp = 0;
            if (window.XiaoxinWorldClock) {
                lastWorldTimestamp =
                    window.XiaoxinWorldClock.currentTimestamp ||
                    window.XiaoxinWorldClock.timestamp ||
                    0;
            }

            if (lastWorldTimestamp <= 0) {
                try {
                    var history = window.XiaoxinWeChatDataHandler
                        ? window.XiaoxinWeChatDataHandler.getChatHistory(
                              chatUserId
                          )
                        : [];
                    if (history && history.length > 0) {
                        var lastMsg = history[history.length - 1];
                        if (lastMsg.timestamp) {
                            lastWorldTimestamp = lastMsg.timestamp;
                        }
                    }
                } catch (e) {}
            }

            if (lastWorldTimestamp <= 0) {
                lastWorldTimestamp = Date.now();
            }

            var chatMessages = [];
            try {
                if (
                    window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler.getChatMessages ===
                        "function"
                ) {
                    chatMessages =
                        window.XiaoxinWeChatDataHandler.getChatMessages(
                            chatUserId
                        ) || [];
                }
            } catch (e) {}

            var lastMessageTimestamp = lastWorldTimestamp;
            if (chatMessages && chatMessages.length > 0) {
                var sortedMessages = chatMessages
                    .filter(function (m) {
                        return m.timestamp && m.timestamp > 0;
                    })
                    .sort(function (a, b) {
                        return b.timestamp - a.timestamp;
                    });
                if (sortedMessages.length > 0) {
                    lastMessageTimestamp = sortedMessages[0].timestamp;
                }
            }

            var baseTimestamp = lastWorldTimestamp;
            if (lastMessageTimestamp > lastWorldTimestamp) {
                baseTimestamp = lastMessageTimestamp;
            }
            var nextTimestamp = baseTimestamp + 30000;
            var nowDate = new Date(nextTimestamp);

            var nowStr = "";
            if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.rawTime) {
                var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                var normalizedTimeStr = rawTimeStr
                    .replace(/-/g, "/")
                    .replace(/年|月|日|星期[一二三四五六日]/g, " ");
                var baseTime = Date.parse(normalizedTimeStr);
                if (!isNaN(baseTime)) {
                    // 与文本逻辑保持一致：基于 rawTime 推进 60 秒生成字符串显示
                    var newTime = new Date(baseTime + 60000);
                    nowStr = formatTime(newTime);
                } else {
                    nowStr = formatTime(nowDate);
                }
            } else {
                nowStr = formatTime(nowDate);
            }

            // 玩家/角色 id
            var account = window.XiaoxinWeChatAccount
                ? window.XiaoxinWeChatAccount.getCurrentAccount()
                : null;
            var fromId = account
                ? String(account.wechatId || account.id || "0").trim()
                : "0";
            var toId =
                contact && contact.id ? String(contact.id) : String(chatUserId);

            var amt = parseFloat(amount);
            if (isNaN(amt)) amt = 0;
            var noteStr = String(note || "").trim();

            // 预览消息对象（与现有渲染字段兼容）
            var msgObj = {
                id: msgId,
                time: nowStr,
                from: String(fromId),
                to: String(toId),
                type: "transfer",
                content: "转账",
                amount: amt,
                note: noteStr,
                timestamp: nextTimestamp,
                rawTime: nowStr,
            };

            // 植入酒馆输入框的 [MSG] 指令
            var packet =
                "\n[MSG]\n" +
                "id=" +
                msgId +
                "\n" +
                "time=" +
                nowStr +
                "\n" +
                "from=user\n" +
                "to=" +
                String(toId) +
                "\n" +
                "type=transfer\n" +
                "amount=" +
                String(amt) +
                "\n" +
                (noteStr ? "note=" + noteStr + "\n" : "") +
                "[/MSG]";

            // 先加入预览
            pendingMessages[msgId] = msgObj;
            refreshMessageList();

            // 推进世界观时钟（与文本一致）
            try {
                if (window.XiaoxinWorldClock) {
                    window.XiaoxinWorldClock.currentTimestamp = nextTimestamp;
                    window.XiaoxinWorldClock.timestamp = nextTimestamp;
                    window.XiaoxinWorldClock.rawTime = nowStr;
                    window.XiaoxinWorldClock.raw = nowStr;
                }
            } catch (e) {}

            // 写入酒馆输入框
            try {
                if (
                    window.XiaoxinWeChatApp &&
                    window.XiaoxinWeChatApp.insertTextToTavernInput
                ) {
                    window.XiaoxinWeChatApp.insertTextToTavernInput(packet);
                } else {
                    var tavernInput = document.getElementById("send_textarea");
                    if (tavernInput) {
                        tavernInput.value += packet;
                        tavernInput.dispatchEvent(
                            new Event("input", { bubbles: true })
                        );
                    } else {
                        throw new Error("未找到酒馆输入框 #send_textarea");
                    }
                }
            } catch (err) {
                console.error(
                    "[小馨手机][微信聊天UI] 发送转账到酒馆输入框失败:",
                    err
                );
                delete pendingMessages[msgId];
                refreshMessageList();
            }
        }

        // 发送表情包消息（构造 [MSG] 数据块 + 预览）
        // 注意：表情包必须是 type=emoji，content 写入表情包ID/路径/URL，由渲染层解析为具体图片
        function sendEmojiMessage(emojiContent) {
            var msgId = generateMsgId();

            // ===== 时间逻辑沿用图片消息，确保在当前对话时间线上 =====
            var lastWorldTimestamp = 0;
            if (window.XiaoxinWorldClock) {
                lastWorldTimestamp =
                    window.XiaoxinWorldClock.currentTimestamp ||
                    window.XiaoxinWorldClock.timestamp ||
                    0;
            }

            if (lastWorldTimestamp <= 0) {
                try {
                    var history = window.XiaoxinWeChatDataHandler
                        ? window.XiaoxinWeChatDataHandler.getChatHistory(
                              chatUserId
                          )
                        : [];
                    if (history && history.length) {
                        var last = history[history.length - 1];
                        if (last && last.timestamp)
                            lastWorldTimestamp = last.timestamp;
                    }
                } catch (e) {}
            }

            // 与图片消息保持一致：默认在基准时间后 +60 秒
            var lastMessageTimestamp = 0;
            try {
                var history2 = window.XiaoxinWeChatDataHandler
                    ? window.XiaoxinWeChatDataHandler.getChatHistory(chatUserId)
                    : [];
                if (history2 && history2.length) {
                    for (var i = history2.length - 1; i >= 0; i--) {
                        if (history2[i] && history2[i].timestamp) {
                            lastMessageTimestamp = history2[i].timestamp;
                            break;
                        }
                    }
                }
            } catch (e) {}

            var baseTimestamp = lastWorldTimestamp;
            if (lastMessageTimestamp > lastWorldTimestamp) {
                baseTimestamp = lastMessageTimestamp;
            }

            var nowDate = new Date(baseTimestamp + 60000);
            var nowStr = "";
            if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.rawTime) {
                var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                var normalizedTimeStr = rawTimeStr
                    .replace(/-/g, "/")
                    .replace(/年|月|日|星期[一二三四五六日]/g, " ");
                var baseTime = Date.parse(normalizedTimeStr);
                if (!isNaN(baseTime)) {
                    var newTime = new Date(baseTime + 60000);
                    nowStr = formatTime(newTime);
                } else {
                    nowStr = formatTime(nowDate);
                }
            } else {
                nowStr = formatTime(nowDate);
            }

            // 获取玩家微信id（优先使用账号的 wechatId，其次 id）
            var account = window.XiaoxinWeChatAccount
                ? window.XiaoxinWeChatAccount.getCurrentAccount()
                : null;
            var fromId = account
                ? String(account.wechatId || account.id || "0").trim()
                : "0";
            // 角色ID使用联系方式数据块中的 id
            var toId =
                contact && contact.id ? String(contact.id) : String(chatUserId);

            var safeContent = String(emojiContent || "").trim();
            // 如果传入的是完整URL（/scripts/extensions/third-party/xiaoxin-phone/image/表情包/xxx.png），
            // 为了兼容 _getEmojiPath 的逻辑，统一只保留文件名/ID，后续再由 _getEmojiPath 拼接前缀
            safeContent = safeContent.replace(
                /^\/scripts\/extensions\/third-party\/xiaoxin-phone\/image\/表情包\//,
                ""
            );
            if (!safeContent) safeContent = "表情包";

            // 构建消息对象
            var msgObj = {
                id: msgId,
                time: nowStr,
                from: String(fromId),
                to: String(toId),
                type: "emoji",
                content: safeContent,
            };

            // 构建 [MSG] 数据块
            var packet =
                "\n[MSG]\n" +
                "id=" +
                msgId +
                "\n" +
                "time=" +
                nowStr +
                "\n" +
                "from=user\n" +
                "to=" +
                String(toId) +
                "\n" +
                "type=emoji\n" +
                "content=" +
                safeContent +
                "\n" +
                "[/MSG]";

            msgObj.timestamp = nowDate.getTime();
            msgObj.rawTime = nowStr;
            pendingMessages[msgId] = msgObj;
            refreshMessageList();

            try {
                if (
                    window.XiaoxinWeChatApp &&
                    window.XiaoxinWeChatApp.insertTextToTavernInput
                ) {
                    window.XiaoxinWeChatApp.insertTextToTavernInput(packet);
                } else {
                    var tavernInput = document.getElementById("send_textarea");
                    if (tavernInput) {
                        tavernInput.value += packet;
                        tavernInput.dispatchEvent(
                            new Event("input", { bubbles: true })
                        );
                    } else {
                        throw new Error("未找到酒馆输入框 #send_textarea");
                    }
                }
            } catch (err) {
                console.error(
                    "[小馨手机][微信聊天UI] 发送表情包到酒馆输入框失败:",
                    err
                );
                delete pendingMessages[msgId];
                refreshMessageList();
            }
        }

        // 发送语音消息（构造 [MSG] 数据块 + 预览）
        function sendVoiceMessage(text, durationSec) {
            var msgId = generateMsgId();

            // ===== 以下时间与world time逻辑与文本消息保持一致 =====
            var lastWorldTimestamp = 0;
            if (window.XiaoxinWorldClock) {
                lastWorldTimestamp =
                    window.XiaoxinWorldClock.currentTimestamp ||
                    window.XiaoxinWorldClock.timestamp ||
                    0;
            }

            if (lastWorldTimestamp <= 0) {
                try {
                    var history = window.XiaoxinWeChatDataHandler
                        ? window.XiaoxinWeChatDataHandler.getChatHistory(
                              chatUserId
                          )
                        : [];
                    if (history && history.length > 0) {
                        var lastMsg = history[history.length - 1];
                        if (lastMsg.rawTime) {
                            var timeStr = String(lastMsg.rawTime);
                            var normalizedTimeStr = timeStr
                                .replace(/-/g, "/")
                                .replace(/年|月|日|星期[一二三四五六日]/g, " ");
                            var parsed = Date.parse(normalizedTimeStr);
                            if (!isNaN(parsed)) {
                                lastWorldTimestamp = parsed;
                            }
                        } else if (lastMsg.timestamp) {
                            lastWorldTimestamp = lastMsg.timestamp;
                        }
                    }
                } catch (e) {
                    console.warn(
                        "[小馨手机][微信聊天UI] 获取世界观时间失败(voice):",
                        e
                    );
                }
            }

            if (lastWorldTimestamp <= 0) {
                lastWorldTimestamp = Date.now();
            }

            var chatMessages = [];
            try {
                if (
                    window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler.getChatMessages ===
                        "function"
                ) {
                    chatMessages =
                        window.XiaoxinWeChatDataHandler.getChatMessages(
                            chatUserId
                        ) || [];
                }
            } catch (e) {
                console.warn(
                    "[小馨手机][微信聊天UI] 获取聊天消息失败(voice):",
                    e
                );
            }

            var lastMessageTimestamp = lastWorldTimestamp;
            if (chatMessages && chatMessages.length > 0) {
                var sortedMessages = chatMessages
                    .filter(function (m) {
                        return m.timestamp && m.timestamp > 0;
                    })
                    .sort(function (a, b) {
                        return b.timestamp - a.timestamp;
                    });
                if (sortedMessages.length > 0) {
                    lastMessageTimestamp = sortedMessages[0].timestamp;
                }
            }

            var baseTimestamp = lastWorldTimestamp;
            if (lastMessageTimestamp > lastWorldTimestamp) {
                baseTimestamp = lastMessageTimestamp;
            }

            var nowDate = new Date(baseTimestamp + 60000);
            var nowStr = "";
            if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.rawTime) {
                var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                var normalizedTimeStr = rawTimeStr
                    .replace(/-/g, "/")
                    .replace(/年|月|日|星期[一二三四五六日]/g, " ");
                var baseTime = Date.parse(normalizedTimeStr);
                if (!isNaN(baseTime)) {
                    var newTime = new Date(baseTime + 60000);
                    nowStr = formatTime(newTime);
                } else {
                    nowStr = formatTime(nowDate);
                }
            } else {
                nowStr = formatTime(nowDate);
            }

            // 使用角色ID和玩家ID
            // 获取玩家微信id（优先使用账号的 wechatId，其次 id）
            var account = window.XiaoxinWeChatAccount
                ? window.XiaoxinWeChatAccount.getCurrentAccount()
                : null;
            var fromId = account
                ? String(account.wechatId || account.id || "0").trim()
                : "0";
            // 角色ID使用联系方式数据块中的 id
            var toId =
                contact && contact.id ? String(contact.id) : String(chatUserId);

            var msgObj = {
                id: msgId,
                time: nowStr,
                from: String(fromId),
                to: String(toId),
                type: "voice",
                duration_sec: durationSec,
                duration: durationSec,
                content: text,
                payload: { duration_sec: durationSec, content: text },
            };

            var packet =
                "\n[MSG]\n" +
                "id=" +
                msgId +
                "\n" +
                "time=" +
                nowStr +
                "\n" +
                "from=user\n" +
                "to=" +
                String(toId) +
                "\n" +
                "type=voice\n" +
                "duration_sec=" +
                durationSec +
                "\n" +
                "content=" +
                text +
                "\n" +
                "[/MSG]";

            msgObj.timestamp = nowDate.getTime();
            msgObj.rawTime = nowStr;
            pendingMessages[msgId] = msgObj;
            refreshMessageList();

            try {
                if (
                    window.XiaoxinWeChatApp &&
                    window.XiaoxinWeChatApp.insertTextToTavernInput
                ) {
                    window.XiaoxinWeChatApp.insertTextToTavernInput(packet);
                } else {
                    var tavernInput = document.getElementById("send_textarea");
                    if (tavernInput) {
                        tavernInput.value += packet;
                        tavernInput.dispatchEvent(
                            new Event("input", { bubbles: true })
                        );
                    } else {
                        throw new Error("未找到酒馆输入框 #send_textarea");
                    }
                }
            } catch (err) {
                console.error(
                    "[小馨手机][微信聊天UI] 发送语音到酒馆输入框失败:",
                    err
                );
                delete pendingMessages[msgId];
                refreshMessageList();
            }
        }

        // ========== 消息状态管理 ==========
        // 使用模块级变量，按 userId 存储每个聊天的 pendingMessages
        // 页面初始化时，清除已确认消息的预览，避免重复显示
        if (!chatPendingMessages[chatUserId]) {
            chatPendingMessages[chatUserId] = {};
        }
        var pendingMessages = chatPendingMessages[chatUserId]; // key: msgId, value: msgObj

        // 清除已确认消息的预览（避免页面刷新后显示重复的预览消息）
        if (window.XiaoxinWeChatDataHandler) {
            try {
                var allChats = window.XiaoxinWeChatDataHandler.getAllChats();
                var confirmedMessages = allChats[chatUserId] || [];
                var confirmedMsgIds = new Set();
                confirmedMessages.forEach(function (msg) {
                    if (msg.id) {
                        confirmedMsgIds.add(msg.id);
                    }
                });
                // 移除已确认消息的预览
                Object.keys(pendingMessages).forEach(function (msgId) {
                    if (confirmedMsgIds.has(msgId)) {
                        console.info(
                            "[小馨手机][微信聊天UI] 清除已确认消息的预览:",
                            msgId
                        );
                        delete pendingMessages[msgId];
                    }
                });
            } catch (e) {
                console.warn(
                    "[小馨手机][微信聊天UI] 清除已确认消息预览时出错:",
                    e
                );
            }
        }

        // 暴露当前聊天的上下文给 photo-message.js 使用
        if (typeof window.XiaoxinWeChatChatUI === "undefined") {
            window.XiaoxinWeChatChatUI = {};
        }
        window.XiaoxinWeChatChatUI.chatUserId = chatUserId;
        window.XiaoxinWeChatChatUI.contact = contact;
        window.XiaoxinWeChatChatUI.pendingMessages = pendingMessages;
        window.XiaoxinWeChatChatUI.refreshMessageList = refreshMessageList;
        window.XiaoxinWeChatChatUI.generateMsgId = generateMsgId;
        window.XiaoxinWeChatChatUI.formatTime = formatTime;
        window.XiaoxinWeChatChatUI.isMenuExpanded = isMenuExpanded;
        window.XiaoxinWeChatChatUI.toggleMenu = toggleMenu;

        // 重新渲染整个消息列表（包括已有的和预览的）
        function refreshMessageList() {
            $messagesList.empty();

            // 1. 获取已确认的消息
            // 统一使用联系人的 id 作为聊天对象的ID
            var chatUserId = contact && contact.id ? contact.id : userId;
            var confirmedMessages = [];
            if (window.XiaoxinWeChatDataHandler) {
                var allChats = window.XiaoxinWeChatDataHandler.getAllChats();

                // 优先使用联系人的 id
                confirmedMessages = allChats[chatUserId] || [];

                // 如果没找到，尝试其他可能的ID格式（兼容旧数据）
                if (confirmedMessages.length === 0) {
                    var possibleIds = [userId];
                    if (
                        contact &&
                        contact.wechatId &&
                        contact.wechatId !== userId &&
                        contact.wechatId !== chatUserId
                    ) {
                        possibleIds.push(contact.wechatId);
                    }
                    if (userId && userId.indexOf("contact_") === -1) {
                        possibleIds.push("contact_" + userId);
                    }

                    for (var i = 0; i < possibleIds.length; i++) {
                        var testId = possibleIds[i];
                        if (allChats[testId] && allChats[testId].length > 0) {
                            confirmedMessages = allChats[testId];
                            console.info(
                                "[小馨手机][微信聊天UI] 使用兼容ID获取消息:",
                                testId,
                                "消息数量:",
                                confirmedMessages.length
                            );
                            // 将消息迁移到正确的ID（统一使用联系人的id）
                            if (
                                chatUserId !== testId &&
                                confirmedMessages.length > 0
                            ) {
                                allChats[chatUserId] = confirmedMessages;
                                delete allChats[testId];
                                window.XiaoxinWeChatDataHandler._setData(
                                    window.XiaoxinWeChatDataHandler.DATA_KEYS
                                        .CHATS,
                                    allChats
                                );
                                console.info(
                                    "[小馨手机][微信聊天UI] 已将消息从",
                                    testId,
                                    "迁移到",
                                    chatUserId
                                );
                            }
                            break;
                        }
                    }
                }

                console.info(
                    "[小馨手机][微信聊天UI] 获取到消息数量:",
                    confirmedMessages.length,
                    "使用ID:",
                    chatUserId
                );
            }

            // 2. 标记历史消息（包括红包消息），确保历史消息被正确识别
            // 获取当前世界观时间
            var currentWorldTime = Date.now();
            if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.currentTimestamp) {
                currentWorldTime = window.XiaoxinWorldClock.currentTimestamp;
            }
            var tenMinutes = 10 * 60 * 1000; // 10分钟的毫秒数

            confirmedMessages.forEach(function (message) {
                // 如果消息已经有 isHistorical 标记，跳过
                if (message.isHistorical === true ||
                    message.isHistorical === "true" ||
                    String(message.isHistorical).toLowerCase() === "true") {
                    return;
                }

                // 根据时间戳判断是否为历史消息
                if (message.timestamp) {
                    var messageTime = message.timestamp;
                    var timeDiff = currentWorldTime - messageTime;

                    if (timeDiff > tenMinutes) {
                        // 自动标记为历史消息
                        message.isHistorical = true;
                    }
                }
            });

            // 3. 移除已确认的预览消息，避免重复显示
            Object.keys(pendingMessages).forEach(function (pid) {
                if (
                    confirmedMessages.some(function (m) {
                        return m.id === pid;
                    })
                ) {
                    delete pendingMessages[pid];
                }
            });

            // 4. 合并预览消息（去重处理）
            var allDisplayMessages = [...confirmedMessages];
            var messageIdSet = new Set(); // 用于去重（基于消息ID）
            var redpacketIdSet = new Set(); // 用于红包去重（基于redpacket_id）
            var redpacketFingerprintSet = new Set(); // 用于红包去重（当redpacket_id为空时，基于amount+note+timestamp）

            confirmedMessages.forEach(function (m) {
                if (m.id) {
                    messageIdSet.add(m.id);
                }
                // 红包消息特殊去重：基于redpacket_id或指纹
                if (m.type === "redpacket") {
                    if (m.redpacket_id && m.redpacket_id.trim() !== "") {
                        // 如果有redpacket_id，使用它去重
                        redpacketIdSet.add(m.redpacket_id);
                    } else {
                        // 如果redpacket_id为空，使用指纹去重（amount+note+timestamp）
                        var fingerprint = String(m.amount || 0) + "|" +
                                         String(m.note || "") + "|" +
                                         String(m.timestamp || 0);
                        redpacketFingerprintSet.add(fingerprint);
                    }
                }
            });

            // 调试：记录已确认消息中的红包消息
            var confirmedRedpackets = confirmedMessages.filter(function (m) {
                return m.type === "redpacket";
            });
            if (confirmedRedpackets.length > 0) {
                console.info(
                    "[小馨手机][微信聊天UI] 已确认消息中的红包:",
                    confirmedRedpackets.map(function (m) {
                        return {
                            id: m.id,
                            type: m.type, // 添加 type 字段
                            redpacket_id: m.redpacket_id, // 添加 redpacket_id 字段
                            amount: m.amount, // 添加 amount 字段
                            note: m.note, // 添加 note 字段
                            timestamp: m.timestamp,
                            rawTime: m.rawTime,
                            claimed: m.claimed,
                            isHistorical: m.isHistorical,
                            isOutgoing: m.isOutgoing, // 添加 isOutgoing 字段
                            content: m.content ? (m.content.length > 50 ? m.content.substring(0, 50) + "..." : m.content) : "(空)" // 添加 content 字段用于调试
                        };
                    })
                );
            }

            // 调试：检查已确认消息中的红包消息是否包含所有必要字段
            confirmedMessages.forEach(function (message) {
                if (message.type === "redpacket") {
                    console.info(
                        "[小馨手机][微信聊天UI] 检查已确认红包消息字段:",
                        "消息ID:",
                        message.id,
                        "type:",
                        message.type,
                        "redpacket_id:",
                        message.redpacket_id,
                        "amount:",
                        message.amount,
                        "note:",
                        message.note,
                        "content:",
                        message.content ? (message.content.length > 50 ? message.content.substring(0, 50) + "..." : message.content) : "(空)",
                        "isOutgoing:",
                        message.isOutgoing,
                        "完整消息对象:",
                        JSON.stringify({
                            id: message.id,
                            type: message.type,
                            redpacket_id: message.redpacket_id,
                            amount: message.amount,
                            note: message.note,
                            content: message.content,
                            isOutgoing: message.isOutgoing,
                            timestamp: message.timestamp,
                            rawTime: message.rawTime
                        })
                    );
                }
            });

            Object.values(pendingMessages).forEach(function (msgObj) {
                // 避免重复添加：检查消息ID是否已存在
                if (msgObj.id && messageIdSet.has(msgObj.id)) {
                    // 如果消息已存在，跳过预览消息
                    if (msgObj.type === "redpacket") {
                        console.warn(
                            "[小馨手机][微信聊天UI] 红包消息已存在于已确认消息中，跳过预览消息:",
                            "消息ID:",
                            msgObj.id,
                            "已确认消息时间戳:",
                            confirmedMessages.find(function (m) { return m.id === msgObj.id; })?.timestamp,
                            "预览消息时间戳:",
                            msgObj.timestamp
                        );
                    }
                    return; // 跳过，不添加
                }

                // 额外检查：通过消息ID查找已存在的消息
                var existingMessage = confirmedMessages.find(function (m) {
                    return m.id === msgObj.id;
                });

                if (existingMessage) {
                    // 如果消息已存在，检查时间戳是否一致
                    if (msgObj.type === "redpacket") {
                        console.warn(
                            "[小馨手机][微信聊天UI] 红包消息已存在于已确认消息中，跳过预览消息:",
                            "消息ID:",
                            msgObj.id,
                            "已确认消息时间戳:",
                            existingMessage.timestamp,
                            "已确认消息原始时间:",
                            existingMessage.rawTime,
                            "预览消息时间戳:",
                            msgObj.timestamp,
                            "预览消息原始时间:",
                            msgObj.rawTime
                        );
                    }
                    return; // 跳过，不添加
                }

                // 红包消息特殊去重检查：基于redpacket_id或指纹
                if (msgObj.type === "redpacket") {
                    var isDuplicate = false;
                    var duplicateReason = "";

                    // 检查1：基于redpacket_id去重
                    if (msgObj.redpacket_id && msgObj.redpacket_id.trim() !== "") {
                        if (redpacketIdSet.has(msgObj.redpacket_id)) {
                            isDuplicate = true;
                            duplicateReason = "redpacket_id已存在: " + msgObj.redpacket_id;
                        }
                    } else {
                        // 检查2：基于指纹去重（amount+note+timestamp）
                        // 注意：需要从rawTime解析timestamp，因为预览消息的timestamp可能是临时生成的
                        var previewTimestamp = msgObj.timestamp;
                        if (msgObj.rawTime) {
                            var timeStr = String(msgObj.rawTime).trim();
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
                                previewTimestamp = parsed;
                            }
                        }

                        var fingerprint = String(msgObj.amount || 0) + "|" +
                                         String(msgObj.note || "") + "|" +
                                         String(previewTimestamp || 0);

                        if (redpacketFingerprintSet.has(fingerprint)) {
                            isDuplicate = true;
                            duplicateReason = "红包指纹已存在: " + fingerprint;
                        }
                    }

                    if (isDuplicate) {
                        console.warn(
                            "[小馨手机][微信聊天UI] 红包消息重复，跳过预览消息:",
                            duplicateReason,
                            "消息ID:",
                            msgObj.id,
                            "redpacket_id:",
                            msgObj.redpacket_id || "(空)",
                            "amount:",
                            msgObj.amount,
                            "note:",
                            msgObj.note,
                            "timestamp:",
                            msgObj.timestamp
                        );
                        return; // 跳过，不添加
                    }
                }

                if (!existingMessage) {
                    // 检查消息内容是否包含 [MSG] 标签
                    var msgContent =
                        msgObj.payload && msgObj.payload.content
                            ? msgObj.payload.content
                            : msgObj.content || "";

                    // 如果是红包消息，直接处理，不检查 [MSG] 标签
                    if (msgObj.type === "redpacket") {
                        // 红包消息直接处理，跳过 [MSG] 标签检查
                    } else if (hasMsgTag(msgContent)) {
                        // 如果包含 [MSG] 标签，检查是否是语音通话文本消息
                        // 检查是否是语音通话文本消息（call_voice_text类型），如果是则跳过（自动隐藏）
                        if (
                            msgContent.indexOf("type=call_voice_text") !== -1 ||
                            msgContent.indexOf("type=call_voice_text\n") !== -1
                        ) {
                            return; // 语音通话文本消息自动隐藏，不显示在聊天记录中
                        }
                        // 其他 [MSG] 标签的消息也跳过（由系统处理）
                        return;
                    }

                    // 确保预览消息使用正确的时间
                    // 优先从 rawTime 解析，因为 rawTime 是世界观时间字符串
                    var previewRawTime = msgObj.rawTime || msgObj.time;
                    var previewTimestamp = null;

                    // 1. 优先从 rawTime 解析时间戳（这是最可靠的世界观时间）
                    if (previewRawTime) {
                        var timeStr = String(previewRawTime).trim();
                        console.info(
                            "[小馨手机][微信聊天UI] 预览消息rawTime:",
                            timeStr
                        );

                        // 支持多种时间格式
                        // 格式1: 2018年06月20日 07:55:01
                        // 格式2: 2026-01-08 12:02:34
                        // 格式3: 2018年6月20日 星期三 08:32
                        var normalizedTimeStr = timeStr
                            .replace(/-/g, "/")
                            .replace(/年/g, "/")
                            .replace(/月/g, "/")
                            .replace(/日/g, " ")
                            .replace(/星期[一二三四五六日]/g, "")
                            .trim()
                            .replace(/\s+/g, " "); // 将多个空格替换为单个空格

                        console.info(
                            "[小馨手机][微信聊天UI] 规范化后的时间字符串:",
                            normalizedTimeStr,
                            "原始时间:",
                            timeStr
                        );

                        var parsed = Date.parse(normalizedTimeStr);
                        if (!isNaN(parsed)) {
                            previewTimestamp = parsed;
                            console.info(
                                "[小馨手机][微信聊天UI] 从预览消息的rawTime解析时间戳成功:",
                                timeStr,
                                "->",
                                previewTimestamp,
                                "日期:",
                                new Date(previewTimestamp).toLocaleString(
                                    "zh-CN"
                                )
                            );
                        } else {
                            console.warn(
                                "[小馨手机][微信聊天UI] 无法解析预览消息的rawTime:",
                                timeStr,
                                "规范化后:",
                                normalizedTimeStr
                            );
                        }
                    }

                    // 2. 如果 rawTime 无法解析，检查 timestamp 是否合理
                    if (!previewTimestamp) {
                        // 检查 msgObj.timestamp 是否是世界观时间（不是现实时间）
                        // 如果 timestamp 是最近几秒内的时间戳，可能是现实时间，需要重新获取
                        var currentRealTime = Date.now();
                        var timestampAge =
                            currentRealTime - (msgObj.timestamp || 0);

                        // 如果 timestamp 存在且不是最近的时间（超过1分钟），可能是有效的世界观时间
                        if (
                            msgObj.timestamp &&
                            msgObj.timestamp > 0 &&
                            timestampAge > 60000
                        ) {
                            previewTimestamp = msgObj.timestamp;
                            console.info(
                                "[小馨手机][微信聊天UI] 使用预览消息的timestamp（可能是世界观时间）:",
                                previewTimestamp
                            );
                        } else {
                            // timestamp 不存在或是现实时间，使用世界观时间
                            if (
                                window.XiaoxinWorldClock &&
                                window.XiaoxinWorldClock.currentTimestamp
                            ) {
                                previewTimestamp =
                                    window.XiaoxinWorldClock.currentTimestamp;
                                console.info(
                                    "[小馨手机][微信聊天UI] 预览消息使用世界观时间:",
                                    previewTimestamp,
                                    "原始时间:",
                                    window.XiaoxinWorldClock.rawTime ||
                                        window.XiaoxinWorldClock.raw
                                );
                            } else {
                                // 最后才使用现实时间（不推荐）
                                previewTimestamp = Date.now();
                                console.warn(
                                    "[小馨手机][微信聊天UI] 预览消息无法获取世界观时间，使用现实时间（不推荐）"
                                );
                            }
                        }
                    }

                    // 构建待发送消息对象，确保包含所有必要的字段
                    // 对于 photo 类型消息，优先使用 image 字段作为 content
                    var initialContent = msgContent;
                    // 对于 photo 类型，优先从 msgObj.image 获取（因为 pendingMessages 中的消息对象直接包含 image 字段）
                    if (msgObj.type === "photo") {
                        // 照片消息：优先使用 image 字段（可能包含 local: 引用或URL）
                        if (msgObj.image !== undefined && msgObj.image !== null) {
                            initialContent = msgObj.image;
                        } else if (msgObj.content && msgObj.content.trim()) {
                            // 如果没有 image 字段，使用 content
                            initialContent = msgObj.content;
                        }
                    }

                    var pendingMessage = {
                        id: msgObj.id,
                        type: msgObj.type,
                        content: initialContent,
                        timestamp: previewTimestamp,
                        rawTime: previewRawTime,
                        sender: playerNickname,
                        isOutgoing: true,
                        isPending: true, // 标记为预览状态
                    };

                    // 如果是语音消息，需要保留时长信息
                    if (msgObj.type === "voice") {
                        // 保留 duration_sec、duration 和 payload 字段，确保 renderMessage 能正确读取时长
                        if (msgObj.duration_sec !== undefined) {
                            pendingMessage.duration_sec = msgObj.duration_sec;
                        }
                        if (msgObj.duration !== undefined) {
                            pendingMessage.duration = msgObj.duration;
                        }
                        if (msgObj.payload) {
                            pendingMessage.payload = msgObj.payload;
                        }
                    }

                    // 如果是照片消息，需要保留image和desc字段
                    if (msgObj.type === "photo") {
                        console.info(
                            "[小馨手机][微信聊天UI] 处理预览照片消息:",
                            "msgObj.id:",
                            msgObj.id,
                            "msgObj.image:",
                            msgObj.image,
                            "msgObj.image类型:",
                            typeof msgObj.image,
                            "msgObj.payload:",
                            msgObj.payload,
                            "msgObj.payload?.image:",
                            msgObj.payload && msgObj.payload.image,
                            "msgObj.content:",
                            msgObj.content,
                            "msgObj.content类型:",
                            typeof msgObj.content
                        );
                        // 优先使用 image 字段（可能包含 local: 引用或URL）
                        // 检查顺序：1. msgObj.image 2. msgObj.payload.image 3. msgObj.content
                        var imageValue =
                            (msgObj.image !== undefined && msgObj.image !== null && String(msgObj.image).trim() !== "")
                                ? String(msgObj.image).trim()
                                : (msgObj.payload && msgObj.payload.image && String(msgObj.payload.image).trim() !== "")
                                    ? String(msgObj.payload.image).trim()
                                    : null;

                        if (imageValue) {
                            pendingMessage.image = imageValue;
                            // 如果 image 存在，也将其作为 content（确保渲染时能获取到）
                            pendingMessage.content = imageValue;
                            console.info(
                                "[小馨手机][微信聊天UI] 预览照片消息使用 image 字段:",
                                imageValue.substring(0, 50) + "..."
                            );
                        } else if (msgObj.content && String(msgObj.content).trim() !== "") {
                            // 如果没有 image 字段，使用 content（可能包含 local: 引用或URL）
                            var contentValue = String(msgObj.content).trim();
                            pendingMessage.image = contentValue;
                            pendingMessage.content = contentValue;
                            console.info(
                                "[小馨手机][微信聊天UI] 预览照片消息使用 content 字段:",
                                contentValue.substring(0, 50) + "..."
                            );
                        } else {
                            console.warn(
                                "[小馨手机][微信聊天UI] 预览照片消息没有有效的 image 和 content 字段",
                                "msgObj:",
                                JSON.stringify(msgObj)
                            );
                        }
                        // 保留描述字段
                        if (msgObj.desc !== undefined) {
                            pendingMessage.desc = msgObj.desc;
                        } else if (msgObj.payload && msgObj.payload.desc !== undefined) {
                            pendingMessage.desc = msgObj.payload.desc;
                        }
                        console.info(
                            "[小馨手机][微信聊天UI] 最终 pendingMessage:",
                            "image:",
                            pendingMessage.image,
                            "content:",
                            pendingMessage.content
                        );
                    }

                    // 如果是红包消息，需要保留金额、备注信息和redpacket_id
                    if (msgObj.type === "redpacket") {
                        if (msgObj.amount !== undefined) {
                            pendingMessage.amount = msgObj.amount;
                        }
                        if (msgObj.note !== undefined) {
                            pendingMessage.note = msgObj.note;
                        }
                        if (msgObj.greeting !== undefined) {
                            pendingMessage.greeting = msgObj.greeting;
                        }
                        if (msgObj.sticker !== undefined) {
                            pendingMessage.sticker = msgObj.sticker;
                        }
                        if (msgObj.redpacket_id !== undefined) {
                            pendingMessage.redpacket_id = msgObj.redpacket_id;
                        }
                    }

                    // 调试：记录添加的预览红包消息
                    if (pendingMessage.type === "redpacket") {
                        console.info(
                            "[小馨手机][微信聊天UI] 添加预览红包消息:",
                            "消息ID:",
                            pendingMessage.id,
                            "时间戳:",
                            pendingMessage.timestamp,
                            "原始时间:",
                            pendingMessage.rawTime
                        );
                    }

                    allDisplayMessages.push(pendingMessage);
                }
            });

            // 调试：记录最终合并后的红包消息
            var finalRedpackets = allDisplayMessages.filter(function (m) {
                return m.type === "redpacket";
            });
            if (finalRedpackets.length > 0) {
                console.info(
                    "[小馨手机][微信聊天UI] 最终合并后的红包消息:",
                    finalRedpackets.map(function (m) {
                        return {
                            id: m.id,
                            type: m.type, // 添加 type 字段
                            redpacket_id: m.redpacket_id, // 添加 redpacket_id 字段
                            amount: m.amount, // 添加 amount 字段
                            note: m.note, // 添加 note 字段
                            timestamp: m.timestamp,
                            rawTime: m.rawTime,
                            claimed: m.claimed,
                            isPending: m.isPending,
                            isOutgoing: m.isOutgoing, // 添加 isOutgoing 字段
                        };
                    })
                );
            }

            // 3. 过滤未显示的角色消息（只显示已通过消息队列显示的角色消息）
            // 获取已显示的消息ID集合
            var displayedMessageIds = new Set();
            var hasDisplayedMessages = false; // 是否有已显示的消息记录
            if (
                window.XiaoxinMessageQueue &&
                window.XiaoxinMessageQueue.getDisplayedMessageIds
            ) {
                displayedMessageIds =
                    window.XiaoxinMessageQueue.getDisplayedMessageIds(
                        chatUserId
                    );
                hasDisplayedMessages = displayedMessageIds.size > 0;
            }

            // 获取当前时间（用于判断是否为历史消息）
            var currentTime = Date.now();
            // 如果使用世界观时间，优先使用世界观时间
            if (
                window.XiaoxinWorldClock &&
                window.XiaoxinWorldClock.currentTimestamp
            ) {
                currentTime = window.XiaoxinWorldClock.currentTimestamp;
            }

            // 过滤消息：玩家发送的消息直接显示，角色发送的消息需要已显示
            var filteredMessages = allDisplayMessages.filter(function (
                message
            ) {
                // 调试：检查红包消息的 type 字段
                if (message.type === "redpacket" || (message.content && typeof message.content === "string" && message.content.indexOf("type=redpacket") !== -1)) {
                    console.info(
                        "[小馨手机][微信聊天UI] 过滤前的红包消息:",
                        "消息ID:",
                        message.id,
                        "type:",
                        message.type,
                        "redpacket_id:",
                        message.redpacket_id,
                        "amount:",
                        message.amount,
                        "note:",
                        message.note,
                        "isOutgoing:",
                        message.isOutgoing,
                        "content包含type=redpacket:",
                        message.content && typeof message.content === "string" && message.content.indexOf("type=redpacket") !== -1
                    );
                    // ⚠️ 重要：如果 type 字段丢失但 content 包含 type=redpacket，尝试修复
                    if (!message.type && message.content && typeof message.content === "string" && message.content.indexOf("type=redpacket") !== -1) {
                        console.warn(
                            "[小馨手机][微信聊天UI] 检测到红包消息的 type 字段丢失，尝试修复:",
                            message.id
                        );
                        message.type = "redpacket";
                    }
                }

                // ⚠️ 重要：首先过滤掉振铃中的通话消息（无论是否历史消息）
                var msgType = message.type || "text";
                var msgStatus = message.status || message.call_status || "";
                if (msgType === "call_voice" || msgType === "call_video") {
                    // 如果是通话消息，检查状态
                    // 允许的状态：ended, completed, finished, answered, missed 等
                    // 禁止的状态：ringing, calling, dialing 等未完成的状态
                    if (msgStatus === "ringing" || msgStatus === "calling" || msgStatus === "dialing" || msgStatus === "waiting") {
                        console.info("[小馨手机][微信聊天UI] 过滤掉振铃中的通话消息，状态:", msgStatus, "消息ID:", message.id);
                        return false; // 过滤掉这条消息
                    }
                }

                // 玩家发送的消息直接显示
                if (message.isOutgoing === true) {
                    // 调试：检查玩家发送的红包消息
                    if (message.type === "redpacket") {
                        console.info(
                            "[小馨手机][微信聊天UI] 玩家发送的红包消息，直接显示:",
                            "消息ID:",
                            message.id,
                            "type:",
                            message.type,
                            "redpacket_id:",
                            message.redpacket_id
                        );
                    }
                    return true;
                }

                // 角色发送的消息需要检查是否已显示
                if (message.isOutgoing === false) {
                    // ⚠️ 重要：红包消息应该和文本消息一样，直接显示，不需要进入队列
                    if (message.type === "redpacket") {
                        console.info(
                            "[小馨手机][微信聊天UI] 红包消息直接显示，跳过队列检查:",
                            chatUserId,
                            "消息ID:",
                            message.id,
                            "redpacket_id:",
                            message.redpacket_id
                        );
                        return true; // 红包消息直接显示
                    }

                    // ⚠️ 重要：优先检查是否是历史消息，历史消息直接显示，不进入队列
                    // 1. 优先检查 isHistorical 标记
                    // 2. 如果标记不存在，根据时间戳判断：消息时间早于当前世界观时间10分钟，视为历史消息
                    var isHistorical = false;

                    // 检查 isHistorical 标记
                    if (message.isHistorical === true ||
                        message.isHistorical === "true" ||
                        String(message.isHistorical).toLowerCase() === "true") {
                        isHistorical = true;
                    } else if (message.timestamp) {
                        // 根据时间戳判断：如果消息时间早于当前世界观时间10分钟，视为历史消息
                        var currentWorldTime = null;
                        if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.currentTimestamp) {
                            currentWorldTime = window.XiaoxinWorldClock.currentTimestamp;
                        } else {
                            // 如果没有世界观时间，使用现实时间
                            currentWorldTime = Date.now();
                        }

                        var messageTime = message.timestamp;
                        var timeDiff = currentWorldTime - messageTime;
                        var tenMinutes = 10 * 60 * 1000; // 10分钟的毫秒数

                        if (timeDiff > tenMinutes) {
                            isHistorical = true;
                            // 自动标记为历史消息
                            message.isHistorical = true;
                            console.info(
                                "[小馨手机][微信聊天UI] 根据时间戳判断为历史消息（早于当前时间" + Math.round(timeDiff / 60000) + "分钟），直接显示:",
                                chatUserId,
                                "消息ID:",
                                message.id,
                                "消息类型:",
                                message.type || "text",
                                "消息时间:",
                                new Date(messageTime).toLocaleString("zh-CN"),
                                "当前世界观时间:",
                                new Date(currentWorldTime).toLocaleString("zh-CN")
                            );
                        }
                    }

                    if (isHistorical) {
                        // 历史消息直接显示，不检查队列状态
                        console.info(
                            "[小馨手机][微信聊天UI] 检测到历史消息，直接显示（跳过队列检查）:",
                            chatUserId,
                            "消息ID:",
                            message.id,
                            "消息类型:",
                            message.type || "text"
                        );
                        return true;
                    }

                    // 检查消息队列管理器是否存在
                    if (
                        window.XiaoxinMessageQueue &&
                        window.XiaoxinMessageQueue.isMessageDisplayed &&
                        window.XiaoxinMessageQueue.isMessageInQueue
                    ) {
                        var isDisplayed =
                            window.XiaoxinMessageQueue.isMessageDisplayed(
                                chatUserId,
                                message.id
                            );

                        if (isDisplayed) {
                            // 消息已通过队列显示，直接显示
                            return true;
                        } else {
                            // 消息未显示，检查是否在队列中
                            var isInQueue =
                                window.XiaoxinMessageQueue.isMessageInQueue(
                                    chatUserId,
                                    message.id
                                );

                            if (isInQueue) {
                                // 消息在队列中，等待队列管理器显示
                                console.info(
                                    "[小馨手机][微信聊天UI] 消息在队列中，等待显示:",
                                    chatUserId,
                                    "消息ID:",
                                    message.id
                                );
                                return false;
                            } else {
                                // 消息不在队列中，说明是历史消息（刷新页面后的历史消息）
                                // 或者消息已经被处理过但未标记为已显示（异常情况）
                                // 这种情况下，直接显示消息
                                return true;
                            }
                        }
                    } else {
                        // 如果消息队列管理器不存在，直接显示（兼容旧逻辑）
                        console.warn(
                            "[小馨手机][微信聊天UI] 消息队列管理器不存在，直接显示消息（兼容旧逻辑）:",
                            chatUserId,
                            "消息ID:",
                            message.id
                        );
                        return true;
                    }
                }

                // 其他情况（系统消息等）直接显示
                return true;
            });

            // 4. 按时间排序（确保时间戳正确排序）
            filteredMessages.sort(function (a, b) {
                var timestampA = a.timestamp;
                var timestampB = b.timestamp;

                // 确保时间戳是数字类型
                if (typeof timestampA === "string") {
                    timestampA = new Date(timestampA).getTime() || 0;
                }
                if (typeof timestampB === "string") {
                    timestampB = new Date(timestampB).getTime() || 0;
                }

                // 如果时间戳无效，记录警告但不要使用现实时间（会导致排序错误）
                // 无效的时间戳应该被放在最前面或最后面，但不能使用当前时间
                if (isNaN(timestampA) || timestampA <= 0) {
                    console.error(
                        "[小馨手机][微信聊天UI] 消息时间戳无效:",
                        a.id,
                        a.timestamp,
                        "原始时间:",
                        a.rawTime,
                        "类型:",
                        a.type
                    );
                    // 使用0作为时间戳，这样无效的消息会被排在最前面（而不是最后）
                    timestampA = 0;
                }
                if (isNaN(timestampB) || timestampB <= 0) {
                    console.error(
                        "[小馨手机][微信聊天UI] 消息时间戳无效:",
                        b.id,
                        b.timestamp,
                        "原始时间:",
                        b.rawTime,
                        "类型:",
                        b.type
                    );
                    // 使用0作为时间戳，这样无效的消息会被排在最前面（而不是最后）
                    timestampB = 0;
                }

                // 按时间戳升序排序（从早到晚）
                var result = timestampA - timestampB;

                return result;
            });

            // 4.5. 对于通话消息（call_voice/call_video），只保留 ended、unanswered、rejected 状态的消息
            // ended 状态只显示一条：以历史消息（世界书）为准，避免通话页面计时器/推算时长覆盖
            var callEndedMessagesMap = {}; // call_id -> message
            var deduplicatedMessages = [];
            filteredMessages.forEach(function (message) {
                // 如果是通话消息，检查状态
                if (
                    message.type === "call_voice" ||
                    message.type === "call_video"
                ) {
                    var callState = message.callState || message.state || "";
                    // ⚠️ 只保留 ended、unanswered、rejected 三种状态的消息
                    if (
                        callState !== "ended" &&
                        callState !== "unanswered" &&
                        callState !== "rejected"
                    ) {
                        // 跳过非目标状态的通话消息
                        return; // 跳过这条消息
                    }

                    // 对于 ended 状态的消息，按 call_id 去重
                    if (callState === "ended") {
                        var callId =
                            message.call_id ||
                            message.callId ||
                            message.callWith ||
                            null;
                        if (callId) {
                            var existingMessage = callEndedMessagesMap[callId];
                            if (!existingMessage) {
                                // 第一次遇到这个 call_id，保存消息
                                callEndedMessagesMap[callId] = message;
                                deduplicatedMessages.push(message);
                            } else {
                                // 已存在相同 call_id 的 ended 消息：
                                // - 若新消息是历史消息而旧消息不是：替换旧消息
                                // - 其他情况：保留旧消息（不再按 duration 取最大，避免计时器覆盖）
                                var existingIsHistorical =
                                    existingMessage.isHistorical === true;
                                var newIsHistorical =
                                    message.isHistorical === true;

                                if (newIsHistorical && !existingIsHistorical) {
                                    var oldIndex = deduplicatedMessages.indexOf(
                                        existingMessage
                                    );
                                    if (oldIndex !== -1) {
                                        deduplicatedMessages.splice(oldIndex, 1);
                                    }
                                    callEndedMessagesMap[callId] = message;
                                    deduplicatedMessages.push(message);
                                }
                            }
                        } else {
                            // 没有 call_id，正常添加
                            deduplicatedMessages.push(message);
                        }
                    } else {
                        // unanswered 或 rejected 状态，正常添加
                        deduplicatedMessages.push(message);
                    }
                } else {
                    // 不是通话消息，正常添加
                    deduplicatedMessages.push(message);
                }
            });
            // 使用去重后的消息列表
            filteredMessages = deduplicatedMessages;

            // 5. 渲染列表（过滤掉包含 [MSG] 标签的消息）
            // ⚠️ 重要：红包消息不应该被过滤，即使 content 字段包含 [MSG] 标签
            var lastMessageTimestamp = null; // 记录上一条消息的时间戳
            filteredMessages.forEach(function (message, index) {
                // ⚠️ 重要：红包消息不应该被过滤，直接跳过 [MSG] 标签检查
                if (message.type === "redpacket") {
                    // 红包消息直接渲染，不检查 [MSG] 标签
                    console.info(
                        "[小馨手机][微信聊天UI] 检测到红包消息，跳过 [MSG] 标签检查:",
                        "消息ID:",
                        message.id,
                        "type:",
                        message.type,
                        "redpacket_id:",
                        message.redpacket_id
                    );
                    // 继续执行后续的渲染逻辑
                } else {
                    // 检查消息内容是否包含 [MSG] 标签，如果包含则完全隐藏
                    var messageContent = message.content || "";
                    // 检查消息内容、原始内容、或其他可能包含标签的字段
                    var shouldHide = false;

                    // 检查 content 字段
                    if (typeof messageContent === "string") {
                        if (
                            messageContent.indexOf("[MSG]") !== -1 ||
                            messageContent.indexOf("[/MSG]") !== -1 ||
                            (messageContent.indexOf("id=") !== -1 &&
                                messageContent.indexOf("type=") !== -1 &&
                                messageContent.indexOf("from=") !== -1)
                        ) {
                            shouldHide = true;
                        }
                    }

                    // 检查其他可能的字段
                    if (!shouldHide && message.raw) {
                        if (
                            typeof message.raw === "string" &&
                            (message.raw.indexOf("[MSG]") !== -1 ||
                                message.raw.indexOf("[/MSG]") !== -1)
                        ) {
                            shouldHide = true;
                        }
                    }

                    if (shouldHide) {
                        // 完全跳过这条消息，不渲染
                        return;
                    }
                }

                // 判断是否显示时间戳：
                // 1. 第一条消息始终显示时间
                // 2. 如果与上一条消息间隔超过5分钟（300000毫秒），显示时间
                // 3. 否则不显示时间
                var showTimestamp = false;
                var currentTimestamp = message.timestamp;

                // 尝试解析当前消息的时间戳
                if (!currentTimestamp && message.rawTime) {
                    var timeStr = String(message.rawTime).trim();
                    var parsed = Date.parse(
                        timeStr
                            .replace(/-/g, "/")
                            .replace(/年|月|日|星期[一二三四五六日]/g, " ")
                    );
                    if (!isNaN(parsed)) {
                        currentTimestamp = parsed;
                    }
                }

                if (currentTimestamp) {
                    if (index === 0 || lastMessageTimestamp === null) {
                        // 第一条消息始终显示时间
                        showTimestamp = true;
                    } else {
                        // 计算与上一条消息的时间间隔（毫秒）
                        var timeDiff = currentTimestamp - lastMessageTimestamp;
                        // 如果间隔超过5分钟（300000毫秒），显示时间
                        if (timeDiff >= 300000) {
                            showTimestamp = true;
                        }
                    }
                    lastMessageTimestamp = currentTimestamp;
                }

                // 检查是否是语音通话文本消息，如果是则跳过（不显示在聊天页面）
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
                            "[小馨手机][微信聊天UI] 跳过语音通话文本消息，不显示在聊天页面，消息ID:",
                            message.id
                        );
                        return; // 跳过这条消息，不显示在聊天页面
                    }
                }

                var $messageItem = renderMessage(
                    message,
                    playerNickname,
                    contact,
                    showTimestamp
                );
                if (message.isPending) {
                    $messageItem.addClass(
                        "xiaoxin-wechat-chat-message-pending"
                    );
                }
                $messagesList.append($messageItem);
            });

            // 滚动位置处理：
            // - 默认滚动到底部
            // - 若存在“待恢复”的滚动位置（例如从红包详情页返回），仅恢复一次并清除标记
            setTimeout(function () {
                try {
                    var scrollStore =
                        window.XiaoxinWeChatChatScrollStore ||
                        (window.XiaoxinWeChatChatScrollStore = {
                            positions: {},
                            pendingRestore: {},
                        });
                    var restoreTop =
                        scrollStore &&
                        scrollStore.pendingRestore &&
                        scrollStore.pendingRestore[chatUserId];
                    if (
                        typeof restoreTop === "number" &&
                        isFinite(restoreTop)
                    ) {
                        delete scrollStore.pendingRestore[chatUserId];
                        $messagesList.scrollTop(restoreTop);
                        return;
                    }
                } catch (e) {}
                $messagesList.scrollTop($messagesList[0].scrollHeight);
            }, 100);
        }

        // 监听来自 message-listener.js 的消息更新事件
        function handleChatUpdate(event) {
            // 检查是否是红包状态更新事件
            if (event.detail && event.detail.redpacket_claimed) {
                // 红包状态更新，直接刷新消息列表以显示已领取状态
                console.info(
                    "[小馨手机][微信聊天UI] 收到红包状态更新事件，刷新消息列表:",
                    event.detail.redpacket_id
                );
                refreshMessageList();
                return;
            }

            // 检查事件中的 userId 是否匹配当前聊天对象（支持多种ID格式）
            var eventUserId = event.detail && event.detail.userId;
            var isMatch = false;

            if (eventUserId) {
                // 直接匹配
                if (eventUserId === chatUserId || eventUserId === userId) {
                    isMatch = true;
                }
                // 匹配联系人的各种ID格式
                else if (contact) {
                    if (
                        eventUserId === contact.id ||
                        eventUserId === contact.wechatId ||
                        eventUserId === contact.characterId ||
                        eventUserId === "contact_" + contact.id ||
                        contact.id === "contact_" + eventUserId ||
                        eventUserId.replace(/^contact_/, "") ===
                            contact.id.replace(/^contact_/, "") ||
                        contact.id.replace(/^contact_/, "") ===
                            eventUserId.replace(/^contact_/, "")
                    ) {
                        isMatch = true;
                    }
                }
                // 如果仍然不匹配，尝试更宽松的匹配（去掉contact_前缀后比较）
                if (!isMatch && eventUserId) {
                    var normalizedEventId = String(eventUserId).replace(
                        /^contact_/,
                        ""
                    );
                    var normalizedChatId = String(chatUserId || "").replace(
                        /^contact_/,
                        ""
                    );
                    var normalizedUserId = String(userId || "").replace(
                        /^contact_/,
                        ""
                    );
                    if (
                        normalizedEventId === normalizedChatId ||
                        normalizedEventId === normalizedUserId ||
                        (contact &&
                            (normalizedEventId ===
                                String(contact.id || "").replace(
                                    /^contact_/,
                                    ""
                                ) ||
                                normalizedEventId ===
                                    String(contact.wechatId || "").replace(
                                        /^contact_/,
                                        ""
                                    ) ||
                                normalizedEventId ===
                                    String(contact.characterId || "").replace(
                                        /^contact_/,
                                        ""
                                    )))
                    ) {
                        isMatch = true;
                        console.info(
                            "[小馨手机][微信聊天UI] 通过宽松匹配找到匹配的联系人:",
                            eventUserId,
                            "->",
                            chatUserId
                        );
                    }
                }
            }

            if (event.detail && isMatch) {
                var eventMessages = event.detail.messages || [];

                // ⚠️ 重要：从数据库重新读取完整的消息对象，确保包含所有字段（特别是红包消息的特殊字段）
                // 因为事件中的消息对象可能只包含基本字段
                if (window.XiaoxinWeChatDataHandler && window.XiaoxinWeChatDataHandler.getChatMessages) {
                    var allChats = window.XiaoxinWeChatDataHandler.getAllChats();
                    var dbMessages = allChats[chatUserId] || [];

                    // 用数据库中的完整消息对象替换事件中的简化消息对象
                    var fullMessages = eventMessages.map(function(eventMsg) {
                        // 从数据库中找到对应的完整消息对象
                        var dbMsg = dbMessages.find(function(m) {
                            return m.id === eventMsg.id;
                        });

                        if (dbMsg) {
                            // 使用数据库中的完整消息对象
                            console.info(
                                "[小馨手机][微信聊天UI] 使用数据库中的完整消息对象:",
                                "消息ID:",
                                dbMsg.id,
                                "type:",
                                dbMsg.type,
                                "redpacket_id:",
                                dbMsg.redpacket_id,
                                "amount:",
                                dbMsg.amount,
                                "note:",
                                dbMsg.note
                            );
                            return dbMsg;
                        } else {
                            // 如果数据库中没有找到，使用事件中的消息对象
                            console.warn(
                                "[小馨手机][微信聊天UI] 数据库中没有找到消息，使用事件中的消息对象:",
                                "消息ID:",
                                eventMsg.id
                            );
                            return eventMsg;
                        }
                    });

                    eventMessages = fullMessages;
                }

                // 检查是否有角色发送的消息（需要等待队列显示）
                var hasCharacterMessages = eventMessages.some(function (msg) {
                    return msg.isOutgoing === false;
                });

                // 当收到新消息（角色回复或玩家自己发送的消息被确认）时，
                // 如果玩家正好停留在该角色的聊天页面，清除未读消息红点
                if (
                    window.XiaoxinWeChatComponents &&
                    window.XiaoxinWeChatComponents.isActiveChat &&
                    window.XiaoxinWeChatComponents.isActiveChat(chatUserId)
                ) {
                    clearUnreadBadgeIfActive();
                }

                // 从待发送列表中移除已确认的消息
                var confirmedIds = eventMessages.map(function (m) {
                    return m.id;
                });
                var hasChanged = false;
                confirmedIds.forEach(function (id) {
                    if (pendingMessages[id]) {
                        delete pendingMessages[id];
                        hasChanged = true;
                    }
                });

                // 如果有角色消息，不立即刷新（等待队列管理器显示）
                // 如果没有角色消息（只有玩家消息），立即刷新
                if (!hasCharacterMessages) {
                    // 只有玩家消息，立即刷新
                    console.info(
                        "[小馨手机][微信聊天UI] 只有玩家消息，立即刷新"
                    );
                    refreshMessageList();
                } else {
                    // 有角色消息，不刷新（等待 xiaoxin-message-displayed 事件触发刷新）
                    console.info(
                        "[小馨手机][微信聊天UI] 收到角色消息，等待队列管理器显示，不立即刷新。消息数量:",
                        eventMessages.length,
                        "消息ID:",
                        eventMessages.map(function (m) {
                            return m.id;
                        })
                    );
                }
            }
        }
        window.addEventListener("xiaoxin-chat-updated", handleChatUpdate);

        // ========== 监听消息队列事件 ==========
        // 监听"对方正在输入中..."事件
        function handleMessageTyping(event) {
            var eventContactId = event.detail && event.detail.contactId;
            if (!eventContactId) return;

            // 检查是否匹配当前聊天对象
            var isMatch = false;
            if (eventContactId === chatUserId || eventContactId === userId) {
                isMatch = true;
            } else if (contact) {
                if (
                    eventContactId === contact.id ||
                    eventContactId === contact.wechatId ||
                    eventContactId === "contact_" + contact.id ||
                    contact.id === "contact_" + eventContactId
                ) {
                    isMatch = true;
                }
            }

            if (isMatch) {
                // 更新导航栏标题为"对方正在输入中..."
                var originalTitle = $navTitle.text();
                $navTitle.text("对方正在输入中...");
                $navTitle.addClass("xiaoxin-wechat-chat-typing");

                console.info(
                    "[小馨手机][微信聊天UI] 显示'对方正在输入中...':",
                    chatUserId
                );
            }
        }
        window.addEventListener("xiaoxin-message-typing", handleMessageTyping);

        // 监听消息显示完成事件
        function handleMessageDisplayed(event) {
            var eventContactId = event.detail && event.detail.contactId;
            var message = event.detail && event.detail.message;
            if (!eventContactId || !message) return;

            // 检查是否匹配当前聊天对象
            var isMatch = false;
            if (eventContactId === chatUserId || eventContactId === userId) {
                isMatch = true;
            } else if (contact) {
                if (
                    eventContactId === contact.id ||
                    eventContactId === contact.wechatId ||
                    eventContactId === "contact_" + contact.id ||
                    contact.id === "contact_" + eventContactId
                ) {
                    isMatch = true;
                }
            }

            if (isMatch) {
                // 恢复导航栏标题
                var displayName =
                    contact.remark ||
                    contact.nickname ||
                    contact.name ||
                    "未知";
                $navTitle.text(displayName);
                $navTitle.removeClass("xiaoxin-wechat-chat-typing");

                // 刷新消息列表（显示新消息）
                console.info(
                    "[小馨手机][微信聊天UI] 消息队列显示完成，刷新消息列表:",
                    chatUserId,
                    "消息ID:",
                    message.id
                );
                refreshMessageList();

                // 如果玩家在当前聊天页面，清除未读红点
                if (
                    window.XiaoxinWeChatComponents &&
                    window.XiaoxinWeChatComponents.isActiveChat &&
                    window.XiaoxinWeChatComponents.isActiveChat(chatUserId)
                ) {
                    clearUnreadBadgeIfActive();
                }

                console.info(
                    "[小馨手机][微信聊天UI] 消息显示完成:",
                    chatUserId,
                    "消息ID:",
                    message.id
                );
            } else {
                // 即使不在当前聊天页面，也要更新未读红点
                // 消息队列管理器会独立处理，不受页面状态影响
                if (
                    window.XiaoxinWeChatDataHandler &&
                    window.XiaoxinWeChatComponents
                ) {
                    // 增加未读数（如果玩家不在聊天页面）
                    if (
                        !window.XiaoxinWeChatComponents.isActiveChat ||
                        !window.XiaoxinWeChatComponents.isActiveChat(
                            eventContactId
                        )
                    ) {
                        // 不在聊天页面，消息队列会独立显示，红点也会独立更新
                        // 这里不需要额外操作，因为 addChatMessage 已经处理了未读数
                        console.info(
                            "[小馨手机][微信聊天UI] 消息在后台显示:",
                            eventContactId,
                            "消息ID:",
                            message.id
                        );
                    }
                }
            }
        }
        window.addEventListener(
            "xiaoxin-message-displayed",
            handleMessageDisplayed
        );

        // 解析 [MSG] 标签中的字段
        function parseMsgFields(msgContent) {
            var fields = {};
            var lines = msgContent.split(/\r?\n/);
            lines.forEach(function (line) {
                line = line.trim();
                if (!line) return;
                var match = line.match(/^([^=]+?)\s*=\s*(.+)$/);
                if (match) {
                    var key = match[1].trim();
                    var value = match[2].trim();
                    fields[key] = value;
                }
            });
            return fields;
        }

        // 定期同步酒馆输入框与预览消息
        function syncInputWithPending() {
            var tavernInput = document.getElementById("send_textarea");
            if (!tavernInput) return;

            var currentInputText = tavernInput.value || "";
            var msgIdsInInput = new Set();
            var newPendingMessages = {};

            // 从输入框文本中解析出所有 [MSG] 标签
            var msgPattern = /\[MSG\]([\s\S]*?)\[\/MSG\]/g;
            var match;
            while ((match = msgPattern.exec(currentInputText)) !== null) {
                var msgContent = match[1].trim();
                if (!msgContent) continue;

                // 解析所有字段
                var fields = parseMsgFields(msgContent);
                var msgId = fields.id;
                if (!msgId) continue;

                msgIdsInInput.add(msgId);

                // 如果这个消息还没有在 pendingMessages 中，创建预览消息
                if (!pendingMessages[msgId]) {
                    var msgType = fields.type || "text";

                    // 跳过 redpacket_claim 类型的消息，不创建预览（这是系统指令，不需要显示预览）
                    if (msgType === "redpacket_claim") {
                        console.info(
                            "[小馨手机][微信聊天UI] 跳过 redpacket_claim 类型的消息预览:",
                            msgId
                        );
                        continue;
                    }

                    var msgTime = fields.time || "";
                    var msgFrom = fields.from || "";
                    var msgTo = fields.to || "";

                    // 检查是否是当前聊天的消息
                    // 现在使用角色ID进行匹配（from=0 表示玩家，to=角色ID）
                    var targetUserId = msgTo || "";
                    var isCurrentChat = false;

                    if (!targetUserId) {
                        // 没有 to 字段，假设是当前聊天
                        isCurrentChat = true;
                    } else {
                        // 使用角色ID进行匹配（联系方式数据块中的 id）
                        // 1. 直接匹配 chatUserId（联系人的 id）
                        if (
                            targetUserId === String(chatUserId) ||
                            targetUserId === chatUserId
                        ) {
                            isCurrentChat = true;
                        }
                        // 2. 匹配 userId（可能是角色ID格式）
                        else if (
                            targetUserId === String(userId) ||
                            targetUserId === userId
                        ) {
                            isCurrentChat = true;
                        }
                        // 3. 匹配联系人的 id（角色ID）
                        else if (contact && contact.id) {
                            var contactId = String(contact.id);
                            if (
                                targetUserId === contactId ||
                                targetUserId === contact.id
                            ) {
                                isCurrentChat = true;
                            }
                        }
                    }

                    if (!isCurrentChat) {
                        // 不是当前聊天的消息，跳过
                        console.info(
                            "[小馨手机][微信聊天UI] 消息目标用户不匹配，跳过:",
                            {
                                targetUserId: targetUserId,
                                chatUserId: chatUserId,
                                userId: userId,
                                contactId: contact ? contact.id : null,
                            }
                        );
                        continue;
                    }

                    // 构建预览消息对象
                    // 判断是否是玩家发送的消息：通过检查 from 是否为玩家微信id
                    // 获取玩家微信id（优先使用账号的 wechatId，其次 id）
                    var account = window.XiaoxinWeChatAccount
                        ? window.XiaoxinWeChatAccount.getCurrentAccount()
                        : null;
                    var playerWechatId = account
                        ? String(account.wechatId || account.id || "").trim()
                        : "";
                    var isPlayerMessage = false;
                    var msgFromStr = String(msgFrom || "").trim();

                    // 检查 from="player" 的情况（历史消息生成）
                    // 兼容：from="user" 也表示玩家（本扩展旧/部分指令会用 user）
                    if (msgFromStr === "player" || msgFromStr === "user") {
                        isPlayerMessage = true;
                    } else if (playerWechatId) {
                        // 如果消息的 from 字段等于玩家微信id，则判定为玩家消息
                        isPlayerMessage =
                            msgFromStr === playerWechatId ||
                            msgFrom === playerWechatId;
                    } else {
                        // 如果没有玩家微信id，保持向后兼容：from="0" 表示玩家
                        isPlayerMessage =
                            msgFrom === "0" ||
                            msgFrom === 0 ||
                            msgFromStr === "0";
                    }

                    var previewMsg = {
                        id: msgId,
                        type: msgType,
                        time: msgTime,
                        rawTime: msgTime,
                        from: msgFrom,
                        to: msgTo,
                        timestamp: Date.now(), // 临时时间戳，会在 refreshMessageList 中更新
                        isOutgoing: isPlayerMessage, // 玩家发送的消息为 true
                        isPending: true,
                    };

                    // 根据消息类型添加特定字段
                    if (msgType === "redpacket") {
                        previewMsg.amount = parseFloat(fields.amount) || 0;
                        previewMsg.note = fields.note || "恭喜发财, 大吉大利";
                        previewMsg.greeting = previewMsg.note;
                        previewMsg.redpacket_id = fields.redpacket_id || "";
                        if (fields.sticker) {
                            previewMsg.sticker = fields.sticker;
                        }
                    } else if (msgType === "image") {
                        previewMsg.image = fields.image || "";
                        previewMsg.desc = fields.desc || "";
                        previewMsg.content =
                            previewMsg.image || previewMsg.desc;
                    } else if (msgType === "photo") {
                        // 照片消息：优先使用 image 字段
                        previewMsg.image = fields.image || "";
                        previewMsg.desc = fields.desc || "";
                        previewMsg.content =
                            previewMsg.image || previewMsg.desc || fields.content || "";
                    } else if (msgType === "voice") {
                        previewMsg.duration_sec =
                            parseInt(
                                fields.duration_sec || fields.duration || "0",
                                10
                            ) || 0;
                        previewMsg.content =
                            "[语音]" + previewMsg.duration_sec + '"';
                    } else {
                        // 文本消息
                        previewMsg.content = fields.content || "";
                    }

                    newPendingMessages[msgId] = previewMsg;
                    console.info(
                        "[小馨手机][微信聊天UI] 从输入框解析出预览消息:",
                        {
                            msgId: previewMsg.id,
                            type: previewMsg.type,
                            amount: previewMsg.amount,
                            note: previewMsg.note,
                            targetUserId: targetUserId,
                            chatUserId: chatUserId,
                            userId: userId,
                            contactWechatId: contact ? contact.wechatId : null,
                            contactId: contact ? contact.id : null,
                            fullMessage: previewMsg,
                        }
                    );
                }
            }

            // 添加新的预览消息
            var hasChanged = false;
            Object.keys(newPendingMessages).forEach(function (msgId) {
                if (!pendingMessages[msgId]) {
                    pendingMessages[msgId] = newPendingMessages[msgId];
                    hasChanged = true;
                    console.info(
                        "[小馨手机][微信聊天UI] 添加预览消息到 pendingMessages:",
                        msgId,
                        newPendingMessages[msgId]
                    );
                }
            });

            // 如果预览消息不在输入框里了，就移除它
            Object.keys(pendingMessages).forEach(function (msgId) {
                if (!msgIdsInInput.has(msgId)) {
                    delete pendingMessages[msgId];
                    hasChanged = true;
                }
            });

            if (hasChanged) {
                refreshMessageList();
            }
        }
        // 立即执行一次，确保输入框中已有的消息能被解析
        syncInputWithPending();
        var syncInterval = setInterval(syncInputWithPending, 1000);

        // 监听预览消息添加事件
        function handlePendingMessageAdded(event) {
            var detail = event.detail || {};
            var targetUserId = detail.userId;
            console.info("[小馨手机][微信聊天UI] 收到预览消息添加事件:", {
                targetUserId: targetUserId,
                currentChatUserId: chatUserId,
                match: targetUserId === chatUserId,
                messageType: detail.message ? detail.message.type : "unknown",
            });
            if (targetUserId === chatUserId) {
                console.info(
                    "[小馨手机][微信聊天UI] 目标用户匹配，刷新消息列表"
                );
                refreshMessageList();
            } else {
                console.info("[小馨手机][微信聊天UI] 目标用户不匹配，不刷新");
            }
        }
        window.addEventListener(
            "xiaoxin-wechat-pending-message-added",
            handlePendingMessageAdded
        );

        // 页面卸载时，清除活动聊天页面ID和事件监听
        $(window).on("pagehide", function () {
            if (
                window.XiaoxinWeChatComponents &&
                window.XiaoxinWeChatComponents.clearActiveChatId
            ) {
                window.XiaoxinWeChatComponents.clearActiveChatId();
            }
            clearInterval(syncInterval);
            window.removeEventListener(
                "xiaoxin-wechat-pending-message-added",
                handlePendingMessageAdded
            );
        });

        // 发送消息后只安排一次刷新（避免多次 setTimeout 造成频繁重绘/闪烁）
        var sendAfterRefreshTimer = null;
        function scheduleSendAfterRefresh(delayMs) {
            try {
                if (sendAfterRefreshTimer) {
                    clearTimeout(sendAfterRefreshTimer);
                }
            } catch (e) {}
            sendAfterRefreshTimer = setTimeout(function () {
                refreshMessageList();
            }, typeof delayMs === "number" ? delayMs : 400);
        }

        // 发送输入到酒馆输入框
        $inputField.on("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                var text = $(this).val().trim();
                if (!text) return;

                var msgId = generateMsgId();
                // 使用世界观时间：优先使用全局时钟，其次使用最后一条消息时间，最后使用系统时间
                var lastWorldTimestamp = 0;

                // 1. 优先从全局世界观时钟获取时间
                if (window.XiaoxinWorldClock) {
                    // 优先使用 currentTimestamp，兼容 timestamp 字段
                    lastWorldTimestamp =
                        window.XiaoxinWorldClock.currentTimestamp ||
                        window.XiaoxinWorldClock.timestamp ||
                        0;
                    console.info(
                        "[小馨手机][微信聊天UI] 从全局世界观时钟获取时间:",
                        lastWorldTimestamp,
                        "原始时间:",
                        window.XiaoxinWorldClock.rawTime ||
                            window.XiaoxinWorldClock.raw
                    );
                }

                // 2. 如果全局时钟没有时间，尝试从聊天历史中获取最后一条消息的时间
                if (lastWorldTimestamp <= 0) {
                    try {
                        var history = window.XiaoxinWeChatDataHandler
                            ? window.XiaoxinWeChatDataHandler.getChatHistory(
                                  chatUserId
                              )
                            : [];
                        if (history && history.length > 0) {
                            var lastMsg = history[history.length - 1];
                            if (lastMsg.rawTime) {
                                // rawTime 形如 2026-01-07 16:52:06 或 2026/01/07 16:52:06 或 2018年6月20日 星期三 08:32
                                var timeStr = String(lastMsg.rawTime);
                                // 尝试解析多种时间格式（支持中文格式）
                                var normalizedTimeStr = timeStr
                                    .replace(/-/g, "/")
                                    .replace(
                                        /年|月|日|星期[一二三四五六日]/g,
                                        " "
                                    );
                                var parsed = Date.parse(normalizedTimeStr);
                                if (!isNaN(parsed)) {
                                    lastWorldTimestamp = parsed;
                                    console.info(
                                        "[小馨手机][微信聊天UI] 从最后一条消息的rawTime获取时间:",
                                        lastWorldTimestamp,
                                        "原始字符串:",
                                        timeStr
                                    );
                                }
                            } else if (lastMsg.timestamp) {
                                lastWorldTimestamp = lastMsg.timestamp;
                                console.info(
                                    "[小馨手机][微信聊天UI] 从最后一条消息的timestamp获取时间:",
                                    lastWorldTimestamp
                                );
                            }
                        }
                    } catch (e) {
                        console.warn(
                            "[小馨手机][微信聊天UI] 获取世界观时间失败:",
                            e
                        );
                    }
                }

                // 3. 如果还是没有时间，使用系统时间（但应该尽量避免这种情况）
                if (lastWorldTimestamp <= 0) {
                    console.warn(
                        "[小馨手机][微信聊天UI] 无法获取世界观时间，使用系统时间（不推荐）"
                    );
                    lastWorldTimestamp = Date.now();
                }

                // 4. 确保玩家消息时间一定比所有已存在的消息时间要迟
                // 获取当前聊天的所有消息，找出最后一条消息的时间
                var chatMessages = [];
                try {
                    if (
                        window.XiaoxinWeChatDataHandler &&
                        typeof window.XiaoxinWeChatDataHandler
                            .getChatMessages === "function"
                    ) {
                        chatMessages =
                            window.XiaoxinWeChatDataHandler.getChatMessages(
                                chatUserId
                            ) || [];
                    }
                } catch (e) {
                    console.warn("[小馨手机][微信聊天UI] 获取聊天消息失败:", e);
                }

                // 找出最后一条消息的时间戳（无论是玩家还是角色发送的）
                var lastMessageTimestamp = lastWorldTimestamp;
                if (chatMessages && chatMessages.length > 0) {
                    // 按时间戳排序，找出最后一条消息
                    var sortedMessages = chatMessages
                        .filter(function (m) {
                            return m.timestamp && m.timestamp > 0;
                        })
                        .sort(function (a, b) {
                            return b.timestamp - a.timestamp;
                        });
                    if (sortedMessages.length > 0) {
                        var lastMsg = sortedMessages[0];
                        lastMessageTimestamp = lastMsg.timestamp;
                        console.info(
                            "[小馨手机][微信聊天UI] 最后一条消息时间戳:",
                            lastMessageTimestamp,
                            "消息内容:",
                            lastMsg.content
                                ? lastMsg.content.substring(0, 20)
                                : ""
                        );
                    }
                }

                // 5. 生成新消息的时间
                // 规则：必须读取“最新世界观时间”（来自最近的 [time] 标签/全局世界观时钟），并在此基础上延后 30 秒作为玩家新消息时间。
                // 同时保证：若最后一条已存在消息时间更晚，则以它为基准再 +30 秒，避免玩家消息被排序到上面。
                var baseTimestamp = lastWorldTimestamp;
                if (lastMessageTimestamp > lastWorldTimestamp) {
                    // 角色消息的时间戳超过了当前世界观时间，使用最后一条消息时间作为基准
                    baseTimestamp = lastMessageTimestamp;
                    console.info(
                        "[小馨手机][微信聊天UI] 角色消息时间戳超过世界观时间，使用最后一条消息时间戳:",
                        baseTimestamp,
                        "世界观时间:",
                        lastWorldTimestamp
                    );
                } else {
                    // 使用最新的世界观时间（从时间标签获取）
                    baseTimestamp = lastWorldTimestamp;
                    console.info(
                        "[小馨手机][微信聊天UI] 使用最新的世界观时间:",
                        baseTimestamp
                    );
                }

                // 玩家消息时间戳 = 基准时间戳 + 30秒，确保在最后且更贴近真实对话节奏
                var nextTimestamp = baseTimestamp + 30000;
                var nowDate = new Date(nextTimestamp);

                // 优先使用全局时钟的原始时间字符串，如果没有则格式化时间戳
                var nowStr = "";
                if (
                    window.XiaoxinWorldClock &&
                    window.XiaoxinWorldClock.rawTime
                ) {
                    // 如果有原始时间字符串，基于它生成新时间（加1分钟）
                    var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                    // 尝试解析原始时间字符串（支持多种格式）
                    // 支持格式：2018年6月20日 星期三 07:55:00 或 2026-01-08 12:02:34
                    var normalizedTimeStr = rawTimeStr
                        .replace(/-/g, "/")
                        .replace(/年|月|日|星期[一二三四五六日]/g, " ");
                    var baseTime = Date.parse(normalizedTimeStr);
                    if (!isNaN(baseTime)) {
                        var newTime = new Date(baseTime + 60000);
                        nowStr = formatTime(newTime);
                        console.info(
                            "[小馨手机][微信聊天UI] 基于原始时间字符串生成新时间:",
                            rawTimeStr,
                            "->",
                            nowStr
                        );
                    } else {
                        // 如果无法解析，使用格式化后的时间戳
                        console.warn(
                            "[小馨手机][微信聊天UI] 无法解析原始时间字符串，使用时间戳:",
                            rawTimeStr
                        );
                        nowStr = formatTime(nowDate);
                    }
                } else {
                    // 没有原始时间字符串，使用格式化后的时间戳
                    nowStr = formatTime(nowDate);
                }
                // 使用角色ID和玩家ID
                // 获取玩家微信id（优先使用账号的 wechatId，其次 id）
                var account = window.XiaoxinWeChatAccount
                    ? window.XiaoxinWeChatAccount.getCurrentAccount()
                    : null;
                var fromId = account
                    ? String(account.wechatId || account.id || "0").trim()
                    : "0";
                // 角色ID使用联系方式数据块中的 id
                var toId =
                    contact && contact.id
                        ? String(contact.id)
                        : String(chatUserId);

                var msgObj = {
                    id: msgId,
                    time: nowStr,
                    from: String(fromId),
                    to: String(toId),
                    type: "text",
                    payload: { content: text },
                };
                // 使用简洁的 字段=值 格式，去掉花括号
                var packet =
                    "\n[MSG]\n" +
                    "id=" +
                    msgId +
                    "\n" +
                    "time=" +
                    nowStr +
                    "\n" +
                    "from=user\n" +
                    "to=" +
                    String(toId) +
                    "\n" +
                    "type=text\n" +
                    "content=" +
                    text +
                    "\n" +
                    "[/MSG]";

                // 将消息添加到预览列表
                // 补充 timestamp/rawTime 给预览
                msgObj.timestamp = nextTimestamp;
                msgObj.rawTime = nowStr;
                pendingMessages[msgId] = msgObj;
                refreshMessageList();

                // 推进全局世界观时钟，避免下一条玩家消息又回到旧时间导致排序错乱
                try {
                    if (window.XiaoxinWorldClock) {
                        window.XiaoxinWorldClock.currentTimestamp =
                            nextTimestamp;
                        window.XiaoxinWorldClock.timestamp = nextTimestamp;
                        window.XiaoxinWorldClock.rawTime = nowStr;
                        window.XiaoxinWorldClock.raw = nowStr;
                    }
                } catch (e) {}

                // 追加到酒馆输入框
                try {
                    var tavernInput = document.getElementById("send_textarea");
                    if (tavernInput) {
                        tavernInput.value += packet;
                        // 触发输入事件，让SillyTavern知道内容已更改
                        tavernInput.dispatchEvent(
                            new Event("input", { bubbles: true })
                        );

                        // 消息发送后，延迟刷新一次即可（避免重复刷新）
                        scheduleSendAfterRefresh(400);
                    } else {
                        throw new Error("未找到酒馆输入框 #send_textarea");
                    }
                } catch (err) {
                    console.error(
                        "[小馨手机][微信聊天UI] 发送到酒馆输入框失败:",
                        err
                    );
                    // 如果失败，则从预览中移除
                    delete pendingMessages[msgId];
                    refreshMessageList();
                }

                $(this).val("");
            }
        });

        // 初始加载（延迟一下，确保消息队列管理器已初始化）
        setTimeout(function () {
            refreshMessageList();
        }, 100);

        // 清理函数
        $container.data("cleanup", function () {
            window.removeEventListener(
                "xiaoxin-chat-updated",
                handleChatUpdate
            );
            window.removeEventListener(
                "xiaoxin-message-typing",
                handleMessageTyping
            );
            window.removeEventListener(
                "xiaoxin-message-displayed",
                handleMessageDisplayed
            );
            clearInterval(syncInterval);
            // 清除活动聊天页面ID
            if (
                window.XiaoxinWeChatComponents &&
                window.XiaoxinWeChatComponents.clearActiveChatId
            ) {
                window.XiaoxinWeChatComponents.clearActiveChatId();
            }
        });

        return $container;
    }

    // ========== 检查消息内容是否包含 [MSG] 标签 ==========
    function hasMsgTag(content) {
        if (!content || typeof content !== "string") {
            return false;
        }
        return (
            content.indexOf("[MSG]") !== -1 || content.indexOf("[/MSG]") !== -1
        );
    }

    // ========== 渲染单条消息 ==========
    // ========== 图片查看器（点击放大） ==========
    var imageViewer = {
        $viewer: null,
        $backdrop: null,
        $image: null,
        $closeBtn: null,

        init: function () {
            // 创建查看器元素
            this.$viewer = $('<div class="xiaoxin-wechat-image-viewer"></div>');
            this.$backdrop = $(
                '<div class="xiaoxin-wechat-image-viewer-backdrop"></div>'
            );
            this.$image = $(
                '<img class="xiaoxin-wechat-image-viewer-img" alt="查看图片">'
            );
            this.$closeBtn = $(
                '<div class="xiaoxin-wechat-image-viewer-close">✕</div>'
            );

            // 组装结构
            this.$viewer.append(this.$backdrop, this.$image, this.$closeBtn);

            // 添加到页面
            $("body").append(this.$viewer);

            // 绑定关闭事件
            var self = this;
            this.$backdrop.on("click", function () {
                self.hide();
            });
            this.$closeBtn.on("click", function () {
                self.hide();
            });

            // ESC键关闭
            $(document).on("keydown.imageViewer", function (e) {
                if (e.key === "Escape" && self.$viewer.hasClass("active")) {
                    self.hide();
                }
            });

            console.info("[小馨手机][微信聊天UI] 图片查看器初始化完成");
        },

        show: function (imageUrl) {
            if (!this.$viewer) {
                this.init();
            }

            if (!imageUrl) {
                console.warn("[小馨手机][微信聊天UI] 图片URL为空，无法显示");
                return;
            }

            // 设置图片源
            this.$image.attr("src", imageUrl);

            // 显示查看器
            this.$viewer.addClass("active");
            $("body").css("overflow", "hidden"); // 防止背景滚动

            console.info("[小馨手机][微信聊天UI] 显示图片查看器:", imageUrl);
        },

        hide: function () {
            if (this.$viewer) {
                this.$viewer.removeClass("active");
                $("body").css("overflow", ""); // 恢复滚动
                // 延迟清除图片源，避免闪烁
                setTimeout(function () {
                    if (imageViewer.$image) {
                        imageViewer.$image.attr("src", "");
                    }
                }, 300);
            }
        },
    };

    // 根据图片比例获取样式（在 renderMessage 之前定义）
    /**
     * 根据图片实际尺寸自动调整显示大小
     * 限制最大宽度为屏幕宽度的一半，保持图片原始宽高比
     */
    function adjustImageSize($img) {
        if (!$img || !$img.length) return;

        // 获取图片的原始尺寸
        var naturalWidth = $img[0].naturalWidth;
        var naturalHeight = $img[0].naturalHeight;

        if (!naturalWidth || !naturalHeight) {
            // 如果无法获取原始尺寸，使用默认尺寸（缩小显示）
            var defaultMaxWidth = Math.min(window.innerWidth * 0.35, 180);
            $img.css({
                "max-width": defaultMaxWidth + "px",
                "max-height": "280px",
                width: "auto",
                height: "auto",
            });
            return;
        }

        // 计算图片的宽高比
        var aspectRatio = naturalWidth / naturalHeight;

        // 获取屏幕宽度的35%作为最大宽度（缩小显示）
        var maxWidth = Math.min(window.innerWidth * 0.35, 180); // 最大不超过180px或屏幕35%
        var maxHeight = 280; // 最大高度限制（缩小）

        var finalWidth, finalHeight;

        if (aspectRatio > 1) {
            // 横向图片（宽 > 高）
            finalWidth = Math.min(maxWidth, naturalWidth);
            finalHeight = finalWidth / aspectRatio;
            // 如果高度超过限制，按高度缩放
            if (finalHeight > maxHeight) {
                finalHeight = maxHeight;
                finalWidth = finalHeight * aspectRatio;
            }
        } else if (aspectRatio < 1) {
            // 竖向图片（高 > 宽）
            finalHeight = Math.min(maxHeight, naturalHeight);
            finalWidth = finalHeight * aspectRatio;
            // 如果宽度超过限制，按宽度缩放
            if (finalWidth > maxWidth) {
                finalWidth = maxWidth;
                finalHeight = finalWidth / aspectRatio;
            }
        } else {
            // 正方形（1:1）
            finalWidth = Math.min(maxWidth, naturalWidth);
            finalHeight = finalWidth;
        }

        // 应用样式
        $img.css({
            width: finalWidth + "px",
            height: finalHeight + "px",
            "max-width": maxWidth + "px",
            "max-height": maxHeight + "px",
            "object-fit": "contain",
            "border-radius": "8px",
            display: "block",
        });
    }

    function renderMessage(message, playerNickname, contact, showTimestamp) {
        // 调试：记录所有消息的类型，特别是红包消息
        if (message.type === "redpacket" || (message.content && typeof message.content === "string" && message.content.indexOf("type=redpacket") !== -1)) {
            console.info(
                "[小馨手机][微信聊天UI] renderMessage 收到消息:",
                "消息ID:",
                message.id,
                "type:",
                message.type,
                "content包含type=redpacket:",
                message.content && typeof message.content === "string" && message.content.indexOf("type=redpacket") !== -1,
                "完整消息对象:",
                JSON.stringify({
                    id: message.id,
                    type: message.type,
                    content: message.content ? (message.content.length > 100 ? message.content.substring(0, 100) + "..." : message.content) : "",
                    redpacket_id: message.redpacket_id,
                    amount: message.amount,
                    note: message.note
                })
            );
        }
        var $messageItem = $(
            '<div class="xiaoxin-wechat-chat-message-item"></div>'
        );

        var isPlayerMessage = false;
        if (message.type !== "system") {
            isPlayerMessage = isPlayerSide(message, playerNickname, contact);
            if (isPlayerMessage) {
                $messageItem.addClass("xiaoxin-wechat-chat-message-player");
            } else {
                $messageItem.addClass("xiaoxin-wechat-chat-message-contact");
            }
        }

        // 时间戳 - 使用动态时间格式化
        // showTimestamp 参数控制是否显示时间戳（默认显示）
        if (showTimestamp !== false && (message.timestamp || message.rawTime)) {
            var $timestamp = $(
                '<div class="xiaoxin-wechat-chat-message-timestamp"></div>'
            );

            // 获取消息时间戳
            var msgTimestamp = message.timestamp;
            if (!msgTimestamp && message.rawTime) {
                // 尝试从 rawTime 解析时间戳
                var timeStr = String(message.rawTime).trim();
                // 支持多种时间格式：2026-01-08 11:50:12 或 2018年6月20日 星期三 08:32
                var parsed = Date.parse(
                    timeStr
                        .replace(/-/g, "/")
                        .replace(/年|月|日|星期[一二三四五六日]/g, " ")
                );
                if (!isNaN(parsed)) {
                    msgTimestamp = parsed;
                }
            }

            if (msgTimestamp) {
                // 使用动态时间格式化函数
                var formattedTime = formatMessageTime(msgTimestamp);
                $timestamp.text(formattedTime);
                $messageItem.append($timestamp);
            } else if (message.rawTime) {
                // 如果无法解析时间戳，直接显示原始时间
                $timestamp.text(sanitizeText(message.rawTime));
                $messageItem.append($timestamp);
            }
        }

        // 文本清洗：去除 <br> / 转义的 <br> / 其他标签
        function sanitizeText(t) {
            return (t || "")
                .toString()
                .replace(/&lt;br\s*\/?&gt;/gi, "\n")
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<[^>]+>/g, "")
                .trim();
        }

        // ========== 智能滚动到消息位置（用于语音转写展开时） ==========
        function scrollToMessage($targetElement) {
            if (!$targetElement || !$targetElement.length) {
                return;
            }

            var $messagesList = $(".xiaoxin-wechat-chat-messages-list");
            if (!$messagesList.length) {
                return;
            }

            var messagesListElement = $messagesList[0];
            var targetElement = $targetElement[0];

            // 获取目标元素和消息列表的offset位置
            var targetOffset = $(targetElement).offset();
            var listOffset = $messagesList.offset();

            // 计算目标元素相对于消息列表的位置
            var targetTop =
                targetOffset.top -
                listOffset.top +
                messagesListElement.scrollTop;
            var targetHeight = targetElement.offsetHeight;
            var targetBottom = targetTop + targetHeight;

            // 获取消息列表的可见高度和当前滚动位置
            var visibleHeight = messagesListElement.clientHeight;
            var currentScrollTop = messagesListElement.scrollTop;

            // 计算目标元素在可见区域内的位置
            var targetTopInViewport = targetTop - currentScrollTop;
            var targetBottomInViewport = targetBottom - currentScrollTop;

            // 如果目标元素已经完全在可见区域内，不需要滚动
            if (
                targetTopInViewport >= 0 &&
                targetBottomInViewport <= visibleHeight
            ) {
                return;
            }

            // 计算需要滚动的距离
            var padding = 20; // 上下边距
            var scrollTop = currentScrollTop;

            if (targetTopInViewport < 0) {
                // 目标元素在可见区域上方，滚动到顶部对齐（留出边距）
                scrollTop = targetTop - padding;
            } else if (targetBottomInViewport > visibleHeight) {
                // 目标元素在可见区域下方，滚动到底部对齐（留出边距）
                scrollTop = targetBottom - visibleHeight + padding;
            }

            // 确保滚动位置在有效范围内
            scrollTop = Math.max(
                0,
                Math.min(
                    scrollTop,
                    messagesListElement.scrollHeight - visibleHeight
                )
            );

            // 平滑滚动到目标位置
            $messagesList.animate(
                {
                    scrollTop: scrollTop,
                },
                300
            );
        }

        // 消息内容容器
        var $messageContent = $(
            '<div class="xiaoxin-wechat-chat-message-content"></div>'
        );

        // 系统消息（包括红包领取通知）不显示头像和气泡指向
        var isSystemMessage =
            message.type === "system" ||
            message.type === "redpacket_claim_notification";

        if (!isSystemMessage) {
            // 头像
            var $avatar = $(
                '<div class="xiaoxin-wechat-chat-message-avatar"></div>'
            );
            var account = window.XiaoxinWeChatAccount
                ? window.XiaoxinWeChatAccount.getCurrentAccount()
                : null;
            var avatarUrl = isPlayerMessage
                ? (account && account.avatar) ||
                  "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg"
                : contact.avatar ||
                  "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
            $avatar.css("background-image", "url(" + avatarUrl + ")");
            $messageContent.append($avatar);
        }

        // 消息气泡
        var $bubble = $(
            '<div class="xiaoxin-wechat-chat-message-bubble"></div>'
        );

        // 如果是语音消息，可能会有未读红点（仅角色侧）
        var $voiceUnreadDot = null;

        // ⚠️ 重要：对于红包消息，如果已处理（_processed = true），直接渲染并返回
        // 这个检查需要在 $avatar 创建之后，因为我们需要使用 $avatar
        if (message.type === "redpacket" && message._processed === true) {
            // 历史红包消息已处理，直接渲染，不再重复处理
            console.info(
                "[小馨手机][微信聊天UI] 历史红包消息已处理，直接渲染:",
                message.id
            );
            // 直接渲染红包，不再执行后续处理
            $bubble.addClass("xiaoxin-wechat-chat-message-redpacket");
            // 渲染红包内容（使用已有数据）
            var amount = message.amount || 0;
            var note = message.note || message.greeting || message.content || "恭喜发财, 大吉大利";
            var isClaimed = message.claimed === true || message.status === "claimed" || message.claimed_by !== undefined;

            var $redpacketContainer = $('<div class="xiaoxin-wechat-chat-message-redpacket-container"></div>');
            if (isClaimed) {
                $redpacketContainer.addClass("xiaoxin-wechat-chat-message-redpacket-claimed");
            }

            var $redpacketIcon = $('<div class="xiaoxin-wechat-chat-message-redpacket-icon"></div>');
            if (isClaimed) {
                var $redpacketIconInner = $('<div class="xiaoxin-wechat-chat-message-redpacket-icon-inner xiaoxin-wechat-chat-message-redpacket-icon-opened"><div class="xiaoxin-wechat-chat-message-redpacket-icon-bg-opened"></div><div class="xiaoxin-wechat-chat-message-redpacket-icon-flap"></div><div class="xiaoxin-wechat-chat-message-redpacket-icon-circle"><span class="xiaoxin-wechat-chat-message-redpacket-icon-symbol">¥</span></div></div>');
                var $redpacketLabel = $('<div class="xiaoxin-wechat-chat-message-redpacket-label">已被领完</div>');
            } else {
                var $redpacketIconInner = $('<div class="xiaoxin-wechat-chat-message-redpacket-icon-inner"><div class="xiaoxin-wechat-chat-message-redpacket-icon-bg"></div><div class="xiaoxin-wechat-chat-message-redpacket-icon-circle"><span class="xiaoxin-wechat-chat-message-redpacket-icon-symbol">¥</span></div></div>');
                var $redpacketLabel = $('<div class="xiaoxin-wechat-chat-message-redpacket-label">微信红包</div>');
            }
            $redpacketIcon.append($redpacketIconInner, $redpacketLabel);

            var $redpacketContent = $('<div class="xiaoxin-wechat-chat-message-redpacket-content"></div>');
            var $redpacketNote = $('<div class="xiaoxin-wechat-chat-message-redpacket-note"></div>');
            var defaultNote = "恭喜发财, 大吉大利";
            var displayNote = note || defaultNote;
            if (displayNote !== defaultNote && displayNote.length > 9) {
                displayNote = displayNote.substring(0, 9) + "...";
            }
            $redpacketNote.text(displayNote);
            $redpacketContent.append($redpacketNote);
            $redpacketContainer.append($redpacketIcon, $redpacketContent);

            // 添加点击事件（如果需要）
            if (!isClaimed && !message.isOutgoing) {
                var contactId = contact ? (contact.id || contact.characterId || contact.wechatId || "") : "";
                $redpacketContainer.css("cursor", "pointer");
                $redpacketContainer.on("click", function (e) {
                    e.stopPropagation();
                    var currentIsClaimed = message.claimed || message.status === "claimed";
                    if (currentIsClaimed) {
                        showRedpacketDetailPage(message, contact || {});
                    } else {
                        showRedpacketModal(message, contactId);
                    }
                });
            } else if (isClaimed) {
                $redpacketContainer.css("cursor", "pointer");
                $redpacketContainer.on("click", function (e) {
                    e.stopPropagation();
                    var senderContact = null;
                    if (window.XiaoxinWeChatDataHandler && message.from) {
                        try {
                            var allContacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
                            var senderId = String(message.from || "").trim();
                            senderContact = allContacts.find(function (c) {
                                var cWechatId = String(c.wechatId || "").trim();
                                var cId = String(c.id || "").trim();
                                var cCharId = String(c.characterId || "").trim();
                                return cWechatId === senderId || cId === senderId || cCharId === senderId ||
                                       cId.replace(/^contact_/, "") === senderId.replace(/^contact_/, "");
                            });
                        } catch (e) {
                            console.warn("[小馨手机][微信聊天UI] 获取发送者信息失败:", e);
                        }
                    }
                    showRedpacketDetailPage(message, senderContact || {});
                });
            }

            $bubble.append($redpacketContainer);

            // ⚠️ 重要：确保 $bubble 被添加到 $messageContent，$messageContent 被添加到 $messageItem
            // 这样才能正确显示消息
            if (isSystemMessage) {
                // 系统消息：气泡居中
                $messageContent.addClass(
                    "xiaoxin-wechat-chat-message-content-system"
                );
                $messageContent.append($bubble);
            } else if (isPlayerMessage) {
                // 玩家侧：气泡在右
                $messageContent.append($bubble, $avatar);
            } else {
                // 角色侧：头像在最左，气泡居中
                if ($voiceUnreadDot) {
                    $messageContent.append($avatar, $bubble, $voiceUnreadDot);
                } else {
                    $messageContent.append($avatar, $bubble);
                }
            }

            // 将 $messageContent 添加到 $messageItem
            $messageItem.append($messageContent);

            // ⚠️ 重要：确保返回 $messageItem，否则消息不会被添加到 DOM
            console.info(
                "[小馨手机][微信聊天UI] 历史红包消息渲染完成，返回消息项:",
                message.id
            );
            return $messageItem; // 返回消息项，确保消息被添加到 DOM
        }

        if (message.type === "system") {
            $bubble.addClass("xiaoxin-wechat-chat-message-system");
            $bubble.text(message.content || "");
        } else if (message.type === "redpacket_claim_notification") {
            // 红包领取系统消息：显示红包图标 + "XX领取了XX的红包"
            $bubble.addClass("xiaoxin-wechat-chat-message-system");
            $bubble.addClass(
                "xiaoxin-wechat-chat-message-redpacket-claim-notification"
            );

            // ========= 额外兜底：如果 claimed_by 为空，但有 redpacket_id，则从原始红包消息中补全 =========
            if (
                !message.claimed_by &&
                message.redpacket_id &&
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.getAllChats === "function"
            ) {
                try {
                    var allChatsForRedpacketFix =
                        window.XiaoxinWeChatDataHandler.getAllChats() || {};
                    var fixedClaimedBy = null;

                    Object.keys(allChatsForRedpacketFix).forEach(function (uid) {
                        var msgs = allChatsForRedpacketFix[uid] || [];
                        msgs.forEach(function (m) {
                            var mRedpacketId =
                                m.redpacket_id ||
                                (m.payload && m.payload.redpacket_id) ||
                                "";
                            if (
                                m.type === "redpacket" &&
                                mRedpacketId &&
                                mRedpacketId === message.redpacket_id &&
                                m.claimed_by
                            ) {
                                fixedClaimedBy = m.claimed_by;
                            }
                        });
                    });

                    if (fixedClaimedBy) {
                        message.claimed_by = fixedClaimedBy;
                    }
                } catch (e) {
                }
            }

            // 获取领取者名称（与红包详情页一致：优先备注/昵称/name）
            var claimerName = "未知用户";
            var claimerContact = null;

            var claimedById =
                message.claimed_by && String(message.claimed_by).trim()
                    ? String(message.claimed_by).trim()
                    : "";

            if (claimedById && window.XiaoxinWeChatDataHandler) {
                try {
                    var allContacts =
                        window.XiaoxinWeChatDataHandler.getContacts() || [];
                    claimedById = String(claimedById).trim();

                    // 使用与红包详情页完全相同的查找逻辑
                    claimerContact = allContacts.find(function (c) {
                        var cWechatId = String(c.wechatId || "").trim();
                        var cWechatId2 = String(c.wechat_id || "").trim();
                        var cId = String(c.id || "").trim();
                        var cCharId = String(c.characterId || "").trim();
                        var cIdWithoutPrefix = cId.replace(/^contact_/, "");
                        var claimedByIdWithoutPrefix = claimedById.replace(/^contact_/, "");

                        return (
                            cWechatId === claimedById ||
                            cWechatId2 === claimedById ||
                            cId === claimedById ||
                            cId === "contact_" + claimedById ||
                            claimedById === "contact_" + cId ||
                            cCharId === claimedById ||
                            cIdWithoutPrefix === claimedByIdWithoutPrefix ||
                            cIdWithoutPrefix === claimedById ||
                            claimedByIdWithoutPrefix === cIdWithoutPrefix
                        );
                    });

                    // 如果找到了联系人
                    if (claimerContact) {
                        claimerName =
                            claimerContact.remark ||
                            claimerContact.note ||
                            claimerContact.nickname ||
                            claimerContact.name ||
                            "未知用户";
                    } else {
                        // 找不到联系人时，尝试用消息里的 claimerName，否则退化为 claimedById
                        if (
                            message.claimerName &&
                            message.claimerName !== "未知" &&
                            message.claimerName !== "未知用户" &&
                            message.claimerName !== claimedById
                        ) {
                            claimerName = message.claimerName;
                        } else {
                            claimerName = claimedById || "未知用户";
                        }
                    }
                } catch (e) {
                    // 如果查找失败，尝试使用消息中的claimerName
                    if (
                        message.claimerName &&
                        message.claimerName !== "未知" &&
                        message.claimerName !== "未知用户" &&
                        message.claimerName !== claimedById
                    ) {
                        claimerName = message.claimerName;
                    } else {
                        claimerName = claimedById || "未知用户";
                    }
                }
            } else {
                // 如果没有DataHandler或claimed_by，尝试使用消息中的claimerName
                if (
                    message.claimerName &&
                    message.claimerName !== "未知" &&
                    message.claimerName !== "未知用户"
                ) {
                    claimerName = message.claimerName;
                } else if (claimedById) {
                    claimerName = claimedById;
                } else {
                    claimerName = "未知用户";
                }
            }

            // 创建消息内容
            var $notificationContent = $(
                '<span class="xiaoxin-wechat-chat-message-redpacket-claim-notification-content"></span>'
            );

            // 红包图标
            var $redpacketIcon = $(
                '<span class="xiaoxin-wechat-chat-message-redpacket-claim-icon">🧧</span>'
            );
            $notificationContent.append($redpacketIcon);

            // 获取发送者名称
            var senderName = message.senderName || "未知";

            // 判断领取者和发送者是否是玩家
            var isClaimerPlayer = message.isClaimerPlayer === true;
            var isSenderPlayer = message.isSenderPlayer === true;

            // 额外检查：如果领取者ID匹配玩家账号信息，也认为是玩家领取
            // 注意：只通过ID匹配，不通过名称匹配（因为名称可能重复）
            if (!isClaimerPlayer && window.XiaoxinWeChatDataHandler) {
                try {
                    var account = window.XiaoxinWeChatDataHandler.getAccount();
                    if (account && message.claimed_by) {
                        var accountWechatId = String(
                            account.wechatId || ""
                        ).trim().toLowerCase();
                        var accountWechatId2 = String(
                            account.wechat_id || ""
                        ).trim().toLowerCase();
                        var accountWechatId3 = String(
                            account.wechatID || ""
                        ).trim().toLowerCase();
                        var accountId = String(account.id || "").trim().toLowerCase();
                        var claimedById = String(
                            message.claimed_by || ""
                        ).trim().toLowerCase();

                        // 只通过ID匹配，不通过名称匹配（避免误判）
                        if (
                            claimedById === accountWechatId ||
                            claimedById === accountWechatId2 ||
                            claimedById === accountWechatId3 ||
                            claimedById === accountId ||
                            claimedById === "player" ||
                            claimedById === "0"
                        ) {
                            isClaimerPlayer = true;
                            console.info(
                                "[小馨手机][微信聊天UI] 通过ID匹配判断领取者是玩家:",
                                "claimed_by:",
                                message.claimed_by,
                                "accountId:",
                                accountId
                            );
                        }
                    }
                } catch (e) {
                    console.warn(
                        "[小馨手机][微信聊天UI] 检查领取者是否是玩家时出错:",
                        e
                    );
                }
            }

            // 根据发送者和领取者是否是玩家，生成不同的文本
            var notificationText = "";
            if (isClaimerPlayer && !isSenderPlayer) {
                // 玩家领取了角色的红包："你领取了XX的红包"
                notificationText = "你领取了" + senderName + "的";
            } else if (!isClaimerPlayer && isSenderPlayer) {
                // 角色领取了玩家的红包："XX领取了你的红包"
                notificationText = claimerName + "领取了你的";
            } else if (isClaimerPlayer && isSenderPlayer) {
                // 玩家领取了玩家的红包："你领取了你的红包"（虽然这种情况不太可能，但也要处理）
                notificationText = "你领取了你的";
            } else {
                // 角色领取了角色的红包："XX领取了XX的红包"
                notificationText = claimerName + "领取了" + senderName + "的";
            }

            // 文本内容，其中"红包"为黄色
            // 注意：直接将文本和"红包"放在一起，不要分开添加，避免产生空格
            var $text = $(
                '<span class="xiaoxin-wechat-chat-message-redpacket-claim-text"></span>'
            );
            $text.append(document.createTextNode(notificationText));
            var $redpacketText = $(
                '<span class="xiaoxin-wechat-chat-message-redpacket-claim-redpacket-word">红包</span>'
            );
            $text.append($redpacketText);
            $notificationContent.append($text);

            $bubble.append($notificationContent);

            // 系统消息不显示气泡指向
            $bubble.css({
                position: "relative",
            });
        } else if (message.type === "transfer") {
            // 转账消息：显示转账卡片（橙色气泡样式）
            // 如果是历史消息且已经处理过，直接使用已有数据，避免重复处理
            if (message.isHistorical && message._processed) {
                // 历史消息已处理，直接渲染，不再重复处理
                console.info(
                    "[小馨手机][微信聊天UI] 历史转账消息已处理，直接渲染:",
                    message.id
                );
            }
            $bubble.addClass("xiaoxin-wechat-chat-message-transfer");
            // 直接设置橙色背景，确保不被其他样式覆盖
            $bubble.css({
                background: "#ff9c2c",
                backgroundColor: "#ff9c2c",
                color: "#fff",
            });
            var amount =
                (message.payload && message.payload.amount) ||
                message.amount ||
                0;
            var note = (message.payload && message.payload.note) || "";
            var $card = $(
                '<div class="xiaoxin-wechat-chat-transfer-card"></div>'
            );

            // 第一行：图标 + 转账 + 金额（左对齐）
            var $row1 = $(
                '<div class="xiaoxin-wechat-chat-transfer-row1"></div>'
            );
            var $icon = $(
                '<div class="xiaoxin-wechat-chat-transfer-icon"></div>'
            );
            // 使用空心圆包裹双箭头的转账图标，更贴近微信原生样式
            $icon.html(
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    // 外圈：细线条空心圆
                    '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/>' +
                    // 上方向右箭头
                    '<path d="M8 8H15M15 8L12.5 5.5M15 8L12.5 10.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
                    // 下方向左箭头
                    '<path d="M16 16H9M9 16L11.5 13.5M9 16L11.5 18.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
                    "</svg>"
            );
            var $title = $(
                '<div class="xiaoxin-wechat-chat-transfer-title">转账</div>'
            );
            var $amount = $(
                '<div class="xiaoxin-wechat-chat-transfer-amount">¥' +
                    Number(amount || 0).toFixed(2) +
                    "</div>"
            );
            $row1.append($icon, $title, $amount);

            // 第二行：转账说明或"微信转账"（左对齐）
            var $row2 = $(
                '<div class="xiaoxin-wechat-chat-transfer-row2"></div>'
            );
            $row2.text(note ? note : "微信转账");

            $card.append($row1, $row2);
            $bubble.empty().append($card);

            // 标记历史消息已处理，避免刷新时重复处理
            if (message.isHistorical) {
                message._processed = true;
                // 保存_processed标志到持久化存储
                try {
                    var chatId =
                        (contact && contact.id) ||
                        message.chatUserId ||
                        message.to ||
                        chatUserId;
                    if (
                        chatId &&
                        message.id &&
                        window.XiaoxinWeChatDataHandler &&
                        typeof window.XiaoxinWeChatDataHandler
                            .updateChatMessage === "function"
                    ) {
                        window.XiaoxinWeChatDataHandler.updateChatMessage(
                            chatId,
                            message.id,
                            {
                                _processed: true,
                            }
                        );
                        console.info(
                            "[小馨手机][微信聊天UI] 转账消息_processed标志已保存到持久化存储:",
                            chatId,
                            message.id
                        );
                    }
                } catch (error) {
                    console.warn(
                        "[小馨手机][微信聊天UI] 保存转账消息_processed标志失败:",
                        error
                    );
                }
            }
        } else if (
            message.type === "call_voice" ||
            message.type === "call_video"
        ) {
            // 只显示通话结束、拒绝或未应答的状态，不显示发起通话、通话中等中间状态
            var callState = message.callState || message.state || "";
            // ⚠️ 只允许显示 ended、unanswered、rejected 这三种状态的通话消息
            // 其他所有状态（包括空状态、calling、ringing、in_call、accepted、connected 等）都跳过不显示
            if (
                callState !== "ended" &&
                callState !== "unanswered" &&
                callState !== "rejected"
            ) {
                // 不显示气泡，直接返回空内容
                console.info(
                    "[小馨手机][微信聊天UI] 跳过非目标状态的通话消息:",
                    "callState:",
                    callState,
                    "type:",
                    message.type
                );
                $bubble.empty();
                return;
            }

            // 未接来电/拒绝消息：显示电话图标 + 文字
            $bubble.addClass("xiaoxin-wechat-chat-message-call-missed");
            if (isPlayerMessage) {
                $bubble.addClass(
                    "xiaoxin-wechat-chat-message-call-missed-player"
                );
            } else {
                $bubble.addClass(
                    "xiaoxin-wechat-chat-message-call-missed-contact"
                );
            }

            // 根据 callState 确定显示文本
            var displayText = "未应答";
            if (message.callState === "rejected") {
                // 角色拒接时，玩家侧显示"对方已拒绝"
                if (isPlayerMessage) {
                    displayText = "对方已拒绝";
                } else {
                    displayText = "已拒绝";
                }
            } else if (message.callState === "unanswered") {
                // 未响应
                if (isPlayerMessage) {
                    displayText = "对方无应答";
                } else {
                    displayText = "未应答";
                }
            } else if (message.callState === "ended") {
                // 通话结束：必须显示通话时长，而不是"通话结束"
                var note = (message.note || "").trim();
                // ⚠️ 重要：通话时长只读取 ended 消息本身的 duration/duration_sec 字段（不推算、不取最大）
                var sec = 0;
                var rawDur = message.duration || message.duration_sec || 0;
                if (typeof rawDur === "number") {
                    sec = rawDur;
                } else if (typeof rawDur === "string") {
                    var durStr = String(rawDur).trim();
                    var mmssMatch = durStr.match(/^(\d{1,2}):(\d{2})$/);
                    if (mmssMatch) {
                        sec =
                            parseInt(mmssMatch[1], 10) * 60 +
                            parseInt(mmssMatch[2], 10);
                    } else {
                        sec = parseInt(durStr, 10);
                        if (isNaN(sec)) sec = 0;
                    }
                }
                if (sec < 0 || isNaN(sec)) sec = 0;
                var mm = String(Math.floor(sec / 60)).padStart(2, "0");
                var ss = String(sec % 60).padStart(2, "0");
                displayText = "通话时长" + mm + ":" + ss;

                // 如果 note 本身已经包含“通话时长”，则直接展示 note（不参与计算）
                if (note && note.indexOf("通话时长") !== -1) {
                    displayText = note;
                }
            } else if (message.note) {
                // 使用消息中的 note 字段
                displayText = message.note;
            }

            // 电话图标（SVG黑色线条）
            var $icon = $(
                '<span class="xiaoxin-wechat-chat-call-missed-icon">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="rotate(135 12 12)"/>' +
                    "</svg>" +
                    "</span>"
            );

            // 显示文字
            var $text = $(
                '<span class="xiaoxin-wechat-chat-call-missed-text">' +
                    escapeHtml(displayText) +
                    "</span>"
            );

            // 对于玩家侧消息，图标在右侧（文字在前，图标在后）
            // 对于角色侧消息，图标在左侧（图标在前，文字在后）
            if (isPlayerMessage) {
                $bubble.append($text, $icon);
            } else {
                $bubble.append($icon, $text);
            }

            // 标记历史消息已处理，避免刷新时重复处理
            if (message.isHistorical) {
                message._processed = true;
                // 保存_processed标志到持久化存储
                try {
                    var chatId =
                        (contact && contact.id) ||
                        message.chatUserId ||
                        message.to ||
                        chatUserId;
                    if (
                        chatId &&
                        message.id &&
                        window.XiaoxinWeChatDataHandler &&
                        typeof window.XiaoxinWeChatDataHandler
                            .updateChatMessage === "function"
                    ) {
                        window.XiaoxinWeChatDataHandler.updateChatMessage(
                            chatId,
                            message.id,
                            {
                                _processed: true,
                            }
                        );
                        console.info(
                            "[小馨手机][微信聊天UI] 通话消息_processed标志已保存到持久化存储:",
                            chatId,
                            message.id
                        );
                    }
                } catch (error) {
                    console.warn(
                        "[小馨手机][微信聊天UI] 保存通话消息_processed标志失败:",
                        error
                    );
                }
            }

            // 如果通话消息同时包含文本内容，需要额外创建一个文本气泡显示在通话状态气泡下方
            var textContent = sanitizeText(message.content);
            if (textContent && textContent.trim() !== "") {
                // 创建文本内容气泡（普通文本消息样式）
                var $textBubble = $(
                    '<div class="xiaoxin-wechat-chat-message-bubble"></div>'
                );
                $textBubble.text(textContent);

                // 将文本气泡保存到消息内容容器中，稍后在组装时添加（在通话状态气泡下方）
                $messageContent.data("textBubble", $textBubble);
            }
        } else if (message.type === "voice") {
            // 语音消息：显示为 XX\" + 语音图标
            // 注意：玩家侧与角色侧分别使用不同的专用样式类，避免互相影响
            $bubble.addClass("xiaoxin-wechat-chat-message-voice");
            if (isPlayerMessage) {
                $bubble.addClass("xiaoxin-wechat-chat-message-voice-player");
            } else {
                $bubble.addClass("xiaoxin-wechat-chat-message-voice-contact");
            }

            // 兼容不同来源的时长字段：
            // - message.duration_sec：玩家自己发送的语音（sendVoiceMessage）
            // - message.duration：从世界书解析出来的语音（message-listener）
            // - message.payload.duration_sec：兜底
            var rawDuration =
                message.duration_sec ||
                message.duration ||
                (message.payload && message.payload.duration_sec);
            var duration = parseInt(rawDuration, 10);
            if (isNaN(duration) || duration <= 0) {
                duration = 1;
            }
            if (duration > 60) {
                duration = 60;
            }

            var $duration = $(
                '<span class="xiaoxin-wechat-chat-voice-duration"></span>'
            );
            $duration.text(duration + '"');

            // 语音图标：一个小扇形 + 两个间隔更舒适的圆弧
            // 适当拉开三者之间的距离，避免过于紧凑
            var $icon = $(
                '<span class="xiaoxin-wechat-chat-voice-icon">' +
                    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
                    // 小实心扇形，整体略向左移，避免挤在圆弧中间
                    '<path d="M9.3 11.6 L12.0 9.6 v4.8 L9.3 12.6 Z" fill="#000000"></path>' +
                    // 内层圆弧：稍小半径
                    '<path d="M13.6 8.9a3.4 3.4 0 0 1 0 6.2" fill="none" stroke="#000000" stroke-width="1.6" stroke-linecap="round"></path>' +
                    // 外层圆弧：更大半径，整体向右偏移一截，拉大与内弧的间隔
                    '<path d="M17.2 6.6a7.0 7.0 0 0 1 0 10.8" fill="none" stroke="#000000" stroke-width="1.6" stroke-linecap="round"></path>' +
                    "</svg>" +
                    "</span>"
            );

            // 获取文字转写内容（玩家侧和角色侧都需要）
            var transcriptionContent = message.content || "";
            var isTranscriptionExpanded = false;
            var isTyping = false;
            var typewriterTimer = null;
            var isVoiceRead = message.voice_read === true;

            // 打字机效果函数（玩家侧和角色侧共用）
            function typewriterEffect($target, text, callback) {
                if (isTyping) {
                    return; // 如果正在打字，不重复执行
                }
                isTyping = true;
                $target.text("");
                var index = 0;

                function typeNextChar() {
                    if (index < text.length) {
                        $target.text(text.substring(0, index + 1));
                        index++;
                        // 根据字符类型调整速度：中文稍慢，标点稍快
                        var char = text[index - 1];
                        var delay = /[\u4e00-\u9fa5]/.test(char) ? 50 : 30; // 中文50ms，其他30ms
                        typewriterTimer = setTimeout(typeNextChar, delay);
                    } else {
                        isTyping = false;
                        // 打字机效果完成后，滚动到底部确保完整显示
                        setTimeout(function () {
                            var $messagesList = $(
                                ".xiaoxin-wechat-chat-messages-list"
                            );
                            if ($messagesList.length > 0) {
                                $messagesList.scrollTop(
                                    $messagesList[0].scrollHeight
                                );
                            }
                        }, 100);
                        if (callback) callback();
                    }
                }

                typeNextChar();
            }

            // 为语音消息添加文字转写功能（玩家侧和角色侧都需要）
            var $transcriptionContainer = null;
            var $transcriptionBubble = null;
            var $transcriptionText = null;

            if (transcriptionContent && transcriptionContent.trim() !== "") {
                // 创建文字转写容器（初始隐藏），样式与消息气泡一致
                $transcriptionContainer = $(
                    '<div class="xiaoxin-wechat-voice-transcription-container" style="display: none;"></div>'
                );
                $transcriptionBubble = $(
                    '<div class="xiaoxin-wechat-voice-transcription-bubble"></div>'
                );
                $transcriptionText = $(
                    '<div class="xiaoxin-wechat-voice-transcription-text"></div>'
                );
                $transcriptionBubble.append($transcriptionText);
                $transcriptionContainer.append($transcriptionBubble);

                // 将文字转写容器保存到消息内容容器中，稍后在组装时添加
                $messageContent.data(
                    "transcriptionContainer",
                    $transcriptionContainer
                );
            }

            if (isPlayerMessage) {
                // 玩家侧：时长在左，图标在右，不需要未读红点
                $bubble.append($duration, $icon);

                // 为玩家侧语音消息添加点击事件（文字转写展开/折叠）
                // 即使没有文字转写内容，也绑定点击事件（给用户反馈）
                $bubble.on("click", function (e) {
                    e.stopPropagation(); // 阻止事件冒泡

                    console.info(
                        "[小馨手机][微信聊天UI] 玩家侧语音消息被点击，文字转写内容:",
                        transcriptionContent
                    );

                    // 如果没有文字转写内容，不处理
                    if (
                        !$transcriptionContainer ||
                        !transcriptionContent ||
                        transcriptionContent.trim() === ""
                    ) {
                        console.info(
                            "[小馨手机][微信聊天UI] 玩家侧语音消息没有文字转写内容，跳过"
                        );
                        return;
                    }

                    // 处理文字转写展开/折叠
                    if (!isTranscriptionExpanded) {
                        // 展开：显示文字转写
                        isTranscriptionExpanded = true;

                        // 清除之前的定时器
                        if (typewriterTimer) {
                            clearTimeout(typewriterTimer);
                            typewriterTimer = null;
                        }
                        isTyping = false;

                        // 检查容器是否在DOM中
                        if (!$transcriptionContainer.parent().length) {
                            console.warn(
                                "[小馨手机][微信聊天UI] 玩家侧文字转写容器不在DOM中，尝试重新添加"
                            );
                            // 如果容器不在DOM中，尝试添加到消息内容容器
                            var $parentContent = $bubble.closest(
                                ".xiaoxin-wechat-chat-message-content"
                            );
                            if ($parentContent.length) {
                                $parentContent.append($transcriptionContainer);
                            } else {
                                console.error(
                                    "[小馨手机][微信聊天UI] 无法找到消息内容容器"
                                );
                                return;
                            }
                        }

                        console.info(
                            "[小馨手机][微信聊天UI] 玩家侧文字转写容器准备展开，容器:",
                            $transcriptionContainer.length,
                            "文本元素:",
                            $transcriptionText.length
                        );

                        // 先显示容器
                        $transcriptionContainer.slideDown(200, function () {
                            // 玩家侧语音消息：检查是否已经展开过（如果文本已存在且完整，说明已经展开过）
                            // 如果已经展开过，直接显示完整文字；否则播放打字机效果
                            var currentText = $transcriptionText.text();
                            if (
                                currentText &&
                                currentText === transcriptionContent
                            ) {
                                // 已经展开过，直接显示完整文字
                                $transcriptionText.text(transcriptionContent);
                            } else {
                                // 首次展开，播放打字机效果
                                typewriterEffect(
                                    $transcriptionText,
                                    transcriptionContent
                                );
                            }

                            // 滚动到能完全显示该消息的位置（而不是滚动到底部）
                            setTimeout(function () {
                                scrollToMessage($transcriptionContainer);
                            }, 100);
                        });
                    } else {
                        // 折叠：隐藏文字转写
                        isTranscriptionExpanded = false;

                        // 清除打字机定时器
                        if (typewriterTimer) {
                            clearTimeout(typewriterTimer);
                            typewriterTimer = null;
                        }
                        isTyping = false;

                        // 隐藏容器
                        $transcriptionContainer.slideUp(200, function () {
                            // 玩家侧语音消息：折叠时保留文本，下次展开时直接显示（不再播放打字机效果）
                            // 这样用户体验更好：第一次展开有打字机效果，之后直接显示
                            // 不需要清空文本
                        });
                    }
                });
            } else {
                // 角色侧：图标在左，时长在右
                $bubble.append($icon, $duration);

                // 未读红点：仅对角色侧语音消息生效，且显示在气泡外侧
                if (message.voice_read !== true) {
                    $voiceUnreadDot = $(
                        '<span class="xiaoxin-wechat-voice-unread-dot"></span>'
                    );
                }

                // 为角色侧语音消息添加点击事件（文字转写展开/折叠）
                // 点击语音气泡的处理函数
                // 即使没有文字转写内容，也绑定点击事件（用于标记已读）
                $bubble.on("click", function (e) {
                    e.stopPropagation(); // 阻止事件冒泡

                    // 标记为已读
                    if (message.voice_read !== true) {
                        message.voice_read = true;
                        isVoiceRead = true; // 更新本地变量
                        if ($voiceUnreadDot) {
                            $voiceUnreadDot.remove();
                        }
                        try {
                            if (
                                window.XiaoxinWeChatDataHandler &&
                                typeof window.XiaoxinWeChatDataHandler
                                    .markVoiceMessageRead === "function"
                            ) {
                                var chatId =
                                    (contact && contact.id) ||
                                    message.chatUserId ||
                                    message.to;
                                window.XiaoxinWeChatDataHandler.markVoiceMessageRead(
                                    chatId,
                                    message.id
                                );
                            }
                        } catch (e) {
                            console.warn(
                                "[小馨手机][微信聊天UI] 标记语音已读失败:",
                                e
                            );
                        }

                        // 通知主页刷新预览颜色
                        window.dispatchEvent(
                            new CustomEvent(
                                "xiaoxin-wechat-voice-read-updated",
                                {
                                    detail: {
                                        messageId: message.id,
                                    },
                                }
                            )
                        );
                    }

                    // 处理文字转写展开/折叠
                    // 如果没有文字转写内容或容器不存在，不处理
                    if (
                        !$transcriptionContainer ||
                        !transcriptionContent ||
                        transcriptionContent.trim() === ""
                    ) {
                        return;
                    }

                    if (!isTranscriptionExpanded) {
                        // 展开：显示文字转写
                        isTranscriptionExpanded = true;

                        // 清除之前的定时器
                        if (typewriterTimer) {
                            clearTimeout(typewriterTimer);
                            typewriterTimer = null;
                        }
                        isTyping = false;

                        // 先显示容器
                        $transcriptionContainer.slideDown(200, function () {
                            // 如果语音已读，直接显示完整文字，否则播放打字机效果
                            if (isVoiceRead) {
                                $transcriptionText.text(transcriptionContent);
                            } else {
                                // 在动画完成后开始打字机效果
                                typewriterEffect(
                                    $transcriptionText,
                                    transcriptionContent
                                );
                            }

                            // 滚动到能完全显示该消息的位置（而不是滚动到底部）
                            setTimeout(function () {
                                scrollToMessage($transcriptionContainer);
                            }, 100);
                        });
                    } else {
                        // 折叠：隐藏文字转写
                        isTranscriptionExpanded = false;

                        // 清除打字机定时器
                        if (typewriterTimer) {
                            clearTimeout(typewriterTimer);
                            typewriterTimer = null;
                        }
                        isTyping = false;

                        // 隐藏容器
                        $transcriptionContainer.slideUp(200, function () {
                            // 如果语音未读，清空文本以便下次展开时重新播放打字机效果
                            // 如果已读，保留文本以便下次直接显示
                            if (!isVoiceRead) {
                                $transcriptionText.text("");
                            }
                        });
                    }
                });

                // 将文字转写容器添加到消息内容容器中（在气泡下方，与气泡对齐）
                // 注意：需要在 $messageContent.append() 之后添加，所以先保存引用
                // 在组装消息内容时再添加
            }
        } else if (message.type === "image") {
            // 初始化变量
            var imageContent = message.image || message.content || message.desc || "";
            var isImageDescription = false;

            // ⚠️ 重要：防止同一条消息同时生成多次
            // 使用消息ID作为键，记录正在生成的消息
            if (!window._xiaoxinImageGenerating) {
                window._xiaoxinImageGenerating = {};
            }
            var isGenerating = window._xiaoxinImageGenerating[message.id] === true;

            // 移除旧的占位符文本
            $bubble.addClass("xiaoxin-wechat-chat-message-image");

            // 辅助函数：组装消息并返回
            function assembleAndReturnMessage() {
                // 组装消息项并返回
                if (isSystemMessage) {
                    $messageContent.addClass("xiaoxin-wechat-chat-message-content-system");
                    $messageContent.append($bubble);
                } else if (isPlayerMessage) {
                    $messageContent.append($bubble, $avatar);
                } else {
                    $messageContent.append($avatar, $bubble);
                }
                $messageItem.append($messageContent);
                return $messageItem;
            }

            function setCachedImageUrlById(msgId, url) {
                if (!msgId || !url || !window.localStorage) return;
                try {
                    var key = "xiaoxin_image_url_" + String(msgId);
                    localStorage.setItem(key, String(url));
                } catch (e) {}
            }

            // 如果消息还没有 image 字段，但之前已经为该 msg.id 生成过图片，则优先使用本地缓存
            if (
                (!message.image || !message.image.trim()) &&
                message.id &&
                !imageContent
            ) {
                var cachedUrl = getCachedImageUrlById(message.id);
                if (cachedUrl) {
                    console.info(
                        "[小馨手机][微信聊天UI] 使用本地缓存的图片URL，避免重复生成:",
                        cachedUrl.substring(0, 80) + "..."
                    );
                    message.image = cachedUrl;
                    imageContent = cachedUrl;
                    isImageDescription = false;
                }
            }

            // 支持本地图片短引用：local:<msgId>
            // 渲染时从 localStorage 取回 dataURL，避免把 base64 塞进消息文本
            function resolveLocalImageUrl(maybeLocalUrl) {
                try {
                    if (
                        typeof maybeLocalUrl === "string" &&
                        maybeLocalUrl.trim().toLowerCase().startsWith("local:")
                    ) {
                        var localId = maybeLocalUrl.trim().slice("local:".length);
                        var key = "xiaoxin_local_image_" + String(localId);
                        var stored = localStorage.getItem(key);
                        if (stored && stored.startsWith("data:image")) return stored;
                    }
                } catch (e) {}
                return null;
            }

            // ⚠️ 重要：优先检查消息是否已处理（_processed = true）
            // 如果已处理，直接使用已有的图片URL，不再生成（无论是否历史消息）
            if (message._processed === true) {
                var processedImageUrl = message.image || message.content;
                if (processedImageUrl && typeof processedImageUrl === "string") {
                    var processedUrl = processedImageUrl.trim();
                    var isProcessedUrl =
                        processedUrl.startsWith("http://") ||
                        processedUrl.startsWith("https://") ||
                        processedUrl.startsWith("/") ||
                        processedUrl.toLowerCase().startsWith("local:") ||
                        processedUrl.startsWith("data:image") ||
                        /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(processedUrl);

                    if (isProcessedUrl) {
                        console.info(
                            "[小馨手机][微信聊天UI] 消息已处理（_processed=true），直接使用已有图片URL:",
                            processedUrl.substring(0, 50) + "..."
                        );
                        var displayUrl = processedUrl;
                        if (processedUrl.toLowerCase().startsWith("local:")) {
                            displayUrl = resolveLocalImageUrl(processedUrl) || processedUrl;
                        }
                        var $img = $(
                            '<img class="xiaoxin-wechat-chat-message-image-img" src="' +
                                escapeHtml(displayUrl) +
                                '">'
                        );
                        $img.on("load", function () {
                            adjustImageSize($(this));
                        });
                        $img.css("cursor", "pointer");
                        $img.attr("title", "点击放大查看");
                        $img.on("click", function (e) {
                            e.stopPropagation();
                            var imgUrl = $(this).attr("src");
                            if (imgUrl && !imgUrl.includes("微信默认头像")) {
                                imageViewer.show(imgUrl);
                            }
                        });
                        $bubble.append($img);
                        return assembleAndReturnMessage(); // 提前返回，不再执行后续的图片生成逻辑
                    }
                }
            }

            // ⚠️ 重要：优先检查 message.image 或 message.content 是否已经是有效的URL
            // 如果是URL，直接使用，不再生成图片（无论是否历史消息）
            var hasValidImageUrl = false;
            var existingImageUrl = null;

            // 优先检查 message.image
            if (message.image && typeof message.image === "string" && message.image.trim()) {
                var imageUrl = message.image.trim();
                var isValidImageUrl =
                    imageUrl.startsWith("http://") ||
                    imageUrl.startsWith("https://") ||
                    imageUrl.startsWith("/") ||
                    imageUrl.toLowerCase().startsWith("local:") ||
                    imageUrl.startsWith("data:image") ||
                    /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(imageUrl);

                if (isValidImageUrl) {
                    hasValidImageUrl = true;
                    existingImageUrl = imageUrl;
                    console.info(
                        "[小馨手机][微信聊天UI] 消息已有图片URL（message.image），直接使用:",
                        imageUrl.substring(0, 50) + "..."
                    );
                }
            }

            // 如果 message.image 不是URL，检查 message.content
            if (!hasValidImageUrl && message.content && typeof message.content === "string" && message.content.trim()) {
                var contentUrl = message.content.trim();
                var isContentUrl =
                    contentUrl.startsWith("http://") ||
                    contentUrl.startsWith("https://") ||
                    contentUrl.startsWith("/") ||
                    contentUrl.toLowerCase().startsWith("local:") ||
                    contentUrl.startsWith("data:image") ||
                    /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(contentUrl);

                if (isContentUrl) {
                    hasValidImageUrl = true;
                    existingImageUrl = contentUrl;
                    console.info(
                        "[小馨手机][微信聊天UI] 消息已有图片URL（message.content），直接使用:",
                        contentUrl.substring(0, 50) + "..."
                    );
                }
            }

            // 如果已有有效的图片URL，直接使用，不再生成
            // ⚠️ 重要：这是从持久化存储加载的消息，如果已有图片URL，说明已经生成过，直接使用
            if (hasValidImageUrl && existingImageUrl) {
                // 如果是 local: 引用，尝试解析为 dataURL
                if (existingImageUrl.toLowerCase().startsWith("local:")) {
                    imageContent = resolveLocalImageUrl(existingImageUrl) || existingImageUrl;
                } else {
                    imageContent = existingImageUrl;
                }
                isImageDescription = false;

                // 直接显示图片，不再执行后续的生成逻辑
                var displayUrl = existingImageUrl;
                if (existingImageUrl.toLowerCase().startsWith("local:")) {
                    displayUrl = resolveLocalImageUrl(existingImageUrl) || existingImageUrl;
                }
                var $img = $(
                    '<img class="xiaoxin-wechat-chat-message-image-img" src="' +
                        escapeHtml(displayUrl) +
                        '">'
                );
                $img.on("load", function () {
                    adjustImageSize($(this));
                });
                $img.css("cursor", "pointer");
                $img.attr("title", "点击放大查看");
                $img.on("click", function (e) {
                    e.stopPropagation();
                    var imgUrl = $(this).attr("src");
                    if (imgUrl && !imgUrl.includes("微信默认头像")) {
                        imageViewer.show(imgUrl);
                    }
                });
                $bubble.append($img);

                // ⚠️ 重要：标记为已处理（无论是否历史消息），避免重复生成
                // 如果消息还没有 _processed 标记，设置并保存
                if (message._processed !== true) {
                    message._processed = true;
                    // 保存_processed标记到持久化存储
                    // ⚠️ 重要：修复角色侧消息的 chatId 获取逻辑
                    try {
                        // 对于角色侧消息，chatId 应该是 message.from（角色ID）
                        // 对于玩家消息，chatId 应该是 message.to（角色ID）或 contact.id
                        var chatId = null;

                        // 优先使用 contact.id（如果存在）
                        if (contact && contact.id) {
                            chatId = contact.id;
                        }
                        // 如果 contact.id 不存在，根据消息方向判断
                        else if (message.chatUserId) {
                            chatId = message.chatUserId;
                        }
                        // 对于角色侧消息（isPlayerMessage = false），使用 message.from
                        else if (!isPlayerMessage && message.from) {
                            chatId = message.from;
                        }
                        // 对于玩家消息（isPlayerMessage = true），使用 message.to
                        else if (isPlayerMessage && message.to) {
                            chatId = message.to;
                        }
                        // 最后兜底使用全局 chatUserId
                        else {
                            chatId = chatUserId;
                        }

                        if (
                            chatId &&
                            message.id &&
                            window.XiaoxinWeChatDataHandler &&
                            typeof window.XiaoxinWeChatDataHandler.updateChatMessage === "function"
                        ) {
                            window.XiaoxinWeChatDataHandler.updateChatMessage(
                                chatId,
                                message.id,
                                { _processed: true, image: existingImageUrl }
                            );
                            console.info(
                                "[小馨手机][微信聊天UI] 已保存图片消息_processed标记（从持久化存储加载）:",
                                chatId,
                                message.id,
                                "isPlayerMessage:",
                                isPlayerMessage
                            );
                        } else {
                            console.warn(
                                "[小馨手机][微信聊天UI] 无法保存图片消息_processed标记（从持久化存储加载）:",
                                "chatId:",
                                chatId,
                                "message.id:",
                                message.id,
                                "isPlayerMessage:",
                                isPlayerMessage
                            );
                        }
                    } catch (error) {
                        console.warn(
                            "[小馨手机][微信聊天UI] 保存图片消息_processed标记失败:",
                            error
                        );
                    }
                }

                return assembleAndReturnMessage(); // 提前返回，不再执行后续的图片生成逻辑
            }

            // ⚠️ 重要：如果 message.image 存在但不是URL格式，可能是图片描述
            // 但只有在 message._processed !== true 且 message.content 也不是URL时，才认为是描述
            // 如果消息已处理过，即使 image 字段不是URL，也不应该再生成
            if (
                message.image &&
                typeof message.image === "string" &&
                message.image.trim() &&
                message._processed !== true
            ) {
                var imageUrl = message.image.trim();
                var isValidImageUrl =
                    imageUrl.startsWith("http://") ||
                    imageUrl.startsWith("https://") ||
                    imageUrl.startsWith("/") ||
                    imageUrl.toLowerCase().startsWith("local:") ||
                    imageUrl.startsWith("data:image") ||
                    /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(imageUrl);

                if (!isValidImageUrl) {
                    // message.image 存在但不是URL格式，且消息未处理过，可能是图片描述，需要生成
                    imageContent = imageUrl;
                }
            }

            // 额外检查：如果消息已经处理过，直接使用已有数据，不再生成
            // ⚠️ 这个检查必须在所有其他逻辑之前，确保已处理的消息不会重复生成（无论是否历史消息）
            if (message._processed === true) {
                console.info(
                    "[小馨手机][微信聊天UI] 消息已处理（_processed=true），跳过图片生成:",
                    message.id,
                    "message.image:",
                    message.image ? message.image.substring(0, 50) + "..." : "无",
                    "message.content:",
                    message.content ? message.content.substring(0, 50) + "..." : "无"
                );

                // 历史消息已处理，直接使用 message.image 或 message.content
                var hasValidImage = false;

                // 优先检查 message.image
                if (message.image && typeof message.image === "string") {
                    var processedImageUrl = message.image.trim();
                    var isProcessedImageUrl =
                        processedImageUrl.startsWith("http://") ||
                        processedImageUrl.startsWith("https://") ||
                        processedImageUrl.startsWith("/") ||
                        processedImageUrl.toLowerCase().startsWith("local:") ||
                        processedImageUrl.startsWith("data:image") ||
                        /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(processedImageUrl);

                    if (isProcessedImageUrl) {
                        console.info(
                            "[小馨手机][微信聊天UI] 历史消息已处理，直接使用已有图片URL:",
                            processedImageUrl.substring(0, 50) + "..."
                        );
                        if (processedImageUrl.toLowerCase().startsWith("local:")) {
                            imageContent =
                                resolveLocalImageUrl(processedImageUrl) ||
                                processedImageUrl;
                        } else {
                            imageContent = processedImageUrl;
                        }
                        isImageDescription = false;
                        hasValidImage = true;
                        // 直接显示图片，不再执行后续的生成逻辑
                        var processedDisplayUrl = processedImageUrl;
                        if (processedImageUrl.toLowerCase().startsWith("local:")) {
                            processedDisplayUrl =
                                resolveLocalImageUrl(processedImageUrl) ||
                                processedImageUrl;
                        }
                        var $img = $(
                            '<img class="xiaoxin-wechat-chat-message-image-img" src="' +
                                escapeHtml(processedDisplayUrl) +
                                '">'
                        );
                        $img.on("load", function () {
                            adjustImageSize($(this));
                        });
                        $img.css("cursor", "pointer");
                        $img.attr("title", "点击放大查看");
                        $img.on("click", function (e) {
                            e.stopPropagation();
                            var imgUrl = $(this).attr("src");
                            if (imgUrl && !imgUrl.includes("微信默认头像")) {
                                imageViewer.show(imgUrl);
                            }
                        });
                        $bubble.append($img);
                        return assembleAndReturnMessage(); // 提前返回，不再执行后续的图片生成逻辑
                    }
                }

                // 如果 message.image 不存在或不是URL，检查 message.content
                if (!hasValidImage && message.content && typeof message.content === "string") {
                    var contentUrl = message.content.trim();
                    var isContentUrl =
                        contentUrl.startsWith("http://") ||
                        contentUrl.startsWith("https://") ||
                        contentUrl.startsWith("/") ||
                        contentUrl.toLowerCase().startsWith("local:") ||
                        contentUrl.startsWith("data:image") ||
                        /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(contentUrl);
                    if (isContentUrl) {
                        console.info(
                            "[小馨手机][微信聊天UI] 历史消息已处理，直接使用content中的图片URL:",
                            contentUrl.substring(0, 50) + "..."
                        );
                        if (contentUrl.toLowerCase().startsWith("local:")) {
                            imageContent =
                                resolveLocalImageUrl(contentUrl) || contentUrl;
                        } else {
                            imageContent = contentUrl;
                        }
                        isImageDescription = false;
                        hasValidImage = true;
                        // 直接显示图片，不再执行后续的生成逻辑
                        var contentDisplayUrl = contentUrl;
                        if (contentUrl.toLowerCase().startsWith("local:")) {
                            contentDisplayUrl =
                                resolveLocalImageUrl(contentUrl) || contentUrl;
                        }
                        var $img = $(
                            '<img class="xiaoxin-wechat-chat-message-image-img" src="' +
                                escapeHtml(contentDisplayUrl) +
                                '">'
                        );
                        $img.on("load", function () {
                            adjustImageSize($(this));
                        });
                        $img.css("cursor", "pointer");
                        $img.attr("title", "点击放大查看");
                        $img.on("click", function (e) {
                            e.stopPropagation();
                            var imgUrl = $(this).attr("src");
                            if (imgUrl && !imgUrl.includes("微信默认头像")) {
                                imageViewer.show(imgUrl);
                            }
                        });
                        $bubble.append($img);
                        return assembleAndReturnMessage(); // 提前返回，不再执行后续的图片生成逻辑
                    }
                }

                // 如果历史消息已处理但没有有效的图片URL，使用默认图片并跳过生成
                if (!hasValidImage) {
                    console.info(
                        "[小馨手机][微信聊天UI] 历史消息已处理但没有有效图片URL，使用默认图片:",
                        message.id
                    );
                    var $defaultImg = $('<img class="xiaoxin-wechat-chat-message-image-img" src="/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg">');
                    $defaultImg.css("opacity", "0.5");
                    adjustImageSize($defaultImg);
                    $bubble.append($defaultImg);
                    return assembleAndReturnMessage(); // 提前返回，不再执行后续的图片生成逻辑
                }
            }

            // 额外检查：如果是历史消息且 message.image 已经是URL，直接使用，不再生成
            // 这样可以避免历史消息在刷新后重复生成图片
            // ⚠️ 注意：这个检查必须在 _processed 检查之后，作为备用检查
            if (isImageDescription && message.isHistorical && !message._processed) {
                // 检查 message.image 是否已经是有效的URL（可能从持久化存储中恢复）
                if (message.image && typeof message.image === "string") {
                    var historicalImageUrl = message.image.trim();
                    var isHistoricalImageUrl =
                        historicalImageUrl.startsWith("http://") ||
                        historicalImageUrl.startsWith("https://") ||
                        historicalImageUrl.startsWith("/") ||
                        historicalImageUrl.toLowerCase().startsWith("local:") ||
                        historicalImageUrl.startsWith("data:image") ||
                        /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(historicalImageUrl);

                    if (isHistoricalImageUrl) {
                        console.info(
                            "[小馨手机][微信聊天UI] 历史消息已有图片URL，直接使用，不再生成:",
                            historicalImageUrl.substring(0, 50) + "..."
                        );
                        imageContent = historicalImageUrl;
                        isImageDescription = false;
                        // 标记为已处理并保存
                        message._processed = true;
                        // 立即保存到持久化存储
                        try {
                            var chatId =
                                (contact && contact.id) ||
                                message.chatUserId ||
                                message.to ||
                                chatUserId;
                            if (
                                chatId &&
                                message.id &&
                                window.XiaoxinWeChatDataHandler &&
                                typeof window.XiaoxinWeChatDataHandler.updateChatMessage === "function"
                            ) {
                                window.XiaoxinWeChatDataHandler.updateChatMessage(
                                    chatId,
                                    message.id,
                                    { _processed: true }
                                );
                                console.info(
                                    "[小馨手机][微信聊天UI] 已保存历史消息_processed标记:",
                                    chatId,
                                    message.id
                                );
                            }
                        } catch (error) {
                            console.warn(
                                "[小馨手机][微信聊天UI] 保存历史消息_processed标记失败:",
                                error
                            );
                        }
                    }
                }
            }

            // 判断是否是图片描述：
            // 1. 如果内容为空，不是描述
            // 2. 如果内容以 http:// 或 https:// 开头，是URL，不是描述
            // 3. 如果内容以 / 开头（本地路径），是URL，不是描述
            // 4. 如果内容包含常见的图片扩展名，可能是URL，不是描述
            // 5. 如果内容包含 data:image（base64图片），是URL，不是描述
            // 6. 如果内容是表情包ID（以 sticker_ 开头），是表情包，不是描述
            // 7. 其他情况认为是描述文本，需要生成图片
            if (imageContent && imageContent.trim() && !isImageDescription) {
                var trimmedContent = imageContent.trim();

                // 首先检查是否是表情包ID（以 sticker_ 开头）
                // 如果是表情包ID，应该当作表情包处理，而不是图片描述
                var isStickerId = trimmedContent.startsWith("sticker_");

                // 检查是否是URL格式
                var isUrl =
                    trimmedContent.startsWith("http://") ||
                    trimmedContent.startsWith("https://") ||
                    trimmedContent.startsWith("/") ||
                    trimmedContent.toLowerCase().startsWith("local:") ||
                    trimmedContent.startsWith("data:image") ||
                    /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(
                        trimmedContent
                    );

                // 如果不是URL格式，也不是表情包ID，则认为是描述文本
                if (!isUrl && !isStickerId) {
                    isImageDescription = true;
                } else if (isStickerId) {
                    // 如果是表情包ID，但消息类型是 image，应该当作表情包处理
                    // 转换为表情包消息类型
                    console.info(
                        "[小馨手机][微信聊天UI] 检测到表情包ID但消息类型为image，转换为emoji类型:",
                        trimmedContent
                    );
                    // 将消息类型改为 emoji，并重新渲染
                    message.type = "emoji";
                    message.content = trimmedContent;
                    // 重新渲染为表情包消息
                    $bubble.removeClass("xiaoxin-wechat-chat-message-image");
                    $bubble.addClass("xiaoxin-wechat-chat-message-emoji");
                    var emojiPath = "";
                    if (
                        window.XiaoxinWeChatApp &&
                        typeof window.XiaoxinWeChatApp._getEmojiPath ===
                            "function"
                    ) {
                        emojiPath =
                            window.XiaoxinWeChatApp._getEmojiPath(
                                trimmedContent
                            );
                    } else {
                        // 降级处理：使用默认路径
                        emojiPath =
                            "/scripts/extensions/third-party/xiaoxin-phone/image/表情包/" +
                            trimmedContent;
                    }
                    $bubble.append(
                        $(
                            '<img class="xiaoxin-wechat-chat-message-emoji-img" src="' +
                                escapeHtml(emojiPath) +
                                '">'
                        )
                    );
                    return assembleAndReturnMessage(); // 提前返回，不再执行后续的图片处理逻辑
                }
            }

            // 确保一条消息只显示一张图片
            if (isImageDescription) {
                // 如果消息已处理过，跳过生成（无论是否历史消息）
                if (message._processed === true) {
                    console.info(
                        "[小馨手机][微信聊天UI] 图片消息已处理，跳过生成:",
                        message.id
                    );
                    // 如果已有图片URL，直接使用
                    if (message.image && typeof message.image === "string") {
                        var processedImageUrl = message.image.trim();
                        var isProcessedImageUrl =
                            processedImageUrl.startsWith("http://") ||
                            processedImageUrl.startsWith("https://") ||
                            processedImageUrl.startsWith("/") ||
                            processedImageUrl.toLowerCase().startsWith("local:") ||
                            processedImageUrl.startsWith("data:image") ||
                            /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(processedImageUrl);

                        if (isProcessedImageUrl) {
                            if (processedImageUrl.toLowerCase().startsWith("local:")) {
                                processedImageUrl = resolveLocalImageUrl(processedImageUrl) || processedImageUrl;
                            }
                            var $img = $('<img class="xiaoxin-wechat-chat-message-image-img" src="' + escapeHtml(processedImageUrl) + '">');
                            $img.on("load", function () {
                                adjustImageSize($(this));
                            });
                            $img.css("cursor", "pointer");
                            $img.attr("title", "点击放大查看");
                            $img.on("click", function (e) {
                                e.stopPropagation();
                                var imgUrl = $(this).attr("src");
                                if (imgUrl && !imgUrl.includes("微信默认头像")) {
                                    imageViewer.show(imgUrl);
                                }
                            });
                            $bubble.append($img);
                            return assembleAndReturnMessage(); // 提前返回，不再执行后续生成逻辑
                        }
                    }
                    // 如果没有图片URL，可能是描述文本，但已处理过，使用默认图片
                    var $defaultImg = $('<img class="xiaoxin-wechat-chat-message-image-img" src="/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg">');
                    $defaultImg.css("opacity", "0.5");
                    adjustImageSize($defaultImg);
                    $bubble.append($defaultImg);
                    return assembleAndReturnMessage(); // 提前返回，不再执行后续生成逻辑
                }

                // ⚠️ 重要：在生成图片之前，再次检查 message.image 或 message.content 是否是有效URL
                // 即使没有 _processed 标记，如果已有有效URL，也应该直接使用，不再生成
                var finalCheckImageUrl = message.image || message.content || "";
                if (finalCheckImageUrl && typeof finalCheckImageUrl === "string") {
                    var finalCheckUrl = finalCheckImageUrl.trim();
                    var isFinalCheckUrl =
                        finalCheckUrl.startsWith("http://") ||
                        finalCheckUrl.startsWith("https://") ||
                        finalCheckUrl.startsWith("/") ||
                        finalCheckUrl.toLowerCase().startsWith("local:") ||
                        finalCheckUrl.startsWith("data:image") ||
                        /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(finalCheckUrl);

                    if (isFinalCheckUrl) {
                        console.info(
                            "[小馨手机][微信聊天UI] 检测到消息已有有效图片URL（即使没有_processed标记），直接使用，不再生成:",
                            "消息ID:",
                            message.id,
                            "图片URL:",
                            finalCheckUrl.substring(0, 50) + "..."
                        );
                        var finalDisplayUrl = finalCheckUrl;
                        if (finalCheckUrl.toLowerCase().startsWith("local:")) {
                            finalDisplayUrl = resolveLocalImageUrl(finalCheckUrl) || finalCheckUrl;
                        }
                        var $finalImg = $(
                            '<img class="xiaoxin-wechat-chat-message-image-img" src="' +
                                escapeHtml(finalDisplayUrl) +
                                '">'
                        );
                        $finalImg.on("load", function () {
                            adjustImageSize($(this));
                        });
                        $finalImg.css("cursor", "pointer");
                        $finalImg.attr("title", "点击放大查看");
                        $finalImg.on("click", function (e) {
                            e.stopPropagation();
                            var imgUrl = $(this).attr("src");
                            if (imgUrl && !imgUrl.includes("微信默认头像")) {
                                imageViewer.show(imgUrl);
                            }
                        });
                        $bubble.append($finalImg);
                        return assembleAndReturnMessage(); // 提前返回，不再执行后续的图片生成逻辑
                    }
                }

                // 这是图片描述，需要生成图片
                // ⚠️ 重要：检查是否正在生成，防止重复生成
                if (isGenerating) {
                    console.info(
                        "[小馨手机][微信聊天UI] 消息正在生成图片，跳过重复生成:",
                        message.id
                    );
                    // 显示加载状态
                    var $loadingImg = $(
                        '<div class="xiaoxin-wechat-chat-message-image-loading"></div>'
                    );
                    $loadingImg.css({
                        width: "150px",
                        height: "150px",
                        background: "#f0f0f0",
                        "border-radius": "8px",
                        display: "flex",
                        "align-items": "center",
                        "justify-content": "center",
                        color: "#999",
                        "font-size": "14px",
                    });
                    $loadingImg.text("生成图片中...");
                    $bubble.append($loadingImg);
                    return assembleAndReturnMessage();
                }

                console.info(
                    "[小馨手机][微信聊天UI] 检测到图片描述，开始生成图片:",
                    imageContent.substring(0, 50) + "...",
                    "消息ID:",
                    message.id
                );

                // ⚠️ 重要：标记为正在生成，防止重复生成
                window._xiaoxinImageGenerating[message.id] = true;

                // 显示加载状态（使用默认尺寸，加载后会自动调整）
                var $loadingImg = $(
                    '<div class="xiaoxin-wechat-chat-message-image-loading"></div>'
                );
                $loadingImg.css({
                    width: "150px",
                    height: "150px",
                    background: "#f0f0f0",
                    "border-radius": "8px",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    color: "#999",
                    "font-size": "14px",
                });
                $loadingImg.text("生成图片中...");
                $bubble.append($loadingImg);

                // 调用图片生成API
                if (
                    window.XiaoxinAI &&
                    typeof window.XiaoxinAI.generateImage === "function"
                ) {
                    // 添加超时处理（35秒，比 image-api.js 中的超时稍长）
                    var timeoutId = setTimeout(function () {
                        console.warn(
                            "[小馨手机][微信聊天UI] 图片生成超时（35秒），使用默认图片"
                        );
                        $loadingImg.remove();
                        var $timeoutImg = $(
                            '<img class="xiaoxin-wechat-chat-message-image-img" src="/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg">'
                        );
                        adjustImageSize($timeoutImg);
                        $timeoutImg.css("opacity", "0.5");
                        $bubble.append($timeoutImg);
                    }, 35000);

                    // 获取玩家账号信息，用于根据玩家性别调整图片生成提示词
                    var playerAccount = null;
                    if (window.XiaoxinWeChatAccount) {
                        playerAccount = window.XiaoxinWeChatAccount.getCurrentAccount();
                    }

                    // 如果是玩家发送的图片消息，根据玩家性别调整提示词
                    var finalPrompt = imageContent;
                    if (isPlayerMessage && playerAccount && playerAccount.gender) {
                        var playerGender = String(playerAccount.gender).trim().toLowerCase();
                        // 如果提示词中没有明确指定性别，根据玩家性别添加性别描述
                        // 检查提示词中是否已经包含性别相关的词汇
                        var hasGenderInPrompt = /(男|女|男性|女性|男人|女人|男孩|女孩|male|female|man|woman|boy|girl)/i.test(finalPrompt);
                        // 检查描述词是否与人物相关，只有当与人物相关时才添加性别前缀
                        var isPersonRelated = /(人|人物|角色|自己|我|他|她|玩家|脸|手|身体|头发|眼睛|腿|脚|手臂|脸部|面容|表情|姿势|站|坐|走|跑|看|笑|哭|穿|戴|衣服|服装|裙子|裤子|上衣|外套)/i.test(finalPrompt);
                        if (!hasGenderInPrompt && isPersonRelated) {
                            // 根据玩家性别添加性别描述（仅当描述词与人物相关时）
                            if (playerGender === "男" || playerGender === "male" || playerGender === "m") {
                                finalPrompt = "男性，" + finalPrompt;
                            } else if (playerGender === "女" || playerGender === "female" || playerGender === "f") {
                                finalPrompt = "女性，" + finalPrompt;
                            }
                            console.info(
                                "[小馨手机][微信聊天UI] 根据玩家性别调整图片生成提示词:",
                                "玩家性别:",
                                playerGender,
                                "调整后提示词:",
                                finalPrompt.substring(0, 50) + "..."
                            );
                        }
                    }

                    // 使用配置中的正向和负向提示词（已在 image-api.js 中加载）
                    // 如果需要在聊天中覆盖配置，可以在这里传递 positivePrompt 和 negativePrompt
                    window.XiaoxinAI.generateImage({
                        prompt: finalPrompt,
                        // style 参数已废弃，改用配置中的正向提示词
                        // 如果需要覆盖，使用 positivePrompt 参数
                    })
                        .then(function (generatedUrl) {
                            clearTimeout(timeoutId);
                            // ⚠️ 重要：清除正在生成标记
                            if (window._xiaoxinImageGenerating && message.id) {
                                delete window._xiaoxinImageGenerating[message.id];
                            }

                            if (generatedUrl) {
                                // 移除加载状态
                                $loadingImg.remove();

                                // 创建图片元素，根据实际尺寸自动调整
                                var $img = $(
                                    '<img class="xiaoxin-wechat-chat-message-image-img" src="' +
                                        escapeHtml(generatedUrl) +
                                        '">'
                                );

                                // 图片加载成功后，根据实际尺寸调整
                                $img.on("load", function () {
                                    console.info(
                                        "[小馨手机][微信聊天UI] 图片加载成功:",
                                        generatedUrl
                                    );
                                    adjustImageSize($(this));
                                });

                                // 图片加载错误处理
                                var loadErrorCount = 0;
                                $img.on("error", function () {
                                    loadErrorCount++;
                                    console.warn(
                                        "[小馨手机][微信聊天UI] 生成的图片加载失败:",
                                        generatedUrl,
                                        "重试次数:",
                                        loadErrorCount
                                    );

                                    // 如果是 pollinations.ai 的URL，可能是速率限制，尝试添加时间戳参数
                                    if (
                                        generatedUrl.includes(
                                            "pollinations.ai"
                                        ) &&
                                        loadErrorCount === 1
                                    ) {
                                        var retryUrl =
                                            generatedUrl +
                                            (generatedUrl.includes("?")
                                                ? "&"
                                                : "?") +
                                            "t=" +
                                            Date.now();
                                        console.log(
                                            "[小馨手机][微信聊天UI] 尝试使用新URL重试:",
                                            retryUrl
                                        );
                                        $(this).attr("src", retryUrl);
                                    } else {
                                        // 最终失败，使用默认图片
                                        $(this).attr(
                                            "src",
                                            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg"
                                        );
                                        $(this).css("opacity", "0.5");
                                        // 移除点击放大功能（因为是占位图）
                                        $(this).css("cursor", "default");
                                        $(this).off("click");
                                        $(this).removeAttr("title");
                                        adjustImageSize($(this));
                                    }
                                });

                                // 添加点击放大功能
                                $img.css("cursor", "pointer");
                                $img.attr("title", "点击放大查看");
                                $img.on("click", function (e) {
                                    e.stopPropagation();
                                    var imgUrl = $(this).attr("src");
                                    if (
                                        imgUrl &&
                                        !imgUrl.includes("微信默认头像")
                                    ) {
                                        imageViewer.show(imgUrl);
                                    }
                                });

                                $bubble.append($img);

                                // 更新消息对象中的图片URL
                                message.content = generatedUrl;
                                message.image = generatedUrl;
                                // 标记为已处理，避免重复生成
                                message._processed = true;

                                // 同步写入本地缓存，后续刷新时可直接使用，避免重复生成
                                if (message.id) {
                                    setCachedImageUrlById(message.id, generatedUrl);
                                }

                                // 保存_processed标记和图片URL到持久化存储（无论是否历史消息）
                                // ⚠️ 重要：修复角色侧消息的 chatId 获取逻辑
                                try {
                                    // 对于角色侧消息，chatId 应该是 message.from（角色ID）
                                    // 对于玩家消息，chatId 应该是 message.to（角色ID）或 contact.id
                                    var chatId = null;

                                    // 优先使用 contact.id（如果存在）
                                    if (contact && contact.id) {
                                        chatId = contact.id;
                                    }
                                    // 如果 contact.id 不存在，根据消息方向判断
                                    else if (message.chatUserId) {
                                        chatId = message.chatUserId;
                                    }
                                    // 对于角色侧消息（isPlayerMessage = false），使用 message.from
                                    else if (!isPlayerMessage && message.from) {
                                        chatId = message.from;
                                    }
                                    // 对于玩家消息（isPlayerMessage = true），使用 message.to
                                    else if (isPlayerMessage && message.to) {
                                        chatId = message.to;
                                    }
                                    // 最后兜底使用全局 chatUserId
                                    else {
                                        chatId = chatUserId;
                                    }

                                    if (
                                        chatId &&
                                        message.id &&
                                        window.XiaoxinWeChatDataHandler &&
                                        typeof window.XiaoxinWeChatDataHandler.updateChatMessage === "function"
                                    ) {
                                        window.XiaoxinWeChatDataHandler.updateChatMessage(
                                            chatId,
                                            message.id,
                                            {
                                                _processed: true,
                                                image: generatedUrl,
                                                content: generatedUrl
                                            }
                                        );
                                        console.info(
                                            "[小馨手机][微信聊天UI] 已保存图片消息_processed标记和图片URL:",
                                            chatId,
                                            message.id,
                                            generatedUrl.substring(0, 50) + "...",
                                            "isPlayerMessage:",
                                            isPlayerMessage
                                        );
                                    } else {
                                        console.warn(
                                            "[小馨手机][微信聊天UI] 无法保存图片消息_processed标记:",
                                            "chatId:",
                                            chatId,
                                            "message.id:",
                                            message.id,
                                            "isPlayerMessage:",
                                            isPlayerMessage,
                                            "message.from:",
                                            message.from,
                                            "message.to:",
                                            message.to
                                        );
                                    }
                                } catch (error) {
                                    console.warn(
                                        "[小馨手机][微信聊天UI] 保存图片消息_processed标记失败:",
                                        error
                                    );
                                }

                                console.info(
                                    "[小馨手机][微信聊天UI] 图片生成成功:",
                                    generatedUrl
                                );
                            } else {
                                console.warn(
                                    "[小馨手机][微信聊天UI] 图片生成失败，使用默认图片"
                                );
                                $loadingImg.remove();
                                var $defaultImg = $(
                                    '<img class="xiaoxin-wechat-chat-message-image-img" src="/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg">'
                                );
                                adjustImageSize($defaultImg);
                                // 默认图片不添加点击放大功能（因为是占位图）
                                $bubble.append($defaultImg);
                            }
                        })
                        .catch(function (error) {
                            clearTimeout(timeoutId);
                            // ⚠️ 重要：清除正在生成标记
                            if (window._xiaoxinImageGenerating && message.id) {
                                delete window._xiaoxinImageGenerating[message.id];
                            }

                            console.error(
                                "[小馨手机][微信聊天UI] 图片生成异常:",
                                error
                            );
                            $loadingImg.remove();
                            var $errorImg = $(
                                '<img class="xiaoxin-wechat-chat-message-image-img" src="/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg">'
                            );
                            $errorImg.css("opacity", "0.5");
                            adjustImageSize($errorImg);
                            // 错误图片不添加点击放大功能（因为是占位图）
                            $bubble.append($errorImg);
                        });
                } else {
                    console.warn(
                        "[小馨手机][微信聊天UI] 图片生成API未配置，使用默认图片"
                    );
                    $loadingImg.remove();
                    var $defaultImg = $(
                        '<img class="xiaoxin-wechat-chat-message-image-img" src="/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg">'
                    );
                    adjustImageSize($defaultImg);
                    // 默认图片不添加点击放大功能（因为是占位图）
                    $bubble.append($defaultImg);
                }
            } else {
                // 直接显示图片URL（已有URL的情况）
                if (imageContent) {
                    // 如果是 local: 引用，这里再兜底解析一次，确保显示的是原图
                    if (
                        typeof imageContent === "string" &&
                        imageContent.trim().toLowerCase().startsWith("local:")
                    ) {
                        imageContent =
                            resolveLocalImageUrl(imageContent) || imageContent;
                    }
                    var $img = $(
                        '<img class="xiaoxin-wechat-chat-message-image-img" src="' +
                            escapeHtml(imageContent) +
                            '">'
                    );

                    // 图片加载成功后，根据实际尺寸调整
                    $img.on("load", function () {
                        adjustImageSize($(this));
                    });

                    // 添加点击放大功能
                    $img.css("cursor", "pointer");
                    $img.attr("title", "点击放大查看");
                    $img.on("click", function (e) {
                        e.stopPropagation();
                        var imgUrl = $(this).attr("src");
                        if (imgUrl && !imgUrl.includes("微信默认头像")) {
                            imageViewer.show(imgUrl);
                        }
                    });

                    $bubble.append($img);
                }
            }

            // 组装消息项并返回
            return assembleAndReturnMessage();
        } else if (message.type === "photo") {
            // 照片消息：只显示图片，不显示气泡样式和描述
            // 移除气泡样式类，让图片直接显示
            $bubble.removeClass("xiaoxin-wechat-chat-message-bubble");
            $bubble.addClass("xiaoxin-wechat-chat-message-photo");
            $bubble.css({
                "background": "none",
                "border": "none",
                "padding": "0",
                "box-shadow": "none"
            });

            // 获取图片URL
            var photoUrl = message.image || message.content || "";

            // 如果有图片URL，显示图片
            if (photoUrl && typeof photoUrl === "string" && photoUrl.trim()) {
                var imageUrl = photoUrl.trim();
                // 支持本地图片短引用：local:<msgId>
                if (imageUrl.toLowerCase().startsWith("local:")) {
                    try {
                        var localId = imageUrl.slice("local:".length);
                        var key = "xiaoxin_local_image_" + String(localId);
                        var stored = localStorage.getItem(key);
                        if (stored && stored.startsWith("data:image")) {
                            imageUrl = stored;
                            console.info(
                                "[小馨手机][微信聊天UI] 解析本地图片引用成功:",
                                localId
                            );
                        } else {
                            console.warn(
                                "[小馨手机][微信聊天UI] 本地图片引用未找到:",
                                localId,
                                "key:",
                                key
                            );
                        }
                    } catch (e) {
                        console.error(
                            "[小馨手机][微信聊天UI] 解析本地图片引用失败:",
                            e
                        );
                    }
                }

                // 使用 jQuery 创建 img 元素并安全设置 src 属性（不使用 escapeHtml，避免破坏URL）
                var $img = $('<img class="xiaoxin-wechat-chat-message-photo-img">');
                $img.attr("src", imageUrl);

                $img.on("load", function () {
                    adjustImageSize($(this));
                });

                $img.on("error", function () {
                    console.error(
                        "[小馨手机][微信聊天UI] 照片消息图片加载失败:",
                        imageUrl.length > 100 ? imageUrl.substring(0, 100) + "..." : imageUrl
                    );
                    $(this).hide();
                });

                $img.css("cursor", "pointer");
                $img.attr("title", "点击放大查看");
                $img.on("click", function (e) {
                    e.stopPropagation();
                    var imgUrl = $(this).attr("src");
                    if (imgUrl && !imgUrl.includes("微信默认头像")) {
                        imageViewer.show(imgUrl);
                    }
                });

                // 清空气泡内容，只添加图片
                $bubble.empty();
                $bubble.append($img);
            } else {
                console.warn(
                    "[小馨手机][微信聊天UI] 照片消息没有图片URL:",
                    "message.image:",
                    message.image,
                    "message.content:",
                    message.content
                );
                // 如果没有图片URL，清空气泡内容
                $bubble.empty();
            }
        } else if (message.type === "emoji") {
            $bubble.addClass("xiaoxin-wechat-chat-message-emoji");
            var emojiContent = message.content || "";
            // 使用 _getEmojiPath 函数来正确解析表情包路径（支持ID、URL、文件名）
            var emojiPath = "";
            if (
                window.XiaoxinWeChatApp &&
                typeof window.XiaoxinWeChatApp._getEmojiPath === "function"
            ) {
                emojiPath = window.XiaoxinWeChatApp._getEmojiPath(emojiContent);
            } else {
                // 降级处理：使用默认逻辑
                if (
                    emojiContent.startsWith("http://") ||
                    emojiContent.startsWith("https://") ||
                    emojiContent.startsWith("data:image") ||
                    (emojiContent.startsWith("/") &&
                        !emojiContent.startsWith("/scripts"))
                ) {
                    // 是URL格式，直接使用
                    emojiPath = emojiContent;
                } else {
                    // 是文件名格式，加上路径前缀
                    emojiPath =
                        "/scripts/extensions/third-party/xiaoxin-phone/image/表情包/" +
                        emojiContent;
                }
            }
            $bubble.append(
                $(
                    '<img class="xiaoxin-wechat-chat-message-emoji-img" src="' +
                        escapeHtml(emojiPath) +
                        '">'
                )
            );
        } else if (message.type === "redpacket") {
            // 红包消息
            console.info(
                "[小馨手机][微信聊天UI] 开始渲染红包消息:",
                "消息ID:",
                message.id,
                "type:",
                message.type,
                "redpacket_id:",
                message.redpacket_id,
                "amount:",
                message.amount,
                "note:",
                message.note,
                "_processed:",
                message._processed,
                "isOutgoing:",
                message.isOutgoing
            );
            // ⚠️ 重要：优先检查消息是否已处理（_processed = true）
            // 如果已处理，直接使用已有数据，避免重复处理（无论是否历史消息）
            // 注意：这个检查需要在 $avatar 创建之后，因为我们需要使用 $avatar
            // 但是红包消息不是系统消息，所以 $avatar 会被创建
            $bubble.addClass("xiaoxin-wechat-chat-message-redpacket");

            var amount = message.amount || 0;
            // 红包备注的优先级：note > greeting > content（因为红包的备注可能在content字段中）
            var note =
                message.note ||
                message.greeting ||
                message.content ||
                "恭喜发财, 大吉大利";

            // 检查红包是否已被领取
            var isClaimed =
                message.claimed === true ||
                message.status === "claimed" ||
                message.claimed_by !== undefined;

            // 创建红包容器
            var $redpacketContainer = $(
                '<div class="xiaoxin-wechat-chat-message-redpacket-container"></div>'
            );

            // 如果红包已被领取，添加已领取的样式类
            if (isClaimed) {
                $redpacketContainer.addClass(
                    "xiaoxin-wechat-chat-message-redpacket-claimed"
                );
            }

            // 红包图标容器
            var $redpacketIcon = $(
                '<div class="xiaoxin-wechat-chat-message-redpacket-icon"></div>'
            );

            if (isClaimed) {
                // 已领取的红包：显示打开的红包图标
                var $redpacketIconInner = $(
                    '<div class="xiaoxin-wechat-chat-message-redpacket-icon-inner xiaoxin-wechat-chat-message-redpacket-icon-opened">' +
                        '<div class="xiaoxin-wechat-chat-message-redpacket-icon-bg-opened"></div>' +
                        '<div class="xiaoxin-wechat-chat-message-redpacket-icon-flap"></div>' +
                        '<div class="xiaoxin-wechat-chat-message-redpacket-icon-circle">' +
                        '<span class="xiaoxin-wechat-chat-message-redpacket-icon-symbol">¥</span>' +
                        "</div>" +
                        "</div>"
                );
                // "已被领完"文字
                var $redpacketLabel = $(
                    '<div class="xiaoxin-wechat-chat-message-redpacket-label">已被领完</div>'
                );
            } else {
                // 未领取的红包：显示正常的红包图标
                var $redpacketIconInner = $(
                    '<div class="xiaoxin-wechat-chat-message-redpacket-icon-inner">' +
                        '<div class="xiaoxin-wechat-chat-message-redpacket-icon-bg"></div>' +
                        '<div class="xiaoxin-wechat-chat-message-redpacket-icon-circle">' +
                        '<span class="xiaoxin-wechat-chat-message-redpacket-icon-symbol">¥</span>' +
                        "</div>" +
                        "</div>"
                );
                // "微信红包"文字
                var $redpacketLabel = $(
                    '<div class="xiaoxin-wechat-chat-message-redpacket-label">微信红包</div>'
                );
            }
            $redpacketIcon.append($redpacketIconInner, $redpacketLabel);

            // 红包内容
            var $redpacketContent = $(
                '<div class="xiaoxin-wechat-chat-message-redpacket-content"></div>'
            );

            // 红包备注（祝福语）- 限制为9个字，多余用...省略
            // 但默认备注"恭喜发财, 大吉大利"要完整显示，不截断
            var $redpacketNote = $(
                '<div class="xiaoxin-wechat-chat-message-redpacket-note"></div>'
            );
            var defaultNote = "恭喜发财, 大吉大利";
            var displayNote = note || defaultNote;
            // 如果是默认备注，完整显示；其他备注超过9个字才截断
            if (displayNote !== defaultNote && displayNote.length > 9) {
                displayNote = displayNote.substring(0, 9) + "...";
            }
            $redpacketNote.text(displayNote);

            $redpacketContent.append($redpacketNote);
            $redpacketContainer.append($redpacketIcon, $redpacketContent);

            // 如果红包未领取且是角色发送的（不是玩家发送的），添加点击事件
            if (!isClaimed && !message.isOutgoing) {
                // 从 contact 对象获取 userId
                var contactId = contact
                    ? contact.id ||
                      contact.characterId ||
                      contact.wechatId ||
                      ""
                    : "";
                $redpacketContainer.css("cursor", "pointer");
                $redpacketContainer.on("click", function (e) {
                    e.stopPropagation();
                    // 再次检查是否已领取（可能在点击时状态已更新）
                    var currentIsClaimed =
                        message.claimed || message.status === "claimed";
                    if (currentIsClaimed) {
                        // 如果已领取，直接显示详情页面
                        showRedpacketDetailPage(message, contact || {});
                    } else {
                        // 如果未领取，显示红包弹窗
                        showRedpacketModal(message, contactId);
                    }
                });
            } else if (isClaimed) {
                // 已领取的红包也可以点击，显示详细页面
                $redpacketContainer.css("cursor", "pointer");
                $redpacketContainer.on("click", function (e) {
                    e.stopPropagation();
                    // 获取发送者信息
                    var senderContact = null;
                    if (window.XiaoxinWeChatDataHandler && message.from) {
                        try {
                            var allContacts =
                                window.XiaoxinWeChatDataHandler.getContacts() ||
                                [];
                            var senderId = String(message.from || "").trim();
                            senderContact = allContacts.find(function (c) {
                                var cWechatId = String(c.wechatId || "").trim();
                                var cWechatId2 = String(
                                    c.wechat_id || ""
                                ).trim();
                                var cId = String(c.id || "").trim();
                                var cCharId = String(
                                    c.characterId || ""
                                ).trim();
                                var cIdWithoutPrefix = cId.replace(
                                    /^contact_/,
                                    ""
                                );
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
                                    cIdWithoutPrefix ===
                                        senderIdWithoutPrefix ||
                                    cIdWithoutPrefix === senderId ||
                                    senderIdWithoutPrefix === cIdWithoutPrefix
                                );
                            });
                        } catch (e) {
                            console.warn(
                                "[小馨手机][微信聊天UI] 获取发送者信息失败:",
                                e
                            );
                        }
                    }
                    // 显示红包详细页面
                    showRedpacketDetailPage(message, senderContact || {});
                });
            }

            $bubble.append($redpacketContainer);

            // 标记消息已处理，避免刷新时重复处理（无论是否历史消息）
            message._processed = true;
            // 保存_processed标志到持久化存储
            try {
                var chatId =
                    (contact && contact.id) ||
                    message.chatUserId ||
                    message.to ||
                    chatUserId;
                if (
                    chatId &&
                    message.id &&
                    window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler
                        .updateChatMessage === "function"
                ) {
                    window.XiaoxinWeChatDataHandler.updateChatMessage(
                        chatId,
                        message.id,
                        {
                            _processed: true,
                        }
                    );
                    console.info(
                        "[小馨手机][微信聊天UI] 红包消息_processed标志已保存到持久化存储:",
                        chatId,
                        message.id
                    );
                }
            } catch (error) {
                console.warn(
                    "[小馨手机][微信聊天UI] 保存红包消息_processed标志失败:",
                    error
                );
            }
        } else {
            // 普通文本消息，检查是否包含表情包
            var content = sanitizeText(message.content);

            // 检查内容是否是表情包（文件名或URL）
            var emojiFromContent = null;
            var displayText = content;

            try {
                if (
                    window.XiaoxinWeChatApp &&
                    typeof window.XiaoxinWeChatApp._getEmojiList === "function"
                ) {
                    var emojiList =
                        window.XiaoxinWeChatApp._getEmojiList() || [];

                    // 检查整个内容是否是表情包
                    var trimmedContent = content.trim();
                    if (emojiList.indexOf(trimmedContent) !== -1) {
                        // 整个内容是表情包
                        emojiFromContent = trimmedContent;
                        displayText = "";
                    } else {
                        // 检查内容是否用 | 分隔，最后一部分是否是表情包
                        var contentParts = content.split("|");
                        if (contentParts.length > 1) {
                            var lastPart =
                                contentParts[contentParts.length - 1].trim();
                            if (emojiList.indexOf(lastPart) !== -1) {
                                // 最后一部分是表情包
                                emojiFromContent = lastPart;
                                contentParts.pop();
                                displayText = contentParts.join("|").trim();
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("[小馨手机][微信聊天UI] 检查表情包失败:", e);
            }

            // 如果识别到表情包，渲染为表情包消息
            if (emojiFromContent) {
                $bubble.addClass("xiaoxin-wechat-chat-message-emoji");

                // 使用 _getEmojiPath 函数来正确解析表情包路径（支持ID、URL、文件名）
                var emojiPath = "";
                if (
                    window.XiaoxinWeChatApp &&
                    typeof window.XiaoxinWeChatApp._getEmojiPath === "function"
                ) {
                    emojiPath =
                        window.XiaoxinWeChatApp._getEmojiPath(emojiFromContent);
                } else {
                    // 降级处理：使用默认逻辑
                    if (
                        emojiFromContent.startsWith("http://") ||
                        emojiFromContent.startsWith("https://") ||
                        emojiFromContent.startsWith("data:image") ||
                        (emojiFromContent.startsWith("/") &&
                            !emojiFromContent.startsWith("/scripts"))
                    ) {
                        // 是URL格式，直接使用
                        emojiPath = emojiFromContent;
                    } else {
                        // 是文件名格式，加上路径前缀
                        emojiPath =
                            "/scripts/extensions/third-party/xiaoxin-phone/image/表情包/" +
                            emojiFromContent;
                    }
                }

                // 如果有文本内容，先显示文本
                if (displayText) {
                    var $text = $(
                        '<span class="xiaoxin-wechat-chat-message-text"></span>'
                    );
                    $text.text(displayText);
                    $bubble.append($text);
                }

                // 添加表情包图片
                var $emojiImg = $(
                    '<img class="xiaoxin-wechat-chat-message-emoji-img" src="' +
                        escapeHtml(emojiPath) +
                        '" style="max-width: 120px; max-height: 120px; border-radius: 4px; display: block; margin-top: 4px;">'
                );

                // 添加点击放大功能
                $emojiImg.css("cursor", "pointer");
                $emojiImg.attr("title", "点击放大查看");
                $emojiImg.on("click", function (e) {
                    e.stopPropagation();
                    imageViewer.show(emojiPath);
                });

                $bubble.append($emojiImg);
            } else {
                // 普通文本消息
                $bubble.text(displayText);
            }
        }

        // 组装
        // 系统消息（包括红包领取通知）居中显示，不显示头像和气泡指向
        if (
            message.type === "system" ||
            message.type === "redpacket_claim_notification"
        ) {
            // 添加系统消息标识类，用于CSS居中显示
            $messageContent.addClass(
                "xiaoxin-wechat-chat-message-content-system"
            );
            $messageContent.append($bubble);
        } else if (isPlayerMessage) {
            // 玩家侧：气泡在右，不显示红点
            $messageContent.append($bubble, $avatar);

            // 如果是通话消息且有文本内容气泡，添加到消息内容容器中（在通话状态气泡下方）
            // 由于消息内容容器使用了 flex-wrap: wrap，文本气泡会自动显示在下方
            if (
                (message.type === "call_voice" ||
                    message.type === "call_video") &&
                $messageContent.data("textBubble")
            ) {
                // 文本气泡直接添加到消息内容容器中，由于 flex-wrap 会自动换行显示在下方
                // 为了保持对齐，需要添加一个占位元素（与头像宽度相同）来对齐
                var $spacer = $(
                    '<div style="width: 40px; flex-shrink: 0;"></div>'
                );
                $messageContent.append(
                    $messageContent.data("textBubble"),
                    $spacer
                );
            }

            // 如果是语音消息且有文字转写容器，添加到消息内容容器中（在气泡下方）
            if (
                message.type === "voice" &&
                $messageContent.data("transcriptionContainer")
            ) {
                $messageContent.append(
                    $messageContent.data("transcriptionContainer")
                );
            }
        } else {
            // 角色侧：头像在最左，语音气泡居中，未读红点在气泡外部（右侧）
            if ($voiceUnreadDot) {
                $messageContent.append($avatar, $bubble, $voiceUnreadDot);
            } else {
                $messageContent.append($avatar, $bubble);
            }

            // 如果是通话消息且有文本内容气泡，添加到消息内容容器中（在通话状态气泡下方）
            // 由于消息内容容器使用了 flex-wrap: wrap，文本气泡会自动显示在下方
            if (
                (message.type === "call_voice" ||
                    message.type === "call_video") &&
                $messageContent.data("textBubble")
            ) {
                // 文本气泡直接添加到消息内容容器中，由于 flex-wrap 会自动换行显示在下方
                // 为了保持对齐，需要添加头像占位元素来对齐
                var $spacer = $(
                    '<div style="width: 40px; flex-shrink: 0;"></div>'
                );
                $messageContent.append(
                    $spacer,
                    $messageContent.data("textBubble")
                );
            }

            // 如果是语音消息且有文字转写容器，添加到消息内容容器中（在气泡下方）
            if (
                message.type === "voice" &&
                $messageContent.data("transcriptionContainer")
            ) {
                $messageContent.append(
                    $messageContent.data("transcriptionContainer")
                );
            }
        }

        $messageItem.append($messageContent);
        return $messageItem;
    }

    // 判断是否为玩家侧消息
    function isPlayerSide(message, playerNickname, contact) {
        // 如果 message 自带 isOutgoing，则直接使用
        if (typeof message.isOutgoing === "boolean") {
            return message.isOutgoing;
        }

        var sender = (message.sender || "").trim();
        if (!sender) return true;

        // 判断玩家自身的微信ID（优先使用账号的 wechatId，其次 id，再次昵称）
        var account = window.XiaoxinWeChatAccount
            ? window.XiaoxinWeChatAccount.getCurrentAccount()
            : null;
        var playerWechatId = account
            ? String(account.wechatId || account.id || "player").trim()
            : "player";

        // 检查 from="player" 的情况（历史消息生成）
        if (sender === "player") return true;
        if (sender === playerWechatId) return true;
        if (sender === (playerNickname || "").trim()) return true;

        // 判断是否为联系人侧
        var contactNames = [
            contact.remark,
            contact.nickname,
            contact.name,
            contact.id,
            contact.wechatId,
        ]
            .filter(Boolean)
            .map(function (x) {
                return String(x).trim();
            });
        return !contactNames.includes(sender);
    }

    // 工具函数
    function escapeHtml(text) {
        if (!text) return "";
        // 先清理 <br> 标签和其他 HTML 标签
        var cleaned = String(text)
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/<[^>]+>/g, "")
            .trim();
        return $("<div>").text(cleaned).html();
    }

    function generateMsgId() {
        var chars =
            "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var id = "wxid-";
        for (var i = 0; i < 8; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }

    function formatTime(date) {
        function pad(n) {
            return n < 10 ? "0" + n : String(n);
        }
        // 统一格式：XX年XX月XX日 XX:XX:XX
        return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(
            date.getDate()
        )}日 ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
            date.getSeconds()
        )}`;
    }

    // ========== 动态时间格式化函数 ==========
    // 基于当前世界观时间，动态格式化历史消息时间显示
    function formatMessageTime(messageTimestamp) {
        if (!messageTimestamp) {
            return "";
        }

        // 检测是否在手机页面上
        var isMobilePage =
            $(window).width() < 768 ||
            /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

        // 获取当前世界观时间（从最新的 [time] 标签）
        var currentWorldTimestamp = null;
        if (
            window.XiaoxinWorldClock &&
            window.XiaoxinWorldClock.currentTimestamp
        ) {
            currentWorldTimestamp = window.XiaoxinWorldClock.currentTimestamp;
        }

        // 在手机页面上，如果世界观时间不可用或看起来不合理，尝试从聊天历史中获取最新消息时间
        if (isMobilePage) {
            if (!currentWorldTimestamp || currentWorldTimestamp <= 0) {
                // 尝试从当前聊天的消息历史中获取最新消息时间作为基准
                try {
                    if (
                        window.XiaoxinWeChatDataHandler &&
                        typeof window.XiaoxinWeChatDataHandler.getAllChats ===
                            "function"
                    ) {
                        var allChats =
                            window.XiaoxinWeChatDataHandler.getAllChats() || {};
                        var latestTimestamp = 0;
                        Object.keys(allChats).forEach(function (chatId) {
                            var chatHistory = allChats[chatId] || [];
                            chatHistory.forEach(function (msg) {
                                if (
                                    msg.timestamp &&
                                    msg.timestamp > latestTimestamp
                                ) {
                                    latestTimestamp = msg.timestamp;
                                }
                            });
                        });
                        if (latestTimestamp > 0) {
                            currentWorldTimestamp = latestTimestamp;
                            console.info(
                                "[小馨手机][微信聊天UI] 手机页面模式，使用聊天历史中最新消息时间作为基准:",
                                currentWorldTimestamp
                            );
                        } else {
                            // 如果聊天历史中没有消息，使用消息本身的时间作为基准
                            currentWorldTimestamp = messageTimestamp;
                            console.info(
                                "[小馨手机][微信聊天UI] 手机页面模式，使用消息本身时间作为基准:",
                                currentWorldTimestamp
                            );
                        }
                    } else {
                        // 如果数据处理器不可用，使用消息本身的时间作为基准
                        currentWorldTimestamp = messageTimestamp;
                        console.info(
                            "[小馨手机][微信聊天UI] 手机页面模式，数据处理器不可用，使用消息本身时间作为基准:",
                            currentWorldTimestamp
                        );
                    }
                } catch (e) {
                    console.warn(
                        "[小馨手机][微信聊天UI] 手机页面模式，获取聊天历史时间失败:",
                        e
                    );
                    currentWorldTimestamp = messageTimestamp;
                }
            } else {
                // 世界观时间存在，检查是否合理（不应该比消息时间早太多）
                // 如果世界观时间比消息时间早超过1天，可能不合理，使用消息时间作为基准
                var timeDiff = currentWorldTimestamp - messageTimestamp;
                if (timeDiff < -86400000) {
                    // 世界观时间比消息时间早超过1天
                    console.warn(
                        "[小馨手机][微信聊天UI] 手机页面模式，世界观时间看起来不合理，使用消息本身时间作为基准"
                    );
                    currentWorldTimestamp = messageTimestamp;
                }
            }
        } else {
            // 电脑页面：尝试使用玩家第一条消息时间作为基准（向后兼容）
            if (!currentWorldTimestamp) {
                var firstPlayerMsg = null;
                if (
                    window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler
                        .getFirstPlayerMessageTime === "function"
                ) {
                    firstPlayerMsg =
                        window.XiaoxinWeChatDataHandler.getFirstPlayerMessageTime();
                }
                if (firstPlayerMsg && firstPlayerMsg.timestamp) {
                    currentWorldTimestamp = firstPlayerMsg.timestamp;
                } else {
                    // 最后使用消息本身的时间作为基准
                    currentWorldTimestamp = messageTimestamp;
                }
            }
        }

        var messageTime = new Date(messageTimestamp);
        var currentTime = new Date(currentWorldTimestamp);

        // 格式化时分
        var hours = messageTime.getHours();
        var minutes = messageTime.getMinutes();
        var hourStr = hours < 10 ? String(hours) : String(hours);
        var minuteStr = minutes < 10 ? "0" + minutes : String(minutes);
        var timeStr = hourStr + ":" + minuteStr;

        // 将两个时间都设置为当天的00:00:00，然后比较日期
        var msgDate = new Date(
            messageTime.getFullYear(),
            messageTime.getMonth(),
            messageTime.getDate()
        );
        var currentDate = new Date(
            currentTime.getFullYear(),
            currentTime.getMonth(),
            currentTime.getDate()
        );

        // 计算天数差（当前世界观时间 - 消息时间）
        var daysDiff = Math.floor(
            (currentDate.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // 判断是否跨年（消息时间和当前时间是否在同一年）
        var msgYear = messageTime.getFullYear();
        var currentYear = currentTime.getFullYear();
        var isCrossYear = msgYear !== currentYear;

        // 计算年份差（消息时间与当前时间的年份差）
        var yearDiff = Math.abs(currentYear - msgYear);

        // 动态显示规则
        if (daysDiff === 0) {
            // 当天：仅显示时分
            return timeStr;
        } else if (daysDiff === 1) {
            // 昨天
            return "昨天" + timeStr;
        } else if (daysDiff >= 2 && daysDiff < 7) {
            // 2-6天前：显示星期几
            var weekdays = [
                "星期日",
                "星期一",
                "星期二",
                "星期三",
                "星期四",
                "星期五",
                "星期六",
            ];
            return weekdays[messageTime.getDay()] + " " + timeStr;
        } else if (daysDiff >= 7) {
            // 7天以上：根据是否跨年决定显示格式
            // 如果消息时间和当前时间在同一年（!isCrossYear），且没有超过一年（yearDiff < 1），显示月日
            // 否则显示年月日
            if (!isCrossYear && yearDiff < 1) {
                // 同一年且未超过一年：显示月日
                return (
                    (messageTime.getMonth() + 1) +
                    "月" +
                    messageTime.getDate() +
                    "日 " +
                    timeStr
                );
            } else {
                // 跨年或超过一年：显示年月日
                return (
                    messageTime.getFullYear() +
                    "年" +
                    (messageTime.getMonth() + 1) +
                    "月" +
                    messageTime.getDate() +
                    "日 " +
                    timeStr
                );
            }
        } else {
            // 兜底：显示年月日
            return (
                messageTime.getFullYear() +
                "年" +
                (messageTime.getMonth() + 1) +
                "月" +
                messageTime.getDate() +
                "日 " +
                timeStr
            );
        }
    }

    // 添加预览消息的方法（供其他模块调用，如红包页面）
    function addPendingMessage(msgObj) {
        if (!msgObj || !msgObj.id) {
            console.warn("[小馨手机][微信聊天UI] 无效的预览消息对象:", msgObj);
            return false;
        }

        // 从消息对象中获取接收者ID（to字段）
        var targetUserId = msgObj.receiver || msgObj.to || "";
        if (!targetUserId) {
            console.warn(
                "[小馨手机][微信聊天UI] 预览消息缺少接收者ID:",
                msgObj
            );
            return false;
        }

        // 确保该聊天的 pendingMessages 存在
        if (!chatPendingMessages[targetUserId]) {
            chatPendingMessages[targetUserId] = {};
        }

        // 添加预览消息
        chatPendingMessages[targetUserId][msgObj.id] = msgObj;

        console.info(
            "[小馨手机][微信聊天UI] 预览消息已添加到 chatPendingMessages:",
            {
                msgId: msgObj.id,
                type: msgObj.type,
                targetUserId: targetUserId,
                amount: msgObj.amount,
                note: msgObj.note,
                message: msgObj,
            }
        );

        // 如果当前正在显示该聊天页面，刷新消息列表
        // 通过检查是否有对应的 renderChatScreen 实例来判断
        // 这里我们触发一个自定义事件，让聊天页面监听并刷新
        try {
            var event = new CustomEvent(
                "xiaoxin-wechat-pending-message-added",
                {
                    detail: { userId: targetUserId, message: msgObj },
                }
            );
            window.dispatchEvent(event);
            console.info(
                "[小馨手机][微信聊天UI] 已触发预览消息事件:",
                targetUserId
            );
        } catch (e) {
            console.warn("[小馨手机][微信聊天UI] 触发预览消息事件失败:", e);
        }

        return true;
    }

    // ========== 显示红包弹窗 ==========
    function showRedpacketModal(message, userId) {
        // 获取发送者信息
        var senderContact = null;
        var senderName = "未知";
        var senderAvatar =
            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";

        if (window.XiaoxinWeChatDataHandler) {
            var allContacts =
                window.XiaoxinWeChatDataHandler.getContacts() || [];
            // 通过 userId 查找联系人
            senderContact = allContacts.find(function (contact) {
                var contactId = String(contact.id || "").trim();
                var contactWechatId = String(contact.wechatId || "").trim();
                var contactCharId = String(contact.characterId || "").trim();
                var userIdStr = String(userId || "").trim();

                return (
                    contactId === userIdStr ||
                    contactId === "contact_" + userIdStr ||
                    userIdStr === "contact_" + contactId ||
                    contactWechatId === userIdStr ||
                    contactCharId === userIdStr ||
                    contactId.replace(/^contact_/, "") ===
                        userIdStr.replace(/^contact_/, "")
                );
            });

            if (senderContact) {
                // 优先使用备注，无备注则使用微信昵称
                senderName =
                    senderContact.remark ||
                    senderContact.note ||
                    senderContact.nickname ||
                    senderContact.name ||
                    "未知";
                // 获取头像
                if (senderContact.avatar) {
                    senderAvatar = senderContact.avatar;
                }
            }
        }

        // 获取红包备注
        var note =
            message.note ||
            message.greeting ||
            message.content ||
            "恭喜发财, 大吉大利";

        // 创建弹窗遮罩
        var $overlay = $(
            '<div class="xiaoxin-wechat-redpacket-modal-overlay"></div>'
        );

        // 创建弹窗内容
        var $modal = $('<div class="xiaoxin-wechat-redpacket-modal"></div>');

        // 发送者信息（头像和文字并排显示）
        var $senderInfo = $(
            '<div class="xiaoxin-wechat-redpacket-modal-sender"></div>'
        );
        var $senderAvatar = $(
            '<img class="xiaoxin-wechat-redpacket-modal-sender-avatar" src="' +
                escapeHtml(senderAvatar) +
                '">'
        );
        var $senderName = $(
            '<div class="xiaoxin-wechat-redpacket-modal-sender-name">' +
                escapeHtml(senderName) +
                "发出的红包</div>"
        );
        $senderInfo.append($senderAvatar, $senderName);

        // 红包备注
        var $note = $(
            '<div class="xiaoxin-wechat-redpacket-modal-note">' +
                escapeHtml(note) +
                "</div>"
        );

        // "开"按钮（不显示金币图标）
        var $redpacketIcon = $(
            '<div class="xiaoxin-wechat-redpacket-modal-icon"></div>'
        );
        var $openButton = $(
            '<div class="xiaoxin-wechat-redpacket-modal-open-button">開</div>'
        );
        $openButton.on("click", function (e) {
            e.stopPropagation();
            // 禁用按钮，防止重复点击
            if ($openButton.hasClass("rotating")) {
                return;
            }
            $openButton.addClass("rotating");

            // 执行旋转动画（横向3D旋转两周）
            $openButton.css({
                animation: "redpacket-coin-rotate 1.2s ease-in-out forwards",
            });

            // 动画完成后，显示红包详细页面
            setTimeout(function () {
                // 领取红包（会更新消息数据）
                claimRedpacket(message, userId, function (updatedMessage) {
                    // 关闭弹窗
                    $overlay.remove();

                    // 使用更新后的消息数据显示红包详细页面（包含领取者信息）
                    var finalMessage = updatedMessage || message;
                    // 确保消息对象包含最新的领取信息
                    finalMessage.claimed = true;
                    finalMessage.status = "claimed";

                    // 显示红包详细页面（全屏显示）
                    showRedpacketDetailPage(finalMessage, senderContact || {});
                });
            }, 1200); // 等待旋转动画完成
        });

        $redpacketIcon.append($openButton);

        // 组装弹窗
        $modal.append($senderInfo, $note, $redpacketIcon);
        $overlay.append($modal);

        // 点击遮罩关闭弹窗
        $overlay.on("click", function (e) {
            if (
                $(e.target).hasClass("xiaoxin-wechat-redpacket-modal-overlay")
            ) {
                $overlay.remove();
            }
        });

        // 添加到手机界面容器（.xiaoxin-wechat-chat-screen）内，相对于容器居中
        var $phoneContainer = $(".xiaoxin-wechat-chat-screen");
        if ($phoneContainer.length === 0) {
            // 如果找不到手机容器，尝试查找父容器
            $phoneContainer = $(
                ".xiaoxin-wechat-screen, .xiaoxin-phone-container, body"
            );
        }

        // 确保容器有相对定位，以便弹窗相对于容器定位
        if (
            ($phoneContainer.length > 0 && !$phoneContainer.css("position")) ||
            $phoneContainer.css("position") === "static"
        ) {
            $phoneContainer.css("position", "relative");
        }

        // 将弹窗添加到容器内
        $phoneContainer.append($overlay);

        // 确保弹窗相对于容器居中显示
        $overlay.css({
            position: "absolute",
            top: "0",
            left: "0",
            right: "0",
            bottom: "0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: "10000",
        });

        console.info(
            "[小馨手机][微信聊天UI] 显示红包弹窗:",
            "messageId:",
            message.id,
            "userId:",
            userId,
            "senderName:",
            senderName
        );
    }

    // ========== 显示红包详细页面 ==========
    function showRedpacketDetailPage(message, contact) {
        // 获取当前聊天页面的 userId，用于刷新
        var currentUserId =
            message.from || message.sender || message.chatUserId || "";

        // 保存发送者信息，用于刷新后显示通知
        var senderNameForNotification = "未知";
        if (contact && contact.remark) {
            senderNameForNotification = contact.remark;
        } else if (contact && contact.nickname) {
            senderNameForNotification = contact.nickname;
        } else if (contact && contact.name) {
            senderNameForNotification = contact.name;
        } else if (message.senderName) {
            senderNameForNotification = message.senderName;
        }

        // 如果 contact 为空，尝试从数据中查找
        if (
            senderNameForNotification === "未知" &&
            window.XiaoxinWeChatDataHandler
        ) {
            try {
                var allContacts =
                    window.XiaoxinWeChatDataHandler.getContacts() || [];
                var senderId = String(
                    message.from || message.sender || ""
                ).trim();
                if (senderId) {
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
                        senderNameForNotification =
                            senderContact.remark ||
                            senderContact.nickname ||
                            senderContact.name ||
                            "未知";
                    }
                }
            } catch (e) {
                console.warn("[小馨手机][微信聊天UI] 查找发送者信息失败:", e);
            }
        }

        // 在显示详情页面时，立即在后台刷新聊天页面
        // 这样用户返回时就能看到已更新的页面，不会有空白闪烁
        if (currentUserId) {
            // 保存当前聊天页面滚动位置（用于从详情页返回时恢复）
            try {
                var $visibleChatScreen = $(
                    ".xiaoxin-wechat-chat-screen:visible"
                ).first();
                if ($visibleChatScreen.length > 0) {
                    var chatIdForScroll =
                        $visibleChatScreen.attr("data-user-id") || currentUserId;
                    var $messagesListForScroll = $visibleChatScreen
                        .find(".xiaoxin-wechat-chat-messages-list")
                        .first();
                    if (chatIdForScroll && $messagesListForScroll.length > 0) {
                        var scrollTopToRestore =
                            $messagesListForScroll.scrollTop();
                        var scrollStore =
                            window.XiaoxinWeChatChatScrollStore ||
                            (window.XiaoxinWeChatChatScrollStore = {
                                positions: {},
                                pendingRestore: {},
                            });
                        scrollStore.positions[chatIdForScroll] =
                            scrollTopToRestore;
                        scrollStore.pendingRestore[chatIdForScroll] =
                            scrollTopToRestore;
                    }
                }
            } catch (e) {}
            setTimeout(function () {
                refreshChatScreen(currentUserId);
            }, 100);
        }

        // 获取手机屏幕容器
        var $phoneScreen = $(".xiaoxin-phone-screen");
        if ($phoneScreen.length === 0) {
            console.warn("[小馨手机][微信聊天UI] 未找到手机屏幕容器");
            return;
        }

        // 创建红包详细页面容器（全屏显示）
        var $detailContainer = $(
            '<div class="xiaoxin-wechat-redpacket-detail-container"></div>'
        );

        // 确保容器全屏显示，不留空隙
        $detailContainer.css({
            position: "absolute",
            top: "0",
            left: "0",
            right: "0",
            bottom: "0",
            width: "100%",
            height: "100%",
            zIndex: "20000",
            overflow: "hidden",
            background: "transparent",
        });

        // 渲染红包详细页面
        if (
            window.XiaoxinWeChatRedPacketUI &&
            window.XiaoxinWeChatRedPacketUI.renderRedPacketDetailPage
        ) {
            window.XiaoxinWeChatRedPacketUI.renderRedPacketDetailPage(
                $detailContainer,
                {
                    message: message,
                    contact: contact,
                    onBack: function () {
                        // 返回时移除详细页面
                        // 使用动画淡出效果
                        $detailContainer.css({
                            transition:
                                "opacity 0.3s ease, transform 0.3s ease",
                            opacity: "0",
                            transform: "scale(0.8)",
                        });
                        // 等待动画完成后移除
                        setTimeout(function () {
                            $detailContainer.remove();
                        }, 300);
                    },
                }
            );
        } else {
            console.warn(
                "[小馨手机][微信聊天UI] 红包UI模块未加载，无法显示详细页面"
            );
            return;
        }

        // 添加到手机屏幕容器
        $phoneScreen.append($detailContainer);

        // 添加放大动画
        $detailContainer.css({
            opacity: "0",
            transform: "scale(0.8)",
        });

        setTimeout(function () {
            $detailContainer.css({
                transition: "opacity 0.3s ease, transform 0.3s ease",
                opacity: "1",
                transform: "scale(1)",
            });
        }, 10);
    }

    // ========== 领取红包 ==========
    function claimRedpacket(message, userId, callback) {
        callback = callback || function () {};
        console.info(
            "[小馨手机][微信聊天UI] 领取红包:",
            "messageId:",
            message.id,
            "redpacket_id:",
            message.redpacket_id ||
                (message.payload && message.payload.redpacket_id),
            "userId:",
            userId
        );

        // 获取当前玩家信息
        var currentAccount = null;
        if (window.XiaoxinWeChatAccount) {
            currentAccount = window.XiaoxinWeChatAccount.getCurrentAccount();
        }

        var playerWechatId = "player";
        if (currentAccount) {
            // 优先使用账号的 id 字段（微信注册时保存的微信ID）
            playerWechatId =
                currentAccount.id || currentAccount.wechatId || "player";
        }

        // 获取红包ID
        var redpacketId =
            message.redpacket_id ||
            (message.payload && message.payload.redpacket_id) ||
            message.id;

        // 直接更新红包状态，不通过消息队列（避免触发"对方正在输入"）
        if (window.XiaoxinWeChatDataHandler) {
            // 获取当前世界观时间
            var claimTime = Date.now();
            if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.rawTime) {
                try {
                    var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                    var normalizedTimeStr = rawTimeStr
                        .replace(/-/g, "/")
                        .replace(/年|月|日|星期[一二三四五六日]/g, " ");
                    var baseTime = Date.parse(normalizedTimeStr);
                    if (!isNaN(baseTime)) {
                        claimTime = baseTime;
                    }
                } catch (e) {
                    console.warn(
                        "[小馨手机][微信聊天UI] 获取世界观时间失败:",
                        e
                    );
                }
            }

            // 获取玩家名称（用于显示）
            var playerName = "我";
            if (currentAccount) {
                playerName =
                    currentAccount.nickname || currentAccount.name || "我";
            }

            // 获取领取金额（对于普通红包，领取金额等于红包总金额）
            var claimAmount = message.amount || 0;

            // 更新红包消息状态为已领取
            var updateResult =
                window.XiaoxinWeChatDataHandler.updateChatMessage(
                    userId,
                    message.id,
                    {
                        claimed: true,
                        status: "claimed",
                        claimed_by: playerWechatId,
                        claimed_time: claimTime,
                        claim_amount: claimAmount, // 记录领取金额
                        claimerName: playerName, // 保存玩家名称，方便后续显示
                    }
                );

            if (updateResult) {
                console.info(
                    "[小馨手机][微信聊天UI] 已更新红包状态为已领取:",
                    "userId:",
                    userId,
                    "messageId:",
                    message.id,
                    "redpacket_id:",
                    redpacketId
                );

                // 更新零钱余额（领取红包后增加零钱）
                if (
                    window.XiaoxinWeChatDataHandler &&
                    window.XiaoxinWeChatDataHandler.updateWalletBalance &&
                    claimAmount > 0
                ) {
                    try {
                        window.XiaoxinWeChatDataHandler.updateWalletBalance(
                            claimAmount
                        );
                        // 添加交易记录
                        var timeStr = "";
                        if (
                            window.XiaoxinWorldClock &&
                            window.XiaoxinWorldClock.rawTime
                        ) {
                            timeStr = window.XiaoxinWorldClock.rawTime;
                        } else {
                            var claimDate = new Date(claimTime);
                            var year = claimDate.getFullYear();
                            var month = String(
                                claimDate.getMonth() + 1
                            ).padStart(2, "0");
                            var day = String(claimDate.getDate()).padStart(
                                2,
                                "0"
                            );
                            var hours = String(claimDate.getHours()).padStart(
                                2,
                                "0"
                            );
                            var minutes = String(
                                claimDate.getMinutes()
                            ).padStart(2, "0");
                            var seconds = String(
                                claimDate.getSeconds()
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
                        }
                        window.XiaoxinWeChatDataHandler.addWalletTransaction({
                            title: "微信红包",
                            amount: claimAmount,
                            time: timeStr,
                            icon: "gift",
                        });
                        console.info(
                            "[小馨手机][微信聊天UI] 已更新零钱余额，增加金额:",
                            claimAmount
                        );
                    } catch (e) {
                        console.warn(
                            "[小馨手机][微信聊天UI] 更新零钱余额失败:",
                            e
                        );
                    }
                }

                // 获取发送者信息（用于显示通知和指令）
                var senderContact = null;
                var senderName = "未知";
                if (window.XiaoxinWeChatDataHandler) {
                    try {
                        var allContacts =
                            window.XiaoxinWeChatDataHandler.getContacts() || [];
                        var senderId = String(
                            message.from || message.sender || ""
                        ).trim();
                        if (senderId) {
                            senderContact = allContacts.find(function (c) {
                                var cWechatId = String(c.wechatId || "").trim();
                                var cWechatId2 = String(
                                    c.wechat_id || ""
                                ).trim();
                                var cId = String(c.id || "").trim();
                                var cCharId = String(
                                    c.characterId || ""
                                ).trim();
                                var cIdWithoutPrefix = cId.replace(
                                    /^contact_/,
                                    ""
                                );
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
                                    cIdWithoutPrefix ===
                                        senderIdWithoutPrefix ||
                                    senderIdWithoutPrefix === cIdWithoutPrefix
                                );
                            });
                        }

                        if (senderContact) {
                            senderName =
                                senderContact.remark ||
                                senderContact.nickname ||
                                senderContact.name ||
                                "未知";
                        } else if (message.senderName) {
                            senderName = message.senderName;
                        }
                    } catch (e) {
                        console.warn(
                            "[小馨手机][微信聊天UI] 获取发送者信息失败:",
                            e
                        );
                    }
                }

                // 直接创建并插入领取通知消息到聊天记录（不再插入到输入框）
                try {
                    // 生成通知消息ID
                    var notificationMsgId =
                        "wxid-" +
                        Date.now() +
                        "-" +
                        Math.random().toString(36).substr(2, 9);

                    // 获取玩家的实际ID（优先使用账号的 id 字段，微信注册时保存的微信ID）
                    var claimedById = "player";
                    var currentAccount = window.XiaoxinWeChatAccount
                        ? window.XiaoxinWeChatAccount.getCurrentAccount()
                        : null;
                    if (currentAccount) {
                        claimedById = String(
                            currentAccount.id ||
                                currentAccount.wechatId ||
                                "player"
                        ).trim();
                    }

                    // 创建领取通知消息
                    var notificationMessage = {
                        id: notificationMsgId,
                        type: "redpacket_claim_notification",
                        timestamp: claimTime,
                        rawTime:
                            window.XiaoxinWorldClock &&
                            window.XiaoxinWorldClock.rawTime
                                ? window.XiaoxinWorldClock.rawTime
                                : new Date(claimTime).toLocaleString("zh-CN"),
                        from: message.from || message.sender || userId || "",
                        to: "player",
                        redpacket_id: redpacketId,
                        claimed_by: claimedById,
                        claimerName: playerName,
                        senderName: senderName,
                        amount: claimAmount,
                        isOutgoing: false,
                        isPending: false,
                    };

                    // 直接添加到聊天记录
                    if (
                        window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.addChatMessage
                    ) {
                        window.XiaoxinWeChatDataHandler.addChatMessage(
                            userId,
                            notificationMessage
                        );
                        console.info(
                            "[小馨手机][微信聊天UI] 已添加领取通知消息到聊天记录:",
                            notificationMessage
                        );
                    }

                    // 清除红包汇总缓存数据，强制下次打开汇总页面时重新计算
                    // 这样可以确保新领取的红包能立即显示在汇总页面中
                    if (
                        window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.clearRedpacketSummary
                    ) {
                        try {
                            var claimDate = new Date(claimTime);
                            var year = claimDate.getFullYear();

                            // 清除该年份的缓存数据
                            window.XiaoxinWeChatDataHandler.clearRedpacketSummary(
                                claimedById,
                                year
                            );
                            console.info(
                                "[小馨手机][微信聊天UI] 已清除红包汇总缓存数据，年份:",
                                year,
                                "下次打开汇总页面时将重新计算"
                            );
                        } catch (e) {
                            console.warn(
                                "[小馨手机][微信聊天UI] 清除红包汇总缓存失败:",
                                e
                            );
                        }
                    }
                } catch (e) {
                    console.warn("[小馨手机][微信聊天UI] 创建通知消息失败:", e);
                }

                // 更新本地消息对象
                message.claimed = true;
                message.status = "claimed";
                message.claimed_by = playerWechatId;
                message.claimed_time = claimTime;
                message.claimerName = playerName;

                // 显示通知消息（已改为直接插入到聊天记录，这里保留以防其他地方调用）
                showRedpacketClaimNotification(userId, senderName, message.id);

                // 刷新聊天界面以显示新添加的通知消息
                // 触发自定义事件通知界面刷新
                try {
                    var event = new CustomEvent(
                        "xiaoxin-wechat-redpacket-claimed",
                        {
                            detail: {
                                userId: userId,
                                messageId: message.id,
                                redpacketId: redpacketId,
                            },
                        }
                    );
                    window.dispatchEvent(event);

                    // 立即刷新聊天界面以显示新添加的领取通知消息
                    // 通过触发自定义事件来刷新聊天界面
                    setTimeout(function () {
                        var refreshEvent = new CustomEvent(
                            "xiaoxin-wechat-redpacket-claimed-refresh",
                            {
                                detail: {
                                    userId: userId,
                                },
                            }
                        );
                        window.dispatchEvent(refreshEvent);

                        // 如果聊天页面已打开，直接刷新消息列表
                        var $chatScreen = $(
                            ".xiaoxin-wechat-chat-screen[data-user-id='" +
                                userId +
                                "']"
                        );
                        if (
                            $chatScreen.length > 0 &&
                            $chatScreen.is(":visible")
                        ) {
                            // 查找并调用刷新函数
                            var chatInstance = $chatScreen.data("chatInstance");
                            if (
                                chatInstance &&
                                typeof chatInstance.refreshMessageList ===
                                    "function"
                            ) {
                                chatInstance.refreshMessageList();
                            } else {
                                // 尝试通过事件触发刷新
                                var manualRefreshEvent = new CustomEvent(
                                    "xiaoxin-wechat-chat-need-refresh",
                                    {
                                        detail: {
                                            userId: userId,
                                        },
                                    }
                                );
                                window.dispatchEvent(manualRefreshEvent);
                            }
                        }
                    }, 100);
                } catch (e) {
                    console.warn(
                        "[小馨手机][微信聊天UI] 触发红包领取事件失败:",
                        e
                    );
                }

                // 调用回调函数，传递更新后的消息
                if (typeof callback === "function") {
                    callback(message);
                }
            } else {
                console.warn(
                    "[小馨手机][微信聊天UI] 更新红包状态失败:",
                    "userId:",
                    userId,
                    "messageId:",
                    message.id
                );
            }
        } else {
            console.warn(
                "[小馨手机][微信聊天UI] XiaoxinWeChatDataHandler 未加载，无法领取红包"
            );
        }
    }

    // ========== 显示红包领取通知 ==========
    function showRedpacketClaimNotification(userId, senderName, messageId) {
        try {
            // 查找当前聊天页面的消息列表容器
            var $chatScreen = $(
                ".xiaoxin-wechat-chat-screen[data-user-id='" + userId + "']"
            );
            if ($chatScreen.length === 0) {
                // 如果找不到，尝试查找当前显示的聊天页面
                $chatScreen = $(".xiaoxin-wechat-chat-screen:visible").first();
            }

            if ($chatScreen.length === 0) {
                console.warn(
                    "[小馨手机][微信聊天UI] 未找到聊天页面，无法显示通知"
                );
                return;
            }

            var $messagesList = $chatScreen.find(
                ".xiaoxin-wechat-chat-messages-list"
            );
            if ($messagesList.length === 0) {
                console.warn(
                    "[小馨手机][微信聊天UI] 未找到消息列表，无法显示通知"
                );
                return;
            }

            // 创建通知消息
            var notificationText = "你领取了" + senderName + "的红包";
            var $notification = $(
                '<div class="xiaoxin-wechat-redpacket-claim-notification" data-message-id="' +
                    escapeHtml(messageId) +
                    '">' +
                    escapeHtml(notificationText) +
                    "</div>"
            );

            // 添加到消息列表
            $messagesList.append($notification);

            // 滚动到底部
            var $chatBody = $chatScreen.find(".xiaoxin-wechat-chat-body");
            if ($chatBody.length > 0) {
                $chatBody.scrollTop($chatBody[0].scrollHeight);
            }

            // 3秒后淡出并移除
            setTimeout(function () {
                $notification.fadeOut(300, function () {
                    $(this).remove();
                });
            }, 3000);

            console.info(
                "[小馨手机][微信聊天UI] 已显示红包领取通知:",
                notificationText
            );
        } catch (e) {
            console.warn("[小馨手机][微信聊天UI] 显示红包领取通知失败:", e);
        }
    }

    // ========== 刷新聊天界面 ==========
    function refreshChatScreen(userId) {
        try {
            // 查找当前聊天页面
            var $chatScreen = $(
                ".xiaoxin-wechat-chat-screen[data-user-id='" + userId + "']"
            );
            if ($chatScreen.length === 0) {
                // 如果找不到，尝试查找当前显示的聊天页面
                $chatScreen = $(".xiaoxin-wechat-chat-screen:visible").first();
            }

            if ($chatScreen.length === 0) {
                console.warn("[小馨手机][微信聊天UI] 未找到聊天页面，无法刷新");
                return;
            }

            // 获取联系人信息
            var contact = null;
            var contactId = $chatScreen.attr("data-user-id") || userId;
            if (window.XiaoxinWeChatDataHandler) {
                try {
                    var allContacts =
                        window.XiaoxinWeChatDataHandler.getContacts() || [];
                    contact = allContacts.find(function (c) {
                        var cId = String(c.id || "").trim();
                        var cWechatId = String(c.wechatId || "").trim();
                        var cCharId = String(c.characterId || "").trim();
                        var contactIdStr = String(contactId || "").trim();

                        return (
                            cId === contactIdStr ||
                            cId === "contact_" + contactIdStr ||
                            contactIdStr === "contact_" + cId ||
                            cWechatId === contactIdStr ||
                            cCharId === contactIdStr ||
                            cId.replace(/^contact_/, "") ===
                                contactIdStr.replace(/^contact_/, "")
                        );
                    });
                } catch (e) {
                    console.warn(
                        "[小馨手机][微信聊天UI] 获取联系人信息失败:",
                        e
                    );
                }
            }

            // 重新渲染聊天界面
            var $parent = $chatScreen.parent();
            if ($parent.length === 0) {
                console.warn(
                    "[小馨手机][微信聊天UI] 未找到聊天页面的父容器，无法刷新"
                );
                return;
            }

            // 获取原始的回调函数（如果有）
            var originalOnBack = function () {};

            // 尝试从全局对象中获取原始的 onBack 回调
            var onBackKey = $chatScreen.data("onBackKey");
            if (
                onBackKey &&
                window.XiaoxinWeChatChatOnBackCallbacks &&
                window.XiaoxinWeChatChatOnBackCallbacks[onBackKey]
            ) {
                originalOnBack =
                    window.XiaoxinWeChatChatOnBackCallbacks[onBackKey];
            }

            if (
                window.XiaoxinWeChatChatUI &&
                window.XiaoxinWeChatChatUI.renderChatScreen
            ) {
                // 保存父容器引用
                var $parentContainer = $parent;

                // 移除旧页面
                $chatScreen.remove();

                // 重新渲染聊天界面，使用恢复的 onBack 回调
                var $newContainer = window.XiaoxinWeChatChatUI.renderChatScreen(
                    contactId,
                    {
                        contact: contact || {},
                        onBack: originalOnBack,
                    }
                );

                // 将新渲染的界面添加到父容器
                if ($newContainer && $newContainer.length > 0) {
                    $parentContainer.append($newContainer);
                } else {
                    console.warn(
                        "[小馨手机][微信聊天UI] 新渲染的容器为空，无法添加到父容器"
                    );
                }

                console.info(
                    "[小馨手机][微信聊天UI] 已刷新聊天界面:",
                    contactId
                );
            }
        } catch (e) {
            console.warn("[小馨手机][微信聊天UI] 刷新聊天界面失败:", e);
        }
    }

    // ========== 聊天详情 / 聊天设置页面 ==========
    function showChatSettingsPage($chatScreen, chatUserId, contact) {
        if (!$chatScreen || !$chatScreen.length) return;

        // 移除已有的设置页，避免重复叠加
        $chatScreen.find(".xiaoxin-wechat-chat-settings-overlay").remove();

        contact = contact || {};

        // 判断是否为历史联系人：
        // - contact.history_friend=true（来自 [wx_contact] 的历史联系人标记）
        // - 或聊天记录中存在标记为 isHistorical 的消息
        var isHistoryContact = false;
        try {
            if (
                contact &&
                (contact.history_friend === true ||
                    String(contact.history_friend).trim().toLowerCase() ===
                        "true")
            ) {
                isHistoryContact = true;
            }
        } catch (e) {}
        try {
            if (
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.getChatHistory ===
                    "function"
            ) {
                var history =
                    window.XiaoxinWeChatDataHandler.getChatHistory(
                        chatUserId
                    ) || [];
                // 注意：如果 contact.history_friend 已经判定为 true，不要被这里覆盖回 false
                isHistoryContact =
                    isHistoryContact ||
                    history.some(function (m) {
                        return m && m.isHistorical === true;
                    });
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信聊天UI] 检查是否为历史联系人失败:",
                e
            );
        }

        var $overlay = $('<div class="xiaoxin-wechat-chat-settings-overlay"></div>');
        var $page = $('<div class="xiaoxin-wechat-chat-settings-page"></div>');

        // 顶部标题栏
        var $header = $('<div class="xiaoxin-wechat-chat-settings-header"></div>');
        var $headerBack = $(
            '<div class="xiaoxin-wechat-chat-settings-back">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg>" +
                "</div>"
        );
        var $headerTitle = $(
            '<div class="xiaoxin-wechat-chat-settings-title">聊天详情</div>'
        );
        $header.append($headerBack, $headerTitle);

        $headerBack.on("click", function () {
            $overlay.remove();
        });

        // 顶部联系人信息
        var displayName =
            contact.remark || contact.nickname || contact.name || "未知";
        var subTitle = contact.remark
            ? contact.nickname || contact.wechatId || ""
            : "";
        var avatarUrl =
            contact.avatar ||
            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";

        var $topInfo = $('<div class="xiaoxin-wechat-chat-settings-top"></div>');
        var $avatar = $(
            '<div class="xiaoxin-wechat-chat-settings-avatar"></div>'
        );
        $avatar.css("background-image", "url(" + avatarUrl + ")");
        var $nameWrapper = $(
            '<div class="xiaoxin-wechat-chat-settings-name-wrapper"></div>'
        );
        var $nameMain = $(
            '<div class="xiaoxin-wechat-chat-settings-name-main">' +
                escapeHtml(displayName) +
                "</div>"
        );
        var $nameSub = null;
        if (subTitle) {
            $nameSub = $(
                '<div class="xiaoxin-wechat-chat-settings-name-sub">' +
                    escapeHtml(subTitle) +
                    "</div>"
            );
            $nameWrapper.append($nameMain, $nameSub);
        } else {
            $nameWrapper.append($nameMain);
        }
        $topInfo.append($avatar, $nameWrapper);

        // 列表区域
        var $list = $('<div class="xiaoxin-wechat-chat-settings-list"></div>');

        // 查找聊天内容（目前仅占位）
        var $searchItem = $(
            '<div class="xiaoxin-wechat-chat-settings-item">' +
                '<div class="xiaoxin-wechat-chat-settings-item-label">查找聊天内容</div>' +
                '<div class="xiaoxin-wechat-chat-settings-item-arrow">›</div>' +
                "</div>"
        );
        $searchItem.on("click", function () {
            if (typeof toastr !== "undefined") {
                toastr.info("查找聊天内容功能暂未实现", "小馨手机");
            }
        });

        // 消息免打扰开关（仅UI，占位）
        var $muteItem = $(
            '<div class="xiaoxin-wechat-chat-settings-item">' +
                '<div class="xiaoxin-wechat-chat-settings-item-label">消息免打扰</div>' +
                '<div class="xiaoxin-wechat-chat-settings-switch"></div>' +
                "</div>"
        );
        var $muteSwitch = $muteItem.find(
            ".xiaoxin-wechat-chat-settings-switch"
        );
        $muteSwitch.on("click", function () {
            $(this).toggleClass("on");
        });

        // 置顶聊天开关（仅UI，占位）
        var $pinItem = $(
            '<div class="xiaoxin-wechat-chat-settings-item">' +
                '<div class="xiaoxin-wechat-chat-settings-item-label">置顶聊天</div>' +
                '<div class="xiaoxin-wechat-chat-settings-switch"></div>' +
                "</div>"
        );
        var $pinSwitch = $pinItem.find(
            ".xiaoxin-wechat-chat-settings-switch"
        );
        $pinSwitch.on("click", function () {
            $(this).toggleClass("on");
        });

        // 设置当前聊天背景（调用角色专用背景选择逻辑）
        var $bgItem = $(
            '<div class="xiaoxin-wechat-chat-settings-item">' +
                '<div class="xiaoxin-wechat-chat-settings-item-label">设置当前聊天背景</div>' +
                '<div class="xiaoxin-wechat-chat-settings-item-arrow">›</div>' +
                "</div>"
        );
        $bgItem.on("click", function () {
            try {
                // 关闭聊天详情页
                $overlay.remove();
                // 显示角色专用聊天背景设置弹窗
                showContactChatBackgroundPicker(chatUserId, contact);
            } catch (e) {
                console.warn(
                    "[小馨手机][微信聊天UI] 打开聊天背景设置失败:",
                    e
                );
            }
        });

        // 清空聊天记录
        var $clearItem = $(
            '<div class="xiaoxin-wechat-chat-settings-item danger">' +
                '<div class="xiaoxin-wechat-chat-settings-item-label">清空聊天记录</div>' +
                "</div>"
        );
        $clearItem.on("click", function () {
            if (
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.clearChatHistory ===
                    "function"
            ) {
                window.XiaoxinWeChatDataHandler.clearChatHistory(chatUserId);
                if (typeof toastr !== "undefined") {
                    toastr.success("已清空聊天记录", "小馨手机");
                }
                // 刷新聊天界面
                try {
                    refreshChatScreen(chatUserId);
                } catch (e) {
                    console.warn(
                        "[小馨手机][微信聊天UI] 清空聊天记录后刷新界面失败:",
                        e
                    );
                }
            } else if (typeof toastr !== "undefined") {
                toastr.warning("暂不支持清空聊天记录", "小馨手机");
            }
        });

        $list.append($searchItem, $muteItem, $pinItem, $bgItem, $clearItem);

        // 历史联系人：生成历史聊天记录
        if (isHistoryContact) {
            var $historySection = $(
                '<div class="xiaoxin-wechat-chat-settings-history-section"></div>'
            );
            var $historyItem = $(
                '<div class="xiaoxin-wechat-chat-settings-item history">' +
                    '<div class="xiaoxin-wechat-chat-settings-item-label">生成历史聊天记录</div>' +
                    '<div class="xiaoxin-wechat-chat-settings-item-arrow">›</div>' +
                    "</div>"
            );
            $historyItem.on("click", function () {
                showHistoryChatDialog(chatUserId, contact);
            });
            $historySection.append($historyItem);
            $list.append($historySection);
        }

        $page.append($header, $topInfo, $list);
        $overlay.append($page);
        $chatScreen.append($overlay);
    }

    // ========== 生成历史聊天记录弹窗 ==========
    function showHistoryChatDialog(chatUserId, contact) {
        contact = contact || {};

        // 计算角色ID（优先使用 characterId，其次 contact.id，去掉 contact_ 前缀）
        var rawRoleId =
            contact.characterId ||
            (contact.id &&
                String(contact.id)
                    .trim()
                    .replace(/^contact_/, "")) ||
            String(chatUserId || "").trim().replace(/^contact_/, "");
        var roleId = String(rawRoleId || "").trim();

        var $existing =
            $(".xiaoxin-wechat-history-chat-overlay").first() || $();
        if ($existing.length) {
            $existing.remove();
        }

        var $overlay = $('<div class="xiaoxin-wechat-history-chat-overlay"></div>');
        var $dialog = $('<div class="xiaoxin-wechat-history-chat-modal"></div>');

        var $titleBar = $(
            '<div class="xiaoxin-wechat-history-chat-title-bar"></div>'
        );
        var $title = $(
            '<div class="xiaoxin-wechat-history-chat-title">生成历史聊天记录</div>'
        );
        var $closeBtn = $(
            '<div class="xiaoxin-wechat-history-chat-close">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg>" +
                "</div>"
        );
        $titleBar.append($title, $closeBtn);

        var $content = $(
            '<div class="xiaoxin-wechat-history-chat-content"></div>'
        );

        // 对话风格
        var $styleRow = $(
            '<div class="xiaoxin-wechat-history-chat-row"></div>'
        );
        var $styleLabel = $(
            '<div class="xiaoxin-wechat-history-chat-label">对话风格</div>'
        );
        var $styleWrapper = $(
            '<div class="xiaoxin-wechat-history-chat-style-wrapper"></div>'
        );
        var $styleSelect = $(
            '<select class="xiaoxin-wechat-history-chat-select"></select>'
        );
        // 强制设置样式，覆盖所有状态
        function forceStyle($el) {
            $el.css({
                'background-color': '#f5f5f5',
                'background': '#f5f5f5',
                'border': 'none',
                'border-width': '0',
                'border-style': 'none',
                'border-color': 'transparent',
                'outline': 'none',
                'outline-width': '0',
                'outline-style': 'none',
                'outline-color': 'transparent',
                'box-shadow': 'none',
                '-webkit-box-shadow': 'none',
                '-moz-box-shadow': 'none',
                'color': '#000000',
                'transition': 'none',
                '-webkit-transition': 'none',
                '-moz-transition': 'none',
                '-o-transition': 'none'
            });
        }
        $styleSelect.css({
            'background-color': '#f5f5f5',
            'border': 'none',
            'outline': 'none',
            'box-shadow': 'none',
            'color': '#000000',
            '-webkit-appearance': 'none',
            '-moz-appearance': 'none',
            'appearance': 'none'
        });
        $styleSelect.on('focus blur hover mouseenter mouseleave change input click', function() {
            forceStyle($(this));
        });
        // 定期强制设置样式，防止被主题覆盖
        var styleInterval = setInterval(function() {
            if ($styleSelect.length && $styleSelect.is(':visible')) {
                forceStyle($styleSelect);
            } else {
                clearInterval(styleInterval);
            }
        }, 100);
        $styleSelect.append('<option value="">请选择</option>');
        $styleSelect.append('<option value="温和">温和</option>');
        $styleSelect.append('<option value="亲密">亲密</option>');
        $styleSelect.append('<option value="公事公办">公事公办</option>');
        $styleSelect.append('<option value="custom">自定义</option>');
        var $styleCustom = $(
            '<input type="text" class="xiaoxin-wechat-history-chat-input xiaoxin-wechat-history-chat-custom-input" placeholder="请输入自定义对话风格" style="display:none;" />'
        );
        // 强制设置样式，覆盖所有状态
        function forceCustomInputStyle($el) {
            $el.css({
                'background-color': '#f5f5f5',
                'background': '#f5f5f5',
                'border': 'none',
                'border-width': '0',
                'border-style': 'none',
                'border-color': 'transparent',
                'outline': 'none',
                'outline-width': '0',
                'outline-style': 'none',
                'outline-color': 'transparent',
                'box-shadow': 'none',
                '-webkit-box-shadow': 'none',
                '-moz-box-shadow': 'none',
                'color': '#000000',
                'transition': 'none',
                '-webkit-transition': 'none',
                '-moz-transition': 'none',
                '-o-transition': 'none'
            });
        }
        $styleCustom.css({
            'background-color': '#f5f5f5',
            'border': 'none',
            'outline': 'none',
            'box-shadow': 'none',
            'color': '#000000'
        });
        $styleCustom.on('focus blur hover mouseenter mouseleave change input click', function() {
            forceCustomInputStyle($(this));
        });
        // 定期强制设置样式，防止被主题覆盖
        var customInputInterval = setInterval(function() {
            if ($styleCustom.length && $styleCustom.is(':visible')) {
                forceCustomInputStyle($styleCustom);
            } else {
                clearInterval(customInputInterval);
            }
        }, 100);
        $styleSelect.on("change", function () {
            if ($(this).val() === "custom") {
                $styleCustom.show();
            } else {
                $styleCustom.hide().val("");
            }
        });
        $styleWrapper.append($styleSelect, $styleCustom);
        $styleRow.append($styleLabel, $styleWrapper);

        // 时间跨度
        var $timeRow = $(
            '<div class="xiaoxin-wechat-history-chat-row"></div>'
        );
        var $timeLabel = $(
            '<div class="xiaoxin-wechat-history-chat-label">时间跨度</div>'
        );
        var $timeInput = $(
            '<input type="text" class="xiaoxin-wechat-history-chat-input" placeholder="例如：最近一年" />'
        );
        // 强制设置样式，覆盖所有状态
        function forceInputStyle($el) {
            $el.css({
                'background-color': '#f5f5f5',
                'background': '#f5f5f5',
                'border': 'none',
                'border-width': '0',
                'border-style': 'none',
                'border-color': 'transparent',
                'outline': 'none',
                'outline-width': '0',
                'outline-style': 'none',
                'outline-color': 'transparent',
                'box-shadow': 'none',
                '-webkit-box-shadow': 'none',
                '-moz-box-shadow': 'none',
                'color': '#000000',
                'transition': 'none',
                '-webkit-transition': 'none',
                '-moz-transition': 'none',
                '-o-transition': 'none'
            });
        }
        $timeInput.css({
            'background-color': '#f5f5f5',
            'border': 'none',
            'outline': 'none',
            'box-shadow': 'none',
            'color': '#000000'
        });
        $timeInput.on('focus blur hover mouseenter mouseleave change input click', function() {
            forceInputStyle($(this));
        });
        // 定期强制设置样式，防止被主题覆盖
        var timeInputInterval = setInterval(function() {
            if ($timeInput.length && $timeInput.is(':visible')) {
                forceInputStyle($timeInput);
            } else {
                clearInterval(timeInputInterval);
            }
        }, 100);
        $timeRow.append($timeLabel, $timeInput);

        // 消息条数
        var $countRow = $(
            '<div class="xiaoxin-wechat-history-chat-row"></div>'
        );
        var $countLabel = $(
            '<div class="xiaoxin-wechat-history-chat-label">消息条数</div>'
        );
        var $countInput = $(
            '<input type="number" min="10" max="300" class="xiaoxin-wechat-history-chat-input" placeholder="例如：100（{{char}}与{{user}}消息总和）" />'
        );
        $countInput.css({
            'background-color': '#f5f5f5',
            'border': 'none',
            'outline': 'none',
            'box-shadow': 'none',
            'color': '#000000'
        });
        $countInput.on('focus blur hover mouseenter mouseleave change input click', function() {
            forceInputStyle($(this));
        });
        // 定期强制设置样式，防止被主题覆盖
        var countInputInterval = setInterval(function() {
            if ($countInput.length && $countInput.is(':visible')) {
                forceInputStyle($countInput);
            } else {
                clearInterval(countInputInterval);
            }
        }, 100);
        $countRow.append($countLabel, $countInput);

        // 聊天记录的补充
        var $otherRow = $(
            '<div class="xiaoxin-wechat-history-chat-row"></div>'
        );
        var $otherLabel = $(
            '<div class="xiaoxin-wechat-history-chat-label">聊天记录的补充</div>'
        );
        var $otherInput = $(
            '<input type="text" class="xiaoxin-wechat-history-chat-input" placeholder="其他补充信息（可选）" />'
        );
        $otherInput.css({
            'background-color': '#f5f5f5',
            'border': 'none',
            'outline': 'none',
            'box-shadow': 'none',
            'color': '#000000'
        });
        $otherInput.on('focus blur hover mouseenter mouseleave change input click', function() {
            forceInputStyle($(this));
        });
        // 定期强制设置样式，防止被主题覆盖
        var otherInputInterval = setInterval(function() {
            if ($otherInput.length && $otherInput.is(':visible')) {
                forceInputStyle($otherInput);
            } else {
                clearInterval(otherInputInterval);
            }
        }, 100);
        $otherRow.append($otherLabel, $otherInput);

        $content.append($styleRow, $timeRow, $countRow, $otherRow);

        var $footer = $(
            '<div class="xiaoxin-wechat-history-chat-footer"></div>'
        );
        var $cancelBtn = $(
            '<button class="xiaoxin-wechat-history-chat-btn xiaoxin-wechat-history-chat-btn-cancel">取消</button>'
        );
        var $confirmBtn = $(
            '<button class="xiaoxin-wechat-history-chat-btn xiaoxin-wechat-history-chat-btn-confirm">完成</button>'
        );

        // 强制设置按钮样式，移除悬停效果
        $cancelBtn.css({
            'background-color': '#f5f5f5',
            'color': '#333333',
            'transition': 'none',
            '-webkit-transition': 'none',
            '-moz-transition': 'none',
            '-o-transition': 'none'
        });
        $confirmBtn.css({
            'background-color': '#07c160',
            'color': '#ffffff',
            'transition': 'none',
            '-webkit-transition': 'none',
            '-moz-transition': 'none',
            '-o-transition': 'none'
        });

        // 强制移除所有悬停效果
        $cancelBtn.on('mouseenter mouseleave hover focus active', function() {
            $(this).css({
                'background-color': '#f5f5f5',
                'color': '#333333',
                'box-shadow': 'none',
                'outline': 'none',
                'border': 'none',
                'transform': 'none',
                'opacity': '1'
            });
        });
        $confirmBtn.on('mouseenter mouseleave hover focus active', function() {
            $(this).css({
                'background-color': '#07c160',
                'color': '#ffffff',
                'box-shadow': 'none',
                'outline': 'none',
                'border': 'none',
                'transform': 'none',
                'opacity': '1'
            });
        });

        $cancelBtn.on("click", function () {
            $overlay.remove();
        });
        $closeBtn.on("click", function () {
            $overlay.remove();
        });

        $confirmBtn.on("click", function () {
            var styleValue = $styleSelect.val();
            if (styleValue === "custom") {
                styleValue = ($styleCustom.val() || "").trim();
            }
            var timeSpan = ($timeInput.val() || "").trim();
            var count = ($countInput.val() || "").trim();
            var other = ($otherInput.val() || "").trim();

            if (!styleValue) {
                if (typeof toastr !== "undefined") {
                    toastr.warning("请选择或填写对话风格", "生成历史聊天记录");
                }
                return;
            }
            if (!timeSpan) {
                if (typeof toastr !== "undefined") {
                    toastr.warning("请填写时间跨度", "生成历史聊天记录");
                }
                return;
            }
            if (!count) {
                if (typeof toastr !== "undefined") {
                    toastr.warning("请填写消息条数", "生成历史聊天记录");
                }
                return;
            }

            var formatText = "<Request：只生成格式指令，不生成正文回复>\n";
            formatText += "<Request：请生成MSG标签包裹的消息指令！>\n";
            formatText += "[historychat]\n";
            formatText += "role_id=" + roleId + "\n";
            formatText += "dialog_style=" + styleValue + "\n";
            formatText += "time_span=" + timeSpan + "\n";
            formatText += "message_count=" + count + "\n";
            if (other) {
                formatText += "other=" + other + "\n";
            }
            formatText += "[/historychat]";

            try {
                if (
                    window.XiaoxinWeChatApp &&
                    window.XiaoxinWeChatApp.insertTextToTavernInput
                ) {
                    window.XiaoxinWeChatApp.insertTextToTavernInput(
                        formatText
                    );
                } else {
                    var tavernInput =
                        document.getElementById("send_textarea");
                    if (tavernInput) {
                        var currentValue = tavernInput.value || "";
                        tavernInput.value =
                            currentValue +
                            (currentValue ? "\n" : "") +
                            formatText;
                        tavernInput.dispatchEvent(
                            new Event("input", { bubbles: true })
                        );
                    }
                }
                if (typeof toastr !== "undefined") {
                    toastr.success(
                        "已生成历史聊天记录申请格式，请在输入框确认发送",
                        "小馨手机"
                    );
                }
                $overlay.remove();
            } catch (e) {
                console.error(
                    "[小馨手机][微信聊天UI] 写入历史聊天记录指令失败:",
                    e
                );
                if (typeof toastr !== "undefined") {
                    toastr.error("写入指令失败，请手动复制", "小馨手机");
                }
            }
        });

        $footer.append($cancelBtn, $confirmBtn);
        $dialog.append($titleBar, $content, $footer);
        $overlay.append($dialog);

        $(".xiaoxin-wechat-chat-screen").first().append($overlay);
    }

    // ========== 显示角色专用聊天背景设置弹窗 ==========
    function showContactChatBackgroundPicker(contactId, contact) {
        console.info("[小馨手机][微信聊天UI] 打开角色专用聊天背景设置弹窗", contactId);

        // 查找手机容器
        var $phoneContainer = $(".xiaoxin-phone-container");
        if ($phoneContainer.length === 0) {
            console.warn("[小馨手机][微信聊天UI] 未找到手机容器");
            if (typeof toastr !== "undefined") {
                toastr.error("未找到手机容器", "小馨手机");
            }
            return;
        }

        // 移除已有弹窗
        $phoneContainer.find(".xiaoxin-wechat-chat-background-picker-overlay").remove();

        // 创建遮罩层和弹窗容器
        var $overlay = $('<div class="xiaoxin-wechat-chat-background-picker-overlay"></div>');
        var $picker = $('<div class="xiaoxin-wechat-chat-background-picker-container"></div>');

        // 标题栏
        var $titleBar = $('<div class="xiaoxin-wechat-chat-background-picker-title-bar"></div>');
        var $titleBack = $('<div class="xiaoxin-wechat-chat-background-picker-title-back"><</div>');
        var contactName = (contact && (contact.remark || contact.nickname || contact.name)) || "当前聊天";
        var $titleText = $('<div class="xiaoxin-wechat-chat-background-picker-title-text">设置聊天背景</div>');
        $titleBar.append($titleBack, $titleText);

        // 预览区域（模拟聊天页面的消息显示区域）
        var $previewArea = $('<div class="xiaoxin-wechat-chat-background-picker-preview-area"></div>');
        var $previewImage = $('<div class="xiaoxin-wechat-chat-background-picker-preview-image"></div>');
        $previewArea.append($previewImage);

        // 控制面板
        var $controlPanel = $('<div class="xiaoxin-wechat-chat-background-picker-control-panel"></div>');

        // 图片输入区域
        var $inputSection = $('<div class="xiaoxin-wechat-chat-background-picker-input-section"></div>');
        var $urlInput = $('<input type="text" class="xiaoxin-wechat-chat-background-picker-url-input" placeholder="粘贴图片URL链接">');
        var $fileInput = $('<input type="file" accept="image/*" class="xiaoxin-wechat-chat-background-picker-file-input" style="display: none;">');
        var $fileBtn = $('<button class="xiaoxin-wechat-chat-background-picker-file-btn">选择本地图片</button>');
        $inputSection.append($urlInput, $fileBtn, $fileInput);

        // 缩放控制
        var $scaleGroup = $('<div class="xiaoxin-wechat-chat-background-picker-control-group"></div>');
        var $scaleLabel = $('<label class="xiaoxin-wechat-chat-background-picker-label">缩放:</label>');
        var $scaleInput = $('<input type="range" class="xiaoxin-wechat-chat-background-picker-scale-input" min="50" max="200" value="100" step="5">');
        var $scaleValue = $('<span class="xiaoxin-wechat-chat-background-picker-scale-value">100%</span>');
        $scaleGroup.append($scaleLabel, $scaleInput, $scaleValue);

        $controlPanel.append($inputSection, $scaleGroup);

        // 操作按钮
        var $actions = $('<div class="xiaoxin-wechat-chat-background-picker-actions"></div>');
        var $resetBtn = $('<button class="xiaoxin-wechat-chat-background-picker-reset-btn">重置</button>');
        var $cancelBtn = $('<button class="xiaoxin-wechat-chat-background-picker-cancel-btn">取消</button>');
        var $confirmBtn = $('<button class="xiaoxin-wechat-chat-background-picker-confirm-btn">确定</button>');
        $actions.append($resetBtn, $cancelBtn, $confirmBtn);

        $picker.append($titleBar, $previewArea, $controlPanel, $actions);
        $overlay.append($picker);
        $phoneContainer.append($overlay);

        // 获取当前设置（优先使用角色专用背景，如果没有则使用全局背景）
        var currentBackground = null;
        var currentScale = 100;
        if (contactId && window.XiaoxinWeChatDataHandler && window.XiaoxinWeChatDataHandler.getContactChatBackground) {
            var contactBg = window.XiaoxinWeChatDataHandler.getContactChatBackground(contactId);
            if (contactBg && contactBg.background) {
                currentBackground = contactBg.background;
                currentScale = contactBg.scale || 100;
            }
        }
        // 如果没有角色专用背景，使用全局背景
        if (!currentBackground) {
            var settings = window.XiaoxinWeChatDataHandler && window.XiaoxinWeChatDataHandler.getSettings
                ? window.XiaoxinWeChatDataHandler.getSettings()
                : {};
            currentBackground = settings.chatBackground || null;
            currentScale = settings.chatBackgroundScale || 100;
        }

        // 状态变量
        var selectedImageUrl = currentBackground;
        var currentScaleValue = currentScale;

        // 更新预览图片（使用与手机壁纸相同的尺寸计算方式）
        function updatePreviewImage() {
            if (selectedImageUrl) {
                // 使用与手机壁纸相同的格式：百分比宽度，高度自动
                $previewImage.css({
                    "background-image": "url(" + selectedImageUrl + ")",
                    "background-size": currentScaleValue + "% auto",
                    "background-position": "center",
                    "background-repeat": "no-repeat"
                });
                $previewImage.show();
            } else {
                $previewImage.hide();
            }
        }

        // 如果已有背景，显示预览
        if (currentBackground) {
            selectedImageUrl = currentBackground;
            currentScaleValue = currentScale;
            $scaleInput.val(currentScaleValue);
            $scaleValue.text(currentScaleValue + "%");
            updatePreviewImage();
        }

        // URL输入处理
        $urlInput.on("input", function () {
            var url = $(this).val().trim();
            if (url) {
                selectedImageUrl = url;
                // 测试图片是否能加载
                var testImg = new Image();
                testImg.onload = function () {
                    updatePreviewImage();
                };
                testImg.onerror = function () {
                    if (typeof toastr !== "undefined") {
                        toastr.error("图片加载失败，请检查URL是否正确", "小馨手机");
                    }
                    selectedImageUrl = null;
                    $previewImage.hide();
                };
                testImg.src = url;
            } else {
                $previewImage.hide();
                selectedImageUrl = null;
            }
        });

        // 本地文件选择
        $fileBtn.on("click", function () {
            $fileInput.click();
        });

        $fileInput.on("change", function (e) {
            var file = e.target.files[0];
            if (file) {
                var reader = new FileReader();
                reader.onload = function (event) {
                    selectedImageUrl = event.target.result;
                    $urlInput.val(""); // 清空URL输入
                    updatePreviewImage();
                };
                reader.onerror = function () {
                    if (typeof toastr !== "undefined") {
                        toastr.error("图片读取失败", "小馨手机");
                    }
                };
                reader.readAsDataURL(file);
            }
        });

        // 缩放控制
        $scaleInput.on("input", function () {
            currentScaleValue = parseInt($(this).val());
            $scaleValue.text(currentScaleValue + "%");
            updatePreviewImage();
        });

        // 返回按钮
        $titleBack.on("click", function () {
            $overlay.remove();
        });

        // 重置按钮
        $resetBtn.on("click", function () {
            if (confirm("确定要重置当前聊天的背景吗？")) {
                selectedImageUrl = null;
                currentScaleValue = 100;
                $urlInput.val("");
                $scaleInput.val(100);
                $scaleValue.text("100%");
                $previewImage.hide();

                // 清除角色专用背景（会回退到全局背景）
                if (contactId && window.XiaoxinWeChatDataHandler && window.XiaoxinWeChatDataHandler.setContactChatBackground) {
                    window.XiaoxinWeChatDataHandler.setContactChatBackground(contactId, null, null);
                }

                // 触发聊天页面刷新
                if (window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent("xiaoxin-wechat-chat-background-changed"));
                }

                if (typeof toastr !== "undefined") {
                    toastr.success("当前聊天背景已重置", "小馨手机");
                }

                $overlay.remove();
            }
        });

        // 取消按钮
        $cancelBtn.on("click", function () {
            $overlay.remove();
        });

        // 确定按钮
        $confirmBtn.on("click", function () {
            if (selectedImageUrl) {
                // 保存角色专用背景
                if (contactId && window.XiaoxinWeChatDataHandler && window.XiaoxinWeChatDataHandler.setContactChatBackground) {
                    window.XiaoxinWeChatDataHandler.setContactChatBackground(contactId, selectedImageUrl, currentScaleValue);
                }

                // 触发聊天页面刷新
                if (window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent("xiaoxin-wechat-chat-background-changed"));
                }

                if (typeof toastr !== "undefined") {
                    toastr.success("当前聊天背景已更新", "小馨手机");
                }

                $overlay.remove();
            } else {
                if (typeof toastr !== "undefined") {
                    toastr.warning("请先选择或输入图片", "小馨手机");
                }
            }
        });

        // 点击遮罩层关闭
        $overlay.on("click", function (e) {
            if ($(e.target).hasClass("xiaoxin-wechat-chat-background-picker-overlay")) {
                $overlay.remove();
            }
        });
    }

    return {
        renderChatScreen: renderChatScreen,
        addPendingMessage: addPendingMessage,
        refreshChatScreen: refreshChatScreen,
    };
})();
