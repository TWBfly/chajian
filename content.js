// Content Script - 在页面上下文中运行

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkTableReady') {
        // 检查表格是否已加载
        const tables = document.querySelectorAll('table');
        let hasData = false;

        tables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            if (rows.length > 1) {
                hasData = true;
            }
        });

        sendResponse({ ready: hasData, tableCount: tables.length });
    }

    return true; // 保持消息通道开放
});

// 可选：自动监测表格变化
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
            const tables = mutation.target.querySelectorAll('table');
            if (tables.length > 0) {
                console.log('[表格下载器] 检测到表格变化');
            }
        }
    });
});

// 开始观察 DOM 变化
observer.observe(document.body, {
    childList: true,
    subtree: true
});

console.log('[表格下载器] Content script 已加载');
