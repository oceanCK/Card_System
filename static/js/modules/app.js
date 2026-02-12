/**
 * app.js - 应用主入口
 * 初始化逻辑和事件绑定
 */

// ==================== 抽卡引擎初始化 ====================
async function initGachaEngine() {
    if (GachaEngine.isLocalMode()) {
        // 本地模式：加载卡池数据
        console.log('[Init] 正在初始化本地模式...');
        const loaded = await localGachaService.loadPoolsData();
        if (!loaded) {
            console.error('[Init] 本地数据加载失败，尝试切换到服务端模式');
            alert('本地数据加载失败，请检查 data/cards.json 文件是否存在');
            return false;
        }
        AppState.localServiceReady = true;
        
        // 刷新卡池标签
        await refreshPoolTabs();
        
        // 确保本地模式下抽卡按钮可用
        UI.enablePullButtons();
    } else {
        // 服务端模式：检测接口可用性
        console.log('[Init] 正在初始化服务端模式...');
        const checkResult = await GachaEngine.checkServerAvailable();
        
        if (!checkResult.available) {
            console.warn('[Init] 服务端接口不可用:', checkResult.message);
            // 显示服务端不可用的提示界面
            UI.showServerUnavailable(checkResult.message);
            return false;
        }
    }
    
    // 初始化卡池选择
    const activeTab = document.querySelector('.pool-tab.active');
    if (activeTab) {
        AppState.currentPoolId = activeTab.dataset.poolId;
        try {
            const result = await GachaEngine.setPool(AppState.currentPoolId, false);
            if (!result.success) {
                console.warn('[Init] 设置卡池失败:', result.message);
                return false;
            }
            const statsResult = await GachaEngine.getStats();
            if (statsResult.success) {
                UI.updateStats(statsResult.stats);
            }
            const historyResult = await GachaEngine.getHistory(50);
            if (historyResult.success && historyResult.history.length > 0) {
                UI.updateDetails(historyResult.history);
            }
        } catch (error) {
            console.error('初始化卡池失败:', error);
        }
    } else {
        const firstTab = document.querySelector('.pool-tab');
        if (firstTab) {
            firstTab.classList.add('active');
            AppState.currentPoolId = firstTab.dataset.poolId;
            try {
                const result = await GachaEngine.setPool(AppState.currentPoolId, false);
                if (result.success) {
                    DOM.poolDesc.textContent = result.pool.description;
                }
            } catch (error) {
                console.error('初始化卡池失败:', error);
            }
        }
    }
    
    return true;
}

// ==================== 刷新卡池标签 ====================
async function refreshPoolTabs() {
    if (!GachaEngine.isLocalMode()) return;
    
    const pools = GachaEngine.getAllPools();
    if (pools.length === 0) return;
    
    // 更新卡池标签
    let html = '';
    pools.forEach((pool, index) => {
        const isActive = pool.pool_id === AppState.currentPoolId || 
                        (index === 0 && !AppState.currentPoolId);
        html += `
            <button class="pool-tab ${isActive ? 'active' : ''}" 
                    data-pool-id="${pool.pool_id}">
                ${pool.name}
            </button>
        `;
    });
    DOM.poolTabs.innerHTML = html;
    
    // 更新描述
    const currentPool = GachaEngine.getCurrentPool();
    if (currentPool) {
        DOM.poolDesc.textContent = currentPool.description;
    }
}

// ==================== 初始化 ====================
async function init() {
    // 初始化DOM引用
    DOM.init();
    
    // 初始化模式UI
    UI.updateModeUI();
    
    // 绑定模式切换事件
    if (DOM.modeLocalBtn) {
        DOM.modeLocalBtn.addEventListener('click', () => EventHandlers.handleModeSwitch(MODE.LOCAL));
    }
    if (DOM.modeServerBtn) {
        DOM.modeServerBtn.addEventListener('click', () => EventHandlers.handleModeSwitch(MODE.SERVER));
    }
    if (DOM.refreshDataBtn) {
        DOM.refreshDataBtn.addEventListener('click', EventHandlers.handleRefreshData);
    }

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
    
    // 初始化抽卡引擎
    await initGachaEngine();
    
    console.log(`抽卡概率工具已初始化 [${AppState.mode === MODE.LOCAL ? '本地模式' : '服务端模式'}]`);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
