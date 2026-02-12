/**
 * API请求模块 - 处理与服务端的通信
 */

const API = {
    /**
     * 发送GET请求
     */
    async get(url) {
        try {
            const response = await fetch(url, {
                credentials: 'same-origin'
            });
            return await response.json();
        } catch (error) {
            console.error('API GET Error:', error);
            throw error;
        }
    },
    
    /**
     * 发送POST请求
     */
    async post(url, data = {}) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('API POST Error:', error);
            throw error;
        }
    },
    
    // API端点方法
    setPool: (poolId, autoReset = true) => API.post(`/api/pools/${poolId}`, { auto_reset: autoReset }),
    pullSingle: () => API.post('/api/pull/single'),
    pullMulti: (count) => API.post('/api/pull/multi', { count }),
    getStats: () => API.get('/api/stats'),
    getHistory: (limit = 50) => API.get(`/api/history?limit=${limit}`),
    getExportData: () => API.get('/api/export'),
    reset: () => API.post('/api/reset'),
    checkServerStatus: () => API.get('/api/server-status')
};
