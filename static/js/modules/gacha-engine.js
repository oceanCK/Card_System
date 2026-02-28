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
            if (!AppState.serverAvailable) {
                return this._serverUnavailableResponse('抽卡');
            }
            // 服务端模式：分批发送请求，防止超时 + 显示进度
            return await this._serverPullMultiAsync(count, onProgress);
        }
    },

    /**
     * 服务端分批抽卡（内部方法）
     * 将大量抽卡拆分为多个小请求，逐批发送并汇总
     */
    async _serverPullMultiAsync(totalCount, onProgress = null) {
        const SERVER_BATCH_SIZE = 5000;  // 每批最多5000次，避免服务端单请求过久
        const batches = Math.ceil(totalCount / SERVER_BATCH_SIZE);
        let allResults = [];
        let processed = 0;
        let lastStats = null;

        for (let i = 0; i < batches; i++) {
            const remaining = totalCount - processed;
            const batchCount = Math.min(remaining, SERVER_BATCH_SIZE);

            const result = await API.pullMulti(batchCount);
            if (!result.success) {
                return result;  // 某批失败则停止
            }

            // 只保留最后一批的结果用于展示
            allResults = result.results || [];
            lastStats = result.stats;
            processed += batchCount;

            if (onProgress) {
                const percent = Math.round((processed / totalCount) * 100);
                onProgress(processed, totalCount, percent);
            }
        }

        return {
            success: true,
            results: allResults,
            stats: lastStats,
            actual_count: totalCount,
            returned_count: allResults.length
        };
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
     * 异步获取导出数据（带进度回调，避免UI卡顿）
     * 本地模式：异步分批生成 + 进度回调
     * 服务端模式：先显示加载中，然后请求数据，大文本走Blob下载
     * @param {Function} onProgress - 进度回调 (current, total, percent, stage)
     */
    async getExportDataAsync(onProgress = null) {
        if (this.isLocalMode()) {
            return await localGachaService.getExportDataAsync(onProgress);
        } else {
            if (!AppState.serverAvailable) {
                return this._serverUnavailableResponse('导出数据');
            }
            // 显示请求中
            if (onProgress) onProgress(0, 1, 10, '请求服务端数据');
            
            const result = await API.getExportData();
            
            if (onProgress) onProgress(1, 1, 80, '处理数据');
            
            if (result.success && result.data) {
                const fullText = result.data;
                // 生成Blob用于下载（避免大文本直接塞textarea卡顿）
                const fullBlob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
                
                // 生成摘要预览：取前200行 + 后100行
                const lines = fullText.split('\n');
                let summary;
                if (lines.length > 500) {
                    const head = lines.slice(0, 200).join('\n');
                    const tail = lines.slice(-100).join('\n');
                    summary = head + '\n\n... 省略中间内容，完整数据请点击"下载完整数据" ...\n\n' + tail;
                } else {
                    summary = fullText;
                }
                
                if (onProgress) onProgress(1, 1, 100, '完成');
                
                return { success: true, summary: summary, fullBlob: fullBlob };
            }
            
            // 兼容无数据的情况
            if (result.success) {
                return { success: true, summary: result.data || '暂无数据', fullBlob: null };
            }
            return result;
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
