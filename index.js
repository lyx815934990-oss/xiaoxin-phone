// ==SillyTavern Extension==
// @name         小馨手机
// @version      0.1.6
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

        // 注册扩展设置面板（始终注册，哪怕插件被禁用，也要能在界面里重新开启）
        registerExtensionSettings();
        // 初始化扩展设置面板逻辑（始终初始化，保证总开关和版本信息可用）
        initExtensionSettingsPanel();

        // 检查插件总开关
        var pluginEnabled =
            localStorage.getItem("xiaoxin_plugin_enabled") !== "false";
        if (!pluginEnabled) {
            console.log("[小馨手机] 插件总开关已关闭，仅加载设置面板，跳过其他模块初始化");
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
                        <!-- 更新提醒区域 -->
                        <div id="xiaoxin-update-notice" style="display: none; margin-bottom: 16px; padding: 12px; background: rgba(74, 158, 255, 0.15); border: 1px solid rgba(74, 158, 255, 0.3); border-radius: 6px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <i class="fa-solid fa-circle-exclamation" style="color: #4a9eff;"></i>
                                <strong style="color: #4a9eff;">发现新版本</strong>
                            </div>
                            <div style="color: rgba(255, 255, 255, 0.8); font-size: 0.9em; margin-bottom: 10px;">
                                当前版本：<span id="xiaoxin-current-version">-</span> |
                                最新版本：<span id="xiaoxin-latest-version">-</span>
                            </div>
                            <button id="xiaoxin-update-btn" class="menu_button" style="width: 100%;">
                                <i class="fa-solid fa-download"></i> 立即更新
                            </button>
                            <small style="display: block; margin-top: 8px; color: rgba(255, 255, 255, 0.6);">
                                更新将自动从 GitHub 下载最新版本<br>
                                <span style="color: rgba(255, 200, 0, 0.8);">⚠️ 如果网络无法访问 GitHub，自动更新会失败，建议使用手动更新方式</span>
                            </small>
                        </div>
                        <!-- 版本信息（无更新时显示） -->
                        <div id="xiaoxin-version-info" style="margin-bottom: 16px; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px;">
                            <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.9em;">
                                当前版本：<span id="xiaoxin-version-display">-</span>
                            </div>
                        </div>
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
                        <div class="form_group">
                            <label>
                                <input type="checkbox" id="xiaoxin_auto_update_check" />
                                <span>自动检查更新</span>
                            </label>
                            <small>启用后会在启动时自动检查 GitHub 是否有新版本。如果网络无法访问 GitHub，建议关闭此选项以避免错误提示。</small>
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
        // 只要设置面板 DOM 已经插入，就初始化逻辑；
        // DataManager 不一定存在（当插件被禁用时不会加载），相关逻辑内部再做判断
        if (panel) {
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

            // 加载自动更新检查开关状态
            const autoUpdateEnabled = localStorage.getItem("xiaoxin_auto_update_check") !== "false";
            const autoUpdateCheckbox = document.getElementById("xiaoxin_auto_update_check");
            if (autoUpdateCheckbox) {
                autoUpdateCheckbox.checked = autoUpdateEnabled;

                // 监听开关变化
                autoUpdateCheckbox.addEventListener("change", function() {
                    const isEnabled = this.checked;
                    localStorage.setItem("xiaoxin_auto_update_check", isEnabled);
                    console.log("[小馨手机] 自动更新检查:", isEnabled ? "已启用" : "已禁用");

                    if (typeof toastr !== "undefined") {
                        toastr.info(
                            isEnabled ? "已启用自动更新检查" : "已禁用自动更新检查",
                            "小馨手机",
                            { timeOut: 2000 }
                        );
                    }
                });
            }

            // 只有在启用自动更新检查时才执行版本检查
            if (autoUpdateEnabled) {
                initVersionCheck();
            } else {
                // 即使禁用自动检查，也显示当前版本
                fetch("./scripts/extensions/third-party/xiaoxin-phone/manifest.json")
                    .then(response => {
                        if (response.ok) {
                            return response.json();
                        }
                        throw new Error("无法读取 manifest.json");
                    })
                    .then(manifest => {
                        const currentVersion = manifest.version || "0.1.0";
                        const versionDisplay = document.getElementById("xiaoxin-version-display");
                        if (versionDisplay) {
                            versionDisplay.textContent = "v" + currentVersion;
                        }
                    })
                    .catch(error => {
                        console.warn("[小馨手机] 无法读取版本号:", error);
                        const versionDisplay = document.getElementById("xiaoxin-version-display");
                        if (versionDisplay) {
                            versionDisplay.textContent = "v0.1.0";
                        }
                    });
            }

            console.log("[小馨手机] 扩展设置面板逻辑已初始化");
        }
    }, 100);
}

