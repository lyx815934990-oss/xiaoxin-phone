// 小馨手机 - 自动指令生成模块
// 监听 SillyTavern 聊天楼层变化，调用酒馆助手 generate 接口生成手机指令文本，
// 再作为隐藏 AI 楼层写回，由现有 message-listener.js 解析并显示到手机上。

(function () {
    "use strict";

    const LOG_PREFIX = "[小馨手机][自动指令]";

    // 节奏与概率配置（可调）
    const COOL_DOWN_FLOORS = 4; // 至少隔这么多楼才再触发一次
    const BASE_PROBABILITY = 0.35; // 日常触发概率
    const STRONG_EMOTION_BONUS = 0.25; // 情绪词命中时的附加概率

    let lastTriggeredMessageId = -1;
    let lastTriggeredAt = 0;

    // 额外抑制：同一时间窗口内不反复生成（避免短时间连发）
    const COOL_DOWN_MS = 30 * 1000; // 30 秒

    // 严格模式：只允许这些标签（更稳定）；关闭则允许任意成对标签（更兼容）
    const DEFAULT_STRICT_MODE = false;
    const STRICT_MODE_KEY = "xiaoxin_auto_gen_strict_mode";
    const ALLOWED_TAGS = new Set([
        // 微信/通用
        "msg",
        "wx_contact",
        "wx_friend_request",
        "wx_friend_apply_response",
        "wx_redpacket_receive",
        // 朋友圈
        "moments",
        "moment",
        "moments-interactions",
        "like",
        "comment",
        "reply",
        // 历史生成/时间锚点（玩家历史朋友圈规则要求输出结尾 [time]）
        "time",
        // 历史触发器（输入侧可能出现；输出侧一般不需要，但严格模式下允许以防模型包进来）
        "playerhistorymoments",
        "char_historymoments",
        "historychat",
    ]);

    const LAST_TRIGGER_KEY = "xiaoxin_auto_gen_last_trigger_sig"; // 实际存储会按 chatId 分桶
    const LAST_PLAYER_PHONE_REQ_KEY = "xiaoxin_auto_gen_last_player_phone_req_sig"; // 实际存储会按 chatId 分桶
    const LAST_ONLINE_PAYLOAD_HASH_KEY = "xiaoxin_auto_gen_last_online_payload_hash"; // 按 chatId 分桶的最近一次线上动作指令 hash

    // 当检测到“历史生成类指令”时，尽量在酒馆开始生成前/生成后立刻中断，减少浪费
    let pendingStopGenerationUntil = 0;
    let stopAttemptedInWindow = false;
    function requestStopGenerationWindow(ms) {
        pendingStopGenerationUntil = Date.now() + (ms || 8000);
        stopAttemptedInWindow = false;
    }
    function tryStopGenerationNow() {
        if (Date.now() > pendingStopGenerationUntil) return false;
        if (stopAttemptedInWindow) return false; // 防止事件风暴反复 stop
        stopAttemptedInWindow = true;
        try {
            const ctx = getStContext();
            if (ctx && typeof ctx.stopGeneration === "function") {
                ctx.stopGeneration();
                return true;
            }
        } catch (e) { /* ignore */ }
        try {
            if (window.SillyTavern && typeof window.SillyTavern.stopGeneration === "function") {
                window.SillyTavern.stopGeneration();
                return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    // 防止并发重复生成（事件+轮询同时触发时）
    let autoGenRunning = false;
    async function runAutoGenOnce(reason, force) {
        if (autoGenRunning) {
            return Promise.resolve(); // 确保返回 Promise
        }
        autoGenRunning = true;
        try {
            // force=true 会让 tryAutoGenerate 优先走各类触发器分支并绕过概率/冷却
            await tryAutoGenerate(!!force);
        } catch (e) {
            logWarn("自动生成异常(" + reason + "):", e);
        } finally {
            autoGenRunning = false;
        }
    }

    function isStrictMode() {
        try {
            const v = localStorage.getItem(STRICT_MODE_KEY);
            if (v === null || v === undefined) return DEFAULT_STRICT_MODE;
            return v === "true";
        } catch (e) {
            return DEFAULT_STRICT_MODE;
        }
    }

    function logInfo() {
        console.info.apply(console, [LOG_PREFIX].concat(Array.prototype.slice.call(arguments)));
    }
    function logWarn() {
        console.warn.apply(console, [LOG_PREFIX].concat(Array.prototype.slice.call(arguments)));
    }

    // 轻量去缩进
    function dedent(text) {
        const raw = String(text || "");
        const lines = raw.replace(/^\n+|\n+$/g, "").split("\n");
        const indents = lines
            .filter(function (l) { return l.trim().length > 0; })
            .map(function (l) {
                var m = l.match(/^(\s*)/);
                return m && m[1] ? m[1].length : 0;
            });
        const minIndent = indents.length ? Math.min.apply(Math, indents) : 0;
        return lines
            .map(function (l) { return l.slice(minIndent); })
            .join("\n")
            .trim();
    }

    // ========= 获取最新一楼 AI 楼层 =========
    function getLatestAssistantMessage() {
        try {
            // 优先使用 SillyTavern.getContext()
            if (window.SillyTavern && typeof window.SillyTavern.getContext === "function") {
                const ctx = window.SillyTavern.getContext();
                if (ctx && Array.isArray(ctx.chat) && ctx.chat.length > 0) {
                    const messages = ctx.chat;
                    const last = messages[messages.length - 1];
                    if (!last) return null;
                    const role = String(last.role || "");
                    // 新聊天加载时经常会出现 system 楼层；不把它当作“正文剧情”触发线上动作
                    if (role === "system") return null;
                    const isUser = last.is_user;
                    if (isUser === false || role === "assistant" || role === "system") {
                        return {
                            id: typeof last.mesId === "number" ? last.mesId : messages.length - 1,
                            text: String(last.mes || last.message || last.content || "").trim()
                        };
                    }
                    return null;
                }
            }

            // 退化使用全局 chat（旧接口）
            if (Array.isArray(window.chat) && window.chat.length > 0) {
                const messages = window.chat;
                const last = messages[messages.length - 1];
                if (!last) return null;
                const role = String(last.role || "");
                if (role === "system") return null;
                const isUser = last.is_user;
                if (isUser === false || role === "assistant" || role === "system") {
                    return {
                        id: messages.length - 1,
                        text: String(last.mes || last.message || last.content || "").trim()
                    };
                }
            }
        } catch (e) {
            logWarn("获取最新 AI 楼层失败:", e);
        }
        return null;
    }

    // ========= 主动发送线上消息配置（由设置页写入） =========
    const AUTO_ONLINE_CONFIG_KEY = "xiaoxin_auto_online_config";
    const AUTO_ONLINE_LAST_ROUND_KEY_PREFIX = "xiaoxin_auto_online_last_round_";

    function safeParseJson(str) {
        try { return JSON.parse(str); } catch (e) { return null; }
    }

    function getCurrentChatIdSafe() {
        try {
            if (typeof getCurrentChatId === "function") return String(getCurrentChatId() || "");
        } catch (e) { /* ignore */ }
        try {
            if (window.SillyTavern && typeof window.SillyTavern.getCurrentChatId === "function") {
                return String(window.SillyTavern.getCurrentChatId() || "");
            }
        } catch (e2) { /* ignore */ }
        return "";
    }

        function loadAutoOnlineConfig() {
            const defaults = {
                enabled: false,
                thresholdRounds: 6,
                contextLookbackFloors: 24,
                actionRatios: {
                    privateMessage: 50,
                    momentsPost: 30,
                    momentsInteraction: 20,
                },
            };
            let cfg = null;
            try {
                if (typeof getVariables === "function") {
                    const gd = getVariables({ type: "global" }) || {};
                    if (gd && gd[AUTO_ONLINE_CONFIG_KEY]) cfg = gd[AUTO_ONLINE_CONFIG_KEY];
                }
            } catch (e) { /* ignore */ }
            if (!cfg) {
                try {
                    const raw = localStorage.getItem(AUTO_ONLINE_CONFIG_KEY);
                    if (raw) cfg = safeParseJson(raw);
                } catch (e2) { /* ignore */ }
            }
            cfg = (cfg && typeof cfg === "object") ? cfg : {};
            const threshold = parseInt(cfg.thresholdRounds, 10);
            const lookback = parseInt(cfg.contextLookbackFloors, 10);

            // 加载动作比例配置（兼容旧配置）
            const actionRatios = cfg.actionRatios || {};
            let privateMsgRatio = Number.isFinite(Number(actionRatios.privateMessage)) && Number(actionRatios.privateMessage) >= 0
                ? Number(actionRatios.privateMessage)
                : defaults.actionRatios.privateMessage;
            let momentsPostRatio = Number.isFinite(Number(actionRatios.momentsPost)) && Number(actionRatios.momentsPost) >= 0
                ? Number(actionRatios.momentsPost)
                : defaults.actionRatios.momentsPost;
            let momentsInteractionRatio = Number.isFinite(Number(actionRatios.momentsInteraction)) && Number(actionRatios.momentsInteraction) >= 0
                ? Number(actionRatios.momentsInteraction)
                : defaults.actionRatios.momentsInteraction;

            // 归一化比例（确保总和为100）
            const total = privateMsgRatio + momentsPostRatio + momentsInteractionRatio;
            if (total > 0) {
                privateMsgRatio = Math.round((privateMsgRatio / total) * 100);
                momentsPostRatio = Math.round((momentsPostRatio / total) * 100);
                momentsInteractionRatio = 100 - privateMsgRatio - momentsPostRatio; // 确保总和为100
            } else {
                // 如果都是0或无效，使用默认值
                privateMsgRatio = defaults.actionRatios.privateMessage;
                momentsPostRatio = defaults.actionRatios.momentsPost;
                momentsInteractionRatio = defaults.actionRatios.momentsInteraction;
            }

            return {
                enabled: !!cfg.enabled,
                thresholdRounds: Number.isFinite(threshold) && threshold > 0 ? threshold : defaults.thresholdRounds,
                contextLookbackFloors: Number.isFinite(lookback) && lookback > 0 ? lookback : defaults.contextLookbackFloors,
                actionRatios: {
                    privateMessage: privateMsgRatio,
                    momentsPost: momentsPostRatio,
                    momentsInteraction: momentsInteractionRatio,
                },
            };
        }

    // ========= 世界观时间 & [time] 标签工具 =========
    function getWorldTimestampFallback() {
        try {
            if (
                window.XiaoxinWorldClock &&
                typeof window.XiaoxinWorldClock.currentTimestamp === "number" &&
                window.XiaoxinWorldClock.currentTimestamp > 0
            ) {
                return window.XiaoxinWorldClock.currentTimestamp;
            }
        } catch (e) { /* ignore */ }
        return Date.now();
    }

    function updateWorldClockIfNeeded(ts, rawStr) {
        try {
            if (!ts || !isFinite(ts)) return;
            if (!window.XiaoxinWorldClock) window.XiaoxinWorldClock = {};
            var cur = window.XiaoxinWorldClock.currentTimestamp || 0;
            if (!cur || ts > cur) {
                window.XiaoxinWorldClock.currentTimestamp = ts;
                window.XiaoxinWorldClock.timestamp = ts;
                if (rawStr) {
                    window.XiaoxinWorldClock.rawTime = rawStr;
                    window.XiaoxinWorldClock.raw = rawStr;
                }
                window.dispatchEvent &&
                    window.dispatchEvent(
                        new CustomEvent("xiaoxin-world-time-changed", {
                            detail: { timestamp: ts, rawTime: rawStr || "" },
                        })
                    );
            }
        } catch (e) { /* ignore */ }
    }

    function formatWorldTimeString(ts) {
        var t = ts;
        if (!t || !isFinite(t)) t = Date.now();
        var d = new Date(t);
        var year = d.getFullYear();
        var month = String(d.getMonth() + 1).padStart(2, "0");
        var day = String(d.getDate()).padStart(2, "0");
        var hours = String(d.getHours()).padStart(2, "0");
        var minutes = String(d.getMinutes()).padStart(2, "0");
        var seconds = String(d.getSeconds()).padStart(2, "0");
        var weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
        var weekday = weekdays[d.getDay()];
        return (
            year +
            "年" +
            month +
            "月" +
            day +
            "日" +
            weekday +
            " " +
            hours +
            ":" +
            minutes +
            ":" +
            seconds
        );
    }

    // 确保自动“线上动作”生成结果末尾有一个世界观时间标签 [time]...[/time]
    // 且该时间不早于所有 [MSG] time 字段
    function ensureTrailingTimeTagForOnline(payload) {
        var p = String(payload || "").trim();
        if (!p) return p;

        // 1. 找出所有 MSG 的最大时间戳
        var msgRe = /\[\s*MSG\b[^\]]*\]([\s\S]*?)\[\s*\/\s*MSG\s*\]/gi;
        var msgMatch;
        var maxMsgTs = 0;
        while ((msgMatch = msgRe.exec(p)) !== null) {
            var body = msgMatch[1] || "";
            var timeLineMatch = /time\s*=\s*([^\n\r]+)/i.exec(body);
            if (timeLineMatch && timeLineMatch[1]) {
                var timeStr = String(timeLineMatch[1]).trim();
                var norm = timeStr
                    .replace(/-/g, "/")
                    .replace(/年/g, "/")
                    .replace(/月/g, "/")
                    .replace(/日/g, " ")
                    .replace(/星期[一二三四五六日]/g, "")
                    .trim()
                    .replace(/\s+/g, " ");
                var ts = Date.parse(norm);
                if (!isNaN(ts) && ts > maxMsgTs) {
                    maxMsgTs = ts;
                }
            }
        }

        // 2. 目标时间：不早于 MSG 最大时间，也不早于当前世界观时间
        var baseTs = getWorldTimestampFallback();
        var targetTs = Math.max(baseTs, maxMsgTs || 0);
        if (!targetTs || !isFinite(targetTs)) {
            targetTs = Date.now();
        }
        var targetStr = formatWorldTimeString(targetTs);

        // 3. 已有 [time]：若早于 MSG 最大时间则更新为更晚时间
        var timeRe = /\[time\]([\s\S]*?)\[\/time\]/i;
        var existing = timeRe.exec(p);
        if (existing && existing[1]) {
            var oldStr = String(existing[1]).trim();
            var normOld = oldStr
                .replace(/-/g, "/")
                .replace(/年/g, "/")
                .replace(/月/g, "/")
                .replace(/日/g, " ")
                .replace(/星期[一二三四五六日]/g, "")
                .trim()
                .replace(/\s+/g, " ");
            var oldTs = Date.parse(normOld);
            if (!isNaN(oldTs) && oldTs > targetTs) {
                targetTs = oldTs;
                targetStr = oldStr;
            } else if (!isNaN(oldTs) && oldTs < targetTs) {
                // 用更晚的 target 替换旧标签
                p =
                    p.slice(0, existing.index) +
                    "[time]" +
                    targetStr +
                    "[/time]" +
                    p.slice(existing.index + existing[0].length);
            }
        } else {
            // 4. 没有 [time]：在末尾追加一个
            if (!p.endsWith("\n")) p += "\n";
            p += "[time]" + targetStr + "[/time]";
        }

        // 5. 同步世界观时间（保证后续模块能用到最新时间）
        updateWorldClockIfNeeded(targetTs, targetStr);

        return p;
    }

    function getChatRoundCount() {
        try {
            const ctx = getStContext();
            const chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : (Array.isArray(window.chat) ? window.chat : null);
            if (!chat || !chat.length) return 0;
            let userCount = 0;
            let assistantCount = 0;
            for (let i = 0; i < chat.length; i++) {
                const m = chat[i] || {};
                const role = String(m.role || "");
                const isUser = m.is_user;
                if (isUser === true || role === "user") userCount++;
                else if (isUser === false || role === "assistant") assistantCount++;
                // system 不计入轮数
            }
            return Math.min(userCount, assistantCount);
        } catch (e) {
            return 0;
        }
    }

    function getLastAutoOnlineRound(chatId) {
        const id = String(chatId || "");
        const key = AUTO_ONLINE_LAST_ROUND_KEY_PREFIX + (id || "global");
        try {
            const v = parseInt(localStorage.getItem(key), 10);
            return Number.isFinite(v) ? v : 0;
        } catch (e) {
            return 0;
        }
    }

    function setLastAutoOnlineRound(chatId, round) {
        const id = String(chatId || "");
        const key = AUTO_ONLINE_LAST_ROUND_KEY_PREFIX + (id || "global");
        try { localStorage.setItem(key, String(round || 0)); } catch (e) { /* ignore */ }
    }

    function extractRecentChatForPrompt(maxFloors) {
        const n = Math.max(1, parseInt(maxFloors, 10) || 24);
        try {
            const ctx = getStContext();
            const chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : (Array.isArray(window.chat) ? window.chat : null);
            if (!chat || !chat.length) return "";
            const slice = chat.slice(Math.max(0, chat.length - n));
            const lines = [];
            for (let i = 0; i < slice.length; i++) {
                const m = slice[i] || {};
                const role = String(m.role || "");
                if (role === "system") continue;
                const isUser = m.is_user;
                const text = String(m.mes || m.message || m.content || "").trim();
                if (!text) continue;
                const who = (isUser === true || role === "user") ? "玩家" : "角色";
                // 避免超长楼层把 prompt 撑爆：单条截断
                const clipped = text.length > 600 ? (text.slice(0, 600) + "…") : text;
                lines.push(who + "：" + clipped);
            }
            return lines.join("\n");
        } catch (e) {
            return "";
        }
    }

    // 查找最近一次触发器（例如 [playerhistorymoments]）
    function findLatestTrigger(tagName, lookback) {
        const tag = String(tagName || "").toLowerCase();
        const n = typeof lookback === "number" ? lookback : 12;
        try {
            // 优先使用 SillyTavern.getContext()
            if (window.SillyTavern && typeof window.SillyTavern.getContext === "function") {
                const ctx = window.SillyTavern.getContext();
                const chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : null;
                if (chat && chat.length) {
                    for (let i = chat.length - 1; i >= 0 && i >= chat.length - n; i--) {
                        const m = chat[i];
                        const text = String(m?.mes || m?.message || m?.content || "").trim();
                        if (text.toLowerCase().includes("[" + tag + "]")) {
                            return { id: i, text: text };
                        }
                    }
                }
            }
            // 退化：window.chat
            if (Array.isArray(window.chat) && window.chat.length) {
                const chat = window.chat;
                for (let i = chat.length - 1; i >= 0 && i >= chat.length - n; i--) {
                    const m = chat[i];
                    const text = String(m?.mes || m?.message || m?.content || "").trim();
                    if (text.toLowerCase().includes("[" + tag + "]")) {
                        return { id: i, text: text };
                    }
                }
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    function getTriggerSig(triggerText) {
        const s = String(triggerText || "");
        return String(s.length) + ":" + s.slice(0, 120) + ":" + s.slice(-120);
    }

    function _getScopedKey(baseKey) {
        // 将“已处理”去重按聊天文件隔离，避免不同聊天里同样的指令被误判为已处理
        const chatId = getCurrentChatIdSafe();
        const bucket = chatId ? String(chatId) : "global";
        return String(baseKey) + ":" + bucket;
    }

    function hasProcessedTrigger(sig) {
        try {
            return localStorage.getItem(_getScopedKey(LAST_TRIGGER_KEY)) === sig;
        } catch (e) {
            return false;
        }
    }

    function markTriggerProcessed(sig) {
        try {
            localStorage.setItem(_getScopedKey(LAST_TRIGGER_KEY), sig);
        } catch (e) {
            // ignore
        }
    }

    function hasProcessedPlayerReq(sig) {
        try {
            return localStorage.getItem(_getScopedKey(LAST_PLAYER_PHONE_REQ_KEY)) === sig;
        } catch (e) {
            return false;
        }
    }

    function markPlayerReqProcessed(sig) {
        try {
            localStorage.setItem(_getScopedKey(LAST_PLAYER_PHONE_REQ_KEY), sig);
        } catch (e) {
            // ignore
        }
    }

    function getLastOnlinePayloadHash() {
        try {
            return localStorage.getItem(_getScopedKey(LAST_ONLINE_PAYLOAD_HASH_KEY)) || "";
        } catch (e) {
            return "";
        }
    }

    function setLastOnlinePayloadHash(hash) {
        try {
            localStorage.setItem(_getScopedKey(LAST_ONLINE_PAYLOAD_HASH_KEY), String(hash || ""));
        } catch (e) {
            // ignore
        }
    }

    function calcSimpleHash(text) {
        const s = String(text || "");
        let h = 0;
        for (let i = 0; i < s.length; i++) {
            h = (h << 5) - h + s.charCodeAt(i);
            h |= 0;
        }
        return String(h);
    }

    function tooSoon(currentId) {
        if (lastTriggeredMessageId < 0) return false;
        return currentId - lastTriggeredMessageId < COOL_DOWN_FLOORS;
    }

    function tooSoonByTime() {
        if (!lastTriggeredAt) return false;
        return Date.now() - lastTriggeredAt < COOL_DOWN_MS;
    }

    function calcProbability(text) {
        const emoWords = /(吵|生气|委屈|激动|暧昧|喜欢|担心|愧疚|解释|道歉|想你|心疼|嫉妒|吃醋|紧张|害怕)/;
        return BASE_PROBABILITY + (emoWords.test(text) ? STRONG_EMOTION_BONUS : 0);
    }

    // 更像活人：轻量“剧情需要”触发判定（命中则提高触发倾向；命中抑制词则降低触发）
    function shouldConsiderOnlineAction(text) {
        const t = String(text || "");
        const strongTriggers =
            /(道歉|解释|误会|想你|约|见面|分开|晚安|早安|吃饭|到家|礼物|红包|纪念日|生日|节日|加班|下雨|发朋友圈|朋友圈|点赞|评论)/;
        const suppress =
            /(正在打架|追逐|逃跑|爆炸|枪|刀|危机|救命|快跑|战斗|boss|系统提示|旁白：)/;
        if (suppress.test(t)) return false;
        return strongTriggers.test(t);
    }

    // 从文本中解析第一条 [MSG] 字段=值（用于提取 to/from/time 等）
    function parseFirstMsgFields(text) {
        const s = String(text || "");
        const m = s.match(/\[\s*MSG\s*]([\s\S]*?)\[\s*\/\s*MSG\s*]/i);
        if (!m) return null;
        const body = String(m[1] || "");
        const lines = body.split(/\r?\n/).map(l => String(l).trim()).filter(Boolean);
        const out = {};
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const eq = line.indexOf("=");
            if (eq <= 0) continue;
            const k = line.slice(0, eq).trim().toLowerCase();
            const v = line.slice(eq + 1).trim();
            out[k] = v;
        }
        return out;
    }

    // 检测玩家输入消息中的"线上回复请求"触发器（你写的 <Request：...>）
    function findLatestPlayerPhoneRequest(lookback) {
        const n = typeof lookback === "number" ? lookback : 8;
        const requestRe = /<\s*request\s*[:：]/i;
        try {
            const ctx = getStContext();
            const chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : (Array.isArray(window.chat) ? window.chat : null);
            if (!chat || !chat.length) return null;
            for (let i = chat.length - 1; i >= 0 && i >= chat.length - n; i--) {
                const msg = chat[i];
                // ⚠️ 重要：只检查用户消息（is_user === true），避免误判AI回复
                const isUser = msg?.is_user === true || msg?.role === "user" || (msg?.is_user !== false && !msg?.role);
                if (!isUser) continue; // 跳过非用户消息
                const text = String(msg?.mes || msg?.message || msg?.content || "").trim();
                if (!text) continue;
                if (!requestRe.test(text)) continue;
                if (!/\[\s*MSG\s*]/i.test(text)) continue;
                return { id: i, text: text };
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    // ========= 生成核心 =========
    function getStContext() {
        try {
            if (window.SillyTavern && typeof window.SillyTavern.getContext === "function") {
                return window.SillyTavern.getContext();
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    async function callGenerator(sysPrompt, userInput, options) {
        options = options || {};
        const shouldSilence = options.shouldSilence !== false; // 默认 true，但可以通过 options 控制

        // 优先：酒馆助手 generate（如果存在）
        if (typeof window.generate === "function") {
            return await window.generate({
                should_silence: shouldSilence,
                max_chat_history: "all",
                user_input: userInput,
                injects: [
                    {
                        role: "system",
                        content: sysPrompt,
                        position: "in_chat",
                        depth: 0
                    }
                ]
            });
        }

        // 退化：使用 SillyTavern 原生 quiet prompt 生成（mobile 文档插件同类用法）
        const ctx = getStContext();
        const generateQuietPromptFn =
            (ctx && typeof ctx.generateQuietPrompt === "function" && ctx.generateQuietPrompt) ||
            (window.SillyTavern && typeof window.SillyTavern.generateQuietPrompt === "function" && window.SillyTavern.generateQuietPrompt);
        if (typeof generateQuietPromptFn !== "function") {
            return null;
        }
        const quietPrompt = dedent(`
            ${sysPrompt}

            ----
            ${userInput}
        `);
        // SillyTavern 原生 generateQuietPrompt({ quietPrompt, quietToLoud, skipWIAN, ... }) -> Promise<string>
        return await generateQuietPromptFn({
            quietPrompt: quietPrompt,
            quietToLoud: true,
            skipWIAN: false,
            quietName: "System:",
        });
    }

    async function appendAssistantMessageToChat(payload) {
        const ctx = getStContext();
        if (!ctx || !Array.isArray(ctx.chat) || typeof ctx.addOneMessage !== "function") {
            // 最后兜底：如果没有 context API，就尝试酒馆助手的 createChatMessages
            if (typeof window.createChatMessages === "function") {
                await window.createChatMessages([{ role: "assistant", message: payload }], { refresh: "affected" });
                return true;
            }
            return false;
        }

        const now = Date.now();
        const message = {
            name: ctx.name2 || "Assistant",
            is_user: false,
            is_system: false,
            force_avatar: false,
            mes: payload,
            send_date: now,
            extra: {},
            gen_started: now,
            gen_finished: now,
            swipe_id: 0,
            swipes: [payload]
        };

        try {
            ctx.chat.push(message);
        } catch (e) {
            // ignore
        }
        await ctx.addOneMessage(message);
        if (typeof ctx.saveChat === "function") {
            await ctx.saveChat();
        }
        return true;
    }

    // 将模型偶发的“字段名跑偏”做一次纠错，避免解析失败/数据污染
    // 典型：在 [wx_contact] 内出现 “dk方亦楷ID=100” 这类，把它归一为 “角色ID=100”
    function normalizePayload(payload) {
        let text = String(payload || "");

        function normalizeRoleIdLineWithinBlock(inner, blockName) {
            const body = String(inner || "");
            const hasRoleId = /(^|\r?\n)\s*角色ID\s*=\s*\d+\s*(\r?\n|$)/.test(body);
            let fixed = body;

            // 1) 如果还没有角色ID，尝试把第一条 “xxID=数字” 变成 角色ID=数字
            if (!hasRoleId) {
                fixed = fixed.replace(/(^|\r?\n)\s*([^\r\n=]{1,40}ID)\s*=\s*(\d+)\s*(?=\r?\n|$)/i, function (m, pfx, key, num) {
                    const lowerKey = String(key || "").toLowerCase();
                    // 排除常见非角色ID字段（保险）
                    if (lowerKey === "call_id" || lowerKey === "message_id" || lowerKey === "momentid" || lowerKey === "wxid") return m;
                    return (pfx || "\n") + "角色ID=" + num;
                });
            }

            // 2) 现在如果有了角色ID，则删除块内所有“其它 *ID=数字”错误行（保留角色ID本身）
            if (/(^|\r?\n)\s*角色ID\s*=/.test(fixed)) {
                fixed = fixed.replace(/(^|\r?\n)\s*(?!角色ID\s*=)[^\r\n=]{1,40}ID\s*=\s*\d+\s*(?=\r?\n|$)/gi, function (m, pfx) {
                    // 直接移除整行（保留换行前缀）
                    return pfx || "\n";
                });
            }

            if (/(^|\r?\n)\s*角色ID\s*=/.test(fixed)) {
                logWarn(blockName + " 检测到异常ID字段，已自动归一为 角色ID");
            }
            return fixed;
        }

        // 在联系人/好友相关数据块内统一归一角色ID字段名
        const blocksToFix = ["wx_contact", "wx_friend_apply_response", "wx_friend_request"];
        blocksToFix.forEach(function (bn) {
            // 兼容开标签带空格/属性： [wx_contact] 或 [wx_contact ...]
            const re = new RegExp("\\[\\s*" + bn + "\\b[^\\]]*]([\\s\\S]*?)\\[\\s*\\/\\s*" + bn + "\\s*]", "gi");
            text = text.replace(re, function (full, inner) {
                const fixedInner = normalizeRoleIdLineWithinBlock(inner, "[" + bn + "]");
                // 保持原本换行习惯
                const prefix = "[" + bn + "]" + (fixedInner.startsWith("\n") ? "" : "\n");
                const suffix = (fixedInner.endsWith("\n") ? "" : "\n") + "[/" + bn + "]";
                return prefix + fixedInner + suffix;
            });
        });

        return text;
    }

    // ========= 防覆盖：联系人/好友申请响应去重（自动生成专用） =========
    // 目标：
    // - 已经存在的联系人资料（wx_contact）默认不再重复生成，避免新生成的“低质量资料”覆盖旧资料
    // - 已处理过的好友申请响应（wx_friend_apply_response）不再重复生成，避免反复改写状态
    // - 仅当剧情明确出现“更改微信资料”（换头像/改昵称/改签名/改朋友圈背景等）时，允许同角色ID再次输出 wx_contact
    function detectProfileUpdateIntent(text) {
        const t = String(text || "");
        if (!t) return false;
        // 必须同时满足：有“修改动作词” + 有“资料字段词”
        const action = /(换|改|修改|更新|设置|更换|调整)/;
        const field =
            /(微信|资料|头像|昵称|签名|个性签名|朋友圈背景|背景图|封面|朋友圈封面)/;
        return action.test(t) && field.test(t);
    }

    function extractRoleIdFromBlock(blockText) {
        const s = String(blockText || "");
        const m = s.match(/(^|\r?\n)\s*角色ID\s*=\s*(\d+)\s*(?=\r?\n|$)/);
        return m && m[2] ? String(m[2]).trim() : "";
    }

    function normalizeRoleIdStr(id) {
        const s = String(id || "").trim();
        if (!s) return "";
        if (s.indexOf("contact_") === 0) return s.replace(/^contact_/, "");
        return s;
    }

    function contactExistsByRoleId(roleId) {
        const rid = normalizeRoleIdStr(roleId);
        if (!rid) return false;
        try {
            const dh = window.XiaoxinWeChatDataHandler;
            if (dh && typeof dh.getContacts === "function") {
                const contacts = dh.getContacts() || [];
                return contacts.some(function (c) {
                    const cid = String(c && c.id ? c.id : "").trim();
                    const cChar = String(c && c.characterId ? c.characterId : "").trim();
                    return (
                        cid === rid ||
                        cid === "contact_" + rid ||
                        cChar === rid
                    );
                });
            }
        } catch (e) {
            // ignore
        }
        // 兜底：本地缓存（按 chatId 分桶）
        try {
            const key = _getScopedKey("xiaoxin_autogen_known_contacts_v1");
            const raw = localStorage.getItem(key);
            if (!raw) return false;
            const obj = safeParseJson(raw);
            return !!(obj && typeof obj === "object" && obj[rid]);
        } catch (e2) {
            return false;
        }
    }

    function markContactKnown(roleId) {
        const rid = normalizeRoleIdStr(roleId);
        if (!rid) return;
        try {
            const key = _getScopedKey("xiaoxin_autogen_known_contacts_v1");
            const raw = localStorage.getItem(key);
            const obj = (raw && safeParseJson(raw)) || {};
            obj[rid] = 1;
            localStorage.setItem(key, JSON.stringify(obj));
        } catch (e) {
            // ignore
        }
    }

    function friendApplyAlreadyProcessed(roleId) {
        const rid = normalizeRoleIdStr(roleId);
        if (!rid) return false;
        try {
            const dh = window.XiaoxinWeChatDataHandler;
            if (dh && typeof dh.getFriendRequests === "function") {
                const list = dh.getFriendRequests() || [];
                // 只要存在一条对该角色的申请已经 accepted/rejected，就视为已处理
                const match = list.find(function (r) {
                    if (!r) return false;
                    const rRoleId = normalizeRoleIdStr(r.roleId);
                    if (rRoleId !== rid) return false;
                    const st = String(r.status || "").trim().toLowerCase();
                    return st === "accepted" || st === "rejected";
                });
                if (match) return true;
            }
            // 若联系人已是好友，也视为无需重复响应
            if (dh && typeof dh.getContacts === "function") {
                const contacts = dh.getContacts() || [];
                const c = contacts.find(function (cc) {
                    const cid = normalizeRoleIdStr(cc && cc.id ? cc.id : "");
                    const cChar = normalizeRoleIdStr(cc && cc.characterId ? cc.characterId : "");
                    return cid === rid || cChar === rid;
                });
                if (c && (c.isFriend === true || String(c.friendStatus || "") === "friend")) {
                    return true;
                }
            }
        } catch (e) {
            // ignore
        }
        // 兜底：本地缓存（按 chatId 分桶）
        try {
            const key = _getScopedKey("xiaoxin_autogen_known_applyresp_v1");
            const raw = localStorage.getItem(key);
            if (!raw) return false;
            const obj = safeParseJson(raw);
            return !!(obj && typeof obj === "object" && obj[rid]);
        } catch (e2) {
            return false;
        }
    }

    function markFriendApplyProcessed(roleId) {
        const rid = normalizeRoleIdStr(roleId);
        if (!rid) return;
        try {
            const key = _getScopedKey("xiaoxin_autogen_known_applyresp_v1");
            const raw = localStorage.getItem(key);
            const obj = (raw && safeParseJson(raw)) || {};
            obj[rid] = 1;
            localStorage.setItem(key, JSON.stringify(obj));
        } catch (e) {
            // ignore
        }
    }

    function filterDuplicateContactAndApplyBlocks(payload, options) {
        const text = String(payload || "");
        const allowUpdate = !!(options && options.allowContactUpdate);
        if (!text.trim()) return "";

        // 1) wx_contact：默认去重
        const contactRe = /\[\s*wx_contact\b[^\]]*\][\s\S]*?\[\s*\/\s*wx_contact\s*\]/gi;
        let out = text.replace(contactRe, function (block) {
            const rid = extractRoleIdFromBlock(block);
            if (!rid) return block;
            if (contactExistsByRoleId(rid) && !allowUpdate) {
                logInfo("已过滤重复联系人资料块（避免覆盖），角色ID:", rid);
                return "";
            }
            // 允许保留时，记录一下，供无数据层时兜底去重
            markContactKnown(rid);
            return block;
        });

        // 2) wx_friend_apply_response：一律去重（按 roleId）
        const applyRe = /\[\s*wx_friend_apply_response\b[^\]]*\][\s\S]*?\[\s*\/\s*wx_friend_apply_response\s*\]/gi;
        out = out.replace(applyRe, function (block) {
            const rid = extractRoleIdFromBlock(block);
            if (!rid) return block;
            if (friendApplyAlreadyProcessed(rid)) {
                logInfo("已过滤重复好友申请响应块（避免重复改写），角色ID:", rid);
                return "";
            }
            markFriendApplyProcessed(rid);
            return block;
        });

        // 清理多余空行
        out = out
            .replace(/\n{3,}/g, "\n\n")
            .replace(/^\s+|\s+$/g, "");
        return out.trim();
    }

    async function tryAutoGenerate(force) {
        // 特殊触发：玩家输入里携带“线上回复请求”（<Request：...> + 玩家发出的 [MSG]）
        const playerReq = findLatestPlayerPhoneRequest(8);
        if (playerReq) {
            const sig = "req:" + getTriggerSig(playerReq.text);
            if (!hasProcessedPlayerReq(sig)) {
                return await tryGeneratePhoneReplyFromPlayerRequest(playerReq, sig);
            }
        }

        // 历史类指令（玩家历史朋友圈、角色历史朋友圈、历史聊天记录）
        // 现在统一交回世界书主链路处理，插件不再额外生成，避免重复数据。
        // 因此这里不再对 [playerhistorymoments] / [char_historymoments] / [historychat] 做任何触发。

        // ====== 主动发送线上消息：门禁（只有开启+达到阈值才允许进入普通“线上动作”生成） ======
        const autoCfg = loadAutoOnlineConfig();
        if (!autoCfg.enabled) return;

        const rounds = getChatRoundCount();
        if (rounds < autoCfg.thresholdRounds) return;

        const chatId = getCurrentChatIdSafe();
        const lastRound = getLastAutoOnlineRound(chatId);
        if (rounds < (lastRound + autoCfg.thresholdRounds)) return;

        const latest = getLatestAssistantMessage();
        if (!latest) return;

        if (!force && tooSoon(latest.id)) return;
        if (!force && tooSoonByTime()) return;
        if (!latest.text) return;

        // 阈值触发属于“确定触发”，不走随机概率；仍保留冷却（楼层/时间）避免连发

        const sysPrompt = dedent(`
            你是“小馨手机指令生成器”，只负责生成手机插件可以解析的“指令文本”，不要生成普通对话。

            1. 指令格式必须来自《{{char}}输出格式指令汇总.md》：
               - 微信私聊/系统消息类：使用 [MSG]...[/MSG]，字段=值，每行一个字段，必须遵守 MSG 消息类型选择规则。
               - 联系人和好友相关：使用 [wx_contact] / [wx_friend_request] / [wx_friend_apply_response] 等世界书中定义的标签。
               - 朋友圈：使用 [moments] 容器 + 若干 [moment] 块，属性或嵌套格式都要与世界书一致。
               - 朋友圈互动：使用 [moments-interactions] 容器 + [like]/[comment]/[reply]。
               - 其他所有格式标签，也必须严格遵守世界书中的写法（方括号、字段=值、每行一个字段等）。

            2. 严格隐私和好友关系：
               - 遵守微信隐私性规则：不能平白无故看到或操作 {{user}} 看不到的内容。
               - 好友申请未通过前，不能发送 [MSG] 私聊，只能在正文里表达“想加你”等想法。
               - 绝对禁止为 {{user}} 生成 [wx_contact]；只能为 {{char}} 或 NPC 生成。

            2.1 角色ID字段硬性规范（必须遵守，违反将导致输出被丢弃/纠错）：
               - 在所有联系人/好友相关数据块中（如 [wx_contact]、[wx_friend_apply_response]、[wx_friend_request]），角色唯一数字ID字段名只能写为：角色ID=纯数字
               - 绝对禁止写成“某某ID=100”“角色卡ID=100”“dk方亦楷ID=100”等任何其它字段名
               - 如需写角色名，请使用“实名/微信昵称/备注”等字段，不要把名字拼进字段名里

            3. 活人感与时机（简要）：
               - 不必每次都发：动作要有剧情动机和情绪理由。
               - 节奏像人：像真实人日常发微信，允许“偶尔沉默、偶尔连续几条”，消息条数不要机械固定为 1～2 条，也不要无意义刷屏，全程以贴合剧情和人设为准。
               - 文本长度：默认一条 [MSG] 文本只写“1 句极短的话”（大致 5–20 个汉字），更长的话请拆成多条短气泡。
               - 只有在确实有剧情需要时（发布公告通知、正式道歉、情感小作文等），才输出明显偏长的小作文，此时可以不限制字数。
               - 如果判定当前不适合任何线上动作，请输出完全空白（不要写“无”“不触发”）。

            3.1 允许的 [MSG] 消息类型（按《{{char}}MSG消息类型选择规则世界书》执行，下面是简要回顾）：
               - type=text：普通文字消息（主要形式），语气口吻要贴近日常聊天。
               - type=emoji：表情/表情包，content 写表情含义或短语，例如“[表情]偷笑”。
               - type=photo：图片消息，必须带 image=URL，可选 desc= 对图片的简短说明/氛围语。
               - type=voice：语音消息，content 用简短一句话概括语音里说了什么，长度不要像长文。
               - type=call_voice / call_video：语音/视频通话，按照世界书中通话字段写法生成。
               - type=redpacket：红包消息，按世界书要求填写金额、备注等字段。
               - 一次生成可以混合多条不同 type 的 [MSG]，例如先 text，再 emoji，再一条 voice 或 photo。

            4. 输出约束（非常重要）：
               - 所有输出必须包裹在 BEGIN_XIAOXIN_PHONE 与 END_XIAOXIN_PHONE 之间。
               - 包裹外不能有任何字符。
               - 包裹内部只能包含各种格式标签块，不得出现解释性文字或对话正文。

            5. 示例结构（示意，不要照抄内容）：

               BEGIN_XIAOXIN_PHONE
               [MSG]
               id=wxid-XXXXXXXX
               time=YYYY-MM-DD HH:mm:ss
               from={{char}}id
               to=player
               type=text
               content=……
               [/MSG]

               [moments]
                 [moment id="moment-XXXXXXXX" author="{{char}}id" type="文字"]
                   [content]……[/content]
                   [timestamp]YYYY-MM-DD HH:mm:ss[/timestamp]
                 [/moment]
               [/moments]

               [moments-interactions]
                 [like momentId="moment-XXXXXXXX" liker="{{char}}id"][/like]
               [/moments-interactions]
               END_XIAOXIN_PHONE

            6. ⚠️ 重要：随机选择动作类型和联系人
               - 你必须根据配置的比例随机选择动作类型：
                 * 私聊消息：随机选择一个联系人（from=联系人ID, to=player），发送 1-3 条消息
                 * 朋友圈发帖：随机选择一个联系人（author=联系人ID），发布 1 条朋友圈动态
                 * 朋友圈互动：随机选择一个联系人（liker/commenter=联系人ID），对已有的朋友圈进行点赞或评论
               - 发送者/作者/互动者必须从通讯录中随机选择，不要总是选择同一个联系人
               - 每次生成只选择一种动作类型（私聊、发帖、互动三选一），不要同时生成多种类型
               - 必须符合各自的人设、关系和说话习惯
        `);

        // 根据配置的比例随机选择动作类型
        function selectActionTypeByRatio(ratios) {
            const rand = Math.random() * 100;
            if (rand < ratios.privateMessage) {
                return "privateMessage";
            } else if (rand < ratios.privateMessage + ratios.momentsPost) {
                return "momentsPost";
            } else {
                return "momentsInteraction";
            }
        }

        const selectedActionType = selectActionTypeByRatio(autoCfg.actionRatios);
        logInfo("根据配置比例随机选择动作类型:", selectedActionType, "比例配置:", autoCfg.actionRatios);

        // 获取联系人列表（用于随机选择）
        let availableContacts = [];
        try {
            if (window.XiaoxinWeChatDataHandler && typeof window.XiaoxinWeChatDataHandler.getContacts === "function") {
                availableContacts = window.XiaoxinWeChatDataHandler.getContacts() || [];
            }
        } catch (e) {
            logWarn("获取联系人列表失败:", e);
        }

        // 过滤掉玩家自己的联系人记录（如果有的话）
        availableContacts = availableContacts.filter(function(c) {
            return c && c.id && String(c.id).trim() !== "player" && String(c.id).trim() !== "user";
        });

        if (availableContacts.length === 0) {
            logWarn("没有可用的联系人，跳过自动生成");
            return;
        }

        // 随机选择一个联系人
        const randomContact = availableContacts[Math.floor(Math.random() * availableContacts.length)];
        const contactId = String(randomContact.id || randomContact.characterId || "").trim();
        logInfo("随机选择的联系人:", contactId, "联系人名称:", randomContact.name || randomContact.realName || "(无)");

        // 根据选择的动作类型，构建不同的用户输入提示
        let actionTypeHint = "";
        if (selectedActionType === "privateMessage") {
            actionTypeHint = `\n\n⚠️ 本次必须生成：私聊消息\n- 必须生成 [MSG] 消息，from=${contactId}, to=player\n- 可以生成 1-3 条消息，内容要符合该联系人的人设和当前剧情\n- 不要生成朋友圈或朋友圈互动`;
        } else if (selectedActionType === "momentsPost") {
            actionTypeHint = `\n\n⚠️ 本次必须生成：朋友圈发帖\n- 必须生成 [moments] 容器，包含至少 1 条 [moment]，author=${contactId}\n- 不要生成私聊消息或朋友圈互动`;
        } else if (selectedActionType === "momentsInteraction") {
            actionTypeHint = `\n\n⚠️ 本次必须生成：朋友圈互动\n- 必须生成 [moments-interactions] 容器，包含 [like] 或 [comment]，liker/commenter=${contactId}\n- 必须指定 momentId=已有的朋友圈动态ID（从剧情中推断或使用合理的ID）\n- 不要生成私聊消息或朋友圈发帖`;
        }

        const userInput = dedent(`
            根据下面的"参考剧情"（最近 ${autoCfg.contextLookbackFloors} 楼），决定是否要在小馨手机的世界里做线上动作。
            你只负责生成手机指令文本，不负责正文叙事。若不适合任何线上动作，输出空白。

            ${actionTypeHint}

            参考剧情：
            ${extractRecentChatForPrompt(autoCfg.contextLookbackFloors)}
        `);

        function extractPayload(text) {
            const s = String(text || "");
            const m = s.match(/BEGIN_XIAOXIN_PHONE[\r\n]+([\s\S]*?)[\r\n]+END_XIAOXIN_PHONE/);
            return (m && m[1] ? m[1] : "").trim();
        }

        function sanitizeAndValidate(payload) {
            const p = String(payload || "").trim();
            if (!p) return "";

            // 支持两种开标签：
            // - [tag] 或 [tag ...属性...]
            // - 闭标签：[/tag]
            // 同时支持嵌套，提取“顶层块”（栈空时闭合）
            function extractTopLevelBlocks(text) {
                const s = String(text || "");
                const tokenRe = /\[(\/?)([a-z0-9_\-]+)([^\]]*)\]/gi;
                const stack = [];
                const blocks = [];
                const ranges = [];
                let m;
                while ((m = tokenRe.exec(s)) !== null) {
                    const isClose = !!m[1];
                    const tag = String(m[2] || "").toLowerCase();
                    const tokenStart = m.index;
                    const tokenEnd = tokenRe.lastIndex;
                    if (!tag) continue;

                    if (!isClose) {
                        if (isStrictMode() && !ALLOWED_TAGS.has(tag)) {
                            // 严格模式：遇到未知标签，后续会导致残留非空 -> 丢弃
                        }
                        // push open tag
                        stack.push({ tag: tag, start: tokenStart });
                    } else {
                        // pop until match
                        if (!stack.length) continue;
                        const top = stack[stack.length - 1];
                        if (top.tag === tag) {
                            stack.pop();
                            // 若闭合后栈为空，说明这是一个顶层块
                            if (!stack.length) {
                                const start = top.start;
                                const end = tokenEnd;
                                const block = s.slice(start, end).trim();
                                if (block) {
                                    if (isStrictMode() && !ALLOWED_TAGS.has(tag)) {
                                        // 严格模式：丢弃不在白名单内的块
                                    } else {
                                    blocks.push(block);
                                    ranges.push({ start: start, end: end });
                                    }
                                }
                            }
                        }
                    }
                }
                return { blocks: blocks, ranges: ranges };
            }

            const extracted = extractTopLevelBlocks(p);
            const blocks = extracted.blocks;
            const ranges = extracted.ranges;
            if (!blocks.length) return "";

            const joined = blocks.join("\n\n").trim();
            if (!joined) return "";

            // 去掉所有提取到的块后，残留必须为空白，否则视为夹带正文
            let residue = p;
            // 从后往前删 range，避免索引漂移
            ranges
                .slice()
                .sort(function (a, b) { return b.start - a.start; })
                .forEach(function (r) {
                    residue = residue.slice(0, r.start) + residue.slice(r.end);
                });
            residue = residue.trim();
            if (residue.length > 0) {
                logWarn("生成结果夹带非指令正文，已丢弃。残留片段:", residue.slice(0, 120));
                return "";
            }

            // ========= 强校验 1：MSG 必填字段 =========
            const msgBlocks = joined.match(/\[\s*MSG\b[^\]]*\][\s\S]*?\[\s*\/\s*MSG\s*\]/gi) || [];
            for (let i = 0; i < msgBlocks.length; i++) {
                const mb = msgBlocks[i];
                const lower = mb.toLowerCase();
                const need = ["id=", "time=", "from=", "to=", "type="];
                const ok = need.every(function (k) { return lower.indexOf(k) !== -1; });
                if (!ok) {
                    logWarn("[MSG] 缺少必要字段，已丢弃该次生成。");
                    return "";
                }
                if (!/\nto=player\s*[\r\n]/i.test("\n" + mb + "\n")) {
                    logWarn("[MSG] to 字段必须为 player，已丢弃该次生成。");
                    return "";
                }
                // ⚠️ 对于私聊消息，不强制要求 from 必须是某个特定联系人ID
                // 因为我们已经通过 prompt 引导模型随机选择联系人，这里只做基本格式校验
            }

            // ========= 强校验 2：朋友圈/互动属性式标签 =========
            // [moment ...] 必须带 id= 或 id="..."，author= 或 author="..."，type= 或 type="..."
            const momentOpenRe = /\[\s*moment\b([^\]]*)\]/gi;
            let mm;
            while ((mm = momentOpenRe.exec(joined)) !== null) {
                const attrs = String(mm[1] || "");
                const hasId = /\bid\s*=\s*["']?moment-[^"'\s]+["']?/i.test(attrs) || /\[id\]\s*moment-[^[]+/i.test(joined);
                const hasAuthor = /\bauthor\s*=\s*["']?[^"'\s]+["']?/i.test(attrs) || /\[author\]\s*[^[]+/i.test(joined);
                const hasType = /\btype\s*=\s*["']?[^"'\]]+["']?/i.test(attrs) || /\[type\]\s*[^[]+/i.test(joined);
                if (!hasId || !hasAuthor || !hasType) {
                    logWarn("[moment] 缺少必要属性(id/author/type)，已丢弃该次生成。");
                    return "";
                }
            }

            // [like]/[comment]/[reply] 必须带 momentId=
            const needMomentIdRe = /\[\s*(like|comment|reply)\b([^\]]*)\]/gi;
            let lm;
            while ((lm = needMomentIdRe.exec(joined)) !== null) {
                const tag = String(lm[1] || "").toLowerCase();
                const attrs = String(lm[2] || "");
                if (!/\bmomentid\s*=\s*["']?moment-[^"'\s]+["']?/i.test(attrs)) {
                    logWarn("[" + tag + "] 缺少 momentId=，已丢弃该次生成。");
                    return "";
                }
            }

            return joined;
        }

        let result = null;
        try {
            result = await callGenerator(sysPrompt, userInput);
        } catch (e) {
            logWarn("调用生成失败:", e);
            return;
        }
        if (!result) {
            logWarn("生成接口不可用：未检测到酒馆助手 generate，且 SillyTavern.generateQuietPrompt 不可用");
            return;
        }

        const payload = sanitizeAndValidate(extractPayload(result));
        if (!payload) return;

        try {
            const allowUpdate = detectProfileUpdateIntent(
                String(latest.text || "") +
                    "\n" +
                    extractRecentChatForPrompt(Math.min(12, autoCfg.contextLookbackFloors))
            );
            const finalPayload = (function () {
                const normalized = normalizePayload(payload);
                const deduped = filterDuplicateContactAndApplyBlocks(
                    normalized,
                    { allowContactUpdate: allowUpdate }
                );
                if (!deduped) return "";
                // 为“主动线上动作”补充结尾世界观时间标签 [time]
                const withTime = ensureTrailingTimeTagForOnline(deduped);

                // 额外去重：如果本次生成结果与上一次“主动线上动作”在同一聊天里的 payload 完全相同，则跳过写入
                // 避免在上下文几乎没变时反复生成相同线上动作。
                const hash = calcSimpleHash(withTime);
                const lastHash = getLastOnlinePayloadHash();
                if (hash && lastHash && hash === lastHash) {
                    logInfo("本次自动线上动作 payload 与上一次完全相同，已跳过写入以避免重复消息。");
                    return "";
                }
                setLastOnlinePayloadHash(hash);
                return withTime;
            })();
            if (!finalPayload) return;
            const ok = await appendAssistantMessageToChat(finalPayload);
            if (ok) {
                lastTriggeredMessageId = latest.id;
                lastTriggeredAt = Date.now();
                // 记录本聊天已触发到的轮数，避免每条消息都触发
                setLastAutoOnlineRound(chatId, rounds);
                logInfo("已生成一条手机指令楼层");
            } else {
                logWarn("无法写入聊天楼层：context.addOneMessage/createChatMessages 均不可用");
            }
        } catch (e) {
            logWarn("写入聊天楼层失败:", e);
        }
    }

    // 针对 [playerhistorymoments] 的专用生成：强制生成历史朋友圈与互动/联系人数据
    async function tryGeneratePlayerHistoryMoments(trigger, sig) {
        if (!trigger || !trigger.text) return;

        logInfo("检测到 [playerhistorymoments] 触发器，开始生成玩家历史朋友圈…");

        const sysPrompt = dedent(`
            你正在处理 [playerhistorymoments] 历史朋友圈生成请求。
            你必须严格遵守《{{user}}历史朋友圈生成规则世界书》的要求：
            - 只能输出数据格式标签块： [moments] / [moments-interactions] / [wx_contact] / [wx_friend_apply_response] 等
            - 禁止输出任何正文叙事、解释、总结、对话
            - 朋友圈使用 [moments] 容器，包含多条 [moment id="moment-pXX" author="user" ...]，时间戳必须早于世界观当前时间
            - 需要同时生成：玩家历史朋友圈 + 互动联系人资料 + 好友申请同意响应 + 联系人历史朋友圈 + 互动数据

            输出约束（非常重要）：
            - 所有输出必须包裹在 BEGIN_XIAOXIN_PHONE 与 END_XIAOXIN_PHONE 之间，包裹外不得有任何字符。
            - 包裹内只能包含标签块，不得出现解释性文字。
        `);

        const userInput = dedent(`
            下面是系统发来的生成请求指令（原样给你，按其中参数生成）：
            ${trigger.text}
        `);

        let result = null;
        try {
            result = await callGenerator(sysPrompt, userInput);
        } catch (e) {
            logWarn("历史朋友圈生成失败:", e);
            return;
        }
        if (!result) {
            logWarn("历史朋友圈生成接口不可用");
            return;
        }

        function extractPayload(text) {
            const s = String(text || "");
            const m = s.match(/BEGIN_XIAOXIN_PHONE[\r\n]+([\s\S]*?)[\r\n]+END_XIAOXIN_PHONE/);
            return (m && m[1] ? m[1] : "").trim();
        }

        // 复用通用过滤与校验（允许 [time]）
        const payload = (function () {
            // 使用内部已有的 sanitizeAndValidate：通过临时调用普通生成路径的闭包不方便，
            // 因此这里做一个最小版复用：只要是“纯标签块”就接收
            const p = String(extractPayload(result) || "").trim();
            if (!p) return "";
            // 允许属性式标签的顶层块提取（复用同一套 token 栈逻辑）
            // 直接调用上面 sanitizeAndValidate 的逻辑会更好，但这里保持一致行为：
            // 通过临时借用 tryAutoGenerate 内的 sanitizeAndValidate 不可达，所以用一个简化版：
            const extracted = (function extractTopLevelBlocks(text) {
                const s = String(text || "");
                const tokenRe = /\[(\/?)([a-z0-9_\-]+)([^\]]*)\]/gi;
                const stack = [];
                const blocks = [];
                const ranges = [];
                let m;
                while ((m = tokenRe.exec(s)) !== null) {
                    const isClose = !!m[1];
                    const tag = String(m[2] || "").toLowerCase();
                    const tokenStart = m.index;
                    const tokenEnd = tokenRe.lastIndex;
                    if (!tag) continue;
                    if (!isClose) {
                        stack.push({ tag: tag, start: tokenStart });
                    } else {
                        if (!stack.length) continue;
                        const top = stack[stack.length - 1];
                        if (top.tag === tag) {
                            stack.pop();
                            if (!stack.length) {
                                const start = top.start;
                                const end = tokenEnd;
                                const block = s.slice(start, end).trim();
                                if (block) {
                                    blocks.push(block);
                                    ranges.push({ start: start, end: end });
                                }
                            }
                        }
                    }
                }
                return { blocks: blocks, ranges: ranges };
            })(p);

            if (!extracted.blocks.length) return "";
            let residue = p;
            extracted.ranges
                .slice()
                .sort(function (a, b) { return b.start - a.start; })
                .forEach(function (r) { residue = residue.slice(0, r.start) + residue.slice(r.end); });
            residue = residue.trim();
            if (residue.length > 0) {
                logWarn("历史朋友圈结果夹带非指令正文，已丢弃。残留片段:", residue.slice(0, 120));
                return "";
            }
            return extracted.blocks.join("\n\n").trim();
        })();

        if (!payload) return;

        try {
            const finalPayload = filterDuplicateContactAndApplyBlocks(
                normalizePayload(payload),
                { allowContactUpdate: false }
            );
            if (!finalPayload) {
                markTriggerProcessed(sig);
                return;
            }
            const ok = await appendAssistantMessageToChat(finalPayload);
            if (ok) {
                lastTriggeredAt = Date.now();
                markTriggerProcessed(sig);
                logInfo("玩家历史朋友圈已写入新楼层");
            } else {
                logWarn("无法写入历史朋友圈新楼层");
            }
        } catch (e) {
            logWarn("写入历史朋友圈楼层失败:", e);
        }
    }

    async function tryGenerateCharHistoryMoments(trigger, sig) {
        if (!trigger || !trigger.text) return;

        logInfo("检测到 [char_historymoments] 触发器，开始生成角色历史朋友圈…");

        const sysPrompt = dedent(`
            你正在处理 [char_historymoments] 历史朋友圈生成请求。
            你必须严格遵守《{{char}}历史朋友圈生成规则世界书》的要求：
            - 只能输出数据格式标签块：只能输出 [moments]...[/moments]（唯一允许输出）
            - 禁止输出任何正文叙事、解释、总结、对话
            - 每条朋友圈必须是 [moment id="..." author="role_id" type="..."] ... [/moment]，并包含 [timestamp]
            - 所有 timestamp 必须严格早于世界观当前时间（见输出结尾的 [time] 标签）

            输出约束（非常重要）：
            - 所有输出必须包裹在 BEGIN_XIAOXIN_PHONE 与 END_XIAOXIN_PHONE 之间，包裹外不得有任何字符。
            - 包裹内只能包含标签块，不得出现解释性文字。
        `);

        const userInput = dedent(`
            下面是系统发来的生成请求指令（原样给你，按其中参数生成）：
            ${trigger.text}
        `);

        let result = null;
        try {
            result = await callGenerator(sysPrompt, userInput);
        } catch (e) {
            logWarn("角色历史朋友圈生成失败:", e);
            return;
        }
        if (!result) {
            logWarn("角色历史朋友圈生成接口不可用");
            return;
        }

        function extractPayload(text) {
            const s = String(text || "");
            const m = s.match(/BEGIN_XIAOXIN_PHONE[\r\n]+([\s\S]*?)[\r\n]+END_XIAOXIN_PHONE/);
            return (m && m[1] ? m[1] : "").trim();
        }

        const payloadRaw = extractPayload(result);
        if (!payloadRaw) return;

        // 复用更严格的 sanitize：必须只有 [moments] 块（允许末尾 [time]）
        const payload = (function () {
            const p = String(payloadRaw || "").trim();
            if (!p) return "";
            // 要么只有 [moments]...[/moments]，要么还有一个 [time]...[/time]
            const hasMoments = /\[\s*moments\b[^\]]*\][\s\S]*?\[\s*\/\s*moments\s*\]/i.test(p);
            if (!hasMoments) return "";
            const residue = p
                .replace(/\[\s*moments\b[^\]]*\][\s\S]*?\[\s*\/\s*moments\s*\]/gi, "")
                .replace(/\[\s*time\b[^\]]*\][\s\S]*?\[\s*\/\s*time\s*\]/gi, "")
                .trim();
            if (residue.length > 0) {
                logWarn("角色历史朋友圈结果夹带非指令正文，已丢弃。残留片段:", residue.slice(0, 120));
                return "";
            }
            return p.trim();
        })();

        if (!payload) return;

        try {
            const finalPayload = filterDuplicateContactAndApplyBlocks(
                normalizePayload(payload),
                { allowContactUpdate: false }
            );
            if (!finalPayload) {
                markTriggerProcessed(sig);
                return;
            }
            const ok = await appendAssistantMessageToChat(finalPayload);
            if (ok) {
                lastTriggeredAt = Date.now();
                markTriggerProcessed(sig);
                logInfo("角色历史朋友圈已写入新楼层");
            } else {
                logWarn("无法写入角色历史朋友圈新楼层");
            }
        } catch (e) {
            logWarn("写入角色历史朋友圈楼层失败:", e);
        }
    }

    async function tryGenerateHistoryChat(trigger, sig) {
        if (!trigger || !trigger.text) return;

        logInfo("检测到 [historychat] 触发器，开始生成历史聊天记录…");

        const sysPrompt = dedent(`
            你正在处理 [historychat] 历史聊天记录生成请求。
            你必须严格遵守《历史聊天记录生成规则世界书》的要求：
            - 只能输出数据格式标签块：只能输出 [MSG]...[/MSG]（禁止正文叙事/解释）
            - 消息必须双向：同时包含 from=player 的消息和 from=role_id 的消息
            - from/to 必须成对：player -> role_id，role_id -> player
            - 必须严格满足 message_count 指定的条数（总条数）

            输出约束（非常重要）：
            - 所有输出必须包裹在 BEGIN_XIAOXIN_PHONE 与 END_XIAOXIN_PHONE 之间，包裹外不得有任何字符。
            - 为了让插件将其标记为“历史消息”，请在包裹内最前面额外输出一个空的 [historychat][/historychat] 标签作为标记。
            - 包裹内除 [historychat] 标记与若干 [MSG] 外，不要输出任何其他文字。
        `);

        const userInput = dedent(`
            下面是系统发来的生成请求指令（原样给你，按其中参数生成）：
            ${trigger.text}
        `);

        let result = null;
        try {
            result = await callGenerator(sysPrompt, userInput);
        } catch (e) {
            logWarn("历史聊天记录生成失败:", e);
            return;
        }
        if (!result) {
            logWarn("历史聊天记录生成接口不可用");
            return;
        }

        function extractPayload(text) {
            const s = String(text || "");
            const m = s.match(/BEGIN_XIAOXIN_PHONE[\r\n]+([\s\S]*?)[\r\n]+END_XIAOXIN_PHONE/);
            return (m && m[1] ? m[1] : "").trim();
        }

        const payloadRaw = extractPayload(result);
        if (!payloadRaw) return;

        const payload = (function () {
            const p = String(payloadRaw || "").trim();
            if (!p) return "";

            // 必须包含 historychat 标记（空也行）
            if (!/\[\s*historychat\b[^\]]*\][\s\S]*?\[\s*\/\s*historychat\s*\]/i.test(p)) {
                logWarn("历史聊天记录缺少 [historychat] 标记，已丢弃。");
                return "";
            }

            // 允许内容：一个 historychat 块 + 若干 MSG 块（属性式/非属性式）
            const allowedRe =
                /(?:\[\s*historychat\b[^\]]*\][\s\S]*?\[\s*\/\s*historychat\s*\]|\[\s*MSG\b[^\]]*\][\s\S]*?\[\s*\/\s*MSG\s*\])/gi;
            const blocks = p.match(allowedRe) || [];
            const joined = blocks.map(function (b) { return String(b).trim(); }).filter(Boolean).join("\n\n").trim();
            if (!joined) return "";

            const residue = p.replace(allowedRe, "").trim();
            if (residue.length > 0) {
                logWarn("历史聊天记录结果夹带非指令正文，已丢弃。残留片段:", residue.slice(0, 120));
                return "";
            }

            // 校验 MSG 基本字段（不强制 to=player，因为一半消息 to=role_id）
            const msgBlocks = joined.match(/\[\s*MSG\b[^\]]*\][\s\S]*?\[\s*\/\s*MSG\s*\]/gi) || [];
            if (!msgBlocks.length) {
                logWarn("历史聊天记录没有任何 [MSG]，已丢弃。");
                return "";
            }
            let hasPlayer = false;
            let hasRole = false;
            for (let i = 0; i < msgBlocks.length; i++) {
                const mb = msgBlocks[i];
                const lower = mb.toLowerCase();
                const need = ["id=", "time=", "from=", "to=", "type="];
                const ok = need.every(function (k) { return lower.indexOf(k) !== -1; });
                if (!ok) {
                    logWarn("历史聊天记录 [MSG] 缺字段，已丢弃。");
                    return "";
                }
                if (/\nfrom=player\s*[\r\n]/i.test("\n" + mb + "\n")) hasPlayer = true;
                else hasRole = true;
            }
            if (!hasPlayer || !hasRole) {
                logWarn("历史聊天记录必须包含 player 与 role 双向消息，已丢弃。");
                return "";
            }

            return joined;
        })();

        if (!payload) return;

        try {
            const finalPayload = filterDuplicateContactAndApplyBlocks(
                normalizePayload(payload),
                { allowContactUpdate: false }
            );
            if (!finalPayload) {
                markTriggerProcessed(sig);
                return;
            }
            const ok = await appendAssistantMessageToChat(finalPayload);
            if (ok) {
                lastTriggeredAt = Date.now();
                markTriggerProcessed(sig);
                logInfo("历史聊天记录已写入新楼层");
            } else {
                logWarn("无法写入历史聊天记录新楼层");
            }
        } catch (e) {
            logWarn("写入历史聊天记录楼层失败:", e);
        }
    }

    // 玩家输入后，按 <Request:...> 触发对方线上回复（仅输出 [MSG] + [time]）
    async function tryGeneratePhoneReplyFromPlayerRequest(trigger, sig) {
        if (!trigger || !trigger.text) return;

        // 先抢占式标记，避免 MESSAGE_SENT + MESSAGE_RECEIVED/轮询 几乎同时触发造成重复生成
        // 若后续生成失败，会回滚以允许玩家重试
        try {
            markPlayerReqProcessed(sig);
        } catch (e_mark) {
            // ignore
        }

        const fields = parseFirstMsgFields(trigger.text) || {};

        // ⚠️ 重要：语音通话请求（type=call_voice 且 state=ringing）应该交给酒馆处理，不触发插件内部自动生成
        const msgType = String(fields["type"] || "").trim().toLowerCase();
        const msgState = String(fields["state"] || "").trim().toLowerCase();
        if (msgType === "call_voice" && msgState === "ringing") {
            logInfo("检测到玩家语音通话请求（call_voice + ringing），交给酒馆处理，跳过插件内部自动生成");
            markPlayerReqProcessed(sig);
            return;
        }

        // 玩家发出的线上消息里，to 通常是对方联系人ID（微信号/角色ID），我们要让"对方"来回
        const targetId = String(fields["to"] || "").trim();
        const rawTime = String(fields["time"] || "").trim();
        if (!targetId) {
            logWarn("玩家线上请求缺少 [MSG] to= 字段，无法确定对方ID，已跳过");
            markPlayerReqProcessed(sig);
            return;
        }

        logInfo("检测到玩家线上回复请求，准备生成对方线上回复。target=", targetId);

        const sysPrompt = dedent(`
            你正在处理"玩家输入后的线上微信消息回复"请求。
            你必须同时输出线下剧情和线上消息格式，在同一轮输出中完成。

            输出结构（必须严格遵守）：
            1. 先输出线下剧情（正文叙事/对白/动作描写等），描述角色收到消息后的反应、动作、心理活动等
            2. 然后输出线上消息格式指令块

            线下剧情要求：
            - 必须描述角色收到玩家消息后的反应、动作、心理活动等
            - 可以是叙事、对白、动作描写等，要符合角色人设和当前剧情
            - 长度适中，不要过长或过短

            线上消息格式要求：
            - 输出 [MSG]...[/MSG]（可以多条）以及一个结尾的 [time]...[/time]
            - 这些 [MSG] 必须表示"对方联系人"回复玩家：from=${targetId} 且 to=player
            - 每条 [MSG] 必须包含字段：id/time/from/to/type/content（或 type 对应字段）
            - 活人感：语气要像真实人在手机上回复，允许用口语、停顿、表情，而不是论文式长句。
            - 文本长度：默认一条文字 [MSG] 只写"1 句极短的话"（大致 5–20 个汉字），更长的话请拆成多条短气泡。
            - 只有在确实有剧情需要时（正式道歉、情感表达、小作文等），才允许明显偏长的小作文，此时可以不限制字数。
            - 可以根据剧情选择不同类型：
              * type=text：普通文字
              * type=emoji：表情/表情包（content 写简短含义）
              * type=photo：图片（含 image=URL，可选 desc= 简短说明）
              * type=voice：语音消息（content 用一句话概括语音内容）
              * type=redpacket：红包（金额、备注按世界书规则）
              * type=call_voice / call_video：语音/视频通话请求或记录
            - 一次回复可以包含多条不同 type 的 [MSG]，但整体数量不要过多，要符合正常聊天节奏。

            输出格式示例：
            （这里是线下剧情描述，描述角色收到消息后的反应、动作等）

            BEGIN_XIAOXIN_PHONE
            （若干 [MSG] 与一个 [time]）
            END_XIAOXIN_PHONE
        `);

        const userInput = dedent(`
            下面是玩家刚刚在“手机线上”发出的消息请求（包含 Request 描述与玩家发出的 [MSG]）：
            ${trigger.text}

            请根据剧情需要与玩家这条消息的语气，生成对方的线上回复。
            ${rawTime ? "当前时间参考：" + rawTime : ""}
        `);

        let result = null;
        try {
            // ⚠️ 重要：玩家线上回复请求需要同时生成线下剧情，所以不使用静默模式
            result = await callGenerator(sysPrompt, userInput, { shouldSilence: false });
        } catch (e) {
            logWarn("玩家线上回复生成失败:", e);
            // 回滚：允许下次重试
            try {
                localStorage.removeItem(_getScopedKey(LAST_PLAYER_PHONE_REQ_KEY));
            } catch (e2) {
                // ignore
            }
            return;
        }
        if (!result) {
            logWarn("玩家线上回复生成接口不可用");
            try {
                localStorage.removeItem(_getScopedKey(LAST_PLAYER_PHONE_REQ_KEY));
            } catch (e2) {
                // ignore
            }
            return;
        }

        // ⚠️ 重要：现在生成的内容包含线下剧情 + BEGIN_XIAOXIN_PHONE...END_XIAOXIN_PHONE
        // 需要分别提取线下剧情和线上消息格式，然后合并写入
        function extractOfflinePlotAndPayload(text) {
            const s = String(text || "");
            // 提取 BEGIN_XIAOXIN_PHONE...END_XIAOXIN_PHONE 之间的内容（线上消息格式）
            const payloadMatch = s.match(/BEGIN_XIAOXIN_PHONE[\r\n]+([\s\S]*?)[\r\n]+END_XIAOXIN_PHONE/);
            const payloadRaw = (payloadMatch && payloadMatch[1] ? payloadMatch[1] : "").trim();

            // 提取 BEGIN_XIAOXIN_PHONE 之前的内容（线下剧情）
            const offlinePlotMatch = s.match(/^([\s\S]*?)BEGIN_XIAOXIN_PHONE/);
            const offlinePlot = (offlinePlotMatch && offlinePlotMatch[1] ? offlinePlotMatch[1] : "").trim();

            return {
                offlinePlot: offlinePlot,
                payloadRaw: payloadRaw
            };
        }

        const { offlinePlot, payloadRaw } = extractOfflinePlotAndPayload(result);

        if (!payloadRaw) {
            logWarn("玩家线上回复缺少 BEGIN_XIAOXIN_PHONE...END_XIAOXIN_PHONE 包裹，已跳过");
            try {
                localStorage.removeItem(_getScopedKey(LAST_PLAYER_PHONE_REQ_KEY));
            } catch (e2) {}
            return;
        }

        // 允许内容：若干 MSG + 一个 time；不允许任何其他文字
        const p = String(payloadRaw || "").trim();
        const allowedRe = /(?:\[\s*MSG\b[^\]]*\][\s\S]*?\[\s*\/\s*MSG\s*\]|\[\s*time\b[^\]]*\][\s\S]*?\[\s*\/\s*time\s*\])/gi;
        const blocks = p.match(allowedRe) || [];
        const joined = blocks.map(b => String(b).trim()).filter(Boolean).join("\n\n").trim();
        if (!joined) {
            logWarn("玩家线上回复缺少有效的 [MSG] 或 [time] 标签，已跳过");
            try {
                localStorage.removeItem(_getScopedKey(LAST_PLAYER_PHONE_REQ_KEY));
            } catch (e2) {}
            return;
        }

        const residue = p.replace(allowedRe, "").trim();
        if (residue.length > 0) {
            logWarn("玩家线上回复结果（BEGIN_XIAOXIN_PHONE 内）夹带非指令正文，已丢弃。残留片段:", residue.slice(0, 120));
        }

        // 校验 MSG：必须 to=player 且 from=targetId
        // ⚠️ 注意：这里校验的是"生成出来的角色回复消息"，不是玩家发送的消息
        // 玩家发送的消息格式：from=player, to=角色ID（这是正确的，不应该被校验）
        // 生成出来的角色回复格式：from=角色ID, to=player（这是我们要校验的）
        // 额外：线上气泡内容必须像"真实聊天第一视角"，禁止出现上帝视角括号/旁白
        const msgBlocks = joined.match(/\[\s*MSG\b[^\]]*\][\s\S]*?\[\s*\/\s*MSG\s*\]/gi) || [];
        if (!msgBlocks.length) return;
        for (let i = 0; i < msgBlocks.length; i++) {
            const mb = msgBlocks[i];
            const lower = mb.toLowerCase();
            const need = ["id=", "time=", "from=", "to=", "type="];
            const ok = need.every(k => lower.indexOf(k) !== -1);
            if (!ok) {
                logWarn("生成的角色回复 [MSG] 缺字段，已丢弃。");
                try {
                    localStorage.removeItem(_getScopedKey(LAST_PLAYER_PHONE_REQ_KEY));
                } catch (e2) {}
                return;
            }
            // ⚠️ 校验：生成出来的角色回复消息必须是 from=角色ID, to=player
            if (!/\nto=player\s*[\r\n]/i.test("\n" + mb + "\n")) {
                logWarn("生成的角色回复 [MSG] to 必须为 player（这是角色发给玩家的消息），已丢弃。");
                return;
            }
            const esc = targetId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const fromOk = new RegExp("\\nfrom=" + esc + "\\s*[\\r\\n]", "i");
            if (!fromOk.test("\n" + mb + "\n")) {
                logWarn("生成的角色回复 [MSG] from 必须为目标联系人ID（" + targetId + "），已丢弃。");
                return;
            }

            // 取 content= 或 text= 字段检查（避免括号里写“（她发来消息）”这种）
            const contentLine = (mb.match(/^\s*(content|text)\s*=\s*(.+)\s*$/im) || [])[2] || "";
            const c = String(contentLine || "").trim();
            if (c) {
                // 允许少量表情括号，但禁止明显旁白/上帝视角
                const metaRe = /(旁白|上帝视角|动作|心理|描写|系统提示|os|内心|心想|她想|他想)/i;
                const bracketRe = /[（(][^）)]{2,}[）)]/; // 有内容的括号
                if (metaRe.test(c) || (bracketRe.test(c) && /[旁白动作心理描写]|上帝视角|内心/.test(c))) {
                    logWarn("玩家线上回复气泡疑似包含旁白/上帝视角括号，已丢弃。content=", c.slice(0, 80));
                    return;
                }
            }
        }

        try {
            const finalPayload = filterDuplicateContactAndApplyBlocks(
                normalizePayload(joined),
                { allowContactUpdate: false }
            );
            if (!finalPayload) {
                markPlayerReqProcessed(sig);
                return;
            }

            // ⚠️ 重要：合并线下剧情和线上消息格式
            // 如果有线下剧情，先写线下剧情，然后追加线上消息格式
            let finalMessage = "";
            if (offlinePlot && offlinePlot.length > 0) {
                finalMessage = offlinePlot + "\n\n" + finalPayload;
            } else {
                finalMessage = finalPayload;
            }

            const ok = await appendAssistantMessageToChat(finalMessage);
            if (ok) {
                lastTriggeredAt = Date.now();
                markPlayerReqProcessed(sig);
                logInfo("玩家线上回复已写入新楼层（包含线下剧情和线上消息格式）");
            } else {
                logWarn("无法写入玩家线上回复新楼层");
            }
        } catch (e) {
            logWarn("写入玩家线上回复楼层失败:", e);
        }
    }

    // ========= 事件系统接入 =========
    function smartDetectEventSystem() {
        const methods = [
            function () {
                try {
                    if (window.SillyTavern && typeof window.SillyTavern.getContext === "function") {
                        const ctx = window.SillyTavern.getContext();
                        if (ctx && ctx.eventSource && typeof ctx.eventSource.on === "function" && ctx.event_types) {
                            return { eventSource: ctx.eventSource, event_types: ctx.event_types, from: "SillyTavern.getContext()" };
                        }
                    }
                } catch (e) {
                    // ignore
                }
                return null;
            },
            function () {
                try {
                    if (typeof window.eventOn === "function" && window.tavern_events && window.tavern_events.MESSAGE_RECEIVED) {
                        return {
                            eventSource: {
                                on: function (evt, handler) {
                                    if (evt === window.tavern_events.MESSAGE_RECEIVED) {
                                        window.eventOn(window.tavern_events.MESSAGE_RECEIVED, handler);
                                    }
                                }
                            },
                            event_types: window.tavern_events,
                            from: "global eventOn"
                        };
                    }
                } catch (e) {
                    // ignore
                }
                return null;
            },
            function () {
                try {
                    if (window.parent && window.parent.eventSource && window.parent.event_types && window.parent.event_types.MESSAGE_RECEIVED) {
                        return {
                            eventSource: window.parent.eventSource,
                            event_types: window.parent.event_types,
                            from: "parent.eventSource"
                        };
                    }
                } catch (e) {
                    // ignore
                }
                return null;
            }
        ];

        for (let i = 0; i < methods.length; i++) {
            const r = methods[i]();
            if (r && r.eventSource && r.event_types) {
                logInfo("事件系统检测成功，来源:", r.from);
                return r;
            }
        }
        logWarn("事件系统检测失败，将仅支持手动调试（forceOnce）。");
        return null;
    }

    function registerListeners() {
        const detected = smartDetectEventSystem();
        if (detected && detected.event_types && detected.event_types.MESSAGE_RECEIVED && detected.eventSource && typeof detected.eventSource.on === "function") {
            try {
                detected.eventSource.on(detected.event_types.MESSAGE_RECEIVED, function () {
                    // 收到新楼层时也尝试跑一次（兜底：有些环境不触发 message_sent）
                    // 注意：新聊天加载/切换也可能触发 MESSAGE_RECEIVED，因此这里不再 force，
                    // 由 tryAutoGenerate 内部的“开关+阈值”门禁决定是否触发
                    runAutoGenOnce("MESSAGE_RECEIVED", false);
                });
                logInfo("已监听 MESSAGE_RECEIVED 事件");
            } catch (e) {
                logWarn("绑定 MESSAGE_RECEIVED 失败:", e);
            }
        }

        // 玩家指令优先：尽量在“玩家发送后、酒馆开始生成前”就触发本地生成，减少浪费
        // 兼容 event_types 可能是 tavern_events 或字符串 event_types（message_sent）
        if (detected && detected.eventSource && typeof detected.eventSource.on === "function") {
            const bind = function (evt, handler) {
                try {
                    detected.eventSource.on(evt, handler);
                    return true;
                } catch (e) {
                    return false;
                }
            };

            // 玩家发送：只针对"线上回复请求"做 stop + 内部生成；历史类指令完全交给世界书处理
            const onPlayerSent = function () {
                // ⚠️ 重要：只检查最后一条用户消息，避免误判之前的MSG消息
                const trPlayerReq = findLatestPlayerPhoneRequest(1);

                // ⚠️ 重要：检查是否是历史类指令（[historychat] / [char_historymoments] / [playerhistorymoments]）
                // 这些指令应该完全交给世界书处理，插件不应该停止生成
                if (trPlayerReq && trPlayerReq.text) {
                    const text = String(trPlayerReq.text || "").toLowerCase();
                    const isHistoryCommand =
                        /\[\s*historychat\b/i.test(text) ||
                        /\[\s*char_historymoments\b/i.test(text) ||
                        /\[\s*playerhistorymoments\b/i.test(text);

                    if (isHistoryCommand) {
                        // 历史类指令：完全交给世界书处理，不停止生成，不触发内部生成
                        logInfo("检测到历史类指令，交给世界书处理，不停止生成");
                        return;
                    }

                    // ⚠️ 重要：检查是否是语音通话请求（type=call_voice 且 state=ringing）
                    // 语音通话请求应该交给酒馆处理，不停止生成，不触发内部生成
                    const fields = parseFirstMsgFields(trPlayerReq.text) || {};
                    const msgType = String(fields["type"] || "").trim().toLowerCase();
                    const msgState = String(fields["state"] || "").trim().toLowerCase();
                    if (msgType === "call_voice" && msgState === "ringing") {
                        logInfo("检测到玩家语音通话请求（call_voice + ringing），交给酒馆处理，不停止生成");
                        return;
                    }
                }

                const hasPlayerReq = !!trPlayerReq;

                if (hasPlayerReq) {
                    // 玩家线上请求：为了只保留"纯指令"的效果，直接 stop 酒馆正文生成，改由插件内部生成并写回
                    // ⚠️ 重要：延长停止窗口时间，确保内部生成完成前酒馆不会再次生成
                    requestStopGenerationWindow(15000); // 从 8000ms 延长到 15000ms
                    tryStopGenerationNow();
                    setTimeout(function () {
                        runAutoGenOnce("MESSAGE_SENT(player_req)", true).then(function() {
                            // 内部生成完成后，再延长停止窗口，确保写入完成前不会再次生成
                            requestStopGenerationWindow(5000);
                        }).catch(function(e) {
                            logWarn("玩家线上回复生成失败:", e);
                        });
                    }, 250);
                    // 再兜底一次：防止第一次被 stop 的竞态打断
                    setTimeout(function () {
                        runAutoGenOnce("MESSAGE_SENT(player_req)_retry", true).then(function() {
                            // 内部生成完成后，再延长停止窗口
                            requestStopGenerationWindow(5000);
                        }).catch(function(e) {
                            // ignore
                        });
                    }, 1400);
                }
            };

            // 生成开始：仅用于在"pendingStop 窗口"里补一次 stop（不再触发 tryAutoGenerate，避免循环）
            // ⚠️ 重要：如果当前消息是历史类指令或语音通话请求，不应该停止生成
            const onGenerationStarted = function () {
                if (pendingStopGenerationUntil && Date.now() <= pendingStopGenerationUntil) {
                    // 检查当前消息是否是历史类指令或语音通话请求
                    try {
                        const ctx = getStContext();
                        const chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : (Array.isArray(window.chat) ? window.chat : null);
                        if (chat && chat.length > 0) {
                            const lastMsg = chat[chat.length - 1];
                            const text = String(lastMsg?.mes || lastMsg?.message || lastMsg?.content || "").toLowerCase();
                            const isHistoryCommand =
                                /\[\s*historychat\b/i.test(text) ||
                                /\[\s*char_historymoments\b/i.test(text) ||
                                /\[\s*playerhistorymoments\b/i.test(text);

                            if (isHistoryCommand) {
                                // 历史类指令：不停止生成，交给世界书处理
                                return;
                            }

                            // 检查是否是语音通话请求（type=call_voice 且 state=ringing）
                            const fields = parseFirstMsgFields(text) || {};
                            const msgType = String(fields["type"] || "").trim().toLowerCase();
                            const msgState = String(fields["state"] || "").trim().toLowerCase();
                            if (msgType === "call_voice" && msgState === "ringing") {
                                // 语音通话请求：不停止生成，交给酒馆处理
                                return;
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                    tryStopGenerationNow();
                }
            };

            if (detected.event_types && detected.event_types.MESSAGE_SENT) {
                if (bind(detected.event_types.MESSAGE_SENT, onPlayerSent)) {
                    logInfo("已监听 MESSAGE_SENT 事件（玩家指令优先）");
                }
            }
            bind("message_sent", onPlayerSent);

            if (detected.event_types && detected.event_types.GENERATION_STARTED) {
                bind(detected.event_types.GENERATION_STARTED, onGenerationStarted);
            }
            bind("generation_started", onGenerationStarted);
            bind("js_generation_started", onGenerationStarted);
        }

        // 最终兜底：轻量轮询触发器（防止事件系统缺失或消息未触发对应事件）
        // 只在发现触发器时才真正调用生成，且有去重 sig + autoGenRunning 锁
        try {
            setInterval(function () {
                const trReq = findLatestPlayerPhoneRequest(5);
                if (trReq) {
                    runAutoGenOnce("poll", true);
                }
            }, 2000);
            logInfo("已启用触发器轮询兜底（2s）");
        } catch (e) {
            // ignore
        }

        // 调试入口
        const debugObj = {
            forceOnce: function () { return tryAutoGenerate(true); },
            getStatus: function () {
                const ctx = getStContext();
                const hasQuiet =
                    !!(ctx && typeof ctx.generateQuietPrompt === "function") ||
                    !!(window.SillyTavern && typeof window.SillyTavern.generateQuietPrompt === "function");
                return {
                    hasSillyTavernContext: !!(window.SillyTavern && typeof window.SillyTavern.getContext === "function"),
                    hasGenerate: typeof window.generate === "function" || hasQuiet,
                    hasCreateChatMessages: typeof window.createChatMessages === "function" || !!(ctx && typeof ctx.addOneMessage === "function"),
                    strictMode: isStrictMode(),
                    lastTriggeredMessageId: lastTriggeredMessageId
                };
            }
        };

        try { window.XiaoxinPhoneAutoGenDebug = debugObj; } catch (e) {}
        try { if (window.parent && window.parent !== window) window.parent.XiaoxinPhoneAutoGenDebug = debugObj; } catch (e) {}
        try { if (window.top && window.top !== window) window.top.XiaoxinPhoneAutoGenDebug = debugObj; } catch (e) {}

        logInfo("调试对象已挂载：XiaoxinPhoneAutoGenDebug");
    }

    // 初始化（不依赖 DOMContentLoaded，直接尝试）
    try {
        registerListeners();
    } catch (e) {
        logWarn("自动指令模块初始化失败:", e);
    }
})();




