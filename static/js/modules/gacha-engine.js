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
     * 检测服务端接口是否可用
     * @returns {Promise<{available: boolean, message: string}>}
     */
    async checkServerAvailable() {
        try {
            const response = await fetch('/api/server-status', {
                method: 'GET',
                credentials: 'same-origin',
                signal: AbortSignal.timeout(3000)
            });
            
            if (!response.ok) {
                return { available: false, message: `服务端响应异常 (${response.status})` };
            }
            
            const data = await response.json();
            
            if (data.success && data.available) {
                AppState.serverAvailable = true;
                return { available: true, message: '服务端连接正常' };
            } else {
                AppState.serverAvailable = false;
                return { 
                    available: false, 
                    message: data.message || '服务端接口不可用' 
                };
            }
        } catch (error) {
            console.warn('[Server] 服务端检测失败:', error.message);
            AppState.serverAvailable = false;
            
            if (error.name === 'TimeoutError' || error.name === 'AbortError') {
                return { available: false, message: '服务端连接超时' };
            }
            return { available: false, message: '服务端接口不可用' };
        }
    },

    /**
     * 服务端不可用时的统一返回
     */
    _serverUnavailableResponse(action = '操作') {
        return {
            success: false,
            message: `服务端接口不可用，无法${action}。\n请切换到本地模式`
        };
    },

    /**
     * 设置卡池
     */
    async setPool(poolId, autoReset = true) {
        if (this.isLocalMode()) {
            return localGachaService.setCurrentPool(poolId, autoReset);
        } else {
            if (!AppState.serverAvailable) {
                return this._serverUnavailableResponse('设置卡池');
            }
            return await API.setPool(poolId, autoReset);
        }
    },

    /**
     * 单抽
     */
    async pullSingle() {
        if (this.isLocalMode()) {
            return localGachaService.pullSingle();
        } else {
            if (!AppState.serverAvailable) {
                return this._serverUnavailableResponse('抽卡');
            }
            return await API.pullSingle();
        }
    },

    /**
     * 多抽
     */
    async pullMulti(count) {
        if (this.isLocalMode()) {
            return localGachaService.pullMulti(count);
        } else {
            if (!AppState.serverAvailable) {
                return this._serverUnavailableResponse('抽卡');
            }
            return await API.pullMulti(count);
        }
    },

    /**
     * 获取统计数据
     */
    async getStats() {
        if (this.isLocalMode()) {
            return localGachaService.getStatistics();
        } else {
            if (!AppState.serverAvailable) {
                return this._serverUnavailableResponse('获取统计');
            }
            return await API.getStats();
        }
    },

    /**
     * 获取历史记录
     */
    async getHistory(limit = 50) {
        if (this.isLocalMode()) {
            return localGachaService.getHistory(limit);
        } else {
            if (!AppState.serverAvailable) {
                return this._serverUnavailableResponse('获取历史');
            }
            return await API.getHistory(limit);
        }
    },

    /**
     * 获取导出数据
     */
    async getExportData() {
        if (this.isLocalMode()) {
            return localGachaService.getExportData();
        } else {
            if (!AppState.serverAvailable) {
                return this._serverUnavailableResponse('导出数据');
            }
            return await API.getExportData();
        }
    },

    /**
     * 重置
     */
    async reset() {
        if (this.isLocalMode()) {
            return localGachaService.reset();
        } else {
            if (!AppState.serverAvailable) {
                return this._serverUnavailableResponse('重置');
            }
            return await API.reset();
        }
    },

    /**
     * 刷新数据（仅本地模式）
     */
    async refreshData() {
        if (this.isLocalMode()) {
            return await localGachaService.refreshData();
        }
        return { success: false, message: '服务端模式无需手动刷新' };
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
    }
};
