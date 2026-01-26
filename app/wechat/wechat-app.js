// 微信应用 - JavaScript

window.XiaoxinWeChatApp = (function () {
    // ========== 存储键 ==========
    var STORAGE_KEY_LAST_OPEN = "xiaoxin_wechat_last_open_ts_v1";
    var STORAGE_KEY_ACCOUNT = "xiaoxin_wechat_account_v1";

    // 开场动画阈值：1小时
    var ONE_HOUR_MS = 60 * 60 * 1000;

    function _now() {
        return Date.now();
    }

    // ========== 将文本插入到酒馆输入框 ==========
    function _insertTextToTavernInput(text) {
        try {
            // 尝试多种可能的输入框选择器
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

                // 触发input事件，确保酒馆能够识别内容变化
                $input.trigger("input");
                $input.trigger("change");

                // 聚焦到输入框
                $input.focus();

                // 移动光标到末尾
                if ($input[0].setSelectionRange) {
                    var length = newValue.length;
                    $input[0].setSelectionRange(length, length);
                }

                console.info("[小馨手机][微信] 已插入文本到酒馆输入框:", text);

                // 监听输入框变化，检测指令是否被发送
                _setupInputMonitor($input, text);

                return true;
            } else {
                console.warn(
                    "[小馨手机][微信] 未找到酒馆输入框，尝试使用剪贴板"
                );
                // 如果找不到输入框，尝试使用剪贴板
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(
                        function () {
                            console.info(
                                "[小馨手机][微信] 已复制文本到剪贴板，请手动粘贴到输入框"
                            );
                            if (typeof toastr !== "undefined") {
                                toastr.info(
                                    "已复制到剪贴板，请粘贴到输入框",
                                    "小馨手机"
                                );
                            }
                        },
                        function (err) {
                            console.error(
                                "[小馨手机][微信] 复制到剪贴板失败:",
                                err
                            );
                        }
                    );
                }
                return false;
            }
        } catch (e) {
            console.error("[小馨手机][微信] 插入文本到酒馆输入框失败:", e);
            return false;
        }
    }

    // ========== 监听输入框变化，检测指令是否被发送 ==========
    var _inputMonitorTimeout = null;
    var _lastInputValue = "";
    function _setupInputMonitor($input, insertedText) {
        // 清除旧的监听器
        if (_inputMonitorTimeout) {
            clearTimeout(_inputMonitorTimeout);
        }

        // 记录插入的文本和当前输入框内容
        _lastInputValue = $input.val() || "";
        var checkText = insertedText.trim();

        // 监听输入框变化
        var checkInterval = setInterval(function () {
            var currentValue = $input.val() || "";

            // 如果输入框内容变化了（可能是被发送或删除）
            if (currentValue !== _lastInputValue) {
                _lastInputValue = currentValue;

                // 检查插入的文本是否还在输入框中
                var textStillExists = currentValue.indexOf(checkText) !== -1;

                if (!textStillExists) {
                    // 文本已不在输入框中，可能是被发送或删除
                    // 不要立即清除预览，等待正式朋友圈生成
                    // 定期检查会处理清除逻辑

                    // 停止监听
                    clearInterval(checkInterval);
                    _inputMonitorTimeout = null;
                }
            }
        }, 500); // 每500ms检查一次

        // 30秒后自动停止监听（避免无限监听）
        setTimeout(function () {
            clearInterval(checkInterval);
            _inputMonitorTimeout = null;
        }, 30000);

        _inputMonitorTimeout = checkInterval;
    }

    // ========== 检查并清除预览朋友圈 ==========
    function _checkAndClearPreviewMoments() {
        if (
            !_previewMoments ||
            _previewMoments.length === 0 ||
            !window.XiaoxinWeChatDataHandler
        ) {
            return;
        }

        var allMoments = window.XiaoxinWeChatDataHandler.getMoments() || [];
        var account = _getAccount();
        var playerWechatId = null;
        var playerId = null;
        if (account) {
            playerWechatId = account.wechatId || account.id || "player";
            playerId = account.id || "player";
        }

        var previewToRemove = [];
        _previewMoments.forEach(function (previewMoment) {
            var found = allMoments.some(function (moment) {
                if (moment.isPreview) {
                    return false;
                }

                if (
                    moment.id === previewMoment.id ||
                    moment._id === previewMoment.id
                ) {
                    return true;
                }

                var momentAuthorId =
                    moment.authorId || moment.userId || moment.author;
                var isPlayerMoment = false;

                if (momentAuthorId) {
                    var momentAuthorIdStr = String(momentAuthorId).trim().toLowerCase();
                    // 优先检查是否为 "user"（推荐格式）或 "player"（兼容旧格式）
                    if (momentAuthorIdStr === "user" || momentAuthorIdStr === "player") {
                        isPlayerMoment = true;
                    }
                }

                if (!isPlayerMoment && momentAuthorId && playerWechatId) {
                    var momentAuthorIdStr = String(momentAuthorId).trim();
                    var playerWechatIdStr = String(playerWechatId).trim();
                    isPlayerMoment =
                        momentAuthorIdStr === playerWechatIdStr ||
                        momentAuthorIdStr === "contact_" + playerWechatIdStr ||
                        "contact_" + momentAuthorIdStr === playerWechatIdStr ||
                        momentAuthorIdStr.replace(/^contact_/, "") ===
                            playerWechatIdStr.replace(/^contact_/, "");
                }

                if (!isPlayerMoment && momentAuthorId && playerId) {
                    var momentAuthorIdStr = String(momentAuthorId).trim();
                    var playerIdStr = String(playerId).trim();
                    isPlayerMoment =
                        momentAuthorIdStr === playerIdStr ||
                        momentAuthorIdStr === "contact_" + playerIdStr ||
                        "contact_" + momentAuthorIdStr === playerIdStr ||
                        momentAuthorIdStr.replace(/^contact_/, "") ===
                            playerIdStr.replace(/^contact_/, "");
                }

                if (isPlayerMoment) {
                    var previewContent = (previewMoment.content || "").trim();
                    var momentContent = (moment.content || "").trim();

                    if (
                        previewContent === momentContent ||
                        (previewContent === "" && momentContent === "")
                    ) {
                        return true;
                    }

                    if (
                        previewMoment.images &&
                        previewMoment.images.length > 0
                    ) {
                        if (
                            moment.images &&
                            moment.images.length > 0 &&
                            previewContent === momentContent
                        ) {
                            return true;
                        }
                    }
                }

                return false;
            });

            if (found) {
                previewToRemove.push(previewMoment.id);
            }
        });

        if (previewToRemove.length > 0) {
            _previewMoments = _previewMoments.filter(function (m) {
                return previewToRemove.indexOf(m.id) === -1;
            });
            console.info(
                "[小馨手机][微信] 立即检查：已清除预览朋友圈数量:",
                previewToRemove.length
            );

            // 如果当前正在显示朋友圈页面，立即刷新页面
            if (
                _currentPage === "moments" &&
                _currentRoot &&
                _currentMobilePhone
            ) {
                _renderMomentsPage(_currentRoot, _currentMobilePhone);
            }
        }
    }

    // ========== 开场动画：时间判断 ==========
    function _getLastOpenTs() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY_LAST_OPEN);
            var ts = raw ? parseInt(raw, 10) : 0;
            return Number.isFinite(ts) ? ts : 0;
        } catch (e) {
            console.warn("[小馨手机][微信] 读取上次打开时间失败:", e);
            return 0;
        }
    }

    // ========== 统一更新“发现”tab 红点（依赖朋友圈未读数） ==========
    function _ensureDiscoverRedDot($tabBar) {
        if (!$tabBar || !$tabBar.length) return null;
        var $discoverTab = $tabBar.find('.xiaoxin-wechat-tab[data-tab="discover"]');
        if (!$discoverTab.length) return null;
        var $icon = $discoverTab.find(".xiaoxin-wechat-tab-icon");
        if (!$icon.length) return null;
        var $dot = $discoverTab.data("redDot");
        if (!$dot || !$dot.length) {
            $dot = $(
                '<div class="xiaoxin-wechat-tab-red-dot" style="display:none;"></div>'
            );
            $icon.css("position", "relative");
            $icon.append($dot);
            $discoverTab.data("redDot", $dot);
        }
        return $discoverTab;
    }

    function _updateDiscoverTabBadge($tabBar) {
        var $discoverTab = _ensureDiscoverRedDot($tabBar);
        if (!$discoverTab) return;

        if (
            !window.XiaoxinWeChatDataHandler ||
            typeof window.XiaoxinWeChatDataHandler.getMomentsUnreadCount !==
                "function"
        ) {
            return;
        }
        var unread = window.XiaoxinWeChatDataHandler.getMomentsUnreadCount() || 0;
        var $dot = $discoverTab.data("redDot");
        if ($dot && $dot.length) {
            if (unread > 0) {
                $dot.show();
            } else {
                $dot.hide();
            }
        }
    }

    function _setLastOpenTs(ts) {
        try {
            localStorage.setItem(STORAGE_KEY_LAST_OPEN, String(ts));
        } catch (e) {
            console.warn("[小馨手机][微信] 写入上次打开时间失败:", e);
        }
    }

    function _shouldShowSplash() {
        var last = _getLastOpenTs();
        var now = _now();
        if (!last) {
            console.info("[小馨手机][微信] 首次打开微信：展示开场动画");
            return true;
        }
        var diff = now - last;
        console.info(
            "[小馨手机][微信] 距离上次打开微信(ms):",
            diff,
            "(阈值:",
            ONE_HOUR_MS,
            ")"
        );
        return diff >= ONE_HOUR_MS;
    }

    // ========== 开场动画：DOM + 播放 ==========
    function _createSplash($container) {
        var $overlay = $(
            '<div class="xiaoxin-wechat-splash" aria-hidden="true"></div>'
        );
        var $img = $('<img class="xiaoxin-wechat-splash-img" alt="" />');
        $img.attr(
            "src",
            "/scripts/extensions/third-party/xiaoxin-phone/image/background/微信应用开场加载cg图.jpeg"
        );

        $img.on("error", function () {
            console.warn("[小馨手机][微信] 开场图加载失败:", this.src);
        });

        $overlay.append($img);
        $container.append($overlay);

        return $overlay;
    }

    function _playSplash($container) {
        var $splash = _createSplash($container);

        console.info("[小馨手机][微信] 开场动画开始（淡入2s/停留1s/淡出2s）");

        // 强制重排，确保初始 opacity 生效
        $splash[0].offsetHeight;

        // 触发淡入
        $splash.addClass("is-fade-in");

        setTimeout(function () {
            console.info("[小馨手机][微信] 开场动画：淡入完成，停留1s");
        }, 2000);

        setTimeout(function () {
            console.info("[小馨手机][微信] 开场动画：开始淡出2s");
            $splash.removeClass("is-fade-in");
            $splash.addClass("is-fade-out");
        }, 3000);

        setTimeout(function () {
            console.info("[小馨手机][微信] 开场动画结束，移除遮罩");
            $splash.remove();
        }, 5000);
    }

    // ========== 获取表情包路径（支持文件名和URL） ==========
    function _getEmojiPath(emojiNameOrUrlOrId) {
        // 首先检查是否是ID（在映射表中）
        if (
            emojiNameOrUrlOrId &&
            window.XiaoxinWeChatApp._stickerIdMap &&
            window.XiaoxinWeChatApp._stickerIdMap[emojiNameOrUrlOrId]
        ) {
            return window.XiaoxinWeChatApp._stickerIdMap[emojiNameOrUrlOrId];
        }

        // 然后判断是否是URL格式的表情包
        if (
            emojiNameOrUrlOrId &&
            (emojiNameOrUrlOrId.startsWith("http://") ||
                emojiNameOrUrlOrId.startsWith("https://") ||
                emojiNameOrUrlOrId.startsWith("data:image") ||
                (emojiNameOrUrlOrId.startsWith("/") &&
                    !emojiNameOrUrlOrId.startsWith("/scripts")))
        ) {
            // 是URL格式，直接使用
            return emojiNameOrUrlOrId;
        } else {
            // 是文件名格式，加上路径前缀
            return (
                "/scripts/extensions/third-party/xiaoxin-phone/image/表情包/" +
                emojiNameOrUrlOrId
            );
        }
    }

    // ========== 获取表情包列表 ==========
    // 缓存当前角色卡的表情包列表，在角色卡切换时清除
    var _cachedEmojiList = null;
    var _cachedCharacterId = null;

    function _getEmojiList() {
        // 获取当前角色卡ID
        var currentCharId = null;
        if (
            window.XiaoxinDataManager &&
            typeof window.XiaoxinDataManager.getCurrentCharacterId ===
                "function"
        ) {
            currentCharId = window.XiaoxinDataManager.getCurrentCharacterId();
        }

        // 如果角色卡ID变化了，清除缓存
        if (_cachedCharacterId !== currentCharId) {
            _cachedEmojiList = null;
            _cachedCharacterId = currentCharId;
            console.info(
                "[小馨手机][微信] 角色卡已切换，清除表情包列表缓存:",
                currentCharId
            );
        }

        // 如果缓存存在且角色卡ID未变化，直接返回缓存
        if (_cachedEmojiList && _cachedCharacterId === currentCharId) {
            return _cachedEmojiList;
        }

        // 默认表情包文件列表（可以从服务器获取，这里先硬编码）
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

        // 合并玩家上传的表情包（只包含当前角色卡的表情包）
        var allEmojiList = defaultEmojiList.slice(); // 复制默认列表

        // 创建一个ID到URL的映射表
        var stickerIdMap = {};

        try {
            if (
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.getAllStickers ===
                    "function"
            ) {
                // 获取当前角色卡的表情包（数据已按角色卡隔离）
                var userStickers =
                    window.XiaoxinWeChatDataHandler.getAllStickers() || [];
                console.info(
                    "[小馨手机][微信] 获取当前角色卡的表情包，角色卡ID:",
                    currentCharId,
                    "表情包数量:",
                    userStickers.length
                );
                userStickers.forEach(function (sticker) {
                    // 将玩家上传的表情包URL添加到列表
                    var url = sticker.url || sticker.src || sticker.path;
                    var id = sticker.id;
                    if (url) {
                        allEmojiList.push(url);
                        // 同时支持通过ID查找
                        if (id) {
                            stickerIdMap[id] = url;
                            // 也将ID添加到列表中，这样可以通过ID识别
                            allEmojiList.push(id);
                        }
                    }
                });
            }
        } catch (e) {
            console.warn("[小馨手机][微信] 获取玩家表情包失败:", e);
        }

        // 保存映射表供后续使用
        window.XiaoxinWeChatApp._stickerIdMap = stickerIdMap;

        // 缓存结果
        _cachedEmojiList = allEmojiList;
        _cachedCharacterId = currentCharId;

        return allEmojiList;
    }

    // ========== 生成表情包世界书内容 ==========
    function generateStickerWorldbook() {
        // 获取当前角色卡ID，确保只包含当前角色卡的表情包
        var currentCharId = null;
        if (
            window.XiaoxinDataManager &&
            typeof window.XiaoxinDataManager.getCurrentCharacterId ===
                "function"
        ) {
            currentCharId = window.XiaoxinDataManager.getCurrentCharacterId();
        }

        var stickers = [];
        try {
            if (
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.getAllStickers ===
                    "function"
            ) {
                // 获取当前角色卡的表情包（数据已按角色卡隔离）
                stickers =
                    window.XiaoxinWeChatDataHandler.getAllStickers() || [];
                console.info(
                    "[小馨手机][微信] 生成表情包世界书，角色卡ID:",
                    currentCharId,
                    "表情包数量:",
                    stickers.length
                );
            }
        } catch (e) {
            console.warn("[小馨手机][微信] 获取表情包列表失败:", e);
            return "暂无自定义表情包";
        }

        // 默认表情包文件列表（硬编码，与 _getEmojiList 保持一致）
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

        var content = "";

        if (stickers.length === 0) {
            // 没有自定义表情包时，只返回默认表情包列表
            content += "⚠️⚠️⚠️ 极其重要：当前角色卡没有自定义表情包，只能使用以下默认表情包文件名！⚠️⚠️⚠️\n\n";
            content += "以下是可用的默认表情包列表（必须使用完整的文件名，包括扩展名）：\n\n";
            defaultEmojiList.forEach(function (fileName, index) {
                content += (index + 1) + ". " + fileName + "\n";
            });
            content += "\n";
            content += "使用方法：\n";
            content += "- 在聊天消息中使用表情包时，必须使用上述列表中的完整文件名\n";
            content += "- 格式: type=emoji, content=文件名（例如：type=emoji, content=小熊跳舞（开心）.gif）\n";
            content += "- 示例: type=emoji, content=" + defaultEmojiList[0] + "\n";
            content += "\n";
            content += "⚠️⚠️⚠️ 极其重要的约束（违反将导致错误）：\n";
            content += "1. 只能使用上述列表中明确列出的默认表情包文件名\n";
            content += "2. 禁止使用任何不在上述列表中的表情包文件名或ID\n";
            content += "3. 文件名必须完全匹配，包括扩展名（.jpg 或 .gif）\n";
            content += "4. 禁止使用任何自定义表情包ID（因为当前角色卡没有自定义表情包）\n";
            return content;
        }

        // 有自定义表情包时，同时列出自定义表情包和默认表情包
        content += "以下是玩家在当前角色卡中上传的自定义表情包，你可以在聊天中使用：\n\n";
        content +=
            "⚠️⚠️⚠️ 极其重要：只能使用以下列表中的表情包ID或默认表情包文件名，严禁使用列表外的任何表情包！⚠️⚠️⚠️\n\n";
        content += "禁止使用以下表情包ID来源：\n";
        content += "- 其他角色卡的表情包ID\n";
        content += "- 之前对话中看到的表情包ID（如果不在当前列表中）\n";
        content += "- 示例中的表情包ID（如果不在当前列表中）\n";
        content += "- 任何猜测或记忆中的表情包ID（如果不在当前列表中）\n\n";

        stickers.forEach(function (sticker, index) {
            var stickerId = sticker.id || "sticker_" + index;
            var desc = sticker.description || "表情包";
            var url = sticker.url || sticker.src || sticker.path || "";

            // 判断是否是本地上传（base64）
            var isLocal = url && url.startsWith("data:image");

            content += index + 1 + ". 表情包ID: " + stickerId + "\n";
            content += "   描述: " + desc + "\n";
            if (isLocal) {
                content += "   类型: 本地上传的图片\n";
            } else if (url) {
                content += "   图片URL: " + url + "\n";
            }
            content += "\n";
        });

        content += "\n";
        content += "---\n\n";
        content += "以下是可用的默认表情包列表（也可以使用，文件名必须完全匹配，包括扩展名）：\n\n";
        defaultEmojiList.forEach(function (fileName, index) {
            content += (index + 1) + ". " + fileName + "\n";
        });
        content += "\n";
        content += "使用方法：\n";
        content += "- 在聊天消息中使用表情包时，可以使用上述自定义表情包ID或默认表情包文件名\n";
        content += "- 自定义表情包格式: type=emoji, content=表情包ID（例如：type=emoji, content=" + (stickers[0] ? stickers[0].id : "列表中的表情包ID") + "）\n";
        content += "- 默认表情包格式: type=emoji, content=文件名（例如：type=emoji, content=小熊跳舞（开心）.gif）\n";
        content += "\n";
        content += "⚠️ 重要：默认表情包和自定义表情包没有优先级\n";
        content += "- 默认表情包和自定义表情包同等重要，没有优先级区分\n";
        content +=
            "- 角色应该根据对话情境、角色情绪和表情包描述，从所有可用的表情包中选择最合适的\n";
        content += "- 如果自定义表情包更符合情境，使用自定义表情包ID\n";
        content +=
            "- 如果默认表情包更符合情境，使用默认表情包文件名（例如：小熊跳舞（开心）.gif）\n";
        content += "- 角色应该主动使用表情包来表达情绪和态度，不需要玩家强调\n";
        content += "\n";
        content += "⚠️⚠️⚠️ 极其重要的约束（违反将导致错误）：\n";
        content += "1. 只能使用上述列表中明确列出的自定义表情包ID或默认表情包文件名\n";
        content += "2. 禁止使用任何不在上述列表中的表情包ID或文件名，包括：\n";
        content += "   - 其他角色卡的表情包ID\n";
        content += "   - 之前对话中看到的表情包ID（如果不在当前列表中）\n";
        content += "   - 示例中的表情包ID（如果不在当前列表中）\n";
        content += "   - 任何猜测或记忆中的表情包ID或文件名（如果不在当前列表中）\n";
        content += "3. 自定义表情包必须使用ID，默认表情包必须使用完整文件名（包括扩展名）\n";
        content += "4. 文件名必须完全匹配，包括扩展名（.jpg 或 .gif）";

        return content;
    }

    // ========== 显示评论/回复输入对话框 ==========
    function _showCommentDialog(options, $root) {
        return new Promise(function (resolve, reject) {
            options = options || {};
            var title = options.title || "评论";
            var placeholder = options.placeholder || "请输入评论内容";
            var replyTo = options.replyTo || null;
            var replyContent = options.replyContent || null;
            // 回复对象显示名：优先微信备注，无备注则昵称
            // 兼容传入的是 id（如 "player"/"contact_1"/"1"）或已是昵称文本
            var replyToDisplayName = replyTo ? _getDisplayNameById(replyTo) : null;

            // 如果没有传入$root，尝试从全局获取
            if (!$root) {
                $root = $(".xiaoxin-wechat-root");
                if ($root.length === 0) {
                    $root = $("body");
                }
            }

            // 获取表情包列表
            var emojiList = _getEmojiList();

            // 创建对话框HTML
            var dialogHtml =
                '<div id="xiaoxin-comment-dialog" style="' +
                "position: absolute; top: 0; left: 0; width: 100%; height: 100%; " +
                "background: rgba(0,0,0,0.7); z-index: 10000; " +
                "display: flex; align-items: center; justify-content: center; " +
                'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;">' +
                '<div style="' +
                "background: #ffffff !important; padding: 24px; border-radius: 12px; " +
                "max-width: 500px; width: 90%; max-height: 80vh; " +
                'overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">' +
                '<h3 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 330; color: #000000 !important;">' +
                escapeHtml(title) +
                "</h3>";

            if (replyTo && replyContent) {
                dialogHtml +=
                    '<div style="' +
                    "background: #f5f5f5 !important; padding: 12px; border-radius: 6px; " +
                    'margin-bottom: 16px; font-size: 14px; color: #000000 !important;">' +
                    "回复 " +
                    escapeHtml(replyToDisplayName || replyTo) +
                    ' 的评论"' +
                    escapeHtml(replyContent) +
                    '"' +
                    "</div>";
            }

            dialogHtml +=
                '<div style="margin-bottom: 16px;">' +
                '<label style="display: block; margin-bottom: 8px; font-weight: 330; color: #000000 !important; font-size: 14px;">' +
                "文字内容：" +
                "</label>" +
                '<textarea id="xiaoxin-comment-text" placeholder="' +
                escapeHtml(placeholder) +
                '" style="' +
                "width: 100%; padding: 10px 12px; border: none !important; " +
                "border-radius: 6px; font-size: 14px; box-sizing: border-box; " +
                "min-height: 80px; resize: vertical; font-family: inherit; " +
                "background: #e0e0e0 !important; color: #999999 !important;" +
                '"></textarea>' +
                "</div>" +
                '<div style="margin-bottom: 16px;">' +
                '<label style="display: block; margin-bottom: 8px; font-weight: 330; color: #000000 !important; font-size: 14px;">' +
                "图片描述（可选，用|分隔多张图片）：" +
                "</label>" +
                '<textarea id="xiaoxin-comment-images" placeholder="例如：角色拍摄的照片描述1|角色从网上保存的照片描述2" style="' +
                "width: 100%; padding: 10px 12px; border: none !important; " +
                "border-radius: 6px; font-size: 14px; box-sizing: border-box; " +
                "min-height: 60px; resize: vertical; font-family: inherit; " +
                "background: #e0e0e0 !important; color: #999999 !important;" +
                '"></textarea>' +
                '<div style="font-size: 12px; color: #000000 !important; margin-top: 4px;">' +
                "提示：图片描述必须是角色自己拍摄的照片或从网上保存的照片的描述，系统会根据描述自动生成图片" +
                "</div>" +
                "</div>" +
                '<div style="margin-bottom: 16px;">' +
                '<label style="display: block; margin-bottom: 8px; font-weight: 330; color: #000000 !important; font-size: 14px;">' +
                "表情包（可选）：" +
                "</label>" +
                '<select id="xiaoxin-comment-emoji" style="' +
                "width: 100%; padding: 10px 12px; border: none !important; " +
                "border-radius: 6px; font-size: 14px; box-sizing: border-box; " +
                "font-family: inherit; background: #e0e0e0 !important; color: #000000 !important;" +
                '">' +
                '<option value="">不选择表情包</option>';

            emojiList.forEach(function (emoji) {
                dialogHtml +=
                    '<option value="' +
                    escapeHtml(emoji) +
                    '">' +
                    escapeHtml(emoji) +
                    "</option>";
            });

            dialogHtml +=
                "</select>" +
                '<div id="xiaoxin-comment-emoji-preview" style="' +
                "margin-top: 12px; text-align: center; min-height: 100px; " +
                "border: 1px dashed #ddd; border-radius: 6px; " +
                "display: flex; align-items: center; justify-content: center; " +
                "background: #f9f9f9 !important; padding: 12px;" +
                '">' +
                '<span style="color: #000000 !important; font-size: 14px;">选择表情包后显示预览</span>' +
                "</div>" +
                "</div>" +
                '<div style="margin-top: 24px; text-align: right; display: flex; gap: 10px; justify-content: flex-end;">' +
                '<button id="xiaoxin-comment-cancel" style="' +
                "padding: 10px 20px; background: #f0f0f0 !important; border: 1px solid #ddd !important; " +
                "border-radius: 6px; cursor: pointer; font-size: 14px; color: #000000 !important; " +
                'transition: background 0.2s;">取消</button>' +
                '<button id="xiaoxin-comment-confirm" style="' +
                "padding: 10px 20px; background: #07c160 !important; color: #ffffff !important; border: none !important; " +
                "border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 330; " +
                'transition: background 0.2s;">确认</button>' +
                "</div>" +
                "</div>" +
                "</div>";

            var $dialog = $(dialogHtml);
            $root.append($dialog);

            // 绑定表情包选择事件，显示预览
            $("#xiaoxin-comment-emoji").on("change", function () {
                var selectedEmoji = $(this).val();
                var $preview = $("#xiaoxin-comment-emoji-preview");

                if (selectedEmoji) {
                    var emojiPath = _getEmojiPath(selectedEmoji);
                    $preview.html(
                        '<img src="' +
                            emojiPath +
                            '" alt="' +
                            escapeHtml(selectedEmoji) +
                            '" style="max-width: 200px; max-height: 200px; border-radius: 4px;" onerror="this.parentElement.innerHTML=\'<span style=\\\'color: #f00; font-size: 14px;\\\'>表情包加载失败: ' +
                            escapeHtml(selectedEmoji) +
                            "</span>';\" />"
                    );
                } else {
                    $preview.html(
                        '<span style="color: #000000 !important; font-size: 14px;">选择表情包后显示预览</span>'
                    );
                }
            });

            // 绑定事件
            $("#xiaoxin-comment-confirm").on("click", function () {
                var text = $("#xiaoxin-comment-text").val().trim();
                var images = $("#xiaoxin-comment-images").val().trim();
                var emoji = $("#xiaoxin-comment-emoji").val();

                // 构建内容
                var contentParts = [];
                if (text) {
                    contentParts.push(text);
                }
                if (images) {
                    // 将多行图片描述用|连接
                    var imageDescs = images
                        .split("\n")
                        .map(function (line) {
                            return line.trim();
                        })
                        .filter(function (line) {
                            return line.length > 0;
                        });
                    contentParts = contentParts.concat(imageDescs);
                }
                if (emoji) {
                    contentParts.push(emoji);
                }

                if (contentParts.length === 0) {
                    if (typeof toastr !== "undefined") {
                        toastr.warning(
                            "请输入至少文字、图片描述或选择表情包",
                            "小馨手机"
                        );
                    } else {
                        alert("请输入至少文字、图片描述或选择表情包");
                    }
                    return;
                }

                var content = contentParts.join("|");
                $dialog.remove();
                resolve({
                    content: content,
                    text: text,
                    images: images,
                    emoji: emoji,
                });
            });

            $("#xiaoxin-comment-cancel").on("click", function () {
                $dialog.remove();
                reject(new Error("用户取消"));
            });

            // 点击背景关闭
            $dialog.on("click", function (e) {
                if (e.target.id === "xiaoxin-comment-dialog") {
                    $dialog.remove();
                    reject(new Error("用户取消"));
                }
            });

            // 按ESC键关闭
            $(document).on("keydown.xiaoxin-comment-dialog", function (e) {
                if (e.keyCode === 27) {
                    $dialog.remove();
                    $(document).off("keydown.xiaoxin-comment-dialog");
                    reject(new Error("用户取消"));
                }
            });

            // 自动聚焦到文字输入框
            setTimeout(function () {
                $("#xiaoxin-comment-text").focus();
            }, 100);
        });
    }

    // ========== 工具函数 ==========
    function _generateWeChatId() {
        // 使用新的账号管理模块
        if (window.XiaoxinWeChatAccount) {
            return window.XiaoxinWeChatAccount.generateWeChatId();
        }
        // 备用：自己生成
        var chars =
            "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var result = "wxid_";
        for (var i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // 工具函数：转义HTML，并清理 <br> 标签
    function escapeHtml(text) {
        if (!text) return "";
        // 先清理 <br> 标签和其他 HTML 标签
        var cleaned = String(text)
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/<[^>]+>/g, "")
            .trim();
        var div = document.createElement("div");
        div.textContent = cleaned;
        return div.innerHTML;
    }

    // ========== 头像选择器（带裁剪） ==========
    // $avatarElement: 头像元素
    // $root: 根容器
    // onConfirm: 可选的回调函数，当确认修改时调用，参数为新头像URL
    function _showAvatarPicker($avatarElement, $root, onConfirm) {
        console.info("[小馨手机][微信] 打开头像选择器");
        var DEFAULT_AVATAR =
            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
        var self = this;
        // currentAvatar 可能来自 data("avatar")（字符串）或 background-image 的 match（数组）
        var dataAvatar = $avatarElement.data("avatar");
        var bgMatch = $avatarElement
            .css("background-image")
            .match(/url\(["']?([^"']+)["']?\)/);
        var currentAvatar = dataAvatar
            ? String(dataAvatar)
            : bgMatch
              ? bgMatch[1]
              : "";
        // 兼容头像被存成了 url("...") 的情况
        currentAvatar = currentAvatar
            .replace(/^url\((['"]?)(.+?)\1\)$/i, "$2")
            .trim();
        currentAvatar = currentAvatar || DEFAULT_AVATAR;

        // 移除已有弹窗
        $root.find(".xiaoxin-wechat-avatar-picker-overlay").remove();

        var $overlay = $(
            '<div class="xiaoxin-wechat-avatar-picker-overlay"></div>'
        );
        var $picker = $('<div class="xiaoxin-wechat-avatar-picker"></div>');
        var $title = $(
            '<div class="xiaoxin-wechat-avatar-picker-title">选择头像</div>'
        );

        // URL输入
        var $rowUrl = $('<div class="xiaoxin-wechat-avatar-picker-row"></div>');
        $rowUrl.append(
            '<div class="xiaoxin-wechat-avatar-picker-label">头像 URL</div>'
        );
        var $urlControl = $(
            '<div class="xiaoxin-wechat-avatar-picker-control"></div>'
        );
        var $urlInput = $('<input type="url" placeholder="https://...">');
        $urlControl.append($urlInput);
        $rowUrl.append($urlControl);

        // 本地上传
        var $rowUpload = $(
            '<div class="xiaoxin-wechat-avatar-picker-row"></div>'
        );
        $rowUpload.append(
            '<div class="xiaoxin-wechat-avatar-picker-label">本地上传</div>'
        );
        var $uploadControl = $(
            '<div class="xiaoxin-wechat-avatar-picker-control"></div>'
        );
        var $fileInput = $(
            '<input type="file" accept="image/*" style="display:none;">'
        );
        var $uploadBtn = $(
            '<button class="xiaoxin-wechat-avatar-picker-button">选择图片</button>'
        );
        $uploadControl.append($uploadBtn, $fileInput);
        $rowUpload.append($uploadControl);

        // 预览和裁剪区域
        var $rowPreview = $(
            '<div class="xiaoxin-wechat-avatar-picker-row"></div>'
        );
        $rowPreview.append(
            '<div class="xiaoxin-wechat-avatar-picker-label">预览与裁剪</div>'
        );
        var $previewControl = $(
            '<div class="xiaoxin-wechat-avatar-picker-control"></div>'
        );
        var $previewWrap = $(
            '<div class="xiaoxin-wechat-avatar-picker-preview-wrap"></div>'
        );
        var $previewCanvas = $(
            '<canvas class="xiaoxin-wechat-avatar-picker-canvas"></canvas>'
        );
        var $previewImg = $(
            '<img class="xiaoxin-wechat-avatar-picker-img" style="display:none;" />'
        );
        $previewWrap.append($previewCanvas, $previewImg);
        $previewControl.append($previewWrap);
        $rowPreview.append($previewControl);

        // 裁剪控制
        var $rowCrop = $(
            '<div class="xiaoxin-wechat-avatar-picker-row"></div>'
        );
        $rowCrop.append(
            '<div class="xiaoxin-wechat-avatar-picker-label">调整</div>'
        );
        var $cropControl = $(
            '<div class="xiaoxin-wechat-avatar-picker-control"></div>'
        );
        var $scaleLabel = $(
            '<div class="xiaoxin-wechat-avatar-picker-subtext">缩放</div>'
        );
        var $scaleRange = $(
            '<input type="range" min="0.5" max="2" step="0.1" value="1" class="xiaoxin-wechat-avatar-picker-range">'
        );
        var $posXLabel = $(
            '<div class="xiaoxin-wechat-avatar-picker-subtext">左右</div>'
        );
        var $posXRange = $(
            '<input type="range" min="-50" max="50" step="1" value="0" class="xiaoxin-wechat-avatar-picker-range">'
        );
        var $posYLabel = $(
            '<div class="xiaoxin-wechat-avatar-picker-subtext">上下</div>'
        );
        var $posYRange = $(
            '<input type="range" min="-50" max="50" step="1" value="0" class="xiaoxin-wechat-avatar-picker-range">'
        );
        $cropControl.append(
            $scaleLabel,
            $scaleRange,
            $posXLabel,
            $posXRange,
            $posYLabel,
            $posYRange
        );
        $rowCrop.append($cropControl);

        // 头像描述
        var $rowDescription = $(
            '<div class="xiaoxin-wechat-avatar-picker-row"></div>'
        );
        $rowDescription.append(
            '<div class="xiaoxin-wechat-avatar-picker-label">头像描述</div>'
        );
        var $descriptionControl = $(
            '<div class="xiaoxin-wechat-avatar-picker-control"></div>'
        );
        var $descriptionInput = $(
            '<input type="text" placeholder="可选，描述头像内容以便角色识别" class="xiaoxin-wechat-avatar-picker-description-input">'
        );
        // 获取当前账号的头像描述（如果存在）
        var currentAccount = _getAccount();
        if (currentAccount && currentAccount.avatarDescription) {
            $descriptionInput.val(currentAccount.avatarDescription);
        }
        $descriptionControl.append($descriptionInput);
        $rowDescription.append($descriptionControl);

        // 按钮
        var $rowButtons = $(
            '<div class="xiaoxin-wechat-avatar-picker-row xiaoxin-wechat-avatar-picker-buttons"></div>'
        );
        var $cancelBtn = $(
            '<button class="xiaoxin-wechat-avatar-picker-button xiaoxin-wechat-avatar-picker-button-cancel">取消</button>'
        );
        var $confirmBtn = $(
            '<button class="xiaoxin-wechat-avatar-picker-button xiaoxin-wechat-avatar-picker-button-confirm">确定</button>'
        );
        $rowButtons.append($cancelBtn, $confirmBtn);

        $picker.append(
            $title,
            $rowUrl,
            $rowUpload,
            $rowPreview,
            $rowCrop,
            $rowDescription,
            $rowButtons
        );
        $overlay.append($picker);
        $root.append($overlay);

        var canvas = $previewCanvas[0];
        var ctx = canvas.getContext("2d");
        var img = $previewImg[0];
        var cropState = { scale: 1, posX: 0, posY: 0 };
        var currentImageUrl = currentAvatar;

        function updatePreview() {
            if (!img.complete || !img.naturalWidth) return;
            var size = 120;
            canvas.width = size;
            canvas.height = size;
            var imgSize =
                Math.min(img.naturalWidth, img.naturalHeight) * cropState.scale;
            var sx =
                (img.naturalWidth - imgSize) / 2 +
                (cropState.posX / 100) * img.naturalWidth;
            var sy =
                (img.naturalHeight - imgSize) / 2 +
                (cropState.posY / 100) * img.naturalHeight;
            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(img, sx, sy, imgSize, imgSize, 0, 0, size, size);
        }

        function loadImage(url) {
            // 如果是跨域图片，尝试设置 crossOrigin 属性以支持 CORS
            // 但要注意：如果图片服务器不支持 CORS，这会导致加载失败
            // 所以先尝试设置 crossOrigin，如果失败则清除它再重试
            if (
                url &&
                (url.startsWith("http://") || url.startsWith("https://"))
            ) {
                // 检查是否是跨域
                try {
                    var urlObj = new URL(url, window.location.href);
                    if (urlObj.origin !== window.location.origin) {
                        // 跨域图片，设置 crossOrigin
                        img.crossOrigin = "anonymous";
                    } else {
                        // 同域图片，清除 crossOrigin
                        img.crossOrigin = null;
                    }
                } catch (e) {
                    // URL 解析失败，可能是相对路径，清除 crossOrigin
                    img.crossOrigin = null;
                }
            } else {
                // 相对路径或 data URL，清除 crossOrigin
                img.crossOrigin = null;
            }

            img.onload = function () {
                updatePreview();
            };
            img.onerror = function () {
                // 如果设置了 crossOrigin 但加载失败，可能是服务器不支持 CORS
                // 清除 crossOrigin 后重试一次
                if (img.crossOrigin === "anonymous") {
                    console.warn(
                        "[小馨手机][微信] 跨域图片加载失败，尝试不使用 CORS:",
                        url
                    );
                    img.crossOrigin = null;
                    img.src = url; // 重试
                } else {
                    console.warn("[小馨手机][微信] 头像图片加载失败:", url);
                }
            };
            img.src = url;
            currentImageUrl = url;
        }

        $urlInput.on("input", function () {
            var url = $(this).val().trim();
            if (url) {
                loadImage(url);
            }
        });

        $uploadBtn.on("click", function () {
            $fileInput.trigger("click");
        });

        $fileInput.on("change", function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (e) {
                loadImage(e.target.result);
            };
            reader.readAsDataURL(file);
        });

        $scaleRange.on("input", function () {
            cropState.scale = parseFloat($(this).val());
            updatePreview();
        });

        $posXRange.on("input", function () {
            cropState.posX = parseFloat($(this).val());
            updatePreview();
        });

        $posYRange.on("input", function () {
            cropState.posY = parseFloat($(this).val());
            updatePreview();
        });

        $cancelBtn.on("click", function () {
            $overlay.remove();
        });

        $confirmBtn.on("click", function () {
            if (img.complete && img.naturalWidth) {
                var tempCanvas = document.createElement("canvas");
                var tempCtx = tempCanvas.getContext("2d");
                var size = 120;
                tempCanvas.width = size;
                tempCanvas.height = size;
                var imgSize =
                    Math.min(img.naturalWidth, img.naturalHeight) *
                    cropState.scale;
                var sx =
                    (img.naturalWidth - imgSize) / 2 +
                    (cropState.posX / 100) * img.naturalWidth;
                var sy =
                    (img.naturalHeight - imgSize) / 2 +
                    (cropState.posY / 100) * img.naturalHeight;
                tempCtx.drawImage(
                    img,
                    sx,
                    sy,
                    imgSize,
                    imgSize,
                    0,
                    0,
                    size,
                    size
                );

                // 尝试导出为 data URL，如果失败（跨域问题）则使用原始 URL
                var dataUrl = null;
                var finalAvatarUrl = null;
                try {
                    dataUrl = tempCanvas.toDataURL("image/png");
                    finalAvatarUrl = dataUrl;
                    console.info(
                        "[小馨手机][微信] 头像已更新（已裁剪，使用 data URL）"
                    );
                } catch (e) {
                    // 跨域图片无法导出为 data URL，使用原始 URL
                    console.warn(
                        "[小馨手机][微信] 无法导出头像为 data URL（可能是跨域问题），使用原始 URL:",
                        e.message
                    );
                    finalAvatarUrl = currentImageUrl;
                    console.info("[小馨手机][微信] 头像已更新（使用原始 URL）");
                }

                $avatarElement.css(
                    "background-image",
                    "url(" + finalAvatarUrl + ")"
                );
                $avatarElement.data("avatar", finalAvatarUrl);

                // 获取头像描述
                var avatarDescription = $descriptionInput.val().trim();

                // 如果提供了回调函数（如在"我"页面修改头像），调用它来保存账号数据
                if (typeof onConfirm === "function") {
                    onConfirm(finalAvatarUrl, avatarDescription);
                } else {
                    // 如果没有回调函数，直接更新账号信息（如在注册页面）
                    var account = _getAccount();
                    if (account) {
                        account.avatar = finalAvatarUrl;
                        if (avatarDescription) {
                            account.avatarDescription = avatarDescription;
                        } else {
                            // 如果描述为空，删除该字段
                            delete account.avatarDescription;
                        }
                        _setAccount(account);
                    }
                }
            }
            $overlay.remove();
        });

        // 初始化预览
        if (currentAvatar) {
            loadImage(currentAvatar);
            $urlInput.val(currentAvatar);
        }

        $overlay.on("click", function (e) {
            if ($(e.target).hasClass("xiaoxin-wechat-avatar-picker-overlay")) {
                $cancelBtn.trigger("click");
            }
        });
    }

    // ========== 账号：首次进入注册页（使用角色卡数据） ==========
    function _getAccount() {
        // 使用新的账号管理模块
        if (window.XiaoxinWeChatAccount) {
            return window.XiaoxinWeChatAccount.getCurrentAccount();
        }
        // 备用：直接使用 DataHandler
        if (window.XiaoxinWeChatDataHandler) {
            return window.XiaoxinWeChatDataHandler.getAccount();
        }
        // 最后备用：localStorage（兼容旧数据）
        try {
            var raw = localStorage.getItem(STORAGE_KEY_ACCOUNT);
            if (!raw) return null;
            var account = JSON.parse(raw);
            // 迁移到新的账号管理系统
            if (window.XiaoxinWeChatAccount) {
                window.XiaoxinWeChatAccount.createAccount(account);
                localStorage.removeItem(STORAGE_KEY_ACCOUNT);
                console.info("[小馨手机][微信] 已迁移账号数据到新系统");
                return window.XiaoxinWeChatAccount.getCurrentAccount();
            }
            return account;
        } catch (e) {
            console.warn("[小馨手机][微信] 读取账号失败:", e);
            return null;
        }
    }

    function _setAccount(account) {
        var success = false;

        // 使用新的账号管理模块
        if (window.XiaoxinWeChatAccount) {
            // 如果账号不存在，创建新账号；否则更新
            if (!account.id) {
                account = window.XiaoxinWeChatAccount.createAccount(account);
            } else {
                var accounts = window.XiaoxinWeChatAccount.getAccountList();
                var exists = accounts.some(function (acc) {
                    return acc.id === account.id;
                });
                if (exists) {
                    window.XiaoxinWeChatAccount.updateAccount(
                        account.id,
                        account
                    );
                } else {
                    account =
                        window.XiaoxinWeChatAccount.createAccount(account);
                }
            }
            // 设置为当前账号
            if (account && account.id) {
                window.XiaoxinWeChatAccount.setCurrentAccountId(account.id);
            }
            success = !!account;
        } else if (window.XiaoxinWeChatDataHandler) {
            // 备用：直接使用 DataHandler
            try {
                success =
                    window.XiaoxinWeChatDataHandler.setAccount(account) ===
                    true;
            } catch (e) {
                console.warn(
                    "[小馨手机][微信] 使用 DataHandler 保存账号失败:",
                    e
                );
                success = false;
            }
        } else {
            // 最后备用：localStorage
            try {
                localStorage.setItem(
                    STORAGE_KEY_ACCOUNT,
                    JSON.stringify(account)
                );
                console.info(
                    "[小馨手机][微信] 账号已保存到localStorage（备用）"
                );
                success = true;
            } catch (e) {
                console.warn("[小馨手机][微信] 保存账号失败:", e);
                success = false;
            }
        }

        // 成功时，广播一次账号已更新事件，方便酒馆助手脚本在“首次注册”场景下立即同步世界书
        if (success) {
            try {
                if (typeof window.CustomEvent !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent("xiaoxin-account-updated", {
                            detail: {
                                field: "account",
                                value: account || null,
                                reason: "setAccount", // 首次注册或切换账号时都会触发
                            },
                        })
                    );
                    console.info(
                        "[小馨手机][微信] 已在 _setAccount 中广播 xiaoxin-account-updated 事件"
                    );
                }
            } catch (e) {
                console.warn(
                    "[小馨手机][微信] 在 _setAccount 中派发 xiaoxin-account-updated 事件失败:",
                    e
                );
            }
        }

        return success;
    }

    // ========== 显示背景图选择器 ==========
    function _showBackgroundPicker($backgroundElement, $root, onConfirm) {
        console.info("[小馨手机][微信] 打开背景图选择器");

        // 移除已有弹窗
        $root.find(".xiaoxin-wechat-picker-overlay").remove();

        var $overlay = $('<div class="xiaoxin-wechat-picker-overlay"></div>');
        var $picker = $('<div class="xiaoxin-wechat-picker-container"></div>');
        var $title = $(
            '<div class="xiaoxin-wechat-picker-title">更换朋友圈背景</div>'
        );
        var $urlInput = $(
            '<input type="text" class="xiaoxin-wechat-picker-input" placeholder="输入图片URL链接">'
        );
        var $fileInput = $(
            '<input type="file" accept="image/*" class="xiaoxin-wechat-picker-file" style="display: none;">'
        );
        var $fileBtn = $(
            '<button class="xiaoxin-wechat-picker-btn">选择本地图片</button>'
        );

        // 朋友圈背景描述输入框
        var $descriptionInput = $(
            '<textarea class="xiaoxin-wechat-picker-textarea" placeholder="输入朋友圈背景描述（可选，用于角色卡中微信好友看到你的背景图时的反应）" rows="3"></textarea>'
        );

        // 获取当前账号的背景描述（如果有）
        var account = _getAccount();
        if (account && account.momentsBackgroundDescription) {
            $descriptionInput.val(account.momentsBackgroundDescription);
        }

        var $preview = $('<div class="xiaoxin-wechat-picker-preview"></div>');
        var $previewImg = $('<img class="xiaoxin-wechat-picker-preview-img">');
        $preview.append($previewImg);

        var $actions = $('<div class="xiaoxin-wechat-picker-actions"></div>');
        var $cancelBtn = $(
            '<button class="xiaoxin-wechat-picker-cancel">取消</button>'
        );
        var $confirmBtn = $(
            '<button class="xiaoxin-wechat-picker-confirm">确定</button>'
        );
        $actions.append($cancelBtn, $confirmBtn);

        $picker.append(
            $title,
            $urlInput,
            $fileBtn,
            $fileInput,
            $descriptionInput,
            $preview,
            $actions
        );
        $overlay.append($picker);
        $root.append($overlay);

        var selectedImageUrl = null;

        // URL输入处理
        $urlInput.on("input", function () {
            var url = $(this).val().trim();
            if (url) {
                selectedImageUrl = url;
                $previewImg.attr("src", url);
                $previewImg.on("error", function () {
                    if (typeof toastr !== "undefined") {
                        toastr.error(
                            "图片加载失败，请检查URL是否正确",
                            "小馨手机"
                        );
                    }
                    selectedImageUrl = null;
                    $preview.hide();
                });
                $previewImg.on("load", function () {
                    $preview.show();
                });
            } else {
                $preview.hide();
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
                    $previewImg.attr("src", selectedImageUrl);
                    $preview.show();
                };
                reader.onerror = function () {
                    if (typeof toastr !== "undefined") {
                        toastr.error("图片读取失败", "小馨手机");
                    }
                };
                reader.readAsDataURL(file);
            }
        });

        // 取消
        $cancelBtn.on("click", function () {
            $overlay.remove();
        });

        // 确定
        $confirmBtn.on("click", function () {
            if (selectedImageUrl) {
                // 获取背景描述
                var description = $descriptionInput.val().trim();

                // 同时保存背景图和描述
                _updateAccountField(
                    "momentsBackground",
                    selectedImageUrl,
                    null
                );
                _updateAccountField(
                    "momentsBackgroundDescription",
                    description || "",
                    null
                );

                if (typeof toastr !== "undefined") {
                    toastr.success("朋友圈背景已更新", "小馨手机");
                }

                if (typeof onConfirm === "function") {
                    onConfirm(selectedImageUrl);
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
            if ($(e.target).hasClass("xiaoxin-wechat-picker-overlay")) {
                $overlay.remove();
            }
        });
    }

    // ========== 安全设置背景图（加载失败时自动回退） ==========
    function _setBackgroundImageSafely($element, url, fallbackUrl) {
        // 如果没有传入 URL，直接使用备用图
        if (!url) {
            if (fallbackUrl) {
                $element.css("background-image", "url(" + fallbackUrl + ")");
            }
            return;
        }

        try {
            var img = new Image();
            img.onload = function () {
                $element.css("background-image", "url(" + url + ")");
            };
            img.onerror = function () {
                console.warn(
                    "[小馨手机][微信] 朋友圈背景图加载失败，使用备用背景:",
                    url,
                    "->",
                    fallbackUrl
                );
                if (fallbackUrl) {
                    $element.css(
                        "background-image",
                        "url(" + fallbackUrl + ")"
                    );
                }
            };
            img.src = url;
        } catch (e) {
            console.warn(
                "[小馨手机][微信] 设置朋友圈背景图时异常，使用备用背景:",
                e
            );
            if (fallbackUrl) {
                $element.css("background-image", "url(" + fallbackUrl + ")");
            }
        }
    }

    // ========== 图片预览功能 ==========
    function _showImagePreview(imageUrl, $root) {
        var $overlay = $(
            '<div class="xiaoxin-wechat-image-preview-overlay"></div>'
        );
        var $preview = $('<div class="xiaoxin-wechat-image-preview"></div>');
        var $previewImg = $(
            '<img class="xiaoxin-wechat-image-preview-img" src="' +
                imageUrl +
                '">'
        );

        $preview.append($previewImg);
        $overlay.append($preview);
        $root.append($overlay);

        // 点击遮罩层关闭
        $overlay.on("click", function (e) {
            if ($(e.target).hasClass("xiaoxin-wechat-image-preview-overlay")) {
                $overlay.remove();
            }
        });

        // ESC键关闭
        $(document).on("keydown.imagePreview", function (e) {
            if (e.keyCode === 27) {
                $overlay.remove();
                $(document).off("keydown.imagePreview");
            }
        });
    }

    // 显示朋友圈图片预览（支持多张图片左右切换）
    // imageUrls: 图片URL数组
    // currentIndex: 当前显示的图片索引
    function _showMomentsImagePreview(imageUrls, currentIndex, $root) {
        if (!imageUrls || imageUrls.length === 0) {
            return;
        }
        if (currentIndex < 0 || currentIndex >= imageUrls.length) {
            currentIndex = 0;
        }

        var $overlay = $(
            '<div class="xiaoxin-wechat-image-preview-overlay xiaoxin-wechat-moments-image-preview-overlay"></div>'
        );
        var $preview = $(
            '<div class="xiaoxin-wechat-image-preview xiaoxin-wechat-moments-image-preview"></div>'
        );
        var $previewImg = $(
            '<img class="xiaoxin-wechat-image-preview-img" src="' +
                imageUrls[currentIndex] +
                '">'
        );

        $preview.append($previewImg);
        $overlay.append($preview);

        // 如果有多张图片，添加左右切换按钮
        if (imageUrls.length > 1) {
            // 左箭头
            var $prevBtn = $(
                '<div class="xiaoxin-wechat-moments-image-preview-nav xiaoxin-wechat-moments-image-preview-prev" aria-label="上一张">‹</div>'
            );
            // 右箭头
            var $nextBtn = $(
                '<div class="xiaoxin-wechat-moments-image-preview-nav xiaoxin-wechat-moments-image-preview-next" aria-label="下一张">›</div>'
            );
            // 图片计数器
            var $counter = $(
                '<div class="xiaoxin-wechat-moments-image-preview-counter">' +
                    (currentIndex + 1) +
                    " / " +
                    imageUrls.length +
                    "</div>"
            );

            $preview.append($prevBtn, $nextBtn, $counter);

            // 切换图片的函数
            var showImage = function (index) {
                if (index < 0) {
                    index = imageUrls.length - 1;
                } else if (index >= imageUrls.length) {
                    index = 0;
                }
                currentIndex = index;
                $previewImg.attr("src", imageUrls[currentIndex]);
                $counter.text(currentIndex + 1 + " / " + imageUrls.length);
            };

            // 左箭头点击：上一张
            $prevBtn.on("click", function (e) {
                e.stopPropagation();
                showImage(currentIndex - 1);
            });

            // 右箭头点击：下一张
            $nextBtn.on("click", function (e) {
                e.stopPropagation();
                showImage(currentIndex + 1);
            });

            // 键盘左右箭头切换
            var keyHandler = function (e) {
                if (e.keyCode === 37) {
                    // 左箭头
                    e.preventDefault();
                    showImage(currentIndex - 1);
                } else if (e.keyCode === 39) {
                    // 右箭头
                    e.preventDefault();
                    showImage(currentIndex + 1);
                } else if (e.keyCode === 27) {
                    // ESC键关闭
                    e.preventDefault();
                    $overlay.remove();
                    $(document).off("keydown.momentsImagePreview");
                }
            };
            $(document).on("keydown.momentsImagePreview", keyHandler);
        } else {
            // 单张图片时，ESC键关闭
            $(document).on("keydown.momentsImagePreview", function (e) {
                if (e.keyCode === 27) {
                    $overlay.remove();
                    $(document).off("keydown.momentsImagePreview");
                }
            });
        }

        $root.append($overlay);

        // 点击遮罩层关闭
        $overlay.on("click", function (e) {
            if ($(e.target).hasClass("xiaoxin-wechat-image-preview-overlay")) {
                $overlay.remove();
                $(document).off("keydown.momentsImagePreview");
            }
        });
    }

    // ========== 更新账号字段（通用函数） ==========
    // 用于在"我"页面更新账号的某个字段（如头像、昵称、微信号等）
    function _updateAccountField(fieldName, fieldValue, successMessage) {
        var currentAccount = _getAccount();
        if (!currentAccount) {
            console.warn(
                "[小馨手机][微信] 无法获取账号信息，无法更新字段:",
                fieldName
            );
            if (typeof toastr !== "undefined") {
                toastr.error("无法获取账号信息", "小馨手机");
            }
            return false;
        }

        // 更新字段
        currentAccount[fieldName] = fieldValue;

        // 保存账号数据
        var saveSuccess = _setAccount(currentAccount);
        if (saveSuccess) {
            console.info(
                "[小馨手机][微信] 账号字段已更新:",
                fieldName,
                "=",
                fieldValue
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

                if (replaceVarsFunc) {
                    var variablesToUpdate = {
                        player_wechat_nickname: currentAccount.nickname || currentAccount.name || "微信用户",
                        player_wechat_id: currentAccount.wechatId || currentAccount.id || "未设置",
                        player_wechat_gender: currentAccount.gender || currentAccount.sex || "未设置",
                        player_wechat_region: currentAccount.region || currentAccount.location || "未设置",
                        player_wechat_signature: currentAccount.signature || currentAccount.sign || currentAccount.desc || "未设置",
                        player_wechat_phone: currentAccount.phone || currentAccount.mobile || "未绑定",
                        player_wechat_avatar: currentAccount.avatar || "",
                        player_wechat_avatar_description: currentAccount.avatarDescription || "",
                        player_wechat_moments_background: currentAccount.momentsBackground || "",
                        player_wechat_moments_background_description: currentAccount.momentsBackgroundDescription || ""
                    };
                    replaceVarsFunc(variablesToUpdate, { type: "global" });
                    console.info(
                        "[小馨手机][微信] 已同步更新玩家微信资料变量到酒馆变量"
                    );
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

            if (typeof toastr !== "undefined" && successMessage) {
                toastr.success(successMessage, "小馨手机");
            }
            return true;
        } else {
            console.warn("[小馨手机][微信] 账号字段更新失败:", fieldName);
            if (typeof toastr !== "undefined") {
                toastr.error("保存失败", "小馨手机");
            }
            return false;
        }
    }

    // ========== 注册页面 ==========
    function _renderRegisterPage($root, mobilePhone) {
        console.info("[小馨手机][微信] 未检测到注册信息，渲染注册页");

        var DEFAULT_AVATAR =
            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";

        var $page = $('<div class="xiaoxin-wechat-register"></div>');

        // 顶部关闭按钮（绑定切回桌面事件）
        var $close = $(
            '<button class="xiaoxin-wechat-register-close" type="button" aria-label="关闭">×</button>'
        );
        $close.on("click", function () {
            console.info("[小馨手机][微信] 注册页：点击关闭，返回桌面");
            if (mobilePhone && typeof mobilePhone.closeApp === "function") {
                mobilePhone.closeApp();
            }
        });

        var $title = $(
            '<div class="xiaoxin-wechat-register-title">用手机号注册</div>'
        );

        // 头像
        var $avatarWrap = $(
            '<div class="xiaoxin-wechat-register-avatar-wrap"></div>'
        );
        var $avatar = $(
            '<div class="xiaoxin-wechat-register-avatar" role="button" tabindex="0" aria-label="上传头像"></div>'
        );
        $avatar.css("background-image", "url(" + DEFAULT_AVATAR + ")");

        $avatar.on("click", function () {
            _showAvatarPicker($avatar, $root);
        });
        $avatar.on("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                _showAvatarPicker($avatar, $root);
            }
        });

        $avatarWrap.append($avatar);

        // 表单
        var $form = $('<div class="xiaoxin-wechat-register-form"></div>');

        function row(label, placeholder, type) {
            var $row = $('<div class="xiaoxin-wechat-register-row"></div>');
            var $lab = $(
                '<div class="xiaoxin-wechat-register-label"></div>'
            ).text(label);
            var $inpWrap = $(
                '<div class="xiaoxin-wechat-register-input-wrap"></div>'
            );
            var $inp = $('<input class="xiaoxin-wechat-register-input" />');
            $inp.attr("type", type || "text");
            $inp.attr("placeholder", placeholder);
            $inpWrap.append($inp);
            $row.append($lab, $inpWrap);
            return { $row: $row, $input: $inp };
        }

        var nickname = row("昵称", "请填写昵称", "text");
        var phone = row("手机号", "请填写手机号码", "tel");
        var wechatId = row("微信号", "可选，不填则自动生成", "text");

        // 性别选择（下拉框）
        var $genderRow = $('<div class="xiaoxin-wechat-register-row"></div>');
        var $genderLabel = $('<div class="xiaoxin-wechat-register-label">性别</div>');
        var $genderInputWrap = $('<div class="xiaoxin-wechat-register-input-wrap"></div>');
        var $genderSelect = $('<select class="xiaoxin-wechat-register-input"></select>');
        $genderSelect.append('<option value="">可选，请选择</option>');
        $genderSelect.append('<option value="男">男</option>');
        $genderSelect.append('<option value="女">女</option>');
        $genderInputWrap.append($genderSelect);
        $genderRow.append($genderLabel, $genderInputWrap);
        var gender = { $row: $genderRow, $input: $genderSelect };

        var region = row("地区", "可选，请填写地区", "text");
        var signature = row("个性签名", "可选，请填写个性签名", "text");

        // 手机号输入限制：只能输入数字，最多10位
        phone.$input.attr("maxlength", "10");
        phone.$input.attr("pattern", "[0-9]{10}");
        phone.$input.on("input", function () {
            // 只允许数字
            var value = $(this)
                .val()
                .replace(/[^0-9]/g, "");
            $(this).val(value);
            validate();
        });
        phone.$input.on("paste", function (e) {
            // 粘贴时也过滤非数字
            e.preventDefault();
            var paste = (e.originalEvent || e).clipboardData.getData("text");
            var numbers = paste.replace(/[^0-9]/g, "").substring(0, 10);
            $(this).val(numbers);
            validate();
        });

        $form.append(nickname.$row, phone.$row, wechatId.$row, gender.$row, region.$row, signature.$row);

        // 按钮（无勾选同意项、无国家/地区、无密码）
        var $btn = $(
            '<button class="xiaoxin-wechat-register-submit" type="button" disabled>注册</button>'
        );

        function validate() {
            var n = nickname.$input.val().trim();
            var p = phone.$input.val().trim();
            // 校验：昵称非空，手机号必须是10位数字
            var phoneValid = /^[0-9]{10}$/.test(p);
            var ok = n.length > 0 && phoneValid;
            $btn.prop("disabled", !ok);

            // 如果手机号输入了但格式不对，可以添加提示（可选）
            if (p.length > 0 && !phoneValid) {
                console.info("[小馨手机][微信] 手机号格式不正确，需要10位数字");
            }
        }

        nickname.$input.on("input", validate);
        phone.$input.on("input", validate);

        $btn.on("click", function () {
            if ($btn.prop("disabled")) return;

            console.info("[小馨手机][微信] 开始注册流程...");

            var wechatIdValue = wechatId.$input.val().trim();
            // 如果未输入微信号，自动生成
            if (!wechatIdValue) {
                wechatIdValue = _generateWeChatId();
                console.info(
                    "[小馨手机][微信] 未输入微信号，自动生成:",
                    wechatIdValue
                );
            }

            var account = {
                nickname: nickname.$input.val().trim(),
                phone: phone.$input.val().trim(),
                wechatId: wechatIdValue,
                avatar: $avatar.data("avatar") || DEFAULT_AVATAR,
                createdAt: _now(),
            };

            // 添加可选字段（如果填写了）
            var genderValue = gender.$input.val().trim();
            if (genderValue) {
                account.gender = genderValue;
            }

            var regionValue = region.$input.val().trim();
            if (regionValue) {
                account.region = regionValue;
            }

            var signatureValue = signature.$input.val().trim();
            if (signatureValue) {
                account.signature = signatureValue;
            }

            console.info("[小馨手机][微信] 准备保存账号信息:", account);
            var saveSuccess = _setAccount(account);

            if (saveSuccess) {
                console.info(
                    "[小馨手机][微信] 注册完成，账号已保存，进入我页面"
                );
                _renderMePage($root, mobilePhone);
            } else {
                console.error(
                    "[小馨手机][微信] 注册失败：账号保存失败，请检查控制台"
                );
                alert("注册失败：账号保存失败，请检查控制台");
            }
        });

        $page.append($close, $title, $avatarWrap, $form, $btn);
        $root.empty().append($page);

        // 首次渲染时校验一次
        validate();
    }

    // ========== 获取联系人显示名称（优先备注，其次昵称） ==========
    function _getContactDisplayName(contact, fallback) {
        if (!contact) {
            return fallback || "未知";
        }
        // 优先显示备注，如果没有备注则显示昵称
        var displayName = contact.remark || contact.nickname || contact.name;
        return displayName || fallback || "未知";
    }

    // 根据ID获取显示名称（用于评论、回复等场景）
    // id: "player" 或角色ID（如 "1", "2", "wzq" 等）
    function _getDisplayNameById(id) {
        if (!id) {
            return "未知";
        }
        var idStr = String(id).trim();
        var idLower = idStr.toLowerCase();

        // 如果是玩家（支持 "user" 和 "player"）
        if (idLower === "user" || idLower === "player") {
            var account = _getAccount();
            return account.nickname || "微信用户";
        }

        // 查找联系人
        var contacts = [];
        if (
            window.XiaoxinWeChatDataHandler &&
            typeof window.XiaoxinWeChatDataHandler.getContacts === "function"
        ) {
            contacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
        }

        var contact = contacts.find(function (c) {
            var cId = String(c.id || "").trim();
            var cWechatId = String(c.wechatId || "").trim();
            var cCharId = String(c.characterId || "").trim();

            // 支持直接匹配、contact_前缀匹配、characterId匹配
            return (
                cId === idStr ||
                cId === "contact_" + idStr ||
                idStr === "contact_" + cId ||
                cWechatId === idStr ||
                cCharId === idStr ||
                cId.replace(/^contact_/, "") === idStr.replace(/^contact_/, "")
            );
        });

        if (contact) {
            return _getContactDisplayName(contact, idStr);
        }

        // 如果找不到联系人，返回原始ID（作为兜底）
        return idStr;
    }

    // ========== 格式化预览消息时间（基于世界观时间） ==========
    function _formatPreviewMessageTime(messageTimestamp) {
        if (!messageTimestamp) {
            return "";
        }

        var msgTime = new Date(messageTimestamp);

        // 获取当前世界观时间（从 [time] 标签）
        var currentWorldTime = null;
        if (
            window.XiaoxinWorldClock &&
            window.XiaoxinWorldClock.currentTimestamp
        ) {
            // 检查世界观时间是否是有效的（不是现实时间）
            // 如果世界观时间戳明显是未来时间（大于2025年），可能是现实时间
            var worldTimestamp = window.XiaoxinWorldClock.currentTimestamp;
            var currentRealTime = Date.now();
            var year2025 = new Date("2025-01-01").getTime();

            // 如果世界观时间戳大于2025年1月1日，可能是现实时间，需要检查
            if (worldTimestamp > year2025) {
                // 如果原始时间字符串存在且是中文格式（包含"年"），说明是世界观时间
                if (
                    window.XiaoxinWorldClock.rawTime &&
                    window.XiaoxinWorldClock.rawTime.indexOf("年") !== -1
                ) {
                    // 尝试从原始时间字符串重新解析
                    var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                    var normalizedTimeStr = rawTimeStr
                        .replace(/-/g, "/")
                        .replace(/年/g, "/")
                        .replace(/月/g, "/")
                        .replace(/日/g, " ")
                        .replace(/星期[一二三四五六日]/g, "")
                        .trim();
                    var parsed = Date.parse(normalizedTimeStr);
                    if (!isNaN(parsed)) {
                        worldTimestamp = parsed;
                    }
                }
            }

            currentWorldTime = new Date(worldTimestamp);
        } else {
            // 如果没有世界观时间，尝试从聊天历史中获取最新消息时间作为基准
            // 这样至少能正确显示历史消息的相对日期
            var latestMessageTime = null;
            try {
                if (
                    window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler.getAllChats === "function"
                ) {
                    var allChats = window.XiaoxinWeChatDataHandler.getAllChats() || {};
                    var latestTimestamp = 0;
                    Object.keys(allChats).forEach(function (chatId) {
                        var chatHistory = allChats[chatId] || [];
                        chatHistory.forEach(function (msg) {
                            var msgTimestamp = msg.timestamp || 0;
                            // 如果没有 timestamp，尝试从 rawTime 解析
                            if (!msgTimestamp && msg.rawTime) {
                                try {
                                    var timeStr = String(msg.rawTime).trim();
                                    var parsed = Date.parse(
                                        timeStr
                                            .replace(/-/g, "/")
                                            .replace(/年|月|日|星期[一二三四五六日]/g, " ")
                                    );
                                    if (!isNaN(parsed)) {
                                        msgTimestamp = parsed;
                                    }
                                } catch (e) {
                                    // 解析失败，跳过
                                }
                            }
                            if (msgTimestamp && msgTimestamp > latestTimestamp) {
                                latestTimestamp = msgTimestamp;
                            }
                        });
                    });
                    if (latestTimestamp > 0) {
                        latestMessageTime = new Date(latestTimestamp);
                        currentWorldTime = latestMessageTime;
                        console.info(
                            "[小馨手机][微信] 未找到世界观时间，使用聊天历史中最新消息时间作为基准:",
                            latestMessageTime.toLocaleString("zh-CN")
                        );
                    }
                }
            } catch (e) {
                console.warn(
                    "[小馨手机][微信] 从聊天历史获取最新消息时间失败:",
                    e
                );
            }

            // 如果仍然没有基准时间，检查消息时间是否是历史时间
            if (!currentWorldTime) {
                var messageYear = msgTime.getFullYear();
                if (messageYear < 2020) {
                    // 历史消息：如果消息时间明显是过去的时间，说明世界观时间应该是更晚的时间
                    // 使用消息时间 + 1年作为基准（假设世界观时间至少比消息时间晚）
                    currentWorldTime = new Date(msgTime);
                    currentWorldTime.setFullYear(messageYear + 1);
                    console.warn(
                        "[小馨手机][微信] 未找到世界观时间，消息是历史消息（" + messageYear + "年），使用消息时间+1年作为基准"
                    );
                } else {
                    // 如果消息时间看起来是现实时间，使用现实时间（不推荐）
                    console.warn(
                        "[小馨手机][微信] 未找到世界观时间，使用现实时间格式化预览消息时间（不推荐）"
                    );
                    currentWorldTime = new Date();
                }
            }
        }

        // 计算天数差（基于年月日，而不是24小时）
        // 将两个时间都设置为当天的00:00:00，然后比较日期
        var msgDate = new Date(
            msgTime.getFullYear(),
            msgTime.getMonth(),
            msgTime.getDate()
        );
        var currentDate = new Date(
            currentWorldTime.getFullYear(),
            currentWorldTime.getMonth(),
            currentWorldTime.getDate()
        );

        // 计算日期差（天数）
        var days = Math.floor(
            (currentDate.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // 格式化时分
        var hours = msgTime.getHours();
        var minutes = msgTime.getMinutes();
        var hourStr = hours < 10 ? String(hours) : String(hours);
        var minuteStr = minutes < 10 ? "0" + minutes : String(minutes);
        var timeStrOnly = hourStr + ":" + minuteStr;

        // 判断是否跨年
        var msgYear = msgTime.getFullYear();
        var currentYear = currentWorldTime.getFullYear();
        var isCrossYear = msgYear !== currentYear;

        if (days === 0) {
            // 当天的消息：显示时+分，如 14:39、5:31
            return timeStrOnly;
        } else if (days === 1) {
            // 昨天的消息：显示"昨天" + 时和分，如：昨天8:30、昨天23:47
            return "昨天" + timeStrOnly;
        } else if (days >= 2 && days < 7) {
            // 前天以及小于7天的：显示"星期几" + 时和分，如：星期四7:00、星期一5:27
            var weekdays = ["日", "一", "二", "三", "四", "五", "六"];
            var weekday = weekdays[msgTime.getDay()];
            return "星期" + weekday + timeStrOnly;
        } else if (days >= 7 && !isCrossYear) {
            // 大于7天未超过一年：显示"月+日"，如：12月7日、5月9日
            var month = msgTime.getMonth() + 1;
            var day = msgTime.getDate();
            return month + "月" + day + "日";
        } else if (isCrossYear || days >= 365) {
            // 超过一年或跨年：显示"年月日"，如：2017年7月1日、2019年8月2日
            var year = msgTime.getFullYear();
            var month = msgTime.getMonth() + 1;
            var day = msgTime.getDate();
            return year + "年" + month + "月" + day + "日";
        } else {
            // 兜底：显示月+日
            var month = msgTime.getMonth() + 1;
            var day = msgTime.getDate();
            return month + "月" + day + "日";
        }
    }

    // ========== 渲染微信主页（聊天列表） ==========
    function _renderChatPage($root, mobilePhone) {
        console.info("[小馨手机][微信] 渲染微信主页（聊天列表）");
        _currentPage = "chat";

        // 清理之前的事件监听器（如果存在）
        var oldChatHandler = $root.data("chatUpdateHandler");
        var oldContactHandler = $root.data("contactUpdateHandler");
        var oldUnreadHandler = $root.data("unreadUpdateHandler");
        var oldMessageDisplayedHandler = $root.data("messageDisplayedHandler");
        var oldJumpToChatHandler = $root.data("jumpToChatHandler");
        var oldMomentsUpdatedHandler = $root.data("momentsUpdatedHandler");
        var oldAccountUpdatedHandler = $root.data("accountUpdatedHandler");
        if (oldChatHandler) {
            window.removeEventListener("xiaoxin-chat-updated", oldChatHandler);
            $root.removeData("chatUpdateHandler");
        }
        if (oldContactHandler) {
            window.removeEventListener(
                "xiaoxin-contact-updated",
                oldContactHandler
            );
            $root.removeData("contactUpdateHandler");
        }
        if (oldUnreadHandler) {
            window.removeEventListener(
                "xiaoxin-unread-count-updated",
                oldUnreadHandler
            );
            $root.removeData("unreadUpdateHandler");
        }
        if (oldMessageDisplayedHandler) {
            window.removeEventListener(
                "xiaoxin-message-displayed",
                oldMessageDisplayedHandler
            );
            $root.removeData("messageDisplayedHandler");
        }
        if (oldJumpToChatHandler) {
            window.removeEventListener(
                "xiaoxin-wechat-jump-to-chat",
                oldJumpToChatHandler
            );
            $root.removeData("jumpToChatHandler");
        }
        if (oldMomentsUpdatedHandler) {
            window.removeEventListener(
                "xiaoxin-moments-updated",
                oldMomentsUpdatedHandler
            );
            $root.removeData("momentsUpdatedHandler");
        }
        if (oldAccountUpdatedHandler) {
            window.removeEventListener(
                "xiaoxin-account-updated",
                oldAccountUpdatedHandler
            );
            $root.removeData("accountUpdatedHandler");
        }

        var account = _getAccount();
        if (!account) {
            console.warn("[小馨手机][微信] 无法获取账号信息，跳转到注册页");
            _renderRegisterPage($root, mobilePhone);
            return;
        }

        var $main = $(
            '<div class="xiaoxin-wechat-main xiaoxin-wechat-chat-main"></div>'
        );

        // 标题栏
        var $header = $('<div class="xiaoxin-wechat-header"></div>');
        var $headerBar = $('<div class="xiaoxin-wechat-header-bar"></div>');

        var $headerLeft = $('<div class="xiaoxin-wechat-header-left"></div>');
        var $headerStar = $('<div class="xiaoxin-wechat-header-star">☆</div>');
        $headerLeft.append($headerStar);

        var $headerTitle = $(
            '<div class="xiaoxin-wechat-header-title">微信</div>'
        );

        var $headerRight = $('<div class="xiaoxin-wechat-header-right"></div>');
        var $headerAdd = $('<div class="xiaoxin-wechat-header-add">+</div>');

        // 创建展开菜单
        var $addMenu = $('<div class="xiaoxin-wechat-add-menu"></div>');
        var $menuTriangle = $(
            '<div class="xiaoxin-wechat-add-menu-triangle"></div>'
        );

        // 发起群聊按钮
        var $groupChatBtn = $(
            '<div class="xiaoxin-wechat-add-menu-item"></div>'
        );
        var $groupChatIcon = $(
            '<img src="/scripts/extensions/third-party/xiaoxin-phone/image/icon/发起群聊图标.png" class="xiaoxin-wechat-add-menu-icon" />'
        );
        var $groupChatText = $(
            '<span class="xiaoxin-wechat-add-menu-text">发起群聊</span>'
        );
        $groupChatBtn.append($groupChatIcon, $groupChatText);
        $groupChatBtn.on("click", function (e) {
            e.stopPropagation();
            console.info("[小馨手机][微信] 点击发起群聊");
            $addMenu.hide();
            if (typeof toastr !== "undefined") {
                toastr.info("发起群聊功能待实现", "小馨手机");
            }
        });

        // 添加朋友按钮
        var $addFriendBtn = $(
            '<div class="xiaoxin-wechat-add-menu-item"></div>'
        );
        var $addFriendIcon = $(
            '<img src="/scripts/extensions/third-party/xiaoxin-phone/image/icon/添加朋友按钮.jpg" class="xiaoxin-wechat-add-menu-icon" />'
        );
        var $addFriendText = $(
            '<span class="xiaoxin-wechat-add-menu-text">添加朋友</span>'
        );
        $addFriendBtn.append($addFriendIcon, $addFriendText);
        $addFriendBtn.on("click", function (e) {
            e.stopPropagation();
            console.info("[小馨手机][微信] 点击添加朋友");
            $addMenu.hide();
            // 调用添加朋友页面
            if (
                window.XiaoxinWeChatContacts &&
                window.XiaoxinWeChatContacts.renderAddFriendPage
            ) {
                window.XiaoxinWeChatContacts.renderAddFriendPage(
                    $root,
                    mobilePhone
                );
            } else {
                if (typeof toastr !== "undefined") {
                    toastr.info("添加朋友功能待实现", "小馨手机");
                }
            }
        });

        $addMenu.append($menuTriangle, $groupChatBtn, $addFriendBtn);
        $headerRight.append($headerAdd, $addMenu);

        // 点击加号按钮展开/收起菜单
        var isMenuVisible = false;
        $headerAdd.on("click", function (e) {
            e.stopPropagation();
            isMenuVisible = !isMenuVisible;
            if (isMenuVisible) {
                $addMenu.show();
            } else {
                $addMenu.hide();
            }
        });

        // 点击其他地方关闭菜单
        $(document).on("click.wechat-add-menu", function (e) {
            if (
                !$(e.target).closest(".xiaoxin-wechat-header-add").length &&
                !$(e.target).closest(".xiaoxin-wechat-add-menu").length
            ) {
                $addMenu.hide();
                isMenuVisible = false;
            }
        });

        $headerBar.append($headerLeft, $headerTitle, $headerRight);
        $header.append($headerBar);

        // 搜索栏
        var $search = $('<div class="xiaoxin-wechat-search"></div>');
        var $searchBar = $('<div class="xiaoxin-wechat-search-bar"></div>');
        // 使用原生 placeholder，不再使用单独的文字 div
        var $searchInput = $(
            '<input type="text" class="xiaoxin-wechat-search-input" placeholder="搜索">'
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
            console.info("[小馨手机][微信] 搜索框获得焦点");
        });
        $searchBar.css("position", "relative"); // 设置为相对定位
        $searchBar.append($searchInput);
        $search.append($searchBar);

        // 聊天列表
        var $chatList = $('<div class="xiaoxin-wechat-chat-list"></div>');

        // 从数据处理器获取真实聊天数据
        var chatData = [];
        if (window.XiaoxinWeChatDataHandler) {
            var allChats = window.XiaoxinWeChatDataHandler.getAllChats();
            // 获取联系人列表
            var contacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
            // 获取未读数数据
            var unreadData = {};
            if (window.XiaoxinWeChatDataHandler && window.XiaoxinDataManager) {
                var accountKey = window.XiaoxinWeChatAccount
                    ? window.XiaoxinWeChatAccount.getAccountDataKey(
                          "wechat_unread"
                      )
                    : "wechat_unread";
                unreadData = window.XiaoxinDataManager.getCharacterData(
                    accountKey,
                    {}
                );
            }

            // 将聊天记录转换为聊天列表项
            Object.keys(allChats).forEach(function (userId) {
                var messages = allChats[userId];
                if (!messages || messages.length === 0) return;

                // 过滤消息：只显示已通过队列显示的角色消息
                var filteredMessages = messages.filter(function (message) {
                    // 玩家发送的消息直接显示
                    if (message.isOutgoing === true) {
                        return true;
                    }

                    // 角色发送的消息需要检查是否已显示
                    if (message.isOutgoing === false) {
                        // 检查消息队列管理器是否存在
                        if (
                            window.XiaoxinMessageQueue &&
                            window.XiaoxinMessageQueue.isMessageDisplayed &&
                            window.XiaoxinMessageQueue.isMessageInQueue
                        ) {
                            var isDisplayed =
                                window.XiaoxinMessageQueue.isMessageDisplayed(
                                    userId,
                                    message.id
                                );

                            if (isDisplayed) {
                                // 消息已通过队列显示，直接显示
                                return true;
                            } else {
                                // 消息未显示，检查是否在队列中
                                var isInQueue =
                                    window.XiaoxinMessageQueue.isMessageInQueue(
                                        userId,
                                        message.id
                                    );

                                if (isInQueue) {
                                    // 消息在队列中，等待队列管理器显示（不显示在聊天列表）
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
                            return true;
                        }
                    }

                    // 其他情况（系统消息等）直接显示
                    return true;
                });

                if (filteredMessages.length === 0) return;

                // 按时间戳排序消息（确保最新消息在最后）
                filteredMessages.sort(function (a, b) {
                    var aTime = a.timestamp || 0;
                    var bTime = b.timestamp || 0;
                    // 如果没有 timestamp，尝试从 rawTime 解析
                    if (!aTime && a.rawTime) {
                        try {
                            var aTimeStr = String(a.rawTime).trim();
                            var parsedA = Date.parse(
                                aTimeStr
                                    .replace(/-/g, "/")
                                    .replace(/年|月|日|星期[一二三四五六日]/g, " ")
                            );
                            if (!isNaN(parsedA)) {
                                aTime = parsedA;
                            }
                        } catch (e) {
                            // 解析失败，使用 0
                        }
                    }
                    if (!bTime && b.rawTime) {
                        try {
                            var bTimeStr = String(b.rawTime).trim();
                            var parsedB = Date.parse(
                                bTimeStr
                                    .replace(/-/g, "/")
                                    .replace(/年|月|日|星期[一二三四五六日]/g, " ")
                            );
                            if (!isNaN(parsedB)) {
                                bTime = parsedB;
                            }
                        } catch (e) {
                            // 解析失败，使用 0
                        }
                    }
                    return aTime - bTime; // 升序排序，时间最早的在前，最新的在后
                });

                // 获取最后一条消息（从排序后的消息中获取，确保是最新的）
                var lastMessage = filteredMessages[filteredMessages.length - 1];

                // 查找联系人信息（支持多种ID格式匹配）
                var contact = contacts.find(function (c) {
                    var cId = String(c.id || "").trim();
                    var cWechatId = String(c.wechatId || "").trim();
                    var cCharId = String(c.characterId || "").trim();
                    var userIdStr = String(userId).trim();

                    // 支持直接匹配、contact_前缀匹配、characterId匹配
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

                // 格式化预览消息时间（基于世界观时间）
                var timeStr = "";
                // 优先使用 rawTime 解析（对于历史消息更可靠）
                if (lastMessage.rawTime) {
                    try {
                        var timeStr2 = String(lastMessage.rawTime).trim();
                        var parsed = Date.parse(
                            timeStr2
                                .replace(/-/g, "/")
                                .replace(/年/g, "/")
                                .replace(/月/g, "/")
                                .replace(/日/g, " ")
                                .replace(/星期[一二三四五六日]/g, "")
                                .trim()
                        );
                        if (!isNaN(parsed)) {
                            timeStr = _formatPreviewMessageTime(parsed);
                        } else if (lastMessage.timestamp) {
                            // 如果 rawTime 解析失败，使用 timestamp
                            timeStr = _formatPreviewMessageTime(lastMessage.timestamp);
                        }
                    } catch (e) {
                        console.warn(
                            "[小馨手机][微信] 解析预览消息时间失败:",
                            e
                        );
                        // 解析失败时，如果有 timestamp，使用它
                        if (lastMessage.timestamp) {
                            timeStr = _formatPreviewMessageTime(lastMessage.timestamp);
                        }
                    }
                } else if (lastMessage.timestamp) {
                    // 如果没有 rawTime，使用 timestamp
                    timeStr = _formatPreviewMessageTime(lastMessage.timestamp);
                }

                // 获取消息内容预览
                var messagePreview = "";
                var isVoiceUnreadPreview = false;

                if (lastMessage.type === "call_voice") {
                    messagePreview = "[语音通话]";
                } else if (lastMessage.type === "call_video") {
                    messagePreview = "[视频通话]";
                } else if (lastMessage.type === "voice") {
                    // 兼容不同字段：duration_sec（玩家语音）、duration（世界书语音）、payload.duration_sec
                    var rawDur =
                        lastMessage.duration_sec ||
                        lastMessage.duration ||
                        (lastMessage.payload &&
                            lastMessage.payload.duration_sec);
                    var dur = parseInt(rawDur, 10);
                    if (isNaN(dur) || dur <= 0) dur = 1;
                    if (dur > 60) dur = 60;
                    messagePreview = "[语音]" + dur + '"';
                    // 仅当最后一条是角色侧且未读时，标记为红色预览
                    if (
                        lastMessage.isOutgoing === false &&
                        lastMessage.voice_read !== true
                    ) {
                        isVoiceUnreadPreview = true;
                    }
                } else if (lastMessage.type === "system") {
                    // 系统消息：显示完整内容（通常较短）
                    messagePreview = lastMessage.content || "";
                } else if (lastMessage.type === "redpacket") {
                    // 红包消息：显示为"[微信红包]备注"
                    var note =
                        lastMessage.note ||
                        lastMessage.greeting ||
                        "恭喜发财, 大吉大利";
                    messagePreview = "[微信红包]" + note;
                } else if (lastMessage.type === "redpacket_claim_notification") {
                    // 红包领取通知：根据发送者和领取者是否是玩家，显示不同的预览文本
                    var senderName = lastMessage.senderName || "未知";
                    var claimerName = lastMessage.claimerName || "未知";
                    var isClaimerPlayer = lastMessage.isClaimerPlayer === true;
                    var isSenderPlayer = lastMessage.isSenderPlayer === true;

                    // 如果领取者名称仍然是ID，尝试从联系人中查找
                    if (claimerName === lastMessage.claimed_by && lastMessage.claimed_by && contacts) {
                        var claimedById = String(lastMessage.claimed_by).trim();
                        var claimerContact = contacts.find(function (c) {
                            var cWechatId = String(c.wechatId || "").trim();
                            var cId = String(c.id || "").trim();
                            var cCharId = String(c.characterId || "").trim();
                            var cIdWithoutPrefix = cId.replace(/^contact_/, "");
                            var claimedByIdWithoutPrefix = claimedById.replace(/^contact_/, "");

                            return (
                                cWechatId === claimedById ||
                                cId === claimedById ||
                                cId === "contact_" + claimedById ||
                                claimedById === "contact_" + cId ||
                                cCharId === claimedById ||
                                cIdWithoutPrefix === claimedByIdWithoutPrefix ||
                                cIdWithoutPrefix === claimedById ||
                                claimedByIdWithoutPrefix === cIdWithoutPrefix
                            );
                        });

                        if (claimerContact) {
                            claimerName = claimerContact.remark || claimerContact.note || claimerContact.nickname || claimerName;
                        }
                    }

                    // 额外检查：如果领取者名称匹配玩家账号信息，也认为是玩家领取
                    if (!isClaimerPlayer && window.XiaoxinWeChatDataHandler) {
                        try {
                            var account = window.XiaoxinWeChatDataHandler.getAccount();
                            if (account) {
                                var accountWechatId = String(account.wechatId || "").trim();
                                var accountWechatId2 = String(account.wechat_id || "").trim();
                                var accountWechatId3 = String(account.wechatID || "").trim();
                                var accountId = String(account.id || "").trim();
                                var claimerNameStr = String(claimerName).trim();
                                var claimedById = String(lastMessage.claimed_by || "").trim();

                                // 检查领取者是否是玩家（通过多种方式匹配）
                                if (
                                    claimerNameStr === accountWechatId ||
                                    claimerNameStr === accountWechatId2 ||
                                    claimerNameStr === accountWechatId3 ||
                                    claimerNameStr === accountId ||
                                    claimedById === accountWechatId ||
                                    claimedById === accountWechatId2 ||
                                    claimedById === accountWechatId3 ||
                                    claimedById === accountId ||
                                    claimerNameStr === (account.nickname || "") ||
                                    claimerNameStr === (account.name || "")
                                ) {
                                    isClaimerPlayer = true;
                                }
                            }
                        } catch (e) {
                            console.warn("[小馨手机][微信] 检查领取者是否是玩家时出错:", e);
                        }
                    }

                    // 根据发送者和领取者是否是玩家，生成不同的预览文本
                    if (isClaimerPlayer && !isSenderPlayer) {
                        // 玩家领取了角色的红包："你领取了XX的红包"
                        messagePreview = "你领取了" + senderName + "的红包";
                    } else if (!isClaimerPlayer && isSenderPlayer) {
                        // 角色领取了玩家的红包："XX领取了你的红包"
                        messagePreview = claimerName + "领取了你的红包";
                    } else if (isClaimerPlayer && isSenderPlayer) {
                        // 玩家领取了玩家的红包："你领取了你的红包"（虽然这种情况不太可能，但也要处理）
                        messagePreview = "你领取了你的红包";
                    } else {
                        // 角色领取了角色的红包："XX领取了XX的红包"
                        messagePreview = claimerName + "领取了" + senderName + "的红包";
                    }
                } else if (lastMessage.type === "image") {
                    messagePreview = "[图片]";
                } else if (lastMessage.type === "photo") {
                    // 照片消息：显示为"[图片]"
                    messagePreview = "[图片]";
                } else if (lastMessage.type === "emoji") {
                    messagePreview = "[动画表情]";
                } else if (lastMessage.type === "transfer") {
                    // 转账消息：显示为"[转账]"
                    messagePreview = "[转账]";
                } else if (lastMessage.content) {
                    messagePreview = lastMessage.content;
                    // 清理消息预览中的 HTML 标签和特殊字符
                    if (typeof messagePreview === "string") {
                        messagePreview = messagePreview
                            .replace(/<br\s*\/?>/gi, " ")
                            .replace(/<[^>]+>/g, "")
                            .replace(/&nbsp;/gi, " ")
                            .trim();
                    }
                    if (messagePreview.length > 30) {
                        messagePreview =
                            messagePreview.substring(0, 30) + "...";
                    }
                    // 如果消息预览为空或只包含空白，显示默认文本
                    if (!messagePreview || messagePreview.trim() === "") {
                        messagePreview = "[消息]";
                    }
                } else {
                    // 如果没有消息内容，显示默认文本
                    messagePreview = "[消息]";
                }

                chatData.push({
                    userId: userId,
                    avatar: contact
                        ? contact.avatar ||
                          "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg"
                        : "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg",
                    name: _getContactDisplayName(contact, userId),
                    message: messagePreview,
                    time: timeStr,
                    unread: unreadData[userId] || 0,
                    muted: contact ? contact.muted || false : false,
                    isVoiceUnreadPreview: isVoiceUnreadPreview,
                });
            });

            // 按最后一条消息的时间排序（最新的在前）
            chatData.sort(function (a, b) {
                var aTime =
                    allChats[a.userId] && allChats[a.userId].length > 0
                        ? allChats[a.userId][allChats[a.userId].length - 1]
                              .timestamp || 0
                        : 0;
                var bTime =
                    allChats[b.userId] && allChats[b.userId].length > 0
                        ? allChats[b.userId][allChats[b.userId].length - 1]
                              .timestamp || 0
                        : 0;
                return bTime - aTime;
            });
        }

        // 渲染聊天项
        chatData.forEach(function (chat) {
            var $chatItem = $('<div class="xiaoxin-wechat-chat-item"></div>');

            var $avatar = $('<div class="xiaoxin-wechat-chat-avatar"></div>');
            $avatar.css("background-image", "url(" + chat.avatar + ")");
            if (chat.unread > 0) {
                var $badge = $(
                    '<div class="xiaoxin-wechat-chat-avatar-badge">' +
                        chat.unread +
                        "</div>"
                );
                $avatar.append($badge);
            }

            var $content = $('<div class="xiaoxin-wechat-chat-content"></div>');

            var $header = $('<div class="xiaoxin-wechat-chat-header"></div>');
            var $name = $(
                '<div class="xiaoxin-wechat-chat-name">' +
                    escapeHtml(chat.name) +
                    "</div>"
            );
            var $time = $(
                '<div class="xiaoxin-wechat-chat-time">' +
                    escapeHtml(chat.time) +
                    "</div>"
            );
            $header.append($name, $time);

            var $footer = $('<div class="xiaoxin-wechat-chat-footer"></div>');
            var $message = $(
                '<div class="xiaoxin-wechat-chat-message">' +
                    escapeHtml(chat.message) +
                    "</div>"
            );
            if (chat.isVoiceUnreadPreview) {
                $message.addClass("xiaoxin-wechat-chat-message-voice-unread");
            }
            $footer.append($message);
            // 免打扰图标：表示玩家把该角色的聊天或者群聊设置为了"免打扰"
            if (chat.muted) {
                var $mute = $('<div class="xiaoxin-wechat-chat-mute"></div>');
                // 使用SVG矢量图标替代emoji，显示免打扰状态（铃铛+斜线）
                // 铃铛图标：顶部圆环挂钩 + 铃铛主体（钟形）+ 底部横条 + 斜线表示免打扰
                $mute.html(
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 3h4M18 17H6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1zM17 17V9a5 5 0 0 0-10 0v8" stroke="#999" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 21a2 2 0 0 0 4 0" stroke="#999" stroke-width="1.5" stroke-linecap="round"/><line x1="4" y1="4" x2="20" y2="20" stroke="#999" stroke-width="2" stroke-linecap="round"/></svg>'
                );
                $footer.append($mute);
            }

            $content.append($header, $footer);
            $chatItem.append($avatar, $content);

            // 点击聊天项事件
            $chatItem.on("click", function () {
                console.info(
                    "[小馨手机][微信] 点击聊天:",
                    chat.name,
                    "userId:",
                    chat.userId
                );
                // 跳转到聊天详情页面
                _renderChatDetailPage($root, mobilePhone, chat.userId, chat);
            });

            $chatList.append($chatItem);
        });

        // 监听语音已读事件（从聊天详情页触发），用于刷新主页预览颜色
        window.removeEventListener(
            "xiaoxin-wechat-voice-read-updated",
            _handleVoiceReadUpdated
        );
        window.addEventListener(
            "xiaoxin-wechat-voice-read-updated",
            _handleVoiceReadUpdated
        );

        // 底部导航栏
        var $tabBar = $('<div class="xiaoxin-wechat-tab-bar"></div>');
        var tabs = [
            {
                id: "chat",
                label: "微信",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微信图标已选中.png",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微信图标未选中.jpg",
                active: true,
            },
            {
                id: "contacts",
                label: "通讯录",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/通讯录图标已选中.png",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/通讯录图标未选中.jpg",
                active: false,
            },
            {
                id: "discover",
                label: "发现",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/发现图标已选中.png",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/发现图标未选中.jpg",
                active: false,
            },
            {
                id: "me",
                label: "我",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/我的图标已选中.jpg",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/我的图标未选中.png",
                active: false,
            },
        ];

        tabs.forEach(function (tab) {
            var $tab = $(
                '<div class="xiaoxin-wechat-tab" data-tab="' +
                    tab.id +
                    '"></div>'
            );
            if (tab.active) {
                $tab.addClass("active");
            }
            var $tabIcon = $(
                '<div class="xiaoxin-wechat-tab-icon" style="background-image: url(\'' +
                    (tab.active ? tab.iconActive : tab.iconInactive) +
                    "');\"></div>"
            );
            if (tab.id === "discover") {
                // 发现tab添加红点占位
                var $dot = $(
                    '<div class="xiaoxin-wechat-tab-red-dot" style="display:none;"></div>'
                );
                $tabIcon.css("position", "relative");
                $tabIcon.append($dot);
                $tab.data("redDot", $dot);
            }
            var $tabLabel = $(
                '<div class="xiaoxin-wechat-tab-label">' + tab.label + "</div>"
            );
            $tab.append($tabIcon, $tabLabel);
            $tabBar.append($tab);
        });

        $main.append($header, $search, $chatList, $tabBar);
        $root.empty().append($main);

        // 初始化时立即更新所有未读提示（标题栏 + 导航栏）
        if (window.XiaoxinWeChatComponents) {
            window.XiaoxinWeChatComponents.updateAllUnreadBadges($root);
            console.info("[小馨手机][微信] 聊天页面初始化未读数显示");
        }
        _updateDiscoverTabBadge($tabBar);

        // 监听未读消息数更新事件，更新所有未读提示
        var unreadUpdateHandler = function () {
            if (window.XiaoxinWeChatComponents) {
                window.XiaoxinWeChatComponents.updateAllUnreadBadges($root);
            }
            _updateDiscoverTabBadge($tabBar);
        };
        window.addEventListener(
            "xiaoxin-unread-count-updated",
            unreadUpdateHandler
        );
        $root.data("unreadUpdateHandler", unreadUpdateHandler);

        // 监听朋友圈更新事件，更新发现tab红点（不需进入朋友圈也能亮）
        var momentsUpdatedHandler = function () {
            _updateDiscoverTabBadge($tabBar);
        };
        window.addEventListener("xiaoxin-moments-updated", momentsUpdatedHandler);
        $root.data("momentsUpdatedHandler", momentsUpdatedHandler);

        // 监听聊天更新事件，实时刷新聊天列表
        // 注意：只在聊天列表页面时刷新，如果在聊天详情页面，不刷新（避免跳转）
        var chatUpdateHandler = function (e) {
            // 检查当前是否在聊天详情页面
            var isInChatDetail =
                $root.find(".xiaoxin-wechat-chat-detail-main").length > 0;
            if (isInChatDetail) {
                // 在聊天详情页面，不刷新（聊天详情页面有自己的消息更新机制）
                console.info(
                    "[小馨手机][微信] 收到聊天更新事件，当前在聊天详情页面，不刷新列表"
                );
                return;
            }

            // 检查是否有角色消息（需要等待队列显示）
            var eventMessages = (e.detail && e.detail.messages) || [];
            var hasCharacterMessages = eventMessages.some(function (msg) {
                return msg.isOutgoing === false;
            });

            if (hasCharacterMessages) {
                // 有角色消息，不立即刷新（等待队列管理器显示）
                console.info(
                    "[小馨手机][微信] 收到角色消息，等待队列管理器显示，不立即刷新列表"
                );
                return;
            }

            console.info("[小馨手机][微信] 收到聊天更新事件，刷新聊天列表");
            // 重新渲染聊天页面（只刷新聊天列表部分）
            _renderChatPage($root, mobilePhone);
        };
        window.addEventListener("xiaoxin-chat-updated", chatUpdateHandler);

        // 监听朋友圈更新事件，更新发现tab红点
        var momentsUpdatedHandler = function () {
            _updateDiscoverTabBadge($tabBar);
        };
        window.addEventListener("xiaoxin-moments-updated", momentsUpdatedHandler);
        $root.data("momentsUpdatedHandler", momentsUpdatedHandler);

        // 监听消息显示完成事件，更新聊天列表（当消息队列管理器显示消息时）
        var messageDisplayedHandler = function (e) {
            // 检查当前是否在聊天详情页面
            var isInChatDetail =
                $root.find(".xiaoxin-wechat-chat-detail-main").length > 0;
            if (isInChatDetail) {
                // 在聊天详情页面，不刷新列表（聊天详情页面有自己的消息更新机制）
                return;
            }

            // 检查当前是否在聊天列表页面
            var isInChatList =
                $root.find(".xiaoxin-wechat-chat-main").length > 0;
            if (!isInChatList) {
                // 不在聊天列表页面，不刷新
                return;
            }

            console.info(
                "[小馨手机][微信] 收到消息显示完成事件，更新聊天列表:",
                e.detail && e.detail.contactId
            );
            // 重新渲染聊天页面（只刷新聊天列表部分）
            _renderChatPage($root, mobilePhone);
        };
        window.addEventListener(
            "xiaoxin-message-displayed",
            messageDisplayedHandler
        );
        $root.data("messageDisplayedHandler", messageDisplayedHandler);

        // 监听跳转到聊天页面事件（来自消息弹窗）
        var jumpToChatHandler = function (e) {
            var contactId = e.detail && e.detail.contactId;
            var contact = e.detail && e.detail.contact;

            if (!contactId) {
                console.warn(
                    "[小馨手机][微信] 跳转聊天页面失败：未提供联系人ID"
                );
                return;
            }

            console.info("[小馨手机][微信] 收到跳转聊天页面事件:", contactId);

            // 确保在微信主页（如果不是，先切换到微信主页）
            var isInChatMain =
                $root.find(".xiaoxin-wechat-chat-main").length > 0;
            if (!isInChatMain) {
                // 切换到微信主页
                _renderChatPage($root, mobilePhone);
                // 等待页面渲染完成后再跳转
                setTimeout(function () {
                    _renderChatDetailPage($root, mobilePhone, contactId, {
                        userId: contactId,
                        contact: contact,
                    });
                }, 100);
            } else {
                // 直接跳转到聊天详情页面
                _renderChatDetailPage($root, mobilePhone, contactId, {
                    userId: contactId,
                    contact: contact,
                });
            }
        };
        window.addEventListener(
            "xiaoxin-wechat-jump-to-chat",
            jumpToChatHandler
        );
        $root.data("jumpToChatHandler", jumpToChatHandler);

        // 监听联系人更新事件，如果联系人成为好友，也可能需要刷新聊天列表
        var contactUpdateHandler = function (e) {
            if (e.detail && e.detail.status === "accepted") {
                console.info(
                    "[小馨手机][微信] 收到联系人更新事件（好友申请已同意），刷新聊天列表"
                );
                // 延迟一下，确保聊天记录已经创建
                setTimeout(function () {
                    _renderChatPage($root, mobilePhone);
                }, 100);
            }
        };
        window.addEventListener(
            "xiaoxin-contact-updated",
            contactUpdateHandler
        );

        // 保存事件处理器引用，以便在页面切换时清理
        $root.data("chatUpdateHandler", chatUpdateHandler);
        $root.data("contactUpdateHandler", contactUpdateHandler);

        // 标签页点击事件处理
        $tabBar.on("click", ".xiaoxin-wechat-tab", function () {
            var tabId = $(this).data("tab");
            if (!tabId) return;

            // 更新标签页状态
            $tabBar.find(".xiaoxin-wechat-tab").removeClass("active");
            $(this).addClass("active");

            // 更新标签页图标
            $tabBar.find(".xiaoxin-wechat-tab").each(function () {
                var $tab = $(this);
                var currentTabId = $tab.data("tab");
                var tabInfo = tabs.find(function (t) {
                    return t.id === currentTabId;
                });
                if (tabInfo) {
                    var isActive = $tab.hasClass("active");
                    $tab.find(".xiaoxin-wechat-tab-icon").css(
                        "background-image",
                        "url('" +
                            (isActive
                                ? tabInfo.iconActive
                                : tabInfo.iconInactive) +
                            "')"
                    );
                }
            });

            // 切换页面前，清理通讯录页面的事件监听器
            _cleanupContactsPageEvents();

            // 切换页面前，清理通讯录页面的事件监听器
            _cleanupContactsPageEvents();

            // 切换页面
            if (tabId === "chat") {
                _renderChatPage($root, mobilePhone);
            } else if (tabId === "contacts") {
                _renderContactsPage($root, mobilePhone);
            } else if (tabId === "discover") {
                _renderDiscoverPage($root, mobilePhone);
            } else if (tabId === "me") {
                _renderMePage($root, mobilePhone);
            }
        });
    }

    // 语音已读事件处理：简单地重新渲染聊天主页，确保预览颜色更新
    function _handleVoiceReadUpdated() {
        var $root = $(".xiaoxin-wechat-root");
        if ($root.length === 0) return;
        var mobilePhone = $root.data("mobilePhone");
        if (!mobilePhone) return;
        _renderChatPage($root, mobilePhone);
    }

    // ========== 渲染聊天详情页面 ==========
    function _renderChatDetailPage($root, mobilePhone, userId, chatInfo) {
        console.info("[小馨手机][微信] 渲染聊天详情页面，userId:", userId);

        var $main = $(
            '<div class="xiaoxin-wechat-main xiaoxin-wechat-chat-detail-main"></div>'
        );

        // 获取联系人信息
        var contact = null;
        if (window.XiaoxinWeChatDataHandler) {
            var contacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
            contact = contacts.find(function (c) {
                var cId = String(c.id || "").trim();
                var cWechatId = String(c.wechatId || "").trim();
                var cCharId = String(c.characterId || "").trim();
                var userIdStr = String(userId).trim();

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
        }

        // 如果没有找到联系人，使用聊天信息中的信息
        if (!contact && chatInfo) {
            contact = {
                id: userId, // 严格使用 userId 作为 ID，确保通话匹配正确
                characterId: userId, // 同时设置 characterId，用于通话时的 ID 匹配
                wechatId: userId, // 设置 wechatId，确保多种匹配方式都指向正确的角色
                nickname: chatInfo.name || userId, // 仅用于显示的昵称
                remark: chatInfo.remark || null, // 保留备注信息，仅用于显示
                avatar:
                    chatInfo.avatar ||
                    "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg",
            };
        }

        // 如果没有联系人信息，创建一个默认的
        if (!contact) {
            contact = {
                id: userId, // 严格使用 userId 作为 ID
                characterId: userId, // 同时设置 characterId
                wechatId: userId, // 设置 wechatId
                nickname: userId, // 仅用于显示
                avatar: "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg",
            };
        }

        // 注意：红点清除机制已移至 components.js 和 chat.js 中统一管理
        // 当玩家点击或停留在聊天页面时，chat.js 会自动清除红点

        // 使用聊天UI模块渲染聊天界面
        if (
            window.XiaoxinWeChatChatUI &&
            window.XiaoxinWeChatChatUI.renderChatScreen
        ) {
            var chatElement = window.XiaoxinWeChatChatUI.renderChatScreen(
                userId,
                {
                    contact: contact,
                    onBack: function () {
                        // 返回按钮：返回到微信主页（聊天列表）
                        // 优先使用当前闭包中的 $root/mobilePhone，避免 DOM 查找失败导致无法返回
                        if ($root && $root.length && mobilePhone) {
                            _renderChatPage($root, mobilePhone);
                            return;
                        }
                        // 兜底：从 DOM 中获取 root 和 mobilePhone
                        var $wechatRoot = $(".xiaoxin-wechat-root").first();
                        var wechatMobilePhone = $wechatRoot.data("mobilePhone");
                        if ($wechatRoot.length > 0 && wechatMobilePhone) {
                            _renderChatPage($wechatRoot, wechatMobilePhone);
                        } else {
                            console.warn(
                                "[小馨手机][微信] 聊天返回失败：未找到可用的 root/mobilePhone"
                            );
                        }
                    },
                }
            );

            $main.append(chatElement);
        } else {
            // 如果聊天UI模块未加载，显示错误提示
            console.warn("[小馨手机][微信] 聊天UI模块未加载");
            $main.html(
                '<div style="padding: 20px; text-align: center; color: #999;">聊天功能加载中...</div>'
            );
        }

        $root.empty().append($main);
    }

    // ========== 渲染"我"页面 ==========
    function _renderMePage($root, mobilePhone) {
        console.info('[小馨手机][微信] 渲染"我"页面');
        _currentPage = "me";

        var account = _getAccount();
        if (!account) {
            console.warn("[小馨手机][微信] 无法获取账号信息");
            return;
        }

        var $main = $(
            '<div class="xiaoxin-wechat-main xiaoxin-wechat-me-main"></div>'
        );

        // 用户信息区域（从顶部开始，没有标题栏和搜索栏）
        var $profileSection = $(
            '<div class="xiaoxin-wechat-me-profile"></div>'
        );

        // 头像
        var $avatar = $('<div class="xiaoxin-wechat-me-avatar"></div>');
        var avatarUrl =
            account.avatar ||
            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
        $avatar.css("background-image", "url(" + avatarUrl + ")");
        $avatar.data("avatar", avatarUrl);

        // 点击头像可以修改
        $avatar.on("click", function () {
            // 传入回调函数，当确认修改头像时保存到账号数据
            _showAvatarPicker($(this), $root, function (newAvatarUrl, avatarDescription) {
                _updateAccountField("avatar", newAvatarUrl, "头像已更新");
                // 如果提供了头像描述，也保存它
                if (avatarDescription !== undefined) {
                    if (avatarDescription) {
                        _updateAccountField("avatarDescription", avatarDescription, "头像描述已更新");
                    } else {
                        // 如果描述为空，删除该字段
                        var account = _getAccount();
                        if (account) {
                            delete account.avatarDescription;
                            _setAccount(account);
                        }
                    }
                }
            });
        });

        // 用户信息右侧
        var $profileInfo = $('<div class="xiaoxin-wechat-me-info"></div>');
        var $nickname = $(
            '<div class="xiaoxin-wechat-me-nickname">' +
                escapeHtml(account.nickname || "微信用户") +
                "</div>"
        );
        var $wechatId = $(
            '<div class="xiaoxin-wechat-me-wechat-id">微信号: ' +
                escapeHtml(account.wechatId || account.id || "") +
                "</div>"
        );

        // 状态按钮
        var $profileActions = $(
            '<div class="xiaoxin-wechat-me-actions"></div>'
        );
        var $statusBtn = $(
            '<div class="xiaoxin-wechat-me-status-btn"><span>+</span> 状态</div>'
        );

        $profileActions.append($statusBtn);
        $profileInfo.append($nickname, $wechatId, $profileActions);

        // 更多按钮（二维码图标）已删除

        $profileSection.append($avatar, $profileInfo);

        // 菜单列表
        var $menuList = $('<div class="xiaoxin-wechat-me-menu-list"></div>');

        // 钱包图标 SVG
        var walletIconSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M19 7H5C3.89543 7 3 7.89543 3 9V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V9C21 7.89543 20.1046 7 19 7Z" stroke="#07c160" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M3 10H21" stroke="#07c160" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M7 15H7.01" stroke="#07c160" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M3 7V5C3 3.89543 3.89543 3 5 3H17C18.1046 3 19 3.89543 19 5V7" stroke="#07c160" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>';

        // 菜单项：钱包、收藏、表情、设置
        var menuItems = [
            {
                icon: walletIconSvg,
                label: "钱包",
                action: function () {
                    console.info("[小馨手机][微信] 点击钱包");
                    // 渲染钱包页面
                    if (
                        window.XiaoxinWeChatWallet &&
                        typeof window.XiaoxinWeChatWallet
                            .renderWalletPage === "function"
                    ) {
                        window.XiaoxinWeChatWallet.renderWalletPage(
                            $root,
                            mobilePhone
                        );
                    } else {
                        console.warn("[小馨手机][微信] 钱包页面模块未加载");
                        if (typeof toastr !== "undefined") {
                            toastr.warning("钱包页面模块未加载", "小馨手机");
                        }
                    }
                },
            },
            {
                icon: '<i class="fa-solid fa-check-circle" style="color: #07c160;"></i>',
                label: "收藏",
                action: function () {
                    console.info("[小馨手机][微信] 点击收藏");
                    if (typeof toastr !== "undefined") {
                        toastr.info("收藏功能待实现", "小馨手机");
                    }
                },
            },
            {
                icon: '<i class="fa-solid fa-face-smile" style="color: #ffc107;"></i>',
                label: "表情",
                action: function () {
                    console.info("[小馨手机][微信] 点击表情");
                    if (typeof toastr !== "undefined") {
                        toastr.info("表情功能待实现", "小馨手机");
                    }
                },
            },
            {
                icon: '<i class="fa-solid fa-gear" style="color: #4a9eff;"></i>',
                label: "设置",
                action: function () {
                    console.info("[小馨手机][微信] 点击设置");
                    // 渲染设置页面
                    if (
                        window.XiaoxinWeChatSettings &&
                        typeof window.XiaoxinWeChatSettings
                            .renderSettingsPage === "function"
                    ) {
                        window.XiaoxinWeChatSettings.renderSettingsPage(
                            $root,
                            mobilePhone
                        );
                    } else {
                        console.warn("[小馨手机][微信] 设置页面模块未加载");
                        if (typeof toastr !== "undefined") {
                            toastr.warning("设置页面模块未加载", "小馨手机");
                        }
                    }
                },
            },
        ];

        menuItems.forEach(function (item, index) {
            var $menuItem = $(
                '<div class="xiaoxin-wechat-me-menu-item"></div>'
            );
            var $menuIcon = $(
                '<div class="xiaoxin-wechat-me-menu-icon">' +
                    item.icon +
                    "</div>"
            );
            var $menuLabel = $(
                '<div class="xiaoxin-wechat-me-menu-label">' +
                    item.label +
                    "</div>"
            );
            var $menuArrow = $(
                '<div class="xiaoxin-wechat-me-menu-arrow"><i class="fa-solid fa-chevron-right"></i></div>'
            );

            $menuItem.append($menuIcon, $menuLabel, $menuArrow);

            // 点击事件
            $menuItem.on("click", function () {
                if (typeof item.action === "function") {
                    item.action();
                }
            });

            $menuList.append($menuItem);

            // 在钱包和收藏之间添加分隔线
            if (index === 0) {
                var $divider = $(
                    '<div class="xiaoxin-wechat-me-menu-divider"></div>'
                );
                $menuList.append($divider);
            }
            // 在表情和设置之间添加分隔线
            else if (index === 2) {
                var $divider = $(
                    '<div class="xiaoxin-wechat-me-menu-divider"></div>'
                );
                $menuList.append($divider);
            }
        });

        // 底部导航栏
        var $tabBar = $('<div class="xiaoxin-wechat-tab-bar"></div>');
        var tabs = [
            {
                id: "chat",
                label: "微信",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微信图标已选中.png",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微信图标未选中.jpg",
                active: false,
            },
            {
                id: "contacts",
                label: "通讯录",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/通讯录图标已选中.png",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/通讯录图标未选中.jpg",
                active: false,
            },
            {
                id: "discover",
                label: "发现",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/发现图标已选中.png",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/发现图标未选中.jpg",
                active: false,
            },
            {
                id: "me",
                label: "我",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/我的图标已选中.jpg",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/我的图标未选中.png",
                active: true,
            },
        ];

        tabs.forEach(function (tab) {
            var $tab = $(
                '<div class="xiaoxin-wechat-tab" data-tab="' +
                    tab.id +
                    '"></div>'
            );
            if (tab.active) {
                $tab.addClass("active");
            }
            var $tabIcon = $(
                '<div class="xiaoxin-wechat-tab-icon" style="background-image: url(\'' +
                    (tab.active ? tab.iconActive : tab.iconInactive) +
                    "');\"></div>"
            );
            // 为“发现”tab添加红点占位元素（用于有新朋友圈时提示）
            if (tab.id === "discover") {
                var $dot = $(
                    '<div class="xiaoxin-wechat-tab-red-dot" style="display:none;"></div>'
                );
                $tabIcon.css("position", "relative");
                $tabIcon.append($dot);
                $tab.data("redDot", $dot);
            }
            var $tabLabel = $(
                '<div class="xiaoxin-wechat-tab-label">' + tab.label + "</div>"
            );
            $tab.append($tabIcon, $tabLabel);
            $tabBar.append($tab);
        });

        $main.append($profileSection, $menuList, $tabBar);
        $root.empty().append($main);

        // 初始化时立即更新导航栏红点
        if (window.XiaoxinWeChatComponents) {
            window.XiaoxinWeChatComponents.updateTabBarBadge($tabBar);
            window.XiaoxinWeChatComponents.updateContactsTabBadge($tabBar);
            console.info("[小馨手机][微信] 我页面初始化未读数显示");
        }
        _updateDiscoverTabBadge($tabBar);

        // 监听未读消息数更新事件，更新导航栏红点
        var unreadUpdateHandler = function () {
            if (window.XiaoxinWeChatComponents) {
                window.XiaoxinWeChatComponents.updateTabBarBadge($tabBar);
                window.XiaoxinWeChatComponents.updateContactsTabBadge($tabBar);
            }
            _updateDiscoverTabBadge($tabBar);
        };
        window.addEventListener(
            "xiaoxin-unread-count-updated",
            unreadUpdateHandler
        );
        $root.data("unreadUpdateHandler", unreadUpdateHandler);

        // 监听朋友圈更新事件，更新发现tab红点
        var momentsUpdatedHandler = function () {
            _updateDiscoverTabBadge($tabBar);
        };
        window.addEventListener("xiaoxin-moments-updated", momentsUpdatedHandler);
        $root.data("momentsUpdatedHandler", momentsUpdatedHandler);

        // 监听好友申请更新事件：用于持久化“通讯录”tab红点（切到发现/我时也不丢）
        var friendRequestUpdateHandler = function () {
            if (window.XiaoxinWeChatComponents) {
                window.XiaoxinWeChatComponents.updateContactsTabBadge($tabBar);
            }
        };
        window.addEventListener(
            "xiaoxin-friend-request-updated",
            friendRequestUpdateHandler
        );
        $root.data("friendRequestUpdateHandler", friendRequestUpdateHandler);

        // 标签页点击事件处理
        $tabBar.on("click", ".xiaoxin-wechat-tab", function () {
            var tabId = $(this).data("tab");
            if (!tabId) return;

            // 更新标签页状态
            $tabBar.find(".xiaoxin-wechat-tab").removeClass("active");
            $(this).addClass("active");

            // 更新标签页图标
            $tabBar.find(".xiaoxin-wechat-tab").each(function () {
                var $tab = $(this);
                var currentTabId = $tab.data("tab");
                var tabInfo = tabs.find(function (t) {
                    return t.id === currentTabId;
                });
                if (tabInfo) {
                    var isActive = $tab.hasClass("active");
                    $tab.find(".xiaoxin-wechat-tab-icon").css(
                        "background-image",
                        "url('" +
                            (isActive
                                ? tabInfo.iconActive
                                : tabInfo.iconInactive) +
                            "')"
                    );
                }
            });

            // 切换页面前，清理通讯录页面的事件监听器
            _cleanupContactsPageEvents();

            // 切换页面前，清理通讯录页面的事件监听器
            _cleanupContactsPageEvents();

            // 切换页面
            if (tabId === "chat") {
                _renderChatPage($root, mobilePhone);
            } else if (tabId === "contacts") {
                _renderContactsPage($root, mobilePhone);
            } else if (tabId === "discover") {
                _renderDiscoverPage($root, mobilePhone);
            } else if (tabId === "me") {
                _renderMePage($root, mobilePhone);
            }
        });
    }

    // ========== 渲染通讯录页面 ==========
    // 用于存储联系人更新事件监听器的清理函数
    var _contactsPageEventCleanup = null;

    // 统一的页面切换清理函数
    function _cleanupContactsPageEvents() {
        if (_contactsPageEventCleanup) {
            _contactsPageEventCleanup();
            _contactsPageEventCleanup = null;
        }
    }

    // 通讯录页面渲染防抖：存储待处理的刷新请求
    var _contactsPageRenderTimeout = null;
    var _contactsPageNeedsRefresh = false;

    function _renderContactsPage($root, mobilePhone) {
        console.info("[小馨手机][微信] 渲染通讯录页面");
        _currentPage = "contacts";

        var account = _getAccount();
        if (!account) {
            console.warn("[小馨手机][微信] 无法获取账号信息，跳转到注册页");
            _renderRegisterPage($root, mobilePhone);
            return;
        }

        // 清理之前的事件监听器（如果存在）
        if (_contactsPageEventCleanup) {
            _contactsPageEventCleanup();
            _contactsPageEventCleanup = null;
        }

        // 清除待处理的刷新请求（因为现在要进行完整渲染）
        if (_contactsPageRenderTimeout) {
            clearTimeout(_contactsPageRenderTimeout);
            _contactsPageRenderTimeout = null;
        }
        _contactsPageNeedsRefresh = false;

        // 外层容器（不滚动，包含导航栏）
        var $main = $('<div class="xiaoxin-wechat-main"></div>');

        // 内容容器（可滚动）
        var $content = $('<div class="xiaoxin-wechat-contacts-main"></div>');

        // 标题栏
        var $header = $('<div class="xiaoxin-wechat-contacts-header"></div>');
        var $headerBar = $(
            '<div class="xiaoxin-wechat-contacts-header-bar"></div>'
        );

        // 左侧占位元素，宽度与右侧加号按钮相同，确保标题居中
        var $headerLeft = $(
            '<div class="xiaoxin-wechat-contacts-header-left"></div>'
        );
        $headerLeft.css({
            width: "24px",
            flexShrink: 0,
        });

        var $headerTitle = $(
            '<div class="xiaoxin-wechat-contacts-header-title">通讯录</div>'
        );

        var $headerAdd = $(
            '<div class="xiaoxin-wechat-contacts-header-add">+</div>'
        );
        $headerAdd.on("click", function () {
            console.info("[小馨手机][微信] 点击添加朋友");
            // 调用添加朋友页面
            if (
                window.XiaoxinWeChatContacts &&
                window.XiaoxinWeChatContacts.renderAddFriendPage
            ) {
                window.XiaoxinWeChatContacts.renderAddFriendPage(
                    $root,
                    mobilePhone,
                    "通讯录"
                );
            } else {
                if (typeof toastr !== "undefined") {
                    toastr.info("添加朋友功能待实现", "小馨手机");
                }
            }
        });

        $headerBar.append($headerLeft, $headerTitle, $headerAdd);
        $header.append($headerBar);

        // 搜索栏
        var $search = $('<div class="xiaoxin-wechat-contacts-search"></div>');
        var $searchBar = $(
            '<div class="xiaoxin-wechat-contacts-search-bar"></div>'
        );
        // 使用原生 placeholder，不再使用单独的文字 div
        var $searchInput = $(
            '<input type="text" class="xiaoxin-wechat-contacts-search-input" placeholder="搜索">'
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
            console.info("[小馨手机][微信] 通讯录搜索框获得焦点");
        });
        $searchBar.append($searchInput);
        $search.append($searchBar);

        // 功能栏
        var $features = $(
            '<div class="xiaoxin-wechat-contacts-features"></div>'
        );
        var features = [
            {
                icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/新的朋友.jpg",
                label: "新的朋友",
                action: function () {
                    console.info("[小馨手机][微信] 点击新的朋友");
                    // 只有当好友申请指令已经写入正文后，新的朋友页面才会有数据
                    if (
                        window.XiaoxinWeChatContacts &&
                        window.XiaoxinWeChatContacts.renderNewFriendsPage
                    ) {
                        window.XiaoxinWeChatContacts.renderNewFriendsPage(
                            $root,
                            mobilePhone
                        );
                    } else if (typeof toastr !== "undefined") {
                        toastr.info("新的朋友功能待实现", "小馨手机");
                    }
                },
            },
            {
                icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/仅聊天的朋友.png",
                label: "仅聊天的朋友",
                action: function () {
                    console.info("[小馨手机][微信] 点击仅聊天的朋友");
                    if (typeof toastr !== "undefined") {
                        toastr.info("仅聊天的朋友功能待实现", "小馨手机");
                    }
                },
            },
            {
                icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/群聊.jpg",
                label: "群聊",
                action: function () {
                    console.info("[小馨手机][微信] 点击群聊");
                    if (typeof toastr !== "undefined") {
                        toastr.info("群聊功能待实现", "小馨手机");
                    }
                },
            },
            {
                icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/标签.png",
                label: "标签",
                action: function () {
                    console.info("[小馨手机][微信] 点击标签");
                    if (typeof toastr !== "undefined") {
                        toastr.info("标签功能待实现", "小馨手机");
                    }
                },
            },
        ];

        features.forEach(function (feature) {
            var $item = $(
                '<div class="xiaoxin-wechat-contacts-feature-item"></div>'
            );
            var $icon = $(
                '<div class="xiaoxin-wechat-contacts-feature-icon"></div>'
            );
            $icon.css("background-image", "url(" + feature.icon + ")");
            var $label = $(
                '<div class="xiaoxin-wechat-contacts-feature-label">' +
                    escapeHtml(feature.label) +
                    "</div>"
            );
            $item.append($icon, $label);
            $item.on("click", feature.action);
            $features.append($item);
        });

        // 联系人列表
        var $contactsList = $(
            '<div class="xiaoxin-wechat-contacts-list"></div>'
        );

        // 获取联系人数据
        var allContacts = [];
        if (window.XiaoxinWeChatDataHandler) {
            allContacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
        }

        // 只显示真正的好友（isFriend === true）
        var friendContacts = (allContacts || []).filter(function (c) {
            return c.isFriend === true || c.friendStatus === "friend";
        });

        console.info(
            "[小馨手机][微信] 通讯录页面: 好友联系人数量:",
            friendContacts.length,
            "总联系人数量:",
            allContacts.length
        );

        // ⚠️ 重要：通讯录页面始终显示所有好友，不根据当前聊天过滤
        // 这样可以确保所有已添加的好友都能在通讯录中看到，而不是只显示当前聊天中的好友
        var contacts = friendContacts;

        console.info(
            "[小馨手机][微信] 通讯录页面: 显示所有好友，不进行过滤，好友数量:",
            contacts.length
        );

        // 创建玩家自己的联系人对象（用于在通讯录中显示）
        // 确保头像URL有效（处理空字符串、带 url() 包裹等情况）
        var selfAvatar = account.avatar || "";
        if (selfAvatar) {
            selfAvatar = selfAvatar
                .toString()
                // 如果头像被存成了 'url("xxx")' 这样的形式，提取内部真实URL
                .replace(/^url\((['"]?)(.+?)\1\)$/i, "$2")
                .replace(/<br\s*\/?>/gi, "")
                .replace(/<[^>]*>/g, "")
                .trim();
        }
        if (!selfAvatar) {
            selfAvatar =
                "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
        }
        var selfContact = {
            id: account.id || account.wechatId || "self",
            wechatId: account.wechatId || account.id || "",
            nickname: account.nickname || "微信用户",
            name: account.nickname || "微信用户",
            avatar: selfAvatar,
            momentsBackground: account.momentsBackground || null, // 朋友圈背景
            isFriend: true,
            friendStatus: "friend",
            starred: false,
            isSelf: true // 标记为玩家自己
        };

        // 将玩家自己添加到联系人列表中
        contacts.push(selfContact);

        // 分离星标朋友和普通联系人
        var starredContacts = contacts.filter(function (c) {
            return c.starred === true;
        });
        var normalContacts = contacts.filter(function (c) {
            return c.starred !== true;
        });

        // 获取中文首字拼音首字母（简洁实现，使用 localeCompare）
        function getPinyinFirstLetter(char) {
            if (!/^[\u4e00-\u9fa5]$/.test(char)) {
                return null;
            }
            // 使用参考字符和 localeCompare 来确定拼音首字母
            var refChars = {
                A: "啊",
                B: "把",
                C: "擦",
                D: "大",
                E: "额",
                F: "发",
                G: "嘎",
                H: "哈",
                J: "家",
                K: "卡",
                L: "拉",
                M: "马",
                N: "那",
                O: "哦",
                P: "怕",
                Q: "七",
                R: "然",
                S: "撒",
                T: "他",
                W: "挖",
                X: "西",
                Y: "压",
                Z: "杂",
            };
            var collator = new Intl.Collator("zh-CN");

            // 找到当前字符应该属于哪个拼音首字母分组
            var sortedLetters = Object.keys(refChars).sort(function (a, b) {
                return collator.compare(refChars[a], refChars[b]);
            });

            for (var i = 0; i < sortedLetters.length; i++) {
                if (collator.compare(char, refChars[sortedLetters[i]]) < 0) {
                    return i > 0 ? sortedLetters[i - 1] : sortedLetters[0];
                }
            }
            return sortedLetters[sortedLetters.length - 1];
        }

        // 按字母分组联系人（支持中文拼音首字母）
        function groupContactsByLetter(contactsList) {
            var groups = {};
            contactsList.forEach(function (contact) {
                // 优先使用备注，其次昵称
                var name = _getContactDisplayName(contact, "");
                if (!name || name.length === 0) {
                    name = "#";
                }
                var firstChar = name.charAt(0);
                var groupKey = "#";

                // 判断首字符类型
                if (/^[A-Za-z]$/.test(firstChar)) {
                    // 英文字母
                    groupKey = firstChar.toUpperCase();
                } else if (/^[\u4e00-\u9fa5]$/.test(firstChar)) {
                    // 中文字符，获取拼音首字母
                    var pinyinLetter = getPinyinFirstLetter(firstChar);
                    groupKey = pinyinLetter || "#";
                } else if (/^[0-9]$/.test(firstChar)) {
                    // 数字
                    groupKey = "#";
                } else {
                    // 其他字符（符号等）
                    groupKey = "#";
                }

                if (!groups[groupKey]) {
                    groups[groupKey] = [];
                }
                groups[groupKey].push(contact);
            });

            // 对每个分组内的联系人按名称排序（支持中文拼音排序）
            Object.keys(groups).forEach(function (key) {
                groups[key].sort(function (a, b) {
                    var nameA = _getContactDisplayName(a, "");
                    var nameB = _getContactDisplayName(b, "");
                    // 使用 localeCompare 支持中文拼音排序
                    return nameA.localeCompare(nameB, "zh-CN", {
                        numeric: true,
                    });
                });
            });

            return groups;
        }

        // 渲染星标朋友部分
        if (starredContacts.length > 0) {
            var $starredSection = $(
                '<div class="xiaoxin-wechat-contacts-section" data-letter="starred"></div>'
            );
            var $starredHeader = $(
                '<div class="xiaoxin-wechat-contacts-section-header">' +
                    '<span class="xiaoxin-wechat-contacts-section-header-star">☆</span>' +
                    "<span>星标朋友</span>" +
                    "</div>"
            );
            $starredSection.append($starredHeader);

            starredContacts.forEach(function (contact) {
                var $item = $(
                    '<div class="xiaoxin-wechat-contacts-contact-item"></div>'
                );
                var $avatar = $(
                    '<div class="xiaoxin-wechat-contacts-contact-avatar"></div>'
                );
                var avatarUrl = contact.avatar || "";
                // 清理头像URL中的HTML标签（如<br>等）和空白字符
                if (avatarUrl) {
                    avatarUrl = avatarUrl
                        .toString()
                        .replace(/<br\s*\/?>/gi, "")
                        .replace(/<[^>]*>/g, "")
                        .trim();
                }
                console.info(
                    "[小馨手机][微信] 渲染星标联系人头像，联系人:",
                    _getContactDisplayName(contact, contact.id),
                    "清理后的头像URL:",
                    avatarUrl
                );

                // 确保头像URL是有效的
                if (avatarUrl && avatarUrl.trim() !== "") {
                    // 如果URL包含空格，需要编码
                    avatarUrl = avatarUrl.trim().replace(/\s+/g, "%20");
                    // 确保URL是完整的（注意：data/blob 这类 scheme 不能补 https://）
                    var isAbsolute =
                        avatarUrl.startsWith("http://") ||
                        avatarUrl.startsWith("https://") ||
                        avatarUrl.startsWith("/") ||
                        avatarUrl.startsWith("data:") ||
                        avatarUrl.startsWith("blob:");
                    if (!isAbsolute) {
                        avatarUrl = "https://" + avatarUrl;
                    }
                    $avatar.css("background-image", "url(" + avatarUrl + ")");
                    $avatar.css("background-size", "cover");
                    $avatar.css("background-position", "center");
                    $avatar.css("background-repeat", "no-repeat");
                    console.info(
                        "[小馨手机][微信] 设置星标联系人头像URL:",
                        avatarUrl
                    );
                } else {
                    // 如果没有头像URL，使用默认头像
                    var defaultAvatar =
                        "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
                    $avatar.css(
                        "background-image",
                        "url(" + defaultAvatar + ")"
                    );
                    console.info("[小馨手机][微信] 使用默认头像（星标联系人）");
                }
                // 清理昵称中的HTML标签（如<br>等），优先使用备注
                var displayName = _getContactDisplayName(contact, "未知");
                var cleanNickname = displayName
                    .replace(/<br\s*\/?>/gi, "")
                    .replace(/<[^>]*>/g, "")
                    .trim();
                var $name = $(
                    '<div class="xiaoxin-wechat-contacts-contact-name">' +
                        escapeHtml(cleanNickname) +
                        "</div>"
                );
                $item.append($avatar, $name);
                $item.on("click", function () {
                    console.info(
                        "[小馨手机][微信] 点击星标联系人:",
                        contact.name || contact.nickname || contact.id
                    );
                    // 调用联系人资料卡页面
                    if (
                        window.XiaoxinWeChatContacts &&
                        typeof window.XiaoxinWeChatContacts
                            .renderContactDetailPage === "function"
                    ) {
                        window.XiaoxinWeChatContacts.renderContactDetailPage(
                            $root,
                            mobilePhone,
                            contact,
                            "通讯录"
                        );
                    } else {
                        console.warn(
                            "[小馨手机][微信] renderContactDetailPage 方法不存在"
                        );
                        if (typeof toastr !== "undefined") {
                            toastr.info("联系人详情功能待实现", "小馨手机");
                        }
                    }
                });
                $starredSection.append($item);
            });

            $contactsList.append($starredSection);
        }

        // 渲染普通联系人（按字母分组）
        var contactGroups = groupContactsByLetter(normalContacts);
        var sortedKeys = Object.keys(contactGroups).sort(function (a, b) {
            if (a === "#") return 1;
            if (b === "#") return -1;
            return a.localeCompare(b);
        });

        sortedKeys.forEach(function (key) {
            var $section = $(
                '<div class="xiaoxin-wechat-contacts-section" data-letter="' +
                    escapeHtml(key) +
                    '"></div>'
            );
            var $header = $(
                '<div class="xiaoxin-wechat-contacts-section-header" data-letter="' +
                    escapeHtml(key) +
                    '">' +
                    key +
                    "</div>"
            );
            $section.append($header);

            contactGroups[key].forEach(function (contact) {
                var $item = $(
                    '<div class="xiaoxin-wechat-contacts-contact-item"></div>'
                );
                var $avatar = $(
                    '<div class="xiaoxin-wechat-contacts-contact-avatar"></div>'
                );
                var avatarUrl = contact.avatar || "";
                // 清理头像URL中的HTML标签（如<br>等）和空白字符
                if (avatarUrl) {
                    avatarUrl = avatarUrl
                        .toString()
                        .replace(/<br\s*\/?>/gi, "")
                        .replace(/<[^>]*>/g, "")
                        .trim();
                }
                console.info(
                    "[小馨手机][微信] 渲染联系人头像，联系人:",
                    _getContactDisplayName(contact, contact.id),
                    "清理后的头像URL:",
                    avatarUrl
                );

                // 确保头像URL是有效的
                if (avatarUrl && avatarUrl.trim() !== "") {
                    // 如果URL包含空格，需要编码
                    avatarUrl = avatarUrl.trim().replace(/\s+/g, "%20");
                    // 确保URL是完整的（注意：data/blob 这类 scheme 不能补 https://）
                    var isAbsolute =
                        avatarUrl.startsWith("http://") ||
                        avatarUrl.startsWith("https://") ||
                        avatarUrl.startsWith("/") ||
                        avatarUrl.startsWith("data:") ||
                        avatarUrl.startsWith("blob:");
                    if (!isAbsolute) {
                        avatarUrl = "https://" + avatarUrl;
                    }
                    $avatar.css("background-image", "url(" + avatarUrl + ")");
                    $avatar.css("background-size", "cover");
                    $avatar.css("background-position", "center");
                    $avatar.css("background-repeat", "no-repeat");
                    console.info(
                        "[小馨手机][微信] 设置联系人头像URL:",
                        avatarUrl
                    );
                } else {
                    // 如果没有头像URL，使用默认头像
                    var defaultAvatar =
                        "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
                    $avatar.css(
                        "background-image",
                        "url(" + defaultAvatar + ")"
                    );
                    console.info("[小馨手机][微信] 使用默认头像");
                }
                // 清理昵称中的HTML标签（如<br>等），优先使用备注
                var displayName = _getContactDisplayName(contact, "未知");
                var cleanNickname = displayName
                    .replace(/<br\s*\/?>/gi, "")
                    .replace(/<[^>]*>/g, "")
                    .trim();
                var $name = $(
                    '<div class="xiaoxin-wechat-contacts-contact-name">' +
                        escapeHtml(cleanNickname) +
                        "</div>"
                );
                $item.append($avatar, $name);
                $item.on("click", function () {
                    console.info(
                        "[小馨手机][微信] 点击联系人:",
                        displayName,
                        "ID:",
                        contact.id
                    );
                    // 调用联系人资料卡页面
                    if (
                        window.XiaoxinWeChatContacts &&
                        typeof window.XiaoxinWeChatContacts
                            .renderContactDetailPage === "function"
                    ) {
                        window.XiaoxinWeChatContacts.renderContactDetailPage(
                            $root,
                            mobilePhone,
                            contact,
                            "通讯录"
                        );
                    } else {
                        console.warn(
                            "[小馨手机][微信] renderContactDetailPage 方法不存在"
                        );
                        if (typeof toastr !== "undefined") {
                            toastr.info("联系人详情功能待实现", "小馨手机");
                        }
                    }
                });
                $section.append($item);
            });

            $contactsList.append($section);
        });

        // 字母索引栏
        var $index = $('<div class="xiaoxin-wechat-contacts-index"></div>');
        // 删除搜索图标，直接点击搜索栏即可

        if (starredContacts.length > 0) {
            var $indexStar = $(
                '<div class="xiaoxin-wechat-contacts-index-star">☆</div>'
            );
            $indexStar.on("click", function () {
                // 滚动到星标朋友部分
                var $starredSection = $contactsList
                    .find(".xiaoxin-wechat-contacts-section")
                    .first();
                if ($starredSection.length) {
                    // 滚动到内容容器，而不是联系人列表
                    var scrollOffset =
                        $starredSection.offset().top -
                        $content.offset().top +
                        $content.scrollTop();
                    $content.animate(
                        {
                            scrollTop: scrollOffset - 20,
                        },
                        200
                    );
                }
            });
            $index.append($indexStar);
        }

        // 添加字母索引
        sortedKeys.forEach(function (key) {
            var $indexItem = $(
                '<div class="xiaoxin-wechat-contacts-index-item">' +
                    key +
                    "</div>"
            );
            $indexItem.on("click", function () {
                // 滚动到对应字母分组
                var $targetSection = $contactsList.find(
                    '.xiaoxin-wechat-contacts-section[data-letter="' +
                        escapeHtml(key) +
                        '"]'
                );
                if ($targetSection.length) {
                    // 计算滚动位置：目标元素相对于内容容器的位置
                    var scrollOffset =
                        $targetSection.offset().top -
                        $content.offset().top +
                        $content.scrollTop();
                    // 使用动画滚动，更流畅
                    $content.animate(
                        {
                            scrollTop: scrollOffset - 20,
                        },
                        200
                    );
                } else {
                    console.warn("[小馨手机][微信] 未找到字母分组:", key);
                }
            });
            $index.append($indexItem);
        });

        // 底部导航栏
        var $tabBar = $('<div class="xiaoxin-wechat-tab-bar"></div>');
        var tabs = [
            {
                id: "chat",
                label: "微信",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微信图标已选中.png",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微信图标未选中.jpg",
                active: false,
            },
            {
                id: "contacts",
                label: "通讯录",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/通讯录图标已选中.png",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/通讯录图标未选中.jpg",
                active: true,
            },
            {
                id: "discover",
                label: "发现",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/发现图标已选中.png",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/发现图标未选中.jpg",
                active: false,
            },
            {
                id: "me",
                label: "我",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/我的图标已选中.jpg",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/我的图标未选中.png",
                active: false,
            },
        ];

        tabs.forEach(function (tab) {
            var $tab = $(
                '<div class="xiaoxin-wechat-tab" data-tab="' +
                    tab.id +
                    '"></div>'
            );
            if (tab.active) {
                $tab.addClass("active");
            }
            var $tabIcon = $(
                '<div class="xiaoxin-wechat-tab-icon" style="background-image: url(\'' +
                    (tab.active ? tab.iconActive : tab.iconInactive) +
                    "');\"></div>"
            );
            // 为“发现”tab添加红点占位元素（用于有新朋友圈时提示）
            if (tab.id === "discover") {
                var $dot = $(
                    '<div class="xiaoxin-wechat-tab-red-dot" style="display:none;"></div>'
                );
                $tabIcon.css("position", "relative");
                $tabIcon.append($dot);
                $tab.data("redDot", $dot);
            }
            var $tabLabel = $(
                '<div class="xiaoxin-wechat-tab-label">' + tab.label + "</div>"
            );
            $tab.append($tabIcon, $tabLabel);
            $tabBar.append($tab);
        });

        // 更新导航栏"微信"按钮红点
        if (window.XiaoxinWeChatComponents) {
            window.XiaoxinWeChatComponents.updateTabBarBadge($tabBar);
            window.XiaoxinWeChatComponents.updateContactsTabBadge($tabBar);
        }
        _updateDiscoverTabBadge($tabBar);

        // 字母索引栏固定定位，不需要添加到联系人列表中
        // 直接添加到主容器中，使其固定在视口中

        // 将内容添加到内容容器中（可滚动区域，不包含标题栏和搜索栏）
        // 在功能栏之前添加未读好友申请弹窗
        var $friendRequestNotification = null;
        if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getFriendRequests === "function") {
            var requests = window.XiaoxinWeChatDataHandler.getFriendRequests() || [];
            // 获取最新的未读好友申请（角色向玩家发起的、状态为pending的）
            var pendingRequests = requests.filter(function (req) {
                return req.direction === "role_to_player" && req.status === "pending";
            });

            if (pendingRequests.length > 0) {
                // 取最新的一个申请
                var latestRequest = pendingRequests[0];
                var contact = latestRequest.contact || null;

                // 如果请求里没有附带联系人信息，尝试从联系人列表中查找
                if (!contact && latestRequest.roleId) {
                    var contacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
                    var roleIdStr = String(latestRequest.roleId || "").trim();
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
                    var displayName = (contact.remark && contact.remark.trim()) || contact.nickname || "微信用户";
                    var avatarUrl = contact.avatar || "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
                    var greetingText = latestRequest.greeting || "";

                    $friendRequestNotification = $(
                        '<div class="xiaoxin-wechat-contacts-friend-request-notification"></div>'
                    );

                    var $notificationAvatar = $(
                        '<div class="xiaoxin-wechat-contacts-friend-request-notification-avatar"></div>'
                    );
                    $notificationAvatar.css("background-image", "url(" + avatarUrl + ")");

                    var $notificationContent = $(
                        '<div class="xiaoxin-wechat-contacts-friend-request-notification-content"></div>'
                    );
                    var $notificationName = $(
                        '<div class="xiaoxin-wechat-contacts-friend-request-notification-name">' +
                            escapeHtml(displayName) +
                            "</div>"
                    );
                    var $notificationGreeting = $(
                        '<div class="xiaoxin-wechat-contacts-friend-request-notification-greeting">' +
                            escapeHtml(greetingText) +
                            "</div>"
                    );
                    $notificationContent.append($notificationName, $notificationGreeting);

                    // 未读红点
                    var $badge = $(
                        '<div class="xiaoxin-wechat-contacts-friend-request-notification-badge"></div>'
                    );
                    $badge.text(pendingRequests.length > 99 ? "99+" : pendingRequests.length);

                    $friendRequestNotification.append($notificationAvatar, $notificationContent, $badge);

                    // 点击弹窗，跳转到"新的朋友"页面
                    $friendRequestNotification.on("click", function () {
                        if (
                            window.XiaoxinWeChatContacts &&
                            window.XiaoxinWeChatContacts.renderNewFriendsPage
                        ) {
                            window.XiaoxinWeChatContacts.renderNewFriendsPage($root, mobilePhone);
                        }
                    });
                }
            }
        }

        // 如果有未读好友申请弹窗，先添加它，然后添加功能栏和联系人列表
        if ($friendRequestNotification) {
            $content.append($friendRequestNotification, $features, $contactsList);
        } else {
        $content.append($features, $contactsList);
        }

        // 将标题栏、搜索栏、内容容器、字母索引栏和导航栏添加到主容器中
        // 字母索引栏固定定位，不随页面滚动
        $main.append($header, $search, $content, $index, $tabBar);
        $root.empty().append($main);

        // 监听未读消息数更新事件，更新导航栏红点
        var unreadUpdateHandler = function () {
            if (window.XiaoxinWeChatComponents) {
                window.XiaoxinWeChatComponents.updateTabBarBadge($tabBar);
                window.XiaoxinWeChatComponents.updateContactsTabBadge($tabBar);
            }
            _updateDiscoverTabBadge($tabBar);
        };
        window.addEventListener(
            "xiaoxin-unread-count-updated",
            unreadUpdateHandler
        );
        $root.data("unreadUpdateHandler", unreadUpdateHandler);

        // 监听朋友圈更新事件，更新发现tab红点
        var momentsUpdatedHandler = function () {
            _updateDiscoverTabBadge($tabBar);
        };
        window.addEventListener("xiaoxin-moments-updated", momentsUpdatedHandler);
        $root.data("momentsUpdatedHandler", momentsUpdatedHandler);

        // 监听好友申请更新事件，更新通讯录tab的badge和弹窗
        var friendRequestUpdateHandler = function () {
            if (window.XiaoxinWeChatComponents) {
                window.XiaoxinWeChatComponents.updateContactsTabBadge($tabBar);
            }
            // 重新渲染通讯录页面以更新弹窗
            setTimeout(function () {
                _renderContactsPage($root, mobilePhone);
            }, 100);
        };
        window.addEventListener(
            "xiaoxin-friend-request-updated",
            friendRequestUpdateHandler
        );
        $root.data("friendRequestUpdateHandler", friendRequestUpdateHandler);

        // 初始化时更新通讯录tab的badge
        if (window.XiaoxinWeChatComponents) {
            window.XiaoxinWeChatComponents.updateContactsTabBadge($tabBar);
        }

        // 监听联系人更新事件，自动刷新通讯录页面
        // 使用防抖机制：在短时间内收集所有事件，然后一起处理，避免多次重复渲染
        function scheduleContactsRefresh() {
            if (_contactsPageRenderTimeout) {
                console.info("[小馨手机][微信] 通讯录页面: 已有待处理的刷新任务，合并新事件");
                _contactsPageNeedsRefresh = true;
                return;
            }

            console.info("[小馨手机][微信] 通讯录页面: 安排刷新任务（300ms后执行）");
            _contactsPageRenderTimeout = setTimeout(function () {
                _contactsPageRenderTimeout = null;
                if (_currentPage === "contacts") {
                    console.info("[小馨手机][微信] 通讯录页面: 执行防抖后的刷新");
                    _renderContactsPage($root, mobilePhone);
                } else {
                    console.info("[小馨手机][微信] 通讯录页面: 当前不在通讯录页面，取消刷新");
                }
            }, 300); // 增加防抖延迟到300ms，确保所有事件都被收集
        }

        function handleContactAdded(event) {
            console.info("[小馨手机][微信] 收到联系人添加事件");
            scheduleContactsRefresh();
        }

        function handleContactUpdated(event) {
            console.info("[小馨手机][微信] 收到联系人更新事件");
            var detail = event.detail || {};
            var skipFriendAddedFlow = detail.skipFriendAddedFlow || false;

            // 如果标记了跳过好友添加流程（pending_verify 状态），不刷新
            if (skipFriendAddedFlow) {
                console.info(
                    "[小馨手机][微信] 通讯录页面: 跳过好友添加流程（pending_verify），不刷新"
                );
                return;
            }

            scheduleContactsRefresh();
        }

        function handleContactRemoved(event) {
            console.info("[小馨手机][微信] 收到联系人删除事件");
            scheduleContactsRefresh();
        }

        // 添加事件监听器
        window.addEventListener("xiaoxin-contact-added", handleContactAdded);
        window.addEventListener(
            "xiaoxin-contact-updated",
            handleContactUpdated
        );
        window.addEventListener(
            "xiaoxin-contact-removed",
            handleContactRemoved
        );

        // 保存清理函数
        _contactsPageEventCleanup = function () {
            window.removeEventListener(
                "xiaoxin-contact-added",
                handleContactAdded
            );
            window.removeEventListener(
                "xiaoxin-contact-updated",
                handleContactUpdated
            );
            window.removeEventListener(
                "xiaoxin-contact-removed",
                handleContactRemoved
            );
            // 清理防抖定时器
            if (_contactsPageRenderTimeout) {
                clearTimeout(_contactsPageRenderTimeout);
                _contactsPageRenderTimeout = null;
            }
            _contactsPageNeedsRefresh = false;
            console.info("[小馨手机][微信] 已清理通讯录页面事件监听器");
        };

        // 标签页点击事件处理
        $tabBar.on("click", ".xiaoxin-wechat-tab", function () {
            var tabId = $(this).data("tab");
            if (!tabId) return;

            // 更新标签页状态
            $tabBar.find(".xiaoxin-wechat-tab").removeClass("active");
            $(this).addClass("active");

            // 更新标签页图标
            $tabBar.find(".xiaoxin-wechat-tab").each(function () {
                var $tab = $(this);
                var currentTabId = $tab.data("tab");
                var tabInfo = tabs.find(function (t) {
                    return t.id === currentTabId;
                });
                if (tabInfo) {
                    var isActive = $tab.hasClass("active");
                    $tab.find(".xiaoxin-wechat-tab-icon").css(
                        "background-image",
                        "url('" +
                            (isActive
                                ? tabInfo.iconActive
                                : tabInfo.iconInactive) +
                            "')"
                    );
                }
            });

            // 切换页面前，清理通讯录页面的事件监听器
            _cleanupContactsPageEvents();

            // 切换页面前，清理朋友圈页面的事件监听器
            var momentsHandler = $root.data("momentsContactUpdateHandler");
            if (momentsHandler) {
                window.removeEventListener(
                    "xiaoxin-contact-updated",
                    momentsHandler
                );
                $root.removeData("momentsContactUpdateHandler");
                console.info("[小馨手机][微信] 已清理朋友圈页面事件监听器");
            }

            // 切换页面
            if (tabId === "chat") {
                _renderChatPage($root, mobilePhone);
            } else if (tabId === "contacts") {
                _renderContactsPage($root, mobilePhone);
            } else if (tabId === "discover") {
                _renderDiscoverPage($root, mobilePhone);
            } else if (tabId === "me") {
                _renderMePage($root, mobilePhone);
            }
        });
    }

    // ========== 渲染"发现"页面 ==========
    function _renderDiscoverPage($root, mobilePhone) {
        console.info("[小馨手机][微信] 渲染发现页面");
        _currentPage = "discover";

        var account = _getAccount();
        if (!account) {
            console.warn("[小馨手机][微信] 无法获取账号信息，跳转到注册页");
            _renderRegisterPage($root, mobilePhone);
            return;
        }

        // 外层容器（不滚动，包含导航栏）
        var $main = $('<div class="xiaoxin-wechat-main"></div>');

        // 内容容器（可滚动）
        var $content = $('<div class="xiaoxin-wechat-discover-main"></div>');

        // 标题栏
        var $header = $('<div class="xiaoxin-wechat-discover-header"></div>');
        var $headerBar = $(
            '<div class="xiaoxin-wechat-discover-header-bar"></div>'
        );

        // 左侧占位元素，确保标题居中
        var $headerLeft = $(
            '<div class="xiaoxin-wechat-discover-header-left"></div>'
        );
        $headerLeft.css({
            width: "24px",
            flexShrink: 0,
        });

        var $headerTitle = $(
            '<div class="xiaoxin-wechat-discover-header-title">发现</div>'
        );

        // 右侧占位元素，保持对称
        var $headerRight = $(
            '<div class="xiaoxin-wechat-discover-header-right"></div>'
        );
        $headerRight.css({
            width: "24px",
            flexShrink: 0,
        });

        $headerBar.append($headerLeft, $headerTitle, $headerRight);
        $header.append($headerBar);

        // 功能列表
        var $featureList = $(
            '<div class="xiaoxin-wechat-discover-feature-list"></div>'
        );

        // 记录“朋友圈”这一行的DOM引用，用于在有新朋友圈时在该行右侧显示红点
        var $momentsFeatureItem = null;
        var $momentsDot = null; // 朋友圈列表项右侧的小红点
        var $momentsAvatar = null; // 朋友圈列表项右侧的最新发布者头像

        var features = [
            {
                id: "moments",
                icon: "🎡", // 朋友圈图标（使用emoji作为占位，后续可替换为图片）
                label: "朋友圈",
                action: function () {
                    console.info("[小馨手机][微信] 点击朋友圈");
                    _renderMomentsPage($root, mobilePhone);
                },
            },
            {
                id: "listen",
                icon: "🎵", // 听一听图标
                label: "听一听",
                action: function () {
                    console.info("[小馨手机][微信] 点击听一听");
                    if (typeof toastr !== "undefined") {
                        toastr.info("听一听功能待实现", "小馨手机");
                    }
                },
            },
        ];

        features.forEach(function (feature) {
            var $item = $(
                '<div class="xiaoxin-wechat-discover-feature-item"></div>'
            );
            var $icon = $(
                '<div class="xiaoxin-wechat-discover-feature-icon">' +
                    feature.icon +
                    "</div>"
            );
            var $label = $(
                '<div class="xiaoxin-wechat-discover-feature-label">' +
                    escapeHtml(feature.label) +
                    "</div>"
            );
            var $right = $(
                '<div class="xiaoxin-wechat-discover-feature-right"></div>'
            );
            var $arrow = $(
                '<div class="xiaoxin-wechat-discover-feature-arrow">›</div>'
            );
            // 朋友圈这一行右侧：头像 + 红点 + 箭头
            if (feature.id === "moments") {
                $momentsAvatar = $(
                    '<div class="xiaoxin-wechat-discover-moments-avatar" style="display:none;"></div>'
                );
                $momentsDot = $(
                    '<div class="xiaoxin-wechat-discover-moments-red-dot" style="display: none;"></div>'
                );
                var $avatarWrapper = $(
                    '<div class="xiaoxin-wechat-discover-moments-wrapper"></div>'
                );
                $avatarWrapper.append($momentsAvatar, $momentsDot);
                $right.append($avatarWrapper);
            }
            $right.append($arrow);

            // 朋友圈这一行右侧增加一个红点，占位用于有新朋友圈时提醒
            if (feature.id === "moments") {
                $momentsFeatureItem = $item;
            }

            $item.append($icon, $label, $right);
            $item.on("click", feature.action);
            $featureList.append($item);
        });

        // 底部导航栏
        var $tabBar = $('<div class="xiaoxin-wechat-tab-bar"></div>');
        var tabs = [
            {
                id: "chat",
                label: "微信",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微信图标已选中.png",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微信图标未选中.jpg",
                active: false,
            },
            {
                id: "contacts",
                label: "通讯录",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/通讯录图标已选中.png",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/通讯录图标未选中.jpg",
                active: false,
            },
            {
                id: "discover",
                label: "发现",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/发现图标已选中.png",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/发现图标未选中.jpg",
                active: true,
            },
            {
                id: "me",
                label: "我",
                iconActive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/我的图标已选中.jpg",
                iconInactive:
                    "/scripts/extensions/third-party/xiaoxin-phone/image/icon/我的图标未选中.png",
                active: false,
            },
        ];

        tabs.forEach(function (tab) {
            var $tab = $(
                '<div class="xiaoxin-wechat-tab" data-tab="' +
                    tab.id +
                    '"></div>'
            );
            if (tab.active) {
                $tab.addClass("active");
            }
            var $tabIcon = $(
                '<div class="xiaoxin-wechat-tab-icon" style="background-image: url(\'' +
                    (tab.active ? tab.iconActive : tab.iconInactive) +
                    "');\"></div>"
            );
            // 为“发现”tab添加红点占位元素（用于有新朋友圈时提示）
            if (tab.id === "discover") {
                var $dot = $(
                    '<div class="xiaoxin-wechat-tab-red-dot" style="display:none;"></div>'
                );
                $tabIcon.css("position", "relative");
                $tabIcon.append($dot);
                $tab.data("redDot", $dot);
            }
            var $tabLabel = $(
                '<div class="xiaoxin-wechat-tab-label">' + tab.label + "</div>"
            );
            $tab.append($tabIcon, $tabLabel);
            $tabBar.append($tab);
        });

        // 将内容添加到内容容器中
        $content.append($featureList);

        // 将标题栏、内容容器和导航栏添加到主容器中
        $main.append($header, $content, $tabBar);
        $root.empty().append($main);

        // 初始化时更新底部导航栏红点（微信未读 + 通讯录待处理好友申请）
        if (window.XiaoxinWeChatComponents) {
            window.XiaoxinWeChatComponents.updateTabBarBadge($tabBar);
            window.XiaoxinWeChatComponents.updateContactsTabBadge($tabBar);
        }
        _updateDiscoverTabBadge($tabBar);

        // 初始化“发现”tab红点（根据是否有未读朋友圈，机制类似微信私聊未读）
        function updateDiscoverTabRedDot() {
            try {
                if (
                    !window.XiaoxinWeChatDataHandler ||
                    typeof window.XiaoxinWeChatDataHandler.getMoments !==
                        "function" ||
                    typeof window.XiaoxinWeChatDataHandler.getMomentsUnreadCount !==
                        "function"
                ) {
                    return;
                }
                var moments =
                    window.XiaoxinWeChatDataHandler.getMoments() || [];
                var $discoverTab = $tabBar.find(
                    '.xiaoxin-wechat-tab[data-tab="discover"]'
                );
                if (!moments.length) {
                    // 没有任何朋友圈，不显示红点
                    $discoverTab.each(function () {
                        var $dot = $(this).data("redDot");
                        if ($dot) $dot.hide();
                    });
                    if ($momentsDot && $momentsDot.length) {
                        $momentsDot.hide();
                    }
                    if ($momentsAvatar && $momentsAvatar.length) {
                        $momentsAvatar.hide();
                    }
                    return;
                }
                var unreadCount =
                    window.XiaoxinWeChatDataHandler.getMomentsUnreadCount() ||
                    0;

                // 只统计“角色”的朋友圈：玩家自己发的朋友圈不计入未读红点
                var account = _getAccount ? _getAccount() : null;
                var playerWechatId = account && account.wechatId ? String(account.wechatId).trim() : "";
                var playerAccountId = account && account.id ? String(account.id).trim() : "";

                function isPlayerMoment(m) {
                    if (!m) return false;
                    var authorRaw = m.authorId || m.userId || m.author || "";
                    var authorStr = String(authorRaw).trim();
                    if (!authorStr) return false;
                    // 兼容多种玩家标识：优先检查 "user"（推荐格式）和 "player"（兼容旧格式）
                    var authorLower = authorStr.toLowerCase();
                    return (
                        authorLower === "user" ||
                        authorLower === "player" ||
                        (playerWechatId && authorStr === playerWechatId) ||
                        (playerAccountId && authorStr === playerAccountId)
                    );
                }

                // 计算是否存在“角色朋友圈”（非玩家自己的）
                var hasRoleMoments = moments.some(function (m) {
                    return m && !isPlayerMoment(m);
                });

                // 如果没有任何“角色朋友圈”或未读数量为 0，则不显示红点
                var hasNew = hasRoleMoments && unreadCount > 0;
                $discoverTab.each(function () {
                    var $dot = $(this).data("redDot");
                    if ($dot) {
                        if (hasNew) $dot.show();
                        else $dot.hide();
                    }
                });

                // 同步更新发现页中“朋友圈”这一行右侧的小红点与头像
                // 需求：未读清零后，红点和头像都不显示
                if (!hasNew) {
                    if ($momentsDot && $momentsDot.length) {
                        $momentsDot.hide();
                    }
                    if ($momentsAvatar && $momentsAvatar.length) {
                        $momentsAvatar.hide();
                    }
                    return;
                }
                if ($momentsDot && $momentsDot.length) {
                    $momentsDot.show();
                }
                // 更新“朋友圈”列表项右侧的头像（显示最新一条朋友圈的作者头像）
                if ($momentsAvatar && $momentsAvatar.length) {
                    var latestMoment = moments[0] || null; // addMoment 会把最新的放在前面
                    var latestAvatar =
                        (latestMoment &&
                            latestMoment.authorAvatar) ||
                        null;
                    // 如果数据层未带头像，尝试从联系人表补充
                    if (!latestAvatar && window.XiaoxinWeChatDataHandler) {
                        var contacts =
                            window.XiaoxinWeChatDataHandler.getContacts &&
                            window.XiaoxinWeChatDataHandler.getContacts();
                        if (Array.isArray(contacts) && latestMoment) {
                            var authorId =
                                latestMoment.authorId ||
                                latestMoment.userId ||
                                latestMoment.author;
                            var c = contacts.find(function (ct) {
                                var cid = String(ct.id || "").trim();
                                var cwechat = String(ct.wechatId || "").trim();
                                var cchar = String(ct.characterId || "").trim();
                                var aid = String(authorId || "").trim();
                                return (
                                    cid === aid ||
                                    cwechat === aid ||
                                    cchar === aid ||
                                    "contact_" + cid === aid ||
                                    aid === "contact_" + cid
                                );
                            });
                            if (c && c.avatar) {
                                latestAvatar = c.avatar;
                            }
                        }
                    }
                    if (latestAvatar) {
                        $momentsAvatar
                            .css("background-image", "url(" + latestAvatar + ")")
                            .show();
                        // 红点根据未读数控制
                        if (hasNew) {
                            $momentsDot && $momentsDot.show();
                        }
                    } else {
                        $momentsAvatar.hide();
                    }
                }
            } catch (e) {
                console.warn(
                    "[小馨手机][微信] 更新发现tab红点失败:",
                    e
                );
            }
        }

        updateDiscoverTabRedDot();

        // 监听朋友圈更新事件，实时刷新发现tab红点
        function onMomentsUpdated() {
            updateDiscoverTabRedDot();
        }
        window.addEventListener("xiaoxin-moments-updated", onMomentsUpdated);
        $root.data("momentsUpdatedHandler", onMomentsUpdated);

        // 监听账号资料更新（例如：个性签名/头像/昵称），用于同步刷新朋友圈展示
        function onAccountUpdated(e) {
            try {
                if (!e || !e.detail) return;
                var field = e.detail.field;
                if (
                    field === "signature" ||
                    field === "sign" ||
                    field === "desc" ||
                    field === "nickname" ||
                    field === "avatar" ||
                    field === "wechatId"
                ) {
                    _refreshCurrentPageIfMoments();
                }
            } catch (err) {
                console.warn("[小馨手机][微信] onAccountUpdated 出错:", err);
            }
        }
        window.addEventListener("xiaoxin-account-updated", onAccountUpdated);
        $root.data("accountUpdatedHandler", onAccountUpdated);

        // 监听未读消息数更新事件，继续使用原有组件更新其他tab红点
        var unreadUpdateHandler = function () {
            if (window.XiaoxinWeChatComponents) {
                window.XiaoxinWeChatComponents.updateTabBarBadge($tabBar);
                window.XiaoxinWeChatComponents.updateContactsTabBadge($tabBar);
            }
            updateDiscoverTabRedDot();
        };
        window.addEventListener(
            "xiaoxin-unread-count-updated",
            unreadUpdateHandler
        );
        $root.data("unreadUpdateHandler", unreadUpdateHandler);

        // 监听好友申请更新事件：用于持久化“通讯录”tab红点（切到发现/我时也不丢）
        var friendRequestUpdateHandler = function () {
            if (window.XiaoxinWeChatComponents) {
                window.XiaoxinWeChatComponents.updateContactsTabBadge($tabBar);
            }
        };
        window.addEventListener(
            "xiaoxin-friend-request-updated",
            friendRequestUpdateHandler
        );
        $root.data("friendRequestUpdateHandler", friendRequestUpdateHandler);

        // 标签页点击事件处理
        $tabBar.on("click", ".xiaoxin-wechat-tab", function () {
            var tabId = $(this).data("tab");
            if (!tabId) return;

            // 更新标签页状态
            $tabBar.find(".xiaoxin-wechat-tab").removeClass("active");
            $(this).addClass("active");

            // 更新标签页图标
            $tabBar.find(".xiaoxin-wechat-tab").each(function () {
                var $tab = $(this);
                var currentTabId = $tab.data("tab");
                var tabInfo = tabs.find(function (t) {
                    return t.id === currentTabId;
                });
                if (tabInfo) {
                    var isActive = $tab.hasClass("active");
                    $tab.find(".xiaoxin-wechat-tab-icon").css(
                        "background-image",
                        "url('" +
                            (isActive
                                ? tabInfo.iconActive
                                : tabInfo.iconInactive) +
                            "')"
                    );
                }
            });

            // 切换页面前，清理通讯录页面的事件监听器
            _cleanupContactsPageEvents();

            // 切换页面
            if (tabId === "chat") {
                _renderChatPage($root, mobilePhone);
            } else if (tabId === "contacts") {
                _renderContactsPage($root, mobilePhone);
            } else if (tabId === "discover") {
                _renderDiscoverPage($root, mobilePhone);
            } else if (tabId === "me") {
                _renderMePage($root, mobilePhone);
            }
        });
    }

    // ========== 格式化朋友圈时间 ==========
    // baseTimestamp 用于作为"当前时间"的参考：
    // - 朋友圈中使用最新一条朋友圈的时间作为基准，保持与世界观时间一致
    // - 如果未提供，则退回到真实当前时间
    function _formatMomentTime(timestamp, baseTimestamp) {
        if (!timestamp) return "";
        var now =
            typeof baseTimestamp === "number" && !isNaN(baseTimestamp)
                ? baseTimestamp
                : Date.now();
        var diff = now - timestamp;
        var minutes = Math.floor(diff / 60000);
        var hours = Math.floor(diff / 3600000);
        var days = Math.floor(diff / 86400000);

        if (minutes < 1) {
            return "刚刚";
        } else if (minutes < 60) {
            return minutes + "分钟前";
        } else if (hours < 24) {
            return hours + "小时前";
        } else if (days < 7) {
            return days + "天前";
        } else {
            var date = new Date(timestamp);
            var baseDate = new Date(now);
            var year = date.getFullYear();
            var month = date.getMonth() + 1;
            var day = date.getDate();

            // 如果与基准时间跨年，或者相差超过一年，则显示年份
            var yearDiff = baseDate.getFullYear() - year;
            if (yearDiff >= 1 || days > 365) {
                return year + "年" + month + "月" + day + "日";
            }

            // 同一年内，保持原来的 "X月X日" 样式
            return month + "月" + day + "日";
        }
    }

    // ========== 渲染评论项（共享函数，供主朋友圈和个人朋友圈使用） ==========
    function renderCommentItem(comment, $root) {
        var $commentItem = $(
            '<div class="xiaoxin-wechat-moments-item-comment xiaoxin-wechat-moments-item-comment-clickable"></div>'
        );

        // 处理评论内容：如果content中包含表情包文件名（用|分隔），需要分离出来
        var displayContent = comment.content || "";
        var emojiFromContent = null;

        // 如果comment.emoji已经存在，直接使用
        if (comment.emoji) {
            emojiFromContent = comment.emoji;
            // 如果content中也包含表情包文件名，需要移除
            if (displayContent.indexOf(emojiFromContent) !== -1) {
                displayContent = displayContent
                    .replace(emojiFromContent, "")
                    .replace(/\|\s*$/, "")
                    .replace(/^\s*\|/, "")
                    .trim();
            }
        } else {
            // 否则尝试从content中解析表情包文件名
            var contentParts = displayContent.split("|");
            if (contentParts.length > 1) {
                // 检查最后一部分是否是表情包文件名
                var lastPart = contentParts[contentParts.length - 1].trim();
                var emojiList = _getEmojiList();
                if (emojiList.indexOf(lastPart) !== -1) {
                    // 最后一部分是表情包，从content中移除
                    emojiFromContent = lastPart;
                    contentParts.pop();
                    displayContent = contentParts.join("|").trim();
                }
            } else {
                // 如果没有用|分隔，检查整个content是否是表情包文件名
                var emojiList = _getEmojiList();
                var trimmedContent = displayContent.trim();
                if (emojiList.indexOf(trimmedContent) !== -1) {
                    emojiFromContent = trimmedContent;
                    displayContent = "";
                }
            }
        }

        // 获取显示名称（优先使用备注，没有备注则使用昵称）
        var authorDisplayName = _getDisplayNameById(comment.author);
        var replyToDisplayName = comment.replyTo
            ? _getDisplayNameById(comment.replyTo)
            : "";

        var commentText = "";
        if (comment.type === "reply") {
            // 回复类型
            commentText =
                '<span class="xiaoxin-wechat-moments-comment-author">' +
                escapeHtml(authorDisplayName) +
                "</span>" +
                '<span class="xiaoxin-wechat-moments-comment-reply">回复</span>' +
                '<span class="xiaoxin-wechat-moments-comment-reply-to">' +
                escapeHtml(replyToDisplayName) +
                "</span>" +
                '<span class="xiaoxin-wechat-moments-comment-reply-content">' +
                escapeHtml(comment.replyContent) +
                "</span>" +
                '<span class="xiaoxin-wechat-moments-comment-separator">:</span>' +
                escapeHtml(displayContent);
        } else {
            // 普通评论
            commentText =
                '<span class="xiaoxin-wechat-moments-comment-author">' +
                escapeHtml(authorDisplayName) +
                "</span>" +
                '<span class="xiaoxin-wechat-moments-comment-separator">:</span>' +
                escapeHtml(displayContent);
        }

        var $commentContent = $(
            '<div class="xiaoxin-wechat-moments-comment-content">' +
                commentText +
                "</div>"
        );

        // 评论中的图片（支持多张）
        if (comment.images && comment.images.length > 0) {
            var $commentImages = $(
                '<div class="xiaoxin-wechat-moments-comment-images"></div>'
            );
            comment.images.forEach(function (imageDesc) {
                var $commentImage = $(
                    '<div class="xiaoxin-wechat-moments-comment-image xiaoxin-wechat-moments-image-loading"></div>'
                );
                // 使用默认占位图
                $commentImage.css(
                    "background-image",
                    "url(/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg)"
                );
                $commentImage.css("cursor", "pointer");

                // 调用API生成图片
                if (
                    window.XiaoxinAI &&
                    typeof window.XiaoxinAI.generateImage === "function"
                ) {
                    // 使用配置中的正向提示词（不再硬编码）
                    window.XiaoxinAI.generateImage({
                        prompt: imageDesc,
                    })
                        .then(function (generatedUrl) {
                            if (generatedUrl) {
                                $commentImage.css(
                                    "background-image",
                                    "url(" + generatedUrl + ")"
                                );
                                $commentImage.removeClass(
                                    "xiaoxin-wechat-moments-image-loading"
                                );
                                // 保存生成的URL用于点击预览
                                $commentImage.data("image-url", generatedUrl);
                            } else {
                                $commentImage.removeClass(
                                    "xiaoxin-wechat-moments-image-loading"
                                );
                            }
                        })
                        .catch(function (error) {
                            console.error(
                                "[小馨手机][微信] 评论图片生成异常:",
                                error
                            );
                            $commentImage.removeClass(
                                "xiaoxin-wechat-moments-image-loading"
                            );
                        });
                } else {
                    $commentImage.removeClass(
                        "xiaoxin-wechat-moments-image-loading"
                    );
                }

                // 点击图片放大查看
                $commentImage.on("click", function (e) {
                    e.stopPropagation();
                    var imageUrl = $commentImage.data("image-url");
                    if (imageUrl && $root) {
                        _showImagePreview(imageUrl, $root);
                    }
                });

                $commentImages.append($commentImage);
            });
            // 图片显示在文本后面（追加到commentContent中）
            $commentContent.append($commentImages);
        } else if (comment.image) {
            // 兼容旧格式（单张图片）
            var $commentImage = $(
                '<div class="xiaoxin-wechat-moments-comment-image"></div>'
            );
            $commentImage.css("background-image", "url(" + comment.image + ")");
            $commentImage.css("cursor", "pointer");

            // 点击图片放大查看
            $commentImage.on("click", function (e) {
                e.stopPropagation();
                if ($root) {
                    _showImagePreview(comment.image, $root);
                }
            });

            $commentContent.append($commentImage);
        }

        // 评论中的表情包（显示在文本和图片后面）
        var emojiToShow = comment.emoji || emojiFromContent;
        if (emojiToShow) {
            var emojiPath = _getEmojiPath(emojiToShow);
            // 表情包使用与评论图片相同的尺寸
            var $commentEmoji = $(
                '<span class="xiaoxin-wechat-moments-comment-emoji" style="display: inline-block; vertical-align: middle; margin-left: 4px; cursor: pointer;"><img src="' +
                    emojiPath +
                    '" alt="' +
                    escapeHtml(emojiToShow) +
                    '" title="' +
                    escapeHtml(emojiToShow) +
                    '" style="width: 1.5em; height: 1.5em; max-width: 21px; max-height: 21px; border-radius: 4px; display: block; object-fit: cover;" onerror="this.style.display=\'none\'; this.parentElement.innerHTML=\'[表情包: ' +
                    escapeHtml(emojiToShow) +
                    "]';\" /></span>"
            );
            // 点击表情包放大查看
            $commentEmoji.on("click", function (e) {
                e.stopPropagation();
                if ($root) {
                    _showImagePreview(emojiPath, $root);
                }
            });
            $commentContent.append($commentEmoji);
        } else {
            // 如果还是没有找到表情包，再次尝试从完整content中查找
            // 检查content中是否直接包含表情包文件名（没有用|分隔的情况）
            var fullContent = comment.content || "";
            if (fullContent) {
                var emojiList = _getEmojiList();
                for (var i = 0; i < emojiList.length; i++) {
                    var emojiName = emojiList[i];
                    // 检查content是否以表情包文件名结尾（可能是 "文字|表情包" 或直接是 "表情包"）
                    if (fullContent.indexOf(emojiName) !== -1) {
                        // 找到表情包，提取出来
                        var emojiPath = _getEmojiPath(emojiName);
                        // 表情包使用与评论图片相同的尺寸
                        var $commentEmoji = $(
                            '<span class="xiaoxin-wechat-moments-comment-emoji" style="display: inline-block; vertical-align: middle; margin-left: 4px; cursor: pointer;"><img src="' +
                                emojiPath +
                                '" alt="' +
                                escapeHtml(emojiName) +
                                '" title="' +
                                escapeHtml(emojiName) +
                                '" style="width: 1.5em; height: 1.5em; max-width: 21px; max-height: 21px; border-radius: 4px; display: block; object-fit: cover;" onerror="this.style.display=\'none\'; this.parentElement.innerHTML=\'[表情包: ' +
                                escapeHtml(emojiName) +
                                "]';\" /></span>"
                        );
                        // 点击表情包放大查看
                        $commentEmoji.on("click", function (e) {
                            e.stopPropagation();
                            if ($root) {
                                _showImagePreview(emojiPath, $root);
                            }
                        });
                        $commentContent.append($commentEmoji);
                        // 从显示内容中移除表情包文件名
                        displayContent = fullContent
                            .replace(emojiName, "")
                            .replace(/\|\s*$/, "")
                            .replace(/^\s*\|/, "")
                            .trim();
                        // 更新commentText（使用已获取的显示名称）
                        if (comment.type === "reply") {
                            commentText =
                                '<span class="xiaoxin-wechat-moments-comment-author">' +
                                escapeHtml(authorDisplayName) +
                                "</span>" +
                                '<span class="xiaoxin-wechat-moments-comment-reply">回复</span>' +
                                '<span class="xiaoxin-wechat-moments-comment-reply-to">' +
                                escapeHtml(replyToDisplayName) +
                                "</span>" +
                                '<span class="xiaoxin-wechat-moments-comment-reply-content">' +
                                escapeHtml(comment.replyContent) +
                                "</span>" +
                                '<span class="xiaoxin-wechat-moments-comment-separator">:</span>' +
                                escapeHtml(displayContent);
                        } else {
                            commentText =
                                '<span class="xiaoxin-wechat-moments-comment-author">' +
                                escapeHtml(authorDisplayName) +
                                "</span>" +
                                '<span class="xiaoxin-wechat-moments-comment-separator">:</span>' +
                                escapeHtml(displayContent);
                        }
                        // 更新$commentContent的内容
                        $commentContent.html(commentText);
                        break;
                    }
                }
            }
        }

        $commentItem.append($commentContent);

        return $commentItem;
    }

    // ========== 获取联系人映射的辅助函数（共享函数，供主朋友圈和个人朋友圈使用） ==========
    function _getContactMap() {
        // 获取联系人列表
        var contacts = [];
        if (
            window.XiaoxinWeChatDataHandler &&
            typeof window.XiaoxinWeChatDataHandler.getContacts === "function"
        ) {
            contacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
        }

        // 将联系人列表转换为名称到联系人的映射，方便查找
        // 支持通过 ID、昵称、备注名进行查找
        var contactMap = {};
        contacts.forEach(function (contact) {
            var id = String(contact.id || contact.characterId || "").trim();
            var name = contact.name || contact.nickname || "";
            var remark = contact.remark || "";

            // 使用 ID 作为主键
            if (id) {
                contactMap[id] = contact;
            }
            // 使用昵称作为键
            if (name) {
                contactMap[name] = contact;
            }
            // 使用备注名作为键
            if (remark) {
                contactMap[remark] = contact;
            }
        });

        console.info(
            "[小馨手机][微信] _getContactMap: 联系人数量:",
            contacts.length,
            "映射表键数量:",
            Object.keys(contactMap).length
        );
        return contactMap;
    }

    // ========== 判断玩家是否能看到某个用户的互动（共享函数，供主朋友圈和个人朋友圈使用） ==========
    // 规则：玩家可以看到自己的互动、朋友圈作者的互动、以及与朋友圈作者和玩家都是好友的用户的互动（共同好友）
    // 注意：interactionAuthor 可能是 ID（如 "player", "1", "sy"）或显示名称
    function _canPlayerSeeInteraction(
        playerName,
        momentAuthor,
        interactionAuthor
    ) {
        if (!interactionAuthor) {
            console.warn(
                "[小馨手机][微信] _canPlayerSeeInteraction: interactionAuthor 为空"
            );
            return false;
        }

        // 获取玩家信息（用于匹配）
        var account = _getAccount();
        var playerNickname = account.nickname || "微信用户";
        var playerWechatId = account.wechatId || account.id || "player";
        var playerId = account.id || "player";

        // 如果朋友圈作者是玩家自己，允许显示所有互动（玩家可以看到自己朋友圈的所有互动）
        if (momentAuthor) {
            var momentAuthorStr = String(momentAuthor).trim();
            var momentAuthorLower = momentAuthorStr.toLowerCase();
            var playerWechatIdStr = String(playerWechatId).trim();
            var playerIdStr = String(playerId).trim();
            // 优先检查是否为 "user"（推荐格式）或 "player"（兼容旧格式）
            var isPlayerMoment =
                momentAuthorLower === "user" ||
                momentAuthorLower === "player" ||
                momentAuthorStr === playerWechatIdStr ||
                momentAuthorStr === playerIdStr ||
                momentAuthorStr === playerName ||
                momentAuthorStr === playerNickname ||
                momentAuthorStr === "contact_" + playerWechatIdStr ||
                momentAuthorStr === "contact_" + playerIdStr ||
                "contact_" + momentAuthorStr === playerWechatIdStr ||
                "contact_" + momentAuthorStr === playerIdStr ||
                momentAuthorStr.replace(/^contact_/, "") ===
                    playerWechatIdStr.replace(/^contact_/, "") ||
                momentAuthorStr.replace(/^contact_/, "") ===
                    playerIdStr.replace(/^contact_/, "");

            if (isPlayerMoment) {
                console.info(
                    "[小馨手机][微信] _canPlayerSeeInteraction: 朋友圈作者是玩家自己，允许显示所有互动，momentAuthor:",
                    momentAuthor,
                    "interactionAuthor:",
                    interactionAuthor
                );
                return true;
            }
        }

        // 玩家可以看到自己的互动（支持 ID 和昵称匹配）
        var interactionAuthorStr = String(interactionAuthor).trim();
        var interactionAuthorLower = interactionAuthorStr.toLowerCase();
        if (
            interactionAuthorStr === playerName ||
            interactionAuthorStr === playerNickname ||
            interactionAuthorLower === "user" ||
            interactionAuthorLower === "player"
        ) {
            console.info(
                "[小馨手机][微信] _canPlayerSeeInteraction: 互动者是玩家自己，可见"
            );
            return true;
        }

        // 获取联系人列表和映射表
        var contacts = [];
        if (
            window.XiaoxinWeChatDataHandler &&
            typeof window.XiaoxinWeChatDataHandler.getContacts === "function"
        ) {
            contacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
        }
        var contactMap = _getContactMap();

        // 玩家可以看到朋友圈作者的互动（支持 ID 和显示名称匹配）
        // momentAuthor 可能是显示名称或 ID，需要转换为 ID 进行匹配
        var momentAuthorId = null;
        var momentAuthorContact = null;
        if (momentAuthor) {
            var momentAuthorStr = String(momentAuthor).trim();
            // 尝试通过显示名称或 ID 查找对应的联系人
            momentAuthorContact = contacts.find(function (c) {
                var contactId = String(c.id || c.characterId || "").trim();
                var contactName = c.remark || c.nickname || c.name || "";
                var contactCharacterId = String(c.characterId || "").trim();

                // 支持多种匹配方式：
                // 1. 完全匹配 ID
                // 2. 完全匹配昵称/备注
                // 3. ID 包含 momentAuthor（如 contact_xjy 包含 xjy）
                // 4. characterId 匹配 momentAuthor（如 xjy 匹配 xjy）
                // 5. 大小写不敏感匹配
                return (
                    contactId === momentAuthorStr ||
                    contactName === momentAuthorStr ||
                    contactCharacterId === momentAuthorStr ||
                    contactId.toLowerCase() === momentAuthorStr.toLowerCase() ||
                    contactName.toLowerCase() ===
                        momentAuthorStr.toLowerCase() ||
                    contactCharacterId.toLowerCase() ===
                        momentAuthorStr.toLowerCase() ||
                    contactId.indexOf(momentAuthorStr) !== -1 ||
                    contactId.indexOf(momentAuthorStr.toLowerCase()) !== -1 ||
                    momentAuthorStr.indexOf(contactCharacterId) !== -1 ||
                    momentAuthorStr
                        .toLowerCase()
                        .indexOf(contactCharacterId.toLowerCase()) !== -1
                );
            });
            if (momentAuthorContact) {
                momentAuthorId =
                    momentAuthorContact.id || momentAuthorContact.characterId;
                console.info(
                    "[小馨手机][微信] _canPlayerSeeInteraction: 找到朋友圈作者联系人，momentAuthor:",
                    momentAuthor,
                    "momentAuthorId:",
                    momentAuthorId,
                    "联系人ID:",
                    momentAuthorContact.id,
                    "characterId:",
                    momentAuthorContact.characterId
                );
            } else {
                console.warn(
                    "[小馨手机][微信] _canPlayerSeeInteraction: 未找到朋友圈作者联系人，momentAuthor:",
                    momentAuthor,
                    "可用联系人:",
                    contacts.map(function (c) {
                        return {
                            id: c.id || c.characterId,
                            characterId: c.characterId,
                            name: c.name || c.nickname,
                            remark: c.remark,
                        };
                    })
                );
            }
        }

        if (
            interactionAuthor === momentAuthor ||
            (momentAuthorId && interactionAuthor === momentAuthorId)
        ) {
            console.info(
                "[小馨手机][微信] _canPlayerSeeInteraction: 互动者是朋友圈作者，可见"
            );
            return true;
        }

        // 检查互动作者是否是好友（支持 ID 和显示名称）
        var interactionAuthorStr = String(interactionAuthor).trim();
        var interactionContact = contacts.find(function (c) {
            var contactId = String(c.id || c.characterId || "").trim();
            var contactName = c.remark || c.nickname || c.name || "";
            var contactCharacterId = String(c.characterId || "").trim();

            // 归一化处理：如果 interactionAuthorStr 是纯数字，转换为 contact_数字
            var normalizedInteractionAuthor = interactionAuthorStr;
            if (/^\d+$/.test(interactionAuthorStr)) {
                normalizedInteractionAuthor = "contact_" + interactionAuthorStr;
            }

            // 归一化处理：如果 contactId 是纯数字，转换为 contact_数字
            var normalizedContactId = contactId;
            if (/^\d+$/.test(contactId)) {
                normalizedContactId = "contact_" + contactId;
            }

            // 归一化处理：如果 contactCharacterId 是纯数字，转换为 contact_数字
            var normalizedContactCharacterId = contactCharacterId;
            if (/^\d+$/.test(contactCharacterId)) {
                normalizedContactCharacterId = "contact_" + contactCharacterId;
            }

            // 支持多种匹配方式：
            // 1. 完全匹配 ID（包括归一化后的ID）
            // 2. 完全匹配昵称/备注
            // 3. characterId 匹配（包括归一化后的ID）
            // 4. ID 包含 interactionAuthor（如 contact_wzq 包含 wzq）
            // 5. 大小写不敏感匹配
            // 6. 归一化后的ID匹配
            return (
                contactId === interactionAuthorStr ||
                normalizedContactId === normalizedInteractionAuthor ||
                contactId === normalizedInteractionAuthor ||
                normalizedContactId === interactionAuthorStr ||
                contactName === interactionAuthorStr ||
                contactCharacterId === interactionAuthorStr ||
                normalizedContactCharacterId === normalizedInteractionAuthor ||
                contactCharacterId === normalizedInteractionAuthor ||
                normalizedContactCharacterId === interactionAuthorStr ||
                contactId.toLowerCase() ===
                    interactionAuthorStr.toLowerCase() ||
                contactName.toLowerCase() ===
                    interactionAuthorStr.toLowerCase() ||
                contactCharacterId.toLowerCase() ===
                    interactionAuthorStr.toLowerCase() ||
                contactId.indexOf(interactionAuthorStr) !== -1 ||
                contactId.indexOf(interactionAuthorStr.toLowerCase()) !== -1 ||
                interactionAuthorStr.indexOf(contactCharacterId) !== -1 ||
                interactionAuthorStr
                    .toLowerCase()
                    .indexOf(contactCharacterId.toLowerCase()) !== -1
            );
        });

        // 检查互动作者是否是玩家的好友（不仅要存在于联系人列表，还要是好友状态）
        var hasInteractionAuthor = false;
        if (interactionContact) {
            // 检查好友状态：isFriend 为 true 或 friendStatus 为 "friend"
            var isFriend =
                interactionContact.isFriend === true ||
                interactionContact.friendStatus === "friend" ||
                interactionContact.friendStatus === "mutual";
            hasInteractionAuthor = isFriend;
            if (!isFriend) {
                console.info(
                    "[小馨手机][微信] _canPlayerSeeInteraction: 互动作者在联系人列表中但不是好友，interactionAuthor:",
                    interactionAuthor,
                    "isFriend:",
                    interactionContact.isFriend,
                    "friendStatus:",
                    interactionContact.friendStatus
                );
            }
        }

        // 检查朋友圈作者是否是玩家的好友（不仅要存在于联系人列表，还要是好友状态）
        var hasAuthor = false;
        if (momentAuthorContact) {
            // 检查好友状态：isFriend 为 true 或 friendStatus 为 "friend"
            var authorIsFriend =
                momentAuthorContact.isFriend === true ||
                momentAuthorContact.friendStatus === "friend" ||
                momentAuthorContact.friendStatus === "mutual";
            hasAuthor = authorIsFriend;
            if (!authorIsFriend) {
                console.info(
                    "[小馨手机][微信] _canPlayerSeeInteraction: 朋友圈作者在联系人列表中但不是好友，momentAuthor:",
                    momentAuthor,
                    "isFriend:",
                    momentAuthorContact.isFriend,
                    "friendStatus:",
                    momentAuthorContact.friendStatus
                );
            }
        }

        console.info("[小馨手机][微信] _canPlayerSeeInteraction: 检查结果", {
            playerName: playerName,
            playerNickname: playerNickname,
            momentAuthor: momentAuthor,
            momentAuthorId: momentAuthorId,
            interactionAuthor: interactionAuthor,
            hasAuthor: hasAuthor,
            hasInteractionAuthor: hasInteractionAuthor,
            result: hasAuthor && hasInteractionAuthor,
        });

        // 规则：玩家可以看到自己的互动、朋友圈作者的互动、以及与朋友圈作者和玩家都是好友的用户的互动（共同好友）
        // 如果朋友圈作者是玩家的好友，且互动作者也是玩家的好友，则可以看到（共同好友）
        return hasAuthor && hasInteractionAuthor;
    }

    // ========== 渲染朋友圈页面 ==========
    function _renderMomentsPage($root, mobilePhone) {
        console.info("[小馨手机][微信] 渲染朋友圈页面");
        _currentPage = "moments";
        _currentRoot = $root;
        _currentMobilePhone = mobilePhone;

        // 在真正读取朋友圈数据之前，尽量自动触发一次历史消息扫描
        // 这样即使用户没有手动调用 XiaoxinForceScanMoments，也能在打开朋友圈时自动解析历史朋友圈标签
        // 添加时间限制，避免短时间内重复扫描（5秒内不重复扫描）
        var now = Date.now();
        var shouldAutoScan = now - _lastMomentsScanTime > 5000; // 距离上次扫描超过5秒才再次扫描

        if (shouldAutoScan) {
            try {
                if (window.XiaoxinForceScanMoments) {
                    console.info(
                        "[小馨手机][微信] 朋友圈页面: 自动触发 XiaoxinForceScanMoments() 以解析历史朋友圈数据"
                    );
                    // 异步执行，避免阻塞渲染；结果会写入 DataHandler，下面 getMoments 会读到
                    setTimeout(function () {
                        try {
                            window.XiaoxinForceScanMoments();
                            _lastMomentsScanTime = Date.now(); // 更新扫描时间戳
                        } catch (e) {
                            console.warn(
                                "[小馨手机][微信] 自动触发 XiaoxinForceScanMoments 失败:",
                                e
                            );
                        }
                    }, 100);
                } else if (
                    window.XiaoxinMessageListener &&
                    typeof window.XiaoxinMessageListener
                        .scanRetainedMessages === "function"
                ) {
                    console.info(
                        "[小馨手机][微信] 朋友圈页面: 自动触发 scanRetainedMessages() 以解析历史朋友圈数据"
                    );
                    setTimeout(function () {
                        try {
                            window.XiaoxinMessageListener.scanRetainedMessages();
                            _lastMomentsScanTime = Date.now(); // 更新扫描时间戳
                        } catch (e2) {
                            console.warn(
                                "[小馨手机][微信] 自动触发 scanRetainedMessages 失败:",
                                e2
                            );
                        }
                    }, 100);
                }
            } catch (autoScanErr) {
                console.warn(
                    "[小馨手机][微信] 朋友圈页面: 自动扫描历史朋友圈数据时出错:",
                    autoScanErr
                );
            }
        } else {
            console.info(
                "[小馨手机][微信] 朋友圈页面: 距离上次扫描时间过短，跳过自动扫描（避免重复生成）"
            );
        }

        // 兜底：如果已满足条件但尚未生成玩家历史朋友圈，进入页面时再尝试一次
        try {
            if (
                window.XiaoxinMessageListener &&
                typeof window.XiaoxinMessageListener
                    .forceGeneratePlayerHistoryMoments === "function"
            ) {
                window.XiaoxinMessageListener.forceGeneratePlayerHistoryMoments();
            } else if (
                typeof window.XiaoxinForceGeneratePlayerHistoryMoments ===
                "function"
            ) {
                window.XiaoxinForceGeneratePlayerHistoryMoments();
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信] 进入朋友圈页面时触发历史朋友圈生成失败:",
                e
            );
        }

        var account = _getAccount();
        if (!account) {
            console.warn("[小馨手机][微信] 无法获取账号信息，跳转到注册页");
            _renderRegisterPage($root, mobilePhone);
            return;
        }

        // 主容器（可滚动，无标题栏）
        var $main = $('<div class="xiaoxin-wechat-moments-main"></div>');

        // 标题栏（默认隐藏，滚动时渐显）
        var $titleBar = $(
            '<div class="xiaoxin-wechat-moments-title-bar"></div>'
        );
        var $titleBarContent = $(
            '<div class="xiaoxin-wechat-moments-title-bar-content"></div>'
        );
        var $titleBarBack = $(
            '<div class="xiaoxin-wechat-moments-title-bar-back">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg>" +
                "</div>"
        );
        $titleBarBack.on("click", function () {
            // 清理朋友圈页面的事件监听器
            var momentsHandler = $root.data("momentsContactUpdateHandler");
            if (momentsHandler) {
                window.removeEventListener(
                    "xiaoxin-contact-updated",
                    momentsHandler
                );
                $root.removeData("momentsContactUpdateHandler");
                console.info("[小馨手机][微信] 已清理朋友圈页面事件监听器");
            }
            // 返回发现页面
            _renderDiscoverPage($root, mobilePhone);
        });
        var $titleBarTitle = $(
            '<div class="xiaoxin-wechat-moments-title-bar-title">朋友圈</div>'
        );
        var $titleBarCamera = $(
            '<div class="xiaoxin-wechat-moments-title-bar-camera">' +
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/>' +
                '<circle cx="12" cy="14" r="3" stroke="currentColor" stroke-width="2"/>' +
                '<path d="M8 7V5C8 3.89543 8.89543 3 10 3H14C15.1046 3 16 3.89543 16 5V7" stroke="currentColor" stroke-width="2"/>' +
                "</svg>" +
                "</div>"
        );
        $titleBarCamera.on("click", function () {
            console.info("[小馨手机][微信] 点击发布朋友圈");
            _showMomentsPublishPage($root, mobilePhone);
        });
        $titleBarContent.append($titleBarBack, $titleBarTitle, $titleBarCamera);
        $titleBar.append($titleBarContent);

        // 固定的返回按钮和发布按钮（始终显示，不随滚动移动）
        var $fixedButtons = $(
            '<div class="xiaoxin-wechat-moments-fixed-buttons"></div>'
        );
        var $fixedBackBtn = $(
            '<div class="xiaoxin-wechat-moments-fixed-back">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg>" +
                "</div>"
        );
        $fixedBackBtn.on("click", function () {
            // 返回发现页面
            _renderDiscoverPage($root, mobilePhone);
        });
        var $fixedCameraBtn = $(
            '<div class="xiaoxin-wechat-moments-fixed-camera">' +
                '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/>' +
                '<circle cx="12" cy="14" r="3" stroke="currentColor" stroke-width="2"/>' +
                '<path d="M8 7V5C8 3.89543 8.89543 3 10 3H14C15.1046 3 16 3.89543 16 5V7" stroke="currentColor" stroke-width="2"/>' +
                "</svg>" +
                "</div>"
        );
        $fixedCameraBtn.on("click", function () {
            console.info("[小馨手机][微信] 点击发布朋友圈");
            _showMomentsPublishPage($root, mobilePhone);
        });
        $fixedButtons.append($fixedBackBtn, $fixedCameraBtn);

        // 顶部背景图区域（占屏幕高度的1/3）
        var $headerSection = $(
            '<div class="xiaoxin-wechat-moments-header xiaoxin-wechat-moments-header-contact"></div>'
        );
        var $backgroundImage = $(
            '<div class="xiaoxin-wechat-moments-background"></div>'
        );
        var backgroundUrl =
            account.momentsBackground ||
            "/scripts/extensions/third-party/xiaoxin-phone/image/background/默认微信朋友圈背景图.jpg";
        _setBackgroundImageSafely(
            $backgroundImage,
            backgroundUrl,
            "/scripts/extensions/third-party/xiaoxin-phone/image/background/默认微信朋友圈背景图.jpg"
        );

        // 背景图可点击更换
        $backgroundImage.css("cursor", "pointer");
        $backgroundImage.on("click", function () {
            _showBackgroundPicker(
                $backgroundImage,
                $root,
                function (newBackgroundUrl) {
                    // 更新显示的背景图（数据已在确认按钮中保存）
                    $backgroundImage.css(
                        "background-image",
                        "url(" + newBackgroundUrl + ")"
                    );
                }
            );
        });

        // 打开朋友圈主页面时，记录“最近查看时间”，并清空朋友圈未读数量，用于发现tab红点清除
        try {
            if (
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.setMomentsLastSeen ===
                    "function"
            ) {
                window.XiaoxinWeChatDataHandler.setMomentsLastSeen(Date.now());
                // 同时清空朋友圈未读数量（机制类似微信私聊未读）
                if (
                    typeof window.XiaoxinWeChatDataHandler.setMomentsUnreadCount ===
                    "function"
                ) {
                    window.XiaoxinWeChatDataHandler.setMomentsUnreadCount(0);
                }
                if (typeof window.CustomEvent !== "undefined") {
                    var event = new CustomEvent("xiaoxin-moments-updated", {
                        detail: { latestTimestamp: Date.now() },
                    });
                    window.dispatchEvent(event);
                }
            }
        } catch (e) {
            console.warn(
                "[小馨手机][微信] 更新朋友圈最近查看时间失败:",
                e
            );
        }

        // 分割线和用户信息区域
        var $dividerSection = $(
            '<div class="xiaoxin-wechat-moments-divider-section"></div>'
        );
        var $divider = $('<div class="xiaoxin-wechat-moments-divider"></div>');

        // 用户昵称（分割线上方）
        var $nickname = $(
            '<div class="xiaoxin-wechat-moments-nickname">' +
                escapeHtml(account.nickname || "微信用户") +
                "</div>"
        );

        // 用户头像（头像的下方三分之一处放在分割线上，显示在右侧）
        var $avatar = $('<div class="xiaoxin-wechat-moments-avatar"></div>');
        var avatarUrl =
            account.avatar ||
            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
        $avatar.css("background-image", "url(" + avatarUrl + ")");

        // 先添加分割线，然后添加昵称和头像（昵称在左，头像在右）
        $dividerSection.append($divider, $nickname, $avatar);
        $headerSection.append($backgroundImage, $dividerSection);

        // 个性签名（显示在分割线下方，在headerSection和contentSection之间）
        // 从账号资料读取（与“个人资料”弹窗一致），这样修改签名会同步到朋友圈
        var playerSignature =
            (account && (account.signature || account.sign || account.desc)) ||
            "";
        playerSignature = String(playerSignature || "").trim();
        var $signatureSection = null;
        if (playerSignature) {
            $signatureSection = $(
                '<div class="xiaoxin-wechat-moments-signature-section"></div>'
            );
            var hasLineBreak = playerSignature.indexOf("\n") !== -1;
            var signatureClass = "xiaoxin-wechat-moments-signature";
            if (hasLineBreak) {
                signatureClass += " xiaoxin-wechat-moments-signature-multiline";
            }
            var $signature = $(
                '<div class="' +
                    signatureClass +
                    '">' +
                    escapeHtml(playerSignature) +
                    "</div>"
            );
            $signatureSection.append($signature);
        }

        // 朋友圈内容区域
        var $contentSection = $(
            '<div class="xiaoxin-wechat-moments-content"></div>'
        );

        // _getContactMap 函数已在外部作用域定义，这里不再需要重复定义

        // 检查三个用户是否互相为好友的辅助函数
        function _checkMutualFriends(
            playerName,
            authorName,
            commentAuthorName
        ) {
            var contactMap = _getContactMap();

            // 检查三个用户是否都在联系人列表中（即互相为好友）
            var hasPlayer = contactMap[playerName] !== undefined;
            var hasAuthor = contactMap[authorName] !== undefined;
            var hasCommentAuthor = contactMap[commentAuthorName] !== undefined;

            // 如果三个用户都在联系人列表中，说明互相为好友
            return hasPlayer && hasAuthor && hasCommentAuthor;
        }

        // _canPlayerSeeInteraction 函数已在外部作用域定义，这里不再需要重复定义

        // 获取朋友圈数据
        var moments = [];
        var contacts = [];
        if (window.XiaoxinWeChatDataHandler) {
            moments = window.XiaoxinWeChatDataHandler.getMoments() || [];
            console.info(
                "[小馨手机][微信] 朋友圈页面: 获取到所有朋友圈数量:",
                moments.length
            );
            console.info(
                "[小馨手机][微信] 朋友圈页面: 所有朋友圈的authorId列表:",
                moments.map(function (m) {
                    return {
                        id: m.id,
                        authorId: m.authorId || m.userId || m.author,
                        timestamp: m.timestamp,
                        hasTimestamp: !!m.timestamp,
                        likesCount: (m.likes && m.likes.length) || 0,
                        commentsCount: (m.comments && m.comments.length) || 0,
                        likes: m.likes || [],
                        comments: (m.comments || []).map(function (c) {
                            return {
                                author: c.author,
                                content: (c.content || "").substring(0, 20),
                                type: c.type,
                            };
                        }),
                    };
                })
            );
            if (
                typeof window.XiaoxinWeChatDataHandler.getContacts ===
                "function"
            ) {
                contacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
            }
        }

        // 构建 authorId -> 联系人信息 的快速映射，用于显示头像和昵称
        var contactById = {};
        // 只获取已添加的好友（isFriend === true）
        var friendContacts = (contacts || []).filter(function (c) {
            return c && (c.isFriend === true || c.friendStatus === "friend");
        });

        friendContacts.forEach(function (c) {
            if (!c) return;
            var key = String(c.id || "").trim();
            if (key) {
                contactById[key] = c;
            }
            // 兼容角色ID / characterId 作为 authorId 的情况
            if (c.characterId) {
                var roleKey = String(c.characterId).trim();
                if (roleKey && !contactById[roleKey]) {
                    contactById[roleKey] = c;
                }
                // 也支持 contact_ 前缀
                var contactKey = "contact_" + roleKey;
                if (!contactById[contactKey]) {
                    contactById[contactKey] = c;
                }
            }
        });

        // 构建好友ID集合，用于过滤朋友圈
        var friendIds = new Set();
        friendContacts.forEach(function (c) {
            if (c.id) {
                friendIds.add(String(c.id).trim());
            }
            if (c.characterId) {
                friendIds.add(String(c.characterId).trim());
                friendIds.add("contact_" + String(c.characterId).trim());
            }
        });

        console.info(
            "[小馨手机][微信] 朋友圈页面: 好友数量:",
            friendContacts.length,
            "总联系人数量:",
            contacts.length
        );
        console.info(
            "[小馨手机][微信] 朋友圈页面: 好友ID集合:",
            Array.from(friendIds)
        );

        // 获取玩家账号信息，用于判断是否是玩家自己的朋友圈
        var account = _getAccount();
        console.info(
            "[小馨手机][微信] 朋友圈页面: 获取账号信息:",
            account
                ? {
                      wechatId: account.wechatId,
                      id: account.id,
                      nickname: account.nickname,
                      name: account.name,
                  }
                : null
        );
        var playerWechatId = null;
        var playerId = null;
        if (account) {
            playerWechatId = account.wechatId || account.id || "player";
            playerId = account.id || "player";
        } else {
            console.warn("[小馨手机][微信] 朋友圈页面: 无法获取玩家账号信息！");
        }

        // 过滤朋友圈：只显示已添加好友的朋友圈，但玩家自己的朋友圈始终可见
        moments = (moments || []).filter(function (moment) {
            if (!moment) {
                console.warn("[小馨手机][微信] 朋友圈页面: 朋友圈数据为空");
                return false;
            }
            var momentAuthorId =
                moment.authorId || moment.userId || moment.author;
            if (!momentAuthorId) {
                console.warn(
                    "[小馨手机][微信] 朋友圈页面: 朋友圈没有authorId，朋友圈ID:",
                    moment.id
                );
                return false;
            }

            var authorIdStr = String(momentAuthorId).trim();

            // 检查是否是玩家自己的朋友圈（始终可见）
            var isPlayerMoment = false;
            // 检查 author="player" 或 author="user" 的情况（历史朋友圈生成）
            // 注意：虽然解析时会将 "user" 转换为 "player"，但为了兼容性，这里也检查 "user"
            var authorIdLower = authorIdStr.toLowerCase();
            if (authorIdLower === "player" || authorIdLower === "user") {
                isPlayerMoment = true;
            }
            if (
                playerWechatId &&
                authorIdStr === String(playerWechatId).trim()
            ) {
                isPlayerMoment = true;
            }
            if (playerId && authorIdStr === String(playerId).trim()) {
                isPlayerMoment = true;
            }
            // 也检查 contact_ 前缀的情况
            if (
                playerWechatId &&
                "contact_" + authorIdStr ===
                    "contact_" + String(playerWechatId).trim()
            ) {
                isPlayerMoment = true;
            }
            if (
                playerId &&
                "contact_" + authorIdStr ===
                    "contact_" + String(playerId).trim()
            ) {
                isPlayerMoment = true;
            }

            if (isPlayerMoment) {
                return true; // 玩家自己的朋友圈始终可见
            }

            // 检查是否是好友（支持多种ID格式）
            var isFriend =
                friendIds.has(authorIdStr) ||
                friendIds.has("contact_" + authorIdStr) ||
                (authorIdStr.replace(/^contact_/, "") &&
                    friendIds.has(authorIdStr.replace(/^contact_/, "")));

            if (!isFriend) {
                // 也检查 contactById 中是否有这个作者（双重检查）
                isFriend =
                    contactById[authorIdStr] !== undefined ||
                    contactById["contact_" + authorIdStr] !== undefined;
            }

            if (!isFriend) {
                console.info(
                    "[小馨手机][微信] 朋友圈页面: 朋友圈作者不是好友，已过滤。朋友圈ID:",
                    moment.id,
                    "authorId:",
                    authorIdStr,
                    "好友ID集合:",
                    Array.from(friendIds)
                );
            }

            return isFriend;
        });

        // 添加预览朋友圈到列表顶部
        if (_previewMoments && _previewMoments.length > 0) {
            // 确保所有预览朋友圈都有 isPreview 标记
            _previewMoments.forEach(function (previewMoment) {
                if (!previewMoment.isPreview) {
                    previewMoment.isPreview = true;
                    console.warn(
                        "[小馨手机][微信] 预览朋友圈缺少 isPreview 标记，已自动添加:",
                        previewMoment.id
                    );
                }
            });
            // 将预览朋友圈添加到列表开头
            moments = _previewMoments.concat(moments);
            console.info(
                "[小馨手机][微信] 朋友圈页面: 添加预览朋友圈数量:",
                _previewMoments.length,
                "预览朋友圈ID列表:",
                _previewMoments.map(function (m) {
                    return m.id;
                })
            );
        }

        console.info(
            "[小馨手机][微信] 朋友圈页面: 过滤后朋友圈数量:",
            moments.length,
            "过滤前:",
            window.XiaoxinWeChatDataHandler.getMoments().length
        );

        // 去重：基于朋友圈ID去除重复项
        var seenIds = new Set();
        moments = moments.filter(function (moment) {
            var momentId = moment.id || moment._id;
            if (!momentId) {
                // 如果没有ID，使用内容+作者+时间戳作为唯一标识
                momentId =
                    (moment.content || "") +
                    "|" +
                    (moment.authorId || moment.userId || moment.author || "") +
                    "|" +
                    (moment.timestamp || 0);
            }
            var idStr = String(momentId).trim();
            if (seenIds.has(idStr)) {
                console.warn(
                    "[小馨手机][微信] 朋友圈页面: 发现重复朋友圈，已过滤。ID:",
                    idStr
                );
                return false;
            }
            seenIds.add(idStr);
            return true;
        });

        console.info(
            "[小馨手机][微信] 朋友圈页面: 去重后朋友圈数量:",
            moments.length
        );

        // 始终按时间倒序显示，最新的朋友圈在最上方
        moments = moments.slice().sort(function (a, b) {
            return (b.timestamp || 0) - (a.timestamp || 0);
        });

        // 计算本页使用的时间基准：优先使用世界观时间（从最新正文的time标签获取）
        // 如果没有世界观时间，则使用最新一条朋友圈的时间戳作为后备
        var baseTimestamp = null;

        // 优先使用世界观时间（从time标签获取）
        if (
            window.XiaoxinWorldClock &&
            window.XiaoxinWorldClock.currentTimestamp
        ) {
            var worldTimestamp = window.XiaoxinWorldClock.currentTimestamp;
            // 检查世界观时间是否合理（不应该是未来时间）
            var now = Date.now();
            // 如果世界观时间戳大于2025年1月1日，可能是现实时间，需要检查
            var year2025 = new Date("2025-01-01").getTime();
            if (worldTimestamp < year2025) {
                baseTimestamp = worldTimestamp;
                console.info(
                    "[小馨手机][微信] 朋友圈页面: 使用世界观时间作为基准:",
                    baseTimestamp,
                    "原始时间:",
                    window.XiaoxinWorldClock.rawTime
                );
            } else {
                // 世界观时间可能是现实时间，检查原始时间字符串
                if (
                    window.XiaoxinWorldClock.rawTime &&
                    window.XiaoxinWorldClock.rawTime.indexOf("年") !== -1
                ) {
                    // 原始时间字符串是中文格式，说明是世界观时间，重新解析
                    var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                    var normalized = rawTimeStr
                        .replace(/年|月/g, "/")
                        .replace(/日/g, " ")
                        .replace(/-/g, "/")
                        .replace(/星期[一二三四五六日]/g, "")
                        .trim();
                    var parsed = Date.parse(normalized);
                    if (!isNaN(parsed)) {
                        baseTimestamp = parsed;
                    }
                }
            }
        }

        // 如果没有世界观时间，使用最新一条朋友圈的时间戳作为后备
        if (!baseTimestamp) {
            var latestMomentTimestamp = null;
            moments.forEach(function (m) {
                if (m && m.timestamp) {
                    if (
                        latestMomentTimestamp === null ||
                        m.timestamp > latestMomentTimestamp
                    ) {
                        latestMomentTimestamp = m.timestamp;
                    }
                }
            });
            baseTimestamp = latestMomentTimestamp;
            console.info(
                "[小馨手机][微信] 朋友圈页面: 未找到世界观时间，使用最新朋友圈时间作为基准:",
                baseTimestamp
            );
        }

        // 如果还是没有基准时间，使用当前时间（不推荐）
        if (!baseTimestamp) {
            baseTimestamp = Date.now();
            console.warn(
                "[小馨手机][微信] 朋友圈页面: 无法获取基准时间，使用当前时间（不推荐）"
            );
        }

        // 渲染朋友圈动态列表
        if (moments.length === 0) {
            var $emptyTip = $(
                '<div class="xiaoxin-wechat-moments-empty">' +
                    // 当玩家自己的朋友圈暂无内容，或由于权限等原因导致不可见时，
                    // 使用一条横杠占位，保持与联系人朋友圈页面一致
                    '<div class="xiaoxin-wechat-moments-empty-text">———</div>' +
                    "</div>"
            );
            $contentSection.append($emptyTip);
        } else {
            moments.forEach(function (moment) {
                // 调试：检查是否是预览朋友圈
                if (moment.isPreview) {
                    console.info(
                        "[小馨手机][微信] 渲染预览朋友圈:",
                        moment.id,
                        "内容:",
                        moment.content
                    );
                }

                var $momentItem = $(
                    '<div class="xiaoxin-wechat-moments-item"></div>'
                );

                // 如果是预览朋友圈，添加预览样式类
                if (moment.isPreview) {
                    $momentItem.addClass("xiaoxin-wechat-moments-item-preview");
                }

                // 用户头像和昵称容器（最上方）
                var $momentHeader = $(
                    '<div class="xiaoxin-wechat-moments-item-header"></div>'
                );

                // 用户头像（左上角顶格）
                var $momentAvatar = $(
                    '<div class="xiaoxin-wechat-moments-item-avatar"></div>'
                );

                // 如果是预览朋友圈，使用玩家账号信息
                var authorContact = null;
                var avatarUrl = null;
                var displayAuthorName = null;

                // 确保account变量存在，如果不存在则重新获取
                if (!account) {
                    account = _getAccount();
                }

                if (moment.isPreview) {
                    // 预览朋友圈：使用玩家账号信息
                    var playerAccount = account || _getAccount();
                    if (playerAccount) {
                        avatarUrl =
                            playerAccount.avatar ||
                            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
                        displayAuthorName =
                            playerAccount.nickname ||
                            playerAccount.name ||
                            moment.author ||
                            "微信用户";
                    } else {
                        avatarUrl =
                            moment.authorAvatar ||
                            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
                        displayAuthorName = moment.author || "微信用户";
                    }
                } else {
                    // 普通朋友圈：从联系人中查找
                    // 先检查是否是玩家自己的朋友圈（检查authorId和author两个字段）
                    var momentAuthorId =
                        moment.authorId || moment.userId || moment.author;
                    var momentAuthor = moment.author;
                    var isPlayerMoment = false;
                    if (account) {
                        var playerWechatId =
                            account.wechatId || account.id || "player";
                        var playerId = account.id || "player";

                        // 检查authorId
                        if (momentAuthorId) {
                            var momentAuthorIdStr =
                                String(momentAuthorId).trim();
                            var playerWechatIdStr =
                                String(playerWechatId).trim();
                            var playerIdStr = String(playerId).trim();

                            // 检查 authorId 是否为 "player" 或 "user"（兼容性处理）
                            var momentAuthorIdLower = momentAuthorIdStr.toLowerCase();
                            isPlayerMoment =
                                momentAuthorIdLower === "player" ||
                                momentAuthorIdLower === "user" ||
                                momentAuthorIdStr === playerWechatIdStr ||
                                momentAuthorIdStr === playerIdStr ||
                                momentAuthorIdStr ===
                                    "contact_" + playerWechatIdStr ||
                                momentAuthorIdStr ===
                                    "contact_" + playerIdStr ||
                                "contact_" + momentAuthorIdStr ===
                                    playerWechatIdStr ||
                                "contact_" + momentAuthorIdStr ===
                                    playerIdStr ||
                                momentAuthorIdStr.replace(/^contact_/, "") ===
                                    playerWechatIdStr.replace(
                                        /^contact_/,
                                        ""
                                    ) ||
                                momentAuthorIdStr.replace(/^contact_/, "") ===
                                    playerIdStr.replace(/^contact_/, "");
                        }

                        // 如果authorId没匹配到，再检查author字段
                        if (!isPlayerMoment && momentAuthor) {
                            var momentAuthorStr = String(momentAuthor).trim();
                            var playerWechatIdStr =
                                String(playerWechatId).trim();
                            var playerIdStr = String(playerId).trim();

                            // 检查 author 是否为 "player" 或 "user"（兼容性处理）
                            var momentAuthorLower = momentAuthorStr.toLowerCase();
                            isPlayerMoment =
                                momentAuthorLower === "player" ||
                                momentAuthorLower === "user" ||
                                momentAuthorStr === playerWechatIdStr ||
                                momentAuthorStr === playerIdStr ||
                                momentAuthorStr ===
                                    "contact_" + playerWechatIdStr ||
                                momentAuthorStr === "contact_" + playerIdStr ||
                                "contact_" + momentAuthorStr ===
                                    playerWechatIdStr ||
                                "contact_" + momentAuthorStr === playerIdStr ||
                                momentAuthorStr.replace(/^contact_/, "") ===
                                    playerWechatIdStr.replace(
                                        /^contact_/,
                                        ""
                                    ) ||
                                momentAuthorStr.replace(/^contact_/, "") ===
                                    playerIdStr.replace(/^contact_/, "");
                        }

                        // 如果仍然没匹配到，检查authorId是否为"player"或"user"（历史朋友圈可能只有authorId="player"或"user"）
                        if (!isPlayerMoment) {
                            var momentAuthorIdStr = momentAuthorId
                                ? String(momentAuthorId).trim()
                                : "";
                            var momentAuthorIdLower = momentAuthorIdStr.toLowerCase();
                            if (momentAuthorIdLower === "player" || momentAuthorIdLower === "user") {
                                isPlayerMoment = true;
                            }
                        }
                    }

                    if (isPlayerMoment && account) {
                        // 玩家自己的朋友圈：强制使用玩家账号信息
                        avatarUrl =
                            account.avatar ||
                            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
                        displayAuthorName =
                            account.nickname || account.name || "微信用户";
                        console.info(
                            "[小馨手机][微信] 检测到玩家自己的朋友圈（普通），使用昵称:",
                            displayAuthorName,
                            "authorId:",
                            momentAuthorId,
                            "author:",
                            momentAuthor,
                            "账号wechatId:",
                            account.wechatId,
                            "账号id:",
                            account.id
                        );
                    } else {
                        // 联系人的朋友圈：从联系人中查找
                        authorContact =
                            (moment.authorId &&
                                contactById[String(moment.authorId).trim()]) ||
                            null;
                        avatarUrl =
                            (authorContact && authorContact.avatar) ||
                            moment.authorAvatar ||
                            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
                    }
                }

                $momentAvatar.css("background-image", "url(" + avatarUrl + ")");

                // 添加点击事件：点击头像进入角色资料卡页面
                // 如果 authorContact 不存在，尝试从所有联系人中查找
                var contactToShow = authorContact;
                if (
                    !contactToShow &&
                    moment.authorId &&
                    contacts &&
                    contacts.length > 0
                ) {
                    var authorIdStr = String(moment.authorId).trim();
                    // 尝试从所有联系人中查找匹配的联系人
                    for (var i = 0; i < contacts.length; i++) {
                        var c = contacts[i];
                        if (!c) continue;
                        var contactIdStr = String(c.id || "").trim();
                        var contactCharacterIdStr = c.characterId
                            ? String(c.characterId).trim()
                            : "";
                        // 多种匹配方式
                        if (
                            contactIdStr === authorIdStr ||
                            contactIdStr === "contact_" + authorIdStr ||
                            authorIdStr === "contact_" + contactIdStr ||
                            contactIdStr.replace(/^contact_/, "") ===
                                authorIdStr.replace(/^contact_/, "") ||
                            (contactCharacterIdStr &&
                                contactCharacterIdStr === authorIdStr) ||
                            (contactCharacterIdStr &&
                                "contact_" + contactCharacterIdStr ===
                                    authorIdStr)
                        ) {
                            contactToShow = c;
                            break;
                        }
                    }
                }

                if (contactToShow) {
                    $momentAvatar.css("cursor", "pointer");
                    $momentAvatar.on("click", function (e) {
                        e.stopPropagation(); // 阻止事件冒泡，避免触发朋友圈的其他点击事件
                        console.info(
                            "[小馨手机][微信] 点击朋友圈头像，进入资料卡页面，联系人ID:",
                            contactToShow.id
                        );
                        if (
                            window.XiaoxinWeChatContacts &&
                            typeof window.XiaoxinWeChatContacts
                                .renderContactDetailPage === "function"
                        ) {
                            window.XiaoxinWeChatContacts.renderContactDetailPage(
                                $root,
                                mobilePhone,
                                contactToShow,
                                "朋友圈"
                            );
                        } else {
                            console.warn(
                                "[小馨手机][微信] renderContactDetailPage 方法不存在"
                            );
                            if (typeof toastr !== "undefined") {
                                toastr.info("联系人详情功能待实现", "小馨手机");
                            }
                        }
                    });
                }

                // 用户昵称（头像右侧，蓝色）
                // 如果还没有设置 displayAuthorName（非预览朋友圈），则从联系人中获取
                if (!displayAuthorName) {
                    // 确保account变量存在，如果不存在则重新获取
                    if (!account) {
                        account = _getAccount();
                    }

                    // 先检查是否是玩家自己的朋友圈（优先检查authorId，因为更准确）
                    var momentAuthorId =
                        moment.authorId || moment.userId || moment.author;
                    var isPlayerMoment = false;
                    if (momentAuthorId && account) {
                        var playerWechatId =
                            account.wechatId || account.id || "player";
                        var playerId = account.id || "player";
                        var momentAuthorIdStr = String(momentAuthorId).trim();
                        var playerWechatIdStr = String(playerWechatId).trim();
                        var playerIdStr = String(playerId).trim();

                        // 检查 author="player" 的情况（历史朋友圈生成）
                        isPlayerMoment =
                            momentAuthorIdStr === "player" ||
                            momentAuthorIdStr === playerWechatIdStr ||
                            momentAuthorIdStr === playerIdStr ||
                            momentAuthorIdStr ===
                                "contact_" + playerWechatIdStr ||
                            momentAuthorIdStr === "contact_" + playerIdStr ||
                            "contact_" + momentAuthorIdStr ===
                                playerWechatIdStr ||
                            "contact_" + momentAuthorIdStr === playerIdStr ||
                            momentAuthorIdStr.replace(/^contact_/, "") ===
                                playerWechatIdStr.replace(/^contact_/, "") ||
                            momentAuthorIdStr.replace(/^contact_/, "") ===
                                playerIdStr.replace(/^contact_/, "");
                    }

                    // 如果通过authorId没匹配到，再检查moment.author是否是玩家自己的微信号
                    if (!isPlayerMoment && moment.author && account) {
                        var authorStr = String(moment.author).trim();
                        var playerWechatId =
                            account.wechatId || account.id || "player";
                        var playerId = account.id || "player";
                        var playerWechatIdStr = String(playerWechatId).trim();
                        var playerIdStr = String(playerId).trim();

                        isPlayerMoment =
                            authorStr === playerWechatIdStr ||
                            authorStr === playerIdStr ||
                            authorStr === "contact_" + playerWechatIdStr ||
                            authorStr === "contact_" + playerIdStr ||
                            "contact_" + authorStr === playerWechatIdStr ||
                            "contact_" + authorStr === playerIdStr ||
                            authorStr.replace(/^contact_/, "") ===
                                playerWechatIdStr.replace(/^contact_/, "") ||
                            authorStr.replace(/^contact_/, "") ===
                                playerIdStr.replace(/^contact_/, "");
                    }

                    // 调试日志
                    console.info("[小馨手机][微信] 朋友圈昵称检查:", {
                        momentId: moment.id,
                        momentAuthorId: momentAuthorId,
                        momentAuthor: moment.author,
                        accountWechatId: account
                            ? account.wechatId || account.id
                            : null,
                        accountId: account ? account.id : null,
                        accountNickname: account ? account.nickname : null,
                        isPlayerMoment: isPlayerMoment,
                        hasAuthorContact: !!authorContact,
                    });

                    if (isPlayerMoment && account) {
                        // 玩家自己的朋友圈：强制使用账号的昵称
                        displayAuthorName =
                            account.nickname || account.name || "微信用户";
                        console.info(
                            "[小馨手机][微信] ✅ 检测到玩家自己的朋友圈，使用昵称:",
                            displayAuthorName,
                            "（authorId:",
                            momentAuthorId,
                            "author:",
                            moment.author,
                            "）"
                        );
                    } else if (authorContact) {
                        // 联系人的朋友圈：使用联系人的备注或昵称
                        displayAuthorName =
                            authorContact.remark ||
                            authorContact.nickname ||
                            authorContact.wechatNickname ||
                            moment.author ||
                            "微信用户";
                        console.info(
                            "[小馨手机][微信] 使用联系人昵称:",
                            displayAuthorName,
                            "（authorId:",
                            momentAuthorId,
                            "）"
                        );
                    } else {
                        // 其他情况：检查moment.author是否是微信号，如果是且匹配玩家，使用昵称
                        if (moment.author && account) {
                            var authorStr = String(moment.author).trim();
                            var playerWechatId =
                                account.wechatId || account.id || "player";
                            var playerId = account.id || "player";
                            var playerWechatIdStr =
                                String(playerWechatId).trim();
                            var playerIdStr = String(playerId).trim();

                            // 如果author是微信号格式，且匹配玩家，使用昵称
                            var authorMatchesPlayer =
                                authorStr === playerWechatIdStr ||
                                authorStr === playerIdStr ||
                                authorStr === "contact_" + playerWechatIdStr ||
                                authorStr === "contact_" + playerIdStr ||
                                "contact_" + authorStr === playerWechatIdStr ||
                                "contact_" + authorStr === playerIdStr ||
                                authorStr.replace(/^contact_/, "") ===
                                    playerWechatIdStr.replace(
                                        /^contact_/,
                                        ""
                                    ) ||
                                authorStr.replace(/^contact_/, "") ===
                                    playerIdStr.replace(/^contact_/, "");

                            if (authorMatchesPlayer) {
                                displayAuthorName =
                                    account.nickname ||
                                    account.name ||
                                    "微信用户";
                                console.info(
                                    "[小馨手机][微信] ✅ author是微信号且匹配玩家，使用昵称:",
                                    displayAuthorName,
                                    "（author:",
                                    moment.author,
                                    "playerWechatId:",
                                    playerWechatId,
                                    "）"
                                );
                            } else {
                                displayAuthorName = moment.author || "微信用户";
                                console.warn(
                                    "[小馨手机][微信] ⚠️ 未匹配到玩家，使用author:",
                                    moment.author,
                                    "（可能是微信号，playerWechatId:",
                                    playerWechatId,
                                    "playerId:",
                                    playerId,
                                    "）"
                                );
                            }
                        } else {
                            displayAuthorName = moment.author || "微信用户";
                        }
                    }
                }
                var $momentAuthor = $(
                    '<div class="xiaoxin-wechat-moments-item-author">' +
                        escapeHtml(displayAuthorName) +
                        "</div>"
                );

                $momentHeader.append($momentAvatar, $momentAuthor);

                // 先添加头像和昵称
                $momentItem.append($momentHeader);

                // 文字内容（在头像昵称下方）
                if (moment.content && moment.content.trim()) {
                    var $momentContent = $(
                        '<div class="xiaoxin-wechat-moments-item-content">' +
                            escapeHtml(moment.content) +
                            "</div>"
                    );
                    $momentItem.append($momentContent);
                }

                // 图片内容
                if (moment.images && moment.images.length > 0) {
                    var $momentImages = $(
                        '<div class="xiaoxin-wechat-moments-item-images"></div>'
                    );
                    var imageCount = moment.images.length;

                    // 根据图片数量设置不同的布局类
                    if (imageCount === 1) {
                        $momentImages.addClass("images-single");
                    } else if (imageCount === 2) {
                        $momentImages.addClass("images-2");
                    } else if (imageCount === 3) {
                        $momentImages.addClass("images-3");
                    } else if (imageCount === 4) {
                        $momentImages.addClass("images-4");
                    } else {
                        $momentImages.addClass("images-multi");
                    }

                    // 收集所有图片URL（用于预览）
                    var imageUrls = [];
                    var imageDescriptions = [];

                    // 处理每张图片（可能是URL或描述）
                    moment.images.forEach(function (imageData, index) {
                        var $imageItem = $(
                            '<div class="xiaoxin-wechat-moments-item-image" style="cursor: pointer;"></div>'
                        );

                        // 判断是URL还是描述
                        var imageUrl = null;
                        var imageDescription = null;

                        if (typeof imageData === "string") {
                            // 如果是字符串，判断是URL还是描述
                            var trimmedData = imageData.trim();
                            // 检查是否是URL格式（http://、https://、/、data:image 或包含图片扩展名）
                            var isUrl =
                                trimmedData.startsWith("http://") ||
                                trimmedData.startsWith("https://") ||
                                trimmedData.startsWith("/") ||
                                trimmedData.startsWith("data:image") ||
                                /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(
                                    trimmedData
                                );
                            if (isUrl) {
                                imageUrl = imageData;
                                console.info(
                                    "[小馨手机][微信] ✅ 检测到已保存的图片URL（字符串格式）:",
                                    index,
                                    imageUrl.substring(0, 80) + "..."
                                );
                            } else {
                                imageDescription = imageData;
                                console.info(
                                    "[小馨手机][微信] 📝 检测到图片描述（字符串格式）:",
                                    index,
                                    imageDescription.substring(0, 50) + "..."
                                );
                            }
                        } else if (
                            typeof imageData === "object" &&
                            imageData !== null
                        ) {
                            // 如果是对象，优先使用url字段（已生成的图片URL）
                            imageUrl = imageData.url || null;
                            imageDescription =
                                imageData.description || imageData.desc || null;

                            // 如果对象中有url字段，说明图片已生成，不再使用description
                            if (imageUrl) {
                                imageDescription = null;
                                console.info(
                                    "[小馨手机][微信] ✅ 检测到已保存的图片URL（对象格式）:",
                                    index,
                                    imageUrl.substring(0, 80) + "...",
                                    "完整对象:",
                                    imageData
                                );
                            } else if (imageDescription) {
                                // 检查description是否是URL格式（可能是之前保存的URL被误存为description）
                                var trimmedDesc = imageDescription.trim();
                                var isDescUrl =
                                    trimmedDesc.startsWith("http://") ||
                                    trimmedDesc.startsWith("https://") ||
                                    trimmedDesc.startsWith("/") ||
                                    trimmedDesc.startsWith("data:image") ||
                                    /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(
                                        trimmedDesc
                                    );
                                if (isDescUrl) {
                                    // description实际上是URL，使用它并清空description
                                    imageUrl = imageDescription;
                                    imageDescription = null;
                                    console.info(
                                        "[小馨手机][微信] ✅ 检测到description中的URL:",
                                        index,
                                        imageUrl.substring(0, 80) + "..."
                                    );
                                } else {
                                    console.info(
                                        "[小馨手机][微信] 📝 检测到图片描述（对象格式）:",
                                        index,
                                        imageDescription.substring(0, 50) +
                                            "...",
                                        "完整对象:",
                                        imageData
                                    );
                                }
                            } else {
                                console.warn(
                                    "[小馨手机][微信] ⚠️ 图片数据对象既没有url也没有description:",
                                    index,
                                    imageData
                                );
                            }
                        } else {
                            console.warn(
                                "[小馨手机][微信] ⚠️ 图片数据类型未知:",
                                index,
                                typeof imageData,
                                imageData
                            );
                        }

                        // 如果有URL，直接使用
                        if (imageUrl) {
                            $imageItem.css(
                                "background-image",
                                "url(" + imageUrl + ")"
                            );
                            imageUrls.push(imageUrl);
                            // 保存URL到data属性
                            $imageItem.data("image-url", imageUrl);
                        } else if (imageDescription) {
                            // 如果是描述，先显示占位图，然后调用API生成
                            $imageItem.css(
                                "background-image",
                                "url(/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg)"
                            );
                            $imageItem.addClass(
                                "xiaoxin-wechat-moments-image-loading"
                            );
                            imageDescriptions.push({
                                index: index,
                                description: imageDescription,
                                $item: $imageItem,
                            });

                            // 调用API生成图片
                            (function (desc, $img, imgIndex, momentId) {
                                if (
                                    window.XiaoxinAI &&
                                    typeof window.XiaoxinAI.generateImage ===
                                        "function"
                                ) {
                                    // 使用配置中的正向提示词（不再硬编码）
                                    window.XiaoxinAI.generateImage({
                                        prompt: desc,
                                    })
                                        .then(function (generatedUrl) {
                                            if (generatedUrl) {
                                                $img.css(
                                                    "background-image",
                                                    "url(" + generatedUrl + ")"
                                                );
                                                $img.removeClass(
                                                    "xiaoxin-wechat-moments-image-loading"
                                                );
                                                // 保存生成的URL到data属性
                                                $img.data(
                                                    "image-url",
                                                    generatedUrl
                                                );
                                                // 更新imageUrls数组
                                                imageUrls[imgIndex] =
                                                    generatedUrl;

                                                // 保存图片URL到持久化存储（强制保存，确保不丢失）
                                                if (!momentId) {
                                                    console.error(
                                                        "[小馨手机][微信] ❌ momentId为空，无法保存图片URL"
                                                    );
                                                } else if (
                                                    !window.XiaoxinWeChatDataHandler ||
                                                    typeof window
                                                        .XiaoxinWeChatDataHandler
                                                        .updateMoment !==
                                                        "function"
                                                ) {
                                                    console.error(
                                                        "[小馨手机][微信] ❌ XiaoxinWeChatDataHandler或updateMoment不可用"
                                                    );
                                                } else {
                                                    // 使用立即执行函数确保保存逻辑执行
                                                    (function (
                                                        url,
                                                        idx,
                                                        mid,
                                                        descText
                                                    ) {
                                                        try {
                                                            // 延迟一小段时间确保数据已更新
                                                            setTimeout(
                                                                function () {
                                                                    try {
                                                                        // 重新获取最新的朋友圈数据
                                                                        var allMoments =
                                                                            window.XiaoxinWeChatDataHandler.getMoments() ||
                                                                            [];
                                                                        var foundIndex =
                                                                            allMoments.findIndex(
                                                                                function (
                                                                                    m
                                                                                ) {
                                                                                    return (
                                                                                        m.id ===
                                                                                            mid ||
                                                                                        m._id ===
                                                                                            mid
                                                                                    );
                                                                                }
                                                                            );

                                                                        if (
                                                                            foundIndex ===
                                                                            -1
                                                                        ) {
                                                                            console.error(
                                                                                "[小馨手机][微信] ❌ 未找到朋友圈动态，ID:",
                                                                                mid,
                                                                                "所有ID:",
                                                                                allMoments.map(
                                                                                    function (
                                                                                        m
                                                                                    ) {
                                                                                        return (
                                                                                            m.id ||
                                                                                            m._id
                                                                                        );
                                                                                    }
                                                                                )
                                                                            );
                                                                            return;
                                                                        }

                                                                        var targetMoment =
                                                                            allMoments[
                                                                                foundIndex
                                                                            ];
                                                                        if (
                                                                            !targetMoment.images
                                                                        ) {
                                                                            targetMoment.images =
                                                                                [];
                                                                        }
                                                                        if (
                                                                            !Array.isArray(
                                                                                targetMoment.images
                                                                            )
                                                                        ) {
                                                                            targetMoment.images =
                                                                                [];
                                                                        }

                                                                        // 确保数组长度足够
                                                                        while (
                                                                            targetMoment
                                                                                .images
                                                                                .length <=
                                                                            idx
                                                                        ) {
                                                                            targetMoment.images.push(
                                                                                null
                                                                            );
                                                                        }

                                                                        // 更新图片数据：直接保存为URL字符串（最简单可靠的方式）
                                                                        targetMoment.images[
                                                                            idx
                                                                        ] = url;

                                                                        // 保存到持久化存储
                                                                        window.XiaoxinWeChatDataHandler.updateMoment(
                                                                            mid,
                                                                            {
                                                                                images: targetMoment.images,
                                                                            }
                                                                        );

                                                                        // 验证保存是否成功
                                                                        var verifyMoments =
                                                                            window.XiaoxinWeChatDataHandler.getMoments() ||
                                                                            [];
                                                                        var verifyMoment =
                                                                            verifyMoments.find(
                                                                                function (
                                                                                    m
                                                                                ) {
                                                                                    return (
                                                                                        m.id ===
                                                                                            mid ||
                                                                                        m._id ===
                                                                                            mid
                                                                                    );
                                                                                }
                                                                            );
                                                                        if (
                                                                            verifyMoment &&
                                                                            verifyMoment.images &&
                                                                            verifyMoment
                                                                                .images[
                                                                                idx
                                                                            ] ===
                                                                                url
                                                                        ) {
                                                                            console.info(
                                                                                "[小馨手机][微信] ✅✅✅ 图片URL已成功保存并验证:",
                                                                                {
                                                                                    momentId:
                                                                                        mid,
                                                                                    imgIndex:
                                                                                        idx,
                                                                                    url:
                                                                                        url.substring(
                                                                                            0,
                                                                                            80
                                                                                        ) +
                                                                                        "...",
                                                                                    savedValue:
                                                                                        verifyMoment
                                                                                            .images[
                                                                                            idx
                                                                                        ]
                                                                                            ? verifyMoment.images[
                                                                                                  idx
                                                                                              ].substring(
                                                                                                  0,
                                                                                                  80
                                                                                              ) +
                                                                                              "..."
                                                                                            : "null",
                                                                                }
                                                                            );
                                                                        } else {
                                                                            console.error(
                                                                                "[小馨手机][微信] ❌❌❌ 保存验证失败！",
                                                                                {
                                                                                    momentId:
                                                                                        mid,
                                                                                    imgIndex:
                                                                                        idx,
                                                                                    expected:
                                                                                        url.substring(
                                                                                            0,
                                                                                            80
                                                                                        ) +
                                                                                        "...",
                                                                                    actual:
                                                                                        verifyMoment &&
                                                                                        verifyMoment.images
                                                                                            ? verifyMoment
                                                                                                  .images[
                                                                                                  idx
                                                                                              ]
                                                                                            : "undefined",
                                                                                }
                                                                            );
                                                                        }
                                                                    } catch (err) {
                                                                        console.error(
                                                                            "[小馨手机][微信] ❌ 保存图片URL时发生错误:",
                                                                            err,
                                                                            err.stack
                                                                        );
                                                                    }
                                                                },
                                                                100
                                                            ); // 延迟100ms确保数据已更新
                                                        } catch (err) {
                                                            console.error(
                                                                "[小馨手机][微信] ❌ 保存图片URL外层错误:",
                                                                err
                                                            );
                                                        }
                                                    })(
                                                        generatedUrl,
                                                        imgIndex,
                                                        momentId,
                                                        desc
                                                    );
                                                }

                                                console.info(
                                                    "[小馨手机][微信] 图片生成成功:",
                                                    generatedUrl
                                                );
                                            } else {
                                                console.warn(
                                                    "[小馨手机][微信] 图片生成失败，使用默认图片"
                                                );
                                                $img.removeClass(
                                                    "xiaoxin-wechat-moments-image-loading"
                                                );
                                            }
                                        })
                                        .catch(function (error) {
                                            console.error(
                                                "[小馨手机][微信] 图片生成异常:",
                                                error
                                            );
                                            $img.removeClass(
                                                "xiaoxin-wechat-moments-image-loading"
                                            );
                                        });
                                } else {
                                    console.warn(
                                        "[小馨手机][微信] 图片生成API未配置，使用默认图片"
                                    );
                                    $img.removeClass(
                                        "xiaoxin-wechat-moments-image-loading"
                                    );
                                }
                            })(
                                imageDescription,
                                $imageItem,
                                index,
                                moment.id || moment._id || null
                            );
                        } else {
                            // 默认图片
                            var defaultImageUrl =
                                "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
                            $imageItem.css(
                                "background-image",
                                "url(" + defaultImageUrl + ")"
                            );
                            imageUrls.push(defaultImageUrl);
                            $imageItem.data("image-url", defaultImageUrl);
                        }

                        // 添加点击事件：放大查看图片
                        $imageItem.on("click", function (e) {
                            e.stopPropagation();
                            // 收集当前所有可用的图片URL（包括已生成的）
                            var currentImageUrls = [];
                            $momentImages
                                .find(".xiaoxin-wechat-moments-item-image")
                                .each(function () {
                                    var url = $(this).data("image-url");
                                    if (url) {
                                        currentImageUrls.push(url);
                                    }
                                });
                            // 如果当前点击的图片URL不在列表中，添加它
                            var clickedUrl = $imageItem.data("image-url");
                            if (
                                clickedUrl &&
                                currentImageUrls.indexOf(clickedUrl) === -1
                            ) {
                                currentImageUrls.push(clickedUrl);
                            }
                            // 找到当前点击的图片在数组中的索引
                            var clickedIndex =
                                currentImageUrls.indexOf(clickedUrl);
                            if (clickedIndex === -1) {
                                clickedIndex = 0;
                            }
                            // 显示预览
                            if (currentImageUrls.length > 0) {
                                _showMomentsImagePreview(
                                    currentImageUrls,
                                    clickedIndex,
                                    $root
                                );
                            }
                        });

                        $momentImages.append($imageItem);
                    });

                    // 如果没有文字内容，图片要向上移动，与文字内容位置对齐
                    if (!moment.content || !moment.content.trim()) {
                        $momentImages.css("margin-top", "-38px");
                    }

                    $momentItem.append($momentImages);
                }

                // 音乐分享内容
                if (moment.type === "music" && moment.music) {
                    var $musicShare = $(
                        '<div class="xiaoxin-wechat-moments-item-music"></div>'
                    );
                    var $musicCover = $(
                        '<div class="xiaoxin-wechat-moments-item-music-cover"></div>'
                    );

                    // 处理音乐封面（可能是URL或描述）
                    var coverUrl = null;
                    var coverDescription = null;

                    if (moment.music.cover) {
                        if (typeof moment.music.cover === "string") {
                            // 如果是字符串，判断是URL还是描述
                            var trimmedCover = moment.music.cover.trim();
                            var isCoverUrl =
                                trimmedCover.startsWith("http://") ||
                                trimmedCover.startsWith("https://") ||
                                trimmedCover.startsWith("/") ||
                                trimmedCover.startsWith("data:image") ||
                                /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(
                                    trimmedCover
                                );
                            if (isCoverUrl) {
                                coverUrl = moment.music.cover;
                                console.info(
                                    "[小馨手机][微信] ✅ 检测到已保存的音乐封面URL（字符串格式）:",
                                    coverUrl.substring(0, 80) + "..."
                                );
                            } else {
                                coverDescription = moment.music.cover;
                                console.info(
                                    "[小馨手机][微信] 📝 检测到音乐封面描述（字符串格式）:",
                                    coverDescription.substring(0, 50) + "..."
                                );
                            }
                        } else if (
                            typeof moment.music.cover === "object" &&
                            moment.music.cover !== null
                        ) {
                            // 如果是对象，优先使用url字段（已生成的封面URL）
                            coverUrl = moment.music.cover.url || null;
                            coverDescription =
                                moment.music.cover.description ||
                                moment.music.cover.desc ||
                                null;

                            if (coverUrl) {
                                coverDescription = null;
                                console.info(
                                    "[小馨手机][微信] ✅ 检测到已保存的音乐封面URL（对象格式）:",
                                    coverUrl.substring(0, 80) + "..."
                                );
                            } else if (coverDescription) {
                                var trimmedDesc = coverDescription.trim();
                                var isDescUrl =
                                    trimmedDesc.startsWith("http://") ||
                                    trimmedDesc.startsWith("https://") ||
                                    trimmedDesc.startsWith("/") ||
                                    trimmedDesc.startsWith("data:image") ||
                                    /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(
                                        trimmedDesc
                                    );
                                if (isDescUrl) {
                                    coverUrl = coverDescription;
                                    coverDescription = null;
                                    console.info(
                                        "[小馨手机][微信] ✅ 检测到description中的音乐封面URL:",
                                        coverUrl.substring(0, 80) + "..."
                                    );
                                } else {
                                    console.info(
                                        "[小馨手机][微信] 📝 检测到音乐封面描述（对象格式）:",
                                        coverDescription.substring(0, 50) +
                                            "..."
                                    );
                                }
                            }
                        }
                    }

                    // 如果有URL，直接使用
                    if (coverUrl) {
                        $musicCover.css(
                            "background-image",
                            "url(" + coverUrl + ")"
                        );
                    } else if (coverDescription) {
                        // 如果是描述，先显示占位图，然后调用API生成
                        $musicCover.css(
                            "background-image",
                            "url(/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg)"
                        );
                        $musicCover.addClass(
                            "xiaoxin-wechat-moments-image-loading"
                        );

                        // 调用API生成专辑封面
                        (function (desc, $cover, momentId) {
                            if (
                                window.XiaoxinAI &&
                                typeof window.XiaoxinAI.generateImage ===
                                    "function"
                            ) {
                                // 使用配置中的正向提示词（不再硬编码）
                                // 如果需要专辑封面风格，可以在描述中添加 "music album cover design"
                                window.XiaoxinAI.generateImage({
                                    prompt: desc,
                                })
                                    .then(function (generatedUrl) {
                                        if (generatedUrl) {
                                            $cover.css(
                                                "background-image",
                                                "url(" + generatedUrl + ")"
                                            );
                                            $cover.removeClass(
                                                "xiaoxin-wechat-moments-image-loading"
                                            );
                                            console.info(
                                                "[小馨手机][微信] 音乐封面生成成功:",
                                                generatedUrl
                                            );

                                            // 保存音乐封面URL到持久化存储
                                            if (
                                                momentId &&
                                                window.XiaoxinWeChatDataHandler &&
                                                typeof window
                                                    .XiaoxinWeChatDataHandler
                                                    .updateMoment === "function"
                                            ) {
                                                (function (url, mid, descText) {
                                                    setTimeout(function () {
                                                        try {
                                                            var allMoments =
                                                                window.XiaoxinWeChatDataHandler.getMoments() ||
                                                                [];
                                                            var foundIndex =
                                                                allMoments.findIndex(
                                                                    function (
                                                                        m
                                                                    ) {
                                                                        return (
                                                                            m.id ===
                                                                                mid ||
                                                                            m._id ===
                                                                                mid
                                                                        );
                                                                    }
                                                                );

                                                            if (
                                                                foundIndex !==
                                                                -1
                                                            ) {
                                                                var targetMoment =
                                                                    allMoments[
                                                                        foundIndex
                                                                    ];
                                                                if (
                                                                    !targetMoment.music
                                                                ) {
                                                                    targetMoment.music =
                                                                        {};
                                                                }
                                                                // 直接保存为URL字符串
                                                                targetMoment.music.cover =
                                                                    url;

                                                                window.XiaoxinWeChatDataHandler.updateMoment(
                                                                    mid,
                                                                    {
                                                                        music: targetMoment.music,
                                                                    }
                                                                );

                                                                // 验证保存
                                                                var verifyMoments =
                                                                    window.XiaoxinWeChatDataHandler.getMoments() ||
                                                                    [];
                                                                var verifyMoment =
                                                                    verifyMoments.find(
                                                                        function (
                                                                            m
                                                                        ) {
                                                                            return (
                                                                                m.id ===
                                                                                    mid ||
                                                                                m._id ===
                                                                                    mid
                                                                            );
                                                                        }
                                                                    );
                                                                if (
                                                                    verifyMoment &&
                                                                    verifyMoment.music &&
                                                                    verifyMoment
                                                                        .music
                                                                        .cover ===
                                                                        url
                                                                ) {
                                                                    console.info(
                                                                        "[小馨手机][微信] ✅✅✅ 音乐封面URL已成功保存并验证:",
                                                                        {
                                                                            momentId:
                                                                                mid,
                                                                            url:
                                                                                url.substring(
                                                                                    0,
                                                                                    80
                                                                                ) +
                                                                                "...",
                                                                        }
                                                                    );
                                                                } else {
                                                                    console.error(
                                                                        "[小馨手机][微信] ❌❌❌ 音乐封面保存验证失败！",
                                                                        {
                                                                            momentId:
                                                                                mid,
                                                                            expected:
                                                                                url.substring(
                                                                                    0,
                                                                                    80
                                                                                ) +
                                                                                "...",
                                                                            actual:
                                                                                verifyMoment &&
                                                                                verifyMoment.music
                                                                                    ? verifyMoment
                                                                                          .music
                                                                                          .cover
                                                                                    : "undefined",
                                                                        }
                                                                    );
                                                                }
                                                            } else {
                                                                console.error(
                                                                    "[小馨手机][微信] ❌ 未找到朋友圈动态（音乐封面）:",
                                                                    mid
                                                                );
                                                            }
                                                        } catch (err) {
                                                            console.error(
                                                                "[小馨手机][微信] ❌ 保存音乐封面URL时发生错误:",
                                                                err,
                                                                err.stack
                                                            );
                                                        }
                                                    }, 100);
                                                })(
                                                    generatedUrl,
                                                    momentId,
                                                    desc
                                                );
                                            }
                                        } else {
                                            console.warn(
                                                "[小馨手机][微信] 音乐封面生成失败，使用默认图片"
                                            );
                                            $cover.removeClass(
                                                "xiaoxin-wechat-moments-image-loading"
                                            );
                                        }
                                    })
                                    .catch(function (error) {
                                        console.error(
                                            "[小馨手机][微信] 音乐封面生成异常:",
                                            error
                                        );
                                        $cover.removeClass(
                                            "xiaoxin-wechat-moments-image-loading"
                                        );
                                    });
                            } else {
                                console.warn(
                                    "[小馨手机][微信] 图片生成API未配置，使用默认图片"
                                );
                                $cover.removeClass(
                                    "xiaoxin-wechat-moments-image-loading"
                                );
                            }
                        })(
                            coverDescription,
                            $musicCover,
                            moment.id || moment._id || null
                        );
                    } else {
                        // 默认图片
                        $musicCover.css(
                            "background-image",
                            "url(/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg)"
                        );
                    }

                    var $musicPlayIcon = $(
                        '<div class="xiaoxin-wechat-moments-item-music-play">▶</div>'
                    );
                    $musicCover.append($musicPlayIcon);

                    var $musicInfo = $(
                        '<div class="xiaoxin-wechat-moments-item-music-info"></div>'
                    );
                    var $musicTitle = $(
                        '<div class="xiaoxin-wechat-moments-item-music-title">' +
                            escapeHtml(moment.music.title || "") +
                            "</div>"
                    );
                    var $musicArtist = $(
                        '<div class="xiaoxin-wechat-moments-item-music-artist">' +
                            escapeHtml(moment.music.artist || "") +
                            "</div>"
                    );
                    $musicInfo.append($musicTitle, $musicArtist);
                    $musicShare.append($musicCover, $musicInfo);

                    // 如果没有文字内容，音乐要向上移动，与文字内容位置对齐
                    if (!moment.content || !moment.content.trim()) {
                        $musicShare.css("margin-top", "-38px");
                    }

                    $momentItem.append($musicShare);

                    // 音乐平台显示在时间上方
                    if (moment.music.platform) {
                        var $musicPlatform = $(
                            '<div class="xiaoxin-wechat-moments-item-music-platform">' +
                                escapeHtml(moment.music.platform) +
                                "</div>"
                        );
                        $momentItem.append($musicPlatform);
                    }
                }

                // 时间信息
                var $momentTime = $(
                    '<div class="xiaoxin-wechat-moments-item-time"></div>'
                );
                var timeText = _formatMomentTime(
                    moment.timestamp,
                    baseTimestamp
                );

                // 如果是预览朋友圈，在时间前添加预览标识
                if (moment.isPreview) {
                    var $previewBadge = $(
                        '<span class="xiaoxin-wechat-moments-preview-badge" style="color: #ff9500; font-size: 12px; margin-right: 8px; font-weight: 500;">[预览]</span>'
                    );
                    $momentTime.append($previewBadge);
                }

                $momentTime.append($("<span>").text(timeText));

                // 地址信息（如果有，添加到时间行中，显示在时间右侧）
                if (moment.location && moment.location.name) {
                    var $location = $(
                        '<div class="xiaoxin-wechat-moments-item-location">' +
                            escapeHtml(moment.location.name) +
                            "</div>"
                    );
                    $momentTime.append($location);
                }

                // 右下角两点按钮
                var $moreBtn = $(
                    '<div class="xiaoxin-wechat-moments-item-more">⋯</div>'
                );

                // 点赞和评论选项（默认隐藏，点击两点按钮后向左展开）
                var $momentActions = $(
                    '<div class="xiaoxin-wechat-moments-item-actions"></div>'
                );

                // 点赞按钮（未点赞状态：白色线条爱心）
                var isLiked = moment.isLiked || false;
                var likeIconSvg = isLiked
                    ? '<svg class="xiaoxin-wechat-moments-like-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ff2442" stroke="none"/></svg>'
                    : '<svg class="xiaoxin-wechat-moments-like-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="#fff" stroke-width="1.5"/></svg>';
                var likeText = isLiked ? "取消" : "赞";
                var $likeBtn = $(
                    '<div class="xiaoxin-wechat-moments-item-like' +
                        (isLiked ? " liked" : "") +
                        '">' +
                        likeIconSvg +
                        '<span class="xiaoxin-wechat-moments-like-text">' +
                        likeText +
                        "</span>" +
                        "</div>"
                );

                // 评论按钮（SVG矢量图标）
                var commentIconSvg =
                    '<svg class="xiaoxin-wechat-moments-comment-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                var $commentBtn = $(
                    '<div class="xiaoxin-wechat-moments-item-comment">' +
                        commentIconSvg +
                        '<span class="xiaoxin-wechat-moments-comment-text">评论</span>' +
                        "</div>"
                );

                $momentActions.append($likeBtn, $commentBtn);

                // 点赞列表容器（在外部作用域定义，以便在更新函数中使用）
                var $likesContainer = null;

                // 更新点赞列表显示的函数
                var updateLikesDisplay = function () {
                    if (!$likesContainer) {
                        // 如果点赞列表容器不存在，创建它
                        $likesContainer = $(
                            '<div class="xiaoxin-wechat-moments-item-likes"></div>'
                        );
                        // 插入到时间行之后
                        $momentItem
                            .find(".xiaoxin-wechat-moments-item-time-row")
                            .after($likesContainer);
                    }

                    if (moment.likes && moment.likes.length > 0) {
                        console.info(
                            "[小馨手机][微信] 朋友圈页面: 朋友圈ID:",
                            moment.id,
                            "点赞列表:",
                            moment.likes
                        );
                        // 获取当前玩家信息
                        var account = _getAccount();
                        var playerNickname = account.nickname || "微信用户";
                        var momentAuthor =
                            moment.author || moment.authorId || moment.userId;

                        // 过滤掉玩家看不到的点赞（只显示玩家可以看到的点赞）
                        // 规则：玩家可以看到自己的点赞、朋友圈作者的点赞、以及与朋友圈作者和玩家都是好友的用户的点赞（共同好友）
                        var visibleLikes = moment.likes.filter(function (name) {
                            var canSee = _canPlayerSeeInteraction(
                                playerNickname,
                                momentAuthor,
                                name
                            );
                            if (!canSee) {
                                console.info(
                                    "[小馨手机][微信] 朋友圈页面: 点赞被过滤，点赞者:",
                                    name,
                                    "朋友圈作者:",
                                    momentAuthor
                                );
                            }
                            return canSee;
                        });
                        // 去重：避免重复扫描/历史脏数据导致同一人重复点赞显示
                        visibleLikes = Array.from(
                            new Set(
                                visibleLikes.map(function (v) {
                                    return String(v || "").trim();
                                })
                            )
                        ).filter(function (v) {
                            return v;
                        });
                        console.info(
                            "[小馨手机][微信] 朋友圈页面: 过滤后可见点赞数量:",
                            visibleLikes.length,
                            "原始点赞数量:",
                            moment.likes.length
                        );

                        if (visibleLikes.length > 0) {
                            // 蓝色线型爱心SVG图标
                            var likeIconSvg =
                                '<svg class="xiaoxin-wechat-moments-item-likes-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="#576b95" stroke-width="1.5"/></svg>';
                            var likesText =
                                '<span class="xiaoxin-wechat-moments-item-likes-icon-wrapper">' +
                                likeIconSvg +
                                "</span>";
                            likesText +=
                                '<span class="xiaoxin-wechat-moments-item-likes-names">' +
                                visibleLikes
                                    .map(function (idOrName) {
                                        // 将ID转换为显示名称
                                        var displayName =
                                            _getDisplayNameById(idOrName);
                                        return (
                                            '<span class="xiaoxin-wechat-moments-item-like-name">' +
                                            escapeHtml(displayName) +
                                            "</span>"
                                        );
                                    })
                                    .join(", ") +
                                "</span>";
                            $likesContainer.html(likesText).show();
                        } else {
                            // 如果没有可见的点赞，隐藏点赞列表
                            $likesContainer.hide();
                        }
                    } else {
                        // 如果没有点赞，隐藏点赞列表
                        if ($likesContainer) {
                            $likesContainer.hide();
                        }
                    }
                };

                // 点赞按钮点击事件
                $likeBtn.on("click", function (e) {
                    e.stopPropagation();
                    var account = _getAccount();
                    var playerNickname = account.nickname || "微信用户";

                    var wasLiked = isLiked;
                    isLiked = !isLiked;
                    moment.isLiked = isLiked;

                    // 初始化点赞列表
                    if (!moment.likes) {
                        moment.likes = [];
                    }

                    // 更新点赞列表数据
                    if (isLiked) {
                        // 点赞：添加玩家昵称到点赞列表末尾（如果不存在）
                        if (moment.likes.indexOf(playerNickname) === -1) {
                            moment.likes.push(playerNickname);
                        }
                        $likeBtn.addClass("liked");
                        $likeBtn.html(
                            '<svg class="xiaoxin-wechat-moments-like-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ff2442" stroke="none"/></svg><span class="xiaoxin-wechat-moments-like-text">取消</span>'
                        );

                        // 生成点赞指令并插入到酒馆输入框
                        // 获取朋友圈内容摘要（用于AI理解上下文）
                        var momentContentPreview = "";
                        if (moment.content) {
                            momentContentPreview = moment.content.substring(
                                0,
                                50
                            );
                            if (moment.content.length > 50) {
                                momentContentPreview += "...";
                            }
                        } else if (moment.music) {
                            momentContentPreview =
                                "分享音乐：" +
                                (moment.music.title || "") +
                                " - " +
                                (moment.music.artist || "");
                        } else if (moment.images && moment.images.length > 0) {
                            momentContentPreview =
                                "发布了" + moment.images.length + "张图片";
                        }

                        var likeCommand =
                            '<moments-interactions>\n  <like momentId="' +
                            escapeHtml(moment.id) +
                            '" liker="' +
                            escapeHtml(playerNickname) +
                            '"></like>\n</moments-interactions>';
                        // 添加注释，帮助AI理解上下文
                        if (momentContentPreview) {
                            likeCommand =
                                "<!-- 玩家对朋友圈（ID: " +
                                escapeHtml(moment.id) +
                                "，内容：" +
                                escapeHtml(momentContentPreview) +
                                "）进行了点赞 -->\n" +
                                likeCommand;
                        }
                        _insertTextToTavernInput(likeCommand);

                        // 保存到数据
                        if (window.XiaoxinWeChatDataHandler) {
                            window.XiaoxinWeChatDataHandler.updateMoment(
                                moment.id,
                                moment
                            );
                        }
                    } else {
                        // 取消点赞：从点赞列表中移除玩家昵称
                        var index = moment.likes.indexOf(playerNickname);
                        if (index > -1) {
                            moment.likes.splice(index, 1);
                        }
                        $likeBtn.removeClass("liked");
                        $likeBtn.html(
                            '<svg class="xiaoxin-wechat-moments-like-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="#fff" stroke-width="1.5"/></svg><span class="xiaoxin-wechat-moments-like-text">赞</span>'
                        );
                    }

                    // 更新点赞列表显示
                    updateLikesDisplay();

                    // 点击点赞后，1秒后自动折叠回互动按钮
                    if (autoHideTimer) {
                        clearTimeout(autoHideTimer);
                    }
                    autoHideTimer = setTimeout(function () {
                        hideActions();
                    }, 1000);
                });

                // 检查两个用户是否为好友的辅助函数
                function _checkFriends(playerName, authorName) {
                    var contactMap = _getContactMap();

                    // 检查两个用户是否都在联系人列表中（即为好友）
                    var hasPlayer = contactMap[playerName] !== undefined;
                    var hasAuthor = contactMap[authorName] !== undefined;

                    return hasPlayer && hasAuthor;
                }

                // 评论按钮点击事件
                $commentBtn.on("click", function (e) {
                    e.stopPropagation();

                    // 显示评论输入框
                    var account = _getAccount();
                    var playerNickname = account.nickname || "微信用户";
                    var momentAuthor = moment.author;

                    // 显示评论输入对话框（不需要检查好友关系）
                    _showCommentDialog(
                        {
                            title: "评论朋友圈",
                            placeholder: "请输入评论内容",
                        },
                        $root
                    )
                        .then(function (result) {
                            // 初始化评论列表
                            if (!moment.comments) {
                                moment.comments = [];
                            }

                            // 解析内容（用|分隔）
                            var contentParts = result.content.split("|");
                            var textContent = contentParts[0] || "";
                            var imageDescs = [];
                            var emojiFile = null;

                            // 识别图片描述和表情包
                            for (var i = 1; i < contentParts.length; i++) {
                                var part = contentParts[i].trim();
                                if (!part) continue;

                                // 检查是否是表情包文件名（在表情包列表中）
                                var emojiList = _getEmojiList();
                                if (emojiList.indexOf(part) !== -1) {
                                    emojiFile = part;
                                } else {
                                    // 否则是图片描述
                                    imageDescs.push(part);
                                }
                            }

                            // 创建新评论
                            var newComment = {
                                id: "comment_" + Date.now(),
                                author: playerNickname,
                                content: textContent,
                                type: "text",
                                timestamp: Date.now(),
                            };

                            // 如果有图片描述，添加到评论中
                            if (imageDescs.length > 0) {
                                newComment.images = imageDescs;
                            }

                            // 如果有表情包，添加到评论中
                            if (emojiFile) {
                                newComment.emoji = emojiFile;
                            }

                            // 追加到评论列表末尾
                            moment.comments.push(newComment);

                            // 生成评论指令并插入到酒馆输入框
                            // 获取朋友圈内容摘要（用于AI理解上下文）
                            var momentContentPreview = "";
                            if (moment.content) {
                                momentContentPreview = moment.content.substring(
                                    0,
                                    50
                                );
                                if (moment.content.length > 50) {
                                    momentContentPreview += "...";
                                }
                            } else if (moment.music) {
                                momentContentPreview =
                                    "分享音乐：" +
                                    (moment.music.title || "") +
                                    " - " +
                                    (moment.music.artist || "");
                            } else if (
                                moment.images &&
                                moment.images.length > 0
                            ) {
                                momentContentPreview =
                                    "发布了" + moment.images.length + "张图片";
                            }

                            var commentCommand =
                                '<moments-interactions>\n  <comment momentId="' +
                                escapeHtml(moment.id) +
                                '" commenter="' +
                                escapeHtml(playerNickname) +
                                '">\n    <content>' +
                                escapeHtml(result.content) +
                                "</content>\n  </comment>\n</moments-interactions>";
                            // 添加注释，帮助AI理解上下文
                            if (momentContentPreview) {
                                commentCommand =
                                    "<!-- 玩家对朋友圈（ID: " +
                                    escapeHtml(moment.id) +
                                    "，作者：" +
                                    escapeHtml(moment.author) +
                                    "，内容：" +
                                    escapeHtml(momentContentPreview) +
                                    "）进行了评论 -->\n" +
                                    commentCommand;
                            }
                            _insertTextToTavernInput(commentCommand);

                            // 保存到数据
                            if (window.XiaoxinWeChatDataHandler) {
                                window.XiaoxinWeChatDataHandler.updateMoment(
                                    moment.id,
                                    moment
                                );
                            }

                            // 更新评论区域显示
                            if (!$commentsContainer) {
                                $commentsContainer = $(
                                    '<div class="xiaoxin-wechat-moments-item-comments"></div>'
                                );
                                // 插入到点赞列表之后（如果有且可见）或时间行之后
                                if (
                                    $likesContainer &&
                                    $likesContainer.length > 0 &&
                                    $likesContainer.is(":visible")
                                ) {
                                    $likesContainer.after($commentsContainer);
                                } else {
                                    $momentItem
                                        .find(
                                            ".xiaoxin-wechat-moments-item-time-row"
                                        )
                                        .after($commentsContainer);
                                }
                            }

                            // 渲染新评论（使用统一的渲染函数）
                            var $commentItem = renderCommentItem(
                                newComment,
                                $root
                            );
                            $commentsContainer.append($commentItem);

                            // 点击评论后，1秒后自动折叠回互动按钮
                            if (autoHideTimer) {
                                clearTimeout(autoHideTimer);
                            }
                            autoHideTimer = setTimeout(function () {
                                hideActions();
                            }, 1000);
                        })
                        .catch(function (error) {
                            // 用户取消，不做任何操作
                            console.log(
                                "[小馨手机][微信] 用户取消评论:",
                                error.message
                            );
                        });
                });

                // 点击两点按钮展开/收起操作选项
                var isActionsVisible = false;
                var autoHideTimer = null;

                // 自动隐藏互动按钮的函数
                var hideActions = function () {
                    $momentActions.removeClass("actions-visible");
                    isActionsVisible = false;
                    if (autoHideTimer) {
                        clearTimeout(autoHideTimer);
                        autoHideTimer = null;
                    }
                };

                $moreBtn.on("click", function (e) {
                    e.stopPropagation();
                    isActionsVisible = !isActionsVisible;
                    if (isActionsVisible) {
                        $momentActions.addClass("actions-visible");
                        // 清除之前的定时器
                        if (autoHideTimer) {
                            clearTimeout(autoHideTimer);
                            autoHideTimer = null;
                        }
                    } else {
                        hideActions();
                    }
                });

                // 点击其他地方收起操作选项
                // 使用事件委托，但只处理一次，避免重复绑定
                var clickHandler = function (e) {
                    if (!isActionsVisible) {
                        return; // 如果互动按钮未展开，不需要处理
                    }

                    var $target = $(e.target);
                    // 检查点击的目标是否是两点按钮、点赞按钮、评论按钮或操作区域内的任何元素
                    var isClickOnMoreBtn = $target.closest($moreBtn).length > 0;
                    var isClickOnLikeBtn = $target.closest($likeBtn).length > 0;
                    var isClickOnCommentBtn =
                        $target.closest($commentBtn).length > 0;
                    var isClickOnActions =
                        $target.closest($momentActions).length > 0;

                    // 如果点击的不是两点按钮、点赞按钮、评论按钮或操作区域内的任何元素，则收起
                    if (
                        !isClickOnMoreBtn &&
                        !isClickOnLikeBtn &&
                        !isClickOnCommentBtn &&
                        !isClickOnActions
                    ) {
                        hideActions();
                    }
                };

                // 绑定点击事件（使用一次性绑定，避免重复）
                $(document)
                    .off("click.momentsActions_" + moment.id)
                    .on("click.momentsActions_" + moment.id, clickHandler);

                // 通用的回复处理函数
                function handleReplyToComment(targetComment) {
                    var account = _getAccount();
                    var playerNickname = account.nickname || "微信用户";
                    var momentAuthor = moment.author;
                    var commentAuthor = targetComment.author;

                    // 显示回复输入对话框（不需要检查好友关系）
                    var replyContent = targetComment.content || "";
                    _showCommentDialog(
                        {
                            title: "回复评论",
                            placeholder: "请输入回复内容",
                            replyTo: commentAuthor,
                            replyContent: replyContent,
                        },
                        $root
                    )
                        .then(function (result) {
                            // 初始化评论列表
                            if (!moment.comments) {
                                moment.comments = [];
                            }

                            // 解析内容（用|分隔）
                            var contentParts = result.content.split("|");
                            var textContent = contentParts[0] || "";
                            var imageDescs = [];
                            var emojiFile = null;

                            // 识别图片描述和表情包
                            for (var i = 1; i < contentParts.length; i++) {
                                var part = contentParts[i].trim();
                                if (!part) continue;

                                // 检查是否是表情包文件名（在表情包列表中）
                                var emojiList = _getEmojiList();
                                if (emojiList.indexOf(part) !== -1) {
                                    emojiFile = part;
                                } else {
                                    // 否则是图片描述
                                    imageDescs.push(part);
                                }
                            }

                            // 创建回复类型的评论
                            var newReply = {
                                id: "comment_" + Date.now(),
                                author: playerNickname,
                                content: textContent,
                                type: "reply",
                                replyTo: commentAuthor,
                                replyContent: replyContent,
                                timestamp: Date.now(),
                            };

                            // 如果有图片描述，添加到回复中
                            if (imageDescs.length > 0) {
                                newReply.images = imageDescs;
                            }

                            // 如果有表情包，添加到回复中
                            if (emojiFile) {
                                newReply.emoji = emojiFile;
                            }

                            // 追加到评论列表末尾
                            moment.comments.push(newReply);

                            // 生成回复指令并插入到酒馆输入框
                            // 获取朋友圈内容摘要（用于AI理解上下文）
                            var momentContentPreview = "";
                            if (moment.content) {
                                momentContentPreview = moment.content.substring(
                                    0,
                                    50
                                );
                                if (moment.content.length > 50) {
                                    momentContentPreview += "...";
                                }
                            } else if (moment.music) {
                                momentContentPreview =
                                    "分享音乐：" +
                                    (moment.music.title || "") +
                                    " - " +
                                    (moment.music.artist || "");
                            } else if (
                                moment.images &&
                                moment.images.length > 0
                            ) {
                                momentContentPreview =
                                    "发布了" + moment.images.length + "张图片";
                            }

                            var replyCommand =
                                '<moments-interactions>\n  <reply momentId="' +
                                escapeHtml(moment.id) +
                                '" replier="' +
                                escapeHtml(playerNickname) +
                                '" replyTo="' +
                                escapeHtml(commentAuthor) +
                                '">\n    <content>' +
                                escapeHtml(result.content) +
                                "</content>\n  </reply>\n</moments-interactions>";
                            // 添加注释，帮助AI理解上下文
                            var contextInfo =
                                "玩家对朋友圈（ID: " +
                                escapeHtml(moment.id) +
                                "，作者：" +
                                escapeHtml(moment.author) +
                                (momentContentPreview
                                    ? "，内容：" +
                                      escapeHtml(momentContentPreview)
                                    : "") +
                                "）中 " +
                                escapeHtml(commentAuthor) +
                                " 的评论（" +
                                escapeHtml(replyContent) +
                                "）进行了回复";
                            replyCommand =
                                "<!-- " + contextInfo + " -->\n" + replyCommand;
                            _insertTextToTavernInput(replyCommand);

                            // 保存到数据
                            if (window.XiaoxinWeChatDataHandler) {
                                window.XiaoxinWeChatDataHandler.updateMoment(
                                    moment.id,
                                    moment
                                );
                            }

                            // 更新评论区域显示
                            if (!$commentsContainer) {
                                $commentsContainer = $(
                                    '<div class="xiaoxin-wechat-moments-item-comments"></div>'
                                );
                                // 插入到点赞列表之后（如果有且可见）或时间行之后
                                if (
                                    $likesContainer &&
                                    $likesContainer.length > 0 &&
                                    $likesContainer.is(":visible")
                                ) {
                                    $likesContainer.after($commentsContainer);
                                } else {
                                    $momentItem
                                        .find(
                                            ".xiaoxin-wechat-moments-item-time-row"
                                        )
                                        .after($commentsContainer);
                                }
                            }

                            // 渲染新回复
                            var $newReplyItem = renderCommentItem(
                                newReply,
                                $root
                            );
                            $commentsContainer.append($newReplyItem);

                            // 点击评论后，1秒后自动折叠回互动按钮
                            if (autoHideTimer) {
                                clearTimeout(autoHideTimer);
                            }
                            autoHideTimer = setTimeout(function () {
                                hideActions();
                            }, 1000);
                        })
                        .catch(function (error) {
                            // 用户取消，不做任何操作
                            console.log(
                                "[小馨手机][微信] 用户取消回复:",
                                error.message
                            );
                        });
                }

                // renderCommentItem 函数已在外部作用域定义，这里不再需要重复定义

                // 评论区域（在互动按钮下方）
                var $commentsContainer = null;
                // 检查评论数据是否存在
                console.info(
                    "[小馨手机][微信] 朋友圈页面: 朋友圈ID:",
                    moment.id,
                    "评论数据检查:",
                    {
                        hasComments: !!moment.comments,
                        commentsType: typeof moment.comments,
                        commentsLength: moment.comments
                            ? moment.comments.length
                            : 0,
                        comments: moment.comments || [],
                    }
                );

                if (moment.comments && moment.comments.length > 0) {
                    console.info(
                        "[小馨手机][微信] 朋友圈页面: 朋友圈ID:",
                        moment.id,
                        "评论列表:",
                        moment.comments.map(function (c) {
                            return {
                                author: c.author,
                                content: (c.content || "").substring(0, 20),
                                type: c.type,
                                replyTo: c.replyTo || null,
                            };
                        })
                    );
                    // 获取当前玩家信息
                    var account = _getAccount();
                    var playerNickname = account.nickname || "微信用户";
                    var momentAuthor =
                        moment.author || moment.authorId || moment.userId;

                    console.info(
                        "[小馨手机][微信] 朋友圈页面: 开始过滤评论，玩家昵称:",
                        playerNickname,
                        "朋友圈作者:",
                        momentAuthor
                    );

                    // 过滤掉玩家看不到的评论（只显示玩家可以看到的评论）
                    // 规则：
                    // 1. 评论者必须是玩家、朋友圈作者或共同好友
                    // 2. 如果是回复类型的评论，被回复的对象（replyTo）也必须是玩家、朋友圈作者或共同好友
                    var visibleComments = moment.comments.filter(function (
                        comment
                    ) {
                        if (!comment || !comment.author) {
                            console.warn(
                                "[小馨手机][微信] 朋友圈页面: 评论数据不完整:",
                                comment
                            );
                            return false;
                        }

                        // 检查评论者是否可见
                        var canSeeAuthor = _canPlayerSeeInteraction(
                            playerNickname,
                            momentAuthor,
                            comment.author
                        );

                        if (!canSeeAuthor) {
                            console.info(
                                "[小馨手机][微信] 朋友圈页面: 评论被过滤（评论者不可见），评论者:",
                                comment.author,
                                "朋友圈作者:",
                                momentAuthor,
                                "评论内容:",
                                (comment.content || "").substring(0, 30)
                            );
                            return false;
                        }

                        // 如果是回复类型的评论，还需要检查被回复的对象是否可见
                        if (comment.type === "reply" && comment.replyTo) {
                            var canSeeReplyTo = _canPlayerSeeInteraction(
                                playerNickname,
                                momentAuthor,
                                comment.replyTo
                            );
                            if (!canSeeReplyTo) {
                                console.info(
                                    "[小馨手机][微信] 朋友圈页面: 回复被过滤（被回复者不可见），回复者:",
                                    comment.author,
                                    "被回复者:",
                                    comment.replyTo,
                                    "朋友圈作者:",
                                    momentAuthor
                                );
                                return false;
                            }
                        }

                        console.info(
                            "[小馨手机][微信] 朋友圈页面: 评论可见，评论者:",
                            comment.author,
                            "类型:",
                            comment.type,
                            "评论内容:",
                            (comment.content || "").substring(0, 30)
                        );
                        return true;
                    });
                    // 去重：避免重复扫描/ID混用导致重复评论展示
                    (function () {
                        var seen = new Set();
                        visibleComments = visibleComments.filter(function (c) {
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
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        });
                    })();
                    console.info(
                        "[小馨手机][微信] 朋友圈页面: 过滤后可见评论数量:",
                        visibleComments.length,
                        "原始评论数量:",
                        moment.comments.length,
                        "可见评论:",
                        visibleComments.map(function (c) {
                            return {
                                author: c.author,
                                content: (c.content || "").substring(0, 20),
                            };
                        })
                    );

                    if (visibleComments.length > 0) {
                        $commentsContainer = $(
                            '<div class="xiaoxin-wechat-moments-item-comments"></div>'
                        );

                        visibleComments.forEach(function (comment, index) {
                            var $commentItem = renderCommentItem(
                                comment,
                                $root
                            );
                            // 记录索引用于点击时找到对应的评论数据
                            $commentItem.data("comment-index", index);
                            $commentsContainer.append($commentItem);
                        });

                        // 为整个评论区域绑定点击事件，点击任何一条评论都会触发回复弹窗
                        $commentsContainer
                            .off("click.replyComment")
                            .on(
                                "click.replyComment",
                                ".xiaoxin-wechat-moments-item-comment-clickable",
                                function (e) {
                                    e.stopPropagation();
                                    var $item = $(this);
                                    var idx = $item.data("comment-index");
                                    if (
                                        typeof idx === "number" &&
                                        visibleComments[idx]
                                    ) {
                                        handleReplyToComment(
                                            visibleComments[idx]
                                        );
                                    }
                                }
                            );
                    }
                }

                // 创建一个时间行容器，包含时间和按钮，使用flexbox对齐
                var $timeRow = $(
                    '<div class="xiaoxin-wechat-moments-item-time-row"></div>'
                );
                $timeRow.append($momentTime);
                $timeRow.append($moreBtn);
                $timeRow.append($momentActions);

                // 初始化时调用更新函数，确保点赞列表正确显示（使用过滤逻辑）
                if (moment.likes && moment.likes.length > 0) {
                    updateLikesDisplay();
                }

                // 按正确顺序添加元素：头像和昵称、内容、图片、时间行、点赞、评论
                // 头像和昵称、文字内容、图片已在上面添加
                $momentItem.append($timeRow);
                // 点赞列表在时间行之后、评论之前添加（如果存在）
                if ($likesContainer) {
                    $momentItem.append($likesContainer);
                }
                // 评论区域在点赞列表之后添加（如果存在）
                if ($commentsContainer) {
                    $momentItem.append($commentsContainer);
                }

                $contentSection.append($momentItem);
            });
        }

        $main.append($headerSection, $contentSection);
        $root.empty().append($titleBar, $fixedButtons, $main);

        // 进入页面时滚动到最顶端
        setTimeout(function () {
            $main.scrollTop(0);
        }, 0);

        // 监听滚动事件，控制标题栏显示/隐藏，以及固定按钮的显示/隐藏
        var headerHeight = $headerSection.outerHeight() || 200; // 背景图区域高度
        var isTitleBarVisible = false;

        $main.on("scroll", function () {
            var scrollTop = $main.scrollTop();
            var shouldShow = scrollTop > headerHeight - 50; // 当滚动超过背景图高度时显示标题栏

            if (shouldShow && !isTitleBarVisible) {
                $titleBar.addClass("title-bar-visible");
                $fixedButtons.css("opacity", "0"); // 隐藏固定按钮
                $fixedButtons.css("pointer-events", "none");
                isTitleBarVisible = true;
            } else if (!shouldShow && isTitleBarVisible) {
                $titleBar.removeClass("title-bar-visible");
                $fixedButtons.css("opacity", "1"); // 显示固定按钮
                $fixedButtons.css("pointer-events", "auto");
                isTitleBarVisible = false;
            }
        });

        // 初始状态：显示固定按钮
        $fixedButtons.css("opacity", "1");
        $fixedButtons.css("pointer-events", "auto");

        // 监听联系人更新事件，当添加好友后自动刷新朋友圈页面
        function handleContactUpdatedForMoments(event) {
            console.info(
                "[小馨手机][微信] 朋友圈页面: 收到联系人更新事件，检查是否需要刷新"
            );
            var detail = event.detail || {};
            var contact = detail.contact || {};
            var status = detail.status || {};
            var skipFriendAddedFlow = detail.skipFriendAddedFlow || false;

            // 如果标记了跳过好友添加流程（pending_verify 状态），不刷新
            if (skipFriendAddedFlow) {
                console.info(
                    "[小馨手机][微信] 朋友圈页面: 跳过好友添加流程（pending_verify），不刷新"
                );
                return;
            }

            // 如果联系人状态变为好友，刷新朋友圈页面
            if (
                status === "accepted" ||
                contact.friendStatus === "friend" ||
                contact.isFriend === true
            ) {
                console.info(
                    "[小馨手机][微信] 朋友圈页面: 检测到添加好友，自动刷新朋友圈页面"
                );
                // 延迟一下，确保数据已经保存
                setTimeout(function () {
                    _renderMomentsPage($root, mobilePhone);
                }, 200);
            }
        }

        // 清理旧的事件监听器（如果存在）
        var oldHandler = $root.data("momentsContactUpdateHandler");
        if (oldHandler) {
            window.removeEventListener("xiaoxin-contact-updated", oldHandler);
        }

        // 添加事件监听器
        window.addEventListener(
            "xiaoxin-contact-updated",
            handleContactUpdatedForMoments
        );

        // 保存清理函数到root，以便在切换页面时清理
        $root.data(
            "momentsContactUpdateHandler",
            handleContactUpdatedForMoments
        );
    }

    // ========== 数据初始化监听 ==========
    var _characterChangeCleanup = null;
    var _currentRoot = null;
    var _currentMobilePhone = null;
    var _currentPage = null; // 当前页面类型：'moments', 'contactMoments', 'chat', 'contacts', 'discover', 'me'
    var _lastMomentsScanTime = 0; // 上次朋友圈扫描时间戳，用于避免短时间内重复扫描
    var _currentContact = null; // 当前显示的联系人（用于角色个人朋友圈页面刷新）
    var _previewMoments = []; // 存储预览朋友圈列表

    function _setupDataListeners() {
        if (!window.XiaoxinDataManager) {
            console.warn(
                "[小馨手机][微信] DataManager 未加载，无法监听数据切换"
            );
            return;
        }

        // 监听角色卡切换
        _characterChangeCleanup = window.XiaoxinDataManager.onCharacterChange(
            function (newCharId, oldCharId) {
                console.info(
                    "[小馨手机][微信] 角色卡已切换，重新加载微信数据:",
                    oldCharId,
                    "->",
                    newCharId
                );
                // 清除表情包列表缓存，确保重新加载当前角色卡的表情包
                _cachedEmojiList = null;
                _cachedCharacterId = null;
                if (_currentRoot && _currentMobilePhone) {
                    render(_currentRoot, _currentMobilePhone);
                } else {
                    console.warn(
                        "[小馨手机][微信] 无法重新渲染：缺少 $root 或 mobilePhone 引用"
                    );
                }
            }
        );
    }

    // ========== 入口 ==========
    function render($container, mobilePhone) {
        // 先清空容器，避免重复渲染
        $container.empty();
        var $root = $('<div class="xiaoxin-wechat-root"></div>');
        $container.append($root);

        // 保存引用，以便角色卡切换时重新渲染
        _currentRoot = $root;
        _currentMobilePhone = mobilePhone;

        // 设置数据监听（首次渲染时）
        if (!_characterChangeCleanup) {
            _setupDataListeners();
        }

        // 开场动画
        try {
            if (_shouldShowSplash()) {
                _playSplash($container);
            } else {
                console.info("[小馨手机][微信] 未超过1小时：跳过开场动画");
            }
        } catch (e) {
            console.warn("[小馨手机][微信] 开场动画逻辑异常:", e);
        } finally {
            _setLastOpenTs(_now());
        }

        // 账号/注册判断
        var account = _getAccount();
        if (!account) {
            _renderRegisterPage($root, mobilePhone);
        } else {
            console.info("[小馨手机][微信] 已有账号信息，进入微信主页");
            _renderChatPage($root, mobilePhone);
        }

        console.info("[小馨手机][微信] render 完成");
    }

    // 强制重新加载（用于角色卡切换或聊天重新开始时）
    function _forceReload() {
        console.info("[小馨手机][微信] 强制重新加载");
        if (_currentRoot && _currentMobilePhone) {
            render(_currentRoot, _currentMobilePhone);
        } else {
            console.warn(
                "[小馨手机][微信] 无法重新加载：缺少 $root 或 mobilePhone 引用"
            );
        }
    }

    // ========== 渲染个人朋友圈页面 ==========
    function _renderContactMomentsPage($root, mobilePhone, contact, showEmptyMoments) {
        console.info("[小馨手机][微信] 渲染个人朋友圈页面，联系人:", contact);
        _currentPage = "contactMoments";
        _currentRoot = $root;
        _currentMobilePhone = mobilePhone;
        _currentContact = contact; // 保存当前联系人，用于刷新时使用
        showEmptyMoments = !!showEmptyMoments;

        // 在真正读取朋友圈数据之前，尽量自动触发一次历史消息扫描
        // 这样即使用户没有手动调用 XiaoxinForceScanMoments，也能在打开角色个人朋友圈时自动解析历史朋友圈标签
        // 添加时间限制，避免短时间内重复扫描（5秒内不重复扫描）
        var now = Date.now();
        var shouldAutoScan = now - _lastMomentsScanTime > 5000; // 距离上次扫描超过5秒才再次扫描

        if (shouldAutoScan) {
            try {
                if (window.XiaoxinForceScanMoments) {
                    console.info(
                        "[小馨手机][微信] 角色个人朋友圈页面: 自动触发 XiaoxinForceScanMoments() 以解析历史朋友圈数据"
                    );
                    // 异步执行，避免阻塞渲染；结果会写入 DataHandler，下面 getMoments 会读到
                    setTimeout(function () {
                        try {
                            window.XiaoxinForceScanMoments();
                            _lastMomentsScanTime = Date.now(); // 更新扫描时间戳
                        } catch (e) {
                            console.warn(
                                "[小馨手机][微信] 自动触发 XiaoxinForceScanMoments 失败:",
                                e
                            );
                        }
                    }, 100);
                } else if (
                    window.XiaoxinMessageListener &&
                    typeof window.XiaoxinMessageListener
                        .scanRetainedMessages === "function"
                ) {
                    console.info(
                        "[小馨手机][微信] 角色个人朋友圈页面: 自动触发 scanRetainedMessages() 以解析历史朋友圈数据"
                    );
                    setTimeout(function () {
                        try {
                            window.XiaoxinMessageListener.scanRetainedMessages();
                            _lastMomentsScanTime = Date.now(); // 更新扫描时间戳
                        } catch (e2) {
                            console.warn(
                                "[小馨手机][微信] 自动触发 scanRetainedMessages 失败:",
                                e2
                            );
                        }
                    }, 100);
                }
            } catch (autoScanErr) {
                console.warn(
                    "[小馨手机][微信] 角色个人朋友圈页面: 自动扫描历史朋友圈数据时出错:",
                    autoScanErr
                );
            }
        } else {
            console.info(
                "[小馨手机][微信] 角色个人朋友圈页面: 距离上次扫描时间过短，跳过自动扫描（避免重复生成）"
            );
        }

        var account = _getAccount();
        if (!account) {
            console.warn("[小馨手机][微信] 无法获取账号信息，跳转到注册页");
            _renderRegisterPage($root, mobilePhone);
            return;
        }

        // 尝试从数据处理器重新获取联系人数据，确保包含最新的 history_friend 字段
        if (contact && contact.id && window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getContactById === "function") {
            var updatedContact = window.XiaoxinWeChatDataHandler.getContactById(contact.id);
            if (updatedContact) {
                // 合并数据，优先使用数据处理器中的最新数据
                contact = Object.assign({}, contact, updatedContact);
                console.info("[小馨手机][微信] 从数据处理器更新联系人数据:", contact);
            }
        }

        // 主容器
        var $main = $('<div class="xiaoxin-wechat-moments-main"></div>');

        // 标题栏（与玩家朋友圈列表样式一致，但不显示发布按钮）
        var $titleBar = $(
            '<div class="xiaoxin-wechat-moments-title-bar"></div>'
        );
        var $titleBarContent = $(
            '<div class="xiaoxin-wechat-moments-title-bar-content"></div>'
        );
        var $titleBarBack = $(
            '<div class="xiaoxin-wechat-moments-title-bar-back">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg>" +
                "</div>"
        );
        // 返回逻辑单独封装，供标题栏和固定返回按钮复用
        function goBackFromContactMoments() {
            // 返回到联系人资料页面
            if (
                window.XiaoxinWeChatContacts &&
                typeof window.XiaoxinWeChatContacts.renderContactDetailPage ===
                    "function"
            ) {
                window.XiaoxinWeChatContacts.renderContactDetailPage(
                    $root,
                    mobilePhone,
                    contact,
                    "通讯录"
                );
            } else if (
                window.XiaoxinWeChatApp &&
                typeof window.XiaoxinWeChatApp._renderContactsPage ===
                    "function"
            ) {
                // 兜底：返回通讯录页面
                window.XiaoxinWeChatApp._renderContactsPage($root, mobilePhone);
            }
        }
        $titleBarBack.on("click", function () {
            goBackFromContactMoments();
        });
        var displayName = _getContactDisplayName(contact, contact.id || "未知");
        var $titleBarTitle = $(
            // 顶部标题仅显示联系人名称：优先微信备注，其次微信昵称
            '<div class="xiaoxin-wechat-moments-title-bar-title">' +
                escapeHtml(displayName) +
                "</div>"
        );

        $titleBarContent.append($titleBarBack, $titleBarTitle);
        $titleBar.append($titleBarContent);

        // 固定返回按钮（与玩家朋友圈列表一致，但不带相机按钮）
        var $fixedButtons = $(
            '<div class="xiaoxin-wechat-moments-fixed-buttons"></div>'
        );
        var $fixedBackBtn = $(
            '<div class="xiaoxin-wechat-moments-fixed-back">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg>" +
                "</div>"
        );
        $fixedBackBtn.on("click", function () {
            goBackFromContactMoments();
        });
        $fixedButtons.append($fixedBackBtn);

        // 如果是历史联系人，添加生成历史朋友圈按钮（固定按钮，和返回键一样）
        // 更宽松的判断：支持布尔值、字符串、数字等多种格式
        var historyFriendValue = contact.history_friend;
        var isHistoryContact = false;
        if (historyFriendValue === true || historyFriendValue === "true" || historyFriendValue === "1" || historyFriendValue === 1) {
            isHistoryContact = true;
        } else if (typeof historyFriendValue === "string") {
            var lowerValue = historyFriendValue.toLowerCase().trim();
            isHistoryContact = lowerValue === "true" || lowerValue === "1" || lowerValue === "yes" || lowerValue === "y";
        }

        // 备用判断：检查联系人是否有历史消息（作为备用判断方式）
        if (!isHistoryContact && contact.id && window.XiaoxinWeChatDataHandler) {
            try {
                var chatMessages = window.XiaoxinWeChatDataHandler.getChatMessages
                    ? window.XiaoxinWeChatDataHandler.getChatMessages(contact.id)
                    : [];
                // 如果聊天记录中有历史消息，也认为是历史联系人
                var hasHistoricalMessage = chatMessages.some(function(msg) {
                    return msg.isHistorical === true || (msg.timestamp && msg.timestamp < Date.now() - 60000);
                });
                if (hasHistoricalMessage) {
                    isHistoryContact = true;
                    console.info("[小馨手机][微信] 通过历史消息判断为历史联系人");
                }
            } catch (e) {
                console.warn("[小馨手机][微信] 检查历史消息失败:", e);
            }
        }

        if (isHistoryContact) {
            // 检查该联系人的历史朋友圈是否已生成：检查所有聊天记录中是否包含 [char_historymoments] 且 role_id 匹配
            var hasGeneratedCharHistoryMoments = false;
            try {
                if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getAllChats === "function") {
                    var allChats = window.XiaoxinWeChatDataHandler.getAllChats() || {};
                    var contactRoleId = String(contact.characterId || contact.id || "").replace(/^contact_/, "").trim();

                    // 遍历所有聊天记录，检查是否包含 [char_historymoments] 数据块且 role_id 匹配
                    for (var chatId in allChats) {
                        if (allChats.hasOwnProperty(chatId)) {
                            var chatHistory = allChats[chatId] || [];
                            for (var i = 0; i < chatHistory.length; i++) {
                                var msg = chatHistory[i];
                                var msgContent = msg.content || msg.payload?.content || "";
                                // 检查是否包含 [char_historymoments] 数据块
                                if (msgContent.indexOf("[char_historymoments]") !== -1) {
                                    // 检查 role_id 是否匹配
                                    var roleIdMatch = msgContent.match(/role_id\s*=\s*([^\s\n]+)/i);
                                    if (roleIdMatch && roleIdMatch[1]) {
                                        var msgRoleId = String(roleIdMatch[1]).trim();
                                        if (msgRoleId === contactRoleId) {
                                            hasGeneratedCharHistoryMoments = true;
                                            console.info("[小馨手机][微信] 在聊天记录中发现该联系人的 [char_historymoments] 数据块，已生成过历史朋友圈，role_id:", msgRoleId);
                                            break;
                                        }
                                    }
                                }
                            }
                            if (hasGeneratedCharHistoryMoments) {
                                break;
                            }
                        }
                    }
                    console.info("[小馨手机][微信] 检查联系人历史朋友圈生成状态（通过消息记录）:", hasGeneratedCharHistoryMoments, "联系人role_id:", contactRoleId);
                }
            } catch (e) {
                console.warn("[小馨手机][微信] 检查联系人历史朋友圈生成状态失败:", e);
            }

            // 如果未生成过，显示按钮
            if (!hasGeneratedCharHistoryMoments) {
                var $fixedGenerateBtn = $(
                    '<div class="xiaoxin-wechat-moments-fixed-generate" title="生成历史朋友圈">' +
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '<path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '<path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        "</svg>" +
                        "</div>"
                );
                $fixedGenerateBtn.on("click", function () {
                    console.info("[小馨手机][微信] 点击生成历史朋友圈按钮，联系人:", contact);
                    if (
                        window.XiaoxinWeChatContacts &&
                        typeof window.XiaoxinWeChatContacts.showCharHistoryMomentsDialog ===
                            "function"
                    ) {
                        window.XiaoxinWeChatContacts.showCharHistoryMomentsDialog(contact);
                    } else {
                        console.warn("[小馨手机][微信] showCharHistoryMomentsDialog 方法不存在");
                    }
                });
                $fixedButtons.append($fixedGenerateBtn);
                console.info("[小馨手机][微信] 已添加生成历史朋友圈按钮到固定按钮区域");
            } else {
                console.info("[小馨手机][微信] 该联系人的历史朋友圈已生成，不显示按钮");
            }
        }

        // 顶部背景图区域（优先使用联系人设置的朋友圈背景）
        // 为个人朋友圈头部增加专用类，用于控制样式（例如隐藏“点击更换背景”提示）
        var $headerSection = $(
            '<div class="xiaoxin-wechat-moments-header xiaoxin-wechat-moments-header-contact"></div>'
        );
        var $backgroundImage = $(
            '<div class="xiaoxin-wechat-moments-background"></div>'
        );
        // 背景图优先级：
        // 1. 联系人单独设置的朋友圈背景（momentsBackground）
        // 2. 如果是玩家自己，使用账号的朋友圈背景
        // 3. 插件内置默认朋友圈背景图（不使用头像作为背景）
        var contactBackgroundUrl = null;
        if (contact.isSelf && account) {
            // 玩家自己的朋友圈背景
            contactBackgroundUrl = account.momentsBackground || null;
        } else {
            // 其他联系人的朋友圈背景
            contactBackgroundUrl = contact.momentsBackground || null;
        }
        // 如果没有设置朋友圈背景，使用默认背景图
        var defaultMomentsBg =
            "/scripts/extensions/third-party/xiaoxin-phone/image/background/默认微信朋友圈背景图.jpg";
        _setBackgroundImageSafely(
            $backgroundImage,
            contactBackgroundUrl || defaultMomentsBg,
            defaultMomentsBg
        );

        // 头像和昵称
        var $dividerSection = $(
            '<div class="xiaoxin-wechat-moments-divider-section"></div>'
        );
        var $divider = $('<div class="xiaoxin-wechat-moments-divider"></div>');
        var $nickname = $(
            '<div class="xiaoxin-wechat-moments-nickname">' +
                escapeHtml(displayName) +
                "</div>"
        );
        var $avatar = $('<div class="xiaoxin-wechat-moments-avatar"></div>');
        // 头像始终使用联系人的头像资源，而不是朋友圈背景
        var contactAvatarUrl =
            contact.avatar ||
            "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
        $avatar.css("background-image", "url(" + contactAvatarUrl + ")");
        $dividerSection.append($divider, $nickname, $avatar);
        $headerSection.append($backgroundImage, $dividerSection);

        // 朋友圈内容区域
        var $contentSection = $(
            '<div class="xiaoxin-wechat-moments-content"></div>'
        );

        // 获取该联系人的朋友圈数据
        var moments = [];
        if (window.XiaoxinWeChatDataHandler) {
            var allMoments = window.XiaoxinWeChatDataHandler.getMoments() || [];
            // 筛选出该联系人的朋友圈动态
            // 获取联系人的所有可能的ID形式
            // 注意：玩家自己的联系人对象可能同时有 id 与 wechatId，但发朋友圈时 author 通常使用 wechatId
            // 因此对 isSelf 优先用 wechatId 作为匹配键，避免“玩家发了朋友圈但个人页看不到”
            var contactId = contact.isSelf
                ? (contact.wechatId || contact.id || contact.characterId)
                : (contact.id || contact.characterId || contact.wechatId);
            var contactCharacterId = contact.characterId;
            var contactWechatIdStr = contact.wechatId
                ? String(contact.wechatId).trim()
                : "";

            console.info("[小馨手机][微信] 筛选朋友圈，联系人信息:", {
                id: contact.id,
                characterId: contact.characterId,
                wechatId: contact.wechatId,
                allMomentsCount: allMoments.length,
            });

            // 打印所有朋友圈的authorId，用于调试
            console.info(
                "[小馨手机][微信] 所有朋友圈的authorId列表:",
                allMoments.map(function (m) {
                    return {
                        id: m.id,
                        authorId: m.authorId || m.userId || m.author,
                        content: (m.content || "").substring(0, 20) + "...",
                    };
                })
            );

            moments = allMoments.filter(function (m) {
                var momentAuthorId = m.authorId || m.userId || m.author;
                var contactIdStr = String(contactId || "").trim();
                var contactCharacterIdStr = contactCharacterId
                    ? String(contactCharacterId).trim()
                    : "";
                var momentAuthorIdStr = String(momentAuthorId || "").trim();

                // 多种匹配方式：
                // 1. 直接匹配
                // 2. contact_前缀匹配
                // 3. 角色ID直接匹配（如果朋友圈author是纯数字，联系人的characterId也是这个数字）
                // 4. 如果是玩家自己，额外匹配 "player"
                var matched =
                    momentAuthorIdStr === contactIdStr ||
                    momentAuthorIdStr === "contact_" + contactIdStr ||
                    contactIdStr === "contact_" + momentAuthorIdStr ||
                    momentAuthorIdStr.replace(/^contact_/, "") ===
                        contactIdStr.replace(/^contact_/, "") ||
                    // 新增：直接匹配 wechatId（尤其是玩家自己发的朋友圈 author=wechatId）
                    (contactWechatIdStr &&
                        (momentAuthorIdStr === contactWechatIdStr ||
                            momentAuthorIdStr.replace(/^contact_/, "") ===
                                contactWechatIdStr.replace(/^contact_/, ""))) ||
                    // 新增：直接匹配角色ID
                    (contactCharacterIdStr &&
                        momentAuthorIdStr === contactCharacterIdStr) ||
                    (contactCharacterIdStr &&
                        momentAuthorIdStr ===
                            "contact_" + contactCharacterIdStr) ||
                    (contactCharacterIdStr &&
                        "contact_" + momentAuthorIdStr ===
                            contactCharacterIdStr) ||
                    // 新增：如果是玩家自己，匹配 author="player" 或 author="user" 的情况（历史朋友圈生成）
                    // 检查方式1：通过 contact.isSelf 标记
                    (contact.isSelf && (momentAuthorIdStr.toLowerCase() === "player" || momentAuthorIdStr.toLowerCase() === "user")) ||
                    // 检查方式2：如果朋友圈 authorId 是 "player" 或 "user"，且联系人与玩家账号匹配（兜底处理）
                    ((momentAuthorIdStr.toLowerCase() === "player" || momentAuthorIdStr.toLowerCase() === "user") &&
                        account &&
                        (contactIdStr === String(account.id || "").trim() ||
                         contactIdStr === String(account.wechatId || "").trim() ||
                         contactWechatIdStr === String(account.id || "").trim() ||
                         contactWechatIdStr === String(account.wechatId || "").trim()));

                if (matched) {
                    console.info("[小馨手机][微信] 匹配到朋友圈:", {
                        momentId: m.id,
                        momentAuthorId: momentAuthorIdStr,
                        contactId: contactIdStr,
                        contactCharacterId: contactCharacterIdStr,
                        isSelf: contact.isSelf,
                    });
                }

                return matched;
            });

            console.info(
                "[小馨手机][微信] 筛选结果，找到朋友圈数量:",
                moments.length
            );

            // 去重：基于朋友圈ID去除重复项
            var seenIds = new Set();
            moments = moments.filter(function (moment) {
                var momentId = moment.id || moment._id;
                if (!momentId) {
                    // 如果没有ID，使用内容+作者+时间戳作为唯一标识
                    momentId =
                        (moment.content || "") +
                        "|" +
                        (moment.authorId ||
                            moment.userId ||
                            moment.author ||
                            "") +
                        "|" +
                        (moment.timestamp || 0);
                }
                var idStr = String(momentId).trim();
                if (seenIds.has(idStr)) {
                    console.warn(
                        "[小馨手机][微信] 个人朋友圈页面: 发现重复朋友圈，已过滤。ID:",
                        idStr
                    );
                    return false;
                }
                seenIds.add(idStr);
                return true;
            });

            console.info(
                "[小馨手机][微信] 个人朋友圈页面: 去重后朋友圈数量:",
                moments.length
            );

            // 按时间倒序排列
            moments = moments.sort(function (a, b) {
                return (b.timestamp || 0) - (a.timestamp || 0);
            });
        }

        // 计算本页使用的时间基准：优先使用世界观时间（从最新正文的time标签获取）
        // 如果没有世界观时间，则使用该联系人最新一条朋友圈的时间戳作为后备
        var baseTimestamp = null;

        // 优先使用世界观时间（从time标签获取）
        if (
            window.XiaoxinWorldClock &&
            window.XiaoxinWorldClock.currentTimestamp
        ) {
            var worldTimestamp = window.XiaoxinWorldClock.currentTimestamp;
            // 检查世界观时间是否合理（不应该是未来时间）
            var year2025 = new Date("2025-01-01").getTime();
            if (worldTimestamp < year2025) {
                baseTimestamp = worldTimestamp;
                console.info(
                    "[小馨手机][微信] 个人朋友圈页面: 使用世界观时间作为基准:",
                    baseTimestamp,
                    "原始时间:",
                    window.XiaoxinWorldClock.rawTime
                );
            } else {
                // 世界观时间可能是现实时间，检查原始时间字符串
                if (
                    window.XiaoxinWorldClock.rawTime &&
                    window.XiaoxinWorldClock.rawTime.indexOf("年") !== -1
                ) {
                    // 原始时间字符串是中文格式，说明是世界观时间，重新解析
                    var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                    var normalized = rawTimeStr
                        .replace(/年|月/g, "/")
                        .replace(/日/g, " ")
                        .replace(/-/g, "/")
                        .replace(/星期[一二三四五六日]/g, "")
                        .trim();
                    var parsed = Date.parse(normalized);
                    if (!isNaN(parsed)) {
                        baseTimestamp = parsed;
                    }
                }
            }
        }

        // 如果没有世界观时间，使用该联系人最新一条朋友圈的时间戳作为后备
        if (!baseTimestamp) {
            var latestMomentTimestamp = null;
            moments.forEach(function (m) {
                if (m && m.timestamp) {
                    if (
                        latestMomentTimestamp === null ||
                        m.timestamp > latestMomentTimestamp
                    ) {
                        latestMomentTimestamp = m.timestamp;
                    }
                }
            });
            baseTimestamp = latestMomentTimestamp;
            console.info(
                "[小馨手机][微信] 个人朋友圈页面: 未找到世界观时间，使用最新朋友圈时间作为基准:",
                baseTimestamp
            );
        }

        // 如果还是没有基准时间，使用当前时间（不推荐）
        if (!baseTimestamp) {
            baseTimestamp = Date.now();
            console.warn(
                "[小馨手机][微信] 个人朋友圈页面: 无法获取基准时间，使用当前时间（不推荐）"
            );
        }

        // 渲染朋友圈动态列表
        // showEmptyMoments=true（例如：未通过好友验证的角色主动申请）时，隐藏所有朋友圈内容，仅保留顶部背景/头像等信息
        if (showEmptyMoments) {
            var $emptyTip = $(
                '<div class="xiaoxin-wechat-moments-empty">' +
                    '<div class="xiaoxin-wechat-moments-empty-text">———</div>' +
                    "</div>"
            );
            $contentSection.append($emptyTip);
        } else if (moments.length === 0) {
            var $emptyTip = $(
                '<div class="xiaoxin-wechat-moments-empty">' +
                    // 当该角色没有任何朋友圈，或者因为权限设置导致玩家看不到朋友圈时，
                    // 统一使用一条横杠占位，避免误导性文案
                    '<div class="xiaoxin-wechat-moments-empty-text">———</div>' +
                    "</div>"
            );
            $contentSection.append($emptyTip);
        } else {
            // 复用朋友圈渲染逻辑（这里简化处理，直接使用现有的渲染代码）
            // 注意：需要获取联系人的显示名称和头像
            moments.forEach(function (moment) {
                var $momentItem = $(
                    '<div class="xiaoxin-wechat-moments-item"></div>'
                );

                // 用户头像和昵称容器
                var $momentHeader = $(
                    '<div class="xiaoxin-wechat-moments-item-header"></div>'
                );

                // 用户头像
                var $momentAvatar = $(
                    '<div class="xiaoxin-wechat-moments-item-avatar"></div>'
                );
                // 检查是否是玩家自己的朋友圈（author="player" 或 authorId="player"）
                var momentAuthorId = moment.authorId || moment.userId || moment.author;
                var isPlayerMoment = false;
                if (momentAuthorId) {
                    var momentAuthorIdStr = String(momentAuthorId).trim();
                    var momentAuthorIdLower = momentAuthorIdStr.toLowerCase();
                    isPlayerMoment = momentAuthorIdLower === "player" || momentAuthorIdLower === "user";
                }
                if (!isPlayerMoment && moment.author) {
                    var momentAuthorStr = String(moment.author).trim();
                    var momentAuthorLower = momentAuthorStr.toLowerCase();
                    isPlayerMoment = momentAuthorLower === "player" || momentAuthorLower === "user";
                }

                var avatarUrl;
                if (isPlayerMoment && account) {
                    // 玩家自己的朋友圈：使用玩家账号的头像
                    avatarUrl =
                        account.avatar ||
                        "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
                } else {
                    // 其他联系人的朋友圈：使用联系人的头像
                    avatarUrl =
                        contact.avatar ||
                        "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
                }
                $momentAvatar.css("background-image", "url(" + avatarUrl + ")");

                // 用户昵称（使用联系人的显示名称）
                var $momentAuthor = $(
                    '<div class="xiaoxin-wechat-moments-item-author">' +
                        escapeHtml(displayName) +
                        "</div>"
                );

                $momentHeader.append($momentAvatar, $momentAuthor);
                $momentItem.append($momentHeader);

                // 文字内容
                if (moment.content && moment.content.trim()) {
                    var $momentContent = $(
                        '<div class="xiaoxin-wechat-moments-item-content">' +
                            escapeHtml(moment.content) +
                            "</div>"
                    );
                    $momentItem.append($momentContent);
                }

                // 图片内容
                if (moment.images && moment.images.length > 0) {
                    var $momentImages = $(
                        '<div class="xiaoxin-wechat-moments-item-images"></div>'
                    );
                    var imageCount = moment.images.length;

                    // 根据图片数量设置不同的布局类
                    if (imageCount === 1) {
                        $momentImages.addClass("images-single");
                    } else if (imageCount === 2) {
                        $momentImages.addClass("images-2");
                    } else if (imageCount === 3) {
                        $momentImages.addClass("images-3");
                    } else if (imageCount === 4) {
                        $momentImages.addClass("images-4");
                    } else {
                        $momentImages.addClass("images-multi");
                    }

                    // 收集所有图片URL（用于预览）
                    var imageUrls = [];

                    // 处理每张图片
                    moment.images.forEach(function (imageData, index) {
                        var $imageItem = $(
                            '<div class="xiaoxin-wechat-moments-item-image" style="cursor: pointer;"></div>'
                        );

                        var imageUrl = null;
                        var imageDescription = null;

                        if (typeof imageData === "string") {
                            if (
                                imageData.startsWith("http://") ||
                                imageData.startsWith("https://") ||
                                imageData.startsWith("/")
                            ) {
                                imageUrl = imageData;
                            } else {
                                imageDescription = imageData;
                            }
                        } else if (
                            typeof imageData === "object" &&
                            imageData !== null
                        ) {
                            imageUrl = imageData.url || null;
                            imageDescription =
                                imageData.description || imageData.desc || null;
                        }

                        if (imageUrl) {
                            $imageItem.css(
                                "background-image",
                                "url(" + imageUrl + ")"
                            );
                            imageUrls.push(imageUrl);
                            // 保存URL到data属性
                            $imageItem.data("image-url", imageUrl);
                        } else if (imageDescription) {
                            $imageItem.css(
                                "background-image",
                                "url(/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg)"
                            );
                            $imageItem.addClass(
                                "xiaoxin-wechat-moments-image-loading"
                            );

                            // 调用API生成图片
                            (function (desc, $img, imgIndex, momentId) {
                                if (
                                    window.XiaoxinAI &&
                                    typeof window.XiaoxinAI.generateImage ===
                                        "function"
                                ) {
                                    // 使用配置中的正向提示词（不再硬编码）
                                    window.XiaoxinAI.generateImage({
                                        prompt: desc,
                                    })
                                        .then(function (generatedUrl) {
                                            if (generatedUrl) {
                                                $img.css(
                                                    "background-image",
                                                    "url(" + generatedUrl + ")"
                                                );
                                                $img.removeClass(
                                                    "xiaoxin-wechat-moments-image-loading"
                                                );
                                                // 保存生成的URL到data属性
                                                $img.data(
                                                    "image-url",
                                                    generatedUrl
                                                );
                                                // 更新imageUrls数组
                                                imageUrls[imgIndex] =
                                                    generatedUrl;

                                                // ⚠️ 重要：保存图片URL到持久化存储（与主朋友圈页面保持一致）
                                                if (!momentId) {
                                                    console.error(
                                                        "[小馨手机][微信] ❌ momentId为空，无法保存图片URL"
                                                    );
                                                } else if (
                                                    !window.XiaoxinWeChatDataHandler ||
                                                    typeof window
                                                        .XiaoxinWeChatDataHandler
                                                        .updateMoment !==
                                                        "function"
                                                ) {
                                                    console.error(
                                                        "[小馨手机][微信] ❌ XiaoxinWeChatDataHandler或updateMoment不可用"
                                                    );
                                                } else {
                                                    // 使用立即执行函数确保保存逻辑执行
                                                    (function (
                                                        url,
                                                        idx,
                                                        mid,
                                                        descText
                                                    ) {
                                                        try {
                                                            // 延迟一小段时间确保数据已更新
                                                            setTimeout(
                                                                function () {
                                                                    try {
                                                                        // 重新获取最新的朋友圈数据
                                                                        var allMoments =
                                                                            window.XiaoxinWeChatDataHandler.getMoments() ||
                                                                            [];
                                                                        var foundIndex =
                                                                            allMoments.findIndex(
                                                                                function (
                                                                                    m
                                                                                ) {
                                                                                    return (
                                                                                        m.id ===
                                                                                            mid ||
                                                                                        m._id ===
                                                                                            mid
                                                                                    );
                                                                                }
                                                                            );

                                                                        if (
                                                                            foundIndex ===
                                                                            -1
                                                                        ) {
                                                                            console.error(
                                                                                "[小馨手机][微信] ❌ 未找到朋友圈动态，ID:",
                                                                                mid
                                                                            );
                                                                            return;
                                                                        }

                                                                        var targetMoment =
                                                                            allMoments[
                                                                                foundIndex
                                                                            ];
                                                                        if (
                                                                            !targetMoment.images
                                                                        ) {
                                                                            targetMoment.images =
                                                                                [];
                                                                        }
                                                                        if (
                                                                            !Array.isArray(
                                                                                targetMoment.images
                                                                            )
                                                                        ) {
                                                                            targetMoment.images =
                                                                                [];
                                                                        }

                                                                        // 确保数组长度足够
                                                                        while (
                                                                            targetMoment
                                                                                .images
                                                                                .length <=
                                                                            idx
                                                                        ) {
                                                                            targetMoment.images.push(
                                                                                null
                                                                            );
                                                                        }

                                                                        // 更新图片数据：直接保存为URL字符串（最简单可靠的方式）
                                                                        targetMoment.images[
                                                                            idx
                                                                        ] = url;

                                                                        // 保存到持久化存储
                                                                        window.XiaoxinWeChatDataHandler.updateMoment(
                                                                            mid,
                                                                            {
                                                                                images: targetMoment.images,
                                                                            }
                                                                        );

                                                                        // 验证保存是否成功
                                                                        var verifyMoments =
                                                                            window.XiaoxinWeChatDataHandler.getMoments() ||
                                                                            [];
                                                                        var verifyMoment =
                                                                            verifyMoments.find(
                                                                                function (
                                                                                    m
                                                                                ) {
                                                                                    return (
                                                                                        m.id ===
                                                                                            mid ||
                                                                                        m._id ===
                                                                                            mid
                                                                                    );
                                                                                }
                                                                            );
                                                                        if (
                                                                            verifyMoment &&
                                                                            verifyMoment.images &&
                                                                            verifyMoment
                                                                                .images[
                                                                                idx
                                                                            ] ===
                                                                                url
                                                                        ) {
                                                                            console.info(
                                                                                "[小馨手机][微信] ✅✅✅ 个人朋友圈图片URL已成功保存并验证:",
                                                                                {
                                                                                    momentId:
                                                                                        mid,
                                                                                    imgIndex:
                                                                                        idx,
                                                                                    url:
                                                                                        url.substring(
                                                                                            0,
                                                                                            80
                                                                                        ) +
                                                                                        "...",
                                                                                }
                                                                            );
                                                                        } else {
                                                                            console.error(
                                                                                "[小馨手机][微信] ❌❌❌ 个人朋友圈图片保存验证失败！",
                                                                                {
                                                                                    momentId:
                                                                                        mid,
                                                                                    imgIndex:
                                                                                        idx,
                                                                                    expected:
                                                                                        url.substring(
                                                                                            0,
                                                                                            80
                                                                                        ) +
                                                                                        "...",
                                                                                    actual:
                                                                                        verifyMoment &&
                                                                                        verifyMoment.images
                                                                                            ? verifyMoment
                                                                                                  .images[
                                                                                                  idx
                                                                                              ]
                                                                                            : "undefined",
                                                                                }
                                                                            );
                                                                        }
                                                                    } catch (err) {
                                                                        console.error(
                                                                            "[小馨手机][微信] ❌ 保存个人朋友圈图片URL时发生错误:",
                                                                            err,
                                                                            err.stack
                                                                        );
                                                                    }
                                                                },
                                                                100
                                                            ); // 延迟100ms确保数据已更新
                                                        } catch (err) {
                                                            console.error(
                                                                "[小馨手机][微信] ❌ 保存个人朋友圈图片URL外层错误:",
                                                                err
                                                            );
                                                        }
                                                    })(
                                                        generatedUrl,
                                                        imgIndex,
                                                        momentId,
                                                        desc
                                                    );
                                                }

                                                console.info(
                                                    "[小馨手机][微信] 个人朋友圈图片生成成功:",
                                                    generatedUrl
                                                );
                                            } else {
                                                $img.removeClass(
                                                    "xiaoxin-wechat-moments-image-loading"
                                                );
                                            }
                                        })
                                        .catch(function (error) {
                                            console.error(
                                                "[小馨手机][微信] 个人朋友圈图片生成异常:",
                                                error
                                            );
                                            $img.removeClass(
                                                "xiaoxin-wechat-moments-image-loading"
                                            );
                                        });
                                } else {
                                    $img.removeClass(
                                        "xiaoxin-wechat-moments-image-loading"
                                    );
                                }
                            })(imageDescription, $imageItem, index, moment.id || moment._id || null);
                        } else {
                            // 默认图片
                            var defaultImageUrl =
                                "/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg";
                            $imageItem.css(
                                "background-image",
                                "url(" + defaultImageUrl + ")"
                            );
                            imageUrls.push(defaultImageUrl);
                            $imageItem.data("image-url", defaultImageUrl);
                        }

                        // 添加点击事件：放大查看图片
                        $imageItem.on("click", function (e) {
                            e.stopPropagation();
                            // 收集当前所有可用的图片URL（包括已生成的）
                            var currentImageUrls = [];
                            $momentImages
                                .find(".xiaoxin-wechat-moments-item-image")
                                .each(function () {
                                    var url = $(this).data("image-url");
                                    if (url) {
                                        currentImageUrls.push(url);
                                    }
                                });
                            // 如果当前点击的图片URL不在列表中，添加它
                            var clickedUrl = $imageItem.data("image-url");
                            if (
                                clickedUrl &&
                                currentImageUrls.indexOf(clickedUrl) === -1
                            ) {
                                currentImageUrls.push(clickedUrl);
                            }
                            // 找到当前点击的图片在数组中的索引
                            var clickedIndex =
                                currentImageUrls.indexOf(clickedUrl);
                            if (clickedIndex === -1) {
                                clickedIndex = 0;
                            }
                            // 显示预览
                            if (currentImageUrls.length > 0) {
                                _showMomentsImagePreview(
                                    currentImageUrls,
                                    clickedIndex,
                                    $root
                                );
                            }
                        });

                        $momentImages.append($imageItem);
                    });

                    if (!moment.content || !moment.content.trim()) {
                        $momentImages.css("margin-top", "-38px");
                    }

                    $momentItem.append($momentImages);
                }

                // 音乐分享内容
                if (moment.type === "music" && moment.music) {
                    var $musicShare = $(
                        '<div class="xiaoxin-wechat-moments-item-music"></div>'
                    );
                    var $musicCover = $(
                        '<div class="xiaoxin-wechat-moments-item-music-cover"></div>'
                    );

                    // 处理音乐封面
                    var musicCoverUrl = null;
                    var musicCoverDesc = null;
                    if (typeof moment.music.cover === "string") {
                        if (
                            moment.music.cover.startsWith("http://") ||
                            moment.music.cover.startsWith("https://") ||
                            moment.music.cover.startsWith("/")
                        ) {
                            musicCoverUrl = moment.music.cover;
                        } else {
                            musicCoverDesc = moment.music.cover;
                        }
                    }

                    if (musicCoverUrl) {
                        $musicCover.css(
                            "background-image",
                            "url(" + musicCoverUrl + ")"
                        );
                    } else if (musicCoverDesc) {
                        $musicCover.css(
                            "background-image",
                            "url(/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg)"
                        );
                        $musicCover.addClass(
                            "xiaoxin-wechat-moments-image-loading"
                        );

                        // 调用API生成音乐封面
                        (function (desc, $cover) {
                            if (
                                window.XiaoxinAI &&
                                typeof window.XiaoxinAI.generateImage ===
                                    "function"
                            ) {
                                // 使用配置中的正向提示词（不再硬编码）
                                // 如果需要专辑封面风格，可以在描述中添加 "music album cover design"
                                window.XiaoxinAI.generateImage({
                                    prompt: desc,
                                })
                                    .then(function (generatedUrl) {
                                        if (generatedUrl) {
                                            $cover.css(
                                                "background-image",
                                                "url(" + generatedUrl + ")"
                                            );
                                            $cover.removeClass(
                                                "xiaoxin-wechat-moments-image-loading"
                                            );
                                        } else {
                                            $cover.removeClass(
                                                "xiaoxin-wechat-moments-image-loading"
                                            );
                                        }
                                    })
                                    .catch(function (error) {
                                        console.error(
                                            "[小馨手机][微信] 音乐封面生成异常:",
                                            error
                                        );
                                        $cover.removeClass(
                                            "xiaoxin-wechat-moments-image-loading"
                                        );
                                    });
                            } else {
                                $cover.removeClass(
                                    "xiaoxin-wechat-moments-image-loading"
                                );
                            }
                        })(musicCoverDesc, $musicCover);
                    } else {
                        $musicCover.css(
                            "background-image",
                            "url(/scripts/extensions/third-party/xiaoxin-phone/image/头像/微信默认头像.jpg)"
                        );
                    }

                    var $musicPlay = $(
                        '<div class="xiaoxin-wechat-moments-item-music-play">▶</div>'
                    );
                    var $musicInfo = $(
                        '<div class="xiaoxin-wechat-moments-item-music-info"></div>'
                    );
                    var $musicTitle = $(
                        '<div class="xiaoxin-wechat-moments-item-music-title">' +
                            escapeHtml(moment.music.title || "未知歌曲") +
                            "</div>"
                    );
                    var $musicArtist = $(
                        '<div class="xiaoxin-wechat-moments-item-music-artist">' +
                            escapeHtml(moment.music.artist || "未知歌手") +
                            "</div>"
                    );
                    $musicInfo.append($musicTitle, $musicArtist);

                    // 播放按钮需要作为封面内部的绝对定位元素，确保位于封面正中
                    $musicCover.append($musicPlay);
                    $musicShare.append($musicCover, $musicInfo);
                    $momentItem.append($musicShare);

                    // 音乐平台显示在时间行上方（独立一行），与主朋友圈页面保持一致
                    if (moment.music.platform) {
                        var $musicPlatform = $(
                            '<div class="xiaoxin-wechat-moments-item-music-platform">' +
                                escapeHtml(moment.music.platform) +
                                "</div>"
                        );
                        $momentItem.append($musicPlatform);
                    }
                }

                // 时间和位置（与主朋友圈页面保持一致：地址贴在时间右侧）
                var $momentTime = $(
                    '<div class="xiaoxin-wechat-moments-item-time"></div>'
                );
                $momentTime.text(
                    _formatMomentTime(moment.timestamp, baseTimestamp)
                );

                if (moment.location) {
                    // 兼容两种格式：字符串 或 { name: string }
                    var locationText =
                        typeof moment.location === "string"
                            ? moment.location
                            : moment.location.name || "";
                    var $momentLocation = $(
                        '<div class="xiaoxin-wechat-moments-item-location">' +
                            escapeHtml(locationText) +
                            "</div>"
                    );
                    // 地址贴在时间内部右侧
                    $momentTime.append($momentLocation);
                }
                // ===== 互动按钮（个人朋友圈也与主列表一致） =====
                var $moreBtn = $(
                    '<div class="xiaoxin-wechat-moments-item-more">⋯</div>'
                );
                var $momentActions = $(
                    '<div class="xiaoxin-wechat-moments-item-actions"></div>'
                );
                var isLiked = moment.isLiked || false;
                var likeIconSvg = isLiked
                    ? '<svg class="xiaoxin-wechat-moments-like-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ff2442" stroke="none"/></svg>'
                    : '<svg class="xiaoxin-wechat-moments-like-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="#fff" stroke-width="1.5"/></svg>';
                var likeText = isLiked ? "取消" : "赞";
                var $likeBtn = $(
                    '<div class="xiaoxin-wechat-moments-item-like' +
                        (isLiked ? " liked" : "") +
                        '">' +
                        likeIconSvg +
                        '<span class="xiaoxin-wechat-moments-like-text">' +
                        likeText +
                        "</span>" +
                        "</div>"
                );
                var commentIconSvg =
                    '<svg class="xiaoxin-wechat-moments-comment-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                var $commentBtn = $(
                    '<div class="xiaoxin-wechat-moments-item-comment">' +
                        commentIconSvg +
                        '<span class="xiaoxin-wechat-moments-comment-text">评论</span>' +
                        "</div>"
                );
                $momentActions.append($likeBtn, $commentBtn);

                // ===== 点赞列表与评论区域（与主朋友圈逻辑保持一致） =====
                var $likesContainer = null;
                var $commentsContainer = null;

                // 更新点赞显示（个人朋友圈：应用隐私过滤，只显示玩家可以看到的点赞）
                function updateLikesDisplayForContact() {
                    // 获取当前玩家信息
                    var account = _getAccount();
                    var playerNickname = account.nickname || "微信用户";
                    var momentAuthor =
                        moment.author || moment.authorId || moment.userId;

                    // 过滤掉玩家看不到的点赞（只显示玩家可以看到的点赞）
                    // 规则：玩家可以看到自己的点赞、朋友圈作者的点赞、以及与朋友圈作者和玩家都是好友的用户的点赞（共同好友）
                    var visibleLikes = (moment.likes || []).filter(function (
                        name
                    ) {
                        var canSee = _canPlayerSeeInteraction(
                            playerNickname,
                            momentAuthor,
                            name
                        );
                        if (!canSee) {
                            console.info(
                                "[小馨手机][微信] 个人朋友圈页面: 点赞被过滤，点赞者:",
                                name,
                                "朋友圈作者:",
                                momentAuthor
                            );
                        }
                        return canSee;
                    });
                    // 去重：避免重复扫描/历史脏数据导致同一人重复点赞显示
                    visibleLikes = Array.from(
                        new Set(
                            visibleLikes.map(function (v) {
                                return String(v || "").trim();
                            })
                        )
                    ).filter(function (v) {
                        return v;
                    });
                    console.info(
                        "[小馨手机][微信] 个人朋友圈页面: 过滤后可见点赞数量:",
                        visibleLikes.length,
                        "原始点赞数量:",
                        (moment.likes || []).length
                    );

                    if (!visibleLikes.length) {
                        if ($likesContainer) {
                            $likesContainer.hide();
                        }
                        return;
                    }

                    if (!$likesContainer) {
                        $likesContainer = $(
                            '<div class="xiaoxin-wechat-moments-item-likes"></div>'
                        );
                        // 插在时间行之后
                        $momentItem
                            .find(".xiaoxin-wechat-moments-item-time-row")
                            .after($likesContainer);
                    }

                    var likeIconSvgInner =
                        '<svg class="xiaoxin-wechat-moments-item-likes-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="#576b95" stroke-width="1.5"/></svg>';
                    var likesText =
                        '<span class="xiaoxin-wechat-moments-item-likes-icon-wrapper">' +
                        likeIconSvgInner +
                        "</span>";
                    likesText +=
                        '<span class="xiaoxin-wechat-moments-item-likes-names">' +
                        visibleLikes
                            .map(function (name) {
                                // 优先显示备注，若没有备注则显示昵称
                                var displayName = _getDisplayNameById(name);
                                return (
                                    '<span class="xiaoxin-wechat-moments-item-like-name">' +
                                    escapeHtml(displayName) +
                                    "</span>"
                                );
                            })
                            .join(", ") +
                        "</span>";
                    $likesContainer.html(likesText).show();
                }

                // 更新评论区域显示（个人朋友圈：应用隐私过滤，只显示玩家可以看到的评论）
                function updateCommentsDisplayForContact() {
                    var allComments = moment.comments || [];

                    // 获取当前玩家信息
                    var account = _getAccount();
                    var playerNickname = account.nickname || "微信用户";
                    var momentAuthor =
                        moment.author || moment.authorId || moment.userId;

                    console.info(
                        "[小馨手机][微信] 个人朋友圈页面: 开始过滤评论，玩家昵称:",
                        playerNickname,
                        "朋友圈作者:",
                        momentAuthor
                    );

                    // 过滤掉玩家看不到的评论（只显示玩家可以看到的评论）
                    // 规则：
                    // 1. 评论者必须是玩家、朋友圈作者或共同好友
                    // 2. 如果是回复类型的评论，被回复的对象（replyTo）也必须是玩家、朋友圈作者或共同好友
                    var visibleComments = allComments.filter(function (
                        comment
                    ) {
                        if (!comment || !comment.author) {
                            console.warn(
                                "[小馨手机][微信] 个人朋友圈页面: 评论数据不完整:",
                                comment
                            );
                            return false;
                        }

                        // 检查评论者是否可见
                        var canSeeAuthor = _canPlayerSeeInteraction(
                            playerNickname,
                            momentAuthor,
                            comment.author
                        );

                        if (!canSeeAuthor) {
                            console.info(
                                "[小馨手机][微信] 个人朋友圈页面: 评论被过滤（评论者不可见），评论者:",
                                comment.author,
                                "朋友圈作者:",
                                momentAuthor,
                                "评论内容:",
                                (comment.content || "").substring(0, 30)
                            );
                            return false;
                        }

                        // 如果是回复类型的评论，还需要检查被回复的对象是否可见
                        if (comment.type === "reply" && comment.replyTo) {
                            var canSeeReplyTo = _canPlayerSeeInteraction(
                                playerNickname,
                                momentAuthor,
                                comment.replyTo
                            );
                            if (!canSeeReplyTo) {
                                console.info(
                                    "[小馨手机][微信] 个人朋友圈页面: 回复被过滤（被回复者不可见），回复者:",
                                    comment.author,
                                    "被回复者:",
                                    comment.replyTo,
                                    "朋友圈作者:",
                                    momentAuthor
                                );
                                return false;
                            }
                        }

                        console.info(
                            "[小馨手机][微信] 个人朋友圈页面: 评论可见，评论者:",
                            comment.author,
                            "类型:",
                            comment.type,
                            "评论内容:",
                            (comment.content || "").substring(0, 30)
                        );
                        return true;
                    });
                    // 去重：避免重复扫描/ID混用导致重复评论展示
                    (function () {
                        var seen = new Set();
                        visibleComments = visibleComments.filter(function (c) {
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
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        });
                    })();

                    console.info(
                        "[小馨手机][微信] 个人朋友圈页面: 过滤后可见评论数量:",
                        visibleComments.length,
                        "原始评论数量:",
                        allComments.length
                    );

                    console.info(
                        "[小馨手机][微信] 个人朋友圈页面: 朋友圈ID:",
                        moment.id,
                        "评论数据检查:",
                        {
                            hasComments: !!moment.comments,
                            commentsType: typeof moment.comments,
                            commentsLength: allComments.length,
                            comments: allComments.map(function (c) {
                                return {
                                    author: c.author,
                                    content: (c.content || "").substring(0, 20),
                                    type: c.type,
                                };
                            }),
                        }
                    );

                    if (!visibleComments.length) {
                        console.info(
                            "[小馨手机][微信] 个人朋友圈页面: 没有评论数据，隐藏评论容器"
                        );
                        if ($commentsContainer) {
                            $commentsContainer.hide();
                        }
                        return;
                    }

                    if (!$commentsContainer) {
                        $commentsContainer = $(
                            '<div class="xiaoxin-wechat-moments-item-comments"></div>'
                        );
                        // 默认追加在点赞列表之后；如果还没创建点赞列表，则稍后统一 append
                        if ($likesContainer) {
                            $likesContainer.after($commentsContainer);
                        } else {
                            $momentItem.append($commentsContainer);
                        }
                    } else {
                        $commentsContainer.empty().show();
                    }

                    console.info(
                        "[小馨手机][微信] 个人朋友圈页面: 开始渲染评论，数量:",
                        visibleComments.length
                    );
                    visibleComments.forEach(function (comment, index) {
                        // 复用主朋友圈的渲染函数，支持回复、表情包、图片等完整样式
                        console.info(
                            "[小馨手机][微信] 个人朋友圈页面: 渲染评论，作者:",
                            comment.author,
                            "内容:",
                            (comment.content || "").substring(0, 30)
                        );
                        var $commentItem = renderCommentItem(comment, $root);
                        $commentItem.data("comment-index", index);
                        $commentsContainer.append($commentItem);
                    });
                    // 在个人朋友圈页面也支持点击评论直接回复
                    $commentsContainer
                        .off("click.replyComment")
                        .on(
                            "click.replyComment",
                            ".xiaoxin-wechat-moments-item-comment-clickable",
                            function (e) {
                                e.stopPropagation();
                                var $item = $(this);
                                var idx = $item.data("comment-index");
                                if (
                                    typeof idx === "number" &&
                                    visibleComments[idx]
                                ) {
                                    handleReplyToComment(visibleComments[idx]);
                                }
                            }
                        );
                    console.info(
                        "[小馨手机][微信] 个人朋友圈页面: 评论渲染完成，容器:",
                        $commentsContainer.length > 0 ? "已创建" : "未创建"
                    );
                }

                // 点赞点击（与主朋友圈列表的指令格式保持一致）
                $likeBtn.on("click", function (e) {
                    e.stopPropagation();
                    var account = _getAccount();
                    var playerNickname = account.nickname || "微信用户";
                    if (!moment.likes) moment.likes = [];
                    if (isLiked) {
                        // 取消点赞
                        moment.likes = moment.likes.filter(function (n) {
                            return n !== playerNickname;
                        });
                        isLiked = false;
                        moment.isLiked = false;
                        $likeBtn.removeClass("liked");
                        $likeBtn
                            .find(".xiaoxin-wechat-moments-like-text")
                            .text("赞");
                        $likeBtn
                            .find("svg path")
                            .attr("fill", "none")
                            .attr("stroke", "#fff");
                        // 同步更新数据存储
                        if (window.XiaoxinWeChatDataHandler) {
                            window.XiaoxinWeChatDataHandler.updateMoment(
                                moment.id,
                                moment
                            );
                        }
                        // 取消点赞后，刷新点赞列表（如果列表为空会自动隐藏）
                        updateLikesDisplayForContact();
                    } else {
                        // 点赞
                        if (moment.likes.indexOf(playerNickname) === -1) {
                            moment.likes.push(playerNickname);
                        }
                        isLiked = true;
                        moment.isLiked = true;
                        $likeBtn.addClass("liked");
                        $likeBtn
                            .find(".xiaoxin-wechat-moments-like-text")
                            .text("取消");
                        $likeBtn
                            .find("svg path")
                            .attr("fill", "#ff2442")
                            .attr("stroke", "none");
                        // 生成与主朋友圈相同格式的点赞指令
                        var momentContentPreview = "";
                        if (moment.content) {
                            momentContentPreview = moment.content.substring(
                                0,
                                50
                            );
                            if (moment.content.length > 50) {
                                momentContentPreview += "...";
                            }
                        } else if (moment.music) {
                            momentContentPreview =
                                "分享音乐：" +
                                (moment.music.title || "") +
                                " - " +
                                (moment.music.artist || "");
                        } else if (moment.images && moment.images.length > 0) {
                            momentContentPreview =
                                "发布了" + moment.images.length + "张图片";
                        }

                        var likeCommand =
                            '<moments-interactions>\n  <like momentId="' +
                            escapeHtml(moment.id) +
                            '" liker="' +
                            escapeHtml(playerNickname) +
                            '"></like>\n</moments-interactions>';
                        if (momentContentPreview) {
                            likeCommand =
                                "<!-- 玩家对朋友圈（ID: " +
                                escapeHtml(moment.id) +
                                "，内容：" +
                                escapeHtml(momentContentPreview) +
                                "）进行了点赞 -->\n" +
                                likeCommand;
                        }
                        _insertTextToTavernInput(likeCommand);

                        // 同步更新数据存储
                        if (window.XiaoxinWeChatDataHandler) {
                            window.XiaoxinWeChatDataHandler.updateMoment(
                                moment.id,
                                moment
                            );
                        }
                        // 点赞后刷新点赞列表
                        updateLikesDisplayForContact();
                    }
                });

                // 评论点击（与主朋友圈列表的指令格式保持一致，使用 _showCommentDialog）
                $commentBtn.on("click", function (e) {
                    e.stopPropagation();
                    var account = _getAccount();
                    var playerNickname = account.nickname || "微信用户";

                    _showCommentDialog(
                        {
                            title: "评论朋友圈",
                            placeholder: "请输入评论内容",
                        },
                        $root
                    )
                        .then(function (result) {
                            var commentText = result.content || "";
                            if (!commentText || !commentText.trim()) {
                                return;
                            }
                            if (!moment.comments) moment.comments = [];
                            // 新评论
                            moment.comments.push({
                                author: playerNickname,
                                content: commentText.trim(),
                                timestamp: _now(),
                            });

                            // 构造与主朋友圈一致的评论指令
                            var momentContentPreview = "";
                            if (moment.content) {
                                momentContentPreview = moment.content.substring(
                                    0,
                                    50
                                );
                                if (moment.content.length > 50) {
                                    momentContentPreview += "...";
                                }
                            } else if (moment.music) {
                                momentContentPreview =
                                    "分享音乐：" +
                                    (moment.music.title || "") +
                                    " - " +
                                    (moment.music.artist || "");
                            } else if (
                                moment.images &&
                                moment.images.length > 0
                            ) {
                                momentContentPreview =
                                    "发布了" + moment.images.length + "张图片";
                            }

                            var commentCommand =
                                '<moments-interactions>\n  <comment momentId="' +
                                escapeHtml(moment.id) +
                                '" commenter="' +
                                escapeHtml(playerNickname) +
                                '">\n    <content>' +
                                escapeHtml(commentText.trim()) +
                                "</content>\n  </comment>\n</moments-interactions>";
                            if (momentContentPreview) {
                                commentCommand =
                                    "<!-- 玩家对朋友圈（ID: " +
                                    escapeHtml(moment.id) +
                                    "，作者：" +
                                    escapeHtml(moment.author) +
                                    "，内容：" +
                                    escapeHtml(momentContentPreview) +
                                    "）进行了评论 -->\n" +
                                    commentCommand;
                            }
                            _insertTextToTavernInput(commentCommand);

                            // 同步更新数据存储
                            if (window.XiaoxinWeChatDataHandler) {
                                window.XiaoxinWeChatDataHandler.updateMoment(
                                    moment.id,
                                    moment
                                );
                            }

                            // 更新评论区域显示
                            updateCommentsDisplayForContact();
                        })
                        .catch(function (error) {
                            // 用户取消评论，无需处理
                            console.log(
                                "[小馨手机][微信] 用户取消评论(个人朋友圈):",
                                error && error.message
                            );
                        });
                });

                // 交互按钮显示/隐藏（与主朋友圈逻辑一致，使用 actions-visible）
                var isActionsVisible = false;
                var autoHideTimer = null;
                var hideActions = function () {
                    $momentActions.removeClass("actions-visible");
                    isActionsVisible = false;
                    if (autoHideTimer) {
                        clearTimeout(autoHideTimer);
                        autoHideTimer = null;
                    }
                };
                $moreBtn.on("click", function (e) {
                    e.stopPropagation();
                    isActionsVisible = !isActionsVisible;
                    if (isActionsVisible) {
                        $momentActions.addClass("actions-visible");
                        if (autoHideTimer) {
                            clearTimeout(autoHideTimer);
                            autoHideTimer = null;
                        }
                        autoHideTimer = setTimeout(function () {
                            hideActions();
                        }, 1000);
                    } else {
                        hideActions();
                    }
                });
                $(document).on("click", function (event) {
                    var target = $(event.target);
                    if (
                        !target.closest(".xiaoxin-wechat-moments-item-actions")
                            .length &&
                        !target.closest(".xiaoxin-wechat-moments-item-more")
                            .length
                    ) {
                        hideActions();
                    }
                });

                // 创建时间行容器：时间 + 更多按钮 + 互动按钮，使用 flex 对齐
                var $momentTimeRow = $(
                    '<div class="xiaoxin-wechat-moments-item-time-row"></div>'
                );
                $momentTimeRow.append($momentTime);
                $momentTimeRow.append($moreBtn);
                $momentTimeRow.append($momentActions);

                // 先添加时间行（内部已包含按钮），确保后续 likes/comments 能正确插入到时间行之后
                $momentItem.append($momentTimeRow);

                // 初始化时根据已有数据渲染点赞和评论（此时时间行已存在）
                if (moment.likes && moment.likes.length > 0) {
                    updateLikesDisplayForContact();
                }
                if (moment.comments && moment.comments.length > 0) {
                    updateCommentsDisplayForContact();
                }

                $contentSection.append($momentItem);
            });
        }

        $headerSection.append($backgroundImage, $dividerSection);

        // 个性签名（显示在分割线下方，在headerSection和contentSection之间）
        // 如果是玩家自己，优先使用账号资料中的签名，确保与个人资料弹窗同步
        var signature = null;
        if (contact && contact.isSelf) {
            signature =
                (account && (account.signature || account.sign || account.desc)) ||
                contact.signature ||
                null;
        } else {
            signature = contact.signature || null;
        }
        if (signature) {
            var $signatureSection = $(
                '<div class="xiaoxin-wechat-moments-signature-section"></div>'
            );
            // 检测签名中是否有换行符（角色自行换行）
            var hasLineBreak = signature.indexOf("\n") !== -1;
            var signatureClass = "xiaoxin-wechat-moments-signature";
            if (hasLineBreak) {
                // 如果有换行符，添加允许多行显示的class
                signatureClass += " xiaoxin-wechat-moments-signature-multiline";
            }
            var $signature = $(
                '<div class="' +
                    signatureClass +
                    '">' +
                    escapeHtml(signature) +
                    "</div>"
            );
            $signatureSection.append($signature);
            $main.append($headerSection, $signatureSection, $contentSection);
        } else {
            $main.append($headerSection, $contentSection);
        }
        // 结构与主朋友圈一致：标题栏和固定按钮在外层，内容在可滚动容器中
        // 将签名区块插入 headerSection 与 contentSection 之间
        if ($signatureSection) {
            $main.append($headerSection, $signatureSection, $contentSection);
        } else {
            $main.append($headerSection, $contentSection);
        }
        $root.empty().append($titleBar, $fixedButtons, $main);

        // 进入页面时滚动到最顶端
        setTimeout(function () {
            $main.scrollTop(0);
        }, 0);

        // 监听滚动事件，控制标题栏显示/隐藏，以及固定按钮的显示/隐藏
        var headerHeight = $headerSection.outerHeight() || 200; // 背景图区域高度
        var isTitleBarVisible = false;

        $main.on("scroll", function () {
            var scrollTop = $main.scrollTop();
            var shouldShow = scrollTop > headerHeight - 50; // 当滚动超过背景图高度时显示标题栏

            if (shouldShow && !isTitleBarVisible) {
                $titleBar.addClass("title-bar-visible");
                $fixedButtons.css("opacity", "0"); // 隐藏固定按钮
                $fixedButtons.css("pointer-events", "none");
                isTitleBarVisible = true;
            } else if (!shouldShow && isTitleBarVisible) {
                $titleBar.removeClass("title-bar-visible");
                $fixedButtons.css("opacity", "1"); // 显示固定按钮
                $fixedButtons.css("pointer-events", "auto");
                isTitleBarVisible = false;
            }
        });

        // 初始状态：显示固定按钮
        $fixedButtons.css("opacity", "1");
        $fixedButtons.css("pointer-events", "auto");

        // 监听朋友圈更新事件，自动刷新页面
        // 清理旧的事件监听器（如果存在）
        var oldContactMomentsUpdatedHandler = $root.data("contactMomentsUpdatedHandler");
        if (oldContactMomentsUpdatedHandler) {
            window.removeEventListener(
                "xiaoxin-moments-updated",
                oldContactMomentsUpdatedHandler
            );
            $root.removeData("contactMomentsUpdatedHandler");
        }

        // 创建新的事件监听器
        var contactMomentsUpdatedHandler = function () {
            console.info(
                "[小馨手机][微信] 角色个人朋友圈页面: 收到朋友圈更新事件，自动刷新"
            );
            // 延迟刷新，确保数据已写入
            setTimeout(function () {
                if (_currentPage === "contactMoments" && _currentContact) {
                    _renderContactMomentsPage($root, mobilePhone, _currentContact, showEmptyMoments);
                }
            }, 200);
        };
        window.addEventListener("xiaoxin-moments-updated", contactMomentsUpdatedHandler);
        $root.data("contactMomentsUpdatedHandler", contactMomentsUpdatedHandler);
    }

    // ========== 刷新当前页面（如果正在显示朋友圈） ==========
    function _refreshCurrentPageIfMoments() {
        if (!_currentRoot || !_currentMobilePhone) {
            return;
        }

        // 如果当前正在显示朋友圈页面，则重新渲染
        if (_currentPage === "moments") {
            console.info(
                "[小馨手机][微信] 检测到朋友圈数据更新，自动刷新朋友圈页面"
            );

            // 检查是否有新朋友圈生成，如果有则清除对应的预览朋友圈
            if (
                _previewMoments &&
                _previewMoments.length > 0 &&
                window.XiaoxinWeChatDataHandler
            ) {
                var allMoments =
                    window.XiaoxinWeChatDataHandler.getMoments() || [];
                var account = _getAccount();
                var playerWechatId = null;
                var playerId = null;
                if (account) {
                    playerWechatId = account.wechatId || account.id || "player";
                    playerId = account.id || "player";
                }

                // 检查预览朋友圈是否已经生成为正式朋友圈
                var previewToRemove = [];
                _previewMoments.forEach(function (previewMoment) {
                    // 检查是否有相同ID或相同内容的正式朋友圈
                    var found = allMoments.some(function (moment) {
                        // 跳过预览朋友圈本身
                        if (moment.isPreview) {
                            return false;
                        }

                        // 检查ID是否匹配
                        if (
                            moment.id === previewMoment.id ||
                            moment._id === previewMoment.id
                        ) {
                            return true;
                        }

                        // 检查是否是玩家发布的朋友圈，且内容匹配（更宽松的匹配）
                        var momentAuthorId =
                            moment.authorId || moment.userId || moment.author;
                        var isPlayerMoment = false;

                        // 检查作者ID是否匹配（支持多种格式）
                        // 先检查是否为 "player" 或 "user"
                        if (momentAuthorId) {
                            var momentAuthorIdStr = String(momentAuthorId).trim();
                            var momentAuthorIdLower = momentAuthorIdStr.toLowerCase();
                            if (momentAuthorIdLower === "player" || momentAuthorIdLower === "user") {
                                isPlayerMoment = true;
                            }
                        }
                        if (!isPlayerMoment && momentAuthorId && playerWechatId) {
                            var momentAuthorIdStr =
                                String(momentAuthorId).trim();
                            var playerWechatIdStr =
                                String(playerWechatId).trim();
                            isPlayerMoment =
                                momentAuthorIdStr === playerWechatIdStr ||
                                momentAuthorIdStr ===
                                    "contact_" + playerWechatIdStr ||
                                "contact_" + momentAuthorIdStr ===
                                    playerWechatIdStr ||
                                momentAuthorIdStr.replace(/^contact_/, "") ===
                                    playerWechatIdStr.replace(/^contact_/, "");
                        }

                        if (momentAuthorId && playerId && !isPlayerMoment) {
                            var momentAuthorIdStr =
                                String(momentAuthorId).trim();
                            var playerIdStr = String(playerId).trim();
                            isPlayerMoment =
                                momentAuthorIdStr === playerIdStr ||
                                momentAuthorIdStr ===
                                    "contact_" + playerIdStr ||
                                "contact_" + momentAuthorIdStr ===
                                    playerIdStr ||
                                momentAuthorIdStr.replace(/^contact_/, "") ===
                                    playerIdStr.replace(/^contact_/, "");
                        }

                        // 如果作者匹配，且内容匹配（允许内容为空的情况）
                        if (isPlayerMoment) {
                            var previewContent = (
                                previewMoment.content || ""
                            ).trim();
                            var momentContent = (moment.content || "").trim();

                            // 如果内容完全匹配，或者两者都为空，则认为匹配
                            if (
                                previewContent === momentContent ||
                                (previewContent === "" && momentContent === "")
                            ) {
                                return true;
                            }

                            // 如果预览朋友圈有图片，检查正式朋友圈是否也有图片
                            if (
                                previewMoment.images &&
                                previewMoment.images.length > 0
                            ) {
                                if (moment.images && moment.images.length > 0) {
                                    // 都有图片，且内容匹配，则认为匹配
                                    if (previewContent === momentContent) {
                                        return true;
                                    }
                                }
                            }
                        }

                        return false;
                    });

                    if (found) {
                        previewToRemove.push(previewMoment.id);
                        console.info(
                            "[小馨手机][微信] 预览朋友圈已生成为正式朋友圈，清除预览:",
                            previewMoment.id,
                            "预览内容:",
                            previewMoment.content
                        );
                    }
                });

                // 移除已生成的预览朋友圈
                if (previewToRemove.length > 0) {
                    _previewMoments = _previewMoments.filter(function (m) {
                        return previewToRemove.indexOf(m.id) === -1;
                    });
                    console.info(
                        "[小馨手机][微信] 已清除预览朋友圈数量:",
                        previewToRemove.length,
                        "剩余预览:",
                        _previewMoments.length
                    );
                }
            }

            _renderMomentsPage(_currentRoot, _currentMobilePhone);
        } else if (_currentPage === "contactMoments") {
            // 如果是个人朋友圈页面，重新渲染
            if (_currentContact && _currentRoot && _currentMobilePhone) {
                console.info(
                    "[小馨手机][微信] 检测到朋友圈数据更新，自动刷新角色个人朋友圈页面"
                );
                _renderContactMomentsPage(_currentRoot, _currentMobilePhone, _currentContact, false);
            } else {
                console.info(
                    "[小馨手机][微信] 检测到朋友圈数据更新，但当前是个人朋友圈页面，缺少联系人信息，无法自动刷新"
                );
            }
        }
    }

    // ========== 显示发布朋友圈页面 ==========
    function _showMomentsPublishPage($root, mobilePhone) {
        console.info("[小馨手机][微信] 显示发布朋友圈页面");

        // 保存当前根容器和手机实例，用于关闭时返回
        _currentRoot = $root;
        _currentMobilePhone = mobilePhone;
        _currentPage = "moments"; // 标记当前页面类型

        // 检查moments.js是否已加载
        if (!window.XiaoxinWeChatMomentsPublish) {
            console.error(
                "[小馨手机][微信] moments.js未加载，无法显示发布页面"
            );
            if (typeof toastr !== "undefined") {
                toastr.error("发布朋友圈功能未加载，请刷新页面", "小馨手机");
            }
            return;
        }

        // 创建发布页面容器
        var $publishScreen = $(
            '<div class="xiaoxin-wechat-moments-publish-screen"></div>'
        );
        $root.empty().append($publishScreen);

        // 初始化发布页面
        try {
            window.XiaoxinWeChatMomentsPublish.init($publishScreen);
            console.info("[小馨手机][微信] 发布朋友圈页面初始化成功");
        } catch (e) {
            console.error("[小馨手机][微信] 发布朋友圈页面初始化失败:", e);
            if (typeof toastr !== "undefined") {
                toastr.error("发布朋友圈页面初始化失败", "小馨手机");
            }
            // 失败时返回朋友圈页面
            _renderMomentsPage($root, mobilePhone);
        }
    }

    // ========== 关闭发布朋友圈页面 ==========
    function closeMomentsPublish() {
        console.info("[小馨手机][微信] 关闭发布朋友圈页面");

        // 检查输入框中是否还有朋友圈指令，如果没有则清除预览
        setTimeout(function () {
            var hasMomentsCommand = false;
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
                    var inputValue = $input.val() || "";
                    // 检查是否包含朋友圈指令的关键字
                    hasMomentsCommand =
                        inputValue.indexOf("[moments]") !== -1 ||
                        inputValue.indexOf("[moment") !== -1;
                }
            } catch (e) {
                console.warn("[小馨手机][微信] 检查输入框内容失败:", e);
            }

            // 如果输入框中没有朋友圈指令，且预览朋友圈还在，说明用户没有发送，清除预览
            if (
                !hasMomentsCommand &&
                _previewMoments &&
                _previewMoments.length > 0
            ) {
                console.info(
                    "[小馨手机][微信] 关闭发布页面时检测到输入框没有朋友圈指令，清除预览朋友圈"
                );
                _clearPreviewMoments();
            }
        }, 1000); // 延迟1秒检查，给用户时间

        if (_currentRoot && _currentMobilePhone) {
            // 返回朋友圈页面
            _renderMomentsPage(_currentRoot, _currentMobilePhone);
        } else {
            // 备用方案：尝试通过DOM查找并关闭发布页面
            console.warn("[小馨手机][微信] _currentRoot 或 _currentMobilePhone 未设置，尝试备用关闭方案");
            var $publishScreen = $(".xiaoxin-wechat-moments-publish-screen");
            if ($publishScreen.length > 0) {
                // 查找父容器
                var $parent = $publishScreen.parent();
                if ($parent.length > 0) {
                    // 尝试查找朋友圈页面的容器
                    var $momentsContainer = $parent.find(".xiaoxin-wechat-moments-main, .xiaoxin-wechat-main");
                    if ($momentsContainer.length > 0) {
                        // 如果找到了朋友圈容器，直接显示它
                        $publishScreen.hide();
                        $momentsContainer.show();
                    } else {
                        // 如果没找到，尝试重新渲染朋友圈页面
                        // 通过查找最近的包含微信应用的容器
                        var $wechatContainer = $publishScreen.closest(".xiaoxin-wechat-app, .xiaoxin-mobile-app");
                        if ($wechatContainer.length > 0 && window.mobilePhone) {
                            // 清空容器并重新渲染朋友圈页面
                            $wechatContainer.empty();
                            if (window.XiaoxinWeChatApp && window.XiaoxinWeChatApp.render) {
                                // 切换到朋友圈标签
                                var $tabs = $wechatContainer.find(".xiaoxin-wechat-tab-item");
                                var $momentsTab = $tabs.filter('[data-tab="moments"]');
                                if ($momentsTab.length > 0) {
                                    $momentsTab.trigger('click');
                                } else {
                                    // 如果找不到标签，直接调用render
                                    window.XiaoxinWeChatApp.render($wechatContainer, window.mobilePhone);
                                }
                            }
                        } else {
                            // 最后的备用方案：直接移除发布页面
                            $publishScreen.remove();
                            console.warn("[小馨手机][微信] 无法找到合适的容器，已直接移除发布页面");
                        }
                    }
                }
            }
        }
    }

    // ========== 添加预览朋友圈 ==========
    function _addPreviewMoment(previewMoment) {
        if (!previewMoment || !previewMoment.id) {
            console.warn("[小馨手机][微信] 预览朋友圈数据无效");
            return;
        }

        // 检查是否已存在相同ID的预览朋友圈
        var exists = _previewMoments.some(function (m) {
            return m.id === previewMoment.id;
        });

        if (exists) {
            console.info(
                "[小馨手机][微信] 预览朋友圈已存在，更新:",
                previewMoment.id
            );
            // 更新已存在的预览朋友圈
            _previewMoments = _previewMoments.map(function (m) {
                return m.id === previewMoment.id ? previewMoment : m;
            });
        } else {
            console.info(
                "[小馨手机][微信] 添加新预览朋友圈:",
                previewMoment.id
            );
            _previewMoments.push(previewMoment);
        }

        // 启动定期检查
        _startPreviewCheck();

        // 如果当前正在显示朋友圈页面，刷新页面以显示预览
        if (_currentPage === "moments" && _currentRoot && _currentMobilePhone) {
            console.info(
                "[小馨手机][微信] 检测到预览朋友圈，自动刷新朋友圈页面"
            );
            setTimeout(function () {
                _renderMomentsPage(_currentRoot, _currentMobilePhone);
            }, 100);
        }
    }

    // ========== 清除预览朋友圈 ==========
    function _clearPreviewMoments() {
        var count = _previewMoments.length;
        _previewMoments = [];
        console.info("[小馨手机][微信] 已清除所有预览朋友圈，数量:", count);

        // 停止定期检查
        _stopPreviewCheck();

        // 如果当前正在显示朋友圈页面，刷新页面
        if (_currentPage === "moments" && _currentRoot && _currentMobilePhone) {
            setTimeout(function () {
                _renderMomentsPage(_currentRoot, _currentMobilePhone);
            }, 100);
        }
    }

    // ========== 定期检查并清除已生成的预览朋友圈 ==========
    var _previewCheckInterval = null;
    function _startPreviewCheck() {
        // 清除旧的定时器
        if (_previewCheckInterval) {
            clearInterval(_previewCheckInterval);
        }

        // 每3秒检查一次预览朋友圈是否已生成
        _previewCheckInterval = setInterval(function () {
            if (
                _previewMoments &&
                _previewMoments.length > 0 &&
                window.XiaoxinWeChatDataHandler
            ) {
                var allMoments =
                    window.XiaoxinWeChatDataHandler.getMoments() || [];
                var account = _getAccount();
                var playerWechatId = null;
                var playerId = null;
                if (account) {
                    playerWechatId = account.wechatId || account.id || "player";
                    playerId = account.id || "player";
                }

                var previewToRemove = [];
                _previewMoments.forEach(function (previewMoment) {
                    var found = allMoments.some(function (moment) {
                        if (moment.isPreview) {
                            return false;
                        }

                        if (
                            moment.id === previewMoment.id ||
                            moment._id === previewMoment.id
                        ) {
                            return true;
                        }

                        var momentAuthorId =
                            moment.authorId || moment.userId || moment.author;
                        var isPlayerMoment = false;

                        // 先检查是否为 "player" 或 "user"
                        if (momentAuthorId) {
                            var momentAuthorIdStr = String(momentAuthorId).trim();
                            var momentAuthorIdLower = momentAuthorIdStr.toLowerCase();
                            if (momentAuthorIdLower === "player" || momentAuthorIdLower === "user") {
                                isPlayerMoment = true;
                            }
                        }
                        if (!isPlayerMoment && momentAuthorId && playerWechatId) {
                            var momentAuthorIdStr =
                                String(momentAuthorId).trim();
                            var playerWechatIdStr =
                                String(playerWechatId).trim();
                            isPlayerMoment =
                                momentAuthorIdStr === playerWechatIdStr ||
                                momentAuthorIdStr ===
                                    "contact_" + playerWechatIdStr ||
                                "contact_" + momentAuthorIdStr ===
                                    playerWechatIdStr ||
                                momentAuthorIdStr.replace(/^contact_/, "") ===
                                    playerWechatIdStr.replace(/^contact_/, "");
                        }

                        if (momentAuthorId && playerId && !isPlayerMoment) {
                            var momentAuthorIdStr =
                                String(momentAuthorId).trim();
                            var playerIdStr = String(playerId).trim();
                            isPlayerMoment =
                                momentAuthorIdStr === playerIdStr ||
                                momentAuthorIdStr ===
                                    "contact_" + playerIdStr ||
                                "contact_" + momentAuthorIdStr ===
                                    playerIdStr ||
                                momentAuthorIdStr.replace(/^contact_/, "") ===
                                    playerIdStr.replace(/^contact_/, "");
                        }

                        if (isPlayerMoment) {
                            var previewContent = (
                                previewMoment.content || ""
                            ).trim();
                            var momentContent = (moment.content || "").trim();

                            if (
                                previewContent === momentContent ||
                                (previewContent === "" && momentContent === "")
                            ) {
                                return true;
                            }

                            if (
                                previewMoment.images &&
                                previewMoment.images.length > 0
                            ) {
                                if (
                                    moment.images &&
                                    moment.images.length > 0 &&
                                    previewContent === momentContent
                                ) {
                                    return true;
                                }
                            }
                        }

                        return false;
                    });

                    if (found) {
                        previewToRemove.push(previewMoment.id);
                        console.info(
                            "[小馨手机][微信] 定期检查：找到匹配的正式朋友圈，预览ID:",
                            previewMoment.id,
                            "预览内容:",
                            previewMoment.content
                        );
                    }
                });

                if (previewToRemove.length > 0) {
                    _previewMoments = _previewMoments.filter(function (m) {
                        return previewToRemove.indexOf(m.id) === -1;
                    });
                    console.info(
                        "[小馨手机][微信] 定期检查：已清除预览朋友圈数量:",
                        previewToRemove.length,
                        "剩余预览:",
                        _previewMoments.length
                    );

                    // 如果当前正在显示朋友圈页面，立即刷新页面
                    if (
                        _currentPage === "moments" &&
                        _currentRoot &&
                        _currentMobilePhone
                    ) {
                        _renderMomentsPage(_currentRoot, _currentMobilePhone);
                    }
                }
            } else if (!_previewMoments || _previewMoments.length === 0) {
                // 如果没有预览朋友圈了，停止检查
                if (_previewCheckInterval) {
                    clearInterval(_previewCheckInterval);
                    _previewCheckInterval = null;
                    console.info(
                        "[小馨手机][微信] 所有预览朋友圈已清除，停止定期检查"
                    );
                }
            }
        }, 500); // 每500ms检查一次，更快检测
    }

    function _stopPreviewCheck() {
        if (_previewCheckInterval) {
            clearInterval(_previewCheckInterval);
            _previewCheckInterval = null;
        }
    }

    return {
        render,
        _forceReload: _forceReload,
        // 暴露给其他模块使用的工具：向酒馆输入框写入指令
        insertTextToTavernInput: _insertTextToTavernInput,
        // 暴露页面渲染函数（供返回逻辑使用）
        _renderContactsPage: _renderContactsPage,
        _renderMomentsPage: _renderMomentsPage,
        _renderChatPage: _renderChatPage,
        _renderChatDetailPage: _renderChatDetailPage,
        _renderDiscoverPage: _renderDiscoverPage,
        _renderMePage: _renderMePage,
        // 暴露个人朋友圈页面渲染函数
        _renderContactMomentsPage: _renderContactMomentsPage,
        // 暴露表情包列表获取函数
        _getEmojiList: _getEmojiList,
        // 暴露表情包路径获取函数
        _getEmojiPath: _getEmojiPath,
        // 暴露生成表情包世界书内容函数
        generateStickerWorldbook: generateStickerWorldbook,

        // 控制台查看当前角色卡的表情包列表
        // 使用方法：在浏览器控制台输入 window.XiaoxinWeChatApp.showStickers()
        showStickers: function () {
            console.log("=== 当前角色卡的表情包列表 ===");
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

            var stickers = [];
            try {
                if (
                    window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler.getAllStickers ===
                        "function"
                ) {
                    stickers =
                        window.XiaoxinWeChatDataHandler.getAllStickers() || [];
                }
            } catch (e) {
                console.error("获取表情包列表失败:", e);
                return;
            }

            if (stickers.length === 0) {
                console.log("当前角色卡没有自定义表情包");
                console.log("默认表情包列表:", _getEmojiList().slice(0, 23)); // 只显示默认表情包
                return;
            }

            console.log("自定义表情包数量:", stickers.length);
            console.table(
                stickers.map(function (sticker, index) {
                    return {
                        序号: index + 1,
                        表情包ID: sticker.id || "无ID",
                        描述: sticker.description || sticker.desc || "无描述",
                        URL:
                            (
                                sticker.url ||
                                sticker.src ||
                                sticker.path ||
                                "无URL"
                            ).substring(0, 50) +
                            (sticker.url && sticker.url.length > 50
                                ? "..."
                                : ""),
                        类型: (
                            sticker.url ||
                            sticker.src ||
                            sticker.path ||
                            ""
                        ).startsWith("data:image")
                            ? "本地上传(base64)"
                            : "网络URL",
                    };
                })
            );

            console.log("\n=== 使用说明 ===");
            console.log(
                "1. 在聊天消息中使用表情包ID: type=emoji, content=表情包ID"
            );
            console.log("2. 或者直接发送表情包ID作为消息内容");
            console.log(
                "3. 表情包ID映射表:",
                window.XiaoxinWeChatApp._stickerIdMap || "未初始化"
            );

            return stickers;
        },
        // 暴露刷新朋友圈页面函数
        refreshMomentsPage: _refreshCurrentPageIfMoments,
        // 暴露关闭发布朋友圈页面函数
        closeMomentsPublish: closeMomentsPublish,
        // 暴露添加预览朋友圈函数
        addPreviewMoment: _addPreviewMoment,
        // 暴露清除预览朋友圈函数
        clearPreviewMoments: _clearPreviewMoments,
        // 暴露获取账号函数（供其他模块使用）
        _getAccount: _getAccount,
        // 调试：暴露账号读写
        _debug: {
            getAccount: _getAccount,
            clearAccount: function () {
                if (window.XiaoxinWeChatDataHandler) {
                    window.XiaoxinWeChatDataHandler.initializeData();
                    console.info("[小馨手机][微信] 已清空当前账号数据");
                }
                // 清除当前账号（但保留账号列表）
                if (window.XiaoxinWeChatAccount) {
                    var accountId =
                        window.XiaoxinWeChatAccount.getCurrentAccountId();
                    if (accountId) {
                        window.XiaoxinWeChatAccount.setCurrentAccountId(null);
                        console.info("[小馨手机][微信] 已清除当前账号ID");
                    }
                }
            },
            // 获取账号列表
            getAccountList: function () {
                if (window.XiaoxinWeChatAccount) {
                    return window.XiaoxinWeChatAccount.getAccountList();
                }
                return [];
            },
            // 切换账号
            switchAccount: function (accountId) {
                if (window.XiaoxinWeChatAccount) {
                    var success =
                        window.XiaoxinWeChatAccount.switchAccount(accountId);
                    if (success && _currentRoot && _currentMobilePhone) {
                        render(_currentRoot, _currentMobilePhone);
                    }
                    return success;
                }
                return false;
            },
        },
    };
})();
