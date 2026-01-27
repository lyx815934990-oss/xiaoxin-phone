// 小馨手机 - 核心逻辑文件

// ========== IndexedDB 帮助函数 ==========
const DB_NAME = "XiaoxinMobileDB";
const DB_VERSION = 1;
const STORE_NAME = "settings";

let dbPromise = null;

function getDb() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error(
                    "[小馨手机] IndexedDB 数据库打开失败:",
                    event.target.error
                );
                reject("IndexedDB error: " + event.target.errorCode);
            };

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: "key" });
                    console.info(
                        '[小馨手机] IndexedDB objectStore "' +
                            STORE_NAME +
                            '" 已创建'
                    );
                }
            };
        });
    }
    return dbPromise;
}

async function dbGet(key) {
    try {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onerror = (event) => {
                reject("Get error: " + event.target.errorCode);
            };

            request.onsuccess = (event) => {
                resolve(
                    event.target.result ? event.target.result.value : undefined
                );
            };
        });
    } catch (error) {
        console.error("[小馨手机] 从 IndexedDB 读取失败:", error);
        return undefined;
    }
}

async function dbSet(key, value) {
    try {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ key, value });

            request.onerror = (event) => {
                reject("Set error: " + event.target.errorCode);
            };

            request.onsuccess = () => {
                resolve();
            };
        });
    } catch (error) {
        console.error("[小馨手机] 写入 IndexedDB 失败:", error);
    }
}
// =====================================

/**
 * MobilePhone
 * iPhone 17 Pro 风格的手机界面
 */
function MobilePhone() {
    console.info("[小馨手机] MobilePhone 初始化中...");
    this.$floatingBtn = null;
    this.$phoneContainer = null;
    this.$statusBar = null;
    this.$dynamicIsland = null; // 灵动岛元素引用
    this.phoneScale = 0.8; // 默认整体缩放
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.isPhoneVisible = false;
    this.currentPage = "home"; // 'home' 或应用名称
    this.homeIndicatorStartY = 0;
    this.isHomeIndicatorDragging = false;
    // 灵动岛拖动相关
    this.isDynamicIslandDragging = false;
    this.dynamicIslandLongPressTimer = null;
    this.dynamicIslandDragStartX = 0;
    this.dynamicIslandDragStartY = 0;
    this.phoneContainerStartX = 0;
    this.phoneContainerStartY = 0;

    // 全局变量键名
    this.STORAGE_KEY = "xiaoxin_mobile_home_settings_v1";

    // 生图 API 配置
    this.imageApiConfig = {
        apiUrl: null,
        apiKey: null,
        model: null,
    };
    // 尝试从 localStorage 读取已保存的配置
    this.getImageApiModel();

    // 检查插件总开关状态
    var pluginEnabled =
        localStorage.getItem("xiaoxin_plugin_enabled") !== "false";
    if (!pluginEnabled) {
        console.info("[小馨手机] 插件总开关已关闭，手机将保持隐藏状态");
    }

    this.initFloatingButton();
    this.initPhoneContainer(); // 在 initPhoneContainer 内部会调用 loadSavedSettings
    this.applyPhoneScale();
    this.updateTime();
    setInterval(() => this.updateTime(), 1000);
    // 定期自愈：有些情况下（主题注入/动画/某些浏览器渲染 bug）状态栏/灵动岛/Home 条会被遮挡或意外消失
    // 这里每 2 秒检查一次，避免用户必须刷新酒馆页面
    setInterval(() => this.ensureSystemOverlays(), 2000);
    // 初始化一次状态栏明暗主题
    this.updateStatusBarTheme();

    // 监听未读消息数更新事件，更新红点显示
    var self = this;
    window.addEventListener("xiaoxin-unread-count-updated", function () {
        self.updateFloatingButtonBadge();
    });

    // 监听窗口大小变化，自动调整位置
    var resizeTimer = null;
    $(window).on("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            self.adjustFloatingButtonPosition();
            self.adjustPhoneContainerPosition();
        }, 100);
    });

    // 如果插件已禁用，确保手机是隐藏的
    if (!pluginEnabled) {
        this.hidePhone();
    }
}

MobilePhone.prototype.initFloatingButton = function () {
    var self = this;

    // 如果已经有按钮就不重复创建
    if (this.$floatingBtn && this.$floatingBtn.length) {
        return;
    }

    // 创建悬浮按钮
    var $btn = $('<div class="xiaoxin-mobile-floating-btn"></div>');

    // 附加到 body
    $("body").append($btn);

    // 等待DOM渲染完成后再设置位置
    var self = this;
    setTimeout(function () {
        self.adjustFloatingButtonPosition();
    }, 0);

    // 绑定拖动事件
    var startX = 0;
    var startY = 0;
    var dragThreshold = 5; // 拖动阈值（像素），超过这个距离才判定为拖动
    var hasMoved = false; // 是否移动过

    function onMouseDown(e) {
        // 在移动设备上，不要立即 preventDefault，避免阻止点击事件
        // 只有在确实拖动时才 preventDefault
        var isTouch = e.type === "touchstart" || (e.touches && e.touches[0]);
        if (!isTouch) {
            e.preventDefault();
        }
        e.stopPropagation();

        // 初始化拖动状态，但不立即标记为拖动
        hasMoved = false;
        self.isDragging = false;

        // 获取坐标（支持鼠标和触摸）
        var clientX =
            e.clientX !== undefined
                ? e.clientX
                : e.touches && e.touches[0]
                ? e.touches[0].clientX
                : 0;
        var clientY =
            e.clientY !== undefined
                ? e.clientY
                : e.touches && e.touches[0]
                ? e.touches[0].clientY
                : 0;

        // 鼠标按下时记录起点与元素相对位置
        var rect = $btn[0].getBoundingClientRect();
        startX = clientX;
        startY = clientY;
        self.dragOffsetX = startX - rect.left;
        self.dragOffsetY = startY - rect.top;

        // 监听全局移动/抬起（鼠标和触摸）
        $(document).on("mousemove.xiaoxinMobileBtn", onMouseMove);
        $(document).on("mouseup.xiaoxinMobileBtn", onMouseUp);
        $(document).on("touchmove.xiaoxinMobileBtn", function (e) {
            e.preventDefault();
            if (e.originalEvent.touches && e.originalEvent.touches[0]) {
                var touch = e.originalEvent.touches[0];
                var fakeEvent = {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    preventDefault: function () {
                        e.preventDefault();
                    },
                };
                onMouseMove(fakeEvent);
            }
        });
        $(document).on("touchend.xiaoxinMobileBtn", function (e) {
            onMouseUp(e);
        });
    }

    function onMouseMove(e) {
        // 只有在确实拖动时才 preventDefault
        if (self.isDragging || hasMoved) {
            e.preventDefault();
        }

        // 如果还没有判定为拖动，检查移动距离
        if (!self.isDragging) {
            // 计算移动距离
            var clientX =
                e.clientX !== undefined
                    ? e.clientX
                    : e.touches && e.touches[0]
                    ? e.touches[0].clientX
                    : startX;
            var clientY =
                e.clientY !== undefined
                    ? e.clientY
                    : e.touches && e.touches[0]
                    ? e.touches[0].clientY
                    : startY;

            var deltaX = Math.abs(clientX - startX);
            var deltaY = Math.abs(clientY - startY);
            var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // 如果移动距离超过阈值，判定为拖动
            if (distance > dragThreshold) {
                self.isDragging = true;
                hasMoved = true;
                $btn.addClass("dragging");
            } else {
                // 距离不够，不判定为拖动
                return;
            }
        }

        // 支持触摸事件
        var clientX =
            e.clientX !== undefined
                ? e.clientX
                : e.touches && e.touches[0]
                ? e.touches[0].clientX
                : startX;
        var clientY =
            e.clientY !== undefined
                ? e.clientY
                : e.touches && e.touches[0]
                ? e.touches[0].clientY
                : startY;

        var newLeft = clientX - self.dragOffsetX;
        var newTop = clientY - self.dragOffsetY;

        // 限制在窗口内（考虑安全边距）
        var winWidth = $(window).width();
        var winHeight = $(window).height();
        var btnWidth = $btn.outerWidth() || 64;
        var btnHeight = $btn.outerHeight() || 64;
        var safeMargin = 8; // 安全边距

        newLeft = Math.max(
            safeMargin,
            Math.min(newLeft, winWidth - btnWidth - safeMargin)
        );
        newTop = Math.max(
            safeMargin,
            Math.min(newTop, winHeight - btnHeight - safeMargin)
        );

        $btn.css({
            left: newLeft + "px",
            top: newTop + "px",
            right: "auto",
            bottom: "auto",
        });
    }

    function onMouseUp(e) {
        var wasDragging = self.isDragging;
        var wasMoved = hasMoved;

        // 重置状态
        self.isDragging = false;
        hasMoved = false;
        $btn.removeClass("dragging");

        $(document).off("mousemove.xiaoxinMobileBtn", onMouseMove);
        $(document).off("mouseup.xiaoxinMobileBtn", onMouseUp);
        $(document).off("touchmove.xiaoxinMobileBtn");
        $(document).off("touchend.xiaoxinMobileBtn");

        // 如果确实拖动过，阻止点击事件
        if (wasDragging && wasMoved) {
            // 设置一个标记，在短时间内阻止点击
            self._preventClick = true;
            setTimeout(function () {
                self._preventClick = false;
            }, 100);
        } else {
            // 如果没有拖动，且是触摸事件，设置标记让 click 事件处理
            var isTouch =
                e.type === "touchend" ||
                (e.changedTouches && e.changedTouches[0]);
            if (isTouch && !wasDragging && !wasMoved) {
                // 设置标记，表示这是一个有效的触摸点击，允许后续的 click 事件触发
                // 但不在这里手动触发，让 click 事件自然触发
                self._touchClickPending = true;
                // 设置一个超时，如果 click 事件没有在合理时间内触发，则手动触发
                setTimeout(function () {
                    if (self._touchClickPending && !self._preventClick) {
                        self._touchClickPending = false;
                        self.togglePhone();
                    }
                }, 300);
            }
        }
    }

    // 点击事件 - 切换手机显示/隐藏
    function onClick(e) {
        // 如果设置了阻止点击标记，则不触发
        if (self._preventClick) {
            return;
        }

        // 如果正在拖动或已经移动过，则不触发点击逻辑
        if (self.isDragging || hasMoved) {
            return;
        }

        // 如果是触摸点击，清除待处理标记
        if (self._touchClickPending) {
            self._touchClickPending = false;
        }

        self.togglePhone();
    }

    // 绑定鼠标事件
    $btn.on("mousedown", onMouseDown);
    $btn.on("click", onClick);

    // 绑定触摸事件（移动端支持）
    $btn.on("touchstart", function (e) {
        var touch = e.originalEvent.touches[0];
        if (touch) {
            var mouseEvent = {
                type: "touchstart",
                clientX: touch.clientX,
                clientY: touch.clientY,
                touches: e.originalEvent.touches,
                preventDefault: function () {
                    e.preventDefault();
                },
                stopPropagation: function () {
                    e.stopPropagation();
                },
            };
            onMouseDown(mouseEvent);
        }
        // 不要在这里 preventDefault，让点击事件能够正常触发
    });

    // 创建红点提示
    var $badge = $('<div class="xiaoxin-mobile-floating-btn-badge"></div>');
    $btn.append($badge);
    this.$floatingBtnBadge = $badge;

    this.$floatingBtn = $btn;

    // 初始化红点显示
    this.updateFloatingButtonBadge();

    console.info("[小馨手机] 悬浮手机按钮已创建");
};

