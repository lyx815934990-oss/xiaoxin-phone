// 设置应用 - JavaScript（iPhone 风格设置）

window.XiaoxinSettingsApp = (function () {
    function render($container, mobilePhone) {
        // 传进来可能是 jQuery 对象或原生元素，这里统一成 jQuery
        var $root = $('<div class="xiaoxin-settings-root"></div>');

        // ========== 主页导航卡片 + 主动发送线上消息配置 ==========
        // - 导航卡片：设置页顶部快捷入口，点击后滚动定位到对应配置区
        // - 主动发送线上消息：控制 auto-generator.js 的自动触发门禁（避免新聊天开头就生成）
        var AUTO_ONLINE_CONFIG_KEY = "xiaoxin_auto_online_config";
        var defaultAutoOnlineConfig = {
            enabled: false,
            thresholdRounds: 6, // 对话达到多少“轮”（user+assistant 配对）触发一次
            contextLookbackFloors: 24, // 参考剧情楼层（监听上下文的楼层数）
        };

        function _safeParseJson(str) {
            try {
                return JSON.parse(str);
            } catch (e) {
                return null;
            }
        }

        function loadAutoOnlineConfig() {
            var cfg = null;
            // 优先：酒馆全局变量
            if (typeof getVariables === "function") {
                try {
                    var gd = getVariables({ type: "global" }) || {};
                    if (gd && gd[AUTO_ONLINE_CONFIG_KEY]) {
                        cfg = gd[AUTO_ONLINE_CONFIG_KEY];
                    }
                } catch (e) {
                    console.warn(
                        "[小馨手机-设置] 读取主动发送线上消息配置失败（全局变量）:",
                        e
                    );
                }
            }
            // 兜底：localStorage
            if (!cfg) {
                try {
                    var raw = localStorage.getItem(AUTO_ONLINE_CONFIG_KEY);
                    if (raw) cfg = _safeParseJson(raw);
                } catch (e2) {
                    console.warn(
                        "[小馨手机-设置] 读取主动发送线上消息配置失败（localStorage）:",
                        e2
                    );
                }
            }
            cfg = cfg && typeof cfg === "object" ? cfg : {};
            return {
                enabled: !!cfg.enabled,
                thresholdRounds:
                    Number.isFinite(Number(cfg.thresholdRounds)) &&
                    Number(cfg.thresholdRounds) > 0
                        ? Number(cfg.thresholdRounds)
                        : defaultAutoOnlineConfig.thresholdRounds,
                contextLookbackFloors:
                    Number.isFinite(Number(cfg.contextLookbackFloors)) &&
                    Number(cfg.contextLookbackFloors) > 0
                        ? Number(cfg.contextLookbackFloors)
                        : defaultAutoOnlineConfig.contextLookbackFloors,
            };
        }

        function saveAutoOnlineConfig(cfg) {
            var safeCfg = {
                enabled: !!cfg.enabled,
                thresholdRounds: Math.max(
                    1,
                    parseInt(cfg.thresholdRounds, 10) ||
                        defaultAutoOnlineConfig.thresholdRounds
                ),
                contextLookbackFloors: Math.max(
                    1,
                    parseInt(cfg.contextLookbackFloors, 10) ||
                        defaultAutoOnlineConfig.contextLookbackFloors
                ),
            };
            // 保存到酒馆全局变量（优先）
            if (
                typeof getVariables === "function" &&
                typeof replaceVariables === "function"
            ) {
                try {
                    var gd = getVariables({ type: "global" }) || {};
                    gd[AUTO_ONLINE_CONFIG_KEY] = JSON.parse(
                        JSON.stringify(safeCfg)
                    );
                    replaceVariables(gd, { type: "global" });
                } catch (e) {
                    console.warn(
                        "[小馨手机-设置] 写入主动发送线上消息配置失败（全局变量）:",
                        e
                    );
                }
            }
            // 兜底：localStorage
            try {
                localStorage.setItem(
                    AUTO_ONLINE_CONFIG_KEY,
                    JSON.stringify(safeCfg)
                );
            } catch (e2) {
                console.warn(
                    "[小馨手机-设置] 写入主动发送线上消息配置失败（localStorage）:",
                    e2
                );
            }
            // 通知外部模块刷新
            try {
                window.dispatchEvent(
                    new CustomEvent("xiaoxin-auto-online-config-changed", {
                        detail: safeCfg,
                    })
                );
            } catch (e3) {
                /* ignore */
            }
            return safeCfg;
        }

        // 导航卡片（滚动定位）
        var $navTitle = $(
            '<div class="xiaoxin-settings-section-title">导航卡片</div>'
        );
        var $navGroup = $('<div class="xiaoxin-settings-group"></div>');

        // 导航卡片：只显示玩家选中的配置区块，避免页面过长
        var NAV_SELECTED_KEY = "xiaoxin_settings_nav_selected";

        function _saveSelectedNav(key) {
            try {
                localStorage.setItem(NAV_SELECTED_KEY, String(key || ""));
            } catch (e) {
                // ignore
            }
        }

        function _loadSelectedNav() {
            try {
                return localStorage.getItem(NAV_SELECTED_KEY) || "";
            } catch (e) {
                return "";
            }
        }

        function showConfigPanel(panelKey) {
            var key = String(panelKey || "");
            // 切换面板时保持当前滚动位置，不要跳回顶部
            var containerEl = $container && $container[0] ? $container[0] : null;
            var prevScrollTop = containerEl ? containerEl.scrollTop || 0 : 0;
            var showImage = key === "image-api";
            var showText = key === "text-api";
            var showAuto = key === "auto-online";

            // 生文 API
            $apiTitle.toggle(showText);
            $apiGroup.toggle(showText);
            $apiDesc.toggle(showText);

            // 生图 API（生图模型 + Kolors）
            $imageModelTitle.toggle(showImage);
            $imageModelGroup.toggle(showImage);
            $imageModelDesc.toggle(showImage);
            // Kolors 生图配置：只有玩家点了“生图 API”且当前模型选择为 kolors 才显示
            if (showImage) {
                try {
                    if (typeof toggleKolorsSection === "function") {
                        toggleKolorsSection();
                    } else {
                        // 兜底：如果函数尚不可用，先隐藏，避免默认铺开
                        $kolorsTitle.hide();
                        $kolorsGroup.hide();
                        $kolorsDesc.hide();
                    }
                } catch (e) {
                    $kolorsTitle.hide();
                    $kolorsGroup.hide();
                    $kolorsDesc.hide();
                }
            } else {
                $kolorsTitle.hide();
                $kolorsGroup.hide();
                $kolorsDesc.hide();
            }

            // 主动发送线上消息
            $autoOnlineTitle.toggle(showAuto);
            $autoOnlineGroup.toggle(showAuto);
            $autoOnlineDesc.toggle(showAuto);

            _saveSelectedNav(key);
            // DOM 高度变化可能导致滚动抖动，异步恢复一次
            if (containerEl) {
                setTimeout(function () {
                    try {
                        containerEl.scrollTop = prevScrollTop;
                    } catch (e) {
                        // ignore
                    }
                }, 0);
            }
        }

        function makeNavRow(label, panelKey) {
            var $row = $('<div class="xiaoxin-settings-row"></div>');
            $row.css("cursor", "pointer");
            $row.append(
                '<div class="xiaoxin-settings-row-label">' + label + "</div>"
            );
            $row.append(
                '<div class="xiaoxin-settings-row-control" style="color:#8e8e93;"><i class="fa-solid fa-chevron-right"></i></div>'
            );
            $row.on("click", function () {
                showConfigPanel(panelKey);
            });
            return $row;
        }

        // 主动发送线上消息配置
        var $autoOnlineTitle = $(
            '<div class="xiaoxin-settings-section-title">主动发送线上消息配置</div>'
        );
        $autoOnlineTitle.attr("id", "xiaoxin-settings-section-auto-online");
        var $autoOnlineGroup = $('<div class="xiaoxin-settings-group"></div>');

        var $autoOnlineRowEnable = $('<div class="xiaoxin-settings-row"></div>');
        $autoOnlineRowEnable.append(
            '<div class="xiaoxin-settings-row-label">启用</div>'
        );
        var $autoOnlineEnableControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $autoOnlineEnableSwitch = $(
            '<input type="checkbox" style="width:auto;margin:0;">'
        );
        $autoOnlineEnableControl.append($autoOnlineEnableSwitch);
        $autoOnlineRowEnable.append($autoOnlineEnableControl);

        var $autoOnlineRowThreshold = $('<div class="xiaoxin-settings-row"></div>');
        $autoOnlineRowThreshold.append(
            '<div class="xiaoxin-settings-row-label">自动发送楼层阈值（轮）</div>'
        );
        var $autoOnlineThresholdControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $autoOnlineThresholdInput = $(
            '<input type="number" min="1" step="1" placeholder="例如：6">'
        );
        $autoOnlineThresholdControl.append($autoOnlineThresholdInput);
        $autoOnlineRowThreshold.append($autoOnlineThresholdControl);

        var $autoOnlineRowLookback = $('<div class="xiaoxin-settings-row"></div>');
        $autoOnlineRowLookback.append(
            '<div class="xiaoxin-settings-row-label">参考剧情楼层</div>'
        );
        var $autoOnlineLookbackControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $autoOnlineLookbackInput = $(
            '<input type="number" min="1" step="1" placeholder="例如：24">'
        );
        $autoOnlineLookbackControl.append($autoOnlineLookbackInput);
        $autoOnlineRowLookback.append($autoOnlineLookbackControl);

        var $autoOnlineRowSave = $('<div class="xiaoxin-settings-row"></div>');
        $autoOnlineRowSave.append(
            '<div class="xiaoxin-settings-row-label">保存配置</div>'
        );
        var $autoOnlineSaveControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $autoOnlineSaveBtn = $(
            '<button class="xiaoxin-settings-button">保存</button>'
        );
        $autoOnlineSaveControl.append($autoOnlineSaveBtn);
        $autoOnlineRowSave.append($autoOnlineSaveControl);

        var $autoOnlineDesc = $(
            '<div class="xiaoxin-settings-subtext" style="padding:8px 16px 12px;">开启后：当对话回合数达到“阈值”时，插件会自动监听最近“参考剧情楼层”的正文剧情，在最新剧情中输出符合当前剧情的线上消息指令（如微信私聊/朋友圈/互动等）。<br><br><strong>建议：</strong>阈值不宜过低（避免新聊天开头触发）。<br><br><strong>参考配置（按你想要的效果选一套）：</strong><br>1）<strong>偏“克制、少打扰”</strong>：阈值 10~20 轮；参考剧情 18~30 楼。适合长剧情，线上消息只在关键节点出现。<br>2）<strong>偏“活人感、偶尔插入”</strong>：阈值 6~10 轮；参考剧情 24~36 楼。适合日常聊天，偶尔发微信/朋友圈。<br>3）<strong>偏“频繁在线互动”</strong>（不推荐新手）：阈值 3~6 轮；参考剧情 30~48 楼。更容易连发，建议搭配更强的剧情约束。</div>'
        );

        $autoOnlineGroup.append(
            $autoOnlineRowEnable,
            $autoOnlineRowThreshold,
            $autoOnlineRowLookback,
            $autoOnlineRowSave
        );

        // ========== 壁纸设置 ==========
        var $wallpaperTitle = $(
            '<div class="xiaoxin-settings-section-title">壁纸</div>'
        );
        var $wallpaperGroup = $('<div class="xiaoxin-settings-group"></div>');

        // 行1：壁纸 URL
        var $rowUrl = $('<div class="xiaoxin-settings-row"></div>');
        $rowUrl.append(
            '<div class="xiaoxin-settings-row-label">壁纸 URL</div>'
        );
        var $urlControl = $('<div class="xiaoxin-settings-row-control"></div>');
        var $urlInput = $('<input type="url" placeholder="https://...">');
        $urlControl.append($urlInput);
        $rowUrl.append($urlControl);

        // 行2：本地上传 + 预览
        var $rowUpload = $('<div class="xiaoxin-settings-row"></div>');
        $rowUpload.append(
            '<div class="xiaoxin-settings-row-label">本地上传</div>'
        );
        var $uploadControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $fileInput = $(
            '<input type="file" accept="image/*" style="display:none;">'
        );
        var $uploadBtn = $(
            '<button class="xiaoxin-settings-button">选择图片</button>'
        );
        var $preview = $(
            '<div class="xiaoxin-wallpaper-preview"><div class="xiaoxin-wallpaper-preview-inner"></div></div>'
        );
        $uploadControl.append($uploadBtn, $fileInput, $preview);
        $rowUpload.append($uploadControl);

        // 行3：缩放和位置
        var $rowAdjust = $('<div class="xiaoxin-settings-row"></div>');
        $rowAdjust.append(
            '<div class="xiaoxin-settings-row-label">裁剪与缩放</div>'
        );
        var $adjustControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $scaleLabel = $('<div class="xiaoxin-settings-subtext">缩放</div>');
        var $scaleRange = $(
            '<input class="xiaoxin-settings-range" type="range" min="0.8" max="1.4" step="0.01" value="1">'
        );
        var $offsetLabel = $(
            '<div class="xiaoxin-settings-subtext">垂直位置</div>'
        );
        var $offsetRange = $(
            '<input class="xiaoxin-settings-range" type="range" min="-50" max="50" step="1" value="0">'
        );
        $adjustControl.append(
            $scaleLabel,
            $scaleRange,
            $offsetLabel,
            $offsetRange
        );
        $rowAdjust.append($adjustControl);

        $wallpaperGroup.append($rowUrl, $rowUpload, $rowAdjust);

        // ========== 手机整体尺寸 ==========
        var $sizeTitle = $(
            '<div class="xiaoxin-settings-section-title">显示与亮度</div>'
        );
        var $sizeGroup = $('<div class="xiaoxin-settings-group"></div>');
        var $sizeRow = $('<div class="xiaoxin-settings-row"></div>');
        $sizeRow.append(
            '<div class="xiaoxin-settings-row-label">手机整体尺寸</div>'
        );
        var $sizeControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $sizeRange = $(
            '<input class="xiaoxin-settings-range" type="range" min="0.7" max="1.1" step="0.01" value="' +
                (mobilePhone.phoneScale || 0.8) +
                '">'
        );
        $sizeControl.append($sizeRange);
        $sizeRow.append($sizeControl);
        $sizeGroup.append($sizeRow);

        // ========== 插件总开关 ==========
        var $pluginTitle = $(
            '<div class="xiaoxin-settings-section-title">插件设置</div>'
        );
        var $pluginGroup = $('<div class="xiaoxin-settings-group"></div>');

        var $pluginRow = $('<div class="xiaoxin-settings-row"></div>');
        $pluginRow.append(
            '<div class="xiaoxin-settings-row-label">插件总开关</div>'
        );
        var $pluginControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $pluginSwitch = $(
            '<input type="checkbox" id="xiaoxin_plugin_enabled_mobile" style="width: auto; margin: 0;">'
        );

        // 加载插件开关状态
        var pluginEnabled =
            localStorage.getItem("xiaoxin_plugin_enabled") !== "false";
        $pluginSwitch.prop("checked", pluginEnabled);

        // 监听开关变化
        $pluginSwitch.on("change", function () {
            var isEnabled = $(this).prop("checked");
            localStorage.setItem("xiaoxin_plugin_enabled", isEnabled);
            console.log(
                "[小馨手机] 插件总开关:",
                isEnabled ? "已启用" : "已禁用"
            );

            // 同步到扩展设置面板
            var extensionCheckbox = document.getElementById(
                "xiaoxin_plugin_enabled"
            );
            if (extensionCheckbox) {
                extensionCheckbox.checked = isEnabled;
            }

            showToast(isEnabled ? "插件已启用" : "插件已禁用");

            // 如果禁用，隐藏手机
            if (window.mobilePhone && !isEnabled) {
                window.mobilePhone.hidePhone();
            }
        });

        $pluginControl.append($pluginSwitch);
        $pluginRow.append($pluginControl);
        $pluginGroup.append($pluginRow);

        var $pluginDesc = $(
            '<div class="xiaoxin-settings-subtext" style="padding:8px 16px 12px;">启用或禁用小馨手机插件。禁用后，手机界面将隐藏。</div>'
        );

        // ========== 角色卡数据管理 ==========
        var $dataTitle = $(
            '<div class="xiaoxin-settings-section-title">数据管理</div>'
        );
        var $dataGroup = $('<div class="xiaoxin-settings-group"></div>');

        // 当前角色卡显示行
        var $currentCharRow = $('<div class="xiaoxin-settings-row"></div>');
        $currentCharRow.append(
            '<div class="xiaoxin-settings-row-label">当前角色卡</div>'
        );
        var $currentCharControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $currentCharDisplay = $(
            '<div style="color: #666; font-size: 14px;">-</div>'
        );
        $currentCharControl.append($currentCharDisplay);
        $currentCharRow.append($currentCharControl);

        // 切换角色卡按钮行
        var $switchCharRow = $('<div class="xiaoxin-settings-row"></div>');
        $switchCharRow.append(
            '<div class="xiaoxin-settings-row-label">切换角色卡</div>'
        );
        var $switchCharControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $switchCharBtn = $(
            '<button class="xiaoxin-settings-button">选择/输入角色卡标识</button>'
        );
        $switchCharControl.append($switchCharBtn);
        $switchCharRow.append($switchCharControl);

        // 更新当前角色卡显示（同步到扩展设置面板）
        function updateCurrentCharDisplay() {
            if (window.XiaoxinDataManager) {
                var currentId =
                    window.XiaoxinDataManager.getCurrentCharacterId();
                if (currentId) {
                    $currentCharDisplay.text(currentId).css("color", "#333");
                } else {
                    $currentCharDisplay.text("未设置").css("color", "#999");
                }

                // 同步到扩展设置面板
                var extensionDisplay = document.getElementById(
                    "xiaoxin_character_id_display"
                );
                if (extensionDisplay) {
                    extensionDisplay.value = currentId || "未设置";
                }
            }
        }

        // 初始化显示
        updateCurrentCharDisplay();

        // 切换角色卡按钮点击事件
        $switchCharBtn.on("click", function () {
            if (!window.XiaoxinDataManager) {
                showToast("数据管理器未加载，请刷新页面重试");
                return;
            }

            window.XiaoxinDataManager.showCharacterIdDialog()
                .then(function (charId) {
                    updateCurrentCharDisplay();

                    // 触发自定义事件，通知扩展设置面板更新
                    var event = new CustomEvent(
                        "xiaoxin-character-id-changed",
                        {
                            detail: { characterId: charId },
                        }
                    );
                    window.dispatchEvent(event);

                    showToast("已切换到角色卡：" + charId);
                })
                .catch(function (err) {
                    // 用户取消，不显示错误
                });
        });

        // 监听角色卡切换事件，更新显示
        if (window.XiaoxinDataManager) {
            window.XiaoxinDataManager.onCharacterChange(function (
                newCharId,
                oldCharId
            ) {
                updateCurrentCharDisplay();
            });
        }

        $dataGroup.append($currentCharRow, $switchCharRow);

        var $dataDesc = $(
            '<div class="xiaoxin-settings-subtext" style="padding:8px 16px 12px;">不同角色卡的数据会独立存储。切换角色卡后，微信账号、聊天记录等数据都会切换到对应角色卡的数据。</div>'
        );

        // ========== 生文 API 设置 ==========
        var $apiTitle = $(
            '<div class="xiaoxin-settings-section-title">生文 API</div>'
        );
        $apiTitle.attr("id", "xiaoxin-settings-section-text-api");
        var $apiGroup = $('<div class="xiaoxin-settings-group"></div>');

        var $apiRowUrl = $('<div class="xiaoxin-settings-row"></div>');
        $apiRowUrl.append(
            '<div class="xiaoxin-settings-row-label">API 地址</div>'
        );
        var $apiUrlControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        // 与酒馆中的自定义端点保持一致，完全由用户手动输入，插件不自动拼接 /v1 等后缀
        var $apiUrlInput = $(
            '<input type="url" placeholder="与酒馆自定义端点相同，例如：https://lmhub.fatui.xyz/v1">'
        );
        $apiUrlControl.append($apiUrlInput);
        $apiRowUrl.append($apiUrlControl);

        var $apiRowKey = $('<div class="xiaoxin-settings-row"></div>');
        $apiRowKey.append(
            '<div class="xiaoxin-settings-row-label">API Key</div>'
        );
        var $apiKeyControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $apiKeyInput = $(
            '<input type="text" placeholder="与酒馆中配置的密钥保持一致">'
        );
        $apiKeyControl.append($apiKeyInput);
        $apiRowKey.append($apiKeyControl);

        // 模型名称（与酒馆里的模型设置保持一致，纯手动输入）
        var $apiRowModel = $('<div class="xiaoxin-settings-row"></div>');
        $apiRowModel.append(
            '<div class="xiaoxin-settings-row-label">模型名称</div>'
        );
        var $apiModelControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $apiModelInput = $(
            '<input type="text" placeholder="例如：gemini-3-flash-preview">'
        );
        $apiModelControl.append($apiModelInput);
        $apiRowModel.append($apiModelControl);

        // 模型列表行：按钮 + 下拉框（可选，从 XiaoxinAI.fetchModels 读取）
        var $apiRowModels = $('<div class="xiaoxin-settings-row"></div>');
        $apiRowModels.append(
            '<div class="xiaoxin-settings-row-label">模型列表</div>'
        );
        var $apiModelsControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $apiModelsBtn = $(
            '<button class="xiaoxin-settings-button" style="margin-right:8px;">读取模型</button>'
        );
        var $apiModelSelect = $(
            '<select class="xiaoxin-settings-select" style="background-color: #f2f2f7 !important; color: #000 !important; border: 1px solid #d1d1d6; border-radius: 8px; padding: 6px 8px; font-size: 13px; outline: none; min-width: 150px;"><option value="">选择模型</option></select>'
        );
        $apiModelsControl.append($apiModelsBtn, $apiModelSelect);
        $apiRowModels.append($apiModelsControl);

        // 保存/测试按钮行（只做本地保存，不调用外部 API）
        var $apiRowTest = $('<div class="xiaoxin-settings-row"></div>');
        $apiRowTest.append(
            '<div class="xiaoxin-settings-row-label">保存配置</div>'
        );
        var $apiTestControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $apiTestBtn = $(
            '<button class="xiaoxin-settings-button">测试并保存</button>'
        );
        $apiTestControl.append($apiTestBtn);
        $apiRowTest.append($apiTestControl);

        var $apiDesc = $(
            '<div class="xiaoxin-settings-subtext" style="padding:8px 16px 12px;">这里的 API 地址、API Key、模型名称建议与酒馆主界面中的自定义端点配置保持一致。插件只保存这些配置，不会自动拼接 /v1 等后缀。若后端支持 /models 接口，可通过“读取模型”按钮拉取模型列表并快速选择。<br><br><strong>注意：</strong>此 API 配置仅用于手机内部操作（如生成玩家历史朋友圈、优化图片描述、生成微博内容等），不会将任何内容输入到酒馆正文中。</div>'
        );

        // ========== 生图模型选择 ==========
        var IMAGE_MODEL_CONFIG_KEY = "mobile_image_model_config";
        var defaultImagePrefixes = {
            kolors: "best quality, masterpiece, ultra-detailed, 8k resolution, anime style, moe aesthetic, soft and smooth lineart, low contrast, gentle shading, painterly effect, soft color palette",
            zhipu: "best quality, masterpiece, ultra-detailed, 8k resolution, anime style, moe aesthetic, soft and smooth lineart, low contrast, gentle shading, painterly effect, soft color palette",
            pollinations: "anime style illustration, clean crisp lines, simple elegant composition, soft gentle shading, high quality detailed artwork, professional illustration, clean background, no messy lines, no clutter, no extra details, well-drawn, smooth flowing lines, clear sharp details, 8k resolution, best quality, masterpiece",
        };

        var $imageModelTitle = $(
            '<div class="xiaoxin-settings-section-title">生图模型</div>'
        );
        $imageModelTitle.attr("id", "xiaoxin-settings-section-image-api");
        var $imageModelGroup = $('<div class="xiaoxin-settings-group"></div>');

        var $imageModelRow = $('<div class="xiaoxin-settings-row"></div>');
        $imageModelRow.append(
            '<div class="xiaoxin-settings-row-label">选择模型</div>'
        );
        var $imageModelControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $imageModelSelect = $(
            '<select class="xiaoxin-settings-select" style="background-color: #f2f2f7 !important; color: #000 !important; border: 1px solid #d1d1d6; border-radius: 8px; padding: 6px 8px; font-size: 13px; outline: none; min-width: 200px;">' +
                '<option value="kolors">Kolors（硅基流动）</option>' +
                '<option value="zhipu">智谱 AI</option>' +
                '<option value="pollinations">pollinations.ai（免费）</option>' +
                "</select>"
        );
        $imageModelControl.append($imageModelSelect);
        $imageModelRow.append($imageModelControl);

        var $imagePrefixRow = $('<div class="xiaoxin-settings-row"></div>');
        $imagePrefixRow.append(
            '<div class="xiaoxin-settings-row-label">风格前缀</div>'
        );
        var $imagePrefixControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $imagePrefixInput = $(
            '<textarea rows="3" placeholder="不同模型的默认前缀会自动带上，可自行微调" style="width: 100%; min-height: 60px; resize: vertical; font-size: 13px; padding: 6px 8px; border: 1px solid #d1d1d6; border-radius: 8px; background-color: #f2f2f7; color: #000;"></textarea>'
        );
        $imagePrefixControl.append($imagePrefixInput);
        $imagePrefixRow.append($imagePrefixControl);

        var $zhipuKeyRow = $('<div class="xiaoxin-settings-row"></div>');
        $zhipuKeyRow.append(
            '<div class="xiaoxin-settings-row-label">智谱 API Key</div>'
        );
        var $zhipuKeyControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $zhipuKeyInput = $(
            '<input type="text" placeholder="前往 https://open.bigmodel.cn/ 控制台获取 API Key">'
        );
        $zhipuKeyControl.append($zhipuKeyInput);
        $zhipuKeyRow.append($zhipuKeyControl);

        var $zhipuModelRow = $('<div class="xiaoxin-settings-row"></div>');
        $zhipuModelRow.append(
            '<div class="xiaoxin-settings-row-label">智谱模型</div>'
        );
        var $zhipuModelControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $zhipuModelInput = $(
            '<input type="text" placeholder="例如：cogview-3-flash 或官方最新图像模型">'
        );
        $zhipuModelControl.append($zhipuModelInput);
        $zhipuModelRow.append($zhipuModelControl);

        var $imageModelSaveRow = $('<div class="xiaoxin-settings-row"></div>');
        $imageModelSaveRow.append(
            '<div class="xiaoxin-settings-row-label">保存模型</div>'
        );
        var $imageModelSaveControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $imageModelSaveBtn = $(
            '<button class="xiaoxin-settings-button">保存生图模型配置</button>'
        );
        $imageModelSaveControl.append($imageModelSaveBtn);
        $imageModelSaveRow.append($imageModelSaveControl);

        var $imageModelDesc = $(
            '<div class="xiaoxin-settings-subtext" style="padding:8px 16px 12px;">选择一个生图模型，默认会附加对应的风格前缀。Kolors 与智谱默认使用同一套高质量二次元前缀，pollinations.ai 使用简洁的动漫插画前缀。智谱的官方调用站点为 <a href="https://open.bigmodel.cn/" target="_blank">open.bigmodel.cn</a>。</div>'
        );

        var modelInfo = {
            kolors:
                "Kolors（硅基流动）适合中文二次元场景，免费额度充足，支持负向提示词与步数、CFG 等参数，可生成较柔和的国风/日漫质感。",
            zhipu:
                "智谱大模型图像生成（open.bigmodel.cn）提供稳定的通用画风，适合精细角色立绘与场景，需自备 API Key，模型名如 cogview-3 或官方最新版本。",
            pollinations:
                "pollinations.ai 免费无 Key，速度快但不可控度较低，适合作为备用方案，默认携带精简动漫插画前缀，偏干净线条与纯色背景。",
        };

        var $modelInfoList = $(
            '<div style="padding: 8px 12px; display: grid; gap: 8px;"></div>'
        );
        ["kolors", "zhipu", "pollinations"].forEach(function (key) {
            var labelMap = {
                kolors: "Kolors 生图效果说明",
                zhipu: "智谱生图效果说明",
                pollinations: "pollinations.ai 生图效果说明",
            };
            var $card = $(
                '<div style="padding:10px 12px; background:#f2f2f7; border:1px solid #e5e5ea; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:space-between;">' +
                    '<span style="font-size:13px;color:#111;">' +
                    labelMap[key] +
                    "</span>" +
                    '<span style="color:#8e8e93;"><i class="fa-solid fa-chevron-right"></i></span>' +
                    "</div>"
            );
            $card.on("click", function () {
                showModelInfoDialog(labelMap[key], modelInfo[key]);
            });
            $modelInfoList.append($card);
        });

        $imageModelGroup.append(
            $imageModelRow,
            $imagePrefixRow,
            $zhipuKeyRow,
            $zhipuModelRow,
            $imageModelSaveRow,
            $modelInfoList
        );

        $apiGroup.append(
            $apiRowUrl,
            $apiRowKey,
            $apiRowModel,
            $apiRowModels,
            $apiRowTest
        );

        // ========== 硅基流动 Kolors 生图配置 ==========
        var $kolorsTitle = $(
            '<div class="xiaoxin-settings-section-title">Kolors 生图（硅基流动）</div>'
        );
        var $kolorsGroup = $('<div class="xiaoxin-settings-group"></div>');

        // API Key 输入
        var $kolorsRowKey = $('<div class="xiaoxin-settings-row"></div>');
        $kolorsRowKey.append(
            '<div class="xiaoxin-settings-row-label">硅基流动 API Key</div>'
        );
        var $kolorsKeyControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $kolorsKeyInput = $(
            '<input type="text" placeholder="从硅基流动控制台获取 API Key">'
        );
        $kolorsKeyControl.append($kolorsKeyInput);
        $kolorsRowKey.append($kolorsKeyControl);

        // 图片尺寸说明（不再设置，由世界书或生成时指定）
        // var $kolorsRowSize = $('<div class="xiaoxin-settings-row"></div>');
        // $kolorsRowSize.append(
        //     '<div class="xiaoxin-settings-row-label">图片尺寸</div>'
        // );
        // var $kolorsSizeControl = $(
        //     '<div class="xiaoxin-settings-row-control"></div>'
        // );
        // var $kolorsSizeSelect = $(
        //     '<select class="xiaoxin-settings-select" style="background-color: #f2f2f7 !important; color: #000 !important; border: 1px solid #d1d1d6; border-radius: 8px; padding: 6px 8px; font-size: 13px; outline: none; min-width: 150px;">' +
        //         '<option value="1024×1024">1024×1024 (1:1 正方形)</option>' +
        //         '<option value="960×1280">960×1280 (3:4 竖图)</option>' +
        //         '<option value="768×1024">768×1024 (3:4 竖图)</option>' +
        //         '<option value="720×1440">720×1440 (1:2 竖图)</option>' +
        //         '<option value="720×1280">720×1280 (9:16 竖图)</option>' +
        //         "</select>"
        // );
        // $kolorsSizeControl.append($kolorsSizeSelect);
        // $kolorsRowSize.append($kolorsSizeControl);

        // 推理步数
        var $kolorsRowSteps = $('<div class="xiaoxin-settings-row"></div>');
        $kolorsRowSteps.append(
            '<div class="xiaoxin-settings-row-label">推理步数 (1-100)</div>'
        );
        var $kolorsStepsControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $kolorsStepsInput = $(
            '<input type="number" min="1" max="100" value="19" placeholder="默认：19">'
        );
        $kolorsStepsControl.append($kolorsStepsInput);
        $kolorsRowSteps.append($kolorsStepsControl);

        // Guidance Scale
        var $kolorsRowGuidance = $('<div class="xiaoxin-settings-row"></div>');
        $kolorsRowGuidance.append(
            '<div class="xiaoxin-settings-row-label">Guidance Scale (0-20)</div>'
        );
        var $kolorsGuidanceControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $kolorsGuidanceInput = $(
            '<input type="number" min="0" max="20" step="0.1" value="4.0" placeholder="默认：4.0">'
        );
        $kolorsGuidanceControl.append($kolorsGuidanceInput);
        $kolorsRowGuidance.append($kolorsGuidanceControl);

        // 正向提示词（风格前缀）
        var $kolorsRowPositive = $('<div class="xiaoxin-settings-row"></div>');
        $kolorsRowPositive.append(
            '<div class="xiaoxin-settings-row-label">正向提示词（风格前缀）</div>'
        );
        var $kolorsPositiveControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $kolorsPositiveInput = $(
            '<textarea rows="3" placeholder="例如：best quality, masterpiece, ultra-detailed, 8k resolution, anime style, moe aesthetic, soft and smooth lineart, low contrast, gentle shading, painterly effect, soft color palette" style="width: 100%; min-height: 60px; resize: vertical; font-size: 13px; padding: 6px 8px; border: 1px solid #d1d1d6; border-radius: 8px; background-color: #f2f2f7; color: #000;"></textarea>'
        );
        $kolorsPositiveControl.append($kolorsPositiveInput);
        $kolorsRowPositive.append($kolorsPositiveControl);

        // 负向提示词
        var $kolorsRowNegative = $('<div class="xiaoxin-settings-row"></div>');
        $kolorsRowNegative.append(
            '<div class="xiaoxin-settings-row-label">负向提示词</div>'
        );
        var $kolorsNegativeControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $kolorsNegativeInput = $(
            '<textarea rows="3" placeholder="例如：sharp lines, high contrast, harsh edges, ugly, disfigured, low quality, blurry, text, watermark, signature, extra limbs, bad anatomy, mutated hands" style="width: 100%; min-height: 60px; resize: vertical; font-size: 13px; padding: 6px 8px; border: 1px solid #d1d1d6; border-radius: 8px; background-color: #f2f2f7; color: #000;"></textarea>'
        );
        $kolorsNegativeControl.append($kolorsNegativeInput);
        $kolorsRowNegative.append($kolorsNegativeControl);

        // 启用开关
        var $kolorsRowEnable = $('<div class="xiaoxin-settings-row"></div>');
        $kolorsRowEnable.append(
            '<div class="xiaoxin-settings-row-label">启用 Kolors 生图</div>'
        );
        var $kolorsEnableControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $kolorsEnableSwitch = $(
            '<input type="checkbox" id="xiaoxin_kolors_enabled" style="width: auto; margin: 0;">'
        );
        $kolorsEnableControl.append($kolorsEnableSwitch);
        $kolorsRowEnable.append($kolorsEnableControl);

        // 保存按钮
        var $kolorsRowSave = $('<div class="xiaoxin-settings-row"></div>');
        $kolorsRowSave.append(
            '<div class="xiaoxin-settings-row-label">保存配置</div>'
        );
        var $kolorsSaveControl = $(
            '<div class="xiaoxin-settings-row-control"></div>'
        );
        var $kolorsSaveBtn = $(
            '<button class="xiaoxin-settings-button">保存 Kolors 配置</button>'
        );
        $kolorsSaveControl.append($kolorsSaveBtn);
        $kolorsRowSave.append($kolorsSaveControl);

        var $kolorsDesc = $(
            '<div class="xiaoxin-settings-subtext" style="padding:8px 16px 12px;">Kolors 是快手开源的高质量图像生成模型，支持中文提示词，质量接近 Midjourney。<br><br><strong>获取 API Key：</strong><br>1. 访问 <a href="https://siliconflow.cn" target="_blank">siliconflow.cn</a> 注册账号<br>2. 在控制台获取 API Key<br>3. 新用户有免费额度（约 2000 万 tokens，可生成约 500 张图片）<br><br><strong>正向提示词：</strong>会自动添加到每次生成的提示词前面，用于统一图片风格。留空则不添加。<br><br><strong>负向提示词：</strong>用于避免生成不想要的元素，如低质量、水印等。留空则不使用。<br><br><strong>提示：</strong>使用中文提示词效果更好！图片尺寸会根据世界书或生成时的描述自动确定，无需在此设置。如果未配置或服务失败，将自动回退到免费备用方案。</div>'
        );

        $kolorsGroup.append(
            $kolorsRowKey,
            // $kolorsRowSize, // 图片尺寸由世界书或生成时指定，不在此设置
            $kolorsRowSteps,
            $kolorsRowGuidance,
            $kolorsRowPositive,
            $kolorsRowNegative,
            $kolorsRowEnable,
            $kolorsRowSave
        );

        // 组装“导航卡片”内容（依赖 section id）
        $navGroup.append(
            makeNavRow("生图 API", "image-api"),
            makeNavRow("生文 API", "text-api"),
            makeNavRow("主动发送线上消息配置", "auto-online")
        );

        // 组装到根容器（不含标题栏，标题栏单独渲染以获得固定位置）
        $root.append(
            $pluginTitle,
            $pluginGroup,
            $pluginDesc,
            $wallpaperTitle,
            $wallpaperGroup,
            $sizeTitle,
            $sizeGroup,
            $dataTitle,
            $dataGroup,
            $dataDesc,
            $navTitle,
            $navGroup,
            $apiTitle,
            $apiGroup,
            $apiDesc,
            $imageModelTitle,
            $imageModelGroup,
            $imageModelDesc,
            $autoOnlineTitle,
            $autoOnlineGroup,
            $autoOnlineDesc,
            $kolorsTitle,
            $kolorsGroup,
            $kolorsDesc
        );

        // 顶部标题栏（固定位置，仿 iOS 设置）
        var $titleBar = $(
            '<div class="xiaoxin-settings-title-bar"><div class="xiaoxin-settings-title-text">设置</div></div>'
        );

        // 先插入标题栏，再插入内容
        $container.append($titleBar, $root);

        // 默认不展开全部配置：只显示玩家选中的那一块（否则页面太长）
        // 若没有选择过，则默认全部隐藏，等待玩家点击导航卡片
        try {
            var selected = _loadSelectedNav();
            // 先全部隐藏
            $apiTitle.hide();
            $apiGroup.hide();
            $apiDesc.hide();
            $imageModelTitle.hide();
            $imageModelGroup.hide();
            $imageModelDesc.hide();
            $kolorsTitle.hide();
            $kolorsGroup.hide();
            $kolorsDesc.hide();
            $autoOnlineTitle.hide();
            $autoOnlineGroup.hide();
            $autoOnlineDesc.hide();

            // 生图配置太长：即使上次选中的是“生图 API”，本次打开设置也不自动展开，
            // 必须由玩家点击“生图 API”后才显示（并且仅在选择 kolors 时显示 Kolors 配置）
            if (selected && selected !== "image-api") {
                showConfigPanel(selected);
            }
        } catch (e_nav) {
            // ignore
        }

        // 主动发送线上消息配置：加载 + 保存
        try {
            var autoOnlineCfg = loadAutoOnlineConfig();
            $autoOnlineEnableSwitch.prop("checked", !!autoOnlineCfg.enabled);
            $autoOnlineThresholdInput.val(autoOnlineCfg.thresholdRounds);
            $autoOnlineLookbackInput.val(autoOnlineCfg.contextLookbackFloors);
        } catch (e_cfg) {
            console.warn("[小馨手机-设置] 初始化主动发送线上消息配置失败:", e_cfg);
        }

        function _collectAutoOnlineCfgFromUI() {
            return {
                enabled: !!$autoOnlineEnableSwitch.prop("checked"),
                thresholdRounds: parseInt($autoOnlineThresholdInput.val(), 10),
                contextLookbackFloors: parseInt($autoOnlineLookbackInput.val(), 10),
            };
        }

        $autoOnlineSaveBtn.on("click", function () {
            var saved = saveAutoOnlineConfig(_collectAutoOnlineCfgFromUI());
            // 回填规范化后的值
            $autoOnlineEnableSwitch.prop("checked", !!saved.enabled);
            $autoOnlineThresholdInput.val(saved.thresholdRounds);
            $autoOnlineLookbackInput.val(saved.contextLookbackFloors);
            showToast("已保存主动发送线上消息配置");
        });

        // ========== 交互逻辑 ==========
        var wallpaperConfig = {
            url: null,
            scale: 1,
            offsetY: 0,
        };

        var $previewInner = $preview.find(".xiaoxin-wallpaper-preview-inner");

        function applyPreview() {
            if (wallpaperConfig.url) {
                $previewInner.css(
                    "background-image",
                    "url(" + wallpaperConfig.url + ")"
                );
            }
            $previewInner.css({
                "background-size":
                    Math.round(wallpaperConfig.scale * 100) + "% auto",
                "background-position":
                    "center " + wallpaperConfig.offsetY + "%",
            });
            // 同时应用到真实手机
            if (
                mobilePhone &&
                typeof mobilePhone.setWallpaperConfig === "function"
            ) {
                mobilePhone.setWallpaperConfig(wallpaperConfig);
            }
        }

        // URL 输入
        $urlInput.on("change", function () {
            var url = $(this).val().trim();
            if (url) {
                wallpaperConfig.url = url;
                applyPreview();
            }
        });

        // 本地上传
        $uploadBtn.on("click", function () {
            $fileInput.trigger("click");
        });

        $fileInput.on("change", function (e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (evt) {
                wallpaperConfig.url = evt.target.result;
                applyPreview();
            };
            reader.readAsDataURL(file);
        });

        // 缩放
        $scaleRange.on("input", function () {
            wallpaperConfig.scale = parseFloat(this.value) || 1;
            applyPreview();
        });

        // 垂直位置
        $offsetRange.on("input", function () {
            wallpaperConfig.offsetY = parseFloat(this.value) || 0;
            applyPreview();
        });

        // 初始预览使用当前手机壁纸（如果有）
        try {
            var $screen = $(".xiaoxin-phone-screen");
            var currentBg = window.getComputedStyle($screen[0]).backgroundImage;
            if (currentBg && currentBg !== "none") {
                var match = currentBg.match(/url\\(\"?(.*)\"?\\)/);
                if (match && match[1]) {
                    wallpaperConfig.url = match[1];
                    applyPreview();
                }
            }
        } catch (e) {
            console.warn("[小馨手机-设置] 读取当前壁纸失败:", e);
        }

        // 尺寸调整（会自动保存到全局变量）
        $sizeRange.on("input", function () {
            var scale = parseFloat(this.value) || 0.8;
            if (
                mobilePhone &&
                typeof mobilePhone.setPhoneScale === "function"
            ) {
                mobilePhone.setPhoneScale(scale);
            }
        });

        // Toast 提示（用于所有功能）
        function showToast(message) {
            var $toast = $('<div class="xiaoxin-settings-toast"></div>').text(
                message
            );
            // 放到手机容器上，避免被裁剪
            var $phone = $(".xiaoxin-phone-container");
            $phone.append($toast);
            setTimeout(function () {
                $toast.fadeOut(200, function () {
                    $toast.remove();
                });
            }, 1500);
        }

        // 生图模型配置（选择与说明）
        var imageModelConfig = {
            provider: "kolors",
            prefixes: {
                kolors: defaultImagePrefixes.kolors,
                zhipu: defaultImagePrefixes.zhipu,
                pollinations: defaultImagePrefixes.pollinations,
            },
            zhipuApiKey: "",
            zhipuModel: "cogview-3-flash",
        };

        function toggleZhipuRows() {
            var provider = $imageModelSelect.val();
            if (provider === "zhipu") {
                $zhipuKeyRow.show();
                $zhipuModelRow.show();
            } else {
                $zhipuKeyRow.hide();
                $zhipuModelRow.hide();
            }
        }

        function syncPrefixTextarea() {
            var provider = $imageModelSelect.val() || "kolors";
            var prefix =
                imageModelConfig.prefixes[provider] ||
                defaultImagePrefixes[provider] ||
                "";
            $imagePrefixInput.val(prefix);
            toggleZhipuRows();
            toggleKolorsSection();
        }

        function toggleKolorsSection() {
            var isKolors = ($imageModelSelect.val() || "kolors") === "kolors";
            if (isKolors) {
                $kolorsTitle.show();
                $kolorsGroup.show();
                $kolorsDesc.show();
                // 切回 Kolors 时，确保正向前缀带入默认值
                if (!$kolorsPositiveInput.val().trim()) {
                    $kolorsPositiveInput.val(
                        imageModelConfig.prefixes.kolors ||
                            defaultImagePrefixes.kolors
                    );
                }
            } else {
                $kolorsTitle.hide();
                $kolorsGroup.hide();
                $kolorsDesc.hide();
            }
        }

        function showModelInfoDialog(title, content) {
            var $overlay = $(
                '<div class="xiaoxin-modal-overlay" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;"></div>'
            );
            var $dialog = $(
                '<div style="width:88%;max-width:420px;background:#fff;border-radius:14px;padding:16px 16px 12px;box-shadow:0 6px 16px rgba(0,0,0,0.2);color:#111;"></div>'
            );
            var $title = $(
                '<div style="font-size:16px;font-weight:700;margin-bottom:8px;">' +
                    title +
                    "</div>"
            );
            var $content = $(
                '<div style="font-size:13px;line-height:1.5;color:#333;white-space:pre-line;">' +
                    content +
                    "</div>"
            );
            var $footer = $(
                '<div style="text-align:right;margin-top:14px;">' +
                    '<button class="xiaoxin-settings-button" style="padding:6px 12px;">好的</button>' +
                    "</div>"
            );
            $footer.find("button").on("click", function () {
                $overlay.remove();
            });
            $dialog.append($title, $content, $footer);
            $overlay.append($dialog);
            var $phone = $(".xiaoxin-phone-container");
            if ($phone && $phone.length) {
                // 覆盖在手机容器内，避免跑出设备外
                if ($phone.css("position") === "static") {
                    $phone.css("position", "relative");
                }
                $phone.append($overlay);
            } else {
                $("body").append($overlay);
            }
        }

        function loadImageModelConfig() {
            var stored = null;
            try {
                if (typeof getVariables === "function") {
                    var globalData = getVariables({ type: "global" }) || {};
                    stored = globalData[IMAGE_MODEL_CONFIG_KEY] || null;
                }
            } catch (error) {
                console.warn(
                    "[小馨手机-设置] 读取生图模型配置失败（全局变量）:",
                    error
                );
            }

            if (!stored) {
                try {
                    var local = localStorage.getItem(IMAGE_MODEL_CONFIG_KEY);
                    if (local) {
                        stored = JSON.parse(local);
                    }
                } catch (error) {
                    console.warn(
                        "[小馨手机-设置] 读取生图模型配置失败（localStorage）:",
                        error
                    );
                }
            }

            if (stored) {
                imageModelConfig.provider = stored.provider || "kolors";
                imageModelConfig.prefixes = {
                    kolors:
                        (stored.prefixes && stored.prefixes.kolors) ||
                        defaultImagePrefixes.kolors,
                    zhipu:
                        (stored.prefixes && stored.prefixes.zhipu) ||
                        defaultImagePrefixes.zhipu,
                    pollinations:
                        (stored.prefixes && stored.prefixes.pollinations) ||
                        defaultImagePrefixes.pollinations,
                };
                imageModelConfig.zhipuApiKey = stored.zhipuApiKey || "";
                imageModelConfig.zhipuModel =
                    stored.zhipuModel || "cogview-3-flash";
            }

            $imageModelSelect.val(imageModelConfig.provider);
            $zhipuKeyInput.val(imageModelConfig.zhipuApiKey);
            $zhipuModelInput.val(imageModelConfig.zhipuModel);
            syncPrefixTextarea();
        }

        function persistImageModelConfig() {
            try {
                if (
                    typeof getVariables === "function" &&
                    typeof replaceVariables === "function"
                ) {
                    var globalData = getVariables({ type: "global" }) || {};
                    globalData[IMAGE_MODEL_CONFIG_KEY] =
                        JSON.parse(JSON.stringify(imageModelConfig));
                    replaceVariables(globalData, { type: "global" });
                }
            } catch (error) {
                console.warn(
                    "[小馨手机-设置] 写入生图模型配置到全局变量失败:",
                    error
                );
            }

            try {
                localStorage.setItem(
                    IMAGE_MODEL_CONFIG_KEY,
                    JSON.stringify(imageModelConfig)
                );
            } catch (error) {
                console.warn(
                    "[小馨手机-设置] 写入生图模型配置到 localStorage 失败:",
                    error
                );
            }

            // 同步给 ImageGenerator
            try {
                document.dispatchEvent(
                    new CustomEvent("mobile-api-config-updated", {
                        detail: {
                            imageProvider: imageModelConfig.provider,
                        },
                    })
                );
            } catch (error) {
                console.warn(
                    "[小馨手机-设置] 派发生图模型更新事件失败:",
                    error
                );
            }
        }

        $imageModelSelect.on("change", function () {
            imageModelConfig.provider = $(this).val() || "kolors";
            syncPrefixTextarea();
        });

        $imagePrefixInput.on("input", function () {
            var provider = $imageModelSelect.val() || "kolors";
            imageModelConfig.prefixes[provider] = $(this).val().trim();
        });

        $zhipuKeyInput.on("input", function () {
            imageModelConfig.zhipuApiKey = $(this).val().trim();
        });

        $zhipuModelInput.on("input", function () {
            imageModelConfig.zhipuModel = $(this).val().trim();
        });

        $imageModelSaveBtn.on("click", function () {
            var provider = $imageModelSelect.val() || "kolors";
            // 补齐空前缀为默认值
            ["kolors", "zhipu", "pollinations"].forEach(function (key) {
                if (!imageModelConfig.prefixes[key]) {
                    imageModelConfig.prefixes[key] = defaultImagePrefixes[key];
                }
            });

            // 校验必填项
            if (provider === "zhipu") {
                if (!imageModelConfig.zhipuApiKey.trim()) {
                    showToast("请填写智谱 API Key");
                    return;
                }
                if (!imageModelConfig.zhipuModel.trim()) {
                    showToast("请填写智谱模型名称，例如 cogview-3-flash");
                    return;
                }
            }

            // 写回当前选择
            imageModelConfig.provider = provider;

            // 如果用户选择 Kolors 且 Kolors 正向提示词为空，自动带入
            if (
                imageModelConfig.provider === "kolors" &&
                !$kolorsPositiveInput.val().trim()
            ) {
                $kolorsPositiveInput.val(
                    imageModelConfig.prefixes.kolors ||
                        defaultImagePrefixes.kolors
                );
            }

            persistImageModelConfig();
            showToast("生图模型配置已保存");

            // 立即同步到 ImageGenerator，确保后续调用使用最新模型优先级
            if (window.ImageGenerator) {
                try {
                    window.ImageGenerator.updateAPIConfig({
                        imageProvider: imageModelConfig.provider,
                        imagePrefixes: imageModelConfig.prefixes,
                        zhipuApiKey: imageModelConfig.zhipuApiKey,
                        zhipuModel: imageModelConfig.zhipuModel,
                    });
                    console.log(
                        "[小馨手机-设置] 已同步生图模型配置到 ImageGenerator"
                    );
                } catch (e) {
                    console.warn(
                        "[小馨手机-设置] 同步到 ImageGenerator 失败:",
                        e
                    );
                }
            }
        });

        // 初始化一次：只加载配置并同步下拉/前缀，但不默认展开 Kolors 大段配置
        loadImageModelConfig();
        $kolorsTitle.hide();
        $kolorsGroup.hide();
        $kolorsDesc.hide();

        // 读取模型列表（如果后端支持 /models 接口）
        $apiModelsBtn.on("click", function () {
            var url = $apiUrlInput.val().trim();
            var key = $apiKeyInput.val().trim();

            if (!url || !key) {
                showToast("请先填写 API 地址 和 API Key");
                return;
            }

            // 先保存当前配置到多个位置
            var configData = {
                base: url,
                key: key,
                model: $apiModelInput.val().trim(),
            };

            // 保存到 XiaoxinWeChatDataHandler（优先）
            if (
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.setSettings ===
                    "function"
            ) {
                try {
                    window.XiaoxinWeChatDataHandler.setSettings(configData);
                } catch (error) {
                    console.error(
                        "[小馨手机-设置] 保存到 XiaoxinWeChatDataHandler 失败:",
                        error
                    );
                }
            }

            // 保存到 window.XiaoxinAI（备用）
            if (
                window.XiaoxinAI &&
                typeof window.XiaoxinAI.setSettings === "function"
            ) {
                try {
                    window.XiaoxinAI.setSettings(configData);
                } catch (error) {
                    console.error(
                        "[小馨手机-设置] 保存到 window.XiaoxinAI 失败:",
                        error
                    );
                }
            }

            // 检查 fetchModels 是否可用
            if (
                !window.XiaoxinAI ||
                typeof window.XiaoxinAI.fetchModels !== "function"
            ) {
                showToast(
                    "当前环境未加载 XiaoxinAI，无法读取模型。请刷新页面重试。"
                );
                console.error(
                    "[小馨手机-设置] window.XiaoxinAI.fetchModels 不可用"
                );
                return;
            }

            $apiModelsBtn.prop("disabled", true).text("读取中...");
            $apiModelSelect.html('<option value="">正在读取模型...</option>');

            // 延迟一下，确保配置已保存
            setTimeout(function () {
                window.XiaoxinAI.fetchModels()
                    .then(function (list) {
                        list = Array.isArray(list) ? list : [];
                        if (!list.length) {
                            $apiModelSelect.html(
                                '<option value="">未获取到模型</option>'
                            );
                            showToast(
                                "未获取到模型，请检查后端是否支持 /models 接口"
                            );
                            return;
                        }
                        var optionsHtml =
                            '<option value="">选择模型</option>' +
                            list
                                .map(function (id) {
                                    return (
                                        '<option value="' +
                                        id +
                                        '">' +
                                        id +
                                        "</option>"
                                    );
                                })
                                .join("");
                        $apiModelSelect.html(optionsHtml);
                        showToast("已读取到 " + list.length + " 个模型");
                    })
                    .catch(function (err) {
                        console.error("[小馨手机-设置] 读取模型失败:", err);
                        $apiModelSelect.html(
                            '<option value="">读取模型失败</option>'
                        );
                        var errorMsg = err.message || "读取模型失败";
                        if (
                            errorMsg.includes("CORS") ||
                            errorMsg.includes("Failed to fetch")
                        ) {
                            showToast(
                                "读取模型失败（可能是 CORS 问题，请检查后端是否支持跨域）"
                            );
                        } else if (
                            errorMsg.includes("HTTP 401") ||
                            errorMsg.includes("HTTP 403")
                        ) {
                            showToast("读取模型失败（API Key 无效或权限不足）");
                        } else {
                            showToast("读取模型失败：" + errorMsg);
                        }
                    })
                    .finally(function () {
                        $apiModelsBtn.prop("disabled", false).text("读取模型");
                    });
            }, 100);
        });

        // 选择下拉模型时，自动填入到模型名称输入框
        $apiModelSelect.on("change", function () {
            var v = $(this).val();
            if (v) {
                $apiModelInput.val(v);
            }
        });

        // 加载已保存的 API 配置并填充到输入框
        function loadSavedAPIConfig() {
            var savedConfig = null;

            // 方法1：从酒馆全局变量读取（优先）
            if (typeof getVariables === "function") {
                try {
                    var globalData = getVariables({ type: "global" }) || {};
                    if (globalData["mobile_image_api_config"]) {
                        savedConfig = globalData["mobile_image_api_config"];
                        console.log(
                            "[小馨手机-设置] 从酒馆全局变量读取配置:",
                            savedConfig
                        );
                    }
                } catch (error) {
                    console.warn(
                        "[小馨手机-设置] 从酒馆全局变量读取配置失败:",
                        error
                    );
                }
            }

            // 方法2：从 XiaoxinWeChatDataHandler 读取
            if (
                !savedConfig &&
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.getSettings ===
                    "function"
            ) {
                try {
                    var settings =
                        window.XiaoxinWeChatDataHandler.getSettings();
                    if (settings && (settings.base || settings.apiUrl)) {
                        savedConfig = {
                            apiUrl: settings.base || settings.apiUrl || "",
                            apiKey: settings.key || settings.apiKey || "",
                            model: settings.model || "",
                        };
                        console.log(
                            "[小馨手机-设置] 从 XiaoxinWeChatDataHandler 读取配置:",
                            savedConfig
                        );
                    }
                } catch (error) {
                    console.warn(
                        "[小馨手机-设置] 从 XiaoxinWeChatDataHandler 读取配置失败:",
                        error
                    );
                }
            }

            // 方法3：从 window.XiaoxinAI 读取
            if (
                !savedConfig &&
                window.XiaoxinAI &&
                typeof window.XiaoxinAI.getSettings === "function"
            ) {
                try {
                    var settings = window.XiaoxinAI.getSettings();
                    if (settings && (settings.base || settings.apiUrl)) {
                        savedConfig = {
                            apiUrl: settings.base || settings.apiUrl || "",
                            apiKey: settings.key || settings.apiKey || "",
                            model: settings.model || "",
                        };
                        console.log(
                            "[小馨手机-设置] 从 window.XiaoxinAI 读取配置:",
                            savedConfig
                        );
                    }
                } catch (error) {
                    console.warn(
                        "[小馨手机-设置] 从 window.XiaoxinAI 读取配置失败:",
                        error
                    );
                }
            }

            // 方法4：从 mobileCustomAPIConfig 读取（手机主页配置）
            if (
                !savedConfig &&
                window.mobileCustomAPIConfig &&
                typeof window.mobileCustomAPIConfig.getCurrentConfig ===
                    "function"
            ) {
                try {
                    var mobileCfg =
                        window.mobileCustomAPIConfig.getCurrentConfig() || {};
                    if (mobileCfg && (mobileCfg.base || mobileCfg.apiUrl)) {
                        savedConfig = {
                            apiUrl: mobileCfg.base || mobileCfg.apiUrl || "",
                            apiKey: mobileCfg.apiKey || mobileCfg.key || "",
                            model: mobileCfg.model || "",
                        };
                        console.log(
                            "[小馨手机-设置] 从 mobileCustomAPIConfig 读取配置:",
                            savedConfig
                        );
                    }
                } catch (error) {
                    console.warn(
                        "[小馨手机-设置] 从 mobileCustomAPIConfig 读取配置失败:",
                        error
                    );
                }
            }

            // 方法4：从 mobilePhone 读取（兼容旧逻辑）
            if (
                !savedConfig &&
                mobilePhone &&
                typeof mobilePhone.getImageApiModel === "function"
            ) {
                try {
                    var phoneConfig = mobilePhone.getImageApiModel();
                    if (phoneConfig && phoneConfig.apiUrl) {
                        savedConfig = {
                            apiUrl: phoneConfig.apiUrl || "",
                            apiKey: phoneConfig.apiKey || "",
                            model: phoneConfig.model || "",
                        };
                        console.log(
                            "[小馨手机-设置] 从 mobilePhone 读取配置:",
                            savedConfig
                        );
                    }
                } catch (error) {
                    console.warn(
                        "[小馨手机-设置] 从 mobilePhone 读取配置失败:",
                        error
                    );
                }
            }

            // 填充到输入框
            if (savedConfig) {
                if (savedConfig.apiUrl) {
                    $apiUrlInput.val(savedConfig.apiUrl);
                }
                if (savedConfig.apiKey) {
                    $apiKeyInput.val(savedConfig.apiKey);
                }
                if (savedConfig.model) {
                    $apiModelInput.val(savedConfig.model);
                }
                console.log("[小馨手机-设置] 已加载并填充 API 配置到输入框");
            } else {
                console.log("[小馨手机-设置] 未找到已保存的 API 配置");
            }
        }

        // 延迟加载配置，确保所有模块都已初始化
        setTimeout(function () {
            loadSavedAPIConfig();
        }, 500);

        // 点击“测试并保存”：将配置写入多个位置确保持久化
        $apiTestBtn.on("click", function () {
            var url = $apiUrlInput.val().trim();
            var key = $apiKeyInput.val().trim();
            var model = $apiModelInput.val().trim();

            if (!url) {
                showToast("请先填写 API 地址");
                return;
            }

            if (!model) {
                showToast("请填写模型名称，如：gemini-3-flash-preview");
                return;
            }

            var configData = {
                base: url,
                key: key,
                model: model,
            };

            // 方法1：保存到 XiaoxinWeChatDataHandler（优先）
            if (
                window.XiaoxinWeChatDataHandler &&
                typeof window.XiaoxinWeChatDataHandler.setSettings ===
                    "function"
            ) {
                try {
                    window.XiaoxinWeChatDataHandler.setSettings(configData);
                    console.log(
                        "[小馨手机-设置] 配置已保存到 XiaoxinWeChatDataHandler:",
                        configData
                    );
                } catch (error) {
                    console.error(
                        "[小馨手机-设置] 保存到 XiaoxinWeChatDataHandler 失败:",
                        error
                    );
                }
            }

            // 方法2：保存到 window.XiaoxinAI（备用）
            if (
                window.XiaoxinAI &&
                typeof window.XiaoxinAI.setSettings === "function"
            ) {
                try {
                    window.XiaoxinAI.setSettings(configData);
                    console.log(
                        "[小馨手机-设置] 配置已保存到 window.XiaoxinAI:",
                        configData
                    );
                } catch (error) {
                    console.error(
                        "[小馨手机-设置] 保存到 window.XiaoxinAI 失败:",
                        error
                    );
                }
            }

            // 方法3：直接保存到酒馆全局变量（确保持久化）
            if (
                typeof getVariables === "function" &&
                typeof replaceVariables === "function"
            ) {
                try {
                    var globalData = getVariables({ type: "global" }) || {};

                    // 根据API URL判断provider（只有Gemini官方端点才使用gemini provider）
                    var detectedProvider = "openai";
                    if (
                        url &&
                        url.includes("generativelanguage.googleapis.com")
                    ) {
                        detectedProvider = "gemini";
                    }

                    globalData["mobile_image_api_config"] = {
                        enabled: true,
                        provider: detectedProvider,
                        apiUrl: url,
                        apiKey: key,
                        model: model,
                        temperature: 0.8,
                        maxTokens: 30000,
                    };
                    replaceVariables(globalData, { type: "global" });
                    console.log(
                        "[小馨手机-设置] 配置已保存到酒馆全局变量:",
                        globalData["mobile_image_api_config"]
                    );
                } catch (error) {
                    console.error(
                        "[小馨手机-设置] 保存到酒馆全局变量失败:",
                        error
                    );
                }
            }

            // 方法4：兼容旧逻辑：同时写入 mobilePhone 内存配置（若存在）
            if (
                mobilePhone &&
                typeof mobilePhone.setImageApiModel === "function"
            ) {
                try {
                    mobilePhone.setImageApiModel({
                        apiUrl: url,
                        apiKey: key,
                        model: model,
                    });
                    console.log("[小馨手机-设置] 配置已保存到 mobilePhone:", {
                        apiUrl: url,
                        apiKey: key ? "***" : "",
                        model: model,
                    });
                } catch (error) {
                    console.error(
                        "[小馨手机-设置] 保存到 mobilePhone 失败:",
                        error
                    );
                }
            }

            // 触发配置更新事件，通知 image-api.js 重新加载配置
            if (
                window.ImageGenerator &&
                typeof window.ImageGenerator.loadAPIConfig === "function"
            ) {
                setTimeout(function () {
                    window.ImageGenerator.loadAPIConfig();
                    console.log(
                        "[小馨手机-设置] 已通知 ImageGenerator 重新加载配置"
                    );
                }, 100);
            }

            showToast("API 配置已保存（已保存到多个位置确保持久化）");
        });

        // ========== Kolors 配置加载和保存 ==========
        // 加载已保存的 Kolors 配置
        function loadKolorsConfig() {
            try {
                var savedConfig = null;

                // 从酒馆全局变量读取（优先）
                if (typeof getVariables === "function") {
                    try {
                        var globalData = getVariables({ type: "global" }) || {};
                        if (globalData["mobile_kolors_config"]) {
                            savedConfig = globalData["mobile_kolors_config"];
                            console.log(
                                "[小馨手机-设置] 从酒馆全局变量读取 Kolors 配置:",
                                savedConfig
                            );
                        }
                    } catch (error) {
                        console.warn(
                            "[小馨手机-设置] 读取 Kolors 配置失败:",
                            error
                        );
                    }
                }

                // 从 localStorage 读取（备用）
                if (!savedConfig) {
                    try {
                        var stored = localStorage.getItem(
                            "xiaoxin_kolors_config"
                        );
                        if (stored) {
                            savedConfig = JSON.parse(stored);
                        }
                    } catch (error) {
                        console.warn(
                            "[小馨手机-设置] 从 localStorage 读取 Kolors 配置失败:",
                            error
                        );
                    }
                }

                // 填充到输入框
                if (savedConfig) {
                    if (savedConfig.apiKey) {
                        $kolorsKeyInput.val(savedConfig.apiKey);
                    }
                    // 图片尺寸不再从配置读取，由生成时指定
                    // if (savedConfig.imageSize) {
                    //     $kolorsSizeSelect.val(savedConfig.imageSize);
                    // }
                    if (savedConfig.numInferenceSteps !== undefined) {
                        $kolorsStepsInput.val(savedConfig.numInferenceSteps);
                    } else {
                        $kolorsStepsInput.val(19); // 默认值
                    }
                    if (savedConfig.guidanceScale !== undefined) {
                        $kolorsGuidanceInput.val(savedConfig.guidanceScale);
                    } else {
                        $kolorsGuidanceInput.val(4.0); // 默认值
                    }
                    if (savedConfig.positivePrompt !== undefined) {
                        $kolorsPositiveInput.val(savedConfig.positivePrompt);
                    } else {
                        // 设置默认正向提示词
                        $kolorsPositiveInput.val(
                            "best quality, masterpiece, ultra-detailed, 8k resolution, anime style, moe aesthetic, soft and smooth lineart, low contrast, gentle shading, painterly effect, soft color palette"
                        );
                    }
                    if (savedConfig.negativePrompt !== undefined) {
                        $kolorsNegativeInput.val(savedConfig.negativePrompt);
                    } else {
                        // 设置默认负向提示词
                        $kolorsNegativeInput.val(
                            "sharp lines, high contrast, harsh edges, over-sharpened, pixelated, crisp edges, hard shadows, cartoonish outlines, strong outlines, jagged lines, grainy, noisy, ugly, disfigured, low quality, blurry, text, watermark, signature, extra limbs, bad anatomy, mutated hands, monochrome, flat colors, plastic texture, 3d render, realistic"
                        );
                    }
                    if (savedConfig.enabled !== undefined) {
                        $kolorsEnableSwitch.prop(
                            "checked",
                            savedConfig.enabled
                        );
                    }
                    console.log(
                        "[小馨手机-设置] 已加载 Kolors 配置:",
                        savedConfig
                    );
                } else {
                    // 如果没有保存的配置，设置默认值
                    $kolorsStepsInput.val(19);
                    $kolorsGuidanceInput.val(4.0);
                    $kolorsPositiveInput.val(
                        "best quality, masterpiece, ultra-detailed, 8k resolution, anime style, moe aesthetic, soft and smooth lineart, low contrast, gentle shading, painterly effect, soft color palette"
                    );
                    $kolorsNegativeInput.val(
                        "sharp lines, high contrast, harsh edges, over-sharpened, pixelated, crisp edges, hard shadows, cartoonish outlines, strong outlines, jagged lines, grainy, noisy, ugly, disfigured, low quality, blurry, text, watermark, signature, extra limbs, bad anatomy, mutated hands, monochrome, flat colors, plastic texture, 3d render, realistic"
                    );
                }
            } catch (error) {
                console.error("[小馨手机-设置] 加载 Kolors 配置失败:", error);
            }
        }

        // 保存 Kolors 配置
        $kolorsSaveBtn.on("click", function () {
            var apiKey = $kolorsKeyInput.val().trim();
            // 图片尺寸不再保存，由生成时指定
            // var imageSize = $kolorsSizeSelect.val();
            var numInferenceSteps = parseInt($kolorsStepsInput.val()) || 19;
            var guidanceScale = parseFloat($kolorsGuidanceInput.val()) || 4.0;
            var positivePrompt = $kolorsPositiveInput.val().trim();
            var negativePrompt = $kolorsNegativeInput.val().trim();
            var enabled = $kolorsEnableSwitch.prop("checked");

            // 如果启用但没有 API Key，不允许保存
            if (enabled && !apiKey) {
                showToast("启用 Kolors 生图时必须填写 API Key");
                return;
            }

            // 如果填写了 API Key 但未启用，提示用户
            if (!enabled && apiKey) {
                var confirmEnable = confirm(
                    '已填写 API Key 但未启用，是否要启用 Kolors 生图？\n\n点击"确定"将启用，点击"取消"将保存但不启用。'
                );
                if (confirmEnable) {
                    $kolorsEnableSwitch.prop("checked", true);
                    enabled = true;
                }
            }

            // 验证参数范围
            if (numInferenceSteps < 1 || numInferenceSteps > 100) {
                showToast("推理步数必须在 1-100 之间");
                return;
            }
            if (guidanceScale < 0 || guidanceScale > 20) {
                showToast("Guidance Scale 必须在 0-20 之间");
                return;
            }

            var config = {
                apiKey: apiKey,
                // imageSize: imageSize || "1024×1024", // 不再保存，由生成时指定
                numInferenceSteps: numInferenceSteps,
                guidanceScale: guidanceScale,
                positivePrompt: positivePrompt,
                negativePrompt: negativePrompt,
                enabled: enabled,
            };

            // 保存到酒馆全局变量（优先）
            if (
                typeof getVariables === "function" &&
                typeof replaceVariables === "function"
            ) {
                try {
                    var globalData = getVariables({ type: "global" }) || {};
                    globalData["mobile_kolors_config"] = config;
                    replaceVariables(globalData, { type: "global" });
                    console.log(
                        "[小馨手机-设置] Kolors 配置已保存到酒馆全局变量"
                    );
                } catch (error) {
                    console.error(
                        "[小馨手机-设置] 保存到酒馆全局变量失败:",
                        error
                    );
                }
            }

            // 保存到 localStorage（备用）
            try {
                localStorage.setItem(
                    "xiaoxin_kolors_config",
                    JSON.stringify(config)
                );
                console.log("[小馨手机-设置] Kolors 配置已保存到 localStorage");
            } catch (error) {
                console.error(
                    "[小馨手机-设置] 保存到 localStorage 失败:",
                    error
                );
            }

            // 通知 ImageGenerator 重新加载配置
            if (
                window.ImageGenerator &&
                typeof window.ImageGenerator.loadAPIConfig === "function"
            ) {
                setTimeout(function () {
                    window.ImageGenerator.loadAPIConfig();
                    console.log(
                        "[小馨手机-设置] 已通知 ImageGenerator 重新加载 Kolors 配置"
                    );
                }, 100);
            }

            showToast("Kolors 配置已保存");
        });

        // 页面加载时读取配置
        loadKolorsConfig();
    }

    return {
        render: render,
    };
})();
