// 微信钱包页面模块
window.XiaoxinWeChatWallet = (function () {
    // ========== 渲染钱包页面 ==========
    function renderWalletPage($root, mobilePhone) {
        console.info("[小馨手机][微信] 渲染钱包页面");

        var account =
            window.XiaoxinWeChatDataHandler &&
            window.XiaoxinWeChatDataHandler.getAccount
                ? window.XiaoxinWeChatDataHandler.getAccount()
                : null;
        if (!account) {
            console.warn("[小馨手机][微信] 无法获取账号信息");
            return;
        }

        var $main = $(
            '<div class="xiaoxin-wechat-main xiaoxin-wechat-wallet-main"></div>'
        );

        // 标题栏
        var $header = $('<div class="xiaoxin-wechat-header"></div>');
        var $headerBar = $('<div class="xiaoxin-wechat-header-bar"></div>');

        var $headerLeft = $('<div class="xiaoxin-wechat-header-left"></div>');
        var $headerBack = $(
            '<div class="xiaoxin-wechat-header-back">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg></div>"
        );
        $headerBack.on("click", function () {
            // 返回到"我"页面（个人页）
            if ($root && window.XiaoxinWeChatApp && window.XiaoxinWeChatApp._renderMePage) {
                window.XiaoxinWeChatApp._renderMePage($root, mobilePhone);
            } else if ($root && $root.parent()) {
                // 兜底：如果找不到_renderMePage，尝试通过容器返回
                var $container = $root.parent();
                $container.empty();
                if (window.XiaoxinWeChatApp && window.XiaoxinWeChatApp.render) {
                    window.XiaoxinWeChatApp.render($container, mobilePhone);
                }
            }
        });
        $headerLeft.append($headerBack);

        var $headerTitle = $(
            '<div class="xiaoxin-wechat-header-title">钱包</div>'
        );

        // 右侧占位元素，确保标题居中
        var $headerRight = $('<div class="xiaoxin-wechat-header-right"></div>');
        $headerRight.css({
            width: "24px",
            flexShrink: 0,
        });

        $headerBar.append($headerLeft, $headerTitle, $headerRight);
        $header.append($headerBar);

        // 钱包内容区域
        var $walletContent = $('<div class="xiaoxin-wechat-wallet-content"></div>');

        // 获取钱包数据
        var walletData = window.XiaoxinWeChatDataHandler &&
            window.XiaoxinWeChatDataHandler.getWalletData
                ? window.XiaoxinWeChatDataHandler.getWalletData()
                : {
                    balance: 0, // 零钱
                    lctBalance: 0, // 零钱通余额
                    lctInterest: 0, // 零钱通累计收益
                    cards: [], // 银行卡列表
                    transactions: [] // 账单明细
                };

        // 自动计算零钱通每日利息（根据世界观时间推进）
        if (window.XiaoxinWeChatDataHandler &&
            window.XiaoxinWeChatDataHandler.calculateLctDailyInterest) {
            window.XiaoxinWeChatDataHandler.calculateLctDailyInterest();
            // 重新获取更新后的钱包数据
            walletData = window.XiaoxinWeChatDataHandler.getWalletData();
        }

        // 零钱卡片
        var $balanceCard = $('<div class="xiaoxin-wechat-wallet-balance-card"></div>');
        $balanceCard.append(
            '<div class="xiaoxin-wechat-wallet-balance-label">零钱</div>',
            '<div class="xiaoxin-wechat-wallet-balance-amount">¥' +
                (walletData.balance || 0).toFixed(2) +
            '</div>',
            '<div class="xiaoxin-wechat-wallet-balance-actions">' +
                '<div class="xiaoxin-wechat-wallet-action-btn" data-action="recharge">充值</div>' +
                '<div class="xiaoxin-wechat-wallet-action-btn" data-action="withdraw">提现</div>' +
            '</div>'
        );

        // 零钱通卡片
        var $lctCard = $('<div class="xiaoxin-wechat-wallet-lct-card"></div>');
        // 计算总金额（本金 + 累计收益）
        var lctBalance = walletData.lctBalance || 0;
        var lctInterest = walletData.lctInterest || 0;
        var lctTotal = lctBalance + lctInterest;
        $lctCard.append(
            '<div class="xiaoxin-wechat-wallet-lct-header">' +
                '<div class="xiaoxin-wechat-wallet-lct-label">零钱通</div>' +
                '<div class="xiaoxin-wechat-wallet-lct-info">七日年化收益率 2.5%</div>' +
            '</div>',
            '<div class="xiaoxin-wechat-wallet-lct-amount">¥' +
                lctTotal.toFixed(2) +
            '</div>',
            '<div class="xiaoxin-wechat-wallet-lct-interest">' +
                '累计收益：¥' + lctInterest.toFixed(2) +
            '</div>',
            '<div class="xiaoxin-wechat-wallet-lct-actions">' +
                '<div class="xiaoxin-wechat-wallet-action-btn" data-action="lct-deposit">存入</div>' +
                '<div class="xiaoxin-wechat-wallet-action-btn" data-action="lct-withdraw">转出</div>' +
            '</div>'
        );

        // 银行卡列表
        var $cardsSection = $('<div class="xiaoxin-wechat-wallet-section"></div>');
        var $cardsHeader = $('<div class="xiaoxin-wechat-wallet-section-header">银行卡</div>');
        var $cardsList = $('<div class="xiaoxin-wechat-wallet-cards-list"></div>');

        if (walletData.cards && walletData.cards.length > 0) {
            walletData.cards.forEach(function(card, index) {
                var $cardItem = $('<div class="xiaoxin-wechat-wallet-card-item"></div>');
                var cardNumber = card.number || '';
                var maskedNumber = cardNumber.length > 4
                    ? '**** **** **** ' + cardNumber.slice(-4)
                    : cardNumber;
                $cardItem.append(
                    '<div class="xiaoxin-wechat-wallet-card-icon">' +
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<path d="M19 7H5C3.89543 7 3 7.89543 3 9V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V9C21 7.89543 20.1046 7 19 7Z" stroke="#07c160" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '<path d="M3 10H21" stroke="#07c160" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '<path d="M7 15H7.01" stroke="#07c160" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '</svg>' +
                    '</div>',
                    '<div class="xiaoxin-wechat-wallet-card-info">' +
                        '<div class="xiaoxin-wechat-wallet-card-name">' + (card.bankName || '银行卡') + '</div>' +
                        '<div class="xiaoxin-wechat-wallet-card-number">' + maskedNumber + '</div>' +
                    '</div>',
                    '<div class="xiaoxin-wechat-wallet-card-arrow">' +
                        '<i class="fa-solid fa-chevron-right"></i>' +
                    '</div>'
                );
                $cardItem.on('click', function() {
                    console.info("[小馨手机][微信] 点击银行卡:", card);
                    if (typeof toastr !== "undefined") {
                        toastr.info("银行卡详情功能待实现", "小馨手机");
                    }
                });
                $cardsList.append($cardItem);
            });
        } else {
            $cardsList.append(
                '<div class="xiaoxin-wechat-wallet-empty">暂无银行卡</div>'
            );
        }

        var $addCardBtn = $('<div class="xiaoxin-wechat-wallet-add-card">添加银行卡</div>');
        $addCardBtn.on('click', function() {
            console.info("[小馨手机][微信] 点击添加银行卡");
            if (typeof toastr !== "undefined") {
                toastr.info("添加银行卡功能待实现", "小馨手机");
            }
        });

        $cardsSection.append($cardsHeader, $cardsList, $addCardBtn);

        // 账单明细
        var $transactionsSection = $('<div class="xiaoxin-wechat-wallet-section"></div>');
        var $transactionsHeader = $('<div class="xiaoxin-wechat-wallet-section-header xiaoxin-wechat-wallet-transactions-header"></div>');
        var $transactionsHeaderLeft = $('<div class="xiaoxin-wechat-wallet-transactions-header-left">账单明细</div>');
        var $transactionsHeaderRight = $('<div class="xiaoxin-wechat-wallet-transactions-header-right"></div>');

        // 日期选择器按钮
        var $dateFilterBtn = $('<div class="xiaoxin-wechat-wallet-date-filter-btn">筛选</div>');
        $transactionsHeaderRight.append($dateFilterBtn);
        $transactionsHeader.append($transactionsHeaderLeft, $transactionsHeaderRight);

        var $transactionsList = $('<div class="xiaoxin-wechat-wallet-transactions-list"></div>');

        // 日期筛选状态
        var filterState = {
            type: null, // 'year', 'month', 'range'
            year: null,
            month: null,
            startDate: null,
            endDate: null
        };

        // 格式化时间显示（月日 时分）
        function formatTransactionTime(timeStr) {
            if (!timeStr) return '';

            try {
                // 尝试解析各种时间格式
                var date = null;

                // 如果是时间戳字符串
                if (/^\d+$/.test(timeStr)) {
                    date = new Date(parseInt(timeStr));
                } else {
                    // 尝试解析常见的时间格式
                    // 支持格式：2018-06-20 08:30:00, 2018年6月20日 08:30:00, 2018年6月20日 星期三 08:30:00
                    var normalized = timeStr
                        .replace(/年/g, '-')
                        .replace(/月/g, '-')
                        .replace(/日/g, '')
                        .replace(/星期[一二三四五六日]/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();

                    date = new Date(normalized);
                }

                if (isNaN(date.getTime())) {
                    // 解析失败，返回原字符串
                    return timeStr;
                }

                // 格式化为：月日 时分
                var month = String(date.getMonth() + 1).padStart(2, '0');
                var day = String(date.getDate()).padStart(2, '0');
                var hours = String(date.getHours()).padStart(2, '0');
                var minutes = String(date.getMinutes()).padStart(2, '0');

                return month + '月' + day + '日 ' + hours + ':' + minutes;
            } catch (e) {
                console.warn("[小馨手机][微信] 格式化时间失败:", e, timeStr);
                return timeStr;
            }
        }

        // 解析交易时间
        function parseTransactionTime(timeStr) {
            if (!timeStr) return null;

            try {
                var date = null;

                if (/^\d+$/.test(timeStr)) {
                    date = new Date(parseInt(timeStr));
                } else {
                    var normalized = timeStr
                        .replace(/年/g, '-')
                        .replace(/月/g, '-')
                        .replace(/日/g, '')
                        .replace(/星期[一二三四五六日]/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();

                    date = new Date(normalized);
                }

                if (isNaN(date.getTime())) {
                    return null;
                }

                return date;
            } catch (e) {
                return null;
            }
        }

        // 筛选交易记录
        function filterTransactions(transactions) {
            if (!filterState.type) {
                return transactions;
            }

            return transactions.filter(function(transaction) {
                var transactionDate = parseTransactionTime(transaction.time);
                if (!transactionDate) {
                    return false;
                }

                switch(filterState.type) {
                    case 'year':
                        return transactionDate.getFullYear() === filterState.year;
                    case 'month':
                        return transactionDate.getFullYear() === filterState.year &&
                               transactionDate.getMonth() + 1 === filterState.month;
                    case 'range':
                        if (!filterState.startDate || !filterState.endDate) {
                            return false;
                        }
                        var start = new Date(filterState.startDate);
                        var end = new Date(filterState.endDate);
                        end.setHours(23, 59, 59, 999); // 包含结束日期的整天
                        return transactionDate >= start && transactionDate <= end;
                    default:
                        return true;
                }
            });
        }

        // 渲染交易列表
        function renderTransactionsList(transactions) {
            $transactionsList.empty();

            var filteredTransactions = filterTransactions(transactions || []);

            if (filteredTransactions.length === 0) {
                $transactionsList.append(
                    '<div class="xiaoxin-wechat-wallet-empty">暂无账单记录</div>'
                );
                return;
            }

            filteredTransactions.forEach(function(transaction) {
                var $transactionItem = $('<div class="xiaoxin-wechat-wallet-transaction-item"></div>');
                var amountClass = transaction.amount >= 0
                    ? 'xiaoxin-wechat-wallet-transaction-amount-positive'
                    : 'xiaoxin-wechat-wallet-transaction-amount-negative';
                var amountText = transaction.amount >= 0
                    ? '+' + transaction.amount.toFixed(2)
                    : transaction.amount.toFixed(2);

                $transactionItem.append(
                    '<div class="xiaoxin-wechat-wallet-transaction-icon">' +
                        '<i class="fa-solid fa-' + (transaction.icon || 'wallet') + '" style="color: #07c160;"></i>' +
                    '</div>',
                    '<div class="xiaoxin-wechat-wallet-transaction-info">' +
                        '<div class="xiaoxin-wechat-wallet-transaction-title">' +
                            (transaction.title || '交易') +
                        '</div>' +
                        '<div class="xiaoxin-wechat-wallet-transaction-time">' +
                            formatTransactionTime(transaction.time) +
                        '</div>' +
                    '</div>',
                    '<div class="xiaoxin-wechat-wallet-transaction-amount ' + amountClass + '">' +
                        amountText +
                    '</div>'
                );
                $transactionItem.on('click', function() {
                    console.info("[小馨手机][微信] 点击账单明细:", transaction);
                    if (typeof toastr !== "undefined") {
                        toastr.info("账单详情功能待实现", "小馨手机");
                    }
                });
                $transactionsList.append($transactionItem);
            });
        }

        // 显示日期选择器弹窗
        function showDateFilterDialog() {
            // 创建弹窗
            var $dialog = $('<div class="xiaoxin-wechat-wallet-date-filter-dialog"></div>');
            var $overlay = $('<div class="xiaoxin-wechat-wallet-date-filter-overlay"></div>');
            var $dialogContent = $('<div class="xiaoxin-wechat-wallet-date-filter-dialog-content"></div>');

            // 筛选类型选择
            var $typeSelector = $('<div class="xiaoxin-wechat-wallet-date-filter-type-selector"></div>');
            var filterTypes = [
                { value: 'year', label: '按年份' },
                { value: 'month', label: '按年月' },
                { value: 'range', label: '按时间段' }
            ];

            filterTypes.forEach(function(type) {
                var $typeBtn = $('<div class="xiaoxin-wechat-wallet-date-filter-type-btn" data-type="' + type.value + '">' + type.label + '</div>');
                if (filterState.type === type.value) {
                    $typeBtn.addClass('active');
                }
                $typeSelector.append($typeBtn);
            });

            // 获取世界观当前年份
            function getWorldYear() {
                var worldYear = new Date().getFullYear(); // 默认使用现实年份

                if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.currentTimestamp) {
                    try {
                        var worldTimestamp = window.XiaoxinWorldClock.currentTimestamp;
                        var worldDate = new Date(worldTimestamp);
                        if (!isNaN(worldDate.getTime())) {
                            worldYear = worldDate.getFullYear();
                        }
                    } catch (e) {
                        console.warn("[小馨手机][微信] 获取世界观年份失败:", e);
                    }
                } else if (window.XiaoxinWorldClock && window.XiaoxinWorldClock.rawTime) {
                    try {
                        var rawTimeStr = window.XiaoxinWorldClock.rawTime;
                        var normalized = rawTimeStr
                            .replace(/年/g, '-')
                            .replace(/月/g, '-')
                            .replace(/日/g, '')
                            .replace(/星期[一二三四五六日]/g, '')
                            .replace(/\s+/g, ' ')
                            .trim();
                        var worldDate = new Date(normalized);
                        if (!isNaN(worldDate.getTime())) {
                            worldYear = worldDate.getFullYear();
                        }
                    } catch (e) {
                        console.warn("[小馨手机][微信] 从rawTime解析世界观年份失败:", e);
                    }
                }

                return worldYear;
            }

            // 获取交易记录中的最早年份
            function getEarliestTransactionYear() {
                if (!walletData.transactions || walletData.transactions.length === 0) {
                    return null;
                }

                var earliestYear = null;
                walletData.transactions.forEach(function(transaction) {
                    var transactionDate = parseTransactionTime(transaction.time);
                    if (transactionDate) {
                        var year = transactionDate.getFullYear();
                        if (earliestYear === null || year < earliestYear) {
                            earliestYear = year;
                        }
                    }
                });

                return earliestYear;
            }

            // 生成年份列表（从世界观当前年份到最早交易年份）
            function generateYearList() {
                var worldYear = getWorldYear();
                var earliestYear = getEarliestTransactionYear();

                // 如果没有交易记录，只显示世界观当前年份
                if (earliestYear === null) {
                    return [worldYear];
                }

                // 从世界观当前年份到最早交易年份
                var years = [];
                for (var y = worldYear; y >= earliestYear; y--) {
                    years.push(y);
                }

                return years;
            }

            // 年份选择器
            var $yearSelector = $('<div class="xiaoxin-wechat-wallet-date-filter-year-selector" style="display: none;"></div>');
            var availableYears = generateYearList();
            availableYears.forEach(function(y) {
                var $yearOption = $('<div class="xiaoxin-wechat-wallet-date-filter-option" data-year="' + y + '">' + y + '年</div>');
                if (filterState.year === y) {
                    $yearOption.addClass('active');
                }
                $yearSelector.append($yearOption);
            });

            // 月份选择器
            var $monthSelector = $('<div class="xiaoxin-wechat-wallet-date-filter-month-selector" style="display: none;"></div>');
            for (var m = 1; m <= 12; m++) {
                var $monthOption = $('<div class="xiaoxin-wechat-wallet-date-filter-option" data-month="' + m + '">' + m + '月</div>');
                if (filterState.month === m) {
                    $monthOption.addClass('active');
                }
                $monthSelector.append($monthOption);
            }

            // 时间段选择器
            var $rangeSelector = $('<div class="xiaoxin-wechat-wallet-date-filter-range-selector" style="display: none;"></div>');
            $rangeSelector.append(
                '<div class="xiaoxin-wechat-wallet-date-filter-range-item">' +
                    '<label>开始日期：</label>' +
                    '<input type="date" class="xiaoxin-wechat-wallet-date-filter-range-start" value="' + (filterState.startDate || '') + '">' +
                '</div>',
                '<div class="xiaoxin-wechat-wallet-date-filter-range-item">' +
                    '<label>结束日期：</label>' +
                    '<input type="date" class="xiaoxin-wechat-wallet-date-filter-range-end" value="' + (filterState.endDate || '') + '">' +
                '</div>'
            );

            // 按钮
            var $buttons = $('<div class="xiaoxin-wechat-wallet-date-filter-buttons"></div>');
            var $resetBtn = $('<button class="xiaoxin-wechat-wallet-date-filter-btn-reset">重置</button>');
            var $confirmBtn = $('<button class="xiaoxin-wechat-wallet-date-filter-btn-confirm">确定</button>');
            $buttons.append($resetBtn, $confirmBtn);

            $dialogContent.append(
                '<div class="xiaoxin-wechat-wallet-date-filter-title">筛选条件</div>',
                $typeSelector,
                $yearSelector,
                $monthSelector,
                $rangeSelector,
                $buttons
            );

            $dialog.append($dialogContent);

            // 查找手机容器，将弹窗添加到手机容器中
            var $phoneContainer = $(".xiaoxin-phone-container");
            if ($phoneContainer.length > 0) {
                // 如果找到手机容器，添加到手机容器中
                $phoneContainer.append($overlay, $dialog);
            } else {
                // 如果找不到手机容器，回退到body（兼容性处理）
                $('body').append($overlay, $dialog);
            }

            // 类型选择
            $typeSelector.on('click', '.xiaoxin-wechat-wallet-date-filter-type-btn', function() {
                $typeSelector.find('.xiaoxin-wechat-wallet-date-filter-type-btn').removeClass('active');
                $(this).addClass('active');
                var selectedType = $(this).data('type');

                $yearSelector.hide();
                $monthSelector.hide();
                $rangeSelector.hide();

                if (selectedType === 'year') {
                    $yearSelector.show();
                } else if (selectedType === 'month') {
                    $yearSelector.show();
                    $monthSelector.show();
                } else if (selectedType === 'range') {
                    $rangeSelector.show();
                }
            });

            // 年份选择
            $yearSelector.on('click', '.xiaoxin-wechat-wallet-date-filter-option', function() {
                $yearSelector.find('.xiaoxin-wechat-wallet-date-filter-option').removeClass('active');
                $(this).addClass('active');
            });

            // 月份选择
            $monthSelector.on('click', '.xiaoxin-wechat-wallet-date-filter-option', function() {
                $monthSelector.find('.xiaoxin-wechat-wallet-date-filter-option').removeClass('active');
                $(this).addClass('active');
            });

            // 确定按钮
            $confirmBtn.on('click', function() {
                var selectedType = $typeSelector.find('.active').data('type');

                if (selectedType === 'year') {
                    var selectedYear = $yearSelector.find('.active').data('year');
                    if (selectedYear) {
                        filterState.type = 'year';
                        filterState.year = selectedYear;
                        filterState.month = null;
                        filterState.startDate = null;
                        filterState.endDate = null;
                    }
                } else if (selectedType === 'month') {
                    var selectedYear = $yearSelector.find('.active').data('year');
                    var selectedMonth = $monthSelector.find('.active').data('month');
                    if (selectedYear && selectedMonth) {
                        filterState.type = 'month';
                        filterState.year = selectedYear;
                        filterState.month = selectedMonth;
                        filterState.startDate = null;
                        filterState.endDate = null;
                    }
                } else if (selectedType === 'range') {
                    var startDate = $rangeSelector.find('.xiaoxin-wechat-wallet-date-filter-range-start').val();
                    var endDate = $rangeSelector.find('.xiaoxin-wechat-wallet-date-filter-range-end').val();
                    if (startDate && endDate) {
                        filterState.type = 'range';
                        filterState.startDate = startDate;
                        filterState.endDate = endDate;
                        filterState.year = null;
                        filterState.month = null;
                    }
                }

                // 更新筛选按钮显示
                updateFilterButtonText();

                // 重新渲染交易列表
                renderTransactionsList(walletData.transactions);

                // 关闭弹窗
                $overlay.remove();
                $dialog.remove();
            });

            // 重置按钮
            $resetBtn.on('click', function() {
                filterState = {
                    type: null,
                    year: null,
                    month: null,
                    startDate: null,
                    endDate: null
                };
                updateFilterButtonText();
                renderTransactionsList(walletData.transactions);
                $overlay.remove();
                $dialog.remove();
            });

            // 点击遮罩层关闭
            $overlay.on('click', function() {
                $overlay.remove();
                $dialog.remove();
            });

            // 初始化显示
            if (filterState.type) {
                $typeSelector.find('[data-type="' + filterState.type + '"]').trigger('click');
            }
        }

        // 更新筛选按钮文本
        function updateFilterButtonText() {
            if (!filterState.type) {
                $dateFilterBtn.text('筛选');
                return;
            }

            var text = '筛选';
            if (filterState.type === 'year' && filterState.year) {
                text = filterState.year + '年';
            } else if (filterState.type === 'month' && filterState.year && filterState.month) {
                text = filterState.year + '年' + filterState.month + '月';
            } else if (filterState.type === 'range' && filterState.startDate && filterState.endDate) {
                var start = new Date(filterState.startDate);
                var end = new Date(filterState.endDate);
                text = start.getMonth() + 1 + '月' + start.getDate() + '日-' + (end.getMonth() + 1) + '月' + end.getDate() + '日';
            }
            $dateFilterBtn.text(text);
        }

        // 绑定筛选按钮点击事件
        $dateFilterBtn.on('click', function(e) {
            e.stopPropagation();
            showDateFilterDialog();
        });

        // 初始渲染交易列表
        renderTransactionsList(walletData.transactions);

        $transactionsSection.append($transactionsHeader, $transactionsList);

        // 组装内容
        $walletContent.append(
            $balanceCard,
            $lctCard,
            $cardsSection,
            $transactionsSection
        );

        // 绑定操作按钮事件
        $walletContent.on('click', '.xiaoxin-wechat-wallet-action-btn', function() {
            var action = $(this).data('action');
            handleWalletAction(action, walletData, $root, mobilePhone);
        });

        $main.append($header, $walletContent);
        $root.empty().append($main);
    }

    // ========== 处理钱包操作 ==========
    function handleWalletAction(action, walletData, $root, mobilePhone) {
        console.info("[小馨手机][微信] 钱包操作:", action);

        switch(action) {
            case 'recharge':
                // 充值
                var amount = prompt("请输入充值金额（元）:", "100");
                if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
                    var rechargeAmount = parseFloat(amount);
                    if (window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.updateWalletBalance) {
                        window.XiaoxinWeChatDataHandler.updateWalletBalance(rechargeAmount);
                        // 添加交易记录
                        window.XiaoxinWeChatDataHandler.addWalletTransaction({
                            title: '充值',
                            amount: rechargeAmount,
                            time: new Date().toLocaleString('zh-CN'),
                            icon: 'plus-circle'
                        });
                        // 刷新页面
                        renderWalletPage($root, mobilePhone);
                        if (typeof toastr !== "undefined") {
                            toastr.success("充值成功", "小馨手机");
                        }
                    }
                }
                break;
            case 'withdraw':
                // 提现
                var amount = prompt("请输入提现金额（元）:", "100");
                if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
                    var withdrawAmount = parseFloat(amount);
                    var currentBalance = walletData.balance || 0;
                    if (withdrawAmount > currentBalance) {
                        if (typeof toastr !== "undefined") {
                            toastr.error("余额不足", "小馨手机");
                        }
                        return;
                    }
                    if (window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.updateWalletBalance) {
                        window.XiaoxinWeChatDataHandler.updateWalletBalance(-withdrawAmount);
                        // 添加交易记录
                        window.XiaoxinWeChatDataHandler.addWalletTransaction({
                            title: '提现',
                            amount: -withdrawAmount,
                            time: new Date().toLocaleString('zh-CN'),
                            icon: 'minus-circle'
                        });
                        // 刷新页面
                        renderWalletPage($root, mobilePhone);
                        if (typeof toastr !== "undefined") {
                            toastr.success("提现成功", "小馨手机");
                        }
                    }
                }
                break;
            case 'lct-deposit':
                // 零钱通存入
                var amount = prompt("请输入存入金额（元）:", "100");
                if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
                    var depositAmount = parseFloat(amount);
                    var currentBalance = walletData.balance || 0;
                    if (depositAmount > currentBalance) {
                        if (typeof toastr !== "undefined") {
                            toastr.error("零钱余额不足", "小馨手机");
                        }
                        return;
                    }
                    if (window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.updateWalletBalance &&
                        window.XiaoxinWeChatDataHandler.updateLctBalance) {
                        // 从零钱扣除
                        window.XiaoxinWeChatDataHandler.updateWalletBalance(-depositAmount);
                        // 存入零钱通
                        window.XiaoxinWeChatDataHandler.updateLctBalance(depositAmount);
                        // 添加交易记录
                        window.XiaoxinWeChatDataHandler.addWalletTransaction({
                            title: '零钱通存入',
                            amount: -depositAmount,
                            time: new Date().toLocaleString('zh-CN'),
                            icon: 'arrow-down'
                        });
                        // 刷新页面
                        renderWalletPage($root, mobilePhone);
                        if (typeof toastr !== "undefined") {
                            toastr.success("存入成功", "小馨手机");
                        }
                    }
                }
                break;
            case 'lct-withdraw':
                // 零钱通转出
                var amount = prompt("请输入转出金额（元）:", "100");
                if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
                    var withdrawAmount = parseFloat(amount);
                    // 计算总金额（本金 + 累计收益）
                    var currentLctBalance = walletData.lctBalance || 0;
                    var currentLctInterest = walletData.lctInterest || 0;
                    var currentLctTotal = currentLctBalance + currentLctInterest;

                    if (withdrawAmount > currentLctTotal) {
                        if (typeof toastr !== "undefined") {
                            toastr.error("零钱通余额不足", "小馨手机");
                        }
                        return;
                    }

                    if (window.XiaoxinWeChatDataHandler &&
                        window.XiaoxinWeChatDataHandler.updateWalletBalance &&
                        window.XiaoxinWeChatDataHandler.updateLctBalance) {

                        // 转出逻辑：只扣除本金，累计收益永久保存（作为历史记录）
                        // 如果转出金额超过本金，只能转出本金部分
                        var actualWithdrawAmount = Math.min(withdrawAmount, currentLctBalance);

                        // 扣除本金部分
                        window.XiaoxinWeChatDataHandler.updateLctBalance(-actualWithdrawAmount);

                        // 转入零钱（实际转出金额）
                        window.XiaoxinWeChatDataHandler.updateWalletBalance(actualWithdrawAmount);

                        // 添加交易记录
                        window.XiaoxinWeChatDataHandler.addWalletTransaction({
                            title: '零钱通转出',
                            amount: actualWithdrawAmount,
                            time: new Date().toLocaleString('zh-CN'),
                            icon: 'arrow-up'
                        });

                        // 刷新页面
                        renderWalletPage($root, mobilePhone);
                        if (typeof toastr !== "undefined") {
                            if (actualWithdrawAmount < withdrawAmount) {
                                toastr.warning("只能转出本金部分（¥" + actualWithdrawAmount.toFixed(2) + "），累计收益永久保存", "小馨手机");
                            } else {
                                toastr.success("转出成功", "小馨手机");
                            }
                        }
                    }
                }
                break;
            default:
                console.warn("[小馨手机][微信] 未知的钱包操作:", action);
        }
    }

    return {
        renderWalletPage: renderWalletPage,
    };
})();

