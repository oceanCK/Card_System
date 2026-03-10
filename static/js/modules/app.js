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
        // 游戏服务器模式：自动连接+登录
        console.log('[Init] 正在初始化游戏服务器模式...');
        
        // 先检查是否已连接
        const checkResult = await GachaEngine.checkGameServerAvailable();
        
        if (!checkResult.available) {
            // 未连接，自动连接
            console.log('[Init] 正在自动连接游戏服务器...');
            const connectResult = await GachaEngine.autoConnectGameServer();
            
            if (!connectResult.success) {
                console.warn('[Init] 游戏服务器连接失败:', connectResult.message);
                UI.showServerUnavailable(connectResult.message);
                return false;
            }
        }
        
        AppState.gameServerConnected = true;
        UI.updateModeUI();
        
        // 连接成功, 延迟获取卡池（等服务器回调）
        await new Promise(r => setTimeout(r, 1500));
        
        try {
            const poolsResult = await GachaEngine.getGameServerPools();
            if (poolsResult.success && poolsResult.pools) {
                UI.showGameServerPools(poolsResult.pools);
                UI.enablePullButtons();
                DOM.poolDesc.textContent = '已连接到游戏服务器, 可以开始抽卡';
            }
        } catch (e) {
            console.warn('[Init] 获取游戏卡池失败:', e);
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
    if (DOM.modeGameBtn) {
        DOM.modeGameBtn.addEventListener('click', () => EventHandlers.handleModeSwitch(MODE.GAME_SERVER));
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
    DOM.closeModal.addEventListener('click', () => {
        UI.hideModal();
        UI.hideDownloadButton();
    });
    DOM.copyDataBtn.addEventListener('click', EventHandlers.handleCopyData);
    
    // 绑定下载完整数据按钮
    if (DOM.downloadDataBtn) {
        DOM.downloadDataBtn.addEventListener('click', () => {
            const blob = DOM.downloadDataBtn._dataBlob;
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `抽卡数据_${new Date().toISOString().slice(0,10)}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
    
    // 点击弹窗外部关闭
    DOM.exportModal.addEventListener('click', (e) => {
        if (e.target === DOM.exportModal) {
            UI.hideModal();
            UI.hideDownloadButton();
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
    
    console.log(`抽卡概率工具已初始化 [${AppState.mode === MODE.LOCAL ? '本地模式' : '游戏服务器模式'}]`);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
