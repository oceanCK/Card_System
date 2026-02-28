/**
 * 本地抽卡引擎 - 前端独立运行的抽卡逻辑
 * 支持离线使用和实时数据刷新
 */

// ==================== 配置常量 ====================
const LOCAL_CONFIG = {
    CARD_RARITY: {
        SSR: { name: 'SSR', color: '#FFD700', probability: 0.02 },
        SR: { name: 'SR', color: '#9B59B6', probability: 0.10 },
        R: { name: 'R', color: '#3498DB', probability: 0.88 }
    },
    PITY: {
        soft_pity: 74,      // 软保底开始抽数
        hard_pity: 90,      // 硬保底抽数
        pity_increase: 0.06 // 软保底后每抽增加概率
    },
    FEATURED_RATE: 0.5      // UP角色概率（50%）
};

// ==================== 本地抽卡服务 ====================
class LocalGachaService {
    constructor() {
        this.pools = {};
        this.currentPoolId = null;
        this.sessionData = this._loadSession();
        this.dataLoaded = false;
    }

    /**
     * 从localStorage加载会话数据
     */
    _loadSession() {
        const saved = localStorage.getItem('localGachaSession');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.warn('无法解析本地会话数据，将重新初始化');
            }
        }
        return this._createNewSession();
    }

    /**
     * 创建新会话
     */
    _createNewSession() {
        return {
            currentPoolId: null,
            pityCounter: 0,
            stats: {
                total_pulls: 0,
                ssr_count: 0,
                sr_count: 0,
                r_count: 0,
                featured_ssr_counts: {},
                pull_history: []
            }
        };
    }

    /**
     * 保存会话到localStorage
     * 注意：只保存最近5000条历史到localStorage（避免超出存储配额）
     * 完整历史保留在内存中，供导出和统计使用
     */
    _saveSession() {
        try {
            const saveData = {
                currentPoolId: this.sessionData.currentPoolId,
                pityCounter: this.sessionData.pityCounter,
                stats: {
                    total_pulls: this.sessionData.stats.total_pulls,
                    ssr_count: this.sessionData.stats.ssr_count,
                    sr_count: this.sessionData.stats.sr_count,
                    r_count: this.sessionData.stats.r_count,
                    featured_ssr_counts: this.sessionData.stats.featured_ssr_counts,
                    pull_history: this.sessionData.stats.pull_history.slice(-5000)
                }
            };
            localStorage.setItem('localGachaSession', JSON.stringify(saveData));
        } catch (e) {
            console.warn('[LocalGacha] 保存会话失败，尝试精简数据:', e.message);
            try {
                const minData = {
                    currentPoolId: this.sessionData.currentPoolId,
                    pityCounter: this.sessionData.pityCounter,
                    stats: {
                        total_pulls: this.sessionData.stats.total_pulls,
                        ssr_count: this.sessionData.stats.ssr_count,
                        sr_count: this.sessionData.stats.sr_count,
                        r_count: this.sessionData.stats.r_count,
                        featured_ssr_counts: this.sessionData.stats.featured_ssr_counts,
                        pull_history: this.sessionData.stats.pull_history.slice(-500)
                    }
                };
                localStorage.setItem('localGachaSession', JSON.stringify(minData));
            } catch (e2) {
                console.error('[LocalGacha] 无法保存会话数据:', e2.message);
            }
        }
    }

    /**
     * 加载卡池数据（从服务端或本地JSON）
     */
    async loadPoolsData(forceRefresh = false) {
        try {
            // 添加时间戳防止缓存
            const timestamp = forceRefresh ? `?t=${Date.now()}` : '';
            const response = await fetch(`/data/cards.json${timestamp}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            
            // 解析卡池数据
            this.pools = {};
            for (const poolData of data.pools || []) {
                this.pools[poolData.pool_id] = this._parsePool(poolData);
            }

            // 设置默认卡池
            if (!this.currentPoolId && Object.keys(this.pools).length > 0) {
                this.currentPoolId = Object.keys(this.pools)[0];
                this.sessionData.currentPoolId = this.currentPoolId;
            } else if (this.sessionData.currentPoolId) {
                this.currentPoolId = this.sessionData.currentPoolId;
            }

            // 初始化featured_ssr_counts
            this._initFeaturedSSRCounts();

            this.dataLoaded = true;
            console.log('[LocalGacha] 卡池数据加载成功:', Object.keys(this.pools));
            return true;
        } catch (error) {
            console.error('[LocalGacha] 加载卡池数据失败:', error);
            return false;
        }
    }

    /**
     * 解析单个卡池数据
     */
    _parsePool(poolData) {
        return {
            pool_id: poolData.pool_id,
            name: poolData.name,
            pool_type: poolData.pool_type,
            description: poolData.description,
            library_id: poolData.library_id,
            featured_ssr: poolData.featured_ssr || [],
            cards: (poolData.cards || []).map(card => ({
                card_id: card.card_id,
                name: card.name,
                rarity: card.rarity,
                is_featured: card.is_featured || false,
                image_url: card.image_url || null
            }))
        };
    }

    /**
     * 初始化特定SSR计数
     */
    _initFeaturedSSRCounts() {
        const pool = this.getCurrentPool();
        if (pool && pool.featured_ssr) {
            for (const ssrId of pool.featured_ssr) {
                if (!(ssrId in this.sessionData.stats.featured_ssr_counts)) {
                    this.sessionData.stats.featured_ssr_counts[ssrId] = 0;
                }
            }
        }
    }

    /**
     * 获取所有卡池
     */
    getAllPools() {
        return Object.values(this.pools);
    }

    /**
     * 获取当前卡池
     */
    getCurrentPool() {
        return this.pools[this.currentPoolId] || null;
    }

    /**
     * 设置当前卡池
     */
    setCurrentPool(poolId, autoReset = true) {
        if (!(poolId in this.pools)) {
            return { success: false, message: '卡池不存在' };
        }

        const needReset = autoReset && poolId !== this.currentPoolId;
        this.currentPoolId = poolId;
        this.sessionData.currentPoolId = poolId;

        if (needReset) {
            this.reset();
        }

        this._saveSession();
        return {
            success: true,
            pool: this.pools[poolId]
        };
    }

    /**
     * 计算当前SSR概率（带保底机制）
     */
    _calculateSSRProbability() {
        let baseProb = LOCAL_CONFIG.CARD_RARITY.SSR.probability;
        const pity = this.sessionData.pityCounter;

        // 软保底后增加概率
        if (pity >= LOCAL_CONFIG.PITY.soft_pity) {
            const extraPulls = pity - LOCAL_CONFIG.PITY.soft_pity;
            baseProb += extraPulls * LOCAL_CONFIG.PITY.pity_increase;
        }

        // 硬保底必出SSR
        if (pity >= LOCAL_CONFIG.PITY.hard_pity - 1) {
            baseProb = 1.0;
        }

        return Math.min(baseProb, 1.0);
    }

    /**
     * 决定抽卡品阶
     */
    _determineRarity() {
        const roll = Math.random();
        const ssrProb = this._calculateSSRProbability();
        const srProb = LOCAL_CONFIG.CARD_RARITY.SR.probability;

        if (roll < ssrProb) {
            return 'SSR';
        } else if (roll < ssrProb + srProb) {
            return 'SR';
        } else {
            return 'R';
        }
    }

    /**
     * 从当前卡池选择卡牌
     */
    _selectCard(rarity) {
        const pool = this.getCurrentPool();
        if (!pool) return null;

        const cards = pool.cards.filter(c => c.rarity === rarity);
        if (cards.length === 0) return null;

        // SSR有50%概率出UP卡
        if (rarity === 'SSR' && pool.featured_ssr && pool.featured_ssr.length > 0) {
            if (Math.random() < LOCAL_CONFIG.FEATURED_RATE) {
                const featuredCards = cards.filter(c => c.is_featured);
                if (featuredCards.length > 0) {
                    return featuredCards[Math.floor(Math.random() * featuredCards.length)];
                }
            }
        }

        return cards[Math.floor(Math.random() * cards.length)];
    }

    /**
     * 单次抽卡
     */
    pullSingle() {
        if (!this.dataLoaded) {
            return { success: false, message: '卡池数据未加载' };
        }

        // 决定品阶
        const rarity = this._determineRarity();

        // 选择卡牌
        let card = this._selectCard(rarity);

        if (!card) {
            // 模拟数据
            card = {
                card_id: `MOCK_${rarity}_${Math.floor(Math.random() * 9000) + 1000}`,
                name: `模拟${rarity}卡牌`,
                rarity: rarity,
                is_featured: false,
                image_url: null
            };
        }

        // 更新统计
        this.sessionData.stats.total_pulls += 1;
        this.sessionData.pityCounter += 1;

        if (rarity === 'SSR') {
            this.sessionData.stats.ssr_count += 1;
            this.sessionData.pityCounter = 0; // 重置保底

            // 统计特定SSR
            if (card.card_id in this.sessionData.stats.featured_ssr_counts) {
                this.sessionData.stats.featured_ssr_counts[card.card_id] += 1;
            }
        } else if (rarity === 'SR') {
            this.sessionData.stats.sr_count += 1;
        } else {
            this.sessionData.stats.r_count += 1;
        }

        // 记录历史
        const pullRecord = {
            pull_number: this.sessionData.stats.total_pulls,
            card: card,
            pity_count: this.sessionData.pityCounter
        };
        this.sessionData.stats.pull_history.push(pullRecord);

        this._saveSession();

        return {
            success: true,
            result: pullRecord
        };
    }

    /**
     * 多次抽卡（同步版，用于少量抽卡）
     * @param {number} count - 抽卡次数
     * @param {number} returnLimit - 返回结果最大数量，默认100
     */
    pullMulti(count = 10, returnLimit = 100) {
        if (!this.dataLoaded) {
            return { success: false, message: '卡池数据未加载' };
        }

        // 确保最少抽1次
        count = Math.max(1, count);
        
        const results = [];
        
        // 对于大批量抽卡，禁用每次的localStorage保存，最后统一保存
        const originalSaveSession = this._saveSession.bind(this);
        this._saveSession = () => {};  // 临时禁用
        
        try {
            for (let i = 0; i < count; i++) {
                const result = this._pullSingleOptimized();
                // 只保留最近的结果用于返回
                if (i >= count - returnLimit) {
                    results.push(result);
                }
            }
        } finally {
            // 恢复保存函数并执行一次保存
            this._saveSession = originalSaveSession;
            this._saveSession();
        }

        return {
            success: true,
            results: results,
            actual_count: count,
            returned_count: results.length
        };
    }

    /**
     * 异步多次抽卡（用于大量抽卡，避免UI卡顿）
     * @param {number} count - 抽卡次数
     * @param {number} returnLimit - 返回结果最大数量，默认100
     * @param {Function} onProgress - 进度回调函数 (current, total, percent)
     * @param {number} batchSize - 每批处理数量，默认5000以优化性能
     */
    async pullMultiAsync(count = 10, returnLimit = 100, onProgress = null, batchSize = 5000) {
        if (!this.dataLoaded) {
            return { success: false, message: '卡池数据未加载' };
        }

        // 确保最少抽1次
        count = Math.max(1, count);
        
        const results = [];
        const startIndex = Math.max(0, count - returnLimit);
        
        // 禁用每次的localStorage保存，最后统一保存
        const originalSaveSession = this._saveSession.bind(this);
        this._saveSession = () => {};
        
        let processed = 0;
        const totalBatches = Math.ceil(count / batchSize);
        
        try {
            for (let batch = 0; batch < totalBatches; batch++) {
                const batchStart = batch * batchSize;
                const batchEnd = Math.min(batchStart + batchSize, count);
                
                // 执行当前批次
                for (let i = batchStart; i < batchEnd; i++) {
                    const result = this._pullSingleOptimized();
                    // 只保留最近的结果用于返回
                    if (i >= startIndex) {
                        results.push(result);
                    }
                }
                
                processed = batchEnd;
                
                // 回调进度
                if (onProgress) {
                    const percent = Math.round((processed / count) * 100);
                    onProgress(processed, count, percent);
                }
                
                // 让出主线程，避免UI卡顿
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        } finally {
            // 恢复保存函数并执行一次保存
            this._saveSession = originalSaveSession;
            this._saveSession();
        }

        return {
            success: true,
            results: results,
            actual_count: count,
            returned_count: results.length
        };
    }

    /**
     * 优化版单抽（不保存session，用于批量调用）
     */
    _pullSingleOptimized() {
        // 决定品阶
        const rarity = this._determineRarity();

        // 选择卡牌
        let card = this._selectCard(rarity);

        if (!card) {
            card = {
                card_id: `MOCK_${rarity}_${Math.floor(Math.random() * 9000) + 1000}`,
                name: `模拟${rarity}卡牌`,
                rarity: rarity,
                is_featured: false,
                image_url: null
            };
        }

        // 更新统计
        this.sessionData.stats.total_pulls += 1;
        this.sessionData.pityCounter += 1;

        if (rarity === 'SSR') {
            this.sessionData.stats.ssr_count += 1;
            this.sessionData.pityCounter = 0;
            if (card.card_id in this.sessionData.stats.featured_ssr_counts) {
                this.sessionData.stats.featured_ssr_counts[card.card_id] += 1;
            }
        } else if (rarity === 'SR') {
            this.sessionData.stats.sr_count += 1;
        } else {
            this.sessionData.stats.r_count += 1;
        }

        // 记录历史
        const pullRecord = {
            pull_number: this.sessionData.stats.total_pulls,
            card: card,
            pity_count: this.sessionData.pityCounter
        };
        this.sessionData.stats.pull_history.push(pullRecord);

        return pullRecord;
    }

    /**
     * 获取统计数据
     */
    getStatistics() {
        const stats = this.sessionData.stats;
        const total = stats.total_pulls;

        if (total === 0) {
            return {
                success: true,
                stats: {
                    total_pulls: 0,
                    ssr_count: 0,
                    sr_count: 0,
                    r_count: 0,
                    ssr_rate: '0.00%',
                    sr_rate: '0.00%',
                    r_rate: '0.00%',
                    featured_ssr_counts: this.sessionData.stats.featured_ssr_counts,
                    pity_counter: this.sessionData.pityCounter
                }
            };
        }

        return {
            success: true,
            stats: {
                total_pulls: total,
                ssr_count: stats.ssr_count,
                sr_count: stats.sr_count,
                r_count: stats.r_count,
                ssr_rate: `${(stats.ssr_count / total * 100).toFixed(2)}%`,
                sr_rate: `${(stats.sr_count / total * 100).toFixed(2)}%`,
                r_rate: `${(stats.r_count / total * 100).toFixed(2)}%`,
                featured_ssr_counts: stats.featured_ssr_counts,
                pity_counter: this.sessionData.pityCounter
            }
        };
    }

    /**
     * 获取抽卡历史
     */
    getHistory(limit = 50) {
        const history = this.sessionData.stats.pull_history;
        return {
            success: true,
            history: history.slice(-limit)
        };
    }

    /**
     * 获取导出数据（同步版，用于少量数据）
     */
    getExportData() {
        const history = this.sessionData.stats.pull_history;
        if (history.length > 5000) {
            // 数据量大时建议使用异步版本
            console.warn('[LocalGacha] 历史记录较多，建议使用 getExportDataAsync');
        }
        return this._generateExportData(history);
    }

    /**
     * 异步获取导出数据（用于大量数据，带进度回调，不卡UI）
     * 返回: { success, summary, fullBlob }
     *   - summary: 摘要文本（统计 + 最近500条），用于预览
     *   - fullBlob: 完整数据的 Blob 对象，用于下载
     * @param {Function} onProgress - 进度回调 (current, total, percent, stage)
     */
    async getExportDataAsync(onProgress = null) {
        const pool = this.getCurrentPool();
        const stats = this.getStatistics().stats;
        const history = this.sessionData.stats.pull_history;
        const total = history.length;

        if (total === 0) {
            return { success: true, summary: '暂无抽卡记录', fullBlob: null };
        }

        // ===== 阶段1: 统计各品级（快速遍历，不生成文本） =====
        if (onProgress) onProgress(0, total, 0, '统计中');

        const ssrCards = {};
        const srCards = {};
        const rCards = {};

        const statBatchSize = 5000;
        for (let i = 0; i < total; i++) {
            const card = history[i].card;
            const cardId = card.card_id;
            const cardName = card.name;
            if (card.rarity === 'SSR') {
                if (!ssrCards[cardId]) ssrCards[cardId] = { id: cardId, name: cardName, count: 0 };
                ssrCards[cardId].count++;
            } else if (card.rarity === 'SR') {
                if (!srCards[cardId]) srCards[cardId] = { id: cardId, name: cardName, count: 0 };
                srCards[cardId].count++;
            } else {
                if (!rCards[cardId]) rCards[cardId] = { id: cardId, name: cardName, count: 0 };
                rCards[cardId].count++;
            }
            if ((i + 1) % statBatchSize === 0) {
                if (onProgress) {
                    const percent = Math.round(((i + 1) / total) * 30);  // 阶段1占30%
                    onProgress(i + 1, total, percent, '统计中');
                }
                await new Promise(r => setTimeout(r, 0));
            }
        }

        // 生成品级占比文本
        const statsLines = [];
        if (pool && pool.library_id) {
            statsLines.push(`卡库ID: ${pool.library_id}`);
            statsLines.push('');
        }
        statsLines.push(`总抽数: ${stats.total_pulls}`);
        statsLines.push('');
        statsLines.push('=== 品级占比 ===');
        statsLines.push(`SSR 占 ${stats.ssr_rate} (${stats.ssr_count}张)`);
        for (const info of Object.values(ssrCards)) {
            const rate = stats.ssr_count > 0 ? (info.count / stats.ssr_count * 100).toFixed(2) : 0;
            statsLines.push(`  其中 ${info.id}, 数量 ${info.count}, 占比 ${rate}%`);
        }
        statsLines.push('');
        statsLines.push(`SR 占 ${stats.sr_rate} (${stats.sr_count}张)`);
        for (const info of Object.values(srCards)) {
            const rate = stats.sr_count > 0 ? (info.count / stats.sr_count * 100).toFixed(2) : 0;
            statsLines.push(`  其中 ${info.id}, 数量 ${info.count}, 占比 ${rate}%`);
        }
        statsLines.push('');
        statsLines.push(`R 占 ${stats.r_rate} (${stats.r_count}张)`);
        for (const info of Object.values(rCards)) {
            const rate = stats.r_count > 0 ? (info.count / stats.r_count * 100).toFixed(2) : 0;
            statsLines.push(`  其中 ${info.id}, 数量 ${info.count}, 占比 ${rate}%`);
        }
        const statsText = statsLines.join('\n');

        // ===== 生成预览摘要（统计 + 最近500条） =====
        const previewLines = [...statsLines, '', '=== 最近500条记录 ==='];
        const previewRecords = history.slice(-500);
        previewRecords.forEach((record, i) => {
            const card = record.card;
            previewLines.push(`${record.pull_number}. ${card.card_id} ${card.rarity} ${card.name}`);
            if ((i + 1) % 10 === 0) previewLines.push('');
        });
        if (total > 500) {
            previewLines.push('');
            previewLines.push(`... 仅显示最近500条，完整 ${total} 条记录请点击"下载完整数据"`);
        }
        const summary = previewLines.join('\n');

        if (onProgress) onProgress(total, total, 35, '生成完整数据');
        await new Promise(r => setTimeout(r, 0));

        // ===== 阶段2: 分批生成完整文本用于下载（Blob分块写入） =====
        const textChunks = [];
        textChunks.push(statsText + '\n\n=== 卡牌信息列表 ===\n');

        const genBatchSize = 3000;
        const totalGenBatches = Math.ceil(total / genBatchSize);

        for (let batch = 0; batch < totalGenBatches; batch++) {
            const start = batch * genBatchSize;
            const end = Math.min(start + genBatchSize, total);
            let chunk = '';

            for (let i = start; i < end; i++) {
                const record = history[i];
                const card = record.card;
                chunk += `${record.pull_number}. ${card.card_id} ${card.rarity} ${card.name}\n`;
                if ((i + 1) % 10 === 0) chunk += '\n';
            }

            textChunks.push(chunk);

            if (onProgress) {
                const percent = 35 + Math.round((end / total) * 65);  // 阶段2占65%
                onProgress(end, total, percent, '生成完整数据');
            }
            await new Promise(r => setTimeout(r, 0));
        }

        // 用Blob避免在内存中拼接完整大字符串
        const fullBlob = new Blob(textChunks, { type: 'text/plain;charset=utf-8' });

        if (onProgress) onProgress(total, total, 100, '完成');

        return {
            success: true,
            summary: summary,
            fullBlob: fullBlob
        };
    }

    /**
     * 内部方法：生成导出数据（同步）
     */
    _generateExportData(history) {
        const pool = this.getCurrentPool();
        const stats = this.getStatistics().stats;

        let lines = [];
        
        // 卡库ID
        if (pool && pool.library_id) {
            lines.push(`卡库ID: ${pool.library_id}`);
            lines.push('');
        }
        
        // 卡牌信息列表
        lines.push('=== 卡牌信息列表 ===');
        history.forEach((record, i) => {
            const card = record.card;
            lines.push(`${record.pull_number}. ${card.card_id} ${card.rarity} ${card.name}`);
            if ((i + 1) % 10 === 0) {
                lines.push('');
            }
        });
        
        lines.push('');
        lines.push('=== 品级占比 ===');
        
        const ssrCards = {};
        const srCards = {};
        const rCards = {};
        
        history.forEach(record => {
            const card = record.card;
            const cardId = card.card_id;
            const cardName = card.name;
            const rarity = card.rarity;
            
            if (rarity === 'SSR') {
                if (!ssrCards[cardId]) ssrCards[cardId] = { id: cardId, name: cardName, count: 0 };
                ssrCards[cardId].count++;
            } else if (rarity === 'SR') {
                if (!srCards[cardId]) srCards[cardId] = { id: cardId, name: cardName, count: 0 };
                srCards[cardId].count++;
            } else {
                if (!rCards[cardId]) rCards[cardId] = { id: cardId, name: cardName, count: 0 };
                rCards[cardId].count++;
            }
        });
        
        lines.push(`SSR 占 ${stats.ssr_rate}`);
        for (const [key, info] of Object.entries(ssrCards)) {
            const rate = stats.ssr_count > 0 ? (info.count / stats.ssr_count * 100).toFixed(2) : 0;
            lines.push(`  其中 ${info.id}, 数量 ${info.count}, 占比 ${rate}%`);
        }
        lines.push('');
        lines.push(`SR 占 ${stats.sr_rate}`);
        for (const [key, info] of Object.entries(srCards)) {
            const rate = stats.sr_count > 0 ? (info.count / stats.sr_count * 100).toFixed(2) : 0;
            lines.push(`  其中 ${info.id}, 数量 ${info.count}, 占比 ${rate}%`);
        }
        lines.push('');
        lines.push(`R 占 ${stats.r_rate}`);
        for (const [key, info] of Object.entries(rCards)) {
            const rate = stats.r_count > 0 ? (info.count / stats.r_count * 100).toFixed(2) : 0;
            lines.push(`  其中 ${info.id}, 数量 ${info.count}, 占比 ${rate}%`);
        }

        return {
            success: true,
            data: lines.join('\n')
        };
    }

    /**
     * 重置统计
     */
    reset() {
        const pool = this.getCurrentPool();
        this.sessionData.pityCounter = 0;
        this.sessionData.stats = {
            total_pulls: 0,
            ssr_count: 0,
            sr_count: 0,
            r_count: 0,
            featured_ssr_counts: {},
            pull_history: []
        };

        // 初始化当前卡池的featured_ssr
        if (pool && pool.featured_ssr) {
            for (const ssrId of pool.featured_ssr) {
                this.sessionData.stats.featured_ssr_counts[ssrId] = 0;
            }
        }

        this._saveSession();
        return { success: true };
    }

    /**
     * 刷新数据（重新加载cards.json）
     */
    async refreshData() {
        const loaded = await this.loadPoolsData(true);
        if (loaded) {
            // 保留统计数据，只更新卡池信息
            this._initFeaturedSSRCounts();
            return { success: true, message: '数据刷新成功' };
        }
        return { success: false, message: '数据刷新失败' };
    }
}

// ==================== 导出单例 ====================
const localGachaService = new LocalGachaService();

// 如果是模块化环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LocalGachaService, localGachaService };
}