// 版本检查和更新功能
function initVersionCheck() {
    // 获取当前版本（从 manifest.json 读取）
    fetch("./scripts/extensions/third-party/xiaoxin-phone/manifest.json")
        .then(response => {
            if (!response.ok) {
                throw new Error("无法读取 manifest.json");
            }
            return response.json();
        })
        .then(manifest => {
            const currentVersion = manifest.version || "0.1.0";

            // 显示当前版本
            const versionDisplay = document.getElementById("xiaoxin-version-display");
            if (versionDisplay) {
                versionDisplay.textContent = "v" + currentVersion;
            }

            // 检查更新
            checkForUpdates(currentVersion);
        })
        .catch(error => {
            console.warn("[小馨手机] 无法读取版本号:", error);
            // 使用默认版本号
            const currentVersion = "0.1.0";
            const versionDisplay = document.getElementById("xiaoxin-version-display");
            if (versionDisplay) {
                versionDisplay.textContent = "v" + currentVersion;
            }
            // 仍然尝试检查更新
            checkForUpdates(currentVersion);
        });
}

// 检查是否有新版本
function checkForUpdates(currentVersion) {
    const repoUrl = "https://github.com/lyx815934990-oss/xiaoxin-phone";

    // 设置超时时间（10秒）
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("网络请求超时，请检查网络连接")), 10000);
    });

    // 从 GitHub API 获取最新 release 或 tag
    // 使用 GitHub API: https://api.github.com/repos/{owner}/{repo}/releases/latest
    // 或者获取 tags: https://api.github.com/repos/{owner}/{repo}/tags
    Promise.race([
        fetch("https://api.github.com/repos/lyx815934990-oss/xiaoxin-phone/releases/latest", {
            method: "GET",
            headers: {
                "Accept": "application/vnd.github.v3+json"
            }
        }),
        timeoutPromise
    ])
        .then(response => {
            if (!response.ok) {
                // 如果没有 release，尝试获取 tags
                return Promise.race([
                    fetch("https://api.github.com/repos/lyx815934990-oss/xiaoxin-phone/tags", {
                        method: "GET",
                        headers: {
                            "Accept": "application/vnd.github.v3+json"
                        }
                    }),
                    timeoutPromise
                ])
                    .then(tagsResponse => {
                        if (!tagsResponse.ok) throw new Error("无法获取版本信息");
                        return tagsResponse.json();
                    })
                    .then(tags => {
                        if (tags && tags.length > 0) {
                            // 获取最新的 tag（去掉 'v' 前缀）
                            const latestTag = tags[0].name.replace(/^v/, "");
                            return { tag_name: latestTag, name: latestTag };
                        }
                        throw new Error("No releases or tags found");
                    });
            }
            return response.json();
        })
        .then(data => {
            const latestVersion = data.tag_name ? data.tag_name.replace(/^v/, "") : data.name.replace(/^v/, "");
            const currentVersionNum = parseVersion(currentVersion);
            const latestVersionNum = parseVersion(latestVersion);

            console.log("[小馨手机] 版本检查:", {
                current: currentVersion,
                latest: latestVersion,
                needsUpdate: compareVersions(latestVersionNum, currentVersionNum) > 0
            });

            // 显示版本信息
            const versionDisplay = document.getElementById("xiaoxin-version-display");
            if (versionDisplay) {
                versionDisplay.textContent = "v" + currentVersion;
            }

            // 如果有新版本，显示更新提醒
            if (compareVersions(latestVersionNum, currentVersionNum) > 0) {
                showUpdateNotice(currentVersion, latestVersion);
            } else {
                // 隐藏更新提醒，显示版本信息
                const updateNotice = document.getElementById("xiaoxin-update-notice");
                const versionInfo = document.getElementById("xiaoxin-version-info");
                if (updateNotice) updateNotice.style.display = "none";
                if (versionInfo) versionInfo.style.display = "block";
            }
        })
        .catch(error => {
            // 更详细的错误日志
            const errorMsg = error.message || String(error);
            console.warn("[小馨手机] 版本检查失败:", errorMsg);

            // 判断是否是网络相关错误
            const isNetworkError = errorMsg.includes("Failed to fetch") ||
                                  errorMsg.includes("网络") ||
                                  errorMsg.includes("timeout") ||
                                  errorMsg.includes("超时") ||
                                  errorMsg.includes("connect") ||
                                  errorMsg.includes("Connection was reset") ||
                                  errorMsg.includes("Recv failure");

            if (isNetworkError) {
                console.info("[小馨手机] 提示: 无法连接到 GitHub，可能是网络问题。");
                console.info("[小馨手机] 提示: 如果经常遇到此问题，可以在设置中关闭「自动检查更新」选项，避免每次启动都尝试连接 GitHub。");
            }

            // 检查失败时，至少显示当前版本
            const versionDisplay = document.getElementById("xiaoxin-version-display");
            if (versionDisplay) {
                versionDisplay.textContent = "v" + currentVersion;
            }

            // 隐藏更新提醒，显示版本信息（即使检查失败也显示当前版本）
            const updateNotice = document.getElementById("xiaoxin-update-notice");
            const versionInfo = document.getElementById("xiaoxin-version-info");
            if (updateNotice) updateNotice.style.display = "none";
            if (versionInfo) versionInfo.style.display = "block";

            // 注意：版本检查失败时不显示错误提示，避免打扰用户
            // 只有在用户主动点击更新按钮时才会显示详细错误信息
        });
}

