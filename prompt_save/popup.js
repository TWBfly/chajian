document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const promptList = document.getElementById('prompt-list');
    const searchInput = document.getElementById('search-input');
    const addBtn = document.getElementById('add-btn');
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const promptTitleInput = document.getElementById('prompt-title');
    const promptContentInput = document.getElementById('prompt-content');
    const modalTagsContainer = document.getElementById('modal-tags');
    const saveBtn = document.getElementById('save-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const closeModalBtn = document.getElementById('close-modal');

    // Tag Elements
    const tagFiltersContainer = document.getElementById('tag-filters');
    const manageTagsBtn = document.getElementById('manage-tags-btn');
    const tagsModal = document.getElementById('tags-modal');
    const closeTagsModalBtn = document.getElementById('close-tags-modal');
    const newTagInput = document.getElementById('new-tag-input');
    const addTagBtn = document.getElementById('add-tag-btn');
    const manageTagsList = document.getElementById('manage-tags-list');

    const toast = document.getElementById('toast');
    const emptyState = document.getElementById('empty-state');

    let prompts = [];
    let tags = [];
    let editingId = null;
    let selectedFilterTags = new Set();
    let selectedModalTags = new Set();
    
    // API Configuration
    const API_BASE = 'http://localhost:5002/api';
    let isOnline = false;

    // Load data
    loadData();

    // Event Listeners
    addBtn.addEventListener('click', () => openModal());
    saveBtn.addEventListener('click', savePrompt);
    cancelBtn.addEventListener('click', closeModal);
    closeModalBtn.addEventListener('click', closeModal);
    searchInput.addEventListener('input', () => renderPrompts());

    manageTagsBtn.addEventListener('click', openTagsModal);
    closeTagsModalBtn.addEventListener('click', closeTagsModal);
    addTagBtn.addEventListener('click', addNewTag);

    // Functions

    async function loadData() {
        try {
            // Try fetching from server first
            const [promptsRes, tagsRes] = await Promise.all([
                fetch(`${API_BASE}/prompts`).catch(e => null),
                fetch(`${API_BASE}/tags`).catch(e => null)
            ]);

            if (promptsRes && promptsRes.ok && tagsRes && tagsRes.ok) {
                prompts = await promptsRes.json();
                tags = await tagsRes.json();
                isOnline = true;
                
                // Check if we need to migrate local data to server
                checkMigration();
            } else {
                throw new Error('Server unreachable');
            }
        } catch (e) {
            console.log('Offline mode:', e);
            isOnline = false;
            // Fallback to local storage
            chrome.storage.local.get(['prompts', 'tags'], (result) => {
                if (result.prompts) prompts = result.prompts;
                if (result.tags) tags = result.tags;
                renderTagFilters();
                renderPrompts();
            });
            return;
        }

        renderTagFilters();
        renderPrompts();
        // Update local cache
        updateLocalCache();
    }
    
    function checkMigration() {
        chrome.storage.local.get(['prompts', 'tags'], (result) => {
            const localPrompts = result.prompts || [];
            const localTags = result.tags || [];
            
            // If server is empty but we have local data, sync it
            if ((prompts.length === 0 && localPrompts.length > 0) || 
                (tags.length === 0 && localTags.length > 0)) {
                syncToServer(localPrompts, localTags);
            }
        });
    }
    
    async function syncToServer(localPrompts, localTags) {
        try {
            const res = await fetch(`${API_BASE}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompts: localPrompts, tags: localTags })
            });
            if (res.ok) {
                showToast('Migrated data to database!');
                // Reload to get merged data
                const [promptsRes, tagsRes] = await Promise.all([
                    fetch(`${API_BASE}/prompts`),
                    fetch(`${API_BASE}/tags`)
                ]);
                prompts = await promptsRes.json();
                tags = await tagsRes.json();
                renderTagFilters();
                renderPrompts();
                updateLocalCache();
            }
        } catch (e) {
            console.error('Migration failed', e);
        }
    }

    function updateLocalCache() {
        chrome.storage.local.set({ prompts: prompts, tags: tags });
    }

    // --- Tags Logic ---

    let draggedTagIndex = null;

    function renderTagFilters() {
        tagFiltersContainer.innerHTML = '';
        tags.forEach((tag, index) => {
            const chip = document.createElement('div');
            chip.className = `tag-chip ${selectedFilterTags.has(tag) ? 'selected' : ''}`;
            chip.textContent = tag;
            chip.draggable = true;

            // Click handler
            chip.addEventListener('click', (e) => {
                if (chip.classList.contains('dragging')) return;
                
                if (selectedFilterTags.has(tag)) {
                    selectedFilterTags.delete(tag);
                } else {
                    selectedFilterTags.add(tag);
                }
                renderTagFilters();
                renderPrompts();
            });

            // Drag handlers
            chip.addEventListener('dragstart', (e) => {
                draggedTagIndex = index;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', tag);
                setTimeout(() => chip.classList.add('dragging'), 0);
            });

            chip.addEventListener('dragend', () => {
                draggedTagIndex = null;
                chip.classList.remove('dragging');
                document.querySelectorAll('.tag-chip').forEach(el => el.classList.remove('drag-over'));
            });

            chip.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                return false;
            });
            
            chip.addEventListener('dragenter', (e) => {
                e.preventDefault();
                if (draggedTagIndex !== null && draggedTagIndex !== index) {
                    chip.classList.add('drag-over');
                }
            });

            chip.addEventListener('dragleave', (e) => {
                 chip.classList.remove('drag-over');
            });

            chip.addEventListener('drop', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                if (draggedTagIndex !== null && draggedTagIndex !== index) {
                    const tagToMove = tags[draggedTagIndex];
                    tags.splice(draggedTagIndex, 1);
                    tags.splice(index, 0, tagToMove);
                    
                    renderTagFilters();
                    updateLocalCache();
                    syncTagReorder();
                }
                return false;
            });

            tagFiltersContainer.appendChild(chip);
        });
    }

    async function syncTagReorder() {
        if (isOnline) {
             try {
                await fetch(`${API_BASE}/tags/reorder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderedTags: tags })
                });
            } catch (e) {
                console.error('Error syncing tag order', e);
            }
        }
    }

    function renderModalTags() {
        modalTagsContainer.innerHTML = '';
        tags.forEach(tag => {
            const chip = document.createElement('div');
            chip.className = `tag-chip ${selectedModalTags.has(tag) ? 'selected' : ''}`;
            chip.textContent = tag;
            chip.addEventListener('click', () => {
                if (selectedModalTags.has(tag)) {
                    selectedModalTags.delete(tag);
                } else {
                    selectedModalTags.add(tag);
                }
                renderModalTags(); // Re-render to show selection
            });
            modalTagsContainer.appendChild(chip);
        });
    }

    // Tags Management Modal
    function openTagsModal() {
        tagsModal.classList.remove('hidden');
        renderManageTagsList();
        newTagInput.value = '';
        newTagInput.focus();
    }

    function closeTagsModal() {
        tagsModal.classList.add('hidden');
        // Refresh filters in case tags were deleted
        renderTagFilters();
        renderPrompts();
    }

    function renderManageTagsList() {
        manageTagsList.innerHTML = '';
        tags.forEach(tag => {
            const item = document.createElement('div');
            item.className = 'manage-tag-item';

            const span = document.createElement('span');
            span.textContent = tag;

            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            delBtn.onclick = () => deleteTag(tag);

            item.appendChild(span);
            item.appendChild(delBtn);
            manageTagsList.appendChild(item);
        });
    }

    async function addNewTag() {
        const tagName = newTagInput.value.trim();
        if (tagName && !tags.includes(tagName)) {
            if (isOnline) {
                try {
                    const res = await fetch(`${API_BASE}/tags`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: tagName })
                    });
                    if (!res.ok) throw new Error('Failed to add tag');
                } catch (e) {
                    alert('Error saving to database: ' + e.message);
                    return;
                }
            }
            
            tags.push(tagName);
            updateLocalCache();
            renderManageTagsList();
            newTagInput.value = '';
        }
    }

    async function deleteTag(tagToDelete) {
        if (confirm(`Delete tag "${tagToDelete}"?`)) {
            if (isOnline) {
                try {
                    await fetch(`${API_BASE}/tags/${encodeURIComponent(tagToDelete)}`, {
                        method: 'DELETE'
                    });
                } catch (e) {
                    console.error('Error deleting tag from server', e);
                }
            }
            
            tags = tags.filter(t => t !== tagToDelete);
            // Remove this tag from all prompts
            prompts.forEach(p => {
                if (p.tags) {
                    p.tags = p.tags.filter(t => t !== tagToDelete);
                }
            });

            // Remove from selection if present
            if (selectedFilterTags.has(tagToDelete)) selectedFilterTags.delete(tagToDelete);

            updateLocalCache();
            renderManageTagsList();
        }
    }


    // --- Prompts Logic ---

    function renderPrompts() {
        const filterText = searchInput.value.toLowerCase();
        promptList.innerHTML = '';

        let filteredPrompts = prompts.filter(p => {
            const matchesText = p.title.toLowerCase().includes(filterText) || p.content.toLowerCase().includes(filterText);
            
            let matchesTags = true;
            if (selectedFilterTags.size > 0) {
                const promptTags = new Set(p.tags || []);
                for (let tag of selectedFilterTags) {
                    if (!promptTags.has(tag)) {
                        matchesTags = false;
                        break;
                    }
                }
            }

            return matchesText && matchesTags;
        });

        // Sort by orderIndex ASC, then updated_at DESC
        filteredPrompts.sort((a, b) => {
            const orderA = a.orderIndex !== undefined ? a.orderIndex : 0;
            const orderB = b.orderIndex !== undefined ? b.orderIndex : 0;
            if (orderA !== orderB) return orderA - orderB;
            return b.updatedAt - a.updatedAt;
        });

        if (filteredPrompts.length === 0) {
            promptList.appendChild(emptyState);
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            filteredPrompts.forEach((prompt, index) => {
                const isFirst = index === 0;
                const isLast = index === filteredPrompts.length - 1;
                const card = createPromptCard(prompt, isFirst, isLast);
                promptList.appendChild(card);
            });
        }
    }

    function createPromptCard(prompt, isFirst, isLast) {
        const div = document.createElement('div');
        div.className = 'prompt-card';
        div.dataset.id = prompt.id;

        let tagsHtml = '';
        if (prompt.tags && prompt.tags.length > 0) {
            tagsHtml = `<div class="card-tags">
                ${prompt.tags.map(t => `<span class="card-tag">${t}</span>`).join('')}
            </div>`;
        }

        div.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">${escapeHtml(prompt.title)}</h3>
                <div class="card-actions">
                    <button class="sort-btn up" title="Move Up" ${isFirst ? 'disabled' : ''} style="${isFirst ? 'visibility:hidden' : ''}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                    </button>
                    <button class="sort-btn down" title="Move Down" ${isLast ? 'disabled' : ''} style="${isLast ? 'visibility:hidden' : ''}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                    <button class="icon-btn edit" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="icon-btn delete" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
            ${tagsHtml}
            <div class="card-preview">${escapeHtml(prompt.content)}</div>
        `;

        // Click on card to copy (exclude actions)
        div.addEventListener('click', (e) => {
            if (!e.target.closest('.card-actions')) {
                copyToClipboard(prompt.content);
            }
        });

        // Edit button
        div.querySelector('.edit').addEventListener('click', (e) => {
            e.stopPropagation();
            openModal(prompt);
        });

        // Delete button
        div.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Are you sure you want to delete this prompt?')) {
                deletePrompt(prompt.id);
            }
        });

        // Sort buttons
        div.querySelector('.sort-btn.up').addEventListener('click', (e) => {
            e.stopPropagation();
            movePromptUp(prompt.id);
        });

        div.querySelector('.sort-btn.down').addEventListener('click', (e) => {
            e.stopPropagation();
            movePromptDown(prompt.id);
        });

        return div;
    }

    async function movePromptUp(promptId) {
        // Find index in current sorted view (but we need to operate on the main 'prompts' array)
        // Actually, we should sort the 'prompts' array to match the view, or find the item in 'prompts'.
        // To simplify, let's assume 'prompts' is kept sorted or we sort it before swapping.
        
        // Sort prompts first to ensure we swap correctly based on current order
        prompts.sort((a, b) => {
            const orderA = a.orderIndex !== undefined ? a.orderIndex : 0;
            const orderB = b.orderIndex !== undefined ? b.orderIndex : 0;
            if (orderA !== orderB) return orderA - orderB;
            return b.updatedAt - a.updatedAt;
        });

        const index = prompts.findIndex(p => p.id === promptId);
        if (index > 0) {
            // Swap orderIndex with the one above
            const prevIndex = index - 1;
            
            // Just swapping their positions in array is not enough, we need to swap their orderIndex.
            // But if they have same orderIndex (unlikely if unique), we just swap values.
            // Better: re-assign orderIndex based on new array position.
            
            // Swap in array
            [prompts[index], prompts[prevIndex]] = [prompts[prevIndex], prompts[index]];
            
            // Re-assign order indices for all (or just affected)
            // To be robust, let's re-assign for the whole list or send the new order of IDs to server.
            await syncReorder();
        }
    }

    async function movePromptDown(promptId) {
        prompts.sort((a, b) => {
            const orderA = a.orderIndex !== undefined ? a.orderIndex : 0;
            const orderB = b.orderIndex !== undefined ? b.orderIndex : 0;
            if (orderA !== orderB) return orderA - orderB;
            return b.updatedAt - a.updatedAt;
        });

        const index = prompts.findIndex(p => p.id === promptId);
        if (index < prompts.length - 1) {
            const nextIndex = index + 1;
            [prompts[index], prompts[nextIndex]] = [prompts[nextIndex], prompts[index]];
            await syncReorder();
        }
    }

    async function syncReorder() {
        // Update local orderIndex based on array position
        prompts.forEach((p, idx) => {
            p.orderIndex = idx;
        });

        renderPrompts(); // Optimistic update
        updateLocalCache();

        if (isOnline) {
            try {
                const orderedIds = prompts.map(p => p.id);
                await fetch(`${API_BASE}/prompts/reorder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderedIds })
                });
            } catch(e) {
                console.error('Reorder sync failed', e);
            }
        }
    }

    function openModal(prompt = null) {
        if (prompt) {
            editingId = prompt.id;
            modalTitle.textContent = 'Edit Prompt';
            promptTitleInput.value = prompt.title;
            promptContentInput.value = prompt.content;
            selectedModalTags = new Set(prompt.tags || []);
        } else {
            editingId = null;
            modalTitle.textContent = 'New Prompt';
            promptTitleInput.value = '';
            promptContentInput.value = '';
            selectedModalTags = new Set();
        }
        renderModalTags();
        modal.classList.remove('hidden');
        promptTitleInput.focus();
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    async function savePrompt() {
        const title = promptTitleInput.value.trim();
        const content = promptContentInput.value.trim();
        const promptTags = Array.from(selectedModalTags);

        if (!title || !content) {
            alert('Please fill in both fields.');
            return;
        }

        let promptData;

        if (editingId) {
            // Update existing
            const index = prompts.findIndex(p => p.id === editingId);
            if (index !== -1) {
                promptData = {
                    ...prompts[index],
                    title,
                    content,
                    tags: promptTags,
                    updatedAt: Date.now()
                };
                
                if (isOnline) {
                    try {
                        await fetch(`${API_BASE}/prompts/${editingId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(promptData)
                        });
                    } catch(e) {
                         alert('Error saving to database: ' + e.message);
                         return;
                    }
                }
                
                prompts[index] = promptData;
            }
        } else {
            promptData = {
                id: Date.now().toString(),
                title,
                content,
                tags: promptTags,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            if (isOnline) {
                try {
                    const res = await fetch(`${API_BASE}/prompts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(promptData)
                    });
                    if (res.ok) {
                        const savedData = await res.json();
                        promptData.orderIndex = savedData.orderIndex;
                    }
                } catch(e) {
                     alert('Error saving to database: ' + e.message);
                     return;
                }
            }
            
            // If offline or failed to get orderIndex, set a temporary one
            if (promptData.orderIndex === undefined) {
                 const minOrder = prompts.length > 0 ? Math.min(...prompts.map(p => p.orderIndex || 0)) : 0;
                 promptData.orderIndex = minOrder - 1;
            }

            prompts.unshift(promptData); // Add to top
            // Sort to ensure consistency
            prompts.sort((a, b) => {
                const orderA = a.orderIndex !== undefined ? a.orderIndex : 0;
                const orderB = b.orderIndex !== undefined ? b.orderIndex : 0;
                if (orderA !== orderB) return orderA - orderB;
                return b.updatedAt - a.updatedAt;
            });
        }

        updateLocalCache();
        closeModal();
        renderPrompts();
    }

    async function deletePrompt(id) {
        if (isOnline) {
            try {
                await fetch(`${API_BASE}/prompts/${id}`, {
                    method: 'DELETE'
                });
            } catch(e) {
                console.error('Error deleting from server', e);
            }
        }
        
        prompts = prompts.filter(p => p.id !== id);
        updateLocalCache();
        renderPrompts();
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('Copied to clipboard!');
        });
    }

    function showToast(message) {
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 2000);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
