// GPU 比較圖表應用程式
class CompareChartsApp {
    constructor() {
        this.nvidiaData = [];
        this.amdData = [];
        this.charts = {};
        this.loadChartData();
    }

    // 載入圖表資料
    async loadChartData() {
        try {
            document.getElementById('loading').style.display = 'flex';
            document.getElementById('chartsContainer').style.display = 'none';
            
            // 同時載入兩個品牌的資料
            const [nvidiaResponse, amdResponse] = await Promise.all([
                fetch('/api/chart-data'),
                fetch('/api/amd-chart-data')
            ]);
            
            this.nvidiaData = await nvidiaResponse.json();
            this.amdData = await amdResponse.json();
            
            this.updateStats();
            this.createCharts();
            
            document.getElementById('loading').style.display = 'none';
            document.getElementById('chartsContainer').style.display = 'block';
        } catch (error) {
            console.error('Error loading chart data:', error);
            document.getElementById('loading').innerHTML = 
                '<div class="alert alert-danger">載入圖表資料時發生錯誤</div>';
        }
    }

    // 更新統計資訊
    updateStats() {
        const nvidiaTotal = this.nvidiaData.reduce((sum, year) => sum + year.gpuCount, 0);
        const amdTotal = this.amdData.reduce((sum, year) => sum + year.gpuCount, 0);
        const totalGPUs = nvidiaTotal + amdTotal;
        
        const nvidiaAvgPrice = this.nvidiaData.length > 0 
            ? Math.round(this.nvidiaData.reduce((sum, year) => sum + year.avgPrice, 0) / this.nvidiaData.length)
            : 0;
        const amdAvgPrice = this.amdData.length > 0 
            ? Math.round(this.amdData.reduce((sum, year) => sum + year.avgPrice, 0) / this.amdData.length)
            : 0;

        const allYears = [
            ...this.nvidiaData.map(d => d.year),
            ...this.amdData.map(d => d.year)
        ];
        const yearRange = allYears.length > 0 ? `${Math.min(...allYears)}-${Math.max(...allYears)}` : '-';

        document.getElementById('totalGPUs').textContent = totalGPUs.toLocaleString();
        document.getElementById('yearRange').textContent = yearRange;
        document.getElementById('nvidiaCount').textContent = nvidiaTotal.toLocaleString();
        document.getElementById('amdCount').textContent = amdTotal.toLocaleString();
        document.getElementById('nvidiaAvgPrice').textContent = `$${nvidiaAvgPrice.toLocaleString()}`;
        document.getElementById('amdAvgPrice').textContent = `$${amdAvgPrice.toLocaleString()}`;
    }

    // 建立所有圖表
    createCharts() {
        // 按年份排序資料
        this.nvidiaData.sort((a, b) => a.year - b.year);
        this.amdData.sort((a, b) => a.year - b.year);
        
        this.createPixelChart();
        this.createTextureChart();
        this.createFP32Chart();
        this.createMemoryChart();
    }

    // 合併年份資料
    getMergedYears() {
        const nvidiaYears = this.nvidiaData.map(d => d.year);
        const amdYears = this.amdData.map(d => d.year);
        const allYears = [...new Set([...nvidiaYears, ...amdYears])].sort((a, b) => a - b);
        return allYears;
    }

    // 根據年份獲取資料
    getDataForYear(data, year, property) {
        const yearData = data.find(d => d.year === year);
        return yearData ? yearData[property] : null;
    }

