import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import * as Icons from 'lucide-react';

// --- Constants & Configuration ---

// Safe access for process.env in browser environments
const GOOGLE_API_KEY = typeof process !== 'undefined' ? process.env.API_KEY : undefined;

// Initial Default Data (Used for reset or first load)
const INITIAL_GROUPS = [
    { id: 'life', label: '日常' },
    { id: 'body', label: '身体' },
    { id: 'work', label: '工作' }
];

const INITIAL_CATEGORY_META: Record<string, any> = {
  // Life (日常)
  finance_tracking: { group: 'life', color: 'bg-emerald-500', icon: 'Wallet', label: '记账' },
  diary: { group: 'life', color: 'bg-indigo-500', icon: 'BookHeart', label: '日记/碎碎念' },
  study: { group: 'life', color: 'bg-blue-500', icon: 'GraduationCap', label: '学习' },
  entertainment: { group: 'life', color: 'bg-purple-500', icon: 'Gamepad2', label: '娱乐' },
  movie: { group: 'life', color: 'bg-pink-500', icon: 'Film', label: '观影' },
  reading: { group: 'life', color: 'bg-amber-600', icon: 'BookOpen', label: '读书' },
  dining: { group: 'life', color: 'bg-orange-500', icon: 'Utensils', label: '餐饮' },
  housework: { group: 'life', color: 'bg-cyan-600', icon: 'Home', label: '家务' },
  personal_care: { group: 'life', color: 'bg-rose-400', icon: 'Sparkles', label: '个人护理' },
  
  // Body (身体)
  exercise: { group: 'body', color: 'bg-orange-600', icon: 'Dumbbell', label: '锻炼' },
  sleep: { group: 'body', color: 'bg-slate-500', icon: 'Moon', label: '睡眠' },
  weight: { group: 'body', color: 'bg-lime-600', icon: 'Scale', label: '体重' },
  medical: { group: 'body', color: 'bg-red-500', icon: 'Stethoscope', label: '看病' },
  checkup: { group: 'body', color: 'bg-teal-500', icon: 'Activity', label: '体检' },
  physiology: { group: 'body', color: 'bg-rose-600', icon: 'Droplet', label: '生理期' },

  // Work (工作)
  work: { group: 'work', color: 'bg-sky-600', icon: 'Briefcase', label: '工作' },
  idea: { group: 'work', color: 'bg-yellow-500', icon: 'Lightbulb', label: '灵感' },
  
  // Default fallback
  other: { group: 'life', color: 'bg-gray-500', icon: 'Hash', label: '其他' },
};

// Define Schema types for dynamic form
type FieldType = 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'rating';

interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[]; // For select/multiselect
  unit?: string;
  placeholder?: string;
}

interface GroupDef {
    id: string;
    label: string;
}

// Helper to create standardized schemas
const createSchema = (specificFields: FieldSchema[]): FieldSchema[] => {
    return [
        { key: 'summary', label: '简述', type: 'text', required: true, placeholder: '10字以内具体的事件描述' },
        { key: 'time', label: '时间', type: 'text', required: true, placeholder: 'HH:mm' },
        { key: 'duration', label: '时长', type: 'text', required: false, placeholder: '例如: 30分钟' },
        ...specificFields,
        { key: 'notes', label: '详情', type: 'text', required: true, placeholder: '原始信息全部内容原封不动的填写在这里' }
    ];
};

const INITIAL_SCHEMAS: Record<string, FieldSchema[]> = {
  finance_tracking: createSchema([
    { key: 'transaction_type', label: '交易类型', type: 'select', required: true, options: ['支出', '收入', '转账'] },
    { key: 'amount', label: '金额', type: 'number', required: true, unit: '元' },
    { key: 'currency', label: '货币', type: 'select', required: true, options: ['CNY', 'USD', 'EUR', 'JPY', 'HKD'] },
    { key: 'tags', label: '分类', type: 'multiselect', required: true, options: ['餐饮', '交通', '购物', '娱乐', '医疗', '教育', '住房', '旅行', '人情', '工资', '理财', '其他'] },
    { key: 'payment_method', label: '支付方式', type: 'select', required: false, options: ['微信', '支付宝', '信用卡', '储蓄卡', '现金'] },
    { key: 'merchant', label: '商家/对象', type: 'text', required: false },
  ]),
  movie: createSchema([
    { key: 'title', label: '电影名称', type: 'text', required: true },
    { key: 'genre', label: '类别', type: 'text', required: false },
    { key: 'rating', label: '评分', type: 'rating', required: false }, // 1-5
  ]),
  exercise: createSchema([
    { key: 'type', label: '运动项目', type: 'text', required: true },
    { key: 'calories', label: '消耗卡路里', type: 'number', required: false },
    { key: 'feeling', label: '感受', type: 'text', required: false },
  ]),
  sleep: createSchema([
    { key: 'waketime', label: '醒来时间', type: 'text', required: false },
    { key: 'quality', label: '睡眠质量', type: 'select', required: false, options: ['很好', '还行', '一般', '差'] },
  ]),
  personal_care: createSchema([
    { key: 'item', label: '护理项目', type: 'text', required: true }, // e.g., Skincare, Mask
    { key: 'product', label: '使用产品', type: 'text', required: false },
  ]),
  weight: createSchema([
    { key: 'value', label: '体重(kg)', type: 'number', required: true },
    { key: 'fat_rate', label: '体脂率(%)', type: 'number', required: false },
  ]),
  diary: createSchema([
    { key: 'mood', label: '心情', type: 'text', required: false },
    { key: 'weather', label: '天气', type: 'text', required: false },
  ]),
  reading: createSchema([
      { key: 'book_name', label: '书名', type: 'text', required: true},
      { key: 'author', label: '作者', type: 'text', required: false},
      { key: 'progress', label: '进度', type: 'text', required: false},
  ]),
  dining: createSchema([
      { key: 'food_items', label: '食物', type: 'text', required: true},
      { key: 'calories', label: '热量', type: 'number', required: false}
  ]),
  housework: createSchema([
      { key: 'task', label: '任务', type: 'text', required: true},
      { key: 'area', label: '区域', type: 'text', required: false}
  ]),
  medical: createSchema([
      { key: 'symptom', label: '症状', type: 'text', required: true},
      { key: 'diagnosis', label: '诊断', type: 'text', required: false},
      { key: 'medicine', label: '药物', type: 'text', required: false}
  ],),
  checkup: createSchema([
      { key: 'hospital', label: '医院', type: 'text', required: false},
      { key: 'project', label: '项目', type: 'text', required: true},
      { key: 'result', label: '结果', type: 'text', required: false}
  ]),
  physiology: createSchema([
      { key: 'status', label: '状态', type: 'select', required: true, options: ['开始','结束','流量大','流量小','痛经']},
  ]),
  work: createSchema([
      { key: 'project', label: '项目', type: 'text', required: false},
      { key: 'task', label: '任务', type: 'text', required: true},
      { key: 'status', label: '状态', type: 'select', required: true, options:['进行中','已完成','延期']}
  ]),
  idea: createSchema([
      { key: 'topic', label: '主题', type: 'text', required: true},
  ]),
  study: createSchema([
      { key: 'subject', label: '科目', type: 'text', required: true},
      { key: 'content', label: '内容', type: 'text', required: true},
  ]),
  entertainment: createSchema([
      { key: 'activity', label: '活动', type: 'text', required: true},
      { key: 'partners', label: '同伴', type: 'text', required: false}
  ])
};

// --- Prompts ---

const DEFAULT_CHAT_INSTRUCTIONS = `You are a friendly, empathetic AI assistant in a personal "LifeOS" app.
Your user interacts with you to record their life, emotions, work, and health.
Style: Warm, encouraging, concise, and natural. Use Chinese.
If the user shares good news, celebrate. If bad news, comfort.
You are NOT the database. You are the companion. The database recording happens in the background.
If the user asks about previous records, you can generally refer to "the dashboard".
`;

const DEFAULT_ORGANIZER_INSTRUCTIONS = `You are a strict Data Entry Clerk for a personal database.
Your Goal: Extract structured events from the user's input.
Input: A natural language message (which may contain multiple events) and the Current Date.

**CRITICAL RULES:**
1.  **Atomic Splitting**: If the input contains multiple distinct events (e.g., "Bought lunch for 20 and then watched a movie"), you MUST split them into separate entries.
2.  **Mandatory Fields (Must fill for EVERY entry)**:
    *   \`event\`: The "Title". Must be extremely concise, 1-3 words (e.g., "午餐", "跑步", "买书").
    *   \`details.summary\`: A short description (approx. 10 words) with key context (e.g., "麦当劳双层吉士套餐", "公园慢跑5公里").
    *   \`details.time\`: The time of occurrence in HH:mm format. Infer from context or use current time if unspecified.
    *   \`details.duration\`: Duration string if mentioned (e.g., "30分钟", "2小时"). If not mentioned, leave empty.
3.  **Specific Data Mapping**:
    *   Identify the \`category\` code.
    *   Extract structured data matching that category's specific fields.
4.  **Catch-All Rule**:
    *   Put the original information received into \`details.notes\`. Do not ignore any user details.
5.  **Finance Rules**:
    *   Category: \`finance_tracking\`.
    *   Amount: Negative for expense, Positive for income.
    *   Tags: Infer from '餐饮', '交通', '购物', '娱乐', '医疗', '教育', '住房', '旅行', '人情', '工资', '理财', '其他'.
    *   Currency: Default 'CNY'.

**Output JSON Schema:**
Return an array of objects.
{
  "date": "YYYY-MM-DD",
  "category": "ENUM_CODE",
  "event": "Short Title (1-2 words)",
  "details": {
     "summary": "10 word description",
     "time": "HH:mm",
     "duration": "Duration string (optional)",
     "notes": "All other unstructured info",
     // ... Plus category specific keys
  }
}
`;

const DEFAULT_LOGGER_INSTRUCTIONS = `You are a background logger.
The user has been chatting casually.
Your job: Summarize the last ~30 messages into a single "Diary/Muttering" entry.
Capture: Mood, key topics discussed, interesting thoughts.
Format: A single paragraph, fluent Simplified Chinese.
Category: 'diary'.
Event Title: "闲聊速记".
`;

// --- Interfaces ---

interface Entry {
  id: string;
  date: string; // YYYY-MM-DD
  category: string;
  event: string;
  details: Record<string, any>;
  image?: string; // Base64 data URI
}

interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
  relatedEntryIds?: string[]; // IDs of entries created by this message
}

interface RawLog {
    id: string;
    timestamp: number;
    text: string;
}

