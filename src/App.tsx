import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Settings, TrendingUp, Package, Info, DollarSign, Calculator, Link as LinkIcon, Plus, Trash2, ChevronDown, ChevronUp, Image as ImageIcon, Check, Save, History, ExternalLink, Download, X, Copy, Camera, Users, HelpCircle, Store, Layout, Pencil, Wand2 } from 'lucide-react';
import { toJpeg } from 'html-to-image';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import localforage from 'localforage';

export default function App() {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'taking' | 'success'>('idle');
  const [activeTab, setActiveTab] = useState<'pricing' | 'shops'>('pricing');
  const [shopsSubTab, setShopsSubTab] = useState<'link' | 'activity'>('link');
  const [selectedSite, setSelectedSite] = useState<'泰' | '越' | '菲' | '马'>('泰');
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAddShop, setShowAddShop] = useState(false);
  const [editingShopId, setEditingShopId] = useState<string | null>(null);
  const [shopLinks, setShopLinks] = useState<any[]>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('shopLinks') : null;
    return saved ? JSON.parse(saved) : [];
  });
  const [newShop, setNewShop] = useState({ 
    name: '', 
    image: '', 
    productId: '', 
    sourceUrl: '', // 货源链接
    costPrice: '', // 货源成本价 (默认)
    frontEndPrice: '', // 前端定价 (默认)
    productDiscount: '', // 商品折扣 (默认)
    newProductDiscount: '', // 新商品折扣 (默认)
    flashSale: '', // 秒杀 (默认)
    discountedPrice: '', // 优惠价 (默认)
    price: '', // 这是主售价，旧逻辑兼容
    specs: [] as any[], 
    category: 'link' as 'link' | 'activity' 
  });
  const [currentSpec, setCurrentSpec] = useState('');

  const [currentUser, setCurrentUser] = useState(() => {
    return typeof window !== 'undefined' ? (localStorage.getItem('activeUser') || '') : '';
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // 0.0 产品采集记录 (Source History) - 使用 IndexedDB 避开 5MB 限制
  const [sourceHistory, setSourceHistory] = useState<any[]>([]);

  // 异步加载历史记录
  useEffect(() => {
    const initStorage = async () => {
      try {
        const saved = await localforage.getItem<any[]>('sourceHistory');
        // 迁移逻辑：如果 localStorage 还有旧数据，尝试合并后清除
        const oldSaved = localStorage.getItem('sourceHistory');
        if (oldSaved && !saved) {
          const oldData = JSON.parse(oldSaved);
          setSourceHistory(oldData);
          await localforage.setItem('sourceHistory', oldData);
          localStorage.removeItem('sourceHistory');
        } else if (saved) {
          setSourceHistory(saved);
        }
      } catch (e) {
        console.error('Failed to load history from IndexedDB', e);
      }
    };
    initStorage();
  }, []);

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

  const [lastRateUpdate, setLastRateUpdate] = useState(() => {
    return localStorage.getItem('lastRateUpdate') || '';
  });

  // 1. 各国独立设置 (Country Specifics)
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

  // 1. 各国独立设置 (Auto Exchange Rate Sync)
  useEffect(() => {
    const fetchRates = async () => {
      const today = new Date().toISOString().split('T')[0];
      if (lastRateUpdate === today) return; // 每天只更新一次

      try {
        const response = await fetch('https://open.er-api.com/v6/latest/CNY');
        const data = await response.json();
        
        if (data && data.rates) {
          const newRates = data.rates;
          setCountries(prev => prev.map(c => {
            const countryCode = c.id === 'TH' ? 'THB' : 
                               c.id === 'VN' ? 'VND' : 
                               c.id === 'PH' ? 'PHP' : 
                               c.id === 'MY' ? 'MYR' : '';
            if (countryCode && newRates[countryCode]) {
              return { ...c, rate: parseFloat(newRates[countryCode].toFixed(4)) };
            }
            return c;
          }));
          setLastRateUpdate(today);
          localStorage.setItem('lastRateUpdate', today);
        }
      } catch (error) {
        console.error('Failed to fetch exchange rates:', error);
      }
    };

    fetchRates();
  }, [lastRateUpdate]);

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
      localStorage.setItem('shopLinks', JSON.stringify(shopLinks));
    }, 1000); // 1秒防抖

    return () => clearTimeout(timer);
  }, [productInfo, variants, rates, baseCost, countries, marketingMultiplier, shopLinks]);

  // 保存设置到 LocalStorage (包含自动截图)
  const handleSave = async () => {
    if (saveStatus !== 'idle') return;
    setSaveStatus('saving');
    
    try {
      let pageScreenshot = '';
      // 自动抓取当前页面截图 (极致优化：2.0 采样率)
      if (containerRef.current) {
        try {
          // 给截图增加一个 5 秒的超时限制，防止某些环境下挂起导致按钮卡死
          const screenshotPromise = toJpeg(containerRef.current, {
            quality: 0.8, 
            backgroundColor: '#f1f5f9',
            pixelRatio: 2.0, 
            style: {
              padding: '16px',
              borderRadius: '0'
            }
          });

          const timeoutPromise = new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('Screenshot timeout')), 5000)
          );

          pageScreenshot = await Promise.race([screenshotPromise, timeoutPromise]);
        } catch (err) {
          console.error('Screenshot skipped or failed', err);
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
            pageScreenshot: pageScreenshot,
            cost: totalBaseCostRMB,
            summary: pricingSummary,
            time: new Date().toISOString(),
            owner: currentUser || 'public',
            fullState: {
              productInfo,
              variants,
              rates,
              baseCost,
              countries,
              marketingMultiplier
            }
          },
          ...sourceHistory.filter(h => h.link !== productInfo.link)
        ].slice(0, 100);
        
        setSourceHistory(newHistory);
        await localforage.setItem('sourceHistory', newHistory);
      }

      localStorage.setItem('productInfo', JSON.stringify(productInfo));
      localStorage.setItem('variants', JSON.stringify(variants));
      localStorage.setItem('rates', JSON.stringify(rates));
      localStorage.setItem('baseCost', JSON.stringify(baseCost));
      localStorage.setItem('countries', JSON.stringify(countries));
      localStorage.setItem('marketingMultiplier', marketingMultiplier.toString());
      
      setSaveStatus('success');
      
      // 保存成功后，延迟一小会重置页面
      setTimeout(() => {
        setSaveStatus('idle');
        resetForm();
      }, 1500);
    } catch (err) {
      console.error('Save failed', err);
      // 就算失败也要退回到初始状态，防止按钮一直卡在加载
      setSaveStatus('idle');
      alert('保存失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const resetForm = () => {
    // 保持原有设置，仅清除产品特有数据
    const defaultProduct = { name: '', image: '', link: '' };
    const defaultVariants = [{ id: '1', color: '', size: '', weight: 0, length: 0, width: 0, height: 0, cost: 0 }];
    
    // 保持基础成本里的物流/贴标设置，仅清除产品拿货价
    const updatedBaseCost = { ...baseCost, product: 0 };
    
    // 保持各国的 汇率、运费设置、目标毛利，仅清除售价
    const updatedCountries = countries.map(c => ({
      ...c,
      sellingPriceLocal: 0
    }));

    setProductInfo(defaultProduct);
    setVariants(defaultVariants);
    setBaseCost(updatedBaseCost);
    setCountries(updatedCountries);
    setScreenshotStatus('idle');

    // 同步到本地缓存（确保重新打开软件也是干净的状态，但保留了设置）
    localStorage.setItem('productInfo', JSON.stringify(defaultProduct));
    localStorage.setItem('variants', JSON.stringify(defaultVariants));
    localStorage.setItem('baseCost', JSON.stringify(updatedBaseCost));
    localStorage.setItem('countries', JSON.stringify(updatedCountries));
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
        { header: '概览：利润率信息', key: 'summary', width: 45 },
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

        // 1. 插入快照 (高清晰度)
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

  const addShopLink = () => {
    if (!newShop.name) {
      alert('请填写产品名称');
      return;
    }
    
    // 如果输入框还有没添加进去的规格，自动加上
    let finalSpecs = [...newShop.specs];
    if (currentSpec.trim()) {
      const parts = currentSpec.split(/[\s,，\n]+/).filter(p => p.trim());
      const objects = parts.map(p => ({
        name: p,
        costPrice: newShop.costPrice,
        frontEndPrice: newShop.frontEndPrice,
        productDiscount: newShop.productDiscount,
        newProductDiscount: newShop.newProductDiscount,
        flashSale: newShop.flashSale,
        discountedPrice: newShop.discountedPrice
      }));
      finalSpecs = [...finalSpecs, ...objects];
    }
    
    let links;
    if (editingShopId) {
      links = shopLinks.map(s => s.id === editingShopId ? { ...newShop, specs: finalSpecs, site: selectedSite } : s);
    } else {
      links = [...shopLinks, { ...newShop, specs: finalSpecs, id: Date.now().toString(), site: selectedSite }];
    }
    
    setShopLinks(links);
    setEditingShopId(null);
    setNewShop({ 
      name: '', 
      image: '', 
      productId: '', 
      sourceUrl: '',
      costPrice: '',
      frontEndPrice: '',
      productDiscount: '',
      newProductDiscount: '',
      flashSale: '',
      discountedPrice: '',
      price: '', 
      specs: [],
      category: newShop.category // 保留分类
    });
    setCurrentSpec('');
  };

  const editShopLink = (shop: any) => {
    setNewShop({
      name: shop.name || '',
      image: shop.image || '',
      productId: shop.productId || '',
      sourceUrl: shop.sourceUrl || '',
      costPrice: shop.costPrice || '',
      frontEndPrice: shop.frontEndPrice || '',
      productDiscount: shop.productDiscount || '',
      newProductDiscount: shop.newProductDiscount || '',
      flashSale: shop.flashSale || '',
      discountedPrice: shop.discountedPrice || '',
      price: shop.price || '',
      specs: shop.specs || [],
      category: shop.category || 'link'
    });
    setEditingShopId(shop.id);
    setSelectedSite(shop.site || '泰');
    setShowAddShop(true);
    // 滚动到顶部方便编辑
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addSpec = () => {
    if (currentSpec.trim()) {
      const parts = currentSpec.split(/[\s,，\n]+/).filter(p => p.trim());
      const objects = parts.map(p => ({
        name: p,
        costPrice: newShop.costPrice,
        frontEndPrice: newShop.frontEndPrice,
        productDiscount: newShop.productDiscount,
        newProductDiscount: newShop.newProductDiscount,
        flashSale: newShop.flashSale,
        discountedPrice: newShop.discountedPrice
      }));
      setNewShop(prev => ({ 
        ...prev, 
        specs: [...prev.specs, ...objects] 
      }));
      setCurrentSpec('');
    }
  };

  const removeSpec = (index: number) => {
    setNewShop(prev => ({ ...prev, specs: prev.specs.filter((_, i) => i !== index) }));
  };

  // Helper: 获取站点的实时汇率和币种
  const getSiteRateInfo = (siteName: string) => {
    const siteToId: Record<string, string> = { '泰': 'TH', '越': 'VN', '菲': 'PH', '马': 'MY' };
    const countryId = siteToId[siteName] || siteToId[selectedSite] || 'TH';
    const country = countries.find(c => c.id === countryId);
    return country || countries[0];
  };

  const autoCalcPrices = (cost: string, siteName: string) => {
    const costNum = parseFloat(cost.replace(/[^0-9.]/g, '')) || 0;
    if (costNum === 0) return { frontEndPrice: '', discountedPrice: '' };
    
    const country = getSiteRateInfo(siteName);
    const totalFees = (safeNum(rates.platformComm) + safeNum(rates.affiliateComm) + safeNum(rates.afterSales) + safeNum(rates.adsCost) + safeNum(rates.campaignCost)) / 100;
    const margin = (country.targetMargin || 20) / 100;
    const safetyFactor = 1 - totalFees - margin;
    
    if (safetyFactor <= 0) return { frontEndPrice: 'Error', discountedPrice: 'Error' };

    const costFixed = safeNum(baseCost.domesticFreight) + safeNum(baseCost.labeling);
    const costTotalRMB = costNum + costFixed + safeNum(country.intFreightRMB);
    
    const suggestedPriceRMB = costTotalRMB / safetyFactor;
    const suggestedLocal = Math.ceil(suggestedPriceRMB * country.rate);
    const frontEndLocal = Math.ceil(suggestedLocal * marketingMultiplier);
    
    return {
      frontEndPrice: frontEndLocal.toString(),
      discountedPrice: suggestedLocal.toString()
    };
  };

  const calcUltimatePrice = (item: any) => {
    const base = parseFloat(item.frontEndPrice?.toString().replace(/[^0-9.]/g, '')) || 0;
    if (base === 0) return '---';

    let final = base;

    const applyDisc = (price: number, disc: string) => {
      if (!disc) return price;
      const clean = disc.toString().trim();
      
      // Handle "9折" or "9.5折"
      if (clean.endsWith('折')) {
        const val = parseFloat(clean.replace('折', '')) || 10;
        return price * (val / 10);
      }
      
      // Handle "10%" or just "10" (now treating naked numbers as % off per user request)
      const isPercentText = clean.endsWith('%');
      const val = parseFloat(clean.replace('%', ''));
      
      if (!isNaN(val) && val > 0) {
        // If it's a small decimal like 0.8 (and not explicitly % marked), treat as 8折
        if (val < 1 && !isPercentText) return price * val;
        
        // If it's > 1 or explicitly marked with %, treat as % off (e.g., 10 means 10% off)
        return price * (1 - val / 100);
      }
      return price;
    };

    // Sequential stacking for "Ultimate" projection
    final = applyDisc(final, item.productDiscount);
    final = applyDisc(final, item.newProductDiscount);
    
    // Flash sale (now also supporting percentage off per user request)
    final = applyDisc(final, item.flashSale);

    return Math.ceil(final).toString();
  };

  const currentSiteInfo = useMemo(() => getSiteRateInfo(selectedSite), [selectedSite, countries]);

  // Helper: 格式化转换价格 (RMB -> Local or Local -> RMB)
  const convertCurrency = (val: string, rate: number, direction: 'toLocal' | 'toRMB') => {
    const num = parseFloat(val.replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return null;
    if (direction === 'toLocal') {
      return (num * rate).toPrecision(4);
    } else {
      return (num / rate).toPrecision(4);
    }
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewShop(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePasteImage = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setNewShop(prev => ({ ...prev, image: reader.result as string }));
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const removeShopLink = (id: string) => {
    setShopLinks(shopLinks.filter(s => s.id !== id));
  };

  const updateShopLink = (id: string, field: string, value: any) => {
    setShopLinks(shopLinks.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const updateShopLinkSpec = (shopId: string, specIdx: number, field: string, value: any) => {
    setShopLinks(shopLinks.map(s => {
      if (s.id === shopId) {
        const newSpecs = [...(s.specs || [])];
        if (newSpecs[specIdx]) {
          newSpecs[specIdx] = { ...newSpecs[specIdx], [field]: value };
          return { ...s, specs: newSpecs };
        }
      }
      return s;
    }));
  };

  const deleteHistoryItem = (linkToDelete: string) => {
    const updatedHistory = sourceHistory.filter(item => item.link !== linkToDelete);
    setSourceHistory(updatedHistory);
    localforage.setItem('sourceHistory', updatedHistory).catch(console.error);
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
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            {activeTab === 'pricing' ? <DollarSign className="w-6 h-6 text-white stroke-[2.5]" /> : <Store className="w-6 h-6 text-white stroke-[2.5]" />}
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight uppercase leading-none text-ink">
              {activeTab === 'pricing' ? '定价与利润核算' : '店铺链接管理'}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="bg-ink text-[10px] text-white px-2 py-0.5 rounded font-bold">
                {activeTab === 'pricing' ? 'TIKTOK 东南亚地区' : 'SHOP MANAGER'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-200/50 p-1 rounded-2xl border border-slate-200">
          <button 
            onClick={() => setActiveTab('pricing')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'pricing' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            核算工具
          </button>
          <button 
            onClick={() => setActiveTab('shops')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'shops' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            店铺管理
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          {activeTab === 'pricing' ? (
            <>
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
                onClick={() => setShowHelp(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs bg-slate-50 text-slate-500 border border-slate-200 hover:bg-white transition-all shadow-sm active:scale-95"
                title="查看软件使用说明"
              >
                <HelpCircle className="w-4 h-4" />
                使用说明
              </button>

              <button 
                onClick={resetForm}
                className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs bg-white text-ink border border-slate-200 hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                title="开新的一页 (清空当前)"
              >
                <Plus className="w-4 h-4" />
                新一页
              </button>

              <button 
                onClick={handleSave}
                disabled={saveStatus !== 'idle'}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-lg ${
                  saveStatus === 'success' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-ink text-white hover:bg-slate-800 shadow-slate-900/20 active:scale-95'
                }`}
              >
                {saveStatus === 'saving' ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saveStatus === 'success' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saveStatus === 'saving' ? '正在快速保存...' : saveStatus === 'success' ? '已保存到历史' : '快速保存当前'}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
              <span className="text-[10px] font-black text-ink px-3 uppercase tracking-wider">国家/站点:</span>
              <div className="flex gap-1">
                {(['泰', '越', '菲', '马'] as const).map(site => (
                  <button
                    key={site}
                    onClick={() => setSelectedSite(site)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${selectedSite === site ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {site === '泰' ? '泰国' : site === '越' ? '越南' : site === '菲' ? '菲律宾' : '马来西亚'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      {activeTab === 'pricing' ? (
        <>
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
                          {currentUser ? `[ ${currentUser} ] 的记录` : '公共记录'} ({filteredHistory.length}/100)
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
                          onClick={async (e) => { 
                            e.stopPropagation(); 
                            if (confirm('确认清空所有历史记录吗？')) { 
                              setSourceHistory([]); 
                              await localforage.removeItem('sourceHistory'); 
                            } 
                          }}
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
                          if (item.fullState) {
                            setProductInfo(item.fullState.productInfo);
                            setVariants(item.fullState.variants);
                            setRates(item.fullState.rates);
                            setBaseCost(item.fullState.baseCost);
                            setCountries(item.fullState.countries);
                            if (item.fullState.marketingMultiplier) setMarketingMultiplier(item.fullState.marketingMultiplier);
                          } else {
                            // 兼容旧版数据
                            setProductInfo({...productInfo, name: item.name, link: item.link, image: item.image || ''});
                          }
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
                  <div className="flex flex-col">
                    <span className="text-muted font-medium">今日汇率</span>
                    {lastRateUpdate && (
                      <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">Sync: {lastRateUpdate}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <input 
                      type="number" 
                      value={country.rate} 
                      onChange={e => handleCountryChange(idx, 'rate', e.target.value)}
                      className="w-16 text-right font-mono font-bold bg-transparent outline-none focus:text-blue-600"
                    />
                    <button 
                      onClick={() => setLastRateUpdate('')}
                      className="p-1 text-slate-300 hover:text-blue-500 transition-colors"
                      title="刷新汇率"
                    >
                      <History className="w-3 h-3" />
                    </button>
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

      {/* 定价公式说明文档 (Calculation Methodology) */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-2">
        <div className="bg-slate-800 px-6 py-3 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">算法公式与逻辑详解</h2>
        </div>
        
        <div className="p-6 space-y-8">
          {/* 上部：变量定义 */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="text-[10px] font-black text-slate-500 uppercase mb-3 tracking-widest flex items-center gap-2">
              <span className="w-1 h-3 bg-slate-400 rounded-full"></span> 核心变量定义
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-[10px]">
              <div><span className="text-blue-600 font-bold">成本_总:</span> 总基础成本 (RMB)</div>
              <div><span className="text-blue-600 font-bold">汇率:</span> 实时汇率</div>
              <div><span className="text-blue-600 font-bold">售价_当地:</span> 当地打折后售价</div>
              <div><span className="text-blue-600 font-bold">费率_总%:</span> 综合费率总和 (%)</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* 左侧：正推逻辑 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                <h3 className="text-xs font-black text-ink uppercase">场景 A：已知售价 &rarr; 求利润 (分步计算)</h3>
              </div>
              
              <div className="space-y-4 font-mono text-[11px] leading-relaxed">
                <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                  <div className="text-emerald-600 font-bold mb-1">第一步. 计算总硬性成本 (人民币)</div>
                  <div className="pl-3 py-1 border-l-2 border-emerald-100">
                    <p className="text-ink">成本_总 = 采购原价 + 国内运费 + 贴标费 + 国际/头程运费</p>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                  <div className="text-emerald-600 font-bold mb-1">第二步. 计算当地收入折本币 (人民币)</div>
                  <div className="pl-3 py-1 border-l-2 border-emerald-100">
                    <p className="text-ink">收入_人民币 = 售价_当地 &divide; 汇率</p>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                  <div className="text-emerald-600 font-bold mb-1">第三步. 计算平台变动抽成 (人民币)</div>
                  <div className="pl-3 py-1 border-l-2 border-emerald-100">
                    <p className="text-ink">扣费_人民币 = 收入_人民币 &times; (佣金% + 达人% + 损耗% + 广告% + 营销%)</p>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-md">
                  <div className="text-emerald-700 font-black mb-1">第四步. 结算单票纯利与毛利率</div>
                  <div className="pl-3 py-1 border-l-2 border-emerald-500">
                    <p className="text-ink font-bold">净利润 = 收入_人民币 - 成本_总 - 扣费_人民币</p>
                    <p className="text-emerald-700 font-black mt-1">毛利率% = (净利润 &divide; 收入_人民币) &times; 100%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧：反推逻辑 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                <h3 className="text-xs font-black text-ink uppercase">场景 B：已知目标利润 &rarr; 反推售价 (数学推导)</h3>
              </div>
              
              <div className="space-y-4 font-mono text-[11px] leading-relaxed">
                <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                  <div className="text-blue-600 font-bold mb-1">第一步. 确定利润方程平衡点</div>
                  <div className="pl-3 py-1 border-l-2 border-blue-100 italic opacity-70 text-[10px]">
                    设人民币售价为 X：<br/>
                    X - 成本_总 - (X &times; 费率_总%) = X &times; 目标利润率%
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                  <div className="text-blue-600 font-bold mb-1">第二步. 计算安全收入系数</div>
                  <div className="pl-3 py-1 border-l-2 border-blue-100">
                    <p className="text-ink">系数 = 1 - 费率_总% - 目标利润率%</p>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                  <div className="text-blue-600 font-bold mb-1">第三步. 求出目标人民币售价</div>
                  <div className="pl-3 py-1 border-l-2 border-blue-100">
                    <p className="text-ink font-bold">X = 成本_总 &divide; 系数</p>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-md">
                  <div className="text-blue-700 font-black mb-1">第四步. 转换当地货币及前端显示</div>
                  <div className="pl-3 py-1 border-l-2 border-blue-500">
                    <p className="text-ink font-bold">售价_当地 = X &times; 汇率</p>
                    <p className="text-blue-700 font-black mt-1">前端显示价 = 售价_当地 &times; 营销倍数</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 border-t border-slate-100 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex-shrink-0">
              <Info className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div>
              <h4 className="text-[11px] font-black text-ink uppercase mb-1">专业名词名词解释 (Glossary)</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-y-2 gap-x-6">
                <div className="text-[10px] leading-relaxed"><strong className="text-emerald-700">营销倍数:</strong> 用于前端虚标高价，方便设置大额折扣（如买一送一或5折活动），不影响实际核算利润。</div>
                <div className="text-[10px] leading-relaxed"><strong className="text-emerald-700">售后/营销损耗:</strong> 预估的退货、补发或退款成本，作为安全垫计入费率，降低经营风险。</div>
                <div className="text-[10px] leading-relaxed"><strong className="text-emerald-700">扣费总率:</strong> 平台所有官方扣费（佣金、税等）与各种变动成本（广告、达人佣金）之和。</div>
              </div>
            </div>
          </div>
        </div>
      </section>
      </>
      ) : (
        <div className="flex flex-col gap-6 animate-in slide-in-from-right-4 duration-300">
          {/* Main List - Now Full Width */}
          <div className="w-full bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm flex flex-col min-h-[60vh]">
            <div className="px-10 pt-10 flex justify-between items-center bg-white">
              <div className="flex items-center gap-20">
                <button 
                  onClick={() => {
                    setShopsSubTab('link');
                    setNewShop(prev => ({ ...prev, category: 'link' }));
                  }}
                  className={`relative pb-6 text-[15px] font-bold transition-all ${shopsSubTab === 'link' ? 'text-ink' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  链接管理
                  {shopsSubTab === 'link' && <div className="absolute bottom-0 left-0 w-full h-1 bg-ink rounded-full" />}
                </button>
                <button 
                  onClick={() => {
                    setShopsSubTab('activity');
                    setNewShop(prev => ({ ...prev, category: 'activity' }));
                  }}
                  className={`relative pb-6 text-[15px] font-bold transition-all ${shopsSubTab === 'activity' ? 'text-ink' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  活动链接管理
                  {shopsSubTab === 'activity' && <div className="absolute bottom-0 left-0 w-full h-1 bg-ink rounded-full" />}
                </button>
              </div>
              
              <div className="pb-6 flex items-center gap-2">
                <button 
                  onClick={() => {
                    if (showAddShop) {
                      setEditingShopId(null);
                      setNewShop({ 
                        name: '', 
                        image: '', 
                        productId: '', 
                        sourceUrl: '',
                        costPrice: '',
                        frontEndPrice: '',
                        productDiscount: '',
                        newProductDiscount: '',
                        flashSale: '',
                        discountedPrice: '',
                        price: '', 
                        specs: [],
                        category: newShop.category
                      });
                      setCurrentSpec('');
                    }
                    setShowAddShop(!showAddShop);
                  }}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95 ${showAddShop ? 'bg-slate-200 text-slate-600' : 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'}`}
                >
                  <Plus className={`w-4 h-4 transition-transform ${showAddShop ? 'rotate-45' : ''}`} />
                  {showAddShop ? '取消' : editingShopId ? '取消编辑' : '添加新链接'}
                </button>

                {shopLinks.filter(s => shopsSubTab === 'link' ? (s.category === 'link' || !s.category) : s.category === 'activity').length > 0 && (
                  <button 
                    onClick={() => {
                      if (window.confirm('确认清空当前列表所有链接吗？')) {
                        const otherLinks = shopLinks.filter(s => shopsSubTab === 'link' ? s.category === 'activity' : (s.category === 'link' || !s.category));
                        setShopLinks(otherLinks);
                      }
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 transition-all active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" />
                    清空本页
                  </button>
                )}
              </div>
            </div>

            {showAddShop && (
              <div className="p-10 bg-slate-50 border-y border-slate-100 animate-in slide-in-from-top-4 duration-300">
                <div className="flex flex-col gap-6">
                  {/* Currency Converter Info Bar */}
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-2xl px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                        <span className="text-sm font-black">{currentSiteInfo.flag}</span>
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none mb-1">当前站点汇率 ({currentSiteInfo.currency})</div>
                        <div className="text-sm font-black text-blue-700 leading-none">1 RMB = {currentSiteInfo.rate} {currentSiteInfo.currency}</div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-right">
                        <div className="text-[9px] font-bold text-slate-400 uppercase">汇率基准</div>
                        <div className="text-[10px] font-black text-slate-600">实时核算同步</div>
                      </div>
                    </div>
                  </div>

                  {/* Row 1: Name, Image, Source, ID */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest">产品名字</label>
                      <input 
                        type="text" 
                        placeholder="输入产品标题..."
                        value={newShop.name}
                        onChange={e => setNewShop({...newShop, name: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3 text-xs font-bold focus:border-blue-500 outline-none shadow-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest">产品图片</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="粘贴地址/Ctrl+V"
                          value={newShop.image && !newShop.image.startsWith('data:') ? newShop.image : ''}
                          onChange={e => setNewShop({...newShop, image: e.target.value})}
                          onPaste={handlePasteImage}
                          className="w-full bg-white border border-slate-200 rounded-xl px-5 py-2 text-[11px] font-bold focus:border-blue-500 outline-none shadow-sm"
                        />
                        <label className="flex items-center justify-center p-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors shadow-sm">
                          <ImageIcon className="w-4 h-4 text-slate-400" />
                          <input type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
                        </label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest">货源链接</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="粘贴货源地址..."
                          value={newShop.sourceUrl}
                          onChange={e => setNewShop({...newShop, sourceUrl: e.target.value})}
                          className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3 text-xs font-bold focus:border-blue-500 outline-none shadow-sm"
                        />
                        {newShop.sourceUrl && (
                          <button 
                            onClick={() => window.open(newShop.sourceUrl, '_blank')}
                            className="bg-white border border-slate-200 text-slate-400 hover:text-blue-500 px-3 rounded-xl transition-all shadow-sm flex items-center justify-center"
                            title="访问链接"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest">产品ID</label>
                      <input 
                        type="text" 
                        placeholder="输入 SKU/ID..."
                        value={newShop.productId}
                        onChange={e => setNewShop({...newShop, productId: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3 text-xs font-bold focus:border-blue-500 outline-none shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Row 2: Variants/Specs */}
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest">变体规格 (支持空格/逗号批量添加)</label>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="输入变体 (如: 红色 XL 蓝色)..."
                            value={currentSpec}
                            onChange={e => setCurrentSpec(e.target.value)}
                            onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); addSpec(); } }}
                            className="flex-grow bg-white border border-slate-200 rounded-xl px-5 py-3 text-xs font-bold focus:border-blue-500 outline-none shadow-sm"
                          />
                          <button 
                            onClick={addSpec}
                            className="bg-slate-100 text-slate-500 hover:bg-slate-200 px-4 rounded-xl transition-all shadow-sm"
                            title="添加变体"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        
                        {newShop.specs.length > 0 && (
                          <div className="flex flex-col gap-2 mt-1 px-4 py-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">已添加变体 (垂直排序)</span>
                            {newShop.specs.map((s, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-100 shadow-sm animate-in slide-in-from-left-2 transition-all group">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-bold text-blue-600">{s.name}</span>
                                  <div className="flex gap-3 text-[9px] font-medium text-slate-400">
                                    <span>成本: ¥{s.costPrice || '--'}</span>
                                    <span>定价: {s.frontEndPrice || '--'}</span>
                                    <span>最终: <span className="text-pink-500 font-bold">{s.discountedPrice || '--'}</span></span>
                                  </div>
                                </div>
                                <button onClick={() => removeSpec(idx)} className="text-slate-300 hover:text-rose-500 transition-colors p-1 opacity-0 group-hover:opacity-100">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Sourcing Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest">货源成本价 (RMB)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-3 text-[10px] font-black text-slate-300 pointer-events-none">¥</span>
                        <input 
                          type="text" 
                          placeholder="输入采购成本..."
                          value={newShop.costPrice}
                          onChange={e => {
                            const cost = e.target.value;
                            const calced = autoCalcPrices(cost, selectedSite);
                            setNewShop({
                              ...newShop, 
                              costPrice: cost,
                              frontEndPrice: calced.frontEndPrice,
                              discountedPrice: calced.discountedPrice
                            });
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-10 py-3 text-xs font-bold focus:border-blue-500 outline-none shadow-sm"
                        />
                        {newShop.costPrice && (
                          <div className="absolute right-4 top-3 text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded">
                            ≈ {convertCurrency(newShop.costPrice, currentSiteInfo.rate, 'toLocal')} {currentSiteInfo.currency}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest">前端定价</label>
                        <button 
                          onClick={() => {
                            const calced = autoCalcPrices(newShop.costPrice, selectedSite);
                            setNewShop({
                              ...newShop,
                              frontEndPrice: calced.frontEndPrice,
                              discountedPrice: calced.discountedPrice
                            });
                          }}
                          className="text-[9px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-1.5 py-0.5 rounded transition-colors"
                          title="根据利润率重新核算定价"
                        >
                          <Wand2 className="w-2.5 h-2.5" /> 利润正推
                        </button>
                      </div>
                      <div className="relative">
                        <span className="absolute left-4 top-3 text-[10px] font-black text-pink-300 pointer-events-none">{currentSiteInfo.currency}</span>
                        <input 
                          type="text" 
                          placeholder="输入预设售价..."
                          value={newShop.frontEndPrice}
                          onChange={e => setNewShop({...newShop, frontEndPrice: e.target.value})}
                          className="w-full bg-white border border-slate-200 rounded-xl px-12 py-3 text-xs font-bold focus:border-pink-500 outline-none shadow-sm"
                        />
                        {newShop.frontEndPrice && (
                          <div className="absolute right-4 top-3 text-[10px] font-black text-pink-500 bg-pink-50 px-2 py-0.5 rounded">
                            ≈ ¥ {convertCurrency(newShop.frontEndPrice, currentSiteInfo.rate, 'toRMB')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Discounts and Flash Sale */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest">商品折扣 (%)</label>
                      <div className="relative flex items-center">
                        <span className="absolute right-4 text-[10px] font-black text-emerald-400 pointer-events-none">% OFF</span>
                        <input 
                          type="text" 
                          placeholder="例如: 10"
                          value={newShop.productDiscount}
                          onChange={e => setNewShop({...newShop, productDiscount: e.target.value})}
                          className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3 text-xs font-bold focus:border-blue-500 outline-none shadow-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest">新商品折扣 (%)</label>
                      <div className="relative flex items-center">
                        <span className="absolute right-4 text-[10px] font-black text-emerald-400 pointer-events-none">% OFF</span>
                        <input 
                          type="text" 
                          placeholder="例如: 5"
                          value={newShop.newProductDiscount}
                          onChange={e => setNewShop({...newShop, newProductDiscount: e.target.value})}
                          className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3 text-xs font-bold focus:border-blue-500 outline-none shadow-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest">秒杀 (%)</label>
                      <div className="relative flex items-center">
                        <span className="absolute right-4 text-[10px] font-black text-red-400 pointer-events-none">% OFF</span>
                        <input 
                          type="text" 
                          placeholder="例如: 20"
                          value={newShop.flashSale}
                          onChange={e => setNewShop({...newShop, flashSale: e.target.value})}
                          className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3 text-xs font-bold focus:border-blue-500 outline-none shadow-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest">优惠价</label>
                      <div className="relative">
                        <span className="absolute left-4 top-3 text-[10px] font-black text-slate-300 pointer-events-none">{currentSiteInfo.currency}</span>
                        <input 
                          type="text" 
                          placeholder="最终优惠价"
                          value={newShop.discountedPrice}
                          onChange={e => setNewShop({...newShop, discountedPrice: e.target.value})}
                          className="w-full bg-white border border-slate-200 rounded-xl px-12 py-3 text-xs font-bold focus:border-blue-500 outline-none shadow-sm"
                        />
                        {newShop.discountedPrice && (
                          <div className="absolute right-4 top-3 text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded">
                            ≈ ¥ {convertCurrency(newShop.discountedPrice, currentSiteInfo.rate, 'toRMB')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end border-t border-slate-100 pt-6">
                    <div className="space-y-2 md:col-span-1">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest self-center mb-1">备用主售价 (可选)</label>
                      <input 
                        type="text" 
                        placeholder="旧提示价..."
                        value={newShop.price}
                        onChange={e => setNewShop({...newShop, price: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3 text-[10px] font-bold focus:border-pink-500 outline-none shadow-sm h-10"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <button 
                        onClick={() => {
                          addShopLink();
                          setShowAddShop(false);
                        }}
                        className={`w-full ${shopsSubTab === 'link' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} text-white py-3 rounded-xl text-xs font-black transition-all shadow-lg active:scale-[0.98]`}
                      >
                        {editingShopId ? '保存修改信息' : '保存全部信息'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="p-8 flex-grow">
              <div className="h-full min-h-[460px] bg-white border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center p-12 transition-all">
                {shopLinks.filter(s => {
                  const isCorrectTab = shopsSubTab === 'link' ? (s.category === 'link' || !s.category) : s.category === 'activity';
                  const isCorrectSite = !s.site || s.site === selectedSite;
                  return isCorrectTab && isCorrectSite;
                }).length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-slate-300">
                    <div className="w-24 h-24 bg-slate-50 rounded-3xl flex items-center justify-center mb-8">
                      <Store className="w-12 h-12 opacity-10" />
                    </div>
                    <p className="text-base font-bold text-slate-400">库中暂无链接</p>
                    <p className="text-xs mt-3 font-medium text-slate-300">点击页面顶部“添加新链接”开始录入</p>
                  </div>
                ) : (
                  <div className="flex flex-col w-full border border-slate-100 rounded-3xl overflow-x-auto bg-white shadow-sm">
                    {/* List Header */}
                    <div className="grid grid-cols-[1.5fr_60px_1fr_1fr_2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_80px] min-w-[1500px] gap-4 px-8 py-4 bg-slate-50 border-b border-slate-100 items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">产品名称</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">图片</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">货源链接</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">产品ID</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">变体/规格</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">货源成本</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">前端定价</span>
                        <button 
                          onClick={() => {
                            if (window.confirm('确认根据当前全球核算配置批量重算本页所有定价吗？')) {
                              setShopLinks(shopLinks.map(sl => {
                                if (!sl.site || sl.site === selectedSite) {
                                  const calcedMain = autoCalcPrices(sl.costPrice, sl.site || selectedSite);
                                  const newSpecs = (sl.specs || []).map((s: any) => {
                                    const calcedSpec = autoCalcPrices(s.costPrice, sl.site || selectedSite);
                                    return {
                                      ...s,
                                      frontEndPrice: calcedSpec.frontEndPrice,
                                      discountedPrice: calcedSpec.discountedPrice
                                    };
                                  });
                                  return {
                                    ...sl,
                                    frontEndPrice: calcedMain.frontEndPrice,
                                    discountedPrice: calcedMain.discountedPrice,
                                    specs: newSpecs
                                  };
                                }
                                return sl;
                              }));
                            }
                          }}
                          className="bg-blue-600 text-white p-0.5 rounded shadow-sm hover:scale-110 transition-all"
                          title="批量正推定价 (魔法棒)"
                        >
                          <Wand2 className="w-2 h-2" />
                        </button>
                      </div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">商品折扣</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-[9px]">新商品折扣</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">秒杀</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">优惠价</span>
                      <span className="text-[10px] font-black text-pink-600 uppercase tracking-widest">最终售卖价</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">操作</span>
                    </div>

                    {/* List Content */}
                    <div className="flex flex-col min-w-[1500px]">
                      {shopLinks.filter(s => {
                        const isCorrectTab = shopsSubTab === 'link' ? (s.category === 'link' || !s.category) : s.category === 'activity';
                        const isCorrectSite = !s.site || s.site === selectedSite;
                        return isCorrectTab && isCorrectSite;
                      }).map((shop, idx) => (
                        <div 
                          key={shop.id} 
                          className={`grid grid-cols-[1.5fr_60px_1fr_1fr_2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_80px] gap-4 px-8 py-3 items-center hover:bg-slate-50 transition-colors group ${idx !== 0 ? 'border-t border-slate-50' : ''}`}
                        >
                          {/* 1. Name */}
                          <div className="flex flex-col min-w-0 pr-2">
                            <input 
                              type="text"
                              value={shop.name}
                              onChange={e => updateShopLink(shop.id, 'name', e.target.value)}
                              className="font-extrabold text-ink text-sm truncate tracking-tight bg-transparent border-none outline-none focus:bg-slate-100 rounded px-1 w-full"
                              title={shop.name}
                            />
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${selectedSite === '泰' ? 'bg-blue-50 text-blue-600' : selectedSite === '越' ? 'bg-emerald-50 text-emerald-600' : selectedSite === '菲' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'}`}>
                                {shop.site || '通用'}
                              </span>
                              <span className="text-[8px] font-bold text-slate-400 px-1 border border-slate-100 rounded">
                                汇率: {getSiteRateInfo(shop.site).rate}
                              </span>
                            </div>
                          </div>

                          {/* 2. Image Thumbnail */}
                          <div className="w-10 h-10 bg-slate-50 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0 mx-auto">
                            {shop.image ? (
                              <img src={shop.image} alt={shop.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-4 h-4 text-slate-200" />
                              </div>
                            )}
                          </div>

                          {/* 3. Source Link */}
                          <div className="truncate">
                            <input 
                              type="text"
                              placeholder="货源链接..."
                              value={shop.sourceUrl || ''}
                              onChange={e => updateShopLink(shop.id, 'sourceUrl', e.target.value)}
                              className="text-[10px] text-blue-500 font-bold truncate block bg-transparent border-none outline-none focus:bg-slate-100 rounded px-1 w-full"
                            />
                            {shop.sourceUrl && (
                              <a href={shop.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[8px] text-blue-400 hover:underline mt-0.5 block opacity-50">
                                点击跳转
                              </a>
                            )}
                          </div>

                          {/* 4. Product ID */}
                          <div className="font-mono text-[11px] font-bold text-slate-400 tabular-nums truncate">
                            <input 
                              type="text"
                              placeholder="ID..."
                              value={shop.productId || ''}
                              onChange={e => updateShopLink(shop.id, 'productId', e.target.value)}
                              className="w-full bg-transparent border-none outline-none focus:bg-slate-100 rounded px-1 font-mono text-slate-400 font-bold text-[11px]"
                            />
                          </div>

                          {/* 5. Variants/Specs */}
                          <div className="flex flex-col gap-1.5 py-1">
                            {shop.specs && Array.isArray(shop.specs) && shop.specs.length > 0 ? (
                              shop.specs.map((s: any, sIdx: number) => {
                                const name = typeof s === 'object' && s !== null ? s.name : s;
                                return (
                                  <div key={sIdx} className="bg-slate-100 px-1.5 py-1 rounded border border-slate-200/50 min-h-[24px] flex items-center">
                                    <input 
                                      type="text"
                                      value={name}
                                      onChange={e => updateShopLinkSpec(shop.id, sIdx, 'name', e.target.value)}
                                      className="text-[8px] text-slate-700 font-black leading-none truncate bg-transparent border-none outline-none w-full"
                                    />
                                  </div>
                                );
                              })
                            ) : (
                              <span className="text-[10px] text-slate-300 italic">无规格</span>
                            )}
                          </div>

                          {/* 6. Cost Price */}
                          <div className="flex flex-col gap-1.5 py-1">
                            {shop.specs && Array.isArray(shop.specs) && shop.specs.length > 0 ? (
                              shop.specs.map((s: any, sIdx: number) => (
                                <div key={sIdx} className="text-[10px] font-bold text-slate-500 tabular-nums min-h-[24px] flex items-center">
                                  <span className="text-[8px] opacity-40 mr-0.5">¥</span>
                                  <input 
                                    type="text"
                                    placeholder="--"
                                    value={s.costPrice || ''}
                                    onChange={e => {
                                      const cost = e.target.value;
                                      const calced = autoCalcPrices(cost, shop.site);
                                      setShopLinks(shopLinks.map(sl => {
                                        if (sl.id === shop.id) {
                                          const newSpecs = [...(sl.specs || [])];
                                          if (newSpecs[sIdx]) {
                                            newSpecs[sIdx] = { 
                                              ...newSpecs[sIdx], 
                                              costPrice: cost,
                                              frontEndPrice: calced.frontEndPrice,
                                              discountedPrice: calced.discountedPrice
                                            };
                                            return { ...sl, specs: newSpecs };
                                          }
                                        }
                                        return sl;
                                      }));
                                    }}
                                    className="w-full bg-transparent border-none outline-none focus:bg-slate-100 rounded px-0.5 text-slate-500 font-bold"
                                  />
                                  {s.costPrice && (
                                    <div className="text-[7px] text-blue-400 font-bold ml-0.5 whitespace-nowrap">
                                      ≈{(parseFloat(s.costPrice) * getSiteRateInfo(shop.site).rate).toFixed(1)}{getSiteRateInfo(shop.site).currency}
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="text-[11px] font-bold text-slate-500 tabular-nums flex items-center">
                                <span className="text-[9px] opacity-40 mr-0.5">¥</span>
                                <input 
                                  type="text"
                                  placeholder="--"
                                  value={shop.costPrice || ''}
                                  onChange={e => {
                                    const cost = e.target.value;
                                    const calced = autoCalcPrices(cost, shop.site);
                                    setShopLinks(shopLinks.map(sl => sl.id === shop.id ? { 
                                      ...sl, 
                                      costPrice: cost,
                                      frontEndPrice: calced.frontEndPrice,
                                      discountedPrice: calced.discountedPrice
                                    } : sl));
                                  }}
                                  className="w-full bg-transparent border-none outline-none focus:bg-slate-100 rounded px-0.5 text-slate-500 font-bold"
                                />
                                {shop.costPrice && (
                                  <div className="text-[7px] text-blue-400 font-bold ml-0.5 whitespace-nowrap">
                                    ≈{(parseFloat(shop.costPrice) * getSiteRateInfo(shop.site).rate).toFixed(1)}{getSiteRateInfo(shop.site).currency}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 7. Front End Price */}
                          <div className="flex flex-col gap-1.5 py-1">
                            {shop.specs && Array.isArray(shop.specs) && shop.specs.length > 0 ? (
                              shop.specs.map((s: any, sIdx: number) => {
                                const country = getSiteRateInfo(shop.site);
                                const rate = country.rate;
                                const rmbVal = convertCurrency(s.frontEndPrice || (shop.frontEndPrice || '0'), rate, 'toRMB');
                                return (
                                  <div key={sIdx} className="text-[10px] font-black text-pink-500 tabular-nums min-h-[24px] flex flex-col justify-center items-start leading-none group/cell">
                                    <div className="flex items-center w-full relative group/wand">
                                      <span className="text-[8px] text-pink-300 mr-0.5">{country.currency}</span>
                                      <input 
                                        type="text"
                                        placeholder="--"
                                        value={s.frontEndPrice || ''}
                                        onChange={e => updateShopLinkSpec(shop.id, sIdx, 'frontEndPrice', e.target.value)}
                                        className="w-full bg-transparent border-none outline-none focus:bg-pink-50 rounded px-0.5 text-pink-500 font-black"
                                      />
                                      <button 
                                        onClick={() => {
                                          const calced = autoCalcPrices(s.costPrice, shop.site);
                                          updateShopLinkSpec(shop.id, sIdx, 'frontEndPrice', calced.frontEndPrice);
                                          updateShopLinkSpec(shop.id, sIdx, 'discountedPrice', calced.discountedPrice);
                                        }}
                                        className="absolute right-0 opacity-0 group-hover/wand:opacity-100 hover:text-blue-500 transition-opacity"
                                        title="智能正推定价"
                                      >
                                        <Wand2 className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                    {rmbVal && <span className="text-[7px] text-slate-300 font-bold mt-0.5">≈¥{rmbVal}</span>}
                                  </div>
                                );
                              })
                            ) : (
                              <div className="text-[11px] font-black text-pink-500 tabular-nums flex flex-col items-start leading-none group/rowwand">
                                <div className="flex items-center w-full relative">
                                  <span className="text-[8px] text-pink-300 mr-0.5">{getSiteRateInfo(shop.site).currency}</span>
                                  <input 
                                    type="text"
                                    placeholder="--"
                                    value={shop.frontEndPrice || ''}
                                    onChange={e => updateShopLink(shop.id, 'frontEndPrice', e.target.value)}
                                    className="w-full bg-transparent border-none outline-none focus:bg-pink-50 rounded px-0.5 text-pink-500 font-black"
                                  />
                                  <button 
                                    onClick={() => {
                                      const calced = autoCalcPrices(shop.costPrice, shop.site);
                                      updateShopLink(shop.id, 'frontEndPrice', calced.frontEndPrice);
                                      updateShopLink(shop.id, 'discountedPrice', calced.discountedPrice);
                                    }}
                                    className="absolute right-0 opacity-0 group-hover/rowwand:opacity-100 hover:text-blue-500 transition-opacity"
                                    title="智能正推定价"
                                  >
                                    <Wand2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                                {shop.frontEndPrice && (
                                  <span className="text-[7px] text-slate-300 font-bold mt-0.5">≈¥{convertCurrency(shop.frontEndPrice, getSiteRateInfo(shop.site).rate, 'toRMB')}</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 8. Discount */}
                          <div className="flex flex-col gap-1.5 py-1">
                            {shop.specs && Array.isArray(shop.specs) && shop.specs.length > 0 ? (
                              shop.specs.map((s: any, sIdx: number) => (
                                <div key={sIdx} className="text-[10px] font-bold text-emerald-600 min-h-[24px] flex items-center">
                                  <input 
                                    type="text"
                                    placeholder="--"
                                    value={s.productDiscount || ''}
                                    onChange={e => updateShopLinkSpec(shop.id, sIdx, 'productDiscount', e.target.value)}
                                    className="w-full bg-transparent border-none outline-none focus:bg-emerald-50 rounded px-0.5 text-emerald-600 font-bold"
                                  />
                                  <span className="text-[7px] text-emerald-300 ml-0.5">%</span>
                                </div>
                              ))
                            ) : (
                              <div className="text-[10px] font-bold text-emerald-600 flex items-center">
                                <input 
                                  type="text"
                                  placeholder="--"
                                  value={shop.productDiscount || ''}
                                  onChange={e => updateShopLink(shop.id, 'productDiscount', e.target.value)}
                                  className="w-full bg-transparent border-none outline-none focus:bg-emerald-50 rounded px-0.5 text-emerald-600 font-bold"
                                />
                                <span className="text-[7px] text-emerald-300 ml-0.5">%</span>
                              </div>
                            )}
                          </div>

                          {/* 9. New Discount */}
                          <div className="flex flex-col gap-1.5 py-1">
                            {shop.specs && Array.isArray(shop.specs) && shop.specs.length > 0 ? (
                              shop.specs.map((s: any, sIdx: number) => (
                                <div key={sIdx} className="text-[10px] font-bold text-emerald-600 min-h-[24px] flex items-center">
                                  <input 
                                    type="text"
                                    placeholder="--"
                                    value={s.newProductDiscount || ''}
                                    onChange={e => updateShopLinkSpec(shop.id, sIdx, 'newProductDiscount', e.target.value)}
                                    className="w-full bg-transparent border-none outline-none focus:bg-emerald-50 rounded px-0.5 text-emerald-600 font-bold"
                                  />
                                  <span className="text-[7px] text-emerald-300 ml-0.5">%</span>
                                </div>
                              ))
                            ) : (
                              <div className="text-[10px] font-bold text-emerald-600 flex items-center">
                                <input 
                                  type="text"
                                  placeholder="--"
                                  value={shop.newProductDiscount || ''}
                                  onChange={e => updateShopLink(shop.id, 'newProductDiscount', e.target.value)}
                                  className="w-full bg-transparent border-none outline-none focus:bg-emerald-50 rounded px-0.5 text-emerald-600 font-bold"
                                />
                                <span className="text-[7px] text-emerald-300 ml-0.5">%</span>
                              </div>
                            )}
                          </div>

                          {/* 10. Flash Sale */}
                          <div className="flex flex-col gap-1.5 py-1">
                            {shop.specs && Array.isArray(shop.specs) && shop.specs.length > 0 ? (
                              shop.specs.map((s: any, sIdx: number) => (
                                <div key={sIdx} className="text-[10px] font-bold text-red-500 min-h-[24px] flex items-center">
                                  <input 
                                    type="text"
                                    placeholder="--"
                                    value={s.flashSale || ''}
                                    onChange={e => updateShopLinkSpec(shop.id, sIdx, 'flashSale', e.target.value)}
                                    className="w-full bg-transparent border-none outline-none focus:bg-red-50 rounded px-0.5 text-red-500 font-bold"
                                  />
                                  <span className="text-[7px] text-red-300 ml-0.5">%</span>
                                </div>
                              ))
                            ) : (
                              <div className="text-[10px] font-bold text-red-500 flex items-center">
                                <input 
                                  type="text"
                                  placeholder="--"
                                  value={shop.flashSale || ''}
                                  onChange={e => updateShopLink(shop.id, 'flashSale', e.target.value)}
                                  className="w-full bg-transparent border-none outline-none focus:bg-red-50 rounded px-0.5 text-red-500 font-bold"
                                />
                                <span className="text-[7px] text-red-300 ml-0.5">%</span>
                              </div>
                            )}
                          </div>

                          {/* 11. Discounted Price */}
                          <div className="flex flex-col gap-1.5 py-1">
                            {shop.specs && Array.isArray(shop.specs) && shop.specs.length > 0 ? (
                              shop.specs.map((s: any, sIdx: number) => {
                                const country = getSiteRateInfo(shop.site);
                                const rate = country.rate;
                                const rmbVal = convertCurrency(s.discountedPrice || (shop.discountedPrice || '0'), rate, 'toRMB');
                                return (
                                  <div key={sIdx} className="text-[10px] font-black text-slate-400 tabular-nums min-h-[24px] flex flex-col justify-center items-start leading-none group/cell">
                                    <div className="flex items-center w-full">
                                      <span className="text-[8px] text-slate-300 mr-0.5">{country.currency}</span>
                                      <input 
                                        type="text"
                                        placeholder="--"
                                        value={s.discountedPrice || ''}
                                        onChange={e => updateShopLinkSpec(shop.id, sIdx, 'discountedPrice', e.target.value)}
                                        className="w-full bg-transparent border-none outline-none focus:bg-slate-100 rounded px-0.5 text-slate-400 font-bold"
                                      />
                                    </div>
                                    {rmbVal && <span className="text-[7px] text-slate-200 font-medium">≈¥{rmbVal}</span>}
                                  </div>
                                );
                              })
                            ) : (
                              <div className="text-[11px] font-bold text-slate-400 tabular-nums flex flex-col items-start leading-none">
                                <div className="flex items-center w-full">
                                  <span className="text-[8px] text-slate-300 mr-0.5">{getSiteRateInfo(shop.site).currency}</span>
                                  <input 
                                    type="text"
                                    placeholder="--"
                                    value={shop.discountedPrice || ''}
                                    onChange={e => updateShopLink(shop.id, 'discountedPrice', e.target.value)}
                                    className="w-full bg-transparent border-none outline-none focus:bg-slate-100 rounded px-0.5 text-slate-400 font-bold"
                                  />
                                </div>
                                {shop.discountedPrice && (
                                  <span className="text-[7px] text-slate-200 font-medium">≈¥{convertCurrency(shop.discountedPrice, getSiteRateInfo(shop.site).rate, 'toRMB')}</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 12. Ultimate Selling Price */}
                          <div className="flex flex-col gap-1.5 py-1">
                            {shop.specs && Array.isArray(shop.specs) && shop.specs.length > 0 ? (
                              shop.specs.map((s: any, sIdx: number) => {
                                const country = getSiteRateInfo(shop.site);
                                const rate = country.rate;
                                const ultimate = calcUltimatePrice(s);
                                const rmbVal = ultimate !== '---' ? convertCurrency(ultimate, rate, 'toRMB') : null;
                                return (
                                  <div key={sIdx} className="text-[10px] font-black text-pink-600 tabular-nums min-h-[24px] flex flex-col justify-center items-start leading-none">
                                    <span className="bg-pink-50 px-1 rounded flex items-center gap-0.5">
                                      <span className="text-[7px] opacity-70">{country.currency}</span>
                                      {ultimate}
                                    </span>
                                    {rmbVal && <span className="text-[7px] text-pink-300 font-bold mt-0.5">≈¥{rmbVal}</span>}
                                  </div>
                                );
                              })
                            ) : (
                              <div className="text-[11px] font-black text-pink-600 tabular-nums flex flex-col items-start leading-none">
                                <span className="bg-pink-50 px-1 rounded flex items-center gap-0.5">
                                  <span className="text-[7px] opacity-70">{getSiteRateInfo(shop.site).currency}</span>
                                  {calcUltimatePrice(shop)}
                                </span>
                                {calcUltimatePrice(shop) !== '---' && (
                                  <span className="text-[7px] text-pink-300 font-bold mt-0.5">≈¥{convertCurrency(calcUltimatePrice(shop), getSiteRateInfo(shop.site).rate, 'toRMB')}</span>
                                )}
                              </div>
                            )}
                          </div>

                            {/* 12. Actions */}
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {shop.specs && Array.isArray(shop.specs) && shop.specs.some((s: any) => {
                              const name = typeof s === 'object' && s !== null ? s.name : s;
                              return typeof name === 'string' && name.startsWith('http');
                            }) && (
                              <button 
                                onClick={() => {
                                  const specWithUrl = shop.specs.find((s: any) => {
                                    const name = typeof s === 'object' && s !== null ? s.name : s;
                                    return typeof name === 'string' && name.startsWith('http');
                                  });
                                  const raw = typeof specWithUrl === 'object' && specWithUrl !== null ? specWithUrl.name : specWithUrl;
                                  if (raw) window.open(raw, '_blank');
                                }} 
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="打开变体链接"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button 
                              onClick={() => editShopLink(shop)} 
                              className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                              title="编辑记录"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => removeShopLink(shop.id)} 
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              title="删除记录"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <footer className="mt-auto py-8 border-t border-slate-200/50 flex justify-between items-end text-[11px] font-bold text-slate-400 leading-relaxed">
        <div className="max-w-2xl">
          <span className="text-slate-500 mr-2 uppercase tracking-widest">核算逻辑：</span>
          净利润(RMB) = (前端定价 / 汇率) - (采购成本 + 运费) - (前端定价 / 汇率 * 扣费总率)
        </div>
        <div className="flex items-center gap-2 tabular-nums">
          <span className="text-slate-300 font-black">更新时间:</span>
          {new Date().toISOString().split('T')[0].replace(/-/g, '/')} {new Date().toLocaleTimeString('zh-CN', { hour12: false })}
        </div>
      </footer>

      {/* 使用说明弹窗 (User Guide Modal) */}
      {showHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-ink px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2 text-white">
                <HelpCircle className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-bold tracking-wide">软件使用说明 (User Guide)</h2>
              </div>
              <button onClick={() => setShowHelp(false)} className="text-white/60 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <section>
                <h3 className="text-sm font-black text-ink uppercase mb-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> 1. 快速开始 (快速核算)
                </h3>
                <p className="text-xs text-slate-600 leading-loose pl-3.5">
                  输入产品名称和链接，在“基础成本”中填入单价。<br/>
                  系统会自动同步到东南亚各国。您可以针对不同国家修改汇率和头程运费。
                </p>
              </section>

              <section>
                <h3 className="text-sm font-black text-ink uppercase mb-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> 2. 反推 vs 正推
                </h3>
                <p className="text-xs text-slate-600 leading-loose pl-3.5 italic">
                  <strong>反推模式 (推荐):</strong> 设定目标利润（如 20%），系统自动刷新售价。确保您每一单都不亏损。<br/>
                  <strong>正推模式:</strong> 填入您想卖的价格，系统算出最终扣费后的净利润。
                </p>
              </section>

              <section>
                <h3 className="text-sm font-black text-ink uppercase mb-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> 3. 历史记录与离线存储
                </h3>
                <p className="text-xs text-slate-600 leading-loose pl-3.5">
                  点击顶部“快速保存”，数据将存入您的
                  <strong>电脑本地硬盘</strong>。即便断网，您的 100 条记录也会永久保存（除非您手动清空）。<br/>
                  <strong>隐私说明:</strong> 您的所有数据都不会上传到网络，仅在当前电脑保存。
                </p>
              </section>

              <section>
                <h3 className="text-sm font-black text-ink uppercase mb-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div> 4. 导出交付
                </h3>
                <p className="text-xs text-slate-600 leading-loose pl-3.5">
                  计算完成后，点击“导出高清 Excel”。系统会生成包含产品图、所有核算步骤和各国利润对比的专业报表，可直接分发。
                </p>
              </section>
            </div>
            
            <div className="bg-slate-50 p-4 border-t border-slate-100 text-center">
              <button 
                onClick={() => setShowHelp(false)}
                className="bg-ink text-white px-8 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all active:scale-95"
              >
                我知道了，开始核算
              </button>
            </div>
          </div>
        </div>
      )}

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
