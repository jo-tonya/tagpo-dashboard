/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* eslint-disable */
//
// このファイルは tagpo-projects/tagpo-dashboard/src/App.jsx を 1:1 で
// ポートしたもの。UI / 動作は完全に同等を保つこと。差分は以下の3点のみ:
//   1. 'use client' を冒頭に追加（Next.js App Router 用）
//   2. supabase クライアントを @/lib/supabase/client から取得
//   3. SEED 投入は本番では不要なので空配列ガードを追加（実質 no-op）
//
// 改修するときは tagpo-projects 側を先に編集し、こちらに同じ差分を反映する運用。
//
'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ══════════════════════════════════════════
//  Milestone definitions
// ══════════════════════════════════════════
const MS_DEFS = [
  { k:"esCollection",  col:"es_collection",  label:"ES回収",                  action:"回収済み",            deadlineOffset: (d) => d },
  { k:"infoRelease",   col:"info_release",    label:"ユーザー募集開始（情報解禁）", action:"クライアントに中途報告", deadlineOffset: (d) => addDays(d, 5) },
  { k:"postStart",     col:"post_start",      label:"投稿開始",                 action:"クライアントに中途報告", deadlineOffset: (d) => addDays(d, -3) },
  { k:"postEnd",       col:"post_end",        label:"投稿期限",                 action:"クライアントに報告",    deadlineOffset: (d) => addDays(d, 3) },
  { k:"viewComplete",  col:"view_complete",   label:"再生完了",                 action:"クライアントに報告",    deadlineOffset: (d) => addDays(d, 1) },
  { k:"reportSend",    col:"report_send",     label:"レポート送付",             action:"レポート送付",          deadlineOffset: (d) => d },
];

function addDays(dateStr, n) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}

// ══════════════════════════════════════════
//  Seed data (used for initial DB population — 通常は走らない)
// ══════════════════════════════════════════
const SEED = [];

// ══════════════════════════════════════════
//  DB ↔ Frontend mapping helpers
// ══════════════════════════════════════════
function dbToFront(row) {
  return {
    id: row.id,
    maker: row.maker || "",
    product: row.product || "",
    status: row.status || "未確定",
    type: row.type || "既存",
    budget: row.budget,
    unitPrice: row.unit_price,
    avgViews: row.avg_views,
    influencers: row.influencers || "",
    review: row.review || "",
    retailer: row.retailer || "",
    url: row.url || "",
    esCollection: row.es_collection || "",
    infoRelease: row.info_release || "",
    postStart: row.post_start || "",
    postEnd: row.post_end || "",
    viewComplete: row.view_complete || "",
    reportSend: row.report_send || "",
    memo: row.memo || "",
    creativeNotes: row.creative_notes || "",
    scheduleNotes: row.schedule_notes || "",
    meetingNotes: row.meeting_notes || [],
  };
}

function frontToDb(c) {
  return {
    maker: c.maker,
    product: c.product,
    status: c.status,
    type: c.type,
    budget: c.budget || null,
    unit_price: c.unitPrice || null,
    avg_views: c.avgViews || null,
    influencers: c.influencers || "",
    review: c.review || "",
    retailer: c.retailer || "",
    url: c.url || "",
    es_collection: c.esCollection || null,
    info_release: c.infoRelease || null,
    post_start: c.postStart || null,
    post_end: c.postEnd || null,
    view_complete: c.viewComplete || null,
    report_send: c.reportSend || null,
    memo: c.memo || "",
    creative_notes: c.creativeNotes || "",
    schedule_notes: c.scheduleNotes || "",
    meeting_notes: c.meetingNotes || [],
  };
}

// ══════════════════════════════════════════
//  Config
// ══════════════════════════════════════════
const STATUS_CFG = {
  未確定:         { c:"#94a3b8", bg:"#f1f5f9", row:"#f8fafc",  bl:"#cbd5e1" },
  シート回収済み: { c:"#f59e0b", bg:"#fffbeb", row:"#fffdf5",  bl:"#fbbf24" },
  進行中:         { c:"#3b82f6", bg:"#eff6ff", row:"#f0f7ff",  bl:"#60a5fa" },
  投稿中:         { c:"#8b5cf6", bg:"#f5f3ff", row:"#f8f5ff",  bl:"#a78bfa" },
  完了:           { c:"#10b981", bg:"#ecfdf5", row:"#f0fdf4",  bl:"#34d399" },
};
const S_ORDER = ["未確定","シート回収済み","進行中","投稿中","完了"];

// ══════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════
const now = new Date(); now.setHours(0,0,0,0);
const dDiff = (s) => { if(!s) return null; const d=new Date(s); d.setHours(0,0,0,0); return Math.ceil((d-now)/864e5); };
const fDate = (s) => { if(!s) return "—"; const d=new Date(s); return `${d.getMonth()+1}/${d.getDate()}`; };
const fYen  = (n) => { if(!n) return "—"; return n>=10000 ? `¥${(n/10000).toFixed(0)}万` : `¥${n.toLocaleString()}`; };
const fNum  = (n) => (n!=null && !isNaN(n)) ? Number(n).toLocaleString() : "—";

function calc(c) {
  const rv = (c.budget && c.unitPrice) ? Math.round(c.budget / c.unitPrice) : null;
  const tp = (rv && c.avgViews) ? Math.ceil(rv / c.avgViews) : null;
  return { ...c, requiredViews: rv, targetPosts: tp };
}

