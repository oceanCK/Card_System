/**
 * UI更新模块 - 处理界面显示和更新
 */

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
        const displayResults = results.slice(-10);
        
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
            btn.style.opacity = loading ? '0.6' : '1';
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
        
        this.enablePullButtons();
    },

    /**
     * 启用抽卡按钮
     */
    enablePullButtons() {
        DOM.pullSingle.disabled = false;
        DOM.pullTen.disabled = false;
        DOM.pullCustom.disabled = false;
        DOM.pullSingle.style.opacity = '1';
        DOM.pullTen.style.opacity = '1';
        DOM.pullCustom.style.opacity = '1';
    },

    /**
     * 禁用抽卡按钮
     */
    disablePullButtons() {
        DOM.pullSingle.disabled = true;
        DOM.pullTen.disabled = true;
        DOM.pullCustom.disabled = true;
        DOM.pullSingle.style.opacity = '0.5';
        DOM.pullTen.style.opacity = '0.5';
        DOM.pullCustom.style.opacity = '0.5';
    },

    /**
     * 更新模式UI
     */
    updateModeUI() {
        const isLocal = AppState.mode === MODE.LOCAL;
        const isGame = AppState.mode === MODE.GAME_SERVER;
        
        if (DOM.modeLocalBtn) {
            DOM.modeLocalBtn.classList.toggle('active', isLocal);
        }
        if (DOM.modeGameBtn) {
            DOM.modeGameBtn.classList.toggle('active', isGame);
        }
        
        if (DOM.modeIndicator) {
            if (isLocal) {
                DOM.modeIndicator.textContent = '本地';
                DOM.modeIndicator.className = 'mode-indicator local';
            } else {
                DOM.modeIndicator.textContent = AppState.gameServerConnected ? '服务器' : '未连接';
                DOM.modeIndicator.className = `mode-indicator ${AppState.gameServerConnected ? 'server' : 'unavailable'}`;
            }
        }
        
        if (DOM.refreshDataBtn) {
            DOM.refreshDataBtn.style.display = isLocal ? 'inline-flex' : 'none';
        }
        
        // 登录区域仅在非本地模式下显示
        if (DOM.loginSection) {
            DOM.loginSection.style.display = isLocal ? 'none' : 'inline-flex';
        }
        
        // 服务器选择区域仅在游戏服务器模式下显示
        if (DOM.serverSelectSection) {
            DOM.serverSelectSection.style.display = isGame ? 'block' : 'none';
        }
    },

    /**
     * 渲染服务器列表
     */
    renderServerList(servers) {
        if (!DOM.serverList) return;
        if (!servers || servers.length === 0) {
            DOM.serverList.innerHTML = '<div class="server-empty">暂无可用服务器</div>';
            return;
        }
        const selectedId = AppState.selectedServer ? AppState.selectedServer.id : null;
        const connectedId = AppState.connectedServer ? AppState.connectedServer.id : null;
        let html = '';
        servers.forEach(srv => {
            const isConnected = srv.id === connectedId && srv.host === (AppState.connectedServer && AppState.connectedServer.host) && srv.port === (AppState.connectedServer && AppState.connectedServer.port);
            const isSelected = !isConnected && srv.id === selectedId;
            const cls = isConnected ? 'connected' : (isSelected ? 'selected' : '');
            html += `
                <div class="server-item ${cls}" 
                     data-server-id="${srv.id}" 
                     data-server-host="${srv.host}" 
                     data-server-port="${srv.port}">
                    <span class="server-name">${srv.name}</span>
                    <span class="server-addr">${srv.host}:${srv.port}</span>
                </div>
            `;
        });
        DOM.serverList.innerHTML = html;
    },

    /**
     * 更新服务器列表状态样式（不重新渲染，只更新 class）
     */
    updateServerListStatus() {
        if (!DOM.serverList) return;
        const connectedSrv = AppState.connectedServer;
        const selectedSrv = AppState.selectedServer;
        DOM.serverList.querySelectorAll('.server-item').forEach(el => {
            const id = el.dataset.serverId;
            const host = el.dataset.serverHost;
            const port = parseInt(el.dataset.serverPort);
            el.classList.remove('selected', 'connected');
            if (connectedSrv && id === connectedSrv.id && host === connectedSrv.host && port === connectedSrv.port) {
                el.classList.add('connected');
            } else if (selectedSrv && id === selectedSrv.id && host === selectedSrv.host && port === selectedSrv.port) {
                el.classList.add('selected');
            }
        });
    },

    /**
     * 显示游戏服务器卡池列表
     */
    showGameServerPools(pools) {
        if (!pools || pools.length === 0) {
            DOM.poolTabs.innerHTML = '<span class="no-data-hint">登录后获取卡池数据</span>';
            return;
        }
        let html = '';
        pools.forEach((pool, index) => {
            const isActive = pool.poolId == AppState.currentPoolId || 
                           (index === 0 && !AppState.currentPoolId);
            if (isActive && !AppState.currentPoolId) {
                AppState.currentPoolId = pool.poolId;
            }
            html += `
                <button class="pool-tab ${isActive ? 'active' : ''}" 
                        data-pool-id="${pool.poolId}">
                    ${pool.name || '卡池#' + pool.poolId} (已抽${pool.times}次)
                </button>
            `;
        });
        DOM.poolTabs.innerHTML = html;
    },

    /**
     * 显示服务端不可用提示
     */
    showServerUnavailable(message) {
        DOM.poolTabs.innerHTML = '<span class="no-data-hint">暂无卡池数据</span>';
        DOM.poolDesc.textContent = message || '游戏服务器未连接';
        
        DOM.cardsGrid.innerHTML = `
            <div class="server-unavailable">
                <div class="unavailable-icon">🎮</div>
                <div class="unavailable-title">游戏服务器未连接</div>
                <div class="unavailable-message">${message || '正在尝试连接服务器...'}</div>
                <div class="unavailable-hint">请检查后台服务器配置是否正确</div>
            </div>
        `;
        
        this.disablePullButtons();
        
        DOM.featuredList.innerHTML = '<p class="empty-hint">服务器未连接</p>';
        DOM.detailsList.innerHTML = '<p class="empty-hint">服务器未连接</p>';
        
        if (DOM.modeIndicator) {
            DOM.modeIndicator.textContent = '未连接';
            DOM.modeIndicator.className = 'mode-indicator unavailable';
        }
    },

    /**
     * 显示进度条
     */
    showProgress() {
        if (DOM.progressContainer) {
            DOM.progressContainer.style.display = 'block';
        }
    },

    /**
     * 隐藏进度条
     */
    hideProgress() {
        if (DOM.progressContainer) {
            DOM.progressContainer.style.display = 'none';
        }
        // 重置进度条状态
        if (DOM.progressFill) {
            DOM.progressFill.style.width = '0%';
        }
    },

    /**
     * 更新进度条
     * @param {number} current - 当前完成数量
     * @param {number} total - 总数量
     * @param {number} percent - 百分比
     */
    updateProgress(current, total, percent) {
        if (DOM.progressFill) {
            DOM.progressFill.style.width = `${percent}%`;
        }
        if (DOM.progressDetail) {
            DOM.progressDetail.textContent = `${current.toLocaleString()} / ${total.toLocaleString()}`;
        }
        if (DOM.progressPercent) {
            DOM.progressPercent.textContent = `${percent}%`;
        }
    },

    // ==================== 导出数据弹窗（带进度条） ====================

    /**
     * 显示弹窗并展示进度条（数据生成中）
     */
    showModalWithProgress() {
        DOM.exportText.value = '';
        DOM.exportText.style.display = 'none';
        DOM.copyDataBtn.style.display = 'none';
        if (DOM.exportProgressContainer) {
            DOM.exportProgressContainer.style.display = 'block';
            DOM.exportProgressFill.style.width = '0%';
            DOM.exportProgressDetail.textContent = '0 / 0';
            DOM.exportProgressPercent.textContent = '0%';
        }
        DOM.exportModal.classList.add('show');
    },

    /**
     * 更新导出数据生成进度
     */
    updateExportProgress(current, total, percent, stage) {
        if (DOM.exportProgressFill) {
            DOM.exportProgressFill.style.width = `${percent}%`;
        }
        if (DOM.exportProgressDetail) {
            const stageText = stage ? `[${stage}] ` : '';
            DOM.exportProgressDetail.textContent = `${stageText}${current.toLocaleString()} / ${total.toLocaleString()}`;
        }
        if (DOM.exportProgressPercent) {
            DOM.exportProgressPercent.textContent = `${percent}%`;
        }
    },

    /**
     * 进度完成后显示预览数据（轻量文本）
     */
    showModalData(text) {
        if (DOM.exportProgressContainer) {
            DOM.exportProgressContainer.style.display = 'none';
        }
        DOM.exportText.style.display = '';
        DOM.copyDataBtn.style.display = '';
        DOM.exportText.value = text;
    },

    /**
     * 显示下载按钮（有完整数据Blob时）
     */
    showDownloadButton(blob) {
        if (DOM.downloadDataBtn && blob) {
            DOM.downloadDataBtn.style.display = '';
            // 存储blob引用供下载使用
            DOM.downloadDataBtn._dataBlob = blob;
        }
    },

    /**
     * 隐藏下载按钮
     */
    hideDownloadButton() {
        if (DOM.downloadDataBtn) {
            DOM.downloadDataBtn.style.display = 'none';
            DOM.downloadDataBtn._dataBlob = null;
        }
    }
};
