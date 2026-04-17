import React, { useState, useEffect, useRef } from 'react';
import { Settings, TrendingUp, Package, Info, DollarSign, Calculator, Link as LinkIcon, Plus, Trash2, ChevronDown, ChevronUp, Image as ImageIcon, Check, Save, History, ExternalLink, Download, X, Copy, Camera, Users } from 'lucide-react';
import { toJpeg } from 'html-to-image';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export default function App() {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'taking' | 'success'>('idle');
  const [showHistory, setShowHistory] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    return typeof window !== 'undefined' ? (localStorage.getItem('activeUser') || '') : '';
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // 0.0 产品采集记录 (Source History)
  const [sourceHistory, setSourceHistory] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('sourceHistory') : null;
    return saved ? JSON.parse(saved) : [];
  });

  // 0. 产品基础信息 (Product Info)
  const [productInfo, setProductInfo] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('productInfo') : null;
    return saved ? JSON.parse(saved) : { name: '示例产品名称', image: '', link: '' };
  });

  // 0.1 规格变体 (Variants)
  const [variants, setVariants] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('variants') : null;
    return saved ? JSON.parse(saved) : [{ id: '1', color: '黑色', size: 'XL', weight: 500, length: 20, width: 15, height: 10, cost: 30 }];
  });
  const [showVariants, setShowVariants] = useState(false);

  // 1. 全局费率设置 (Global Rates)
  const [rates, setRates] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('rates') : null;
    return saved ? JSON.parse(saved) : { platformComm: 6, affiliateComm: 15, afterSales: 5, adsCost: 10, campaignCost: 5 };
  });

  // 2. 基础成本设置 (Base Costs - RMB)
  const [baseCost, setBaseCost] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('baseCost') : null;
    return saved ? JSON.parse(saved) : { product: 30, domesticFreight: 3, labeling: 2.5 };
  });

  // 3. 各国独立设置 (Country Specifics)
  const [countries, setCountries] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('countries') : null;
    if (saved) return JSON.parse(saved);
    return [
      { id: 'TH', name: '泰国 (Thailand)', flag: '🇹🇭', currency: 'THB', rate: 4.7, intFreightRMB: 8, sellingPriceLocal: 399, targetMargin: 20, mode: 'backward' as 'forward' | 'backward' },
      { id: 'VN', name: '越南 (Vietnam)', flag: '🇻🇳', currency: 'VND', rate: 3400, intFreightRMB: 10, sellingPriceLocal: 199000, targetMargin: 20, mode: 'backward' as 'forward' | 'backward' },
      { id: 'PH', name: '菲律宾 (Philippines)', flag: '🇵🇭', currency: 'PHP', rate: 7.8, intFreightRMB: 12, sellingPriceLocal: 499, targetMargin: 20, mode: 'backward' as 'forward' | 'backward' },
      { id: 'MY', name: '马来西亚 (Malaysia)', flag: '🇲🇾', currency: 'MYR', rate: 0.65, intFreightRMB: 15, sellingPriceLocal: 59, targetMargin: 20, mode: 'backward' as 'forward' | 'backward' },
    ];
  });

  // 4. 定价展示倍数 (Marketing Multiplier)
  const [marketingMultiplier, setMarketingMultiplier] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('marketingMultiplier') : null;
    return saved ? parseFloat(saved) : 2.0;
  });

  // 自动保存逻辑 (Auto-save)
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('productInfo', JSON.stringify(productInfo));
      localStorage.setItem('variants', JSON.stringify(variants));
      localStorage.setItem('rates', JSON.stringify(rates));
      localStorage.setItem('baseCost', JSON.stringify(baseCost));
      localStorage.setItem('countries', JSON.stringify(countries));
      localStorage.setItem('marketingMultiplier', marketingMultiplier.toString());
    }, 1000); // 1秒防抖

    return () => clearTimeout(timer);
  }, [productInfo, variants, rates, baseCost, countries, marketingMultiplier]);

  // 保存设置到 LocalStorage (包含自动截图)
  const handleSave = async () => {
    setSaveStatus('saving');
    
    let pageScreenshot = '';
    // 自动抓取当前页面截图 (极高清晰度采样)
    if (containerRef.current) {
      try {
        pageScreenshot = await toJpeg(containerRef.current, {
          quality: 1.0, 
          backgroundColor: '#f1f5f9',
          pixelRatio: 3.0, // 3.0 采样率确保 Excel 里的图片达到超高清级别
          style: {
            padding: '16px',
            borderRadius: '0'
          }
        });
      } catch (err) {
        console.error('Auto screenshot failed', err);
      }
    }

    // 记录货源历史
    if (productInfo.link && productInfo.link.trim() !== '') {
      // 构造当前定价摘要
      const pricingSummary = countries.map(c => {
        const rate = safeNum(c.rate);
        const sellingPriceRMB = rate > 0 ? safeNum(c.sellingPriceLocal) / rate : 0;
        const totalFeesRMB = sellingPriceRMB * (totalFeePercent);
        const totalCostRMB = totalBaseCostRMB + safeNum(c.intFreightRMB);
        const profitRMB = sellingPriceRMB - totalCostRMB - totalFeesRMB;
        const profitMargin = sellingPriceRMB > 0 ? (profitRMB / sellingPriceRMB) * 100 : 0;
        return `${c.id}:${formatNum(profitMargin)}%`;
      }).join(' | ');

      const newHistory = [
        { 
          name: productInfo.name || '未命名产品', 
          link: productInfo.link, 
          image: productInfo.image,
          pageScreenshot: pageScreenshot, // 存储页面截图
          cost: totalBaseCostRMB,
          summary: pricingSummary,
          time: new Date().toISOString(),
          owner: currentUser || 'public' // 归属用户
        },
        ...sourceHistory.filter(h => h.link !== productInfo.link)
      ].slice(0, 100); // 个人模式支持更多记录
      setSourceHistory(newHistory);
      localStorage.setItem('sourceHistory', JSON.stringify(newHistory));
    }

    localStorage.setItem('productInfo', JSON.stringify(productInfo));
    localStorage.setItem('variants', JSON.stringify(variants));
    localStorage.setItem('rates', JSON.stringify(rates));
    localStorage.setItem('baseCost', JSON.stringify(baseCost));
    localStorage.setItem('countries', JSON.stringify(countries));
    localStorage.setItem('marketingMultiplier', marketingMultiplier.toString());
    
    setSaveStatus('success');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  // 导出历史记录为 Excel (内嵌图片形式 - 高清版)
  const exportHistoryToExcel = async () => {
    if (sourceHistory.length === 0) return;
    setSaveStatus('saving'); // 借用状态显示进度
    
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(' TikTok核算历史');

      // 设置列宽和表头
      worksheet.columns = [
        { header: '产品名称', key: 'name', width: 25 },
        { header: '货源链接', key: 'link', width: 30 },
        { header: '产品图', key: 'productImg', width: 20 },
        { header: '算价页面快照', key: 'analysisImg', width: 60 },
        { header: '概览：利润率分析', key: 'summary', width: 45 },
        { header: '采购成本(RMB)', key: 'cost', width: 15 },
        { header: '记录时间', key: 'time', width: 20 },
      ];

      // 统一样式
      worksheet.getRow(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' } // slate-800
      };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      for (let i = 0; i < sourceHistory.length; i++) {
        const item = sourceHistory[i];
        const rowNumber = i + 2;
        const row = worksheet.addRow({
          name: item.name,
          link: item.link,
          summary: item.summary,
          cost: `¥${item.cost}`,
          time: new Date(item.time).toLocaleString('zh-CN'),
        });

        // 设置行高以便容纳大图
        row.height = 140;
        row.alignment = { vertical: 'middle', wrapText: true, horizontal: 'center' };

        // 1. 插入分析快照 (高清晰度)
        if (item.pageScreenshot) {
          try {
            const snapId = workbook.addImage({
              base64: item.pageScreenshot,
              extension: 'jpeg',
            });
            worksheet.addImage(snapId, {
              tl: { col: 3, row: rowNumber - 1 },
              ext: { width: 440, height: 180 },
              editAs: 'oneCell'
            });
          } catch (e) {
            console.error('Snapshot embed error', e);
          }
        }

        // 2. 插入产品主图 (下载并转码)
        if (item.image) {
          try {
            const resp = await fetch(item.image, { mode: 'cors' });
            const blob = await resp.blob();
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            const base64 = await base64Promise;
            
            const prodId = workbook.addImage({
              base64: base64,
              extension: 'jpeg',
            });
            worksheet.addImage(prodId, {
              tl: { col: 2, row: rowNumber - 1 },
              ext: { width: 140, height: 140 },
              editAs: 'oneCell'
            });
          } catch (e) {
            console.warn('Image skip (CORS or fetch error)', e);
            row.getCell(3).value = '图片载入失败(CORS限制)';
          }
        }
      }

      // 生成 Buffer 并下载
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `TikTok_Pricing_Archive_${new Date().toISOString().split('T')[0]}.xlsx`);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Excel export fatal error', err);
      setSaveStatus('idle');
      alert('导出 Excel 失败，请检查数据量或网络重试。');
    }
  };

  const filteredHistory = sourceHistory.filter(item => {
    if (!currentUser) return item.owner === 'public' || !item.owner;
    return item.owner === currentUser;
  });

  const updateActiveUser = (val: string) => {
    setCurrentUser(val);
    localStorage.setItem('activeUser', val);
  };

  const deleteHistoryItem = (linkToDelete: string) => {
    const updatedHistory = sourceHistory.filter(item => item.link !== linkToDelete);
    setSourceHistory(updatedHistory);
    localStorage.setItem('sourceHistory', JSON.stringify(updatedHistory));
  };

  // 通用处理函数
  const handleRateChange = (key: keyof typeof rates, value: string) => 
    setRates({ ...rates, [key]: value === '' ? 0 : parseFloat(value) });
  
  const handleBaseCostChange = (key: keyof typeof baseCost, value: string) => 
    setBaseCost({ ...baseCost, [key]: value === '' ? 0 : parseFloat(value) });
  
  const addVariant = () => {
    const newVariant = { id: Date.now().toString(), color: '', size: '', weight: 0, length: 0, width: 0, height: 0, cost: baseCost.product };
    setVariants([...variants, newVariant]);
  };

  const removeVariant = (id: string) => {
    if (variants.length > 1) {
      setVariants(variants.filter(v => v.id !== id));
    }
  };

  const updateVariant = (id: string, key: string, value: any) => {
    setVariants(variants.map(v => v.id === id ? { ...v, [key]: value } : v));
    // 如果修改的是第一个变体的成本，同步更新到全局基础成本
    if (id === variants[0].id && key === 'cost') {
      setBaseCost({ ...baseCost, product: value === '' ? 0 : parseFloat(value) });
    }
  };

  const handleCountryChange = (index: number, key: string, value: any) => {
    const newCountries = [...countries];
    // @ts-ignore
    newCountries[index][key] = value === '' ? 0 : value;
    setCountries(newCountries);
  };

  const setGlobalMode = (mode: 'forward' | 'backward') => {
    setCountries(countries.map(c => ({ ...c, mode })));
  };

  // 安全的数值计算
  const safeNum = (val: any) => isNaN(val) || val === '' || val === undefined ? 0 : Number(val);

  // 格式化货币显示
  const formatNum = (num: number, currency = 'RMB') => {
    const safeNumber = safeNum(num);
    if (currency === 'VND') return new Intl.NumberFormat('vi-VN').format(Math.round(safeNumber));
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safeNumber);
  };

  // 汇总全局数据
  const totalFeePercent = (safeNum(rates.platformComm) + safeNum(rates.affiliateComm) + safeNum(rates.afterSales) + safeNum(rates.adsCost) + safeNum(rates.campaignCost)) / 100;
  const totalBaseCostRMB = safeNum(baseCost.product) + safeNum(baseCost.domesticFreight) + safeNum(baseCost.labeling);

  return (
    <div ref={containerRef} className="min-h-screen p-6 max-w-[1240px] mx-auto flex flex-col gap-6 select-none bg-[#f1f5f9]">
      
      {/* Header */}
      <header className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <DollarSign className="w-6 h-6 text-white stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight uppercase leading-none text-ink">定价与利润分析</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="bg-ink text-[10px] text-white px-2 py-0.5 rounded font-bold">TIKTOK 东南亚地区</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
            <div className="pl-2.5">
              <Users className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <input 
              type="text"
              placeholder="输入你的代号/PIN (区分隐私记录)"
              value={currentUser}
              onChange={(e) => updateActiveUser(e.target.value)}
              className="bg-transparent text-[11px] font-bold text-ink outline-none w-32 placeholder:text-slate-300 placeholder:font-normal"
            />
          </div>

          <button 
            onClick={handleSave}
            disabled={saveStatus !== 'idle'}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-lg ${
              saveStatus === 'success' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-ink text-white hover:bg-slate-800 shadow-slate-900/20 active:scale-95'
            }`}
          >
            {saveStatus === 'saving' ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saveStatus === 'success' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saveStatus === 'saving' ? '保存并分析中...' : saveStatus === 'success' ? '已分析并留存' : '分析并保存当前'}
          </button>
          <div className="hidden md:flex flex-col items-end">
            <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1.5 uppercase tracking-wider">
              <Check className="w-3 h-3" /> 数据已实时自动保存
            </div>
            <div className="text-[10px] text-muted/60 mt-0.5 font-mono">上次汇率同步: {new Date().toLocaleDateString('zh-CN')}</div>
          </div>
        </div>
      </header>

      {/* 0. 产品信息录入 (Product Entry) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row gap-6">
        <div className="flex-grow space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted uppercase tracking-wider">产品名称</label>
              <input 
                type="text" 
                placeholder="请输入产品标题..."
                value={productInfo.name}
                onChange={e => setProductInfo({...productInfo, name: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted uppercase tracking-wider flex justify-between">
                <span>采集/货源链接</span>
                <button 
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors capitalize"
                >
                  <History className="w-3 h-3" /> 历史记录
                </button>
              </label>
              <div className="relative">
                <LinkIcon className="absolute left-3.5 top-3 w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="https://..."
                  value={productInfo.link}
                  onChange={e => setProductInfo({...productInfo, link: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                />
                
                {productInfo.link && (
                  <button 
                    onClick={() => {
                      let url = productInfo.link.trim();
                      if (url && !url.startsWith('http')) url = 'https://' + url;
                      window.open(url, '_blank');
                    }}
                    className="absolute right-2 top-2 p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"
                    title="立即跳转到货源链接"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                )}
                
                {showHistory && sourceHistory.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-[240px] overflow-y-auto overflow-x-hidden p-2 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex justify-between items-center px-2 py-1 border-b border-slate-100 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-muted uppercase">
                          {currentUser ? `[ ${currentUser} ] 的记录` : '公共记录'} ({filteredHistory.length})
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={(e) => { e.stopPropagation(); exportHistoryToExcel(); }}
                          className="text-[10px] text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded transition-colors shadow-sm"
                        >
                          <Download className="w-2.5 h-2.5" /> 导出高清 Excel (含图)
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); if (confirm('确认清空所有 50 条记录吗？')) { setSourceHistory([]); localStorage.removeItem('sourceHistory'); } }}
                          className="text-[10px] text-red-500 hover:underline font-bold"
                        >
                          清空
                        </button>
                      </div>
                    </div>
                    {filteredHistory.map((item, idx) => (
                      <div 
                        key={idx} 
                        className="group flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-slate-100"
                        onClick={() => {
                          setProductInfo({...productInfo, name: item.name, link: item.link, image: item.image || ''});
                          setShowHistory(false);
                        }}
                      >
                        <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {item.image ? (
                            <img src={item.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-slate-300" />
                          )}
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[11px] font-bold text-ink line-clamp-1">{item.name}</span>
                            <span className="text-[9px] text-muted whitespace-nowrap">{new Date(item.time).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-blue-500 truncate italic grow">{item.link}</span>
                            {item.pageScreenshot && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const link = document.createElement('a');
                                  link.href = item.pageScreenshot;
                                  link.download = `record_screenshot_${idx}.jpg`;
                                  link.click();
                                }}
                                className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[8px] font-bold flex items-center gap-0.5 hover:bg-blue-100 transition-colors"
                              >
                                <Camera className="w-2.5 h-2.5" /> 截图
                              </button>
                            )}
                          </div>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.link); }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-md transition-all text-slate-300 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {showHistory && sourceHistory.length === 0 && (
                  <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-6 text-center animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="text-slate-300 mb-2 flex justify-center"><History className="w-8 h-8 opacity-20" /></div>
                    <p className="text-xs text-muted font-medium">暂无采集历史记录</p>
                    <p className="text-[10px] text-muted/50 mt-1">保存设置时会自动记录有效的链接</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="pt-2">
            <button 
              onClick={() => setShowVariants(!showVariants)}
              className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
            >
              {showVariants ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                多规格变体管理 ({variants.length})
            </button>
            
            {showVariants && (
              <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 overflow-x-auto">
                <div className="grid grid-cols-[1.2fr_1fr_0.8fr_40px_40px_40px_100px_40px] gap-2 px-2 min-w-[600px]">
                  <span className="text-[9px] font-bold text-muted uppercase">颜色/款式</span>
                  <span className="text-[9px] font-bold text-muted uppercase">尺寸/规格</span>
                  <span className="text-[9px] font-bold text-muted uppercase">体重(g)</span>
                  <span className="text-[9px] font-bold text-muted uppercase text-center">长</span>
                  <span className="text-[9px] font-bold text-muted uppercase text-center">宽</span>
                  <span className="text-[9px] font-bold text-muted uppercase text-center">高</span>
                  <span className="text-[9px] font-bold text-muted uppercase">采购价 (¥)</span>
                  <span></span>
                </div>
                <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1 min-w-[600px]">
                  {variants.map((v) => (
                    <div key={v.id} className="grid grid-cols-[1.2fr_1fr_0.8fr_40px_40px_40px_100px_40px] gap-2 items-center bg-white border border-slate-100 rounded-lg p-2 shadow-sm">
                      <input 
                        className="bg-transparent border-none text-xs font-medium outline-none focus:text-blue-600"
                        value={v.color}
                        placeholder="颜色"
                        onChange={e => updateVariant(v.id, 'color', e.target.value)}
                      />
                      <input 
                        className="bg-transparent border-none text-xs font-medium outline-none focus:text-blue-600"
                        value={v.size}
                        placeholder="规格"
                        onChange={e => updateVariant(v.id, 'size', e.target.value)}
                      />
                      <input 
                        type="number"
                        className="bg-transparent border-none text-xs font-mono font-bold outline-none focus:text-blue-600"
                        value={v.weight}
                        placeholder="g"
                        onChange={e => updateVariant(v.id, 'weight', e.target.value)}
                      />
                      <input 
                        type="number"
                        className="bg-transparent border-none text-xs font-mono font-bold outline-none focus:text-blue-600 text-center"
                        value={v.length}
                        placeholder="L"
                        onChange={e => updateVariant(v.id, 'length', e.target.value)}
                      />
                      <input 
                        type="number"
                        className="bg-transparent border-none text-xs font-mono font-bold outline-none focus:text-blue-600 text-center"
                        value={v.width}
                        placeholder="W"
                        onChange={e => updateVariant(v.id, 'width', e.target.value)}
                      />
                      <input 
                        type="number"
                        className="bg-transparent border-none text-xs font-mono font-bold outline-none focus:text-blue-600 text-center"
                        value={v.height}
                        placeholder="H"
                        onChange={e => updateVariant(v.id, 'height', e.target.value)}
                      />
                      <input 
                        type="number"
                        className="bg-transparent border-none text-xs font-mono font-bold text-blue-600 outline-none"
                        value={v.cost}
                        onChange={e => updateVariant(v.id, 'cost', e.target.value)}
                      />
                      <button 
                        onClick={() => removeVariant(v.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors flex justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={addVariant}
                  className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400 hover:bg-white hover:border-blue-400 hover:text-blue-500 transition-all uppercase"
                >
                  <Plus className="w-3 h-3" /> 添加新规格变体
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="w-full md:w-[240px] shrink-0 space-y-3">
          <label className="text-[10px] font-bold text-muted uppercase tracking-wider block">产品主图 (图片链接)</label>
          <div className="relative group">
            <div className={`aspect-square rounded-2xl border-2 transition-all overflow-hidden flex flex-col items-center justify-center gap-2 ${
              productInfo.image ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50'
            }`}>
              {productInfo.image ? (
                <div className="relative w-full h-full">
                  <img 
                    src={productInfo.image} 
                    alt="Product" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <button 
                    onClick={() => setProductInfo({...productInfo, image: ''})}
                    className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              ) : (
                <>
                  <ImageIcon className="w-8 h-8 text-slate-300" />
                  <p className="text-[10px] text-muted/60 font-medium">预览图展示区</p>
                </>
              )}
            </div>
          </div>
          <div className="relative">
            <ImageIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="此处粘贴图片地址..."
              value={productInfo.image}
              onChange={e => setProductInfo({...productInfo, image: e.target.value})}
              className="w-full bg-slate-100 border border-transparent rounded-xl pl-9 pr-4 py-2 text-[11px] font-bold text-blue-600 focus:bg-white focus:border-blue-500/30 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Top Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_260px] gap-6">
        
        {/* 1. Base Costs */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="card-title">
            <Package className="w-3.5 h-3.5" /> 1. 基础采购成本 (RMB)
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted font-medium">货源/产品原价</span>
              <div className="relative">
                <span className="absolute left-2 top-1.5 text-[10px] text-muted/50 font-mono">¥</span>
                <input 
                  type="number" 
                  value={baseCost.product} 
                  onChange={e => handleBaseCostChange('product', e.target.value)}
                  className="val-input w-24 pl-5"
                />
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted font-medium">国内运费</span>
              <div className="relative">
                <span className="absolute left-2 top-1.5 text-[10px] text-muted/50 font-mono">¥</span>
                <input 
                  type="number" 
                  value={baseCost.domesticFreight} 
                  onChange={e => handleBaseCostChange('domesticFreight', e.target.value)}
                  className="val-input w-24 pl-5"
                />
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted font-medium">人工/贴单费</span>
              <div className="relative">
                <span className="absolute left-2 top-1.5 text-[10px] text-muted/50 font-mono">¥</span>
                <input 
                  type="number" 
                  value={baseCost.labeling} 
                  onChange={e => handleBaseCostChange('labeling', e.target.value)}
                  className="val-input w-24 pl-5"
                />
              </div>
            </div>
            <div className="mt-2 pt-3 border-t border-slate-100 flex justify-between items-center">
              <span className="text-xs font-bold uppercase text-ink/70">成本小计</span>
              <span className="font-mono font-bold text-blue-600">¥ {formatNum(totalBaseCostRMB)}</span>
            </div>
          </div>
        </div>

        {/* 2. Fees Grid */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="card-title">
            <Settings className="w-3.5 h-3.5" /> 2. 平台与运营费率 (%)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: '平台佣金', key: 'platformComm' as keyof typeof rates },
              { label: '达人佣金', key: 'affiliateComm' as keyof typeof rates },
              { label: '售后损耗', key: 'afterSales' as keyof typeof rates },
              { label: '广告推广', key: 'adsCost' as keyof typeof rates },
              { label: '活动费率', key: 'campaignCost' as keyof typeof rates },
            ].map(item => (
              <div key={item.key} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center transition-all hover:border-slate-300">
                <div className="relative inline-block mb-1">
                  <input 
                    type="number" 
                    value={rates[item.key]} 
                    onChange={e => handleRateChange(item.key, e.target.value)}
                    className="w-16 bg-transparent text-center font-mono font-bold text-lg text-blue-600 focus:outline-none"
                  />
                  <span className="absolute -right-3 top-1 text-[10px] font-bold text-muted">%</span>
                </div>
                <div className="text-[9px] uppercase font-bold text-muted tracking-wide">{item.label}</div>
              </div>
            ))}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center flex flex-col justify-center">
              <div className="text-blue-700 font-mono font-bold text-lg leading-none">{(totalFeePercent * 100).toFixed(1)}%</div>
              <div className="text-[9px] uppercase font-bold text-blue-500 mt-1">费率总览</div>
            </div>
          </div>
        </div>

        {/* 3. Global Stats & Actions */}
        <div className="bg-ink rounded-2xl p-5 shadow-xl flex flex-col justify-center gap-4">
          <div className="text-center border-b border-slate-800 pb-4">
            <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-1">销售额扣费总计</div>
            <div className="text-4xl font-black text-white font-mono">{(totalFeePercent * 100).toFixed(1)}<span className="text-lg opacity-50 ml-1">%</span></div>
            <div className="text-[8px] text-slate-500 mt-2 font-mono leading-tight">不含物流及采购成本</div>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-wider text-center">一键同步核算模式</div>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setGlobalMode('backward')}
                  className="group flex flex-col items-center gap-1.5 p-2 rounded-xl border border-slate-700 hover:bg-slate-800 transition-all"
                >
                  <Calculator className="w-4 h-4 text-slate-400 group-hover:text-white" />
                  <span className="text-[9px] font-bold text-slate-400 group-hover:text-white">反推利润</span>
                </button>
                <button 
                  onClick={() => setGlobalMode('forward')}
                  className="group flex flex-col items-center gap-1.5 p-2 rounded-xl border border-slate-700 hover:bg-slate-800 transition-all border-blue-900/50"
                >
                  <TrendingUp className="w-4 h-4 text-blue-400 group-hover:text-blue-300" />
                  <span className="text-[9px] font-bold text-slate-400 group-hover:text-white">正推定价</span>
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-3">
              <div className="bg-slate-800/50 rounded-xl p-2.5 border border-slate-700/50">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">展示定价倍数</span>
                    <span className="text-[8px] text-slate-500 font-medium">前端显示 = 打折价 × 倍数</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-ink px-2 py-1 rounded-lg border border-slate-700">
                    <span className="text-[10px] text-emerald-500 font-black font-mono">x</span>
                    <input 
                      type="number" 
                      step="0.1"
                      min="1"
                      value={marketingMultiplier}
                      onChange={e => setMarketingMultiplier(parseFloat(e.target.value) || 0)}
                      className="w-10 bg-transparent text-white font-mono text-sm font-black focus:outline-none text-center"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 flex-grow">
        {countries.map((country, idx) => {
          // Calculation Logic
          const rate = safeNum(country.rate);
          const sellingPriceLocal = safeNum(country.sellingPriceLocal);
          const intFreightRMB = safeNum(country.intFreightRMB);
          const targetMargin = safeNum(country.targetMargin);

          const sellingPriceRMB = rate > 0 ? sellingPriceLocal / rate : 0;
          
          const feePlatformRMB = sellingPriceRMB * (safeNum(rates.platformComm) / 100);
          const feeAffiliateRMB = sellingPriceRMB * (safeNum(rates.affiliateComm) / 100);
          const feeAfterSalesRMB = sellingPriceRMB * (safeNum(rates.afterSales) / 100);
          const feeAdsRMB = sellingPriceRMB * (safeNum(rates.adsCost) / 100);
          const feeCampaignRMB = sellingPriceRMB * (safeNum(rates.campaignCost) / 100);
          
          const totalFeesRMB = feePlatformRMB + feeAffiliateRMB + feeAfterSalesRMB + feeAdsRMB + feeCampaignRMB;
          const totalCostRMB = totalBaseCostRMB + intFreightRMB;
          
          const profitRMB = sellingPriceRMB - totalCostRMB - totalFeesRMB;
          const profitMargin = sellingPriceRMB > 0 ? (profitRMB / sellingPriceRMB) * 100 : 0;

          const denominator = 1 - totalFeePercent - (targetMargin / 100);
          const suggestedPriceRMB = denominator > 0 ? totalCostRMB / denominator : 0;
          const suggestedPriceLocal = suggestedPriceRMB * rate;

          const isLoss = profitRMB < 0;

          // 提取通用的明细渲染函数 (Helper to render breakdown)
          const renderBreakdown = (currentSellingPriceRMB: number) => {
            const currentBaseCostsItems = [
              { label: '采购成本', value: safeNum(baseCost.product) },
              { label: '国内运费', value: safeNum(baseCost.domesticFreight) },
              { label: '贴单/人工', value: safeNum(baseCost.labeling) },
            ];

            const currentFeePlatformRMB = currentSellingPriceRMB * (safeNum(rates.platformComm) / 100);
            const currentFeeAffiliateRMB = currentSellingPriceRMB * (safeNum(rates.affiliateComm) / 100);
            const currentFeeAfterSalesRMB = currentSellingPriceRMB * (safeNum(rates.afterSales) / 100);
            const currentFeeAdsRMB = currentSellingPriceRMB * (safeNum(rates.adsCost) / 100);
            const currentFeeCampaignRMB = currentSellingPriceRMB * (safeNum(rates.campaignCost) / 100);
            const currentTotalFeesRMB = currentFeePlatformRMB + currentFeeAffiliateRMB + currentFeeAfterSalesRMB + currentFeeAdsRMB + currentFeeCampaignRMB;

            const currentFeeItems = [
              { label: '平台扣点', rmb: currentFeePlatformRMB, local: currentFeePlatformRMB * rate, pct: rates.platformComm },
              { label: '达人佣金', rmb: currentFeeAffiliateRMB, local: currentFeeAffiliateRMB * rate, pct: rates.affiliateComm },
              { label: '售后损耗', rmb: currentFeeAfterSalesRMB, local: currentFeeAfterSalesRMB * rate, pct: rates.afterSales },
              { label: '广告推广', rmb: currentFeeAdsRMB, local: currentFeeAdsRMB * rate, pct: rates.adsCost },
              { label: '活动费率', rmb: currentFeeCampaignRMB, local: currentFeeCampaignRMB * rate, pct: rates.campaignCost },
            ];

            return (
              <div className="pt-2">
                <details className="group">
                  <summary className="flex items-center justify-center gap-1.5 py-1.5 bg-slate-50 rounded-lg text-[10px] font-bold text-slate-500 cursor-pointer hover:bg-slate-100 transition-colors list-none">
                    <Info className="w-3 h-3" /> 点击查看费用明细计算
                  </summary>
                  <div className="mt-2 p-3 bg-slate-900 rounded-xl space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-1">
                      <div className="text-[9px] text-slate-500 uppercase font-black border-b border-slate-800 pb-1">1. 固定支出 (RMB)</div>
                      {currentBaseCostsItems.map(item => (
                        <div key={item.label} className="flex justify-between text-[10px]">
                          <span className="text-slate-400">{item.label}</span>
                          <span className="text-slate-200 font-mono">¥ {formatNum(item.value)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">国际运费</span>
                        <span className="text-slate-200 font-mono">¥ {formatNum(intFreightRMB)}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="text-[9px] text-slate-500 uppercase font-black border-b border-slate-800 pb-1">2. 平台税费 (Local / RMB)</div>
                      {currentFeeItems.map(item => (
                        <div key={item.label} className="flex flex-col gap-0.5 pt-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-400">{item.label} ({item.pct}%)</span>
                            <span className="text-emerald-400 font-bold font-mono">{formatNum(item.local, country.currency)}</span>
                          </div>
                          <div className="text-right text-[9px] text-slate-500 font-mono">≈ ¥ {formatNum(item.rmb)}</div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-[10px] font-bold">
                      <span className="text-blue-400 font-black">总支出合计</span>
                      <span className="text-white font-mono">¥ {formatNum(totalCostRMB + currentTotalFeesRMB)}</span>
                    </div>
                  </div>
                </details>
              </div>
            );
          };

          return (
            <div key={country.id} className="bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              
              {/* Country Header */}
              <div className="p-4 border-b-2 border-ink">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none">{country.flag}</span>
                    <span className="font-extrabold text-base tracking-tight text-ink uppercase">{country.name.split(' (')[0]}</span>
                  </div>
                  <span className="bg-slate-200 text-ink text-[10px] font-mono font-bold px-1.5 py-0.5 rounded leading-none">{country.currency}</span>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="px-4 pt-4">
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button 
                    onClick={() => handleCountryChange(idx, 'mode', 'backward')}
                    className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${
                      country.mode === 'backward' ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
                    }`}
                  >
                    反推：售价算利润
                  </button>
                  <button 
                    onClick={() => handleCountryChange(idx, 'mode', 'forward')}
                    className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${
                      country.mode === 'forward' ? 'bg-white text-blue-600 shadow-sm' : 'text-muted hover:text-blue-600'
                    }`}
                  >
                    正推：利润算定价
                  </button>
                </div>
              </div>

              {/* Data Rows */}
              <div className="p-4 space-y-3 flex-grow">
                <div className="metric-row">
                  <span className="text-muted font-medium">今日汇率</span>
                  <div className="flex items-center gap-1">
                    <input 
                      type="number" 
                      value={country.rate} 
                      onChange={e => handleCountryChange(idx, 'rate', e.target.value)}
                      className="w-16 text-right font-mono font-bold bg-transparent outline-none focus:text-blue-600"
                    />
                  </div>
                </div>
                <div className="metric-row">
                  <span className="text-muted font-medium flex items-center gap-1">国际/头程运费</span>
                  <div className="flex items-center gap-1 font-mono font-bold">
                    <span className="text-[10px] text-muted opacity-50">¥</span>
                    <input 
                      type="number" 
                      value={country.intFreightRMB} 
                      onChange={e => handleCountryChange(idx, 'intFreightRMB', e.target.value)}
                      className="w-14 text-right bg-transparent outline-none focus:text-blue-600"
                    />
                  </div>
                </div>

                {country.mode === 'backward' ? (
                  <>
                    <div className="metric-row !border-slate-300">
                      <span className="text-slate-500 font-medium">打折价格 (输入)</span>
                      <div className="flex items-center gap-1 font-mono font-bold text-slate-600">
                        <input 
                          type="number" 
                          value={country.sellingPriceLocal} 
                          onChange={e => handleCountryChange(idx, 'sellingPriceLocal', e.target.value)}
                          className="w-20 text-right bg-slate-50 rounded px-1 outline-none focus:text-blue-600"
                        />
                        <span className="text-[10px] text-muted font-normal uppercase opacity-60 ml-0.5">{country.currency}</span>
                      </div>
                    </div>
                    <div className="metric-row !border-blue-600 !bg-blue-50/30 -mt-2 rounded-b-lg border-2">
                      <span className="text-[11px] text-blue-700 font-black">前端定价</span>
                      <span className="font-mono text-sm font-black text-blue-600">
                        {formatNum(sellingPriceLocal * marketingMultiplier, country.currency)}
                      </span>
                    </div>
                    <div className="metric-row !border-transparent !pb-0">
                      <span className="text-muted font-medium">折合人民币收入</span>
                      <span className="font-mono font-bold">¥ {formatNum(sellingPriceRMB)}</span>
                    </div>

                    {renderBreakdown(sellingPriceRMB)}

                    <div className={`mt-auto rounded-xl p-4 border text-center transition-colors shadow-sm ${
                      isLoss ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'
                    }`}>
                      <div className="text-[9px] uppercase font-bold text-muted mb-1 tracking-wider opacity-70">预估单票净利润</div>
                      <div className={`text-2xl font-black font-mono leading-none ${
                        isLoss ? 'text-red-500' : 'text-emerald-500'
                      }`}>
                        {isLoss ? '-' : ''}¥ {formatNum(Math.abs(profitRMB))}
                      </div>
                      <div className={`text-[9px] uppercase font-bold mt-2 ${
                        isLoss ? 'text-red-600' : 'text-emerald-600'
                      }`}>
                        {formatNum(profitMargin)}% 利润率
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="metric-row !border-blue-200">
                      <span className="text-blue-700 font-bold">目标利润率 (%)</span>
                      <div className="flex items-center gap-1 font-mono font-bold text-blue-600">
                        <input 
                          type="number" 
                          value={country.targetMargin} 
                          onChange={e => handleCountryChange(idx, 'targetMargin', e.target.value)}
                          className="w-16 text-right bg-blue-50/50 rounded px-1 outline-none"
                        />
                        <span className="text-[10px] text-blue-300">%</span>
                      </div>
                    </div>
                    <div className="metric-row !border-transparent !pb-0">
                      <span className="text-muted font-medium italic">基于以下运费/费率反推</span>
                      <span className="font-mono text-[10px] text-muted">Formula v2</span>
                    </div>

                    {renderBreakdown(suggestedPriceRMB)}

                    <div className="mt-auto bg-blue-600 rounded-xl p-4 text-center shadow-lg shadow-blue-500/20">
                      <div className="text-[9px] uppercase font-bold text-blue-100 mb-1 tracking-wider opacity-70">前端定价</div>
                      <div className="text-2xl font-black font-mono leading-none text-white">
                        {formatNum(suggestedPriceLocal * marketingMultiplier, country.currency)}
                      </div>
                      <div className="text-[9px] font-bold mt-2 text-white flex items-center justify-center gap-1.5 border-t border-blue-500/30 pt-2 bg-blue-700/30 -mx-4 py-1.5">
                        <span className="text-amber-300">打折价格:</span>
                        <span className="font-mono text-sm leading-none text-emerald-400">
                          {formatNum(suggestedPriceLocal, country.currency)}
                        </span>
                      </div>
                      <div className="text-[9px] uppercase font-bold mt-2 text-blue-100 opacity-80">
                        币种: {country.currency}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <footer className="mt-4 pt-4 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 text-[11px] text-muted font-medium">
        <span>核算逻辑： 净利润(RMB) = (前端定价 / 汇率) - (采购成本 + 运费) - (前端定价 / 汇率 * 扣费总率)</span>
        <div className="flex items-center gap-2">
          <span>更新时间： {new Date().toLocaleString('zh-CN')}</span>
        </div>
      </footer>

    </div>
  );
}
