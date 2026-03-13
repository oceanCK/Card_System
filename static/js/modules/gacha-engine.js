/**
 * 统一抽卡引擎模块 - 封装本地/服务端模式的统一接口
 */

const GachaEngine = {
    // ==================== 游戏服务器模式 客户端统计存储 ====================
    _gsStats: { total: 0, ssr: 0, sr: 0, r: 0, featured: {} },
    _gsHistory: [],  // [{card:{card_id, name, rarity, is_featured, image_url}, pity_count}]

    _gsAccumulate(cards) {
        for (const item of cards) {
            const c = item.card;
            this._gsStats.total++;
            const r = (c.rarity || 'R').toUpperCase();
            if (r === 'SSR') {
                this._gsStats.ssr++;
                const key = c.name || c.card_id;
                this._gsStats.featured[key] = (this._gsStats.featured[key] || 0) + 1;
            } else if (r === 'SR') {
                this._gsStats.sr++;
            } else {
                this._gsStats.r++;
            }
            this._gsHistory.push(item);
        }
    },

    _gsGetStats() {
        const t = this._gsStats.total || 1;
        return {
            total_pulls: this._gsStats.total,
            ssr_count: this._gsStats.ssr,
            sr_count: this._gsStats.sr,
            r_count: this._gsStats.r,
            ssr_rate: (this._gsStats.ssr / t * 100).toFixed(2) + '%',
            sr_rate: (this._gsStats.sr / t * 100).toFixed(2) + '%',
            r_rate: (this._gsStats.r / t * 100).toFixed(2) + '%',
            featured_ssr_counts: { ...this._gsStats.featured }
        };
    },

    _gsResetStats() {
        this._gsStats = { total: 0, ssr: 0, sr: 0, r: 0, featured: {} };
        this._gsHistory = [];
    },
    /**
     * 判断当前是否为本地模式
     */
    isLocalMode() {
        return AppState.mode === MODE.LOCAL;
    },

    /**
     * 判断当前是否为游戏服务器模式
     */
    isGameServerMode() {
        return AppState.mode === MODE.GAME_SERVER;
    },

    /**
     * 检测服务端接口是否可用
     * @returns {Promise<{available: boolean, message: string}>}
     */
    async checkServerAvailable() {
        // 游戏服务器模式使用独立的状态检查
        if (this.isGameServerMode()) {
            return this.checkGameServerAvailable();
        }
        // 本地模式始终可用
        return { available: true, message: '本地模式' };
    },

    /**
     * 服务端不可用时的统一返回
     */
    _serverUnavailableResponse(action = '操作') {
        return {
            success: false,
            message: `游戏服务器未连接，无法${action}。\n请先连接游戏服务器并登录`
        };
    },

    /**
     * 设置卡池
     */
    async setPool(poolId, autoReset = true) {
        if (this.isLocalMode()) {
            return localGachaService.setCurrentPool(poolId, autoReset);
        } else {
            // 游戏服务器模式不支持切换卡池，卡池由服务器管理
            AppState.currentPoolId = poolId;
            return { success: true, pool: { description: `游戏服务器卡池 #${poolId}` } };
        }
    },

    /**
     * 单抽
     */
    async pullSingle() {
        if (this.isLocalMode()) {
            return localGachaService.pullSingle();
        } else {
            if (!AppState.gameServerConnected) {
                return this._serverUnavailableResponse('抽卡');
            }
            return await this._gameServerPullSingle();
        }
    },

    /**
     * 多抽
     */
    async pullMulti(count) {
        if (this.isLocalMode()) {
            return localGachaService.pullMulti(count);
        } else {
            if (!AppState.gameServerConnected) {
                return this._serverUnavailableResponse('抽卡');
            }
            return await this._gameServerPullN(count);
        }
    },

    /**
     * 异步多抽（用于大量抽卡，带进度回调）
     * 本地模式：分批处理 + 进度回调
     * 服务端模式：分批发送请求 + 进度回调（防止长时间无响应/超时）
     * @param {number} count - 抽卡次数
     * @param {Function} onProgress - 进度回调 (current, total, percent)
     */
    async pullMultiAsync(count, onProgress = null) {
        if (this.isLocalMode()) {
            // 根据数量自适应决定批处理大小，平衡性能和UI响应
            let batchSize;
            if (count > 50000) {
                batchSize = 5000;
            } else if (count > 10000) {
                batchSize = 3000;
            } else {
                batchSize = 1500;
            }
            return await localGachaService.pullMultiAsync(count, 100, onProgress, batchSize);
        } else {
            if (!AppState.gameServerConnected) {
                return this._serverUnavailableResponse('抽卡');
            }
            return await this._gameServerPullN(count, onProgress);
        }
    },

    /**
     * 获取统计数据
     */
    async getStats() {
        if (this.isLocalMode()) {
            return localGachaService.getStatistics();
        } else {
            return { success: true, stats: this._gsGetStats() };
        }
    },

    /**
     * 获取历史记录
     */
    async getHistory(limit = 50) {
        if (this.isLocalMode()) {
            return localGachaService.getHistory(limit);
        } else {
            return { success: true, history: this._gsHistory.slice(-limit) };
        }
    },

    /**
     * 获取导出数据
     */
    async getExportData() {
        if (this.isLocalMode()) {
            return localGachaService.getExportData();
        } else {
            return this._gsExportData();
        }
    },

    /**
     * 异步获取导出数据（带进度回调，避免UI卡顿）
     * 本地模式：异步分批生成 + 进度回调
     * 服务端模式：先显示加载中，然后请求数据，大文本走Blob下载
     * @param {Function} onProgress - 进度回调 (current, total, percent, stage)
     */
    async getExportDataAsync(onProgress = null) {
        if (this.isLocalMode()) {
            return await localGachaService.getExportDataAsync(onProgress);
        } else {
            return this._gsExportData();
        }
    },

    /**
     * 重置
     */
    async reset() {
        if (this.isLocalMode()) {
            return localGachaService.reset();
        } else {
            this._gsResetStats();
            return { success: true, message: '服务器模式统计已重置' };
        }
    },

    /**
     * 刷新数据（仅本地模式）
     */
    async refreshData() {
        if (this.isLocalMode()) {
            return await localGachaService.refreshData();
        }
        return { success: false, message: '游戏服务器模式无需手动刷新' };
    },

    /**
     * 获取所有卡池
     */
    getAllPools() {
        if (this.isLocalMode()) {
            return localGachaService.getAllPools();
        }
        return [];
    },

    /**
     * 获取当前卡池
     */
    getCurrentPool() {
        if (this.isLocalMode()) {
            return localGachaService.getCurrentPool();
        }
        return null;
    },

    // ==================== 游戏服务器模式专用方法 ====================

    /**
     * 检测游戏服务器连接状态
     */
    async checkGameServerAvailable() {
        try {
            const result = await API.gameStatus();
            AppState.gameServerConnected = result.connected || false;
            if (result.connected) {
                return {
                    available: true,
                    logged_in: result.logged_in || false,
                    username: result.username || null,
                    message: '游戏服务器已连接'
                };
            } else {
                return { available: false, message: '游戏服务器未连接' };
            }
        } catch (e) {
            AppState.gameServerConnected = false;
            return { available: false, message: '无法检测游戏服务器状态' };
        }
    },

    /**
     * 一键连接+登录游戏服务器（可选传入账号密码和服务器地址）
     */
    async autoConnectGameServer(username, password) {
        try {
            const srv = AppState.selectedServer;
            const result = await API.gameAutoConnect(
                username, password,
                srv ? srv.host : undefined,
                srv ? srv.port : undefined
            );
            AppState.gameServerConnected = result.success && result.connected;
            return result;
        } catch (e) {
            AppState.gameServerConnected = false;
            return { success: false, message: '连接失败: ' + e.message };
        }
    },

    /**
     * 断开游戏服务器
     */
    async disconnectGameServer() {
        try {
            const result = await API.gameDisconnect();
            AppState.gameServerConnected = false;
            AppState.connectedServer = null;
            return result;
        } catch (e) {
            return { success: false, message: '断开失败: ' + e.message };
        }
    },

    /**
     * 游戏服务器获取卡池列表
     */
    async getGameServerPools() {
        try {
            const result = await API.gameGetPools();
            return result;
        } catch (e) {
            return { success: false, message: '获取卡池失败: ' + e.message };
        }
    },

    // 游戏服务器错误码映射
    _errorCodeMap: {
        24: '抽卡货币不足',
        31: '背包物品不足',
        33: '钻石不足',
        38: '卡池已关闭'
    },

    _errorMessage(code) {
        return this._errorCodeMap[code] || `未知错误 (${code})`;
    },

    /**
     * 更新卡池 tab 上的已抽次数
     */
    _updatePoolTabTimes(pool) {
        if (!pool || !pool.poolId) return;
        const tab = document.querySelector(`.pool-tab[data-pool-id="${pool.poolId}"]`);
        if (tab) {
            tab.textContent = `卡池#${pool.poolId} (已抽${pool.times || 0}次)`;
        }
    },

    /**
     * 游戏服务器单抽 - 转换为platform格式
     */
    async _gameServerPullSingle() {
        const poolId = AppState.currentPoolId || 1;
        try {
            const result = await API.gamePullSingle(parseInt(poolId));
            if (!result.success) {
                return { success: false, message: `抽卡失败: ${this._errorMessage(result.error_code)}` };
            }
            // 更新卡池 tab 已抽次数
            if (result.pool) this._updatePoolTabTimes(result.pool);
            // 转换为平台标准格式（服务器已返回 name / rarity）
            const cards = (result.cards || []).map(c => ({
                card: {
                    card_id: String(c.cardId),
                    name: c.name || `卡牌#${c.cardId}`,
                    rarity: c.rarity || 'R',
                    is_featured: c.isNew || false,
                    image_url: ''
                },
                pity_count: 0
            }));
            this._gsAccumulate(cards);
            return {
                success: true,
                result: cards[0] || { card: { card_id: '0', name: '未知', rarity: 'R' } },
                results: cards,
                stats: this._gsGetStats()
            };
        } catch (e) {
            return { success: false, message: '单抽请求失败: ' + e.message };
        }
    },

    /**
     * 游戏服务器抽N次（分解为多次十连 + 单抽）
     */
    async _gameServerPullN(count, onProgress = null) {
        const tenPulls = Math.floor(count / 10);
        const singlePulls = count % 10;
        const allCards = [];
        let done = 0;

        for (let i = 0; i < tenPulls; i++) {
            const r = await this._gameServerPullMulti();
            if (!r.success) return r;
            allCards.push(...(r.results || []));
            done += 10;
            if (onProgress) onProgress(done, count, Math.round(done / count * 100));
        }
        for (let i = 0; i < singlePulls; i++) {
            const r = await this._gameServerPullSingle();
            if (!r.success) return r;
            allCards.push(...(r.results || []));
            done += 1;
            if (onProgress) onProgress(done, count, Math.round(done / count * 100));
        }
        return {
            success: true,
            results: allCards,
            stats: this._gsGetStats()
        };
    },

    /**
     * 游戏服务器十连抽 - 转换为platform格式
     */
    async _gameServerPullMulti() {
        const poolId = AppState.currentPoolId || 1;
        try {
            const result = await API.gamePullMulti(parseInt(poolId));
            if (!result.success) {
                return { success: false, message: `抽卡失败: ${this._errorMessage(result.error_code)}` };
            }
            // 更新卡池 tab 已抽次数
            if (result.pool) this._updatePoolTabTimes(result.pool);
            const cards = (result.cards || []).map(c => ({
                card: {
                    card_id: String(c.cardId),
                    name: c.name || `卡牌#${c.cardId}`,
                    rarity: c.rarity || 'R',
                    is_featured: c.isNew || false,
                    image_url: ''
                },
                pity_count: 0
            }));
            this._gsAccumulate(cards);
            return {
                success: true,
                results: cards,
                stats: this._gsGetStats()
            };
        } catch (e) {
            return { success: false, message: '十连抽请求失败: ' + e.message };
        }
    },

    /**
     * 游戏服务器模式导出数据
     */
    _gsExportData() {
        if (this._gsHistory.length === 0) {
            return { success: false, message: '暂无抽卡记录可导出' };
        }
        const stats = this._gsGetStats();
        let text = `=== 游戏服务器抽卡记录 ===\n`;
        text += `总抽数: ${stats.total_pulls}\n`;
        text += `SSR: ${stats.ssr_count} (${stats.ssr_rate})  SR: ${stats.sr_count} (${stats.sr_rate})  R: ${stats.r_count} (${stats.r_rate})\n\n`;
        if (Object.keys(stats.featured_ssr_counts).length > 0) {
            text += `--- SSR 获取统计 ---\n`;
            for (const [name, count] of Object.entries(stats.featured_ssr_counts)) {
                text += `  ${name}: ${count}张\n`;
            }
            text += `\n`;
        }
        text += `--- 抽卡明细 (最近${this._gsHistory.length}条) ---\n`;
        this._gsHistory.forEach((item, i) => {
            const c = item.card;
            text += `${i + 1}. [${c.rarity}] ${c.name} (ID:${c.card_id})\n`;
        });
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        return { success: true, summary: text, fullBlob: blob };
    }
};
