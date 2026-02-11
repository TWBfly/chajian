// Popup Script - 控制弹窗逻辑

document.addEventListener('DOMContentLoaded', () => {
    const pageStatus = document.getElementById('pageStatus');
    const responseCount = document.getElementById('responseCount');
    const textLength = document.getElementById('textLength');
    const filenameInput = document.getElementById('filename');
    const downloadLatestBtn = document.getElementById('downloadLatest');
    const downloadAllBtn = document.getElementById('downloadAll');
    const refreshBtn = document.getElementById('refresh');
    const messageDiv = document.getElementById('message');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');
    const chapterSection = document.getElementById('chapterSection');
    const chapterTags = document.getElementById('chapterTags');

    /**
     * 显示消息
     */
    function showMessage(text, type = 'info') {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';

        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 3000);
    }

    /**
     * 显示章节标签
     */
    function displayChapterTags(chapters) {
        chapterTags.innerHTML = '';

        if (!chapters || chapters.length === 0) {
            chapterSection.style.display = 'none';
            return;
        }

        let hasAnyTitles = false;

        chapters.forEach((chapter, idx) => {
            if (chapter.titles && chapter.titles.length > 0) {
                hasAnyTitles = true;
                chapter.titles.forEach((title, titleIdx) => {
                    const tag = document.createElement('span');
                    tag.className = `chapter-tag ${titleIdx % 2 === 1 ? 'secondary' : ''}`;
                    tag.textContent = title;
                    tag.title = `回复 ${chapter.index} - ${title}`;
                    tag.style.animationDelay = `${(idx * chapter.titles.length + titleIdx) * 0.05}s`;
                    chapterTags.appendChild(tag);
                });
            }
        });

        if (hasAnyTitles) {
            chapterSection.style.display = 'block';
        } else {
            chapterSection.style.display = 'none';
        }
    }

    /**
     * 获取章节列表
     */
    async function fetchChapterList() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab.url || !tab.url.includes('gemini.google.com')) {
                return;
            }

            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getChapterList' });
            if (response.success && response.chapters) {
                displayChapterTags(response.chapters);
            }
        } catch (error) {
            console.error('获取章节列表失败:', error);
        }
    }

    /**
     * 检查页面状态
     */
    async function checkStatus() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // 检查是否在 Gemini 页面
            if (!tab.url || !tab.url.includes('gemini.google.com')) {
                pageStatus.textContent = '非 Gemini 页面';
                pageStatus.className = 'status-value not-ready';
                responseCount.textContent = '-';
                textLength.textContent = '-';
                downloadLatestBtn.disabled = true;
                downloadAllBtn.disabled = true;
                return;
            }

            // 发送消息给 content script
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkReady' });

            if (response.ready) {
                pageStatus.textContent = '已就绪';
                pageStatus.className = 'status-value ready';
                responseCount.textContent = response.count + ' 条';
                textLength.textContent = formatLength(response.totalLength);
                downloadLatestBtn.disabled = false;
                downloadAllBtn.disabled = false;
            } else {
                pageStatus.textContent = '无回复内容';
                pageStatus.className = 'status-value not-ready';
                responseCount.textContent = response.count + ' 条';
                textLength.textContent = '0';
                downloadLatestBtn.disabled = true;
                downloadAllBtn.disabled = true;
            }
        } catch (error) {
            console.error('检查状态失败:', error);
            pageStatus.textContent = '连接失败';
            pageStatus.className = 'status-value not-ready';
            responseCount.textContent = '-';
            textLength.textContent = '-';
            downloadLatestBtn.disabled = true;
            downloadAllBtn.disabled = true;

            // 尝试注入 content script
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab.url && tab.url.includes('gemini.google.com')) {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                    showMessage('正在重新连接，请稍后重试', 'info');
                }
            } catch (e) {
                console.error('注入脚本失败:', e);
            }
        }
    }

    /**
     * 格式化文字长度
     */
    function formatLength(length) {
        if (length > 10000) {
            return (length / 1000).toFixed(1) + 'k 字符';
        }
        return length + ' 字符';
    }

    /**
     * 生成时间戳
     */
    function getTimestamp() {
        const now = new Date();
        return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    }

    /**
     * 下载文件
     */
    function downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        chrome.downloads.download({
            url: url,
            filename: filename + '.md',
            saveAs: true
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                showMessage('下载失败: ' + chrome.runtime.lastError.message, 'error');
            } else {
                showMessage('下载成功！', 'success');
            }
            URL.revokeObjectURL(url);
        });
    }

    /**
     * 下载最新回复
     */
    async function downloadLatest() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractLatest' });

            if (response.success && response.text) {
                const filename = filenameInput.value.trim() || 'gemini_response';
                const timestamp = getTimestamp();
                const content = `# Gemini 回复\n\n> 下载时间：${new Date().toLocaleString('zh-CN')}\n\n---\n\n${response.text}`;

                downloadFile(content, `${filename}_${timestamp}`);

                // 显示预览
                previewSection.style.display = 'block';
                previewContent.textContent = response.text.slice(0, 500) + (response.text.length > 500 ? '...' : '');
            } else {
                showMessage(response.error || '提取内容失败', 'error');
            }
        } catch (error) {
            console.error('下载最新回复失败:', error);
            showMessage('下载失败: ' + error.message, 'error');
        }
    }

    /**
     * 下载全部回复
     */
    async function downloadAll() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });

            if (response.success && response.contents && response.contents.length > 0) {
                const filename = filenameInput.value.trim() || 'gemini_response';
                const timestamp = getTimestamp();

                // 组装 Markdown 内容
                let content = `# Gemini 全部回复\n\n> 下载时间：${new Date().toLocaleString('zh-CN')}\n> 回复数量：${response.contents.length} 条\n\n---\n\n`;

                response.contents.forEach((item, index) => {
                    content += `## 回复 ${item.index}\n\n${item.text}\n\n---\n\n`;
                });

                downloadFile(content, `${filename}_all_${timestamp}`);

                // 显示预览
                previewSection.style.display = 'block';
                const previewText = response.contents.map(c => c.text.slice(0, 100)).join('\n---\n');
                previewContent.textContent = previewText.slice(0, 500) + '...';

                showMessage(`成功提取 ${response.contents.length} 条回复`, 'success');
            } else {
                showMessage('未找到回复内容', 'error');
            }
        } catch (error) {
            console.error('下载全部回复失败:', error);
            showMessage('下载失败: ' + error.message, 'error');
        }
    }

    // 绑定事件
    downloadLatestBtn.addEventListener('click', downloadLatest);
    downloadAllBtn.addEventListener('click', downloadAll);
    refreshBtn.addEventListener('click', async () => {
        await checkStatus();
        await fetchChapterList();
    });

    // 初始检查
    checkStatus().then(() => {
        fetchChapterList();
    });
});