// 显示更新提醒
function showUpdateNotice(currentVersion, latestVersion) {
    const updateNotice = document.getElementById("xiaoxin-update-notice");
    const versionInfo = document.getElementById("xiaoxin-version-info");
    const currentVersionSpan = document.getElementById("xiaoxin-current-version");
    const latestVersionSpan = document.getElementById("xiaoxin-latest-version");
    const updateBtn = document.getElementById("xiaoxin-update-btn");

    if (updateNotice && currentVersionSpan && latestVersionSpan) {
        currentVersionSpan.textContent = "v" + currentVersion;
        latestVersionSpan.textContent = "v" + latestVersion;
        updateNotice.style.display = "block";
        if (versionInfo) versionInfo.style.display = "none";

        // 绑定更新按钮事件
        if (updateBtn) {
            updateBtn.onclick = function() {
                performUpdate();
            };
        }
    }
}

// 执行更新
function performUpdate() {
    const updateBtn = document.getElementById("xiaoxin-update-btn");
    if (updateBtn) {
        updateBtn.disabled = true;
        updateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 更新中...';
    }

    const repoUrl = "https://github.com/lyx815934990-oss/xiaoxin-phone";

    // 设置超时时间（60秒，因为 Git 克隆可能需要较长时间）
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("更新超时，可能是网络连接问题")), 60000);
    });

    // 尝试调用酒馆的扩展安装 API
    // 使用 fetch 调用本地 API
    Promise.race([
        fetch("http://127.0.0.1:8000/api/extensions/install", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                url: repoUrl
            })
        }),
        timeoutPromise
    ])
    .then(response => {
        if (response.ok) {
            if (typeof toastr !== "undefined") {
                toastr.success("更新成功！页面即将刷新...", "小馨手机", { timeOut: 2000 });
            }
            // 2秒后刷新页面
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            // 尝试读取错误信息
            return response.text().then(text => {
                let errorMsg = `更新失败: HTTP ${response.status}`;
                // 检查是否是网络连接错误
                if (text.includes("Failed to connect") || text.includes("无法连接") || text.includes("443")) {
                    errorMsg = "无法连接到 GitHub，请检查网络连接或使用手动更新";
                } else if (text.includes("500")) {
                    errorMsg = "服务器错误，可能是网络问题导致无法从 GitHub 克隆仓库";
                }
                throw new Error(errorMsg);
            });
        }
    })
    .catch(error => {
        console.error("[小馨手机] 自动更新失败:", error);
        const errorMsg = error.message || String(error);

        // 判断是否是网络相关错误（包括更多错误类型）
        const isNetworkError = errorMsg.includes("Failed to connect") ||
                              errorMsg.includes("无法连接") ||
                              errorMsg.includes("443") ||
                              errorMsg.includes("timeout") ||
                              errorMsg.includes("超时") ||
                              errorMsg.includes("网络") ||
                              errorMsg.includes("Connection was reset") ||
                              errorMsg.includes("Recv failure") ||
                              errorMsg.includes("连接被重置") ||
                              errorMsg.includes("500") ||
                              errorMsg.includes("Internal Server Error");

        if (isNetworkError) {
            console.warn("[小馨手机] 网络连接失败，建议使用手动更新方式");
            console.info("[小馨手机] 提示: 如果经常遇到此问题，可以在设置中关闭「自动检查更新」选项");
        }

        handleUpdateError(errorMsg);
    });
}