    // 建立像素填充率圖表
    createPixelChart() {
        const ctx = document.getElementById('pixelChart').getContext('2d');
        const years = this.getMergedYears();
        
        this.charts.pixel = new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [
                    {
                        label: 'NVIDIA 每美元像素填充率',
                        data: [], // 初始為空，透過動畫逐步添加
                        borderColor: '#74B600',
                        backgroundColor: 'rgba(116, 182, 0, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.6,
                        pointBackgroundColor: '#74B600',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 8,
                        spanGaps: true
                    },
                    {
                        label: 'AMD 每美元像素填充率',
                        data: [], // 初始為空，透過動畫逐步添加
                        borderColor: '#DC2626',
                        backgroundColor: 'rgba(220, 38, 38, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.6,
                        pointBackgroundColor: '#DC2626',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 8,
                        spanGaps: true
                    }
                ]
            },
            options: this.getChartOptions('每美元像素填充率 (mGPixel/s/$)')
        });

        // 準備動畫資料
        const nvidiaPixelData = years.map(year => {
            const value = this.getDataForYear(this.nvidiaData, year, 'pixelPerDollar');
            return value ? (value * 1000).toFixed(3) : null;
        });
        const amdPixelData = years.map(year => {
            const value = this.getDataForYear(this.amdData, year, 'pixelPerDollar');
            return value ? (value * 1000).toFixed(3) : null;
        });

        // 啟動動畫
        this.animateCompareChart('pixel', nvidiaPixelData, amdPixelData, 300);
    }

    // 建立紋理填充率圖表
    createTextureChart() {
        const ctx = document.getElementById('textureChart').getContext('2d');
        const years = this.getMergedYears();
        
        this.charts.texture = new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [
                    {
                        label: 'NVIDIA 每美元紋理填充率',
                        data: [],
                        borderColor: '#74B600',
                        backgroundColor: 'rgba(116, 182, 0, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.6,
                        pointBackgroundColor: '#74B600',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 8,
                        spanGaps: true
                    },
                    {
                        label: 'AMD 每美元紋理填充率',
                        data: [],
                        borderColor: '#DC2626',
                        backgroundColor: 'rgba(220, 38, 38, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.6,
                        pointBackgroundColor: '#DC2626',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 8,
                        spanGaps: true
                    }
                ]
            },
            options: this.getChartOptions('每美元紋理填充率 (mGTexel/s/$)')
        });

        // 準備動畫資料
        const nvidiaTextureData = years.map(year => {
            const value = this.getDataForYear(this.nvidiaData, year, 'texturePerDollar');
            return value ? (value * 1000).toFixed(3) : null;
        });
        const amdTextureData = years.map(year => {
            const value = this.getDataForYear(this.amdData, year, 'texturePerDollar');
            return value ? (value * 1000).toFixed(3) : null;
        });

        // 啟動動畫
        this.animateCompareChart('texture', nvidiaTextureData, amdTextureData, 800);
    }

    // 建立FP32性能圖表
    createFP32Chart() {
        const ctx = document.getElementById('fp32Chart').getContext('2d');
        const years = this.getMergedYears();
        
        this.charts.fp32 = new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [
                    {
                        label: 'NVIDIA 每美元FP32性能',
                        data: [],
                        borderColor: '#74B600',
                        backgroundColor: 'rgba(116, 182, 0, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.6,
                        pointBackgroundColor: '#74B600',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 8,
                        spanGaps: true
                    },
                    {
                        label: 'AMD 每美元FP32性能',
                        data: [],
                        borderColor: '#DC2626',
                        backgroundColor: 'rgba(220, 38, 38, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.6,
                        pointBackgroundColor: '#DC2626',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 8,
                        spanGaps: true
                    }
                ]
            },
            options: this.getChartOptions('每美元FP32性能 (GFLOPS/$)')
        });

        // 準備動畫資料
        const nvidiaFP32Data = years.map(year => {
            const value = this.getDataForYear(this.nvidiaData, year, 'fp32PerDollar');
            return value ? value.toFixed(2) : null;
        });
        const amdFP32Data = years.map(year => {
            const value = this.getDataForYear(this.amdData, year, 'fp32PerDollar');
            return value ? value.toFixed(2) : null;
        });

        // 啟動動畫
        this.animateCompareChart('fp32', nvidiaFP32Data, amdFP32Data, 1300);
    }

    // 建立記憶體大小圖表
    createMemoryChart() {
        const ctx = document.getElementById('memoryChart').getContext('2d');
        const years = this.getMergedYears();
        
        this.charts.memory = new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [
                    {
                        label: 'NVIDIA 每美元記憶體大小',
                        data: [],
                        borderColor: '#74B600',
                        backgroundColor: 'rgba(116, 182, 0, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.6,
                        pointBackgroundColor: '#74B600',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 8,
                        spanGaps: true
                    },
                    {
                        label: 'AMD 每美元記憶體大小',
                        data: [],
                        borderColor: '#DC2626',
                        backgroundColor: 'rgba(220, 38, 38, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.6,
                        pointBackgroundColor: '#DC2626',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 8,
                        spanGaps: true
                    }
                ]
            },
            options: this.getChartOptions('每美元記憶體大小 (MB/$)')
        });        // 準備動畫資料
        // 記憶體大小已在後端轉換為統一的 MB 單位
        const nvidiaMemoryData = years.map(year => {
            const value = this.getDataForYear(this.nvidiaData, year, 'memoryPerDollar');
            return value ? value.toFixed(2) : null;
        });
        const amdMemoryData = years.map(year => {
            const value = this.getDataForYear(this.amdData, year, 'memoryPerDollar');
            return value ? value.toFixed(2) : null;
        });

        // 啟動動畫
        this.animateCompareChart('memory', nvidiaMemoryData, amdMemoryData, 1800);
    }

    // 取得圖表配置選項
    getChartOptions(yAxisLabel) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: 40
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#74B600',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#ffffff',
                        font: {
                            size: 11,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    title: {
                        display: true,
                        text: '發布年份',
                        color: '#ffffff',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    min: 0,
                    max: this.getMaxValue(yAxisLabel),
                    ticks: {
                        color: '#ffffff',
                        font: {
                            size: 11,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    title: {
                        display: true,
                        text: yAxisLabel,
                        color: '#ffffff',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        };
    }

    // 取得Y軸最大值
    getMaxValue(yAxisLabel) {
        let maxValue = 0;
        
        if (yAxisLabel.includes('像素')) {
            const nvidiaMax = Math.max(...this.nvidiaData.map(d => d.pixelPerDollar * 1000));
            const amdMax = Math.max(...this.amdData.map(d => d.pixelPerDollar * 1000));
            maxValue = Math.max(nvidiaMax, amdMax);
        } else if (yAxisLabel.includes('紋理')) {
            const nvidiaMax = Math.max(...this.nvidiaData.map(d => d.texturePerDollar * 1000));
            const amdMax = Math.max(...this.amdData.map(d => d.texturePerDollar * 1000));
            maxValue = Math.max(nvidiaMax, amdMax);
        } else if (yAxisLabel.includes('FP32')) {
            const nvidiaMax = Math.max(...this.nvidiaData.map(d => d.fp32PerDollar));
            const amdMax = Math.max(...this.amdData.map(d => d.fp32PerDollar));
            maxValue = Math.max(nvidiaMax, amdMax);
        } else if (yAxisLabel.includes('記憶體')) {
            const nvidiaMax = Math.max(...this.nvidiaData.map(d => d.memoryPerDollar));
            const amdMax = Math.max(...this.amdData.map(d => d.memoryPerDollar));
            maxValue = Math.max(nvidiaMax, amdMax);
        }
        
        return Math.ceil(maxValue * 1.1) || 100;
    }    // 動畫顯示比較圖表資料 - 優化版本，實現絲滑效果
    animateCompareChart(chartName, nvidiaData, amdData, startDelay = 500) {
        const chart = this.charts[chartName];
        if (!chart) return;
        
        // 準備初始空數據
        chart.data.datasets[0].data = Array(nvidiaData.length).fill(null);
        chart.data.datasets[1].data = Array(amdData.length).fill(null);
        
        // 預先計算Y軸的最終範圍
        const allValues = [...nvidiaData.filter(v => v !== null).map(v => parseFloat(v)), 
                          ...amdData.filter(v => v !== null).map(v => parseFloat(v))];
        const maxValue = Math.max(...allValues);
        const minValue = Math.min(...allValues);
        const padding = (maxValue - minValue) * 0.1; // 10% 邊距
        
        // 設定Y軸的固定範圍
        chart.options.scales.y.min = Math.max(0, minValue - padding);
        chart.options.scales.y.max = maxValue + padding;
        
        // 初始更新圖表以應用Y軸範圍
        chart.update('none');
        
        let currentIndex = 0;
        const maxLength = Math.max(nvidiaData.length, amdData.length);
        const animationInterval = 150; // 調整為150ms，保持絲滑效果
        
        const addDataPoint = () => {
            if (currentIndex < maxLength) {
                // 更新NVIDIA數據點
                if (currentIndex < nvidiaData.length && nvidiaData[currentIndex] !== null) {
                    chart.data.datasets[0].data[currentIndex] = parseFloat(nvidiaData[currentIndex]);
                }
                
                // 更新AMD數據點
                if (currentIndex < amdData.length && amdData[currentIndex] !== null) {
                    chart.data.datasets[1].data[currentIndex] = parseFloat(amdData[currentIndex]);
                }
                
                // 使用平滑動畫更新，創造絲滑效果
                chart.update({
                    duration: 200,
                    easing: 'easeOutCubic'
                });
                
                currentIndex++;
                setTimeout(addDataPoint, animationInterval);
            }
        };
        
        // 開始動畫，使用自定義延遲時間
        setTimeout(addDataPoint, startDelay);
    }
}

// 當頁面載入完成後初始化應用程式
document.addEventListener('DOMContentLoaded', function() {
    new CompareChartsApp();
});
