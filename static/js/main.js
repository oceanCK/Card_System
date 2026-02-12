/**
 * 抽卡概率工具 - 前端交互逻辑
 * 模块化JavaScript结构
 */

// ==================== 全局状态管理 ====================
const AppState = {
    currentPoolId: null,
    isLoading: false,
    lastResults: []
};

// ==================== DOM 元素引用 ====================
const DOM = {
    // 卡池相关
    poolTabs: document.getElementById('poolTabs'),
    poolDesc: document.getElementById('poolDesc'),
    
    // 抽卡按钮
    pullSingle: document.getElementById('pullSingle'),
    pullTen: document.getElementById('pullTen'),
    pullCustom: document.getElementById('pullCustom'),
    customCount: document.getElementById('customCount'),
    resetBtn: document.getElementById('resetBtn'),
    
    // 统计显示
    totalPulls: document.getElementById('totalPulls'),
    ssrCount: document.getElementById('ssrCount'),
    srCount: document.getElementById('srCount'),
    rCount: document.getElementById('rCount'),
    ssrRate: document.getElementById('ssrRate'),
    srRate: document.getElementById('srRate'),
    rRate: document.getElementById('rRate'),
    
    // 结果展示
    cardsGrid: document.getElementById('cardsGrid'),
    featuredList: document.getElementById('featuredList'),
    detailsList: document.getElementById('detailsList'),
    
    // 弹窗相关
    exportDataBtn: document.getElementById('exportDataBtn'),
    exportModal: document.getElementById('exportModal'),
    closeModal: document.getElementById('closeModal'),
    exportText: document.getElementById('exportText'),
    copyDataBtn: document.getElementById('copyDataBtn')
};

// ==================== API 请求模块 ====================
const API = {
    /**
     * 发送GET请求
     */
    async get(url) {
        try {
            const response = await fetch(url, {
                credentials: 'same-origin'  // 确保发送cookie以保持会话
            });
            return await response.json();
        } catch (error) {
            console.error('API GET Error:', error);
            throw error;
        }
    },
    
    /**
     * 发送POST请求
     */
    async post(url, data = {}) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',  // 确保发送cookie以保持会话
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('API POST Error:', error);
            throw error;
        }
    },
    
    // API端点方法
    setPool: (poolId, autoReset = true) => API.post(`/api/pools/${poolId}`, { auto_reset: autoReset }),
    pullSingle: () => API.post('/api/pull/single'),
    pullMulti: (count) => API.post('/api/pull/multi', { count }),
    getStats: () => API.get('/api/stats'),
    getHistory: (limit = 50) => API.get(`/api/history?limit=${limit}`),
    getExportData: () => API.get('/api/export'),
    reset: () => API.post('/api/reset')
};

