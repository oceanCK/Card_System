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
        // 根据模式决定最大抽卡次数
        const maxAllowed = PULL_LIMITS.LOCAL;
        if (count < 1 || count > maxAllowed) {
            alert(`请输入1-${maxAllowed}之间的数字`);
            return;
        }
        
        UI.setLoading(true);
        
        // 大量抽卡时使用异步方法并显示进度条（本地和服务端通用）
        const ASYNC_THRESHOLD = 500;
        const useAsync = count >= ASYNC_THRESHOLD;
        
        try {
            let result;
            
            if (useAsync) {
                // 显示进度条
                UI.showProgress();
                UI.updateProgress(0, count, 0);
                
                // 使用异步分批抽卡（本地/服务端均支持）
                result = await GachaEngine.pullMultiAsync(count, (current, total, percent) => {
                    UI.updateProgress(current, total, percent);
                });
                
                // 隐藏进度条
                UI.hideProgress();
            } else {
                // 小量抽卡使用同步方法
                result = await GachaEngine.pullMulti(count);
            }
            
            if (result.success) {
                // 显示本次抽卡结果
                UI.showCards(result.results);
                
                // 服务端 pullMulti 已返回 stats，直接使用；本地模式则单独获取
                if (result.stats) {
                    UI.updateStats(result.stats);
                } else {
                    const statsResult = await GachaEngine.getStats();
                    if (statsResult.success) {
                        UI.updateStats(statsResult.stats);
                    }
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
            UI.hideProgress();
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
     * 导出数据（异步加载+进度条+下载，本地/服务端统一）
     */
    async handleExport() {
        try {
            // 先显示弹窗和进度条
            UI.showModalWithProgress();
            UI.hideDownloadButton();

            const result = await GachaEngine.getExportDataAsync((current, total, percent, stage) => {
                UI.updateExportProgress(current, total, percent, stage);
            });

            if (result.success) {
                // 只将轻量摘要放入textarea，不卡顿
                UI.showModalData(result.summary);
                // 如果有完整数据Blob，显示下载按钮
                if (result.fullBlob) {
                    UI.showDownloadButton(result.fullBlob);
                }
            } else {
                UI.hideModal();
                alert(result.message || '导出失败');
            }
        } catch (error) {
            console.error('导出失败:', error);
            UI.hideModal();
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
            alert('服务器模式无需手动刷新数据');
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
