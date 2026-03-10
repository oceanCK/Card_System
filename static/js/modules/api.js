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
    
    // 游戏服务器桥接API
    gameAutoConnect: () => API.post('/api/game/auto-connect'),
    gameDisconnect: () => API.post('/api/game/disconnect'),
    gameStatus: () => API.get('/api/game/status'),
    gameGetPools: () => API.get('/api/game/pools'),
    gamePullSingle: (pool_id) => API.post('/api/game/pull/single', { pool_id }),
    gamePullMulti: (pool_id) => API.post('/api/game/pull/multi', { pool_id }),
    gameReadPoolNew: (poolId) => API.post(`/api/game/pools/${poolId}/read`),
    gamePing: () => API.get('/api/game/ping'),
    gameGetRole: () => API.get('/api/game/role'),
    gameEcho: (message) => API.post('/api/game/echo', { message })
};
