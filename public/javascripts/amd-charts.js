// AMD GPU 圖表應用程式
class AMDChartsApp {
    constructor() {
        this.chartData = [];
        this.charts = {};
        this.loadChartData();
    }

    // 載入圖表資料
    async loadChartData() {
        try {
            document.getElementById('loading').style.display = 'flex';
            document.getElementById('chartsContainer').style.display = 'none';
            
            const response = await fetch('/api/amd-chart-data');
            this.chartData = await response.json();
            
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
        const totalGPUs = this.chartData.reduce((sum, year) => sum + year.gpuCount, 0);
        const years = this.chartData.map(d => d.year);
        const yearRange = years.length > 0 ? `${Math.min(...years)}-${Math.max(...years)}` : '-';
        const avgPrice = this.chartData.length > 0 
            ? Math.round(this.chartData.reduce((sum, year) => sum + year.avgPrice, 0) / this.chartData.length)
            : 0;

        document.getElementById('totalGPUs').textContent = totalGPUs.toLocaleString();
        document.getElementById('yearRange').textContent = yearRange;
        document.getElementById('avgPrice').textContent = `$${avgPrice.toLocaleString()}`;
    }

    // 建立所有圖表
    createCharts() {
        // 按年份排序資料
        this.chartData.sort((a, b) => a.year - b.year);
        
        this.createPixelChart();
        this.createTextureChart();
        this.createFP32Chart();
        this.createMemoryChart();
    }

    // 建立像素填充率圖表
    createPixelChart() {
        const ctx = document.getElementById('pixelChart').getContext('2d');
        
        this.charts.pixel = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.chartData.map(d => d.year),
                datasets: [{
                    label: '每美元像素填充率 (GPixel/s/$)',
                    data: [], // 初始為空，透過動畫逐步添加
                    borderColor: '#DC2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.6, // 增加平滑度
                    pointBackgroundColor: '#DC2626',
                    pointBorderColor: '#FFFFFF',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#DC2626',
                    pointHoverBorderColor: '#000000',
                    pointHoverBorderWidth: 3
                }]
            },
            options: this.getChartOptions('每美元像素填充率 (mGPixel/s/$)')
        });

        // 啟動動畫 - 像素圖表先開始
        this.animateChart('pixel', this.chartData.map(d => (d.pixelPerDollar * 1000).toFixed(3)), 300);
    }

    // 建立紋理填充率圖表
    createTextureChart() {
        const ctx = document.getElementById('textureChart').getContext('2d');
        
        this.charts.texture = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.chartData.map(d => d.year),
                datasets: [{
                    label: '每美元紋理填充率 (GTexel/s/$)',
                    data: [], // 初始為空，透過動畫逐步添加
                    borderColor: '#DC2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.6, // 增加平滑度
                    pointBackgroundColor: '#DC2626',
                    pointBorderColor: '#FFFFFF',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#DC2626',
                    pointHoverBorderColor: '#000000',
                    pointHoverBorderWidth: 3
                }]
            },
            options: this.getChartOptions('每美元紋理填充率 (mGTexel/s/$)')
        });

        // 啟動動畫 - 紋理圖表稍後開始
        this.animateChart('texture', this.chartData.map(d => (d.texturePerDollar * 1000).toFixed(3)), 800);
    }

    // 建立FP32性能圖表
    createFP32Chart() {
        const ctx = document.getElementById('fp32Chart').getContext('2d');
        
        this.charts.fp32 = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.chartData.map(d => d.year),
                datasets: [{
                    label: '每美元FP32性能 (GFLOPS/$)',
                    data: [], // 初始為空，透過動畫逐步添加
                    borderColor: '#DC2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.6, // 增加平滑度
                    pointBackgroundColor: '#DC2626',
                    pointBorderColor: '#FFFFFF',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#DC2626',
                    pointHoverBorderColor: '#000000',
                    pointHoverBorderWidth: 3
                }]
            },            options: this.getChartOptions('每美元FP32性能 (GFLOPS/$)')
        });

        // 啟動動畫 - FP32圖表稍後開始
        // 因為後端已將 TFLOPS 轉換為 GFLOPS，所以這裡直接顯示即可
        this.animateChart('fp32', this.chartData.map(d => d.fp32PerDollar.toFixed(2)), 1300);
    }

    // 建立記憶體大小圖表
    createMemoryChart() {
        const ctx = document.getElementById('memoryChart').getContext('2d');
        
        this.charts.memory = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.chartData.map(d => d.year),
                datasets: [{
                    label: '每美元記憶體大小 (MB/$)',
                    data: [], // 初始為空，透過動畫逐步添加
                    borderColor: '#DC2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.6, // 增加平滑度
                    pointBackgroundColor: '#DC2626',
                    pointBorderColor: '#FFFFFF',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#DC2626',
                    pointHoverBorderColor: '#000000',
                    pointHoverBorderWidth: 3
                }]
            },
            options: this.getChartOptions('每美元記憶體大小 (MB/$)')
        });        // 啟動動畫 - 記憶體圖表最後開始
        // 記憶體大小已在後端轉換為統一的 MB 單位
        this.animateChart('memory', this.chartData.map(d => d.memoryPerDollar.toFixed(2)), 1800);
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
                    borderColor: '#DC2626',
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
                    max: this.getMaxValue(yAxisLabel), // 預設最大值
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
        if (yAxisLabel.includes('像素')) {
            const maxPixel = Math.max(...this.chartData.map(d => d.pixelPerDollar * 1000));
            return Math.ceil(maxPixel * 1.1);
        } else if (yAxisLabel.includes('紋理')) {
            const maxTexture = Math.max(...this.chartData.map(d => d.texturePerDollar * 1000));
            return Math.ceil(maxTexture * 1.1);
        } else if (yAxisLabel.includes('FP32')) {
            const maxFP32 = Math.max(...this.chartData.map(d => d.fp32PerDollar));
            return Math.ceil(maxFP32 * 1.1);
        } else if (yAxisLabel.includes('記憶體')) {
            const maxMemory = Math.max(...this.chartData.map(d => d.memoryPerDollar));
            return Math.ceil(maxMemory * 1.1);
        }
        return 100;
    }    // 動畫顯示圖表資料 - 優化版本，實現絲滑效果
    animateChart(chartName, fullData, startDelay = 500) {
        const chart = this.charts[chartName];
        if (!chart) return;
        
        // 預先計算Y軸的最終範圍
        const maxValue = Math.max(...fullData.map(v => parseFloat(v)));
        const minValue = Math.min(...fullData.map(v => parseFloat(v)));
        const padding = (maxValue - minValue) * 0.1; // 10% 邊距
        
        // 設定Y軸的固定範圍
        chart.options.scales.y.min = Math.max(0, minValue - padding);
        chart.options.scales.y.max = maxValue + padding;
        
        // 初始更新圖表以應用Y軸範圍
        chart.update('none');
        
        let currentIndex = 0;
        const animationInterval = 150; // 調整為150ms，保持絲滑效果
        
        const addDataPoint = () => {
            if (currentIndex < fullData.length) {
                chart.data.datasets[0].data.push(parseFloat(fullData[currentIndex]));
                
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
    new AMDChartsApp();
});
