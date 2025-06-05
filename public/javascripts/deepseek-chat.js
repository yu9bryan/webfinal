// DeepSeek Chat JavaScript
let selectedGpus = [];
let currentSessionId = null; // 當前會話ID
let conversationHistory = []; // 當前對話歷史

// 生成唯一的會話ID
function generateSessionId() {
    return Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
}

// 初始化會話
function initializeSession() {
    if (!currentSessionId) {
        currentSessionId = generateSessionId();
        conversationHistory = [];
        console.log('新會話已初始化:', currentSessionId);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // 初始化會話
    initializeSession();
    
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const chatContainer = document.getElementById('chatContainer');
    const typingIndicator = document.getElementById('typingIndicator');
    const gpuSearch = document.getElementById('gpuSearch');
    const searchDropdown = document.getElementById('searchDropdown');
    
    // GPU 搜尋功能
    let searchTimeout;
    gpuSearch.addEventListener('input', function() {
        const query = this.value.trim();
        clearTimeout(searchTimeout);
        
        if (query.length < 2) {
            hideSearchDropdown();
            return;
        }
        
        searchTimeout = setTimeout(() => {
            searchGpus(query);
        }, 300);
    });
    
    // 點擊其他地方隱藏下拉選單
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.mb-3')) {
            hideSearchDropdown();
        }
    });
    
    // 處理 Enter 鍵發送
    userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // 自動調整文字輸入框高度
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
});

// GPU 搜尋功能
async function searchGpus(query) {
    try {
        const response = await fetch(`/api/search-gpus?query=${encodeURIComponent(query)}`);
        const gpus = await response.json();
        
        showSearchDropdown(gpus);
    } catch (error) {
        console.error('搜尋 GPU 時發生錯誤:', error);
    }
}

// 顯示搜尋下拉選單
function showSearchDropdown(gpus) {
    const dropdown = document.getElementById('searchDropdown');
    
    if (gpus.length === 0) {
        dropdown.innerHTML = '<div class="search-dropdown-item text-muted">找不到相符的 GPU</div>';
    } else {
        dropdown.innerHTML = gpus.map(gpu => 
            `<div class="search-dropdown-item" onclick="selectGpu(${gpu.id}, '${gpu.name.replace(/'/g, "\\'")}')">
                ${gpu.name}
            </div>`
        ).join('');
    }
    
    dropdown.style.display = 'block';
}

// 隱藏搜尋下拉選單
function hideSearchDropdown() {
    const dropdown = document.getElementById('searchDropdown');
    dropdown.style.display = 'none';
}

// 選擇 GPU
function selectGpu(id, name) {
    if (selectedGpus.length >= 3) {
        showError('最多只能選擇 3 個 GPU');
        return;
    }
    
    if (selectedGpus.find(gpu => gpu.id === id)) {
        showError('此 GPU 已被選擇');
        return;
    }
    
    selectedGpus.push({ id, name });
    updateSelectedGpusDisplay();
    hideSearchDropdown();
    
    // 清空搜尋框
    document.getElementById('gpuSearch').value = '';
}

// 移除選擇的 GPU
function removeGpu(id) {
    selectedGpus = selectedGpus.filter(gpu => gpu.id !== id);
    updateSelectedGpusDisplay();
}

// 更新已選擇 GPU 的顯示
function updateSelectedGpusDisplay() {
    const container = document.getElementById('selectedGpus');
    
    if (selectedGpus.length === 0) {
        container.innerHTML = '<div class="text-muted">尚未選擇任何 GPU</div>';
    } else {
        container.innerHTML = selectedGpus.map(gpu => 
            `<div class="gpu-tag">
                ${gpu.name}
                <button class="remove-btn" onclick="removeGpu(${gpu.id})" title="移除">×</button>
            </div>`
        ).join('');
    }
}

