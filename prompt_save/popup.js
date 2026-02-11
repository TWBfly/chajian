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

    function loadData() {
        chrome.storage.local.get(['prompts', 'tags'], (result) => {
            if (result.prompts) prompts = result.prompts;
            if (result.tags) tags = result.tags;

            renderTagFilters();
            renderPrompts();
        });
    }

    function saveData() {
        chrome.storage.local.set({ prompts: prompts, tags: tags }, () => {
            renderPrompts();
            renderTagFilters(); // Re-render in case tags changed
        });
    }

    // --- Tags Logic ---

    function renderTagFilters() {
        tagFiltersContainer.innerHTML = '';
        tags.forEach(tag => {
            const chip = document.createElement('div');
            chip.className = `tag-chip ${selectedFilterTags.has(tag) ? 'selected' : ''}`;
            chip.textContent = tag;
            chip.addEventListener('click', () => {
                if (selectedFilterTags.has(tag)) {
                    selectedFilterTags.delete(tag);
                } else {
                    selectedFilterTags.add(tag);
                }
                renderTagFilters();
                renderPrompts();
            });
            tagFiltersContainer.appendChild(chip);
        });
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

    function addNewTag() {
        const tagName = newTagInput.value.trim();
        if (tagName && !tags.includes(tagName)) {
            tags.push(tagName);
            saveData();
            renderManageTagsList();
            newTagInput.value = '';
        }
    }

    function deleteTag(tagToDelete) {
        if (confirm(`Delete tag "${tagToDelete}"?`)) {
            tags = tags.filter(t => t !== tagToDelete);
            // Remove this tag from all prompts
            prompts.forEach(p => {
                if (p.tags) {
                    p.tags = p.tags.filter(t => t !== tagToDelete);
                }
            });

            // Remove from selection if present
            if (selectedFilterTags.has(tagToDelete)) selectedFilterTags.delete(tagToDelete);

            saveData(); // Save both tags and prompts
            renderManageTagsList();
        }
    }


    // --- Prompts Logic ---

    function renderPrompts() {
        const filterText = searchInput.value.toLowerCase();
        promptList.innerHTML = '';

        const filteredPrompts = prompts.filter(p => {
            const matchesText = p.title.toLowerCase().includes(filterText) || p.content.toLowerCase().includes(filterText);

            // Tag filter: if no tags selected, show all. If selected, prompt must have AT LEAST ONE of the selected tags (OR logic)
            // Or strict AND logic? Usually filtering is AND if you select multiple features, but for tags OR is common too.
            // Let's go with: Show prompt if it contains ALL selected tags (AND logic).

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
        }).sort((a, b) => (b.copyCount || 0) - (a.copyCount || 0)); // Sort by copyCount desc

        if (filteredPrompts.length === 0) {
            promptList.appendChild(emptyState);
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            filteredPrompts.forEach(prompt => {
                const card = createPromptCard(prompt);
                promptList.appendChild(card);
            });
        }
    }

    function createPromptCard(prompt) {
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
                // Increment copy count
                prompt.copyCount = (prompt.copyCount || 0) + 1;
                saveData(); // Persist and re-render (which re-sorts)
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

        return div;
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

    function savePrompt() {
        const title = promptTitleInput.value.trim();
        const content = promptContentInput.value.trim();
        const promptTags = Array.from(selectedModalTags);

        if (!title || !content) {
            alert('Please fill in both fields.');
            return;
        }

        if (editingId) {
            // Update existing
            const index = prompts.findIndex(p => p.id === editingId);
            if (index !== -1) {
                prompts[index] = {
                    ...prompts[index],
                    title,
                    content,
                    tags: promptTags,
                    updatedAt: Date.now()
                };
            }
        } else {
            // Create new
            const newPrompt = {
                id: Date.now().toString(),
                title,
                content,
                tags: promptTags,
                copyCount: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            prompts.unshift(newPrompt); // Add to top
        }

        saveData();
        closeModal();
    }

    function deletePrompt(id) {
        prompts = prompts.filter(p => p.id !== id);
        saveData();
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
