/* ============================================================
   EGGlogU — Reporting & Analytics Engine v1.0
   Depends on: egglogu.js (t, fmtNum, fmtMoney, fmtDate, kpi,
   loadData, todayStr, themeColor, themeRgba, sanitizeHTML,
   currency, locale, CHARTS, activeHens, activeHensByFlock,
   healthScore, DataTable, Chart)
   ============================================================ */
'use strict';
(function(){

/* ── Config ─────────────────────────────────────────────── */
const TEMPLATES=['production','financial','health','feed','kpi'];

const PERIODS=[
  {key:'7d',days:7},
  {key:'30d',days:30},
  {key:'90d',days:90},
  {key:'12m',days:365},
  {key:'custom',days:0}
];

/* ── Helpers ─────────────────────────────────────────────── */
function _dateRange(days){
  const end=new Date();
  const start=new Date();
  start.setDate(start.getDate()-days);
  return{start:start.toISOString().substring(0,10),end:end.toISOString().substring(0,10)};
}

function _daysBetween(a,b){
  return Math.max(1,Math.round((new Date(b)-new Date(a))/(864e5)));
}

function _groupByMonth(records,dateKey){
  const map={};
  records.forEach(r=>{
    const m=(r[dateKey]||'').substring(0,7);
    if(!m)return;
    if(!map[m])map[m]=[];
    map[m].push(r);
  });
  return map;
}

function _groupByWeek(records,dateKey){
  const map={};
  records.forEach(r=>{
    const d=new Date(r[dateKey]+'T12:00:00');
    const w=new Date(d);
    w.setDate(w.getDate()-w.getDay());
    const k=w.toISOString().substring(0,10);
    if(!map[k])map[k]=[];
    map[k].push(r);
  });
  return map;
}

function _sparkline(data,w,h,color){
  if(!data||data.length<2)return'';
  const max=Math.max(...data);
  const min=Math.min(...data);
  const range=max-min||1;
  const step=w/(data.length-1);
  let path='M0,'+(h-(data[0]-min)/range*h);
  for(let i=1;i<data.length;i++){
    path+=' L'+(i*step).toFixed(1)+','+(h-(data[i]-min)/range*h).toFixed(1);
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:inline-block;vertical-align:middle"><path d="${path}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function _trendArrow(current,previous){
  if(!previous||previous===0)return'';
  const pct=((current-previous)/Math.abs(previous)*100);
  if(Math.abs(pct)<0.5)return' <span style="color:var(--text-light)">—</span>';
  const icon=pct>0?'▲':'▼';
  const col=pct>0?'var(--success)':'var(--danger)';
  return ` <span style="color:${col};font-size:11px">${icon} ${Math.abs(pct).toFixed(1)}%</span>`;
}

function _downloadBlob(blob,filename){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function _csvEscape(s){
  const str=String(s==null?'':s);
  return str.includes(',')||str.includes('"')||str.includes('\n')?'"'+str.replace(/"/g,'""')+'"':str;
}

/* ── KPI Cards with Sparklines ────────────────────────────── */
const KPICards={
  render(D,opts){
    opts=opts||{};
    const days=opts.days||30;
    const range=_dateRange(days);
    const prevRange={start:new Date(new Date(range.start).getTime()-days*864e5).toISOString().substring(0,10),end:range.start};

    const prod=D.dailyProduction.filter(p=>p.date>=range.start&&p.date<=range.end);
    const prevProd=D.dailyProduction.filter(p=>p.date>=prevRange.start&&p.date<prevRange.end);
    const hens=typeof activeHens==='function'?activeHens():0;

    // Eggs
    const totalEggs=prod.reduce((s,p)=>s+(p.eggsCollected||0),0);
    const prevEggs=prevProd.reduce((s,p)=>s+(p.eggsCollected||0),0);
    const dailyEggs=this._dailySeries(prod,'eggsCollected',range,days);

    // Hen-day
    const avgHD=hens>0?(totalEggs/Math.max(prod.length,1)/hens*100):0;
    const prevAvgHD=hens>0&&prevProd.length>0?(prevEggs/prevProd.length/hens*100):0;
    const dailyHD=this._dailyHenDay(prod,hens,range,days);

    // Mortality
    const deaths=prod.reduce((s,p)=>s+(p.deaths||0),0);
    const prevDeaths=prevProd.reduce((s,p)=>s+(p.deaths||0),0);
    const totalInit=D.flocks.reduce((s,f)=>s+(f.count||0),0);
    const mortRate=totalInit>0?(deaths/totalInit*100):0;
    const prevMortRate=totalInit>0?(prevDeaths/totalInit*100):0;

    // Feed
    const feedCons=D.feed.consumption.filter(c=>c.date>=range.start&&c.date<=range.end);
    const totalFeedKg=feedCons.reduce((s,c)=>s+(c.quantityKg||0),0);
    const eggKg=totalEggs*0.06;
    const fcr=eggKg>0?(totalFeedKg/eggKg):0;
    const prevFeedCons=D.feed.consumption.filter(c=>c.date>=prevRange.start&&c.date<prevRange.end);
    const prevFeedKg=prevFeedCons.reduce((s,c)=>s+(c.quantityKg||0),0);
    const prevEggKg=prevEggs*0.06;
    const prevFcr=prevEggKg>0?(prevFeedKg/prevEggKg):0;

    // Income
    const income=D.finances.income.filter(i=>i.date>=range.start&&i.date<=range.end);
    const expenses=D.finances.expenses.filter(e=>e.date>=range.start&&e.date<=range.end);
    const totalIncome=income.reduce((s,i)=>s+((i.quantity||0)*(i.unitPrice||0)||(i.amount||0)),0);
    const totalExpense=expenses.reduce((s,e)=>s+(e.amount||0),0);
    const net=totalIncome-totalExpense;
    const prevIncome=D.finances.income.filter(i=>i.date>=prevRange.start&&i.date<prevRange.end).reduce((s,i)=>s+((i.quantity||0)*(i.unitPrice||0)||(i.amount||0)),0);
    const prevExpense=D.finances.expenses.filter(e=>e.date>=prevRange.start&&e.date<prevRange.end).reduce((s,e)=>s+(e.amount||0),0);
    const prevNet=prevIncome-prevExpense;

    const dailyIncome=this._dailySeries(income,'amount',range,days,true);

    const col=typeof themeColor==='function'?themeColor('--primary'):'#1A3C6E';
    let h='<div class="kpi-grid">';
    h+=this._card(t('kpi_today'),fmtNum(totalEggs),t('rpt_period_total'),_sparkline(dailyEggs,80,24,col),_trendArrow(totalEggs,prevEggs));
    h+=this._card(t('kpi_henday'),fmtNum(avgHD,1)+'%',fmtNum(hens)+' '+t('kpi_active_hens').toLowerCase(),_sparkline(dailyHD,80,24,'#FF8F00'),_trendArrow(avgHD,prevAvgHD),avgHD<50?'danger':avgHD<70?'warning':'');
    h+=this._card(t('kpi_mortality'),fmtNum(mortRate,1)+'%',fmtNum(deaths)+' '+t('kpi_deaths').toLowerCase(),'',_trendArrow(-mortRate,-prevMortRate),mortRate>5?'danger':mortRate>2?'warning':'');
    h+=this._card(t('kpi_fcr'),fcr>0?fmtNum(fcr,2):'-',t('fcr_unit'),'',_trendArrow(-fcr,-prevFcr),fcr>3?'danger':fcr>2.5?'warning':'');
    h+=this._card(t('fin_net_income'),fmtMoney(net),'',_sparkline(dailyIncome,80,24,net>=0?'#2E7D32':'#C62828'),_trendArrow(net,prevNet),net<0?'danger':'');
    h+=this._card(t('kpi_cost_egg'),totalEggs>0?fmtMoney(totalExpense/totalEggs):'-',fmtNum(totalEggs)+' '+t('prod_eggs').toLowerCase(),'','');
    h+='</div>';
    return h;
  },

  _card(label,value,sub,sparkSvg,trendHtml,cls){
    return `<div class="kpi-card ${cls||''}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}${trendHtml||''}</div>
      <div class="kpi-sub">${sub||''}${sparkSvg?' '+sparkSvg:''}</div>
    </div>`;
  },

  _dailySeries(records,field,range,days,isIncome){
    const map={};
    records.forEach(r=>{
      const d=r.date||'';
      if(!d)return;
      const v=isIncome?((r.quantity||0)*(r.unitPrice||0)||(r.amount||0)):(r[field]||0);
      map[d]=(map[d]||0)+v;
    });
    const arr=[];
    for(let i=days-1;i>=0;i--){
      const d=new Date();d.setDate(d.getDate()-i);
      const ds=d.toISOString().substring(0,10);
      arr.push(map[ds]||0);
    }
    return arr;
  },

  _dailyHenDay(records,hens,range,days){
    const map={};
    records.forEach(r=>{if(r.date)map[r.date]=(map[r.date]||0)+(r.eggsCollected||0);});
    const arr=[];
    for(let i=days-1;i>=0;i--){
      const d=new Date();d.setDate(d.getDate()-i);
      const ds=d.toISOString().substring(0,10);
      arr.push(hens>0?((map[ds]||0)/hens*100):0);
    }
    return arr;
  }
};

/* ── Report Templates ─────────────────────────────────────── */
const ReportTemplates={

  /* ── 1. Production Summary ───────────────────────────── */
  production(D,range){
    const prod=D.dailyProduction.filter(p=>p.date>=range.start&&p.date<=range.end);
    const days=_daysBetween(range.start,range.end);
    const hens=typeof activeHens==='function'?activeHens():0;
    const totalEggs=prod.reduce((s,p)=>s+(p.eggsCollected||0),0);
    const avgPerDay=days>0?totalEggs/days:0;
    const henDay=hens>0?(avgPerDay/hens*100):0;
    const deaths=prod.reduce((s,p)=>s+(p.deaths||0),0);
    const culls=prod.reduce((s,p)=>s+(p.culled||0),0);

    // Size breakdown
    const sizes={S:0,M:0,L:0,XL:0,Jumbo:0};
    prod.forEach(p=>{
      sizes.S+=(p.small||p.eggsS||0);
      sizes.M+=(p.medium||p.eggsM||0);
      sizes.L+=(p.large||p.eggsL||0);
      sizes.XL+=(p.extraLarge||p.eggsXL||0);
      sizes.Jumbo+=(p.jumbo||p.eggsJumbo||0);
    });
    const broken=prod.reduce((s,p)=>s+(p.brokenEggs||p.broken||0),0);
    const dirty=prod.reduce((s,p)=>s+(p.dirtyEggs||p.dirty||0),0);

    // Daily chart data
    const dailyMap={};
    prod.forEach(p=>{if(p.date)dailyMap[p.date]=(dailyMap[p.date]||0)+(p.eggsCollected||0);});
    const chartLabels=[],chartData=[],chartHD=[];
    for(let i=days-1;i>=0;i--){
      const d=new Date(range.end+'T12:00:00');d.setDate(d.getDate()-i);
      const ds=d.toISOString().substring(0,10);
      chartLabels.push(ds.substring(5));
      const e=dailyMap[ds]||0;
      chartData.push(e);
      chartHD.push(hens>0?(e/hens*100):0);
    }

    // Per-flock breakdown
    const flockStats=D.flocks.map(f=>{
      const fp=prod.filter(p=>p.flockId===f.id);
      const fe=fp.reduce((s,p)=>s+(p.eggsCollected||0),0);
      const fh=typeof activeHensByFlock==='function'?activeHensByFlock(f.id):f.count;
      return{name:f.name,eggs:fe,hens:fh,henDay:fh>0?(fe/days/fh*100):0,deaths:fp.reduce((s,p)=>s+(p.deaths||0),0)};
    }).filter(f=>f.eggs>0).sort((a,b)=>b.eggs-a.eggs);

    let h=`<div class="rpt-section">
      <h3>📊 ${t('rpt_production_summary')}</h3>
      <p class="rpt-subtitle">${fmtDate(range.start)} — ${fmtDate(range.end)} (${days} ${t('flock_days')})</p>
      <div class="kpi-grid">
        ${kpi(t('rpt_total_eggs'),fmtNum(totalEggs),t('rpt_avg_day')+': '+fmtNum(avgPerDay,0))}
        ${kpi(t('kpi_henday'),fmtNum(henDay,1)+'%',fmtNum(hens)+' '+t('kpi_active_hens').toLowerCase(),henDay<50?'danger':henDay<70?'warning':'')}
        ${kpi(t('kpi_deaths'),fmtNum(deaths),t('rpt_culled')+': '+fmtNum(culls),deaths>0?'danger':'')}
        ${kpi(t('rpt_broken_dirty'),fmtNum(broken)+' / '+fmtNum(dirty),totalEggs>0?fmtNum((broken+dirty)/totalEggs*100,1)+'% '+t('rpt_loss'):'',broken+dirty>0?'warning':'')}
      </div>
      <div class="card"><h4>${t('rpt_daily_production')}</h4><div class="chart-container"><canvas id="rpt-chart-prod"></canvas></div></div>`;

    // Size breakdown
    const sizeTotal=Object.values(sizes).reduce((s,v)=>s+v,0);
    if(sizeTotal>0){
      h+=`<div class="card"><h4>${t('rpt_size_breakdown')}</h4><div class="chart-container" style="max-height:250px"><canvas id="rpt-chart-sizes"></canvas></div></div>`;
    }

    // Per-flock table
    if(flockStats.length>1){
      h+=DataTable.create({
        id:'rptFlockBreakdown',data:flockStats,emptyIcon:'🐔',emptyText:t('no_data'),showExport:true,
        headerHtml:`<h4>${t('rpt_flock_breakdown')}</h4>`,
        columns:[
          {key:'name',label:t('flock_name'),type:'text',sortable:true,render:r=>'<strong>'+sanitizeHTML(r.name)+'</strong>'},
          {key:'hens',label:t('kpi_active_hens'),type:'number',sortable:true,render:r=>fmtNum(r.hens)},
          {key:'eggs',label:t('prod_eggs'),type:'number',sortable:true,render:r=>fmtNum(r.eggs)},
          {key:'henDay',label:t('kpi_henday'),type:'number',sortable:true,render:r=>`<span style="color:${r.henDay>=80?'var(--success)':r.henDay>=60?'var(--warning)':'var(--danger)'}">${fmtNum(r.henDay,1)}%</span>`},
          {key:'deaths',label:t('kpi_deaths'),type:'number',sortable:true,render:r=>r.deaths?'<span style="color:var(--danger)">'+r.deaths+'</span>':'0'}
        ]
      });
    }
    h+='</div>';

    // Schedule chart rendering
    const chartCfg={
      prod:{el:'rpt-chart-prod',type:'line',labels:chartLabels,datasets:[
        {label:t('prod_eggs'),data:chartData,borderColor:themeColor('--primary'),backgroundColor:themeRgba(.1),fill:true,tension:.3,yAxisID:'y'},
        {label:t('kpi_henday')+' %',data:chartHD,borderColor:'#FF8F00',borderDash:[5,5],tension:.3,yAxisID:'y1'}
      ],scales:{y:{position:'left',title:{display:true,text:t('prod_eggs')}},y1:{position:'right',title:{display:true,text:'%'},grid:{drawOnChartArea:false},min:0,max:100}}},
      sizes:sizeTotal>0?{el:'rpt-chart-sizes',type:'doughnut',labels:Object.keys(sizes),datasets:[{data:Object.values(sizes),backgroundColor:['#90CAF9','#42A5F5','#1E88E5','#1565C0','#0D47A1']}]}:null
    };

    return{html:h,charts:chartCfg,data:{totalEggs,avgPerDay,henDay,deaths,culls,broken,dirty,sizes,flockStats},
      csvRows:this._prodCSV(prod,D)};
  },

  /* ── 2. Financial P&L ────────────────────────────────── */
  financial(D,range){
    const days=_daysBetween(range.start,range.end);
    const income=D.finances.income.filter(i=>i.date>=range.start&&i.date<=range.end);
    const expenses=D.finances.expenses.filter(e=>e.date>=range.start&&e.date<=range.end);
    const totalIncome=income.reduce((s,i)=>s+((i.quantity||0)*(i.unitPrice||0)||(i.amount||0)),0);
    const totalExpense=expenses.reduce((s,e)=>s+(e.amount||0),0);
    const net=totalIncome-totalExpense;
    const margin=totalIncome>0?(net/totalIncome*100):0;

    // By category
    const incByCat={};
    income.forEach(i=>{const c=i.type||t('rpt_other');incByCat[c]=(incByCat[c]||0)+((i.quantity||0)*(i.unitPrice||0)||(i.amount||0));});
    const expByCat={};
    expenses.forEach(e=>{const c=e.category||t('rpt_other');expByCat[c]=(expByCat[c]||0)+(e.amount||0);});

    // Monthly trend
    const incByMonth=_groupByMonth(income,'date');
    const expByMonth=_groupByMonth(expenses,'date');
    const allMonths=[...new Set([...Object.keys(incByMonth),...Object.keys(expByMonth)])].sort();
    const mLabels=[],mInc=[],mExp=[],mNet=[];
    allMonths.forEach(m=>{
      mLabels.push(m);
      const mi=(incByMonth[m]||[]).reduce((s,i)=>s+((i.quantity||0)*(i.unitPrice||0)||(i.amount||0)),0);
      const me=(expByMonth[m]||[]).reduce((s,e)=>s+(e.amount||0),0);
      mInc.push(mi);mExp.push(me);mNet.push(mi-me);
    });

    // Receivables
    const recv=D.finances.receivables||[];
    const pendingRecv=recv.filter(r=>!r.paid);
    const totalPending=pendingRecv.reduce((s,r)=>s+(r.amount||0),0);
    const overdue=pendingRecv.filter(r=>r.dueDate&&r.dueDate<todayStr());
    const totalOverdue=overdue.reduce((s,r)=>s+(r.amount||0),0);

    let h=`<div class="rpt-section">
      <h3>💰 ${t('rpt_financial_pl')}</h3>
      <p class="rpt-subtitle">${fmtDate(range.start)} — ${fmtDate(range.end)} (${days} ${t('flock_days')})</p>
      <div class="kpi-grid">
        ${kpi(t('fin_income'),fmtMoney(totalIncome),fmtNum(income.length)+' '+t('rpt_transactions'))}
        ${kpi(t('fin_expenses'),fmtMoney(totalExpense),fmtNum(expenses.length)+' '+t('rpt_transactions'),'warning')}
        ${kpi(t('fin_net_income'),fmtMoney(net),t('rpt_margin')+': '+fmtNum(margin,1)+'%',net<0?'danger':'')}
        ${kpi(t('fin_receivables'),fmtMoney(totalPending),totalOverdue>0?fmtMoney(totalOverdue)+' '+t('rpt_overdue'):'',totalOverdue>0?'danger':'')}
      </div>
      <div class="card"><h4>${t('rpt_monthly_trend')}</h4><div class="chart-container"><canvas id="rpt-chart-fin"></canvas></div></div>`;

    // Category breakdown tables
    const incCatArr=Object.entries(incByCat).map(([cat,amt])=>({cat,amt})).sort((a,b)=>b.amt-a.amt);
    const expCatArr=Object.entries(expByCat).map(([cat,amt])=>({cat,amt})).sort((a,b)=>b.amt-a.amt);

    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';
    h+='<div class="card"><h4>'+t('fin_income')+' '+t('rpt_by_category')+'</h4>';
    if(incCatArr.length){
      h+='<table class="table"><thead><tr><th>'+t('fin_category')+'</th><th style="text-align:right">'+t('fin_amount')+'</th><th style="text-align:right">%</th></tr></thead><tbody>';
      incCatArr.forEach(r=>{h+=`<tr><td>${sanitizeHTML(r.cat)}</td><td style="text-align:right">${fmtMoney(r.amt)}</td><td style="text-align:right">${fmtNum(totalIncome>0?r.amt/totalIncome*100:0,1)}%</td></tr>`;});
      h+='</tbody></table>';
    }else h+=emptyState('📊',t('no_data'));
    h+='</div>';

    h+='<div class="card"><h4>'+t('fin_expenses')+' '+t('rpt_by_category')+'</h4>';
    if(expCatArr.length){
      h+='<table class="table"><thead><tr><th>'+t('fin_category')+'</th><th style="text-align:right">'+t('fin_amount')+'</th><th style="text-align:right">%</th></tr></thead><tbody>';
      expCatArr.forEach(r=>{h+=`<tr><td>${sanitizeHTML(r.cat)}</td><td style="text-align:right">${fmtMoney(r.amt)}</td><td style="text-align:right">${fmtNum(totalExpense>0?r.amt/totalExpense*100:0,1)}%</td></tr>`;});
      h+='</tbody></table>';
    }else h+=emptyState('📊',t('no_data'));
    h+='</div></div>';
    h+='</div>';

    const chartCfg={
      fin:{el:'rpt-chart-fin',type:'bar',labels:mLabels,datasets:[
        {label:t('fin_income'),data:mInc,backgroundColor:'rgba(46,125,50,.7)'},
        {label:t('fin_expenses'),data:mExp,backgroundColor:'rgba(198,40,40,.7)'},
        {type:'line',label:t('fin_net_income'),data:mNet,borderColor:'#FF8F00',tension:.3,fill:false}
      ]}
    };

    return{html:h,charts:chartCfg,data:{totalIncome,totalExpense,net,margin,incByCat,expByCat,totalPending,totalOverdue},
      csvRows:this._finCSV(income,expenses,D)};
  },

  /* ── 3. Health Overview ──────────────────────────────── */
  health(D,range){
    const days=_daysBetween(range.start,range.end);
    const vaccines=D.vaccines.filter(v=>v.date>=range.start&&v.date<=range.end);
    const meds=D.medications.filter(m=>m.startDate>=range.start&&m.startDate<=range.end);
    const outbreaks=D.outbreaks.filter(o=>o.startDate>=range.start&&o.startDate<=range.end);
    const today=todayStr();

    // Upcoming vaccines
    const upcoming=D.vaccines.filter(v=>v.nextDate&&v.nextDate>=today).sort((a,b)=>a.nextDate.localeCompare(b.nextDate)).slice(0,10);

    // Active meds in withdrawal
    const inWithdrawal=D.medications.filter(m=>m.withdrawalEnd&&m.withdrawalEnd>=today);

    // Outbreak stats
    const activeOutbreaks=D.outbreaks.filter(o=>o.status==='active');
    const totalLoss=outbreaks.reduce((s,o)=>s+(o.economicLoss||0),0);
    const totalDeaths=outbreaks.reduce((s,o)=>s+(o.deaths||0),0);

    // Health scores per flock
    const flockHealth=D.flocks.map(f=>{
      const hs=typeof healthScore==='function'?healthScore(f.id):50;
      return{name:f.name,score:hs};
    }).sort((a,b)=>a.score-b.score);

    let h=`<div class="rpt-section">
      <h3>🏥 ${t('rpt_health_overview')}</h3>
      <p class="rpt-subtitle">${fmtDate(range.start)} — ${fmtDate(range.end)} (${days} ${t('flock_days')})</p>
      <div class="kpi-grid">
        ${kpi(t('vac_title'),fmtNum(vaccines.length),t('rpt_applied_period'))}
        ${kpi(t('med_title'),fmtNum(meds.length),inWithdrawal.length>0?inWithdrawal.length+' '+t('med_in_withdrawal'):'',inWithdrawal.length?'warning':'')}
        ${kpi(t('out_title'),fmtNum(outbreaks.length),activeOutbreaks.length>0?activeOutbreaks.length+' '+t('out_active'):'',activeOutbreaks.length?'danger':'')}
        ${kpi(t('out_loss'),fmtMoney(totalLoss),fmtNum(totalDeaths)+' '+t('kpi_deaths').toLowerCase(),totalLoss>0?'danger':'')}
      </div>`;

    // Vaccines table
    if(vaccines.length){
      h+=DataTable.create({
        id:'rptVaccines',data:vaccines,emptyIcon:'💉',emptyText:t('no_data'),showExport:true,
        headerHtml:`<h4>${t('vac_title')} — ${t('rpt_period')}</h4>`,
        columns:[
          {key:'date',label:t('date'),type:'date',sortable:true},
          {key:'flockId',label:t('prod_flock'),type:'text',sortable:true,render:r=>{const f=D.flocks.find(x=>x.id===r.flockId);return f?sanitizeHTML(f.name):'-';}},
          {key:'name',label:t('vac_name'),type:'text',sortable:true,render:r=>sanitizeHTML(r.name)},
          {key:'status',label:t('status'),type:'text',sortable:true,render:r=>typeof statusBadge==='function'?statusBadge(r.status):r.status}
        ]
      });
    }

    // Upcoming vaccines
    if(upcoming.length){
      h+='<div class="card"><h4>📅 '+t('rpt_upcoming_vaccines')+'</h4><table class="table"><thead><tr><th>'+t('date')+'</th><th>'+t('prod_flock')+'</th><th>'+t('vac_name')+'</th></tr></thead><tbody>';
      upcoming.forEach(v=>{
        const f=D.flocks.find(x=>x.id===v.flockId);
        h+=`<tr><td>${fmtDate(v.nextDate)}</td><td>${f?sanitizeHTML(f.name):'-'}</td><td>${sanitizeHTML(v.name)}</td></tr>`;
      });
      h+='</tbody></table></div>';
    }

    // Health scores chart
    if(flockHealth.length){
      h+=`<div class="card"><h4>${t('flock_health')} — ${t('rpt_by_flock')}</h4><div class="chart-container" style="max-height:250px"><canvas id="rpt-chart-health"></canvas></div></div>`;
    }
    h+='</div>';

    const chartCfg={
      health:flockHealth.length?{el:'rpt-chart-health',type:'bar',labels:flockHealth.map(f=>f.name),datasets:[{
        label:t('flock_health'),data:flockHealth.map(f=>f.score),
        backgroundColor:flockHealth.map(f=>f.score>=70?'rgba(46,125,50,.7)':f.score>=40?'rgba(255,143,0,.7)':'rgba(198,40,40,.7)')
      }],options:{indexAxis:'y',scales:{x:{min:0,max:100}}}}:null
    };

    return{html:h,charts:chartCfg,data:{vaccines:vaccines.length,meds:meds.length,outbreaks:outbreaks.length,activeOutbreaks:activeOutbreaks.length,totalLoss,inWithdrawal:inWithdrawal.length},
      csvRows:this._healthCSV(vaccines,meds,outbreaks,D)};
  },

  /* ── 4. Feed Efficiency ──────────────────────────────── */
  feed(D,range){
    const days=_daysBetween(range.start,range.end);
    const purchases=D.feed.purchases.filter(p=>p.date>=range.start&&p.date<=range.end);
    const consumption=D.feed.consumption.filter(c=>c.date>=range.start&&c.date<=range.end);
    const prod=D.dailyProduction.filter(p=>p.date>=range.start&&p.date<=range.end);

    const totalPurchased=purchases.reduce((s,p)=>s+(p.quantityKg||0),0);
    const totalCost=purchases.reduce((s,p)=>s+(p.cost||0),0);
    const costPerKg=totalPurchased>0?totalCost/totalPurchased:0;
    const totalConsumed=consumption.reduce((s,c)=>s+(c.quantityKg||0),0);
    const totalEggs=prod.reduce((s,p)=>s+(p.eggsCollected||0),0);
    const eggKg=totalEggs*0.06;
    const fcr=eggKg>0?(totalConsumed/eggKg):0;
    const hens=typeof activeHens==='function'?activeHens():0;
    const consPerHenDay=hens>0&&days>0?(totalConsumed/(hens*days)*1000):0;

    // Stock
    const allPurch=D.feed.purchases.reduce((s,p)=>s+(p.quantityKg||0),0);
    const allCons=D.feed.consumption.reduce((s,c)=>s+(c.quantityKg||0),0);
    const stock=allPurch-allCons;
    const avgDaily=days>0?totalConsumed/days:0;
    const daysRemaining=avgDaily>0?stock/avgDaily:Infinity;

    // Weekly consumption trend
    const weekMap=_groupByWeek(consumption,'date');
    const wLabels=Object.keys(weekMap).sort();
    const wData=wLabels.map(w=>weekMap[w].reduce((s,c)=>s+(c.quantityKg||0),0));

    // By feed type
    const byType={};
    consumption.forEach(c=>{const t2=c.type||'N/A';byType[t2]=(byType[t2]||0)+(c.quantityKg||0);});

    let h=`<div class="rpt-section">
      <h3>🌾 ${t('rpt_feed_efficiency')}</h3>
      <p class="rpt-subtitle">${fmtDate(range.start)} — ${fmtDate(range.end)} (${days} ${t('flock_days')})</p>
      <div class="kpi-grid">
        ${kpi(t('feed_consumption'),fmtNum(totalConsumed,1)+' kg',fmtNum(consPerHenDay,0)+' g/'+t('rpt_hen_day'))}
        ${kpi(t('kpi_fcr'),fcr>0?fmtNum(fcr,2):'-',t('fcr_unit'),fcr>3?'danger':fcr>2.5?'warning':'')}
        ${kpi(t('rpt_feed_cost'),fmtMoney(totalCost),fmtMoney(costPerKg)+'/kg')}
        ${kpi(t('rpt_feed_stock'),fmtNum(stock,0)+' kg',daysRemaining<Infinity?fmtNum(daysRemaining,0)+' '+t('flock_days')+'  '+t('rpt_remaining'):'',daysRemaining<7?'danger':daysRemaining<14?'warning':'')}
      </div>
      <div class="card"><h4>${t('rpt_weekly_consumption')}</h4><div class="chart-container"><canvas id="rpt-chart-feed"></canvas></div></div>`;

    // By type breakdown
    const typeArr=Object.entries(byType).map(([type,kg])=>({type,kg})).sort((a,b)=>b.kg-a.kg);
    if(typeArr.length>1){
      h+=`<div class="card"><h4>${t('rpt_by_feed_type')}</h4><div class="chart-container" style="max-height:250px"><canvas id="rpt-chart-feedtype"></canvas></div></div>`;
    }
    h+='</div>';

    const chartCfg={
      feed:{el:'rpt-chart-feed',type:'bar',labels:wLabels.map(w=>w.substring(5)),datasets:[
        {label:t('feed_consumption')+' (kg)',data:wData,backgroundColor:themeColor('--primary-light')}
      ]},
      feedtype:typeArr.length>1?{el:'rpt-chart-feedtype',type:'doughnut',labels:typeArr.map(t2=>t2.type),datasets:[{data:typeArr.map(t2=>t2.kg),backgroundColor:['#4CAF50','#FF9800','#2196F3','#9C27B0','#F44336','#00BCD4']}]}:null
    };

    return{html:h,charts:chartCfg,data:{totalPurchased,totalCost,costPerKg,totalConsumed,fcr,stock,daysRemaining,consPerHenDay},
      csvRows:this._feedCSV(purchases,consumption,D)};
  },

  /* ── 5. KPI Trends ───────────────────────────────────── */
  kpi(D,range){
    const snapshots=D.kpiSnapshots||[];
    const filtered=snapshots.filter(s=>s.date>=range.start&&s.date<=range.end).sort((a,b)=>a.date.localeCompare(b.date));
    const days=_daysBetween(range.start,range.end);

    let h=`<div class="rpt-section">
      <h3>📈 ${t('rpt_kpi_trends')}</h3>
      <p class="rpt-subtitle">${fmtDate(range.start)} — ${fmtDate(range.end)} (${days} ${t('flock_days')})</p>`;

    if(!filtered.length){
      h+=emptyState('📈',t('rpt_no_snapshots'));
      h+='</div>';
      return{html:h,charts:{},data:{},csvRows:[]};
    }

    const latest=filtered[filtered.length-1];
    const first=filtered[0];

    h+=`<div class="kpi-grid">
      ${kpi(t('kpi_henday'),fmtNum(latest.henDay,1)+'%',_trendArrow(latest.henDay,first.henDay),latest.henDay<50?'danger':latest.henDay<70?'warning':'')}
      ${kpi(t('kpi_fcr'),latest.fcr>0?fmtNum(latest.fcr,2):'-',_trendArrow(-latest.fcr,-first.fcr),latest.fcr>3?'danger':latest.fcr>2.5?'warning':'')}
      ${kpi(t('kpi_mortality'),fmtNum(latest.mortality,1)+'%',_trendArrow(-latest.mortality,-first.mortality),latest.mortality>5?'danger':latest.mortality>2?'warning':'')}
      ${kpi(t('fin_net_income'),fmtMoney(latest.netIncome||0),_trendArrow(latest.netIncome||0,first.netIncome||0),latest.netIncome<0?'danger':'')}
    </div>`;

    h+=`<div class="card"><h4>${t('rpt_kpi_chart')}</h4><div class="chart-container"><canvas id="rpt-chart-kpi"></canvas></div></div>`;
    h+=`<div class="card"><h4>${t('rpt_kpi_fcr_mort')}</h4><div class="chart-container"><canvas id="rpt-chart-kpi2"></canvas></div></div>`;
    h+='</div>';

    const labels=filtered.map(s=>s.date.substring(5));
    const chartCfg={
      kpi:{el:'rpt-chart-kpi',type:'line',labels,datasets:[
        {label:t('kpi_henday')+' %',data:filtered.map(s=>s.henDay),borderColor:'#FF8F00',tension:.3,fill:false},
        {label:t('prod_eggs'),data:filtered.map(s=>s.eggsToday||0),borderColor:themeColor('--primary'),tension:.3,fill:false,yAxisID:'y1'}
      ],scales:{y:{position:'left',title:{display:true,text:'%'}},y1:{position:'right',grid:{drawOnChartArea:false}}}},
      kpi2:{el:'rpt-chart-kpi2',type:'line',labels,datasets:[
        {label:t('kpi_fcr'),data:filtered.map(s=>s.fcr||0),borderColor:'#2E7D32',tension:.3,fill:false},
        {label:t('kpi_mortality')+' %',data:filtered.map(s=>s.mortality||0),borderColor:'#C62828',tension:.3,fill:false,yAxisID:'y1'}
      ],scales:{y:{position:'left',title:{display:true,text:'FCR'}},y1:{position:'right',title:{display:true,text:'%'},grid:{drawOnChartArea:false}}}}
    };

    return{html:h,charts:chartCfg,data:{snapshots:filtered.length,latest,first},
      csvRows:filtered.map(s=>[s.date,s.henDay,s.fcr,s.mortality,s.netIncome||0,s.eggsToday||0,s.activeHens||0])};
  },

  /* ── CSV Builders ────────────────────────────────────── */
  _prodCSV(prod,D){
    const header=[t('date'),t('prod_flock'),t('prod_eggs'),t('kpi_deaths'),t('rpt_culled'),'S','M','L','XL','Jumbo',t('rpt_broken'),t('rpt_dirty')];
    const rows=prod.map(p=>{const f=D.flocks.find(x=>x.id===p.flockId);return[p.date,f?f.name:'-',p.eggsCollected||0,p.deaths||0,p.culled||0,p.small||p.eggsS||0,p.medium||p.eggsM||0,p.large||p.eggsL||0,p.extraLarge||p.eggsXL||0,p.jumbo||p.eggsJumbo||0,p.brokenEggs||p.broken||0,p.dirtyEggs||p.dirty||0];});
    return[header,...rows];
  },
  _finCSV(income,expenses,D){
    const header=[t('fin_type'),t('date'),t('fin_category'),t('fin_description'),t('fin_amount')];
    const rows=[];
    income.forEach(i=>{rows.push([t('csv_income'),i.date,i.type||'-',i.notes||'-',(i.quantity||0)*(i.unitPrice||0)||(i.amount||0)]);});
    expenses.forEach(e=>{rows.push([t('csv_expense'),e.date,e.category||'-',e.description||'-',e.amount||0]);});
    return[header,...rows];
  },
  _healthCSV(vaccines,meds,outbreaks,D){
    const header=[t('rpt_type'),t('date'),t('prod_flock'),t('name'),t('status')];
    const rows=[];
    vaccines.forEach(v=>{const f=D.flocks.find(x=>x.id===v.flockId);rows.push([t('vac_title'),v.date,f?f.name:'-',v.name,v.status||'-']);});
    meds.forEach(m=>{const f=D.flocks.find(x=>x.id===m.flockId);rows.push([t('med_title'),m.startDate,f?f.name:'-',m.name,m.withdrawalEnd||'-']);});
    outbreaks.forEach(o=>{const f=D.flocks.find(x=>x.id===o.flockId);rows.push([t('out_title'),o.startDate,f?f.name:'-',o.disease,o.status||'-']);});
    return[header,...rows];
  },
  _feedCSV(purchases,consumption,D){
    const header=[t('rpt_type'),t('date'),t('feed_type'),t('feed_qty')+' (kg)',t('fin_amount')];
    const rows=[];
    purchases.forEach(p=>{rows.push([t('feed_purchases'),p.date,p.type||'-',p.quantityKg||0,p.cost||0]);});
    consumption.forEach(c=>{const f=D.flocks.find(x=>x.id===c.flockId);rows.push([t('feed_consumption'),c.date,c.type||'-',c.quantityKg||0,f?f.name:'-']);});
    return[header,...rows];
  }
};

/* ── Report Engine ────────────────────────────────────────── */
const ReportEngine={

  generate(template,params){
    params=params||{};
    const D=loadData();
    const period=params.period||'30d';
    let range;
    if(period==='custom'&&params.startDate&&params.endDate){
      range={start:params.startDate,end:params.endDate};
    }else{
      const pd=PERIODS.find(p=>p.key===period)||PERIODS[1];
      range=_dateRange(pd.days);
    }

    if(!ReportTemplates[template])return{html:emptyState('📊',t('rpt_invalid_template')),charts:{},data:{}};
    const result=ReportTemplates[template](D,range);
    return{...result,template,period,range,generatedAt:new Date().toISOString()};
  },

  renderCharts(chartCfg){
    if(!chartCfg||typeof Chart==='undefined')return;
    Object.keys(chartCfg).forEach(key=>{
      const cfg=chartCfg[key];
      if(!cfg)return;
      const el=document.getElementById(cfg.el);
      if(!el)return;
      const opts={responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false}};
      if(cfg.scales)opts.scales=cfg.scales;
      if(cfg.options){Object.assign(opts,cfg.options);}
      if(cfg.type==='doughnut'||cfg.type==='pie'){
        delete opts.scales;
        opts.plugins={legend:{position:'right'}};
      }
      CHARTS['rpt_'+key]=new Chart(el,{type:cfg.type,data:{labels:cfg.labels,datasets:cfg.datasets},options:opts});
    });
  },

  exportCSV(result){
    if(!result||!result.csvRows||!result.csvRows.length)return;
    const csv=result.csvRows.map(row=>row.map(v=>_csvEscape(v)).join(',')).join('\n');
    _downloadBlob(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),'egglogu_'+result.template+'_'+todayStr()+'.csv');
    if(typeof toast==='function')toast(t('cfg_exported'));
  },

  exportExcel(result){
    if(!result||!result.csvRows||!result.csvRows.length)return;
    if(typeof XLSX==='undefined'){
      if(typeof toast==='function')toast(t('rpt_xlsx_missing'),'error');
      return;
    }
    const ws=XLSX.utils.aoa_to_sheet(result.csvRows);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,result.template||'Report');
    XLSX.writeFile(wb,'egglogu_'+result.template+'_'+todayStr()+'.xlsx');
    if(typeof toast==='function')toast(t('cfg_exported'));
  },

  async exportPDF(containerId){
    if(typeof html2canvas==='undefined'||typeof jspdf==='undefined'){
      if(typeof toast==='function')toast(t('rpt_pdf_missing'),'error');
      return;
    }
    const el=document.getElementById(containerId);
    if(!el)return;
    try{
      const canvas=await html2canvas(el,{scale:2,useCORS:true,backgroundColor:'#ffffff'});
      const imgData=canvas.toDataURL('image/png');
      const pdf=new jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
      const w=pdf.internal.pageSize.getWidth()-20;
      const h=canvas.height*w/canvas.width;
      let yPos=10;
      // Header
      pdf.setFontSize(16);
      pdf.text('EGGlogU — '+t('rpt_report'),10,yPos);
      yPos+=8;
      pdf.setFontSize(10);
      pdf.text(t('rpt_generated')+': '+new Date().toLocaleString(locale()),10,yPos);
      yPos+=10;
      // Content
      const pageH=pdf.internal.pageSize.getHeight()-20;
      if(h<=pageH-yPos){
        pdf.addImage(imgData,'PNG',10,yPos,w,h);
      }else{
        // Multi-page
        let remaining=h;
        let srcY=0;
        while(remaining>0){
          const sliceH=Math.min(remaining,pageH-yPos);
          const sliceRatio=sliceH/h;
          const srcH=canvas.height*sliceRatio;
          const tmpCanvas=document.createElement('canvas');
          tmpCanvas.width=canvas.width;
          tmpCanvas.height=srcH;
          const ctx=tmpCanvas.getContext('2d');
          ctx.drawImage(canvas,0,srcY,canvas.width,srcH,0,0,canvas.width,srcH);
          pdf.addImage(tmpCanvas.toDataURL('image/png'),'PNG',10,yPos,w,sliceH);
          remaining-=sliceH;
          srcY+=srcH;
          if(remaining>0){pdf.addPage();yPos=10;}
        }
      }
      pdf.save('egglogu_report_'+todayStr()+'.pdf');
      if(typeof toast==='function')toast(t('cfg_exported'));
    }catch(e){
      console.error('PDF export error:',e);
      if(typeof toast==='function')toast(t('rpt_pdf_error'),'error');
    }
  }
};

/* ── Report UI Renderer ──────────────────────────────────── */
function renderReportes(){
  const D=loadData();
  const state=D.settings._reportState||{template:'production',period:'30d'};

  let h=`<div class="page-header"><h2>📊 ${t('rpt_title')}</h2></div>`;

  // Toolbar
  h+=`<div class="card" style="margin-bottom:16px">
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">
      <div>
        <label style="font-size:12px;color:var(--text-light)">${t('rpt_template')}</label><br>
        <select id="rpt-template" class="form-control" onchange="ReportUI.changeTemplate(this.value)" style="min-width:180px">
          ${TEMPLATES.map(tpl=>`<option value="${tpl}" ${tpl===state.template?'selected':''}>${t('rpt_tpl_'+tpl)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:12px;color:var(--text-light)">${t('rpt_period')}</label><br>
        <select id="rpt-period" class="form-control" onchange="ReportUI.changePeriod(this.value)" style="min-width:140px">
          ${PERIODS.map(p=>`<option value="${p.key}" ${p.key===state.period?'selected':''}>${t('rpt_period_'+p.key)}</option>`).join('')}
        </select>
      </div>
      <div id="rpt-custom-range" style="display:${state.period==='custom'?'flex':'none'};gap:8px;align-items:center">
        <input type="date" id="rpt-start" class="form-control" value="${state.startDate||''}" onchange="ReportUI.refresh()" style="width:150px">
        <span>—</span>
        <input type="date" id="rpt-end" class="form-control" value="${state.endDate||''}" onchange="ReportUI.refresh()" style="width:150px">
      </div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="ReportUI.exportCSV()" title="CSV">📄 CSV</button>
        <button class="btn btn-secondary btn-sm" onclick="ReportUI.exportExcel()" title="Excel">📗 Excel</button>
        <button class="btn btn-primary btn-sm" onclick="ReportUI.exportPDF()" title="PDF">📕 PDF</button>
      </div>
    </div>
  </div>`;

  h+=`<div id="rpt-content"></div>`;

  const el=document.getElementById('sec-reportes');
  if(el)el.innerHTML=h;

  // Generate initial report
  ReportUI.refresh();
}

/* ── Report UI Controller ─────────────────────────────────── */
const ReportUI={
  _lastResult:null,

  changeTemplate(tpl){
    const D=loadData();
    if(!D.settings._reportState)D.settings._reportState={};
    D.settings._reportState.template=tpl;
    saveData(D);
    this.refresh();
  },

  changePeriod(period){
    const D=loadData();
    if(!D.settings._reportState)D.settings._reportState={};
    D.settings._reportState.period=period;
    saveData(D);
    const el=document.getElementById('rpt-custom-range');
    if(el)el.style.display=period==='custom'?'flex':'none';
    if(period!=='custom')this.refresh();
  },

  refresh(){
    const tplSel=document.getElementById('rpt-template');
    const perSel=document.getElementById('rpt-period');
    if(!tplSel||!perSel)return;
    const template=tplSel.value;
    const period=perSel.value;
    const params={period};
    if(period==='custom'){
      params.startDate=(document.getElementById('rpt-start')||{}).value||'';
      params.endDate=(document.getElementById('rpt-end')||{}).value||'';
      if(!params.startDate||!params.endDate)return;
    }

    // Destroy previous report charts
    Object.keys(CHARTS).filter(k=>k.startsWith('rpt_')).forEach(k=>{
      try{CHARTS[k].destroy();}catch(e){}
      delete CHARTS[k];
    });

    const result=ReportEngine.generate(template,params);
    this._lastResult=result;

    const el=document.getElementById('rpt-content');
    if(el)el.innerHTML=result.html;

    setTimeout(()=>ReportEngine.renderCharts(result.charts),50);
  },

  exportCSV(){
    if(this._lastResult)ReportEngine.exportCSV(this._lastResult);
  },
  exportExcel(){
    if(this._lastResult)ReportEngine.exportExcel(this._lastResult);
  },
  exportPDF(){
    ReportEngine.exportPDF('rpt-content');
  }
};

/* ── Expose globals ──────────────────────────────────────── */
window.ReportEngine=ReportEngine;
window.ReportUI=ReportUI;
window.KPICards=KPICards;
window.renderReportes=renderReportes;

})();
