// 照片消息发送模块
window.XiaoxinPhotoMessage = (function () {
    var $photoDialog = null;
    var selectedImageUrl = null;
    var currentMode = "custom"; // "custom" 或 "ai"

    // 显示照片消息弹窗
    function showPhotoMessageDialog() {
        // 关闭菜单栏
        if (window.XiaoxinWeChatChatUI && window.XiaoxinWeChatChatUI.isMenuExpanded) {
            window.XiaoxinWeChatChatUI.toggleMenu();
        }

        // 如果弹窗已存在，先移除
        if ($photoDialog) {
            $photoDialog.remove();
        }

        // 创建弹窗
        $photoDialog = $(
            '<div class="xiaoxin-photo-message-dialog">' +
                '<div class="xiaoxin-photo-message-dialog-backdrop"></div>' +
                '<div class="xiaoxin-photo-message-dialog-content">' +
                '<div class="xiaoxin-photo-message-dialog-header">' +
                '<div class="xiaoxin-photo-message-dialog-title">发送照片</div>' +
                '<button class="xiaoxin-photo-message-dialog-close">✕</button>' +
                "</div>" +
                '<div class="xiaoxin-photo-message-dialog-tabs">' +
                '<button class="xiaoxin-photo-message-tab active" data-mode="custom">自定义图片</button>' +
                '<button class="xiaoxin-photo-message-tab" data-mode="ai">AI生图</button>' +
                "</div>" +
                '<div class="xiaoxin-photo-message-dialog-body">' +
                // 自定义图片区域
                '<div class="xiaoxin-photo-message-custom-panel active">' +
                '<div class="xiaoxin-photo-message-upload-section">' +
                '<div class="xiaoxin-photo-message-upload-label">图片URL</div>' +
                '<div class="xiaoxin-photo-message-upload-area">' +
                '<div class="xiaoxin-photo-message-preview-container">' +
                '<img class="xiaoxin-photo-message-preview" style="display: none;">' +
                '<div class="xiaoxin-photo-message-preview-placeholder">输入图片URL</div>' +
                "</div>" +
                '<div class="xiaoxin-photo-message-upload-buttons">' +
                '<input type="text" class="xiaoxin-photo-message-url-input" placeholder="请输入图片URL">' +
                "</div>" +
                "</div>" +
                "</div>" +
                '<div class="xiaoxin-photo-message-description-section">' +
                '<div class="xiaoxin-photo-message-description-label">图片描述</div>' +
                '<textarea class="xiaoxin-photo-message-description-input" placeholder="请输入图片描述..."></textarea>' +
                "</div>" +
                "</div>" +
                // AI生图区域
                '<div class="xiaoxin-photo-message-ai-panel">' +
                '<div class="xiaoxin-photo-message-ai-description-section">' +
                '<div class="xiaoxin-photo-message-ai-description-label">图片描述</div>' +
                '<div class="xiaoxin-photo-message-ai-description-wrapper">' +
                '<textarea class="xiaoxin-photo-message-ai-description-input" placeholder="请输入图片描述..."></textarea>' +
                '<button class="xiaoxin-photo-message-ai-optimize-btn">优化提示词</button>' +
                "</div>" +
                "</div>" +
                '<div class="xiaoxin-photo-message-ai-size-section">' +
                '<div class="xiaoxin-photo-message-ai-size-label">图片尺寸</div>' +
                '<div class="xiaoxin-photo-message-ai-size-options">' +
                '<label class="xiaoxin-photo-message-ai-size-option">' +
                '<input type="radio" name="ai-image-size" value="1:1" checked>' +
                '<span>1:1</span>' +
                "</label>" +
                '<label class="xiaoxin-photo-message-ai-size-option">' +
                '<input type="radio" name="ai-image-size" value="4:3">' +
                '<span>4:3</span>' +
                "</label>" +
                '<label class="xiaoxin-photo-message-ai-size-option">' +
                '<input type="radio" name="ai-image-size" value="16:9">' +
                '<span>16:9</span>' +
                "</label>" +
                '<label class="xiaoxin-photo-message-ai-size-option">' +
                '<input type="radio" name="ai-image-size" value="3:4">' +
                '<span>3:4</span>' +
                "</label>" +
                '<label class="xiaoxin-photo-message-ai-size-option">' +
                '<input type="radio" name="ai-image-size" value="9:16">' +
                '<span>9:16</span>' +
                "</label>" +
                "</div>" +
                "</div>" +
                '<div class="xiaoxin-photo-message-ai-preview-section">' +
                '<div class="xiaoxin-photo-message-ai-preview-container">' +
                '<img class="xiaoxin-photo-message-ai-preview" style="display: none;">' +
                '<div class="xiaoxin-photo-message-ai-preview-placeholder">生成图片后将在此显示预览</div>' +
                "</div>" +
                "</div>" +
                "</div>" +
                "</div>" +
                '<div class="xiaoxin-photo-message-dialog-footer">' +
                '<button class="xiaoxin-photo-message-dialog-cancel">取消</button>' +
                '<button class="xiaoxin-photo-message-dialog-complete">完成</button>' +
                "</div>" +
                "</div>" +
                "</div>"
        );

        // 优先挂载到手机容器内，保证在手机页面范围内自适应显示
        var $phoneContainer = $(".xiaoxin-phone-container");
        if ($phoneContainer.length > 0) {
            $phoneContainer.append($photoDialog);
        } else {
            // 兜底：PC 调试场景
            $("body").append($photoDialog);
        }

        // 获取元素引用
        var $preview = $photoDialog.find(".xiaoxin-photo-message-preview");
        var $previewPlaceholder = $photoDialog.find(
            ".xiaoxin-photo-message-preview-placeholder"
        );
        var $urlInput = $photoDialog.find(
            ".xiaoxin-photo-message-url-input"
        );
        var $descriptionInput = $photoDialog.find(
            ".xiaoxin-photo-message-description-input"
        );
        var $cancelBtn = $photoDialog.find(
            ".xiaoxin-photo-message-dialog-cancel"
        );
        var $completeBtn = $photoDialog.find(
            ".xiaoxin-photo-message-dialog-complete"
        );
        var $closeBtn = $photoDialog.find(
            ".xiaoxin-photo-message-dialog-close"
        );
        var $tabs = $photoDialog.find(".xiaoxin-photo-message-tab");
        var $customPanel = $photoDialog.find(
            ".xiaoxin-photo-message-custom-panel"
        );
        var $aiPanel = $photoDialog.find(".xiaoxin-photo-message-ai-panel");
        var $aiDescriptionInput = $photoDialog.find(
            ".xiaoxin-photo-message-ai-description-input"
        );
        var $aiOptimizeBtn = $photoDialog.find(
            ".xiaoxin-photo-message-ai-optimize-btn"
        );
        var $aiSizeOptions = $photoDialog.find(
            'input[name="ai-image-size"]'
        );
        var $aiPreview = $photoDialog.find(
            ".xiaoxin-photo-message-ai-preview"
        );
        var $aiPreviewPlaceholder = $photoDialog.find(
            ".xiaoxin-photo-message-ai-preview-placeholder"
        );

        // AI生图相关状态
        var aiGeneratedImageUrl = null;
        var isGeneratingImage = false;

        // 重置状态
        selectedImageUrl = null;
        aiGeneratedImageUrl = null;
        isGeneratingImage = false;
        currentMode = "custom";
        $preview.hide();
        $previewPlaceholder.show();
        $descriptionInput.val("");
        $urlInput.val("");
        $aiDescriptionInput.val("");
        $aiPreview.hide();
        $aiPreviewPlaceholder.show();
        $aiSizeOptions.first().prop("checked", true);

        // 标签切换
        $tabs.on("click", function () {
            var mode = $(this).data("mode");
            if (mode === currentMode) return;

            currentMode = mode;
            $tabs.removeClass("active");
            $(this).addClass("active");

            if (mode === "custom") {
                $customPanel.addClass("active");
                $aiPanel.removeClass("active");
            } else {
                $customPanel.removeClass("active");
                $aiPanel.addClass("active");
            }
        });

        // AI生图：优化提示词按钮
        $aiOptimizeBtn.on("click", function () {
            var originalText = $aiDescriptionInput.val().trim();
            if (!originalText) {
                if (window.toastr) {
                    toastr.warning("请先输入图片描述", "小馨手机");
                } else {
                    alert("请先输入图片描述");
                }
                return;
            }

            // 禁用按钮，显示加载状态
            var $btn = $(this);
            var originalText_btn = $btn.text();
            $btn.prop("disabled", true);
            $btn.text("优化中...");

            // 调用优化提示词API
            if (
                window.XiaoxinAIImageGenerator &&
                typeof window.XiaoxinAIImageGenerator.optimizePrompt ===
                    "function"
            ) {
                window.XiaoxinAIImageGenerator
                    .optimizePrompt(originalText)
                    .then(function (optimizedText) {
                        $aiDescriptionInput.val(optimizedText);
                        if (window.toastr) {
                            toastr.success("提示词优化成功", "小馨手机");
                        }
                    })
                    .catch(function (error) {
                        console.error("[AI生图] 优化提示词失败:", error);
                        if (window.toastr) {
                            toastr.error(
                                "优化提示词失败: " + (error.message || "未知错误"),
                                "小馨手机"
                            );
                        } else {
                            alert("优化提示词失败: " + (error.message || "未知错误"));
                        }
                    })
                    .finally(function () {
                        $btn.prop("disabled", false);
                        $btn.text(originalText_btn);
                    });
            } else {
                if (window.toastr) {
                    toastr.error("AI生图模块未加载", "小馨手机");
                } else {
                    alert("AI生图模块未加载");
                }
                $btn.prop("disabled", false);
                $btn.text(originalText_btn);
            }
        });

        // 输入URL
        $urlInput.on("blur", function () {
            var url = $(this).val().trim();
            if (url) {
                // 验证URL
                if (
                    url.startsWith("http://") ||
                    url.startsWith("https://")
                ) {
                    selectedImageUrl = url;
                    $preview.attr("src", url);
                    $preview.show();
                    $previewPlaceholder.hide();
                } else {
                    if (window.toastr) {
                        toastr.warning("请输入有效的图片URL（http:// 或 https://）", "小馨手机");
                    } else {
                        alert("请输入有效的图片URL（http:// 或 https://）");
                    }
                }
            } else {
                // 清空URL时，清除预览
                selectedImageUrl = null;
                $preview.hide();
                $previewPlaceholder.show();
            }
        });

        // 关闭弹窗
        function closeDialog() {
            if ($photoDialog) {
                $photoDialog.remove();
                $photoDialog = null;
                selectedImageUrl = null;
            }
        }

        $closeBtn.on("click", closeDialog);
        $cancelBtn.on("click", closeDialog);
        $photoDialog
            .find(".xiaoxin-photo-message-dialog-backdrop")
            .on("click", closeDialog);

        // 完成按钮点击事件
        $completeBtn.on("click", function () {
            if (currentMode === "custom") {
                var description = $descriptionInput.val().trim();

                // 验证：至少要有图片或描述
                if (!selectedImageUrl && !description) {
                    if (window.toastr) {
                        toastr.warning("请上传图片或输入图片描述", "小馨手机");
                    } else {
                        alert("请上传图片或输入图片描述");
                    }
                    return;
                }

                // 发送照片消息
                sendPhotoMessage(selectedImageUrl, description);
                closeDialog();
            } else {
                // AI生图模式
                var aiDescription = $aiDescriptionInput.val().trim();
                if (!aiDescription) {
                    if (window.toastr) {
                        toastr.warning("请输入图片描述", "小馨手机");
                    } else {
                        alert("请输入图片描述");
                    }
                    return;
                }

                // 获取选中的尺寸
                var selectedSize = $aiSizeOptions.filter(":checked").val() || "1:1";

                // 如果已经生成过图片，直接发送
                if (aiGeneratedImageUrl) {
                    sendAIImageMessage(aiDescription, aiGeneratedImageUrl, selectedSize);
                    closeDialog();
                    return;
                }

                // 如果正在生成，提示用户等待
                if (isGeneratingImage) {
                    if (window.toastr) {
                        toastr.info("图片正在生成中，请稍候...", "小馨手机");
                    } else {
                        alert("图片正在生成中，请稍候...");
                    }
                    return;
                }

                // 开始生成图片
                isGeneratingImage = true;
                var $completeBtn_ai = $(this);
                var originalText_ai = $completeBtn_ai.text();
                $completeBtn_ai.prop("disabled", true);
                $completeBtn_ai.text("生成中...");

                // 显示预览占位符
                $aiPreview.hide();
                $aiPreviewPlaceholder.show().text("生成图片中...");

                // 调用生图API
                if (
                    window.XiaoxinAIImageGenerator &&
                    typeof window.XiaoxinAIImageGenerator.generateImage ===
                        "function"
                ) {
                    window.XiaoxinAIImageGenerator
                        .generateImage(aiDescription, {
                            aspectRatio: selectedSize,
                        })
                        .then(function (generatedImageUrl) {
                            aiGeneratedImageUrl = generatedImageUrl;
                            isGeneratingImage = false;

                            // 显示预览
                            $aiPreview.attr("src", generatedImageUrl);
                            $aiPreview.show();
                            $aiPreviewPlaceholder.hide();

                            // 发送消息
                            sendAIImageMessage(
                                aiDescription,
                                generatedImageUrl,
                                selectedSize
                            );
                            closeDialog();
                        })
                        .catch(function (error) {
                            console.error("[AI生图] 生成图片失败:", error);
                            isGeneratingImage = false;
                            $aiPreviewPlaceholder
                                .show()
                                .text("生成图片失败，请重试");
                            if (window.toastr) {
                                toastr.error(
                                    "生成图片失败: " + (error.message || "未知错误"),
                                    "小馨手机"
                                );
                            } else {
                                alert("生成图片失败: " + (error.message || "未知错误"));
                            }
                        })
                        .finally(function () {
                            $completeBtn_ai.prop("disabled", false);
                            $completeBtn_ai.text(originalText_ai);
                        });
                } else {
                    isGeneratingImage = false;
                    if (window.toastr) {
                        toastr.error("AI生图模块未加载", "小馨手机");
                    } else {
                        alert("AI生图模块未加载");
                    }
                    $completeBtn_ai.prop("disabled", false);
                    $completeBtn_ai.text(originalText_ai);
                }
            }
        });

        // 显示弹窗动画
        setTimeout(function () {
            $photoDialog.addClass("show");
        }, 10);
    }

    // 发送照片消息
    function sendPhotoMessage(imageUrl, description) {
        // 获取必要的上下文变量（从 chat.js 中）
        var chatUserId =
            window.XiaoxinWeChatChatUI && window.XiaoxinWeChatChatUI.chatUserId
                ? window.XiaoxinWeChatChatUI.chatUserId
                : null;
        var contact =
            window.XiaoxinWeChatChatUI && window.XiaoxinWeChatChatUI.contact
                ? window.XiaoxinWeChatChatUI.contact
                : null;
        var generateMsgId =
            window.XiaoxinWeChatChatUI &&
            window.XiaoxinWeChatChatUI.generateMsgId
                ? window.XiaoxinWeChatChatUI.generateMsgId
                : function () {
                      return "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
                  };
        var formatTime =
            window.XiaoxinWeChatChatUI && window.XiaoxinWeChatChatUI.formatTime
                ? window.XiaoxinWeChatChatUI.formatTime
                : function (date) {
                      var hours = date.getHours().toString().padStart(2, "0");
                      var minutes = date.getMinutes().toString().padStart(2, "0");
                      return hours + ":" + minutes;
                  };
        var pendingMessages =
            window.XiaoxinWeChatChatUI &&
            window.XiaoxinWeChatChatUI.pendingMessages
                ? window.XiaoxinWeChatChatUI.pendingMessages
                : {};
        var refreshMessageList =
            window.XiaoxinWeChatChatUI &&
            window.XiaoxinWeChatChatUI.refreshMessageList
                ? window.XiaoxinWeChatChatUI.refreshMessageList
                : function () {};

        // 注意：pendingMessages 已经是 chatPendingMessages[chatUserId]，结构是 pendingMessages[msgId] = msgObj
        // 不需要再嵌套一层 chatUserId

        var msgId = generateMsgId();

        // 验证图片URL（只支持 http/https URL，不支持本地文件）
        if (imageUrl && typeof imageUrl === "string") {
            imageUrl = imageUrl.trim();
            // 如果不是有效的URL，清空
            if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
                console.warn(
                    "[小馨手机][照片消息] 图片URL无效，只支持 http/https URL:",
                    imageUrl.substring(0, 50)
                );
                imageUrl = "";
            }
        } else {
            imageUrl = "";
        }

        // ===== 时间逻辑 =====
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
                    ? window.XiaoxinWeChatDataHandler.getChatHistory(chatUserId)
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
                    "[小馨手机][照片消息] 获取世界观时间失败:",
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
                    window.XiaoxinWeChatDataHandler.getChatMessages(chatUserId) ||
                    [];
            }
        } catch (e) {
            console.warn("[小馨手机][照片消息] 获取聊天消息失败:", e);
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
        var account = window.XiaoxinWeChatAccount
            ? window.XiaoxinWeChatAccount.getCurrentAccount()
            : null;
        var fromId = account
            ? String(account.wechatId || account.id || "0").trim()
            : "0";
        var toId =
            contact && contact.id ? String(contact.id) : String(chatUserId);

        // 构建消息对象
        // 确保 image 字段始终有值（即使是空字符串），以便预览消息能正确显示
        var msgObj = {
            id: msgId,
            time: nowStr,
            from: String(fromId),
            to: String(toId),
            type: "photo",
            content: imageUrl || description || "",
            image: imageUrl || "", // 使用空字符串而不是 null，确保字段存在
            desc: description || "",
            timestamp: nowDate.getTime(),
            rawTime: nowStr,
        };

        console.info(
            "[小馨手机][照片消息] 创建消息对象:",
            "imageUrl:",
            imageUrl ? imageUrl.substring(0, 50) + "..." : "(空)",
            "msgObj.image:",
            msgObj.image ? String(msgObj.image).substring(0, 50) + "..." : "(空)",
            "msgObj.content:",
            msgObj.content ? String(msgObj.content).substring(0, 50) + "..." : "(空)"
        );

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
            "type=photo\n";

        // 只有在 imageUrl 存在时才添加到 [MSG] 命令中
        if (imageUrl) {
            packet += "image=" + imageUrl + "\n";
        }
        if (description) {
            packet += "desc=" + description + "\n";
        }
        packet += "[/MSG]";

        // 先加入预览（pendingMessages 已经是 chatPendingMessages[chatUserId]，直接使用 msgId 作为键）
        pendingMessages[msgId] = msgObj;
        refreshMessageList();

        // 推进世界观时钟
        try {
            if (window.XiaoxinWorldClock) {
                window.XiaoxinWorldClock.currentTimestamp = nowDate.getTime();
                window.XiaoxinWorldClock.timestamp = nowDate.getTime();
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
                "[小馨手机][照片消息] 发送照片到酒馆输入框失败:",
                err
            );
            if (pendingMessages) {
                delete pendingMessages[msgId];
            }
            refreshMessageList();
        }
    }

    // 发送AI生图消息
    function sendAIImageMessage(description, imageUrl, aspectRatio) {
        // 获取必要的上下文变量（从 chat.js 中）
        var chatUserId =
            window.XiaoxinWeChatChatUI && window.XiaoxinWeChatChatUI.chatUserId
                ? window.XiaoxinWeChatChatUI.chatUserId
                : null;
        var contact =
            window.XiaoxinWeChatChatUI && window.XiaoxinWeChatChatUI.contact
                ? window.XiaoxinWeChatChatUI.contact
                : null;
        var generateMsgId =
            window.XiaoxinWeChatChatUI &&
            window.XiaoxinWeChatChatUI.generateMsgId
                ? window.XiaoxinWeChatChatUI.generateMsgId
                : function () {
                      return "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
                  };
        var formatTime =
            window.XiaoxinWeChatChatUI && window.XiaoxinWeChatChatUI.formatTime
                ? window.XiaoxinWeChatChatUI.formatTime
                : function (date) {
                      var hours = date.getHours().toString().padStart(2, "0");
                      var minutes = date.getMinutes().toString().padStart(2, "0");
                      return hours + ":" + minutes;
                  };
        var pendingMessages =
            window.XiaoxinWeChatChatUI &&
            window.XiaoxinWeChatChatUI.pendingMessages
                ? window.XiaoxinWeChatChatUI.pendingMessages
                : {};
        var refreshMessageList =
            window.XiaoxinWeChatChatUI &&
            window.XiaoxinWeChatChatUI.refreshMessageList
                ? window.XiaoxinWeChatChatUI.refreshMessageList
                : function () {};

        var msgId = generateMsgId();

        // ===== 时间逻辑 =====
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
                    ? window.XiaoxinWeChatDataHandler.getChatHistory(chatUserId)
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
                    "[小馨手机][AI生图消息] 获取世界观时间失败:",
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
                    window.XiaoxinWeChatDataHandler.getChatMessages(chatUserId) ||
                    [];
            }
        } catch (e) {
            console.warn("[小馨手机][AI生图消息] 获取聊天消息失败:", e);
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
        var account = window.XiaoxinWeChatAccount
            ? window.XiaoxinWeChatAccount.getCurrentAccount()
            : null;
        var fromId = account
            ? String(account.wechatId || account.id || "0").trim()
            : "0";
        var toId =
            contact && contact.id ? String(contact.id) : String(chatUserId);

        // 构建消息对象（type=image）
        var msgObj = {
            id: msgId,
            time: nowStr,
            from: String(fromId),
            to: String(toId),
            type: "image", // 使用 type=image
            content: imageUrl || "", // 图片URL
            image: imageUrl || "", // 图片URL
            desc: description || "", // 图片描述（直接使用玩家输入的描述，不添加前缀）
            aspect_ratio: aspectRatio || "1:1", // 图片尺寸比例
            timestamp: nowDate.getTime(),
            rawTime: nowStr,
            _processed: true, // 标记为已处理，避免重复生图
        };

        console.info(
            "[小馨手机][AI生图消息] 创建消息对象:",
            "type:",
            msgObj.type,
            "imageUrl:",
            imageUrl ? imageUrl.substring(0, 50) + "..." : "(空)",
            "desc:",
            description ? description.substring(0, 50) + "..." : "(空)",
            "aspect_ratio:",
            aspectRatio
        );

        // 构建 [MSG] 数据块（type=image格式）
        // ⚠️ 重要：必须包含 image= 字段，否则消息监听器会认为这是需要生成的图片描述，导致重复生成
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
            "type=image\n";

        // ⚠️ 关键：必须包含 image= 字段，这样消息监听器才能识别这是已有图片URL的消息
        if (imageUrl) {
            packet += "image=" + imageUrl + "\n";
        }
        if (description) {
            packet += "desc=" + description + "\n";
        }
        if (aspectRatio) {
            packet += "aspect_ratio=" + aspectRatio + "\n";
        }
        packet += "[/MSG]";

        // 先加入预览（pendingMessages 已经是 chatPendingMessages[chatUserId]，直接使用 msgId 作为键）
        pendingMessages[msgId] = msgObj;
        refreshMessageList();

        // ⚠️ 重要：立即保存消息到持久化存储，确保刷新后不会重复生成
        try {
            if (
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.addChatMessage === "function"
            ) {
                window.XiaoxinWeChatDataHandler.addChatMessage(chatUserId, msgObj);
                console.info(
                    "[小馨手机][AI生图消息] 已立即保存消息到持久化存储:",
                    msgId,
                    "image:",
                    imageUrl ? imageUrl.substring(0, 50) + "..." : "(空)",
                    "_processed:",
                    msgObj._processed
                );
            }
        } catch (error) {
            console.warn(
                "[小馨手机][AI生图消息] 保存消息到持久化存储失败:",
                error
            );
        }

        // 推进世界观时钟
        try {
            if (window.XiaoxinWorldClock) {
                window.XiaoxinWorldClock.currentTimestamp = nowDate.getTime();
                window.XiaoxinWorldClock.timestamp = nowDate.getTime();
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
                "[小馨手机][AI生图消息] 发送消息到酒馆输入框失败:",
                err
            );
            if (pendingMessages) {
                delete pendingMessages[msgId];
            }
            refreshMessageList();
        }
    }

    return {
        showPhotoMessageDialog: showPhotoMessageDialog,
    };
})();

