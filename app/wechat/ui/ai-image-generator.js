// AI生图模块
window.XiaoxinAIImageGenerator = (function () {
    "use strict";

    /**
     * 优化提示词（调用生文API）
     * @param {string} userInput - 用户输入的原始描述
     * @returns {Promise<string>} 返回优化后的提示词（追加50字左右）
     */
    async function optimizePrompt(userInput) {
        if (!userInput || !userInput.trim()) {
            throw new Error("请输入图片描述");
        }

        // 检查生文API是否可用
        if (!window.XiaoxinAI || typeof window.XiaoxinAI.generateText !== "function") {
            throw new Error("生文API不可用，请先在手机主页设置中配置生文API");
        }

        try {
            // 构建优化提示词的请求消息
            const messages = [
                {
                    role: "user",
                    content: `请优化以下图片生成提示词，在原有描述基础上追加约50字的详细描述，使其更适合AI图片生成。只返回优化后的完整提示词，不要包含其他说明文字。

原始描述：${userInput.trim()}

请直接返回优化后的完整提示词：`,
                },
            ];

            console.info("[AI生图] 开始优化提示词，原始描述:", userInput);

            // 调用生文API
            const optimizedPrompt = await window.XiaoxinAI.generateText(messages, {
                maxTokens: 200,
                temperature: 0.7,
            });

            if (!optimizedPrompt || !optimizedPrompt.trim()) {
                throw new Error("生文API返回空结果");
            }

            const result = optimizedPrompt.trim();
            console.info("[AI生图] 提示词优化成功，优化后长度:", result.length);

            return result;
        } catch (error) {
            console.error("[AI生图] 优化提示词失败:", error);
            throw error;
        }
    }

    /**
     * 生成图片（调用生图API）
     * @param {string} description - 图片描述
     * @param {Object} options - 可选参数
     * @param {string} options.aspectRatio - 图片尺寸比例（1:1, 4:3, 16:9, 3:4, 9:16）
     * @returns {Promise<string>} 返回生成的图片URL
     */
    async function generateImage(description, options = {}) {
        if (!description || !description.trim()) {
            throw new Error("图片描述不能为空");
        }

        // 检查生图API是否可用
        if (!window.XiaoxinAI || typeof window.XiaoxinAI.generateImage !== "function") {
            throw new Error("生图API不可用，请先在手机主页设置中配置生图API");
        }

        try {
            // 转换尺寸比例到生图API需要的格式
            let imageSize = "1024x1024"; // 默认尺寸
            const aspectRatio = options.aspectRatio || "1:1";

            // 根据比例设置尺寸
            switch (aspectRatio) {
                case "1:1":
                    imageSize = "1024x1024";
                    break;
                case "4:3":
                    imageSize = "1024x768";
                    break;
                case "16:9":
                    imageSize = "1024x576";
                    break;
                case "3:4":
                    imageSize = "768x1024";
                    break;
                case "9:16":
                    imageSize = "576x1024";
                    break;
                default:
                    imageSize = "1024x1024";
            }

            console.info("[AI生图] 开始生成图片，描述:", description, "尺寸:", imageSize);

            // 调用生图API（直接使用ImageGenerator以支持imageSize参数）
            if (!window.ImageGenerator || typeof window.ImageGenerator.generateImage !== "function") {
                throw new Error("ImageGenerator未初始化，请确保image-api.js已加载");
            }

            const imageUrl = await window.ImageGenerator.generateImage(description.trim(), {
                imageSize: imageSize,
                size: imageSize, // 兼容不同参数名
            });

            if (!imageUrl || !imageUrl.trim()) {
                throw new Error("生图API返回空结果");
            }

            console.info("[AI生图] 图片生成成功，URL:", imageUrl.substring(0, 50) + "...");

            return imageUrl.trim();
        } catch (error) {
            console.error("[AI生图] 生成图片失败:", error);
            throw error;
        }
    }

    return {
        optimizePrompt: optimizePrompt,
        generateImage: generateImage,
    };
})();

