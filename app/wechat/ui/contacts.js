// 通讯录和朋友管理模块
window.XiaoxinWeChatContacts = (function () {
    // 工具：将文本写入酒馆输入框（复用微信主应用的能力，必要时回退到直接查找输入框）
    function insertTextToTavernInput(text) {
        if (
            window.XiaoxinWeChatApp &&
            typeof window.XiaoxinWeChatApp.insertTextToTavernInput === "function"
        ) {
            return window.XiaoxinWeChatApp.insertTextToTavernInput(text);
        }

        try {
            var selectors = [
                "#send_textarea",
                "#send_textarea textarea",
                "textarea#send_textarea",
                "#send_textarea_mobile",
                ".send_textarea",
                "#message_in",
                "#user-input",
            ];
            var $input = null;
            for (var i = 0; i < selectors.length; i++) {
                $input = $(selectors[i]);
                if ($input.length > 0) {
                    break;
                }
            }
            if ($input && $input.length > 0) {
                var currentValue = $input.val() || "";
                var newValue = currentValue + (currentValue ? "\n" : "") + text;
                $input.val(newValue);
                $input.trigger("input");
                $input.trigger("change");
                $input.focus();
                if ($input[0].setSelectionRange) {
                    var length = newValue.length;
                    $input[0].setSelectionRange(length, length);
                }
                console.info("[小馨手机][微信] 已写入好友申请指令");
                return true;
            }
        } catch (e) {
            console.error("[小馨手机][微信] 写入指令失败:", e);
        }
        return false;
    }

    // ========== 渲染添加朋友页面 ==========
    function renderAddFriendPage($root, mobilePhone, source) {
        console.info("[小馨手机][微信] 渲染添加朋友页面");

        var account =
            window.XiaoxinWeChatDataHandler &&
            window.XiaoxinWeChatDataHandler.getAccount
                ? window.XiaoxinWeChatDataHandler.getAccount()
                : null;
        if (!account) {
            console.warn("[小馨手机][微信] 无法获取账号信息");
            return;
        }

        var $main = $(
            '<div class="xiaoxin-wechat-main xiaoxin-wechat-add-friend-main"></div>'
        );

        // 标题栏
        var $header = $('<div class="xiaoxin-wechat-header"></div>');
        var $headerBar = $('<div class="xiaoxin-wechat-header-bar"></div>');

        var $headerLeft = $('<div class="xiaoxin-wechat-header-left"></div>');
        var $headerBack = $(
            '<div class="xiaoxin-wechat-header-back">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        $headerBack.on("click", function () {
            // 返回逻辑：从通讯录进入则回通讯录，否则回微信主页
            if ($root && $root.parent()) {
                var $container = $root.parent();
                $container.empty();

                if (
                    source === "通讯录" &&
                    window.XiaoxinWeChatApp &&
                    typeof window.XiaoxinWeChatApp._renderContactsPage ===
                        "function"
                ) {
                    window.XiaoxinWeChatApp._renderContactsPage(
                        $container,
                        mobilePhone
                    );
                    return;
                }

                // 兜底：回微信主页
                if (window.XiaoxinWeChatApp && window.XiaoxinWeChatApp.render) {
                    window.XiaoxinWeChatApp.render($container, mobilePhone);
                }
            }
        });
        $headerLeft.append($headerBack);

        var $headerTitle = $(
            '<div class="xiaoxin-wechat-header-title">添加朋友</div>'
        );

        // 右侧占位元素，确保标题居中
        var $headerRight = $('<div class="xiaoxin-wechat-header-right"></div>');
        $headerRight.css({
            width: "24px",
            flexShrink: 0,
        });

        $headerBar.append($headerLeft, $headerTitle, $headerRight);
        $header.append($headerBar);

        // 搜索栏
        var $search = $(
            '<div class="xiaoxin-wechat-search xiaoxin-wechat-add-friend-search"></div>'
        );
        var $searchBar = $(
            '<div class="xiaoxin-wechat-search-bar xiaoxin-wechat-add-friend-search-bar"></div>'
        );

        var $searchIcon = $(
            '<div class="xiaoxin-wechat-add-friend-search-icon">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>' +
                '<path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
                "</svg></div>"
        );

        // 使用原生 placeholder，不再使用单独的文字 div
        var $searchInput = $(
            '<input type="text" class="xiaoxin-wechat-search-input xiaoxin-wechat-add-friend-search-input" placeholder="账号/手机号" />'
        );

        // 确保输入时 placeholder 隐藏
        $searchInput.on("input", function () {
            var $input = $(this);
            if ($input.val().trim()) {
                // 有内容时，确保 placeholder 隐藏
                $input.attr("data-has-content", "true");
            } else {
                // 无内容时，显示 placeholder
                $input.removeAttr("data-has-content");
            }
        });

        $searchInput.on("focus", function () {
            console.info("[小馨手机][微信] 添加朋友搜索框获得焦点");
        });

        // 搜索功能：按回车或点击搜索图标
        function performSearch() {
            var inputValue = $searchInput.val().trim();
            if (!inputValue) {
                return;
            }

            // 查找联系人（根据手机号或微信号）
            // 从数据处理器获取所有联系人
            var contacts = [];
            if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getContacts === "function") {
                contacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
                console.info("[小馨手机][添加朋友] 从数据处理器获取到的所有联系人数量:", contacts.length);
            }

            // 检测是否在手机页面上
            var isMobilePage = $(window).width() < 768 || /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

            // 如果监听器可用，只搜索当前聊天中已保留消息里存在的联系人
            // 但在手机页面上，强制搜索所有联系人，因为消息监听器可能无法正常工作
            if (!isMobilePage && window.XiaoxinMessageListener && typeof window.XiaoxinMessageListener.getContactsFromCurrentChat === "function") {
                var currentChatContactIds = window.XiaoxinMessageListener.getContactsFromCurrentChat();
                console.info("[小馨手机][添加朋友] 当前聊天中的联系人ID列表:", currentChatContactIds);
                console.info("[小馨手机][添加朋友] 过滤前的联系人数量:", contacts.length);

                // 如果当前聊天中没有联系人ID，说明消息监听器没有识别到标签，此时应该搜索所有联系人
                if (currentChatContactIds.length === 0) {
                    console.warn("[小馨手机][添加朋友] 当前聊天中没有识别到联系人，搜索所有联系人");
                    // 不进行过滤，搜索所有联系人
                } else {
                    contacts = contacts.filter(function (contact) {
                        var isInCurrentChat = currentChatContactIds.indexOf(contact.id) !== -1;
                        if (!isInCurrentChat) {
                            console.info("[小馨手机][添加朋友] 联系人", contact.nickname || contact.id, "不在当前聊天中，过滤掉");
                        }
                        return isInCurrentChat;
                    });
                    console.info("[小馨手机][添加朋友] 过滤后的联系人数量:", contacts.length);
                }
            } else {
                if (isMobilePage) {
                    console.info("[小馨手机][添加朋友] 手机页面模式，搜索所有联系人（不进行过滤）");
                } else {
                    console.warn("[小馨手机][添加朋友] 消息监听器不可用，搜索所有联系人");
                }
            }

            var foundContact = null;

            console.info("[小馨手机][添加朋友] 执行搜索，输入:", inputValue, "当前联系人数量:", contacts.length);

            // 调试：打印所有联系人的信息
            if (contacts.length > 0) {
                console.info("[小馨手机][添加朋友] 联系人列表:", contacts.map(function(c) {
                    return {
                        id: c.id,
                        phone: c.phone,
                        phoneNumber: c.phoneNumber,
                        wechatId: c.wechatId,
                        wechat_id: c.wechat_id,
                        wechatID: c.wechatID,
                        nickname: c.nickname,
                        avatar: c.avatar,
                        allKeys: Object.keys(c)
                    };
                }));

                // 打印第一个联系人的完整信息用于调试
                if (contacts[0]) {
                    console.info("[小馨手机][添加朋友] 第一个联系人完整信息:", contacts[0]);
                }
            }

            // 判断是手机号还是微信号
            // 手机号：允许输入 10-11 位，但系统入库会强制裁剪为 10 位，所以搜索时也统一按“末 10 位”匹配
            var isPhoneNumber = /^\d{10,11}$/.test(inputValue);

            // 先尝试按手机号搜索（支持多种字段名）
            if (isPhoneNumber) {
                // 清洗输入值：只保留数字
                var cleanInput = (inputValue || "").toString().replace(/[^\d]/g, "");
                if (cleanInput.length > 10) {
                    cleanInput = cleanInput.slice(-10);
                }
                console.info("[小馨手机][添加朋友] 清洗后的输入手机号:", cleanInput);

                foundContact = contacts.find(function (c) {
                    // 收集所有可能的手机号字段
                    var phoneValues = [
                        c.phone,
                        c.phoneNumber,
                        c.电话号码
                    ].filter(function (v) {
                        return v !== undefined && v !== null && String(v).trim() !== "";
                    });

                    // 打印当前联系人和所有号码值，方便调试
                    console.info("[小馨手机][添加朋友] 检查联系人:", c.nickname || c.id, "原始电话号码字段值:", phoneValues);

                    // 把所有号码都清洗成"纯数字字符串"再比较
                    var hasMatch = phoneValues.some(function (phone) {
                        // 清洗电话号码：只保留数字
                        var cleanPhone = (phone || "").toString().replace(/[^\d]/g, "");
                        if (cleanPhone.length > 10) {
                            cleanPhone = cleanPhone.slice(-10);
                        }
                        var equal = cleanPhone === cleanInput;
                        console.info(
                            "[小馨手机][添加朋友] 比较号码:",
                            "原始号码 =", phone,
                            "清洗后 =", cleanPhone,
                            "输入清洗后 =", cleanInput,
                            "是否相等:", equal
                        );
                        return equal;
                    });

                    if (hasMatch) {
                        console.info("[小馨手机][添加朋友] 找到匹配的联系人:", c);
                    }
                    return hasMatch;
                });
            }

            // 如果手机号搜索没找到，尝试按微信号搜索
            if (!foundContact) {
                foundContact = contacts.find(function (c) {
                    return (
                        c.wechatId === inputValue ||
                        c.wechat_id === inputValue ||
                        c.wechatID === inputValue ||
                        String(c.wechatId) === inputValue ||
                        String(c.wechat_id) === inputValue ||
                        String(c.wechatID) === inputValue
                    );
                });
            }

            console.info("[小馨手机][添加朋友] 搜索输入:", inputValue, "是否手机号:", isPhoneNumber, "找到联系人:", foundContact ? foundContact.nickname : "未找到");

            if (foundContact) {
                // 显示联系人资料页面
                var source = isPhoneNumber ? "手机号搜索" : "微信号搜索";
                renderContactDetailPage(
                    $root,
                    mobilePhone,
                    foundContact,
                    source
                );
            } else {
                // 未找到联系人，提示
                if (typeof toastr !== "undefined") {
                    toastr.info("未找到该联系人", "小馨手机", {
                        timeOut: 2000,
                    });
                }
            }
        }

        $searchInput.on("keypress", function (e) {
            if (e.which === 13) {
                // 回车键
                e.preventDefault();
                performSearch();
            }
        });

        $searchBar.append($searchIcon, $searchInput);
        $search.append($searchBar);

        // 联系人列表
        var $contactList = $(
            '<div class="xiaoxin-wechat-add-friend-contact-list"></div>'
        );

        // 手机联系人项
        var $contactItem = $(
            '<div class="xiaoxin-wechat-add-friend-contact-item"></div>'
        );
        var $contactIcon = $(
            '<div class="xiaoxin-wechat-add-friend-contact-icon"></div>'
        );
        $contactIcon.css(
            "background-image",
            "url(/scripts/extensions/third-party/xiaoxin-phone/image/icon/添加手机联系人.jpg)"
        );

        var $contactInfo = $(
            '<div class="xiaoxin-wechat-add-friend-contact-info"></div>'
        );
        var $contactTitle = $(
            '<div class="xiaoxin-wechat-add-friend-contact-title">手机联系人</div>'
        );
        var $contactDesc = $(
            '<div class="xiaoxin-wechat-add-friend-contact-desc">添加通讯录中的朋友</div>'
        );
        $contactInfo.append($contactTitle, $contactDesc);

        var $contactArrow = $(
            '<div class="xiaoxin-wechat-add-friend-contact-arrow">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );

        $contactItem.append($contactIcon, $contactInfo, $contactArrow);
        $contactList.append($contactItem);

        $main.append($header, $search, $contactList);
        $root.empty().append($main);
    }

    // ========== 显示头像放大预览 ==========
    // 注意：此功能仅在资料卡（联系人资料页面）中生效，个人资料设置页中不生效
    function showAvatarPreview(avatarUrl) {
        // 移除已存在的预览弹窗
        $(".xiaoxin-wechat-avatar-preview-overlay").remove();

        var $phoneContainer = $(".xiaoxin-phone-container");
        if ($phoneContainer.length === 0) {
            console.warn("[小馨手机][微信] 未找到手机容器");
            return;
        }

        var $overlay = $('<div class="xiaoxin-wechat-avatar-preview-overlay"></div>');
        var $container = $('<div class="xiaoxin-wechat-avatar-preview-container"></div>');
        var $img = $('<img class="xiaoxin-wechat-avatar-preview-img" alt="avatar preview" />');
        var $close = $('<div class="xiaoxin-wechat-avatar-preview-close">×</div>');

        $img.attr("src", avatarUrl);
        $img.on("error", function () {
            // 加载失败时使用默认头像
            this.src = "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
        });

        $container.append($img, $close);
        $overlay.append($container);
        $phoneContainer.append($overlay);

        // 显示动画
        setTimeout(function () {
            $overlay.addClass("visible");
        }, 10);

        // 关闭事件
        $close.on("click", function (e) {
            e.stopPropagation();
            closeAvatarPreview();
        });

        $overlay.on("click", function (e) {
            if ($(e.target).hasClass("xiaoxin-wechat-avatar-preview-overlay")) {
                closeAvatarPreview();
            }
        });

        // ESC键关闭
        $(document).on("keydown.avatarPreview", function (e) {
            if (e.keyCode === 27) { // ESC键
                closeAvatarPreview();
            }
        });

        function closeAvatarPreview() {
            $overlay.removeClass("visible");
            setTimeout(function () {
                $overlay.remove();
                $(document).off("keydown.avatarPreview");
            }, 300);
        }
    }

    function renderContactDetailPage($root, mobilePhone, contact, source) {
        console.info("[小馨手机][微信] 渲染联系人资料页面", contact);

        // 判断是否已添加为微信好友
        var isFriend = contact.isFriend === true || contact.friendStatus === "friend";
        // 标记：是否为玩家自己（仅玩家自己的资料卡需要隐藏部分功能）
        var isSelf = contact && contact.isSelf === true;
        // 相关好友申请记录（用于来源/打招呼/待验证按钮）
        var relatedRequest = null;
        try {
            if (
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.getFriendRequests === "function"
            ) {
                var reqs =
                    window.XiaoxinWeChatDataHandler.getFriendRequests() || [];
                var targetId = String(
                    (contact && (contact.characterId || contact.id || "")) || ""
                )
                    .replace(/^contact_/, "")
                    .trim();
                // 优先：角色 -> 玩家 且 pending
                relatedRequest = reqs.find(function (r) {
                    var rid = String(r.roleId || "")
                        .replace(/^contact_/, "")
                        .trim();
                    return (
                        rid === targetId &&
                        r.direction === "role_to_player" &&
                        r.status === "pending"
                    );
                });
                // 兜底：任意同角色的申请
                if (!relatedRequest) {
                    relatedRequest = reqs.find(function (r) {
                        var rid = String(r.roleId || "")
                            .replace(/^contact_/, "")
                            .trim();
                        return rid === targetId;
                    });
                }
            }
        } catch (e) {
            console.warn("[小馨手机][微信] 获取好友申请记录失败:", e);
        }
        // 如果是玩家自己，优先使用账号资料的性别信息（与个人资料弹窗保持一致）
        if (isSelf) {
            try {
                var account =
                    (window.XiaoxinWeChatDataHandler &&
                        typeof window.XiaoxinWeChatDataHandler.getAccount === "function" &&
                        window.XiaoxinWeChatDataHandler.getAccount()) ||
                    (window.XiaoxinWeChatAccount &&
                        typeof window.XiaoxinWeChatAccount.getCurrentAccount === "function" &&
                        window.XiaoxinWeChatAccount.getCurrentAccount()) ||
                    null;
                if (account && (account.gender || account.sex)) {
                    contact.gender = account.gender || account.sex;
                }
                // 同步玩家个人资料中的地区信息到资料卡
                if (!contact.region && account && (account.region || account.location)) {
                    contact.region = account.region || account.location;
                }
            } catch (e) {
                console.warn("[小馨手机][微信] 获取账号性别失败:", e);
            }
        }
        console.info("[小馨手机][微信] 联系人好友状态:", {
            id: contact.id,
            isFriend: contact.isFriend,
            friendStatus: contact.friendStatus,
            isFriendResult: isFriend,
            isSelf: isSelf
        });

        var $main = $(
            '<div class="xiaoxin-wechat-main xiaoxin-wechat-contact-detail-main is-fullscreen"></div>'
        );

        // 顶部返回按钮（左上角）
        var $backWrapper = $(
            '<div class="xiaoxin-wechat-contact-detail-back"></div>'
        );
        var $backIcon = $(
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg>"
        );
        $backWrapper.append($backIcon);
        $backWrapper.on("click", function () {
            // 获取正确的容器（$root 的父容器）
            var $container = $root && $root.parent() ? $root.parent() : null;
            if (!$container || !$container.length) {
                console.warn("[小馨手机][微信] 无法获取容器，返回失败");
                return;
            }

            console.info("[小馨手机][微信] 联系人详情返回，来源:", source);

            // 根据来源判断返回到哪里
            if (source === "通讯录") {
                // 从通讯录页面进入，返回到通讯录页面
                $container.empty();
                if (
                    window.XiaoxinWeChatApp &&
                    typeof window.XiaoxinWeChatApp._renderContactsPage === "function"
                ) {
                    // 创建新的 $root
                    var $newRoot = $('<div class="xiaoxin-wechat-root"></div>');
                    $container.append($newRoot);
                    window.XiaoxinWeChatApp._renderContactsPage($newRoot, mobilePhone);
                } else if (window.XiaoxinWeChatApp && window.XiaoxinWeChatApp.render) {
                    // 兜底：回到微信首页
                        window.XiaoxinWeChatApp.render($container, mobilePhone);
                    }
            } else if (source === "添加朋友" || source === "搜索" ||
                       source === "手机号搜索" || source === "微信号搜索") {
                // 从添加朋友搜索页面进入，返回到添加朋友搜索页面
                $container.empty();
                if (
                    window.XiaoxinWeChatContacts &&
                    typeof window.XiaoxinWeChatContacts.renderAddFriendPage === "function"
                ) {
                    // 创建新的 $root
                    var $newRoot = $('<div class="xiaoxin-wechat-root"></div>');
                    $container.append($newRoot);
                    window.XiaoxinWeChatContacts.renderAddFriendPage($newRoot, mobilePhone);
                } else if (window.XiaoxinWeChatApp && window.XiaoxinWeChatApp.render) {
                    // 兜底：回到微信首页
                    window.XiaoxinWeChatApp.render($container, mobilePhone);
                }
            } else if (source === "朋友圈") {
                // 从朋友圈进入，返回到朋友圈页面
                        $container.empty();
                if (
                    window.XiaoxinWeChatApp &&
                    typeof window.XiaoxinWeChatApp._renderMomentsPage === "function"
                ) {
                    // 创建新的 $root
                    var $newRoot = $('<div class="xiaoxin-wechat-root"></div>');
                    $container.append($newRoot);
                    window.XiaoxinWeChatApp._renderMomentsPage($newRoot, mobilePhone);
                } else if (window.XiaoxinWeChatApp && window.XiaoxinWeChatApp.render) {
                    // 兜底：回到微信首页
                        window.XiaoxinWeChatApp.render($container, mobilePhone);
                    }
            } else {
                // 未知来源，默认返回微信首页
                console.info("[小馨手机][微信] 未知来源，返回微信首页，source:", source);
                $container.empty();
                if (window.XiaoxinWeChatApp && window.XiaoxinWeChatApp.render) {
                    window.XiaoxinWeChatApp.render($container, mobilePhone);
                }
            }
        });

        // 顶部菜单按钮（右上角）- 仅已添加好友显示，但玩家自己的资料卡不显示
        if (isFriend && !isSelf) {
            var $menuWrapper = $(
                '<div class="xiaoxin-wechat-contact-detail-menu"></div>'
            );
            var $menuIcon = $(
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<circle cx="5" cy="12" r="1.5" fill="currentColor"/>' +
                    '<circle cx="12" cy="12" r="1.5" fill="currentColor"/>' +
                    '<circle cx="19" cy="12" r="1.5" fill="currentColor"/>' +
                    "</svg>"
            );
            $menuWrapper.append($menuIcon);
            $menuWrapper.on("click", function () {
                // 跳转到联系人设置页面
                console.info("[小馨手机][微信] 点击资料卡菜单，跳转到设置页面");
                var $container = $root && $root.parent() ? $root.parent() : null;
                if (!$container || !$container.length) {
                    console.warn("[小馨手机][微信] 无法获取容器，跳转失败");
                    return;
                }
                // 创建新的 $root
                var $newRoot = $('<div class="xiaoxin-wechat-root"></div>');
                $container.empty();
                $container.append($newRoot);
                renderContactSettingsPage($newRoot, mobilePhone, contact, source);
            });
            $main.append($menuWrapper);
        }

        // 玩家个人页面：生成历史朋友圈按钮（右上角）- 仅玩家自己且未生成过历史朋友圈时显示
        if (isSelf) {
            // 检查是否已生成过历史朋友圈：
            // 方法1：检查是否已经有玩家历史朋友圈数据（author="user" 或 author="player"）
            // 方法2：检查所有聊天记录中是否包含 [playerhistorymoments] 数据块
            var hasGeneratedHistoryMoments = false;
            try {
                // 方法1：检查是否已经有玩家历史朋友圈数据
                if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getMoments === "function") {
                    try {
                        var allMoments = window.XiaoxinWeChatDataHandler.getMoments() || [];
                        // 检查是否有 author="user" 或 author="player" 的朋友圈
                        var hasPlayerMoments = allMoments.some(function(moment) {
                            var author = moment.author || moment.authorId || moment.userId || "";
                            var authorStr = String(author).trim().toLowerCase();
                            // 支持 author="user" 和 author="player"（兼容旧格式）
                            return authorStr === "user" || authorStr === "player";
                        });
                        if (hasPlayerMoments) {
                            hasGeneratedHistoryMoments = true;
                            console.info("[小馨手机][微信] 发现玩家历史朋友圈数据（author=user/player），已生成过历史朋友圈");
                        }
                    } catch (e) {
                        console.warn("[小馨手机][微信] 检查朋友圈数据失败:", e);
                    }
                }

                // 方法2：检查聊天记录
                if (!hasGeneratedHistoryMoments && window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getAllChats === "function") {
                    var allChats = window.XiaoxinWeChatDataHandler.getAllChats() || {};
                    var totalMessages = 0;
                    var checkedMessages = 0;

                    // 遍历所有聊天记录，检查是否包含 [playerhistorymoments] 数据块
                    for (var chatId in allChats) {
                        if (allChats.hasOwnProperty(chatId)) {
                            var chatHistory = allChats[chatId] || [];
                            totalMessages += chatHistory.length;

                            for (var i = 0; i < chatHistory.length; i++) {
                                checkedMessages++;
                                var msg = chatHistory[i];

                                // 检查多个可能的字段
                                var msgContent = "";
                                if (msg.content) {
                                    msgContent = String(msg.content);
                                } else if (msg.payload && msg.payload.content) {
                                    msgContent = String(msg.payload.content);
                                } else if (msg.text) {
                                    msgContent = String(msg.text);
                                } else if (msg.rawContent) {
                                    msgContent = String(msg.rawContent);
                                } else if (msg.message) {
                                    msgContent = String(msg.message);
                                } else if (msg.originalContent) {
                                    msgContent = String(msg.originalContent);
                                } else if (msg.raw) {
                                    msgContent = String(msg.raw);
                                }

                                // 处理HTML转义：将 &lt; 和 &gt; 还原为 < 和 >
                                var decodedContent = msgContent
                                    .replace(/&lt;/g, "<")
                                    .replace(/&gt;/g, ">")
                                    .replace(/&#60;/g, "<")
                                    .replace(/&#62;/g, ">")
                                    .replace(/&#x3C;/gi, "<")
                                    .replace(/&#x3E;/gi, ">");

                                // 检查是否包含 [playerhistorymoments] 数据块（不区分大小写）
                                // 同时检查原始内容和解码后的内容
                                var contentLower = msgContent.toLowerCase();
                                var decodedLower = decodedContent.toLowerCase();

                                if (contentLower.indexOf("[playerhistorymoments]") !== -1 ||
                                    contentLower.indexOf("playerhistorymoments") !== -1 ||
                                    decodedLower.indexOf("[playerhistorymoments]") !== -1 ||
                                    decodedLower.indexOf("playerhistorymoments") !== -1 ||
                                    // 也检查HTML转义后的格式
                                    contentLower.indexOf("&lt;playerhistorymoments&gt;") !== -1 ||
                                    decodedLower.indexOf("&lt;playerhistorymoments&gt;") !== -1) {
                                    hasGeneratedHistoryMoments = true;
                                    console.info("[小馨手机][微信] 在聊天记录中发现 [playerhistorymoments] 数据块，已生成过历史朋友圈", {
                                        chatId: chatId,
                                        messageIndex: i,
                                        messageId: msg.id,
                                        contentPreview: msgContent.substring(0, 100),
                                        decodedPreview: decodedContent.substring(0, 100),
                                        fullMessage: msg
                                    });
                                    break;
                                }
                            }
                            if (hasGeneratedHistoryMoments) {
                                break;
                            }
                        }
                    }
                    console.info("[小馨手机][微信] 检查历史朋友圈生成状态（通过消息记录）:", {
                        hasGenerated: hasGeneratedHistoryMoments,
                        totalChats: Object.keys(allChats).length,
                        totalMessages: totalMessages,
                        checkedMessages: checkedMessages
                    });
                }

                // 方法2：检查输入框内容（如果消息还在输入框中未发送）
                if (!hasGeneratedHistoryMoments) {
                    try {
                        var selectors = [
                            "#send_textarea",
                            "#send_textarea textarea",
                            "textarea#send_textarea",
                            "#send_textarea_mobile",
                            ".send_textarea",
                            "#message_in",
                            "#user-input",
                        ];
                        for (var j = 0; j < selectors.length; j++) {
                            var $input = $(selectors[j]);
                            if ($input.length > 0) {
                                var inputValue = $input.val() || "";
                                if (inputValue.toLowerCase().indexOf("[playerhistorymoments]") !== -1) {
                                    hasGeneratedHistoryMoments = true;
                                    console.info("[小馨手机][微信] 在输入框中发现 [playerhistorymoments] 数据块");
                                    break;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("[小馨手机][微信] 检查输入框内容失败:", e);
                    }
                }

                // 方法3：降级方案：尝试使用全局变量（如果可用）
                if (!hasGeneratedHistoryMoments && typeof getVariables === "function") {
                    try {
                        var globalData = getVariables({ type: "global" }) || {};
                        hasGeneratedHistoryMoments = globalData.xiaoxin_wechat_player_history_moments_generated === true;
                        if (hasGeneratedHistoryMoments) {
                            console.info("[小馨手机][微信] 使用全局变量检查历史朋友圈生成状态:", hasGeneratedHistoryMoments);
                        }
                    } catch (e) {
                        console.warn("[小馨手机][微信] 使用全局变量检查失败:", e);
                    }
                }
            } catch (e) {
                console.warn("[小馨手机][微信] 检查历史朋友圈生成状态失败:", e);
            }

            // 如果未生成过，显示按钮（使用SVG图标，和历史联系人朋友圈按钮一样）
            if (!hasGeneratedHistoryMoments) {
                var $historyMomentsBtn = $(
                    '<div class="xiaoxin-wechat-contact-detail-history-moments-btn" title="生成历史朋友圈">' +
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '<path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '<path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '</svg>' +
                        '</div>'
                );
                $historyMomentsBtn.on("click", function () {
                    showHistoryMomentsDialog($root, mobilePhone, contact);
                });
                $main.append($historyMomentsBtn);
            } else {
                console.info("[小馨手机][微信] 历史朋友圈已生成，不显示按钮");
            }
        }

        // 内容区域
        var $content = $(
            '<div class="xiaoxin-wechat-contact-detail-content"></div>'
        );

        // 头像和昵称区域
        var $profileSection = $(
            '<div class="xiaoxin-wechat-contact-detail-profile"></div>'
        );

        var $avatar = $(
            '<div class="xiaoxin-wechat-contact-detail-avatar"></div>'
        );
        var avatarUrl =
            contact.avatar ||
            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
        var $avatarImg = $(
            '<img class="xiaoxin-wechat-contact-detail-avatar-img" alt="avatar" />'
        );
        $avatarImg.attr("src", avatarUrl);
        $avatarImg.on("error", function () {
            // 兜底：加载失败时使用默认头像
            this.src =
                "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
        });
        $avatar.append($avatarImg);

        // 添加头像点击放大功能
        $avatar.addClass("xiaoxin-wechat-contact-detail-avatar-clickable");
        $avatar.on("click", function () {
            showAvatarPreview(avatarUrl);
        });

        var $profileInfo = $(
            '<div class="xiaoxin-wechat-contact-detail-profile-info"></div>'
        );

        // 昵称容器
        var $nicknameContainer = $('<div class="xiaoxin-wechat-contact-detail-nickname"></div>');
        // 判断是否有备注
        var hasRemark = contact.remark && contact.remark.trim() !== "";
        var displayNickname = hasRemark ? contact.remark : (contact.nickname || contact.wechatId || "未知");
        var $nicknameText = $('<span>' + displayNickname + "</span>");
        $nicknameContainer.append($nicknameText);

        // 性别图标（如果有）- 显示在昵称右侧
        if (contact.gender) {
            var genderIcon =
                contact.gender === "男" || contact.gender === "male"
                    ? "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微信联系人资料卡性别男.png"
                    : "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微信联系人资料卡性别女.png";
            var $gender = $(
                '<div class="xiaoxin-wechat-contact-detail-gender">' +
                    '<img src="' +
                    genderIcon +
                    '" alt="' +
                    contact.gender +
                    '" />' +
                    "</div>"
            );
            $nicknameContainer.append($gender);
        }

        var $profileMeta = $(
            '<div class="xiaoxin-wechat-contact-detail-profile-meta"></div>'
        );

        // 如果有备注，显示"昵称：XXX"
        if (hasRemark && contact.nickname) {
            var $nicknameLabel = $(
                '<div class="xiaoxin-wechat-contact-detail-nickname-label">昵称: ' +
                    contact.nickname +
                    "</div>"
            );
            $profileMeta.append($nicknameLabel);
        }

        // 微信号（如果有）
        if (contact.wechatId) {
            var $wechatId = $(
                '<div class="xiaoxin-wechat-contact-detail-wechat-id">微信号: ' +
                    contact.wechatId +
                    "</div>"
            );
            $profileMeta.append($wechatId);
        }

        // 地区（如果有）
        if (contact.region) {
            var $region = $(
                '<div class="xiaoxin-wechat-contact-detail-region">地区: ' +
                    contact.region +
                    "</div>"
            );
            $profileMeta.append($region);
        }

        $profileInfo.append($nicknameContainer, $profileMeta);
        $profileSection.append($avatar, $profileInfo);

        // 朋友资料区域（玩家自己的资料卡不显示）
        // 但玩家自己的资料卡仍需要显示“朋友圈”栏，并且样式要与其他联系人一致：
        // 我们用一个不带标题的 friend-info 容器来承载它。
        var $selfMomentsWrapper = null; // 玩家自己的朋友圈栏容器（样式同 friend-info）
        var $friendInfoSection = null;
        if (!isSelf) {
            $friendInfoSection = $(
                '<div class="xiaoxin-wechat-contact-detail-friend-info"></div>'
            );
            var $friendInfoTitle = $(
                '<div class="xiaoxin-wechat-contact-detail-friend-info-title">朋友资料</div>'
            );

            if (isFriend) {
                // 已添加好友：显示标签或默认提示
                var tags = Array.isArray(contact.tags) && contact.tags.length > 0 ? contact.tags : [];
                var $tagItem = $(
                    '<div class="xiaoxin-wechat-contact-detail-friend-info-item">' +
                        '<div class="xiaoxin-wechat-contact-detail-friend-info-value">' +
                        "</div>" +
                        '<div class="xiaoxin-wechat-contact-detail-friend-info-arrow">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        "</svg></div>" +
                        "</div>"
                );
                var $tagValue = $tagItem.find(".xiaoxin-wechat-contact-detail-friend-info-value");
                if (tags.length > 0) {
                    // 有标签：显示"标签"字样和标签内容
                    var $tagLabel = $('<div class="xiaoxin-wechat-contact-detail-friend-info-label">标签</div>');
                    $tagValue.text(tags.join("、"));
                    $tagItem.prepend($tagLabel);
                } else {
                    // 没有标签：只显示默认提示文字，不显示"标签"字样
                    $tagValue.text("添加朋友的备注名、电话、标签，并设置权限").addClass("placeholder");
                }
                $friendInfoSection.append($friendInfoTitle, $tagItem);
            } else {
                // 未添加好友：显示来源
                var sourceText = source || relatedRequest && relatedRequest.source || "";
                if (relatedRequest && relatedRequest.extra) {
                    sourceText =
                        relatedRequest.extra["来源"] ||
                        relatedRequest.extra["来源方式"] ||
                        relatedRequest.extra["来源渠道"] ||
                        relatedRequest.extra["来源描述"] ||
                        sourceText;
                }
                if (!sourceText) {
                    if (
                        relatedRequest &&
                        relatedRequest.direction === "role_to_player"
                    ) {
                        sourceText = "对方申请添加你";
                    } else {
                        sourceText = "未知";
                    }
                }
                var $sourceItem = $(
                    '<div class="xiaoxin-wechat-contact-detail-friend-info-item">' +
                        '<div class="xiaoxin-wechat-contact-detail-friend-info-label">来源</div>' +
                        '<div class="xiaoxin-wechat-contact-detail-friend-info-value">' +
                        sourceText +
                        "</div>" +
                        '<div class="xiaoxin-wechat-contact-detail-friend-info-arrow">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        "</svg></div>" +
                        "</div>"
                );
                $friendInfoSection.append($friendInfoTitle, $sourceItem);
            }
        }

        // 打招呼内容（仅未成为好友且有好友申请记录时显示）
        var $greetingBar = null;
        if (
            !isFriend &&
            relatedRequest &&
            (relatedRequest.greeting ||
                (relatedRequest.extra && relatedRequest.extra["打招呼内容"]))
        ) {
            var greetText =
                relatedRequest.greeting ||
                (relatedRequest.extra && relatedRequest.extra["打招呼内容"]) ||
                "";
            var displayNickname =
                contact.remark ||
                contact.nickname ||
                relatedRequest.nickname ||
                (relatedRequest.extra && relatedRequest.extra["微信昵称"]) ||
                "微信用户";
            var greetingDisplay = displayNickname + "：" + greetText;
            $greetingBar = $(
                '<div class="xiaoxin-wechat-contact-detail-greeting-bar"></div>'
            );
            var $greetingText = $(
                '<div class="xiaoxin-wechat-contact-detail-greeting-text"></div>'
            ).text(greetingDisplay);

            // 应用新样式：浅灰色背景、缩小字号、浅黑色字体
            $greetingBar.css({
                'background-color': '#f5f5f5', // 浅灰色背景
                'padding': '8px 12px',
                'border-radius': '6px',
                'margin-top': '10px' // 与其他部分保持间距
            });
            $greetingText.css({
                'font-size': '14px', // 缩小字号
                'color': '#333333' // 浅黑色
            });

            // 只显示内容，不显示“打招呼”标签
            $greetingBar.append($greetingText);
        }

        // 标记：是否为角色向玩家发起的待处理申请
        var isPendingRoleRequest = relatedRequest &&
            relatedRequest.direction === 'role_to_player' &&
            relatedRequest.status === 'pending';

        // 朋友圈区域（已添加好友 或 角色发起的待处理申请 或 玩家自己 时显示）
        if (isFriend || isPendingRoleRequest || isSelf) {
            var $momentsSection = $(
                '<div class="xiaoxin-wechat-contact-detail-moments"></div>'
            );
            var $momentsTitle = $(
                '<div class="xiaoxin-wechat-contact-detail-moments-title">朋友圈</div>'
            );
            var $momentsThumbnails = $(
                '<div class="xiaoxin-wechat-contact-detail-moments-thumbnails"></div>'
            );

            // 获取该联系人的朋友圈动态
            var moments = [];
            if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getMoments === "function") {
                var allMoments = window.XiaoxinWeChatDataHandler.getMoments() || [];
                // 筛选出该联系人的朋友圈动态（兼容 authorId = "5" vs contact.id = "contact_5"）
                var contactIdStr = String(contact.id || "").trim();
                var contactIdBare = contactIdStr.replace(/^contact_/, "");
                // 玩家自己的资料卡：发朋友圈时 author 通常使用 wechatId、user 或 player，需要额外兼容
                var contactWechatIdStr = contact.wechatId
                    ? String(contact.wechatId).trim()
                    : "";
                var contactWechatBare = contactWechatIdStr.replace(/^contact_/, "");
                moments = allMoments.filter(function(m) {
                    var authorRaw = m.authorId || m.userId || m.author;
                    if (!authorRaw) return false;
                    var authorStr = String(authorRaw).trim();
                    var authorBare = authorStr.replace(/^contact_/, "");
                    var authorLower = authorStr.toLowerCase();

                    // 玩家自己的资料卡：识别 author="user" 或 author="player" 的朋友圈
                    if (isSelf) {
                        if (authorLower === "user" || authorLower === "player") {
                            return true;
                        }
                    }

                    // 普通联系人：通过ID匹配
                    return (
                        authorStr === contactIdStr ||
                        authorBare === contactIdBare ||
                        ("contact_" + authorBare) === contactIdStr ||
                        ("contact_" + contactIdBare) === authorStr ||
                        (contactWechatIdStr &&
                            (authorStr === contactWechatIdStr ||
                                authorBare === contactWechatBare))
                    );
                });

                // 去重：基于朋友圈ID去除重复项
                var seenIds = new Set();
                moments = moments.filter(function(moment) {
                    var momentId = moment.id || moment._id;
                    if (!momentId) {
                        // 如果没有ID，使用内容+作者+时间戳作为唯一标识
                        momentId = (moment.content || "") + "|" + (moment.authorId || moment.userId || moment.author || "") + "|" + (moment.timestamp || 0);
                    }
                    var idStr = String(momentId).trim();
                    if (seenIds.has(idStr)) {
                        console.warn(
                            "[小馨手机][微信] 联系人资料卡: 发现重复朋友圈，已过滤。ID:",
                            idStr
                        );
                        return false;
                    }
                    seenIds.add(idStr);
                    return true;
                });

                // 按时间倒序排列（不限制数量，收集所有朋友圈的图片）
                moments = moments.sort(function(a, b) {
                    return (b.timestamp || 0) - (a.timestamp || 0);
                });
            }

            // 收集所有朋友圈动态中的所有图片（包括音乐专辑封面）
            // 注意：不限制朋友圈数量，从所有朋友圈中收集图片，然后取最新的4张
            // ⚠️ 重要：未添加的好友申请（待处理的好友申请且不是已添加好友）不显示朋友圈图片内容
            var allImages = []; // 存储 {url: 图片URL, timestamp: 时间戳} 对象数组

            // 如果是待处理的好友申请且不是已添加好友，则不收集朋友圈图片
            var shouldShowMomentsImages = !(isPendingRoleRequest && !isFriend);

            if (moments.length > 0 && shouldShowMomentsImages) {
                for (var i = 0; i < moments.length; i++) {
                    var moment = moments[i];
                    var momentTimestamp = moment.timestamp || 0;

                    // 1. 收集普通图片动态中的所有图片
                    // 1.1 收集 images 数组中的图片
                    if (moment.images && Array.isArray(moment.images) && moment.images.length > 0) {
                        for (var j = 0; j < moment.images.length; j++) {
                            var imageUrl = String(moment.images[j] || "").trim();
                            if (imageUrl) {
                                allImages.push({
                                    url: imageUrl,
                                    timestamp: momentTimestamp
                                });
                            }
                        }
                    }
                    // 1.2 收集单张图片（moment.image 字段）
                    if (moment.image && typeof moment.image === "string") {
                        var singleImageUrl = String(moment.image).trim();
                        if (singleImageUrl) {
                            allImages.push({
                                url: singleImageUrl,
                                timestamp: momentTimestamp
                            });
                        }
                    }
                    // 1.3 收集 content 字段中的图片URL（如果 content 是图片URL）
                    if (moment.content && typeof moment.content === "string") {
                        var contentStr = String(moment.content).trim();
                        var isContentUrl =
                            contentStr.startsWith("http://") ||
                            contentStr.startsWith("https://") ||
                            contentStr.startsWith("/") ||
                            contentStr.startsWith("data:image") ||
                            /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(contentStr);
                        if (isContentUrl && moment.type === "image") {
                            allImages.push({
                                url: contentStr,
                                timestamp: momentTimestamp
                            });
                        }
                    }

                    // 2. 收集音乐动态的专辑封面
                    if (moment.type === "music" && moment.music && moment.music.cover) {
                        var coverUrl = null;

                        if (typeof moment.music.cover === "string") {
                            // 如果是字符串，判断是URL还是描述
                            var trimmedCover = moment.music.cover.trim();
                            var isCoverUrl =
                                trimmedCover.startsWith("http://") ||
                                trimmedCover.startsWith("https://") ||
                                trimmedCover.startsWith("/") ||
                                trimmedCover.startsWith("data:image") ||
                                /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(trimmedCover);

                            if (isCoverUrl) {
                                coverUrl = moment.music.cover;
                            }
                        } else if (typeof moment.music.cover === "object" && moment.music.cover !== null) {
                            // 如果是对象，优先使用url字段（已生成的封面URL）
                            coverUrl = moment.music.cover.url || null;

                            // 如果对象中没有url，但description是URL格式，也使用
                            if (!coverUrl && moment.music.cover.description) {
                                var desc = String(moment.music.cover.description || "").trim();
                                var isDescUrl =
                                    desc.startsWith("http://") ||
                                    desc.startsWith("https://") ||
                                    desc.startsWith("/") ||
                                    desc.startsWith("data:image") ||
                                    /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(desc);

                                if (isDescUrl) {
                                    coverUrl = desc;
                                }
                            }
                        }

                        if (coverUrl) {
                            allImages.push({
                                url: coverUrl,
                                timestamp: momentTimestamp
                            });
                        }
                    }
                }
            }

            // 按时间倒序排列（最新的在前）
            allImages.sort(function(a, b) {
                return (b.timestamp || 0) - (a.timestamp || 0);
            });

            // 去重图片URL，保留最新的
            var seenImageUrls = new Set();
            var uniqueImages = [];
            for (var k = 0; k < allImages.length; k++) {
                var img = allImages[k];
                var imgUrl = String(img.url || "").trim();
                if (imgUrl && !seenImageUrls.has(imgUrl)) {
                    seenImageUrls.add(imgUrl);
                    uniqueImages.push(img);
                }
            }

            // 取最新的4张图片显示
            var maxThumbnails = 4;
            var displayImages = uniqueImages.slice(0, maxThumbnails);

            // 渲染缩略图
            for (var m = 0; m < displayImages.length; m++) {
                var displayImage = displayImages[m];
                var $thumbnail = $(
                    '<div class="xiaoxin-wechat-contact-detail-moments-thumbnail"></div>'
                );
                $thumbnail.css("background-image", "url(" + displayImage.url + ")");
                $momentsThumbnails.append($thumbnail);
            }

            var $momentsArrow = $(
                '<div class="xiaoxin-wechat-contact-detail-moments-arrow">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                    "</svg></div>"
            );

            var $momentsItem = $(
                '<div class="xiaoxin-wechat-contact-detail-friend-info-item xiaoxin-wechat-contact-detail-moments-item"></div>'
            );
            $momentsItem.append($momentsTitle);
            if ($momentsThumbnails.children().length > 0) {
                $momentsItem.append($momentsThumbnails);
            }
            $momentsItem.append($momentsArrow);
            $momentsItem.on("click", function() {
                // 跳转到该联系人的朋友圈页面
                console.info("[小馨手机][微信] 点击朋友圈，联系人ID:", contact.id);
                if (
                    window.XiaoxinWeChatApp &&
                    typeof window.XiaoxinWeChatApp._renderContactMomentsPage === "function"
                ) {
                    // 如果是待处理的好友申请，则显示空的朋友圈
                    var showEmptyMoments = isPendingRoleRequest;
                    window.XiaoxinWeChatApp._renderContactMomentsPage($root, mobilePhone, contact, showEmptyMoments);
                } else {
                    console.warn("[小馨手机][微信] _renderContactMomentsPage 方法不存在");
                    if (typeof toastr !== "undefined") {
                        toastr.info("朋友圈功能待实现", "小馨手机");
                    }
                }
            });
            $momentsSection.append($momentsItem);

            if ($friendInfoSection) {
                // 普通联系人：朋友圈挂在朋友资料下面
                $friendInfoSection.append($momentsSection);
            } else if (isSelf) {
                // 玩家自己的资料卡：用与 friend-info 一致的容器包裹（不显示“朋友资料”标题）
                $selfMomentsWrapper = $(
                    '<div class="xiaoxin-wechat-contact-detail-friend-info xiaoxin-wechat-contact-detail-friend-info-self"></div>'
                );
                $selfMomentsWrapper.append($momentsSection);
            }
        }

        // 底部按钮区域
        if (isFriend) {
            // 已添加好友：显示"发消息"按钮；玩家自己的资料卡不显示音视频通话
            var $actionBar = $(
                '<div class="xiaoxin-wechat-contact-detail-action-bar"></div>'
            );
            // 发消息按钮
            var $messageButton = $(
                '<div class="xiaoxin-wechat-contact-detail-action-button xiaoxin-wechat-contact-detail-message-button">' +
                    '<span>发消息</span>' +
                    "</div>"
            );
            $messageButton.on("click", function() {
                // 跳转到聊天详情页面
                // 优先使用联系人的主ID，其次 characterId / wechatId，确保能命中聊天记录
                var chatId =
                    contact.id ||
                    contact.characterId ||
                    contact.wechatId ||
                    contact.chatUserId;
                if (!chatId && contact.nickname) {
                    chatId = contact.nickname;
                }
                if (!chatId) {
                    console.warn("[小馨手机][微信] 无法确定聊天ID，contact:", contact);
                    if (typeof toastr !== "undefined") {
                        toastr.error("未找到该联系人的聊天ID", "小馨手机");
                    }
                    return;
                }

                if (
                    window.XiaoxinWeChatApp &&
                    typeof window.XiaoxinWeChatApp._renderChatDetailPage ===
                        "function"
                ) {
                    window.XiaoxinWeChatApp._renderChatDetailPage(
                        $root,
                        mobilePhone,
                        chatId,
                        {
                            userId: chatId,
                            contact: contact,
                        }
                    );
                } else {
                    console.warn("[小馨手机][微信] 无法跳转到聊天页面：_renderChatDetailPage 方法不存在");
                }
            });
            $actionBar.append($messageButton);
            if (!isSelf) {
                // 音视频通话按钮（仅非玩家自己的资料卡显示）
                var $callButton = $(
                    '<div class="xiaoxin-wechat-contact-detail-action-button xiaoxin-wechat-contact-detail-call-button">' +
                        '<span>音视频通话</span>' +
                        "</div>"
                );
                $callButton.on("click", function() {
                    // TODO: 发起音视频通话
                    console.info("[小馨手机][微信] 点击音视频通话，联系人ID:", contact.id);
                });
                $actionBar.append($callButton);
            }
            if ($friendInfoSection) {
                $content.append(
                    $profileSection,
                    $greetingBar,
                    $friendInfoSection,
                    $actionBar
                );
            } else if ($selfMomentsWrapper) {
                // 玩家自己的资料卡：头像/昵称 + 朋友圈（同样式） + 发消息
                $content.append(
                    $profileSection,
                    $greetingBar,
                    $selfMomentsWrapper,
                    $actionBar
                );
            } else {
                $content.append($profileSection, $greetingBar, $actionBar);
            }
        } else {
            // 未添加好友：显示"添加到通讯录"按钮
            var showVerifyActions =
                relatedRequest &&
                relatedRequest.direction === "role_to_player" &&
                relatedRequest.status === "pending";

            if (showVerifyActions) {
                var $verifyBar = $(
                    '<div class="xiaoxin-wechat-contact-detail-verify-bar"></div>'
                );
                var $acceptBtn = $(
                    '<div class="xiaoxin-wechat-contact-detail-verify-button accept">接受</div>'
                );
                var $rejectBtn = $(
                    '<div class="xiaoxin-wechat-contact-detail-verify-button reject">拒绝</div>'
                );

                $acceptBtn.on("click", function () {
                    if (
                        window.XiaoxinWeChatDataHandler &&
                        typeof window.XiaoxinWeChatDataHandler.acceptFriendRequest ===
                            "function"
                    ) {
                        var ok =
                            window.XiaoxinWeChatDataHandler.acceptFriendRequest(
                                relatedRequest.id
                            );
                        if (ok) {
                            // 接受后，重新获取最新的联系人信息（因为 acceptFriendRequest 可能创建了新联系人）
                            var updatedContact = null;
                            try {
                                if (
                                    window.XiaoxinWeChatDataHandler &&
                                    typeof window.XiaoxinWeChatDataHandler.getContactById === "function"
                                ) {
                                    updatedContact = window.XiaoxinWeChatDataHandler.getContactById(
                                        contact.id || contact.characterId || relatedRequest.roleId
                                    );
                                }
                                if (!updatedContact && window.XiaoxinWeChatDataHandler.getContacts) {
                                    var contacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
                                    var roleIdStr = String(relatedRequest.roleId || "").trim();
                                    updatedContact = contacts.find(function (c) {
                                        var cId = String(c.id || "").trim();
                                        var cCharId = String(c.characterId || "").trim();
                                        return (
                                            cId === roleIdStr ||
                                            cId === "contact_" + roleIdStr ||
                                            cCharId === roleIdStr
                                        );
                                    });
                                }
                            } catch (e) {
                                console.warn("[小馨手机][微信] 获取更新后的联系人信息失败:", e);
                            }

                            // 使用更新后的联系人信息，如果没有则使用原来的
                            var finalContact = updatedContact || contact;
                            if (finalContact) {
                                finalContact.isFriend = true;
                                finalContact.friendStatus = "friend";
                                if (window.toastr) {
                                    toastr.success("已添加到通讯录", "新的朋友");
                                }
                                // 接受后弹出通过好友验证页面
                                renderFriendPassVerifyPage($root, mobilePhone, finalContact);
                            } else {
                                console.error("[小馨手机][微信] 接受好友申请后未找到对应联系人，无法跳转到验证页面");
                                if (window.toastr) {
                                    toastr.error("添加成功但无法打开验证页，请手动设置", "新的朋友");
                                }
                            }
                        }
                        return; // 不再刷新原资料页
                    }
                });

                $rejectBtn.on("click", function () {
                    if (
                        window.XiaoxinWeChatDataHandler &&
                        typeof window.XiaoxinWeChatDataHandler.rejectFriendRequest ===
                            "function"
                    ) {
                        var ok =
                            window.XiaoxinWeChatDataHandler.rejectFriendRequest(
                                relatedRequest.id
                            );
                        if (ok && window.toastr) {
                            toastr.info("已拒绝好友申请", "新的朋友");
                        }
                        renderContactDetailPage(
                            $root,
                            mobilePhone,
                            contact,
                            source
                        );
                    }
                });

                $verifyBar.append($rejectBtn, $acceptBtn);

                if ($friendInfoSection || $greetingBar) {
                    $content.append(
                        $profileSection,
                        $greetingBar,
                        $friendInfoSection,
                        $verifyBar
                    );
                } else {
                    $content.append($profileSection, $verifyBar);
                }
            } else {
            var $addButton = $(
                '<div class="xiaoxin-wechat-contact-detail-add-button">添加到通讯录</div>'
            );
            $addButton.on("click", function () {
                renderFriendRequestPage($root, mobilePhone, contact, source);
            });

            var $addBar = $(
                '<div class="xiaoxin-wechat-contact-detail-add-bar"></div>'
            );
            $addBar.append($addButton);
                if ($friendInfoSection || $greetingBar) {
                    $content.append(
                        $profileSection,
                        $greetingBar,
                        $friendInfoSection,
                        $addBar
                    );
            } else {
                $content.append($profileSection, $addBar);
                }
            }
        }

        $main.append($backWrapper, $content);
        $root.empty().append($main);
    }

    // ========== 渲染好友申请页面 ==========
    function renderFriendRequestPage($root, mobilePhone, contact, source) {
        console.info("[小馨手机][微信] 渲染好友申请页面", contact);

        var account =
            window.XiaoxinWeChatDataHandler &&
            window.XiaoxinWeChatDataHandler.getAccount
                ? window.XiaoxinWeChatDataHandler.getAccount()
                : null;
        var playerNickname =
            (account && account.nickname) || "微信用户";
        var greetingDefault = "我是" + playerNickname;
        var remarkDefault =
            (contact && (contact.remark || contact.nickname || contact.wechatId || contact.id)) ||
            "";
        var selectedTags = Array.isArray(contact && contact.tags)
            ? contact.tags.slice()
            : [];
        var permissionType = "all"; // all/chat_only
        var hideMyMoments = false;
        var hideTheirMoments = false;

        function normalizeLine(text, fallback) {
            var value = (text || "").toString().replace(/\r?\n/g, " ").trim();
            if (!value && fallback) {
                value = fallback;
            }
            return value;
        }

        var $main = $(
            '<div class="xiaoxin-wechat-main xiaoxin-wechat-friend-apply-main"></div>'
        );

        // 标题栏
        var $header = $('<div class="xiaoxin-wechat-friend-apply-header"></div>');
        var $headerBar = $('<div class="xiaoxin-wechat-friend-apply-header-bar"></div>');
        var $headerLeft = $('<div class="xiaoxin-wechat-friend-apply-header-left"></div>');
        var $back = $(
            '<div class="xiaoxin-wechat-header-back">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        $back.on("click", function () {
            renderContactDetailPage($root, mobilePhone, contact, source || "");
        });
        $headerLeft.append($back);
        var $headerTitle = $(
            '<div class="xiaoxin-wechat-friend-apply-header-title">申请添加朋友</div>'
        );
        var $headerRight = $('<div class="xiaoxin-wechat-friend-apply-header-right"></div>');
        $headerBar.append($headerLeft, $headerTitle, $headerRight);
        $header.append($headerBar);

        var $content = $('<div class="xiaoxin-wechat-friend-apply-content"></div>');

        // 打招呼内容
        var $greetingBlock = $(
            '<div class="xiaoxin-wechat-friend-apply-card greeting-card"></div>'
        );
        var $greetingLabel = $(
            '<div class="xiaoxin-wechat-friend-apply-label">打招呼内容</div>'
        );
        var $greetingTextarea = $(
            '<textarea class="xiaoxin-wechat-friend-apply-textarea" maxlength="80"></textarea>'
        );
        $greetingTextarea.val(greetingDefault);
        $greetingBlock.append($greetingLabel, $greetingTextarea);

        // 备注
        var $remarkSection = $(
            '<div class="xiaoxin-wechat-friend-apply-section"></div>'
        );
        var $remarkRow = $(
            '<div class="xiaoxin-wechat-friend-apply-row input-row"></div>'
        );
        $remarkRow.append('<div class="xiaoxin-wechat-friend-apply-row-label">备注</div>');
        var $remarkInput = $(
            '<input class="xiaoxin-wechat-friend-apply-input" type="text" placeholder="给朋友添加备注" />'
        );
        $remarkInput.val(remarkDefault);

        // 强制备注输入框使用浅灰色样式，避免被酒馆主题覆盖
        try {
            var remarkEl = $remarkInput[0];
            if (remarkEl && remarkEl.style && remarkEl.style.setProperty) {
                remarkEl.style.setProperty(
                    "background-color",
                    "#f5f5f5",
                    "important"
                );
                remarkEl.style.setProperty("border", "0", "important");
                remarkEl.style.setProperty("outline", "0", "important");
                remarkEl.style.setProperty("box-shadow", "none", "important");
                remarkEl.style.setProperty("color", "#000", "important");
                remarkEl.style.setProperty("caret-color", "#000", "important");
                remarkEl.style.setProperty("border-radius", "8px", "important");
                remarkEl.style.setProperty("padding", "8px 12px", "important");
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信] 备注输入框样式设置失败:",
                e && e.message ? e.message : e
            );
        }

        $remarkRow.append($remarkInput);
        $remarkSection.append($remarkRow);

        // 标签
        var $tagRow = $(
            '<div class="xiaoxin-wechat-friend-apply-row link-row"></div>'
        );
        $tagRow.append('<div class="xiaoxin-wechat-friend-apply-row-label">标签</div>');
        var $tagValue = $(
            '<div class="xiaoxin-wechat-friend-apply-row-value xiaoxin-wechat-friend-apply-tag-value">添加标签</div>'
        );
        var $tagArrow = $(
            '<div class="xiaoxin-wechat-friend-apply-row-arrow">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        function renderTags() {
            if (selectedTags.length === 0) {
                $tagValue.text("添加标签").addClass("placeholder");
            } else {
                $tagValue.text(selectedTags.join("、")).removeClass("placeholder");
            }
        }
        renderTags();
        $tagRow.append($tagValue, $tagArrow);
        $tagRow.on("click", function () {
            renderTagPicker($root, mobilePhone, selectedTags, function (newTags) {
                selectedTags = newTags;
                renderTags();
            });
        });
        $remarkSection.append($tagRow);

        // 朋友权限
        var $permissionSection = $(
            '<div class="xiaoxin-wechat-friend-apply-section permission-section"></div>'
        );
        var $permissionTitle = $(
            '<div class="xiaoxin-wechat-friend-apply-label permission-label">朋友权限</div>'
        );
        var $permissionList = $(
            '<div class="xiaoxin-wechat-friend-apply-permission-list"></div>'
        );

        function createPermissionOption(text, type) {
            var $option = $(
                '<div class="xiaoxin-wechat-friend-apply-permission-option"></div>'
            );
            $option.append(
                '<div class="xiaoxin-wechat-friend-apply-permission-text">' +
                    text +
                    "</div>"
            );
            var $check = $(
                '<div class="xiaoxin-wechat-friend-apply-permission-check"></div>'
            );
            $option.append($check);
            $option.on("click", function () {
                selectPermission(type);
            });
            return { $option: $option, $check: $check, type: type };
        }

        var permissionOptions = {
            all: createPermissionOption("聊天、朋友圈、微信运动等", "all"),
            chat: createPermissionOption("仅聊天", "chat_only"),
        };

        function createSwitchRow(text, initial) {
            var state = initial;
            var $row = $(
                '<div class="xiaoxin-wechat-friend-apply-permission-option switch-row"></div>'
            );
            $row.append(
                '<div class="xiaoxin-wechat-friend-apply-permission-text">' +
                    text +
                    "</div>"
            );
            var $switch = $(
                '<div class="xiaoxin-wechat-friend-apply-switch">' +
                    '<div class="xiaoxin-wechat-friend-apply-switch-handle"></div>' +
                    "</div>"
            );
            if (state) {
                $switch.addClass("on");
            }
            $row.append($switch);
            $row.on("click", function () {
                state = !state;
                $switch.toggleClass("on", state);
            });
            return {
                $row: $row,
                getState: function () {
                    return state;
                },
            };
        }

        var subHideMine = createSwitchRow(
            "不给他（她）看我的朋友圈和状态",
            hideMyMoments
        );
        var subHideTheirs = createSwitchRow(
            "不看他（她）的朋友圈和状态",
            hideTheirMoments
        );

        function selectPermission(type) {
            permissionType = type;
            Object.keys(permissionOptions).forEach(function (key) {
                var isActive = key === "all" ? type === "all" : type === "chat_only";
                permissionOptions[key].$option.toggleClass("selected", isActive);
            });
            if (type === "all") {
                subHideMine.$row.slideDown(150);
                subHideTheirs.$row.slideDown(150);
            } else {
                subHideMine.$row.slideUp(150);
                subHideTheirs.$row.slideUp(150);
            }
        }

        // 按顺序添加：第一个选项 -> 子选项1 -> 子选项2 -> 第二个选项
        $permissionList.append(permissionOptions.all.$option);
        $permissionList.append(subHideMine.$row);
        $permissionList.append(subHideTheirs.$row);
        $permissionList.append(permissionOptions.chat.$option);

        // 初始状态：子选项默认显示
        subHideMine.$row.show();
        subHideTheirs.$row.show();

        $permissionSection.append($permissionTitle, $permissionList);
        selectPermission("all");

        // 底部发送按钮
        var $footer = $('<div class="xiaoxin-wechat-friend-apply-footer"></div>');
        var $sendBtn = $(
            '<div class="xiaoxin-wechat-friend-apply-send">发送</div>'
        );
        $sendBtn.on("click", function () {
            var greeting = normalizeLine(
                $greetingTextarea.val(),
                greetingDefault
            );
            var remark = normalizeLine($remarkInput.val(), remarkDefault);
            hideMyMoments = subHideMine.getState();
            hideTheirMoments = subHideTheirs.getState();

            var permissionLabel =
                permissionType === "all"
                    ? "聊天、朋友圈、微信运动等"
                    : "仅聊天";

            // 获取世界观时间
            var worldTime = "";
            var worldTimestamp = null;
            if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.rawTime) {
                worldTime = window.XiaoxinWorldClock.rawTime;
                worldTimestamp = window.XiaoxinWorldClock.currentTimestamp || window.XiaoxinWorldClock.timestamp;
                console.info(
                    "[小馨手机][微信] 好友申请使用世界观时间:",
                    worldTime,
                    "时间戳:",
                    worldTimestamp
                );
            } else if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.currentTimestamp) {
                // 如果没有原始时间字符串，从时间戳格式化
                var worldDate = new Date(window.XiaoxinWorldClock.currentTimestamp);
                function pad(n) {
                    return n < 10 ? "0" + n : String(n);
                }
                worldTime = worldDate.getFullYear() + "年" + pad(worldDate.getMonth() + 1) + "月" + pad(worldDate.getDate()) + "日 " +
                           pad(worldDate.getHours()) + ":" + pad(worldDate.getMinutes()) + ":" + pad(worldDate.getSeconds());
                worldTimestamp = window.XiaoxinWorldClock.currentTimestamp;
                console.info(
                    "[小馨手机][微信] 好友申请从世界观时间戳生成时间:",
                    worldTime
                );
            } else {
                console.warn(
                    "[小馨手机][微信] 无法获取世界观时间，好友申请将不包含时间字段（不推荐）"
                );
            }

            var commandLines = [
                "[wx_friend_apply]",
                "角色ID=" + (contact && contact.id ? contact.id : ""),
            ];
            // 如果有世界观时间，添加时间字段
            if (worldTime) {
                commandLines.push("时间=" + worldTime);
            }
            commandLines.push(
                "打招呼内容=" + greeting,
                "备注=" + remark,
                "标签=" + (selectedTags.length ? selectedTags.join("、") : "无"),
                "朋友权限=" + permissionLabel,
            );
            if (permissionType === "all") {
                commandLines.push(
                    "不给TA看我的朋友圈和状态=" + (hideMyMoments ? "是" : "否")
                );
                commandLines.push(
                    "不看TA的朋友圈和状态=" + (hideTheirMoments ? "是" : "否")
                );
            }
            if (source) {
                commandLines.push("来源=" + source);
            }
            commandLines.push("[/wx_friend_apply]");
            var command = commandLines.join("\n");

            var ok = insertTextToTavernInput(command);
            if (typeof toastr !== "undefined") {
                if (ok) {
                    toastr.success("已生成好友申请指令，请在输入框确认发送", "小馨手机");
                } else {
                    toastr.info("未找到输入框，指令已复制/请手动填写", "小馨手机");
                }
            }

            // 写入联系人状态为待通过
            if (window.XiaoxinWeChatDataHandler) {
                var pendingContact = Object.assign({}, contact || {}, {
                    isFriend: false,
                    friendStatus: "pending",
                    remark: remark,
                    tags: selectedTags,
                });
                window.XiaoxinWeChatDataHandler.addContact(pendingContact);
            }

            // 返回联系人详情页
            renderContactDetailPage($root, mobilePhone, contact, source || "");
        });
        $footer.append($sendBtn);

        $content.append(
            $greetingBlock,
            $remarkSection,
            $permissionSection,
            $footer
        );
        $main.append($header, $content);
        $root.empty().append($main);
    }

    // ========== 渲染新的朋友页面 ==========
    function renderNewFriendsPage($root, mobilePhone) {
        console.info("[小馨手机][微信] 渲染新的朋友页面");

        if (!window.XiaoxinWeChatDataHandler) {
            console.warn("[小馨手机][微信] 数据处理器未加载，无法渲染新的朋友");
            return;
        }

        var $main = $(
            '<div class="xiaoxin-wechat-main xiaoxin-wechat-new-friends-main"></div>'
        );

        // 标题栏
        var $header = $('<div class="xiaoxin-wechat-new-friends-header"></div>');
        var $headerBar = $(
            '<div class="xiaoxin-wechat-new-friends-header-bar"></div>'
        );
        var $headerLeft = $(
            '<div class="xiaoxin-wechat-new-friends-header-left"></div>'
        );
        var $back = $(
            '<div class="xiaoxin-wechat-header-back">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        $back.on("click", function () {
            // 返回通讯录主界面
            if ($root && $root.parent()) {
                var $container = $root.parent();
                $container.empty();
                if (window.XiaoxinWeChatApp && window.XiaoxinWeChatApp._renderContactsPage) {
                    window.XiaoxinWeChatApp._renderContactsPage($container, mobilePhone);
                } else if (window.XiaoxinWeChatApp && window.XiaoxinWeChatApp.render) {
                    window.XiaoxinWeChatApp.render($container, mobilePhone);
                }
            }
        });
        $headerLeft.append($back);

        var $headerTitle = $(
            '<div class="xiaoxin-wechat-new-friends-header-title">新的朋友</div>'
        );
        var $headerRight = $(
            '<div class="xiaoxin-wechat-new-friends-header-right"></div>'
        );

        $headerBar.append($headerLeft, $headerTitle, $headerRight);
        $header.append($headerBar);

        var $content = $('<div class="xiaoxin-wechat-new-friends-content"></div>');

        // 从数据中获取好友申请记录（如果没有就初始化为空数组）
        var requests =
            window.XiaoxinWeChatDataHandler.getFriendRequests &&
            window.XiaoxinWeChatDataHandler.getFriendRequests();
        if (!Array.isArray(requests)) {
            requests = [];
        }

        if (requests.length === 0) {
            var $empty = $(
                '<div class="xiaoxin-wechat-new-friends-section-title">暂无新的朋友</div>'
            );
            $content.append($empty);
        } else {
            // 获取当前世界观时间（基于最新消息的时间标签）
            var currentWorldTimestamp = null;

            // 1. 优先使用全局世界观时钟
            if (
                window.XiaoxinWorldClock &&
                window.XiaoxinWorldClock.currentTimestamp
            ) {
                currentWorldTimestamp = window.XiaoxinWorldClock.currentTimestamp;
                console.info(
                    "[小馨手机][微信] 新的朋友页面使用全局世界观时钟时间:",
                    currentWorldTimestamp
                );
            }

            // 2. 如果世界观时钟不可用，尝试从聊天历史中获取最新消息时间
            if (!currentWorldTimestamp || currentWorldTimestamp <= 0) {
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
                                "[小馨手机][微信] 新的朋友页面使用聊天历史中最新消息时间作为基准:",
                                currentWorldTimestamp
                            );
                        }
                    }
                } catch (e) {
                    console.warn(
                        "[小馨手机][微信] 获取聊天历史时间失败:",
                        e
                    );
                }
            }

            // 3. 如果仍然没有，尝试从好友申请记录中获取最新的时间戳
            if (!currentWorldTimestamp || currentWorldTimestamp <= 0) {
                var latestRequestTimestamp = 0;
                requests.forEach(function (req) {
                    var ts = req.timestamp || req.time || 0;
                    if (ts && ts > latestRequestTimestamp) {
                        latestRequestTimestamp = ts;
                    }
                });
                if (latestRequestTimestamp > 0) {
                    currentWorldTimestamp = latestRequestTimestamp;
                    console.info(
                        "[小馨手机][微信] 新的朋友页面使用最新好友申请时间作为基准:",
                        currentWorldTimestamp
                    );
                }
            }

            // 4. 最后兜底：使用现实时间（不推荐）
            if (!currentWorldTimestamp || currentWorldTimestamp <= 0) {
                currentWorldTimestamp = Date.now();
                console.warn(
                    "[小馨手机][微信] 新的朋友页面无法获取世界观时间，使用现实时间（不推荐）"
                );
            }

            var threeDaysMs = 3 * 24 * 60 * 60 * 1000;

            var recent = [];
            var earlier = [];

            requests.forEach(function (req) {
                var ts = req.timestamp || req.time || 0;
                // 使用世界观时间来判断"三天内"和"三天前"
                if (ts && currentWorldTimestamp - ts <= threeDaysMs) {
                    recent.push(req);
                } else {
                    earlier.push(req);
                }
            });

            function renderSection(title, list) {
                if (!list || list.length === 0) return;
                var $sectionTitle = $(
                    '<div class="xiaoxin-wechat-new-friends-section-title"></div>'
                );
                $sectionTitle.text(title);
                var $list = $('<div class="xiaoxin-wechat-new-friends-list"></div>');

                list.forEach(function (req) {
                    var $item = $('<div class="xiaoxin-wechat-new-friends-item"></div>');
                    var $avatar = $(
                        '<div class="xiaoxin-wechat-new-friends-avatar"></div>'
                    );
                    var avatarUrl =
                        req.avatar ||
                        (req.contact && req.contact.avatar) ||
                        "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
                    $avatar.css("background-image", "url(" + avatarUrl + ")");

                    var displayName =
                        (req.remark && req.remark.trim()) ||
                        (req.contact && req.contact.remark) ||
                        (req.contact && req.contact.nickname) ||
                        req.nickname ||
                        (req.extra && req.extra["微信昵称"]) ||
                        "微信用户";

                    var $info = $('<div class="xiaoxin-wechat-new-friends-info"></div>');
                    var $name = $(
                        '<div class="xiaoxin-wechat-new-friends-name"></div>'
                    ).text(displayName);

                    var greetingText = "";
                    if (req.direction === "player_to_role") {
                        greetingText = "我：" + (req.greeting || "");
                    } else {
                        greetingText = req.greeting || "";
                    }
                    var $greeting = $(
                        '<div class="xiaoxin-wechat-new-friends-greeting"></div>'
                    ).text(greetingText);

                    $info.append($name, $greeting);

                    var statusClass = "xiaoxin-wechat-new-friends-status";
                    var statusText = "已发送";

                    // 根据申请方向和状态显示不同的文字
                    if (req.direction === "player_to_role") {
                        // 玩家向角色发起的好友申请
                        if (req.status === "accepted") {
                            statusClass += " added-from-player";
                            statusText = "↗已添加";
                        } else if (req.status === "rejected") {
                            statusText = "已拒绝";
                        } else if (req.status === "pending") {
                            statusText = "已发送";
                        } else if (req.status === "expired") {
                            statusText = "已过期";
                        }
                    } else if (req.direction === "role_to_player") {
                        // 角色向玩家发起的好友申请
                        if (req.status === "accepted") {
                            statusText = "已同意";
                        } else if (req.status === "rejected") {
                            statusText = "已拒绝";
                        } else if (req.status === "pending") {
                            statusText = "已发送";
                        } else if (req.status === "expired") {
                            statusText = "已过期";
                        }
                    } else {
                        // 兜底：未知方向，根据状态显示
                        if (req.status === "accepted") {
                            statusText = "已添加";
                        } else if (req.status === "rejected") {
                            statusText = "已拒绝";
                        } else if (req.status === "pending") {
                            statusText = "已发送";
                        } else if (req.status === "expired") {
                            statusText = "已过期";
                        }
                    }

                    var $status = $('<div></div>').addClass(statusClass);

                    // 默认显示普通状态文本
                    $status.text(statusText);

                    // 如果是"角色 -> 玩家"且仍为待处理状态，在右侧显示"接受"按钮
                    if (req.direction === "role_to_player" && req.status === "pending") {
                        statusText = "接受";
                        $status
                            .text(statusText)
                            .addClass("xiaoxin-wechat-new-friends-status-accept");

                        // 点击"接受"按钮：标记为已接受并更新联系人好友状态
                        $status.on("click", function (e) {
                            e.stopPropagation(); // 避免触发整行的点击事件
                            if (
                                window.XiaoxinWeChatDataHandler &&
                                typeof window.XiaoxinWeChatDataHandler.acceptFriendRequest ===
                                    "function"
                            ) {
                                var ok =
                                    window.XiaoxinWeChatDataHandler.acceptFriendRequest(
                                        req.id
                                    );
                                if (ok) {
                                    // 接受后，重新获取最新的联系人信息（因为 acceptFriendRequest 可能创建了新联系人）
                                    var updatedContact = null;
                                    try {
                                        // 优先从请求对象中获取（acceptFriendRequest 会设置 req.contact）
                                        updatedContact = (req && req.contact) || null;

                                        // 如果请求对象中没有，从联系人列表中查找
                                        if (
                                            !updatedContact &&
                                            window.XiaoxinWeChatDataHandler &&
                                            typeof window.XiaoxinWeChatDataHandler.getContactById === "function"
                                        ) {
                                            updatedContact = window.XiaoxinWeChatDataHandler.getContactById(
                                                req.roleId
                                            );
                                        }

                                        // 如果还是找不到，从联系人列表中查找
                                        if (
                                            !updatedContact &&
                                            window.XiaoxinWeChatDataHandler &&
                                            typeof window.XiaoxinWeChatDataHandler.getContacts ===
                                                "function"
                                        ) {
                                            var contacts =
                                                window.XiaoxinWeChatDataHandler.getContacts() ||
                                                [];
                                            var roleIdStr = String(req.roleId || "").trim();
                                            updatedContact = contacts.find(function (c) {
                                                var cId = String(c.id || "").trim();
                                                var cCharId =
                                                    String(c.characterId || "").trim();
                                                return (
                                                    cId === roleIdStr ||
                                                    cId === "contact_" + roleIdStr ||
                                                    cCharId === roleIdStr
                                                );
                                            });
                                        }
                                    } catch (e) {
                                        console.warn("[小馨手机][微信] 获取更新后的联系人信息失败:", e);
                                    }

                                    if (updatedContact) {
                                        updatedContact.isFriend = true;
                                        updatedContact.friendStatus = "friend";
                                        if (window.toastr) {
                                            toastr.success("已添加到通讯录", "新的朋友");
                                        }
                                        // 接受后直接进入"通过好友验证"页面，方便填写备注/标签/权限
                                        renderFriendPassVerifyPage(
                                            $root,
                                            mobilePhone,
                                            updatedContact
                                        );
                                    } else {
                                        console.error("[小馨手机][微信] 接受好友申请后未找到对应联系人，无法跳转到验证页面。请求ID:", req.id, "角色ID:", req.roleId);
                                        if (window.toastr) {
                                            toastr.error("添加成功但无法打开验证页，请手动设置", "新的朋友");
                                        }
                                        // 刷新新的朋友页面
                                        renderNewFriendsPage($root, mobilePhone);
                                    }
                                }
                            }
                        });
                    }

                    // 点击整行：进入联系人资料预览页（未添加/已添加都可查看）
                    $item.on("click", function () {
                        var contact =
                            (req && req.contact) ||
                            null;
                        // 如果请求里没有附带联系人信息，尝试从联系人列表中查找
                        if (
                            !contact &&
                            window.XiaoxinWeChatDataHandler &&
                            typeof window.XiaoxinWeChatDataHandler.getContacts ===
                                "function"
                        ) {
                            var contacts =
                                window.XiaoxinWeChatDataHandler.getContacts() || [];
                            var roleIdStr = String(req.roleId || "").trim();
                            contact = contacts.find(function (c) {
                                var cId = String(c.id || "").trim();
                                var cCharId = String(c.characterId || "").trim();
                                return (
                                    cId === roleIdStr ||
                                    cId === "contact_" + roleIdStr ||
                                    cCharId === roleIdStr
                                );
                            });
                        }

                        if (contact) {
                            renderContactDetailPage(
                                $root,
                                mobilePhone,
                                contact,
                                "新的朋友"
                            );
                        }
                    });

                    $item.append($avatar, $info, $status);
                    $list.append($item);
                });

                $content.append($sectionTitle, $list);
            }

            renderSection("三天内", recent);
            renderSection("三天前", earlier);
        }

        $main.append($header, $content);
        $root.empty().append($main);

        // 监听好友申请更新事件，自动刷新页面
        function handleFriendRequestUpdated(event) {
            console.info("[小馨手机][微信] 收到好友申请更新事件，刷新新的朋友页面");
            // 仅当当前仍停留在"新的朋友"页面时才刷新，避免把其它页面（如通过好友验证页）覆盖掉
            try {
                // 检查当前页面是否是"新的朋友"页面
                var isNewFriendsPage = $root && $root.find(".xiaoxin-wechat-new-friends-main").length > 0;
                // 检查当前页面是否是"通过好友验证"页面
                var isVerifyPage = $root && $root.find(".xiaoxin-wechat-friend-apply-main").length > 0;

                if (!isNewFriendsPage || isVerifyPage) {
                    console.info(
                        "[小馨手机][微信] 当前不在新的朋友页面（或正在通过好友验证页面），忽略好友申请更新导致的刷新"
                    );
                    return;
                }
            } catch (e) {
                // ignore
            }
            setTimeout(function () {
                // 再次检查，避免在延迟期间页面已切换
                try {
                    var isNewFriendsPage = $root && $root.find(".xiaoxin-wechat-new-friends-main").length > 0;
                    var isVerifyPage = $root && $root.find(".xiaoxin-wechat-friend-apply-main").length > 0;
                    if (isNewFriendsPage && !isVerifyPage) {
                        renderNewFriendsPage($root, mobilePhone);
                    }
                } catch (e) {
                    // ignore
                }
            }, 100);
        }

        // 移除之前的事件监听器（如果存在）
        var oldHandler = $root.data("friendRequestUpdateHandler");
        if (oldHandler) {
            window.removeEventListener("xiaoxin-friend-request-updated", oldHandler);
        }

        window.addEventListener("xiaoxin-friend-request-updated", handleFriendRequestUpdated);
        $root.data("friendRequestUpdateHandler", handleFriendRequestUpdated);
    }

    // ========== 渲染标签选择弹窗 ==========
    function renderTagPicker($root, mobilePhone, currentTags, onComplete) {
        console.info("[小馨手机][微信] 渲染标签选择弹窗", currentTags);

        var tempSelectedTags = Array.isArray(currentTags) ? currentTags.slice() : [];

        var $pickerOverlay = $('<div class="xiaoxin-wechat-tag-picker-overlay"></div>');
        var $picker = $('<div class="xiaoxin-wechat-tag-picker"></div>');

        // 弹窗头部
        var $header = $('<div class="xiaoxin-wechat-tag-picker-header"></div>');
        var $cancelBtn = $('<div class="xiaoxin-wechat-tag-picker-btn xiaoxin-wechat-tag-picker-cancel">取消</div>');
        var $title = $('<div class="xiaoxin-wechat-tag-picker-title">添加标签</div>');
        var $confirmBtn = $('<div class="xiaoxin-wechat-tag-picker-btn xiaoxin-wechat-tag-picker-confirm">完成</div>');
        $header.append($cancelBtn, $title, $confirmBtn);

        // 搜索框
        var $searchBar = $('<div class="xiaoxin-wechat-tag-picker-search-bar"></div>');
        var $searchInput = $('<input type="text" placeholder="搜索">');
        $searchBar.append($searchInput);

        // 标签内容区域
        var $content = $('<div class="xiaoxin-wechat-tag-picker-content"></div>');

        // 我的标签
        var $myTagsSection = $('<div class="xiaoxin-wechat-tag-picker-section"></div>');
        var $myTagsHeader = $('<div class="xiaoxin-wechat-tag-picker-section-header"></div>');
        var $manageBtn = $('<span class="xiaoxin-wechat-tag-picker-manage">管理</span>');
        $myTagsHeader.append('<span>我的标签</span>', $manageBtn);
        var $myTagsContainer = $('<div class="xiaoxin-wechat-tag-picker-tags-container"></div>');

        // 新建标签按钮
        var $newTagBtn = $('<div class="xiaoxin-wechat-tag-picker-tag xiaoxin-wechat-tag-picker-new-tag">+ 新建标签</div>');

        $myTagsContainer.append($newTagBtn);
        $myTagsSection.append($myTagsHeader, $myTagsContainer);

        $content.append($myTagsSection);
        $picker.append($header, $searchBar, $content);
        $pickerOverlay.append($picker);

        var isManageMode = false;
        var tempDeleteTags = [];

        // 底部删除操作栏（仅管理模式显示）
        var $manageBar = $('<div class="xiaoxin-wechat-tag-picker-manage-bar"></div>');
        var $deleteBtn = $('<div class="xiaoxin-wechat-tag-picker-delete-btn disabled">删除</div>');
        $manageBar.append($deleteBtn);
        $picker.append($manageBar);

        // ===== 工具函数：渲染当前标签列表 =====
        function renderTagsUI(filterText) {
            $myTagsContainer.find('.xiaoxin-wechat-tag-picker-tag-item').remove();
            var allTags = [];
            // 从数据处理器获取玩家已保存的所有标签（如果有）
            if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getAllTags === 'function') {
                allTags = window.XiaoxinWeChatDataHandler.getAllTags() || [];
            } else {
                // 兜底：遍历所有联系人收集标签
                if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getContacts === 'function') {
                    var contacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
                    contacts.forEach(function(c) {
                        if (Array.isArray(c.tags)) {
                            c.tags.forEach(function(t) {
                                if (t && allTags.indexOf(t) === -1) {
                                    allTags.push(t);
                                }
                            });
                        }
                    });
                }
            }
            // 去重并排序
            allTags = Array.from(new Set(allTags)).sort();

            if (filterText) {
                var lower = filterText.toLowerCase();
                allTags = allTags.filter(function(t) { return t.toLowerCase().indexOf(lower) !== -1; });
            }

            allTags.forEach(function(tag) {
                var $tagItem = $('<div class="xiaoxin-wechat-tag-picker-tag xiaoxin-wechat-tag-picker-tag-item"></div>').text(tag);

                // 管理模式：显示删除选中；普通模式：显示选择(绿)
                if (isManageMode) {
                    if (tempDeleteTags.indexOf(tag) !== -1) {
                        $tagItem.addClass('delete-selected');
                    }
                } else {
                    if (tempSelectedTags.indexOf(tag) !== -1) {
                        $tagItem.addClass('selected');
                    }
                }

                $tagItem.on('click', function() {
                    if (isManageMode) {
                        var didx = tempDeleteTags.indexOf(tag);
                        if (didx === -1) {
                            tempDeleteTags.push(tag);
                            $tagItem.addClass('delete-selected');
                        } else {
                            tempDeleteTags.splice(didx,1);
                            $tagItem.removeClass('delete-selected');
                        }
                        updateManageDeleteState();
                        return;
                    }

                    var idx = tempSelectedTags.indexOf(tag);
                    if (idx === -1) {
                        tempSelectedTags.push(tag);
                        $tagItem.addClass('selected');
                    } else {
                        tempSelectedTags.splice(idx,1);
                        $tagItem.removeClass('selected');
                    }
                    updateConfirmState();
                });
                // 插入到新建按钮之前
                $newTagBtn.before($tagItem);
            });
        }

        function updateConfirmState() {
            if (tempSelectedTags.length === 0) {
                $confirmBtn.addClass('disabled');
            } else {
                $confirmBtn.removeClass('disabled');
            }
        }

        function updateManageDeleteState() {
            if (!isManageMode) {
                $manageBar.removeClass('visible');
                return;
            }
            $manageBar.addClass('visible');
            if (tempDeleteTags.length === 0) {
                $deleteBtn.addClass('disabled');
                $deleteBtn.text('删除');
            } else {
                $deleteBtn.removeClass('disabled');
                $deleteBtn.text('删除(' + tempDeleteTags.length + ')');
            }
        }

        // 初始化事件绑定
        $cancelBtn.on('click', function() {
            $pickerOverlay.removeClass('visible');
            setTimeout(function(){ $pickerOverlay.remove(); }, 300);
        });

        $confirmBtn.on('click', function() {
            if ($confirmBtn.hasClass('disabled')) return;
            // 最多8个标签
            var result = tempSelectedTags.slice(0,8);
            if (typeof onComplete === 'function') {
                onComplete(result);
            }
            $pickerOverlay.removeClass('visible');
            setTimeout(function(){ $pickerOverlay.remove(); }, 300);
        });

        $searchInput.on('input', function(){
            var val = $searchInput.val().trim();
            renderTagsUI(val);
        });

        // 管理模式切换
        $manageBtn.on('click', function() {
            isManageMode = !isManageMode;
            tempDeleteTags = [];
            $manageBtn.text(isManageMode ? '完成' : '管理');
            // 管理模式下禁用“完成”(选择标签)按钮，只保留删除逻辑
            $confirmBtn.toggleClass('disabled', isManageMode);
            // 管理模式下隐藏新建标签
            $newTagBtn.toggle(!isManageMode);
            renderTagsUI($searchInput.val().trim());
            updateManageDeleteState();
        });

        // 删除选中的标签
        $deleteBtn.on('click', function() {
            if ($deleteBtn.hasClass('disabled')) return;
            var ok = window.confirm('确定删除选中的标签？(会从所有联系人中同步移除)');
            if (!ok) return;
            if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.removeTags === 'function') {
                window.XiaoxinWeChatDataHandler.removeTags(tempDeleteTags);
            }
            // 同步：如果当前已选中里包含被删标签，也移除
            tempSelectedTags = tempSelectedTags.filter(function(t){ return tempDeleteTags.indexOf(t) === -1; });
            tempDeleteTags = [];
            renderTagsUI($searchInput.val().trim());
            updateConfirmState();
            updateManageDeleteState();
        });

        $newTagBtn.on('click', function() {
            var input = window.prompt('输入新建标签名称(1~20字符)', '');
            if (input) {
                input = input.trim();
                if (input.length > 20) input = input.slice(0,20);
                if (input) {
                    // 保存新标签到数据处理器
                    if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.addTag === 'function') {
                        window.XiaoxinWeChatDataHandler.addTag(input);
                    } else {
                        console.warn('[小馨手机][微信] addTag 方法不存在，无法保存新标签');
                    }
                    // 如果新标签未被选中，则自动选中它
                    if (tempSelectedTags.indexOf(input) === -1) {
                        tempSelectedTags.push(input);
                    }
                }
                // 重新渲染标签列表，此时新标签应该会从数据处理器中加载
                renderTagsUI($searchInput.val().trim());
                updateConfirmState();
            }
        });

        // 将弹窗添加到根元素并显示
        $root.append($pickerOverlay);
        // 小延迟触发动画
        setTimeout(function(){ $pickerOverlay.addClass('visible'); }, 30);

        // 初始渲染
        renderTagsUI();
        updateConfirmState();
        updateManageDeleteState();
    }

    // ========== 渲染通过好友验证页面 ==========
    function renderFriendPassVerifyPage($root, mobilePhone, contact) {
        console.info("[小馨手机][微信] 渲染通过好友验证页面", contact);

        // 查找对应的好友申请ID（用于完成验证）
        var relatedRequestId = null;
        try {
            if (
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.getFriendRequests === "function"
            ) {
                var requests = window.XiaoxinWeChatDataHandler.getFriendRequests() || [];
                var roleIdStr = String(contact && (contact.characterId || contact.id) || "").trim();
                // 查找 pending_verify 状态的好友申请（角色主动添加玩家）
                var pendingVerifyRequest = requests.find(function (r) {
                    return (
                        r.direction === "role_to_player" &&
                        r.status === "pending_verify" &&
                        (String(r.roleId || "").trim() === roleIdStr ||
                            String(r.roleId || "").trim() === roleIdStr.replace(/^contact_/, ""))
                    );
                });
                if (pendingVerifyRequest) {
                    relatedRequestId = pendingVerifyRequest.id;
                    console.info("[小馨手机][微信] 找到对应的好友申请ID:", relatedRequestId);
                }
            }
        } catch (e) {
            console.warn("[小馨手机][微信] 查找好友申请ID失败:", e);
        }

        var remarkDefault =
            (contact && (contact.remark || contact.nickname || contact.wechatId || contact.id)) ||
            "";
        var selectedTags = Array.isArray(contact && contact.tags)
            ? contact.tags.slice()
            : [];
        var permissionType = "all"; // all/chat_only
        var hideMyMoments = false;
        var hideTheirMoments = false;

        var $main = $(
            '<div class="xiaoxin-wechat-main xiaoxin-wechat-friend-apply-main"></div>'
        );

        // 标题栏
        var $header = $('<div class="xiaoxin-wechat-friend-apply-header"></div>');
        var $headerBar = $('<div class="xiaoxin-wechat-friend-apply-header-bar"></div>');
        var $headerLeft = $('<div class="xiaoxin-wechat-friend-apply-header-left"></div>');
        var $back = $(
            '<div class="xiaoxin-wechat-header-back">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        $back.on("click", function () {
            renderContactDetailPage($root, mobilePhone, contact, "新的朋友");
        });
        $headerLeft.append($back);
        var $headerTitle = $(
            '<div class="xiaoxin-wechat-friend-apply-header-title">通过好友验证</div>'
        );
        var $headerRight = $('<div class="xiaoxin-wechat-friend-apply-header-right"></div>');
        $headerBar.append($headerLeft, $headerTitle, $headerRight);
        $header.append($headerBar);

        var $content = $('<div class="xiaoxin-wechat-friend-apply-content"></div>');

        // 备注
        var $remarkSection = $(
            '<div class="xiaoxin-wechat-friend-apply-section"></div>'
        );
        var $remarkRow = $(
            '<div class="xiaoxin-wechat-friend-apply-row input-row"></div>'
        );
        $remarkRow.append('<div class="xiaoxin-wechat-friend-apply-row-label">备注</div>');
        var $remarkInput = $(
            '<input class="xiaoxin-wechat-friend-apply-input" type="text" placeholder="给朋友添加备注" />'
        );
        $remarkInput.val(remarkDefault);

        // 强制备注输入框使用浅灰色样式，避免被酒馆主题覆盖
        try {
            var remarkEl = $remarkInput[0];
            if (remarkEl && remarkEl.style && remarkEl.style.setProperty) {
                remarkEl.style.setProperty(
                    "background-color",
                    "#f5f5f5",
                    "important"
                );
                remarkEl.style.setProperty("border", "0", "important");
                remarkEl.style.setProperty("outline", "0", "important");
                remarkEl.style.setProperty("box-shadow", "none", "important");
                remarkEl.style.setProperty("color", "#000", "important");
                remarkEl.style.setProperty("caret-color", "#000", "important");
                remarkEl.style.setProperty("border-radius", "8px", "important");
                remarkEl.style.setProperty("padding", "8px 12px", "important");
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信] 备注输入框样式设置失败:",
                e && e.message ? e.message : e
            );
        }

        $remarkRow.append($remarkInput);
        $remarkSection.append($remarkRow);

        // 标签
        var $tagRow = $(
            '<div class="xiaoxin-wechat-friend-apply-row link-row"></div>'
        );
        $tagRow.append('<div class="xiaoxin-wechat-friend-apply-row-label">标签</div>');
        var $tagValue = $(
            '<div class="xiaoxin-wechat-friend-apply-row-value xiaoxin-wechat-friend-apply-tag-value">添加标签</div>'
        );
        var $tagArrow = $(
            '<div class="xiaoxin-wechat-friend-apply-row-arrow">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        function renderTags() {
            if (selectedTags.length === 0) {
                $tagValue.text("添加标签").addClass("placeholder");
            } else {
                $tagValue.text(selectedTags.join("、")).removeClass("placeholder");
            }
        }
        renderTags();
        $tagRow.append($tagValue, $tagArrow);
        $tagRow.on("click", function () {
            renderTagPicker($root, mobilePhone, selectedTags, function (newTags) {
                selectedTags = newTags;
                renderTags();
            });
        });
        $remarkSection.append($tagRow);

        // 朋友权限
        var $permissionSection = $(
            '<div class="xiaoxin-wechat-friend-apply-section permission-section"></div>'
        );
        var $permissionTitle = $(
            '<div class="xiaoxin-wechat-friend-apply-label permission-label">朋友权限</div>'
        );
        var $permissionList = $(
            '<div class="xiaoxin-wechat-friend-apply-permission-list"></div>'
        );

        function createPermissionOption(text, type) {
            var $option = $(
                '<div class="xiaoxin-wechat-friend-apply-permission-option"></div>'
            );
            $option.append(
                '<div class="xiaoxin-wechat-friend-apply-permission-text">' +
                    text +
                    "</div>"
            );
            var $check = $(
                '<div class="xiaoxin-wechat-friend-apply-permission-check"></div>'
            );
            $option.append($check);
            $option.on("click", function () {
                selectPermission(type);
            });
            return { $option: $option, $check: $check, type: type };
        }

        var permissionOptions = {
            all: createPermissionOption("聊天、朋友圈、微信运动等", "all"),
            chat: createPermissionOption("仅聊天", "chat_only"),
        };

        function createSwitchRow(text, initial) {
            var state = initial;
            var $row = $(
                '<div class="xiaoxin-wechat-friend-apply-permission-option switch-row"></div>'
            );
            $row.append(
                '<div class="xiaoxin-wechat-friend-apply-permission-text">' +
                    text +
                    "</div>"
            );
            var $switch = $(
                '<div class="xiaoxin-wechat-friend-apply-switch">' +
                    '<div class="xiaoxin-wechat-friend-apply-switch-handle"></div>' +
                    "</div>"
            );
            if (state) {
                $switch.addClass("on");
            }
            $row.append($switch);
            $row.on("click", function () {
                state = !state;
                $switch.toggleClass("on", state);
            });
            return {
                $row: $row,
                getState: function () {
                    return state;
                },
            };
        }

        var subHideMine = createSwitchRow(
            "不给他（她）看我的朋友圈和状态",
            hideMyMoments
        );
        var subHideTheirs = createSwitchRow(
            "不看他（她）的朋友圈和状态",
            hideTheirMoments
        );

        function selectPermission(type) {
            permissionType = type;
            Object.keys(permissionOptions).forEach(function (key) {
                var isActive = key === "all" ? type === "all" : type === "chat_only";
                permissionOptions[key].$option.toggleClass("selected", isActive);
            });
            if (type === "all") {
                subHideMine.$row.slideDown(150);
                subHideTheirs.$row.slideDown(150);
            } else {
                subHideMine.$row.slideUp(150);
                subHideTheirs.$row.slideUp(150);
            }
        }

        // 按顺序添加：第一个选项 -> 子选项1 -> 子选项2 -> 第二个选项
        $permissionList.append(permissionOptions.all.$option);
        $permissionList.append(subHideMine.$row);
        $permissionList.append(subHideTheirs.$row);
        $permissionList.append(permissionOptions.chat.$option);

        // 初始状态：子选项默认显示
        subHideMine.$row.show();
        subHideTheirs.$row.show();

        $permissionSection.append($permissionTitle, $permissionList);
        selectPermission("all");

        // 底部完成按钮
        var $footer = $('<div class="xiaoxin-wechat-friend-apply-footer"></div>');
        var $finishBtn = $(
            '<div class="xiaoxin-wechat-friend-apply-send">完成</div>'
        );
        $finishBtn.on("click", function () {
            // 持久化备注/标签并完成好友验证
            var remark = ($remarkInput.val() || "").trim();
            var tags = Array.isArray(selectedTags) ? selectedTags.slice() : [];
            hideMyMoments = subHideMine.getState();
            hideTheirMoments = subHideTheirs.getState();

            try {
                // 如果有对应的好友申请ID（角色主动添加玩家），调用完成验证函数
                if (
                    relatedRequestId &&
                    window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler.completeFriendVerification === "function"
                ) {
                    var ok = window.XiaoxinWeChatDataHandler.completeFriendVerification(
                        relatedRequestId,
                        remark,
                        tags,
                        permissionType,
                        hideMyMoments,
                        hideTheirMoments
                    );
                    if (ok) {
                        if (window.toastr) {
                            toastr.success("已保存备注与标签，好友验证完成", "好友验证");
                        }
                        // 刷新联系人信息（因为 completeFriendVerification 会更新联系人状态）
                        if (contact && contact.id) {
                            try {
                                var updatedContact = window.XiaoxinWeChatDataHandler.getContactById
                                    ? window.XiaoxinWeChatDataHandler.getContactById(contact.id)
                                    : null;
                                if (!updatedContact && window.XiaoxinWeChatDataHandler.getContacts) {
                                    var contacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
                                    updatedContact = contacts.find(function (c) {
                                        return (
                                            c.id === contact.id ||
                                            c.characterId === contact.characterId ||
                                            (contact.characterId && c.characterId === contact.characterId)
                                        );
                                    });
                                }
                                if (updatedContact) {
                                    contact = updatedContact;
                                }
                            } catch (e) {
                                console.warn("[小馨手机][微信] 刷新联系人信息失败:", e);
                            }
                        }
                    } else {
                        console.error("[小馨手机][微信] 完成好友验证失败");
                        if (window.toastr) {
                            toastr.error("完成验证失败，请重试", "好友验证");
                        }
                    }
                } else {
                    // 如果没有对应的好友申请ID（可能是玩家主动添加角色，或其他情况），只保存备注和标签
                    if (
                        window.XiaoxinWeChatDataHandler &&
                        typeof window.XiaoxinWeChatDataHandler.addContact === "function"
                    ) {
                        var updatedContact = Object.assign({}, contact || {}, {
                            remark: remark || contact.remark || "",
                            tags: tags,
                            isFriend: true,
                            friendStatus: "friend",
                            permissionType: permissionType,
                            hideMyMoments: hideMyMoments,
                            hideTheirMoments: hideTheirMoments,
                        });
                        window.XiaoxinWeChatDataHandler.addContact(updatedContact);
                        if (window.toastr) {
                            toastr.success("已保存备注与标签", "好友验证");
                        }
                    }
                }
            } catch (e) {
                console.warn(
                    "[小馨手机][微信] 保存好友验证信息失败:",
                    e
                );
                if (window.toastr) {
                    toastr.error("保存失败，请重试", "好友验证");
                }
            }

            // 页面保持当前停留，用户可自行返回
        });
        $footer.append($finishBtn);

        $content.append(
            $remarkSection,
            $permissionSection,
            $footer
        );
        $main.append($header, $content);
        $root.empty().append($main);
    }

    // ========== 渲染联系人设置页面 ==========
    function renderContactSettingsPage($root, mobilePhone, contact, source) {
        console.info("[小馨手机][微信] 渲染联系人设置页面", contact);

        var $main = $(
            '<div class="xiaoxin-wechat-main xiaoxin-wechat-contact-settings-main is-fullscreen"></div>'
        );

        // 顶部标题栏
        var $header = $('<div class="xiaoxin-wechat-header"></div>');
        var $headerBar = $('<div class="xiaoxin-wechat-header-bar"></div>');

        // 左侧返回按钮容器
        var $headerLeft = $('<div class="xiaoxin-wechat-header-left"></div>');
        var $backBtn = $(
            '<div class="xiaoxin-wechat-header-back">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        $backBtn.on("click", function () {
            // 返回到联系人资料卡页面
            var $container = $root && $root.parent() ? $root.parent() : null;
            if (!$container || !$container.length) {
                console.warn("[小馨手机][微信] 无法获取容器，返回失败");
                return;
            }
            $container.empty();
            var $newRoot = $('<div class="xiaoxin-wechat-root"></div>');
            $container.append($newRoot);
            renderContactDetailPage($newRoot, mobilePhone, contact, source);
        });
        $headerLeft.append($backBtn);

        // 标题
        var $title = $('<div class="xiaoxin-wechat-header-title">设置</div>');

        // 右侧占位元素（确保标题居中）
        var $headerRight = $('<div class="xiaoxin-wechat-header-right"></div>');
        $headerRight.css({ width: "24px", flexShrink: 0 });

        $headerBar.append($headerLeft, $title, $headerRight);
        $header.append($headerBar);
        $main.append($header);

        // 内容区域
        var $content = $('<div class="xiaoxin-wechat-contact-settings-content"></div>');

        // 获取当前联系人数据
        var currentContact = contact;
        if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getContact === "function") {
            var contactId = contact && (contact.id || contact.characterId || "");
            var updatedContact = window.XiaoxinWeChatDataHandler.getContact(contactId);
            if (updatedContact) {
                currentContact = updatedContact;
            }
        }

        // 编辑备注
        var $editRemarkRow = $('<div class="xiaoxin-wechat-contact-settings-row"></div>');
        $editRemarkRow.append('<div class="xiaoxin-wechat-contact-settings-row-text">编辑备注</div>');
        $editRemarkRow.append(
            '<div class="xiaoxin-wechat-contact-settings-row-arrow">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        $editRemarkRow.on("click", function () {
            // 显示编辑备注弹窗
            showEditRemarkDialog($root, currentContact, mobilePhone, source);
        });
        $content.append($editRemarkRow);

        // 设置权限
        var $setPermissionRow = $('<div class="xiaoxin-wechat-contact-settings-row"></div>');
        $setPermissionRow.append('<div class="xiaoxin-wechat-contact-settings-row-text">设置权限</div>');
        $setPermissionRow.append(
            '<div class="xiaoxin-wechat-contact-settings-row-arrow">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        $setPermissionRow.on("click", function () {
            // TODO: 实现设置权限功能
            console.info("[小馨手机][微信] 点击设置权限");
            if (window.toastr) {
                toastr.info("设置权限功能开发中", "提示");
            }
        });
        $content.append($setPermissionRow);

        // 把他推荐给朋友
        var $recommendRow = $('<div class="xiaoxin-wechat-contact-settings-row"></div>');
        $recommendRow.append('<div class="xiaoxin-wechat-contact-settings-row-text">把他推荐给朋友</div>');
        $recommendRow.append(
            '<div class="xiaoxin-wechat-contact-settings-row-arrow">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        $recommendRow.on("click", function () {
            // TODO: 实现推荐给朋友功能
            console.info("[小馨手机][微信] 点击把他推荐给朋友");
            if (window.toastr) {
                toastr.info("推荐给朋友功能开发中", "提示");
            }
        });
        $content.append($recommendRow);

        // 分隔线
        $content.append('<div class="xiaoxin-wechat-contact-settings-divider"></div>');

        // 设为星标朋友（切换开关）
        var isStarred = currentContact.starred === true;
        var $starredRow = $('<div class="xiaoxin-wechat-contact-settings-row"></div>');
        $starredRow.append('<div class="xiaoxin-wechat-contact-settings-row-text">设为星标朋友</div>');
        var $starredToggle = $('<div class="xiaoxin-wechat-contact-settings-toggle"></div>');
        var $starredSwitch = $('<div class="xiaoxin-wechat-contact-settings-switch"></div>');
        if (isStarred) {
            $starredSwitch.addClass("active");
            $starredToggle.addClass("active");
        }
        $starredToggle.append($starredSwitch);
        $starredRow.append($starredToggle);
        $starredRow.on("click", function (e) {
            // 如果点击的是切换开关本身，不触发
            if ($(e.target).closest(".xiaoxin-wechat-contact-settings-toggle").length) {
                return;
            }
            isStarred = !isStarred;
            if (isStarred) {
                $starredSwitch.addClass("active");
                $starredToggle.addClass("active");
            } else {
                $starredSwitch.removeClass("active");
                $starredToggle.removeClass("active");
            }
            // 保存到联系人数据
            if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.addContact === "function") {
                var updatedContact = Object.assign({}, currentContact, {
                    starred: isStarred
                });
                window.XiaoxinWeChatDataHandler.addContact(updatedContact);
                console.info("[小馨手机][微信] 更新星标状态:", isStarred);
                if (window.toastr) {
                    toastr.success(isStarred ? "已设为星标朋友" : "已取消星标朋友", "提示");
                }
            }
        });
        // 切换开关也可以直接点击
        $starredToggle.on("click", function (e) {
            e.stopPropagation();
            isStarred = !isStarred;
            if (isStarred) {
                $starredSwitch.addClass("active");
                $starredToggle.addClass("active");
            } else {
                $starredSwitch.removeClass("active");
                $starredToggle.removeClass("active");
            }
            // 保存到联系人数据
            if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.addContact === "function") {
                var updatedContact = Object.assign({}, currentContact, {
                    starred: isStarred
                });
                window.XiaoxinWeChatDataHandler.addContact(updatedContact);
                console.info("[小馨手机][微信] 更新星标状态:", isStarred);
                if (window.toastr) {
                    toastr.success(isStarred ? "已设为星标朋友" : "已取消星标朋友", "提示");
                }
            }
        });
        $content.append($starredRow);

        // 加入黑名单（切换开关）
        var isBlacklisted = currentContact.blacklisted === true;
        var $blacklistRow = $('<div class="xiaoxin-wechat-contact-settings-row"></div>');
        $blacklistRow.append('<div class="xiaoxin-wechat-contact-settings-row-text">加入黑名单</div>');
        var $blacklistToggle = $('<div class="xiaoxin-wechat-contact-settings-toggle"></div>');
        var $blacklistSwitch = $('<div class="xiaoxin-wechat-contact-settings-switch"></div>');
        if (isBlacklisted) {
            $blacklistSwitch.addClass("active");
            $blacklistToggle.addClass("active");
        }
        $blacklistToggle.append($blacklistSwitch);
        $blacklistRow.append($blacklistToggle);
        $blacklistRow.on("click", function (e) {
            // 如果点击的是切换开关本身，不触发
            if ($(e.target).closest(".xiaoxin-wechat-contact-settings-toggle").length) {
                return;
            }
            isBlacklisted = !isBlacklisted;
            if (isBlacklisted) {
                $blacklistSwitch.addClass("active");
                $blacklistToggle.addClass("active");
            } else {
                $blacklistSwitch.removeClass("active");
                $blacklistToggle.removeClass("active");
            }
            // 保存到联系人数据
            if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.addContact === "function") {
                var updatedContact = Object.assign({}, currentContact, {
                    blacklisted: isBlacklisted
                });
                window.XiaoxinWeChatDataHandler.addContact(updatedContact);
                console.info("[小馨手机][微信] 更新黑名单状态:", isBlacklisted);
                if (window.toastr) {
                    toastr.success(isBlacklisted ? "已加入黑名单" : "已移出黑名单", "提示");
                }
            }
        });
        // 切换开关也可以直接点击
        $blacklistToggle.on("click", function (e) {
            e.stopPropagation();
            isBlacklisted = !isBlacklisted;
            if (isBlacklisted) {
                $blacklistSwitch.addClass("active");
                $blacklistToggle.addClass("active");
            } else {
                $blacklistSwitch.removeClass("active");
                $blacklistToggle.removeClass("active");
            }
            // 保存到联系人数据
            if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.addContact === "function") {
                var updatedContact = Object.assign({}, currentContact, {
                    blacklisted: isBlacklisted
                });
                window.XiaoxinWeChatDataHandler.addContact(updatedContact);
                console.info("[小馨手机][微信] 更新黑名单状态:", isBlacklisted);
                if (window.toastr) {
                    toastr.success(isBlacklisted ? "已加入黑名单" : "已移出黑名单", "提示");
                }
            }
        });
        $content.append($blacklistRow);

        // 分隔线
        $content.append('<div class="xiaoxin-wechat-contact-settings-divider"></div>');

        // 投诉
        var $complainRow = $('<div class="xiaoxin-wechat-contact-settings-row"></div>');
        $complainRow.append('<div class="xiaoxin-wechat-contact-settings-row-text">投诉</div>');
        $complainRow.append(
            '<div class="xiaoxin-wechat-contact-settings-row-arrow">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        $complainRow.on("click", function () {
            // TODO: 实现投诉功能
            console.info("[小馨手机][微信] 点击投诉");
            if (window.toastr) {
                toastr.info("投诉功能开发中", "提示");
            }
        });
        $content.append($complainRow);

        // 分隔线（底部大间距）
        $content.append('<div class="xiaoxin-wechat-contact-settings-divider-large"></div>');

        // 删除联系人（红色文字）
        var $deleteRow = $('<div class="xiaoxin-wechat-contact-settings-row xiaoxin-wechat-contact-settings-row-delete"></div>');
        $deleteRow.append('<div class="xiaoxin-wechat-contact-settings-row-text">删除联系人</div>');
        $deleteRow.on("click", function () {
            // 确认删除
            if (window.confirm && window.confirm("确定要删除该联系人吗？")) {
                var contactId = currentContact && (currentContact.id || currentContact.characterId || "");
                if (contactId && window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.removeContact === "function") {
                    window.XiaoxinWeChatDataHandler.removeContact(contactId);
                    console.info("[小馨手机][微信] 删除联系人:", contactId);
                    if (window.toastr) {
                        toastr.success("已删除联系人", "提示");
                    }
                    // 返回上一页（联系人资料卡页面已不存在，返回通讯录）
                    var $container = $root && $root.parent() ? $root.parent() : null;
                    if ($container && $container.length) {
                        $container.empty();
                        var $newRoot = $('<div class="xiaoxin-wechat-root"></div>');
                        $container.append($newRoot);
                        if (window.XiaoxinWeChatApp && typeof window.XiaoxinWeChatApp._renderContactsPage === "function") {
                            window.XiaoxinWeChatApp._renderContactsPage($newRoot, mobilePhone);
                        } else if (window.XiaoxinWeChatApp && window.XiaoxinWeChatApp.render) {
                            window.XiaoxinWeChatApp.render($container, mobilePhone);
                        }
                    }
                } else {
                    if (window.toastr) {
                        toastr.error("删除失败", "错误");
                    }
                }
            }
        });
        $content.append($deleteRow);

        $main.append($content);
        $root.empty().append($main);
    }

    // ========== 显示编辑备注弹窗 ==========
    function showEditRemarkDialog($root, contact, mobilePhone, source) {
        console.info("[小馨手机][微信] 打开编辑备注弹窗", contact);

        // 获取手机容器
        var $phoneContainer = $root.closest(".xiaoxin-phone-container");
        if (!$phoneContainer.length) {
            $phoneContainer = $(".xiaoxin-phone-container").first();
        }
        if (!$phoneContainer.length) {
            console.warn("[小馨手机][微信] 未找到手机容器，无法显示弹窗");
            return;
        }

        // 移除已存在的弹窗
        $phoneContainer.find(".xiaoxin-wechat-edit-remark-overlay").remove();

        // 获取当前备注
        var currentRemark = contact && (contact.remark || "") || "";

        // 创建弹窗遮罩层
        var $overlay = $('<div class="xiaoxin-wechat-edit-remark-overlay"></div>');
        
        // 创建弹窗内容
        var $dialog = $('<div class="xiaoxin-wechat-edit-remark-dialog"></div>');
        
        // 弹窗头部
        var $header = $('<div class="xiaoxin-wechat-edit-remark-header"></div>');
        var $cancelBtn = $('<div class="xiaoxin-wechat-edit-remark-btn xiaoxin-wechat-edit-remark-cancel">取消</div>');
        var $title = $('<div class="xiaoxin-wechat-edit-remark-title">编辑备注</div>');
        var $confirmBtn = $('<div class="xiaoxin-wechat-edit-remark-btn xiaoxin-wechat-edit-remark-confirm">完成</div>');
        $header.append($cancelBtn, $title, $confirmBtn);

        // 弹窗内容区域
        var $content = $('<div class="xiaoxin-wechat-edit-remark-content"></div>');
        var $inputWrapper = $('<div class="xiaoxin-wechat-edit-remark-input-wrapper"></div>');
        var $input = $('<input type="text" class="xiaoxin-wechat-edit-remark-input" placeholder="请输入备注" maxlength="20">');
        $input.val(currentRemark);
        $inputWrapper.append($input);
        $content.append($inputWrapper);

        $dialog.append($header, $content);
        $overlay.append($dialog);
        $phoneContainer.append($overlay);

        // 显示弹窗动画
        setTimeout(function() {
            $overlay.addClass("visible");
            // 聚焦输入框
            $input.focus();
            // 如果是移动端，可能需要延迟一下才能聚焦
            setTimeout(function() {
                $input.focus();
            }, 100);
        }, 30);

        // 关闭弹窗函数
        function closeDialog() {
            $overlay.removeClass("visible");
            setTimeout(function() {
                $overlay.remove();
            }, 300);
        }

        // 取消按钮
        $cancelBtn.on("click", function() {
            closeDialog();
        });

        // 点击遮罩层关闭
        $overlay.on("click", function(e) {
            if ($(e.target).hasClass("xiaoxin-wechat-edit-remark-overlay")) {
                closeDialog();
            }
        });

        // 确认按钮
        $confirmBtn.on("click", function() {
            var newRemark = $input.val().trim();
            
            // 更新联系人备注
            if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.addContact === "function") {
                var updatedContact = Object.assign({}, contact, {
                    remark: newRemark
                });
                window.XiaoxinWeChatDataHandler.addContact(updatedContact);
                console.info("[小馨手机][微信] 更新备注:", newRemark);
                
                if (window.toastr) {
                    toastr.success("备注已更新", "提示");
                }
                
                // 关闭弹窗
                closeDialog();
                
                // 刷新当前页面以显示更新后的备注
                setTimeout(function() {
                    var $container = $root && $root.parent() ? $root.parent() : null;
                    if ($container && $container.length) {
                        $container.empty();
                        var $newRoot = $('<div class="xiaoxin-wechat-root"></div>');
                        $container.append($newRoot);
                        // 重新获取更新后的联系人数据
                        var contactId = contact && (contact.id || contact.characterId || "");
                        var updatedContactData = updatedContact;
                        if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getContact === "function") {
                            var latestContact = window.XiaoxinWeChatDataHandler.getContact(contactId);
                            if (latestContact) {
                                updatedContactData = latestContact;
                            }
                        }
                        renderContactSettingsPage($newRoot, mobilePhone, updatedContactData, source);
                    }
                }, 350);
            } else {
                if (window.toastr) {
                    toastr.error("更新失败", "错误");
                }
            }
        });

        // 回车键确认
        $input.on("keydown", function(e) {
            if (e.key === "Enter" || e.keyCode === 13) {
                e.preventDefault();
                $confirmBtn.click();
            }
        });
    }

    // ========== 显示生成历史朋友圈弹窗 ==========
    function showHistoryMomentsDialog($root, mobilePhone, contact) {
        console.info("[小馨手机][微信] 打开生成历史朋友圈弹窗");

        // 获取手机容器
        var $phoneContainer = $root.closest(".xiaoxin-phone-container");
        if (!$phoneContainer.length) {
            $phoneContainer = $(".xiaoxin-phone-container").first();
        }
        if (!$phoneContainer.length) {
            console.warn("[小馨手机][微信] 未找到手机容器，无法显示弹窗");
            return;
        }

        // 移除已存在的弹窗
        $phoneContainer.find(".xiaoxin-wechat-history-moments-overlay").remove();

        // 创建遮罩层
        var $overlay = $('<div class="xiaoxin-wechat-history-moments-overlay"></div>');
        var $dialog = $('<div class="xiaoxin-wechat-history-moments-modal"></div>');

        // 标题栏
        var $titleBar = $('<div class="xiaoxin-wechat-history-moments-title-bar"></div>');
        var $title = $('<div class="xiaoxin-wechat-history-moments-title">生成玩家历史朋友圈</div>');
        var $closeBtn = $(
            '<div class="xiaoxin-wechat-history-moments-close">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>' +
            '</div>'
        );
        $titleBar.append($title, $closeBtn);

        // 内容区域
        var $content = $('<div class="xiaoxin-wechat-history-moments-content"></div>');

        // 输入栏
        var fields = [
            { key: 'identity', label: '{{user}}身份', placeholder: '请输入玩家身份' },
            { key: 'experience', label: '{{user}}经历', placeholder: '请输入玩家经历' },
            { key: 'gender', label: '{{user}}性别', placeholder: '请选择玩家性别', type: 'select', options: ['男', '女'] },
            { key: 'count', label: '{{user}}历史朋友圈条数', placeholder: '例如：10' },
            { key: 'timeSpan', label: '{{user}}历史朋友圈时间跨度', placeholder: '例如：最近一年' },
            { key: 'style', label: '{{user}}历史朋友圈风格', placeholder: '活泼/搞怪/抽象/文艺/冷淡/自定义', type: 'style' },
            { key: 'contactCount', label: '{{user}}历史联系人数', placeholder: '例如：5（生成多少个历史联系人）' },
            { key: 'other', label: '{{user}}其他补充', placeholder: '其他补充信息（可选）' }
        ];

        var $inputs = {};
        fields.forEach(function(field) {
            var $row = $('<div class="xiaoxin-wechat-history-moments-row"></div>');
            var $label = $('<div class="xiaoxin-wechat-history-moments-label">' + field.label + '</div>');

            if (field.type === 'style') {
                // 风格选择：下拉框 + 自定义输入
                var $styleWrapper = $('<div class="xiaoxin-wechat-history-moments-style-wrapper"></div>');
                var $styleSelect = $('<select class="xiaoxin-wechat-history-moments-select"></select>');
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
                $styleSelect.append('<option value="活泼">活泼</option>');
                $styleSelect.append('<option value="搞怪">搞怪</option>');
                $styleSelect.append('<option value="抽象">抽象</option>');
                $styleSelect.append('<option value="文艺">文艺</option>');
                $styleSelect.append('<option value="冷淡">冷淡</option>');
                $styleSelect.append('<option value="custom">自定义</option>');

                var $customInput = $('<input type="text" class="xiaoxin-wechat-history-moments-input xiaoxin-wechat-history-moments-custom-input" placeholder="请输入自定义风格" style="display:none;" />');
                $customInput.css({
                    'background-color': '#f5f5f5',
                    'border': 'none',
                    'outline': 'none',
                    'box-shadow': 'none',
                    'color': '#000000'
                });
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
                $customInput.on('focus blur hover mouseenter mouseleave change input click', function() {
                    forceCustomInputStyle($(this));
                });
                // 定期强制设置样式，防止被主题覆盖
                var customInputInterval = setInterval(function() {
                    if ($customInput.length && $customInput.is(':visible')) {
                        forceCustomInputStyle($customInput);
                    } else {
                        clearInterval(customInputInterval);
                    }
                }, 100);

                $styleSelect.on('change', function() {
                    if ($(this).val() === 'custom') {
                        $customInput.show();
                    } else {
                        $customInput.hide().val('');
                    }
                });

                $styleWrapper.append($styleSelect, $customInput);
                $row.append($label, $styleWrapper);
                $inputs[field.key] = { select: $styleSelect, custom: $customInput };
            } else if (field.type === 'select') {
                // 下拉选择（性别）
                var $select = $('<select class="xiaoxin-wechat-history-moments-select"></select>');
                $select.css({
                    'background-color': '#f5f5f5',
                    'border': 'none',
                    'outline': 'none',
                    'box-shadow': 'none',
                    'color': '#000000',
                    '-webkit-appearance': 'none',
                    '-moz-appearance': 'none',
                    'appearance': 'none'
                });
                // 强制设置样式，覆盖所有状态
                function forceSelectStyle($el) {
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
                $select.on('focus blur hover mouseenter mouseleave change input click', function() {
                    forceSelectStyle($(this));
                });
                // 定期强制设置样式，防止被主题覆盖
                var selectInterval = setInterval(function() {
                    if ($select.length && $select.is(':visible')) {
                        forceSelectStyle($select);
                    } else {
                        clearInterval(selectInterval);
                    }
                }, 100);
                $select.append('<option value="">请选择</option>');
                field.options.forEach(function(option) {
                    $select.append('<option value="' + option + '">' + option + '</option>');
                });
                $row.append($label, $select);
                $inputs[field.key] = $select;
            } else {
                var $input = $('<input type="text" class="xiaoxin-wechat-history-moments-input" placeholder="' + field.placeholder + '" />');
                $input.css({
                    'background-color': '#f5f5f5',
                    'border': 'none',
                    'outline': 'none',
                    'box-shadow': 'none',
                    'color': '#000000'
                });
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
                $input.on('focus blur hover mouseenter mouseleave change input click', function() {
                    forceInputStyle($(this));
                });
                // 定期强制设置样式，防止被主题覆盖
                var inputInterval = setInterval(function() {
                    if ($input.length && $input.is(':visible')) {
                        forceInputStyle($input);
                    } else {
                        clearInterval(inputInterval);
                    }
                }, 100);
                $row.append($label, $input);
                $inputs[field.key] = $input;
            }

            $content.append($row);
        });

        // 按钮区域
        var $footer = $('<div class="xiaoxin-wechat-history-moments-footer"></div>');
        var $cancelBtn = $('<button class="xiaoxin-wechat-history-moments-btn xiaoxin-wechat-history-moments-btn-cancel">取消</button>');
        var $confirmBtn = $('<button class="xiaoxin-wechat-history-moments-btn xiaoxin-wechat-history-moments-btn-confirm">完成</button>');

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

        // 取消按钮
        $cancelBtn.on("click", function () {
            $overlay.remove();
        });

        // 完成按钮
        $confirmBtn.on("click", function () {
            // 收集输入数据
            var data = {};
            var isValid = true;

            fields.forEach(function(field) {
                if (field.type === 'style') {
                    var styleValue = $inputs[field.key].select.val();
                    if (styleValue === 'custom') {
                        styleValue = $inputs[field.key].custom.val().trim();
                        if (!styleValue) {
                            isValid = false;
                            if (window.toastr) {
                                toastr.warning('请填写自定义风格', '生成历史朋友圈');
                            }
                        }
                    }
                    if (!styleValue) {
                        isValid = false;
                        if (window.toastr) {
                            toastr.warning('请选择或填写' + field.label, '生成历史朋友圈');
                        }
                    }
                    data[field.key] = styleValue || '';
                } else if (field.type === 'select') {
                    // 下拉选择字段（性别）
                    var value = $inputs[field.key].val();
                    if (!value) {
                        isValid = false;
                        if (window.toastr) {
                            toastr.warning('请选择' + field.label, '生成历史朋友圈');
                        }
                    }
                    data[field.key] = value || '';
                } else if (field.key === 'other') {
                    // 其他补充为可选
                    data[field.key] = $inputs[field.key].val().trim();
                } else if (field.key === 'contactCount') {
                    // 历史联系人数为必填
                    var value = $inputs[field.key].val().trim();
                    if (!value) {
                        isValid = false;
                        if (window.toastr) {
                            toastr.warning('请填写' + field.label, '生成历史朋友圈');
                        }
                    }
                    // 验证是否为有效数字
                    var numValue = parseInt(value);
                    if (isNaN(numValue) || numValue <= 0) {
                        isValid = false;
                        if (window.toastr) {
                            toastr.warning('历史联系人数必须是大于0的数字', '生成历史朋友圈');
                        }
                    }
                    data[field.key] = value;
                } else {
                    // 其他字段为必填
                    var value = $inputs[field.key].val().trim();
                    if (!value) {
                        isValid = false;
                        if (window.toastr) {
                            toastr.warning('请填写' + field.label, '生成历史朋友圈');
                        }
                    }
                    data[field.key] = value;
                }
            });

            if (!isValid) {
                return;
            }

            // 生成格式化的申请文本
            var formatText = '<Request：只生成格式指令，不生成正文回复>\n';
            formatText += '[playerhistorymoments]\n';
            formatText += '【生成玩家历史朋友圈】\n';
            formatText += '{{user}}身份：' + data.identity + '\n';
            formatText += '{{user}}经历：' + data.experience + '\n';
            formatText += '{{user}}性别：' + data.gender + '\n';
            formatText += '{{user}}历史朋友圈条数：' + data.count + '\n';
            formatText += '{{user}}历史朋友圈时间跨度：' + data.timeSpan + '\n';
            formatText += '{{user}}历史朋友圈风格：' + data.style + '\n';
            formatText += '{{user}}历史联系人数：' + data.contactCount + '\n';
            if (data.other) {
                formatText += '{{user}}其他补充：' + data.other + '\n';
            }
            formatText += '[/playerhistorymoments]';

            // 插入到酒馆输入框
            var inserted = insertTextToTavernInput(formatText);
            if (inserted) {
                if (window.toastr) {
                    toastr.success("已生成历史朋友圈申请格式，请在输入框确认发送", "小馨手机");
                }
                // 关闭弹窗
                $overlay.remove();
                // 监听输入框变化，检测格式是否已被识别
                setupHistoryMomentsMonitor(formatText, $root, mobilePhone, contact);
            } else {
                if (window.toastr) {
                    toastr.info("未找到输入框，请手动填写", "小馨手机");
                }
            }
        });

        $footer.append($cancelBtn, $confirmBtn);

        $dialog.append($titleBar, $content, $footer);
        $overlay.append($dialog);
        $phoneContainer.append($overlay);

        // 点击遮罩层关闭
        $overlay.on("click", function (e) {
            if ($(e.target).hasClass("xiaoxin-wechat-history-moments-overlay")) {
                $overlay.remove();
            }
        });

        // 关闭按钮
        $closeBtn.on("click", function () {
            $overlay.remove();
        });
    }

    // ========== 监听历史朋友圈格式是否已被识别 ==========
    function setupHistoryMomentsMonitor(formatText, $root, mobilePhone, contact) {
        try {
            var selectors = [
                "#send_textarea",
                "#send_textarea textarea",
                "textarea#send_textarea",
                "#send_textarea_mobile",
                ".send_textarea",
                "#message_in",
                "#user-input",
            ];
            var $input = null;
            for (var i = 0; i < selectors.length; i++) {
                $input = $(selectors[i]);
                if ($input.length > 0) {
                    break;
                }
            }

            if (!$input || !$input.length) {
                console.warn("[小馨手机][微信] 未找到输入框，无法监听历史朋友圈格式");
                return;
            }

            var checkText = formatText.trim();
            var lastValue = $input.val() || "";
            var checkCount = 0;
            var maxChecks = 120; // 最多检查60秒（每500ms检查一次）

            var checkInterval = setInterval(function () {
                checkCount++;
                var currentValue = $input.val() || "";

                // 如果输入框内容变化了
                if (currentValue !== lastValue) {
                    lastValue = currentValue;

                    // 检查格式文本是否还在输入框中
                    var textStillExists = currentValue.indexOf(checkText) !== -1;

                    if (!textStillExists) {
                        // 格式文本已不在输入框中，说明已被发送或删除
                        // 标记为已生成
                        try {
                            if (typeof getVariables === "function" && typeof replaceVariables === "function") {
                                var globalData = getVariables({ type: "global" }) || {};
                                globalData.xiaoxin_wechat_player_history_moments_generated = true;
                                replaceVariables(globalData, { type: "global" });
                                console.info("[小馨手机][微信] 历史朋友圈格式已被识别，已标记为已生成");

                                // 隐藏按钮（如果页面还在显示）
                                var $btn = $(".xiaoxin-wechat-contact-detail-history-moments-btn");
                                if ($btn.length > 0) {
                                    $btn.remove();
                                }
                            }
                        } catch (e) {
                            console.warn("[小馨手机][微信] 标记历史朋友圈生成状态失败:", e);
                        }

                        clearInterval(checkInterval);
                    }
                }

                // 达到最大检查次数，停止监听
                if (checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                }
            }, 500); // 每500ms检查一次

            // 30秒后自动停止监听（避免无限监听）
            setTimeout(function () {
                clearInterval(checkInterval);
            }, 30000);
        } catch (e) {
            console.error("[小馨手机][微信] 监听历史朋友圈格式失败:", e);
        }
    }

    // ========== 显示生成联系人历史朋友圈弹窗 ==========
    function showCharHistoryMomentsDialog(contact) {
        console.info("[小馨手机][微信] 打开生成联系人历史朋友圈弹窗，联系人:", contact);

        // 计算角色ID（优先使用 characterId，其次 contact.id，去掉 contact_ 前缀）
        var rawRoleId =
            contact.characterId ||
            (contact.id &&
                String(contact.id)
                    .trim()
                    .replace(/^contact_/, "")) ||
            "";
        var roleId = String(rawRoleId || "").trim();

        if (!roleId) {
            if (window.toastr) {
                toastr.warning("无法获取联系人ID，无法生成历史朋友圈", "小馨手机");
            }
            return;
        }

        // 获取手机容器
        var $phoneContainer = $(".xiaoxin-phone-container").first();
        if (!$phoneContainer.length) {
            $phoneContainer = $(".xiaoxin-phone-screen").first();
        }
        if (!$phoneContainer.length) {
            console.warn("[小馨手机][微信] 未找到手机容器，无法显示弹窗");
            return;
        }

        // 移除已存在的弹窗
        $phoneContainer.find(".xiaoxin-wechat-char-history-moments-overlay").remove();

        // 创建遮罩层
        var $overlay = $('<div class="xiaoxin-wechat-char-history-moments-overlay"></div>');
        var $dialog = $('<div class="xiaoxin-wechat-char-history-moments-modal"></div>');

        // 标题栏
        var $titleBar = $('<div class="xiaoxin-wechat-char-history-moments-title-bar"></div>');
        var $title = $('<div class="xiaoxin-wechat-char-history-moments-title">生成历史朋友圈</div>');
        var $closeBtn = $(
            '<div class="xiaoxin-wechat-char-history-moments-close">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>' +
            '</div>'
        );
        $titleBar.append($title, $closeBtn);

        // 内容区域
        var $content = $('<div class="xiaoxin-wechat-char-history-moments-content"></div>');

        // 输入栏
        var fields = [
            { key: 'count', label: '{{char}}的历史朋友圈条数', placeholder: '例如：10' },
            { key: 'style', label: '{{char}}的朋友圈风格', placeholder: '活泼/搞怪/抽象/文艺/冷淡/自定义', type: 'style' },
            { key: 'timeSpan', label: '{{char}}的朋友圈跨度', placeholder: '例如：最近一年' },
            { key: 'other', label: '{{char}}历史朋友圈自定义补充', placeholder: '可选，例如：朋友圈的要素、{{char}}的经历、总是因为什么发布朋友圈等', type: 'textarea' },
            { key: 'random', label: '根据随机人设随机生成', placeholder: '是否随机生成', type: 'checkbox' }
        ];

        var $inputs = {};
        fields.forEach(function(field) {
            var $row = $('<div class="xiaoxin-wechat-char-history-moments-row"></div>');
            var $label = $('<div class="xiaoxin-wechat-char-history-moments-label">' + field.label + '</div>');

            if (field.type === 'style') {
                // 风格选择：下拉框 + 自定义输入
                var $styleWrapper = $('<div class="xiaoxin-wechat-char-history-moments-style-wrapper"></div>');
                var $styleSelect = $('<select class="xiaoxin-wechat-char-history-moments-select"></select>');
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
                $styleSelect.append('<option value="活泼">活泼</option>');
                $styleSelect.append('<option value="搞怪">搞怪</option>');
                $styleSelect.append('<option value="抽象">抽象</option>');
                $styleSelect.append('<option value="文艺">文艺</option>');
                $styleSelect.append('<option value="冷淡">冷淡</option>');
                $styleSelect.append('<option value="custom">自定义</option>');

                var $customInput = $('<input type="text" class="xiaoxin-wechat-char-history-moments-input xiaoxin-wechat-char-history-moments-custom-input" placeholder="请输入自定义风格" style="display:none;" />');
                $customInput.css({
                    'background-color': '#f5f5f5',
                    'border': 'none',
                    'outline': 'none',
                    'box-shadow': 'none',
                    'color': '#000000'
                });
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
                $customInput.on('focus blur hover mouseenter mouseleave change input click', function() {
                    forceCustomInputStyle($(this));
                });
                // 定期强制设置样式，防止被主题覆盖
                var customInputInterval = setInterval(function() {
                    if ($customInput.length && $customInput.is(':visible')) {
                        forceCustomInputStyle($customInput);
                    } else {
                        clearInterval(customInputInterval);
                    }
                }, 100);

                $styleSelect.on('change', function() {
                    if ($(this).val() === 'custom') {
                        $customInput.show();
                    } else {
                        $customInput.hide().val('');
                    }
                });

                $styleWrapper.append($styleSelect, $customInput);
                $row.append($label, $styleWrapper);
                $inputs[field.key] = { select: $styleSelect, custom: $customInput };
            } else if (field.type === 'checkbox') {
                // 复选框
                var $checkboxWrapper = $('<div class="xiaoxin-wechat-char-history-moments-checkbox-wrapper"></div>');
                var $checkbox = $('<input type="checkbox" class="xiaoxin-wechat-char-history-moments-checkbox" />');
                $checkboxWrapper.append($checkbox);
                $row.append($label, $checkboxWrapper);
                $inputs[field.key] = $checkbox;
            } else if (field.type === 'textarea') {
                // 文本域（用于自定义补充）
                var $textarea = $('<textarea class="xiaoxin-wechat-char-history-moments-input xiaoxin-wechat-char-history-moments-textarea" placeholder="' + field.placeholder + '" rows="3"></textarea>');
                $textarea.css({
                    'background-color': '#f5f5f5',
                    'border': 'none',
                    'outline': 'none',
                    'box-shadow': 'none',
                    'color': '#000000',
                    'resize': 'vertical',
                    'min-height': '60px'
                });
                // 强制设置样式，覆盖所有状态
                function forceTextareaStyle($el) {
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
                $textarea.on('focus blur hover mouseenter mouseleave change input click', function() {
                    forceTextareaStyle($(this));
                });
                // 定期强制设置样式，防止被主题覆盖
                var textareaInterval = setInterval(function() {
                    if ($textarea.length && $textarea.is(':visible')) {
                        forceTextareaStyle($textarea);
                    } else {
                        clearInterval(textareaInterval);
                    }
                }, 100);
                $row.append($label, $textarea);
                $inputs[field.key] = $textarea;
            } else {
                // 普通输入框
                var $input = $('<input type="text" class="xiaoxin-wechat-char-history-moments-input" placeholder="' + field.placeholder + '" />');
                $input.css({
                    'background-color': '#f5f5f5',
                    'border': 'none',
                    'outline': 'none',
                    'box-shadow': 'none',
                    'color': '#000000'
                });
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
                $input.on('focus blur hover mouseenter mouseleave change input click', function() {
                    forceInputStyle($(this));
                });
                // 定期强制设置样式，防止被主题覆盖
                var inputInterval = setInterval(function() {
                    if ($input.length && $input.is(':visible')) {
                        forceInputStyle($input);
                    } else {
                        clearInterval(inputInterval);
                    }
                }, 100);
                $row.append($label, $input);
                $inputs[field.key] = $input;
            }
            $content.append($row);
        });

        // 底部按钮
        var $footer = $('<div class="xiaoxin-wechat-char-history-moments-footer"></div>');
        var $cancelBtn = $('<button class="xiaoxin-wechat-char-history-moments-btn xiaoxin-wechat-char-history-moments-btn-cancel">取消</button>');
        var $confirmBtn = $('<button class="xiaoxin-wechat-char-history-moments-btn xiaoxin-wechat-char-history-moments-btn-confirm">完成</button>');

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

        $cancelBtn.on('click', function() {
            $overlay.remove();
        });
        $closeBtn.on('click', function() {
            $overlay.remove();
        });

        $confirmBtn.on('click', function() {
            // 收集数据
            var data = {};
            var isValid = true;

            // 如果随机生成被选中，跳过其他字段验证
            var isRandom = $inputs.random && $inputs.random.is(':checked');

            if (!isRandom) {
                fields.forEach(function(field) {
                    if (field.type === 'checkbox') {
                        return; // 跳过复选框
                    }
                    if (field.type === 'style') {
                        var styleValue = $inputs[field.key].select.val();
                        if (styleValue === 'custom') {
                            styleValue = ($inputs[field.key].custom.val() || '').trim();
                        }
                        if (!styleValue) {
                            isValid = false;
                            if (window.toastr) {
                                toastr.warning('请选择或填写' + field.label, '生成历史朋友圈');
                            }
                        }
                        data[field.key] = styleValue;
                    } else if (field.key === 'count') {
                        var value = $inputs[field.key].val().trim();
                        if (!value) {
                            isValid = false;
                            if (window.toastr) {
                                toastr.warning('请填写' + field.label, '生成历史朋友圈');
                            }
                        }
                        // 验证是否为有效数字
                        var numValue = parseInt(value);
                        if (isNaN(numValue) || numValue <= 0) {
                            isValid = false;
                            if (window.toastr) {
                                toastr.warning('历史朋友圈条数必须是大于0的数字', '生成历史朋友圈');
                            }
                        }
                        data[field.key] = value;
                    } else if (field.type === 'textarea') {
                        // 文本域字段（自定义补充）是可选的，不需要验证
                        var value = $inputs[field.key].val().trim();
                        if (value) {
                            data[field.key] = value;
                        }
                    } else {
                        var value = $inputs[field.key].val().trim();
                        if (!value) {
                            isValid = false;
                            if (window.toastr) {
                                toastr.warning('请填写' + field.label, '生成历史朋友圈');
                            }
                        }
                        data[field.key] = value;
                    }
                });
            } else {
                // 随机生成模式
                data.random = true;
                // 即使随机生成，也收集自定义补充（如果填写了）
                if ($inputs.other && $inputs.other.length) {
                    var otherValue = $inputs.other.val().trim();
                    if (otherValue) {
                        data.other = otherValue;
                    }
                }
            }

            if (!isValid && !isRandom) {
                return;
            }

            // 生成格式化的申请文本
            var formatText = '<Request：只输出格式指令，不输出正文剧情>\n';
            formatText += '[char_historymoments]\n';
            formatText += 'role_id=' + roleId + '\n';
            if (isRandom) {
                formatText += 'random=true\n';
            } else {
                formatText += 'count=' + data.count + '\n';
                formatText += 'style=' + data.style + '\n';
                formatText += 'time_span=' + data.timeSpan + '\n';
            }
            // 如果有自定义补充，添加到格式文本中
            if (data.other && data.other.trim()) {
                formatText += 'other=' + data.other.trim() + '\n';
            }
            formatText += '[/char_historymoments]';

            // 插入到酒馆输入框
            function insertTextToTavernInput(text) {
                try {
                    if (
                        window.XiaoxinWeChatApp &&
                        window.XiaoxinWeChatApp.insertTextToTavernInput
                    ) {
                        window.XiaoxinWeChatApp.insertTextToTavernInput(text);
                        return true;
                    } else {
                        var tavernInput = document.getElementById("send_textarea");
                        if (tavernInput) {
                            var currentValue = tavernInput.value || "";
                            tavernInput.value = currentValue + (currentValue ? "\n" : "") + text;
                            tavernInput.dispatchEvent(new Event("input", { bubbles: true }));
                            return true;
                        }
                    }
                } catch (e) {
                    console.error("[小馨手机][微信] 插入文本到酒馆输入框失败:", e);
                }
                return false;
            }

            var inserted = insertTextToTavernInput(formatText);
            if (inserted) {
                if (window.toastr) {
                    toastr.success("已生成历史朋友圈申请格式，请在输入框确认发送", "小馨手机");
                }
                // 关闭弹窗
                $overlay.remove();
            } else {
                if (window.toastr) {
                    toastr.error("写入指令失败，请手动复制", "小馨手机");
                }
            }
        });

        $footer.append($cancelBtn, $confirmBtn);
        $dialog.append($titleBar, $content, $footer);
        $overlay.append($dialog);
        $phoneContainer.append($overlay);
    }

    // ========== 调试函数：在控制台中查看历史朋友圈生成状态 ==========
    function checkHistoryMomentsStatus() {
        console.log("=== 历史朋友圈生成状态检查 ===");

        var results = {
            methods: [],
            finalStatus: null
        };

        // 方法1：直接使用 getVariables（如果可用）
        try {
            if (typeof getVariables === "function") {
                var globalData = getVariables({ type: "global" }) || {};
                var status = globalData.xiaoxin_wechat_player_history_moments_generated === true;
                results.methods.push({
                    method: "getVariables (直接)",
                    success: true,
                    status: status,
                    value: globalData.xiaoxin_wechat_player_history_moments_generated,
                    globalData: globalData
                });
                results.finalStatus = status;
                console.log("✓ 方法1 (getVariables):", status, "值:", globalData.xiaoxin_wechat_player_history_moments_generated);
            } else {
                results.methods.push({
                    method: "getVariables (直接)",
                    success: false,
                    error: "getVariables 函数不可用"
                });
                console.warn("✗ 方法1: getVariables 函数不可用");
            }
        } catch (e) {
            results.methods.push({
                method: "getVariables (直接)",
                success: false,
                error: e.message
            });
            console.error("✗ 方法1 失败:", e);
        }

        // 方法2：通过 window.parent 访问
        try {
            if (window.parent && window.parent !== window) {
                if (typeof window.parent.getVariables === "function") {
                    var parentGlobalData = window.parent.getVariables({ type: "global" }) || {};
                    var parentStatus = parentGlobalData.xiaoxin_wechat_player_history_moments_generated === true;
                    results.methods.push({
                        method: "getVariables (parent)",
                        success: true,
                        status: parentStatus,
                        value: parentGlobalData.xiaoxin_wechat_player_history_moments_generated,
                        globalData: parentGlobalData
                    });
                    if (results.finalStatus === null) {
                        results.finalStatus = parentStatus;
                    }
                    console.log("✓ 方法2 (parent.getVariables):", parentStatus, "值:", parentGlobalData.xiaoxin_wechat_player_history_moments_generated);
                } else {
                    results.methods.push({
                        method: "getVariables (parent)",
                        success: false,
                        error: "parent.getVariables 函数不可用"
                    });
                    console.warn("✗ 方法2: parent.getVariables 函数不可用");
                }
            } else {
                results.methods.push({
                    method: "getVariables (parent)",
                    success: false,
                    error: "不在 iframe 中或 parent === window"
                });
                console.warn("✗ 方法2: 不在 iframe 中");
            }
        } catch (e) {
            results.methods.push({
                method: "getVariables (parent)",
                success: false,
                error: e.message
            });
            console.error("✗ 方法2 失败:", e);
        }

        // 方法3：通过 top 访问
        try {
            if (window.top && window.top !== window) {
                if (typeof window.top.getVariables === "function") {
                    var topGlobalData = window.top.getVariables({ type: "global" }) || {};
                    var topStatus = topGlobalData.xiaoxin_wechat_player_history_moments_generated === true;
                    results.methods.push({
                        method: "getVariables (top)",
                        success: true,
                        status: topStatus,
                        value: topGlobalData.xiaoxin_wechat_player_history_moments_generated,
                        globalData: topGlobalData
                    });
                    if (results.finalStatus === null) {
                        results.finalStatus = topStatus;
                    }
                    console.log("✓ 方法3 (top.getVariables):", topStatus, "值:", topGlobalData.xiaoxin_wechat_player_history_moments_generated);
                } else {
                    results.methods.push({
                        method: "getVariables (top)",
                        success: false,
                        error: "top.getVariables 函数不可用"
                    });
                    console.warn("✗ 方法3: top.getVariables 函数不可用");
                }
            } else {
                results.methods.push({
                    method: "getVariables (top)",
                    success: false,
                    error: "不在 iframe 中或 top === window"
                });
                console.warn("✗ 方法3: 不在 iframe 中");
            }
        } catch (e) {
            results.methods.push({
                method: "getVariables (top)",
                success: false,
                error: e.message
            });
            console.error("✗ 方法3 失败:", e);
        }

        // 方法4：检查 localStorage（如果代码中有存储）
        try {
            var localStorageKey = "xiaoxin_wechat_player_history_moments_generated";
            var localStorageValue = localStorage.getItem(localStorageKey);
            if (localStorageValue !== null) {
                var lsStatus = localStorageValue === "true";
                results.methods.push({
                    method: "localStorage",
                    success: true,
                    status: lsStatus,
                    value: localStorageValue
                });
                if (results.finalStatus === null) {
                    results.finalStatus = lsStatus;
                }
                console.log("✓ 方法4 (localStorage):", lsStatus, "值:", localStorageValue);
            } else {
                results.methods.push({
                    method: "localStorage",
                    success: false,
                    error: "localStorage 中未找到该键"
                });
                console.warn("✗ 方法4: localStorage 中未找到");
            }
        } catch (e) {
            results.methods.push({
                method: "localStorage",
                success: false,
                error: e.message
            });
            console.error("✗ 方法4 失败:", e);
        }

        console.log("=== 最终状态 ===");
        console.log("已生成:", results.finalStatus);
        console.log("所有方法结果:", results.methods);

        return results;
    }

    // 辅助函数：手动设置状态（如果 getVariables 可用）
    function setHistoryMomentsStatus(value) {
        console.log("=== 设置历史朋友圈生成状态 ===");
        console.log("目标值:", value);

        var success = false;

        // 尝试方法1：直接使用 replaceVariables
        try {
            if (typeof getVariables === "function" && typeof replaceVariables === "function") {
                var globalData = getVariables({ type: "global" }) || {};
                globalData.xiaoxin_wechat_player_history_moments_generated = value;
                replaceVariables(globalData, { type: "global" });
                console.log("✓ 方法1: 已通过 getVariables/replaceVariables 设置");
                success = true;
            }
        } catch (e) {
            console.error("✗ 方法1 失败:", e);
        }

        // 尝试方法2：通过 parent
        if (!success) {
            try {
                if (window.parent && window.parent !== window) {
                    if (typeof window.parent.getVariables === "function" && typeof window.parent.replaceVariables === "function") {
                        var parentGlobalData = window.parent.getVariables({ type: "global" }) || {};
                        parentGlobalData.xiaoxin_wechat_player_history_moments_generated = value;
                        window.parent.replaceVariables(parentGlobalData, { type: "global" });
                        console.log("✓ 方法2: 已通过 parent.getVariables/replaceVariables 设置");
                        success = true;
                    }
                }
            } catch (e) {
                console.error("✗ 方法2 失败:", e);
            }
        }

        // 尝试方法3：通过 top
        if (!success) {
            try {
                if (window.top && window.top !== window) {
                    if (typeof window.top.getVariables === "function" && typeof window.top.replaceVariables === "function") {
                        var topGlobalData = window.top.getVariables({ type: "global" }) || {};
                        topGlobalData.xiaoxin_wechat_player_history_moments_generated = value;
                        window.top.replaceVariables(topGlobalData, { type: "global" });
                        console.log("✓ 方法3: 已通过 top.getVariables/replaceVariables 设置");
                        success = true;
                    }
                }
            } catch (e) {
                console.error("✗ 方法3 失败:", e);
            }
        }

        if (success) {
            console.log("✓ 状态已设置，请刷新页面查看效果");
        } else {
            console.error("✗ 所有方法都失败，无法设置状态");
            console.log("提示：可能需要手动在酒馆助手的变量管理界面中设置");
        }

        return success;
    }

    // 将调试函数暴露到全局，方便在控制台调用
    window.checkHistoryMomentsStatus = checkHistoryMomentsStatus;
    window.setHistoryMomentsStatus = setHistoryMomentsStatus;

    // ========== 导出 ==========
    return {
        renderAddFriendPage: renderAddFriendPage,
        renderContactDetailPage: renderContactDetailPage,
        renderNewFriendsPage: renderNewFriendsPage,
        renderFriendPassVerifyPage: renderFriendPassVerifyPage,
        showCharHistoryMomentsDialog: showCharHistoryMomentsDialog,
    };
})();