// 初始化手机容器
MobilePhone.prototype.initPhoneContainer = function () {
    var self = this;

    // 创建手机外壳容器
    var $phone = $('<div class="xiaoxin-phone-container"></div>');

    // 手机外壳
    var $phoneFrame = $('<div class="xiaoxin-phone-frame"></div>');

    // 手机屏幕
    var $phoneScreen = $('<div class="xiaoxin-phone-screen"></div>');

    // 状态栏
    var $statusBar = $('<div class="xiaoxin-status-bar status-dark"></div>');
    var $statusLeft = $('<div class="xiaoxin-status-left"></div>');
    var $time = $('<span class="xiaoxin-time">9:41</span>');
    var $dynamicIsland = $('<div class="xiaoxin-dynamic-island"></div>');
    var $statusRight = $('<div class="xiaoxin-status-right"></div>');
    var $signal = $('<span class="xiaoxin-signal">📶</span>');
    var $wifi = $('<span class="xiaoxin-wifi">📶</span>');
    var $battery = $('<span class="xiaoxin-battery">🔋</span>');

    $statusLeft.append($time);
    $statusRight.append($signal, $wifi, $battery);
    $statusBar.append($statusLeft, $dynamicIsland, $statusRight);

    // 保存灵动岛引用
    this.$dynamicIsland = $dynamicIsland;

    // 主页面容器
    var $homePage = $('<div class="xiaoxin-home-page"></div>');

    // 顶部横条 Widget（位于图标第一/二行区域）
    // 横条装饰动图（显示在横条上方层级，独立于灵动岛位置）
    var $topWidgetDeco = $('<img class="xiaoxin-top-widget-deco" alt="" />');
    // 注意：在酒馆插件目录下建议使用相对当前脚本的路径；这里用与其它图标一致的 ./image/...
    $topWidgetDeco.attr(
        "src",
        "/scripts/extensions/third-party/xiaoxin-phone/image/icon/显示横条装饰.gif"
    );
    $topWidgetDeco.on("error", function () {
        console.warn("[小馨手机] 横条装饰动图加载失败:", this.src);
    });

    var $topWidget = $(
        '<div class="xiaoxin-top-widget" role="button" tabindex="0"></div>'
    );
    var $topWidgetLeft = $('<div class="xiaoxin-top-widget-left"></div>');
    var $topWidgetAvatar = $('<div class="xiaoxin-top-widget-avatar"></div>');
    // 默认头像（用户未自定义时显示）
    $topWidgetAvatar.css(
        "background-image",
        "url(/scripts/extensions/third-party/xiaoxin-phone/image/icon/主页横条默认显示头像.gif)"
    );
    // 保存头像元素引用，用于后续更新
    this.$topWidgetAvatar = $topWidgetAvatar;

    var $topWidgetCenter = $('<div class="xiaoxin-top-widget-center"></div>');
    var $topWidgetTitle = $(
        '<div class="xiaoxin-top-widget-title">Hi，今天也要元气满满！</div>'
    );
    // 保存文案元素引用，用于后续更新
    this.$topWidgetTitle = $topWidgetTitle;
    var $topWidgetSub = $(
        '<div class="xiaoxin-top-widget-sub">周五，3月14日</div>'
    );
    $topWidgetCenter.append($topWidgetTitle, $topWidgetSub);

    var $topWidgetRight = $('<div class="xiaoxin-top-widget-right"></div>');
    var $topWidgetTemp = $('<div class="xiaoxin-top-widget-temp">20°C</div>');
    $topWidgetRight.append($topWidgetTemp);

    $topWidgetLeft.append($topWidgetAvatar);
    $topWidget.append($topWidgetLeft, $topWidgetCenter, $topWidgetRight);

    // 头像点击：打开头像选择弹窗
    $topWidgetAvatar.on("click", function (e) {
        e.stopPropagation(); // 阻止冒泡到横条
        self.showAvatarPicker($topWidgetAvatar);
    });

    // 横条装饰动图点击：打开字体/横条文字颜色调色盘
    $topWidgetDeco.css("pointer-events", "auto");
    $topWidgetDeco.css("cursor", "pointer");
    $topWidgetDeco.on("click", function (e) {
        e.stopPropagation();
        if (typeof self.showFontColorPicker === "function") {
            self.showFontColorPicker();
        }
    });

    // 中间文案点击：打开文案编辑弹窗
    $topWidgetTitle.on("click", function (e) {
        e.stopPropagation(); // 阻止冒泡到横条
        self.showTextEditor($topWidgetTitle);
    });
    $topWidgetTitle.css("cursor", "pointer"); // 添加指针样式

    // iOS 风格按压反馈（鼠标）- 横条本身不响应点击，只响应头像点击
    $topWidget.on("mousedown", function (e) {
        // 如果点击的是头像，不触发横条按压
        if ($(e.target).closest(".xiaoxin-top-widget-avatar").length) {
            return;
        }
        $topWidget.addClass("pressed");
    });
    $(document).on("mouseup.xiaoxinTopWidget", function () {
        $topWidget.removeClass("pressed");
    });

    // 键盘可触达（回车/空格）
    $topWidget.on("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            $topWidget.addClass("pressed");
            setTimeout(function () {
                $topWidget.removeClass("pressed");
            }, 120);
        }
    });

    // 应用图标网格
    var $appGrid = $('<div class="xiaoxin-app-grid"></div>');

    // 应用图标（主页显示：微信、微博、情侣空间、备忘录、支付宝、淘宝）
    // 注意：电话、信息和设置已移到底部 Dock
    // 顺序调整：前4个显示在第一二行，后2个（支付宝、淘宝）显示在第三行第三四列和第四行第三列
    var apps = [
        {
            name: "微信",
            icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微信图标.jpg",
        },
        {
            name: "微博",
            icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/微博图标.png",
        },
        {
            name: "情侣空间",
            icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/情侣空间图标.jpg",
        },
        {
            name: "备忘录",
            icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/备忘录图标.jpg",
        },
        {
            name: "支付宝",
            icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/支付宝图标.jpg",
        },
        {
            name: "淘宝",
            icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/淘宝图标.jpg",
        },
        {
            name: "外卖",
            icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/外卖图标.png",
        },
        {
            name: "小红书",
            icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/小红书图标.png",
        },
    ];

    // 创建应用图标，并设置grid-area定位
    apps.forEach(function (app, index) {
        var $appIcon = $('<div class="xiaoxin-app-icon"></div>');
        var $appImg = $('<div class="xiaoxin-app-icon-img"></div>');
        $appImg.css("background-image", "url(" + app.icon + ")");
        var $appLabel = $(
            '<div class="xiaoxin-app-icon-label">' + app.name + "</div>"
        );
        $appIcon.append($appImg, $appLabel);
        $appIcon.data("app", app.name);
        $appIcon.attr("data-app", app.name); // 同时设置属性，方便CSS选择器查找
        $appIcon.on("click", function () {
            self.openApp(app.name);
        });

        // 根据索引设置 grid-area，确保“外卖/小红书”占据剩余两个空位
        // 主页图标布局：
        // 0 微信：1/1
        // 1 微博：1/2
        // 2 情侣空间：2/1
        // 3 备忘录：2/2
        // 4 支付宝：3/3
        // 5 淘宝：4/3
        // 6 外卖：3/4（空位1）
        // 7 小红书：4/4（空位2）
        if (index < 4) {
            var row = Math.floor(index / 2) + 1;
            var col = (index % 2) + 1;
            $appIcon.css(
                "grid-area",
                row + " / " + col + " / " + (row + 1) + " / " + (col + 1)
            );
        } else {
            if (index === 4) {
                $appIcon.css("grid-area", "3 / 3 / 4 / 4");
            } else if (index === 5) {
                $appIcon.css("grid-area", "4 / 3 / 5 / 4");
            } else if (index === 6) {
                $appIcon.css("grid-area", "3 / 4 / 4 / 5");
            } else if (index === 7) {
                $appIcon.css("grid-area", "4 / 4 / 5 / 5");
            }
        }

        $appGrid.append($appIcon);
    });

    // 添加2×2图片装饰
    // 装饰1：第一行第三四列和第二行三四列（2×2）
    var $deco1 = $(
        '<div class="xiaoxin-app-grid-deco xiaoxin-app-grid-deco-1"></div>'
    );
    $deco1.css(
        "background-image",
        "url(/scripts/extensions/third-party/xiaoxin-phone/image/background/手机主页图片1.jpg)"
    );
    $deco1.css("grid-area", "1 / 3 / 3 / 5"); // 占据第1-2行，第3-4列
    $appGrid.append($deco1);

    // 装饰2：第三行第一二列和第四行一二列（2×2）
    var $deco2 = $(
        '<div class="xiaoxin-app-grid-deco xiaoxin-app-grid-deco-2"></div>'
    );
    $deco2.css(
        "background-image",
        "url(/scripts/extensions/third-party/xiaoxin-phone/image/background/手机主页图片2.jpg)"
    );
    $deco2.css("grid-area", "3 / 1 / 5 / 3"); // 占据第3-4行，第1-2列
    $appGrid.append($deco2);

    // 先放装饰动图（层级在横条之上），再放顶部横条，再放图标网格
    $homePage.append($topWidgetDeco, $topWidget, $appGrid);

    // 底部 Dock（固定应用栏，只在主页显示）
    var $dock = $('<div class="xiaoxin-dock"></div>');
    // Dock 应用图标（电话、信息、设置）- 3个按钮居中均匀排列
    var dockApps = [
        {
            name: "电话",
            icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/电话图标.jpg",
        },
        {
            name: "信息",
            icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/信息图标.jpg",
        },
        {
            name: "设置",
            icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/设置图标.png",
        },
        {
            name: "初始化",
            icon: "/scripts/extensions/third-party/xiaoxin-phone/image/icon/初始化桌面图标.png",
        },
    ];

    dockApps.forEach(function (app) {
        var $dockIcon = $('<div class="xiaoxin-dock-icon"></div>');
        var $dockIconImg = $('<div class="xiaoxin-dock-icon-img"></div>');
        $dockIconImg.css("background-image", "url(" + app.icon + ")");
        $dockIcon.append($dockIconImg);
        $dockIcon.data("app", app.name);
        $dockIcon.attr("data-app", app.name); // 同时设置属性，方便CSS选择器查找

        if (app.name === "初始化") {
            $dockIcon.on("click", function () {
                if (
                    confirm(
                        "确定要初始化手机吗？所有壁纸、头像、文案等设置都将恢复为默认值。"
                    )
                ) {
                    // 清理 LocalStorage 和 IndexedDB
                    localStorage.removeItem(self.STORAGE_KEY);
                    indexedDB.deleteDatabase(DB_NAME);
                    alert("手机已初始化，请重新加载插件或刷新页面以应用更改。");
                    // 刷新页面或重新加载插件的逻辑可能需要用户手动操作
                    window.location.reload();
                }
            });
        } else {
            $dockIcon.on("click", function () {
                self.openApp(app.name);
            });
        }

        $dock.append($dockIcon);
    });

    // 应用页面容器（用于显示打开的应用），默认隐藏避免覆盖主页
    var $appPage = $('<div class="xiaoxin-app-page hidden"></div>');

    // 底部 Home Indicator
    var $homeIndicator = $('<div class="xiaoxin-home-indicator"></div>');

    // 组装
    // 注意：把状态栏放在应用页面之后，确保：
    // 1) 在视觉上永远盖在应用内容之上（DOM 顺序 + 高 z-index 双保险）
    // 2) mobile-phone.css 中使用的选择器 `.xiaoxin-app-page:has(...) ~ .xiaoxin-status-bar ...` 能正确命中
    $phoneScreen.append($homePage, $appPage, $dock, $statusBar, $homeIndicator);
    $phoneFrame.append($phoneScreen);
    $phone.append($phoneFrame);

    // 绑定 Home Indicator 上滑手势
    this.initHomeIndicatorGesture($homeIndicator);

    // 绑定灵动岛长按拖动功能
    this.initDynamicIslandDrag($dynamicIsland);

    $("body").append($phone);
    this.$phoneContainer = $phone;
    this.$phoneScreen = $phoneScreen; // 保存屏幕引用，用于弹窗显示
    this.$statusBar = $statusBar;

    // 兜底：防止在某些主题/动画/重渲染情况下状态栏、灵动岛、Home 条被遮挡或被错误移除
    // 这里做一个轻量的“自愈”检查：确保关键元素存在、可见、并处于正确的层级顺序
    this.ensureSystemOverlays();

    // 在元素创建完成后，加载保存的设置
    this.loadSavedSettings();

    // 初始化时适配一次横条主标题，避免默认/已保存文案溢出
    this.fitTopWidgetTitle();

    // 确保手机容器位置在屏幕内（在加载保存设置后调整）
    var self = this;
    setTimeout(function () {
        self.adjustPhoneContainerPosition();
    }, 100);

    console.info("[小馨手机] 手机界面已创建");
};

