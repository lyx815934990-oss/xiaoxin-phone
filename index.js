// ==SillyTavern Extension==
// @name         小馨手机
// @version      0.1.0
// @description  一个真实体验的悬浮手机插件，支持微信聊天、电话、短信、微博等功能
// @author       小馨肥肉

// 等待jQuery和SillyTavern加载完成
$(() => {
    console.log("[小馨手机] 开始初始化...");

    // 等待SillyTavern完全加载
    if (!window.SillyTavern) {
        console.log("[小馨手机] 等待SillyTavern启动...");
        const waitForST = setInterval(() => {
            if (window.SillyTavern) {
                clearInterval(waitForST);
                initMobilePlugin();
            }
        }, 100);
    } else {
        initMobilePlugin();
    }
});

// 初始化手机插件
function initMobilePlugin() {
    try {
        console.log("[小馨手机] SillyTavern已就绪，开始初始化手机插件...");

        // 注册扩展设置面板
        registerExtensionSettings();

        // 检查插件总开关
        var pluginEnabled =
            localStorage.getItem("xiaoxin_plugin_enabled") !== "false";
        if (!pluginEnabled) {
            console.log("[小馨手机] 插件总开关已关闭，跳过初始化");
            return;
        }

        // 加载工具函数（必须先加载 data-manager，其他模块依赖它）
        loadScript(
            "./scripts/extensions/third-party/xiaoxin-phone/utils/data-manager.js",
            () => {
                console.log("[小馨手机] 数据管理工具加载完成");
                loadScript(
                    "./scripts/extensions/third-party/xiaoxin-phone/utils/message-listener.js",
                    () => {
                        console.log("[小馨手机] 消息监听器加载完成");
                        loadScript(
                            "./scripts/extensions/third-party/xiaoxin-phone/utils/image-api.js",
                            () => {
                                // 加载手机核心脚本
                                loadScript(
                                    "./scripts/extensions/third-party/xiaoxin-phone/mobile-phone.js",
                                    () => {
                                        console.log(
                                            "[小馨手机] 手机核心脚本加载完成"
                                        );

                                        // 初始化手机实例
                                        if (
                                            typeof MobilePhone !== "undefined"
                                        ) {
                                            window.mobilePhone =
                                                new MobilePhone();
                                            console.log(
                                                "[小馨手机] 手机插件初始化完成"
                                            );

                                            // 加载设置应用的样式与脚本（用于 iOS 风格设置界面）
                                            loadCss(
                                                "./scripts/extensions/third-party/xiaoxin-phone/app/settings/settings-app.css"
                                            );
                                            loadScript(
                                                "./scripts/extensions/third-party/xiaoxin-phone/app/settings/settings-app.js",
                                                () => {
                                                    // 设置面板加载完成后，初始化设置面板逻辑
                                                    initExtensionSettingsPanel();
                                                }
                                            );

                                            // 加载微信应用的样式与脚本（先加载 account，再加载 data-handler，最后加载主应用）
                                            loadScript(
                                                "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/state/account.js",
                                                () => {
                                                    console.log(
                                                        "[小馨手机] 微信账号管理模块加载完成"
                                                    );
                                                    loadScript(
                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/api/data-handler.js",
                                                        () => {
                                                            console.log(
                                                                "[小馨手机] 微信数据处理器加载完成"
                                                            );
                                                            // 加载解析器
                                                            loadScript(
                                                                "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/api/parser.js",
                                                                () => {
                                                                    console.log(
                                                                        "[小馨手机] 微信解析器加载完成"
                                                                    );
                                                                    // 加载UI模块
                                                                    loadCss(
                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/contacts.css"
                                                                    );
                                                                    loadScript(
                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/contacts.js",
                                                                        () => {
                                                                            console.log(
                                                                                "[小馨手机] 通讯录UI模块加载完成"
                                                                            );
                                                                            // 加载聊天UI模块（chat.js 和 chat.css）
                                                                            loadCss(
                                                                                "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/chat.css"
                                                                            );
                                                                            loadScript(
                                                                                "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/chat.js",
                                                                                () => {
                                                                                    console.log(
                                                                                        "[小馨手机] 聊天UI模块加载完成"
                                                                                    );
                                                                                    // 加载AI生图模块（ai-image-generator.js）
                                                                                    loadScript(
                                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/ai-image-generator.js",
                                                                                        () => {
                                                                                            console.log(
                                                                                                "[小馨手机] AI生图模块加载完成"
                                                                                            );
                                                                                            // 加载照片消息模块（photo-message.js 和 photo-message.css）
                                                                                            loadCss(
                                                                                                "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/photo-message.css"
                                                                                            );
                                                                                            loadScript(
                                                                                                "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/photo-message.js",
                                                                                                () => {
                                                                                                    console.log(
                                                                                                        "[小馨手机] 照片消息模块加载完成"
                                                                                                    );
                                                                                                    // 加载红包UI模块（redpacket.js 和 redpacket.css）
                                                                                                    loadCss(
                                                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/redpacket.css"
                                                                                                    );
                                                                                                    loadScript(
                                                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/redpacket.js",
                                                                                                        () => {
                                                                                                            console.log(
                                                                                                                "[小馨手机] 红包UI模块加载完成"
                                                                                                            );
                                                                                                        }
                                                                                                    );
                                                                                                }
                                                                                            );
                                                                                        }
                                                                                    );
                                                                                    // 加载来电弹窗组件
                                                                                    loadCss(
                                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/incoming-call.css"
                                                                                    );
                                                                                    loadCss(
                                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/dynamic-island-call.css"
                                                                                    );
                                                                                    loadScript(
                                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/incoming-call.js",
                                                                                        () => {
                                                                                            console.log(
                                                                                                "[小馨手机] 来电弹窗组件加载完成"
                                                                                            );
                                                                                            // 加载灵动岛通话状态组件
                                                                                            loadScript(
                                                                                                "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/dynamic-island-call.js",
                                                                                                () => {
                                                                                                    console.log(
                                                                                                        "[小馨手机] 灵动岛通话状态组件加载完成"
                                                                                                    );
                                                                                                }
                                                                                            );
                                                                                            // 加载消息队列管理器（独立运行，不依赖其他模块）
                                                                                            loadScript(
                                                                                                "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/message-queue.js",
                                                                                                () => {
                                                                                                    console.log(
                                                                                                        "[小馨手机] 消息队列管理器加载完成"
                                                                                                    );
                                                                                                    // 加载微信主应用样式和脚本
                                                                                                    loadCss(
                                                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/wechat-app.css"
                                                                                                    );
                                                                                                    loadCss(
                                                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/components.css"
                                                                                                    );
                                                                                                    // 加载朋友圈发布页面样式和脚本
                                                                                                    loadCss(
                                                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/moments.css"
                                                                                                    );
                                                                                                    loadScript(
                                                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/moments.js",
                                                                                                        () => {
                                                                                                            console.log(
                                                                                                                "[小馨手机] 朋友圈发布页面模块加载完成"
                                                                                                            );
                                                                                                            // 加载设置页面样式和脚本
                                                                                                            loadCss(
                                                                                                                "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/settings.css"
                                                                                                            );
                                                                                                            loadScript(
                                                                                                                "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/settings.js",
                                                                                                                () => {
                                                                                                                    console.log(
                                                                                                                        "[小馨手机] 设置页面模块加载完成"
                                                                                                                    );
                                                                                                                    // 加载钱包页面样式和脚本
                                                                                                                    loadCss(
                                                                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/wallet.css"
                                                                                                                    );
                                                                                                                    loadScript(
                                                                                                                        "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/wallet.js",
                                                                                                                        () => {
                                                                                                                            console.log(
                                                                                                                                "[小馨手机] 钱包页面模块加载完成"
                                                                                                                            );
                                                                                                                            loadScript(
                                                                                                                                "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/components.js",
                                                                                                                                () => {
                                                                                                                                    loadScript(
                                                                                                                                "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/wechat-app.js",
                                                                                                                                () => {
                                                                                                                                    console.log(
                                                                                                                                        "[小馨手机] 微信应用加载完成"
                                                                                                                                            );
                                                                                                                                        }
                                                                                                                                    );
                                                                                                                                }
                                                                                                                            );
                                                                                                                        }
                                                                                                                    );
                                                                                                                }
                                                                                                            );
                                                                                                        }
                                                                                                    );
                                                                                                }
                                                                                            );
                                                                                        }
                                                                                    );
                                                                                }
                                                                            );
                                                                        }
                                                                    );
                                                                }
                                                            );
                                                        }
                                                    );
                                                }
                                            );
                                        } else {
                                            console.error(
                                                "[小馨手机] MobilePhone类未定义"
                                            );
                                        }
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    } catch (error) {
        console.error("[小馨手机] 初始化失败:", error);
    }
}

// 注册扩展设置面板
function registerExtensionSettings() {
    // 加载扩展设置面板样式
    loadCss("./scripts/extensions/third-party/xiaoxin-phone/extension-settings.css");

    // 等待扩展设置容器加载完成
    const waitForContainer = setInterval(() => {
        const container = document.querySelector("#extensions_settings");
        if (container) {
            clearInterval(waitForContainer);

            // 检查是否已经添加过设置面板
            if (document.getElementById("xiaoxin-mobile-settings-panel")) {
                return;
            }

            // 创建设置面板HTML
            const settingsPanel = document.createElement("div");
            settingsPanel.id = "xiaoxin-mobile-settings-panel";
            settingsPanel.innerHTML = `
                <details class="menu-section" open>
                    <summary class="menu-section-header">
                        <i class="fa-solid fa-mobile-screen-button"></i>
                        <span>小馨手机</span>
                        <i class="fa-solid fa-chevron-up menu-section-chevron"></i>
                    </summary>
                    <div class="menu-section-content">
                        <div class="form_group">
                            <label>
                                <input type="checkbox" id="xiaoxin_plugin_enabled" />
                                <span>插件总开关</span>
                            </label>
                            <small>启用或禁用小馨手机插件</small>
                        </div>
                        <div class="form_group">
                            <label for="xiaoxin_character_id_display">当前角色卡标识：</label>
                            <div style="display: flex; gap: 8px; align-items: center; margin-top: 8px;">
                                <input type="text" id="xiaoxin_character_id_display" class="text_pole" readonly style="flex: 1; background: rgba(255,255,255,0.1);" placeholder="未设置" />
                                <button id="xiaoxin_change_character_id_btn" class="menu_button">
                                    <i class="fa-solid fa-pencil"></i> 切换
                                </button>
                            </div>
                            <small>不同角色卡的数据会独立存储。点击"切换"按钮可以修改角色卡标识。</small>
                        </div>
                    </div>
                </details>
            `;

            // 添加到扩展设置容器
            container.appendChild(settingsPanel);
            console.log("[小馨手机] 扩展设置面板已注册");
        }
    }, 100);
}

// 初始化扩展设置面板逻辑
function initExtensionSettingsPanel() {
    // 等待设置面板加载
    const waitForPanel = setInterval(() => {
        const panel = document.getElementById("xiaoxin-mobile-settings-panel");
        if (panel && window.XiaoxinDataManager) {
            clearInterval(waitForPanel);

            // 加载插件总开关状态
            const enabled =
                localStorage.getItem("xiaoxin_plugin_enabled") !== "false";
            const enabledCheckbox = document.getElementById(
                "xiaoxin_plugin_enabled"
            );
            if (enabledCheckbox) {
                enabledCheckbox.checked = enabled;

                // 监听开关变化
                enabledCheckbox.addEventListener("change", function () {
                    const isEnabled = this.checked;
                    localStorage.setItem("xiaoxin_plugin_enabled", isEnabled);
                    console.log(
                        "[小馨手机] 插件总开关:",
                        isEnabled ? "已启用" : "已禁用"
                    );

                    // 同步到小手机设置页面
                    const mobileCheckbox = document.getElementById(
                        "xiaoxin_plugin_enabled_mobile"
                    );
                    if (mobileCheckbox) {
                        mobileCheckbox.checked = isEnabled;
                    }

                    if (typeof toastr !== "undefined") {
                        toastr.info(
                            isEnabled ? "插件已启用" : "插件已禁用",
                            "小馨手机",
                            { timeOut: 2000 }
                        );
                    }

                    // 如果禁用，隐藏手机
                    if (window.mobilePhone) {
                        if (!isEnabled) {
                            window.mobilePhone.hidePhone();
                        } else {
                            // 如果启用，显示手机（如果之前是隐藏的）
                            window.mobilePhone.showPhone();
                        }
                    }

                    // 如果启用且插件未初始化，重新加载页面以初始化插件
                    if (isEnabled && !window.mobilePhone) {
                        if (
                            confirm(
                                "插件已启用，需要刷新页面才能生效。是否现在刷新？"
                            )
                        ) {
                            window.location.reload();
                        }
                    }
                });
            }

            // 更新角色卡标识显示
            function updateCharacterIdDisplay() {
                const displayInput = document.getElementById(
                    "xiaoxin_character_id_display"
                );
                if (displayInput && window.XiaoxinDataManager) {
                    const currentId =
                        window.XiaoxinDataManager.getCurrentCharacterId();
                    displayInput.value = currentId || "未设置";
                }
            }

            // 初始更新
            updateCharacterIdDisplay();

            // 监听角色卡标识变化（从data-manager触发）
            if (window.XiaoxinDataManager) {
                window.XiaoxinDataManager.onCharacterChange(function (
                    newCharId,
                    oldCharId
                ) {
                    updateCharacterIdDisplay();
                });
            }

            // 切换角色卡标识按钮
            const changeBtn = document.getElementById(
                "xiaoxin_change_character_id_btn"
            );
            if (changeBtn) {
                changeBtn.addEventListener("click", function () {
                    if (window.XiaoxinDataManager) {
                        window.XiaoxinDataManager.showCharacterIdDialog()
                            .then(function (charId) {
                                updateCharacterIdDisplay();

                                // 同步到小手机设置页面（如果已打开）
                                if (
                                    window.XiaoxinSettingsApp &&
                                    typeof window.XiaoxinSettingsApp
                                        .updateCharacterIdDisplay === "function"
                                ) {
                                    window.XiaoxinSettingsApp.updateCharacterIdDisplay();
                                }

                                if (typeof toastr !== "undefined") {
                                    toastr.success(
                                        "角色卡标识已切换为：" + charId,
                                        "小馨手机",
                                        { timeOut: 3000 }
                                    );
                                }
                            })
                            .catch(function (err) {
                                // 用户取消，不显示错误
                            });
                    }
                });
            }

            // 监听来自小手机设置页面的角色卡切换事件
            // 通过自定义事件实现跨页面同步
            window.addEventListener(
                "xiaoxin-character-id-changed",
                function (event) {
                    updateCharacterIdDisplay();
                }
            );

            console.log("[小馨手机] 扩展设置面板逻辑已初始化");
        }
    }, 100);
}

// 动态加载脚本的辅助函数
function loadScript(src, callback) {
    const script = document.createElement("script");
    script.src = src;
    script.onload = callback;
    script.onerror = () => {
        console.error(`[小馨手机] 脚本加载失败: ${src}`);
    };
    document.head.appendChild(script);
}

// 动态加载样式的辅助函数
function loadCss(href) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
}
