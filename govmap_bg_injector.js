
/*! govmap_bg_injector.js — robust GovMap backgrounds + elevation button */
(function(){
  const LOG_PREFIX = '[GovMapInjector]';
  function log(){ try{ console.log.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); }catch(_){} }
  function warn(){ try{ console.warn.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); }catch(_){} }

  function waitFor(cond, timeout=60000, step=150){
    return new Promise((resolve,reject)=>{
      const t0=Date.now();
      (function tick(){
        try{ if(cond()) return resolve(true); }catch(e){}
        if(Date.now()-t0>timeout) return reject(new Error('timeout'));
        setTimeout(tick, step);
      })();
    });
  }

  function findMapInstance(){
    if (window.map && typeof window.map.getCenter==='function' && typeof window.map.addLayer==='function') return window.map;
    for (const k in window){
      try{
        const v = window[k];
        if (v && typeof v.getCenter==='function' && typeof v.addLayer==='function' && typeof v.on==='function'){
          return v;
        }
      }catch(_){}
    }
    return null;
  }

  function ensureLayersControl(map){
    if (window.layersControl && typeof window.layersControl.addBaseLayer==='function') return window.layersControl;
    try{
      const baseLayers = (typeof window.baseLayers==='object' && window.baseLayers) ? window.baseLayers : {};
      window.layersControl = L.control.layers(baseLayers, {}, {position:'topright'}).addTo(map);
      return window.layersControl;
    }catch(e){
      warn('Failed to create LayersControl:', e && e.message || e);
      return null;
    }
  }

  function probeTemplate(tmpl){
    return new Promise((resolve)=>{
      const img = new Image();
      img.onload  = ()=>resolve({ok:true, tmpl});
      img.onerror = ()=>resolve({ok:false, tmpl});
      const url = tmpl.replace('{z}','12').replace('{x}','2218').replace('{y}','1546') + (tmpl.indexOf('?')>-1?'&':'?') + 'ts=' + Date.now();
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  async function findWorkingTemplate(templates){
    for (const t of templates){
      const r = await probeTemplate(t);
      if (r.ok) return r.tmpl;
    }
    return null;
  }

  async function buildGovMapLayers(){
    const bases = [
      'https://map.govmap.gov.il/wmts/1.0.0',
      'https://gis.govmap.gov.il/wmts/1.0.0',
      'https://cdn.govmap.gov.il/wmts/1.0.0',
      'https://cdnil.govmap.gov.il/wmts/1.0.0'
    ];
    const orthoLayers = ['ORTHOPHOTO','Orthophoto','orthophoto','Aerial','AIRPHOTO'];
    const topoLayers  = ['TOPO_25K','Topo_25K','TOPOGRAPHIC','TOPO','Topographic'];
    const orthoExt = ['.jpeg','.jpg','.png'];
    const topoExt  = ['.png','.jpg','.jpeg'];

    const orthoTemplates = [];
    bases.forEach(b=>orthoLayers.forEach(l=>orthoExt.forEach(ext=>{
      orthoTemplates.push(`${b}/${l}/GoogleMapsCompatible/{z}/{x}/{y}${ext}`);
    })));
    const topoTemplates = [];
    bases.forEach(b=>topoLayers.forEach(l=>topoExt.forEach(ext=>{
      topoTemplates.push(`${b}/${l}/GoogleMapsCompatible/{z}/{x}/{y}${ext}`);
    })));

    const [orthoTmpl, topoTmpl] = await Promise.all([
      findWorkingTemplate(orthoTemplates),
      findWorkingTemplate(topoTemplates)
    ]);

    const layers = {};
    if (orthoTmpl){
      layers.ortho = L.tileLayer(orthoTmpl, {maxZoom: 19, attribution: '© Survey of Israel / GovMap (Orthophoto)'});
      log('WMTS ORTHO:', orthoTmpl);
    } else {
      warn('No working ORTHOPHOTO WMTS endpoint found.');
    }
    if (topoTmpl){
      layers.topo25 = L.tileLayer(topoTmpl, {maxZoom: 19, attribution: '© Survey of Israel / GovMap (Topo 1:25,000)'});
      log('WMTS TOPO25:', topoTmpl);
    } else {
      warn('No working TOPO25 WMTS endpoint found.');
    }
    layers.heb = L.tileLayer('https://cdnil.govmap.gov.il/xyz/heb/{z}/{x}/{y}.png', {maxZoom: 19, attribution:'© Survey of Israel / GovMap'});
    layers.eng = L.tileLayer('https://cdnil.govmap.gov.il/xyz/eng/{z}/{x}/{y}.png', {maxZoom: 19, attribution:'© Survey of Israel / GovMap'});
    return layers;
  }

  function addMiniSwitcher(map, layers){
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '10px';
    container.style.right = '10px';
    container.style.zIndex = '1000';
    container.style.background = 'rgba(255,255,255,0.9)';
    container.style.border = '1px solid #bbb';
    container.style.borderRadius = '6px';
    container.style.padding = '6px 8px';
    container.style.font = '12px/1.2 system-ui, Arial, sans-serif';
    container.innerHTML = '<div style="font-weight:600;margin-bottom:4px">GovMap רקעים</div>';

    function addOption(name, layer){
      const id = 'gmopt_'+Math.random().toString(36).slice(2);
      const row = document.createElement('div');
      row.style.margin = '2px 0';
      row.innerHTML = `<label style="cursor:pointer"><input type="radio" name="gm-bg" id="${id}" style="margin-inline-end:6px">${name}</label>`;
      container.appendChild(row);
      row.querySelector('input').addEventListener('change', ()=>{
        Object.values(layers).forEach(Lyr=>{ try{ map.removeLayer(Lyr); }catch(_){}});
        map.addLayer(layer);
      });
      return row.querySelector('input');
    }

    const mapDiv = map.getContainer();
    mapDiv.style.position = mapDiv.style.position || 'relative';
    mapDiv.appendChild(container);

    const opts = [];
    if (layers.ortho)   opts.push(addOption('תצ״א משולב', layers.ortho));
    if (layers.topo25)  opts.push(addOption('מפת 1:25,000', layers.topo25));
    opts.push(addOption('Basemap (HE)', layers.heb));
    opts.push(addOption('Basemap (EN)', layers.eng));

    (opts[0] || opts[1] || opts[2]).checked = true;
    (opts[0] && opts[0].dispatchEvent(new Event('change'))) ||
    (opts[1] && opts[1].dispatchEvent(new Event('change'))) ||
    (opts[2] && opts[2].dispatchEvent(new Event('change')));
  }

  function addProbeButton(map){
    const ctrl = L.Control.extend({
      options:{position:'topleft'},
      onAdd: function(){
        const el = L.DomUtil.create('div','leaflet-control');
        const btn = L.DomUtil.create('button','',el);
        btn.textContent = 'גובה';
        btn.style.padding = '6px 8px';
        btn.style.border = '1px solid #999';
        btn.style.background = '#fff';
        btn.style.cursor = 'pointer';
        L.DomEvent.on(btn,'click',(e)=>{
          L.DomEvent.stopPropagation(e);
          btn.classList.toggle('active');
          map.__probeOn = !map.__probeOn;
          btn.style.background = map.__probeOn ? '#eee' : '#fff';
        });
        return el;
      }
    });
    (new ctrl()).addTo(map);
    map.on('click', (e)=>{
      if(!map.__probeOn) return;
      L.popup().setLatLng(e.latlng).setContent('ערך DEM ממפ״י יתחבר כשייפתח DTM/WCS לחשבון שלך.').openOn(map);
    });
  }

  (async function start(){
    try{
      await waitFor(()=>window.L && typeof L.Map==='function', 60000);
      const map = findMapInstance();
      if (!map){ warn('Leaflet map instance not found.'); return; }
      log('Map found.');

      const layers = await buildGovMapLayers();
      let usedControl = false;
      const lc = ensureLayersControl(map);
      if (lc){
        try{
          if (layers.ortho)   lc.addBaseLayer(layers.ortho, 'GovMap רקע: תצ״א משולב');
          if (layers.topo25)  lc.addBaseLayer(layers.topo25,'GovMap רקע: מפת 1:25,000');
          usedControl = true;
          log('Attached to existing LayersControl.');
        }catch(e){
          warn('Failed attaching to LayersControl:', e && e.message || e);
        }
      }
      if (!usedControl){
        addMiniSwitcher(map, layers);
        log('Used compact switcher.');
      }
      addProbeButton(map);
      log('Elevation button added.');
    }catch(e){
      warn('Init failed:', e && e.message || e);
    }
  })();
})();