// 确保状态栏/灵动岛/底部 Home 条存在且可见（自愈）
MobilePhone.prototype.ensureSystemOverlays = function () {
    try {
        if (!this.$phoneContainer || !this.$phoneContainer.length) return;
        var $screen = this.$phoneContainer.find(".xiaoxin-phone-screen");
        if (!$screen.length) return;

        // 状态栏
        var $statusBar = $screen.children(".xiaoxin-status-bar");
        if (!$statusBar.length) {
            // 尝试从缓存引用恢复
            if (this.$statusBar && this.$statusBar.length) {
                $statusBar = this.$statusBar;
                $screen.append($statusBar);
            } else {
                // 极端情况：重建一个最小状态栏
                $statusBar = $('<div class="xiaoxin-status-bar status-dark"></div>');
                var $statusLeft = $('<div class="xiaoxin-status-left"></div>');
                var $time = $('<span class="xiaoxin-time">9:41</span>');
                var $dynamicIsland = $('<div class="xiaoxin-dynamic-island"></div>');
                var $statusRight = $('<div class="xiaoxin-status-right"></div>');
                $statusLeft.append($time);
                $statusBar.append($statusLeft, $dynamicIsland, $statusRight);
                this.$dynamicIsland = $dynamicIsland;
                this.$statusBar = $statusBar;
                $screen.append($statusBar);
                // 重新绑定灵动岛拖动
                this.initDynamicIslandDrag($dynamicIsland);
                // 立刻刷新时间
                this.updateTime();
            }
        }

        // Home 条
        var $homeIndicator = $screen.children(".xiaoxin-home-indicator");
        if (!$homeIndicator.length) {
            $homeIndicator = $('<div class="xiaoxin-home-indicator"></div>');
            $screen.append($homeIndicator);
            this.initHomeIndicatorGesture($homeIndicator);
        }

        // 确保层级顺序：状态栏在倒数第二/最后（Home 条在最末）
        // 用 append 来调整到末尾（不会改变节点内容，只改变层级顺序）
        $screen.append($statusBar);
        $screen.append($homeIndicator);

        // 强制可见（避免被异常样式覆盖）
        $statusBar.css({ display: "flex", visibility: "visible", opacity: 1 });
        $homeIndicator.css({
            display: "block",
            visibility: "visible",
            opacity: 1,
        });
    } catch (e) {
        console.warn("[小馨手机] ensureSystemOverlays 出错:", e);
    }
};

// 应用当前整体缩放
MobilePhone.prototype.applyPhoneScale = function () {
    if (!this.$phoneContainer) return;
    var scale = this.phoneScale || 1;
    var currentTop = this.$phoneContainer.css("top");
    var currentLeft = this.$phoneContainer.css("left");

    // 如果已经有位置（不是默认居中），保持位置并应用缩放
    if (currentTop !== "50%" && currentLeft !== "50%") {
        this.$phoneContainer.css(
            "transform",
            "translate(-50%, -50%) scale(" + scale + ")"
        );
    } else {
        this.$phoneContainer.css(
            "transform",
            "translate(-50%, -50%) scale(" + scale + ")"
        );
    }
};

// 设置手机容器位置
MobilePhone.prototype.setPhonePosition = function (x, y) {
    if (!this.$phoneContainer) return;
    var scale = this.phoneScale || 1;
    this.$phoneContainer.css({
        top: y + "px",
        left: x + "px",
        transform: "translate(-50%, -50%) scale(" + scale + ")",
        transition: "opacity 0.3s ease", // 只保留透明度过渡
    });
};

// 设置整体缩放（从设置界面调用）
MobilePhone.prototype.setPhoneScale = function (scale) {
    // 简单限制范围，避免太小或太大
    var clamped = Math.max(0.6, Math.min(scale, 1.2));
    this.phoneScale = clamped;
    this.applyPhoneScale();
    // 保存缩放值到全局变量
    this.saveHomeSettings({ phoneScale: clamped });
};

// 设置生图 API 模型配置
MobilePhone.prototype.setImageApiModel = function (config) {
    if (config) {
        this.imageApiConfig = {
            apiUrl: config.apiUrl || this.imageApiConfig.apiUrl,
            apiKey: config.apiKey || this.imageApiConfig.apiKey,
            model: config.model || this.imageApiConfig.model,
        };
        console.info("[小馨手机] 生图 API 配置已更新:", this.imageApiConfig);
    }
    return this.imageApiConfig;
};

// 获取生图 API 模型配置
MobilePhone.prototype.getImageApiModel = function () {
    return this.imageApiConfig;
};

// 保存主页设置到全局变量（永久保存，跨角色卡、跨对话）
MobilePhone.prototype.saveHomeSettings = async function (updates) {
    try {
        // 检查是否有壁纸数据需要特殊处理
        if (
            updates.wallpaper &&
            updates.wallpaper.url &&
            updates.wallpaper.url.startsWith("data:image/")
        ) {
            console.info(
                "[小馨手机] 检测到 Base64 壁纸数据，将保存到 IndexedDB"
            );
            try {
                // 保存壁纸数据到 IndexedDB
                const wallpaperId = "wallpaper_" + Date.now();
                await dbSet(wallpaperId, updates.wallpaper.url);

                // 替换为引用 ID
                updates.wallpaper = {
                    ...updates.wallpaper,
                    url: null, // 清空 base64 数据
                    dbId: wallpaperId, // 存储引用 ID
                };
                console.info("[小馨手机] 壁纸数据已保存到 IndexedDB");
            } catch (e) {
                console.error("[小馨手机] 保存壁纸到 IndexedDB 失败:", e);
                // 如果 IndexedDB 保存失败，尝试只保存缩略图或提示用户
                if (updates.wallpaper && updates.wallpaper.url) {
                    updates.wallpaper.url = null; // 清空大图数据
                }
            }
        }

        // 检查接口是否可用（使用 window 对象检查，因为可能在不同作用域）
        var getVars =
            typeof getVariables === "function"
                ? getVariables
                : typeof window !== "undefined" && window.getVariables;
        var replaceVars =
            typeof replaceVariables === "function"
                ? replaceVariables
                : typeof window !== "undefined" && window.replaceVariables;

        if (!getVars || !replaceVars) {
            console.warn(
                "[小馨手机] 酒馆变量接口不可用，尝试使用 localStorage 作为备用方案"
            );
            // 备用方案：使用 localStorage
            try {
                var stored = localStorage.getItem(this.STORAGE_KEY);
                var currentSettings = stored ? JSON.parse(stored) : {};
                var newSettings = Object.assign({}, currentSettings, updates);
                localStorage.setItem(
                    this.STORAGE_KEY,
                    JSON.stringify(newSettings)
                );
                console.info(
                    "[小馨手机] 主页设置已保存到 localStorage:",
                    newSettings
                );
                return;
            } catch (e2) {
                console.warn("[小馨手机] localStorage 保存也失败:", e2);
                return;
            }
        }

        // 读取当前全局变量
        var globalData = getVars({ type: "global" }) || {};
        var currentSettings = globalData[this.STORAGE_KEY] || {};

        // 合并更新
        var newSettings = Object.assign({}, currentSettings, updates);

        // 保存到全局变量
        globalData[this.STORAGE_KEY] = newSettings;
        replaceVars(globalData, { type: "global" });

        console.info("[小馨手机] 主页设置已保存:", newSettings);
    } catch (e) {
        console.warn("[小馨手机] 保存主页设置失败:", e);
        // 失败时尝试使用 localStorage 作为备用
        try {
            var stored = localStorage.getItem(this.STORAGE_KEY);
            var currentSettings = stored ? JSON.parse(stored) : {};
            var newSettings = Object.assign({}, currentSettings, updates);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(newSettings));
            console.info(
                "[小馨手机] 已使用 localStorage 备用方案保存:",
                newSettings
            );
        } catch (e2) {
            console.error("[小馨手机] 所有保存方案都失败:", e2);
        }
    }
};

// 从全局变量加载保存的主页设置
MobilePhone.prototype.loadSavedSettings = async function () {
    try {
        var settings = null;

        // 优先尝试从酒馆全局变量读取
        var getVars =
            typeof getVariables === "function"
                ? getVariables
                : typeof window !== "undefined" && window.getVariables;
        if (getVars) {
            try {
                var globalData = getVars({ type: "global" }) || {};
                settings = globalData[this.STORAGE_KEY] || null;
                if (settings) {
                    console.info("[小馨手机] 从全局变量加载设置");
                }
            } catch (e) {
                console.warn(
                    "[小馨手机] 读取全局变量失败，尝试 localStorage:",
                    e
                );
            }
        }

        // 如果全局变量没有数据，尝试从 localStorage 读取（备用方案）
        if (!settings) {
            try {
                var stored = localStorage.getItem(this.STORAGE_KEY);
                if (stored) {
                    settings = JSON.parse(stored);
                    console.info("[小馨手机] 从 localStorage 加载设置");
                }
            } catch (e2) {
                console.warn("[小馨手机] 读取 localStorage 失败:", e2);
            }
        }

        if (!settings) {
            console.info("[小馨手机] 未找到保存的设置，使用默认值");
            return;
        }

        // 加载头像
        if (settings.avatarUrl && this.$topWidgetAvatar) {
            this.$topWidgetAvatar.css(
                "background-image",
                "url(" + settings.avatarUrl + ")"
            );
            console.info("[小馨手机] 已加载保存的头像:", settings.avatarUrl);
        }

        // 加载文案
        if (settings.widgetText && this.$topWidgetTitle) {
            this.$topWidgetTitle.text(settings.widgetText);
            // 加载后重新适配一次宽度（确保一行显示完全）
            this.fitTopWidgetTitle();
            console.info("[小馨手机] 已加载保存的文案:", settings.widgetText);
        }

        // 加载壁纸配置（如果是 IndexedDB 引用则先取回数据）
        if (settings.wallpaper && this.$phoneContainer) {
            var wp = settings.wallpaper;
            if (wp.dbId && !wp.url) {
                try {
                    var urlFromDb = await dbGet(wp.dbId);
                    if (urlFromDb) {
                        wp = Object.assign({}, wp, { url: urlFromDb });
                    } else {
                        console.warn(
                            "[小馨手机] IndexedDB 中未找到壁纸数据:",
                            wp.dbId
                        );
                    }
                } catch (e3) {
                    console.warn("[小馨手机] 从 IndexedDB 加载壁纸失败:", e3);
                }
            }
            this.setWallpaperConfig(wp);
            console.info("[小馨手机] 已加载保存的壁纸配置:", wp);
        }

        // 加载字体主题（桌面文字颜色/横条字样颜色）
        if (settings.fontTheme) {
            this.applyFontTheme(settings.fontTheme);
            console.info(
                "[小馨手机] 已加载保存的字体主题:",
                settings.fontTheme
            );
        }

        // 加载手机缩放
        if (typeof settings.phoneScale === "number") {
            this.phoneScale = settings.phoneScale;
            this.applyPhoneScale();
            console.info(
                "[小馨手机] 已加载保存的手机缩放:",
                settings.phoneScale
            );
        }

        // 加载手机位置
        if (
            settings.phonePosition &&
            typeof settings.phonePosition.x === "number" &&
            typeof settings.phonePosition.y === "number"
        ) {
            this.setPhonePosition(
                settings.phonePosition.x,
                settings.phonePosition.y
            );
            // 加载后调整位置，确保在屏幕内
            var self = this;
            setTimeout(function () {
                self.adjustPhoneContainerPosition();
            }, 50);
            console.info(
                "[小馨手机] 已加载保存的手机位置:",
                settings.phonePosition
            );
        } else {
            // 如果没有保存的位置，使用默认居中并调整
            var self = this;
            setTimeout(function () {
                self.adjustPhoneContainerPosition();
            }, 50);
        }
    } catch (e) {
        console.warn("[小馨手机] 加载保存的设置失败:", e);
    }
};