function isMsOverdue(campaign, msDef, checked) {
  if (checked) return false;
  if (!campaign[msDef.k]) return false;
  const deadline = msDef.deadlineOffset(campaign[msDef.k]);
  if (!deadline) return false;
  return dDiff(deadline) < 0;
}

// ══════════════════════════════════════════
//  Styles
// ══════════════════════════════════════════
const iS = { width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid #e2e8f0",fontSize:13,color:"#1e293b",background:"#fff",boxSizing:"border-box" };
const lS = { fontSize:11,fontWeight:600,color:"#64748b",marginBottom:3,display:"block" };

// ══════════════════════════════════════════
//  Campaign Form (Add / Edit)
// ══════════════════════════════════════════
function CampaignForm({ initial, onSave, onClose, title }) {
  const [f, setF] = useState(()=>{
    const base = {
      maker:"",product:"",status:"未確定",type:"既存",
      budget:"",unitPrice:1.3,avgViews:"",influencers:"",review:"",retailer:"",url:"",
      esCollection:"",infoRelease:"",postStart:"",postEnd:"",viewComplete:"",reportSend:"",
      memo:"",creativeNotes:"",scheduleNotes:"",meetingNotes:[],
      ...initial,
    };
    return { ...base, budget:base.budget??"", unitPrice:base.unitPrice??1.3, avgViews:base.avgViews??"" };
  });
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const rv=(f.budget&&f.unitPrice)?Math.round(Number(f.budget)/Number(f.unitPrice)):null;
  const tp=(rv&&f.avgViews)?Math.ceil(rv/Number(f.avgViews)):null;
  const submit=()=>{
    if(!f.maker.trim()||!f.product.trim()) return;
    onSave({...f, budget:f.budget?Number(f.budget):null, unitPrice:f.unitPrice?Number(f.unitPrice):null, avgViews:f.avgViews?Number(f.avgViews):null });
  };
  const rb=(v)=>(!String(v).trim()?"1px solid #fca5a5":"1px solid #e2e8f0");

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:16,padding:"28px 32px",width:660,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{margin:0,fontSize:20,fontWeight:700,color:"#0f172a"}}>{title}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,color:"#94a3b8",cursor:"pointer"}}>✕</button>
        </div>

        {/* Basic */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div><label style={lS}>メーカー名 *</label><input style={{...iS,border:rb(f.maker)}} value={f.maker} onChange={e=>s("maker",e.target.value)} placeholder="例: 大正製薬" /></div>
          <div><label style={lS}>商品名 *</label><input style={{...iS,border:rb(f.product)}} value={f.product} onChange={e=>s("product",e.target.value)} placeholder="例: ブラックウルフ" /></div>
          <div><label style={lS}>ステータス</label><select style={iS} value={f.status} onChange={e=>s("status",e.target.value)}>{S_ORDER.map(v=><option key={v}>{v}</option>)}</select></div>
          <div><label style={lS}>既存/新商品</label><select style={iS} value={f.type} onChange={e=>s("type",e.target.value)}><option value="既存">既存</option><option value="新商品">新商品</option></select></div>
          <div><label style={lS}>審査</label><input style={iS} value={f.review} onChange={e=>s("review",e.target.value)} placeholder="例: EG, EG→メーカー" /></div>
          <div><label style={lS}>指定小売店</label><input style={iS} value={f.retailer} onChange={e=>s("retailer",e.target.value)} placeholder="例: ウエルシア, ツルハ" /></div>
        </div>

        <div style={{marginBottom:16}}><label style={lS}>商品URL</label><input style={iS} value={f.url} onChange={e=>s("url",e.target.value)} placeholder="https://..." /></div>

        {/* Meeting Notes */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:600,color:"#475569",marginBottom:8}}>Mtg議事録URL</div>
          {(f.meetingNotes||[]).map((note,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 2fr 32px",gap:8,marginBottom:6,alignItems:"center"}}>
              <input style={iS} value={note.label} onChange={e=>{const notes=[...(f.meetingNotes||[])];notes[i]={...notes[i],label:e.target.value};s("meetingNotes",notes);}} placeholder={`議事録 ${i+1}`} />
              <input style={iS} value={note.url} onChange={e=>{const notes=[...(f.meetingNotes||[])];notes[i]={...notes[i],url:e.target.value};s("meetingNotes",notes);}} placeholder="https://..." />
              <button onClick={()=>{const notes=[...(f.meetingNotes||[])];notes.splice(i,1);s("meetingNotes",notes);}} style={{padding:"6px",borderRadius:6,border:"1px solid #fecaca",background:"#fff",color:"#ef4444",fontSize:12,cursor:"pointer",lineHeight:1}}>✕</button>
            </div>
          ))}
          <button onClick={()=>s("meetingNotes",[...(f.meetingNotes||[]),{url:"",label:""}])} style={{padding:"4px 12px",borderRadius:6,border:"1px dashed #93c5fd",background:"#f0f9ff",color:"#3b82f6",fontSize:12,fontWeight:500,cursor:"pointer"}}>＋ 議事録を追加</button>
        </div>

        {/* A/B/C → X/Y */}
        <div style={{fontSize:12,fontWeight:600,color:"#475569",marginBottom:8}}>予算 &amp; 数値（A/B/C → X/Y 自動計算）</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:8}}>
          <div><label style={lS}><b style={{color:"#3b82f6"}}>A</b> 予算（円）</label><input style={iS} type="number" value={f.budget} onChange={e=>s("budget",e.target.value)} placeholder="3000000" /></div>
          <div><label style={lS}><b style={{color:"#3b82f6"}}>B</b> 再生単価（円）</label><input style={iS} type="number" step="0.1" value={f.unitPrice} onChange={e=>s("unitPrice",e.target.value)} placeholder="1.3" /></div>
          <div><label style={lS}><b style={{color:"#3b82f6"}}>C</b> 平均再生回数（想定）</label><input style={iS} type="number" value={f.avgViews} onChange={e=>s("avgViews",e.target.value)} placeholder="77" /></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
          <div style={{background:"#f0f9ff",padding:"10px 12px",borderRadius:8,border:"1px dashed #93c5fd"}}>
            <div style={{fontSize:11,color:"#3b82f6",fontWeight:600}}>X = A ÷ B 必要再生回数</div>
            <div style={{fontSize:18,fontWeight:700,color:"#1e40af",marginTop:2}}>{rv?fNum(rv):"—"}</div>
          </div>
          <div style={{background:"#f0f9ff",padding:"10px 12px",borderRadius:8,border:"1px dashed #93c5fd"}}>
            <div style={{fontSize:11,color:"#3b82f6",fontWeight:600}}>Y = X ÷ C 目標投稿数</div>
            <div style={{fontSize:18,fontWeight:700,color:"#1e40af",marginTop:2}}>{tp?fNum(tp):"—"}</div>
          </div>
          <div><label style={lS}>投稿者数</label><input style={iS} value={f.influencers} onChange={e=>s("influencers",e.target.value)} placeholder="15人" /></div>
        </div>

        {/* Dates — 6 milestones */}
        <div style={{fontSize:12,fontWeight:600,color:"#475569",marginBottom:8}}>マイルストーン日程</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
          {MS_DEFS.map(m=>(
            <div key={m.k}><label style={lS}>{m.label}</label><input style={iS} type="date" value={f[m.k]||""} onChange={e=>s(m.k,e.target.value)} /></div>
          ))}
        </div>

        <div style={{marginBottom:16}}>
          <label style={lS}>クリエイティブの追加指示</label>
          <textarea
            style={{...iS,minHeight:60,resize:"vertical",fontFamily:"inherit"}}
            value={f.creativeNotes||""}
            onChange={e=>s("creativeNotes",e.target.value)}
            placeholder="クリエイティブに関する追加指示を記載..."
          />
        </div>

        <div style={{marginBottom:16}}>
          <label style={lS}>スケジュール、進行の注意点</label>
          <textarea
            style={{...iS,minHeight:60,resize:"vertical",fontFamily:"inherit"}}
            value={f.scheduleNotes||""}
            onChange={e=>s("scheduleNotes",e.target.value)}
            placeholder="進行上の注意点や懸念事項を記載..."
          />
        </div>

        <div style={{marginBottom:20}}><label style={lS}>メモ</label><textarea style={{...iS,minHeight:70,resize:"vertical",fontFamily:"inherit"}} value={f.memo} onChange={e=>s("memo",e.target.value)} placeholder="案件メモを自由に記載..." /></div>

        <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
          <button onClick={onClose} style={{padding:"10px 20px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:14,cursor:"pointer"}}>キャンセル</button>
          <button onClick={submit} disabled={!f.maker.trim()||!f.product.trim()} style={{padding:"10px 24px",borderRadius:8,border:"none",background:(!f.maker.trim()||!f.product.trim())?"#cbd5e1":"#3b82f6",color:"#fff",fontSize:14,fontWeight:600,cursor:(!f.maker.trim()||!f.product.trim())?"default":"pointer"}}>保存する</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  Gantt Chart View
// ══════════════════════════════════════════
const CELL_W = 30;
const LABEL_W = 180;
const ROW_H = 52;

const MS_COLORS = {
  checked: "#10b981",
  overdue: "#ef4444",
  normal: "#3b82f6",
};

const MS_ABBR = {
  esCollection: "ES",
  infoRelease: "募",
  postStart: "投開",
  postEnd: "投〆",
  viewComplete: "再",
  reportSend: "レ",
};

function GanttView({ campaigns, checks }) {
  const [tooltip, setTooltip] = useState(null);
  const scrollRef = useRef(null);

  const { minDate, totalDays, months } = useMemo(() => {
    const allDates = campaigns.flatMap(c => MS_DEFS.map(m => c[m.k]).filter(Boolean));
    if (allDates.length === 0) return { minDate: now, totalDays: 1, months: [] };

    const dates = allDates.map(d => new Date(d));
    let mn = new Date(Math.min(...dates));
    let mx = new Date(Math.max(...dates));
    mn.setDate(mn.getDate() - 7);
    mx.setDate(mx.getDate() + 7);
    mn.setHours(0, 0, 0, 0);
    mx.setHours(0, 0, 0, 0);

    const total = Math.ceil((mx - mn) / 864e5) + 1;

    const ms = [];
    const cur = new Date(mn);
    while (cur <= mx) {
      if (cur.getDate() === 1 || ms.length === 0) {
        ms.push({ label: `${cur.getMonth() + 1}月`, offset: Math.ceil((cur - mn) / 864e5) });
      }
      cur.setMonth(cur.getMonth() + 1);
      cur.setDate(1);
    }

    return { minDate: mn, totalDays: total, months: ms };
  }, [campaigns]);

  const dayOff = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d - minDate) / 864e5);
  };

  const todayOff = dayOff(now.toISOString().slice(0, 10));

  // Auto-scroll to today on mount
  useEffect(() => {
    if (scrollRef.current && todayOff !== null && todayOff > 0) {
      scrollRef.current.scrollLeft = (todayOff - 1) * CELL_W;
    }
  }, [todayOff]);
  const chartW = totalDays * CELL_W;

  const dateTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(minDate);
      d.setDate(d.getDate() + i);
      if (d.getDate() === 1 || d.getDate() % 5 === 0) {
        ticks.push({ offset: i, label: `${d.getMonth() + 1}/${d.getDate()}` });
      }
    }
    return ticks;
  }, [minDate, totalDays]);

  const stickyLabel = { width: LABEL_W, minWidth: LABEL_W, position: "sticky", left: 0, zIndex: 3, background: "inherit" };

  return (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
      <div ref={scrollRef} style={{ overflowX: "auto" }}>
        <div style={{ minWidth: LABEL_W + chartW, position: "relative" }}>

          {/* Month header */}
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <div style={{ ...stickyLabel, padding: "8px 12px", fontSize: 10, fontWeight: 600, color: "#64748b", background: "#f8fafc" }}>案件</div>
            <div style={{ position: "relative", width: chartW, height: 24 }}>
              {months.map((m, i) => (
                <div key={i} style={{ position: "absolute", left: m.offset * CELL_W, top: 0, fontSize: 11, fontWeight: 700, color: "#475569", borderLeft: "1px solid #cbd5e1", paddingLeft: 4, height: "100%", display: "flex", alignItems: "center" }}>{m.label}</div>
              ))}
            </div>
          </div>

          {/* Date ticks */}
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <div style={{ ...stickyLabel, background: "#f8fafc" }} />
            <div style={{ position: "relative", width: chartW, height: 20 }}>
              {dateTicks.map((t, i) => (
                <div key={i} style={{ position: "absolute", left: t.offset * CELL_W, top: 0, fontSize: 9, color: "#94a3b8", whiteSpace: "nowrap" }}>{t.label}</div>
              ))}
            </div>
          </div>

          {/* Campaign rows */}
          {campaigns.map(c => {
            const sc = STATUS_CFG[c.status] || STATUS_CFG["未確定"];
            const irOff = dayOff(c.infoRelease);
            const psOff = dayOff(c.postStart);
            const peOff = dayOff(c.postEnd);

            return (
              <div key={c.id} style={{ display: "flex", borderBottom: "1px solid #f1f5f9", background: sc.row, borderLeft: `4px solid ${sc.bl}` }}>
                {/* Sticky label */}
                <div style={{ ...stickyLabel, padding: "10px 8px", overflow: "hidden", background: sc.row, borderRight: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.maker}</div>
                  <div style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.product}</div>
                </div>

                {/* Chart area */}
                <div style={{ position: "relative", width: chartW, height: ROW_H }}>
                  {/* Recruitment period bar: infoRelease → postStart */}
                  {irOff !== null && psOff !== null && psOff > irOff && (
                    <div style={{ position: "absolute", left: irOff * CELL_W, top: 14, width: (psOff - irOff) * CELL_W, height: 14, background: "rgba(251,191,36,0.3)", borderRadius: 3 }}>
                      <span style={{ position: "absolute", top: -10, left: 2, fontSize: 8, color: "#b45309", whiteSpace: "nowrap" }}>募集期間</span>
                    </div>
                  )}

                  {/* Post period bar: postStart → postEnd */}
                  {psOff !== null && peOff !== null && peOff > psOff && (
                    <div style={{ position: "absolute", left: psOff * CELL_W, top: 14, width: (peOff - psOff) * CELL_W, height: 14, background: "rgba(167,139,250,0.3)", borderRadius: 3 }}>
                      <span style={{ position: "absolute", top: -10, left: 2, fontSize: 8, color: "#6d28d9", whiteSpace: "nowrap" }}>投稿期間</span>
                    </div>
                  )}

                  {/* Milestone markers with abbreviation */}
                  {MS_DEFS.map(m => {
                    const off = dayOff(c[m.k]);
                    if (off === null) return null;
                    const chk = checks[`${c.id}-${m.k}`];
                    const od = isMsOverdue(c, m, chk);
                    const color = chk ? MS_COLORS.checked : od ? MS_COLORS.overdue : MS_COLORS.normal;
                    const statusText = chk ? "✓済み" : od ? `${Math.abs(dDiff(m.deadlineOffset(c[m.k])))}日遅延` : "未完了";
                    const abbr = MS_ABBR[m.k] || "";

                    return (
                      <div
                        key={m.k}
                        style={{ position: "absolute", left: off * CELL_W - 10, top: 16, width: 20, height: 20, borderRadius: "50%", background: color, border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", cursor: "pointer", zIndex: 4, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, text: `${m.label} ${fDate(c[m.k])} ${statusText}` })}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <span style={{ fontSize: 7, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{abbr}</span>
                      </div>
                    );
                  })}

                  {/* Today line */}
                  {todayOff !== null && todayOff >= 0 && todayOff <= totalDays && (
                    <div style={{ position: "absolute", left: todayOff * CELL_W, top: 0, width: 0, height: "100%", borderLeft: "2px dashed #ef4444", zIndex: 1, opacity: 0.6 }} />
                  )}
                </div>
              </div>
            );
          })}

          {campaigns.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>該当する案件がありません</div>}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{ position: "fixed", left: tooltip.x + 10, top: tooltip.y - 30, background: "#1e293b", color: "#fff", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", zIndex: 9999, pointerEvents: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
          {tooltip.text}
        </div>
      )}

      {/* Legend */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 16, fontSize: 10, color: "#64748b", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 12, height: 12, borderRadius: "50%", background: MS_COLORS.checked, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 6, color: "#fff", fontWeight: 700 }}>ES</span>✓済み</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 12, height: 12, borderRadius: "50%", background: MS_COLORS.overdue, display: "inline-block" }} />遅延中</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 12, height: 12, borderRadius: "50%", background: MS_COLORS.normal, display: "inline-block" }} />未到達</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 24, height: 8, borderRadius: 2, background: "rgba(251,191,36,0.3)", display: "inline-block" }} />募集期間</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 24, height: 8, borderRadius: 2, background: "rgba(167,139,250,0.3)", display: "inline-block" }} />投稿期間</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 0, height: 10, borderLeft: "2px dashed #ef4444", display: "inline-block", opacity: 0.6 }} />今日</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  Main Dashboard
