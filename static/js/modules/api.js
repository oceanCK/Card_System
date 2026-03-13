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
    gameAutoConnect: (username, password, host, port) => {
        const body = {};
        if (username) body.username = username;
        if (password) body.password = password;
        if (host) body.host = host;
        if (port) body.port = port;
        return API.post('/api/game/auto-connect', body);
    },
    gameDisconnect: () => API.post('/api/game/disconnect'),
    gameStatus: () => API.get('/api/game/status'),
    gameWaitLogin: (timeout = 5) => API.get(`/api/game/wait-login?timeout=${timeout}`),
    gameGetPools: () => API.get('/api/game/pools'),
    gamePullSingle: (pool_id) => API.post('/api/game/pull/single', { pool_id }),
    gamePullMulti: (pool_id) => API.post('/api/game/pull/multi', { pool_id }),
    gameReadPoolNew: (poolId) => API.post(`/api/game/pools/${poolId}/read`),
    gameGetServers: () => API.get('/api/game/servers'),
    gamePing: () => API.get('/api/game/ping'),
    gameGetRole: () => API.get('/api/game/role'),
    gameEcho: (message) => API.post('/api/game/echo', { message })
};