interface AISettings {
  chatInstructions: string;
  organizerInstructions: string;
  loggerInstructions: string;
  batchSize: number;
}

interface ChatSettings {
    chatEnabled: boolean;
    organizerEnabled: boolean;
    contextRounds: number; // 9999 for infinite
    contextMode: 'global' | 'today' | 'week' | 'custom';
    customStartDate: string;
    customEndDate: string;
}

// --- Components ---

const IconComponent = ({ name, className }: { name: string; className?: string }) => {
  // Use a safer check for dynamic icon access
  const LucideIcon = (Icons as any)[name] as React.ElementType | undefined;
  if (!LucideIcon) return <Icons.Hash className={className} />;
  return <LucideIcon className={className} />;
};

// --- Helper Functions ---
const formatDate = (date: Date) => {
  // Local YYYY-MM-DD
  const offset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - offset);
  return local.toISOString().split('T')[0];
};

const getRollingWeekRange = (startDate: Date) => {
  const start = new Date(startDate);
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23,59,59,999);
  return { start, end };
};

const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

const renderDetails = (cat: string, details: Record<string, any>) => {
  const standardFields = ['summary', 'time', 'duration', 'notes'];
  
  const renderSpecifics = () => {
    if (cat === 'finance_tracking') {
        return (
          <div className="mt-1 mb-1">
             <div className={`font-mono font-bold text-sm ${details.transaction_type === '收入' ? 'text-emerald-400' : 'text-red-400'}`}>
                 {details.amount ? (details.transaction_type === '支出' && details.amount > 0 ? -details.amount : details.amount) : 0} {details.currency}
             </div>
             {details.merchant && <div className="text-[10px] text-gray-500">@{details.merchant}</div>}
             {details.tags && <div className="flex flex-wrap gap-1 mt-1">{
                 (Array.isArray(details.tags) ? details.tags : [details.tags]).map((t:string, i:number) => (
                     <span key={i} className="bg-gray-700 px-1 rounded text-[10px]">{t}</span>
                 ))
             }</div>}
          </div>
        );
    }
    if (cat === 'movie') {
        return (
            <div className="flex gap-2 items-center mt-1">
              {details.rating && <div className="text-yellow-500 text-xs">{'★'.repeat(Math.round(details.rating))}</div>}
              {details.genre && <div className="text-[10px] bg-pink-900/50 px-1 rounded text-pink-300">{details.genre}</div>}
            </div>
        );
    }
    // Default fallback loop for non-standard fields
    return Object.entries(details).map(([k, v]) => {
        if (standardFields.includes(k) || !v) return null;
        if (k === 'type' && cat === 'exercise') return null; 
        return <div key={k} className="text-[10px]"><span className="opacity-50 mr-1 capitalize">{k.replace(/_/g, ' ')}:</span>{String(v)}</div>;
    });
  };

  return (
      <div className="w-full">
          {/* Standard Fields Header */}
          <div className="flex justify-between items-start text-[10px] text-gray-500 mb-1 border-b border-gray-700/50 pb-1">
              <span className="text-gray-300 font-medium line-clamp-2 flex-1 mr-2" title={details.summary}>{details.summary}</span>
              <div className="text-right whitespace-nowrap">
                  <span className="font-mono text-blue-300">{details.time}</span>
                  {details.duration && <span className="ml-1 text-gray-600">({details.duration})</span>}
              </div>
          </div>
          {renderSpecifics()}
          {details.notes && (
              <div className="mt-1 pt-1 border-t border-gray-700/50 text-[10px] text-gray-400 italic">
                  Note: {details.notes}
              </div>
          )}
      </div>
  );
};

// --- Dashboard View Component ---

interface DashboardViewProps {
  entries: Entry[];
  viewDate: Date;
  viewMode: 'day' | 'week' | 'month';
  setViewDate: (date: Date) => void;
  setViewMode: (mode: 'day' | 'week' | 'month') => void;
  setEditingEntry: (entry: Entry) => void;
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  rawLogs: RawLog[];
  setRawLogs: React.Dispatch<React.SetStateAction<RawLog[]>>;
  groups: GroupDef[];
  categoryMeta: Record<string, any>;
}