// 设置壁纸（从设置界面调用）
MobilePhone.prototype.setWallpaperConfig = function (config) {
    if (!this.$phoneContainer || !config) return;

    var $screen = this.$phoneContainer.find(".xiaoxin-phone-screen");
    if (config.url) {
        $screen.css("background-image", "url(" + config.url + ")");
    }

    if (typeof config.scale === "number") {
        var percent = Math.round(config.scale * 100);
        $screen.css("background-size", percent + "% auto");
    }

    if (typeof config.offsetY === "number") {
        $screen.css("background-position", "center " + config.offsetY + "%");
    }

    // 保存壁纸配置到全局变量
    this.saveHomeSettings({ wallpaper: config });
};

// 更新时间显示
MobilePhone.prototype.updateTime = function () {
    if (!this.$phoneContainer) return;

    var now = new Date();
    var hours = now.getHours();
    var minutes = now.getMinutes();
    var timeStr = hours + ":" + (minutes < 10 ? "0" + minutes : minutes);

    this.$phoneContainer.find(".xiaoxin-time").text(timeStr);
    // 时间更新的同时，根据当前页面重新评估一次状态栏颜色
    this.updateStatusBarTheme();

    // 如果当前是微信注册页面，强制时间显示为黑色
    var $register = this.$phoneContainer.find(".xiaoxin-wechat-register");
    if ($register.length) {
        var $time = this.$phoneContainer.find(
            ".xiaoxin-status-bar .xiaoxin-time"
        );
        $time.css("color", "#000");
        // 使用 attr 方式强制覆盖
        $time.attr("style", $time.attr("style") + " color: #000 !important;");
    }
};

// 根据当前页面明暗程度，自适配状态栏文字颜色
MobilePhone.prototype.updateStatusBarTheme = function () {
    if (!this.$phoneContainer || !this.$statusBar) return;

    var isLightBackground = false;

    if (this.currentPage === "home") {
        // 主页：根据整体屏幕背景色来判断（先读取背景色作为近似）
        var screenEl = this.$phoneContainer.find(".xiaoxin-phone-screen")[0];
        if (screenEl) {
            var bg = window.getComputedStyle(screenEl).backgroundColor;
            isLightBackground = this._isLightColor(bg);
        }
    } else {
        // 应用页面：根据应用页背景色判断
        var appPageEl = this.$phoneContainer.find(".xiaoxin-app-page")[0];
        if (appPageEl) {
            // 先检查是否有注册页面（白色背景）
            var $register = this.$phoneContainer.find(
                ".xiaoxin-wechat-register"
            );
            if ($register.length) {
                // 注册页面是白色背景，时间应该显示为黑色
                isLightBackground = true;
            } else {
                var appBg = window.getComputedStyle(appPageEl).backgroundColor;
                isLightBackground = this._isLightColor(appBg);
            }
        }
    }

    this.$statusBar.removeClass("status-light status-dark");
    this.$statusBar.addClass(
        isLightBackground ? "status-light" : "status-dark"
    );

    // 如果用户设置了桌面字体颜色，则主页时间颜色以用户设置为准（仅主页）
    if (this.currentPage === "home") {
        try {
            var getVars =
                typeof getVariables === "function"
                    ? getVariables
                    : typeof window !== "undefined" && window.getVariables;
            var s = null;
            if (getVars) {
                var g = getVars({ type: "global" }) || {};
                s = g[this.STORAGE_KEY] || null;
            }
            if (!s) {
                var stored = localStorage.getItem(this.STORAGE_KEY);
                s = stored ? JSON.parse(stored) : null;
            }
            var homeColor = s && s.fontTheme && s.fontTheme.homeColor;
            if (homeColor) {
                this.$phoneContainer
                    .find(".xiaoxin-status-bar .xiaoxin-time")
                    .css("color", homeColor);
            }
        } catch (e) {
            // ignore
        }
    }
};

// 简单判断颜色明暗（支持 rgb/rgba 字符串）
MobilePhone.prototype._isLightColor = function (colorStr) {
    if (!colorStr) return false;

    var match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) {
        // 如果不是 rgb 形式，默认按深色处理，避免看不清
        return false;
    }

    var r = parseInt(match[1], 10);
    var g = parseInt(match[2], 10);
    var b = parseInt(match[3], 10);

    // 感知亮度公式
    var luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance >= 150; // 阈值可按需要微调
};

// 切换手机显示/隐藏
MobilePhone.prototype.togglePhone = function () {
    // 检查插件总开关
    var pluginEnabled =
        localStorage.getItem("xiaoxin_plugin_enabled") !== "false";
    if (!pluginEnabled) {
        console.info("[小馨手机] 插件已禁用，无法显示手机");
        if (typeof toastr !== "undefined") {
            toastr.warning("请先在设置中启用插件", "小馨手机", {
                timeOut: 3000,
            });
        }
        return;
    }

    this.isPhoneVisible = !this.isPhoneVisible;

    if (this.isPhoneVisible) {
        this.showPhone();
    } else {
        this.hidePhone();
    }
};

// 显示手机
MobilePhone.prototype.showPhone = function () {
    // 检查插件总开关
    var pluginEnabled =
        localStorage.getItem("xiaoxin_plugin_enabled") !== "false";
    if (!pluginEnabled) {
        console.info("[小馨手机] 插件已禁用，无法显示手机");
        return;
    }

    this.$phoneContainer.addClass("visible");
    this.isPhoneVisible = true;
    // 恢复显示和交互
    this.$phoneContainer.css({
        "pointer-events": "auto",
        "visibility": "visible",
        "display": "block"
    });
    this.ensureSystemOverlays();
    console.info("[小馨手机] 手机界面已显示");
};

// 隐藏手机
MobilePhone.prototype.hidePhone = function () {
    this.$phoneContainer.removeClass("visible");
    this.isPhoneVisible = false;
    // 强制禁用所有指针事件，确保不会误触
    this.$phoneContainer.css({
        "pointer-events": "none",
        "visibility": "hidden",
        "display": "none"
    });
    // 不再强制返回主页，只是隐藏手机容器，保持当前页面状态
    console.info("[小馨手机] 手机界面已隐藏（保持当前页面状态）");
};

// 打开应用
MobilePhone.prototype.openApp = function (appName) {
    if (this.currentPage === appName) return;

    var self = this;

    // 已开发的应用列表
    var developedApps = ["设置", "微信"];

    // 检查应用是否已开发
    var isDeveloped = false;
    if (appName === "设置") {
        isDeveloped =
            window.XiaoxinSettingsApp &&
            typeof window.XiaoxinSettingsApp.render === "function";
    } else if (appName === "微信") {
        isDeveloped =
            window.XiaoxinWeChatApp &&
            typeof window.XiaoxinWeChatApp.render === "function";
    }

    // 如果应用未开发，显示提示并返回
    if (!isDeveloped) {
        if (typeof toastr !== "undefined") {
            toastr.info(appName + " 正在开发中", "小馨手机", {
                timeOut: 3000,
            });
        } else {
            alert(appName + " 正在开发中");
        }
        console.info("[小馨手机] " + appName + " 应用未开发，显示提示");
        return;
    }

    var $homePage = this.$phoneContainer.find(".xiaoxin-home-page");
    var $appPage = this.$phoneContainer.find(".xiaoxin-app-page");

    // 根据应用名称加载对应的应用内容
    $appPage.empty();

    // 如果是「设置」应用，调用设置应用的渲染函数
    if (
        appName === "设置" &&
        window.XiaoxinSettingsApp &&
        typeof window.XiaoxinSettingsApp.render === "function"
    ) {
        // 标记为设置应用，让样式可以把内容顶到屏幕最上方
        $appPage.addClass("xiaoxin-app-settings");
        window.XiaoxinSettingsApp.render($appPage, this);
    } else if (
        appName === "微信" &&
        window.XiaoxinWeChatApp &&
        typeof window.XiaoxinWeChatApp.render === "function"
    ) {
        $appPage.removeClass("xiaoxin-app-settings");
        window.XiaoxinWeChatApp.render($appPage, this);
    } else {
        // 其它应用恢复默认样式（理论上不会执行到这里，因为上面已经检查过了）
        $appPage.removeClass("xiaoxin-app-settings");
        // 默认的占位内容
        var $appContent = $(
            '<div class="xiaoxin-app-content">' + appName + " 应用内容</div>"
        );
        $appPage.append($appContent);
    }

    // 查找应用图标位置（使用jQuery的data方法）
    var $appIcon = null;
    this.$phoneContainer.find(".xiaoxin-app-icon").each(function () {
        if ($(this).data("app") === appName) {
            $appIcon = $(this);
            return false; // 找到后退出循环
        }
    });
    if (!$appIcon || !$appIcon.length) {
        // 如果在主页找不到，尝试在 Dock 中查找
        this.$phoneContainer.find(".xiaoxin-dock-icon").each(function () {
            if ($(this).data("app") === appName) {
                $appIcon = $(this);
                return false; // 找到后退出循环
            }
        });
    }

    // 隐藏 Dock（只在主页显示）
    var $dock = self.$phoneContainer.find(".xiaoxin-dock");
    if ($dock.length) {
        $dock.addClass("hidden");
    }

    // iOS 风格打开动画：从图标位置放大到全屏
    if ($appIcon && $appIcon.length) {
        console.info("[小馨手机] 找到应用图标，开始iOS风格动画:", appName);
        // 获取图标在手机屏幕中的位置
        var iconRect = $appIcon[0].getBoundingClientRect();
        var phoneScreenRect = this.$phoneScreen[0].getBoundingClientRect();

        // 计算图标相对于手机屏幕的位置和尺寸
        var iconX = iconRect.left - phoneScreenRect.left;
        var iconY = iconRect.top - phoneScreenRect.top;
        var iconWidth = iconRect.width;
        var iconHeight = iconRect.height;

        // 手机屏幕尺寸
        var screenWidth = phoneScreenRect.width;
        var screenHeight = phoneScreenRect.height;

        // 计算缩放比例（等比缩放，以宽度为准）
        var scale = iconWidth / screenWidth;
        // 初始位移（以 "top left" 为原点）
        var translateX = iconX;
        var translateY = iconY;

        // 初始状态：从图标位置开始
        // 先移除所有可能的transition，确保初始状态立即生效
        $appPage.removeClass("hidden slide-in-right slide-out-right").css({
            transformOrigin: "top left",
            transform:
                "translate3d(" +
                translateX +
                "px, " +
                translateY +
                "px, 0) scale(" +
                scale +
                ")",
            opacity: 1,
            borderRadius: "13px", // 图标圆角
            clipPath: "inset(0 round 13px)", // 匹配圆角
            transition: "none", // 先禁用transition
            willChange: "transform, opacity, border-radius, clip-path",
        });

        // 强制重排，确保初始状态生效
        $appPage[0].offsetHeight;

        // 动画到全屏（使用双重requestAnimationFrame确保浏览器已渲染初始状态）
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                $appPage.css({
                    transform: "none", // 不使用 translate3d，避免模糊
                    borderRadius: "40px", // 手机屏幕圆角
                    clipPath: "inset(0 round 40px)", // 匹配圆角
                    transition:
                        "border-radius 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), clip-path 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                });
            });
        });

        // 隐藏主页（不使用 display:none，避免返回时重新布局导致只显示壁纸）
        setTimeout(function () {
            $homePage.addClass("xiaoxin-home-page-inactive");
            self.currentPage = appName;
            // 清理动画状态
            setTimeout(function () {
                $appPage.css({
                    willChange: "auto",
                    clipPath: "", // 清理 clip-path，恢复默认
                });
            }, 400);
        }, 50);
    } else {
        // 如果找不到图标，使用默认动画
        console.warn("[小馨手机] 未找到应用图标，使用默认滑动动画:", appName);
        $homePage.addClass("slide-out-left");
        $appPage.addClass("slide-in-right");

        setTimeout(function () {
            $homePage.addClass("xiaoxin-home-page-inactive");
            $appPage.removeClass("hidden");
            self.currentPage = appName;
        }, 300);
    }

    console.info("[小馨手机] 打开应用: " + appName);
    this.ensureSystemOverlays();
};

