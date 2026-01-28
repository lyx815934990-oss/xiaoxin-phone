// 微信红包UI模块
window.XiaoxinWeChatRedPacketUI = (function () {
    /**
     * 转义HTML函数
     * @param {string} text - 要转义的文本
     * @returns {string} 转义后的文本
     */
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

    /**
     * 渲染发红包页面
     * @param {jQuery} $container - 容器元素
     * @param {Object} options - 选项
     * @param {string} options.userId - 接收红包的用户ID
     * @param {Function} options.onBack - 返回回调
     */
    function renderSendRedPacketPage($container, options) {
        options = options || {};
        var userId = options.userId || "";
        var onBack = options.onBack || function () {};

        // 清空容器
        $container.empty();

        // 创建发红包页面容器
        var $page = $('<div class="xiaoxin-wechat-redpacket-page"></div>');

        // 创建顶部标题栏（和微信主页一样，不留状态栏空隙）
        var $header = $('<div class="xiaoxin-wechat-redpacket-header"></div>');
        var $headerBar = $(
            '<div class="xiaoxin-wechat-redpacket-header-bar"></div>'
        );

        // 返回按钮（深灰色）
        var $headerLeft = $(
            '<div class="xiaoxin-wechat-redpacket-header-left"></div>'
        );
        var $backBtn = $('<div class="xiaoxin-wechat-redpacket-back">‹</div>');
        $backBtn.on("click", function () {
            // 关闭键盘
            hideKeyboard();
            if (typeof onBack === "function") {
                onBack();
            }
        });
        $headerLeft.append($backBtn);

        // 标题
        var $headerTitle = $(
            '<div class="xiaoxin-wechat-redpacket-header-title">发红包</div>'
        );

        // 右侧三个点（横向排列，深灰色）
        var $headerRight = $(
            '<div class="xiaoxin-wechat-redpacket-header-right"></div>'
        );
        var $moreBtn = $('<div class="xiaoxin-wechat-redpacket-more"></div>');
        // 三个点横向排列
        for (var i = 0; i < 3; i++) {
            var $dot = $('<span class="xiaoxin-wechat-redpacket-dot">•</span>');
            $moreBtn.append($dot);
        }
        // 添加点击事件，跳转到"收到的红包"页面
        $moreBtn.on("click", function() {
            // 关闭键盘（如果打开）
            hideKeyboard();
            // 跳转到红包汇总页面
            renderRedPacketSummaryPage($container, {
                onBack: function() {
                    // 返回时重新渲染发红包页面
                    renderSendRedPacketPage($container, {
                        userId: userId,
                        onBack: onBack
                    });
                }
            });
        });
        $headerRight.append($moreBtn);

        $headerBar.append($headerLeft, $headerTitle, $headerRight);
        $header.append($headerBar);

        // 创建内容区域
        var $content = $(
            '<div class="xiaoxin-wechat-redpacket-content"></div>'
        );

        // 金额输入框容器
        var $amountContainer = $(
            '<div class="xiaoxin-wechat-redpacket-amount-container"></div>'
        );

        // 通知条（超出200时显示，悬浮在金额输入框上方）
        var $warningBanner = $(
            '<div class="xiaoxin-wechat-redpacket-warning-banner">单个红包金额不可超过200元</div>'
        );
        $warningBanner.hide();
        // 将警告条添加到页面容器，而不是金额容器
        $page.append($warningBanner);

        // 金额输入框
        var $amountRow = $(
            '<div class="xiaoxin-wechat-redpacket-input-row"></div>'
        );
        var $amountLabel = $(
            '<div class="xiaoxin-wechat-redpacket-label xiaoxin-wechat-redpacket-amount-label">金额</div>'
        );
        var $amountInput = $(
            '<input type="text" class="xiaoxin-wechat-redpacket-input xiaoxin-wechat-redpacket-amount-input" placeholder="¥0.00" value="¥0.00" readonly />'
        );
        // 禁用系统键盘
        $amountInput.attr("readonly", true);
        $amountInput.on("focus", function () {
            // 阻止系统键盘弹出
            $(this).blur();
            showKeyboard();
        });
        $amountRow.append($amountLabel, $amountInput);
        $amountContainer.append($amountRow);

        // 祝福语输入框
        var $greetingRow = $(
            '<div class="xiaoxin-wechat-redpacket-input-row"></div>'
        );
        var $greetingInput = $(
            '<input type="text" class="xiaoxin-wechat-redpacket-input xiaoxin-wechat-redpacket-greeting-input" placeholder="恭喜发财, 大吉大利" value="恭喜发财, 大吉大利" />'
        );
        var defaultValue = "恭喜发财, 大吉大利";
        // 初始化：添加默认值样式类
        $greetingInput.addClass("xiaoxin-wechat-redpacket-greeting-default");

        // 添加焦点事件：点击时如果是默认值，自动清空
        $greetingInput.on("focus", function () {
            if ($greetingInput.val() === defaultValue) {
                $greetingInput.val("");
                $greetingInput.removeClass(
                    "xiaoxin-wechat-redpacket-greeting-default"
                );
            }
        });
        // 添加输入事件：实时更新样式类
        $greetingInput.on("input", function () {
            var currentValue = $greetingInput.val();
            if (currentValue === defaultValue || currentValue.trim() === "") {
                $greetingInput.addClass(
                    "xiaoxin-wechat-redpacket-greeting-default"
                );
            } else {
                $greetingInput.removeClass(
                    "xiaoxin-wechat-redpacket-greeting-default"
                );
            }
        });
        // 添加失焦事件：如果为空，恢复默认值
        $greetingInput.on("blur", function () {
            if ($greetingInput.val().trim() === "") {
                $greetingInput.val(defaultValue);
                $greetingInput.addClass(
                    "xiaoxin-wechat-redpacket-greeting-default"
                );
            }
        });
        // 使用SVG图标替换emoji（加号+笑脸），或显示选中的表情包
        var $emojiBtn = $(
            '<div class="xiaoxin-wechat-redpacket-emoji-btn"></div>'
        );
        var $emojiSvg = $(
            '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                // 加号图标（左侧）
                '<path d="M6 12h4M8 10v4" stroke="#999" stroke-width="1.2" stroke-linecap="round"/>' +
                // 笑脸图标（右侧）
                '<circle cx="16" cy="12" r="4" stroke="#999" stroke-width="1.0" fill="none"/>' +
                '<circle cx="14.5" cy="11" r="0.9" fill="#999"/>' +
                '<circle cx="17.5" cy="11" r="0.9" fill="#999"/>' +
                '<path d="M14.5 13.5c0 0.8 0.67 1.5 1.5 1.5s1.5-0.7 1.5-1.5" stroke="#999" stroke-width="1.0" stroke-linecap="round" fill="none"/>' +
                "</svg>"
        );
        $emojiBtn.append($emojiSvg);

        // 选中的表情包（初始为空）
        var selectedSticker = null;
        var $greetingWrapper = $(
            '<div class="xiaoxin-wechat-redpacket-input-wrapper"></div>'
        );
        $greetingWrapper.append($greetingInput, $emojiBtn);
        $greetingRow.append($greetingWrapper);

        // 红包封面选择
        var $coverRow = $(
            '<div class="xiaoxin-wechat-redpacket-input-row"></div>'
        );
        var $coverLabel = $(
            '<div class="xiaoxin-wechat-redpacket-label">红包封面</div>'
        );
        var $coverSelect = $(
            '<div class="xiaoxin-wechat-redpacket-cover-select"></div>'
        );
        var $coverArrow = $(
            '<span class="xiaoxin-wechat-redpacket-arrow">›</span>'
        );
        $coverSelect.append($coverArrow);
        $coverRow.append($coverLabel, $coverSelect);

        // 总金额显示（¥符号和数字分开）
        var $totalAmount = $(
            '<div class="xiaoxin-wechat-redpacket-total"><span class="xiaoxin-wechat-redpacket-currency">¥</span><span class="xiaoxin-wechat-redpacket-amount">0.00</span></div>'
        );

        // 塞钱进红包按钮
        var $sendBtn = $(
            '<div class="xiaoxin-wechat-redpacket-send-btn">塞钱进红包</div>'
        );
        $sendBtn.on("click", function () {
            var amount = $amountInput.val().replace(/¥/g, "").replace(/,/g, "");
            var greeting = $greetingInput.val() || "恭喜发财, 大吉大利";

            var numAmount = parseFloat(amount) || 0;

            // 验证金额范围
            if (numAmount < 0.01) {
                if (typeof toastr !== "undefined") {
                    toastr.warning("红包金额不能少于0.01元", "小馨手机");
                }
                return;
            }

            if (numAmount > 200) {
                if (typeof toastr !== "undefined") {
                    toastr.warning("单个红包金额不可超过200元", "小馨手机");
                }
                return;
            }

            // 发送红包消息到输入框
            sendRedPacketMessage(numAmount, greeting, selectedSticker);

            // 关闭键盘
            hideKeyboard();

            // 返回聊天页面
            if (typeof onBack === "function") {
                onBack();
            }
        });

        // 发送红包消息到输入框
        function sendRedPacketMessage(amount, note, sticker) {
            try {
                // 使用角色ID和玩家ID
                // ⚠️ 玩家发送红包时，from 字段统一使用 \"user\"，避免暴露玩家微信号
                var fromId = "user";
                // 角色ID从联系方式数据块中获取
                var toId = userId || "";

                // 获取联系人信息，使用联系人的 id 作为角色ID
                if (userId && window.XiaoxinWeChatDataHandler) {
                    try {
                        var contact =
                            window.XiaoxinWeChatDataHandler.getContact(userId);
                        if (contact && contact.id) {
                            // 使用联系人的 id 作为角色ID（这是联系方式数据块中的唯一ID）
                            toId = String(contact.id);
                        } else {
                            // 如果没有联系人信息，使用 userId（可能是角色ID格式）
                            toId = String(userId);
                        }
                    } catch (e) {
                        toId = String(userId);
                    }
                } else {
                    toId = String(userId || "");
                }

                // 生成消息ID
                var msgId =
                    "wxid-" +
                    Date.now() +
                    "-" +
                    Math.random().toString(36).substr(2, 9);

                // 生成红包ID（用于后续领取时引用）
                var redpacketId =
                    "wxid-RedPacket" +
                    Date.now() +
                    "-" +
                    Math.random().toString(36).substr(2, 8);

                // 获取世界观时间
                var nowStr = "";
                var nowDate = new Date();
                if (
                    window.XiaoxinWorldClock &&
                    window.XiaoxinWorldClock.rawTime
                ) {
                    var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                    var normalizedTimeStr = rawTimeStr
                        .replace(/-/g, "/")
                        .replace(/年|月|日|星期[一二三四五六日]/g, " ");
                    var baseTime = Date.parse(normalizedTimeStr);
                    if (!isNaN(baseTime)) {
                        nowDate = new Date(baseTime + 60000);
                        // 格式化时间
                        var year = nowDate.getFullYear();
                        var month = String(nowDate.getMonth() + 1).padStart(
                            2,
                            "0"
                        );
                        var day = String(nowDate.getDate()).padStart(2, "0");
                        var hours = String(nowDate.getHours()).padStart(2, "0");
                        var minutes = String(nowDate.getMinutes()).padStart(
                            2,
                            "0"
                        );
                        var seconds = String(nowDate.getSeconds()).padStart(
                            2,
                            "0"
                        );
                        nowStr =
                            year +
                            "年" +
                            month +
                            "月" +
                            day +
                            "日 " +
                            hours +
                            ":" +
                            minutes +
                            ":" +
                            seconds;
                    } else {
                        nowStr = nowDate.toLocaleString("zh-CN");
                    }
                } else {
                    nowStr = nowDate.toLocaleString("zh-CN");
                }

                // 构建 [MSG] 数据块
                var packet =
                    "\n[MSG]\n" +
                    "id=" +
                    msgId +
                    "\n" +
                    "time=" +
                    nowStr +
                    "\n" +
                    "from=" +
                    String(fromId) +
                    "\n" +
                    "to=" +
                    String(toId) +
                    "\n" +
                    "type=redpacket\n" +
                    "redpacket_id=" +
                    redpacketId +
                    "\n" +
                    "amount=" +
                    amount.toFixed(2) +
                    "\n" +
                    "note=" +
                    note +
                    "\n";

                // 如果有表情包，添加sticker字段
                if (sticker && sticker.url) {
                    packet += "sticker=" + sticker.url + "\n";
                }

                packet += "[/MSG]";

                // 追加到输入框
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
                        "[小馨手机][微信红包] 未找到输入框，无法发送红包消息"
                    );
                    if (typeof toastr !== "undefined") {
                        toastr.error("未找到输入框，无法发送红包", "小馨手机");
                    }
                    return;
                }

                var currentText = tavernInput.value || "";
                if (currentText.trim()) currentText += "\n";
                currentText += packet;
                tavernInput.value = currentText;
                tavernInput.dispatchEvent(
                    new Event("input", { bubbles: true })
                );
                tavernInput.dispatchEvent(
                    new Event("change", { bubbles: true })
                );

                console.info(
                    "[小馨手机][微信红包] 红包消息已添加到输入框:",
                    packet
                );

                // 创建预览消息对象
                var msgObj = {
                    id: msgId,
                    type: "redpacket",
                    amount: amount,
                    note: note,
                    greeting: note,
                    timestamp: nowDate.getTime(),
                    rawTime: nowStr,
                    sender: fromId,
                    receiver: toId,
                    sticker: sticker ? sticker.url : null,
                };

                // 如果聊天页面已加载，将预览消息添加到 pendingMessages
                if (
                    window.XiaoxinWeChatChatUI &&
                    window.XiaoxinWeChatChatUI.addPendingMessage
                ) {
                    window.XiaoxinWeChatChatUI.addPendingMessage(msgObj);
                } else {
                    // 延迟尝试，等待聊天页面加载
                    setTimeout(function () {
                        if (
                            window.XiaoxinWeChatChatUI &&
                            window.XiaoxinWeChatChatUI.addPendingMessage
                        ) {
                            window.XiaoxinWeChatChatUI.addPendingMessage(
                                msgObj
                            );
                        }
                    }, 500);
                }

                if (typeof toastr !== "undefined") {
                    toastr.success("红包消息已添加到输入框", "小馨手机");
                }
            } catch (e) {
                console.error("[小馨手机][微信红包] 发送红包消息失败:", e);
                if (typeof toastr !== "undefined") {
                    toastr.error("发送红包消息失败", "小馨手机");
                }
            }
        }

        // 底部提示文字
        var $footer = $(
            '<div class="xiaoxin-wechat-redpacket-footer">未领取的红包, 将于24小时后发起退款</div>'
        );

        $content.append(
            $amountContainer,
            $greetingRow,
            $coverRow,
            $totalAmount,
            $sendBtn,
            $footer
        );

        $page.append($header, $content);
        $container.append($page);

        // ========== 数字键盘 ==========
        var $keyboard = $(
            '<div class="xiaoxin-wechat-redpacket-keyboard"></div>'
        );
        var $keyboardGrid = $(
            '<div class="xiaoxin-wechat-redpacket-keyboard-grid"></div>'
        );

        // 第一行：1, 2, 3, 删除键
        for (var i = 1; i <= 3; i++) {
            var $key = $(
                '<div class="xiaoxin-wechat-redpacket-keyboard-key">' +
                    i +
                    "</div>"
            );
            $key.on("click", function () {
                handleKeyInput($(this).text());
            });
            $keyboardGrid.append($key);
        }
        // 删除键（第一行右侧）
        var $deleteKey = $(
            '<div class="xiaoxin-wechat-redpacket-keyboard-key xiaoxin-wechat-redpacket-keyboard-delete">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                // 圆角矩形底图
                '<rect x="4" y="4" width="16" height="16" rx="3" fill="#666" />' +
                // X图标
                '<path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg>" +
                "</div>"
        );
        $deleteKey.on("click", function () {
            handleDelete();
        });
        $keyboardGrid.append($deleteKey);

        // 第二行：4, 5, 6, 确定键（开始跨行）
        for (var i = 4; i <= 6; i++) {
            var $key = $(
                '<div class="xiaoxin-wechat-redpacket-keyboard-key">' +
                    i +
                    "</div>"
            );
            $key.on("click", function () {
                handleKeyInput($(this).text());
            });
            $keyboardGrid.append($key);
        }
        // 确定按钮（红色，跨第2-4行）
        var $confirmKey = $(
            '<div class="xiaoxin-wechat-redpacket-keyboard-key xiaoxin-wechat-redpacket-keyboard-confirm">确定</div>'
        );
        $confirmKey.on("click", function () {
            hideKeyboard();
        });
        $keyboardGrid.append($confirmKey);

        // 第三行：7, 8, 9, 确定键（继续，不添加新元素）
        for (var i = 7; i <= 9; i++) {
            var $key = $(
                '<div class="xiaoxin-wechat-redpacket-keyboard-key">' +
                    i +
                    "</div>"
            );
            $key.on("click", function () {
                handleKeyInput($(this).text());
            });
            $keyboardGrid.append($key);
        }
        // 确定键继续（第三行，不添加新元素，CSS会处理跨行）

        // 第四行：小数点, 0, 空白, 确定键（继续）
        // 小数点键
        var $dotKey = $(
            '<div class="xiaoxin-wechat-redpacket-keyboard-key">.</div>'
        );
        $dotKey.on("click", function () {
            handleKeyInput(".");
        });
        $keyboardGrid.append($dotKey);

        // 0键
        var $zeroKey = $(
            '<div class="xiaoxin-wechat-redpacket-keyboard-key">0</div>'
        );
        $zeroKey.on("click", function () {
            handleKeyInput("0");
        });
        $keyboardGrid.append($zeroKey);

        // 空白键（占位）
        var $blankKey = $(
            '<div class="xiaoxin-wechat-redpacket-keyboard-key xiaoxin-wechat-redpacket-keyboard-blank"></div>'
        );
        $keyboardGrid.append($blankKey);
        // 确定键继续（第四行，不添加新元素，CSS会处理跨行）

        $keyboard.append($keyboardGrid);
        $page.append($keyboard);

        // ========== 表情包栏 ==========
        var $stickerBar = $(
            '<div class="xiaoxin-wechat-redpacket-sticker-bar"></div>'
        );
        var $stickerTabs = $(
            '<div class="xiaoxin-wechat-redpacket-sticker-tabs"></div>'
        );
        var $stickerContent = $(
            '<div class="xiaoxin-wechat-redpacket-sticker-content"></div>'
        );
        var $stickerGrid = $(
            '<div class="xiaoxin-wechat-redpacket-sticker-grid"></div>'
        );
        $stickerContent.append($stickerGrid);
        $stickerBar.append($stickerTabs, $stickerContent);
        $page.append($stickerBar);

        var isStickerExpanded = false;
        var currentStickerCategory = "default";

        // 初始化表情包分组（复用聊天页面的逻辑）
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
                console.warn("[小馨手机][微信红包] 加载表情包分组失败:", e);
            }

            var categories = [defaultCategory];
            savedCategories.forEach(function (savedCategory) {
                categories.push({
                    id: savedCategory.id,
                    name: savedCategory.name,
                    icon: savedCategory.icon,
                    getStickers: function () {
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
                                "[小馨手机][微信红包] 获取分组表情包失败:",
                                e
                            );
                        }
                        return [];
                    },
                });
            });

            return categories;
        }

        function getStickerCategories() {
            return initializeStickerCategories();
        }
        var stickerCategories = getStickerCategories();

        // 渲染分组标签栏
        function renderStickerTabs() {
            stickerCategories = getStickerCategories();
            $stickerTabs.empty();
            stickerCategories.forEach(function (category) {
                var $tab = $(
                    '<div class="xiaoxin-wechat-redpacket-sticker-tab" data-category="' +
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
                        .find(".xiaoxin-wechat-redpacket-sticker-tab")
                        .removeClass("active");
                    $tab.addClass("active");
                    renderStickerGrid();
                });
                $stickerTabs.append($tab);
            });
        }

        // 渲染表情包网格
        function renderStickerGrid() {
            $stickerGrid.empty();
            stickerCategories = getStickerCategories();
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
                // 检查是否是类似 /scripts/.../表情包/sticker_xxx 这样的无效路径
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
                            "[小馨手机][微信红包] 跳过无效的表情包路径:",
                            url
                        );
                        return;
                    }
                }

                var $cell = $(
                    '<div class="xiaoxin-wechat-redpacket-sticker-item">' +
                        '<img class="xiaoxin-wechat-redpacket-sticker-img" draggable="false" />' +
                        "</div>"
                );
                $cell.find("img").attr("src", url);
                $cell.on("click", function (e) {
                    e.stopPropagation();
                    // 选择表情包
                    selectedSticker = {
                        url: url,
                        description: description,
                    };
                    // 更新按钮显示
                    updateEmojiButton();
                    // 关闭表情包栏
                    toggleSticker();
                });
                $stickerGrid.append($cell);
            });
        }

        // 更新表情按钮显示
        function updateEmojiButton() {
            $emojiBtn.empty();
            if (selectedSticker && selectedSticker.url) {
                // 显示选中的表情包
                var $stickerImg = $(
                    '<img class="xiaoxin-wechat-redpacket-emoji-selected" src="' +
                        selectedSticker.url +
                        '" />'
                );
                $emojiBtn.append($stickerImg);
            } else {
                // 显示默认SVG图标
                $emojiBtn.append($emojiSvg.clone());
            }
        }

        // 切换表情包栏
        function toggleSticker() {
            isStickerExpanded = !isStickerExpanded;
            if (isStickerExpanded) {
                // 关闭键盘
                hideKeyboard();
                // 渲染表情包
                renderStickerTabs();
                renderStickerGrid();
                $stickerBar.addClass("show");
                $page.addClass("sticker-open");
            } else {
                $stickerBar.removeClass("show");
                $page.removeClass("sticker-open");
            }
        }

        // 初始化：渲染表情包栏（但不显示）
        renderStickerTabs();
        renderStickerGrid();

        // 表情按钮点击事件
        $emojiBtn.on("click", function (e) {
            e.stopPropagation();
            toggleSticker();
        });

        // 点击页面其他地方时关闭表情包栏
        $page.on("click", function (e) {
            if (
                !$(e.target).closest(
                    ".xiaoxin-wechat-redpacket-sticker-bar, .xiaoxin-wechat-redpacket-emoji-btn"
                ).length
            ) {
                if (isStickerExpanded) {
                    toggleSticker();
                }
            }
        });

        // 阻止表情包栏点击事件冒泡
        $stickerBar.on("click", function (e) {
            e.stopPropagation();
        });

        // 当前输入的数字字符串（不含¥符号）
        var currentInput = "";

        // 处理键盘输入
        function handleKeyInput(key) {
            var value = currentInput;

            // 如果输入小数点
            if (key === ".") {
                // 如果已经有小数点，不允许再输入
                if (value.indexOf(".") !== -1) {
                    return;
                }
                // 如果为空，添加0.
                if (value === "") {
                    value = "0.";
                } else {
                    value += ".";
                }
            } else {
                // 输入数字
                value += key;

                // 限制小数点后最多2位
                var dotIndex = value.indexOf(".");
                if (dotIndex !== -1) {
                    var decimalPart = value.substring(dotIndex + 1);
                    if (decimalPart.length > 2) {
                        return; // 超过2位小数，不处理
                    }
                }

                // 允许输入超过200的数字，但会在显示时提示
                // 不阻止输入，让用户可以输入任何数字
            }

            currentInput = value;
            updateAmountDisplay();
        }

        // 处理删除
        function handleDelete() {
            if (currentInput.length > 0) {
                currentInput = currentInput.substring(
                    0,
                    currentInput.length - 1
                );
                updateAmountDisplay();
            }
        }

        // 更新金额显示
        function updateAmountDisplay() {
            var numValue = parseFloat(currentInput) || 0;

            // 格式化显示
            if (currentInput === "" || currentInput === "0" || numValue === 0) {
                $amountInput.val("¥0.00");
                $totalAmount
                    .find(".xiaoxin-wechat-redpacket-amount")
                    .text("0.00");
            } else {
                // 保留最多2位小数
                var formatted = numValue.toFixed(2);
                $amountInput.val("¥" + formatted);
                $totalAmount
                    .find(".xiaoxin-wechat-redpacket-amount")
                    .text(formatted);
            }

            // 检查是否超过200
            if (numValue > 200) {
                $warningBanner.show();
                // 动态计算警告条位置，显示在金额输入框上方
                updateWarningBannerPosition();
                $amountInput.addClass("xiaoxin-wechat-redpacket-amount-error");
                $amountLabel.addClass("xiaoxin-wechat-redpacket-amount-error");
                // 总金额显示保持默认黑色，不添加错误类
            } else {
                $warningBanner.hide();
                $amountInput.removeClass(
                    "xiaoxin-wechat-redpacket-amount-error"
                );
                $amountLabel.removeClass(
                    "xiaoxin-wechat-redpacket-amount-error"
                );
            }
        }

        // 更新警告条位置
        function updateWarningBannerPosition() {
            if ($warningBanner.is(":visible")) {
                var $header = $page.find(".xiaoxin-wechat-redpacket-header");
                if ($header.length) {
                    var headerHeight = $header.outerHeight() || 44; // 默认44px
                    var topPosition = headerHeight + 4; // 标题栏高度 + 4px间距（减小间距）
                    $warningBanner.css("top", topPosition + "px");
                } else {
                    // 如果没有标题栏，定位在金额输入框上方
                    var $amountRow = $amountInput.closest(
                        ".xiaoxin-wechat-redpacket-input-row"
                    );
                    if ($amountRow.length) {
                        var amountRowOffset = $amountRow.offset();
                        var pageOffset = $page.offset();
                        if (amountRowOffset && pageOffset) {
                            var topPosition =
                                amountRowOffset.top -
                                pageOffset.top -
                                $warningBanner.outerHeight() -
                                8; // 8px间距
                            $warningBanner.css("top", topPosition + "px");
                        }
                    }
                }
            }
        }

        // 显示键盘
        function showKeyboard() {
            // 关闭表情包栏
            if (isStickerExpanded) {
                toggleSticker();
            }
            $keyboard.addClass("show");
            $page.addClass("keyboard-open");
        }

        // 隐藏键盘
        function hideKeyboard() {
            $keyboard.removeClass("show");
            $page.removeClass("keyboard-open");
        }

        // 点击金额输入框时显示键盘
        $amountInput.on("click", function () {
            showKeyboard();
        });

        // 点击页面其他地方时隐藏键盘
        $page.on("click", function (e) {
            if (
                !$(e.target).closest(
                    ".xiaoxin-wechat-redpacket-keyboard, .xiaoxin-wechat-redpacket-amount-input"
                ).length
            ) {
                hideKeyboard();
            }
        });

        // 窗口大小改变或滚动时更新警告条位置
        $(window).on("resize scroll", function () {
            if ($warningBanner.is(":visible")) {
                updateWarningBannerPosition();
            }
        });

        // 内容区域滚动时也更新位置
        $content.on("scroll", function () {
            if ($warningBanner.is(":visible")) {
                updateWarningBannerPosition();
            }
        });
    }

    /**
     * 渲染红包详情页面
     * @param {jQuery} $container - 容器元素
     * @param {Object} options - 选项
     * @param {Object} options.message - 红包消息对象
     * @param {Object} options.contact - 发送者联系人信息
     * @param {Function} options.onBack - 返回回调
     */
    function renderRedPacketDetailPage($container, options) {
        options = options || {};
        var message = options.message || {};
        var contact = options.contact || {};
        var onBack = options.onBack || function () {};

        // 清空容器
        $container.empty();
        // 确保容器无padding和margin，铺满整个区域
        $container.css({
            padding: "0",
            margin: "0",
            "padding-top": "0",
            "margin-top": "0",
            width: "100%",
            height: "100%",
            overflow: "hidden",
        });

        // 创建红包详情页面容器
        var $page = $(
            '<div class="xiaoxin-wechat-redpacket-detail-page"></div>'
        );

        // 创建顶部红色圆弧区域
        var $redArc = $(
            '<div class="xiaoxin-wechat-redpacket-detail-red-arc"></div>'
        );

        // 创建顶部标题栏（在红色圆弧内）
        var $header = $(
            '<div class="xiaoxin-wechat-redpacket-detail-header"></div>'
        );
        var $headerBar = $(
            '<div class="xiaoxin-wechat-redpacket-detail-header-bar"></div>'
        );

        // 返回按钮（白色）
        var $headerLeft = $(
            '<div class="xiaoxin-wechat-redpacket-detail-header-left"></div>'
        );
        var $backBtn = $(
            '<div class="xiaoxin-wechat-redpacket-detail-back">‹</div>'
        );
        $backBtn.on("click", function () {
            if (typeof onBack === "function") {
                onBack();
            }
        });
        $headerLeft.append($backBtn);

        // 右侧三个点（横向排列，白色）
        var $headerRight = $(
            '<div class="xiaoxin-wechat-redpacket-detail-header-right"></div>'
        );
        var $moreBtn = $(
            '<div class="xiaoxin-wechat-redpacket-detail-more"></div>'
        );
        // 三个点横向排列
        for (var i = 0; i < 3; i++) {
            var $dot = $(
                '<span class="xiaoxin-wechat-redpacket-detail-dot">•</span>'
            );
            $moreBtn.append($dot);
        }
        // 添加点击事件，跳转到汇总页面
        $moreBtn.on("click", function() {
            renderRedPacketSummaryPage($container, {
                onBack: onBack
            });
        });
        $headerRight.append($moreBtn);

        $headerBar.append($headerLeft, $headerRight);
        $header.append($headerBar);
        $redArc.append($header);

        // 创建内容区域
        var $content = $(
            '<div class="xiaoxin-wechat-redpacket-detail-content"></div>'
        );

        // 获取发送者信息（如果contact为空，根据message.from查找）
        var senderContact = contact;
        var senderName = "未知用户";
        var senderAvatar = "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";

        // 如果contact为空或没有信息，尝试根据message.from或message.sender查找
        var senderId = message.from || message.sender || "";

        // 玩家发送红包时：from=user（不暴露微信号），在详情页显示“我发出的红包”，并隐藏“已存入零钱...”提示
        var isPlayerSender = false;
        try {
            var currentAccountForSender = window.XiaoxinWeChatAccount
                ? window.XiaoxinWeChatAccount.getCurrentAccount()
                : null;
            var senderIdStr = String(senderId || "").trim();
            var accountIdStr = currentAccountForSender
                ? String(currentAccountForSender.id || "").trim()
                : "";
            var accountWechatIdStr = currentAccountForSender
                ? String(currentAccountForSender.wechatId || "").trim()
                : "";
            isPlayerSender =
                senderIdStr === "user" ||
                senderIdStr === "player" ||
                senderIdStr === "0" ||
                (accountIdStr && senderIdStr === accountIdStr) ||
                (accountWechatIdStr && senderIdStr === accountWechatIdStr);

            if (isPlayerSender && currentAccountForSender) {
                senderName =
                    currentAccountForSender.nickname ||
                    currentAccountForSender.name ||
                    "我";
                if (currentAccountForSender.avatar) {
                    senderAvatar = currentAccountForSender.avatar;
                }
            } else if (isPlayerSender) {
                senderName = "我";
            }
        } catch (e) {}
        if (
            !isPlayerSender &&
            (!senderContact || !senderContact.remark) &&
            senderId &&
            window.XiaoxinWeChatDataHandler
        ) {
            try {
                var allContacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
                senderId = String(senderId || "").trim();

                senderContact = allContacts.find(function (c) {
                    var cWechatId = String(c.wechatId || "").trim();
                    var cWechatId2 = String(c.wechat_id || "").trim();
                    var cId = String(c.id || "").trim();
                    var cCharId = String(c.characterId || "").trim();
                    var cIdWithoutPrefix = cId.replace(/^contact_/, "");
                    var senderIdWithoutPrefix = senderId.replace(/^contact_/, "");

                    return (
                        cWechatId === senderId ||
                        cWechatId2 === senderId ||
                        cId === senderId ||
                        cId === "contact_" + senderId ||
                        senderId === "contact_" + cId ||
                        cCharId === senderId ||
                        cIdWithoutPrefix === senderIdWithoutPrefix ||
                        cIdWithoutPrefix === senderId ||
                        senderIdWithoutPrefix === cIdWithoutPrefix
                    );
                });
            } catch (e) {
                console.warn("[小馨手机][微信红包] 查找发送者信息失败:", e);
            }
        }

        // 获取发送者名称和头像
        if (!isPlayerSender && senderContact) {
            senderName = senderContact.remark || senderContact.note || senderContact.nickname || senderContact.name || "未知用户";
            if (senderContact.avatar) {
                senderAvatar = senderContact.avatar;
            }
        } else {
            // 如果没找到联系人，尝试使用消息中的senderName
            if (!isPlayerSender && message.senderName) {
                senderName = message.senderName;
            }
        }

        // 发送者信息
        var $senderInfo = $(
            '<div class="xiaoxin-wechat-redpacket-detail-sender-info"></div>'
        );
        var $senderAvatar = $(
            '<img class="xiaoxin-wechat-redpacket-detail-sender-avatar" src="' +
                escapeHtml(senderAvatar) +
                '">'
        );
        var $senderName = $(
            '<div class="xiaoxin-wechat-redpacket-detail-sender-name"></div>'
        );
        $senderName.text(senderName + "发出的红包");
        $senderInfo.append($senderAvatar, $senderName);

        // 红包备注
        var note = message.note || message.greeting || "恭喜发财, 大吉大利";
        var $note = $(
            '<div class="xiaoxin-wechat-redpacket-detail-note">' +
                escapeHtml(note) +
                "</div>"
        );

        // 表情包（如果有）
        var $sticker = null;
        if (message.sticker) {
            $sticker = $(
                '<img class="xiaoxin-wechat-redpacket-detail-sticker" src="' +
                    escapeHtml(message.sticker) +
                    '">'
            );
        }

        // 红包金额（大号显示）
        var amount = message.amount || 0;
        var $amountDisplay = $(
            '<div class="xiaoxin-wechat-redpacket-detail-amount-display">' +
                '<span class="xiaoxin-wechat-redpacket-detail-amount-number">' +
                amount.toFixed(2) +
                '</span>' +
                '<span class="xiaoxin-wechat-redpacket-detail-amount-unit">元</span>' +
                '</div>'
        );

        // 已存入零钱提示：玩家自己发的红包不显示
        var $savedNotice = null;
        if (!isPlayerSender) {
            $savedNotice = $(
                '<div class="xiaoxin-wechat-redpacket-detail-saved-notice">已存入零钱, 可直接消费 ></div>'
            );
        }

        // 领取者信息（如果红包已领取）
        var $claimerInfo = null;
        var isClaimed = message.claimed === true || message.status === "claimed" || message.claimed_by !== undefined;
        if (isClaimed) {
            // 获取领取者信息
            var claimerContact = null;
            var claimerName = "未知用户";
            var claimerAvatar = "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
            var claimTime = message.claimed_time || message.timestamp || Date.now();

            // 先检查是否是玩家领取的
            var isPlayerClaimer = false;
            var currentAccount = null;
            if (window.XiaoxinWeChatAccount) {
                currentAccount = window.XiaoxinWeChatAccount.getCurrentAccount();
            }

            var playerWechatId = "player";
            if (currentAccount) {
                // 优先使用账号的 id 字段（微信注册时保存的微信ID）
                playerWechatId = String(currentAccount.id || currentAccount.wechatId || "player").trim();
            }

            var claimedById = String(message.claimed_by || "").trim();

            // 判断是否是玩家领取的（优先匹配 id 字段）
            if (claimedById && playerWechatId) {
                var accountId = currentAccount ? String(currentAccount.id || "").trim() : "";
                var accountWechatId = currentAccount ? String(currentAccount.wechatId || "").trim() : "";

                isPlayerClaimer = (
                    claimedById === playerWechatId ||
                    claimedById === "0" ||
                    claimedById === "player" ||
                    (accountId && claimedById === accountId) ||
                    (accountWechatId && claimedById === accountWechatId)
                );
            }

            // 调试日志
            console.info("[小馨手机][微信红包] 查找领取者信息:", {
                claimed_by: message.claimed_by,
                playerWechatId: playerWechatId,
                isPlayerClaimer: isPlayerClaimer,
                message_id: message.id
            });

            // 如果是玩家领取的，直接使用玩家账号信息
            if (isPlayerClaimer && currentAccount) {
                claimerName = currentAccount.nickname || currentAccount.name || "我";
                if (currentAccount.avatar) {
                    claimerAvatar = currentAccount.avatar;
                }
                console.info("[小馨手机][微信红包] 领取者是玩家:", claimerName);
            } else if (window.XiaoxinWeChatDataHandler) {
                // 如果不是玩家，从联系人列表中查找
                try {
                    var allContacts = window.XiaoxinWeChatDataHandler.getContacts() || [];

                    // 如果没有claimed_by，尝试从其他字段获取
                    if (!claimedById && message.claimerName) {
                        // 如果已经有claimerName，尝试通过名称查找
                        claimerName = message.claimerName;
                    }

                    if (claimedById) {
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
                    }

                    // 如果找到了联系人
                    if (claimerContact) {
                        claimerName = claimerContact.remark || claimerContact.note || claimerContact.nickname || claimerContact.name || "未知用户";
                        if (claimerContact.avatar) {
                            claimerAvatar = claimerContact.avatar;
                        }
                        console.info("[小馨手机][微信红包] 找到领取者:", claimerName);
                    } else {
                        // 如果没找到，尝试使用消息中的claimerName
                        if (message.claimerName) {
                            claimerName = message.claimerName;
                        }
                        console.warn("[小馨手机][微信红包] 未找到领取者联系人, claimed_by:", claimedById);
                    }
                } catch (e) {
                    console.warn("[小馨手机][微信红包] 获取领取者信息失败:", e);
                }
            } else {
                // 如果没有DataHandler，尝试使用消息中的claimerName
                if (message.claimerName) {
                    claimerName = message.claimerName;
                }
            }

            // 格式化领取时间
            var formattedClaimTime = formatClaimTime(claimTime);

            // 获取领取金额（如果是群红包，可能每个人领取的金额不同）
            var claimAmount = message.claim_amount || message.amount || 0;

            // 创建领取者信息容器
            $claimerInfo = $(
                '<div class="xiaoxin-wechat-redpacket-detail-claimer-info"></div>'
        );
            var $claimerAvatar = $(
                '<img class="xiaoxin-wechat-redpacket-detail-claimer-avatar" src="' +
                    escapeHtml(claimerAvatar) +
                    '">'
            );

            // 左侧信息容器（头像 + 名称和时间）
            var $claimerLeft = $(
                '<div class="xiaoxin-wechat-redpacket-detail-claimer-left"></div>'
            );
            var $claimerName = $(
                '<div class="xiaoxin-wechat-redpacket-detail-claimer-name">' +
                    escapeHtml(claimerName) +
                    '</div>'
            );
            var $claimerTime = $(
                '<div class="xiaoxin-wechat-redpacket-detail-claimer-time">' +
                    escapeHtml(formattedClaimTime) +
                    '</div>'
            );
            $claimerLeft.append($claimerName, $claimerTime);

            // 右侧金额显示
            var $claimerAmount = $(
                '<div class="xiaoxin-wechat-redpacket-detail-claimer-amount">' +
                    claimAmount.toFixed(2) +
                    '元</div>'
            );

            $claimerInfo.append($claimerAvatar, $claimerLeft, $claimerAmount);
        }

        // 组装内容
        $content.append($senderInfo);
        $content.append($note);
        if ($sticker) {
            $content.append($sticker);
        }
        $content.append($amountDisplay);
        if ($savedNotice) {
            $content.append($savedNotice);
        }
        // 金额与领取者信息之间的分割线（仅在存在领取者信息时显示）
        if ($claimerInfo) {
            $content.append(
                $('<div class="xiaoxin-wechat-redpacket-detail-divider"></div>')
            );
        }
        if ($claimerInfo) {
            $content.append($claimerInfo);
        }

        $page.append($redArc, $content);
        $container.append($page);

        // 格式化领取时间
        function formatClaimTime(claimTime) {
            try {
                // 获取当前世界观时间
                var now = new Date();
                if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.rawTime) {
                    var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                    var normalizedTimeStr = rawTimeStr
                        .replace(/-/g, "/")
                        .replace(/年|月|日|星期[一二三四五六日]/g, " ");
                    var baseTime = Date.parse(normalizedTimeStr);
                    if (!isNaN(baseTime)) {
                        now = new Date(baseTime);
                    }
                }

                // 解析领取时间
                var claimDate = new Date(claimTime);
                if (isNaN(claimDate.getTime())) {
                    // 如果无法解析，尝试其他格式
                    claimDate = new Date(parseInt(claimTime));
                }

                if (isNaN(claimDate.getTime())) {
                    return "";
                }

                // 计算时间差（毫秒）
                var timeDiff = now.getTime() - claimDate.getTime();
                var hoursDiff = timeDiff / (1000 * 60 * 60);
                var daysDiff = timeDiff / (1000 * 60 * 60 * 24);

                // 获取年份
                var claimYear = claimDate.getFullYear();
                var nowYear = now.getFullYear();

                // 格式化时间
                var hours = String(claimDate.getHours()).padStart(2, "0");
                var minutes = String(claimDate.getMinutes()).padStart(2, "0");
                var month = String(claimDate.getMonth() + 1).padStart(2, "0");
                var day = String(claimDate.getDate()).padStart(2, "0");

                // 判断显示格式
                if (hoursDiff < 24) {
                    // 24小时内：只显示时分
                    return hours + ":" + minutes;
                } else if (claimYear === nowYear) {
                    // 超过24小时但在同一年：显示月日时分
                    return month + "月" + day + "日 " + hours + ":" + minutes;
                } else {
                    // 超过一年或跨年：显示年月日时分
                    var year = claimDate.getFullYear();
                    return year + "年" + month + "月" + day + "日 " + hours + ":" + minutes;
                }
            } catch (e) {
                console.warn("[小馨手机][微信红包] 格式化领取时间失败:", e);
                return "";
            }
        }
    }

    /**
     * 渲染红包汇总页面
     * @param {jQuery} $container - 容器元素
     * @param {Object} options - 选项
     * @param {Function} options.onBack - 返回回调
     */
    function renderRedPacketSummaryPage($container, options) {
        options = options || {};
        var onBack = options.onBack || function () {};

        // 清空容器
        $container.empty();
        $container.css({
            padding: "0",
            margin: "0",
            "padding-top": "0",
            "margin-top": "0",
            width: "100%",
            height: "100%",
            overflow: "hidden",
        });

        // 创建汇总页面容器
        var $page = $(
            '<div class="xiaoxin-wechat-redpacket-summary-page"></div>'
        );

        // 创建顶部标题栏
        var $header = $(
            '<div class="xiaoxin-wechat-redpacket-summary-header"></div>'
        );
        var $headerBar = $(
            '<div class="xiaoxin-wechat-redpacket-summary-header-bar"></div>'
        );

        // 返回按钮
        var $headerLeft = $(
            '<div class="xiaoxin-wechat-redpacket-summary-header-left"></div>'
        );
        var $backBtn = $(
            '<div class="xiaoxin-wechat-redpacket-summary-back">×</div>'
        );
        $backBtn.on("click", function () {
            if (typeof onBack === "function") {
                onBack();
            }
        });
        $headerLeft.append($backBtn);

        // 标题
        var $headerTitle = $(
            '<div class="xiaoxin-wechat-redpacket-summary-header-title">收到的红包</div>'
        );

        // 右侧三个点按钮
        var $headerRight = $(
            '<div class="xiaoxin-wechat-redpacket-summary-header-right"></div>'
        );
        var $moreBtn = $(
            '<div class="xiaoxin-wechat-redpacket-summary-more"></div>'
        );
        // 三个点横向排列
        for (var i = 0; i < 3; i++) {
            var $dot = $(
                '<span class="xiaoxin-wechat-redpacket-summary-dot">•</span>'
            );
            $moreBtn.append($dot);
        }
        $headerRight.append($moreBtn);
        $headerBar.append($headerLeft, $headerTitle, $headerRight);
        $header.append($headerBar);

        // 获取当前世界观年份
        var currentYear = new Date().getFullYear();
        if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.rawTime) {
            try {
                var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                var yearMatch = rawTimeStr.match(/(\d{4})年/);
                if (yearMatch) {
                    currentYear = parseInt(yearMatch[1]);
                }
            } catch (e) {
                console.warn("[小馨手机][微信红包] 获取世界观年份失败:", e);
            }
        }

        // 创建内容区域
        var $content = $(
            '<div class="xiaoxin-wechat-redpacket-summary-content"></div>'
        );

        // 年份选择显示在内容区域右上角
        var $yearSelect = $(
            '<div class="xiaoxin-wechat-redpacket-summary-year-select">' +
                currentYear + '年<span class="xiaoxin-wechat-redpacket-summary-year-arrow">▼</span>' +
                '</div>'
        );

        // 使用事件委托，将事件绑定在内容容器上，这样即使元素被重新添加，事件仍然有效
        var selectedYear = currentYear;
        // 保存原始的世界观年份（最大年份），用于年份选择器生成列表
        var worldClockMaxYear = currentYear;

        var yearSelectClickHandler = function(e) {
            e.preventDefault();
            e.stopPropagation();
            var $clickedYearSelect = $(this);

            // 每次打开年份选择器时，重新获取世界观年份作为最大年份
            var maxYear = new Date().getFullYear();
            if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.rawTime) {
                try {
                    var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                    var yearMatch = rawTimeStr.match(/(\d{4})年/);
                    if (yearMatch) {
                        maxYear = parseInt(yearMatch[1]);
                    }
                } catch (e) {
                    console.warn("[小馨手机][微信红包] 获取世界观年份失败:", e);
                    // 如果获取失败，使用保存的最大年份
                    maxYear = worldClockMaxYear;
                }
            } else {
                // 如果世界观时钟不存在，使用保存的最大年份
                maxYear = worldClockMaxYear;
            }

            // 使用保存的选择年份作为当前选中年份，但使用世界观年份作为最大年份生成列表
            console.info("[小馨手机][微信红包] 点击年份选择，当前选中年份:", selectedYear, "最大年份:", maxYear);
            showYearPicker(maxYear, selectedYear, function(year) {
                selectedYear = year;
                currentYear = year;
                console.info("[小馨手机][微信红包] 选择的年份:", year);
                $clickedYearSelect.html(year + '年<span class="xiaoxin-wechat-redpacket-summary-year-arrow">▼</span>');
                // 重新加载该年份的数据
                loadSummaryData($content, year);
            });
        };
        $content.on("click", ".xiaoxin-wechat-redpacket-summary-year-select", yearSelectClickHandler);
        console.info("[小馨手机][微信红包] 年份选择器事件委托已绑定");

        // 将年份选择添加到内容区域
        $content.append($yearSelect);

        // 加载汇总数据
        loadSummaryData($content, currentYear);

        $page.append($header, $content);
        $container.append($page);
    }

    /**
     * 加载汇总数据
     * @param {jQuery} $content - 内容容器
     * @param {number} year - 年份
     */
    function loadSummaryData($content, year) {
        // 使用 detach() 保存年份选择元素，这样即使重新添加，事件委托仍然有效
        var $yearSelect = $content.find(".xiaoxin-wechat-redpacket-summary-year-select").first();
        var yearSelectDetached = null;

        if ($yearSelect.length > 0) {
            // 使用 detach() 而不是直接移除，这样可以保留 DOM 结构
            yearSelectDetached = $yearSelect.detach();
        }

        $content.empty();

        // 如果存在年份选择，重新添加（使用 detach 的元素）
        if (yearSelectDetached && yearSelectDetached.length > 0) {
            $content.append(yearSelectDetached);
        }

        // 获取当前玩家信息
        var currentAccount = null;
        if (window.XiaoxinWeChatAccount) {
            currentAccount = window.XiaoxinWeChatAccount.getCurrentAccount();
        }

        var playerWechatId = "player";
        var playerName = "我";
        var playerAvatar = "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";

        if (currentAccount) {
            // 优先使用账号的 id 字段（微信注册时保存的微信ID）
            playerWechatId = String(currentAccount.id || currentAccount.wechatId || "player").trim();
            playerName = currentAccount.nickname || currentAccount.name || "我";
            if (currentAccount.avatar) {
                playerAvatar = currentAccount.avatar;
            }
        }

        // 先尝试从持久化存储中读取数据
        var allRedPackets = [];
        var useCachedData = false;

        if (window.XiaoxinWeChatDataHandler && playerWechatId && playerWechatId !== "player") {
            try {
                var cachedData = window.XiaoxinWeChatDataHandler.getRedpacketSummary(playerWechatId, year);
                if (cachedData && cachedData.length > 0) {
                    console.info(
                        "[小馨手机][微信红包汇总] 从持久化存储读取数据:",
                        "年份:",
                        year,
                        "红包数量:",
                        cachedData.length
                    );

                    // 将简化的数据转换回完整格式（用于显示）
                    var allContacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
                    cachedData.forEach(function(item) {
                        // 查找发送者联系人
                        var senderContact = null;
                        var senderId = String(item.senderId || "").trim();

                        for (var k = 0; k < allContacts.length; k++) {
                            var c = allContacts[k];
                            var cWechatId = String(c.wechatId || "").trim();
                            var cId = String(c.id || "").trim();
                            var cCharId = String(c.characterId || "").trim();

                            if (cWechatId === senderId || cId === senderId || cCharId === senderId ||
                                cId === "contact_" + senderId || senderId === "contact_" + cId) {
                                senderContact = c;
                                break;
                            }
                        }

                        // 如果发送者名称已保存，使用保存的名称；否则使用联系人的名称
                        if (!senderContact && item.senderName) {
                            senderContact = {
                                remark: item.senderName,
                                nickname: item.senderName,
                                name: item.senderName
                            };
                        }

                        allRedPackets.push({
                            message: {
                                id: item.messageId,
                                redpacket_id: item.redpacketId,
                                from: item.senderId,
                                sender: item.senderId,
                                amount: item.amount,
                                claim_amount: item.claimAmount,
                                claimed: true,
                                claimed_by: playerWechatId,
                                claimed_time: item.claimTime,
                                timestamp: item.claimTime
                            },
                            senderContact: senderContact,
                            claimTime: item.claimTime
                        });
                    });

                    useCachedData = true;
                }
            } catch (e) {
                console.warn("[小馨手机][微信红包汇总] 读取持久化数据失败:", e);
            }
        }

        // 如果没有缓存数据或需要重新计算，从聊天记录中加载
        if (!useCachedData && window.XiaoxinWeChatDataHandler) {
            try {
                var allContacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
                var allChats = window.XiaoxinWeChatDataHandler.getAllChats() || {};

                // 遍历所有聊天（getAllChats 返回的是对象，key 是 userId）
                var chatUserIds = Object.keys(allChats);
                console.info(
                    "[小馨手机][微信红包汇总] 开始加载数据:",
                    "年份:",
                    year,
                    "聊天数量:",
                    chatUserIds.length,
                    "playerWechatId:",
                    playerWechatId
                );

                for (var i = 0; i < chatUserIds.length; i++) {
                    var chatUserId = chatUserIds[i];
                    var messages = allChats[chatUserId] || [];

                    console.info(
                        "[小馨手机][微信红包汇总] 检查聊天:",
                        "chatUserId:",
                        chatUserId,
                        "消息数量:",
                        messages.length
                    );

                    // 查找玩家收到的红包消息（claimed_by 是玩家）
                    for (var j = 0; j < messages.length; j++) {
                        var msg = messages[j];
                        if (msg.type === "redpacket" && msg.claimed === true) {
                            // 检查是否是玩家领取的红包（支持多种ID格式匹配）
                            var claimedById = String(msg.claimed_by || "").trim();
                            var isPlayerClaimed = false;

                            // 调试日志
                            console.info(
                                "[小馨手机][微信红包汇总] 检查红包消息:",
                                "msg.id:",
                                msg.id,
                                "claimed_by:",
                                claimedById,
                                "playerWechatId:",
                                playerWechatId,
                                "currentAccount.id:",
                                currentAccount ? currentAccount.id : "无账号"
                            );

                            // 如果 claimed_by 是 "player" 或 "0"，直接认为是玩家领取的
                            if (claimedById === "player" || claimedById === "0") {
                                isPlayerClaimed = true;
                                console.info("[小馨手机][微信红包汇总] 匹配成功：claimed_by 是 'player' 或 '0'");
                            }
                            // 直接匹配玩家ID（优先使用账号的 id 字段）
                            else if (claimedById === playerWechatId) {
                                isPlayerClaimed = true;
                                console.info("[小馨手机][微信红包汇总] 匹配成功：claimed_by 等于 playerWechatId");
                            }
                            // 尝试匹配账号的所有ID格式（优先使用 id 字段）
                            else if (currentAccount) {
                                // 优先使用账号的 id 字段（微信注册时保存的微信ID）
                                var accountId = String(currentAccount.id || "").trim();
                                var accountWechatId = String(currentAccount.wechatId || "").trim();

                                // 优先匹配 id 字段
                                if (claimedById === accountId || accountId === claimedById) {
                                    isPlayerClaimed = true;
                                    console.info("[小馨手机][微信红包汇总] 匹配成功：claimed_by 等于 accountId:", accountId);
                                }
                                // 其次匹配 wechatId 字段
                                else if (claimedById === accountWechatId || accountWechatId === claimedById) {
                                    isPlayerClaimed = true;
                                    console.info("[小馨手机][微信红包汇总] 匹配成功：claimed_by 等于 accountWechatId:", accountWechatId);
                                }

                                // 支持 contact_ 前缀匹配（优先匹配 id）
                                var claimedByIdWithoutPrefix = claimedById.replace(/^contact_/, "");
                                var playerWechatIdWithoutPrefix = playerWechatId.replace(/^contact_/, "");
                                var accountIdWithoutPrefix = accountId.replace(/^contact_/, "");

                                if (claimedByIdWithoutPrefix === playerWechatIdWithoutPrefix ||
                                    claimedByIdWithoutPrefix === accountIdWithoutPrefix) {
                                    isPlayerClaimed = true;
                                    console.info("[小馨手机][微信红包汇总] 匹配成功：去除前缀后匹配");
                                }
                            }

                            if (!isPlayerClaimed) {
                                console.warn(
                                    "[小馨手机][微信红包汇总] 匹配失败，跳过此红包:",
                                    "claimed_by:",
                                    claimedById,
                                    "playerWechatId:",
                                    playerWechatId
                                );
                                continue;
                            }

                            console.info("[小馨手机][微信红包汇总] 匹配成功，添加红包到汇总列表");

                            // 检查年份
                            var claimTime = msg.claimed_time || msg.timestamp || Date.now();
                            var claimDate = new Date(claimTime);
                            if (claimDate.getFullYear() === year) {
                                // 获取发送者信息
                                var senderContact = null;
                                var senderId = String(msg.from || msg.sender || "").trim();

                                for (var k = 0; k < allContacts.length; k++) {
                                    var c = allContacts[k];
                                    var cWechatId = String(c.wechatId || "").trim();
                                    var cId = String(c.id || "").trim();
                                    var cCharId = String(c.characterId || "").trim();

                                    if (cWechatId === senderId || cId === senderId || cCharId === senderId ||
                                        cId === "contact_" + senderId || senderId === "contact_" + cId) {
                                        senderContact = c;
                                        break;
                                    }
                                }

                                allRedPackets.push({
                                    message: msg,
                                    senderContact: senderContact,
                                    claimTime: claimTime
                                });
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("[小馨手机][微信红包] 获取红包汇总数据失败:", e);
            }
        }

        // 按时间倒序排序
        allRedPackets.sort(function(a, b) {
            return (b.claimTime || 0) - (a.claimTime || 0);
        });

        console.info(
            "[小馨手机][微信红包汇总] 数据加载完成:",
            "找到红包数量:",
            allRedPackets.length,
            "年份:",
            year
        );

        // 保存红包汇总数据到持久化存储（按微信ID和年份）
        // 只有在重新计算数据时才保存（不是从缓存读取的）
        if (!useCachedData && window.XiaoxinWeChatDataHandler && playerWechatId && playerWechatId !== "player") {
            try {
                window.XiaoxinWeChatDataHandler.saveRedpacketSummary(
                    playerWechatId,
                    year,
                    allRedPackets
                );
            } catch (e) {
                console.warn("[小馨手机][微信红包汇总] 保存数据失败:", e);
            }
        }

        // 计算总金额和统计
        var totalAmount = 0;
        var bestLuckCount = 0; // 手气最佳数量（暂时设为0，后续群红包功能实现后再计算）

        for (var i = 0; i < allRedPackets.length; i++) {
            // 优先使用 claim_amount（实际领取金额），如果没有则使用 amount（红包总金额）
            totalAmount += (allRedPackets[i].message.claim_amount || allRedPackets[i].message.amount || 0);
        }

        // 玩家信息区域
        var $playerInfo = $(
            '<div class="xiaoxin-wechat-redpacket-summary-player-info"></div>'
        );
        var $playerAvatar = $(
            '<img class="xiaoxin-wechat-redpacket-summary-player-avatar" src="' +
                escapeHtml(playerAvatar) +
                '">'
        );
        var $playerText = $(
            '<div class="xiaoxin-wechat-redpacket-summary-player-text">' +
                escapeHtml(playerName) + '共收到</div>'
        );
        $playerInfo.append($playerAvatar, $playerText);

        // 总金额显示
        var $totalAmount = $(
            '<div class="xiaoxin-wechat-redpacket-summary-total-amount">' +
                totalAmount.toFixed(2) +
                '</div>'
        );

        // 统计信息
        var $stats = $(
            '<div class="xiaoxin-wechat-redpacket-summary-stats"></div>'
        );
        var $statLeft = $(
            '<div class="xiaoxin-wechat-redpacket-summary-stat-item">' +
                '<div class="xiaoxin-wechat-redpacket-summary-stat-number">' + allRedPackets.length + '</div>' +
                '<div class="xiaoxin-wechat-redpacket-summary-stat-label">收到红包</div>' +
                '</div>'
        );
        var $statRight = $(
            '<div class="xiaoxin-wechat-redpacket-summary-stat-item">' +
                '<div class="xiaoxin-wechat-redpacket-summary-stat-number">' + bestLuckCount + '</div>' +
                '<div class="xiaoxin-wechat-redpacket-summary-stat-label">手气最佳</div>' +
                '</div>'
        );
        $stats.append($statLeft, $statRight);

        // 分隔线
        var $divider = $(
            '<div class="xiaoxin-wechat-redpacket-summary-divider"></div>'
        );

        // 红包列表
        var $list = $(
            '<div class="xiaoxin-wechat-redpacket-summary-list"></div>'
        );

        // 添加红包记录
        for (var i = 0; i < allRedPackets.length; i++) {
            var item = allRedPackets[i];
            var msg = item.message;
            var senderContact = item.senderContact;
            var claimTime = item.claimTime;

            var senderName = "未知用户";
            if (senderContact) {
                senderName = senderContact.remark || senderContact.note || senderContact.nickname || senderContact.name || "未知用户";
            } else if (msg.senderName) {
                senderName = msg.senderName;
            }

            // 格式化时间（只显示月日或年月日，不显示时分）
            var formattedTime = formatClaimTimeForSummary(claimTime);

            var $listItem = $(
                '<div class="xiaoxin-wechat-redpacket-summary-list-item"></div>'
            );
            var $itemLeft = $(
                '<div class="xiaoxin-wechat-redpacket-summary-item-left"></div>'
            );
            var $itemName = $(
                '<div class="xiaoxin-wechat-redpacket-summary-item-name">' +
                    escapeHtml(senderName) +
                    '</div>'
            );
            var $itemTime = $(
                '<div class="xiaoxin-wechat-redpacket-summary-item-time">' +
                    escapeHtml(formattedTime) +
                    '</div>'
            );
            $itemLeft.append($itemName, $itemTime);

            var $itemAmount = $(
                '<div class="xiaoxin-wechat-redpacket-summary-item-amount">' +
                    (msg.claim_amount || msg.amount || 0).toFixed(2) + '元</div>'
            );

            $listItem.append($itemLeft, $itemAmount);
            $list.append($listItem);
        }

        // 添加内容（年份选择已经存在，不需要重复添加）
        $content.append($playerInfo, $totalAmount, $stats, $divider, $list);

        // 确保年份选择在最前面（保证它在右上角显示）
        var $yearSelectInContent = $content.find(".xiaoxin-wechat-redpacket-summary-year-select").first();
        if ($yearSelectInContent.length > 0) {
            $yearSelectInContent.prependTo($content);
            console.info("[小馨手机][微信红包] 年份选择器已重新添加到内容区域");
        } else {
            console.warn("[小馨手机][微信红包] 警告：年份选择器未找到");
        }
    }

    /**
     * 格式化时间（用于汇总页面，只显示月日或年月日）
     * @param {number} claimTime - 领取时间戳
     * @returns {string} 格式化后的时间字符串
     */
    function formatClaimTimeForSummary(claimTime) {
        try {
            var claimDate = new Date(claimTime);
            if (isNaN(claimDate.getTime())) {
                claimDate = new Date(parseInt(claimTime));
            }

            if (isNaN(claimDate.getTime())) {
                return "";
            }

            var now = new Date();
            if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.rawTime) {
                try {
                    var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                    var normalizedTimeStr = rawTimeStr
                        .replace(/-/g, "/")
                        .replace(/年|月|日|星期[一二三四五六日]/g, " ");
                    var baseTime = Date.parse(normalizedTimeStr);
                    if (!isNaN(baseTime)) {
                        now = new Date(baseTime);
                    }
                } catch (e) {
                    // 忽略错误
                }
            }

            var claimYear = claimDate.getFullYear();
            var nowYear = now.getFullYear();
            var month = String(claimDate.getMonth() + 1).padStart(2, "0");
            var day = String(claimDate.getDate()).padStart(2, "0");

            if (claimYear === nowYear) {
                // 同一年：显示月日
                return month + "月" + day + "日";
            } else {
                // 不同年：显示年月日
                return claimYear + "年" + month + "月" + day + "日";
            }
        } catch (e) {
            console.warn("[小馨手机][微信红包] 格式化汇总时间失败:", e);
            return "";
        }
    }

    /**
     * 显示年份选择器
     * @param {number} maxYear - 最大年份（世界观年份）
     * @param {number} selectedYear - 当前选中的年份
     * @param {Function} onSelect - 选择回调
     */
    function showYearPicker(maxYear, selectedYear, onSelect) {
        // 如果已经存在选择器，先移除
        $(".xiaoxin-wechat-redpacket-year-picker-overlay").remove();

        console.info("[小馨手机][微信红包] 显示年份选择器, 最大年份:", maxYear, "选中年份:", selectedYear);

        // 创建遮罩层
        var $overlay = $(
            '<div class="xiaoxin-wechat-redpacket-year-picker-overlay"></div>'
        );

        // 创建选择器容器
        var $picker = $(
            '<div class="xiaoxin-wechat-redpacket-year-picker"></div>'
        );

        // 标题栏
        var $header = $(
            '<div class="xiaoxin-wechat-redpacket-year-picker-header"></div>'
        );
        var $cancelBtn = $(
            '<div class="xiaoxin-wechat-redpacket-year-picker-cancel">取消</div>'
        );
        $cancelBtn.on("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            $overlay.remove();
        });
        var $doneBtn = $(
            '<div class="xiaoxin-wechat-redpacket-year-picker-done">完成</div>'
        );
        $header.append($cancelBtn, $doneBtn);

        // 年份列表
        var $list = $(
            '<div class="xiaoxin-wechat-redpacket-year-picker-list"></div>'
        );

        // 生成年份列表（从最大年份往前10年）
        // selectedYear 初始值为传入的选中年份
        var currentSelectedYear = selectedYear || maxYear;
        for (var year = maxYear; year >= maxYear - 10; year--) {
            var $yearItem = $(
                '<div class="xiaoxin-wechat-redpacket-year-picker-item' +
                    (year === currentSelectedYear ? ' active' : '') +
                    '">' + year + '</div>'
            );
            $yearItem.on("click", function(e) {
                e.preventDefault();
                e.stopPropagation();
                var year = parseInt($(this).text());
                currentSelectedYear = year;
                $list.find(".xiaoxin-wechat-redpacket-year-picker-item").removeClass("active");
                $(this).addClass("active");
            });
            $list.append($yearItem);
        }

        $doneBtn.on("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.info("[小馨手机][微信红包] 选择年份:", currentSelectedYear);
            if (typeof onSelect === "function") {
                onSelect(currentSelectedYear);
            }
            $overlay.remove();
        });

        $picker.append($header, $list);
        $overlay.append($picker);

        // 添加到页面（优先添加到手机屏幕容器）
        var $phoneScreen = $(".xiaoxin-phone-screen");
        if ($phoneScreen.length === 0) {
            $phoneScreen = $(".xiaoxin-wechat-chat-screen");
        }
        if ($phoneScreen.length === 0) {
            $phoneScreen = $("body");
        }
        $phoneScreen.append($overlay);

        console.info("[小馨手机][微信红包] 年份选择器已添加到页面");

        // 点击遮罩关闭
        $overlay.on("click", function(e) {
            if ($(e.target).hasClass("xiaoxin-wechat-redpacket-year-picker-overlay")) {
                $overlay.remove();
            }
        });

        // 阻止选择器内部点击事件冒泡
        $picker.on("click", function(e) {
            e.stopPropagation();
        });
    }

    return {
        renderSendRedPacketPage: renderSendRedPacketPage,
        renderRedPacketDetailPage: renderRedPacketDetailPage,
        renderRedPacketSummaryPage: renderRedPacketSummaryPage,
    };
})();
