// 微信设置页面模块
window.XiaoxinWeChatSettings = (function () {
    // ========== 渲染设置页面 ==========
    function renderSettingsPage($root, mobilePhone) {
        console.info("[小馨手机][微信] 渲染设置页面");

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
            '<div class="xiaoxin-wechat-main xiaoxin-wechat-settings-main"></div>'
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
            // 返回到"我"页面（个人页）
            if ($root && window.XiaoxinWeChatApp && window.XiaoxinWeChatApp._renderMePage) {
                window.XiaoxinWeChatApp._renderMePage($root, mobilePhone);
            } else if ($root && $root.parent()) {
                // 兜底：如果找不到_renderMePage，尝试通过容器返回
                var $container = $root.parent();
                $container.empty();
                if (window.XiaoxinWeChatApp && window.XiaoxinWeChatApp.render) {
                    window.XiaoxinWeChatApp.render($container, mobilePhone);
                }
            }
        });
        $headerLeft.append($headerBack);

        var $headerTitle = $(
            '<div class="xiaoxin-wechat-header-title">设置</div>'
        );

        // 右侧占位元素，确保标题居中
        var $headerRight = $('<div class="xiaoxin-wechat-header-right"></div>');
        $headerRight.css({
            width: "24px",
            flexShrink: 0,
        });

        $headerBar.append($headerLeft, $headerTitle, $headerRight);
        $header.append($headerBar);

        // 设置项列表
        var $settingsList = $('<div class="xiaoxin-wechat-settings-list"></div>');

        // 设置项数据
        var settingsItems = [
            {
                label: "个人资料",
                icon: '<i class="fa-solid fa-user" style="color: #4a9eff;"></i>',
                action: function () {
                    console.info("[小馨手机][微信] 点击个人资料");
                    showProfileDialog($root, mobilePhone);
                },
            },
            {
                label: "聊天背景",
                icon: '<i class="fa-solid fa-image" style="color: #07c160;"></i>',
                action: function () {
                    console.info("[小馨手机][微信] 点击聊天背景");
                    showChatBackgroundPicker($root, mobilePhone);
                },
            },
            {
                label: "朋友权限",
                icon: '<i class="fa-solid fa-users" style="color: #ffc107;"></i>',
                action: function () {
                    console.info("[小馨手机][微信] 点击朋友权限");
                    if (typeof toastr !== "undefined") {
                        toastr.info("朋友权限功能待实现", "小馨手机");
                    }
                },
            },
            {
                label: "切换账号",
                icon: '<i class="fa-solid fa-arrow-right-arrow-left" style="color: #9c27b0;"></i>',
                action: function () {
                    console.info("[小馨手机][微信] 点击切换账号");
                    if (typeof toastr !== "undefined") {
                        toastr.info("切换账号功能待实现", "小馨手机");
                    }
                },
            },
            {
                label: "退出登录",
                icon: '<i class="fa-solid fa-sign-out-alt" style="color: #f44336;"></i>',
                action: function () {
                    console.info("[小馨手机][微信] 点击退出登录");
                    if (
                        confirm("确定要退出登录吗？退出后将返回登录页面。")
                    ) {
                        // 清除当前账号
                        if (window.XiaoxinWeChatAccount) {
                            window.XiaoxinWeChatAccount.setCurrentAccountId(null);
                            console.info("[小馨手机][微信] 已退出登录");
                        }
                        // 返回微信主页（会自动跳转到注册/登录页）
                        if ($root && $root.parent()) {
                            var $container = $root.parent();
                            $container.empty();
                            if (
                                window.XiaoxinWeChatApp &&
                                window.XiaoxinWeChatApp.render
                            ) {
                                window.XiaoxinWeChatApp.render(
                                    $container,
                                    mobilePhone
                                );
                            }
                        }
                    }
                },
                isDestructive: true, // 标记为危险操作
            },
        ];

        // 渲染设置项
        settingsItems.forEach(function (item, index) {
            var $settingItem = $(
                '<div class="xiaoxin-wechat-settings-item"></div>'
            );

            // 如果是危险操作，添加特殊样式类
            if (item.isDestructive) {
                $settingItem.addClass("xiaoxin-wechat-settings-item-destructive");
            }

            var $settingIcon = $(
                '<div class="xiaoxin-wechat-settings-icon">' + item.icon + "</div>"
            );

            var $settingLabel = $(
                '<div class="xiaoxin-wechat-settings-label">' +
                    item.label +
                    "</div>"
            );

            var $settingArrow = $(
                '<div class="xiaoxin-wechat-settings-arrow"><i class="fa-solid fa-chevron-right"></i></div>'
            );

            $settingItem.append($settingIcon, $settingLabel, $settingArrow);

            // 点击事件
            $settingItem.on("click", function () {
                if (typeof item.action === "function") {
                    item.action();
                }
            });

            $settingsList.append($settingItem);

            // 在退出登录前添加分隔线
            if (index === settingsItems.length - 2) {
                var $divider = $(
                    '<div class="xiaoxin-wechat-settings-divider"></div>'
                );
                $settingsList.append($divider);
            }
        });

        $main.append($header, $settingsList);
        $root.empty().append($main);
    }

    // ========== 显示个人资料弹窗 ==========
    function showProfileDialog($root, mobilePhone) {
        console.info("[小馨手机][微信] 打开个人资料弹窗");

        var $phoneContainer = $(".xiaoxin-phone-container");
        if ($phoneContainer.length === 0) {
            console.warn("[小馨手机][微信] 未找到手机容器");
            if (typeof toastr !== "undefined") {
                toastr.error("未找到手机容器", "小馨手机");
            }
            return;
        }

        $phoneContainer.find(".xiaoxin-wechat-profile-overlay").remove();

        var account =
            (window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.getAccount === "function" &&
                window.XiaoxinWeChatDataHandler.getAccount()) ||
            (window.XiaoxinWeChatAccount &&
                typeof window.XiaoxinWeChatAccount.getCurrentAccount === "function" &&
                window.XiaoxinWeChatAccount.getCurrentAccount()) ||
            null;

        if (!account) {
            console.warn("[小馨手机][微信] 未获取到账号信息");
            if (typeof toastr !== "undefined") {
                toastr.error("未获取到账号信息", "小馨手机");
            }
            return;
        }

        // 初始化时同步一次玩家微信资料变量到酒馆变量
        try {
            // 尝试多种方式访问 replaceVariables 函数
            var replaceVarsFunc = null;

            // 方法1：直接使用 replaceVariables（如果可用）
            if (typeof replaceVariables === "function") {
                replaceVarsFunc = replaceVariables;
            }
            // 方法2：通过 window.parent 访问
            else if (window.parent && window.parent !== window && typeof window.parent.replaceVariables === "function") {
                replaceVarsFunc = window.parent.replaceVariables;
            }

            if (replaceVarsFunc) {
                var variablesToInit = {
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
                replaceVarsFunc(variablesToInit, { type: "global" });
                console.info(
                    "[小馨手机][微信] 已初始化玩家微信资料变量到酒馆变量"
                );
                } else {
                    console.warn(
                        "[小馨手机][微信] replaceVariables 函数不可用，无法初始化变量（已尝试直接访问、window.parent 访问等方式）"
                    );
                    console.info(
                        "[小馨手机][微信] 调试信息：",
                        "typeof replaceVariables:",
                        typeof replaceVariables,
                        "window.parent存在:",
                        window.parent && window.parent !== window,
                        "typeof window.parent.replaceVariables:",
                        window.parent && typeof window.parent.replaceVariables
                    );
                }
        } catch (e) {
            console.warn(
                "[小馨手机][微信] 初始化玩家微信资料变量失败:",
                e
            );
        }

        function sanitize(text) {
            if (text === null || text === undefined) return "";
            return String(text)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;");
        }

        var avatar = account.avatar || "";
        if (avatar) {
            avatar = avatar
                .toString()
                .replace(/^url\((['"]?)(.+?)\1\)$/i, "$2")
                .replace(/<br\s*\/?>/gi, "")
                .replace(/<[^>]*>/g, "")
                .trim();
        }
        if (!avatar) {
            avatar =
                "/scripts/extensions/third-party/小馨手机/image/头像/微信默认头像.jpg";
        }

        var nickname = account.nickname || "微信用户";
        var wechatId = account.wechatId || account.id || "未设置";
        var gender = account.gender || account.sex || "未设置";
        var region = account.region || account.location || "未设置";
        var signature =
            account.signature || account.sign || account.desc || "未设置";
        var phone = account.phone || account.mobile || "未绑定";

        var $overlay = $('<div class="xiaoxin-wechat-profile-overlay"></div>');
        var $dialog = $('<div class="xiaoxin-wechat-profile-modal"></div>');

        var $titleBar = $('<div class="xiaoxin-wechat-profile-title-bar"></div>');
        var $back = $(
            '<div class="xiaoxin-wechat-profile-back">' +
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg>" +
                "</div>"
        );
        var $title = $('<div class="xiaoxin-wechat-profile-title">个人资料</div>');
        var $closePlaceholder = $('<div class="xiaoxin-wechat-profile-placeholder"></div>');
        $titleBar.append($back, $title, $closePlaceholder);

        var $header = $('<div class="xiaoxin-wechat-profile-header"></div>');
        var $avatar = $('<div class="xiaoxin-wechat-profile-avatar"></div>');
        $avatar.css("background-image", "url(" + avatar + ")");
        var $nameWrapper = $('<div class="xiaoxin-wechat-profile-name-wrapper"></div>');
        var $name = $(
            '<div class="xiaoxin-wechat-profile-name xiaoxin-wechat-profile-name-editable">' +
                sanitize(nickname) +
                "</div>"
        );
        var $id = $(
            '<div class="xiaoxin-wechat-profile-id">微信号：' +
                sanitize(wechatId) +
                "</div>"
        );
        $nameWrapper.append($name, $id);
        $header.append($avatar, $nameWrapper);
        
        // 添加名称字段的编辑功能
        $name.on("click", function() {
            var currentText = ($name.text() || "").trim();
            var newValue = window.prompt("编辑微信昵称", currentText);
            
            if (newValue === null) {
                return; // 用户取消
            }
            
            newValue = String(newValue || "").trim();
            
            if (newValue === "") {
                if (typeof toastr !== "undefined") {
                    toastr.warning("微信昵称不能为空", "个人资料");
                }
                return;
            }
            
            var displayValue = updateAccountField("nickname", newValue, function (v) {
                return v || "微信用户";
            });
            
            if (displayValue !== null) {
                $name.html(sanitize(displayValue));
                console.info("[小馨手机][微信] 微信昵称已更新:", displayValue);
            }
        });

        // 简单工具：更新账号字段（优先使用账号管理模块）
        function updateAccountField(fieldName, newValue, displayFn) {
            displayFn = displayFn || function (v) {
                return v === null || v === undefined || v === "" ? "未设置" : v;
            };

            var currentAccount =
                (window.XiaoxinWeChatAccount &&
                    typeof window.XiaoxinWeChatAccount.getCurrentAccount ===
                        "function" &&
                    window.XiaoxinWeChatAccount.getCurrentAccount()) ||
                (window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler.getAccount ===
                        "function" &&
                    window.XiaoxinWeChatDataHandler.getAccount()) ||
                null;

            if (!currentAccount) {
                console.warn(
                    "[小馨手机][微信] 无法获取账号信息，无法更新字段:",
                    fieldName
                );
                if (typeof toastr !== "undefined") {
                    toastr.error("无法获取账号信息", "小馨手机");
                }
                return null;
            }

            var updatedValue = newValue;

            // 性别字段做简单校验与规范
            if (fieldName === "gender" || fieldName === "sex") {
                var v = (newValue || "").trim();
                if (v === "" || v === "未设置") {
                    updatedValue = "";
                } else if (v === "男" || v.toLowerCase() === "male") {
                    updatedValue = "男";
                } else if (v === "女" || v.toLowerCase() === "female") {
                    updatedValue = "女";
                } else {
                    // 其他输入一律视为未设置，避免脏数据
                    updatedValue = "";
                }
            }

            // 更新本地 account 对象
            currentAccount[fieldName] = updatedValue;

            var saveOk = false;
            if (
                window.XiaoxinWeChatAccount &&
                typeof window.XiaoxinWeChatAccount.updateAccount === "function" &&
                typeof window.XiaoxinWeChatAccount.getCurrentAccountId ===
                    "function"
            ) {
                var accountId =
                    window.XiaoxinWeChatAccount.getCurrentAccountId &&
                    window.XiaoxinWeChatAccount.getCurrentAccountId();
                if (accountId) {
                    var updates = {};
                    updates[fieldName] = updatedValue;
                    saveOk = window.XiaoxinWeChatAccount.updateAccount(
                        accountId,
                        updates
                    );
                }
            }

            // 兜底：如果账号管理模块不可用，尝试通过 DataHandler 保存
            if (
                !saveOk &&
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.setAccount === "function"
            ) {
                saveOk = window.XiaoxinWeChatDataHandler.setAccount(
                    currentAccount
                );
            }

            if (!saveOk) {
                console.warn(
                    "[小馨手机][微信] 更新账号字段失败:",
                    fieldName,
                    updatedValue
                );
                if (typeof toastr !== "undefined") {
                    toastr.error("保存失败，请稍后重试", "个人资料");
                }
                return null;
            }

            var displayValue = displayFn(updatedValue);
            console.info(
                "[小馨手机][微信] 个人资料字段已更新:",
                fieldName,
                "=>",
                updatedValue
            );

            // 同步更新酒馆变量（用于世界书）
            try {
                // 尝试多种方式访问 replaceVariables 函数
                var replaceVarsFunc = null;

                // 方法1：直接使用 replaceVariables（如果可用）
                if (typeof replaceVariables === "function") {
                    replaceVarsFunc = replaceVariables;
                }
                // 方法2：通过 window.parent 访问
                else if (window.parent && window.parent !== window && typeof window.parent.replaceVariables === "function") {
                    replaceVarsFunc = window.parent.replaceVariables;
                }
                // 方法3：通过全局对象访问
                else if (window.getVariables && typeof window.getVariables === "function") {
                    // 如果只有 getVariables，尝试先获取再更新
                    var currentVars = window.getVariables({ type: "global" }) || {};
                    replaceVarsFunc = function(vars, options) {
                        Object.assign(currentVars, vars);
                        if (window.replaceVariables && typeof window.replaceVariables === "function") {
                            window.replaceVariables(currentVars, options);
                        } else if (window.parent && window.parent !== window && typeof window.parent.replaceVariables === "function") {
                            window.parent.replaceVariables(currentVars, options);
                        }
                    };
                }

                if (replaceVarsFunc) {
                    // 获取当前账号信息
                    var accountToSync =
                        (window.XiaoxinWeChatAccount &&
                            typeof window.XiaoxinWeChatAccount.getCurrentAccount ===
                                "function" &&
                            window.XiaoxinWeChatAccount.getCurrentAccount()) ||
                        (window.XiaoxinWeChatDataHandler &&
                            typeof window.XiaoxinWeChatDataHandler.getAccount ===
                                "function" &&
                            window.XiaoxinWeChatDataHandler.getAccount()) ||
                        currentAccount ||
                        null;

                    if (accountToSync) {
                        // 构建要同步的变量对象
                        var variablesToUpdate = {
                            player_wechat_nickname: accountToSync.nickname || accountToSync.name || "微信用户",
                            player_wechat_id: accountToSync.wechatId || accountToSync.id || "未设置",
                            player_wechat_gender: accountToSync.gender || accountToSync.sex || "未设置",
                            player_wechat_region: accountToSync.region || accountToSync.location || "未设置",
                            player_wechat_signature: accountToSync.signature || accountToSync.sign || accountToSync.desc || "未设置",
                            player_wechat_phone: accountToSync.phone || accountToSync.mobile || "未绑定",
                            player_wechat_avatar: accountToSync.avatar || "",
                            player_wechat_avatar_description: accountToSync.avatarDescription || "",
                            player_wechat_moments_background: accountToSync.momentsBackground || "",
                            player_wechat_moments_background_description: accountToSync.momentsBackgroundDescription || ""
                        };

                        // 更新全局变量
                        replaceVarsFunc(variablesToUpdate, { type: "global" });
                        console.info(
                            "[小馨手机][微信] 已同步更新玩家微信资料变量到酒馆变量"
                        );
                    }
                } else {
                    console.warn(
                        "[小馨手机][微信] replaceVariables 函数不可用，无法同步更新变量（已尝试直接访问、window.parent 访问等方式）"
                    );
                    console.info(
                        "[小馨手机][微信] 调试信息：",
                        "typeof replaceVariables:",
                        typeof replaceVariables,
                        "window.parent存在:",
                        window.parent && window.parent !== window,
                        "typeof window.parent.replaceVariables:",
                        window.parent && typeof window.parent.replaceVariables
                    );
                }
            } catch (e) {
                console.warn(
                    "[小馨手机][微信] 同步更新玩家微信资料变量失败:",
                    e
                );
            }

            // 广播账号字段更新，供朋友圈/我页面等刷新展示
            try {
                if (typeof window.CustomEvent !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent("xiaoxin-account-updated", {
                            detail: {
                                field: fieldName,
                                value: updatedValue,
                            },
                        })
                    );
                }
            } catch (e) {
                console.warn(
                    "[小馨手机][微信] 派发 xiaoxin-account-updated 事件失败:",
                    e
                );
            }
            if (typeof toastr !== "undefined") {
                toastr.success("已更新" + fieldName, "个人资料");
            }
            return displayValue;
        }

        var $list = $('<div class="xiaoxin-wechat-profile-list"></div>');
        var infoItems = [
            // 微信昵称（新增，放在第一位）
            { label: "微信昵称", value: nickname, field: "nickname", type: "text" },
            // 微信号也允许编辑（同步更新头部显示）
            { label: "微信号", value: wechatId, field: "wechatId", type: "text" },
            { label: "性别", value: gender, field: "gender", type: "gender" },
            { label: "地区", value: region, field: "region", type: "text" },
            {
                label: "个性签名",
                value: signature,
                field: "signature",
                type: "textarea",
                allowBreak: true,
            },
            { label: "手机号", value: phone, field: "phone", type: "text" },
        ];

        infoItems.forEach(function (item) {
            var $row = $('<div class="xiaoxin-wechat-profile-item"></div>');
            var $label = $(
                '<div class="xiaoxin-wechat-profile-item-label">' +
                    sanitize(item.label) +
                    "</div>"
            );
            var safeValue = sanitize(item.value || "未设置");
            if (item.allowBreak) {
                safeValue = safeValue.replace(/\n/g, "<br>");
            }
            var $value = $(
                '<div class="xiaoxin-wechat-profile-item-value">' +
                    (safeValue || "未设置") +
                    "</div>"
            );
            $row.append($label, $value);

            // 让整行可点击进行编辑
            $row.addClass("xiaoxin-wechat-profile-item-editable");
            $row.on("click", function () {
                var currentText = ($value.text() || "").trim();
                if (
                    currentText === "未设置" ||
                    currentText === "未绑定" ||
                    currentText === "未设置 "
                ) {
                    currentText = "";
                }

                var promptTitle = "编辑" + item.label;
                var newValue = null;

                if (item.type === "gender") {
                    newValue = window.prompt(
                        promptTitle + "（输入 男 / 女，留空表示未设置）",
                        currentText
                    );
                } else if (item.type === "textarea") {
                    newValue = window.prompt(
                        promptTitle + "（可多行，长度不宜过长）",
                        currentText
                    );
                } else {
                    newValue = window.prompt(promptTitle, currentText);
                }

                if (newValue === null) {
                    return; // 用户取消
                }

                newValue = String(newValue || "").trim();

                var displayValue = updateAccountField(item.field, newValue, function (v) {
                    if (!v) {
                        if (item.field === "wechatId") return "未设置";
                        if (item.field === "phone") return "未绑定";
                        return "未设置";
                    }
                    return v;
                });

                if (displayValue !== null) {
                    var displayHtml = sanitize(displayValue);
                    if (item.allowBreak) {
                        displayHtml = displayHtml.replace(/\n/g, "<br>");
                    }
                    $value.html(displayHtml);

                    // 如果编辑的是微信号，同步更新头部“微信号：xxx”
                    if (item.field === "wechatId") {
                        $id.html("微信号：" + sanitize(displayValue));
                    }
                    
                    // 如果编辑的是微信昵称，同步更新头部显示的名称
                    if (item.field === "nickname") {
                        $name.html(sanitize(displayValue));
                    }
                }
            });

            $list.append($row);
        });

        $dialog.append($titleBar, $header, $list);
        $overlay.append($dialog);
        $phoneContainer.append($overlay);

        $back.on("click", function () {
            $overlay.remove();
        });

        $overlay.on("click", function (e) {
            if ($(e.target).hasClass("xiaoxin-wechat-profile-overlay")) {
                $overlay.remove();
            }
        });
    }

    // ========== 显示聊天背景设置弹窗 ==========
    function showChatBackgroundPicker($root, mobilePhone) {
        console.info("[小馨手机][微信] 打开聊天背景设置弹窗");

        // 查找手机容器
        var $phoneContainer = $(".xiaoxin-phone-container");
        if ($phoneContainer.length === 0) {
            console.warn("[小馨手机][微信] 未找到手机容器");
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

        // 获取当前设置
        var currentSettings = window.XiaoxinWeChatDataHandler && window.XiaoxinWeChatDataHandler.getSettings
            ? window.XiaoxinWeChatDataHandler.getSettings()
            : {};
        var currentBackground = currentSettings.chatBackground || null;
        var currentScale = currentSettings.chatBackgroundScale || 100;

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
            if (confirm("确定要重置聊天背景吗？")) {
                selectedImageUrl = null;
                currentScaleValue = 100;
                $urlInput.val("");
                $scaleInput.val(100);
                $scaleValue.text("100%");
                $previewImage.hide();

                // 清除设置
                if (window.XiaoxinWeChatDataHandler && window.XiaoxinWeChatDataHandler.setSettings) {
                    window.XiaoxinWeChatDataHandler.setSettings({
                        chatBackground: null,
                        chatBackgroundScale: 100
                    });
                }

                // 触发聊天页面刷新
                if (window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent("xiaoxin-wechat-chat-background-changed"));
                }

                if (typeof toastr !== "undefined") {
                    toastr.success("聊天背景已重置", "小馨手机");
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
                // 保存设置
                if (window.XiaoxinWeChatDataHandler && window.XiaoxinWeChatDataHandler.setSettings) {
                    window.XiaoxinWeChatDataHandler.setSettings({
                        chatBackground: selectedImageUrl,
                        chatBackgroundScale: currentScaleValue
                    });
                }

                // 触发聊天页面刷新
                if (window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent("xiaoxin-wechat-chat-background-changed"));
                }

                if (typeof toastr !== "undefined") {
                    toastr.success("聊天背景已更新", "小馨手机");
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
        renderSettingsPage: renderSettingsPage,
    };
})();