// 关闭应用（返回主页）
MobilePhone.prototype.closeApp = function () {
    if (this.currentPage === "home") return;

    var self = this;
    var $homePage = this.$phoneContainer.find(".xiaoxin-home-page");
    var $appPage = this.$phoneContainer.find(".xiaoxin-app-page");
    var appName = this.currentPage;

    // 显示主页（桌面始终预加载，仅切换为可见/可交互）
    $homePage.removeClass("slide-out-left");
    $homePage.removeClass("xiaoxin-home-page-inactive");

    // 显示 Dock（返回主页时显示）
    var $dock = this.$phoneContainer.find(".xiaoxin-dock");
    if ($dock.length) {
        $dock.removeClass("hidden");
    }
    this.ensureSystemOverlays();

    // 查找应用图标位置（使用jQuery的data方法）
    var $appIcon = null;
    this.$phoneContainer.find(".xiaoxin-app-icon").each(function () {
        if ($(this).data("app") === appName) {
            $appIcon = $(this);
            return false; // 找到后退出循环
        }
    });
    if (!$appIcon || !$appIcon.length) {
        // 如果在主页找不到，尝试在 Dock 中查找
        this.$phoneContainer.find(".xiaoxin-dock-icon").each(function () {
            if ($(this).data("app") === appName) {
                $appIcon = $(this);
                return false; // 找到后退出循环
            }
        });
    }

    // iOS 风格关闭动画：从全屏缩小到图标位置并渐隐
    if ($appIcon && $appIcon.length) {
        console.info("[小馨手机] 找到应用图标，开始iOS风格关闭动画:", appName);
        // 获取图标在手机屏幕中的位置
        var iconRect = $appIcon[0].getBoundingClientRect();
        var phoneScreenRect = this.$phoneScreen[0].getBoundingClientRect();

        // 计算图标相对于手机屏幕的位置和尺寸
        var iconX = iconRect.left - phoneScreenRect.left;
        var iconY = iconRect.top - phoneScreenRect.top;
        var iconWidth = iconRect.width;
        var iconHeight = iconRect.height;

        // 手机屏幕尺寸
        var screenWidth = phoneScreenRect.width;
        var screenHeight = phoneScreenRect.height;

        // 计算缩放比例（等比缩放，以宽度为准）
        var scale = iconWidth / screenWidth;
        var translateX = iconX;
        var translateY = iconY;

        // 设置动画状态
        // 先移除所有可能的transition，确保当前状态被记录
        $appPage.removeClass("slide-in-right slide-out-right").css({
            willChange: "transform, opacity, border-radius, clip-path",
            transition: "none", // 先禁用transition
        });

        // 强制重排
        $appPage[0].offsetHeight;

        // 动画到图标位置并渐隐（使用双重requestAnimationFrame确保浏览器已记录当前状态）
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                $appPage.css({
                    transformOrigin: "top left",
                    transform:
                        "translate3d(" +
                        translateX +
                        "px, " +
                        translateY +
                        "px, 0) scale(" +
                        scale +
                        ")",
                    borderRadius: "13px", // 图标圆角
                    clipPath: "inset(0 round 13px)", // 匹配圆角
                    opacity: 0,
                    transition:
                        "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), border-radius 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), clip-path 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                });
            });
        });

        // 动画完成后隐藏应用页面
        setTimeout(function () {
            $appPage.addClass("hidden");
            $appPage.css({
                transform: "",
                borderRadius: "",
                clipPath: "",
                opacity: "",
                transition: "",
                willChange: "auto",
            });
            self.currentPage = "home";
        }, 400);
    } else {
        // 如果找不到图标，使用默认动画
        $appPage.addClass("slide-out-right");
        $homePage.addClass("slide-in-left");

        setTimeout(function () {
            $appPage.addClass("hidden");
            $appPage.removeClass("slide-in-right slide-out-right");
            $homePage.removeClass("slide-in-left");
            self.currentPage = "home";
        }, 300);
    }

    console.info("[小馨手机] 返回主页");
};

// 初始化 Home Indicator 手势
MobilePhone.prototype.initHomeIndicatorGesture = function ($indicator) {
    var self = this;
    var startY = 0;
    var currentY = 0;
    var threshold = 30; // 上滑阈值（像素）
    var lastDeltaY = 0; // 记录最近一次滑动的距离，作为点击兜底逻辑

    function onMouseDown(e) {
        // 移除主页限制，现在可以在任何页面使用
        // 在移动设备上，不要立即 preventDefault，避免阻止触摸事件
        var isTouch = e.type === "touchstart" || (e.touches && e.touches[0]);
        if (!isTouch) {
            e.preventDefault();
        }
        e.stopPropagation();
        self.isHomeIndicatorDragging = true;

        // 支持触摸事件
        var clientY =
            e.clientY !== undefined
                ? e.clientY
                : e.touches && e.touches[0]
                ? e.touches[0].clientY
                : 0;
        startY = clientY;
        $indicator.addClass("dragging");

        $(document).on("mousemove.xiaoxinHomeIndicator", onMouseMove);
        $(document).on("mouseup.xiaoxinHomeIndicator", onMouseUp);
        $(document).on("touchmove.xiaoxinHomeIndicator", function (e) {
            e.preventDefault();
            if (e.originalEvent.touches && e.originalEvent.touches[0]) {
                var touch = e.originalEvent.touches[0];
                var fakeEvent = {
                    clientY: touch.clientY,
                    preventDefault: function () {
                        e.preventDefault();
                    },
                };
                onMouseMove(fakeEvent);
            }
        });
        $(document).on("touchend.xiaoxinHomeIndicator", function (e) {
            onMouseUp(e);
        });
    }

    function onMouseMove(e) {
        if (!self.isHomeIndicatorDragging) return;

        // 只有在拖动时才 preventDefault
        e.preventDefault();

        // 支持触摸事件
        var clientY =
            e.clientY !== undefined
                ? e.clientY
                : e.touches && e.touches[0]
                ? e.touches[0].clientY
                : startY;
        currentY = clientY;
        var deltaY = startY - currentY; // 向上滑动为正值
        lastDeltaY = deltaY;

        if (deltaY > 0) {
            // 向上滑动，显示返回动画
            var progress = Math.min(deltaY / threshold, 1);
            // 保持水平居中，只改变垂直位置
            $indicator.css(
                "transform",
                "translate3d(0, " + -deltaY * 0.5 + "px, 0)"
            );

            // 如果超过阈值，触发返回主页
            if (deltaY >= threshold && self.currentPage !== "home") {
                self.closeApp();
                onMouseUp();
            }
        }
    }

    function onMouseUp(e) {
        if (!self.isHomeIndicatorDragging) return;

        self.isHomeIndicatorDragging = false;
        $indicator.removeClass("dragging");
        // 恢复位置（命中区为全宽，水平不再需要 -50% 偏移）
        $indicator.css("transform", "translate3d(0, 0, 0)");

        // 兜底逻辑：如果用户点了一下或轻微上滑，而没有达到阈值，但当前不在主页，则也视为返回主页
        // 这样可以避免某些浏览器/主题导致的 move 事件丢失，出现“怎么滑都回不去”的情况
        if (self.currentPage !== "home" && lastDeltaY < threshold) {
            console.info(
                "[小馨手机] Home 条点击/轻微上滑触发返回主页，deltaY=",
                lastDeltaY
            );
            self.closeApp();
        }

        $(document).off("mousemove.xiaoxinHomeIndicator", onMouseMove);
        $(document).off("mouseup.xiaoxinHomeIndicator", onMouseUp);
        $(document).off("touchmove.xiaoxinHomeIndicator");
        $(document).off("touchend.xiaoxinHomeIndicator");
    }

    // 绑定鼠标事件
    $indicator.on("mousedown", onMouseDown);

    // 绑定触摸事件（移动端支持）
    $indicator.on("touchstart", function (e) {
        var touch = e.originalEvent.touches[0];
        if (touch) {
            var mouseEvent = {
                type: "touchstart",
                clientY: touch.clientY,
                touches: e.originalEvent.touches,
                preventDefault: function () {
                    e.preventDefault();
                },
                stopPropagation: function () {
                    e.stopPropagation();
                },
            };
            onMouseDown(mouseEvent);
        }
        // 不要在这里 preventDefault，让触摸事件能够正常处理
    });
};