// ══════════════════════════════════════════
export function MilestoneBoard() {
  const [campaigns, setCampaigns] = useState([]);
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("postStart");
  const [viewMode, setViewMode] = useState("table"); // "table" | "calendar"
  const [expandedId, setExpanded] = useState(null);
  const [checks, setChecks] = useState({});  // { "campId-msKey": true }
  const [modal, setModal] = useState(null);
  const [memoOpen, setMemoOpen] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const memoTimerRef = useRef({});

  // ── Load data from Supabase on mount ──
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const { data: campRows, error: campErr } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: true });

      if (campErr) throw campErr;

      // If DB is empty, seed it (本番ではSEEDが空配列なので no-op)
      if ((!campRows || campRows.length === 0) && SEED.length > 0) {
        const { data: seeded, error: seedErr } = await supabase
          .from("campaigns")
          .insert(SEED)
          .select();
        if (seedErr) throw seedErr;
        setCampaigns((seeded || []).map(dbToFront));
      } else {
        setCampaigns((campRows || []).map(dbToFront));
      }

      // Load milestone checks
      const { data: checkRows, error: checkErr } = await supabase
        .from("milestone_checks")
        .select("*");

      if (checkErr) throw checkErr;

      const checksMap = {};
      (checkRows || []).forEach(row => {
        if (row.checked) {
          checksMap[`${row.campaign_id}-${row.milestone_key}`] = true;
        }
      });
      setChecks(checksMap);

    } catch (err) {
      console.error("Failed to load data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Toggle milestone check (optimistic) ──
  const toggleCheck = useCallback(async (cid, mk) => {
    const key = `${cid}-${mk}`;
    const newVal = !checks[key];

    // Optimistic update
    setChecks(p => ({ ...p, [key]: newVal }));

    try {
      if (newVal) {
        await supabase
          .from("milestone_checks")
          .upsert(
            { campaign_id: cid, milestone_key: mk, checked: true, checked_at: new Date().toISOString() },
            { onConflict: "campaign_id,milestone_key" }
          );
      } else {
        await supabase
          .from("milestone_checks")
          .upsert(
            { campaign_id: cid, milestone_key: mk, checked: false, checked_at: null },
            { onConflict: "campaign_id,milestone_key" }
          );
      }
    } catch (err) {
      console.error("Failed to toggle check:", err);
      // Revert on error
      setChecks(p => ({ ...p, [key]: !newVal }));
    }
  }, [checks]);

  // ── Update status (optimistic) ──
  const updateStatus = useCallback(async (id, st) => {
    const prev = campaigns.find(c => c.id === id)?.status;
    setCampaigns(p => p.map(c => c.id === id ? { ...c, status: st } : c));

    try {
      const { error } = await supabase.from("campaigns").update({ status: st }).eq("id", id);
      if (error) throw error;
    } catch (err) {
      console.error("Failed to update status:", err);
      setCampaigns(p => p.map(c => c.id === id ? { ...c, status: prev } : c));
    }
  }, [campaigns]);

  // ── Add campaign ──
  const addCampaign = async (data) => {
    const tempId = Date.now();
    const tempCampaign = { ...data, id: tempId };

    // Optimistic
    setCampaigns(p => [...p, tempCampaign]);
    setModal(null);

    try {
      const { data: inserted, error } = await supabase
        .from("campaigns")
        .insert(frontToDb(data))
        .select()
        .single();
      if (error) throw error;
      // Replace temp with real
      setCampaigns(p => p.map(c => c.id === tempId ? dbToFront(inserted) : c));
    } catch (err) {
      console.error("Failed to add campaign:", err);
      setCampaigns(p => p.filter(c => c.id !== tempId));
    }
  };

  // ── Edit campaign ──
  const editCampaign = async (data) => {
    const prev = campaigns.find(c => c.id === data.id);
    setCampaigns(p => p.map(c => c.id === data.id ? { ...c, ...data } : c));
    setModal(null);

    try {
      const { error } = await supabase
        .from("campaigns")
        .update(frontToDb(data))
        .eq("id", data.id);
      if (error) throw error;
    } catch (err) {
      console.error("Failed to edit campaign:", err);
      if (prev) setCampaigns(p => p.map(c => c.id === data.id ? prev : c));
    }
  };

  // ── Delete campaign ──
  const deleteCampaign = async (id) => {
    if (!confirm("この案件を削除しますか？")) return;

    const prev = campaigns.find(c => c.id === id);
    setCampaigns(p => p.filter(c => c.id !== id));
    if (expandedId === id) setExpanded(null);

    try {
      // Delete checks first, then campaign
      await supabase.from("milestone_checks").delete().eq("campaign_id", id);
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    } catch (err) {
      console.error("Failed to delete campaign:", err);
      if (prev) setCampaigns(p => [...p, prev]);
    }
  };

  // ── Update memo with debounce ──
  const updateMemo = useCallback((id, memo) => {
    setCampaigns(p => p.map(c => c.id === id ? { ...c, memo } : c));

    if (memoTimerRef.current[id]) clearTimeout(memoTimerRef.current[id]);
    memoTimerRef.current[id] = setTimeout(async () => {
      try {
        const { error } = await supabase.from("campaigns").update({ memo }).eq("id", id);
        if (error) throw error;
      } catch (err) {
        console.error("Failed to update memo:", err);
      }
    }, 800);
  }, []);

  const enriched = useMemo(() => campaigns.map(calc), [campaigns]);

  const filtered = useMemo(() => {
    let list = [...enriched];
    if (filter !== "all") list = list.filter(c => c.status === filter);
    list.sort((a, b) => {
      if (sortBy === "postStart") { const an = a.postStart, bn = b.postStart; if (!an) return 1; if (!bn) return -1; return new Date(an) - new Date(bn); }
      if (sortBy === "budget") return (b.budget || 0) - (a.budget || 0);
      if (sortBy === "maker") return a.maker.localeCompare(b.maker);
      return 0;
    });
    return list;
  }, [enriched, filter, sortBy]);

  // ── Stats ──
  const stats = useMemo(() => {
    const byStatus = {};
    S_ORDER.forEach(s => { byStatus[s] = enriched.filter(c => c.status === s).length; });

    let overdueActions = 0;
    enriched.forEach(c => {
      MS_DEFS.forEach(m => {
        if (isMsOverdue(c, m, checks[`${c.id}-${m.k}`])) overdueActions++;
      });
    });

    const monthly = {};
    enriched.forEach(c => {
      if (!c.postEnd || !c.budget) return;
      const d = new Date(c.postEnd);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly[key] = (monthly[key] || 0) + c.budget;
    });
    const monthKeys = Object.keys(monthly).sort();

    return { total: enriched.length, byStatus, overdueActions, totalBudget: enriched.reduce((s, c) => s + (c.budget || 0), 0), monthly, monthKeys };
  }, [enriched, checks]);

  // ── Loading / Error states ──
  if (loading) {
    return (
      <div style={{ background: "#f8fafc", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Helvetica Neue','Hiragino Sans','Yu Gothic',sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div style={{ color: "#64748b", fontSize: 14 }}>データを読み込み中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: "#f8fafc", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Helvetica Neue','Hiragino Sans','Yu Gothic',sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
          <div style={{ color: "#ef4444", fontSize: 14, marginBottom: 12 }}>データの読み込みに失敗しました</div>
          <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 16, wordBreak: "break-all" }}>{error}</div>
          <button onClick={loadData} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 14, cursor: "pointer" }}>再読み込み</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", padding: "24px", fontFamily: "'Helvetica Neue','Hiragino Sans','Yu Gothic',sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "#0f172a", letterSpacing: -.5 }}>Tagpo 案件管理ダッシュボード</h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>{now.getFullYear()}年{now.getMonth() + 1}月{now.getDate()}日 現在</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, color: "#475569", background: "#fff", cursor: "pointer" }}>
            <option value="postStart">投稿開始日順</option>
            <option value="budget">予算順</option>
            <option value="maker">メーカー順</option>
          </select>
          <button onClick={() => setModal({ mode: "add" })} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>＋ 案件追加</button>
        </div>
      </div>

      {/* ── KPI ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 10 }}>
        <Kpi l="全案件" v={stats.total} c="#0f172a" />
        {S_ORDER.map(s => <Kpi key={s} l={s} v={stats.byStatus[s]} c={STATUS_CFG[s].c} />)}
        <Kpi l="対応遅延" v={stats.overdueActions} c="#ef4444" hi={stats.overdueActions > 0} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `180px repeat(${Math.max(stats.monthKeys.length, 1)},1fr)`, gap: 10, marginBottom: 24 }}>
        <Kpi l="総予算" v={fYen(stats.totalBudget)} c="#10b981" sm />
        {stats.monthKeys.map(k => {
          const [, m] = k.split("-");
          return <Kpi key={k} l={`${Number(m)}月売上`} v={fYen(stats.monthly[k])} c="#6366f1" sm />;
        })}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {["all", ...S_ORDER].map(s => {
          const act = filter === s;
          const label = s === "all" ? "すべて" : s;
          const cnt = s === "all" ? enriched.length : enriched.filter(c => c.status === s).length;
          return <button key={s} onClick={() => setFilter(s)} style={{ padding: "6px 16px", borderRadius: 20, border: act ? "2px solid #3b82f6" : "1px solid #e2e8f0", background: act ? "#eff6ff" : "#fff", color: act ? "#2563eb" : "#64748b", fontWeight: act ? 600 : 400, fontSize: 13, cursor: "pointer" }}>{label} ({cnt})</button>;
        })}
        <div style={{ marginLeft: "auto", display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0" }}>
          {[{ k: "table", l: "テーブル" }, { k: "calendar", l: "カレンダー" }].map(v => (
            <button key={v.k} onClick={() => setViewMode(v.k)} style={{ padding: "6px 14px", border: "none", background: viewMode === v.k ? "#3b82f6" : "#fff", color: viewMode === v.k ? "#fff" : "#64748b", fontSize: 12, fontWeight: viewMode === v.k ? 600 : 400, cursor: "pointer" }}>{v.l}</button>
          ))}
        </div>
      </div>

      {/* ── Calendar View ── */}
      {viewMode === "calendar" && <GanttView campaigns={filtered} checks={checks} />}

      {/* ── Table ── */}
      {viewMode === "table" && (
      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 110px 60px 80px 80px repeat(6,64px) 40px", padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: .5, alignItems: "end" }}>
          <span>メーカー</span><span>商品</span><span>ステータス</span><span>審査</span><span>小売店</span><span>予算</span>
          {MS_DEFS.map(m => <span key={m.k} style={{ textAlign: "center", lineHeight: 1.2 }}>{m.label.replace("（情報解禁）", "").slice(0, 5)}</span>)}
          <span></span>
        </div>

        {filtered.map(c => {
          const ex = expandedId === c.id;
          const sc = STATUS_CFG[c.status] || STATUS_CFG["未確定"];
          const rbg = sc.row;
          const rbl = sc.bl;

          return (
            <div key={c.id}>
              <div onClick={() => setExpanded(ex ? null : c.id)} style={{ display: "grid", gridTemplateColumns: "140px 1fr 110px 60px 80px 80px repeat(6,64px) 40px", padding: "10px 16px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", background: rbg, borderLeft: `4px solid ${rbl}`, alignItems: "center", transition: "background .15s" }}>
                <span style={{ fontWeight: 600, fontSize: 12, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.maker}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
                  <span style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.product}</span>
                  {c.url && <a href={c.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: "#3b82f6", flexShrink: 0 }} title={c.url}>🔗</a>}
                </div>
                <span><span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, color: sc.c, background: sc.bg }}>{c.status}</span></span>
                <span style={{ fontSize: 12, color: "#475569", fontWeight: 500 }}>{c.review || "—"}</span>
                <span style={{ fontSize: 11, color: "#475569", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.retailer || "—"}</span>
                <span style={{ fontSize: 12, color: "#475569", fontWeight: 500 }}>{fYen(c.budget)}</span>

                {MS_DEFS.map(m => {
                  const hasDate = !!c[m.k];
                  const chk = checks[`${c.id}-${m.k}`];
                  const od = isMsOverdue(c, m, chk);
                  let bg = "#f1f5f9", color = "#cbd5e1", icon = "—";
                  if (hasDate && chk) { bg = "#ecfdf5"; color = "#10b981"; icon = "✓"; }
                  else if (hasDate && od) { bg = "#fef2f2"; color = "#ef4444"; icon = "!"; }
                  else if (hasDate) { bg = "#f0fdf4"; color = "#16a34a"; icon = fDate(c[m.k]); }
                  return <span key={m.k} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color, background: bg, borderRadius: 4, padding: "3px 2px", lineHeight: 1 }}>{icon}</span>;
                })}

                <span style={{ fontSize: 14, color: "#94a3b8", textAlign: "center" }}>{ex ? "▲" : "▼"}</span>
              </div>

              {/* ── Expanded ── */}
              {ex && (
                <div style={{ padding: "16px 20px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    {/* Left: details */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#475569" }}>案件詳細</h4>
                        <button onClick={() => setModal({ mode: "edit", campaign: c })} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #3b82f6", background: "#eff6ff", color: "#3b82f6", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>編集</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 13 }}>
                        <DI l="タイプ" v={c.type} /><DI l="審査" v={c.review || "—"} />
                        <DI l="指定小売店" v={c.retailer || "—"} /><DI l="予算" v={fYen(c.budget)} /><DI l="再生単価" v={c.unitPrice ? `¥${c.unitPrice}` : "—"} />
                        <DI l="平均再生回数" v={fNum(c.avgViews)} />
                        <DI l="必要再生回数" v={fNum(c.requiredViews)} accent /><DI l="目標投稿数" v={fNum(c.targetPosts)} accent />
                        <DI l="投稿者数" v={c.influencers || "—"} />
                      </div>
                      {c.url && <div style={{ marginTop: 8, fontSize: 12 }}><span style={{ color: "#94a3b8", fontWeight: 500 }}>URL：</span><a href={c.url} target="_blank" rel="noreferrer" style={{ color: "#3b82f6", wordBreak: "break-all" }}>{c.url}</a></div>}

                      {/* Meeting Notes */}
                      {c.meetingNotes && c.meetingNotes.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>議事録：</span>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                            {c.meetingNotes.map((note, i) => (
                              note.url && <a key={i} href={note.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 12, color: "#3b82f6", textDecoration: "none" }}>
                                {note.label || `議事録 ${i + 1}`} 🔗
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Memo */}
                      <div style={{ marginTop: 12 }}>
                        <button onClick={() => setMemoOpen(p => ({ ...p, [c.id]: !p[c.id] }))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#64748b", display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
                          {memoOpen[c.id] ? "▼" : "▶"} メモ {c.memo ? `(${c.memo.length}文字)` : "(なし)"}
                        </button>
                        {memoOpen[c.id] && <textarea value={c.memo || ""} onChange={e => updateMemo(c.id, e.target.value)} placeholder="案件メモを自由に入力..." style={{ ...iS, marginTop: 6, minHeight: 80, resize: "vertical", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6 }} />}
                      </div>

                      {/* Status */}
                      <div style={{ marginTop: 14 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>ステータス：</span>
                        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                          {S_ORDER.map(st => (
                            <button key={st} onClick={() => updateStatus(c.id, st)} style={{ padding: "4px 12px", borderRadius: 8, border: c.status === st ? `2px solid ${STATUS_CFG[st].c}` : "1px solid #e2e8f0", background: c.status === st ? STATUS_CFG[st].bg : "#fff", color: c.status === st ? STATUS_CFG[st].c : "#64748b", fontSize: 12, fontWeight: c.status === st ? 600 : 400, cursor: "pointer" }}>{st}</button>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => deleteCampaign(c.id)} style={{ marginTop: 14, padding: "5px 12px", borderRadius: 6, border: "1px solid #fecaca", background: "#fff", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>削除</button>
                    </div>

                    {/* Right: milestone checklist */}
                    <div>
                      <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "#475569" }}>マイルストーン進捗</h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {MS_DEFS.map(m => {
                          const hasDate = !!c[m.k];
                          const chk = checks[`${c.id}-${m.k}`];
                          const od = isMsOverdue(c, m, chk);
                          const deadline = m.deadlineOffset(c[m.k]);
                          const deadlineDiff = dDiff(deadline);

                          let bg = "#f9fafb", bd = "#e5e7eb";
                          if (chk) { bg = "#ecfdf5"; bd = "#86efac"; }
                          else if (od) { bg = "#fef2f2"; bd = "#fca5a5"; }
                          else if (hasDate && deadlineDiff !== null && deadlineDiff <= 3) { bg = "#fffbeb"; bd = "#fcd34d"; }

                          return (
                            <div key={m.k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: bg, border: `1px solid ${bd}`, opacity: hasDate ? 1 : .5 }}>
                              <div onClick={e => { e.stopPropagation(); if (hasDate) toggleCheck(c.id, m.k); }} style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0, border: `2px solid ${chk ? "#10b981" : od ? "#ef4444" : "#d1d5db"}`, background: chk ? "#10b981" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: hasDate ? "pointer" : "default" }}>
                                {chk && <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>✓</span>}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: chk ? "#9ca3af" : "#1e293b", textDecoration: chk ? "line-through" : "none" }}>{m.label}</span>
                                  {hasDate && <span style={{ fontSize: 11, color: "#94a3b8" }}>{fDate(c[m.k])}</span>}
                                </div>
                                <div style={{ fontSize: 11, marginTop: 2, color: chk ? "#10b981" : od ? "#ef4444" : "#64748b" }}>
                                  {chk ? `✓ ${m.action} 完了`
                                    : !hasDate ? "日付未設定"
                                    : od ? `⚠ ${m.action}が${Math.abs(dDiff(deadline))}日遅延中`
                                    : deadlineDiff !== null && deadlineDiff <= 3 ? `${m.action} 期限まであと${deadlineDiff}日`
                                    : `${m.action} 期限: ${fDate(deadline)}`}
                                </div>
                              </div>
                              {od && !chk && <span style={{ fontSize: 20, flexShrink: 0 }}>🔴</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>該当する案件がありません</div>}
      </div>
      )}

      {/* ── Legend ── */}
      <div style={{ marginTop: 16, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: "#64748b", alignItems: "center" }}>
        <span style={{ fontWeight: 600 }}>行カラー：</span>
        {[{ l: "未確定", c: "#cbd5e1" }, { l: "シート回収済み", c: "#fbbf24" }, { l: "進行中", c: "#60a5fa" }, { l: "投稿中", c: "#a78bfa" }, { l: "完了", c: "#34d399" }, { l: "対応遅延あり", c: "#ef4444" }].map(i => (
          <span key={i.l} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 12, height: 7, borderRadius: 2, background: i.c, display: "inline-block" }} />{i.l}</span>
        ))}
        <span style={{ marginLeft: 8, fontWeight: 600 }}>セル：</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: "#ecfdf5", border: "1px solid #86efac", display: "inline-block" }} />完了</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: "#fef2f2", border: "1px solid #fca5a5", display: "inline-block" }} />遅延</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: "#f0fdf4", border: "1px solid #86efac", display: "inline-block" }} />日付あり</span>
      </div>

      {/* Modal */}
      {modal?.mode === "add" && <CampaignForm title="新規案件を追加" onSave={addCampaign} onClose={() => setModal(null)} />}
      {modal?.mode === "edit" && <CampaignForm title="案件を編集" initial={modal.campaign} onSave={d => editCampaign({ ...modal.campaign, ...d })} onClose={() => setModal(null)} />}
    </div>
  );
}

// ── Small components ──
function Kpi({ l, v, c, hi, sm }) {
  return <div style={{ background: hi ? `${c}10` : "#fff", borderRadius: 10, padding: "12px 14px", border: hi ? `2px solid ${c}` : "1px solid #e2e8f0", boxShadow: hi ? `0 0 12px ${c}20` : "0 1px 2px rgba(0,0,0,.04)" }}>
    <div style={{ fontSize: 10, color: "#64748b", fontWeight: 500, marginBottom: 3 }}>{l}</div>
    <div style={{ fontSize: sm ? 16 : 24, fontWeight: 700, color: hi ? c : "#0f172a" }}>{v}</div>
  </div>;
}
function DI({ l, v, accent }) {
  return <div style={{ padding: "3px 0" }}>
    <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{l}：</span>
    <span style={{ fontSize: 13, color: accent ? "#2563eb" : "#1e293b", fontWeight: accent ? 700 : 500 }}>{v || "—"}</span>
  </div>;
}
