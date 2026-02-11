// 弹出窗口 JavaScript 逻辑

document.addEventListener('DOMContentLoaded', function () {
    const detectBtn = document.getElementById('detectBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const filenameInput = document.getElementById('filename');
    const selectorInput = document.getElementById('selector');
    const statusDiv = document.getElementById('status');
    const tableListDiv = document.getElementById('tableList');
    const quickTags = document.querySelectorAll('.tag');

    let detectedTables = [];

    // 快捷标签点击事件
    quickTags.forEach(tag => {
        tag.addEventListener('click', function () {
            filenameInput.value = this.getAttribute('data-file');
            selectorInput.value = this.getAttribute('data-selector');
            // 自动触发一次检测
            detectBtn.click();
        });
    });

    // 显示状态信息
    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + type;
    }

    // 检测表格
    detectBtn.addEventListener('click', async function () {
        showStatus('正在检测表格...', 'loading');

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                func: detectTables,
                args: [selectorInput.value]
            });

            if (!results || results.length === 0) {
                throw new Error('脚本执行失败，请刷新页面重试');
            }

            detectedTables = [];
            results.forEach(frameResult => {
                if (frameResult.result && Array.isArray(frameResult.result)) {
                    // 为每个表格记录它所在的 frameId
                    const tablesWithFrame = frameResult.result.map(t => ({
                        ...t,
                        frameId: frameResult.frameId
                    }));
                    detectedTables.push(...tablesWithFrame);
                }
            });

            if (detectedTables.length === 0) {
                showStatus('未检测到表格，请确保：1. 页面已加载完成 2. 选择器正确 3. 页面中确实存在 table 标签', 'error');
                tableListDiv.innerHTML = '';
            } else {
                showStatus(`检测到 ${detectedTables.length} 个表格 (来自 ${results.length} 个框架)`, 'success');
                renderTableList(detectedTables);
            }
        } catch (error) {
            showStatus('检测失败: ' + error.message, 'error');
        }
    });

    // 渲染表格列表
    function renderTableList(tables) {
        tableListDiv.innerHTML = tables.map((table, index) => `
      <div class="table-item">
        <input type="checkbox" id="table_${index}" checked>
        <div class="table-info">
          表格 ${index + 1}: ${table.rows}行 × ${table.cols}列
          ${table.selector ? `<br><small>${table.selector}</small>` : ''}
        </div>
      </div>
    `).join('');
    }

    // 下载表格
    downloadBtn.addEventListener('click', async function () {
        showStatus('正在等待表格加载并提取数据...', 'loading');

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const filename = filenameInput.value || 'table_data';
            const selector = selectorInput.value;

            // 按 frameId 分组选中的表格
            const selectedByFrame = {};
            document.querySelectorAll('.table-item input[type="checkbox"]:checked').forEach((checkbox) => {
                const globalIndex = parseInt(checkbox.id.replace('table_', ''));
                const tableInfo = detectedTables[globalIndex];
                if (tableInfo) {
                    if (!selectedByFrame[tableInfo.frameId]) {
                        selectedByFrame[tableInfo.frameId] = [];
                    }
                    selectedByFrame[tableInfo.frameId].push(tableInfo.index);
                }
            });

            let fullMarkdown = '';

            for (const frameId in selectedByFrame) {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id, frameIds: [parseInt(frameId)] },
                    func: extractAndConvertTables,
                    args: [selector, selectedByFrame[frameId]]
                });

                if (results && results[0] && results[0].result) {
                    let content = results[0].result;
                    if (fullMarkdown) {
                        // 如果有多个 frame，合并时去掉后面 frame 的重复标题头
                        content = content.replace(/^# 表格数据导出\n\n.*?\n\n.*?\n\n---\n\n/s, '');
                        fullMarkdown += '\n' + content;
                    } else {
                        fullMarkdown = content;
                    }
                }
            }

            if (!fullMarkdown) {
                showStatus('未能提取到表格数据', 'error');
                return;
            }

            // 创建 Blob 并下载
            const blob = new Blob([fullMarkdown], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            await chrome.downloads.download({
                url: url,
                filename: filename + '.md',
                saveAs: true
            });

            showStatus('下载成功！', 'success');
        } catch (error) {
            showStatus('下载失败: ' + error.message, 'error');
        }
    });
});

