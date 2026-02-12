/**
 * event-handlers.js - 事件处理模块
 * 处理用户交互事件
 */

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
            const result = await GachaEngine.setPool(poolId);
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
                const statsResult = await GachaEngine.getStats();
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
            const result = await GachaEngine.pullSingle();
            if (result.success) {
                // 显示本次抽卡结果
                UI.showCards([result.result]);
                
                // 本地模式需要单独获取统计
                const statsResult = await GachaEngine.getStats();
                if (statsResult.success) {
                    UI.updateStats(statsResult.stats);
                }
                
                // 获取完整历史记录
                const historyResult = await GachaEngine.getHistory(50);
                if (historyResult.success) {
                    UI.updateDetails(historyResult.history);
                }
            } else {
                // 显示错误提示
                alert(result.message || '抽卡失败');
            }
        } catch (error) {
            console.error('抽卡失败:', error);
            alert('抽卡请求失败，请检查网络连接');
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
            const result = await GachaEngine.pullMulti(10);
            if (result.success) {
                // 显示本次抽卡结果
                UI.showCards(result.results);
                
                // 获取统计
                const statsResult = await GachaEngine.getStats();
                if (statsResult.success) {
                    UI.updateStats(statsResult.stats);
                }
                
                // 获取完整历史记录
                const historyResult = await GachaEngine.getHistory(50);
                if (historyResult.success) {
                    UI.updateDetails(historyResult.history);
                }
            } else {
                // 显示错误提示
                alert(result.message || '抽卡失败');
            }
        } catch (error) {
            console.error('抽卡失败:', error);
            alert('抽卡请求失败，请检查网络连接');
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
        // 根据模式决定最大抽卡次数：本地1万，服务端10万
        const maxAllowed = AppState.mode === MODE.LOCAL ? PULL_LIMITS.LOCAL : PULL_LIMITS.SERVER;
        if (count < 1 || count > maxAllowed) {
            alert(`请输入1-${maxAllowed}之间的数字`);
            return;
        }
        
        UI.setLoading(true);
        try {
            const result = await GachaEngine.pullMulti(count);
            if (result.success) {
                // 显示本次抽卡结果
                UI.showCards(result.results);
                
                // 获取统计
                const statsResult = await GachaEngine.getStats();
                if (statsResult.success) {
                    UI.updateStats(statsResult.stats);
                }
                
                // 获取完整历史记录
                const historyResult = await GachaEngine.getHistory(50);
                if (historyResult.success) {
                    UI.updateDetails(historyResult.history);
                }
            } else {
                // 显示错误提示
                alert(result.message || '抽卡失败');
            }
        } catch (error) {
            console.error('抽卡失败:', error);
            alert('抽卡请求失败，请检查网络连接');
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
            const result = await GachaEngine.reset();
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
            const result = await GachaEngine.getExportData();
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
    },

    /**
     * 模式切换
     */
    async handleModeSwitch(mode) {
        if (mode === AppState.mode) return;
        
        // 切换到服务端模式时先检测可用性
        if (mode === MODE.SERVER) {
            UI.setLoading(true);
            const checkResult = await GachaEngine.checkServerAvailable();
            UI.setLoading(false);
            
            if (!checkResult.available) {
                // 服务端不可用，显示提示但仍允许切换（显示无数据状态）
                if (!confirm(`${checkResult.message}\n\n服务端接口尚未对接，切换后将显示无数据状态。\n是否仍要切换？`)) {
                    return;
                }
            }
        }
        
        // 切换模式
        AppState.mode = mode;
        localStorage.setItem('gachaMode', mode);
        
        // 更新UI
        UI.updateModeUI();
        
        // 重置显示
        UI.resetUI();
        
        // 重新初始化
        await initGachaEngine();
    },

    /**
     * 刷新数据（本地模式）
     */
    async handleRefreshData() {
        if (!GachaEngine.isLocalMode()) {
            alert('服务端模式无需手动刷新数据');
            return;
        }

        try {
            const result = await GachaEngine.refreshData();
            if (result.success) {
                // 刷新卡池显示
                await refreshPoolTabs();
                alert('数据刷新成功！卡池信息已更新。');
            } else {
                alert('数据刷新失败：' + result.message);
            }
        } catch (error) {
            console.error('刷新数据失败:', error);
            alert('刷新数据失败，请检查控制台');
        }
    }
};
