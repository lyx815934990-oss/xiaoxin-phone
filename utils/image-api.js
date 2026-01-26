/**
 * 图片生成API模块
 * 图片生成使用 pollinations.ai
 * API配置用于文本生成（为后续的微博、外卖等应用提供上下文查看和自动生成内容功能）
 * 支持使用酒馆全局变量持久化保存API配置
 */

(function (window) {
    "use strict";

    // 全局变量键名
    const GLOBAL_VAR_KEY = "mobile_image_api_config";
    const IMAGE_MODEL_CONFIG_KEY = "mobile_image_model_config";
    const DEFAULT_IMAGE_PREFIXES = {
        kolors: "best quality, masterpiece, ultra-detailed, 8k resolution, anime style, moe aesthetic, soft and smooth lineart, low contrast, gentle shading, painterly effect, soft color palette",
        zhipu: "best quality, masterpiece, ultra-detailed, 8k resolution, anime style, moe aesthetic, soft and smooth lineart, low contrast, gentle shading, painterly effect, soft color palette",
        pollinations:
            "anime style illustration, clean crisp lines, simple elegant composition, soft gentle shading, high quality detailed artwork, professional illustration, clean background, no messy lines, no clutter, no extra details, well-drawn, smooth flowing lines, clear sharp details, 8k resolution, best quality, masterpiece",
    };

    /**
     * 获取酒馆变量接口
     */
    function getVariablesInterface() {
        return typeof getVariables === "function"
            ? getVariables
            : typeof window !== "undefined" && window.getVariables;
    }

    function getReplaceVariablesInterface() {
        return typeof replaceVariables === "function"
            ? replaceVariables
            : typeof window !== "undefined" && window.replaceVariables;
    }

    /**
     * 图片生成器类
     */
    class ImageGenerator {
        constructor() {
            this.generatingTasks = new Map(); // 使用Map跟踪每个任务的生成状态
            this.apiConfig = null;
            this.configLoaded = false;
            this.pollinationsQueue = []; // pollinations.ai 请求队列
            this.pollinationsProcessing = false; // pollinations.ai 是否正在处理队列

            // 延迟加载配置，等待 custom-api-config 初始化
            this.initConfigLoading();
            console.log("[Image API] 图片生成器初始化完成");
        }

        /**
         * 初始化配置加载（延迟加载，等待 custom-api-config 就绪）
         */
        initConfigLoading() {
            // 立即尝试加载一次
            this.loadAPIConfig();

            // 如果 custom-api-config 还未就绪，等待一段时间后重试
            if (!window.mobileCustomAPIConfig) {
                let retryCount = 0;
                const maxRetries = 10;
                const retryInterval = 500; // 500ms

                const checkConfig = () => {
                    if (
                        window.mobileCustomAPIConfig ||
                        retryCount >= maxRetries
                    ) {
                        // 重新加载配置
                        this.loadAPIConfig();
                        this.configLoaded = true;
                    } else {
                        retryCount++;
                        setTimeout(checkConfig, retryInterval);
                    }
                };

                setTimeout(checkConfig, retryInterval);
            } else {
                this.configLoaded = true;
            }
        }

        /**
         * 加载API配置（优先从酒馆全局变量，其次从设置页面配置，最后从 mobileCustomAPIConfig）
         */
        loadAPIConfig() {
            try {
                const getVars = getVariablesInterface();
                const replaceVars = getReplaceVariablesInterface();

                // 确保 apiConfig 已初始化
                if (!this.apiConfig) {
                    this.apiConfig = {
                        enabled: false,
                        provider: "openai",
                        apiUrl: "",
                        apiKey: "",
                        model: "",
                        temperature: 0.8,
                        maxTokens: 30000,
                        imageProvider: "kolors",
                        imagePrefixes: { ...DEFAULT_IMAGE_PREFIXES },
                        zhipuApiKey: "",
                        zhipuModel: "cogview-3-flash",
                    };
                }

                // 优先从酒馆全局变量读取
                if (getVars) {
                    try {
                        const globalData = getVars({ type: "global" }) || {};
                        if (globalData[GLOBAL_VAR_KEY]) {
                            // 合并配置，而不是完全替换
                            this.apiConfig = {
                                ...this.apiConfig,
                                ...JSON.parse(
                                    JSON.stringify(globalData[GLOBAL_VAR_KEY])
                                ),
                            };
                            console.log(
                                "[Image API] 从酒馆全局变量加载API配置:",
                                {
                                    enabled: this.apiConfig.enabled,
                                    provider: this.apiConfig.provider,
                                    hasApiUrl: !!this.apiConfig.apiUrl,
                                    hasApiKey: !!this.apiConfig.apiKey,
                                    model: this.apiConfig.model,
                                }
                            );
                            // 不要 return，继续读取 Kolors 配置
                        }
                    } catch (error) {
                        console.warn(
                            "[Image API] 读取酒馆全局变量失败:",
                            error
                        );
                    }
                }

                // 从设置页面配置读取（XiaoxinWeChatDataHandler.getSettings 或 window.XiaoxinAI.getSettings）
                // 优先从设置页面读取，因为这是用户最新配置的地方
                let settingsSource = null;
                if (
                    window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler.getSettings ===
                        "function"
                ) {
                    settingsSource = window.XiaoxinWeChatDataHandler;
                } else if (
                    window.XiaoxinAI &&
                    typeof window.XiaoxinAI.getSettings === "function"
                ) {
                    settingsSource = window.XiaoxinAI;
                }

                if (settingsSource) {
                    try {
                        const settings = settingsSource.getSettings();
                        const sourceName =
                            settingsSource === window.XiaoxinWeChatDataHandler
                                ? "XiaoxinWeChatDataHandler"
                                : "window.XiaoxinAI";
                        console.log(
                            `[Image API] 从设置页面读取配置 (${sourceName}):`,
                            settings
                        );

                        if (settings && (settings.base || settings.apiUrl)) {
                            // 设置页面保存的配置格式：{ base, key, model }
                            const apiUrl =
                                settings.base || settings.apiUrl || "";
                            const apiKey =
                                settings.key || settings.apiKey || "";
                            const model = settings.model || "";

                            // 根据 API URL 判断 provider（优先判断 URL，因为用户可能使用自定义端点）
                            let detectedProvider = "openai";
                            // 只有 API URL 是 Gemini 官方端点时，才使用 gemini provider
                            if (
                                apiUrl.includes(
                                    "generativelanguage.googleapis.com"
                                )
                            ) {
                                detectedProvider = "gemini";
                            } else {
                                // 使用自定义端点时，默认使用 openai 格式（兼容大多数 API）
                                detectedProvider = "openai";
                            }

                            // 验证配置完整性（与 isAPIAvailable() 逻辑保持一致）
                            let configComplete = false;
                            if (detectedProvider === "gemini") {
                                // Gemini 只需要 model 和 apiKey
                                configComplete = !!(model && apiKey);
                            } else {
                                // 其他服务商需要 apiUrl, model 和 apiKey
                                configComplete = !!(apiUrl && model && apiKey);
                            }

                            // 如果配置完整，则使用
                            if (configComplete) {
                                this.apiConfig = {
                                    enabled: true, // 如果配置完整，默认启用
                                    provider: detectedProvider,
                                    apiUrl: apiUrl,
                                    apiKey: apiKey,
                                    model: model,
                                    temperature: settings.temperature || 0.8,
                                    maxTokens: settings.maxTokens || 30000,
                                };

                                console.log(
                                    `[Image API] ✅ 从设置页面加载API配置成功 (${sourceName}):`,
                                    {
                                        enabled: this.apiConfig.enabled,
                                        provider: this.apiConfig.provider,
                                        hasApiUrl: !!this.apiConfig.apiUrl,
                                        hasApiKey: !!this.apiConfig.apiKey,
                                        model: this.apiConfig.model,
                                        apiUrl:
                                            this.apiConfig.apiUrl.substring(
                                                0,
                                                50
                                            ) + "...",
                                    }
                                );

                                // 同步保存到酒馆全局变量
                                this.saveAPIConfig();
                                return;
                            } else {
                                console.warn(
                                    "[Image API] ⚠️ 设置页面配置不完整:",
                                    {
                                        provider: detectedProvider,
                                        hasApiUrl: !!apiUrl,
                                        hasApiKey: !!apiKey,
                                        hasModel: !!model,
                                        apiUrl: apiUrl || "(空)",
                                        model: model || "(空)",
                                        requiredFields:
                                            detectedProvider === "gemini"
                                                ? "model, apiKey"
                                                : "apiUrl, model, apiKey",
                                    }
                                );
                            }
                        } else {
                            console.warn(
                                "[Image API] ⚠️ 设置页面配置为空或格式不正确:",
                                settings
                            );
                        }
                    } catch (error) {
                        console.error(
                            "[Image API] ❌ 从设置页面读取配置失败:",
                            error
                        );
                    }
                } else {
                    console.warn("[Image API] ⚠️ 设置页面配置接口不可用", {
                        hasXiaoxinWeChatDataHandler:
                            !!window.XiaoxinWeChatDataHandler,
                        hasXiaoxinAI: !!window.XiaoxinAI,
                        xiaoxinAIGetSettings:
                            window.XiaoxinAI &&
                            typeof window.XiaoxinAI.getSettings,
                        xiaoxinWeChatDataHandlerGetSettings:
                            window.XiaoxinWeChatDataHandler &&
                            typeof window.XiaoxinWeChatDataHandler.getSettings,
                    });
                }

                // 备用方案：从 mobileCustomAPIConfig 读取
                if (
                    window.mobileCustomAPIConfig &&
                    window.mobileCustomAPIConfig.getCurrentConfig
                ) {
                    const config =
                        window.mobileCustomAPIConfig.getCurrentConfig();
                    console.log(
                        "[Image API] 从 mobileCustomAPIConfig 读取配置:",
                        {
                            enabled: config?.enabled,
                            provider: config?.provider,
                            hasApiUrl: !!config?.apiUrl,
                            hasApiKey: !!config?.apiKey,
                            model: config?.model,
                            fullConfig: config,
                        }
                    );

                    if (config) {
                        // 对于 Gemini，使用内置 URL
                        let apiUrl = config.apiUrl || "";
                        if (config.provider === "gemini") {
                            // Gemini 使用内置 URL，不需要从配置中读取
                            apiUrl = "";
                        }

                        this.apiConfig = {
                            enabled: config.enabled || false,
                            provider: config.provider || "openai",
                            apiUrl: apiUrl,
                            apiKey: config.apiKey || "",
                            model: config.model || "",
                            temperature: config.temperature || 0.8,
                            maxTokens: config.maxTokens || 30000,
                        };

                        console.log(
                            "[Image API] 从 mobileCustomAPIConfig 加载API配置成功:",
                            {
                                enabled: this.apiConfig.enabled,
                                provider: this.apiConfig.provider,
                                hasApiUrl: !!this.apiConfig.apiUrl,
                                hasApiKey: !!this.apiConfig.apiKey,
                                model: this.apiConfig.model,
                            }
                        );

                        // 同步保存到酒馆全局变量
                        this.saveAPIConfig();
                        // 不要 return，继续读取 Kolors 配置
                    } else {
                        console.warn(
                            "[Image API] mobileCustomAPIConfig.getCurrentConfig() 返回空配置"
                        );
                    }
                } else {
                    console.warn(
                        "[Image API] mobileCustomAPIConfig 不可用或未初始化"
                    );
                }

                // 备用方案：从 localStorage 读取（如果以上所有方法都失败）
                try {
                    const storageKey = `xiaoxin_mobile_image_api_config`;
                    const storedConfig = localStorage.getItem(storageKey);
                    if (storedConfig) {
                        const parsedConfig = JSON.parse(storedConfig);
                        // 只使用有效的配置（enabled 为 true 且有必要的字段）
                        if (
                            parsedConfig.enabled &&
                            parsedConfig.model &&
                            (parsedConfig.apiUrl || parsedConfig.apiKey)
                        ) {
                            // 合并配置，而不是完全替换
                            this.apiConfig = {
                                ...this.apiConfig,
                                ...parsedConfig,
                            };
                            console.log(
                                "[Image API] 从 localStorage 加载API配置（备用方案）:",
                                {
                                    enabled: this.apiConfig.enabled,
                                    provider: this.apiConfig.provider,
                                    hasApiUrl: !!this.apiConfig.apiUrl,
                                    hasApiKey: !!this.apiConfig.apiKey,
                                    model: this.apiConfig.model,
                                }
                            );
                            // 同步保存到酒馆全局变量
                            this.saveAPIConfig();
                            // 不要 return，继续读取 Kolors 配置
                        } else {
                            console.warn(
                                "[Image API] localStorage 中的配置无效，跳过:",
                                {
                                    enabled: parsedConfig.enabled,
                                    hasModel: !!parsedConfig.model,
                                    hasApiUrl: !!parsedConfig.apiUrl,
                                    hasApiKey: !!parsedConfig.apiKey,
                                }
                            );
                        }
                    }
                } catch (error) {
                    console.warn(
                        "[Image API] 从 localStorage 读取配置失败:",
                        error
                    );
                }

                // 如果都没有，确保使用默认配置（但不要覆盖已有的配置）
                if (!this.apiConfig || !this.apiConfig.provider) {
                    this.apiConfig = {
                        enabled: false,
                        provider: "openai",
                        apiUrl: "",
                        apiKey: "",
                        model: "",
                        temperature: 0.8,
                        maxTokens: 30000,
                        imageProvider: "kolors",
                        imagePrefixes: { ...DEFAULT_IMAGE_PREFIXES },
                        zhipuApiKey: "",
                        zhipuModel: "cogview-3-flash",
                    };
                    console.log("[Image API] 使用默认配置（未找到有效配置）");
                }
            } catch (error) {
                console.error("[Image API] 加载API配置失败:", error);
                // 确保 apiConfig 已初始化
                if (!this.apiConfig) {
                    this.apiConfig = { enabled: false };
                }
            }

            // ========== 读取 Kolors 配置（无论前面的逻辑如何，都会执行）==========
            try {
                let kolorsConfig = null;
                const getVars = getVariablesInterface();

                // 从酒馆全局变量读取
                if (getVars) {
                    try {
                        const globalData = getVars({ type: "global" }) || {};
                        if (globalData["mobile_kolors_config"]) {
                            kolorsConfig = globalData["mobile_kolors_config"];
                        }
                    } catch (error) {
                        console.warn(
                            "[Image API] 读取 Kolors 配置失败:",
                            error
                        );
                    }
                }

                // 从 localStorage 读取（备用）
                if (!kolorsConfig) {
                    try {
                        const stored = localStorage.getItem(
                            "xiaoxin_kolors_config"
                        );
                        if (stored) {
                            kolorsConfig = JSON.parse(stored);
                        }
                    } catch (error) {
                        console.warn(
                            "[Image API] 从 localStorage 读取 Kolors 配置失败:",
                            error
                        );
                    }
                }

                // 保存 Kolors 配置到 apiConfig
                if (kolorsConfig) {
                    this.apiConfig.kolorsApiKey = kolorsConfig.apiKey || "";
                    // 不再保存 imageSize，由生成时指定
                    // this.apiConfig.kolorsImageSize = kolorsConfig.imageSize || "1024×1024";
                    this.apiConfig.kolorsNumInferenceSteps =
                        kolorsConfig.numInferenceSteps || 19;
                    this.apiConfig.kolorsGuidanceScale =
                        kolorsConfig.guidanceScale || 4.0;
                    this.apiConfig.kolorsPositivePrompt =
                        kolorsConfig.positivePrompt || "";
                    this.apiConfig.kolorsNegativePrompt =
                        kolorsConfig.negativePrompt || "";
                    this.apiConfig.kolorsEnabled =
                        kolorsConfig.enabled !== false;
                    console.log("[Image API] ✅ 已加载 Kolors 配置:", {
                        enabled: this.apiConfig.kolorsEnabled,
                        hasApiKey: !!this.apiConfig.kolorsApiKey,
                        apiKeyLength: this.apiConfig.kolorsApiKey
                            ? this.apiConfig.kolorsApiKey.length
                            : 0,
                        numInferenceSteps:
                            this.apiConfig.kolorsNumInferenceSteps,
                        guidanceScale: this.apiConfig.kolorsGuidanceScale,
                        hasPositivePrompt:
                            !!this.apiConfig.kolorsPositivePrompt,
                        hasNegativePrompt:
                            !!this.apiConfig.kolorsNegativePrompt,
                    });
                } else {
                    // 默认值（确保属性存在）
                    if (!this.apiConfig) {
                        this.apiConfig = {};
                    }
                    this.apiConfig.kolorsEnabled = false;
                    this.apiConfig.kolorsApiKey = "";
                    // this.apiConfig.kolorsImageSize = "1024×1024";
                    this.apiConfig.kolorsNumInferenceSteps = 19;
                    this.apiConfig.kolorsGuidanceScale = 4.0;
                    this.apiConfig.kolorsPositivePrompt = "";
                    this.apiConfig.kolorsNegativePrompt = "";
                    console.log(
                        "[Image API] ⚠️ 未找到 Kolors 配置，使用默认值（未启用）"
                    );
                }
            } catch (error) {
                console.error("[Image API] 加载 Kolors 配置失败:", error);
                // 确保 apiConfig 和 kolorsEnabled 属性存在
                if (!this.apiConfig) {
                    this.apiConfig = {};
                }
                this.apiConfig.kolorsEnabled = false;
                this.apiConfig.kolorsApiKey = "";
                this.apiConfig.kolorsPositivePrompt = "";
                this.apiConfig.kolorsNegativePrompt = "";
            }

            // ========== 读取生图模型选择配置 ==========
            try {
                let modelConfig = {
                    provider: this.apiConfig.imageProvider || "kolors",
                    prefixes: {
                        ...DEFAULT_IMAGE_PREFIXES,
                        ...(this.apiConfig.imagePrefixes || {}),
                    },
                    zhipuApiKey: this.apiConfig.zhipuApiKey || "",
                    zhipuModel:
                        this.apiConfig.zhipuModel || "cogview-3-flash",
                };

                const getVars = getVariablesInterface();
                if (getVars) {
                    try {
                        const globalData = getVars({ type: "global" }) || {};
                        if (globalData[IMAGE_MODEL_CONFIG_KEY]) {
                            const stored =
                                globalData[IMAGE_MODEL_CONFIG_KEY] || {};
                            modelConfig.provider =
                                stored.provider || modelConfig.provider;
                            modelConfig.prefixes = {
                                ...modelConfig.prefixes,
                                ...(stored.prefixes || {}),
                            };
                            modelConfig.zhipuApiKey =
                                stored.zhipuApiKey || modelConfig.zhipuApiKey;
                            modelConfig.zhipuModel =
                                stored.zhipuModel || modelConfig.zhipuModel;
                        }
                    } catch (error) {
                        console.warn(
                            "[Image API] 读取生图模型配置失败（全局变量）:",
                            error
                        );
                    }
                }

                if (!modelConfig || !modelConfig.provider) {
                    try {
                        const local = localStorage.getItem(
                            IMAGE_MODEL_CONFIG_KEY
                        );
                        if (local) {
                            const stored = JSON.parse(local);
                            modelConfig.provider =
                                stored.provider || modelConfig.provider;
                            modelConfig.prefixes = {
                                ...modelConfig.prefixes,
                                ...(stored.prefixes || {}),
                            };
                            modelConfig.zhipuApiKey =
                                stored.zhipuApiKey || modelConfig.zhipuApiKey;
                            modelConfig.zhipuModel =
                                stored.zhipuModel || modelConfig.zhipuModel;
                        }
                    } catch (error) {
                        console.warn(
                            "[Image API] 读取生图模型配置失败（localStorage）:",
                            error
                        );
                    }
                }

                // 如果未显式选择模型，但已经有智谱 Key，则自动切到智谱
                if (!modelConfig.provider && modelConfig.zhipuApiKey) {
                    modelConfig.provider = "zhipu";
                }

                // 迁移旧模型名：cogview-3 -> cogview-3-flash
                if (
                    modelConfig.zhipuModel &&
                    /^cogview-3(\b|$)/i.test(modelConfig.zhipuModel) &&
                    !/flash/i.test(modelConfig.zhipuModel)
                ) {
                    modelConfig.zhipuModel = "cogview-3-flash";
                }

                this.apiConfig.imageProvider =
                    modelConfig.provider || "kolors";
                this.apiConfig.imagePrefixes = {
                    ...DEFAULT_IMAGE_PREFIXES,
                    ...(modelConfig.prefixes || {}),
                };
                this.apiConfig.zhipuApiKey = modelConfig.zhipuApiKey || "";
                this.apiConfig.zhipuModel =
                    modelConfig.zhipuModel || "cogview-3-flash";

                console.log("[Image API] ✅ 已加载生图模型配置:", {
                    provider: this.apiConfig.imageProvider,
                    hasZhipuKey: !!this.apiConfig.zhipuApiKey,
                    zhipuModel: this.apiConfig.zhipuModel,
                    kolorsEnabled: this.apiConfig.kolorsEnabled,
                    kolorsKeyLength: this.apiConfig.kolorsApiKey
                        ? this.apiConfig.kolorsApiKey.length
                        : 0,
                    pollinationsPrefixLength:
                        (this.apiConfig.imagePrefixes.pollinations || "")
                            .length,
                });
            } catch (error) {
                console.warn(
                    "[Image API] 处理生图模型配置时发生错误，使用默认值:",
                    error
                );
                this.apiConfig.imageProvider = "kolors";
                this.apiConfig.imagePrefixes = { ...DEFAULT_IMAGE_PREFIXES };
                this.apiConfig.zhipuApiKey = "";
                this.apiConfig.zhipuModel = "cogview-3-flash";
            }
        }

        /**
         * 保存API配置到酒馆全局变量（优先）或 localStorage（备用）
         */
        saveAPIConfig() {
            // 避免重复保存（防止无限重试）
            if (this._savingConfig) {
                return false;
            }
            this._savingConfig = true;

            try {
                const getVars = getVariablesInterface();
                const replaceVars = getReplaceVariablesInterface();

                if (getVars && replaceVars) {
                    // 方法1：保存到酒馆全局变量（优先）
                    try {
                        // 读取当前全局变量
                        const globalData = getVars({ type: "global" }) || {};

                        // 更新配置
                        globalData[GLOBAL_VAR_KEY] = JSON.parse(
                            JSON.stringify(this.apiConfig)
                        );

                        // 保存到全局变量
                        replaceVars(globalData, { type: "global" });
                        console.log(
                            "[Image API] ✅ API配置已保存到酒馆全局变量:",
                            {
                                enabled: this.apiConfig.enabled,
                                provider: this.apiConfig.provider,
                                model: this.apiConfig.model,
                            }
                        );
                        this._savingConfig = false;
                        return true;
                    } catch (error) {
                        console.error(
                            "[Image API] ❌ 保存到酒馆全局变量失败:",
                            error
                        );
                        // 继续尝试备用方案
                    }
                }

                // 方法2：保存到 localStorage（备用方案，参考 mobile-phone.js）
                try {
                    const storageKey = `xiaoxin_mobile_image_api_config`;
                    localStorage.setItem(
                        storageKey,
                        JSON.stringify(this.apiConfig)
                    );
                    console.log(
                        "[Image API] ✅ API配置已保存到 localStorage（备用方案）:",
                        {
                            enabled: this.apiConfig.enabled,
                            provider: this.apiConfig.provider,
                            model: this.apiConfig.model,
                        }
                    );
                    this._savingConfig = false;
                    return true;
                } catch (error) {
                    console.error(
                        "[Image API] ❌ 保存到 localStorage 也失败:",
                        error
                    );
                    this._savingConfig = false;
                    return false;
                }
            } catch (error) {
                console.error("[Image API] ❌ 保存API配置失败:", error);
                this._savingConfig = false;
                return false;
            }
        }

        /**
         * 更新API配置
         */
        updateAPIConfig(config) {
            this.apiConfig = {
                ...this.apiConfig,
                ...config,
            };
            this.saveAPIConfig();
        }

        /**
         * 调试：打印当前配置状态
         */
        debugConfig() {
            console.log("=== [Image API] 配置调试信息 ===");
            console.log("1. 配置对象:", this.apiConfig);
            console.log("2. 配置已加载:", this.configLoaded);
            console.log(
                "3. mobileCustomAPIConfig 可用:",
                !!window.mobileCustomAPIConfig
            );

            if (window.mobileCustomAPIConfig) {
                const mobileConfig =
                    window.mobileCustomAPIConfig.getCurrentConfig();
                console.log("4. mobileCustomAPIConfig 当前配置:", mobileConfig);
            }

            const getVars = getVariablesInterface();
            if (getVars) {
                try {
                    const globalData = getVars({ type: "global" }) || {};
                    console.log(
                        "5. 酒馆全局变量中的配置:",
                        globalData[GLOBAL_VAR_KEY]
                    );
                } catch (error) {
                    console.warn("6. 读取酒馆全局变量失败:", error);
                }
            }

            console.log("7. API是否可用:", this.isAPIAvailable());
            console.log("=== 调试信息结束 ===");
        }

        /**
         * 检查API配置是否可用
         */
        isAPIAvailable() {
            // 每次检查前都重新加载配置，确保使用最新配置
            this.loadAPIConfig();

            if (!this.apiConfig) {
                console.warn("[Image API] ❌ API配置对象不存在");
                return false;
            }

            if (!this.apiConfig.enabled) {
                console.warn("[Image API] ❌ API配置未启用");
                return false;
            }

            // 检查必要的配置项
            if (this.apiConfig.provider === "gemini") {
                // Gemini 只需要 model 和 apiKey（不需要 apiUrl，使用内置URL）
                const available = !!(
                    this.apiConfig.model && this.apiConfig.apiKey
                );
                if (!available) {
                    console.warn("[Image API] ❌ Gemini配置不完整:", {
                        hasModel: !!this.apiConfig.model,
                        hasApiKey: !!this.apiConfig.apiKey,
                        model: this.apiConfig.model || "(空)",
                        hasApiKey: !!this.apiConfig.apiKey,
                    });
                } else {
                    console.log("[Image API] ✅ Gemini配置完整:", {
                        model: this.apiConfig.model,
                        hasApiKey: !!this.apiConfig.apiKey,
                    });
                }
                return available;
            } else {
                // 其他服务商需要 apiUrl, model 和 apiKey
                const available = !!(
                    this.apiConfig.apiUrl &&
                    this.apiConfig.model &&
                    this.apiConfig.apiKey
                );
                if (!available) {
                    console.warn("[Image API] ❌ API配置不完整:", {
                        hasApiUrl: !!this.apiConfig.apiUrl,
                        hasModel: !!this.apiConfig.model,
                        hasApiKey: !!this.apiConfig.apiKey,
                        provider: this.apiConfig.provider,
                        apiUrl: this.apiConfig.apiUrl || "(空)",
                        model: this.apiConfig.model || "(空)",
                    });
                } else {
                    console.log("[Image API] ✅ API配置完整:", {
                        provider: this.apiConfig.provider,
                        model: this.apiConfig.model,
                        hasApiUrl: !!this.apiConfig.apiUrl,
                        hasApiKey: !!this.apiConfig.apiKey,
                    });
                }
                return available;
            }
        }

        /**
         * 根据图片描述生成图片
         * 支持 Kolors / 智谱 / pollinations.ai，按用户设置优先级尝试
         * @param {string} imageDescription - 图片描述（中文）
         * @param {Object} options - 可选参数
         * @param {string} options.style - 图片风格前缀（可选）
         * @returns {Promise<string>} 返回生成的图片URL
         */
        async generateImage(imageDescription, options = {}) {
            if (!imageDescription || !imageDescription.trim()) {
                throw new Error("图片描述不能为空");
            }

            // 为每个任务创建唯一ID
            const taskId = `${Date.now()}_${Math.random()
                .toString(36)
                .substr(2, 9)}`;
            this.generatingTasks.set(taskId, true);

            try {
                console.log(
                    "[Image API] 开始生成图片，描述:",
                    imageDescription,
                    "任务ID:",
                    taskId
                );

                // 每次生成前重新加载配置，确保使用最新配置
                this.loadAPIConfig();

                const provider =
                    (this.apiConfig.imageProvider || "kolors").toLowerCase();
                const prefixes =
                    this.apiConfig.imagePrefixes || DEFAULT_IMAGE_PREFIXES;

                // 总是按照：当前选择的 provider -> 其他可用 -> pollinations 兜底
                const order = [];
                if (provider === "zhipu") {
                    order.push("zhipu", "kolors", "pollinations");
                } else if (provider === "kolors") {
                    order.push("kolors", "zhipu", "pollinations");
                } else {
                    order.push(provider, "zhipu", "kolors", "pollinations");
                }

                let lastError = null;

                for (const item of order) {
                    if (item === "kolors") {
                if (
                    this.apiConfig.kolorsEnabled &&
                    this.apiConfig.kolorsApiKey
                ) {
                    try {
                                const imageUrl =
                                    await this.generateImageWithKolors(
                            imageDescription,
                                        {
                                            ...options,
                                            stylePrefix:
                                                options.style ||
                                                prefixes.kolors,
                                        }
                        );
                        console.log(
                                    "[Image API] ✅ Kolors 图片生成成功，任务ID:",
                            taskId
                        );
                        return imageUrl;
                    } catch (error) {
                                lastError = error;
                        console.warn(
                                    "[Image API] ⚠️ Kolors 生成失败，尝试下一个模型:",
                                    error.message
                        );
                            }
                    }
                    } else if (item === "zhipu") {
                        if (this.apiConfig.zhipuApiKey) {
                            try {
                                const imageUrl =
                                    await this.generateImageWithZhipu(
                                        imageDescription,
                                        {
                                            ...options,
                                            stylePrefix:
                                                options.style ||
                                                prefixes.zhipu,
                                        }
                                    );
                console.log(
                                    "[Image API] ✅ 智谱图片生成成功，任务ID:",
                    taskId
                );
                                return imageUrl;
                            } catch (error) {
                                lastError = error;
                                console.warn(
                                    "[Image API] ⚠️ 智谱生成失败，尝试下一个模型:",
                                    error.message
                                );
                            }
                        }
                    } else if (item === "pollinations") {
                                const imageUrl =
                                    await this.generateImageWithPollinations(
                                        imageDescription,
                                        {
                                            ...options,
                                            style:
                                                options.style ||
                                                prefixes.pollinations ||
                                                DEFAULT_IMAGE_PREFIXES.pollinations,
                                        }
                                    );
                console.log(
                            "[Image API] ✅ pollinations.ai 图片生成成功，任务ID:",
                    taskId
                );
                return imageUrl;
                    }
                }

                if (lastError) {
                    throw lastError;
                }
                throw new Error("没有可用的生图模型，请在设置页完善配置");
            } catch (error) {
                console.error(
                    "[Image API] 图片生成失败:",
                    error,
                    "任务ID:",
                    taskId
                );
                throw error;
            } finally {
                // 清理任务状态
                this.generatingTasks.delete(taskId);
            }
        }

        /**
         * 调用文本生成API（用于后续的微博、外卖等应用的上下文查看和自动生成内容）
         * @param {Array} messages - 消息数组，格式：[{ role: "user", content: "..." }]
         * @param {Object} options - 可选参数
         * @param {number} options.maxTokens - 最大token数
         * @param {number} options.temperature - 温度参数
         * @returns {Promise<string>} 返回生成的文本内容
         */
        async generateText(messages, options = {}) {
            const config = this.apiConfig;

            // 重新检查provider：如果API URL不是Gemini官方端点，强制使用openai格式
            let provider = config.provider || "openai";
            const apiUrl = config.apiUrl || "";

            // 只有API URL是Gemini官方端点时，才使用gemini provider
            if (
                provider === "gemini" &&
                !apiUrl.includes("generativelanguage.googleapis.com")
            ) {
                console.warn(
                    "[Image API] 检测到自定义API端点，强制使用OpenAI兼容格式，即使provider为gemini"
                );
                provider = "openai";
            }

            // 检查API配置
            if (!this.isAPIAvailable()) {
                throw new Error("API配置不可用，请先在手机主页设置中配置API");
            }

            console.log("[Image API] 文本生成配置:", {
                provider: provider,
                apiUrl: apiUrl ? apiUrl.substring(0, 50) + "..." : "(空)",
                model: config.model,
                hasApiKey: !!config.apiKey,
            });

            try {
                // 优先使用 mobileCustomAPIConfig 的 callAPI 方法（如果可用且配置正确）
                if (
                    window.mobileCustomAPIConfig &&
                    typeof window.mobileCustomAPIConfig.callAPI === "function"
                ) {
                    // 检查 mobileCustomAPIConfig 的配置是否可用
                    const mobileConfig =
                        window.mobileCustomAPIConfig.getCurrentConfig();
                    if (!mobileConfig || !mobileConfig.enabled) {
                        console.warn(
                            "[Image API] mobileCustomAPIConfig 未启用，使用直接调用方式"
                        );
                    } else {
                        console.log(
                            "[Image API] 使用 mobileCustomAPIConfig.callAPI 调用文本生成API...",
                            {
                                provider: mobileConfig.provider,
                                model: mobileConfig.model,
                                enabled: mobileConfig.enabled,
                            }
                        );

                        // 添加超时处理（55秒）
                        const timeoutPromise = new Promise((_, reject) => {
                            setTimeout(() => {
                                reject(
                                    new Error(
                                        "mobileCustomAPIConfig.callAPI 超时（55秒）"
                                    )
                                );
                            }, 55000);
                        });

                        const callStartTime = Date.now();

                        const response = await Promise.race([
                            window.mobileCustomAPIConfig.callAPI(messages, {
                                maxTokens:
                                    options.maxTokens ||
                                    config.maxTokens ||
                                    500,
                                temperature:
                                    options.temperature ||
                                    config.temperature ||
                                    0.7,
                            }),
                            timeoutPromise,
                        ]);

                        const callElapsedTime = Date.now() - callStartTime;
                        console.log(
                            `[Image API] mobileCustomAPIConfig.callAPI 完成，耗时: ${callElapsedTime}ms`
                        );

                        const generatedContent = response.content || "";
                        console.log(
                            "[Image API] 文本生成API返回内容:",
                            generatedContent
                        );

                        return generatedContent;
                    }
                }

                // 备用方案：直接调用 API
                const apiUrl = config.apiUrl || "";
                const apiKey = config.apiKey || "";
                const model = config.model || "";

                if (!model) {
                    throw new Error("API配置不完整：缺少模型名称");
                }

                let requestUrl = "";
                let requestBody = {};
                const headers = { "Content-Type": "application/json" };

                // 根据 provider 构建不同的请求
                // 注意：只有API URL是Gemini官方端点时，才使用Gemini格式
                // 如果用户配置了自定义API端点，即使模型名称包含"gemini"，也应该使用OpenAI兼容格式
                if (
                    provider === "gemini" &&
                    apiUrl &&
                    apiUrl.includes("generativelanguage.googleapis.com")
                ) {
                    // Gemini 官方 API 使用特殊的 URL 结构
                    const geminiUrl =
                        "https://generativelanguage.googleapis.com";
                    requestUrl = `${geminiUrl}/v1beta/models/${model}:generateContent`;
                    if (apiKey) {
                        requestUrl += `?key=${apiKey}`;
                    }

                    // Gemini 请求体格式
                    requestBody = {
                        contents: [
                            {
                                parts: [{ text: messages[0].content }],
                            },
                        ],
                        generationConfig: {
                            maxOutputTokens:
                                options.maxTokens || config.maxTokens || 500,
                            temperature:
                                options.temperature ||
                                config.temperature ||
                                0.7,
                        },
                    };
                } else {
                    // OpenAI 兼容格式
                    if (!apiUrl || !apiKey) {
                        throw new Error(
                            "API配置不完整：缺少 API 地址或 API Key"
                        );
                    }

                    // 构建文本生成 API URL
                    requestUrl = apiUrl.trim();
                    if (!requestUrl.endsWith("/")) {
                        requestUrl += "/";
                    }
                    if (!requestUrl.includes("/chat/completions")) {
                        if (requestUrl.endsWith("/v1/")) {
                            requestUrl += "chat/completions";
                        } else if (requestUrl.endsWith("/v1")) {
                            requestUrl += "/chat/completions";
                        } else {
                            requestUrl += "v1/chat/completions";
                        }
                    }

                    // OpenAI 请求体格式
                    requestBody = {
                        model: model,
                        messages: messages,
                        max_tokens:
                            options.maxTokens || config.maxTokens || 500,
                        temperature:
                            options.temperature || config.temperature || 0.7,
                    };

                    // OpenAI 使用 Bearer 认证
                    headers["Authorization"] = `Bearer ${apiKey}`;
                }

                console.log("[Image API] 直接调用文本生成API:", {
                    provider: provider,
                    url: requestUrl.replace(apiKey || "", "[HIDDEN]"),
                    model: model,
                    hasApiKey: !!apiKey,
                });

                // 发送请求，添加超时处理（55秒）
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 55000);

                console.log("[Image API] 发送文本生成API请求...", {
                    provider: provider,
                    url: requestUrl.replace(apiKey || "", "[HIDDEN]"),
                    model: model,
                    requestBody:
                        JSON.stringify(requestBody).substring(0, 200) + "...",
                });

                let response;
                const fetchStartTime = Date.now();
                try {
                    response = await fetch(requestUrl, {
                        method: "POST",
                        headers: headers,
                        body: JSON.stringify(requestBody),
                        signal: controller.signal,
                    });
                    clearTimeout(timeoutId);
                    const fetchElapsedTime = Date.now() - fetchStartTime;
                    console.log(
                        `[Image API] Fetch请求完成，耗时: ${fetchElapsedTime}ms，状态码: ${response.status}`
                    );
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    const fetchElapsedTime = Date.now() - fetchStartTime;
                    console.error(
                        `[Image API] Fetch请求失败，耗时: ${fetchElapsedTime}ms`,
                        fetchError
                    );
                    if (fetchError.name === "AbortError") {
                        throw new Error("API请求超时（55秒）");
                    }
                    throw fetchError;
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error("[Image API] API返回错误:", {
                        status: response.status,
                        statusText: response.statusText,
                        errorText: errorText.substring(0, 500),
                    });
                    throw new Error(
                        `HTTP ${response.status}: ${errorText.substring(
                            0,
                            200
                        )}`
                    );
                }

                const data = await response.json();
                console.log("[Image API] 文本生成API返回数据:", {
                    hasData: !!data,
                    dataKeys: data ? Object.keys(data) : [],
                    dataPreview: JSON.stringify(data).substring(0, 500),
                });

                // 根据 provider 提取生成的内容
                let generatedContent = "";
                if (provider === "gemini") {
                    // Gemini 响应格式
                    generatedContent =
                        data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                } else {
                    // OpenAI 兼容格式
                    generatedContent =
                        data.choices?.[0]?.message?.content ||
                        data.choices?.[0]?.text ||
                        "";
                }

                if (!generatedContent) {
                    throw new Error("API响应中未找到生成内容");
                }

                console.log("[Image API] 文本生成成功:", generatedContent);
                return generatedContent;
            } catch (error) {
                console.error("[Image API] 调用文本生成API失败:", error);
                throw error;
            }
        }

        /**
         * 调用图片生成API（已废弃，保留用于兼容）
         * @deprecated 图片生成已改为直接使用 pollinations.ai，此方法不再使用
         * @param {string} prompt - 图片生成提示词
         * @returns {Promise<string>} 返回生成的图片URL
         */
        async callImageGenerationAPI(prompt) {
            const config = this.apiConfig;
            const provider = config.provider || "openai";

            // 构建请求消息
            const messages = [
                {
                    role: "user",
                    content: `请根据以下描述生成一张图片的URL：${prompt}\n\n请只返回图片的URL地址，不要包含其他文字。如果无法生成图片，请返回一个占位图片URL。`,
                },
            ];

            try {
                // 优先使用 mobileCustomAPIConfig 的 callAPI 方法（如果可用且配置正确）
                if (
                    window.mobileCustomAPIConfig &&
                    typeof window.mobileCustomAPIConfig.callAPI === "function"
                ) {
                    // 检查 mobileCustomAPIConfig 的配置是否可用
                    const mobileConfig =
                        window.mobileCustomAPIConfig.getCurrentConfig();
                    if (!mobileConfig || !mobileConfig.enabled) {
                        console.warn(
                            "[Image API] mobileCustomAPIConfig 未启用，使用直接调用方式"
                        );
                    } else {
                        console.log(
                            "[Image API] 使用 mobileCustomAPIConfig.callAPI 调用API...",
                            {
                                provider: mobileConfig.provider,
                                model: mobileConfig.model,
                                enabled: mobileConfig.enabled,
                            }
                        );

                        // 添加超时处理（55秒，比外层超时短5秒）
                        const timeoutPromise = new Promise((_, reject) => {
                            setTimeout(() => {
                                reject(
                                    new Error(
                                        "mobileCustomAPIConfig.callAPI 超时（55秒）"
                                    )
                                );
                            }, 55000);
                        });

                        const callStartTime = Date.now();

                        const response = await Promise.race([
                            window.mobileCustomAPIConfig.callAPI(messages, {
                                maxTokens: config.maxTokens || 500,
                                temperature: config.temperature || 0.7,
                            }),
                            timeoutPromise,
                        ]);

                        const callElapsedTime = Date.now() - callStartTime;
                        console.log(
                            `[Image API] mobileCustomAPIConfig.callAPI 完成，耗时: ${callElapsedTime}ms`
                        );

                        const generatedContent = response.content || "";
                        console.log(
                            "[Image API] API返回内容:",
                            generatedContent
                        );

                        // 从返回内容中提取图片URL
                        const imageUrl = this.extractImageUrl(generatedContent);

                        if (imageUrl) {
                            return imageUrl;
                        } else {
                            // 如果无法提取URL，抛出错误以使用备用方案
                            throw new Error("无法从API响应中提取图片URL");
                        }
                    }
                }

                // 备用方案：直接调用 API（参考 mobile/custom-api-config.js 的实现）
                const apiUrl = config.apiUrl || "";
                const apiKey = config.apiKey || "";
                const model = config.model || "";

                if (!model) {
                    throw new Error("API配置不完整：缺少模型名称");
                }

                let requestUrl = "";
                let requestBody = {};
                const headers = { "Content-Type": "application/json" };

                // 根据 provider 构建不同的请求（参考 mobile/custom-api-config.js）
                if (provider === "gemini") {
                    // Gemini API 使用特殊的 URL 结构
                    const geminiUrl =
                        "https://generativelanguage.googleapis.com";
                    requestUrl = `${geminiUrl}/v1beta/models/${model}:generateContent`;
                    if (apiKey) {
                        requestUrl += `?key=${apiKey}`;
                    }

                    // Gemini 请求体格式（参考 mobile/custom-api-config.js）
                    requestBody = {
                        contents: [
                            {
                                parts: [{ text: messages[0].content }],
                            },
                        ],
                        generationConfig: {
                            maxOutputTokens: config.maxTokens || 500,
                            temperature: config.temperature || 0.7,
                        },
                    };
                } else {
                    // OpenAI 兼容格式
                    if (!apiUrl || !apiKey) {
                        throw new Error(
                            "API配置不完整：缺少 API 地址或 API Key"
                        );
                    }

                    // 尝试使用图片生成 API（优先），如果失败则回退到文本生成 API
                    let useImageAPI = true;
                    requestUrl = apiUrl.trim();
                    if (!requestUrl.endsWith("/")) {
                        requestUrl += "/";
                    }

                    // 构建图片生成 API URL（使用 /v1/images/generations）
                    const imageApiUrl =
                        requestUrl +
                        (requestUrl.endsWith("/v1/") ? "" : "v1/") +
                        "images/generations";

                    // 先尝试图片生成 API
                    try {
                        const imageRequestBody = {
                            model: model || "dall-e-3", // 如果没有指定模型，默认使用 dall-e-3
                            prompt: prompt, // 直接使用提示词
                            n: 1, // 生成1张图片
                            size: "1024x1024", // 默认图片大小
                            quality: "standard", // 图片质量
                        };

                        console.log(
                            "[Image API] 尝试使用图片生成API:",
                            imageApiUrl.replace(apiKey || "", "[HIDDEN]")
                        );

                        const imageController = new AbortController();
                        const imageTimeoutId = setTimeout(
                            () => imageController.abort(),
                            55000
                        );

                        const imageResponse = await fetch(imageApiUrl, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${apiKey}`,
                            },
                            body: JSON.stringify(imageRequestBody),
                            signal: imageController.signal,
                        });

                        clearTimeout(imageTimeoutId);

                        if (imageResponse.ok) {
                            const imageData = await imageResponse.json();
                            if (
                                imageData.data &&
                                Array.isArray(imageData.data) &&
                                imageData.data.length > 0
                            ) {
                                const imageUrl = imageData.data[0].url;
                                console.log(
                                    "[Image API] ✅ 图片生成API成功:",
                                    imageUrl
                                );
                                return imageUrl;
                            }
                        } else {
                            const errorText = await imageResponse.text();
                            console.warn(
                                "[Image API] 图片生成API失败，状态码:",
                                imageResponse.status,
                                errorText
                            );
                        }
                    } catch (imageError) {
                        console.warn(
                            "[Image API] 图片生成API不可用，回退到文本生成API:",
                            imageError.message
                        );
                    }

                    // 回退到文本生成 API（让 LLM 生成图片 URL）
                    console.log("[Image API] 使用文本生成API生成图片URL...");
                    if (!requestUrl.includes("/chat/completions")) {
                        if (requestUrl.endsWith("/v1/")) {
                            requestUrl += "chat/completions";
                        } else if (requestUrl.endsWith("/v1")) {
                            requestUrl += "/chat/completions";
                        } else {
                            requestUrl += "v1/chat/completions";
                        }
                    }

                    // OpenAI 文本生成 API 请求体格式
                    requestBody = {
                        model: model,
                        messages: messages,
                        max_tokens: config.maxTokens || 500,
                        temperature: config.temperature || 0.7,
                    };

                    // OpenAI 使用 Bearer 认证
                    headers["Authorization"] = `Bearer ${apiKey}`;
                }

                console.log("[Image API] 直接调用API:", {
                    provider: provider,
                    url: requestUrl.replace(apiKey || "", "[HIDDEN]"),
                    model: model,
                    hasApiKey: !!apiKey,
                });

                // 发送请求，添加超时处理（55秒，比外层超时短5秒）
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 55000);

                console.log("[Image API] 发送API请求...", {
                    provider: provider,
                    url: requestUrl.replace(apiKey || "", "[HIDDEN]"),
                    model: model,
                });

                let response;
                const fetchStartTime = Date.now();
                try {
                    response = await fetch(requestUrl, {
                        method: "POST",
                        headers: headers,
                        body: JSON.stringify(requestBody),
                        signal: controller.signal,
                    });
                    clearTimeout(timeoutId);
                    const fetchElapsedTime = Date.now() - fetchStartTime;
                    console.log(
                        `[Image API] Fetch请求完成，耗时: ${fetchElapsedTime}ms，状态码: ${response.status}`
                    );
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    const fetchElapsedTime = Date.now() - fetchStartTime;
                    console.error(
                        `[Image API] Fetch请求失败，耗时: ${fetchElapsedTime}ms`,
                        fetchError
                    );
                    if (fetchError.name === "AbortError") {
                        throw new Error("API请求超时（55秒）");
                    }
                    throw fetchError;
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                console.log("[Image API] API返回数据:", data);

                // 根据 provider 提取图片URL
                let imageUrl = null;
                if (provider === "gemini") {
                    // Gemini 响应格式（文本生成，需要从文本中提取URL）
                    const generatedContent =
                        data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                    if (generatedContent) {
                        imageUrl = this.extractImageUrl(generatedContent);
                    }
                } else {
                    // OpenAI 图片生成 API 响应格式（DALL-E 格式）
                    // 响应格式：{ data: [{ url: "..." }] }
                    if (
                        data.data &&
                        Array.isArray(data.data) &&
                        data.data.length > 0
                    ) {
                        imageUrl = data.data[0].url;
                        console.log(
                            "[Image API] 从图片生成API响应中提取URL:",
                            imageUrl
                        );
                    } else if (data.url) {
                        // 兼容单URL格式
                        imageUrl = data.url;
                        console.log(
                            "[Image API] 从图片生成API响应中提取URL（单URL格式）:",
                            imageUrl
                        );
                    } else {
                        // 尝试从文本响应中提取（兼容文本生成API）
                        const generatedContent =
                            data.choices?.[0]?.message?.content ||
                            data.choices?.[0]?.text ||
                            "";
                        if (generatedContent) {
                            imageUrl = this.extractImageUrl(generatedContent);
                        }
                    }
                }

                if (imageUrl) {
                    return imageUrl;
                } else {
                    // 如果无法提取URL，抛出错误以使用备用方案
                    throw new Error("无法从API响应中提取图片URL");
                }
            } catch (error) {
                console.error("[Image API] 调用图片生成API失败:", error);
                throw error;
            }
        }

        /**
         * 从文本中提取图片URL
         */
        extractImageUrl(text) {
            if (!text) return null;

            // 方法1: 直接匹配 http/https URL
            const urlPattern =
                /https?:\/\/[^\s<>"{}|\\^`\[\]]+\.(jpg|jpeg|png|gif|webp|bmp)/i;
            const urlMatch = text.match(urlPattern);
            if (urlMatch) {
                return urlMatch[0];
            }

            // 方法2: 匹配 markdown 格式的图片链接
            const markdownPattern = /!\[.*?\]\((https?:\/\/[^\)]+)\)/i;
            const markdownMatch = text.match(markdownPattern);
            if (markdownMatch) {
                return markdownMatch[1];
            }

            // 方法3: 匹配 HTML img 标签
            const imgPattern = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/i;
            const imgMatch = text.match(imgPattern);
            if (imgMatch) {
                return imgMatch[1];
            }

            // 方法4: 匹配纯URL（不包含扩展名，可能是API返回的临时URL）
            const pureUrlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/i;
            const pureUrlMatch = text.match(pureUrlPattern);
            if (pureUrlMatch) {
                return pureUrlMatch[0];
            }

            return null;
        }

        /**
         * 使用硅基流动 API 调用 Kolors 模型生成图片
         * @param {string} imageDescription - 图片描述（中文）
         * @param {Object} options - 可选参数
         * @param {string} options.negativePrompt - 负向提示词（可选）
         * @param {number} options.seed - 随机种子（可选）
         * @returns {Promise<string>} 返回生成的图片URL
         */
        async generateImageWithKolors(imageDescription, options = {}) {
            const apiKey = this.apiConfig.kolorsApiKey || "";
            const model = "Kwai-Kolors/Kolors"; // 固定使用 Kolors 模型

            if (!apiKey) {
                throw new Error("请先配置硅基流动 API Key（在设置页面配置）");
            }

            try {
                // 获取配置参数
                // 图片尺寸优先从 options 获取（由世界书或生成时指定），如果没有才使用默认值
                let imageSize = options.imageSize || options.size || "512x512"; // 默认值，但优先使用传入的尺寸

                // 转换尺寸格式：将 × 转换为 x（API 要求使用小写字母 x，格式：512x512）
                imageSize = imageSize
                    .replace(/×/g, "x")
                    .replace(/X/g, "x")
                    .toLowerCase();

                // 验证尺寸格式（应该是 widthxheight，例如 512x512）
                const sizePattern = /^\d+x\d+$/;
                if (!sizePattern.test(imageSize)) {
                    console.warn(
                        "[Image API] 图片尺寸格式不正确，使用默认值 512x512:",
                        imageSize
                    );
                    imageSize = "512x512";
                }

                const numInferenceSteps =
                    options.numInferenceSteps ||
                    this.apiConfig.kolorsNumInferenceSteps ||
                    19;
                const guidanceScale =
                    options.guidanceScale ||
                    this.apiConfig.kolorsGuidanceScale ||
                    4.0;

                // 组合正向提示词和用户描述
                let finalPrompt = imageDescription;
                const positivePrompt =
                    options.positivePrompt ||
                    options.style ||
                    options.stylePrefix ||
                    this.apiConfig.kolorsPositivePrompt ||
                    (this.apiConfig.imagePrefixes &&
                        this.apiConfig.imagePrefixes.kolors) ||
                    DEFAULT_IMAGE_PREFIXES.kolors ||
                    "";

                if (positivePrompt && positivePrompt.trim()) {
                    // 如果正向提示词存在，组合成完整提示词
                    finalPrompt = `${positivePrompt.trim()}, ${imageDescription}`;
                }

                // 获取负向提示词（优先使用传入的，否则使用配置的）
                const negativePrompt =
                    options.negativePrompt ||
                    this.apiConfig.kolorsNegativePrompt ||
                    "";

                const seed =
                    options.seed !== undefined ? options.seed : undefined;

                console.log(
                    "[Image API] 使用 Kolors 模型（通过硅基流动）生成图片:",
                    {
                        model: model,
                        imageSize: imageSize,
                        numInferenceSteps: numInferenceSteps,
                        guidanceScale: guidanceScale,
                        hasPositivePrompt: !!positivePrompt,
                        hasNegativePrompt: !!negativePrompt,
                        prompt: finalPrompt.substring(0, 100) + "...",
                    }
                );

                // 构建请求体
                const requestBody = {
                    model: model,
                    prompt: finalPrompt, // 使用组合后的提示词
                    image_size: imageSize, // API 要求格式：512x512（小写字母 x）
                    num_inference_steps: numInferenceSteps,
                    guidance_scale: guidanceScale,
                };

                // 可选参数
                if (negativePrompt && negativePrompt.trim()) {
                    requestBody.negative_prompt = negativePrompt.trim();
                }
                if (seed !== undefined) {
                    requestBody.seed = seed;
                }

                const response = await fetch(
                    "https://api.siliconflow.cn/v1/images/generations",
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${apiKey}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(requestBody),
                    }
                );

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error("[Image API] 硅基流动 API 错误:", {
                        status: response.status,
                        error: errorText,
                    });

                    // 如果是额度用完，给出友好提示
                    if (response.status === 402 || response.status === 429) {
                        throw new Error(
                            "硅基流动免费额度已用完，请等待重置或升级账户"
                        );
                    }

                    throw new Error(
                        `硅基流动 API 错误: ${
                            response.status
                        } - ${errorText.substring(0, 200)}`
                    );
                }

                const data = await response.json();

                // 根据 API 文档，响应格式是 { images: [{ url: "..." }], timings: {...}, seed: ... }
                if (data.images && data.images.length > 0) {
                    const imageUrl = data.images[0].url;
                    console.log(
                        "[Image API] ✅ Kolors 图片生成成功（通过硅基流动）"
                    );
                    return imageUrl;
                } else {
                    throw new Error("硅基流动返回结果为空");
                }
            } catch (error) {
                console.error("[Image API] Kolors 生成失败:", error);
                throw error;
            }
        }

        /**
         * 使用智谱 AI（open.bigmodel.cn）生成图片
         * @param {string} imageDescription - 图片描述
         * @param {Object} options - 可选参数
         * @returns {Promise<string>} 返回图片URL或 dataURL
         */
        async generateImageWithZhipu(imageDescription, options = {}) {
            const apiKey = this.apiConfig.zhipuApiKey || "";
            const model =
                options.model ||
                this.apiConfig.zhipuModel ||
                "cogview-3-flash";

            if (!apiKey) {
                throw new Error("请先配置智谱 API Key（open.bigmodel.cn）");
            }

            let imageSize = options.imageSize || options.size || "1024x1024";
            imageSize = imageSize.replace(/×/g, "x").replace(/X/g, "x");
            const sizePattern = /^(\d+)x(\d+)$/;
            let width = 1024;
            let height = 1024;
            if (sizePattern.test(imageSize)) {
                const match = imageSize.match(sizePattern);
                width = parseInt(match[1], 10);
                height = parseInt(match[2], 10);
                // 规则：512-2048 且能被16整除，且像素不超过 2^21
                const clamp = (v) => {
                    const clamped = Math.min(Math.max(v, 512), 2048);
                    return clamped - (clamped % 16);
                };
                width = clamp(width);
                height = clamp(height);
                if (width * height > Math.pow(2, 21)) {
                    width = 1024;
                    height = 1024;
                }
            }
            imageSize = `${width}x${height}`;

            let finalPrompt = imageDescription;
            const stylePrefix =
                options.stylePrefix ||
                options.style ||
                (this.apiConfig.imagePrefixes &&
                    this.apiConfig.imagePrefixes.zhipu) ||
                DEFAULT_IMAGE_PREFIXES.zhipu;

            if (stylePrefix && stylePrefix.trim()) {
                finalPrompt = `${stylePrefix.trim()}, ${imageDescription}`;
            }

            const quality = options.quality || "standard";
            const watermark =
                options.watermark_enabled !== undefined
                    ? options.watermark_enabled
                    : undefined;

            const requestBody = {
                model: model,
                prompt: finalPrompt,
                size: imageSize,
                quality: quality,
            };

            if (options.negativePrompt) {
                requestBody.negative_prompt = options.negativePrompt;
            }
            if (options.seed !== undefined) {
                requestBody.seed = options.seed;
            }
            if (watermark !== undefined) {
                requestBody.watermark_enabled = watermark;
            }

            console.log("[Image API] 使用智谱生成图片:", {
                model,
                imageSize,
                hasStylePrefix: !!stylePrefix,
            });

            const response = await fetch(
                "https://open.bigmodel.cn/api/paas/v4/images/generations",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(requestBody),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `智谱 API 调用失败：${response.status} ${errorText.substring(
                        0,
                        200
                    )}`
                );
            }

            const data = await response.json();
            let imageUrl = null;
            if (data?.data && data.data.length) {
                const item = data.data[0];
                imageUrl =
                    item.url ||
                    item.image_url ||
                    (item.b64_json
                        ? `data:image/png;base64,${item.b64_json}`
                        : null);
            } else if (data?.output && data.output.length) {
                const item = data.output[0];
                imageUrl =
                    item.url ||
                    item.image_url ||
                    (item.b64_json
                        ? `data:image/png;base64,${item.b64_json}`
                        : null);
            }

            if (!imageUrl) {
                throw new Error("智谱返回为空，未找到图片链接");
            }

            return imageUrl;
        }

        /**
         * 使用 pollinations.ai 生成图片（备用方案）
         * 添加队列机制避免速率限制
         * @param {string} imageDescription - 图片描述（中文）
         * @param {Object} options - 可选参数
         * @returns {Promise<string>} 返回 pollinations.ai 的图片URL
         */
        generateImageWithPollinations(imageDescription, options = {}) {
            return new Promise((resolve, reject) => {
                // 将任务加入队列
                this.pollinationsQueue.push({
                    description: imageDescription,
                    options: options,
                    resolve: resolve,
                    reject: reject,
                });

                // 处理队列
                this.processPollinationsQueue();
            });
        }

        /**
         * 处理 pollinations.ai 请求队列（避免速率限制）
         */
        async processPollinationsQueue() {
            // 如果正在处理，等待
            if (this.pollinationsProcessing) {
                return;
            }

            this.pollinationsProcessing = true;

            while (this.pollinationsQueue.length > 0) {
                const task = this.pollinationsQueue.shift();

                try {
                    // 构建完整提示词
                    const defaultStyle =
                        (this.apiConfig.imagePrefixes &&
                            this.apiConfig.imagePrefixes.pollinations) ||
                        DEFAULT_IMAGE_PREFIXES.pollinations;
                    const style = task.options.style || defaultStyle;
                    const fullPrompt = `${style}, ${task.description}`;

                    // 使用URL编码的描述
                    const encodedDescription = encodeURIComponent(fullPrompt);
                    const imageUrl = `https://image.pollinations.ai/prompt/${encodedDescription}`;

                    console.log(
                        "[Image API] 使用 pollinations.ai 生成图片:",
                        imageUrl
                    );

                    // 解析成功
                    task.resolve(imageUrl);

                    // 延迟一下，避免速率限制（每张图片间隔1秒）
                    if (this.pollinationsQueue.length > 0) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, 1000)
                        );
                    }
                } catch (error) {
                    console.error(
                        "[Image API] pollinations.ai 生成失败:",
                        error
                    );
                    task.reject(error);
                }
            }

            this.pollinationsProcessing = false;
        }
    }

    // 创建全局实例
    if (!window.ImageGenerator) {
        window.ImageGenerator = new ImageGenerator();
        console.log(
            "[Image API] 图片生成器已创建并挂载到 window.ImageGenerator"
        );

        // 暴露调试方法到全局，方便在控制台调试
        window.debugImageAPIConfig = function () {
            if (window.ImageGenerator) {
                window.ImageGenerator.debugConfig();
            } else {
                console.error("[Image API] ImageGenerator 未初始化");
            }
        };
        console.log("[Image API] 调试方法已暴露: window.debugImageAPIConfig()");
    }

    // 兼容旧接口（如果存在）
    if (!window.XiaoxinAI) {
        window.XiaoxinAI = {};
    }

    // 挂载 generateImage 方法（图片生成，使用 pollinations.ai）
    if (!window.XiaoxinAI.generateImage) {
        window.XiaoxinAI.generateImage = function (options) {
            const prompt = options.prompt || options.description || "";
            if (!prompt) {
                return Promise.reject(new Error("缺少图片描述"));
            }

            // 使用图片生成器（直接使用 pollinations.ai）
            return window.ImageGenerator.generateImage(prompt, {
                style: options.style,
            });
        };
        console.log(
            "[Image API] 已挂载到 window.XiaoxinAI.generateImage（使用 pollinations.ai）"
        );
    }

    // 挂载 generateText 方法（文本生成，使用配置的 API，用于后续的微博、外卖等应用）
    if (!window.XiaoxinAI.generateText) {
        window.XiaoxinAI.generateText = function (messages, options) {
            if (!window.ImageGenerator) {
                return Promise.reject(new Error("ImageGenerator 未初始化"));
            }

            // 使用文本生成器（使用配置的 API）
            return window.ImageGenerator.generateText(messages, options);
        };
        console.log(
            "[Image API] 已挂载到 window.XiaoxinAI.generateText（使用配置的 API）"
        );
    }

    // 挂载 getSettings 和 setSettings 方法（从 XiaoxinWeChatDataHandler）
    // 由于加载顺序问题，需要延迟检查
    function mountXiaoxinAIMethods() {
        let mounted = false;

        if (
            window.XiaoxinWeChatDataHandler &&
            typeof window.XiaoxinWeChatDataHandler.getSettings === "function"
        ) {
            if (!window.XiaoxinAI.getSettings) {
                window.XiaoxinAI.getSettings = function () {
                    return window.XiaoxinWeChatDataHandler.getSettings();
                };
                console.log(
                    "[Image API] 已挂载 window.XiaoxinAI.getSettings（来自 XiaoxinWeChatDataHandler）"
                );
                mounted = true;
            }
            if (!window.XiaoxinAI.setSettings) {
                window.XiaoxinAI.setSettings = function (settings) {
                    return window.XiaoxinWeChatDataHandler.setSettings(
                        settings
                    );
                };
                console.log(
                    "[Image API] 已挂载 window.XiaoxinAI.setSettings（来自 XiaoxinWeChatDataHandler）"
                );
                mounted = true;
            }
        }

        // 挂载 fetchModels 方法（从设置中读取配置并调用 API）
        if (!window.XiaoxinAI.fetchModels) {
            window.XiaoxinAI.fetchModels = async function () {
                try {
                    // 从设置中读取配置
                    let settings = {};
                    if (window.XiaoxinAI.getSettings) {
                        settings = window.XiaoxinAI.getSettings() || {};
                    } else if (
                        window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.getSettings
                    ) {
                        settings =
                            window.XiaoxinWeChatDataHandler.getSettings() || {};
                    }

                    const apiUrl = settings.base || settings.apiUrl || "";
                    const apiKey = settings.key || settings.apiKey || "";

                    if (!apiUrl || !apiKey) {
                        throw new Error("请先填写 API 地址 和 API Key");
                    }

                    // 构建模型列表URL
                    let modelsUrl = apiUrl.trim();
                    if (!modelsUrl.endsWith("/")) {
                        modelsUrl += "/";
                    }
                    if (modelsUrl.endsWith("/v1/")) {
                        modelsUrl += "models";
                    } else if (!modelsUrl.includes("/models")) {
                        modelsUrl += "models";
                    }

                    // 构建请求头
                    const headers = {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                    };

                    console.log("[Image API] 请求模型列表:", {
                        url: modelsUrl,
                        hasApiKey: !!apiKey,
                    });

                    const response = await fetch(modelsUrl, {
                        method: "GET",
                        headers: headers,
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(
                            `HTTP ${response.status}: ${errorText}`
                        );
                    }

                    const data = await response.json();
                    console.log("[Image API] 模型列表原始响应:", data);

                    // 解析响应
                    let models = [];
                    if (data.data && Array.isArray(data.data)) {
                        // 标准OpenAI格式
                        models = data.data.map((model) => model.id);
                    } else if (Array.isArray(data)) {
                        // 直接数组格式
                        models = data.map(
                            (model) => model.id || model.name || model
                        );
                    } else {
                        throw new Error("无法解析模型列表响应");
                    }

                    console.log("[Image API] 解析后的模型列表:", models);
                    return models;
                } catch (error) {
                    console.error("[Image API] 读取模型列表失败:", error);
                    throw error;
                }
            };
            console.log("[Image API] 已挂载 window.XiaoxinAI.fetchModels");
            mounted = true;
        }

        return mounted;
    }

    // 立即尝试挂载
    if (!mountXiaoxinAIMethods()) {
        // 如果失败，延迟重试（等待 data-handler.js 加载）
        let retryCount = 0;
        const maxRetries = 20; // 最多重试20次（10秒）
        const retryInterval = setInterval(() => {
            if (mountXiaoxinAIMethods() || retryCount >= maxRetries) {
                clearInterval(retryInterval);
                if (retryCount >= maxRetries) {
                    console.warn(
                        "[Image API] 等待 XiaoxinWeChatDataHandler 超时，无法挂载 getSettings/setSettings"
                    );
                }
            }
            retryCount++;
        }, 500);
    }

    // 监听 mobileCustomAPIConfig 的配置更新事件
    if (typeof document !== "undefined") {
        document.addEventListener(
            "mobile-api-config-updated",
            function (event) {
                if (window.ImageGenerator) {
                    console.log(
                        "[Image API] 检测到API配置更新事件，重新加载配置",
                        event.detail
                    );
                    // 延迟一下，确保 mobileCustomAPIConfig 已保存
                    setTimeout(() => {
                        window.ImageGenerator.loadAPIConfig();
                        // 同步保存到酒馆全局变量
                        window.ImageGenerator.saveAPIConfig();
                        // 标记配置已加载
                        window.ImageGenerator.configLoaded = true;
                        console.log("[Image API] 配置重新加载完成，当前状态:", {
                            enabled: window.ImageGenerator.apiConfig?.enabled,
                            available: window.ImageGenerator.isAPIAvailable(),
                        });
                    }, 100);
                }
            }
        );
    }

    // 等待 custom-api-config 初始化完成后，同步配置到酒馆全局变量
    function syncConfigToGlobalVars() {
        if (window.mobileCustomAPIConfig && window.ImageGenerator) {
            // 延迟一下，确保配置已保存
            setTimeout(() => {
                window.ImageGenerator.loadAPIConfig();
            }, 1000);
        }
    }

    // 监听 custom-api-config 的初始化
    if (typeof document !== "undefined") {
        // 如果已经存在，立即同步
        if (window.mobileCustomAPIConfig) {
            syncConfigToGlobalVars();
        } else {
            // 等待初始化完成
            const checkInterval = setInterval(() => {
                if (window.mobileCustomAPIConfig) {
                    clearInterval(checkInterval);
                    syncConfigToGlobalVars();
                }
            }, 500);

            // 10秒后停止检查
            setTimeout(() => {
                clearInterval(checkInterval);
            }, 10000);
        }

        // 监听设置页面的配置更新（通过自定义事件）
        // 设置页面保存配置后可能会触发事件，或者我们可以定期检查
        let lastSettingsCheck = null;
        const checkSettingsUpdate = () => {
            if (window.ImageGenerator) {
                let currentSettings = null;
                if (
                    window.XiaoxinWeChatDataHandler &&
                    typeof window.XiaoxinWeChatDataHandler.getSettings ===
                        "function"
                ) {
                    currentSettings =
                        window.XiaoxinWeChatDataHandler.getSettings();
                } else if (
                    window.XiaoxinAI &&
                    typeof window.XiaoxinAI.getSettings === "function"
                ) {
                    currentSettings = window.XiaoxinAI.getSettings();
                }

                if (currentSettings) {
                    const settingsKey = JSON.stringify({
                        base: currentSettings.base,
                        model: currentSettings.model,
                    });
                    if (lastSettingsCheck !== settingsKey) {
                        lastSettingsCheck = settingsKey;
                        console.log(
                            "[Image API] 检测到设置页面配置更新，重新加载配置"
                        );
                        window.ImageGenerator.loadAPIConfig();
                        window.ImageGenerator.saveAPIConfig();
                    }
                }
            }
        };

        // 每2秒检查一次设置页面配置是否有更新
        setInterval(checkSettingsUpdate, 2000);
    }

    console.log("[Image API] 图片生成API模块加载完成");
})(window);