// 注入到页面中执行的函数：检测表格
function detectTables(customSelector) {
    // 智能处理选择器：如果没有 . # [ 等特殊字符，自动加点号当作 class
    function normalizeSelector(sel) {
        if (!sel) return null;
        let selector = sel.trim();
        if (!/^[.#\[]/.test(selector)) {
            selector = '.' + selector;
        }
        return selector;
    }

    // 根据选择器获取表格元素
    function getTableElements(sel) {
        let tableElements = [];
        if (sel) {
            const selector = normalizeSelector(sel);
            try {
                // 1. 选择器本身是表格
                document.querySelectorAll(selector).forEach(el => {
                    if (el.tagName === 'TABLE') tableElements.push(el);
                });
                // 2. 选择器内部的表格
                document.querySelectorAll(selector + ' table').forEach(el => {
                    if (!tableElements.includes(el)) tableElements.push(el);
                });
                // 3. 选择器内部查找 table
                document.querySelectorAll(selector).forEach(el => {
                    const innerTable = el.querySelector('table');
                    if (innerTable && !tableElements.includes(innerTable)) tableElements.push(innerTable);
                });
            } catch (e) {
                console.error('选择器错误:', e);
            }
        } else {
            tableElements = Array.from(document.querySelectorAll('table'));
        }
        return tableElements;
    }

    const tables = [];
    const tableElements = getTableElements(customSelector);

    tableElements.forEach((table, index) => {
        if (!table) return;
        const rows = table.querySelectorAll('tr').length;
        const firstRow = table.querySelector('tr');
        const cols = firstRow ? firstRow.querySelectorAll('td, th').length : 0;

        if (rows > 0 && cols > 0) {
            tables.push({
                index: index,
                rows: rows,
                cols: cols,
                selector: table.className ? '.' + (typeof table.className === 'string' ? table.className : '').split(' ').join('.') : '',
                id: table.id || ''
            });
        }
    });

    return tables;
}

// 注入到页面中执行的函数：等待表格加载并提取数据
function extractAndConvertTables(customSelector, selectedIndices) {
    // 智能处理选择器
    function normalizeSelector(sel) {
        if (!sel) return null;
        let selector = sel.trim();
        if (!/^[.#\[]/.test(selector)) {
            selector = '.' + selector;
        }
        return selector;
    }

    // 根据选择器获取表格元素
    function getTableElements(sel) {
        let tableElements = [];
        if (sel) {
            const selector = normalizeSelector(sel);
            try {
                document.querySelectorAll(selector).forEach(el => {
                    if (el.tagName === 'TABLE') tableElements.push(el);
                });
                document.querySelectorAll(selector + ' table').forEach(el => {
                    if (!tableElements.includes(el)) tableElements.push(el);
                });
                document.querySelectorAll(selector).forEach(el => {
                    const innerTable = el.querySelector('table');
                    if (innerTable && !tableElements.includes(innerTable)) tableElements.push(innerTable);
                });
            } catch (e) {
                console.error('选择器错误:', e);
            }
        } else {
            tableElements = Array.from(document.querySelectorAll('table'));
        }
        return tableElements;
    }

    return new Promise((resolve) => {
        // 等待表格数据加载的函数
        function waitForTableData(maxWait = 10000, interval = 500) {
            return new Promise((resolveWait) => {
                let elapsed = 0;
                let lastRowCount = 0;
                let stableCount = 0;

                const checkInterval = setInterval(() => {
                    elapsed += interval;

                    const tableElements = getTableElements(customSelector);

                    // 计算所有表格的总行数
                    let totalRows = 0;
                    tableElements.forEach(table => {
                        if (table) totalRows += table.querySelectorAll('tr').length;
                    });

                    // 检查行数是否稳定（连续3次检查行数相同）
                    if (totalRows === lastRowCount && totalRows > 0) {
                        stableCount++;
                        if (stableCount >= 3) {
                            clearInterval(checkInterval);
                            resolveWait(tableElements);
                            return;
                        }
                    } else {
                        stableCount = 0;
                        lastRowCount = totalRows;
                    }

                    // 超时
                    if (elapsed >= maxWait) {
                        clearInterval(checkInterval);
                        resolveWait(tableElements);
                    }
                }, interval);
            });
        }

        // 将表格转换为 Markdown
        function tableToMarkdown(table, tableIndex) {
            const rows = table.querySelectorAll('tr');
            if (rows.length === 0) return '';

            let markdown = '';
            let headerProcessed = false;

            // 获取表格标题（如果有）
            const caption = table.querySelector('caption');
            if (caption) {
                markdown += `## ${caption.textContent.trim()}\n\n`;
            } else {
                markdown += `## 表格 ${tableIndex + 1}\n\n`;
            }

            rows.forEach((row, rowIndex) => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length === 0) return;

                const cellValues = Array.from(cells).map(cell => {
                    // 获取单元格文本，处理换行和特殊字符
                    let text = cell.textContent.trim();
                    text = text.replace(/\|/g, '\\|');  // 转义管道符
                    text = text.replace(/\n/g, ' ');    // 替换换行
                    return text;
                });

                markdown += '| ' + cellValues.join(' | ') + ' |\n';

                // 在表头后添加分隔行
                if (!headerProcessed && (row.querySelector('th') || rowIndex === 0)) {
                    markdown += '| ' + cellValues.map(() => '---').join(' | ') + ' |\n';
                    headerProcessed = true;
                }
            });

            return markdown + '\n';
        }

        // 主逻辑
        waitForTableData().then((tableElements) => {
            if (tableElements.length === 0) {
                resolve('');
                return;
            }

            let markdown = '# 表格数据导出\n\n';
            markdown += `> 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
            markdown += `> 来源: ${window.location.href}\n\n`;
            markdown += '---\n\n';

            // 将 NodeList 转为数组
            const tablesArray = Array.from(tableElements);

            // 如果指定了选中的索引，只处理选中的表格
            if (selectedIndices && selectedIndices.length > 0) {
                selectedIndices.forEach((index) => {
                    if (tablesArray[index]) {
                        markdown += tableToMarkdown(tablesArray[index], index);
                    }
                });
            } else {
                // 否则处理所有表格
                tablesArray.forEach((table, index) => {
                    markdown += tableToMarkdown(table, index);
                });
            }

            resolve(markdown);
        });
    });
}