// ==================== UI 更新模块 ====================
const UI = {
    /**
     * 更新统计数据显示
     */
    updateStats(stats) {
        DOM.totalPulls.textContent = stats.total_pulls;
        DOM.ssrCount.textContent = stats.ssr_count;
        DOM.srCount.textContent = stats.sr_count;
        DOM.rCount.textContent = stats.r_count;
        DOM.ssrRate.textContent = stats.ssr_rate;
        DOM.srRate.textContent = stats.sr_rate;
        DOM.rRate.textContent = stats.r_rate;
        
        // 更新特定SSR统计
        this.updateFeaturedSSR(stats.featured_ssr_counts);
    },
    
    /**
     * 更新特定SSR获取统计
     */
    updateFeaturedSSR(counts) {
        if (!counts || Object.keys(counts).length === 0) {
            DOM.featuredList.innerHTML = '<p class="empty-hint">暂无数据</p>';
            return;
        }
        
        let html = '';
        for (const [id, count] of Object.entries(counts)) {
            html += `
                <div class="featured-item">
                    <span class="featured-name">${id}</span>
                    <span class="featured-count">${count} 张</span>
                </div>
            `;
        }
        DOM.featuredList.innerHTML = html;
    },
    
    /**
     * 显示抽卡结果卡片
     */
    showCards(results) {
        // 最多显示10张
        const displayResults = results.slice(-10);
        
        // 根据卡片数量调整样式
        if (displayResults.length === 1) {
            DOM.cardsGrid.classList.add('single-card');
        } else {
            DOM.cardsGrid.classList.remove('single-card');
        }
        
        let html = '';
        displayResults.forEach(result => {
            const card = result.card;
            const rarityClass = card.rarity.toLowerCase();
            const imageUrl = card.image_url || `/static/images/cards/${card.card_id}.png`;
            html += `
                <div class="card-item ${rarityClass}">
                    <img class="card-image" src="${imageUrl}" alt="${card.name}" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="card-placeholder" style="display:none;">
                        <span class="card-rarity">${card.rarity}</span>
                        <span class="card-name">${card.name}</span>
                    </div>
                    <div class="card-info">
                        <span class="card-rarity">${card.rarity}</span>
                        <span class="card-name">${card.name}</span>
                    </div>
                </div>
            `;
        });
        
        DOM.cardsGrid.innerHTML = html || '<p class="empty-hint">点击抽卡按钮开始</p>';
    },
    
    /**
     * 更新抽卡详情列表
     */
    updateDetails(results) {
        if (!results || results.length === 0) {
            DOM.detailsList.innerHTML = '<p class="empty-hint">暂无抽卡记录</p>';
            return;
        }
        
        // 显示最近的记录，新的在上面
        const displayResults = [...results].reverse().slice(0, 50);
        
        let html = '';
        displayResults.forEach(result => {
            const card = result.card;
            const rarityClass = card.rarity.toLowerCase();
            html += `
                <div class="detail-item">
                    <span class="detail-rarity ${rarityClass}">${card.rarity}</span>
                    <span class="detail-id">${card.card_id}</span>
                    <span class="detail-name">${card.name}</span>
                </div>
            `;
        });
        
        DOM.detailsList.innerHTML = html;
    },
    
    /**
     * 设置加载状态
     */
    setLoading(loading) {
        AppState.isLoading = loading;
        const buttons = [DOM.pullSingle, DOM.pullTen, DOM.pullCustom];
        buttons.forEach(btn => {
            btn.disabled = loading;
            if (loading) {
                btn.style.opacity = '0.6';
            } else {
                btn.style.opacity = '1';
            }
        });
    },
    
    /**
     * 显示弹窗
     */
    showModal(text) {
        DOM.exportText.value = text;
        DOM.exportModal.classList.add('show');
    },
    
    /**
     * 隐藏弹窗
     */
    hideModal() {
        DOM.exportModal.classList.remove('show');
    },
    
    /**
     * 重置UI显示
     */
    resetUI() {
        DOM.totalPulls.textContent = '0';
        DOM.ssrCount.textContent = '0';
        DOM.srCount.textContent = '0';
        DOM.rCount.textContent = '0';
        DOM.ssrRate.textContent = '0.00%';
        DOM.srRate.textContent = '0.00%';
        DOM.rRate.textContent = '0.00%';
        DOM.cardsGrid.classList.remove('single-card');
        DOM.cardsGrid.innerHTML = '<p class="empty-hint">点击抽卡按钮开始</p>';
        DOM.featuredList.innerHTML = '<p class="empty-hint">暂无数据</p>';
        DOM.detailsList.innerHTML = '<p class="empty-hint">暂无抽卡记录</p>';
        AppState.lastResults = [];
    }
};

