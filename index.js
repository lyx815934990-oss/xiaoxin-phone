// ==SillyTavern Extension==
// @name         小馨手机
// @version      0.1.11
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

        // 使用强壮加载器（移动端/慢环境更稳定）
        loadScript("./scripts/extensions/third-party/xiaoxin-phone/utils/robust-loader.js", () => {
            const loader = window.XiaoxinRobustLoader;
            if (!loader) {
                console.warn("[小馨手机] robust-loader 未能加载，回退到原始加载方式");
                return;
            }

            (async () => {
                // 核心模块：失败会明显影响功能，增加重试+自检
                await loader.loadScript({
                    src: "./scripts/extensions/third-party/xiaoxin-phone/utils/data-manager.js",
                    name: "data-manager",
                    retries: 3,
                    timeoutMs: 20000,
                    test: () => !!window.XiaoxinDataManager,
                    isCore: true
                });

                await loader.loadScript({
                    src: "./scripts/extensions/third-party/xiaoxin-phone/utils/message-listener.js",
                    name: "message-listener",
                    retries: 3,
                    timeoutMs: 20000,
                    test: () => !!window.XiaoxinMessageListener,
                    isCore: true
                });

                await loader.loadScript({
                    src: "./scripts/extensions/third-party/xiaoxin-phone/utils/image-api.js",
                    name: "image-api",
                    retries: 2,
                    timeoutMs: 20000,
                    isCore: true
                });

                // 手机核心
                await loader.loadScript({
                    src: "./scripts/extensions/third-party/xiaoxin-phone/mobile-phone.js",
                    name: "mobile-phone",
                    retries: 3,
                    timeoutMs: 25000,
                    test: () => typeof window.MobilePhone !== "undefined",
                    isCore: true
                });

                if (typeof window.MobilePhone !== "undefined") {
                    window.mobilePhone = new MobilePhone();
                    console.log("[小馨手机] 手机插件初始化完成（robust-loader）");
                                        } else {
                    console.error("[小馨手机] MobilePhone类未定义（robust-loader）");
                    return;
                }

                // 下面这些属于 UI/扩展模块：失败不应该阻塞核心运行，使用较少重试，且允许继续
                await loader.loadCss({ href: "./scripts/extensions/third-party/xiaoxin-phone/app/settings/settings-app.css", name: "settings-app.css", isCore: false });
                await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/settings/settings-app.js", name: "settings-app.js", retries: 2, timeoutMs: 20000, isCore: false });

                // 微信基础依赖（核心模块）
                await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/state/account.js", name: "wechat-account", retries: 2, timeoutMs: 20000, isCore: true });
                await loader.loadScript({
                    src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/api/data-handler.js",
                    name: "wechat-data-handler",
                    retries: 3,
                    timeoutMs: 25000,
                    test: () => !!window.XiaoxinWeChatDataHandler,
                    isCore: true
                });
                await loader.loadScript({
                    src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/api/parser.js",
                    name: "wechat-parser",
                    retries: 3,
                    timeoutMs: 25000,
                    test: () => !!window.XiaoxinWeChatParser,
                    isCore: true
                });

                // 核心模块加载完成，检查状态并显示弹窗
                showLoadStatusDialog(loader);

                // 微信 UI（延迟一点再加载，减少首屏压力）
                setTimeout(async () => {
                    await loader.loadCss({ href: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/contacts.css", name: "contacts.css", isCore: false });
                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/contacts.js", name: "contacts.js", retries: 2, timeoutMs: 25000, isCore: false });

                    await loader.loadCss({ href: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/chat.css", name: "chat.css", isCore: false });
                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/chat.js", name: "chat.js", retries: 2, timeoutMs: 30000, isCore: false });

                    // 其他 UI 模块（更低优先级）
                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/ai-image-generator.js", name: "ai-image-generator.js", retries: 1, timeoutMs: 25000, isCore: false });
                    await loader.loadCss({ href: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/photo-message.css", name: "photo-message.css", isCore: false });
                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/photo-message.js", name: "photo-message.js", retries: 1, timeoutMs: 25000, isCore: false });

                    await loader.loadCss({ href: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/redpacket.css", name: "redpacket.css", isCore: false });
                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/redpacket.js", name: "redpacket.js", retries: 1, timeoutMs: 25000, isCore: false });

                    await loader.loadCss({ href: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/incoming-call.css", name: "incoming-call.css", isCore: false });
                    await loader.loadCss({ href: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/dynamic-island-call.css", name: "dynamic-island-call.css", isCore: false });
                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/incoming-call.js", name: "incoming-call.js", retries: 1, timeoutMs: 25000, isCore: false });
                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/dynamic-island-call.js", name: "dynamic-island-call.js", retries: 1, timeoutMs: 25000, isCore: false });

                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/message-queue.js", name: "message-queue.js", retries: 1, timeoutMs: 25000, isCore: false });

                    await loader.loadCss({ href: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/wechat-app.css", name: "wechat-app.css", isCore: false });
                    await loader.loadCss({ href: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/components.css", name: "components.css", isCore: false });

                    await loader.loadCss({ href: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/moments.css", name: "moments.css", isCore: false });
                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/moments.js", name: "moments.js", retries: 1, timeoutMs: 30000, isCore: false });

                    await loader.loadCss({ href: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/settings.css", name: "wechat-settings.css", isCore: false });
                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/settings.js", name: "wechat-settings.js", retries: 1, timeoutMs: 25000, isCore: false });

                    await loader.loadCss({ href: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/wallet.css", name: "wallet.css", isCore: false });
                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/wallet.js", name: "wallet.js", retries: 1, timeoutMs: 25000, isCore: false });

                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/ui/components.js", name: "wechat-ui-components.js", retries: 1, timeoutMs: 25000, isCore: false });
                    await loader.loadScript({ src: "./scripts/extensions/third-party/xiaoxin-phone/app/wechat/wechat-app.js", name: "wechat-app.js", retries: 1, timeoutMs: 30000, isCore: false });

                    console.log("[小馨手机] 微信应用加载完成（robust-loader）");
                }, 800);
            })();
        });
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
                            <div style="color: rgba(255, 255, 255, 0.8); font-size: 0.9em; margin-bottom: 6px;">
                                当前版本：<span id="xiaoxin-current-version">-</span> |
                                最新版本：<span id="xiaoxin-latest-version">-</span>
                            </div>
                            <div style="display:flex; justify-content: space-between; align-items:center; gap:8px; margin-bottom: 8px;">
                                <button id="xiaoxin-update-btn" class="menu_button" style="flex:1;">
                                <i class="fa-solid fa-download"></i> 立即更新
                            </button>
                                <button id="xiaoxin-release-notes-btn" class="menu_button menu_button-secondary" style="white-space: nowrap;">
                                    更新说明
                                </button>
                            </div>
                            <small style="display: block; margin-top: 4px; color: rgba(255, 255, 255, 0.6);">
                                更新将自动从 GitHub 下载最新版本<br>
                                <a id="xiaoxin-release-link" href="https://github.com/lyx815934990-oss/xiaoxin-phone/releases" target="_blank" style="color: #4a9eff; text-decoration: underline;">在 GitHub 查看完整更新说明</a><br>
                                <span style="color: rgba(255, 200, 0, 0.8);">⚠️ 如果网络无法访问 GitHub，自动更新会失败，建议使用手动更新方式</span>
                            </small>
                        </div>
                        <!-- 更新说明弹窗 -->
                        <div id="xiaoxin-release-modal" style="display:none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 9999; align-items: center; justify-content: center;">
                            <div style="background: #202533; padding: 16px 18px; border-radius: 8px; max-width: 680px; width: 92%; max-height: 80vh; box-shadow: 0 10px 30px rgba(0,0,0,0.6); display:flex; flex-direction:column;">
                                <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 8px;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <i class="fa-solid fa-list" style="color:#4a9eff;"></i>
                                        <strong style="color:#fff; font-size: 1em;">小馨手机 - 更新说明</strong>
                                    </div>
                                    <button id="xiaoxin-release-modal-close" class="menu_button" style="padding:2px 8px; min-width:auto;">
                                        关闭
                                    </button>
                                </div>
                                <div id="xiaoxin-release-modal-content" style="flex:1; overflow-y:auto; padding:8px; margin-top:4px; background: rgba(0,0,0,0.25); border-radius:4px; font-size:0.9em; line-height:1.5;"></div>
                                <div style="margin-top:8px; font-size:0.8em; color:rgba(255,255,255,0.7);">
                                    提示：仅显示你当前版本（含）之后、最新版本（含）之间的所有更新记录。完整内容请前往 GitHub 查看。
                                </div>
                            </div>
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
                        <!-- 插件使用教程链接 -->
                        <div class="form_group" style="margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <i class="fa-solid fa-book" style="color: #4a9eff;"></i>
                                <strong style="color: rgba(255, 255, 255, 0.9);">插件使用教程</strong>
                            </div>
                            <a href="https://www.notion.so/2ddd29002fd980b8bc5ddd61efffa292?source=copy_link"
                               target="_blank"
                               style="display: inline-flex; align-items: center; gap: 6px; color: #4a9eff; text-decoration: none; padding: 8px 12px; background: rgba(74, 158, 255, 0.1); border-radius: 6px; border: 1px solid rgba(74, 158, 255, 0.3); transition: all 0.2s;">
                                <i class="fa-solid fa-external-link-alt"></i>
                                <span>查看完整使用教程</span>
                            </a>
                            <small style="display: block; margin-top: 8px; color: rgba(255, 255, 255, 0.6);">
                                包含插件安装、配置、功能使用等详细说明
                            </small>
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

    // 从 GitHub API 获取所有 releases（按发布时间倒序）
    // 使用 GitHub API: https://api.github.com/repos/{owner}/{repo}/releases
    Promise.race([
        fetch("https://api.github.com/repos/lyx815934990-oss/xiaoxin-phone/releases", {
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
            if (!Array.isArray(data) || data.length === 0) {
                throw new Error("未找到任何 Release");
            }

            const currentVersionNum = parseVersion(currentVersion);

            // 解析所有 Release，提取版本号、说明、链接
            const parsedReleases = data
                .map(item => {
                    const rawVersion = (item.tag_name || item.name || "").replace(/^v/, "");
                    const version = rawVersion || "0.0.0";
                    return {
                        version,
                        versionNum: parseVersion(version),
                        body: typeof item.body === "string" ? item.body.trim() : "",
                        url: item.html_url || repoUrl + "/releases",
                        publishedAt: item.published_at || item.created_at || ""
                    };
                })
                .sort((a, b) => {
                    // GitHub 默认已按时间排序，这里再按版本号从高到低保险一下
                    return compareVersions(b.versionNum, a.versionNum);
                });

            // 找出所有“比当前版本新的” Release，用于弹窗展示
            const newerReleases = parsedReleases.filter(r => compareVersions(r.versionNum, currentVersionNum) >= 0);
            const latest = newerReleases[0] || parsedReleases[0];

            console.log("[小馨手机] 版本检查:", {
                current: currentVersion,
                latest: latest.version,
                needsUpdate: compareVersions(latest.versionNum, currentVersionNum) > 0
            });

            // 显示版本信息
            const versionDisplay = document.getElementById("xiaoxin-version-display");
            if (versionDisplay) {
                versionDisplay.textContent = "v" + currentVersion;
            }

            // 如果有新版本，显示更新提醒
            if (compareVersions(latest.versionNum, currentVersionNum) > 0) {
                showUpdateNotice(currentVersion, latest.version, newerReleases);
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
// releases: 包含从当前版本（含）到最新版本（含）的所有 Release 信息
function showUpdateNotice(currentVersion, latestVersion, releases) {
    const updateNotice = document.getElementById("xiaoxin-update-notice");
    const versionInfo = document.getElementById("xiaoxin-version-info");
    const currentVersionSpan = document.getElementById("xiaoxin-current-version");
    const latestVersionSpan = document.getElementById("xiaoxin-latest-version");
    const updateBtn = document.getElementById("xiaoxin-update-btn");
    const releaseLink = document.getElementById("xiaoxin-release-link");
    const releaseNotesBtn = document.getElementById("xiaoxin-release-notes-btn");
    const releaseModal = document.getElementById("xiaoxin-release-modal");
    const releaseModalClose = document.getElementById("xiaoxin-release-modal-close");
    const releaseModalContent = document.getElementById("xiaoxin-release-modal-content");

    if (updateNotice && currentVersionSpan && latestVersionSpan) {
        currentVersionSpan.textContent = "v" + currentVersion;
        latestVersionSpan.textContent = "v" + latestVersion;
        updateNotice.style.display = "block";
        if (versionInfo) versionInfo.style.display = "none";

        // Release 链接（指向最新版本）
        if (releaseLink && Array.isArray(releases) && releases.length > 0) {
            releaseLink.href = releases[0].url || releaseLink.href;
        }

        // 更新说明弹窗内容
        if (Array.isArray(releases) && releases.length > 0 && releaseModalContent) {
            const htmlParts = releases.map(rel => {
                const title = `v${rel.version}`;
                const date = rel.publishedAt ? new Date(rel.publishedAt).toLocaleString() : "";
                let body = rel.body || "（此版本未提供详细说明）";

                // 将 Markdown 更新说明转换为适合在面板中展示的普通文本
                // - 去掉 ``` 代码块包裹，避免在酒馆里被当成整块代码显示
                // - 保留其它文本及换行
                body = body
                    // 去掉形如 ``` 或 ```lang 开头的代码块标记
                    .replace(/```[a-zA-Z0-9_-]*\s*[\r\n]?/g, "")
                    // 去掉结尾的 ``` 标记
                    .replace(/```/g, "");

                const maxLength = 1200;
                if (body.length > maxLength) {
                    body = body.slice(0, maxLength) + "\n…（内容过长，已截断，更多内容请在 GitHub 上查看）";
                }
                return `
                    <div style="margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                        <div style="display:flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 4px;">
                            <strong style="color:#4a9eff;">${title}</strong>
                            <span style="font-size:0.8em; color:rgba(255,255,255,0.6);">${date}</span>
                        </div>
                        <div style="margin:0; white-space: pre-wrap; color: rgba(255,255,255,0.88); font-family: inherit; line-height: 1.5;">
                            ${body}
                        </div>
                    </div>
                `;
            });
            releaseModalContent.innerHTML = htmlParts.join("") || "<div>暂无更新说明。</div>";
        }

        // 绑定弹窗开关
        if (releaseNotesBtn && releaseModal) {
            releaseNotesBtn.onclick = function () {
                releaseModal.style.display = "flex";
            };
        }
        if (releaseModalClose && releaseModal) {
            releaseModalClose.onclick = function () {
                releaseModal.style.display = "none";
            };
        }

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
    const extensionId = "xiaoxin-phone"; // 扩展文件夹名

    // 设置超时时间（60秒，因为 Git 克隆可能需要较长时间）
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("更新超时，可能是网络连接问题")), 60000);
    });

    // 优先使用酒馆助手提供的更新函数（已处理权限和地址适配）
    let updatePromise;
    let updateMethod = ""; // 记录使用的更新方式，用于错误提示

    // 策略：优先使用 installExtension（从 GitHub 重新安装），这样可以覆盖本地文件安装的情况
    if (typeof installExtension === "function") {
        // 使用 installExtension 从 GitHub 重新安装（推荐，兼容本地文件和 Git 安装）
        console.info("[小馨手机] 使用酒馆助手 installExtension 函数从 GitHub 重新安装");
        updateMethod = "installExtension";
        updatePromise = installExtension(repoUrl, "local");
    } else if (typeof updateExtension === "function") {
        // 如果 installExtension 不可用，尝试 updateExtension（仅适用于从 Git 安装的扩展）
        console.info("[小馨手机] 使用酒馆助手 updateExtension 函数更新");
        updateMethod = "updateExtension";
        updatePromise = updateExtension(extensionId);
    } else if (typeof reinstallExtension === "function") {
        // 如果都不行，尝试 reinstallExtension
        console.info("[小馨手机] 使用酒馆助手 reinstallExtension 函数重新安装");
        updateMethod = "reinstallExtension";
        updatePromise = reinstallExtension(extensionId);
    } else {
        // 回退到直接调用 API（兼容旧版本或未安装酒馆助手的情况）
        console.warn("[小馨手机] ⚠️ 酒馆助手函数不可用，回退到直接调用 API（可能被 403 拦截）");
        updateMethod = "direct_api";
        const apiBaseUrl = window.location.origin;
        const installApiUrl = apiBaseUrl + "/api/extensions/install";
        console.info("[小馨手机] 更新请求地址:", installApiUrl);

        updatePromise = fetch(installApiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                url: repoUrl
            })
        });
    }

    Promise.race([
        updatePromise,
        timeoutPromise
    ])
    .then(async response => {
        // 检查 response 是否是 Response 对象
        if (response && typeof response.ok !== "undefined") {
            // 这是 fetch 返回的 Response 对象
        if (response.ok) {
            if (typeof toastr !== "undefined") {
                toastr.success("更新成功！页面即将刷新...", "小馨手机", { timeOut: 2000 });
            }
            // 2秒后刷新页面
            setTimeout(() => {
                window.location.reload();
            }, 2000);
                return;
        } else {
            // 尝试读取错误信息
                const text = await response.text();
                let errorMsg = `更新失败: HTTP ${response.status}`;

                // 根据状态码给出更明确的错误提示
                if (response.status === 403) {
                    errorMsg = "后端禁止网页端自动安装扩展（403 Forbidden）。请使用手动更新方式：下载 ZIP 文件后解压覆盖插件文件夹。";
                } else if (response.status === 404) {
                    errorMsg = "更新接口不存在（404）。可能是 SillyTavern 版本过旧，不支持自动更新。请使用手动更新方式。";
                } else if (response.status === 500) {
                    errorMsg = "服务器错误（500）。可能是后端无法从 GitHub 克隆仓库（网络问题）。请检查网络连接或使用手动更新方式。";
                } else if (text.includes("Failed to connect") || text.includes("无法连接") || text.includes("443")) {
                    errorMsg = "无法连接到酒馆后端服务器。请检查：1) 服务器是否正在运行；2) 网络连接是否正常；3) 地址是否正确。";
                } else if (text.includes("500") || text.includes("Internal Server Error")) {
                    errorMsg = "服务器内部错误。可能是后端无法从 GitHub 克隆仓库（网络问题）。建议使用手动更新方式。";
                }

                throw new Error(errorMsg);
            }
        } else {
            // 可能是其他类型的响应，直接当作成功处理
            if (typeof toastr !== "undefined") {
                toastr.success("更新成功！页面即将刷新...", "小馨手机", { timeOut: 2000 });
            }
            setTimeout(() => {
                window.location.reload();
            }, 2000);
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
                              errorMsg.includes("Failed to fetch") ||
                              errorMsg.includes("NetworkError");

        // 如果是直接调用 API 且出现 403，给出更明确的提示
        if (updateMethod === "direct_api" && errorMsg.includes("403")) {
            console.warn("[小馨手机] ⚠️ 后端禁止直接调用 API（403 Forbidden）");
            console.info("[小馨手机] 💡 建议：安装酒馆助手以获得更好的更新体验");
            console.info("[小馨手机] 检测到的函数状态:", {
                updateExtension: typeof updateExtension !== "undefined",
                reinstallExtension: typeof reinstallExtension !== "undefined",
                installExtension: typeof installExtension !== "undefined",
                getExtensionInstallationInfo: typeof getExtensionInstallationInfo !== "undefined"
            });
        }

        if (isNetworkError) {
            console.warn("[小馨手机] 网络连接失败，建议使用手动更新方式");
            console.info("[小馨手机] 提示: 如果经常遇到此问题，可以在设置中关闭「自动检查更新」选项");
        }

        handleUpdateError(errorMsg, updateMethod);
    });
}

// 处理更新错误（提示手动更新）
function handleUpdateError(errorMsg, updateMethod) {
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

    // 根据错误类型给出更具体的提示
    if (errorMsg.includes("403") || errorMsg.includes("Forbidden")) {
        message = "❌ 后端禁止自动更新（403 Forbidden）<br><br>你的 SillyTavern 后端不允许网页端自动安装扩展。这是安全设置，不是插件问题。<br><br>建议使用手动更新方式：";
    } else if (errorMsg.includes("404")) {
        message = "❌ 更新接口不存在（404）<br><br>你的 SillyTavern 版本可能过旧，不支持自动更新功能。<br><br>建议使用手动更新方式：";
    } else if (errorMsg.includes("500") || errorMsg.includes("服务器错误")) {
        message = "❌ 服务器内部错误（500）<br><br>后端无法从 GitHub 克隆仓库，可能是网络问题或服务器配置问题。<br><br>建议使用手动更新方式：";
    } else     // 根据更新方式和错误类型给出更具体的提示
    if (updateMethod === "direct_api" && errorMsg.includes("403")) {
        message = "❌ 后端禁止直接调用 API（403 Forbidden）<br><br>" +
                  "你的 SillyTavern 后端不允许网页端直接调用扩展安装接口。<br><br>" +
                  "<strong style='color: #4a9eff;'>💡 解决方案：</strong><br>" +
                  "1. <strong>推荐：</strong>安装「酒馆助手」扩展，可以获得更好的自动更新体验<br>" +
                  "2. <strong>备选：</strong>使用手动更新方式（见下方步骤）<br><br>" +
                  "如果插件是通过 GitHub 链接安装的，安装酒馆助手后可以正常自动更新。";
    } else if (isNetworkIssue) {
        message = "❌ 网络连接失败<br><br>无法连接到酒馆后端服务器。请检查：<br>1) 服务器是否正在运行<br>2) 网络连接是否正常<br>3) 地址是否正确<br><br>建议使用手动更新方式：";
    } else {
        message = "❌ 自动更新失败<br><br>建议使用手动更新方式：";
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

// 显示加载状态弹窗
function showLoadStatusDialog(loader) {
    if (!loader || typeof loader.getLoadStatus !== "function") {
        console.warn("[小馨手机] 无法获取加载状态，跳过弹窗显示");
        return;
    }

    const status = loader.getLoadStatus();
    const failedCore = status.failedCore || [];
    const failedUI = status.failedUI || [];
    const allCoreSuccess = status.allCoreSuccess;

    // 创建弹窗HTML
    const modalId = "xiaoxin-load-status-modal";
    let existingModal = document.getElementById(modalId);
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement("div");
    modal.id = modalId;
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif;
        padding: 20px;
        box-sizing: border-box;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
    `;

    let contentHtml = "";
    let titleIcon = "";
    let titleText = "";
    let titleColor = "";

    if (allCoreSuccess) {
        // 全部核心模块加载成功
        titleIcon = '<i class="fa-solid fa-circle-check" style="color: #4caf50;"></i>';
        titleText = "✅ 插件加载完成";
        titleColor = "#4caf50";
        contentHtml = `
            <!-- 可滚动的内容区域 -->
            <div style="
                flex: 1 1 auto;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 20px;
                padding-bottom: 16px;
                -webkit-overflow-scrolling: touch;
                min-height: 0;
                text-align: center;
            ">
                <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
                <h3 style="color: ${titleColor}; margin: 0 0 12px 0; font-size: 20px; font-weight: 600;">
                    ${titleIcon} ${titleText}
                </h3>
                <p style="color: rgba(255, 255, 255, 0.9); margin: 0 0 20px 0; font-size: 14px; line-height: 1.6;">
                    所有核心模块已成功加载，插件可以完全正常使用！<br>
                    <small style="color: rgba(255, 255, 255, 0.6);">加载耗时: ${(status.totalTime / 1000).toFixed(1)} 秒</small>
                </p>
            </div>
            <!-- 固定在底部的按钮区域 -->
            <div style="
                padding: 16px 20px 20px 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                background: #202533;
                flex-shrink: 0;
                text-align: center;
            ">
                <button id="xiaoxin-load-status-close" class="menu_button" style="min-width: 120px; touch-action: manipulation;">
                    知道了
                </button>
            </div>
        `;
    } else {
        // 有核心模块加载失败
        titleIcon = '<i class="fa-solid fa-triangle-exclamation" style="color: #ff9800;"></i>';
        titleText = "⚠️ 插件加载异常";
        titleColor = "#ff9800";

        let failedListHtml = "";
        failedCore.forEach(function(mod) {
            let errorMsg = mod.error || "未知错误";
            if (errorMsg === "timeout") errorMsg = "加载超时（网络或设备性能问题）";
            else if (errorMsg === "error") errorMsg = "脚本加载失败（文件不存在或网络错误）";
            else if (errorMsg.indexOf("test_failed") !== -1) errorMsg = "全局对象未创建（脚本执行异常）";

            failedListHtml += `
                <div style="padding: 10px; margin-bottom: 8px; background: rgba(255, 152, 0, 0.15); border-left: 3px solid #ff9800; border-radius: 4px;">
                    <div style="font-weight: 600; color: #ff9800; margin-bottom: 4px;">
                        <i class="fa-solid fa-xmark-circle"></i> ${mod.name}
                    </div>
                    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.8); line-height: 1.5;">
                        错误原因: ${errorMsg}
                    </div>
                </div>
            `;
        });

        if (failedUI.length > 0) {
            failedListHtml += `
                <div style="margin-top: 16px; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px;">
                    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-bottom: 6px;">
                        <strong>UI模块加载失败（不影响核心功能）:</strong>
                    </div>
            `;
            failedUI.forEach(function(mod) {
                let errorMsg = mod.error || "未知错误";
                if (errorMsg === "timeout") errorMsg = "加载超时";
                else if (errorMsg === "error") errorMsg = "加载失败";
                failedListHtml += `
                    <div style="font-size: 11px; color: rgba(255, 255, 255, 0.6); margin-left: 12px; margin-bottom: 4px;">
                        • ${mod.name}: ${errorMsg}
                    </div>
                `;
            });
            failedListHtml += `</div>`;
        }

        contentHtml = `
            <!-- 可滚动的内容区域 -->
            <div style="
                flex: 1 1 auto;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 20px;
                padding-bottom: 16px;
                -webkit-overflow-scrolling: touch;
                min-height: 0;
                max-width: 500px;
                margin: 0 auto;
            ">
                <h3 style="color: ${titleColor}; margin: 0 0 16px 0; font-size: 18px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    ${titleIcon} ${titleText}
                </h3>
                <p style="color: rgba(255, 255, 255, 0.9); margin: 0 0 16px 0; font-size: 14px; line-height: 1.6;">
                    以下核心模块加载失败，可能导致部分功能无法正常使用：
                </p>
                <div style="max-height: 300px; overflow-y: auto; margin-bottom: 16px;">
                    ${failedListHtml}
                </div>
                <div style="padding: 12px; background: rgba(74, 158, 255, 0.15); border-left: 3px solid #4a9eff; border-radius: 4px; margin-bottom: 16px;">
                    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.9); line-height: 1.6;">
                        <strong style="color: #4a9eff;">💡 建议解决方案：</strong><br>
                        1. 检查网络连接是否正常<br>
                        2. 尝试刷新页面重新加载<br>
                        3. 如果问题持续，请检查浏览器控制台是否有更多错误信息<br>
                        4. 确保插件文件完整，未被浏览器拦截或损坏
                    </div>
                </div>
            </div>
            <!-- 固定在底部的按钮区域 -->
            <div style="
                padding: 16px 20px 20px 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                background: #202533;
                flex-shrink: 0;
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            ">
                <button id="xiaoxin-load-status-retry" class="menu_button menu_button-secondary" style="min-width: 100px; touch-action: manipulation;">
                    重试加载
                </button>
                <button id="xiaoxin-load-status-close" class="menu_button" style="min-width: 100px; touch-action: manipulation;">
                    知道了
                </button>
            </div>
        `;
    }

    modal.innerHTML = `
        <div style="
            background: #202533;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            max-width: 600px;
            width: 100%;
            max-height: calc(100vh - 40px);
            min-height: 200px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            margin: auto;
        ">
            ${contentHtml}
        </div>
    `;

    document.body.appendChild(modal);

    // 绑定关闭按钮
    const closeBtn = document.getElementById("xiaoxin-load-status-close");
    if (closeBtn) {
        closeBtn.addEventListener("click", function() {
            modal.remove();
        });
    }

    // 绑定重试按钮（仅失败时显示）
    const retryBtn = document.getElementById("xiaoxin-load-status-retry");
    if (retryBtn) {
        retryBtn.addEventListener("click", function() {
            modal.remove();
            console.info("[小馨手机] 用户点击重试加载，刷新页面...");
            setTimeout(function() {
                window.location.reload();
            }, 300);
        });
    }

    // 点击背景关闭（成功时允许，失败时也允许，避免一直遮挡界面）
    modal.addEventListener("click", function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // 成功时3秒后自动关闭
    if (allCoreSuccess) {
        setTimeout(function() {
            if (document.getElementById(modalId)) {
                modal.remove();
            }
        }, 3000);
    }
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
