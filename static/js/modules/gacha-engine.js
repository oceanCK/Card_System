/**
 * 统一抽卡引擎模块 - 封装本地/服务端模式的统一接口
 */

const GachaEngine = {
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
            return await this._gameServerPullMulti();
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
            // 游戏服务器模式直接调用十连抽
            return await this._gameServerPullMulti();
        }
    },

    /**
     * 获取统计数据
     */
    async getStats() {
        if (this.isLocalMode()) {
            return localGachaService.getStatistics();
        } else {
            return { success: true, stats: this._gameServerEmptyStats() };
        }
    },

    /**
     * 获取历史记录
     */
    async getHistory(limit = 50) {
        if (this.isLocalMode()) {
            return localGachaService.getHistory(limit);
        } else {
            return { success: true, history: [] };
        }
    },

    /**
     * 获取导出数据
     */
    async getExportData() {
        if (this.isLocalMode()) {
            return localGachaService.getExportData();
        } else {
            return { success: false, message: '游戏服务器模式暂不支持导出数据' };
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
            return { success: false, message: '游戏服务器模式暂不支持导出数据' };
        }
    },

    /**
     * 重置
     */
    async reset() {
        if (this.isLocalMode()) {
            return localGachaService.reset();
        } else {
            return { success: true, message: '游戏服务器模式无本地数据需要重置' };
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
                return { available: true, message: '游戏服务器已连接' };
            } else {
                return { available: false, message: '游戏服务器未连接' };
            }
        } catch (e) {
            AppState.gameServerConnected = false;
            return { available: false, message: '无法检测游戏服务器状态' };
        }
    },

    /**
     * 一键连接+登录游戏服务器（使用后台配置）
     */
    async autoConnectGameServer() {
        try {
            const result = await API.gameAutoConnect();
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

    /**
     * 游戏服务器单抽 - 转换为platform格式
     */
    async _gameServerPullSingle() {
        const poolId = AppState.currentPoolId || 1;
        try {
            const result = await API.gamePullSingle(parseInt(poolId));
            if (!result.success) {
                return { success: false, message: `抽卡失败 (错误码: ${result.error_code})` };
            }
            // 转换为平台标准格式
            const cards = (result.cards || []).map(c => ({
                card: {
                    card_id: String(c.cardId),
                    name: `卡牌#${c.cardId}`,
                    rarity: 'SSR',  // 游戏服务器暂无rarity字段, 默认显示
                    is_featured: c.isNew || false,
                    image_url: ''
                },
                pity_count: 0
            }));
            return {
                success: true,
                result: cards[0] || { card: { card_id: '0', name: '未知', rarity: 'R' } },
                results: cards,
                stats: this._gameServerEmptyStats()
            };
        } catch (e) {
            return { success: false, message: '单抽请求失败: ' + e.message };
        }
    },

    /**
     * 游戏服务器十连抽 - 转换为platform格式
     */
    async _gameServerPullMulti() {
        const poolId = AppState.currentPoolId || 1;
        try {
            const result = await API.gamePullMulti(parseInt(poolId));
            if (!result.success) {
                return { success: false, message: `抽卡失败 (错误码: ${result.error_code})` };
            }
            const cards = (result.cards || []).map(c => ({
                card: {
                    card_id: String(c.cardId),
                    name: `卡牌#${c.cardId}`,
                    rarity: 'SSR',
                    is_featured: c.isNew || false,
                    image_url: ''
                },
                pity_count: 0
            }));
            return {
                success: true,
                results: cards,
                stats: this._gameServerEmptyStats()
            };
        } catch (e) {
            return { success: false, message: '十连抽请求失败: ' + e.message };
        }
    },

    /**
     * 游戏服务器模式的空统计数据(服务器不返回统计, 前端不积累)
     */
    _gameServerEmptyStats() {
        return {
            total_pulls: 0,
            ssr_count: 0,
            sr_count: 0,
            r_count: 0,
            ssr_rate: '0.00%',
            sr_rate: '0.00%',
            r_rate: '0.00%',
            featured_ssr_counts: {}
        };
    }
};
