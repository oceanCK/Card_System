/**
 * 配置模块 - 常量、状态管理、DOM引用
 */

// ==================== 模式常量 ====================
const MODE = {
    LOCAL: 'local',
    SERVER: 'server'
};

// ==================== 抽卡限制配置 ====================
const PULL_LIMITS = {
    LOCAL: 10000,    // 本地模式最多1万次
    SERVER: 100000   // 服务端模式最多10万次（压测用）
};

// ==================== 全局状态管理 ====================
const AppState = {
    currentPoolId: null,
    isLoading: false,
    lastResults: [],
    mode: localStorage.getItem('gachaMode') || MODE.LOCAL,
    localServiceReady: false,
    serverAvailable: false
};

// ==================== DOM 元素引用 ====================
const DOM = {
    // 卡池相关
    poolTabs: null,
    poolDesc: null,
    
    // 抽卡按钮
    pullSingle: null,
    pullTen: null,
    pullCustom: null,
    customCount: null,
    resetBtn: null,
    
    // 统计显示
    totalPulls: null,
    ssrCount: null,
    srCount: null,
    rCount: null,
    ssrRate: null,
    srRate: null,
    rRate: null,
    
    // 结果展示
    cardsGrid: null,
    featuredList: null,
    detailsList: null,
    
    // 弹窗相关
    exportDataBtn: null,
    exportModal: null,
    closeModal: null,
    exportText: null,
    copyDataBtn: null,
    
    // 模式切换相关
    modeToggle: null,
    modeLocalBtn: null,
    modeServerBtn: null,
    refreshDataBtn: null,
    modeIndicator: null,

    /**
     * 初始化DOM引用
     */
    init() {
        this.poolTabs = document.getElementById('poolTabs');
        this.poolDesc = document.getElementById('poolDesc');
        
        this.pullSingle = document.getElementById('pullSingle');
        this.pullTen = document.getElementById('pullTen');
        this.pullCustom = document.getElementById('pullCustom');
        this.customCount = document.getElementById('customCount');
        this.resetBtn = document.getElementById('resetBtn');
        
        this.totalPulls = document.getElementById('totalPulls');
        this.ssrCount = document.getElementById('ssrCount');
        this.srCount = document.getElementById('srCount');
        this.rCount = document.getElementById('rCount');
        this.ssrRate = document.getElementById('ssrRate');
        this.srRate = document.getElementById('srRate');
        this.rRate = document.getElementById('rRate');
        
        this.cardsGrid = document.getElementById('cardsGrid');
        this.featuredList = document.getElementById('featuredList');
        this.detailsList = document.getElementById('detailsList');
        
        this.exportDataBtn = document.getElementById('exportDataBtn');
        this.exportModal = document.getElementById('exportModal');
        this.closeModal = document.getElementById('closeModal');
        this.exportText = document.getElementById('exportText');
        this.copyDataBtn = document.getElementById('copyDataBtn');
        
        this.modeToggle = document.getElementById('modeToggle');
        this.modeLocalBtn = document.getElementById('modeLocalBtn');
        this.modeServerBtn = document.getElementById('modeServerBtn');
        this.refreshDataBtn = document.getElementById('refreshDataBtn');
        this.modeIndicator = document.getElementById('modeIndicator');
    }
};