// 初始化灵动岛长按拖动功能
MobilePhone.prototype.initDynamicIslandDrag = function ($dynamicIsland) {
    var self = this;
    var longPressDelay = 300; // 长按延迟（毫秒）
    var hasMoved = false; // 是否移动过（用于区分点击和拖动）
    
    // 双击检测相关变量
    var lastClickTime = 0;
    var doubleClickDelay = 300; // 双击间隔时间（毫秒）
    var lastClickX = 0;
    var lastClickY = 0;
    var clickTolerance = 10; // 点击位置容差（像素）

    function onMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();

        hasMoved = false;
        // 支持触摸事件
        var clientX =
            e.clientX !== undefined
                ? e.clientX
                : e.touches && e.touches[0]
                ? e.touches[0].clientX
                : 0;
        var clientY =
            e.clientY !== undefined
                ? e.clientY
                : e.touches && e.touches[0]
                ? e.touches[0].clientY
                : 0;
        self.dynamicIslandDragStartX = clientX;
        self.dynamicIslandDragStartY = clientY;

        // 获取手机容器当前的位置
        var phoneRect = self.$phoneContainer[0].getBoundingClientRect();
        self.phoneContainerStartX = phoneRect.left + phoneRect.width / 2;
        self.phoneContainerStartY = phoneRect.top + phoneRect.height / 2;

        // 开始长按计时
        self.dynamicIslandLongPressTimer = setTimeout(function () {
            if (!hasMoved) {
                // 长按成功，开始拖动
                self.isDynamicIslandDragging = true;
                $dynamicIsland.css("cursor", "grabbing");
                self.$phoneContainer.css("cursor", "grabbing");

                // 添加拖动样式类
                self.$phoneContainer.addClass("xiaoxin-phone-dragging");

                console.info("[小馨手机] 开始拖动手机容器");
            }
        }, longPressDelay);

        $(document).on("mousemove.xiaoxinDynamicIsland", onMouseMove);
        $(document).on("mouseup.xiaoxinDynamicIsland", onMouseUp);
        $(document).on("touchmove.xiaoxinDynamicIsland", function (e) {
            e.preventDefault();
            if (e.originalEvent.touches && e.originalEvent.touches[0]) {
                var touch = e.originalEvent.touches[0];
                var fakeEvent = {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    preventDefault: function () {
                        e.preventDefault();
                    },
                };
                onMouseMove(fakeEvent);
            }
        });
        $(document).on("touchend.xiaoxinDynamicIsland", function (e) {
            onMouseUp(e);
        });
    }

    function onMouseMove(e) {
        // 支持触摸事件
        var clientX =
            e.clientX !== undefined
                ? e.clientX
                : e.touches && e.touches[0]
                ? e.touches[0].clientX
                : self.dynamicIslandDragStartX;
        var clientY =
            e.clientY !== undefined
                ? e.clientY
                : e.touches && e.touches[0]
                ? e.touches[0].clientY
                : self.dynamicIslandDragStartY;

        var deltaX = clientX - self.dynamicIslandDragStartX;
        var deltaY = clientY - self.dynamicIslandDragStartY;

        // 如果移动距离超过阈值，认为是拖动而不是点击
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            hasMoved = true;
        }

        if (self.isDynamicIslandDragging) {
            e.preventDefault();

            // 计算新位置
            var newX = self.phoneContainerStartX + deltaX;
            var newY = self.phoneContainerStartY + deltaY;

            // 限制在窗口内（考虑缩放和安全边距）
            var winWidth = $(window).width();
            var winHeight = $(window).height();
            var scale = self.phoneScale || 1;
            var phoneWidth = (self.$phoneContainer.outerWidth() || 393) * scale;
            var phoneHeight =
                (self.$phoneContainer.outerHeight() || 790) * scale;
            var safeMargin = 10; // 安全边距

            newX = Math.max(
                phoneWidth / 2 + safeMargin,
                Math.min(newX, winWidth - phoneWidth / 2 - safeMargin)
            );
            newY = Math.max(
                phoneHeight / 2 + safeMargin,
                Math.min(newY, winHeight - phoneHeight / 2 - safeMargin)
            );

            // 更新手机容器位置（使用 top 和 left，而不是 transform）
            var scale = self.phoneScale || 1;
            self.$phoneContainer.css({
                top: newY + "px",
                left: newX + "px",
                transform: "translate(-50%, -50%) scale(" + scale + ")",
                transition: "none", // 拖动时禁用过渡动画
            });
        }
    }

    function onMouseUp(e) {
        // 清除长按计时器
        if (self.dynamicIslandLongPressTimer) {
            clearTimeout(self.dynamicIslandLongPressTimer);
            self.dynamicIslandLongPressTimer = null;
        }

        if (self.isDynamicIslandDragging) {
            // 拖动结束
            self.isDynamicIslandDragging = false;
            $dynamicIsland.css("cursor", "");
            self.$phoneContainer.css("cursor", "");
            self.$phoneContainer.removeClass("xiaoxin-phone-dragging");

            // 保存位置到设置
            var phoneRect = self.$phoneContainer[0].getBoundingClientRect();
            var savedPosition = {
                x: phoneRect.left + phoneRect.width / 2,
                y: phoneRect.top + phoneRect.height / 2,
            };
            self.saveHomeSettings({ phonePosition: savedPosition });

            console.info("[小馨手机] 拖动结束，位置已保存:", savedPosition);
        } else if (!hasMoved) {
            // 如果不是拖动，且没有移动，检测是否是双击
            var currentTime = Date.now();
            var currentX = self.dynamicIslandDragStartX;
            var currentY = self.dynamicIslandDragStartY;
            
            // 检查是否是双击（时间间隔和位置都符合要求）
            if (
                currentTime - lastClickTime < doubleClickDelay &&
                Math.abs(currentX - lastClickX) < clickTolerance &&
                Math.abs(currentY - lastClickY) < clickTolerance
            ) {
                // 双击成功，隐藏手机
                e.preventDefault();
                e.stopPropagation();
                console.info("[小馨手机] 检测到双击灵动岛，隐藏手机");
                self.hidePhone();
                
                // 重置双击检测变量
                lastClickTime = 0;
                lastClickX = 0;
                lastClickY = 0;
            } else {
                // 记录本次点击信息，等待下次点击
                lastClickTime = currentTime;
                lastClickX = currentX;
                lastClickY = currentY;
            }
        }

        $(document).off("mousemove.xiaoxinDynamicIsland", onMouseMove);
        $(document).off("mouseup.xiaoxinDynamicIsland", onMouseUp);
        $(document).off("touchmove.xiaoxinDynamicIsland");
        $(document).off("touchend.xiaoxinDynamicIsland");
    }

    // 绑定鼠标事件
    $dynamicIsland.on("mousedown", onMouseDown);

    // 也支持触摸事件（移动端）
    $dynamicIsland.on("touchstart", function (e) {
        var touch = e.originalEvent.touches[0];
        if (touch) {
            var mouseEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                touches: e.originalEvent.touches,
                preventDefault: function () {
                    e.preventDefault();
                },
                stopPropagation: function () {
                    e.stopPropagation();
                },
            };
            onMouseDown(mouseEvent);
        }
        e.preventDefault();
    });
};