// 發送訊息
async function sendMessage() {
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const message = userInput.value.trim();
    
    if (!message) {
        showError('請輸入訊息內容');
        return;
    }
    
    // 禁用輸入和按鈕
    userInput.disabled = true;
    sendButton.disabled = true;
    sendButton.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>發送中';
    
    // 添加用戶訊息到聊天
    addMessage('user', message);
    
    // 清空輸入框
    userInput.value = '';
    userInput.style.height = 'auto';
    
    // 顯示輸入中指示器
    showTypingIndicator();
      try {
        const requestData = {
            message: message,
            selectedGpus: selectedGpus.map(gpu => gpu.id), // 只傳送 GPU ID
            sessionId: currentSessionId // 傳送會話ID
        };
          const response = await fetch('/api/deepseek-chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // 處理流式響應
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        // 創建 AI 訊息容器
        const aiMessageId = addMessage('ai', '');
        const aiMessageContent = document.querySelector(`[data-message-id="${aiMessageId}"] .message-content`);
        
        let fullResponse = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6).trim();
                    
                    if (data === '[DONE]') {
                        hideTypingIndicator();
                        break;
                    }
                      try {
                        const parsedData = JSON.parse(data);
                        if (parsedData.content) {
                            fullResponse += parsedData.content;
                            // 實時顯示純文字，避免頻繁的markdown渲染
                            aiMessageContent.textContent = fullResponse;
                            scrollToBottom();
                        }                        if (parsedData.done) {
                            hideTypingIndicator();
                            // 保存原始內容到data屬性
                            aiMessageContent.setAttribute('data-original-content', fullResponse);
                            // 在完成時進行最終的markdown渲染
                            if (fullResponse && typeof marked !== 'undefined') {
                                try {
                                    marked.setOptions({
                                        breaks: true,
                                        gfm: true,
                                        sanitize: false,
                                        smartypants: true
                                    });
                                    aiMessageContent.innerHTML = marked.parse(fullResponse);
                                } catch (markdownError) {
                                    console.error('Markdown渲染錯誤:', markdownError);
                                    aiMessageContent.textContent = fullResponse;
                                }
                            }
                            
                            // 將完整的AI回應添加到對話歷史
                            if (fullResponse && fullResponse.trim()) {
                                conversationHistory.push({
                                    type: 'ai',
                                    content: fullResponse,
                                    timestamp: new Date().toISOString()
                                });
                                
                                console.log(`AI回應已加入歷史：歷史長度=${conversationHistory.length}`);
                                console.log('AI回應完成，準備自動保存會話...');
                                
                                // 自動保存會話
                                setTimeout(() => {
                                    saveCurrentSession();
                                }, 1000); // 延遲1秒保存，確保UI更新完成
                            }
                            
                            scrollToBottom();
                            break;
                        }
                    } catch (e) {
                        console.warn('無法解析數據:', data);
                    }
                }
            }
        }          if (!fullResponse) {
            const errorMessage = '抱歉，我沒有收到回應。請稍後再試。';
            if (typeof marked !== 'undefined') {
                aiMessageContent.innerHTML = marked.parse(errorMessage);
            } else {
                aiMessageContent.textContent = errorMessage;
            }
            
            // 將錯誤消息也添加到對話歷史
            conversationHistory.push({
                type: 'ai',
                content: errorMessage,
                timestamp: new Date().toISOString()
            });
            
            console.log(`AI錯誤回應已加入歷史：歷史長度=${conversationHistory.length}`);
            
            // 保存會話
            setTimeout(() => {
                saveCurrentSession();
            }, 1000);
        }
        
    } catch (error) {
        console.error('DeepSeek API 錯誤:', error);
        hideTypingIndicator();
        addMessage('ai', `抱歉，發生了錯誤：${error.message}。請檢查網絡連接或稍後再試。`);
    } finally {
        // 恢復輸入和按鈕
        userInput.disabled = false;
        sendButton.disabled = false;
        sendButton.innerHTML = '<i class="bi bi-send-fill me-1"></i>發送';
        userInput.focus();
        hideTypingIndicator();
    }
}

