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
        
        // 先清空 HTML 模板预渲染的本地卡池 tabs
        DOM.poolTabs.innerHTML = '<span class="no-data-hint">正在连接游戏服务器...</span>';
        DOM.poolDesc.textContent = '正在连接...';
        
        // 读取登录输入框中的账号密码
        const loginUser = DOM.loginUsername ? DOM.loginUsername.value.trim() : '';
        const loginPass = DOM.loginPassword ? DOM.loginPassword.value : '';
        
        // 先检查是否已连接
        const checkResult = await GachaEngine.checkGameServerAvailable();
        
        if (!checkResult.available) {
            // 未连接，自动连接
            console.log('[Init] 正在自动连接游戏服务器...');
            const connectResult = await GachaEngine.autoConnectGameServer(loginUser, loginPass);
            
            if (!connectResult.success) {
                console.warn('[Init] 游戏服务器连接失败:', connectResult.message);
                UI.showServerUnavailable(connectResult.message);
                return false;
            }
            
            if (connectResult.logged_in) {
                console.log('[Init] 登录成功:', connectResult.message);
            } else {
                console.warn('[Init] 登录未完成:', connectResult.message);
            }
        } else {
            console.log('[Init] 游戏服务器已连接');
            // 刷新后恢复：回填用户名、恢复登录态 UI
            if (checkResult.logged_in && checkResult.username) {
                if (DOM.loginUsername) DOM.loginUsername.value = checkResult.username;
            } else {
                const savedUser = sessionStorage.getItem('gacha_login_username');
                if (savedUser && DOM.loginUsername) DOM.loginUsername.value = savedUser;
            }
        }
        
        AppState.gameServerConnected = true;
        if (!AppState.connectedServer && AppState.selectedServer) {
            AppState.connectedServer = { ...AppState.selectedServer };
        }
        UI.updateModeUI();
        UI.updateServerListStatus();
        
        try {
            const poolsResult = await GachaEngine.getGameServerPools();
            if (poolsResult.success && poolsResult.pools) {
                UI.showGameServerPools(poolsResult.pools);
                UI.enablePullButtons();
                DOM.poolDesc.textContent = '已连接到游戏服务器, 可以开始抽卡';
            } else {
                DOM.poolTabs.innerHTML = '<span class="no-data-hint">获取卡池失败</span>';
                DOM.poolDesc.textContent = poolsResult.message || '获取卡池失败';
            }
        } catch (e) {
            console.warn('[Init] 获取游戏卡池失败:', e);
            DOM.poolTabs.innerHTML = '<span class="no-data-hint">获取卡池失败</span>';
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

// ==================== 登录按钮处理 ====================
async function handleLoginClick() {
    const username = DOM.loginUsername ? DOM.loginUsername.value.trim() : '';
    const password = DOM.loginPassword ? DOM.loginPassword.value : '';
    
    if (!username) {
        alert('请输入账号');
        return;
    }
    
    // 切换到游戏服务器模式（如果尚未切换）
    if (AppState.mode !== MODE.GAME_SERVER) {
        AppState.mode = MODE.GAME_SERVER;
        localStorage.setItem('gachaMode', MODE.GAME_SERVER);
        UI.updateModeUI();
    }
    
    // 先断开旧连接
    if (AppState.gameServerConnected) {
        await GachaEngine.disconnectGameServer();
        AppState.connectedServer = null;
        UI.updateServerListStatus();
    }
    
    // 重置客户端统计
    GachaEngine._gsResetStats();
    
    // 显示连接中状态
    DOM.poolTabs.innerHTML = '<span class="no-data-hint">正在连接游戏服务器...</span>';
    DOM.poolDesc.textContent = '正在连接...';
    UI.disablePullButtons();
    if (DOM.loginBtn) {
        DOM.loginBtn.disabled = true;
        DOM.loginBtn.textContent = '连接中...';
    }
    
    // 清除之前的登录错误提示
    if (DOM.loginError) { DOM.loginError.style.display = 'none'; DOM.loginError.textContent = ''; }

    try {
        const connectResult = await GachaEngine.autoConnectGameServer(username, password);
        
        if (!connectResult.success) {
            const errorType = connectResult.error_type || '';
            if (['account_not_found', 'wrong_password', 'login_failed'].includes(errorType)) {
                // 账号密码相关错误：在登录框旁边提示，不显示大面积"服务器未连接"
                if (DOM.loginError) {
                    DOM.loginError.textContent = connectResult.message;
                    DOM.loginError.style.display = 'inline';
                }
                DOM.poolTabs.innerHTML = '';
                DOM.poolDesc.textContent = '';
            } else {
                // 连接/超时等问题：显示服务器不可用
                UI.showServerUnavailable(connectResult.message);
            }
            return;
        }
        
        AppState.gameServerConnected = true;
        AppState.connectedServer = AppState.selectedServer ? { ...AppState.selectedServer } : null;
        UI.updateModeUI();
        UI.updateServerListStatus();
        
        // 获取卡池
        const poolsResult = await GachaEngine.getGameServerPools();
        if (poolsResult.success && poolsResult.pools) {
            UI.showGameServerPools(poolsResult.pools);
            UI.enablePullButtons();
            UI.resetUI();
            DOM.poolDesc.textContent = `已登录 (${username}), 可以开始抽卡`;
            
            // 保存用户名到 sessionStorage，刷新后可恢复
            sessionStorage.setItem('gacha_login_username', username);
            
            // 设置第一个卡池为当前卡池
            const firstTab = document.querySelector('.pool-tab');
            if (firstTab) {
                firstTab.classList.add('active');
                AppState.currentPoolId = firstTab.dataset.poolId;
            }
        } else {
            DOM.poolTabs.innerHTML = '<span class="no-data-hint">获取卡池失败</span>';
            DOM.poolDesc.textContent = poolsResult.message || '获取卡池失败';
        }
    } catch (e) {
        console.error('[Login] 连接失败:', e);
        UI.showServerUnavailable('连接失败: ' + e.message);
    } finally {
        if (DOM.loginBtn) {
            DOM.loginBtn.disabled = false;
            DOM.loginBtn.textContent = '登录';
        }
    }
}

// ==================== 加载服务器列表 ====================
async function loadServerList() {
    try {
        const result = await API.gameGetServers();
        if (result.success && result.servers) {
            UI.renderServerList(result.servers);
        }
    } catch (e) {
        console.warn('[Init] 加载服务器列表失败:', e);
    }
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

    // 绑定登录按钮事件
    if (DOM.loginBtn) {
        DOM.loginBtn.addEventListener('click', handleLoginClick);
    }
    // 密码框回车触发登录
    if (DOM.loginPassword) {
        DOM.loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLoginClick();
        });
    }

    // 服务器列表点击事件
    if (DOM.serverList) {
        DOM.serverList.addEventListener('click', (e) => {
            const item = e.target.closest('.server-item');
            if (!item) return;
            AppState.selectedServer = {
                id: item.dataset.serverId,
                name: item.querySelector('.server-name').textContent,
                host: item.dataset.serverHost,
                port: parseInt(item.dataset.serverPort)
            };
            // 更新选中/连接状态样式
            UI.updateServerListStatus();
        });
    }

    // 加载服务器列表
    loadServerList();

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