// ==================== 事件处理模块 ====================
const EventHandlers = {
    /**
     * 卡池切换
     */
    async handlePoolChange(e) {
        const tab = e.target.closest('.pool-tab');
        if (!tab) return;
        
        const poolId = tab.dataset.poolId;
        if (poolId === AppState.currentPoolId) return;
        
        try {
            const result = await API.setPool(poolId);
            if (result.success) {
                AppState.currentPoolId = poolId;
                
                // 更新UI
                document.querySelectorAll('.pool-tab').forEach(t => {
                    t.classList.remove('active');
                });
                tab.classList.add('active');
                
                DOM.poolDesc.textContent = result.pool.description;
                
                // 切换卡池时重置前端显示
                UI.resetUI();
                
                // 获取新卡池的统计数据
                const statsResult = await API.getStats();
                if (statsResult.success) {
                    UI.updateStats(statsResult.stats);
                }
            }
        } catch (error) {
            console.error('切换卡池失败:', error);
        }
    },
    
    /**
     * 单抽
     */
    async handlePullSingle() {
        if (AppState.isLoading) return;
        
        UI.setLoading(true);
        try {
            const result = await API.pullSingle();
            if (result.success) {
                // 显示本次抽卡结果
                UI.showCards([result.result]);
                UI.updateStats(result.stats);
                
                // 获取完整历史记录
                const historyResult = await API.getHistory(50);
                if (historyResult.success) {
                    UI.updateDetails(historyResult.history);
                }
            }
        } catch (error) {
            console.error('抽卡失败:', error);
        } finally {
            UI.setLoading(false);
        }
    },
    
    /**
     * 十连抽
     */
    async handlePullTen() {
        if (AppState.isLoading) return;
        
        UI.setLoading(true);
        try {
            const result = await API.pullMulti(10);
            if (result.success) {
                // 显示本次抽卡结果
                UI.showCards(result.results);
                UI.updateStats(result.stats);
                
                // 获取完整历史记录
                const historyResult = await API.getHistory(50);
                if (historyResult.success) {
                    UI.updateDetails(historyResult.history);
                }
            }
        } catch (error) {
            console.error('抽卡失败:', error);
        } finally {
            UI.setLoading(false);
        }
    },
    
    /**
     * 自定义抽卡
     */
    async handlePullCustom() {
        if (AppState.isLoading) return;
        
        const count = parseInt(DOM.customCount.value) || 10;
        if (count < 1 || count > 100000) {
            alert('请输入1-100000之间的数字');
            return;
        }
        
        UI.setLoading(true);
        try {
            const result = await API.pullMulti(count);
            if (result.success) {
                // 显示本次抽卡结果
                UI.showCards(result.results);
                UI.updateStats(result.stats);
                
                // 获取完整历史记录
                const historyResult = await API.getHistory(50);
                if (historyResult.success) {
                    UI.updateDetails(historyResult.history);
                }
            }
        } catch (error) {
            console.error('抽卡失败:', error);
        } finally {
            UI.setLoading(false);
        }
    },
    
    /**
     * 重置
     */
    async handleReset() {
        if (!confirm('确定要重置所有抽卡数据吗？')) return;
        
        try {
            const result = await API.reset();
            if (result.success) {
                UI.resetUI();
            }
        } catch (error) {
            console.error('重置失败:', error);
        }
    },
    
    /**
     * 导出数据
     */
    async handleExport() {
        try {
            const result = await API.getExportData();
            if (result.success) {
                UI.showModal(result.data);
            }
        } catch (error) {
            console.error('导出失败:', error);
        }
    },
    
    /**
     * 复制数据
     */
    handleCopyData() {
        DOM.exportText.select();
        document.execCommand('copy');
        
        // 显示复制成功提示
        const originalText = DOM.copyDataBtn.textContent;
        DOM.copyDataBtn.textContent = '已复制!';
        setTimeout(() => {
            DOM.copyDataBtn.textContent = originalText;
        }, 1500);
    }
};

// ==================== 初始化 ====================
async function init() {
    // 绑定卡池切换事件
    DOM.poolTabs.addEventListener('click', EventHandlers.handlePoolChange);
    
    // 绑定抽卡按钮事件
    DOM.pullSingle.addEventListener('click', EventHandlers.handlePullSingle);
    DOM.pullTen.addEventListener('click', EventHandlers.handlePullTen);
    DOM.pullCustom.addEventListener('click', EventHandlers.handlePullCustom);
    
    // 绑定重置按钮事件
    DOM.resetBtn.addEventListener('click', EventHandlers.handleReset);
    
    // 绑定导出相关事件
    DOM.exportDataBtn.addEventListener('click', EventHandlers.handleExport);
    DOM.closeModal.addEventListener('click', UI.hideModal);
    DOM.copyDataBtn.addEventListener('click', EventHandlers.handleCopyData);
    
    // 点击弹窗外部关闭
    DOM.exportModal.addEventListener('click', (e) => {
        if (e.target === DOM.exportModal) {
            UI.hideModal();
        }
    });
    
    // 回车键触发自定义抽卡
    DOM.customCount.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            EventHandlers.handlePullCustom();
        }
    });
    
    // 获取当前选中的卡池，并同步到后端（不重置数据）
    const activeTab = document.querySelector('.pool-tab.active');
    if (activeTab) {
        AppState.currentPoolId = activeTab.dataset.poolId;
        // 确保后端会话与前端一致，但不重置数据（页面刷新不应丢失统计）
        try {
            await API.setPool(AppState.currentPoolId, false);  // auto_reset=false
            // 获取当前统计数据并显示
            const statsResult = await API.getStats();
            if (statsResult.success) {
                UI.updateStats(statsResult.stats);
            }
            // 获取历史记录并显示
            const historyResult = await API.getHistory(50);
            if (historyResult.success && historyResult.history.length > 0) {
                UI.updateDetails(historyResult.history);
            }
        } catch (error) {
            console.error('初始化卡池失败:', error);
        }
    } else {
        // 如果没有active的卡池，选中第一个
        const firstTab = document.querySelector('.pool-tab');
        if (firstTab) {
            firstTab.classList.add('active');
            AppState.currentPoolId = firstTab.dataset.poolId;
            try {
                const result = await API.setPool(AppState.currentPoolId, false);  // auto_reset=false
                if (result.success) {
                    DOM.poolDesc.textContent = result.pool.description;
                }
            } catch (error) {
                console.error('初始化卡池失败:', error);
            }
        }
    }
    
    console.log('抽卡概率工具已初始化');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
