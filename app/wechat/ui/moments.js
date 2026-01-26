// 朋友圈发布页面

window.XiaoxinWeChatMomentsPublish = (function () {
    var $screen = null;
    var $textarea = null;
    var $imagesContainer = null;
    var $addImageBtn = null;
    var $publishBtn = null;
    var $cancelBtn = null;
    var $locationOption = null;
    var $mentionOption = null;
    var $visibilityOption = null;

    var images = []; // 存储上传的图片信息
    var currentImageIndex = -1; // 当前编辑的图片索引

    // 默认的AI生图前缀词
    var DEFAULT_AI_PREFIX = "生成一张图片：";

    // 初始化
    function init($container) {
        if (!$container || !$container.length) {
            console.warn("[小馨手机][朋友圈发布] 容器不存在");
            return;
        }

        $screen = $container;
        render();
        bindEvents();

        console.info("[小馨手机][朋友圈发布] 初始化完成");
    }

    // 渲染页面
    function render() {
        var html = [
            '<div class="xiaoxin-wechat-moments-publish-nav-bar">',
            '<button class="xiaoxin-wechat-moments-publish-nav-cancel">取消</button>',
            '<div class="xiaoxin-wechat-moments-publish-nav-title">发布朋友圈</div>',
            '<button class="xiaoxin-wechat-moments-publish-nav-publish" disabled>发表</button>',
            "</div>",
            '<div class="xiaoxin-wechat-moments-publish-content">',
            '<textarea class="xiaoxin-wechat-moments-publish-textarea" placeholder="这一刻的想法..."></textarea>',
            '<div class="xiaoxin-wechat-moments-publish-images"></div>',
            '<div class="xiaoxin-wechat-moments-publish-options">',
            '<div class="xiaoxin-wechat-moments-publish-option" data-option="location">',
            '<div class="xiaoxin-wechat-moments-publish-option-icon">' +
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">' +
                '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>' +
                '<circle cx="12" cy="10" r="3"></circle>' +
                "</svg>" +
                "</div>",
            '<div class="xiaoxin-wechat-moments-publish-option-label">所在位置</div>',
            '<div class="xiaoxin-wechat-moments-publish-option-arrow">›</div>',
            "</div>",
            '<div class="xiaoxin-wechat-moments-publish-option" data-option="mention">',
            '<div class="xiaoxin-wechat-moments-publish-option-icon">@</div>',
            '<div class="xiaoxin-wechat-moments-publish-option-label">提醒谁看</div>',
            '<div class="xiaoxin-wechat-moments-publish-option-arrow">›</div>',
            "</div>",
            '<div class="xiaoxin-wechat-moments-publish-option" data-option="visibility">',
            '<div class="xiaoxin-wechat-moments-publish-option-icon">' +
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">' +
                '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>' +
                '<circle cx="9" cy="7" r="4"></circle>' +
                '<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>' +
                '<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>' +
                "</svg>" +
                "</div>",
            '<div class="xiaoxin-wechat-moments-publish-option-label">谁可以看</div>',
            '<div class="xiaoxin-wechat-moments-publish-option-value">公开</div>',
            '<div class="xiaoxin-wechat-moments-publish-option-arrow">›</div>',
            "</div>",
            "</div>",
            "</div>",
            // 图片上传弹窗
            '<div class="xiaoxin-wechat-moments-publish-image-dialog">',
            '<div class="xiaoxin-wechat-moments-publish-image-dialog-content">',
            '<div class="xiaoxin-wechat-moments-publish-image-dialog-header">',
            '<div class="xiaoxin-wechat-moments-publish-image-dialog-title">添加图片</div>',
            '<button class="xiaoxin-wechat-moments-publish-image-dialog-close">×</button>',
            "</div>",
            '<div class="xiaoxin-wechat-moments-publish-image-dialog-body">',
            '<img class="xiaoxin-wechat-moments-publish-image-preview" alt="预览" />',
            '<div class="xiaoxin-wechat-moments-publish-image-upload-section">',
            '<label class="xiaoxin-wechat-moments-publish-image-upload-label">上传方式</label>',
            '<div class="xiaoxin-wechat-moments-publish-image-upload-buttons">',
            '<input type="text" class="xiaoxin-wechat-moments-publish-image-url-input" placeholder="输入图片URL链接" />',
            '<button class="xiaoxin-wechat-moments-publish-image-upload-btn" data-type="url">从URL上传</button>',
            '<button class="xiaoxin-wechat-moments-publish-image-upload-btn" data-type="local">本地上传</button>',
            "</div>",
            "</div>",
            '<div class="xiaoxin-wechat-moments-publish-image-upload-description-section" style="display: none;">',
            '<label class="xiaoxin-wechat-moments-publish-image-upload-description-label">图片描述</label>',
            '<textarea class="xiaoxin-wechat-moments-publish-image-upload-description-input" placeholder="描述这张图片的内容，让角色能够理解图片..."></textarea>',
            "</div>",
            '<div class="xiaoxin-wechat-moments-publish-image-description-section">',
            '<label class="xiaoxin-wechat-moments-publish-image-description-label">图片描述（AI生图）</label>',
            '<div class="xiaoxin-wechat-moments-publish-image-description-prefix">' +
                DEFAULT_AI_PREFIX +
                "</div>",
            '<textarea class="xiaoxin-wechat-moments-publish-image-description-input" placeholder="输入图片描述，用于AI生图..."></textarea>',
            "</div>",
            "</div>",
            '<div class="xiaoxin-wechat-moments-publish-image-dialog-footer">',
            '<button class="xiaoxin-wechat-moments-publish-image-dialog-cancel">取消</button>',
            '<button class="xiaoxin-wechat-moments-publish-image-dialog-confirm">确定</button>',
            "</div>",
            "</div>",
            "</div>",
        ].join("");

        $screen.html(html);

        // 缓存元素引用
        $textarea = $screen.find(".xiaoxin-wechat-moments-publish-textarea");
        $imagesContainer = $screen.find(
            ".xiaoxin-wechat-moments-publish-images"
        );
        $addImageBtn = null; // 会在renderImages中创建
        $publishBtn = $screen.find(
            ".xiaoxin-wechat-moments-publish-nav-publish"
        );
        $cancelBtn = $screen.find(".xiaoxin-wechat-moments-publish-nav-cancel");
        $locationOption = $screen.find('[data-option="location"]');
        $mentionOption = $screen.find('[data-option="mention"]');
        $visibilityOption = $screen.find('[data-option="visibility"]');

        renderImages();
        updatePublishButton();
    }

    // 渲染图片列表
    function renderImages() {
        $imagesContainer.empty();

        // 渲染已上传的图片
        images.forEach(function (image, index) {
            var $item = $(
                '<div class="xiaoxin-wechat-moments-publish-image-item"></div>'
            );
            $item.css("background-image", "url(" + image.url + ")");

            var $delete = $(
                '<div class="xiaoxin-wechat-moments-publish-image-delete">×</div>'
            );
            $delete.on("click", function (e) {
                e.stopPropagation();
                removeImage(index);
            });

            $item.append($delete);
            $item.on("click", function () {
                editImage(index);
            });

            $imagesContainer.append($item);
        });

        // 如果图片数量少于9张，显示添加按钮
        if (images.length < 9) {
            var $addBtn = $(
                '<div class="xiaoxin-wechat-moments-publish-add-image"></div>'
            );
            var $icon = $(
                '<div class="xiaoxin-wechat-moments-publish-add-image-icon">+</div>'
            );
            $addBtn.append($icon);
            $addBtn.on("click", function () {
                showImageDialog();
            });
            $imagesContainer.append($addBtn);
            $addImageBtn = $addBtn;
        }
    }

    // 显示图片上传弹窗
    function showImageDialog(index) {
        currentImageIndex = index !== undefined ? index : -1;

        var $dialog = $screen.find(
            ".xiaoxin-wechat-moments-publish-image-dialog"
        );
        var $preview = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-preview"
        );
        var $urlInput = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-url-input"
        );
        var $aiDescriptionInput = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-description-input"
        );
        var $uploadDescriptionSection = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-upload-description-section"
        );
        var $uploadDescriptionInput = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-upload-description-input"
        );
        var $aiDescriptionSection = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-description-section"
        );
        var $confirmBtn = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-dialog-confirm"
        );

        // 如果是编辑模式，填充现有数据
        if (currentImageIndex >= 0 && images[currentImageIndex]) {
            var image = images[currentImageIndex];
            $preview.attr("src", image.url).addClass("show");
            $urlInput.val(image.url);

            // 如果已有图片URL，显示上传图片描述输入框，隐藏AI生图输入框
            if (image.url) {
                $uploadDescriptionSection.show();
                $uploadDescriptionInput.val(image.uploadDescription || "");
                $aiDescriptionSection.hide();
            } else {
                // 只有AI描述，显示AI生图输入框，隐藏上传图片描述输入框
                $uploadDescriptionSection.hide();
                $aiDescriptionSection.show();
                $aiDescriptionInput.val(image.description || "");
            }
        } else {
            // 新建模式
            $preview.removeClass("show").attr("src", "");
            $urlInput.val("");
            $uploadDescriptionSection.hide();
            $uploadDescriptionInput.val("");
            $aiDescriptionSection.show();
            $aiDescriptionInput.val("");
            $aiDescriptionInput.prop("disabled", false);
        }

        $dialog.addClass("show");
    }

    // 隐藏图片上传弹窗
    function hideImageDialog() {
        var $dialog = $screen.find(
            ".xiaoxin-wechat-moments-publish-image-dialog"
        );
        $dialog.removeClass("show");
        currentImageIndex = -1;
    }

    // 编辑图片
    function editImage(index) {
        showImageDialog(index);
    }

    // 移除图片
    function removeImage(index) {
        images.splice(index, 1);
        renderImages();
        updatePublishButton();
    }

    // 添加图片
    function addImage(imageData) {
        if (currentImageIndex >= 0) {
            // 编辑模式：更新现有图片
            images[currentImageIndex] = imageData;
        } else {
            // 新建模式：添加新图片
            images.push(imageData);
        }
        renderImages();
        updatePublishButton();
        hideImageDialog();
    }

    // 更新发表按钮状态
    function updatePublishButton() {
        var hasContent = $textarea.val().trim().length > 0 || images.length > 0;
        $publishBtn.prop("disabled", !hasContent);
    }

    // 绑定事件
    function bindEvents() {
        // 取消按钮
        $cancelBtn.on("click", function () {
            // 清除预览朋友圈（因为用户取消了发布）
            if (
                window.XiaoxinWeChatApp &&
                typeof window.XiaoxinWeChatApp.clearPreviewMoments ===
                    "function"
            ) {
                window.XiaoxinWeChatApp.clearPreviewMoments();
                console.info(
                    "[小馨手机][朋友圈发布] 已清除预览朋友圈（用户取消发布）"
                );
            }

            if (
                window.XiaoxinWeChatApp &&
                typeof window.XiaoxinWeChatApp.closeMomentsPublish ===
                    "function"
            ) {
                window.XiaoxinWeChatApp.closeMomentsPublish();
            } else {
                console.warn("[小馨手机][朋友圈发布] 未找到关闭方法");
            }
        });

        // 发表按钮
        $publishBtn.on("click", function () {
            if ($(this).prop("disabled")) {
                return;
            }
            publish();
        });

        // 文字输入框
        $textarea.on("input", function () {
            updatePublishButton();
        });

        // 选项点击
        $locationOption.on("click", function () {
            console.info("[小馨手机][朋友圈发布] 点击所在位置");
            // TODO: 实现位置选择功能
        });

        $mentionOption.on("click", function () {
            console.info("[小馨手机][朋友圈发布] 点击提醒谁看");
            // TODO: 实现提醒谁看功能
        });

        $visibilityOption.on("click", function () {
            console.info("[小馨手机][朋友圈发布] 点击谁可以看");
            // TODO: 实现可见性选择功能
        });

        // 图片上传弹窗事件
        var $dialog = $screen.find(
            ".xiaoxin-wechat-moments-publish-image-dialog"
        );
        var $dialogClose = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-dialog-close"
        );
        var $dialogCancel = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-dialog-cancel"
        );
        var $dialogConfirm = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-dialog-confirm"
        );
        var $urlInput = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-url-input"
        );
        var $urlBtn = $dialog.find(
            '.xiaoxin-wechat-moments-publish-image-upload-btn[data-type="url"]'
        );
        var $localBtn = $dialog.find(
            '.xiaoxin-wechat-moments-publish-image-upload-btn[data-type="local"]'
        );
        var $preview = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-preview"
        );
        var $aiDescriptionInput = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-description-input"
        );
        var $uploadDescriptionSection = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-upload-description-section"
        );
        var $uploadDescriptionInput = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-upload-description-input"
        );
        var $aiDescriptionSection = $dialog.find(
            ".xiaoxin-wechat-moments-publish-image-description-section"
        );

        // 关闭弹窗
        $dialogClose.on("click", function () {
            hideImageDialog();
        });

        $dialogCancel.on("click", function () {
            hideImageDialog();
        });

        // 点击遮罩层关闭
        $dialog.on("click", function (e) {
            if (
                $(e.target).hasClass(
                    "xiaoxin-wechat-moments-publish-image-dialog"
                )
            ) {
                hideImageDialog();
            }
        });

        // URL上传
        $urlBtn.on("click", function () {
            var url = $urlInput.val().trim();
            if (!url) {
                alert("请输入图片URL");
                return;
            }

            // 验证URL（允许data URL）
            if (
                !url.startsWith("data:") &&
                !url.startsWith("http://") &&
                !url.startsWith("https://")
            ) {
                try {
                    new URL(url);
                } catch (e) {
                    alert("请输入有效的URL");
                    return;
                }
            }

            // 显示预览
            $preview.attr("src", url).addClass("show");

            // 如果已有图片URL，显示上传图片描述输入框，隐藏AI生图输入框
            $uploadDescriptionSection.show();
            $aiDescriptionSection.hide();
        });

        // 本地上传
        $localBtn.on("click", function () {
            var $fileInput = $(
                '<input type="file" accept="image/*" style="display: none;" />'
            );
            $fileInput.on("change", function (e) {
                var file = e.target.files[0];
                if (!file) {
                    return;
                }

                // 验证文件类型
                if (!file.type.startsWith("image/")) {
                    alert("请选择图片文件");
                    return;
                }

                // 使用FileReader读取文件
                var reader = new FileReader();
                reader.onload = function (e) {
                    var dataUrl = e.target.result;
                    $preview.attr("src", dataUrl).addClass("show");
                    $urlInput.val(dataUrl);

                    // 如果已有图片URL，显示上传图片描述输入框，隐藏AI生图输入框
                    $uploadDescriptionSection.show();
                    $aiDescriptionSection.hide();
                };
                reader.readAsDataURL(file);
            });

            $fileInput.trigger("click");
        });

        // URL输入框回车
        $urlInput.on("keypress", function (e) {
            if (e.which === 13) {
                $urlBtn.trigger("click");
            }
        });

        // 确定按钮
        $dialogConfirm.on("click", function () {
            var url = $urlInput.val().trim();
            var aiDescription = $aiDescriptionInput.val().trim();
            var uploadDescription = $uploadDescriptionInput.val().trim();

            // 验证：必须有URL或AI描述
            if (!url && !aiDescription) {
                alert("请上传图片或输入图片描述");
                return;
            }

            // 如果有URL，使用URL和上传描述；否则使用AI描述（AI生图）
            var imageData = {
                url: url || null,
                description: aiDescription || null, // AI生图描述
                uploadDescription: uploadDescription || null, // 已上传图片的描述
                isAI: !url && !!aiDescription, // 标记是否为AI生成
            };

            addImage(imageData);
        });

        // 当URL输入变化时，如果清空了URL，显示AI生图输入框，隐藏上传图片描述输入框
        $urlInput.on("input", function () {
            var url = $(this).val().trim();
            if (!url) {
                $uploadDescriptionSection.hide();
                $aiDescriptionSection.show();
                $aiDescriptionInput.prop("disabled", false);
                $preview.removeClass("show");
            }
        });
    }

    // 生成8位随机字符（用于朋友圈ID）
    function generateMomentId() {
        var chars =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        var result = "";
        for (var i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return "moment-" + result;
    }

    // 获取玩家账号信息（微信ID、微信昵称）
    function getPlayerAccount() {
        var account = null;
        // 优先使用 XiaoxinWeChatApp 的 getAccount 方法
        if (
            window.XiaoxinWeChatApp &&
            typeof window.XiaoxinWeChatApp._getAccount === "function"
        ) {
            account = window.XiaoxinWeChatApp._getAccount();
        } else if (window.XiaoxinWeChatAccount) {
            account = window.XiaoxinWeChatAccount.getCurrentAccount();
        } else if (window.XiaoxinWeChatDataHandler) {
            account = window.XiaoxinWeChatDataHandler.getAccount();
        }

        if (!account) {
            console.warn("[小馨手机][朋友圈发布] 无法获取玩家账号信息");
            return {
                wechatId: "player",
                nickname: "微信用户",
            };
        }

        // 优先使用 wechatId，如果没有则使用 id，最后使用 'player'
        var wechatId = account.wechatId || account.id || "player";
        // 优先使用 nickname，如果没有则使用 name，最后使用 '微信用户'
        var nickname = account.nickname || account.name || "微信用户";

        return {
            wechatId: wechatId,
            nickname: nickname,
            account: account,
        };
    }

    // 获取世界观时间字符串（用于timestamp标签）
    function getWorldTimeString() {
        if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.rawTime) {
            return window.XiaoxinWorldClock.rawTime;
        }
        // 如果没有世界观时间，使用当前时间格式化
        var now = new Date();
        var year = now.getFullYear();
        var month = String(now.getMonth() + 1).padStart(2, "0");
        var day = String(now.getDate()).padStart(2, "0");
        var hours = String(now.getHours()).padStart(2, "0");
        var minutes = String(now.getMinutes()).padStart(2, "0");
        var seconds = String(now.getSeconds()).padStart(2, "0");
        return (
            year +
            "年" +
            month +
            "月" +
            day +
            "日 " +
            hours +
            ":" +
            minutes +
            ":" +
            seconds
        );
    }

    // 构建朋友圈指令
    function buildMomentsCommand(text, images, location) {
        var momentId = generateMomentId();
        var playerAccount = getPlayerAccount();
        // 使用 "user" 作为玩家朋友圈的 author（推荐格式，兼容旧格式）
        var authorId = "user";

        // 判断朋友圈类型
        var hasText = text && text.trim().length > 0;
        var hasImages = images && images.length > 0;
        var imageCount = hasImages ? images.length : 0;

        var command = "[moments]\n";
        command += '  [moment id="' + momentId + '" author="' + authorId + '"';

        // 确定类型
        var momentType = "";
        if (!hasText && hasImages) {
            // 纯图片朋友圈
            momentType = "图片";
        } else if (hasText && hasImages) {
            // 文字＋图片朋友圈
            momentType = "文字＋图片";
        } else {
            // 纯文字朋友圈
            momentType = "文字";
        }

        command += ' type="' + momentType + '"]\n';

        // 添加文字内容
        if (hasText) {
            command += "    [content]" + text.trim() + "[/content]\n";
        }

        // 添加图片
        if (hasImages) {
            var imageDescriptions = [];
            images.forEach(function (image) {
                // 优先使用AI描述（用于生图），如果没有则使用上传描述
                var description =
                    image.description || image.uploadDescription || "";
                if (description && description.trim()) {
                    imageDescriptions.push(description.trim());
                } else if (image.url && !image.url.startsWith("data:")) {
                    // 如果有URL但不是data URL，说明是外部链接，可以保留URL
                    // 但根据规则，应该使用描述而不是URL
                    // 这里暂时跳过，因为规则要求使用描述
                }
            });

            if (imageDescriptions.length > 0) {
                // 使用 | 分隔符连接多张图片描述
                command +=
                    "    [images]" +
                    imageDescriptions.join("|") +
                    "[/images]\n";
            }
        }

        // 添加位置信息（如果有）
        if (location && location.trim()) {
            command += "    [location]" + location.trim() + "[/location]\n";
        }

        // 添加时间标签
        var timeString = getWorldTimeString();
        command += "    [timestamp]" + timeString + "[/timestamp]\n";

        command += "  [/moment]\n";
        command += "[/moments]";

        return command;
    }

    // 创建预览朋友圈对象
    function createPreviewMoment(text, images, location) {
        var momentId = generateMomentId();
        var playerAccount = getPlayerAccount();
        var authorId = playerAccount.wechatId;
        var authorName = playerAccount.nickname;
        var timeString = getWorldTimeString();

        // 获取时间戳
        var timestamp = Date.now();
        if (
            window.XiaoxinWorldClock &&
            window.XiaoxinWorldClock.currentTimestamp
        ) {
            timestamp = window.XiaoxinWorldClock.currentTimestamp;
        }

        // 判断朋友圈类型
        var hasText = text && text.trim().length > 0;
        var hasImages = images && images.length > 0;

        var momentType = "";
        if (!hasText && hasImages) {
            momentType = "图片";
        } else if (hasText && hasImages) {
            momentType = "文字＋图片";
        } else {
            momentType = "文字";
        }

        // 构建预览朋友圈对象
        var previewMoment = {
            id: momentId,
            authorId: authorId,
            author: authorName, // 使用昵称作为显示名称
            type: momentType,
            content: text ? text.trim() : "",
            images: [],
            timestamp: timestamp,
            rawTime: timeString,
            isPreview: true, // 标记为预览
            location: location || null,
        };

        // 处理图片
        if (hasImages) {
            images.forEach(function (image) {
                var imageData = {
                    url: image.url || null,
                    description:
                        image.description || image.uploadDescription || null,
                };
                previewMoment.images.push(imageData);
            });
        }

        return previewMoment;
    }

    // 发布朋友圈
    function publish() {
        var text = $textarea.val().trim();
        var location = null; // TODO: 从选项获取
        var mentions = []; // TODO: 从选项获取
        var visibility = "public"; // TODO: 从选项获取

        // 验证：必须有文字或图片
        if (!text && (!images || images.length === 0)) {
            if (typeof toastr !== "undefined") {
                toastr.warning("请至少输入文字或添加图片", "小馨手机");
            } else {
                alert("请至少输入文字或添加图片");
            }
            return;
        }

        // 构建朋友圈指令
        var command = buildMomentsCommand(text, images, location);

        console.info("[小馨手机][朋友圈发布] 生成朋友圈指令:", command);

        // 创建预览朋友圈对象
        var previewMoment = createPreviewMoment(text, images, location);

        // 将预览朋友圈添加到预览列表（如果朋友圈页面已打开）
        if (
            window.XiaoxinWeChatApp &&
            typeof window.XiaoxinWeChatApp.addPreviewMoment === "function"
        ) {
            window.XiaoxinWeChatApp.addPreviewMoment(previewMoment);
            console.info(
                "[小馨手机][朋友圈发布] 已添加预览朋友圈:",
                previewMoment.id
            );
        }

        // 将指令插入到酒馆输入框（不自动发送）
        if (
            window.XiaoxinWeChatApp &&
            typeof window.XiaoxinWeChatApp.insertTextToTavernInput ===
                "function"
        ) {
            var success =
                window.XiaoxinWeChatApp.insertTextToTavernInput(command);
            if (success) {
                console.info("[小馨手机][朋友圈发布] 已插入朋友圈指令到输入框");
                if (typeof toastr !== "undefined") {
                    toastr.success(
                        "朋友圈指令已插入到输入框，请手动发送",
                        "小馨手机"
                    );
                }
            } else {
                console.warn("[小馨手机][朋友圈发布] 插入指令到输入框失败");
                if (typeof toastr !== "undefined") {
                    toastr.warning("插入指令失败，已复制到剪贴板", "小馨手机");
                }
            }
        } else {
            console.warn(
                "[小馨手机][朋友圈发布] 未找到 insertTextToTavernInput 方法"
            );
            // 备用：使用剪贴板
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(command).then(function () {
                    if (typeof toastr !== "undefined") {
                        toastr.info(
                            "已复制朋友圈指令到剪贴板，请手动粘贴到输入框",
                            "小馨手机"
                        );
                    } else {
                        alert("已复制朋友圈指令到剪贴板，请手动粘贴到输入框");
                    }
                });
            } else {
                alert("朋友圈指令：\n\n" + command + "\n\n请手动复制到输入框");
            }
        }

        // 发布成功后清除预览朋友圈（因为用户已经确认发布）
        if (
            window.XiaoxinWeChatApp &&
            typeof window.XiaoxinWeChatApp.clearPreviewMoments === "function"
        ) {
            window.XiaoxinWeChatApp.clearPreviewMoments();
            console.info(
                "[小馨手机][朋友圈发布] 已清除预览朋友圈（用户已确认发布）"
            );
        }

        // 发布成功后关闭页面
        if (
            window.XiaoxinWeChatApp &&
            typeof window.XiaoxinWeChatApp.closeMomentsPublish === "function"
        ) {
            window.XiaoxinWeChatApp.closeMomentsPublish();
        }
    }

    return {
        init: init,
    };
})();
