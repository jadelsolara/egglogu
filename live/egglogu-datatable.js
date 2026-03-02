/**
 * EGGlogU DataTable Engine v1.0
 * Enterprise-grade data tables: sort, filter, paginate, bulk actions, export, column toggle, mobile cards.
 * Config-driven, HTML string builder pattern (no DOM components).
 * Uses existing globals: t(), fmtDate(), fmtNum(), fmtMoney(), sanitizeHTML(), escapeAttr(), toast()
 */
const DataTable=(function(){
'use strict';

const _state={};
const _defaults={pageSize:50,page:1,sortCol:null,sortDir:'asc',filters:{},selectedIds:new Set(),visibleCols:null,search:''};

function _getState(id){
  if(!_state[id])_state[id]=JSON.parse(JSON.stringify(_defaults));
  return _state[id];
}

function _resetState(id){_state[id]=JSON.parse(JSON.stringify(_defaults));}

/**
 * DataTable.create(config) -> HTML string
 *
 * config = {
 *   id:           string     — unique table ID (e.g. 'fin-income')
 *   data:         array      — raw data array
 *   columns:      array      — [{key, label, type?, format?, sortable?, filterable?, filterType?, filterOptions?, render?, width?, hidden?}]
 *   actions:      function?  — (row) => HTML string for action buttons
 *   bulkActions:  array?     — [{label, icon?, action, danger?}] — action = function(selectedIds)
 *   onRefresh:    string     — global function name to call on re-render (e.g. 'renderFinIncome')
 *   emptyIcon:    string?    — emoji for empty state
 *   emptyText:    string?    — text for empty state
 *   showSearch:   boolean?   — show search bar (default true)
 *   showExport:   boolean?   — show export buttons (default true)
 *   showColumnPicker: boolean? — show column visibility toggle (default true)
 *   showPagination: boolean? — (default true)
 *   showBulk:     boolean?   — show bulk selection (default: true if bulkActions defined)
 *   pageSize:     number?    — override default 50
 *   rowId:        string?    — key for unique row ID (default 'id')
 *   cardRender:   function?  — (row, cols) => HTML for mobile card view
 *   className:    string?    — additional CSS class for table wrapper
 *   preFilter:    function?  — (data) => filtered data (applied BEFORE user filters)
 *   kpiHtml:      string?    — HTML to show above table (KPI cards)
 *   headerHtml:   string?    — HTML for header (title + buttons), shown above toolbar
 * }
 *
 * Column types: 'text' (default), 'number', 'money', 'date', 'badge', 'custom'
 * Column filterType: 'text' (default), 'select', 'date-range', 'number-range'
 */
function create(config){
  const id=config.id;
  const st=_getState(id);
  if(config.pageSize&&!st._pageSizeSet){st.pageSize=config.pageSize;st._pageSizeSet=true;}
  const rowId=config.rowId||'id';
  const showSearch=config.showSearch!==false;
  const showExport=config.showExport!==false;
  const showColPicker=config.showColumnPicker!==false;
  const showPagination=config.showPagination!==false;
  const showBulk=config.showBulk!==undefined?config.showBulk:!!(config.bulkActions&&config.bulkActions.length);
  const cols=config.columns.filter(c=>!c.hidden);
  if(!st.visibleCols)st.visibleCols=cols.map(c=>c.key);

  // Visible columns for this render
  const visCols=cols.filter(c=>st.visibleCols.includes(c.key));

  let data=config.data?[...config.data]:[];

  // Pre-filter
  if(config.preFilter)data=config.preFilter(data);

  // Search
  if(st.search&&st.search.trim()){
    const q=st.search.trim().toLowerCase();
    data=data.filter(row=>{
      return visCols.some(c=>{
        const v=_getCellValue(row,c);
        return v!==null&&v!==undefined&&String(v).toLowerCase().includes(q);
      });
    });
  }

  // Column filters
  data=_applyFilters(data,visCols,st.filters);

  // Sort
  if(st.sortCol){
    const col=visCols.find(c=>c.key===st.sortCol);
    if(col){
      const dir=st.sortDir==='desc'?-1:1;
      data.sort((a,b)=>{
        let va=_getCellValue(a,col),vb=_getCellValue(b,col);
        if(va==null)va='';if(vb==null)vb='';
        if(col.type==='number'||col.type==='money'){va=parseFloat(va)||0;vb=parseFloat(vb)||0;}
        else if(col.type==='date'){va=String(va);vb=String(vb);}
        else{va=String(va).toLowerCase();vb=String(vb).toLowerCase();}
        return va<vb?-dir:va>vb?dir:0;
      });
    }
  }

  const totalFiltered=data.length;

  // Paginate
  let totalPages=1,pageItems=data;
  if(showPagination){
    totalPages=Math.max(1,Math.ceil(data.length/st.pageSize));
    st.page=Math.max(1,Math.min(st.page,totalPages));
    pageItems=data.slice((st.page-1)*st.pageSize,st.page*st.pageSize);
  }

  // Build HTML
  let h='';

  // Header
  if(config.headerHtml)h+=config.headerHtml;

  // KPI
  if(config.kpiHtml)h+=config.kpiHtml;

  // Toolbar
  h+=_buildToolbar(id,config,st,showSearch,showExport,showColPicker,cols,visCols,totalFiltered,data);

  // Bulk action bar (sticky)
  if(showBulk&&st.selectedIds.size>0){
    h+=_buildBulkBar(id,config,st);
  }

  // Empty state
  if(!pageItems.length){
    if(totalFiltered===0&&(config.data||[]).length>0){
      h+=`<div class="card" style="text-align:center;padding:40px;color:var(--text-light)"><div style="font-size:32px;margin-bottom:8px">🔍</div>${t('dt_no_results')||'No results match your filters'}</div>`;
    } else {
      const icon=config.emptyIcon||'📋';
      const txt=config.emptyText||t('no_data');
      h+=`<div class="card" style="text-align:center;padding:40px;color:var(--text-light)"><div style="font-size:32px;margin-bottom:8px">${icon}</div>${sanitizeHTML(txt)}</div>`;
    }
    return h;
  }

  // Desktop table
  h+=`<div class="card dt-card-wrap"><div class="table-wrap dt-table-desktop"><table class="dt-table" data-dt-id="${escapeAttr(id)}"><thead><tr>`;

  // Bulk checkbox header
  if(showBulk){
    const allChecked=pageItems.every(r=>st.selectedIds.has(r[rowId]));
    h+=`<th class="dt-th-check"><input type="checkbox" class="dt-checkbox" ${allChecked?'checked':''} onchange="DataTable._toggleAll('${escapeAttr(id)}',this.checked,'${escapeAttr(config.onRefresh)}')"></th>`;
  }

  // Column headers
  visCols.forEach(c=>{
    const sortable=c.sortable!==false;
    const isSorted=st.sortCol===c.key;
    const arrow=isSorted?(st.sortDir==='asc'?' ▲':' ▼'):'';
    const cls='dt-th'+(sortable?' dt-sortable':'')+(isSorted?' dt-sorted':'');
    const wStyle=c.width?`style="width:${c.width}"`:'';;
    if(sortable){
      h+=`<th class="${cls}" ${wStyle} onclick="DataTable._sort('${escapeAttr(id)}','${escapeAttr(c.key)}','${escapeAttr(config.onRefresh)}')" role="columnheader" aria-sort="${isSorted?st.sortDir:'none'}">${sanitizeHTML(c.label)}${arrow}</th>`;
    }else{
      h+=`<th class="${cls}" ${wStyle}>${sanitizeHTML(c.label)}</th>`;
    }
  });

  // Actions header
  if(config.actions)h+=`<th class="dt-th">${t('actions')}</th>`;

  h+='</tr>';

  // Filter row
  const hasFilters=visCols.some(c=>c.filterable!==false);
  if(hasFilters){
    h+='<tr class="dt-filter-row">';
    if(showBulk)h+='<td></td>';
    visCols.forEach(c=>{
      h+='<td>';
      if(c.filterable===false){h+='</td>';return;}
      const fType=c.filterType||(c.type==='date'?'date-range':c.type==='number'||c.type==='money'?'number-range':'text');
      const fVal=st.filters[c.key];
      if(fType==='select'){
        const opts=c.filterOptions||[];
        h+=`<select class="dt-filter-select" onchange="DataTable._filter('${escapeAttr(id)}','${escapeAttr(c.key)}',this.value,'${escapeAttr(config.onRefresh)}')">`;
        h+=`<option value="">${t('all')}</option>`;
        opts.forEach(o=>{
          const val=typeof o==='object'?o.value:o;
          const lbl=typeof o==='object'?o.label:o;
          h+=`<option value="${escapeAttr(val)}"${fVal===val?' selected':''}>${sanitizeHTML(lbl)}</option>`;
        });
        h+='</select>';
      }else if(fType==='date-range'){
        const fr=fVal&&fVal.from?fVal.from:'';
        const to=fVal&&fVal.to?fVal.to:'';
        h+=`<input type="date" class="dt-filter-date" value="${fr}" onchange="DataTable._filterRange('${escapeAttr(id)}','${escapeAttr(c.key)}','from',this.value,'${escapeAttr(config.onRefresh)}')">`;
        h+=`<input type="date" class="dt-filter-date" value="${to}" onchange="DataTable._filterRange('${escapeAttr(id)}','${escapeAttr(c.key)}','to',this.value,'${escapeAttr(config.onRefresh)}')">`;
      }else if(fType==='number-range'){
        const mn=fVal&&fVal.min!=null?fVal.min:'';
        const mx=fVal&&fVal.max!=null?fVal.max:'';
        h+=`<input type="number" class="dt-filter-num" placeholder="Min" value="${mn}" onchange="DataTable._filterRange('${escapeAttr(id)}','${escapeAttr(c.key)}','min',this.value,'${escapeAttr(config.onRefresh)}')">`;
        h+=`<input type="number" class="dt-filter-num" placeholder="Max" value="${mx}" onchange="DataTable._filterRange('${escapeAttr(id)}','${escapeAttr(c.key)}','max',this.value,'${escapeAttr(config.onRefresh)}')">`;
      }else{
        h+=`<input type="text" class="dt-filter-input" placeholder="${t('search')}..." value="${escapeAttr(fVal||'')}" oninput="DataTable._filter('${escapeAttr(id)}','${escapeAttr(c.key)}',this.value,'${escapeAttr(config.onRefresh)}')">`;
      }
      h+='</td>';
    });
    if(config.actions)h+='<td></td>';
    h+='</tr>';
  }

  h+='</thead><tbody>';

  // Rows
  pageItems.forEach(row=>{
    const rid=row[rowId];
    const selected=showBulk&&st.selectedIds.has(rid);
    h+=`<tr class="${selected?'dt-row-selected':''}">`;
    if(showBulk){
      h+=`<td class="dt-td-check"><input type="checkbox" class="dt-checkbox" ${selected?'checked':''} onchange="DataTable._toggleRow('${escapeAttr(id)}','${escapeAttr(rid)}',this.checked,'${escapeAttr(config.onRefresh)}')"></td>`;
    }
    visCols.forEach(c=>{
      h+='<td>'+_formatCell(row,c)+'</td>';
    });
    if(config.actions)h+='<td>'+config.actions(row)+'</td>';
    h+='</tr>';
  });

  h+='</tbody></table></div>';

  // Mobile cards
  h+=_buildMobileCards(pageItems,visCols,config,st,showBulk,rowId);

  h+='</div>';

  // Pagination
  if(showPagination&&totalPages>1){
    h+=_buildPagination(id,st,totalPages,totalFiltered,config.onRefresh);
  }else if(showPagination){
    h+=`<div class="dt-footer-info">${t('dt_showing')||'Showing'} ${totalFiltered} ${t('dt_records')||'records'}</div>`;
  }

  return h;
}

// ─── Internal helpers ───

function _getCellValue(row,col){
  if(col.getValue)return col.getValue(row);
  const keys=col.key.split('.');
  let v=row;
  for(const k of keys){if(v==null)return null;v=v[k];}
  return v;
}

function _formatCell(row,col){
  if(col.render)return col.render(row);
  const v=_getCellValue(row,col);
  if(v==null||v==='')return '-';
  switch(col.type){
    case 'date':return typeof fmtDate==='function'?fmtDate(v):sanitizeHTML(String(v));
    case 'number':return typeof fmtNum==='function'?fmtNum(v):sanitizeHTML(String(v));
    case 'money':return'<strong>'+(typeof fmtMoney==='function'?fmtMoney(v):sanitizeHTML(String(v)))+'</strong>';
    case 'badge':return col.badgeRender?col.badgeRender(v,row):`<span class="badge">${sanitizeHTML(String(v))}</span>`;
    default:return sanitizeHTML(String(v));
  }
}

function _applyFilters(data,cols,filters){
  Object.keys(filters).forEach(key=>{
    const val=filters[key];
    if(val===''||val==null)return;
    const col=cols.find(c=>c.key===key);
    if(!col)return;
    const fType=col.filterType||(col.type==='date'?'date-range':col.type==='number'||col.type==='money'?'number-range':'text');
    if(fType==='select'){
      data=data.filter(r=>{
        const cv=_getCellValue(r,col);
        return String(cv)===String(val);
      });
    }else if(fType==='date-range'){
      if(val.from)data=data.filter(r=>{const cv=_getCellValue(r,col);return cv&&cv>=val.from;});
      if(val.to)data=data.filter(r=>{const cv=_getCellValue(r,col);return cv&&cv<=val.to;});
    }else if(fType==='number-range'){
      if(val.min!=null&&val.min!=='')data=data.filter(r=>{const cv=parseFloat(_getCellValue(r,col))||0;return cv>=parseFloat(val.min);});
      if(val.max!=null&&val.max!=='')data=data.filter(r=>{const cv=parseFloat(_getCellValue(r,col))||0;return cv<=parseFloat(val.max);});
    }else{
      const q=String(val).toLowerCase();
      data=data.filter(r=>{const cv=_getCellValue(r,col);return cv!=null&&String(cv).toLowerCase().includes(q);});
    }
  });
  return data;
}

function _buildToolbar(id,config,st,showSearch,showExport,showColPicker,cols,visCols,totalFiltered,data){
  let h='<div class="dt-toolbar">';

  // Search
  if(showSearch){
    h+=`<div class="dt-search"><input type="text" class="dt-search-input" placeholder="${t('search')}..." value="${escapeAttr(st.search||'')}" oninput="DataTable._search('${escapeAttr(id)}',this.value,'${escapeAttr(config.onRefresh)}')"></div>`;
  }

  h+='<div class="dt-toolbar-right">';

  // Active filter count + clear
  const activeFilters=Object.keys(st.filters).filter(k=>{const v=st.filters[k];if(typeof v==='object')return(v.from||v.to||v.min!=null||v.max!=null);return v!==''&&v!=null;}).length;
  if(activeFilters>0||st.search){
    h+=`<button class="btn btn-sm btn-secondary dt-btn" onclick="DataTable._clearFilters('${escapeAttr(id)}','${escapeAttr(config.onRefresh)}')" title="${t('dt_clear_filters')||'Clear filters'}">✕ ${activeFilters>0?activeFilters+' '+(t('dt_filters')||'filters'):''}${st.search?(activeFilters>0?' + ':'')+(t('search')||'search'):''}</button>`;
  }

  // Page size
  h+=`<select class="dt-page-size" onchange="DataTable._setPageSize('${escapeAttr(id)}',this.value,'${escapeAttr(config.onRefresh)}')" title="${t('dt_per_page')||'Per page'}">`;
  [25,50,100,200].forEach(n=>{h+=`<option value="${n}"${st.pageSize===n?' selected':''}>${n}</option>`;});
  h+='</select>';

  // Column picker
  if(showColPicker&&cols.length>3){
    h+=`<div class="dt-col-picker-wrap"><button class="btn btn-sm btn-secondary dt-btn" onclick="DataTable._toggleColPicker('${escapeAttr(id)}')" title="${t('dt_columns')||'Columns'}">☰ ${t('dt_columns')||'Columns'}</button>`;
    h+=`<div class="dt-column-picker" id="dt-colpick-${escapeAttr(id)}" style="display:none">`;
    cols.forEach(c=>{
      const checked=st.visibleCols.includes(c.key);
      h+=`<label class="dt-col-option"><input type="checkbox" ${checked?'checked':''} onchange="DataTable._toggleCol('${escapeAttr(id)}','${escapeAttr(c.key)}',this.checked,'${escapeAttr(config.onRefresh)}')"> ${sanitizeHTML(c.label)}</label>`;
    });
    h+='</div></div>';
  }

  // Export buttons
  if(showExport){
    h+=`<button class="btn btn-sm btn-secondary dt-btn" onclick="DataTable._exportCSV('${escapeAttr(id)}')" title="${t('dt_export_csv')||'Export CSV'}">📄 CSV</button>`;
    h+=`<button class="btn btn-sm btn-secondary dt-btn" onclick="DataTable._exportExcel('${escapeAttr(id)}')" title="${t('dt_export_excel')||'Export Excel'}">📊 Excel</button>`;
  }

  h+='</div></div>';
  return h;
}

function _buildBulkBar(id,config,st){
  const count=st.selectedIds.size;
  let h=`<div class="dt-bulk-bar"><span class="dt-bulk-count">${count} ${t('dt_selected')||'selected'}</span><div class="dt-bulk-actions">`;
  if(config.bulkActions){
    config.bulkActions.forEach((ba,i)=>{
      const cls=ba.danger?'btn btn-sm btn-danger':'btn btn-sm btn-secondary';
      h+=`<button class="${cls}" onclick="DataTable._bulkAction('${escapeAttr(id)}',${i})">${ba.icon||''}${ba.icon?' ':''}${sanitizeHTML(ba.label)}</button>`;
    });
  }
  h+=`<button class="btn btn-sm btn-secondary" onclick="DataTable._clearSelection('${escapeAttr(id)}','${escapeAttr(config.onRefresh)}')">${t('dt_deselect')||'Deselect all'}</button>`;
  h+='</div></div>';
  return h;
}

function _buildMobileCards(items,visCols,config,st,showBulk,rowId){
  if(!items.length)return'';
  let h='<div class="dt-mobile-cards">';
  items.forEach(row=>{
    const rid=row[rowId];
    const selected=showBulk&&st.selectedIds.has(rid);
    if(config.cardRender){
      h+=config.cardRender(row,visCols);
    }else{
      h+=`<div class="dt-card${selected?' dt-card-selected':''}">`;
      if(showBulk){
        h+=`<div class="dt-card-check"><input type="checkbox" class="dt-checkbox" ${selected?'checked':''} onchange="DataTable._toggleRow('${escapeAttr(config.id)}','${escapeAttr(rid)}',this.checked,'${escapeAttr(config.onRefresh)}')"></div>`;
      }
      h+='<div class="dt-card-body">';
      visCols.forEach((c,i)=>{
        const val=_formatCell(row,c);
        if(i===0){
          h+=`<div class="dt-card-title">${val}</div>`;
        }else{
          h+=`<div class="dt-card-field"><span class="dt-card-label">${sanitizeHTML(c.label)}</span><span class="dt-card-value">${val}</span></div>`;
        }
      });
      if(config.actions){
        h+=`<div class="dt-card-actions">${config.actions(row)}</div>`;
      }
      h+='</div></div>';
    }
  });
  h+='</div>';
  return h;
}

function _buildPagination(id,st,totalPages,totalFiltered,onRefresh){
  let h=`<div class="dt-pagination"><span class="dt-page-info">${t('dt_showing')||'Showing'} ${((st.page-1)*st.pageSize)+1}-${Math.min(st.page*st.pageSize,totalFiltered)} ${t('dt_of')||'of'} ${totalFiltered}</span>`;
  h+='<div class="dt-page-buttons">';
  h+=`<button class="btn btn-sm btn-secondary" onclick="DataTable._goPage('${escapeAttr(id)}',1,'${escapeAttr(onRefresh)}')" ${st.page<=1?'disabled':''}>&laquo;</button>`;
  h+=`<button class="btn btn-sm btn-secondary" onclick="DataTable._goPage('${escapeAttr(id)}',${st.page-1},'${escapeAttr(onRefresh)}')" ${st.page<=1?'disabled':''}>◀</button>`;
  const start=Math.max(1,st.page-2);
  const end=Math.min(totalPages,st.page+2);
  for(let i=start;i<=end;i++){
    h+=`<button class="btn btn-sm ${i===st.page?'btn-primary':'btn-secondary'}" onclick="DataTable._goPage('${escapeAttr(id)}',${i},'${escapeAttr(onRefresh)}')">${i}</button>`;
  }
  h+=`<button class="btn btn-sm btn-secondary" onclick="DataTable._goPage('${escapeAttr(id)}',${st.page+1},'${escapeAttr(onRefresh)}')" ${st.page>=totalPages?'disabled':''}>▶</button>`;
  h+=`<button class="btn btn-sm btn-secondary" onclick="DataTable._goPage('${escapeAttr(id)}',${totalPages},'${escapeAttr(onRefresh)}')" ${st.page>=totalPages?'disabled':''}>&raquo;</button>`;
  h+='</div></div>';
  return h;
}

// ─── Public event handlers (called from onclick) ───

function _sort(id,colKey,onRefresh){
  const st=_getState(id);
  if(st.sortCol===colKey){st.sortDir=st.sortDir==='asc'?'desc':'asc';}
  else{st.sortCol=colKey;st.sortDir='asc';}
  st.page=1;
  _callRefresh(onRefresh);
}

function _filter(id,colKey,value,onRefresh){
  const st=_getState(id);
  st.filters[colKey]=value;
  st.page=1;
  _debounceRefresh(id,onRefresh);
}

function _filterRange(id,colKey,bound,value,onRefresh){
  const st=_getState(id);
  if(!st.filters[colKey]||typeof st.filters[colKey]!=='object')st.filters[colKey]={};
  if(value===''||value==null){delete st.filters[colKey][bound];if(!Object.keys(st.filters[colKey]).length)delete st.filters[colKey];}
  else st.filters[colKey][bound]=value;
  st.page=1;
  _callRefresh(onRefresh);
}

function _search(id,value,onRefresh){
  const st=_getState(id);
  st.search=value;
  st.page=1;
  _debounceRefresh(id,onRefresh);
}

function _clearFilters(id,onRefresh){
  const st=_getState(id);
  st.filters={};
  st.search='';
  st.page=1;
  _callRefresh(onRefresh);
}

function _setPageSize(id,size,onRefresh){
  const st=_getState(id);
  st.pageSize=parseInt(size)||50;
  st.page=1;
  _callRefresh(onRefresh);
}

function _goPage(id,page,onRefresh){
  const st=_getState(id);
  st.page=Math.max(1,page);
  _callRefresh(onRefresh);
}

function _toggleAll(id,checked,onRefresh){
  const st=_getState(id);
  const table=document.querySelector(`table[data-dt-id="${id}"]`);
  if(!table)return;
  const checkboxes=table.querySelectorAll('tbody .dt-checkbox');
  checkboxes.forEach(cb=>{
    const tr=cb.closest('tr');
    const rowCheck=tr?tr.querySelector('.dt-checkbox'):null;
    if(rowCheck){
      const rid=rowCheck.getAttribute('onchange');
      const m=rid&&rid.match(/'([^']+)'/g);
      if(m&&m.length>=2){
        const rowIdVal=m[1].replace(/'/g,'');
        if(checked)st.selectedIds.add(rowIdVal);else st.selectedIds.delete(rowIdVal);
      }
    }
  });
  _callRefresh(onRefresh);
}

function _toggleRow(id,rowId,checked,onRefresh){
  const st=_getState(id);
  if(checked)st.selectedIds.add(rowId);else st.selectedIds.delete(rowId);
  _callRefresh(onRefresh);
}

function _clearSelection(id,onRefresh){
  const st=_getState(id);
  st.selectedIds.clear();
  _callRefresh(onRefresh);
}

function _toggleColPicker(id){
  const el=document.getElementById('dt-colpick-'+id);
  if(el)el.style.display=el.style.display==='none'?'block':'none';
}

function _toggleCol(id,colKey,checked,onRefresh){
  const st=_getState(id);
  if(checked){if(!st.visibleCols.includes(colKey))st.visibleCols.push(colKey);}
  else{st.visibleCols=st.visibleCols.filter(k=>k!==colKey);}
  _saveColPrefs(id,st.visibleCols);
  _callRefresh(onRefresh);
}

function _bulkAction(id,actionIndex){
  const st=_getState(id);
  const ids=Array.from(st.selectedIds);
  if(!ids.length)return;
  // Find config — stored on last create
  const cfg=_lastConfigs[id];
  if(!cfg||!cfg.bulkActions||!cfg.bulkActions[actionIndex])return;
  cfg.bulkActions[actionIndex].action(ids);
}

// ─── Export functions ───

function _exportCSV(id){
  const cfg=_lastConfigs[id];
  if(!cfg)return;
  const st=_getState(id);
  const cols=cfg.columns.filter(c=>!c.hidden&&st.visibleCols.includes(c.key));
  let data=cfg.data?[...cfg.data]:[];
  if(cfg.preFilter)data=cfg.preFilter(data);
  data=_applyFilters(data,cols,st.filters);
  if(st.search){const q=st.search.toLowerCase();data=data.filter(r=>cols.some(c=>{const v=_getCellValue(r,c);return v!=null&&String(v).toLowerCase().includes(q);}));}
  if(st.sortCol){const col=cols.find(c=>c.key===st.sortCol);if(col){const dir=st.sortDir==='desc'?-1:1;data.sort((a,b)=>{let va=_getCellValue(a,col)||'',vb=_getCellValue(b,col)||'';if(col.type==='number'||col.type==='money'){va=parseFloat(va)||0;vb=parseFloat(vb)||0;}else{va=String(va).toLowerCase();vb=String(vb).toLowerCase();}return va<vb?-dir:va>vb?dir:0;});}}
  const esc=s=>{s=String(s==null?'':s);return s.includes(',')||s.includes('"')||s.includes('\n')?'"'+s.replace(/"/g,'""')+'"':s;};
  let csv=cols.map(c=>esc(c.label)).join(',')+'\n';
  data.forEach(row=>{csv+=cols.map(c=>{const v=_getCellValue(row,c);if(c.type==='money'||c.type==='number')return v!=null?v:'';return esc(v!=null?v:'');}).join(',')+'\n';});
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='egglogu_'+id+'_'+_todayStr()+'.csv';a.click();
  if(typeof toast==='function')toast(t('cfg_exported')||'Exported');
}

function _exportExcel(id){
  const cfg=_lastConfigs[id];
  if(!cfg)return;
  if(typeof XLSX==='undefined'){
    if(typeof toast==='function')toast('SheetJS (XLSX) not loaded','error');
    return;
  }
  const st=_getState(id);
  const cols=cfg.columns.filter(c=>!c.hidden&&st.visibleCols.includes(c.key));
  let data=cfg.data?[...cfg.data]:[];
  if(cfg.preFilter)data=cfg.preFilter(data);
  data=_applyFilters(data,cols,st.filters);
  if(st.search){const q=st.search.toLowerCase();data=data.filter(r=>cols.some(c=>{const v=_getCellValue(r,c);return v!=null&&String(v).toLowerCase().includes(q);}));}
  if(st.sortCol){const col=cols.find(c=>c.key===st.sortCol);if(col){const dir=st.sortDir==='desc'?-1:1;data.sort((a,b)=>{let va=_getCellValue(a,col)||'',vb=_getCellValue(b,col)||'';if(col.type==='number'||col.type==='money'){va=parseFloat(va)||0;vb=parseFloat(vb)||0;}else{va=String(va).toLowerCase();vb=String(vb).toLowerCase();}return va<vb?-dir:va>vb?dir:0;});}}
  const headers=cols.map(c=>c.label);
  const rows=data.map(row=>cols.map(c=>{const v=_getCellValue(row,c);return v!=null?v:'';}));
  const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);
  // Auto-width columns
  ws['!cols']=cols.map((c,i)=>{let max=c.label.length;rows.forEach(r=>{const l=String(r[i]).length;if(l>max)max=l;});return{wch:Math.min(max+2,40)};});
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,cfg.id.substring(0,31));
  XLSX.writeFile(wb,'egglogu_'+id+'_'+_todayStr()+'.xlsx');
  if(typeof toast==='function')toast(t('cfg_exported')||'Exported');
}

// ─── Utilities ───

const _debounceTimers={};
function _debounceRefresh(id,onRefresh){
  clearTimeout(_debounceTimers[id]);
  _debounceTimers[id]=setTimeout(()=>_callRefresh(onRefresh),250);
}

function _callRefresh(fnName){
  if(!fnName)return;
  const fn=window[fnName];
  if(typeof fn==='function')fn();
}

function _todayStr(){return new Date().toISOString().substring(0,10);}

function _saveColPrefs(id,cols){
  try{
    const D=typeof loadData==='function'?loadData():null;
    if(D&&D.settings){
      if(!D.settings.tablePrefs)D.settings.tablePrefs={};
      D.settings.tablePrefs[id]=cols;
      if(typeof saveData==='function')saveData(D);
    }
  }catch(e){}
}

function _loadColPrefs(id){
  try{
    const D=typeof loadData==='function'?loadData():null;
    if(D&&D.settings&&D.settings.tablePrefs&&D.settings.tablePrefs[id])return D.settings.tablePrefs[id];
  }catch(e){}
  return null;
}

// Store last config for export/bulk operations
const _lastConfigs={};

function createWithState(config){
  _lastConfigs[config.id]=config;
  // Load saved column preferences
  const st=_getState(config.id);
  const saved=_loadColPrefs(config.id);
  if(saved&&!st._colsLoaded){st.visibleCols=saved;st._colsLoaded=true;}
  return create(config);
}

// Reset all state for a table (useful when navigating away)
function reset(id){_resetState(id);delete _lastConfigs[id];}

// Get selected IDs
function getSelected(id){const st=_getState(id);return Array.from(st.selectedIds);}

// Get current state (for external inspection)
function getState(id){return _getState(id);}

// Public API
return{
  create:createWithState,
  reset,
  getSelected,
  getState,
  // Internal handlers (called from onclick strings)
  _sort,_filter,_filterRange,_search,_clearFilters,_setPageSize,
  _goPage,_toggleAll,_toggleRow,_clearSelection,
  _toggleColPicker,_toggleCol,_bulkAction,
  _exportCSV,_exportExcel
};
})();
