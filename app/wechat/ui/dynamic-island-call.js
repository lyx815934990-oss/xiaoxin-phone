// 灵动岛通话状态显示模块
window.XiaoxinDynamicIslandCall = (function () {
    var $dynamicIsland = null;
    var $callAvatar = null;
    var $callContent = null;
    var $callWaves = null;
    var $callText = null;
    var $callTextContent = null;
    var isCallActive = false;
    var currentContact = null;
    var textDisplayTimer = null;
    var currentTextQueue = []; // 待显示的文本队列
    var isDisplayingText = false; // 是否正在显示文本

    // 初始化
    function init() {
        $dynamicIsland = $(".xiaoxin-dynamic-island");
        if ($dynamicIsland.length === 0) {
            console.warn("[小馨手机][灵动岛通话] 未找到灵动岛元素");
            // 尝试延迟查找
            setTimeout(function () {
                $dynamicIsland = $(".xiaoxin-dynamic-island");
                if ($dynamicIsland.length > 0) {
                    console.info(
                        "[小馨手机][灵动岛通话] 延迟查找成功，找到灵动岛元素"
                    );
                } else {
                    console.error(
                        "[小馨手机][灵动岛通话] 延迟查找失败，仍未找到灵动岛元素"
                    );
                }
            }, 1000);
            return;
        }
        console.info(
            "[小馨手机][灵动岛通话] 初始化完成，找到灵动岛元素:",
            $dynamicIsland.length
        );
    }

    // 显示通话状态（延长灵动岛，显示头像和声波）
    function showCallState(contact) {
        console.info("[小馨手机][灵动岛通话] showCallState 被调用", contact);

        // 确保初始化
        if (!$dynamicIsland || $dynamicIsland.length === 0) {
            console.info("[小馨手机][灵动岛通话] 灵动岛元素不存在，尝试初始化");
            init();
            // 如果初始化后仍然没有找到，尝试延迟查找
            if (!$dynamicIsland || $dynamicIsland.length === 0) {
                console.warn(
                    "[小馨手机][灵动岛通话] 初始化后仍未找到灵动岛元素，尝试延迟查找"
                );
                setTimeout(function () {
                    $dynamicIsland = $(".xiaoxin-dynamic-island");
                    if ($dynamicIsland.length > 0) {
                        console.info(
                            "[小馨手机][灵动岛通话] 延迟查找成功，继续显示通话状态"
                        );
                        showCallState(contact);
                    } else {
                        console.error(
                            "[小馨手机][灵动岛通话] 延迟查找失败，无法显示通话状态"
                        );
                        // 尝试查找所有可能的灵动岛选择器
                        var selectors = [
                            ".xiaoxin-dynamic-island",
                            "#xiaoxin-dynamic-island",
                            "[class*='dynamic-island']",
                            "[class*='DynamicIsland']",
                        ];
                        for (var i = 0; i < selectors.length; i++) {
                            var $test = $(selectors[i]);
                            if ($test.length > 0) {
                                console.info(
                                    "[小馨手机][灵动岛通话] 找到可能的灵动岛元素:",
                                    selectors[i],
                                    $test.length
                                );
                            }
                        }
                    }
                }, 200);
                return;
            }
        }

        if (!contact) {
            console.warn("[小馨手机][灵动岛通话] 联系人信息为空");
            return;
        }

        console.info("[小馨手机][灵动岛通话] 开始显示通话状态", {
            contactName: contact.name || contact.nickname || "未知",
            hasAvatar: !!contact.avatar,
            dynamicIslandLength: $dynamicIsland.length,
            dynamicIslandVisible: $dynamicIsland.is(":visible"),
            dynamicIslandWidth: $dynamicIsland.width(),
            dynamicIslandHeight: $dynamicIsland.height(),
        });

        currentContact = contact;
        isCallActive = true;

        // 添加通话状态类
        $dynamicIsland.addClass("call-active");
        console.info("[小馨手机][灵动岛通话] 已添加 call-active 类", {
            hasClass: $dynamicIsland.hasClass("call-active"),
            computedWidth: $dynamicIsland.css("width"),
            computedDisplay: $dynamicIsland.css("display"),
        });

        // 清空灵动岛内部可能存在的默认内容（如果有）
        var oldContent = $dynamicIsland.html();
        $dynamicIsland.empty();
        console.info(
            "[小馨手机][灵动岛通话] 已清空灵动岛内容",
            "旧内容:",
            oldContent
        );

        // 创建或更新头像
        var avatarUrl =
            contact.avatar ||
            "/scripts/extensions/third-party/小馨手机/image/头像/微信默认头像.jpg";
        $callAvatar = $(
            '<div class="xiaoxin-dynamic-island-call-avatar" style="background-image: url(' +
                avatarUrl +
                ')"></div>'
        );
        $dynamicIsland.append($callAvatar);
        console.info("[小馨手机][灵动岛通话] 已添加头像元素", {
            avatarElement: $callAvatar[0],
            avatarUrl: avatarUrl,
            parentElement: $dynamicIsland[0],
        });

        // 创建内容容器
        $callContent = $(
            '<div class="xiaoxin-dynamic-island-call-content"></div>'
        );
        $dynamicIsland.append($callContent);
        console.info("[小馨手机][灵动岛通话] 已添加内容容器", {
            contentElement: $callContent[0],
            parentElement: $dynamicIsland[0],
        });

        // 显示声波动画
        showWaves();

        // 强制检查DOM
        setTimeout(function () {
            var actualIsland = document.querySelector(
                ".xiaoxin-dynamic-island"
            );
            if (actualIsland) {
                console.info("[小馨手机][灵动岛通话] DOM检查", {
                    hasCallActiveClass:
                        actualIsland.classList.contains("call-active"),
                    innerHTML: actualIsland.innerHTML,
                    childrenCount: actualIsland.children.length,
                    computedWidth: window.getComputedStyle(actualIsland).width,
                    computedDisplay:
                        window.getComputedStyle(actualIsland).display,
                });
            }
        }, 200);

        console.info(
            "[小馨手机][灵动岛通话] 已添加元素到灵动岛",
            "头像元素:",
            $callAvatar.length,
            "内容容器:",
            $callContent.length,
            "灵动岛内容:",
            $dynamicIsland.html()
        );

        console.info(
            "[小馨手机][灵动岛通话] 已显示通话状态，联系人:",
            contact.name || contact.nickname
        );
    }

    // 隐藏通话状态（恢复灵动岛原始大小）
    function hideCallState() {
        console.info("[小馨手机][灵动岛通话] hideCallState 被调用");

        if (!$dynamicIsland || $dynamicIsland.length === 0) {
            console.warn("[小馨手机][灵动岛通话] 灵动岛元素不存在，无法隐藏");
            return;
        }

        isCallActive = false;
        currentContact = null;

        // 移除通话状态类
        $dynamicIsland.removeClass("call-active");
        console.info("[小馨手机][灵动岛通话] 已移除 call-active 类", {
            hasClass: $dynamicIsland.hasClass("call-active"),
            computedWidth: $dynamicIsland.css("width"),
            computedDisplay: $dynamicIsland.css("display"),
        });

        // 清空所有通话相关的内容
        $dynamicIsland.empty();
        console.info("[小馨手机][灵动岛通话] 已清空灵动岛内容");

        // 清理内容引用
        if ($callAvatar) {
            $callAvatar.remove();
            $callAvatar = null;
        }
        if ($callContent) {
            $callContent.remove();
            $callContent = null;
        }
        if ($callWaves) {
            $callWaves.remove();
            $callWaves = null;
        }
        if ($callText) {
            $callText.remove();
            $callText = null;
        }
        if ($callTextContent) {
            $callTextContent = null;
        }

        // 清理定时器
        if (textDisplayTimer) {
            clearTimeout(textDisplayTimer);
            textDisplayTimer = null;
        }

        currentTextQueue = [];
        isDisplayingText = false;

        console.info(
            "[小馨手机][灵动岛通话] 已隐藏通话状态，灵动岛应恢复默认状态"
        );
    }

    // 显示声波动画
    function showWaves() {
        if (!$callContent || $callContent.length === 0) {
            console.warn("[小馨手机][灵动岛通话] 内容容器不存在，无法显示声波");
            return;
        }

        // 隐藏文本显示
        if ($callText && $callText.length > 0) {
            $callText.removeClass("show").addClass("hide");
        }

        // 移除旧的声波动画（如果存在）
        if ($callWaves && $callWaves.length > 0) {
            $callWaves.remove();
        }

        // 创建新的声波动画
        $callWaves = $(
            '<div class="xiaoxin-dynamic-island-call-waves">' +
                '<div class="xiaoxin-dynamic-island-wave-bar"></div>' +
                '<div class="xiaoxin-dynamic-island-wave-bar"></div>' +
                '<div class="xiaoxin-dynamic-island-wave-bar"></div>' +
                '<div class="xiaoxin-dynamic-island-wave-bar"></div>' +
                '<div class="xiaoxin-dynamic-island-wave-bar"></div>' +
                "</div>"
        );
        $callContent.append($callWaves);

        console.info(
            "[小馨手机][灵动岛通话] 已显示声波动画",
            "声波元素:",
            $callWaves.length,
            "内容容器HTML:",
            $callContent.html()
        );
    }

    // 显示文本（打字机效果）
    function showText(text) {
        console.info("[小馨手机][灵动岛通话] showText 被调用", {
            text: text ? text.substring(0, 50) + "..." : "空",
            isCallActive: isCallActive,
            hasCallContent: !!($callContent && $callContent.length > 0),
        });

        if (!isCallActive || !$callContent || $callContent.length === 0) {
            console.warn(
                "[小馨手机][灵动岛通话] 无法显示文本：通话未激活或内容容器不存在"
            );
            return;
        }

        // 如果文本为空，显示声波
        if (!text || !text.trim()) {
            showWaves();
            return;
        }

        // 将文本添加到队列
        currentTextQueue.push(text.trim());
        console.info("[小馨手机][灵动岛通话] 文本已添加到队列", {
            queueLength: currentTextQueue.length,
            isDisplayingText: isDisplayingText,
        });

        // 如果正在显示文本，等待当前文本显示完成
        if (isDisplayingText) {
            console.info(
                "[小馨手机][灵动岛通话] 正在显示文本，等待当前文本完成"
            );
            return;
        }

        // 开始显示队列中的文本
        processTextQueue();
    }

    // 处理文本队列
    function processTextQueue() {
        console.info("[小馨手机][灵动岛通话] processTextQueue 被调用", {
            queueLength: currentTextQueue.length,
            isDisplayingText: isDisplayingText,
        });

        if (currentTextQueue.length === 0) {
            isDisplayingText = false;
            console.info(
                "[小馨手机][灵动岛通话] 文本队列为空，保持当前文本显示（不恢复声波）"
            );
            // 文本持久显示，不自动恢复声波
            // 只有当新文本到来时才会替换当前文本
            return;
        }

        isDisplayingText = true;
        var text = currentTextQueue.shift();

        // 隐藏声波
        if ($callWaves) {
            $callWaves.hide();
        }

        // 创建或显示文本容器
        if (!$callText || $callText.length === 0) {
            $callText = $(
                '<div class="xiaoxin-dynamic-island-call-text"></div>'
            );
            $callTextContent = $(
                '<div class="xiaoxin-dynamic-island-call-text-content"></div>'
            );
            $callText.append($callTextContent);
            $callContent.append($callText);
        }

        $callText.removeClass("hide").addClass("show");
        // 清空当前文本，准备显示新文本
        $callTextContent.empty();
        // 移除可能存在的光标
        $callTextContent
            .find(".xiaoxin-dynamic-island-call-text-cursor")
            .remove();

        // 打字机效果
        var currentIndex = 0;
        var typingSpeed = 100; // 每个字符的显示速度（毫秒），减慢速度

        function typeNextChar() {
            if (currentIndex < text.length) {
                // 使用 text() 而不是 append()，避免HTML转义问题
                var currentText = text.substring(0, currentIndex + 1);
                $callTextContent.text(currentText);

                // 实时更新滚动位置（跟随打字机效果，不来回滚动）
                updateScrollPosition();

                currentIndex++;
                textDisplayTimer = setTimeout(typeNextChar, typingSpeed);
            } else {
                // 打字完成，固定滚动位置到最后一个字
                fixScrollPosition();

                // 添加光标（使用 append，因为光标是HTML元素）
                var $cursor = $(
                    '<span class="xiaoxin-dynamic-island-call-text-cursor"></span>'
                );
                $callTextContent.append($cursor);

                // 文本持久显示，不自动恢复声波
                // 只有当新文本到来时才会替换当前文本
                isDisplayingText = false; // 标记为完成，允许处理下一段文本

                // 继续处理队列中的下一段文本（如果有）
                setTimeout(function () {
                    processTextQueue();
                }, 100); // 短暂延迟后继续处理队列
            }
        }

        typeNextChar();
    }

    // 更新滚动位置（实时跟随打字机效果，不来回滚动）
    var scrollUpdateRafId = null;
    function updateScrollPosition() {
        if (!$callTextContent || !$callContent) {
            return;
        }

        // 使用 requestAnimationFrame 确保在下一帧更新
        if (scrollUpdateRafId) {
            cancelAnimationFrame(scrollUpdateRafId);
        }

        scrollUpdateRafId = requestAnimationFrame(function () {
            if (!$callTextContent || !$callContent) {
                return;
            }

            // 检查文本是否超出容器宽度
            var contentWidth = $callContent.width();
            var textElement = $callTextContent[0];
            if (!textElement) {
                return;
            }

            var textWidth = textElement.scrollWidth;

            if (textWidth > contentWidth) {
                // 文本超出，实时滑动到最后一个字符的位置
                // 计算需要滚动的距离（文本宽度 - 容器宽度 + 额外空间，确保最后一个字完整显示）
                var scrollDistance = textWidth - contentWidth + 8; // 增加8px额外空间，确保最后一个字完整显示
                // 实时更新 transform，让文本跟随打字机效果滑动
                $callTextContent.css({
                    transform: "translateX(-" + scrollDistance + "px)",
                    transition: "transform 0.1s linear", // 平滑过渡
                });
            } else {
                // 文本未超出，不需要滚动
                $callTextContent.css({
                    transform: "translateX(0)",
                    transition: "none",
                });
            }
        });
    }

    // 固定滚动位置（文字显示完成后，固定到最后一个字的位置）
    function fixScrollPosition() {
        if (!$callTextContent || !$callContent) {
            return;
        }

        // 使用 requestAnimationFrame 确保在下一帧更新
        requestAnimationFrame(function () {
            if (!$callTextContent || !$callContent) {
                return;
            }

            // 检查文本是否超出容器宽度
            var contentWidth = $callContent.width();
            var textElement = $callTextContent[0];
            if (!textElement) {
                return;
            }

            var textWidth = textElement.scrollWidth;

            if (textWidth > contentWidth) {
                // 文本超出，固定到最后一个字符的位置
                // 增加额外空间，确保最后一个字完整显示
                var scrollDistance = textWidth - contentWidth + 8; // 增加8px额外空间，确保最后一个字完整显示
                // 固定位置，移除过渡效果
                $callTextContent.css({
                    transform: "translateX(-" + scrollDistance + "px)",
                    transition: "none", // 移除过渡，立即固定
                });
            } else {
                // 文本未超出，不需要滚动
                $callTextContent.css({
                    transform: "translateX(0)",
                    transition: "none",
                });
            }
        });
    }

    // 监听通话状态变化
    function setupCallStateListener() {
        // 监听通话开始
        window.addEventListener("xiaoxin-call-started", function (event) {
            var detail = (event && event.detail) || {};
            var contact = detail.contact || null;
            if (contact) {
                showCallState(contact);
            }
        });

        // 监听通话结束
        window.addEventListener("xiaoxin-call-ended", function (event) {
            hideCallState();
        });

        // 监听语音文本消息
        window.addEventListener("xiaoxin-call-voice-text", function (event) {
            var detail = (event && event.detail) || {};
            var text = detail.text || "";
            var isInCallPage = detail.isInCallPage || false;

            // 只有在不在通话页面时才在灵动岛显示
            if (!isInCallPage && text) {
                showText(text);
            }
        });
    }

    // 初始化监听器
    setupCallStateListener();

    // 在页面加载时初始化
    $(function () {
        init();
    });

    return {
        showCallState: showCallState,
        hideCallState: hideCallState,
        showText: showText,
        init: init,
    };
})();