// 处理更新错误（提示手动更新）
function handleUpdateError(errorMsg) {
    const updateBtn = document.getElementById("xiaoxin-update-btn");
    if (updateBtn) {
        updateBtn.disabled = false;
        updateBtn.innerHTML = '<i class="fa-solid fa-download"></i> 立即更新';
    }

    // 构建更详细的错误提示
    let message = "自动更新失败";
    let isNetworkIssue = false;

    if (errorMsg) {
        // 检查是否是网络相关错误
        isNetworkIssue = errorMsg.includes("无法连接") ||
                        errorMsg.includes("网络") ||
                        errorMsg.includes("443") ||
                        errorMsg.includes("Connection was reset") ||
                        errorMsg.includes("Recv failure") ||
                        errorMsg.includes("连接被重置") ||
                        errorMsg.includes("500") ||
                        errorMsg.includes("Internal Server Error");
    }

    if (isNetworkIssue) {
        message = "❌ 无法连接到 GitHub（网络问题）<br><br>这是网络连接问题，不是插件问题。建议：";
    } else {
        message = "自动更新失败，建议使用手动更新：";
    }

    const manualUpdateSteps = `
        <div style="margin-top: 12px; padding: 12px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; border-left: 3px solid #4a9eff;">
            <strong style="color: #4a9eff;">📥 手动更新步骤：</strong>
            <ol style="margin: 8px 0 0 0; padding-left: 20px; color: rgba(255, 255, 255, 0.9);">
                <li>访问 GitHub: <a href="https://github.com/lyx815934990-oss/xiaoxin-phone" target="_blank" style="color: #4a9eff;">点击这里</a></li>
                <li>点击绿色的 <strong>Code</strong> 按钮 → <strong>Download ZIP</strong></li>
                <li>删除旧版本文件夹: <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 3px;">public/scripts/extensions/third-party/xiaoxin-phone/</code></li>
                <li>解压 ZIP 文件，将文件夹复制到扩展目录</li>
                <li>刷新页面即可</li>
            </ol>
        </div>
        <div style="margin-top: 8px; padding: 8px; background: rgba(255, 200, 0, 0.1); border-radius: 4px; border-left: 3px solid #ffc800;">
            <small style="color: rgba(255, 200, 0, 0.9);">
                💡 提示: 如果经常遇到网络问题，可以在设置中关闭「自动检查更新」选项，避免每次启动都尝试连接 GitHub
            </small>
        </div>
    `;

    if (typeof toastr !== "undefined") {
        toastr.error(
            message + manualUpdateSteps,
            "小馨手机 - 更新失败",
            { timeOut: 15000, escapeHtml: false }
        );
    } else {
        alert(message.replace(/<br>/g, "\n").replace(/<[^>]*>/g, "") + "\n\n" +
              "手动更新步骤：\n" +
              "1. 访问 GitHub: https://github.com/lyx815934990-oss/xiaoxin-phone\n" +
              "2. 点击绿色的 Code 按钮 → Download ZIP\n" +
              "3. 删除旧版本文件夹: public/scripts/extensions/third-party/xiaoxin-phone/\n" +
              "4. 解压 ZIP 文件，将文件夹复制到扩展目录\n" +
              "5. 刷新页面即可\n\n" +
              "提示: 如果经常遇到网络问题，可以在设置中关闭「自动检查更新」选项");
    }
}

// 解析版本号为数字数组（用于比较）
function parseVersion(version) {
    return version.split(".").map(num => parseInt(num, 10) || 0);
}

// 比较两个版本号
// 返回: 1 表示 version1 > version2, -1 表示 version1 < version2, 0 表示相等
function compareVersions(version1, version2) {
    for (let i = 0; i < Math.max(version1.length, version2.length); i++) {
        const v1 = version1[i] || 0;
        const v2 = version2[i] || 0;
        if (v1 > v2) return 1;
        if (v1 < v2) return -1;
    }
    return 0;
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