// 添加訊息到聊天
function addMessage(type, content) {
    const chatContainer = document.getElementById('chatContainer');
    const messageId = Date.now() + Math.random();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.setAttribute('data-message-id', messageId);
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = type === 'user' ? '<i class="bi bi-person-fill"></i>' : '<i class="bi bi-robot"></i>';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    // 保存原始內容到data屬性，用於導出
    messageContent.setAttribute('data-original-content', content || '');      // 將消息加入對話歷史（排除歡迎消息和空內容）
    if (content && content.trim() && !content.includes('您好！我是 DeepSeek AI 助手')) {
        conversationHistory.push({
            type: type,
            content: content,
            timestamp: new Date().toISOString()
        });
        
        console.log(`消息已加入歷史：類型=${type}, 歷史長度=${conversationHistory.length}`);
        
        // 如果是AI回應，自動保存會話
        if (type === 'ai') {
            console.log('AI回應完成，準備自動保存會話...');
            setTimeout(() => {
                saveCurrentSession();
            }, 1000); // 延遲1秒保存，確保UI更新完成
        }
    }
    
    // 如果是AI訊息且有markdown內容，則渲染markdown
    if (type === 'ai' && content && typeof marked !== 'undefined') {
        // 配置marked選項
        marked.setOptions({
            breaks: true,
            gfm: true,
            sanitize: false,
            smartypants: true
        });
        
        try {
            // 渲染markdown為HTML
            messageContent.innerHTML = marked.parse(content);
        } catch (error) {
            console.error('Markdown渲染錯誤:', error);
            messageContent.textContent = content;
        }
    } else {
        // 對於用戶訊息或無markdown的內容，使用純文字
        messageContent.textContent = content;
    }
    
    if (type === 'user') {
        messageDiv.appendChild(messageContent);
        messageDiv.appendChild(avatar);
    } else {
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
    }
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
    
    return messageId;
}

// 顯示輸入中指示器
function showTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    typingIndicator.style.display = 'block';
}

// 隱藏輸入中指示器
function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    typingIndicator.style.display = 'none';
}

// 滾動到底部
function scrollToBottom() {
    const chatContainer = document.getElementById('chatContainer');
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 清空對話
function clearChat() {
    if (confirm('確定要清空所有對話記錄嗎？')) {
        // 如果當前會話有對話內容，先保存
        if (conversationHistory.length > 0) {
            saveCurrentSession();
        }
        
        // 重置會話
        currentSessionId = null;
        conversationHistory = [];
        initializeSession();
        
        const chatContainer = document.getElementById('chatContainer');
        
        // 保留歡迎訊息
        chatContainer.innerHTML = `
            <div class="message ai">
                <div class="message-avatar">
                    <i class="bi bi-robot"></i>
                </div>
                <div class="message-content">
                    您好！我是 DeepSeek AI 助手。我可以幫您解答 GPU 相關的問題，包括性能比較、購買建議、技術規格等。請隨時向我提問！
                </div>
            </div>
        `;
        
        scrollToBottom();
    }
}

// 顯示錯誤訊息
function showError(message) {
    const chatContainer = document.getElementById('chatContainer');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger mt-2';
    errorDiv.innerHTML = `<i class="bi bi-exclamation-triangle me-2"></i>${message}`;
    
    chatContainer.appendChild(errorDiv);
    scrollToBottom();
    
    // 3秒後自動移除錯誤訊息
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 3000);
}

// 格式化訊息內容（支持基本的 markdown）
function formatMessage(content) {
    return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

// 保存當前會話到數據庫
async function saveCurrentSession() {
    console.log(`準備保存會話：sessionId=${currentSessionId}, 歷史長度=${conversationHistory.length}`);
    
    if (!currentSessionId || conversationHistory.length === 0) {
        console.log('會話ID為空或對話歷史為空，跳過保存');
        return;
    }
    
    try {
        const sessionData = {
            sessionId: currentSessionId,
            selectedGpus: selectedGpus,
            conversationData: conversationHistory
        };
        
        console.log('發送保存請求，數據：', sessionData);
        
        const response = await fetch('/api/save-chat-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sessionData)
        });
        
        if (!response.ok) {
            console.error('保存會話失敗:', response.statusText);
        } else {
            const result = await response.json();
            console.log('會話已保存:', result);
        }
    } catch (error) {
        console.error('保存會話時發生錯誤:', error);
    }
}

