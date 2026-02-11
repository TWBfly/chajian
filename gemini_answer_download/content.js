// Content Script - 在 Gemini 页面上下文中运行

/**
 * 从 model-response 中提取章节标题
 * @param {Element} response - model-response 元素
 * @returns {Array} 章节标题数组
 */
function extractChapterTitles(response) {
    const titles = [];

    // 查找 h1, h2, h3, h4 标题元素
    const headings = response.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
        const title = (heading.innerText || heading.textContent || '').trim();
        if (title && title.length > 0 && title.length < 100) {
            // 检查是否像章节标题（包含"章"、"节"、"卷"等关键词）
            if (/第.{1,10}[章节卷部篇回]|^[一二三四五六七八九十百千]+[、.]/.test(title) ||
                /^\d+[、.\s]/.test(title) ||
                title.length <= 50) {
                titles.push(title);
            }
        }
    });

    // 如果没有找到标题，尝试从带 data-path-to-node 属性的元素获取
    if (titles.length === 0) {
        const dataNodes = response.querySelectorAll('[data-path-to-node]');
        dataNodes.forEach(node => {
            const text = (node.innerText || node.textContent || '').trim();
            if (text && text.length > 0 && text.length <= 50) {
                if (/第.{1,10}[章节卷部篇回]/.test(text)) {
                    titles.push(text);
                }
            }
        });
    }

    // 去重
    return [...new Set(titles)];
}

/**
 * 提取 model-response 元素中的纯文字内容
 * @returns {Array} 包含所有 model-response 文字内容的数组
 */
function extractModelResponses() {
    // 查找所有 model-response 元素
    const modelResponses = document.querySelectorAll('model-response');
    const contents = [];

    modelResponses.forEach((response, index) => {
        // 获取纯文字内容（去除HTML标签）
        const textContent = response.innerText || response.textContent;

        // 提取章节标题
        const chapterTitles = extractChapterTitles(response);

        if (textContent && textContent.trim()) {
            contents.push({
                index: index + 1,
                text: textContent.trim(),
                titles: chapterTitles,
                preview: textContent.trim().slice(0, 100)
            });
        }
    });

    return contents;
}

/**
 * 检查页面上是否有 model-response 元素
 * @returns {Object} 包含状态信息的对象
 */
function checkModelResponseReady() {
    const modelResponses = document.querySelectorAll('model-response');
    let hasContent = false;
    let totalLength = 0;

    modelResponses.forEach(response => {
        const text = (response.innerText || response.textContent || '').trim();
        if (text.length > 0) {
            hasContent = true;
            totalLength += text.length;
        }
    });

    return {
        ready: hasContent,
        count: modelResponses.length,
        totalLength: totalLength
    };
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkReady') {
        // 检查 model-response 是否已加载
        const status = checkModelResponseReady();
        sendResponse(status);
    } else if (request.action === 'extractContent') {
        // 提取内容
        const contents = extractModelResponses();
        sendResponse({ success: true, contents: contents });
    } else if (request.action === 'extractLatest') {
        // 只提取最新的一条回复
        const modelResponses = document.querySelectorAll('model-response');
        if (modelResponses.length > 0) {
            const lastResponse = modelResponses[modelResponses.length - 1];
            const text = (lastResponse.innerText || lastResponse.textContent || '').trim();
            const titles = extractChapterTitles(lastResponse);
            sendResponse({ success: true, text: text, titles: titles });
        } else {
            sendResponse({ success: false, error: '未找到 model-response 元素' });
        }
    } else if (request.action === 'getChapterList') {
        // 获取所有回复的章节标题列表
        const contents = extractModelResponses();
        const chapterList = contents.map(item => ({
            index: item.index,
            titles: item.titles,
            preview: item.preview,
            textLength: item.text.length
        }));
        sendResponse({ success: true, chapters: chapterList });
    }

    return true; // 保持消息通道开放
});

// 可选：自动监测 model-response 变化
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
            const modelResponses = mutation.target.querySelectorAll('model-response');
            if (modelResponses.length > 0) {
                console.log('[Gemini 下载器] 检测到 model-response 变化，共', modelResponses.length, '条回复');
            }
        }
    });
});

// 开始观察 DOM 变化
if (document.body) {
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

console.log('[Gemini 回复下载器] Content script 已加载');
