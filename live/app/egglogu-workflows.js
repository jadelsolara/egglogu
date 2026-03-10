/* ============================================================
   EGGlogU — Workflow Automation Engine v1.0
   Depends on: egglogu.js (t, fmtNum, fmtMoney, fmtDate, kpi,
   loadData, saveData, todayStr, sanitizeHTML, escapeAttr,
   activeHens, activeHensByFlock, healthScore, toast,
   DataTable, $)
   ============================================================ */
'use strict';
(function(){

/* ── Constants ───────────────────────────────────────────── */
const CONDITION_TYPES=[
  'deaths_spike','low_production','feed_stock','vaccine_due',
  'temperature','payment_overdue','outbreak_active','production_target'
];

const ACTION_TYPES=['notify','email','auto_log','auto_task','update_status'];

const COMPARATORS=['gt','gte','lt','lte','eq','neq'];
const COMPARATOR_LABELS={gt:'>',gte:'≥',lt:'<',lte:'≤',eq:'=',neq:'≠'};

const DEFAULT_COOLDOWN=3600000; // 1 hour in ms

/* ── 8 Preset Templates ─────────────────────────────────── */
const PRESETS={
  mortality_spike:{
    name:'wf_preset_mortality',
    icon:'💀',
    condition:{type:'deaths_spike',field:'deaths_24h',comparator:'gt',threshold:5},
    actions:[
      {type:'notify',priority:'high',messageKey:'wf_notify_mortality'},
      {type:'auto_log',module:'health',messageKey:'wf_log_mortality'}
    ],
    cooldown:7200000
  },
  low_production:{
    name:'wf_preset_low_prod',
    icon:'📉',
    condition:{type:'low_production',field:'henday_drop_pct',comparator:'gt',threshold:10},
    actions:[
      {type:'notify',priority:'medium',messageKey:'wf_notify_low_prod'}
    ],
    cooldown:86400000
  },
  feed_stock_critical:{
    name:'wf_preset_feed_stock',
    icon:'🌾',
    condition:{type:'feed_stock',field:'days_remaining',comparator:'lt',threshold:7},
    actions:[
      {type:'notify',priority:'high',messageKey:'wf_notify_feed_stock'},
      {type:'auto_task',messageKey:'wf_task_feed_stock'}
    ],
    cooldown:86400000
  },
  vaccine_due:{
    name:'wf_preset_vaccine',
    icon:'💉',
    condition:{type:'vaccine_due',field:'days_until',comparator:'lte',threshold:3},
    actions:[
      {type:'notify',priority:'medium',messageKey:'wf_notify_vaccine'}
    ],
    cooldown:86400000
  },
  temperature_alert:{
    name:'wf_preset_temp',
    icon:'🌡️',
    condition:{type:'temperature',field:'thi',comparator:'gt',threshold:28},
    actions:[
      {type:'notify',priority:'high',messageKey:'wf_notify_temp'},
      {type:'auto_log',module:'environment',messageKey:'wf_log_temp'}
    ],
    cooldown:3600000
  },
  payment_overdue:{
    name:'wf_preset_payment',
    icon:'💸',
    condition:{type:'payment_overdue',field:'days_overdue',comparator:'gt',threshold:0},
    actions:[
      {type:'notify',priority:'medium',messageKey:'wf_notify_payment'}
    ],
    cooldown:86400000
  },
  outbreak_response:{
    name:'wf_preset_outbreak',
    icon:'🦠',
    condition:{type:'outbreak_active',field:'active_count',comparator:'gt',threshold:0},
    actions:[
      {type:'notify',priority:'critical',messageKey:'wf_notify_outbreak'}
    ],
    cooldown:3600000
  },
  production_target:{
    name:'wf_preset_target',
    icon:'🎯',
    condition:{type:'production_target',field:'below_target_days',comparator:'gte',threshold:3},
    actions:[
      {type:'notify',priority:'medium',messageKey:'wf_notify_target'}
    ],
    cooldown:86400000
  }
};

/* ── Condition Evaluators ─────────────────────────────────── */
const Evaluators={

  deaths_spike(D,cond){
    const today=todayStr();
    const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
    const ys=yesterday.toISOString().substring(0,10);
    const recent=D.dailyProduction.filter(p=>p.date>=ys&&p.date<=today);
    const deaths=recent.reduce((s,p)=>s+(p.deaths||0),0);
    return{value:deaths,triggered:_compare(deaths,cond.comparator,cond.threshold),
      detail:deaths+' '+t('kpi_deaths').toLowerCase()+' (24h)'};
  },

  low_production(D,cond){
    const today=todayStr();
    const d7=new Date();d7.setDate(d7.getDate()-7);const d7s=d7.toISOString().substring(0,10);
    const d14=new Date();d14.setDate(d14.getDate()-14);const d14s=d14.toISOString().substring(0,10);
    const week1=D.dailyProduction.filter(p=>p.date>=d7s&&p.date<=today);
    const week2=D.dailyProduction.filter(p=>p.date>=d14s&&p.date<d7s);
    const avg1=week1.length>0?week1.reduce((s,p)=>s+(p.eggsCollected||0),0)/week1.length:0;
    const avg2=week2.length>0?week2.reduce((s,p)=>s+(p.eggsCollected||0),0)/week2.length:0;
    const hens=typeof activeHens==='function'?activeHens():0;
    const hd=hens>0?(avg1/hens*100):0;
    const drop=avg2>0?((avg2-avg1)/avg2*100):0;
    return{value:drop,triggered:_compare(drop,cond.comparator,cond.threshold),
      detail:t('kpi_henday')+': '+fmtNum(hd,1)+'% (↓'+fmtNum(drop,1)+'%)'};
  },

  feed_stock(D,cond){
    const totalPurch=D.feed.purchases.reduce((s,p)=>s+(p.quantityKg||0),0);
    const totalCons=D.feed.consumption.reduce((s,c)=>s+(c.quantityKg||0),0);
    const stock=totalPurch-totalCons;
    const d30=new Date();d30.setDate(d30.getDate()-30);const d30s=d30.toISOString().substring(0,10);
    const cons30=D.feed.consumption.filter(c=>c.date>=d30s).reduce((s,c)=>s+(c.quantityKg||0),0);
    const avgDaily=cons30/30;
    const daysRemaining=avgDaily>0?stock/avgDaily:Infinity;
    return{value:daysRemaining,triggered:daysRemaining<Infinity&&_compare(daysRemaining,cond.comparator,cond.threshold),
      detail:fmtNum(stock,0)+' kg — '+fmtNum(daysRemaining,0)+' '+t('flock_days')};
  },

  vaccine_due(D,cond){
    const today=todayStr();
    const pending=D.vaccines.filter(v=>v.status!=='applied'&&v.scheduledDate);
    let minDays=Infinity;let nextVac=null;
    pending.forEach(v=>{
      const diff=Math.round((new Date(v.scheduledDate)-new Date(today))/864e5);
      if(diff<minDays){minDays=diff;nextVac=v;}
    });
    return{value:minDays,triggered:minDays<Infinity&&_compare(minDays,cond.comparator,cond.threshold),
      detail:nextVac?sanitizeHTML(nextVac.vaccineName||nextVac.name)+' — '+fmtNum(minDays)+' '+t('flock_days'):t('no_data')};
  },

  temperature(D,cond){
    const recent=D.environment.slice(-3);
    if(!recent.length)return{value:0,triggered:false,detail:t('no_data')};
    const thiVals=recent.map(e=>{
      if(!e.temperature||!e.humidity)return 0;
      return typeof calcTHI==='function'?calcTHI(e.temperature,e.humidity):(e.temperature*1.8+32)-(0.55-0.0055*e.humidity)*((e.temperature*1.8+32)-58);
    }).filter(v=>v>0);
    const countAbove=thiVals.filter(v=>_compare(v,cond.comparator,cond.threshold)).length;
    const maxThi=thiVals.length?Math.max(...thiVals):0;
    return{value:maxThi,triggered:countAbove>=2,
      detail:'THI max: '+fmtNum(maxThi,1)+' ('+countAbove+'/'+thiVals.length+' '+t('wf_readings_above')+')'};
  },

  payment_overdue(D,cond){
    const today=todayStr();
    const recv=D.finances.receivables||[];
    const overdue=recv.filter(r=>!r.paid&&r.dueDate&&r.dueDate<today);
    const totalOverdue=overdue.reduce((s,r)=>s+(r.amount||0),0);
    const maxDays=overdue.length?Math.max(...overdue.map(r=>Math.round((new Date(today)-new Date(r.dueDate))/864e5))):0;
    return{value:maxDays,triggered:overdue.length>0&&_compare(maxDays,cond.comparator,cond.threshold),
      detail:overdue.length+' '+t('rpt_overdue')+' — '+fmtMoney(totalOverdue)};
  },

  outbreak_active(D,cond){
    const active=D.outbreaks.filter(o=>o.status==='active');
    return{value:active.length,triggered:_compare(active.length,cond.comparator,cond.threshold),
      detail:active.length+' '+t('out_active').toLowerCase()};
  },

  production_target(D,cond){
    const target=D.settings.dailyEggTarget||0;
    if(!target)return{value:0,triggered:false,detail:t('wf_no_target')};
    const today=todayStr();
    let belowDays=0;
    for(let i=0;i<7;i++){
      const d=new Date();d.setDate(d.getDate()-i);
      const ds=d.toISOString().substring(0,10);
      const eggs=D.dailyProduction.filter(p=>p.date===ds).reduce((s,p)=>s+(p.eggsCollected||0),0);
      if(eggs<target)belowDays++;
    }
    return{value:belowDays,triggered:_compare(belowDays,cond.comparator,cond.threshold),
      detail:belowDays+'/7 '+t('flock_days')+' '+t('wf_below_target')};
  }
};

/* ── Action Executors ─────────────────────────────────────── */
const Actions={

  notify(D,rule,evalResult){
    const msg=t(rule.actions.find(a=>a.type==='notify').messageKey||'wf_triggered')
      .replace('{rule}',sanitizeHTML(rule.name))
      .replace('{detail}',evalResult.detail);
    if(!D._workflowAlerts)D._workflowAlerts=[];
    const priority=rule.actions.find(a=>a.type==='notify').priority||'medium';
    D._workflowAlerts.push({
      type:priority==='critical'||priority==='high'?'danger':'warning',
      icon:'⚡',
      msg:msg,
      ruleId:rule.id,
      ts:new Date().toISOString()
    });
  },

  auto_log(D,rule,evalResult){
    const action=rule.actions.find(a=>a.type==='auto_log');
    const entry={
      id:_uid(),
      date:todayStr(),
      time:new Date().toTimeString().substring(0,5),
      type:'workflow',
      notes:'[AUTO] '+t(action.messageKey||'wf_auto_logged')+': '+evalResult.detail,
      module:action.module||'general'
    };
    if(!D.logbook)D.logbook=[];
    D.logbook.push(entry);
  },

  auto_task(D,rule,evalResult){
    const action=rule.actions.find(a=>a.type==='auto_task');
    const item={
      id:_uid(),
      text:t(action.messageKey||'wf_auto_task')+': '+evalResult.detail,
      done:false,
      date:todayStr(),
      priority:'high',
      source:'workflow:'+rule.id
    };
    if(!D.checklist)D.checklist=[];
    if(!D.checklist.some(c=>c.source==='workflow:'+rule.id&&!c.done)){
      D.checklist.push(item);
    }
  }
};

function _uid(){return Date.now().toString(36)+Math.random().toString(36).substring(2,8);}

function _compare(val,comp,threshold){
  switch(comp){
    case'gt':return val>threshold;
    case'gte':return val>=threshold;
    case'lt':return val<threshold;
    case'lte':return val<=threshold;
    case'eq':return val===threshold;
    case'neq':return val!==threshold;
    default:return false;
  }
}

/* ── Workflow Engine ──────────────────────────────────────── */
const WorkflowEngine={

  evaluate(D){
    if(!D)D=loadData();
    const rules=D.workflowRules||[];
    if(!rules.length)return[];

    const now=Date.now();
    const results=[];
    D._workflowAlerts=[];

    rules.filter(r=>r.enabled).forEach(rule=>{
      // Cooldown check
      if(rule._lastFired&&(now-rule._lastFired)<(rule.cooldown||DEFAULT_COOLDOWN))return;

      const evaluator=Evaluators[rule.condition.type];
      if(!evaluator)return;

      const evalResult=evaluator(D,rule.condition);
      if(!evalResult.triggered)return;

      // Execute actions
      rule.actions.forEach(action=>{
        const executor=Actions[action.type];
        if(executor)executor(D,rule,evalResult);
      });

      rule._lastFired=now;
      results.push({ruleId:rule.id,ruleName:rule.name,triggered:true,detail:evalResult.detail,ts:new Date().toISOString()});

      // Log execution
      if(!D.workflowExecutions)D.workflowExecutions=[];
      D.workflowExecutions.push({
        id:_uid(),ruleId:rule.id,ruleName:rule.name,
        ts:new Date().toISOString(),detail:evalResult.detail,
        actions:rule.actions.map(a=>a.type)
      });
      // Keep last 500 executions
      if(D.workflowExecutions.length>500)D.workflowExecutions=D.workflowExecutions.slice(-500);
    });

    return results;
  },

  getAlerts(D){
    return(D._workflowAlerts||[]).slice();
  },

  testRule(rule,D){
    if(!D)D=loadData();
    const evaluator=Evaluators[rule.condition.type];
    if(!evaluator)return{triggered:false,detail:t('wf_invalid_condition')};
    return evaluator(D,rule.condition);
  },

  createFromPreset(presetKey){
    const preset=PRESETS[presetKey];
    if(!preset)return null;
    return{
      id:_uid(),
      name:t(preset.name),
      icon:preset.icon,
      enabled:true,
      condition:{...preset.condition},
      actions:preset.actions.map(a=>({...a})),
      cooldown:preset.cooldown||DEFAULT_COOLDOWN,
      createdAt:new Date().toISOString(),
      _lastFired:0
    };
  },

  getPresets(){
    return Object.entries(PRESETS).map(([key,p])=>({key,name:t(p.name),icon:p.icon,condition:p.condition}));
  }
};

/* ── Workflow UI Renderer ─────────────────────────────────── */
function renderAutomatizacion(){
  const D=loadData();
  if(!D.workflowRules)D.workflowRules=[];
  if(!D.workflowExecutions)D.workflowExecutions=[];

  let h=`<div class="page-header"><h2>⚡ ${t('wf_title')}</h2>
    <button class="btn btn-primary" onclick="WorkflowUI.showCreateForm()">${t('wf_create_rule')}</button></div>`;
  h+=`<div class="alert alert-info" style="margin-bottom:1rem;padding:.75rem 1rem;border-radius:8px;background:var(--primary-bg,#e8f4fd);border:1px solid var(--primary,#1976d2);font-size:.9rem;">ℹ️ ${t('wf_browser_note')}</div>`;

  // KPIs
  const activeRules=D.workflowRules.filter(r=>r.enabled).length;
  const totalExec=D.workflowExecutions.length;
  const last24h=D.workflowExecutions.filter(e=>(Date.now()-new Date(e.ts).getTime())<864e5).length;
  h+=`<div class="kpi-grid">
    ${kpi(t('wf_active_rules'),fmtNum(activeRules),fmtNum(D.workflowRules.length)+' '+t('total'))}
    ${kpi(t('wf_executions'),fmtNum(totalExec),t('wf_last_24h')+': '+fmtNum(last24h))}
  </div>`;

  // Preset buttons
  h+=`<div class="card" style="margin-bottom:16px"><h3>${t('wf_presets')}</h3>
    <div style="display:flex;flex-wrap:wrap;gap:8px">`;
  Object.entries(PRESETS).forEach(([key,p])=>{
    const exists=D.workflowRules.some(r=>r.condition.type===p.condition.type);
    h+=`<button class="btn ${exists?'btn-secondary':'btn-primary'} btn-sm" onclick="WorkflowUI.addPreset('${key}')" ${exists?'disabled':''}>
      ${p.icon} ${t(p.name)}${exists?' ✓':''}
    </button>`;
  });
  h+='</div></div>';

  // Rules list
  if(D.workflowRules.length){
    h+=DataTable.create({
      id:'workflowRules',data:D.workflowRules,onRefresh:'renderAutomatizacion',emptyIcon:'⚡',emptyText:t('no_data'),
      headerHtml:`<h3>${t('wf_rules')}</h3>`,
      columns:[
        {key:'icon',label:'',type:'text',width:'40px',render:r=>r.icon||'⚡'},
        {key:'name',label:t('name'),type:'text',sortable:true,filterable:true,render:r=>'<strong>'+sanitizeHTML(r.name)+'</strong>'},
        {key:'condition.type',label:t('wf_condition'),type:'text',sortable:true,filterable:true,filterType:'select',
          filterOptions:CONDITION_TYPES.map(c=>({value:c,label:t('wf_cond_'+c)})),
          getValue:r=>r.condition.type,
          render:r=>t('wf_cond_'+r.condition.type)+' '+(COMPARATOR_LABELS[r.condition.comparator]||'')+' '+r.condition.threshold},
        {key:'actions',label:t('actions'),type:'text',render:r=>r.actions.map(a=>'<span class="badge badge-info" style="margin:1px">'+t('wf_act_'+a.type)+'</span>').join(' ')},
        {key:'enabled',label:t('status'),type:'text',sortable:true,filterable:true,filterType:'select',
          filterOptions:[{value:'true',label:t('active')},{value:'false',label:t('inactive')}],
          getValue:r=>String(!!r.enabled),
          render:r=>`<label class="switch" style="margin:0"><input type="checkbox" ${r.enabled?'checked':''} onchange="WorkflowUI.toggleRule('${escapeAttr(r.id)}',this.checked)"><span class="slider"></span></label>`},
        {key:'_lastFired',label:t('wf_last_fired'),type:'text',sortable:true,
          getValue:r=>r._lastFired||0,
          render:r=>r._lastFired?'<span style="font-size:11px">'+new Date(r._lastFired).toLocaleString(locale())+'</span>':'-'}
      ],
      actions:r=>`<div class="btn-group">
        <button class="btn btn-secondary btn-sm" onclick="WorkflowUI.testRule('${escapeAttr(r.id)}')" title="${t('wf_test')}">🧪</button>
        <button class="btn btn-secondary btn-sm" onclick="WorkflowUI.editRule('${escapeAttr(r.id)}')">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" onclick="WorkflowUI.deleteRule('${escapeAttr(r.id)}')">${t('delete')}</button>
      </div>`,
      bulkActions:[{label:t('delete'),icon:'🗑️',danger:true,action:ids=>{
        if(!confirm(t('confirm_delete')))return;
        const D2=loadData();D2.workflowRules=D2.workflowRules.filter(r=>!ids.includes(r.id));saveData(D2);renderAutomatizacion();
      }}]
    });
  }else{
    h+=emptyState('⚡',t('wf_no_rules'),t('wf_create_rule'),'WorkflowUI.showCreateForm()');
  }

  // Execution log
  if(D.workflowExecutions.length){
    const recentExec=[...D.workflowExecutions].reverse().slice(0,50);
    h+=DataTable.create({
      id:'workflowExec',data:recentExec,emptyIcon:'📋',emptyText:t('no_data'),
      headerHtml:`<h3>${t('wf_execution_log')}</h3>`,showExport:true,
      columns:[
        {key:'ts',label:t('date'),type:'date',sortable:true,getValue:r=>(r.ts||'').substring(0,10),
          render:r=>'<span style="font-size:12px;white-space:nowrap">'+(r.ts||'').replace('T',' ').substring(0,19)+'</span>'},
        {key:'ruleName',label:t('wf_rule'),type:'text',sortable:true,filterable:true,render:r=>sanitizeHTML(r.ruleName)},
        {key:'detail',label:t('wf_detail'),type:'text',render:r=>'<span style="font-size:12px">'+sanitizeHTML(r.detail)+'</span>'},
        {key:'actions',label:t('actions'),type:'text',render:r=>(r.actions||[]).map(a=>'<span class="badge badge-info" style="margin:1px">'+t('wf_act_'+a)+'</span>').join(' ')}
      ]
    });
  }

  const el=$('sec-automatizacion');
  if(el)el.innerHTML=h;
}

/* ── Workflow UI Controller ──────────────────────────────── */
const WorkflowUI={

  addPreset(key){
    const rule=WorkflowEngine.createFromPreset(key);
    if(!rule)return;
    const D=loadData();
    if(!D.workflowRules)D.workflowRules=[];
    D.workflowRules.push(rule);
    saveData(D);
    toast(t('wf_rule_added')+': '+rule.name);
    renderAutomatizacion();
  },

  toggleRule(id,enabled){
    const D=loadData();
    const rule=(D.workflowRules||[]).find(r=>r.id===id);
    if(rule){rule.enabled=enabled;saveData(D);}
  },

  deleteRule(id){
    if(!confirm(t('confirm_delete')))return;
    const D=loadData();
    D.workflowRules=(D.workflowRules||[]).filter(r=>r.id!==id);
    saveData(D);
    renderAutomatizacion();
  },

  testRule(id){
    const D=loadData();
    const rule=(D.workflowRules||[]).find(r=>r.id===id);
    if(!rule)return;
    const result=WorkflowEngine.testRule(rule,D);
    const msg=result.triggered
      ?'✅ '+t('wf_would_trigger')+': '+result.detail
      :'ℹ️ '+t('wf_would_not_trigger')+': '+result.detail;
    toast(msg);
  },

  editRule(id){
    const D=loadData();
    const rule=(D.workflowRules||[]).find(r=>r.id===id);
    if(!rule)return;
    this._showForm(rule);
  },

  showCreateForm(){
    this._showForm(null);
  },

  _showForm(rule){
    const isEdit=!!rule;
    const r=rule||{
      id:_uid(),name:'',icon:'⚡',enabled:true,
      condition:{type:'deaths_spike',comparator:'gt',threshold:5},
      actions:[{type:'notify',priority:'medium',messageKey:'wf_triggered'}],
      cooldown:DEFAULT_COOLDOWN
    };

    let h=`<div class="modal-backdrop" id="wf-modal-backdrop" onclick="WorkflowUI.closeForm()"></div>
    <div class="modal" id="wf-modal" style="display:block;max-width:600px">
      <div class="modal-header">
        <h3>${isEdit?t('edit'):t('wf_create_rule')}</h3>
        <button class="btn btn-secondary btn-sm" onclick="WorkflowUI.closeForm()">✕</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <div class="form-group">
          <label>${t('name')}</label>
          <input type="text" id="wf-name" class="form-control" value="${escapeAttr(r.name)}" placeholder="${t('wf_rule_name')}">
        </div>
        <div class="form-group">
          <label>${t('wf_condition')}</label>
          <select id="wf-cond-type" class="form-control" onchange="WorkflowUI._updateCondUI()">
            ${CONDITION_TYPES.map(c=>`<option value="${c}" ${r.condition.type===c?'selected':''}>${t('wf_cond_'+c)}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <div style="flex:1">
            <label>${t('wf_comparator')}</label>
            <select id="wf-cond-comp" class="form-control">
              ${COMPARATORS.map(c=>`<option value="${c}" ${r.condition.comparator===c?'selected':''}>${COMPARATOR_LABELS[c]}</option>`).join('')}
            </select>
          </div>
          <div style="flex:1">
            <label>${t('wf_threshold')}</label>
            <input type="number" id="wf-cond-threshold" class="form-control" value="${r.condition.threshold}" step="any">
          </div>
        </div>
        <div class="form-group">
          <label>${t('actions')}</label>
          <div id="wf-actions">
            ${r.actions.map((a,i)=>this._actionRow(a,i)).join('')}
          </div>
          <button class="btn btn-secondary btn-sm" onclick="WorkflowUI._addAction()" style="margin-top:4px">+ ${t('wf_add_action')}</button>
        </div>
        <div class="form-group">
          <label>${t('wf_cooldown')} (${t('wf_hours')})</label>
          <input type="number" id="wf-cooldown" class="form-control" value="${Math.round((r.cooldown||DEFAULT_COOLDOWN)/3600000)}" min="1" max="168">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="WorkflowUI.closeForm()">${t('cancel')}</button>
        <button class="btn btn-primary" onclick="WorkflowUI.saveForm('${escapeAttr(r.id)}',${isEdit})">${t('save')}</button>
      </div>
    </div>`;

    // Inject modal
    let container=$('wf-form-container');
    if(!container){
      container=document.createElement('div');
      container.id='wf-form-container';
      document.body.appendChild(container);
    }
    container.innerHTML=h;
  },

  _actionRow(action,index){
    return `<div style="display:flex;gap:8px;margin-bottom:4px;align-items:center" data-wf-action="${index}">
      <select class="form-control wf-action-type" style="flex:2">
        ${ACTION_TYPES.map(a=>`<option value="${a}" ${action.type===a?'selected':''}>${t('wf_act_'+a)}</option>`).join('')}
      </select>
      <select class="form-control wf-action-priority" style="flex:1">
        <option value="low" ${action.priority==='low'?'selected':''}>Low</option>
        <option value="medium" ${action.priority==='medium'?'selected':''}>Medium</option>
        <option value="high" ${action.priority==='high'?'selected':''}>High</option>
        <option value="critical" ${action.priority==='critical'?'selected':''}>Critical</option>
      </select>
      <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
    </div>`;
  },

  _addAction(){
    const container=$('wf-actions');
    if(!container)return;
    const idx=container.children.length;
    const div=document.createElement('div');
    div.innerHTML=this._actionRow({type:'notify',priority:'medium'},idx);
    container.appendChild(div.firstElementChild);
  },

  _updateCondUI(){
    // Could expand with condition-specific fields
  },

  closeForm(){
    const container=$('wf-form-container');
    if(container)container.innerHTML='';
  },

  saveForm(ruleId,isEdit){
    const name=($('wf-name')||{}).value||t('wf_unnamed_rule');
    const condType=($('wf-cond-type')||{}).value;
    const condComp=($('wf-cond-comp')||{}).value;
    const condThreshold=parseFloat(($('wf-cond-threshold')||{}).value)||0;
    const cooldownHours=parseInt(($('wf-cooldown')||{}).value)||1;

    // Collect actions
    const actionEls=document.querySelectorAll('[data-wf-action]');
    const actions=[];
    actionEls.forEach(el=>{
      const type=el.querySelector('.wf-action-type');
      const priority=el.querySelector('.wf-action-priority');
      if(type)actions.push({type:type.value,priority:priority?priority.value:'medium',messageKey:'wf_triggered'});
    });
    if(!actions.length)actions.push({type:'notify',priority:'medium',messageKey:'wf_triggered'});

    const D=loadData();
    if(!D.workflowRules)D.workflowRules=[];

    if(isEdit){
      const rule=D.workflowRules.find(r=>r.id===ruleId);
      if(rule){
        rule.name=name;
        rule.condition={type:condType,comparator:condComp,threshold:condThreshold};
        rule.actions=actions;
        rule.cooldown=cooldownHours*3600000;
      }
    }else{
      D.workflowRules.push({
        id:ruleId,name,icon:'⚡',enabled:true,
        condition:{type:condType,comparator:condComp,threshold:condThreshold},
        actions,cooldown:cooldownHours*3600000,
        createdAt:new Date().toISOString(),_lastFired:0
      });
    }

    saveData(D);
    this.closeForm();
    toast(t('saved'));
    renderAutomatizacion();
  }
};

/* ── Auto-evaluation interval ─────────────────────────────── */
let _wfInterval=null;
function startWorkflowEvaluation(){
  if(_wfInterval)clearInterval(_wfInterval);
  _wfInterval=setInterval(()=>{
    const D=loadData();
    if(!D.workflowRules||!D.workflowRules.length)return;
    const results=WorkflowEngine.evaluate(D);
    if(results.length){
      saveData(D);
      // Show notifications for triggered rules
      results.forEach(r=>{
        toast('⚡ '+r.ruleName+': '+r.detail);
      });
    }
  },300000); // Every 5 minutes
}

/* ── Expose globals ──────────────────────────────────────── */
window.WorkflowEngine=WorkflowEngine;
window.WorkflowUI=WorkflowUI;
window.renderAutomatizacion=renderAutomatizacion;
window.startWorkflowEvaluation=startWorkflowEvaluation;

// Start auto-evaluation when loaded
if(document.readyState==='complete')startWorkflowEvaluation();
else window.addEventListener('load',startWorkflowEvaluation);

})();