const DashboardView = ({ 
  entries, 
  viewDate, 
  viewMode, 
  setViewDate, 
  setViewMode, 
  setEditingEntry, 
  setEntries,
  rawLogs,
  setRawLogs,
  groups,
  categoryMeta
}: DashboardViewProps) => {
    const [isLogView, setIsLogView] = useState(false);
    const [editingLogId, setEditingLogId] = useState<string | null>(null);
    const [editingLogText, setEditingLogText] = useState('');
    
    // WEEK VIEW STATE
    const [weekViewType, setWeekViewType] = useState<'calendar' | 'category'>('calendar');
    const [weekCategoryFilter, setWeekCategoryFilter] = useState<'all' | string>('all');
    const [expandedWeekIds, setExpandedWeekIds] = useState<Set<string>>(new Set());

    const filteredEntries = useMemo(() => {
        return entries.filter((e: Entry) => {
            if (!e.date) return false;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return false;
            
            const eDate = new Date(e.date + "T00:00:00"); 
            if (isNaN(eDate.getTime())) return false;

            if (viewMode === 'day') {
                return isSameDay(eDate, viewDate);
            } else if (viewMode === 'week') {
                const { start, end } = getRollingWeekRange(viewDate);
                return eDate >= start && eDate <= end;
            } else {
                return eDate.getMonth() === viewDate.getMonth() && eDate.getFullYear() === viewDate.getFullYear();
            }
        });
    }, [entries, viewMode, viewDate]);

    const handleDeleteEntry = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        e.preventDefault();
        if (window.confirm("Delete this entry?")) {
             setEntries(prev => prev.filter(entry => entry.id !== id));
        }
    };

    // Grouping
    const groupedCategories: Record<string, string[]> = {};
    groups.forEach(g => groupedCategories[g.id] = []);
    Object.entries(categoryMeta).forEach(([key, meta]) => {
        if (groupedCategories[meta.group]) groupedCategories[meta.group].push(key);
    });

    const filteredRawLogs = useMemo(() => {
        if (!rawLogs) return [];
        return rawLogs.filter((log: RawLog) => {
             const d = new Date(log.timestamp);
             if (viewMode === 'day') return isSameDay(d, viewDate);
             if (viewMode === 'week') {
                const { start, end } = getRollingWeekRange(viewDate);
                return d >= start && d <= end;
             }
             return d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear();
        }).sort((a: RawLog, b: RawLog) => b.timestamp - a.timestamp);
    }, [rawLogs, viewDate, viewMode]);

    const handleSaveLogEdit = (id: string) => {
        setRawLogs((prev: RawLog[]) => prev.map(log => 
            log.id === id ? { ...log, text: editingLogText } : log
        ));
        setEditingLogId(null);
    };

    const handleDeleteLog = (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); 
        if (window.confirm("Are you sure you want to delete this log?")) {
             setRawLogs((prev: RawLog[]) => prev.filter(log => log.id !== id));
        }
    };

    // --- Helper for Week View Logic ---
    const toggleWeekId = (id: string) => {
        setExpandedWeekIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAllWeekIds = () => {
        if (expandedWeekIds.size === filteredEntries.length) {
            setExpandedWeekIds(new Set()); // Collapse all
        } else {
            setExpandedWeekIds(new Set(filteredEntries.map(e => e.id))); // Expand all
        }
    };

    // --- RENDERERS ---

    const renderCard = (catKey: string) => {
        const meta = categoryMeta[catKey] || categoryMeta['other'];
        const catEntries = filteredEntries.filter((e: Entry) => e.category === catKey);
        
        return (
            <div key={catKey} className={`rounded-xl border border-gray-800 bg-gray-900/50 flex flex-col h-[280px] overflow-hidden group`}>
                <div className={`px-3 py-2 flex items-center justify-between bg-gray-900/80 border-b border-gray-800/50`}>
                    <div className="flex items-center gap-2">
                         <div className={`p-1.5 rounded-lg ${meta.color} text-white`}>
                             <IconComponent name={meta.icon} className="w-3.5 h-3.5" />
                         </div>
                         <span className="font-medium text-sm text-gray-300">{meta.label}</span>
                    </div>
                    <button onClick={() => {
                        const now = new Date();
                        const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        const newEntry: Entry = {
                            id: Math.random().toString(36).substr(2,9),
                            date: formatDate(viewDate),
                            category: catKey,
                            event: 'New Event',
                            details: {
                                summary: 'New entry',
                                time: timeStr,
                                notes: ''
                            }
                        };
                        setEntries((prev: Entry[]) => [...prev, newEntry]);
                        setEditingEntry(newEntry);
                    }} className="text-gray-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                        <Icons.Plus className="w-4 h-4" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {catEntries.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-700 text-xs italic">
                            No records
                        </div>
                    ) : (
                        catEntries.map((e: Entry) => (
                            <div key={e.id} className="bg-gray-800/50 rounded p-2 text-xs relative group/item hover:bg-gray-800 transition-colors border border-gray-800/50">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold text-gray-200 line-clamp-1 text-sm">{e.event}</span>
                                    <div className="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity absolute top-2 right-2 bg-gray-900/90 rounded px-1 z-20">
                                        <button 
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                event.preventDefault();
                                                setEditingEntry(e);
                                            }} 
                                            className="text-blue-400 hover:text-blue-300 p-1"
                                        >
                                            <Icons.Pencil className="w-3 h-3" />
                                        </button>
                                        <button 
                                            onClick={(event) => handleDeleteEntry(event, e.id)} 
                                            className="text-red-400 hover:text-red-300 p-1"
                                        >
                                            <Icons.Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-gray-400 space-y-0.5">
                                    {renderDetails(catKey, e.details)}
                                    {e.image && (
                                        <img src={`data:image/jpeg;base64,${e.image}`} className="w-8 h-8 object-cover rounded mt-1 cursor-pointer hover:scale-150 transition-transform" />
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    // --- Week View: Calendar Mode (Flexible Rolling Week) ---
    const renderWeekCalendar = () => {
        // Use Rolling Week for custom flexible range
        const { start, end } = getRollingWeekRange(viewDate);
        
        // Helper to shift viewDate day by day
        const shiftDay = (days: number) => {
            const next = new Date(viewDate);
            next.setDate(next.getDate() + days);
            setViewDate(next);
        };

        const days = Array.from({length: 7}, (_, i) => {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            return d;
        });
        
        // Format range text
        const rangeText = `${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`;

        return (
            <div className="flex flex-col h-full overflow-hidden">
                {/* Rolling Week Navigation Header */}
                <div className="flex items-center justify-between mb-3 px-1">
                    <button 
                        onClick={() => shiftDay(-1)}
                        className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border border-gray-700"
                        title="Previous Day"
                    >
                        <Icons.ChevronLeft className="w-4 h-4" />
                    </button>
                    
                    <span className="font-bold text-gray-300 text-sm tracking-wide font-mono bg-gray-900/50 px-4 py-1.5 rounded-full border border-gray-800">
                        {rangeText}
                    </span>
                    
                    <button 
                        onClick={() => shiftDay(1)}
                        className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border border-gray-700"
                        title="Next Day"
                    >
                        <Icons.ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 flex-1 overflow-y-auto sm:overflow-hidden min-h-[500px]">
                    {days.map((day) => {
                        const isToday = isSameDay(day, new Date());
                        const dayEntries = filteredEntries.filter(e => isSameDay(new Date(e.date + "T00:00:00"), day));
                        const dayStr = formatDate(day);
                        
                        return (
                            <div key={dayStr} className={`flex flex-col bg-gray-900/30 border ${isToday ? 'border-blue-500/50 bg-blue-900/5' : 'border-gray-800'} rounded-lg overflow-hidden`}>
                                {/* Day Header */}
                                <button 
                                    onClick={() => {
                                        setViewDate(day);
                                        setViewMode('day');
                                    }}
                                    className={`p-2 text-center border-b ${isToday ? 'border-blue-500/30 bg-blue-900/20' : 'border-gray-800 bg-gray-900/50'} hover:bg-gray-800 transition-colors`}
                                >
                                    <div className={`text-xs uppercase font-bold mb-1 ${isToday ? 'text-blue-400' : 'text-gray-500'}`}>
                                        {day.toLocaleDateString('en-US', { weekday: 'short' })}
                                    </div>
                                    <div className={`text-sm font-mono ${isToday ? 'text-white' : 'text-gray-300'}`}>
                                        {day.getDate()}
                                    </div>
                                </button>

                                {/* Events List */}
                                <div className="flex-1 p-2 space-y-1.5 overflow-y-auto custom-scrollbar">
                                    {dayEntries.length === 0 ? (
                                        <div className="h-full flex items-center justify-center">
                                            <span className="text-[10px] text-gray-700 select-none">-</span>
                                        </div>
                                    ) : (
                                        dayEntries.map(e => {
                                            const meta = categoryMeta[e.category] || categoryMeta['other'];
                                            return (
                                                <button 
                                                    key={e.id}
                                                    onClick={() => setEditingEntry(e)}
                                                    className="w-full text-left group relative bg-gray-800/80 hover:bg-gray-700 border border-gray-700/50 rounded p-1.5 transition-all"
                                                >
                                                    <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l ${meta.color}`} />
                                                    <div className="pl-2">
                                                        <div className="text-[10px] font-bold text-gray-200 line-clamp-1 leading-tight">{e.event}</div>
                                                        <div className="text-[9px] text-gray-500 font-mono mt-0.5">{e.details.time}</div>
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // --- Week View: Category List Mode ---
    const renderWeekCategoryList = () => {
        const activeGroups = weekCategoryFilter === 'all' 
            ? groups.map(g => g.id)
            : [weekCategoryFilter];

        const activeCategories = Object.keys(categoryMeta).filter(catKey => {
            const meta = categoryMeta[catKey];
            if (!activeGroups.includes(meta.group)) return false;
            return filteredEntries.some(e => e.category === catKey);
        });

        if (activeCategories.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                     <Icons.Filter className="w-8 h-8 mb-2 opacity-50"/>
                     <p className="text-sm">No events found for this filter.</p>
                </div>
            );
        }

        return (
            <div className="space-y-4 max-w-4xl mx-auto">
                {activeCategories.map(catKey => {
                    const meta = categoryMeta[catKey];
                    const catEntries = filteredEntries.filter(e => e.category === catKey)
                        .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                    return (
                        <div key={catKey} className="bg-gray-900/40 border border-gray-800 rounded-xl overflow-hidden animate-fade-in">
                            <div className="bg-gray-900/80 px-4 py-2 border-b border-gray-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-lg ${meta.color} text-white`}>
                                        <IconComponent name={meta.icon} className="w-4 h-4" />
                                    </div>
                                    <span className="font-bold text-gray-200 text-sm">{meta.label}</span>
                                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{catEntries.length}</span>
                                </div>
                            </div>
                            
                            <div className="divide-y divide-gray-800/50">
                                {catEntries.map(entry => {
                                    const isExpanded = expandedWeekIds.has(entry.id);
                                    return (
                                        <div key={entry.id} className="bg-gray-800/20 hover:bg-gray-800/40 transition-colors">
                                            <div 
                                                onClick={() => toggleWeekId(entry.id)}
                                                className="px-4 py-3 flex items-center gap-4 cursor-pointer group select-none"
                                            >
                                                <div className={`text-gray-600 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                                    <Icons.ChevronRight className="w-4 h-4" />
                                                </div>

                                                <div className="w-20 shrink-0 text-xs font-mono text-gray-500 flex flex-col items-center border-r border-gray-800/50 pr-2">
                                                    <span className="font-bold text-gray-400">{entry.date.slice(5)}</span>
                                                    <span className="text-[10px] uppercase opacity-70">
                                                        {new Date(entry.date).toLocaleDateString('en-US', {weekday:'short'})}
                                                    </span>
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-sm font-bold text-gray-200 truncate">{entry.event}</span>
                                                        <span className="text-xs text-blue-400/80 font-mono">{entry.details.time}</span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 truncate mt-0.5 pr-2">
                                                        {entry.details.summary}
                                                    </div>
                                                </div>

                                                <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setEditingEntry(entry); }}
                                                        className="p-1.5 hover:bg-gray-700 rounded text-blue-400"
                                                    >
                                                        <Icons.Pencil className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className="px-4 pb-4 pl-12 bg-gray-900/30 border-t border-gray-800/30 animate-fade-in">
                                                    <div className="pt-2 text-gray-400 text-xs">
                                                        {renderDetails(entry.category, entry.details)}
                                                        {entry.image && (
                                                            <img src={`data:image/jpeg;base64,${entry.image}`} className="w-24 h-24 object-cover rounded mt-2 border border-gray-700" />
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderTimeline = () => {
        if (filteredEntries.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-500 space-y-6">
                    <div className="p-4 rounded-full bg-gray-800/50">
                        <Icons.Clock className="w-12 h-12 opacity-50" />
                    </div>
                    <p className="text-sm">No events recorded for this day.</p>
                    <div className="grid grid-cols-4 gap-4">
                        {['finance_tracking', 'diary', 'work', 'exercise'].map(cat => {
                             const meta = categoryMeta[cat] || INITIAL_CATEGORY_META['other'];
                             return (
                                 <button 
                                     key={cat}
                                     onClick={() => {
                                         const now = new Date();
                                         const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                                         const newEntry = {
                                             id: Math.random().toString(36).substr(2,9),
                                             date: formatDate(viewDate),
                                             category: cat,
                                             event: 'New Event',
                                             details: { summary: 'New entry', time: timeStr, notes: '' }
                                         };
                                         setEntries(prev => [...prev, newEntry]);
                                         setEditingEntry(newEntry);
                                     }}
                                     className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors border border-gray-700 hover:border-blue-500"
                                 >
                                     <div className={`p-2 rounded-lg ${meta.color} text-white`}>
                                         <IconComponent name={meta.icon} className="w-5 h-5" />
                                     </div>
                                     <span className="text-xs">{meta.label}</span>
                                 </button>
                             )
                        })}
                    </div>
                    
                    <button 
                        onClick={() => {
                             const now = new Date();
                             const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                             const newEntry: Entry = {
                                 id: Math.random().toString(36).substr(2,9),
                                 date: formatDate(viewDate),
                                 category: 'other',
                                 event: 'New Event',
                                 details: { summary: 'Quick add', time: timeStr, notes: '' }
                             };
                             setEntries(prev => [...prev, newEntry]);
                             setEditingEntry(newEntry);
                        }}
                        className="mt-4 px-6 py-2 rounded-full bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-blue-500 transition-colors text-sm flex items-center gap-2"
                    >
                        <Icons.Plus className="w-4 h-4" />
                        <span>Add Custom Event</span>
                    </button>
                </div>
            )
        }

        const sorted = [...filteredEntries].sort((a, b) => (a.details.time || "00:00").localeCompare(b.details.time || "00:00"));

        return (
            <div className="max-w-3xl mx-auto py-4 space-y-0 relative">
                 <div className="absolute left-[59px] top-4 bottom-4 w-0.5 bg-gray-800/50 hidden sm:block" />

                 {sorted.map((entry, idx) => {
                     const meta = categoryMeta[entry.category] || categoryMeta['other'];
                     return (
                         <div key={entry.id} className="relative flex flex-col sm:flex-row gap-4 mb-6 group animate-fade-in">
                             <div className="w-[60px] flex-shrink-0 flex flex-col items-end pt-1 relative">
                                 <span className="font-mono text-blue-400 font-bold text-sm">{entry.details.time}</span>
                                 <div className={`absolute top-2 -right-[5px] w-2.5 h-2.5 rounded-full ${meta.color} ring-4 ring-gray-950 hidden sm:block z-10`} />
                             </div>

                             <div 
                                className="flex-1 bg-gray-900/60 border border-gray-800 rounded-xl p-3 hover:bg-gray-800/80 transition-colors cursor-pointer relative overflow-hidden"
                                onClick={() => setEditingEntry(entry)}
                             >
                                 <div className="flex items-start justify-between gap-2 mb-2">
                                     <div className="flex items-center gap-2">
                                          <div className={`p-1.5 rounded-md ${meta.color} text-white`}>
                                              <IconComponent name={meta.icon} className="w-3.5 h-3.5" />
                                          </div>
                                          <span className="font-bold text-gray-200 text-sm">{entry.event}</span>
                                     </div>
                                     <button 
                                        onClick={(e) => handleDeleteEntry(e, entry.id)}
                                        className="text-gray-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                     >
                                         <Icons.Trash2 className="w-3.5 h-3.5" />
                                     </button>
                                 </div>
                                 
                                 <div className="text-gray-400 pl-1 border-l-2 border-gray-800 ml-1">
                                      {renderDetails(entry.category, entry.details)}
                                 </div>
                                 {entry.image && (
                                     <img src={`data:image/jpeg;base64,${entry.image}`} className="w-16 h-16 object-cover rounded mt-2 border border-gray-700" />
                                 )}
                             </div>
                         </div>
                     );
                 })}

                 <div className="flex justify-center mt-8 pt-8 border-t border-gray-800/50 border-dashed">
                      <button 
                        onClick={() => {
                            const now = new Date();
                            const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                            const newEntry = {
                                id: Math.random().toString(36).substr(2,9),
                                date: formatDate(viewDate),
                                category: 'other',
                                event: 'New Event',
                                details: { summary: 'Quick add', time: timeStr, notes: '' }
                            };
                            setEntries(prev => [...prev, newEntry]);
                            setEditingEntry(newEntry);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 hover:text-white transition-all"
                      >
                          <Icons.Plus className="w-4 h-4" />
                          <span className="text-xs">Add Event</span>
                      </button>
                 </div>
            </div>
        )
    }

    const viewModes: ('day' | 'week' | 'month')[] = ['day', 'week', 'month'];

    return (
        <div className="space-y-6 pb-20 relative min-h-full flex flex-col">
             {/* Header */}
             <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-gray-900/80 p-4 rounded-2xl border border-gray-800 backdrop-blur-sm sticky top-0 z-10 shrink-0 shadow-xl">
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                    <div className="flex bg-gray-800 rounded-lg p-1 w-full sm:w-auto justify-between sm:justify-start">
                        <button onClick={() => {
                            const d = new Date(viewDate);
                            viewMode === 'month' ? d.setMonth(d.getMonth()-1) : viewMode === 'week' ? d.setDate(d.getDate()-7) : d.setDate(d.getDate()-1);
                            setViewDate(d);
                        }} className="p-1 hover:bg-gray-700 rounded text-gray-400"><Icons.ChevronLeft className="w-4 h-4"/></button>
                        <div className="px-3 py-1 min-w-[120px] text-center font-mono text-sm">
                             {formatDate(viewDate)}
                        </div>
                         <button onClick={() => {
                            const d = new Date(viewDate);
                            viewMode === 'month' ? d.setMonth(d.getMonth()+1) : viewMode === 'week' ? d.setDate(d.getDate()+7) : d.setDate(d.getDate()+1);
                            setViewDate(d);
                        }} className="p-1 hover:bg-gray-700 rounded text-gray-400"><Icons.ChevronRight className="w-4 h-4"/></button>
                    </div>
                    <div className="flex bg-gray-800 rounded-lg p-1 text-xs w-full sm:w-auto justify-center">
                        {viewModes.map(m => (
                            <button key={m} onClick={() => setViewMode(m)} className={`flex-1 sm:flex-none px-3 py-1 rounded capitalize ${viewMode === m ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>
                                {m}
                            </button>
                        ))}
                    </div>
                </div>
                
                <button 
                    onClick={() => setIsLogView(!isLogView)} 
                    className={`w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg border text-xs transition-colors font-medium ${
                        isLogView 
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                    }`}
                >
                    {isLogView ? (
                        <>
                            <Icons.LayoutGrid className="w-4 h-4" />
                            <span>Dashboard</span>
                        </>
                    ) : (
                        <>
                            <Icons.ScrollText className="w-4 h-4" />
                            <span>Logs</span>
                        </>
                    )}
                </button>
             </div>
             
             {!isLogView && viewMode === 'week' && (
                 <div className="flex flex-col sm:flex-row gap-4 items-center justify-between px-2 animate-fade-in">
                     <div className="flex bg-gray-800/50 rounded-lg p-1 border border-gray-700/50">
                         <button 
                             onClick={() => setWeekViewType('calendar')}
                             className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-all ${weekViewType === 'calendar' ? 'bg-gray-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                         >
                             <Icons.CalendarDays className="w-4 h-4" />
                             <span>Grid</span>
                         </button>
                         <button 
                             onClick={() => setWeekViewType('category')}
                             className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-all ${weekViewType === 'category' ? 'bg-gray-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                         >
                             <Icons.ListTree className="w-4 h-4" />
                             <span>List</span>
                         </button>
                     </div>

                     {weekViewType === 'category' && (
                         <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                             <button 
                                onClick={toggleAllWeekIds} 
                                className="px-3 py-1.5 rounded border border-gray-700 text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors whitespace-nowrap"
                             >
                                 {expandedWeekIds.size === filteredEntries.length && filteredEntries.length > 0 ? 'Collapse All' : 'Expand All'}
                             </button>
                             <div className="h-4 w-px bg-gray-700 mx-1" />
                             <button
                                onClick={() => setWeekCategoryFilter('all')}
                                className={`px-3 py-1.5 rounded text-xs capitalize whitespace-nowrap transition-colors ${
                                    weekCategoryFilter === 'all'
                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                                    : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                }`}
                             >
                                All
                             </button>
                             {groups.map(g => (
                                 <button
                                     key={g.id}
                                     onClick={() => setWeekCategoryFilter(g.id)}
                                     className={`px-3 py-1.5 rounded text-xs capitalize whitespace-nowrap transition-colors ${
                                         weekCategoryFilter === g.id 
                                         ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                                         : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                     }`}
                                 >
                                     {g.label}
                                 </button>
                             ))}
                         </div>
                     )}
                 </div>
             )}

             <div className="flex-1 relative">
                 {isLogView ? (
                     <div className="h-full bg-gray-900/30 border border-gray-800/50 rounded-2xl p-4 sm:p-6 animate-fade-in flex flex-col">
                         <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
                             <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                                 <Icons.ScrollText className="w-6 h-6" />
                             </div>
                             <div>
                                 <h2 className="text-xl font-bold text-gray-100">Daily Raw Logs</h2>
                                 <p className="text-xs text-gray-500">All original input captured for {formatDate(viewDate)}</p>
                             </div>
                         </div>
                         
                         <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2">
                             {filteredRawLogs.length === 0 ? (
                                 <div className="text-center py-20 text-gray-600 italic border-2 border-dashed border-gray-800 rounded-xl">
                                     No raw logs found for this period.
                                 </div>
                             ) : (
                                 filteredRawLogs.map((log: RawLog) => (
                                     <div key={log.id} className="bg-gray-800/40 border border-gray-800 rounded-xl p-4 group hover:bg-gray-800/80 transition-all duration-200">
                                         <div className="flex justify-between items-start mb-3">
                                             <div className="flex items-center gap-2">
                                                 <span className="text-[10px] font-mono text-gray-400 bg-gray-900 px-2 py-1 rounded border border-gray-800">
                                                     {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                 </span>
                                                 {editingLogId === log.id && <span className="text-xs text-blue-400 font-bold animate-pulse">Editing...</span>}
                                             </div>
                                             
                                             <div className="flex gap-2">
                                                 {editingLogId === log.id ? (
                                                     <>
                                                         <button 
                                                             onClick={() => handleSaveLogEdit(log.id)}
                                                             className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-500 transition-colors"
                                                         >
                                                             Save
                                                         </button>
                                                         <button 
                                                             onClick={() => setEditingLogId(null)}
                                                             className="text-xs bg-gray-700 text-gray-300 px-3 py-1 rounded hover:bg-gray-600 transition-colors"
                                                         >
                                                             Cancel
                                                         </button>
                                                     </>
                                                 ) : (
                                                     <div className="flex gap-1">
                                                         <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingLogText(log.text);
                                                                setEditingLogId(log.id);
                                                            }}
                                                            className="p-1.5 text-gray-400 hover:text-blue-300 hover:bg-blue-900/20 rounded-lg transition-colors"
                                                            title="Edit Log"
                                                         >
                                                             <Icons.Pencil className="w-4 h-4" />
                                                         </button>
                                                         <button 
                                                            onClick={(e) => handleDeleteLog(e, log.id)}
                                                            className="p-1.5 text-gray-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
                                                            title="Delete Log"
                                                         >
                                                             <Icons.Trash2 className="w-4 h-4" />
                                                         </button>
                                                     </div>
                                                 )}
                                             </div>
                                         </div>
                                         
                                         {editingLogId === log.id ? (
                                             <textarea 
                                                 value={editingLogText}
                                                 onChange={e => setEditingLogText(e.target.value)}
                                                 className="w-full bg-gray-900 border border-blue-500/50 rounded-lg p-3 text-sm text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[100px]"
                                                 autoFocus
                                             />
                                         ) : (
                                             <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed pl-3 border-l-2 border-indigo-500/30">
                                                 {log.text}
                                             </div>
                                         )}
                                     </div>
                                 ))
                             )}
                         </div>
                     </div>
                 ) : viewMode === 'day' ? (
                     renderTimeline()
                 ) : viewMode === 'week' ? (
                     weekViewType === 'calendar' ? renderWeekCalendar() : renderWeekCategoryList()
                 ) : (
                     <div className="space-y-6">
                         {groups.map(g => (
                             <div key={g.id} className="animate-fade-in">
                                 <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-3 px-1">{g.label}</h3>
                                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                                     {groupedCategories[g.id]?.map(cat => renderCard(cat))}
                                 </div>
                             </div>
                         ))}
                     </div>
                 )}
             </div>
        </div>
    );
};

export default function Index() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rawLogs, setRawLogs] = useState<RawLog[]>([]);
  
  const [activeTab, setActiveTab] = useState<'chat' | 'dashboard' | 'settings'>('chat');
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showAIControl, setShowAIControl] = useState(false);
  
  const [inputText, setInputText] = useState('');
  const [editingMsgIndex, setEditingMsgIndex] = useState<number | null>(null);
  const [editingMsgText, setEditingMsgText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [aiConfig, setAiConfig] = useState<AISettings>({
    chatInstructions: DEFAULT_CHAT_INSTRUCTIONS,
    organizerInstructions: DEFAULT_ORGANIZER_INSTRUCTIONS,
    loggerInstructions: DEFAULT_LOGGER_INSTRUCTIONS,
    batchSize: 30,
  });
  
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
      chatEnabled: true,
      organizerEnabled: true,
      contextRounds: 10,
      contextMode: 'global',
      customStartDate: new Date().toISOString().split('T')[0],
      customEndDate: new Date().toISOString().split('T')[0]
  });

  const [customSchemas, setCustomSchemas] = useState<Record<string, FieldSchema[]>>(INITIAL_SCHEMAS);
  const [groups, setGroups] = useState<GroupDef[]>(INITIAL_GROUPS);
  const [categoryMeta, setCategoryMeta] = useState<Record<string, any>>(INITIAL_CATEGORY_META);

  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  
  const [editingSchemaCat, setEditingSchemaCat] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = <T,>(key: string, setter: React.Dispatch<React.SetStateAction<T>>, def: T) => {
      const saved = localStorage.getItem(key);
      if (saved) setter(JSON.parse(saved));
      else setter(def);
    };
    load<Entry[]>('lifeos_entries', setEntries, []);
    load<ChatMessage[]>('lifeos_messages', setMessages, []);
    
    const savedLogs = localStorage.getItem('lifeos_rawlogs');
    if (savedLogs) {
        const parsed: any[] = JSON.parse(savedLogs);
        const migrated = parsed.map(log => {
            if (!log.id) return { ...log, id: Math.random().toString(36).substr(2, 9) };
            return log;
        });
        setRawLogs(migrated);
    } else {
        setRawLogs([]);
    }

    load<AISettings>('lifeos_aiconfig', setAiConfig, {
        chatInstructions: DEFAULT_CHAT_INSTRUCTIONS,
        organizerInstructions: DEFAULT_ORGANIZER_INSTRUCTIONS,
        loggerInstructions: DEFAULT_LOGGER_INSTRUCTIONS,
        batchSize: 30,
    });
    load<ChatSettings>('lifeos_chatsettings', setChatSettings, {
        chatEnabled: true,
        organizerEnabled: true,
        contextRounds: 10,
        contextMode: 'global',
        customStartDate: new Date().toISOString().split('T')[0],
        customEndDate: new Date().toISOString().split('T')[0]
    });
    
    const savedSchemas = localStorage.getItem('lifeos_schemas');
    if (savedSchemas) {
        const parsed = JSON.parse(savedSchemas);
        setCustomSchemas({...INITIAL_SCHEMAS, ...parsed});
    } else {
        setCustomSchemas(INITIAL_SCHEMAS);
    }

    load<GroupDef[]>('lifeos_groups', setGroups, INITIAL_GROUPS);
    load<Record<string, any>>('lifeos_categorymeta', setCategoryMeta, INITIAL_CATEGORY_META);
  }, []);

  useEffect(() => localStorage.setItem('lifeos_entries', JSON.stringify(entries)), [entries]);
  useEffect(() => localStorage.setItem('lifeos_messages', JSON.stringify(messages)), [messages]);
  useEffect(() => localStorage.setItem('lifeos_rawlogs', JSON.stringify(rawLogs)), [rawLogs]);
  useEffect(() => localStorage.setItem('lifeos_aiconfig', JSON.stringify(aiConfig)), [aiConfig]);
  useEffect(() => localStorage.setItem('lifeos_chatsettings', JSON.stringify(chatSettings)), [chatSettings]);
  useEffect(() => localStorage.setItem('lifeos_schemas', JSON.stringify(customSchemas)), [customSchemas]);
  useEffect(() => localStorage.setItem('lifeos_groups', JSON.stringify(groups)), [groups]);
  useEffect(() => localStorage.setItem('lifeos_categorymeta', JSON.stringify(categoryMeta)), [categoryMeta]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getFilteredHistory = () => {
      let filtered = messages.filter(m => m.role === 'user');
      const now = new Date();
      if (chatSettings.contextMode === 'today') {
          filtered = filtered.filter(m => isSameDay(new Date(m.timestamp), now));
      } else if (chatSettings.contextMode === 'week') {
          const { start, end } = getRollingWeekRange(now);
          filtered = filtered.filter(m => m.timestamp >= start.getTime() && m.timestamp <= end.getTime());
      } else if (chatSettings.contextMode === 'custom') {
          const s = new Date(chatSettings.customStartDate).getTime();
          const e = new Date(chatSettings.customEndDate).getTime() + 86400000;
          filtered = filtered.filter(m => m.timestamp >= s && m.timestamp <= e);
      }
      if (chatSettings.contextRounds < 9999) {
          filtered = filtered.slice(-chatSettings.contextRounds);
      }
      return filtered;
  };

  const chatWithGemini = async (history: ChatMessage[], newMsg: string, signal: AbortSignal, regenerate = false) => {
    if (!GOOGLE_API_KEY) return "Error: No API Key";
    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
    
    let prompt = aiConfig.chatInstructions + "\n\nChat History:\n";
    history.forEach(m => {
        prompt += `${m.role === 'user' ? 'User' : 'You'}: ${m.text}\n`;
    });
    if (!regenerate) {
        prompt += `User: ${newMsg}\n`;
    }
    
    if (signal.aborted) return "";

    try {
        const generatePromise = ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
        });

        const abortPromise = new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('Aborted')));
        });

        const res = await Promise.race([generatePromise, abortPromise]) as GenerateContentResponse;
        return res.text || "";
    } catch (e: any) {
        if (e.message === 'Aborted') return ""; 
        console.error(e);
        return "Thinking process interrupted or failed.";
    }
  };

  const organizeInput = async (text: string, dateStr: string): Promise<any[]> => {
    if (!GOOGLE_API_KEY) return [];
    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
    
    const prompt = `
${aiConfig.organizerInstructions}

Current Date: ${dateStr}
Current Time: ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
IMPORTANT: Analyze the input for time references (e.g., "Yesterday", "Last Friday"). If found, calculate the specific date (YYYY-MM-DD) based on Current Date. If not, use Current Date. Return this in the "date" field.

Defined Schemas:
${Object.entries(customSchemas).map(([cat, fields]) => `
Table: ${cat}
Fields: ${fields.map(f => `- ${f.key} (${f.type}): ${f.label}`).join(', ')}
`).join('\n')}

User Input: "${text}"
`;

    try {
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        date: { type: Type.STRING, description: "YYYY-MM-DD" },
                        category: { type: Type.STRING, enum: Object.keys(categoryMeta) },
                        event: { type: Type.STRING, description: "1-2 words Title" },
                        details: { type: Type.OBJECT, properties: {
                            summary: { type: Type.STRING },
                            time: { type: Type.STRING },
                            duration: { type: Type.STRING, nullable: true },
                            notes: { type: Type.STRING, nullable: true },
                            transaction_type: { type: Type.STRING, nullable: true },
                            amount: { type: Type.NUMBER, nullable: true },
                            currency: { type: Type.STRING, nullable: true },
                            tags: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
                            title: { type: Type.STRING, nullable: true },
                            value: { type: Type.NUMBER, nullable: true },
                            item: { type: Type.STRING, nullable: true }
                        }, required: ["summary", "time"]}
                    },
                    required: ["category", "event", "date", "details"]
                }
            }
        }
      });
      const txt = res.text;
      if (!txt) return [];
      return JSON.parse(txt) as any[];
    } catch (e) {
      console.error("Organization failed", e);
      return [];
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    if (isProcessing) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsProcessing(true);

    const userMsg: ChatMessage = { role: 'user', text: inputText, timestamp: Date.now() };
    const tempMessages = [...messages, userMsg];
    setMessages(tempMessages);
    setInputText('');
    
    setRawLogs(prev => [...prev, { id: Math.random().toString(36).substr(2,9), timestamp: userMsg.timestamp, text: userMsg.text }]);

    const relevantHistory = getFilteredHistory();

    let chatResponse = "";
    if (chatSettings.chatEnabled) {
         chatResponse = await chatWithGemini(relevantHistory, userMsg.text, controller.signal) || "...";
         if (controller.signal.aborted) {
             setIsProcessing(false);
             return;
         }
         setMessages(prev => [...prev, { role: 'model', text: chatResponse, timestamp: Date.now() }]);
    }

    if (chatSettings.organizerEnabled) {
        const today = formatDate(new Date());
        const structuredData = await organizeInput(userMsg.text, today);
        
        if (structuredData && structuredData.length > 0) {
            const newEntries: Entry[] = structuredData.map((d: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                date: d.date || today,
                category: d.category,
                event: d.event,
                details: d?.details || {}
            }));
            
            setEntries(prev => [...prev, ...newEntries]);
            
            const entryIds = newEntries.map(e => e.id);
            setMessages(prev => [...prev, { 
                role: 'system', 
                text: `Saved: ${newEntries.map(e => `[${e.date}] ${e.event}`).join(', ')}`, 
                timestamp: Date.now(),
                relatedEntryIds: entryIds
            }]);
        }
    }
    setIsProcessing(false);
    abortControllerRef.current = null;
  };

  const handleStop = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          setIsProcessing(false);
      }
  };

  const handleUndo = (msgIndex: number, entryIds: string[]) => {
      setEntries(prev => prev.filter(e => !entryIds.includes(e.id)));
      setMessages(prev => prev.map((m, i) => {
          if (i === msgIndex) return { ...m, text: m.text + " (Revoked)" };
          return m;
      }));
  };

  const handleRegenerateChat = async (msgIndex: number) => {
      const prevMsgs = messages.slice(0, msgIndex);
      const userMsg = prevMsgs.filter(m => m.role === 'user').pop();
      if (!userMsg) return;

      setIsProcessing(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const history = getFilteredHistory().filter(m => m.timestamp < messages[msgIndex].timestamp);
      const newResponse = await chatWithGemini(history, userMsg.text, controller.signal, true);
      
      if (!controller.signal.aborted) {
        setMessages(prev => {
            const next = [...prev];
            next[msgIndex] = { ...next[msgIndex], text: newResponse || "..." };
            return next;
        });
      }
      setIsProcessing(false);
  };
  
  const handleSaveAndRegenerate = async (index: number, newText: string) => {
      const nextMessages = messages.slice(0, index + 1);
      nextMessages[index] = { ...nextMessages[index], text: newText };
      setMessages(nextMessages);
      setEditingMsgIndex(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsProcessing(true);
      let history = nextMessages.filter(m => m.role === 'user');
      const now = new Date();
      if (chatSettings.contextMode === 'today') {
          history = history.filter(m => isSameDay(new Date(m.timestamp), now));
      } else if (chatSettings.contextMode === 'week') {
          const { start, end } = getRollingWeekRange(now);
          history = history.filter(m => m.timestamp >= start.getTime() && m.timestamp <= end.getTime());
      } else if (chatSettings.contextMode === 'custom') {
          const s = new Date(chatSettings.customStartDate).getTime();
          const e = new Date(chatSettings.customEndDate).getTime() + 86400000;
          history = history.filter(m => m.timestamp >= s && m.timestamp <= e);
      }
      if (chatSettings.contextRounds < 9999) {
          history = history.slice(-chatSettings.contextRounds);
      }
      const response = await chatWithGemini(history, "", controller.signal, true);
      
      if (!controller.signal.aborted) {
          setMessages(prev => [...prev, { role: 'model', text: response, timestamp: Date.now() }]);
      }
      setIsProcessing(false);
  };

  const handleDeleteMessage = (index: number) => {
      setMessages(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateMessage = (index: number, newText: string) => {
      setMessages(prev => {
          const next = [...prev];
          next[index] = { ...next[index], text: newText };
          return next;
      });
      setEditingMsgIndex(null);
  };

  const renderEditModal = () => {
      if (!editingEntry) return null;
      const schema = customSchemas[editingEntry.category];
      
      const updateDetail = (key: string, val: any) => {
          setEditingEntry({
              ...editingEntry,
              details: { ...editingEntry.details, [key]: val }
          });
      };

      const handleClose = () => {
          setEditingEntry(null);
      };

      return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md m-4 p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-6">
                      <div className="flex items-center gap-3">
                           <div className={`p-2 rounded-lg ${categoryMeta[editingEntry.category]?.color || 'bg-gray-600'}`}>
                               <IconComponent name={categoryMeta[editingEntry.category]?.icon || 'Hash'} className="w-5 h-5 text-white" />
                           </div>
                           <h3 className="text-xl font-bold">{categoryMeta[editingEntry.category]?.label || editingEntry.category}</h3>
                      </div>
                      <button onClick={handleClose}><Icons.X className="w-5 h-5 text-gray-500 hover:text-white" /></button>
                  </div>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs text-gray-500 uppercase mb-1">Date</label>
                          <input type="date" value={editingEntry.date} onChange={e => setEditingEntry({...editingEntry, date: e.target.value})} 
                                 className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                          <label className="block text-xs text-gray-500 uppercase mb-1">Event (Title)</label>
                          {editingEntry.category === 'dining' ? (
                              <select
                                  value={['早餐', '午餐', '晚餐', '夜宵', '零食'].includes(editingEntry.event) ? editingEntry.event : '早餐'}
                                  onChange={e => setEditingEntry({...editingEntry, event: e.target.value})}
                                  className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm focus:border-blue-500 outline-none"
                              >
                                  {['早餐', '午餐', '晚餐', '夜宵', '零食'].map(opt => (
                                      <option key={opt} value={opt}>{opt}</option>
                                  ))}
                              </select>
                          ) : (
                              <input type="text" value={editingEntry.event} onChange={e => setEditingEntry({...editingEntry, event: e.target.value})} 
                                     className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm focus:border-blue-500 outline-none" />
                          )}
                      </div>
                      
                      <div>
                          <label className="block text-xs text-gray-500 uppercase mb-1">Category</label>
                          <select 
                              value={editingEntry.category} 
                              onChange={e => setEditingEntry({...editingEntry, category: e.target.value})}
                              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm focus:border-blue-500 outline-none"
                          >
                              {Object.entries(categoryMeta).sort((a,b) => a[1].label.localeCompare(b[1].label, 'zh-CN')).map(([key, meta]) => (
                                  <option key={key} value={key}>{meta.label}</option>
                              ))}
                          </select>
                      </div>

                      <div className="h-px bg-gray-800 my-4" />
                      
                      <div className="space-y-4">
                          {schema ? schema.map(field => (
                              <div key={field.key}>
                                  <label className="block text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
                                    {field.label}
                                    {field.required && <span className="text-red-500">*</span>}
                                  </label>
                                  {field.type === 'select' && (
                                      <select 
                                        value={editingEntry.details[field.key] || ''} 
                                        onChange={e => updateDetail(field.key, e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm"
                                      >
                                          <option value="">Select...</option>
                                          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                                      </select>
                                  )}
                                  {field.type === 'multiselect' && (
                                      <div className="flex flex-wrap gap-2">
                                          {field.options?.map(o => {
                                              const selected = (editingEntry.details[field.key] || []).includes(o);
                                              return (
                                                  <button key={o} onClick={() => {
                                                      const curr = editingEntry.details[field.key] || [];
                                                      const next = selected ? curr.filter((x:string) => x!==o) : [...curr, o];
                                                      updateDetail(field.key, next);
                                                  }} className={`px-2 py-1 rounded text-xs border ${selected ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                                      {o}
                                                  </button>
                                              );
                                          })}
                                      </div>
                                  )}
                                  {(field.type === 'text' || field.type === 'number' || field.type === 'rating') && (
                                      <input 
                                        type={field.type === 'number' || field.type === 'rating' ? 'number' : 'text'}
                                        value={editingEntry.details[field.key] || ''}
                                        onChange={e => updateDetail(field.key, field.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm"
                                        placeholder={field.placeholder || (field.unit ? `Unit: ${field.unit}` : '')}
                                      />
                                  )}
                              </div>
                          )) : (
                              <div className="text-gray-500 text-xs">No specific fields configured.</div>
                          )}
                      </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                      <button onClick={handleClose} className="px-4 py-2 rounded text-sm text-gray-400 hover:bg-gray-800">Cancel</button>
                      <button onClick={() => {
                          setEntries(prev => prev.map(e => e.id === editingEntry.id ? editingEntry : e));
                          setEditingEntry(null);
                      }} className="px-4 py-2 rounded text-sm bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20">Save Changes</button>
                  </div>
              </div>
          </div>
      );
  };

  const renderSchemaEditor = () => {
      // Group Management
      const addGroup = () => {
          const label = prompt("New Group Name:");
          if (label) {
              const id = Math.random().toString(36).substr(2, 6);
              setGroups([...groups, { id, label }]);
          }
      };

      const deleteGroup = (id: string) => {
          if (INITIAL_GROUPS.some(g => g.id === id)) {
               alert("Cannot delete core groups.");
               return;
          }
          if (confirm("Delete this group? Categories under it will be hidden.")) {
              setGroups(groups.filter(g => g.id !== id));
          }
      };
      
      const moveGroup = (idx: number, dir: -1 | 1) => {
          if ((idx === 0 && dir === -1) || (idx === groups.length -1 && dir === 1)) return;
          const newGroups = [...groups];
          const temp = newGroups[idx];
          newGroups[idx] = newGroups[idx + dir];
          newGroups[idx + dir] = temp;
          setGroups(newGroups);
      };

      // Category Management
      const addCategory = (groupId: string) => {
          const label = prompt("New Category Name:");
          if (label) {
              const key = 'cat_' + Math.random().toString(36).substr(2, 8);
              setCategoryMeta({
                  ...categoryMeta,
                  [key]: {
                      group: groupId,
                      label,
                      color: 'bg-gray-600', // Default
                      icon: 'Hash'
                  }
              });
              setCustomSchemas({
                  ...customSchemas,
                  [key]: createSchema([])
              });
              setEditingSchemaCat(key);
          }
      };

      const deleteCategory = (key: string) => {
          if (confirm(`Delete category "${categoryMeta[key]?.label}"?`)) {
              const newMeta = { ...categoryMeta };
              delete newMeta[key];
              setCategoryMeta(newMeta);
              if (editingSchemaCat === key) setEditingSchemaCat(null);
          }
      };

      // Field Management (Auto-saving logic)
      const updateField = (key: string, idx: number, changes: Partial<FieldSchema>) => {
          if (!editingSchemaCat) return;
          const currentFields = [...(customSchemas[editingSchemaCat] || [])];
          currentFields[idx] = { ...currentFields[idx], ...changes };
          setCustomSchemas({ ...customSchemas, [editingSchemaCat]: currentFields });
      };

      const addField = () => {
          if (!editingSchemaCat) return;
          const newField: FieldSchema = {
              key: 'field_' + Math.random().toString(36).substr(2, 6),
              label: 'New Field',
              type: 'text',
              required: false
          };
          const currentFields = [...(customSchemas[editingSchemaCat] || [])];
          // Insert before 'notes' if possible
          const notesIdx = currentFields.findIndex(f => f.key === 'notes');
          if (notesIdx !== -1) currentFields.splice(notesIdx, 0, newField);
          else currentFields.push(newField);
          setCustomSchemas({ ...customSchemas, [editingSchemaCat]: currentFields });
      };

      const removeField = (idx: number) => {
          if (!editingSchemaCat) return;
          const currentFields = [...(customSchemas[editingSchemaCat] || [])];
          const f = currentFields[idx];
          if(['summary', 'time', 'duration', 'notes'].includes(f.key)) {
              alert("Cannot delete standard fields");
              return;
          }
          if (confirm("Remove field?")) {
            currentFields.splice(idx, 1);
            setCustomSchemas({ ...customSchemas, [editingSchemaCat]: currentFields });
          }
      };

      return (
          <div className="space-y-6">
              <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-gray-200">Configuration Editor</h3>
                  <div className="text-xs text-green-400 flex items-center gap-1 opacity-70">
                      <Icons.Cloud className="w-3 h-3" /> Changes auto-saved
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Left Column: Hierarchy Tree */}
                  <div className="md:col-span-1 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar bg-gray-900/30 p-3 rounded-lg border border-gray-800">
                      <div className="flex justify-between items-center px-2 mb-2">
                           <span className="text-xs font-bold text-gray-500 uppercase">Groups & Categories</span>
                           <button onClick={addGroup} className="p-1 hover:bg-gray-800 rounded text-blue-400" title="Add Group"><Icons.FolderPlus className="w-4 h-4"/></button>
                      </div>
                      
                      {groups.map((group, idx) => {
                          const cats = Object.entries(categoryMeta).filter(([k, m]) => m.group === group.id);
                          const isExpanded = expandedGroups[group.id] ?? true;

                          return (
                              <div key={group.id} className="space-y-1">
                                  {/* Group Header */}
                                  <div className="flex items-center justify-between group/grp hover:bg-gray-800 rounded px-2 py-1.5 transition-colors">
                                      <div className="flex items-center gap-2 flex-1 cursor-pointer select-none" 
                                           onClick={() => setExpandedGroups({...expandedGroups, [group.id]: !isExpanded})}>
                                          <Icons.ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                          <span className="text-sm font-bold text-gray-300">{group.label}</span>
                                      </div>
                                      <div className="flex gap-1 opacity-0 group-hover/grp:opacity-100 transition-opacity">
                                          <button onClick={() => moveGroup(idx, -1)} className="p-1 text-gray-500 hover:text-white"><Icons.ArrowUp className="w-3 h-3"/></button>
                                          <button onClick={() => moveGroup(idx, 1)} className="p-1 text-gray-500 hover:text-white"><Icons.ArrowDown className="w-3 h-3"/></button>
                                          <button onClick={() => addCategory(group.id)} className="p-1 text-blue-500 hover:text-blue-300" title="Add Category"><Icons.Plus className="w-3 h-3"/></button>
                                          <button onClick={() => deleteGroup(group.id)} className="p-1 text-red-500 hover:text-red-300"><Icons.Trash2 className="w-3 h-3"/></button>
                                      </div>
                                  </div>

                                  {/* Categories List */}
                                  {isExpanded && (
                                      <div className="pl-6 space-y-0.5 border-l border-gray-800 ml-2">
                                          {cats.map(([catKey, meta]) => (
                                              <div 
                                                key={catKey}
                                                onClick={() => setEditingSchemaCat(catKey)}
                                                className={`flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer group/cat transition-colors ${editingSchemaCat === catKey ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
                                              >
                                                  <div className="flex items-center gap-2">
                                                      <IconComponent name={meta.icon} className="w-3 h-3 opacity-70" />
                                                      <span>{meta.label}</span>
                                                  </div>
                                                  <div className="opacity-0 group-hover/cat:opacity-100">
                                                      <button 
                                                          onClick={(e) => { e.stopPropagation(); deleteCategory(catKey); }}
                                                          className="p-1 hover:text-red-300 text-red-400"
                                                      >
                                                          <Icons.Trash2 className="w-3 h-3" />
                                                      </button>
                                                  </div>
                                              </div>
                                          ))}
                                          {cats.length === 0 && <div className="text-[10px] text-gray-600 pl-2 italic">No categories</div>}
                                      </div>
                                  )}
                              </div>
                          );
                      })}
                  </div>

                  {/* Right Column: Field Editor */}
                  <div className="md:col-span-2 bg-gray-900/50 border border-gray-800 rounded-xl p-4 flex flex-col">
                      {editingSchemaCat ? (
                          <>
                              <div className="flex justify-between items-start border-b border-gray-800 pb-4 mb-4">
                                  <div>
                                      <h4 className="font-bold text-blue-300 text-sm mb-1">Editing: {categoryMeta[editingSchemaCat]?.label}</h4>
                                      <div className="flex gap-2 text-xs">
                                          <input 
                                              value={categoryMeta[editingSchemaCat]?.label} 
                                              onChange={e => setCategoryMeta({...categoryMeta, [editingSchemaCat]: { ...categoryMeta[editingSchemaCat], label: e.target.value }})}
                                              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-32"
                                              placeholder="Rename..."
                                          />
                                          <select 
                                              value={categoryMeta[editingSchemaCat]?.icon} 
                                              onChange={e => setCategoryMeta({...categoryMeta, [editingSchemaCat]: { ...categoryMeta[editingSchemaCat], icon: e.target.value }})}
                                              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-32"
                                          >
                                              {['Hash', 'Wallet', 'BookHeart', 'GraduationCap', 'Gamepad2', 'Film', 'BookOpen', 'Utensils', 'Home', 'Sparkles', 'Dumbbell', 'Moon', 'Scale', 'Stethoscope', 'Activity', 'Droplet', 'Briefcase', 'Lightbulb'].map(i => (
                                                  <option key={i} value={i}>{i}</option>
                                              ))}
                                          </select>
                                      </div>
                                  </div>
                              </div>
                              
                              <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[60vh]">
                                  {(customSchemas[editingSchemaCat] || []).map((field, idx) => {
                                      const isStandard = ['summary', 'time', 'duration', 'notes'].includes(field.key);
                                      return (
                                          <div key={idx} className="bg-gray-800 rounded p-3 grid grid-cols-12 gap-2 group border border-transparent hover:border-gray-700 transition-colors">
                                              <div className="col-span-4">
                                                  <label className="text-[10px] text-gray-500 uppercase block mb-1">Label</label>
                                                  <input 
                                                      value={field.label} 
                                                      onChange={e => updateField(field.key, idx, { label: e.target.value })} 
                                                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs" 
                                                  />
                                              </div>
                                              <div className="col-span-3">
                                                  <label className="text-[10px] text-gray-500 uppercase block mb-1">Type</label>
                                                  <select 
                                                      value={field.type} 
                                                      onChange={e => updateField(field.key, idx, { type: e.target.value as FieldType })} 
                                                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs disabled:opacity-50"
                                                      disabled={isStandard}
                                                  >
                                                      {['text', 'number', 'select', 'multiselect', 'date', 'rating'].map(t => <option key={t} value={t}>{t}</option>)}
                                                  </select>
                                              </div>
                                              <div className="col-span-1 flex flex-col items-center">
                                                  <label className="text-[10px] text-gray-500 uppercase block mb-1">Req</label>
                                                  <input 
                                                      type="checkbox" 
                                                      checked={!!field.required} 
                                                      onChange={e => updateField(field.key, idx, { required: e.target.checked })}
                                                      disabled={isStandard && field.key !== 'notes'}
                                                      className="accent-blue-500"
                                                  />
                                              </div>
                                              <div className="col-span-1 flex flex-col items-center justify-end">
                                                  {!isStandard && (
                                                      <button onClick={() => removeField(idx)} className="text-gray-500 hover:text-red-400 p-1">
                                                          <Icons.X className="w-3 h-3" />
                                                      </button>
                                                  )}
                                              </div>
                                              
                                              {(field.type === 'select' || field.type === 'multiselect') && (
                                                  <div className="col-span-12 mt-1">
                                                      <input 
                                                          value={field.options?.join(',') || ''} 
                                                          onChange={e => updateField(field.key, idx, { options: e.target.value.split(',').filter(Boolean) })} 
                                                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono" 
                                                          placeholder="Options (comma separated)" 
                                                      />
                                                  </div>
                                              )}
                                          </div>
                                      );
                                  })}
                              </div>
                              <button onClick={addField} className="mt-4 w-full py-3 border-2 border-dashed border-gray-700 rounded-lg text-xs text-gray-500 hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-900/10 transition-all flex items-center justify-center gap-2">
                                  <Icons.Plus className="w-3 h-3" /> Add Field
                              </button>
                          </>
                      ) : (
                          <div className="h-full flex flex-col items-center justify-center text-gray-600">
                              <Icons.ArrowLeft className="w-8 h-8 mb-2 opacity-30" />
                              <p className="text-sm">Select a category to configure</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-950 text-gray-100 font-sans overflow-hidden">
      <div className={`hidden md:flex ${isSidebarOpen ? 'w-64' : 'w-16'} bg-gray-900 border-r border-gray-800 transition-all duration-300 flex-col shrink-0`}>
        <div className="p-4 flex items-center justify-between">
           {isSidebarOpen && <span className="font-bold text-xl tracking-tighter bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Gemini LifeOS</span>}
           <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-gray-800 rounded text-gray-400"><Icons.Menu className="w-5 h-5" /></button>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-2">
            {[
                { id: 'chat', icon: 'MessageSquare', label: 'Chat' },
                { id: 'dashboard', icon: 'LayoutGrid', label: 'Dashboard' },
                { id: 'settings', icon: 'Settings', label: 'Settings' }
            ].map(item => (
                <button 
                  key={item.id}
                  onClick={() => setActiveTab(item.id as 'chat' | 'dashboard' | 'settings')}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${activeTab === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
                >
                    <IconComponent name={item.icon} className="w-5 h-5" />
                    {isSidebarOpen && <span>{item.label}</span>}
                </button>
            ))}
        </nav>
      </div>

      <main className="flex-1 flex flex-col h-[calc(100vh-60px)] md:h-full relative overflow-hidden">
          <div className="flex-1 overflow-hidden relative flex flex-col">
              {activeTab === 'chat' && (
                  <div className="h-full flex flex-col max-w-4xl mx-auto w-full relative">
                      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                          {messages.map((msg, idx) => (
                              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group py-3`}>
                                  <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-4 shadow-sm relative ${
                                      msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 
                                      msg.role === 'system' ? 'bg-gray-800/50 border border-orange-500/30 text-gray-300 text-xs font-mono' : 
                                      'bg-gray-800 text-gray-200 rounded-bl-none'
                                  }`}>
                                      <div className={`absolute -top-3 z-30 ${msg.role === 'user' ? '-left-16' : '-right-16'} opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex gap-1 bg-gray-900/80 p-1 rounded-full border border-gray-700`}>
                                          {msg.role === 'user' && (
                                              <>
                                                <button onClick={() => {
                                                    setEditingMsgIndex(idx);
                                                    setEditingMsgText(msg.text);
                                                }} className="p-1 hover:text-blue-300 text-gray-400"><Icons.Pencil className="w-3 h-3"/></button>
                                                <button onClick={() => handleDeleteMessage(idx)} className="p-1 hover:text-red-300 text-gray-400"><Icons.Trash2 className="w-3 h-3"/></button>
                                              </>
                                          )}
                                          {msg.role === 'model' && (
                                              <button onClick={() => handleRegenerateChat(idx)} className="p-1 hover:text-green-300 text-gray-400"><Icons.RefreshCw className="w-3 h-3"/></button>
                                          )}
                                      </div>
                                      
                                      {editingMsgIndex === idx ? (
                                          <div className="min-w-[200px] sm:min-w-[300px] text-gray-900">
                                              <textarea 
                                                value={editingMsgText}
                                                onChange={e => setEditingMsgText(e.target.value)}
                                                className="w-full bg-gray-100 border border-blue-500 rounded p-2 text-sm mb-2 outline-none text-gray-800"
                                                rows={3}
                                              />
                                              <div className="flex gap-2 justify-end">
                                                   <button onClick={() => setEditingMsgIndex(null)} className="text-xs bg-gray-700 text-gray-300 px-3 py-1 rounded hover:bg-gray-600">Cancel</button>
                                                   <button onClick={() => handleUpdateMessage(idx, editingMsgText)} className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-400">Save</button>
                                                   <button onClick={() => handleSaveAndRegenerate(idx, editingMsgText)} className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-500 border border-purple-400 shadow-sm flex items-center gap-1">
                                                       <Icons.RefreshCw className="w-3 h-3" />
                                                   </button>
                                              </div>
                                          </div>
                                      ) : (
                                          <div className="whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
                                              {msg.text}
                                          </div>
                                      )}
                                      
                                      {msg.role === 'system' && msg.relatedEntryIds && (
                                          <div className="mt-2 flex gap-2">
                                              {msg.text.includes("(Revoked)") ? (
                                                  <span className="flex items-center gap-1 text-green-400 text-xs">
                                                      <Icons.Check className="w-3 h-3" /> Revoked
                                                  </span>
                                              ) : (
                                                  <button onClick={() => handleUndo(idx, msg.relatedEntryIds!)} className="text-xs bg-red-900/30 text-red-300 px-2 py-1 rounded border border-red-800/50 hover:bg-red-900/50">
                                                      Revoke
                                                  </button>
                                              )}
                                          </div>
                                      )}
                                      
                                      <div className="text-[10px] opacity-40 mt-2 text-right">
                                          {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                      </div>
                                  </div>
                              </div>
                          ))}
                          {isProcessing && (
                             <div className="flex justify-start animate-pulse">
                                 <div className="bg-gray-800/50 rounded-2xl p-3 flex items-center gap-2">
                                     <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                                     <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-75" />
                                     <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-150" />
                                     <span className="text-xs text-gray-500 ml-2">Gemini is thinking...</span>
                                 </div>
                             </div>
                          )}
                          <div ref={chatEndRef} />
                      </div>

                      <div className="bg-gray-900/95 border-t border-gray-800 backdrop-blur-sm shrink-0 z-40">
                          <div className="flex items-center justify-between px-2 sm:px-4 py-2 bg-gray-800/50 border-b border-gray-800">
                             <div className="flex items-center gap-2 sm:gap-3">
                                 <button onClick={() => setShowAIControl(!showAIControl)} className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 rounded text-xs transition-colors ${showAIControl ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                                     <Icons.Cpu className="w-3 h-3" />
                                     <span className="hidden sm:inline">AI Control Center</span>
                                     <span className="inline sm:hidden">AI</span>
                                     <Icons.ChevronUp className={`w-3 h-3 transition-transform ${showAIControl ? 'rotate-180' : ''}`} />
                                 </button>
                                 <div className="h-4 w-px bg-gray-700" />
                                 <div className="flex gap-2 text-[10px] text-gray-500">
                                     <span className={chatSettings.chatEnabled ? 'text-blue-400' : ''}>Chat: {chatSettings.chatEnabled ? 'ON' : 'OFF'}</span>
                                     <span>•</span>
                                     <span className={chatSettings.organizerEnabled ? 'text-orange-400' : ''}>Org: {chatSettings.organizerEnabled ? 'ON' : 'OFF'}</span>
                                 </div>
                             </div>
                             <div className="text-[10px] text-gray-600 font-mono hidden sm:block">
                                 Mem: {chatSettings.contextMode === 'global' ? 'All' : chatSettings.contextMode} ({chatSettings.contextRounds >= 9999 ? '∞' : chatSettings.contextRounds})
                             </div>
                          </div>

                          {showAIControl && (
                              <div className="p-4 border-b border-gray-800 animate-fade-in bg-gray-900 shadow-xl max-h-[50vh] overflow-y-auto">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      <div className="space-y-3">
                                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Independent Modules</h4>
                                          <div className="flex items-center justify-between bg-gray-800 p-2 rounded px-3">
                                              <div className="flex items-center gap-2">
                                                  <Icons.MessageCircle className="w-4 h-4 text-blue-400" />
                                                  <span className="text-sm">Companion AI (Chat)</span>
                                              </div>
                                              <input type="checkbox" checked={chatSettings.chatEnabled} onChange={e => setChatSettings({...chatSettings, chatEnabled: e.target.checked})} className="accent-blue-500" />
                                          </div>
                                          <div className="flex items-center justify-between bg-gray-800 p-2 rounded px-3">
                                              <div className="flex items-center gap-2">
                                                  <Icons.Database className="w-4 h-4 text-orange-400" />
                                                  <div className="flex flex-col">
                                                      <span className="text-sm">Organizer AI</span>
                                                  </div>
                                              </div>
                                              <input type="checkbox" checked={chatSettings.organizerEnabled} onChange={e => setChatSettings({...chatSettings, organizerEnabled: e.target.checked})} className="accent-orange-500" />
                                          </div>
                                      </div>

                                      <div className="space-y-3">
                                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Context & Memory</h4>
                                          <div className="flex bg-gray-800 rounded p-1 gap-1 overflow-x-auto">
                                              {['global', 'today', 'week', 'custom'].map(m => (
                                                  <button 
                                                    key={m} 
                                                    onClick={() => setChatSettings({...chatSettings, contextMode: m as any})}
                                                    className={`flex-1 py-1 px-2 text-xs rounded capitalize whitespace-nowrap ${chatSettings.contextMode === m ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                                  >
                                                      {m}
                                                  </button>
                                              ))}
                                          </div>
                                          
                                          {chatSettings.contextMode === 'custom' && (
                                              <div className="flex flex-col sm:flex-row gap-2 text-xs">
                                                  <input type="date" value={chatSettings.customStartDate} onChange={e => setChatSettings({...chatSettings, customStartDate: e.target.value})} className="bg-gray-800 border border-gray-700 rounded px-2 py-1" />
                                                  <input type="date" value={chatSettings.customEndDate} onChange={e => setChatSettings({...chatSettings, customEndDate: e.target.value})} className="bg-gray-800 border border-gray-700 rounded px-2 py-1" />
                                              </div>
                                          )}

                                          <div>
                                              <div className="flex justify-between items-center text-xs text-gray-400 mb-2">
                                                  <span>Context Depth (Rounds)</span>
                                                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-purple-300 transition-colors">
                                                      <input 
                                                          type="checkbox" 
                                                          checked={chatSettings.contextRounds >= 9999}
                                                          onChange={e => setChatSettings({
                                                              ...chatSettings, 
                                                              contextRounds: e.target.checked ? 9999 : 10
                                                          })}
                                                          className="accent-purple-500 w-3 h-3 rounded-sm"
                                                      />
                                                      <span className="text-[10px] font-mono uppercase tracking-wider">Infinite Mode</span>
                                                  </label>
                                              </div>
                                              <input 
                                                type="number" 
                                                min="0"
                                                disabled={chatSettings.contextRounds >= 9999}
                                                value={chatSettings.contextRounds >= 9999 ? '' : chatSettings.contextRounds} 
                                                onChange={e => {
                                                    const val = parseInt(e.target.value);
                                                    setChatSettings({...chatSettings, contextRounds: isNaN(val) ? 0 : val});
                                                }}
                                                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:border-purple-500 outline-none disabled:opacity-30 disabled:cursor-not-allowed placeholder-gray-600 font-mono transition-colors"
                                              />
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          )}

                          <div className="p-2 sm:p-4">
                              <div className="flex items-end gap-2 bg-gray-800 p-2 rounded-xl border border-gray-700 focus-within:border-blue-500 transition-colors">
                                  <button className="p-2 text-gray-400 hover:text-white transition-colors">
                                      <Icons.Paperclip className="w-5 h-5" />
                                  </button>
                                  <textarea 
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    onKeyDown={e => {
                                        if(e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder="Type a message..."
                                    className="flex-1 bg-transparent border-none outline-none resize-none h-10 max-h-32 py-2 text-sm custom-scrollbar"
                                  />
                                  {isProcessing ? (
                                      <button onClick={handleStop} className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors">
                                          <div className="w-5 h-5 flex items-center justify-center font-bold">■</div>
                                      </button>
                                  ) : (
                                      <button onClick={handleSendMessage} className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-lg shadow-blue-900/20">
                                          <Icons.Send className="w-5 h-5" />
                                      </button>
                                  )}
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {activeTab === 'dashboard' && (
                  <div className="h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
                      <DashboardView 
                        entries={entries} 
                        viewDate={viewDate} 
                        viewMode={viewMode}
                        setViewDate={setViewDate}
                        setViewMode={setViewMode}
                        setEditingEntry={setEditingEntry}
                        setEntries={setEntries}
                        rawLogs={rawLogs}
                        setRawLogs={setRawLogs}
                        groups={groups}
                        categoryMeta={categoryMeta}
                      />
                  </div>
              )}

              {activeTab === 'settings' && (
                  <div className="h-full overflow-y-auto p-4 md:p-8 custom-scrollbar max-w-5xl mx-auto">
                      <div className="space-y-12 pb-20">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold flex items-center gap-2 text-blue-400">
                                        <Icons.Bot className="w-5 h-5" /> Chat Persona
                                    </h3>
                                    <textarea 
                                        value={aiConfig.chatInstructions} 
                                        onChange={e => setAiConfig({...aiConfig, chatInstructions: e.target.value})}
                                        className="w-full h-48 bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm font-mono focus:border-blue-500 outline-none" 
                                    />
                                </div>
                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold flex items-center gap-2 text-orange-400">
                                        <Icons.Database className="w-5 h-5" /> Organizer Logic
                                    </h3>
                                    <textarea 
                                        value={aiConfig.organizerInstructions} 
                                        onChange={e => setAiConfig({...aiConfig, organizerInstructions: e.target.value})}
                                        className="w-full h-48 bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm font-mono focus:border-orange-500 outline-none" 
                                    />
                                </div>
                           </div>

                           <div className="border-t border-gray-800 pt-8">
                               {renderSchemaEditor()}
                           </div>

                           <div className="border-t border-gray-800 pt-8">
                               <div className="flex justify-between items-center bg-red-900/10 border border-red-900/30 p-6 rounded-xl">
                                   <div>
                                       <h4 className="text-red-400 font-bold">Danger Zone</h4>
                                       <p className="text-xs text-red-400/60 mt-1">Irreversibly wipe all local data</p>
                                   </div>
                                   <button onClick={() => {
                                       if(window.confirm("NUKE EVERYTHING? This cannot be undone.")) {
                                           localStorage.clear();
                                           window.location.reload();
                                       }
                                   }} className="bg-red-900/50 hover:bg-red-800 text-red-200 px-4 py-2 rounded text-sm border border-red-800">Clear All Data</button>
                               </div>
                           </div>
                      </div>
                  </div>
              )}
          </div>

          {editingEntry && renderEditModal()}

          <div className="md:hidden bg-gray-900 border-t border-gray-800 flex justify-around items-center p-2 shrink-0 z-50">
                {[
                    { id: 'chat', icon: 'MessageSquare', label: 'Chat' },
                    { id: 'dashboard', icon: 'LayoutGrid', label: 'Dashboard' },
                    { id: 'settings', icon: 'Settings', label: 'Settings' }
                ].map(item => (
                    <button 
                        key={item.id}
                        onClick={() => setActiveTab(item.id as 'chat' | 'dashboard' | 'settings')}
                        className={`flex flex-col items-center p-2 rounded-lg transition-colors w-16 ${activeTab === item.id ? 'text-blue-400' : 'text-gray-500'}`}
                    >
                        <IconComponent name={item.icon} className={`w-6 h-6 mb-1 ${activeTab === item.id ? 'fill-blue-400/20' : ''}`} />
                        <span className="text-[10px] font-medium">{item.label}</span>
                    </button>
                ))}
          </div>
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<Index />);