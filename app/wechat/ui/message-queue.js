// 消息显示队列管理器 - 独立运行，不受页面状态影响
window.XiaoxinMessageQueue = (function () {
    // ========== 队列存储 ==========
    // 按联系人ID存储消息队列
    var messageQueues = {}; // { contactId: { messages: [], currentIndex: 0, timer: null, isProcessing: false } }

    // ========== 已显示消息跟踪 ==========
    // 按联系人ID存储已显示的消息ID集合（用于控制UI显示）
    var displayedMessages = {}; // { contactId: Set<messageId> }

    // ========== 计算消息显示延迟 ==========
    // 规则：5字2秒，10字2.5秒，15字3秒，以此类推，最多15秒
    function calculateDelay(content) {
        if (!content || typeof content !== "string") {
            return 2000; // 默认2秒
        }

        var charCount = content.length;
        var baseDelay = 2000; // 5字基础延迟2秒
        var delay = baseDelay;

        if (charCount <= 5) {
            delay = 2000; // 5字及以下：2秒
        } else if (charCount <= 10) {
            delay = 2500; // 6-10字：2.5秒
        } else if (charCount <= 15) {
            delay = 3000; // 11-15字：3秒
        } else {
            // 超过15字：每5字增加0.5秒，最多15秒
            var extraChars = charCount - 15;
            var extraDelay = Math.floor(extraChars / 5) * 500; // 每5字增加0.5秒
            delay = 3000 + extraDelay;
            delay = Math.min(delay, 15000); // 最多15秒
        }

        console.info(
            "[小馨手机][消息队列] 计算延迟:",
            "字数:",
            charCount,
            "延迟:",
            delay + "ms"
        );
        return delay;
    }

    // ========== 处理单个联系人的消息队列 ==========
    function processQueue(contactId) {
        var queue = messageQueues[contactId];
        if (!queue || !queue.messages || queue.messages.length === 0) {
            // 队列为空，清理
            if (queue) {
                queue.isProcessing = false;
                queue.currentIndex = 0;
            }
            return;
        }

        // 如果正在处理，不重复处理
        if (queue.isProcessing) {
            return;
        }

        queue.isProcessing = true;

        // 处理下一条消息
        function processNext() {
            if (queue.currentIndex >= queue.messages.length) {
                // 队列处理完成
                queue.isProcessing = false;
                queue.currentIndex = 0;
                queue.messages = [];

                // 触发队列完成事件
                var completedEvent = new CustomEvent(
                    "xiaoxin-message-queue-completed",
                    {
                        detail: {
                            contactId: contactId,
                        },
                    }
                );
                window.dispatchEvent(completedEvent);

                console.info("[小馨手机][消息队列] 队列处理完成:", contactId);
                return;
            }

            var message = queue.messages[queue.currentIndex];
            if (!message) {
                queue.currentIndex++;
                processNext();
                return;
            }

            // 触发"正在输入中..."事件（在显示消息前）
            var typingEvent = new CustomEvent("xiaoxin-message-typing", {
                detail: {
                    contactId: contactId,
                    message: message,
                },
            });
            window.dispatchEvent(typingEvent);

            console.info(
                "[小馨手机][消息队列] 开始显示消息:",
                contactId,
                "消息ID:",
                message.id,
                "内容:",
                message.content ? message.content.substring(0, 20) + "..." : ""
            );

            // 计算延迟时间
            var delay = message.delay || calculateDelay(message.content || "");

            // 延迟后显示消息
            queue.timer = setTimeout(function () {
                // 标记消息为已显示
                if (!displayedMessages[contactId]) {
                    displayedMessages[contactId] = new Set();
                }
                displayedMessages[contactId].add(message.id);

                // 如果是角色发送的消息，在显示完成时增加未读数
                // 这样可以确保未读数与消息显示状态同步
                if (
                    window.XiaoxinWeChatDataHandler &&
                    message.isOutgoing === false
                ) {
                    // 检查玩家是否在聊天页面
                    var isInChatPage = false;
                    if (
                        window.XiaoxinWeChatComponents &&
                        window.XiaoxinWeChatComponents.isActiveChat
                    ) {
                        isInChatPage =
                            window.XiaoxinWeChatComponents.isActiveChat(
                                contactId
                            );
                    }

                    // 如果玩家不在聊天页面，增加未读数
                    if (!isInChatPage) {
                            if (
                                typeof window.XiaoxinWeChatDataHandler
                                    .incrementUnreadCount === "function"
                            ) {
                                window.XiaoxinWeChatDataHandler.incrementUnreadCount(
                                    contactId
                                );
                                // 高频日志会导致长聊卡顿，这里删除详细 console 输出
                            }
                        } else {
                            // 如果玩家在聊天页面，不增加未读数（因为会立即清除）
                            // 不再输出详细日志，避免刷屏
                        }
                }

                // 触发消息显示事件
                var displayEvent = new CustomEvent(
                    "xiaoxin-message-displayed",
                    {
                        detail: {
                            contactId: contactId,
                            message: message,
                        },
                    }
                );
                window.dispatchEvent(displayEvent);

                // 高频“消息显示完成”日志删除，避免在大量消息时刷屏卡顿

                // 处理下一条消息
                queue.currentIndex++;
                processNext();
            }, delay);
        }

        // 开始处理
        processNext();
    }

    // ========== 添加消息到队列 ==========
    function addMessageToQueue(contactId, message) {
        if (!contactId || !message) {
            console.warn("[小馨手机][消息队列] 添加消息失败：缺少必要参数");
            return false;
        }

        // 检查是否是历史消息，历史消息不应该进入队列
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
                    "[小馨手机][消息队列] 根据时间戳判断为历史消息（早于当前时间" + Math.round(timeDiff / 60000) + "分钟），跳过:",
                    contactId,
                    "消息ID:",
                    message.id,
                    "消息时间:",
                    new Date(messageTime).toLocaleString("zh-CN"),
                    "当前世界观时间:",
                    new Date(currentWorldTime).toLocaleString("zh-CN")
                );
            }
        }

        if (isHistorical) {
            console.info(
                "[小馨手机][消息队列] 历史消息不应该进入队列，跳过:",
                contactId,
                "消息ID:",
                message.id,
                "isHistorical:",
                message.isHistorical
            );
            return false; // 历史消息不进入队列
        }

        // 初始化队列
        if (!messageQueues[contactId]) {
            messageQueues[contactId] = {
                messages: [],
                currentIndex: 0,
                timer: null,
                isProcessing: false,
            };
        }

        var queue = messageQueues[contactId];

        // 检查消息是否已存在（避免重复）
        var exists = queue.messages.some(function (msg) {
            return msg.id === message.id;
        });

        if (exists) {
            console.info(
                "[小馨手机][消息队列] 消息已存在，跳过:",
                contactId,
                message.id
            );
            return false;
        }

        // 计算延迟时间
        var delay = calculateDelay(message.content || "");

        // 添加消息到队列
        var queueMessage = {
            id: message.id,
            type: message.type || "text",
            content: message.content || "",
            timestamp: message.timestamp || Date.now(),
            rawTime: message.rawTime || "",
            sender: message.sender || "",
            isOutgoing: message.isOutgoing || false, // 保存消息方向，用于判断是否增加未读数
            delay: delay,
        };

        // 对于语音消息，需要保留时长字段
        if (message.type === "voice") {
            // 兼容不同来源的时长字段
            queueMessage.duration_sec =
                message.duration_sec ||
                message.duration ||
                (message.payload && message.payload.duration_sec) ||
                (message.payload && message.payload.duration);
            queueMessage.duration = queueMessage.duration_sec; // 兼容字段
            // 保留 payload 字段（如果存在）
            if (message.payload) {
                queueMessage.payload = message.payload;
            }
        }

        queue.messages.push(queueMessage);

        console.info(
            "[小馨手机][消息队列] 添加消息到队列:",
            contactId,
            "消息ID:",
            message.id,
            "队列长度:",
            queue.messages.length
        );

        // 如果队列未在处理，开始处理
        if (!queue.isProcessing) {
            // 触发队列开始事件
            var startedEvent = new CustomEvent(
                "xiaoxin-message-queue-started",
                {
                    detail: {
                        contactId: contactId,
                        messageCount: queue.messages.length,
                    },
                }
            );
            window.dispatchEvent(startedEvent);

            processQueue(contactId);
        }

        return true;
    }

    // ========== 添加多条消息到队列 ==========
    function addMessagesToQueue(contactId, messages) {
        if (!contactId || !messages || !Array.isArray(messages)) {
            console.warn("[小馨手机][消息队列] 添加消息失败：缺少必要参数");
            return false;
        }

        var addedCount = 0;
        messages.forEach(function (message) {
            if (addMessageToQueue(contactId, message)) {
                addedCount++;
            }
        });

        console.info(
            "[小馨手机][消息队列] 批量添加消息:",
            contactId,
            "成功:",
            addedCount,
            "总数:",
            messages.length
        );

        return addedCount > 0;
    }

    // ========== 清除队列 ==========
    function clearQueue(contactId) {
        if (!contactId) {
            return;
        }

        var queue = messageQueues[contactId];
        if (queue) {
            // 清除定时器
            if (queue.timer) {
                clearTimeout(queue.timer);
                queue.timer = null;
            }

            // 重置队列
            queue.messages = [];
            queue.currentIndex = 0;
            queue.isProcessing = false;

            console.info("[小馨手机][消息队列] 清除队列:", contactId);
        }
    }

    // ========== 获取队列状态 ==========
    function getQueueStatus(contactId) {
        if (!contactId) {
            return null;
        }

        var queue = messageQueues[contactId];
        if (!queue) {
            return {
                contactId: contactId,
                messageCount: 0,
                currentIndex: 0,
                isProcessing: false,
            };
        }

        return {
            contactId: contactId,
            messageCount: queue.messages.length,
            currentIndex: queue.currentIndex,
            isProcessing: queue.isProcessing,
            remainingCount: queue.messages.length - queue.currentIndex,
        };
    }

    // ========== 检查消息是否已显示 ==========
    function isMessageDisplayed(contactId, messageId) {
        if (!contactId || !messageId) {
            return false;
        }

        var displayedSet = displayedMessages[contactId];
        if (!displayedSet) {
            return false;
        }

        return displayedSet.has(messageId);
    }

    // ========== 获取已显示的消息ID集合 ==========
    function getDisplayedMessageIds(contactId) {
        if (!contactId) {
            return new Set();
        }

        var displayedSet = displayedMessages[contactId];
        if (!displayedSet) {
            return new Set();
        }

        // 返回一个新的Set，避免外部修改
        return new Set(displayedSet);
    }

    // ========== 检查消息是否在队列中 ==========
    function isMessageInQueue(contactId, messageId) {
        if (!contactId || !messageId) {
            return false;
        }

        var queue = messageQueues[contactId];
        if (!queue || !queue.messages || queue.messages.length === 0) {
            return false;
        }

        // 检查消息是否在队列中
        var exists = queue.messages.some(function (msg) {
            return msg.id === messageId;
        });

        return exists;
    }

    // ========== 初始化 ==========
    function init() {
        console.info("[小馨手机][消息队列] 消息队列管理器初始化完成");

        // 监听页面卸载，清理所有队列
        $(window).on("pagehide", function () {
            // 注意：不清除队列，让消息继续显示
            // 只在页面卸载时清理定时器，避免内存泄漏
            Object.keys(messageQueues).forEach(function (contactId) {
                var queue = messageQueues[contactId];
                if (queue && queue.timer) {
                    // 不清除队列，只清理定时器引用
                    // 定时器会继续执行，因为它是独立的
                }
            });
        });
    }

    // 自动初始化
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            init();
        });
    } else {
        init();
    }

    return {
        // 添加消息到队列
        addMessage: addMessageToQueue,
        addMessages: addMessagesToQueue,
        // 清除队列
        clearQueue: clearQueue,
        // 获取队列状态
        getQueueStatus: getQueueStatus,
        // 检查消息是否已显示
        isMessageDisplayed: isMessageDisplayed,
        // 获取已显示的消息ID集合
        getDisplayedMessageIds: getDisplayedMessageIds,
        // 检查消息是否在队列中
        isMessageInQueue: isMessageInQueue,
        // 计算延迟
        calculateDelay: calculateDelay,
    };
})();