// 當頁面即將卸載時保存會話
window.addEventListener('beforeunload', function() {
    if (conversationHistory.length > 0) {
        console.log('頁面即將卸載，保存會話');
        // 使用同步的 fetch 替代 sendBeacon，因為 sendBeacon 不支持 JSON headers
        try {
            const sessionData = {
                sessionId: currentSessionId,
                selectedGpus: selectedGpus,
                conversationData: conversationHistory
            };
            
            // 使用 fetch 的同步版本
            fetch('/api/save-chat-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(sessionData),
                keepalive: true
            }).catch(error => {
                console.error('頁面卸載時保存會話失敗:', error);
            });
        } catch (error) {
            console.error('頁面卸載時保存會話發生錯誤:', error);
        }
    }
});

// 導出對話內容為 Markdown 文件
function exportChat() {
    const chatContainer = document.getElementById('chatContainer');
    const messages = chatContainer.querySelectorAll('.message');
    
    if (messages.length <= 1) { // 只有初始歡迎訊息
        alert('目前沒有對話內容可以導出！');
        return;
    }
    
    let markdownContent = '# DeepSeek AI 對話記錄\n\n';
    markdownContent += `**導出時間：** ${new Date().toLocaleString('zh-TW')}\n\n`;
    
    // 如果有選擇的 GPU，添加到 markdown 中
    if (selectedGpus.length > 0) {
        markdownContent += '## 已選擇的 GPU\n\n';
        selectedGpus.forEach((gpu, index) => {
            markdownContent += `${index + 1}. ${gpu.name}\n`;
        });
        markdownContent += '\n';
    }
    
    markdownContent += '## 對話內容\n\n';
    
    let messageIndex = 0;
    messages.forEach((message, index) => {
        const isUser = message.classList.contains('user');
        const isAI = message.classList.contains('ai');
        const content = message.querySelector('.message-content');
          if (content) {
            // 優先使用原始內容（用於AI回答的Markdown格式）
            let messageText = content.getAttribute('data-original-content') || content.textContent || content.innerText;
            messageText = messageText.trim();
            
            // 跳過初始歡迎訊息
            if (index === 0 && isAI && messageText.includes('您好！我是 DeepSeek AI 助手')) {
                return;
            }
            
            messageIndex++;
            
            if (isUser) {
                markdownContent += `### 👤 用戶 ${messageIndex}\n\n`;
                markdownContent += `${messageText}\n\n`;
            } else if (isAI) {
                markdownContent += `### 🤖 AI 助手 ${messageIndex}\n\n`;
                markdownContent += `${messageText}\n\n`;
            }
            
            markdownContent += '---\n\n';
        }
    });
    
    // 移除最後的分隔線
    markdownContent = markdownContent.replace(/---\n\n$/, '');
    
    // 創建並下載文件
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `DeepSeek_對話記錄_${timestamp}.md`;
    
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 清理 URL 對象
    URL.revokeObjectURL(url);
    
    // 顯示成功訊息
    const successMessage = document.createElement('div');
    successMessage.className = 'alert alert-success position-fixed';
    successMessage.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    successMessage.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi bi-check-circle-fill me-2"></i>
            <div>
                <strong>導出成功！</strong><br>
                <small>文件已保存為：${filename}</small>
            </div>
        </div>
    `;
    
    document.body.appendChild(successMessage);
    
    // 3秒後自動移除成功訊息
    setTimeout(() => {
        if (successMessage.parentNode) {
            successMessage.parentNode.removeChild(successMessage);
        }
    }, 3000);
}
