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
     */
    _saveSession() {
        localStorage.setItem('localGachaSession', JSON.stringify(this.sessionData));
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

        // 限制历史记录数量（防止内存过大）
        if (this.sessionData.stats.pull_history.length > 1000) {
            this.sessionData.stats.pull_history = this.sessionData.stats.pull_history.slice(-500);
        }

        this._saveSession();

        return {
            success: true,
            result: pullRecord
        };
    }

    /**
     * 多次抽卡（优化版）
     * @param {number} count - 抽卡次数
     * @param {number} returnLimit - 返回结果最大数量，默认100
     */
    pullMulti(count = 10, returnLimit = 100) {
        if (!this.dataLoaded) {
            return { success: false, message: '卡池数据未加载' };
        }

        // 限制单次最大抽卡数
        const maxCount = 10000;
        count = Math.min(Math.max(1, count), maxCount);
        
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

        // 限制历史记录数量
        const MAX_HISTORY = 1000;
        if (this.sessionData.stats.pull_history.length > MAX_HISTORY) {
            this.sessionData.stats.pull_history = this.sessionData.stats.pull_history.slice(-MAX_HISTORY);
        }

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
     * 获取导出数据
     */
    getExportData() {
        const pool = this.getCurrentPool();
        const stats = this.getStatistics().stats;
        const history = this.sessionData.stats.pull_history;

        let text = `===== 抽卡统计报告 =====\n`;
        text += `卡池: ${pool ? pool.name : '未选择'}\n`;
        text += `模式: 本地模式\n`;
        text += `总抽数: ${stats.total_pulls}\n`;
        text += `SSR: ${stats.ssr_count} (${stats.ssr_rate})\n`;
        text += `SR: ${stats.sr_count} (${stats.sr_rate})\n`;
        text += `R: ${stats.r_count} (${stats.r_rate})\n`;
        text += `当前保底计数: ${stats.pity_counter}\n\n`;

        text += `===== 特定SSR获取 =====\n`;
        for (const [id, count] of Object.entries(stats.featured_ssr_counts)) {
            text += `${id}: ${count}张\n`;
        }

        text += `\n===== 最近50次抽卡 =====\n`;
        const recentHistory = history.slice(-50).reverse();
        recentHistory.forEach(record => {
            text += `#${record.pull_number} [${record.card.rarity}] ${record.card.name}\n`;
        });

        return {
            success: true,
            data: text
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