// 显示头像选择弹窗（显示在手机主页内，不模糊背景）
MobilePhone.prototype.showAvatarPicker = function ($avatarElement) {
    var self = this;

    // 如果已有弹窗，先移除
    this.$phoneScreen.find(".xiaoxin-picker-overlay").remove();

    // 创建遮罩层（显示在手机屏幕内，不模糊背景）
    var $overlay = $('<div class="xiaoxin-picker-overlay"></div>');

    // 创建弹窗容器
    var $picker = $('<div class="xiaoxin-picker"></div>');
    var $pickerTitle = $('<div class="xiaoxin-picker-title">选择头像</div>');

    // URL 输入行
    var $rowUrl = $('<div class="xiaoxin-picker-row"></div>');
    $rowUrl.append('<div class="xiaoxin-picker-label">头像 URL</div>');
    var $urlControl = $('<div class="xiaoxin-picker-control"></div>');
    var $urlInput = $('<input type="url" placeholder="https://...">');
    $urlControl.append($urlInput);
    $rowUrl.append($urlControl);

    // 本地上传行
    var $rowUpload = $('<div class="xiaoxin-picker-row"></div>');
    $rowUpload.append('<div class="xiaoxin-picker-label">本地上传</div>');
    var $uploadControl = $('<div class="xiaoxin-picker-control"></div>');
    var $fileInput = $(
        '<input type="file" accept="image/*" style="display:none;">'
    );
    var $uploadBtn = $(
        '<button class="xiaoxin-picker-button">选择图片</button>'
    );
    $uploadControl.append($uploadBtn, $fileInput);
    $rowUpload.append($uploadControl);

    // 预览区域（1:1 比例）
    var $rowPreview = $('<div class="xiaoxin-picker-row"></div>');
    $rowPreview.append('<div class="xiaoxin-picker-label">预览</div>');
    var $previewControl = $('<div class="xiaoxin-picker-control"></div>');
    var $preview = $(
        '<div class="xiaoxin-picker-preview"><div class="xiaoxin-picker-preview-inner"></div></div>'
    );
    $previewControl.append($preview);
    $rowPreview.append($previewControl);

    // 按钮行
    var $rowButtons = $(
        '<div class="xiaoxin-picker-row xiaoxin-picker-buttons"></div>'
    );
    var $cancelBtn = $(
        '<button class="xiaoxin-picker-button xiaoxin-picker-button-cancel">取消</button>'
    );
    var $confirmBtn = $(
        '<button class="xiaoxin-picker-button xiaoxin-picker-button-confirm">确定</button>'
    );
    $rowButtons.append($cancelBtn, $confirmBtn);

    $picker.append($pickerTitle, $rowUrl, $rowUpload, $rowPreview, $rowButtons);
    $overlay.append($picker);
    // 添加到 body，避免受到手机整体缩放(transform: scale)影响而发虚
    $("body").append($overlay);

    // 在手机页面上，需要相对于手机容器定位
    self.adjustPickerPosition($overlay);

    // 监听窗口大小变化，重新调整位置
    var resizeHandler1 = function () {
        self.adjustPickerPosition($overlay);
    };
    $(window).on("resize.xiaoxinPicker1", resizeHandler1);

    // 弹窗关闭时移除监听
    var originalRemove1 = $overlay.remove;
    $overlay.remove = function () {
        $(window).off("resize.xiaoxinPicker1", resizeHandler1);
        return originalRemove1.call(this);
    };

    var $previewInner = $preview.find(".xiaoxin-avatar-picker-preview-inner");
    var avatarUrl = null;

    // 读取当前头像
    var currentBg = $avatarElement.css("background-image");
    if (currentBg && currentBg !== "none") {
        var match = currentBg.match(/url\\(\"?(.*)\"?\\)/);
        if (match && match[1]) {
            avatarUrl = match[1];
            $urlInput.val(avatarUrl);
            $previewInner.css("background-image", "url(" + avatarUrl + ")");
        }
    }

    // URL 输入
    $urlInput.on("input", function () {
        var url = $(this).val().trim();
        if (url) {
            avatarUrl = url;
            $previewInner.css("background-image", "url(" + url + ")");
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
            avatarUrl = evt.target.result;
            $urlInput.val(avatarUrl);
            $previewInner.css("background-image", "url(" + avatarUrl + ")");
        };
        reader.readAsDataURL(file);
    });

    // 取消
    $cancelBtn.on("click", function () {
        $overlay.remove();
    });

    // 确定
    $confirmBtn.on("click", function () {
        if (avatarUrl) {
            $avatarElement.css("background-image", "url(" + avatarUrl + ")");
            // 保存到全局变量
            self.saveHomeSettings({ avatarUrl: avatarUrl });
            console.info("[小馨手机] 头像已更新并保存:", avatarUrl);
        }
        $overlay.remove();
    });

    // 点击遮罩层关闭
    $overlay.on("click", function (e) {
        if ($(e.target).hasClass("xiaoxin-picker-overlay")) {
            $overlay.remove();
        }
    });
};

// 显示文案编辑弹窗（显示在手机主页内，不模糊背景）
// 根据可用宽度自动缩放横条主标题，确保一行显示且不截断
MobilePhone.prototype.fitTopWidgetTitle = function () {
    var self = this;

    function doFit() {
        try {
            if (!self.$phoneContainer) return;
            var $title = self.$phoneContainer.find(".xiaoxin-top-widget-title");
            if (!$title.length) return;

            var $center = self.$phoneContainer.find(
                ".xiaoxin-top-widget-center"
            );
            if (!$center.length) return;

            // 预留少量安全边距，避免贴边
            var paddingSafe = 6;

            // 先恢复基准状态
            var baseSize = 14;
            var minSize = 12;
            $title.css({
                fontSize: baseSize + "px",
                transform: "none",
                transformOrigin: "left center",
            });

            // 用 scrollWidth 更可靠（不受 transform 影响）
            var centerWidth =
                $center[0].getBoundingClientRect().width - paddingSafe;
            var titleScrollWidth = $title[0].scrollWidth;

            if (centerWidth <= 0 || titleScrollWidth <= 0) return;

            // 1) 先尝试缩小字号
            var size = baseSize;
            while (titleScrollWidth > centerWidth && size > minSize) {
                size -= 1;
                $title.css({ fontSize: size + "px" });
                titleScrollWidth = $title[0].scrollWidth;
            }

            // 2) 如果还超，再用 scaleX 作最后兜底（不换行、不截断）
            if (titleScrollWidth > centerWidth) {
                var ratio = centerWidth / titleScrollWidth;
                ratio = Math.max(0.9, Math.min(1, ratio));
                $title.css({ transform: "scaleX(" + ratio + ")" });
            } else {
                $title.css({ transform: "none" });
            }
        } catch (e) {
            console.warn("[小馨手机] fitTopWidgetTitle 失败:", e);
        }
    }

    // 立即 fit 一次 + 下一帧再 fit 一次（解决首次渲染/字体加载导致的测量偏差）
    doFit();
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(doFit);
    } else {
        setTimeout(doFit, 0);
    }
};

MobilePhone.prototype.showTextEditor = function ($titleElement) {
    var self = this;

    // 如果已有弹窗，先移除
    this.$phoneScreen.find(".xiaoxin-picker-overlay").remove();

    // 创建遮罩层（显示在手机屏幕内，不模糊背景）
    var $overlay = $('<div class="xiaoxin-picker-overlay"></div>');

    // 创建弹窗容器
    var $picker = $('<div class="xiaoxin-picker"></div>');
    var $pickerTitle = $('<div class="xiaoxin-picker-title">编辑文案</div>');

    // 文案输入行
    var $rowText = $('<div class="xiaoxin-picker-row"></div>');
    $rowText.append('<div class="xiaoxin-picker-label">文案内容</div>');
    var $textControl = $('<div class="xiaoxin-picker-control"></div>');
    var $textInput = $(
        '<input type="text" placeholder="请输入文案（最多10个字）" maxlength="10">'
    );
    $textControl.append($textInput);
    $rowText.append($textControl);

    // 字数提示
    var $rowHint = $('<div class="xiaoxin-picker-row"></div>');
    var $hint = $('<div class="xiaoxin-picker-hint">最多10个字</div>');
    $rowHint.append($hint);

    // 按钮行
    var $rowButtons = $(
        '<div class="xiaoxin-picker-row xiaoxin-picker-buttons"></div>'
    );
    var $cancelBtn = $(
        '<button class="xiaoxin-picker-button xiaoxin-picker-button-cancel">取消</button>'
    );
    var $confirmBtn = $(
        '<button class="xiaoxin-picker-button xiaoxin-picker-button-confirm">确定</button>'
    );
    $rowButtons.append($cancelBtn, $confirmBtn);

    $picker.append($pickerTitle, $rowText, $rowHint, $rowButtons);
    $overlay.append($picker);
    // 添加到 body，避免受到手机整体缩放(transform: scale)影响而发虚
    $("body").append($overlay);

    // 在手机页面上，需要相对于手机容器定位
    self.adjustPickerPosition($overlay);

    // 监听窗口大小变化，重新调整位置
    var resizeHandler2 = function () {
        self.adjustPickerPosition($overlay);
    };
    $(window).on("resize.xiaoxinPicker2", resizeHandler2);

    // 弹窗关闭时移除监听
    var originalRemove2 = $overlay.remove;
    $overlay.remove = function () {
        $(window).off("resize.xiaoxinPicker2", resizeHandler2);
        return originalRemove2.call(this);
    };

    // 读取当前文案
    var currentText = $titleElement.text().trim();
    $textInput.val(currentText);

    // 实时字数统计
    var $charCount = $('<span class="xiaoxin-picker-char-count">0/10</span>');
    $hint.append($charCount);

    function updateCharCount() {
        var length = $textInput.val().length;
        $charCount.text(length + "/10");
        if (length >= 10) {
            $charCount.css("color", "#ff3b30");
        } else {
            $charCount.css("color", "#8e8e93");
        }
    }

    updateCharCount();
    $textInput.on("input", updateCharCount);

    // 取消
    $cancelBtn.on("click", function () {
        $overlay.remove();
    });

    // 确定
    $confirmBtn.on("click", function () {
        var newText = $textInput.val().trim();
        if (newText) {
            $titleElement.text(newText);
            // 更新后重新适配一次宽度（确保一行显示完全）
            self.fitTopWidgetTitle();
            // 保存到全局变量
            self.saveHomeSettings({ widgetText: newText });
            console.info("[小馨手机] 文案已更新并保存:", newText);
        }
        $overlay.remove();
    });

    // 点击遮罩层关闭
    $overlay.on("click", function (e) {
        if ($(e.target).hasClass("xiaoxin-picker-overlay")) {
            $overlay.remove();
        }
    });

    // 自动聚焦输入框
    setTimeout(function () {
        $textInput.focus();
    }, 100);
};

// 应用桌面字体颜色/渐变（主页图标文字 + 主页时间 + 横条字样整体）
// 约定：
// - homeColor：桌面整体文字颜色（图标文字 + 主页左上角时间）
// - barMode/barColor/barGradient：横条字样整体（主标题 + 副标题 + 温度）
MobilePhone.prototype.applyFontTheme = function (theme) {
    if (!this.$phoneContainer) return;

    var cfg = theme || {};

    // 1) 桌面整体文字颜色（仅影响主页）
    var homeColor = cfg.homeColor || null;
    if (homeColor) {
        this.$phoneContainer
            .find(".xiaoxin-app-icon-label")
            .css("color", homeColor);
        // 只改主页左上角时间；其它页面仍由 updateStatusBarTheme 自适应
        this.$phoneContainer
            .find(".xiaoxin-status-bar .xiaoxin-time")
            .css("color", homeColor);
    }

    // 2) 横条字样整体（支持渐变）
    var barMode = cfg.barMode || cfg.titleMode || "solid"; // 兼容旧字段 titleMode
    var barColor = cfg.barColor || cfg.titleColor || homeColor || "#fff";
    var barGradient = cfg.barGradient || cfg.titleGradient || null;

    var $barTexts = this.$phoneContainer.find(
        ".xiaoxin-top-widget-title, .xiaoxin-top-widget-sub, .xiaoxin-top-widget-temp"
    );

    if (
        barMode === "gradient" &&
        barGradient &&
        barGradient.from &&
        barGradient.to
    ) {
        var from = barGradient.from;
        var to = barGradient.to;
        var angle =
            typeof barGradient.angle === "number" ? barGradient.angle : 90;
        $barTexts.css({
            backgroundImage:
                "linear-gradient(" + angle + "deg, " + from + ", " + to + ")",
            color: "transparent",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            // 不使用辉光（text-shadow）避免出现模糊遮罩
            textShadow: "none",
        });
    } else {
        // 恢复纯色
        $barTexts.css({
            backgroundImage: "none",
            WebkitBackgroundClip: "initial",
            backgroundClip: "initial",
            WebkitTextFillColor: "initial",
            textShadow: "none",
            color: barColor,
        });
    }
};

// 字体/横条文字颜色调色盘弹窗
MobilePhone.prototype.showFontColorPicker = function () {
    var self = this;

    // 移除已有弹窗
    $(".xiaoxin-picker-overlay").remove();

    var $overlay = $('<div class="xiaoxin-picker-overlay"></div>');
    var $picker = $('<div class="xiaoxin-picker"></div>');
    var $pickerTitle = $(
        '<div class="xiaoxin-picker-title">桌面字体颜色</div>'
    );

    // 当前配置（尽量从已保存设置中读取）
    var current = (function () {
        try {
            var getVars =
                typeof getVariables === "function"
                    ? getVariables
                    : typeof window !== "undefined" && window.getVariables;
            if (getVars) {
                var globalData = getVars({ type: "global" }) || {};
                var s = globalData[self.STORAGE_KEY] || {};
                return s.fontTheme || {};
            }
        } catch (e) {}
        try {
            var stored = localStorage.getItem(self.STORAGE_KEY);
            var s2 = stored ? JSON.parse(stored) : {};
            return s2.fontTheme || {};
        } catch (e2) {}
        return {};
    })();

    var theme = {
        homeColor: current.homeColor || "#ffffff",
        // 新字段：横条字样整体（主标题+副标题+温度）
        barMode: current.barMode || current.titleMode || "solid",
        barColor: current.barColor || current.titleColor || "#ffffff", // 纯色默认白色更清晰
        barGradient: {
            from:
                (current.barGradient && current.barGradient.from) ||
                (current.titleGradient && current.titleGradient.from) ||
                "#ff89e9", // 默认渐变起点：亮粉色
            to:
                (current.barGradient && current.barGradient.to) ||
                (current.titleGradient && current.titleGradient.to) ||
                "#89cffc", // 默认渐变终点：亮蓝色
            angle:
                current.barGradient &&
                typeof current.barGradient.angle === "number"
                    ? current.barGradient.angle
                    : current.titleGradient &&
                      typeof current.titleGradient.angle === "number"
                    ? current.titleGradient.angle
                    : 90,
        },
    };

    // 桌面字体颜色
    var $rowHome = $('<div class="xiaoxin-picker-row"></div>');
    $rowHome.append('<div class="xiaoxin-picker-label">桌面文字</div>');
    var $homeCtrl = $('<div class="xiaoxin-picker-control"></div>');
    var $homeColor = $('<input type="color">').val(theme.homeColor);
    $homeCtrl.append($homeColor);
    $rowHome.append($homeCtrl);

    // 横条标题模式
    var $rowMode = $('<div class="xiaoxin-picker-row"></div>');
    $rowMode.append('<div class="xiaoxin-picker-label">横条字样</div>');
    var $modeCtrl = $('<div class="xiaoxin-picker-control"></div>');
    var $modeSelect = $(
        '<select class="xiaoxin-settings-select" style="min-width:120px;"><option value="solid">纯色</option><option value="gradient">渐变</option></select>'
    );
    $modeSelect.val(theme.barMode);
    $modeCtrl.append($modeSelect);
    $rowMode.append($modeCtrl);

    // 纯色选择
    var $rowTitleSolid = $('<div class="xiaoxin-picker-row"></div>');
    $rowTitleSolid.append('<div class="xiaoxin-picker-label">横条纯色</div>');
    var $titleSolidCtrl = $('<div class="xiaoxin-picker-control"></div>');
    var $titleColor = $('<input type="color">').val(theme.barColor);
    $titleSolidCtrl.append($titleColor);
    $rowTitleSolid.append($titleSolidCtrl);

    // 渐变选择
    var $rowTitleGrad1 = $('<div class="xiaoxin-picker-row"></div>');
    $rowTitleGrad1.append('<div class="xiaoxin-picker-label">渐变起点</div>');
    var $grad1Ctrl = $('<div class="xiaoxin-picker-control"></div>');
    var $gradFrom = $('<input type="color">').val(theme.barGradient.from);
    $grad1Ctrl.append($gradFrom);
    $rowTitleGrad1.append($grad1Ctrl);

    var $rowTitleGrad2 = $('<div class="xiaoxin-picker-row"></div>');
    $rowTitleGrad2.append('<div class="xiaoxin-picker-label">渐变终点</div>');
    var $grad2Ctrl = $('<div class="xiaoxin-picker-control"></div>');
    var $gradTo = $('<input type="color">').val(theme.barGradient.to);
    $grad2Ctrl.append($gradTo);
    $rowTitleGrad2.append($grad2Ctrl);

    var $rowAngle = $('<div class="xiaoxin-picker-row"></div>');
    $rowAngle.append('<div class="xiaoxin-picker-label">渐变角度</div>');
    var $angleCtrl = $('<div class="xiaoxin-picker-control"></div>');
    var $angle = $('<input type="range" min="0" max="360" step="1">').val(
        String(theme.barGradient.angle)
    );
    var $angleTxt = $(
        '<span style="font-size:12px;color:#8e8e93;min-width:42px;text-align:right;"></span>'
    ).text(theme.barGradient.angle + "°");
    $angleCtrl.append($angle, $angleTxt);
    $rowAngle.append($angleCtrl);

    // 预览
    var $rowPreview = $(
        '<div class="xiaoxin-picker-row" style="align-items:flex-start;"></div>'
    );
    $rowPreview.append('<div class="xiaoxin-picker-label">预览</div>');
    var $previewCtrl = $(
        '<div class="xiaoxin-picker-control" style="flex-direction:column;align-items:stretch;"></div>'
    );
    var $previewBox = $(
        '<div style="border:1px solid #d1d1d6;border-radius:12px;padding:12px;background:#f2f2f7;"></div>'
    );
    var $previewHome = $(
        '<div style="font-size:12px;font-weight:600;margin-bottom:8px;">桌面文字示例：外卖 / 小红书</div>'
    );
    var $previewTitle = $(
        '<div style="font-size:14px;font-weight:800;">Hi，今天也要元气满满！</div>'
    );
    $previewBox.append($previewHome, $previewTitle);
    $previewCtrl.append($previewBox);
    $rowPreview.append($previewCtrl);

    // 按钮行
    var $rowButtons = $(
        '<div class="xiaoxin-picker-row xiaoxin-picker-buttons"></div>'
    );
    var $cancelBtn = $(
        '<button class="xiaoxin-picker-button xiaoxin-picker-button-cancel">取消</button>'
    );
    var $confirmBtn = $(
        '<button class="xiaoxin-picker-button xiaoxin-picker-button-confirm">确定</button>'
    );
    $rowButtons.append($cancelBtn, $confirmBtn);

    function refreshUi() {
        // 模式可见性
        var isGrad = theme.barMode === "gradient";
        $rowTitleSolid.toggle(!isGrad);
        $rowTitleGrad1.toggle(isGrad);
        $rowTitleGrad2.toggle(isGrad);
        $rowAngle.toggle(isGrad);

        // 预览
        $previewHome.css("color", theme.homeColor);
        if (isGrad) {
            var ang = theme.barGradient.angle;
            $previewTitle.css({
                backgroundImage:
                    "linear-gradient(" +
                    ang +
                    "deg, " +
                    theme.barGradient.from +
                    ", " +
                    theme.barGradient.to +
                    ")",
                color: "transparent",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
            });
        } else {
            $previewTitle.css({
                backgroundImage: "none",
                WebkitBackgroundClip: "initial",
                backgroundClip: "initial",
                WebkitTextFillColor: "initial",
                color: theme.barColor,
            });
        }

        // 实时应用到手机
        self.applyFontTheme(theme);
    }

    // 绑定交互
    $homeColor.on("input", function () {
        theme.homeColor = this.value;
        // 默认同步横条纯色，除非当前是渐变
        if (theme.barMode !== "gradient") {
            theme.barColor = this.value;
            $titleColor.val(theme.barColor);
        }
        refreshUi();
    });

    $modeSelect.on("change", function () {
        theme.barMode = this.value;
        refreshUi();
    });

    $titleColor.on("input", function () {
        theme.barColor = this.value;
        refreshUi();
    });

    $gradFrom.on("input", function () {
        theme.barGradient.from = this.value;
        refreshUi();
    });

    $gradTo.on("input", function () {
        theme.barGradient.to = this.value;
        refreshUi();
    });

    $angle.on("input", function () {
        theme.barGradient.angle = parseInt(this.value, 10) || 90;
        $angleTxt.text(theme.barGradient.angle + "°");
        refreshUi();
    });

    // 取消
    $cancelBtn.on("click", function () {
        $overlay.remove();
        // 取消时恢复到打开前的配置
        self.applyFontTheme(current);
    });

    // 确定：保存并关闭
    $confirmBtn.on("click", function () {
        self.saveHomeSettings({ fontTheme: theme });
        $overlay.remove();
    });

    // 点击遮罩关闭
    $overlay.on("click", function (e) {
        if ($(e.target).hasClass("xiaoxin-picker-overlay")) {
            $cancelBtn.trigger("click");
        }
    });

    $picker.append(
        $pickerTitle,
        $rowHome,
        $rowMode,
        $rowTitleSolid,
        $rowTitleGrad1,
        $rowTitleGrad2,
        $rowAngle,
        $rowPreview,
        $rowButtons
    );
    $overlay.append($picker);
    $("body").append($overlay);

    // 在手机页面上，需要相对于手机容器定位
    self.adjustPickerPosition($overlay);

    // 监听窗口大小变化，重新调整位置
    var resizeHandler3 = function () {
        self.adjustPickerPosition($overlay);
    };
    $(window).on("resize.xiaoxinPicker3", resizeHandler3);

    // 弹窗关闭时移除监听
    var originalRemove3 = $overlay.remove;
    $overlay.remove = function () {
        $(window).off("resize.xiaoxinPicker3", resizeHandler3);
        return originalRemove3.call(this);
    };

    refreshUi();
};

// 更新悬浮按钮红点显示
// 注意：悬浮按钮的红点是所有应用红点的总和
// 目前只有微信应用，未来会有更多应用，每个应用都会有自己的红点
MobilePhone.prototype.updateFloatingButtonBadge = function () {
    if (!this.$floatingBtnBadge || !this.$floatingBtnBadge.length) {
        return;
    }

    var totalUnread = 0;

    // ========== 计算所有应用的未读消息总数 ==========
    // 1. 微信应用的未读数
    if (window.XiaoxinWeChatDataHandler) {
        try {
            var allChats = window.XiaoxinWeChatDataHandler.getAllChats() || {};
            Object.keys(allChats).forEach(function (userId) {
                var count =
                    window.XiaoxinWeChatDataHandler.getUnreadCount(userId);
                if (typeof count === "number" && count > 0) {
                    totalUnread += count;
                }
            });
        } catch (e) {
            console.warn("[小馨手机] 获取微信未读消息数失败:", e);
        }
    }

    // 2. 未来其他应用的未读数可以在这里添加
    // 例如：
    // if (window.XiaoxinOtherAppDataHandler) {
    //     totalUnread += window.XiaoxinOtherAppDataHandler.getTotalUnreadCount();
    // }

    console.info("[小馨手机] 悬浮按钮未读数计算（所有应用总和）:", totalUnread);

    // 更新红点显示
    if (totalUnread > 0) {
        this.$floatingBtnBadge.text(totalUnread > 99 ? "99+" : totalUnread);
        this.$floatingBtnBadge.addClass("show");

        // 根据数字位数调整样式
        this.$floatingBtnBadge.removeClass(
            "single-digit double-digit triple-digit"
        );
        if (totalUnread < 10) {
            this.$floatingBtnBadge.addClass("single-digit");
        } else if (totalUnread < 100) {
            this.$floatingBtnBadge.addClass("double-digit");
        } else {
            this.$floatingBtnBadge.addClass("triple-digit");
        }
    } else {
        this.$floatingBtnBadge.removeClass("show");
        this.$floatingBtnBadge.text("");
    }
};

// 调整悬浮按钮位置，确保在屏幕内
MobilePhone.prototype.adjustFloatingButtonPosition = function () {
    if (!this.$floatingBtn || !this.$floatingBtn.length) return;

    var $btn = this.$floatingBtn;
    var winWidth = $(window).width();
    var winHeight = $(window).height();
    var btnWidth = $btn.outerWidth() || 64;
    var btnHeight = $btn.outerHeight() || 64;
    var safeMargin = 24; // 安全边距

    // 获取当前位置
    var currentRight = $btn.css("right");
    var currentBottom = $btn.css("bottom");
    var currentLeft = $btn.css("left");
    var currentTop = $btn.css("top");

    var newLeft = null;
    var newTop = null;

    // 检查是否有已设置的位置
    var hasLeft =
        currentLeft !== "auto" &&
        currentLeft !== "" &&
        parseFloat(currentLeft) !== 0;
    var hasTop =
        currentTop !== "auto" &&
        currentTop !== "" &&
        parseFloat(currentTop) !== 0;
    var hasRight =
        currentRight !== "auto" &&
        currentRight !== "" &&
        parseFloat(currentRight) !== 0;
    var hasBottom =
        currentBottom !== "auto" &&
        currentBottom !== "" &&
        parseFloat(currentBottom) !== 0;

    if (hasLeft || hasTop) {
        // 如果已经有 left/top 定位，使用它
        newLeft = hasLeft
            ? parseFloat(currentLeft)
            : winWidth - btnWidth - safeMargin;
        newTop = hasTop
            ? parseFloat(currentTop)
            : winHeight - btnHeight - safeMargin;
    } else if (hasRight || hasBottom) {
        // 如果使用 right/bottom 定位，转换为 left/top
        var right = hasRight ? parseFloat(currentRight) : safeMargin;
        var bottom = hasBottom ? parseFloat(currentBottom) : 96 + safeMargin;
        newLeft = winWidth - right - btnWidth;
        newTop = winHeight - bottom - btnHeight;
    } else {
        // 默认位置：右下角
        newLeft = winWidth - btnWidth - safeMargin;
        newTop = winHeight - btnHeight - safeMargin;
    }

    // 确保在屏幕内
    newLeft = Math.max(
        safeMargin,
        Math.min(newLeft, winWidth - btnWidth - safeMargin)
    );
    newTop = Math.max(
        safeMargin,
        Math.min(newTop, winHeight - btnHeight - safeMargin)
    );

    $btn.css({
        left: newLeft + "px",
        top: newTop + "px",
        right: "auto",
        bottom: "auto",
    });
};

// 调整手机容器位置，确保在屏幕内
// 调整弹窗位置，使其在手机页面上相对于手机容器居中
MobilePhone.prototype.adjustPickerPosition = function ($overlay) {
    if (
        !this.$phoneContainer ||
        !this.$phoneContainer.length ||
        !$overlay ||
        !$overlay.length
    ) {
        return;
    }

    // 检测是否在手机页面上（窗口宽度小于某个阈值，或者检查user agent）
    var isMobilePage =
        $(window).width() < 768 ||
        /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

    if (!isMobilePage) {
        // 在电脑页面上，使用默认的fixed定位（相对于视口居中）
        return;
    }

    // 在手机页面上，需要相对于手机容器定位
    var $phone = this.$phoneContainer;
    var phoneRect = $phone[0].getBoundingClientRect();
    var scale = this.phoneScale || 1;

    // 计算手机容器的实际显示区域（考虑缩放）
    var phoneScreenWidth = phoneRect.width / scale || 393;
    var phoneScreenHeight = phoneRect.height / scale || 790;

    // 获取弹窗内容区域
    var $picker = $overlay.find(".xiaoxin-picker");
    if (!$picker.length) return;

    // 计算弹窗应该显示的位置，使其相对于手机屏幕居中
    // 弹窗使用fixed定位，需要计算相对于视口的绝对位置
    var pickerWidth = $picker.outerWidth() || 340;
    var pickerHeight = $picker.outerHeight() || 400;

    // 手机屏幕在视口中的位置
    var phoneScreenLeft = phoneRect.left;
    var phoneScreenTop = phoneRect.top;

    // 计算弹窗在手机屏幕中的居中位置
    var pickerLeft = phoneScreenLeft + (phoneScreenWidth - pickerWidth) / 2;
    var pickerTop = phoneScreenTop + (phoneScreenHeight - pickerHeight) / 2;

    // 确保弹窗在视口内
    var winWidth = $(window).width();
    var winHeight = $(window).height();
    pickerLeft = Math.max(
        10,
        Math.min(pickerLeft, winWidth - pickerWidth - 10)
    );
    pickerTop = Math.max(
        10,
        Math.min(pickerTop, winHeight - pickerHeight - 10)
    );

    // 设置遮罩层覆盖整个视口（保持原有行为）
    $overlay.css({
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
    });

    // 设置弹窗内容的位置，使其相对于手机容器居中
    $picker.css({
        position: "fixed",
        left: pickerLeft + "px",
        top: pickerTop + "px",
        margin: 0,
        transform: "none",
    });
};

MobilePhone.prototype.adjustPhoneContainerPosition = function () {
    if (!this.$phoneContainer || !this.$phoneContainer.length) return;

    var $phone = this.$phoneContainer;
    var winWidth = $(window).width();
    var winHeight = $(window).height();
    var scale = this.phoneScale || 1;
    var phoneWidth = ($phone.outerWidth() || 393) * scale;
    var phoneHeight = ($phone.outerHeight() || 790) * scale;

    // 获取当前位置
    var currentTop = $phone.css("top");
    var currentLeft = $phone.css("left");
    var currentTransform = $phone.css("transform");

    var centerX = winWidth / 2;
    var centerY = winHeight / 2;
    var newX = centerX;
    var newY = centerY;

    // 如果已经有保存的位置，使用保存的位置
    if (currentTop !== "50%" && currentLeft !== "50%") {
        // 解析当前像素位置
        var topValue = parseFloat(currentTop) || centerY;
        var leftValue = parseFloat(currentLeft) || centerX;
        newX = leftValue;
        newY = topValue;
    }

    // 确保位置在屏幕内
    var halfWidth = phoneWidth / 2;
    var halfHeight = phoneHeight / 2;
    newX = Math.max(halfWidth, Math.min(newX, winWidth - halfWidth));
    newY = Math.max(halfHeight, Math.min(newY, winHeight - halfHeight));

    // 应用位置
    $phone.css({
        top: newY + "px",
        left: newX + "px",
        transform: "translate(-50%, -50%) scale(" + scale + ")",
    });
};
