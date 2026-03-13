/**
 * 配置模块 - 常量、状态管理、DOM引用
 */

// ==================== 模式常量 ====================
const MODE = {
    LOCAL: 'local',
    GAME_SERVER: 'game_server'
};

// ==================== 抽卡限制配置 ====================
const PULL_LIMITS = {
    LOCAL: 100000    // 本地模式最多10万次
};

// ==================== 全局状态管理 ====================
const AppState = {
    currentPoolId: null,
    isLoading: false,
    lastResults: [],
    mode: (() => {
        const saved = localStorage.getItem('gachaMode');
        // 兼容旧版 server 模式，自动回退到本地
        if (saved === 'server') return MODE.LOCAL;
        return saved || MODE.LOCAL;
    })(),
    localServiceReady: false,
    // 游戏服务器连接状态
    gameServerConnected: false,
    // 当前选中的服务器 {id, name, host, port}
    selectedServer: null,
    // 当前已连接的服务器 {id, name, host, port}
    connectedServer: null
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
    downloadDataBtn: null,
    
    // 模式切换相关
    modeToggle: null,
    modeLocalBtn: null,
    refreshDataBtn: null,
    modeIndicator: null,

    // 登录相关
    loginSection: null,
    loginUsername: null,
    loginPassword: null,
    loginBtn: null,
    loginError: null,

    // 服务器选择
    serverSelectSection: null,
    serverList: null,
    
    // 进度条相关
    progressContainer: null,
    progressFill: null,
    progressDetail: null,
    progressPercent: null,

    // 导出数据进度条
    exportProgressContainer: null,
    exportProgressFill: null,
    exportProgressDetail: null,
    exportProgressPercent: null,

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
        this.downloadDataBtn = document.getElementById('downloadDataBtn');
        
        this.modeToggle = document.getElementById('modeToggle');
        this.modeLocalBtn = document.getElementById('modeLocalBtn');
        this.refreshDataBtn = document.getElementById('refreshDataBtn');
        this.modeIndicator = document.getElementById('modeIndicator');
        
        // 游戏服务器模式
        this.modeGameBtn = document.getElementById('modeGameBtn');

        // 登录相关
        this.loginSection = document.getElementById('loginSection');
        this.loginUsername = document.getElementById('loginUsername');
        this.loginPassword = document.getElementById('loginPassword');
        this.loginBtn = document.getElementById('loginBtn');
        this.loginError = document.getElementById('loginError');

        // 服务器选择
        this.serverSelectSection = document.getElementById('serverSelectSection');
        this.serverList = document.getElementById('serverList');

        // 进度条
        this.progressContainer = document.getElementById('progressContainer');
        this.progressFill = document.getElementById('progressFill');
        this.progressDetail = document.getElementById('progressDetail');
        this.progressPercent = document.getElementById('progressPercent');

        // 导出数据进度条
        this.exportProgressContainer = document.getElementById('exportProgressContainer');
        this.exportProgressFill = document.getElementById('exportProgressFill');
        this.exportProgressDetail = document.getElementById('exportProgressDetail');
        this.exportProgressPercent = document.getElementById('exportProgressPercent');
    }
};
