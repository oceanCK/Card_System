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
        
        if (AppState.mode === MODE.LOCAL) {
            this.enablePullButtons();
        }
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
        
        if (DOM.modeLocalBtn) {
            DOM.modeLocalBtn.classList.toggle('active', isLocal);
        }
        if (DOM.modeServerBtn) {
            DOM.modeServerBtn.classList.toggle('active', !isLocal);
        }
        
        if (DOM.modeIndicator) {
            if (isLocal) {
                DOM.modeIndicator.textContent = '🔌 本地模式';
                DOM.modeIndicator.className = 'mode-indicator local';
            } else {
                DOM.modeIndicator.textContent = AppState.serverAvailable ? '🌐 服务端模式' : '⚠️ 服务端不可用';
                DOM.modeIndicator.className = `mode-indicator ${AppState.serverAvailable ? 'server' : 'unavailable'}`;
            }
        }
        
        if (DOM.refreshDataBtn) {
            DOM.refreshDataBtn.style.display = isLocal ? 'inline-flex' : 'none';
        }
    },

    /**
     * 显示服务端不可用提示
     */
    showServerUnavailable(message) {
        DOM.poolTabs.innerHTML = '<span class="no-data-hint">暂无卡池数据</span>';
        DOM.poolDesc.textContent = message || '服务端接口不可用';
        
        DOM.cardsGrid.innerHTML = `
            <div class="server-unavailable">
                <div class="unavailable-icon">🔌</div>
                <div class="unavailable-title">服务端接口不可用</div>
                <div class="unavailable-message">${message || '服务端接口不可用'}</div>
                <div class="unavailable-hint">请切换到本地模式使用</div>
            </div>
        `;
        
        this.disablePullButtons();
        
        DOM.featuredList.innerHTML = '<p class="empty-hint">服务端不可用</p>';
        DOM.detailsList.innerHTML = '<p class="empty-hint">服务端不可用</p>';
        
        if (DOM.modeIndicator) {
            DOM.modeIndicator.textContent = '⚠️ 服务端不可用';
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
