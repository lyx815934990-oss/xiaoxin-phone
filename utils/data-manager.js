// 数据管理工具 - 使用手动角色卡标识符系统
// 不同角色卡之间的数据完全独立存储，通过手动设置角色卡标识符来区分

window.XiaoxinDataManager = (function () {
    var STORAGE_PREFIX = "xiaoxin_";
    var CURRENT_CHAR_ID_KEY = "xiaoxin_current_character_id"; // 存储当前手动选择的角色卡ID
    var _characterChangeCallbacks = [];

    // ========== 手动角色卡标识符管理 ==========

    /**
     * 获取当前手动设置的角色卡ID
     * 如果不存在，返回null，需要用户手动设置
     */
    function getCurrentCharacterId() {
        try {
            var charId = localStorage.getItem(CURRENT_CHAR_ID_KEY);
            if (charId && charId.trim() !== "") {
                return charId.trim();
            }
        } catch (e) {
            console.warn("[小馨手机][数据管理] 读取角色卡ID失败:", e);
        }
        return null;
    }

    /**
     * 设置当前角色卡ID（手动设置）
     * @param {string} characterId - 角色卡标识符
     * @returns {boolean} - 是否设置成功
     */
    function setCurrentCharacterId(characterId) {
        try {
            if (
                !characterId ||
                typeof characterId !== "string" ||
                characterId.trim() === ""
            ) {
                console.warn("[小馨手机][数据管理] 角色卡ID不能为空");
                return false;
            }

            var oldCharId = getCurrentCharacterId();
            var newCharId = characterId.trim();

            localStorage.setItem(CURRENT_CHAR_ID_KEY, newCharId);

            // 如果切换了角色卡，触发回调
            if (oldCharId && oldCharId !== newCharId) {
                console.info(
                    "[小馨手机][数据管理] 角色卡切换:",
                    oldCharId,
                    "->",
                    newCharId
                );
                _notifyCharacterChange(newCharId, oldCharId);

                if (typeof toastr !== "undefined") {
                    toastr.success("已切换到角色卡：" + newCharId, "小馨手机", {
                        timeOut: 3000,
                    });
                }
            }

            console.info("[小馨手机][数据管理] 角色卡ID已设置为:", newCharId);
            return true;
        } catch (e) {
            console.error("[小馨手机][数据管理] 设置角色卡ID失败:", e);
            return false;
        }
    }

    /**
     * 获取所有已使用的角色卡ID列表（用于切换选择）
     * 通过扫描localStorage中所有以 xiaoxin_{charId}_ 开头的键来提取
     * 同时包含当前设置的角色卡ID（即使还没有数据）
     */
    function getAllCharacterIds() {
        var ids = [];
        var seenIds = {};

        try {
            // 先添加当前设置的角色卡ID（即使还没有数据，也要显示在列表中）
            var currentId = getCurrentCharacterId();
            if (currentId && !seenIds[currentId]) {
                ids.push(currentId);
                seenIds[currentId] = true;
            }

            // 遍历localStorage，找出所有以 xiaoxin_{charId}_ 开头的键
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.startsWith(STORAGE_PREFIX)) {
                    // 排除系统键
                    if (key === CURRENT_CHAR_ID_KEY) {
                        continue;
                    }

                    // 提取角色卡ID（格式：xiaoxin_{charId}_{dataKey}）
                    var remaining = key.substring(STORAGE_PREFIX.length);
                    var firstUnderscore = remaining.indexOf("_");

                    if (firstUnderscore > 0) {
                        var charId = remaining.substring(0, firstUnderscore);
                        // 排除临时ID和系统ID
                        if (
                            charId &&
                            !charId.startsWith("unknown_") &&
                            !charId.startsWith("current") &&
                            !charId.startsWith("last") &&
                            !seenIds[charId]
                        ) {
                            ids.push(charId);
                            seenIds[charId] = true;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("[小馨手机][数据管理] 获取角色卡列表失败:", e);
        }

        // 排序并返回
        return ids.sort();
    }

    /**
     * 删除指定角色卡标识及其所有数据
     * @param {string} characterId - 要删除的角色卡标识
     * @returns {boolean} - 是否删除成功
     */
    function deleteCharacterId(characterId) {
        if (
            !characterId ||
            typeof characterId !== "string" ||
            characterId.trim() === ""
        ) {
            console.warn("[小馨手机][数据管理] 角色卡ID不能为空");
            return false;
        }

        try {
            var charId = characterId.trim();
            var deletedCount = 0;
            var keysToDelete = [];

            // 收集所有需要删除的键
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.startsWith(STORAGE_PREFIX + charId + "_")) {
                    keysToDelete.push(key);
                }
            }

            // 删除所有相关数据
            keysToDelete.forEach(function (key) {
                try {
                    localStorage.removeItem(key);
                    deletedCount++;
                } catch (e) {
                    console.warn("[小馨手机][数据管理] 删除数据失败:", key, e);
                }
            });

            // 如果删除的是当前角色卡，清除当前角色卡ID
            var currentId = getCurrentCharacterId();
            if (currentId === charId) {
                localStorage.removeItem(CURRENT_CHAR_ID_KEY);
                console.info(
                    "[小馨手机][数据管理] 已清除当前角色卡ID（因为已删除）"
                );
            }

            console.info(
                "[小馨手机][数据管理] 已删除角色卡标识及其数据:",
                charId,
                "（共删除",
                deletedCount,
                "条数据）"
            );

            if (typeof toastr !== "undefined") {
                toastr.success(
                    "已删除角色卡标识：" +
                        charId +
                        "（共删除 " +
                        deletedCount +
                        " 条数据）",
                    "小馨手机",
                    {
                        timeOut: 4000,
                    }
                );
            }

            return true;
        } catch (e) {
            console.error("[小馨手机][数据管理] 删除角色卡标识失败:", e);
            if (typeof toastr !== "undefined") {
                toastr.error("删除失败，请查看控制台", "小馨手机");
            }
            return false;
        }
    }

    /**
     * 显示删除确认对话框
     * @param {string} characterId - 要删除的角色卡标识
     * @returns {Promise} - resolve表示确认删除，reject表示取消
     */
    function showDeleteConfirmDialog(characterId) {
        return new Promise(function (resolve, reject) {
            // 确保characterId是字符串
            var charIdStr = String(characterId || "");
            var escapedCharId = charIdStr
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;");

            var confirmHtml = `
                <div id="xiaoxin-delete-char-dialog" style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background: rgba(0,0,0,0.7);
                    z-index: 2147483647;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    overflow: visible;
                    padding: 0;
                    box-sizing: border-box;
                ">
                    <div style="
                        background: white;
                        padding: 24px;
                        border-radius: 12px;
                        max-width: 450px;
                        width: calc(100vw - 40px);
                        max-height: calc(100vh - 40px);
                        overflow-y: auto;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                        margin: 20px;
                        position: relative;
                    ">
                        <h3 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #d32f2f;">
                            ⚠️ 确认删除角色卡标识
                        </h3>
                        <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 12px 0;">
                            您即将删除角色卡标识：<strong style="color: #333;">${escapedCharId}</strong>
                        </p>
                        <div style="
                            background: #fff3cd;
                            border: 1px solid #ffc107;
                            border-radius: 6px;
                            padding: 12px;
                            margin: 16px 0;
                        ">
                            <p style="margin: 0; color: #856404; font-size: 13px; line-height: 1.5;">
                                <strong style="display: block; margin-bottom: 4px;">⚠️ 警告：</strong>
                                删除后，该角色卡标识下的<strong style="color: #d32f2f;">所有微信数据</strong>都将被永久清除，包括：
                                <br>• 微信账号信息
                                <br>• 聊天记录
                                <br>• 联系人列表
                                <br>• 朋友圈数据
                                <br>• 所有其他相关数据
                                <br><br>
                                <strong>此操作不可恢复！</strong>
                            </p>
                        </div>
                        <div style="margin-top: 24px; text-align: right; display: flex; gap: 10px; justify-content: flex-end;">
                            <button id="xiaoxin-delete-cancel" style="
                                padding: 10px 20px;
                                background: #f0f0f0 !important;
                                border: 1px solid #ddd !important;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                color: #333 !important;
                                transition: none !important;
                            ">
                                取消
                            </button>
                            <button id="xiaoxin-delete-confirm" style="
                                padding: 10px 20px;
                                background: #d32f2f !important;
                                color: white !important;
                                border: none !important;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                                transition: none !important;
                            ">
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            `;

            var $confirmDialog = $(confirmHtml);
            $("body").append($confirmDialog);

            $("#xiaoxin-delete-confirm").on("click", function () {
                $confirmDialog.remove();
                resolve();
            });

            $("#xiaoxin-delete-cancel").on("click", function () {
                $confirmDialog.remove();
                reject(new Error("用户取消"));
            });

            // 点击背景关闭
            $confirmDialog.on("click", function (e) {
                if (e.target.id === "xiaoxin-delete-char-dialog") {
                    $confirmDialog.remove();
                    reject(new Error("用户取消"));
                }
            });

            // 按ESC键关闭
            $(document).on("keydown.xiaoxin-delete-dialog", function (e) {
                if (e.keyCode === 27) {
                    $confirmDialog.remove();
                    $(document).off("keydown.xiaoxin-delete-dialog");
                    reject(new Error("用户取消"));
                }
            });
        });
    }

    /**
     * 显示角色卡选择/输入对话框
     * 返回Promise，resolve时表示已设置成功，reject时表示用户取消
     */
    function showCharacterIdDialog() {
        return new Promise(function (resolve, reject) {
            // 获取所有已存在的角色卡ID
            var existingIds = getAllCharacterIds();
            var currentId = getCurrentCharacterId();

            // 创建对话框HTML
            var dialogHtml = `
                <style>
                    #xiaoxin-character-id-dialog input[type="text"],
                    #xiaoxin-character-id-dialog input[type="text"]:focus,
                    #xiaoxin-character-id-dialog input[type="text"]:active,
                    #xiaoxin-character-id-dialog input[type="text"]:hover {
                        background-color: #f2f2f7 !important;
                        background: #f2f2f7 !important;
                        background-image: none !important;
                        color: #000 !important;
                        -webkit-text-fill-color: #000 !important;
                        border: none !important;
                        border-width: 0 !important;
                        border-style: none !important;
                        border-color: transparent !important;
                        outline: none !important;
                        box-shadow: none !important;
                        -webkit-box-shadow: none !important;
                        filter: none !important;
                        -webkit-filter: none !important;
                    }
                    #xiaoxin-character-id-dialog input[type="text"]::placeholder {
                        color: #999 !important;
                        -webkit-text-fill-color: #999 !important;
                        opacity: 1 !important;
                    }
                    #xiaoxin-character-id-dialog h3 {
                        color: #000 !important;
                        -webkit-text-fill-color: #000 !important;
                    }
                    #xiaoxin-character-id-dialog label {
                        color: #000 !important;
                        -webkit-text-fill-color: #000 !important;
                    }
                    #xiaoxin-character-id-dialog p {
                        color: #000 !important;
                        -webkit-text-fill-color: #000 !important;
                    }
                    #xiaoxin-character-id-dialog .xiaoxin-char-id-item span:first-child {
                        color: #000 !important;
                        -webkit-text-fill-color: #000 !important;
                    }
                    /* 取消所有按钮的悬停效果 */
                    #xiaoxin-character-id-dialog button,
                    #xiaoxin-character-id-dialog button:hover,
                    #xiaoxin-character-id-dialog button:focus,
                    #xiaoxin-character-id-dialog button:focus-visible,
                    #xiaoxin-character-id-dialog button:active {
                        transform: none !important;
                        -webkit-transform: none !important;
                        box-shadow: none !important;
                        -webkit-box-shadow: none !important;
                        filter: none !important;
                        -webkit-filter: none !important;
                        backdrop-filter: none !important;
                        -webkit-backdrop-filter: none !important;
                        transition: none !important;
                        -webkit-transition: none !important;
                        opacity: 1 !important;
                    }
                    /* 删除按钮保持红色样式，无悬停效果 */
                    #xiaoxin-character-id-dialog .xiaoxin-delete-char-btn,
                    #xiaoxin-character-id-dialog .xiaoxin-delete-char-btn:hover,
                    #xiaoxin-character-id-dialog .xiaoxin-delete-char-btn:focus,
                    #xiaoxin-character-id-dialog .xiaoxin-delete-char-btn:active {
                        background: #ffebee !important;
                        background-color: #ffebee !important;
                        color: #d32f2f !important;
                        -webkit-text-fill-color: #d32f2f !important;
                        border: 1px solid #ffcdd2 !important;
                    }
                    /* 取消按钮保持灰色样式，无悬停效果 */
                    #xiaoxin-character-id-dialog #xiaoxin-char-id-cancel,
                    #xiaoxin-character-id-dialog #xiaoxin-char-id-cancel:hover,
                    #xiaoxin-character-id-dialog #xiaoxin-char-id-cancel:focus,
                    #xiaoxin-character-id-dialog #xiaoxin-char-id-cancel:active {
                        background: #f0f0f0 !important;
                        background-color: #f0f0f0 !important;
                        color: #333 !important;
                        -webkit-text-fill-color: #333 !important;
                        border: 1px solid #ddd !important;
                    }
                    /* 确认按钮保持绿色样式，无悬停效果 */
                    #xiaoxin-character-id-dialog #xiaoxin-char-id-confirm,
                    #xiaoxin-character-id-dialog #xiaoxin-char-id-confirm:hover,
                    #xiaoxin-character-id-dialog #xiaoxin-char-id-confirm:focus,
                    #xiaoxin-character-id-dialog #xiaoxin-char-id-confirm:active {
                        background: #4CAF50 !important;
                        background-color: #4CAF50 !important;
                        color: white !important;
                        -webkit-text-fill-color: white !important;
                        border: none !important;
                    }
                    /* 删除确认对话框的按钮 */
                    #xiaoxin-delete-char-dialog button,
                    #xiaoxin-delete-char-dialog button:hover,
                    #xiaoxin-delete-char-dialog button:focus,
                    #xiaoxin-delete-char-dialog button:active {
                        transform: none !important;
                        -webkit-transform: none !important;
                        box-shadow: none !important;
                        -webkit-box-shadow: none !important;
                        filter: none !important;
                        -webkit-filter: none !important;
                        backdrop-filter: none !important;
                        -webkit-backdrop-filter: none !important;
                        transition: none !important;
                        -webkit-transition: none !important;
                        opacity: 1 !important;
                    }
                    #xiaoxin-delete-char-dialog #xiaoxin-delete-cancel,
                    #xiaoxin-delete-char-dialog #xiaoxin-delete-cancel:hover,
                    #xiaoxin-delete-char-dialog #xiaoxin-delete-cancel:focus,
                    #xiaoxin-delete-char-dialog #xiaoxin-delete-cancel:active {
                        background: #f0f0f0 !important;
                        background-color: #f0f0f0 !important;
                        color: #333 !important;
                        -webkit-text-fill-color: #333 !important;
                        border: 1px solid #ddd !important;
                    }
                    #xiaoxin-delete-char-dialog #xiaoxin-delete-confirm,
                    #xiaoxin-delete-char-dialog #xiaoxin-delete-confirm:hover,
                    #xiaoxin-delete-char-dialog #xiaoxin-delete-confirm:focus,
                    #xiaoxin-delete-char-dialog #xiaoxin-delete-confirm:active {
                        background: #d32f2f !important;
                        background-color: #d32f2f !important;
                        color: white !important;
                        -webkit-text-fill-color: white !important;
                        border: none !important;
                    }
                </style>
                <div id="xiaoxin-character-id-dialog" style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background: rgba(0,0,0,0.7);
                    z-index: 2147483647;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    overflow: visible;
                    padding: 0;
                    box-sizing: border-box;
                    -webkit-overflow-scrolling: touch;
                ">
                    <div style="
                        background: white;
                        border-radius: 12px;
                        max-width: 500px;
                        width: calc(100vw - 40px);
                        max-height: calc(100vh - 40px);
                        min-height: 200px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                        margin: 20px;
                        position: relative;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    ">
                        <!-- 可滚动的内容区域 -->
                        <div style="
                            flex: 1 1 auto;
                            overflow-y: auto;
                            overflow-x: hidden;
                            padding: 24px;
                            padding-bottom: 16px;
                            -webkit-overflow-scrolling: touch;
                            min-height: 0;
                        ">
                            <h3 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 600; color: #333;">
                                选择/输入角色卡标识
                            </h3>
                            <p style="color: #666; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0;">
                                不同角色卡的数据会独立存储。请输入或选择一个角色卡标识（建议使用角色卡名称，如"角色A"、"角色B"等）。
                            </p>

                        ${
                            existingIds.length > 0
                                ? `
                            <div style="margin: 0 0 16px 0;">
                                <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333; font-size: 14px;">
                                    已存在的角色卡：
                                </label>
                                <div id="xiaoxin-char-id-list" style="
                                    border: 1px solid #ddd;
                                    border-radius: 6px;
                                    max-height: 200px;
                                    overflow-y: auto;
                                    background: white;
                                ">
                                    ${existingIds
                                        .map(function (id) {
                                            var isCurrent = id === currentId;
                                            var escapedId = id
                                                .replace(/"/g, "&quot;")
                                                .replace(/</g, "&lt;")
                                                .replace(/>/g, "&gt;");
                                            return `
                                            <div class="xiaoxin-char-id-item" data-char-id="${escapedId}" style="
                                                padding: 10px 12px;
                                                border-bottom: 1px solid #f0f0f0;
                                                display: flex;
                                                align-items: center;
                                                justify-content: space-between;
                                                cursor: pointer;
                                                transition: background 0.2s;
                                                ${
                                                    isCurrent
                                                        ? "background: #e8f5e9;"
                                                        : ""
                                                }
                                            ">
                                                <span style="flex: 1; font-size: 14px; color: #333;">
                                                    ${escapedId}
                                                    ${
                                                        isCurrent
                                                            ? '<span style="color: #4CAF50; font-size: 12px; margin-left: 8px;">(当前)</span>'
                                                            : ""
                                                    }
                                                </span>
                                                <button class="xiaoxin-delete-char-btn" data-char-id="${escapedId}" type="button" style="
                                                    padding: 4px 12px;
                                                    background: #ffebee !important;
                                                    color: #d32f2f !important;
                                                    border: 1px solid #ffcdd2 !important;
                                                    border-radius: 4px;
                                                    cursor: pointer;
                                                    font-size: 12px;
                                                    margin-left: 8px;
                                                    transition: none !important;
                                                ">
                                                    删除
                                                </button>
                                            </div>
                                        `;
                                        })
                                        .join("")}
                                </div>
                                <div style="text-align: center; margin: 12px 0; color: #999; font-size: 13px;">或</div>
                            </div>
                        `
                                : ""
                        }

                        <div style="margin: 0 0 0 0;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333; font-size: 14px;">
                                输入新的角色卡标识：
                            </label>
                            <input type="text" id="xiaoxin-char-id-input" placeholder="例如：角色A、角色B" style="
                                width: 100%;
                                padding: 10px 12px;
                                border: none !important;
                                border-radius: 6px;
                                font-size: 14px;
                                box-sizing: border-box;
                                background-color: #f2f2f7 !important;
                                background: #f2f2f7 !important;
                                color: #000 !important;
                                -webkit-text-fill-color: #000 !important;
                                outline: none !important;
                            " value="${
                                currentId
                                    ? currentId.replace(/"/g, "&quot;")
                                    : ""
                            }">
                        </div>

                        </div>
                        
                        <!-- 固定在底部的按钮区域 -->
                        <div style="
                            padding: 16px 24px 24px 24px;
                            border-top: 1px solid #f0f0f0;
                            background: white;
                            flex-shrink: 0;
                            display: flex;
                            gap: 10px;
                            justify-content: flex-end;
                        ">
                            <button id="xiaoxin-char-id-cancel" style="
                                padding: 10px 20px;
                                background: #f0f0f0 !important;
                                border: 1px solid #ddd !important;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                color: #333 !important;
                                transition: none !important;
                                min-width: 80px;
                                touch-action: manipulation;
                            ">
                                取消
                            </button>
                            <button id="xiaoxin-char-id-confirm" style="
                                padding: 10px 20px;
                                background: #4CAF50 !important;
                                color: white !important;
                                border: none !important;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                                transition: none !important;
                                min-width: 80px;
                                touch-action: manipulation;
                            ">
                                确认
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // 添加到页面
            var $dialog = $(dialogHtml);
            $("body").append($dialog);

            // 绑定事件：点击角色卡项时选中（使用事件委托，绑定到对话框）
            $dialog.on("click", ".xiaoxin-char-id-item", function () {
                var charId = $(this).data("char-id");
                if (charId) {
                    $("#xiaoxin-char-id-input").val(charId);
                }
            });

            // 绑定事件：删除按钮（使用事件委托，因为列表是动态生成的）
            $dialog.on("click", ".xiaoxin-delete-char-btn", function (e) {
                e.stopPropagation();
                e.preventDefault();

                var charId =
                    $(this).data("char-id") || $(this).attr("data-char-id");

                // 确保charId是字符串类型（jQuery的data()可能返回数字）
                if (charId !== null && charId !== undefined) {
                    charId = String(charId);
                }

                console.log(
                    "[小馨手机][数据管理] 删除按钮被点击，角色卡ID:",
                    charId,
                    "类型:",
                    typeof charId
                );

                if (!charId || charId.trim() === "") {
                    console.warn("[小馨手机][数据管理] 无法获取角色卡ID");
                    if (typeof toastr !== "undefined") {
                        toastr.error(
                            "无法获取角色卡ID，请刷新页面重试",
                            "小馨手机"
                        );
                    }
                    return false;
                }

                var $btn = $(this);
                var wasCurrent = String(charId) === String(currentId);

                console.log(
                    "[小馨手机][数据管理] 准备显示删除确认对话框，角色卡ID:",
                    charId
                );

                // 显示确认对话框（确保传入字符串）
                showDeleteConfirmDialog(String(charId))
                    .then(function () {
                        // 确认删除
                        if (deleteCharacterId(charId)) {
                            // 刷新列表
                            var existingIds = getAllCharacterIds();
                            var newCurrentId = getCurrentCharacterId();

                            if (existingIds.length > 0) {
                                // 更新列表
                                var $list = $("#xiaoxin-char-id-list");
                                $list.html(
                                    existingIds
                                        .map(function (id) {
                                            var isCurrent = id === newCurrentId;
                                            var escapedId = id
                                                .replace(/"/g, "&quot;")
                                                .replace(/</g, "&lt;")
                                                .replace(/>/g, "&gt;");
                                            return `
                                        <div class="xiaoxin-char-id-item" data-char-id="${escapedId}" style="
                                            padding: 10px 12px;
                                            border-bottom: 1px solid #f0f0f0;
                                            display: flex;
                                            align-items: center;
                                            justify-content: space-between;
                                            cursor: pointer;
                                            transition: none !important;
                                            ${
                                                isCurrent
                                                    ? "background: #e8f5e9 !important;"
                                                    : "background: white !important;"
                                            }
                                        ">
                                            <span style="flex: 1; font-size: 14px; color: #333;">
                                                ${escapedId}
                                                ${
                                                    isCurrent
                                                        ? '<span style="color: #4CAF50; font-size: 12px; margin-left: 8px;">(当前)</span>'
                                                        : ""
                                                }
                                            </span>
                                            <button class="xiaoxin-delete-char-btn" data-char-id="${escapedId}" type="button" style="
                                                padding: 4px 12px;
                                                background: #ffebee !important;
                                                color: #d32f2f !important;
                                                border: 1px solid #ffcdd2 !important;
                                                border-radius: 4px;
                                                cursor: pointer;
                                                font-size: 12px;
                                                margin-left: 8px;
                                                transition: none !important;
                                            ">
                                                删除
                                            </button>
                                        </div>
                                    `;
                                        })
                                        .join("")
                                );

                                // 如果删除的是当前角色卡，清空输入框并提示
                                if (wasCurrent) {
                                    $("#xiaoxin-char-id-input").val("");
                                    if (typeof toastr !== "undefined") {
                                        toastr.warning(
                                            "已删除当前角色卡，请选择或输入新的角色卡标识",
                                            "小馨手机",
                                            {
                                                timeOut: 4000,
                                            }
                                        );
                                    }
                                }
                            } else {
                                // 如果没有角色卡了，隐藏列表区域和"或"分隔符
                                $("#xiaoxin-char-id-list").parent().hide();
                                $dialog
                                    .find('div[style*="text-align: center"]')
                                    .hide();
                                $("#xiaoxin-char-id-input").val("");
                                if (typeof toastr !== "undefined") {
                                    toastr.info(
                                        "所有角色卡已删除，请输入新的角色卡标识",
                                        "小馨手机",
                                        {
                                            timeOut: 4000,
                                        }
                                    );
                                }
                            }
                        }
                    })
                    .catch(function (err) {
                        // 用户取消，不做任何操作
                        console.log(
                            "[小馨手机][数据管理] 用户取消删除:",
                            err.message
                        );
                    });

                return false; // 阻止默认行为和事件冒泡
            });

            $("#xiaoxin-char-id-confirm").on("click", function () {
                var inputId = $("#xiaoxin-char-id-input").val().trim();
                var selectId = $("#xiaoxin-char-id-select").val();
                var finalId = inputId || selectId;

                if (!finalId) {
                    if (typeof toastr !== "undefined") {
                        toastr.warning(
                            "请输入或选择一个角色卡标识！",
                            "小馨手机"
                        );
                    } else {
                        alert("请输入或选择一个角色卡标识！");
                    }
                    return;
                }

                if (setCurrentCharacterId(finalId)) {
                    $dialog.remove();
                    resolve(finalId);
                } else {
                    if (typeof toastr !== "undefined") {
                        toastr.error("设置失败，请重试！", "小馨手机");
                    } else {
                        alert("设置失败，请重试！");
                    }
                }
            });

            $("#xiaoxin-char-id-cancel").on("click", function () {
                $dialog.remove();
                reject(new Error("用户取消"));
            });

            // 点击背景关闭
            $dialog.on("click", function (e) {
                if (e.target.id === "xiaoxin-character-id-dialog") {
                    $dialog.remove();
                    reject(new Error("用户取消"));
                }
            });

            // 按ESC键关闭
            $(document).on("keydown.xiaoxin-char-dialog", function (e) {
                if (e.keyCode === 27) {
                    // ESC
                    $dialog.remove();
                    $(document).off("keydown.xiaoxin-char-dialog");
                    reject(new Error("用户取消"));
                }
            });

            // 自动聚焦输入框
            setTimeout(function () {
                $("#xiaoxin-char-id-input").focus();
            }, 100);
        });
    }

    // ========== 简化的数据存储（只使用角色卡ID，不使用聊天ID） ==========

    /**
     * 生成数据存储键
     * 格式：xiaoxin_{characterId}_{key}
     */
    function _generateDataKey(key, options) {
        options = options || {};
        var charId = options.characterId || getCurrentCharacterId();

        if (!charId) {
            console.error(
                "[小馨手机][数据管理] 警告：未设置角色卡ID！请先调用 setCurrentCharacterId() 或 showCharacterIdDialog()"
            );
            // 返回一个临时键，但会提示用户
            return STORAGE_PREFIX + "unknown_" + key;
        }

        return STORAGE_PREFIX + charId + "_" + key;
    }

    // ========== 数据操作方法 ==========

    /**
     * 获取角色卡数据
     * @param {string} key - 数据键
     * @param {*} defaultValue - 默认值
     * @param {object} options - 选项（可指定characterId）
     * @returns {*} - 数据值
     */
    function getCharacterData(key, defaultValue, options) {
        options = options || {};
        var dataKey = _generateDataKey(key, options);

        try {
            var raw = localStorage.getItem(dataKey);
            if (raw === null) {
                return defaultValue;
            }
            try {
                return JSON.parse(raw);
            } catch (e) {
                console.warn("[小馨手机][数据管理] 解析数据失败:", dataKey, e);
                return defaultValue;
            }
        } catch (e) {
            console.error("[小馨手机][数据管理] 获取数据失败:", e);
            return defaultValue;
        }
    }

    /**
     * 设置角色卡数据
     * @param {string} key - 数据键
     * @param {*} value - 数据值
     * @param {object} options - 选项（可指定characterId）
     */
    function setCharacterData(key, value, options) {
        options = options || {};
        var dataKey = _generateDataKey(key, options);

        try {
            localStorage.setItem(dataKey, JSON.stringify(value));
        } catch (e) {
            console.error("[小馨手机][数据管理] 设置数据失败:", e);
            if (e.name === "QuotaExceededError") {
                if (typeof toastr !== "undefined") {
                    toastr.error("存储空间不足，请清理一些数据！", "小馨手机");
                }
            }
        }
    }

    /**
     * 清除角色卡数据
     * @param {string} key - 数据键
     * @param {object} options - 选项（可指定characterId）
     */
    function clearCharacterData(key, options) {
        options = options || {};
        var dataKey = _generateDataKey(key, options);

        try {
            localStorage.removeItem(dataKey);
        } catch (e) {
            console.error("[小馨手机][数据管理] 清除数据失败:", e);
        }
    }

    // ========== 通知回调 ==========
    function _notifyCharacterChange(newCharId, oldCharId) {
        _characterChangeCallbacks.forEach(function (callback) {
            try {
                callback(newCharId, oldCharId);
            } catch (e) {
                console.error(
                    "[小馨手机][数据管理] 角色卡切换回调执行失败:",
                    e
                );
            }
        });
    }

    // ========== 监听角色卡切换事件 ==========
    function onCharacterChange(callback) {
        if (typeof callback !== "function") {
            console.warn("[小馨手机][数据管理] onCharacterChange 需要传入函数");
            return;
        }

        _characterChangeCallbacks.push(callback);

        // 返回清理函数
        return function () {
            var index = _characterChangeCallbacks.indexOf(callback);
            if (index > -1) {
                _characterChangeCallbacks.splice(index, 1);
            }
        };
    }

    // ========== 初始化检查 ==========
    function _checkAndPromptCharacterId() {
        var currentId = getCurrentCharacterId();
        if (!currentId) {
            console.info(
                "[小馨手机][数据管理] 未检测到角色卡ID，将在3秒后弹出设置对话框"
            );
            setTimeout(function () {
                showCharacterIdDialog().catch(function (err) {
                    console.warn(
                        "[小馨手机][数据管理] 用户未设置角色卡ID:",
                        err.message
                    );
                    // 如果用户取消了，5秒后再提示一次
                    setTimeout(function () {
                        if (!getCurrentCharacterId()) {
                            console.info(
                                "[小馨手机][数据管理] 仍未设置角色卡ID，再次提示"
                            );
                            showCharacterIdDialog().catch(function () {
                                // 用户再次取消，不再提示
                            });
                        }
                    }, 5000);
                });
            }, 3000);
        } else {
            console.info("[小馨手机][数据管理] 当前角色卡ID:", currentId);
        }
    }

    // ========== 初始化 ==========
    // 等待jQuery加载完成
    $(function () {
        // 延迟初始化，确保DOM已加载
        setTimeout(function () {
            _checkAndPromptCharacterId();
        }, 1000);
    });

    // ========== 导出 ==========
    return {
        // 角色卡ID管理
        getCurrentCharacterId: getCurrentCharacterId,
        setCurrentCharacterId: setCurrentCharacterId,
        getAllCharacterIds: getAllCharacterIds,
        showCharacterIdDialog: showCharacterIdDialog,
        deleteCharacterId: deleteCharacterId,

        // 数据操作
        getCharacterData: getCharacterData,
        setCharacterData: setCharacterData,
        clearCharacterData: clearCharacterData,

        // 事件监听
        onCharacterChange: onCharacterChange,

        // 兼容旧接口（已废弃，但保留以避免报错）
        getCurrentChatId: function () {
            console.warn(
                "[小馨手机][数据管理] getCurrentChatId() 已废弃，不再使用聊天ID"
            );
            return null;
        },
        onChatChange: function (callback) {
            console.warn(
                "[小馨手机][数据管理] onChatChange() 已废弃，不再监听聊天切换"
            );
            // 返回一个空的清理函数
            return function () {};
        },
        onChatRestart: function (callback) {
            console.warn("[小馨手机][数据管理] onChatRestart() 已废弃");
            return function () {};
        },
        cleanup: function () {
            _characterChangeCallbacks = [];
        },
    };
})();
