import 'leaflet/dist/leaflet.css';
import * as L from 'leaflet';
import 'leaflet.vectorgrid';
import * as h3 from 'h3-js';
import Chart from 'chart.js/auto';


const map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([50.065, 19.93], 14);
L.control.zoom({ position: 'topleft' }).addTo(map);

const osmDark = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 19 });
const osmLight = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 19 });
const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri', maxZoom: 19 });

osmDark.addTo(map);
document.getElementById('map').classList.add('dark-map');

document.getElementById('basemap-select').addEventListener('change', e => {
  map.removeLayer(osmDark); map.removeLayer(osmLight); map.removeLayer(esriSatellite);
  if (e.target.value === 'dark') { osmDark.addTo(map); document.getElementById('map').classList.add('dark-map'); }
  else if (e.target.value === 'light') { osmLight.addTo(map); document.getElementById('map').classList.remove('dark-map'); }
  else if (e.target.value === 'sat') { esriSatellite.addTo(map); document.getElementById('map').classList.remove('dark-map'); }
});

try {
  const miniMapTile = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { minZoom: 5, maxZoom: 14 });
  if (L.Control.MiniMap) new L.Control.MiniMap(miniMapTile, { position: 'bottomright', toggleDisplay: true, minimized: false, width: 140, height: 140 }).addTo(map);
} catch (e) { console.warn("MiniMap load failed."); }

const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('resizer');
let isResizing = false;

resizer.addEventListener('mousedown', () => { isResizing = true; document.body.style.cursor = 'ew-resize'; });
document.addEventListener('mousemove', e => { 
  if (isResizing) { 
    sidebar.style.width = `${e.clientX}px`; 
    map.invalidateSize();
  } 
});
document.addEventListener('mouseup', () => { 
  if (isResizing) { isResizing = false; document.body.style.cursor = 'default'; }
});

const loadingOverlay = document.getElementById('loading-overlay');
function showLoading() { if (loadingOverlay) loadingOverlay.style.display = 'flex'; }
function hideLoading() { if (loadingOverlay) loadingOverlay.style.display = 'none'; }

document.getElementById('presentation-btn').addEventListener('click', () => {
  document.body.classList.toggle('presentation-mode');
  setTimeout(() => map.invalidateSize(), 350); 
});
document.getElementById('locate-btn').addEventListener('click', () => {
  map.locate({ setView: true, maxZoom: 16, timeout: 15000, enableHighAccuracy: true });
});
map.on('locationfound', e => {
  L.circleMarker(e.latlng, { radius: 8, fillColor: '#006A4E', color: '#fff', weight: 2 }).addTo(map).bindPopup("<b style='color:#006A4E;'>Twoja Lokalizacja</b>").openPopup();
});


const imageBounds = [[50.045, 19.890], [50.090, 19.960]];
const rasterLayer = L.imageOverlay('/impedance_raster.png', imageBounds, { className: 'raster-layer' });

let vectorGridLayer = null;
fetch('./streets_stress.geojson').then(res => res.json()).then(data => {
  vectorGridLayer = L.vectorGrid.slicer(data, {
    rendererFactory: L.canvas.tile, maxZoom: 22, maxNativeZoom: 14,
    vectorTileLayerStyles: { sliced: p => ({ color: p.impedance > 0.7 ? '#B41E34' : p.impedance > 0.4 ? '#D4AF37' : '#006A4E', weight: 1.5, opacity: 0.6 }) },
    interactive: false
  });
});

const parksLayer = L.layerGroup().addTo(map);
fetch('./parks.geojson').then(res => res.json()).then(data => {
  L.geoJSON(data, {
    style: { fillColor: '#006A4E', color: '#004c38', weight: 1.5, fillOpacity: 0.25 },
    onEachFeature: (f, l) => { if (f.properties.name) l.bindTooltip(`<span style="color:#4ade80;"><b>Park Miejski</b></span><br>${f.properties.name}`); }
  }).addTo(parksLayer);
});

const hexLayer = L.layerGroup().addTo(map);
const pointsLayer = L.layerGroup(); 

document.getElementById('toggle-raster').addEventListener('change', e => { e.target.checked ? rasterLayer.addTo(map) : rasterLayer.removeFrom(map); });
document.getElementById('toggle-parks').addEventListener('change', e => { e.target.checked ? parksLayer.addTo(map) : parksLayer.removeFrom(map); });
document.getElementById('toggle-graph').addEventListener('change', e => { if (vectorGridLayer) { e.target.checked ? vectorGridLayer.addTo(map) : vectorGridLayer.removeFrom(map); }});

let isGwrActive = true;
document.getElementById('toggle-hex').addEventListener('change', e => {
  isGwrActive = e.target.checked;
  document.getElementById('section-gwr').style.opacity = isGwrActive ? "1" : "0.3";
  document.getElementById('section-gwr').style.pointerEvents = isGwrActive ? "auto" : "none";
  if (!isGwrActive) { hexLayer.removeFrom(map); pointsLayer.removeFrom(map); } else { map.fire('zoomend'); } 
});


let globalHexData = {}; 
let allKagglePoints = []; 
let currentGwrVar = 'coef'; 
let scatterChartInstance = null;

const scales = {
  coef: [ { min: 5, color: '#004c38', label: 'Wzrost > 5 PLN' }, { min: 0, color: '#006A4E', label: 'Wzrost 0 - 5 PLN' }, { min: -5, color: '#D4AF37', label: 'Spadek 0 - 5 PLN' }, { min: -15, color: '#e67300', label: 'Spadek 5 - 15 PLN' }, { min: -Infinity, color: '#B41E34', label: 'Spadek > 15 PLN' } ],
  price: [ { min: 20000, color: '#4c1d95', label: '> 20 000 PLN/m²' }, { min: 16000, color: '#7c3aed', label: '16 000 - 20 000 PLN/m²' }, { min: 12000, color: '#a78bfa', label: '12 000 - 16 000 PLN/m²' }, { min: 8000, color: '#ddd6fe', label: '8 000 - 12 000 PLN/m²' }, { min: -Infinity, color: '#f5f3ff', label: '< 8 000 PLN/m²' } ],
  r2: [ { min: 0.6, color: '#006A4E', label: 'Wysokie (>0.6)' }, { min: 0.4, color: '#22c55e', label: 'Dobre (0.4-0.6)' }, { min: 0.2, color: '#86efac', label: 'Słabe (0.2-0.4)' }, { min: -Infinity, color: '#f0fdf4', label: 'Brak (<0.2)' } ]
};

function buildLegend() {
  const container = document.getElementById('legend-container');
  if(!container) return;
  container.innerHTML = '';
  scales[currentGwrVar].forEach(c => { container.innerHTML += `<div class="legend-item"><div class="legend-color" style="background: ${c.color};"></div><span>${c.label}</span></div>`; });
}
function getHexColor(val, type) {
  for (let c of scales[type]) if (val >= c.min) return c.color;
  return scales[type][scales[type].length-1].color;
}

function renderHexagons() {
  hexLayer.clearLayers();
  const opacity = parseFloat(document.getElementById('hex-opacity').value);
  Object.keys(globalHexData).forEach(hexId => {
    const data = globalHexData[hexId];
    let val, tooltip;
    
    if (currentGwrVar === 'coef') { val = data.avgCoef; tooltip = `<div style="text-align:center;"><b style="color:${getHexColor(val, 'coef')}; font-size:1.1rem;">${val.toFixed(2)} PLN/m²</b><br><span style="color:#aaa;">Wpływ Środowiska</span></div>`; } 
    else if (currentGwrVar === 'price') { val = data.avgPrice; tooltip = `<div style="text-align:center;"><b style="color:${getHexColor(val, 'price')}; font-size:1.1rem;">${val.toFixed(0)} PLN</b><br><span style="color:#aaa;">Cena Ofertowa</span></div>`; } 
    else { val = data.avgR2; tooltip = `<div style="text-align:center;"><b style="color:${getHexColor(val, 'r2')}; font-size:1.1rem;">${val.toFixed(2)}</b><br><span style="color:#aaa;">Lokalne R²</span></div>`; }

    const poly = L.polygon(h3.cellToBoundary(hexId), { fillColor: getHexColor(val, currentGwrVar), fillOpacity: opacity, color: '#2a2a2a', weight: 0.5 });
    poly.bindTooltip(tooltip);
    poly.on('click', () => {
      if (appMode !== 'explore') return;
      const center = h3.cellToLatLng(hexId);
      const centerLatLng = L.latLng(center[0], center[1]);
      const neighbors = allKagglePoints.map(p => ({ ...p, dist: centerLatLng.distanceTo(L.latLng(p.lat, p.lng)) })).sort((a, b) => a.dist - b.dist).slice(0, 80); 
      const scatterData = neighbors.map(p => ({ x: p.envCost + (Math.random() * 20 - 10), y: p.price }));
      drawHexScatterPlot(scatterData);
    });
    poly.addTo(hexLayer);
  });
  buildLegend();
  updateBBoxStats(); 
}

function updateBBoxStats() {
  if (!isGwrActive) return;
  const bounds = map.getBounds();
  let sumPrice = 0, sumEnv = 0, count = 0;
  
  hexLayer.eachLayer(layer => {
    if (bounds.intersects(layer.getBounds())) {
      const center = layer.getBounds().getCenter();
      const hexId = h3.latLngToCell(center.lat, center.lng, 11);
      if (globalHexData[hexId]) {
        sumPrice += globalHexData[hexId].avgPrice;
        sumEnv += globalHexData[hexId].avgCoef;
        count++;
      }
    }
  });
  if (count > 0) {
    document.getElementById('bbox-avg-price').innerText = `${Math.round(sumPrice/count)} PLN/m²`;
    document.getElementById('bbox-avg-env').innerText = `${(sumEnv/count).toFixed(1)} PLN/m²`;
  }
}
map.on('moveend', updateBBoxStats);

fetch('./gwr_results.geojson')
  .then(res => res.json())
  .then(data => {
    let totalKrkPrice = 0;
    data.features.forEach(f => totalKrkPrice += f.properties.cena_m2);
    const avgKrkPrice = totalKrkPrice / data.features.length;

    data.features.forEach(f => {
      const coef = f.properties.gwr_coef_srodowisko;
      const price = f.properties.cena_m2;
      const r2 = f.properties.local_R2 || (0.3 + Math.random() * 0.4); 
      const lat = f.geometry.coordinates[1];
      const lng = f.geometry.coordinates[0];
      const envCost = f.properties.koszt_srodowiskowy || (Math.random() * 1000);
      
      allKagglePoints.push({ lat, lng, price, envCost });
      const hexId = h3.latLngToCell(lat, lng, 11);
      if (!globalHexData[hexId]) globalHexData[hexId] = { sumCoef: 0, sumPrice: 0, sumR2: 0, count: 0 };
      
      globalHexData[hexId].sumCoef += coef;
      globalHexData[hexId].sumPrice += price;
      globalHexData[hexId].sumR2 += r2;
      globalHexData[hexId].count += 1;
      
      const dev = ((price - avgKrkPrice) / avgKrkPrice) * 100;
      const devColor = dev > 0 ? '#4ade80' : '#B41E34';
      
      L.circleMarker([lat, lng], { radius: 4, fillColor: '#D4AF37', color: '#fff', weight: 1, fillOpacity: 0.9 })
        .bindTooltip(`<div style="font-family:sans-serif; min-width:140px;"><b style="color:#D4AF37;">Dane Rynkowe</b><hr style="border:0; border-top:1px solid #444; margin:5px 0;">Cena transakcyjna: <b>${price} PLN/m²</b> <span style="color:${devColor}; font-size:0.75rem;">(${dev > 0 ? '+':''}${dev.toFixed(1)}%)</span><br>Wpływ Środowiska: <b style="color:#006A4E;">${coef.toFixed(2)} PLN</b></div>`)
        .addTo(pointsLayer);
    });

    Object.keys(globalHexData).forEach(hexId => {
      const d = globalHexData[hexId];
      d.avgCoef = d.sumCoef / d.count;
      d.avgPrice = d.sumPrice / d.count;
      d.avgR2 = d.sumR2 / d.count;
    });
    renderHexagons();
  }).catch(() => console.warn("Błąd ładownia wyników GWR."));

document.getElementById('gwr-variable').addEventListener('change', e => { currentGwrVar = e.target.value; renderHexagons(); });
document.getElementById('hex-opacity').addEventListener('input', renderHexagons);

function drawHexScatterPlot(points) {
  document.getElementById('scatter-container').style.display = 'block';
  const ctx = document.getElementById('hexScatterChart').getContext('2d');
  if (scatterChartInstance) scatterChartInstance.destroy();
  scatterChartInstance = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: [{ label: 'Lokale', data: points, backgroundColor: 'rgba(0, 106, 78, 0.7)', borderColor: '#006A4E' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, title: { display: true, text: 'Zależność Ceny Ofertowej od Stresu', color: '#aaa', font: { size: 10 } } },
      scales: {
        x: { title: { display: true, text: 'Koszt Przejścia', color: '#888', font: {size: 9} }, ticks: { color: '#888' }, grid: { color: '#333' } },
        y: { title: { display: true, text: 'Cena PLN/m²', color: '#888', font: {size: 9} }, ticks: { color: '#888' }, grid: { color: '#333' } }
      }
    }
  });
}

map.on('zoomend', () => {
  if (!isGwrActive) return;
  const scatterCont = document.getElementById('scatter-container');
  if (map.getZoom() > 15) { 
    map.removeLayer(hexLayer); map.addLayer(pointsLayer); if(scatterCont) scatterCont.style.display = 'none'; 
  } else { map.removeLayer(pointsLayer); map.addLayer(hexLayer); }
});


let appMode = 'explore'; 
let routingChartInstance = null; 
let currentGeoJson = null;

const rState = {
  start: null, end: null, waypoints: [],
  activeTarget: 'start', lockStart: false, lockEnd: false
};

const routeLayer = L.layerGroup().addTo(map);
const isoLayer = L.layerGroup().addTo(map);

const panelRoute = document.getElementById('panel-route');
const wpList = document.getElementById('route-points-list');
const dashboard = document.getElementById('dashboard');
const transportModeSelect = document.getElementById('transport-mode');

const modeBtns = {
  explore: document.getElementById('mode-explore'),
  route: document.getElementById('mode-route'),
  iso: document.getElementById('mode-iso'),
  sim: document.getElementById('mode-sim')
};

function setMode(mode) {
  appMode = mode;
  Object.values(modeBtns).forEach(b => { 
    b.classList.remove('active-explore', 'active-route', 'active-iso', 'active-sim'); 
    b.style.background = '#333'; 
    b.style.color = '#fff'; 
  });
  
  if (mode === 'explore') { modeBtns.explore.classList.add('active-explore'); modeBtns.explore.style.background = '#444'; }
  if (mode === 'route') { modeBtns.route.classList.add('active-route'); modeBtns.route.style.background = '#006A4E'; }
  if (mode === 'iso') { modeBtns.iso.classList.add('active-iso'); modeBtns.iso.style.background = '#8b5cf6'; }
  if (mode === 'sim') { modeBtns.sim.classList.add('active-sim'); modeBtns.sim.style.background = '#D4AF37'; modeBtns.sim.style.color = '#000'; }
  
  panelRoute.style.display = (mode === 'route') ? 'flex' : 'none';
  
  isoLayer.clearLayers();
  dashboard.style.display = 'none';
  if (routingChartInstance) routingChartInstance.destroy();
  if (mode !== 'route') {
    rState.start = null; rState.end = null; rState.waypoints = [];
    rState.activeTarget = 'start'; rState.lockStart = false; rState.lockEnd = false;
    routeLayer.clearLayers();
  }
  updateRouteUI();
}

Object.keys(modeBtns).forEach(key => modeBtns[key].addEventListener('click', () => setMode(key)));

const btnTargetStart = document.getElementById('btn-target-start');
const btnTargetEnd = document.getElementById('btn-target-end');
const btnLockStart = document.getElementById('btn-lock-start');
const btnLockEnd = document.getElementById('btn-lock-end');
const btnClearStart = document.getElementById('btn-clear-start');
const btnClearEnd = document.getElementById('btn-clear-end');
const btnAddWp = document.getElementById('btn-add-wp');
const btnClearRoute = document.getElementById('btn-clear-route');

function updateRouteUI() {
  btnTargetStart.style.background = rState.activeTarget === 'start' ? '#006A4E' : '#333';
  btnTargetStart.style.borderColor = rState.activeTarget === 'start' ? '#004c38' : '#555';
  
  btnTargetEnd.style.background = rState.activeTarget === 'end' ? '#B41E34' : '#333';
  btnTargetEnd.style.borderColor = rState.activeTarget === 'end' ? '#8a1728' : '#555';
  
  btnAddWp.style.background = rState.activeTarget === 'waypoint' ? '#444' : '#222';
  btnAddWp.style.color = rState.activeTarget === 'waypoint' ? '#fff' : '#aaa';
  
  btnLockStart.innerText = rState.lockStart ? 'BLOKADA' : 'BLOKUJ';
  btnLockStart.style.color = rState.lockStart ? '#006A4E' : '#e0e0e0';
  btnLockEnd.innerText = rState.lockEnd ? 'BLOKADA' : 'BLOKUJ';
  btnLockEnd.style.color = rState.lockEnd ? '#B41E34' : '#e0e0e0';
  
  wpList.innerHTML = '';
  rState.waypoints.forEach((wp, idx) => {
    const div = document.createElement('div');
    div.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#222; padding:6px 10px; border-radius:4px; font-size:0.75rem; color:#ccc; border:1px dashed #555;";
    const controls = `
      <div style="display:flex; gap: 10px;">
          <span style="cursor:pointer; color:#888;" onclick="moveWaypointUp(${idx})" title="Przesuń wyżej">▲ W GÓRĘ</span>
          <span style="cursor:pointer; color:#888;" onclick="moveWaypointDown(${idx})" title="Przesuń niżej">▼ W DÓŁ</span>
          <span style="cursor:pointer; color:#B41E34; font-weight:bold; margin-left: 5px;" onclick="removeWaypoint(${idx})" title="Usuń ten punkt">USUŃ</span>
      </div>`;
    div.innerHTML = `<span>[ W ] Punkt Pośredni</span> ${controls}`;
    wpList.appendChild(div);
  });
}

window.removeWaypoint = (idx) => { rState.waypoints.splice(idx, 1); triggerRouting(); };
window.moveWaypointUp = (idx) => { if (idx > 0) { const temp = rState.waypoints[idx]; rState.waypoints[idx] = rState.waypoints[idx - 1]; rState.waypoints[idx - 1] = temp; triggerRouting(); }};
window.moveWaypointDown = (idx) => { if (idx < rState.waypoints.length - 1) { const temp = rState.waypoints[idx]; rState.waypoints[idx] = rState.waypoints[idx + 1]; rState.waypoints[idx + 1] = temp; triggerRouting(); }};

btnTargetStart.addEventListener('click', () => { if(!rState.lockStart) { rState.activeTarget = 'start'; updateRouteUI(); }});
btnTargetEnd.addEventListener('click', () => { if(!rState.lockEnd) { rState.activeTarget = 'end'; updateRouteUI(); }});
btnAddWp.addEventListener('click', () => { rState.activeTarget = 'waypoint'; updateRouteUI(); });

btnLockStart.addEventListener('click', () => { rState.lockStart = !rState.lockStart; if(rState.lockStart && rState.activeTarget === 'start') rState.activeTarget = 'end'; updateRouteUI(); });
btnLockEnd.addEventListener('click', () => { rState.lockEnd = !rState.lockEnd; if(rState.lockEnd && rState.activeTarget === 'end') rState.activeTarget = 'start'; updateRouteUI(); });

btnClearStart.addEventListener('click', () => { rState.start = null; triggerRouting(); });
btnClearEnd.addEventListener('click', () => { rState.end = null; triggerRouting(); });
btnClearRoute.addEventListener('click', () => { rState.start = null; rState.end = null; rState.waypoints = []; rState.lockStart = false; rState.lockEnd = false; rState.activeTarget = 'start'; triggerRouting(); });

function drawRouteMarkers() {
  routeLayer.clearLayers();
  if (rState.start) L.circleMarker(rState.start, { radius: 6, fillColor: '#006A4E', color: '#000', weight: 2, fillOpacity: 1 }).bindTooltip("Punkt Startowy").addTo(routeLayer);
  if (rState.end) L.circleMarker(rState.end, { radius: 6, fillColor: '#B41E34', color: '#000', weight: 2, fillOpacity: 1 }).bindTooltip("Punkt Docelowy").addTo(routeLayer);
  rState.waypoints.forEach((wp, idx) => {
    L.circleMarker(wp, { radius: 5, fillColor: '#D4AF37', color: '#000', weight: 2, fillOpacity: 1 }).bindTooltip(`Węzeł Pośredni`).addTo(routeLayer);
  });
}

function triggerRouting() {
  drawRouteMarkers();
  updateRouteUI();
  
  const validPoints = [rState.start, ...rState.waypoints, rState.end].filter(p => p !== null);
  if (validPoints.length >= 2) {
    const coordsStr = validPoints.map(p => `${p.lat},${p.lng}`).join('|');
    const mode = transportModeSelect.value;
    
    showLoading();
    fetch(`https://agh-uhi-geostatistics.onrender.com/api/route?coords=${coordsStr}&mode=${mode}`)
      .then(res => res.json())
      .then(data => {
        if(data.detail) { 
            alert("Błąd przetwarzania: " + data.detail); 
            dashboard.style.display = 'none';
            return; 
        }
        
        try {
            if(data.shortest_path && data.shortest_path.geometry) {
                L.geoJSON(data.shortest_path, { 
                    style: { color: '#3b82f6', weight: 4, dashArray: '8, 6', opacity: 0.8 }
                }).addTo(routeLayer);
            }
            if(data.env_path && data.env_path.geometry) {
                L.geoJSON(data.env_path, { 
                    style: { color: '#006A4E', weight: 6, opacity: 0.9 }
                }).addTo(routeLayer);
                currentGeoJson = data.env_path; 
            }
        } catch (e) {
            console.error("Błąd podczas rysowania trasy GeoJSON", e);
        }
        
        const distPhys = data.shortest_dist || 0; const distEnv = data.env_dist || 0;
        const timePhys = data.phys_time || 0; const timeEnv = data.env_time || 0;
        const stressPhys = data.shortest_stress || 1; const stressEnv = data.env_stress || 0;
        
        document.getElementById('val-dist-phys').innerText = `${distPhys.toFixed(0)} m`;
        document.getElementById('val-time-phys').innerText = `(~${timePhys.toFixed(1)} min)`;
        document.getElementById('val-stress-phys').innerHTML = `Indeks Stresu: ${stressPhys.toFixed(0)}`;
        
        document.getElementById('val-dist-env').innerText = `${distEnv.toFixed(0)} m`;
        document.getElementById('val-time-env').innerText = `(~${timeEnv.toFixed(1)} min)`;
        document.getElementById('val-stress-env').innerHTML = `Indeks Stresu: ${stressEnv.toFixed(0)}`;
        
        const reduction = (((stressPhys) - (stressEnv)) / (stressPhys)) * 100;
        document.getElementById('val-reduction').innerText = `Ograniczenie wpływu środowiska: ${reduction.toFixed(1)}%`;
        
        dashboard.style.display = 'block';
        setTimeout(() => { 
            if(data.phys_profile && data.env_profile && data.phys_profile.length > 0) {
                drawStressChart(data.phys_profile, data.env_profile); 
            }
        }, 150);
        updateDeepLink();
      }).catch(err => {
          console.error(err);
          alert("Wystąpił błąd komunikacji z serwerem obliczeniowym.");
          dashboard.style.display = 'none';
      }).finally(() => hideLoading());
  } else {
    dashboard.style.display = 'none';
  }
}

map.on('click', e => {
  if (appMode === 'explore') return;

  if (appMode === 'sim') {
    if (Object.keys(globalHexData).length === 0) return;
    let nearestHexId = null; let minDataDist = Infinity;
    Object.keys(globalHexData).forEach(id => {
      const center = h3.cellToLatLng(id);
      const dist = map.distance(e.latlng, L.latLng(center[0], center[1]));
      if (dist < minDataDist) { minDataDist = dist; nearestHexId = id; }
    });
    
    const hexData = globalHexData[nearestHexId];
    const popupContent = `
      <div style="min-width: 220px; font-family: sans-serif; color: #e0e0e0;">
        <h3 style="margin: 0 0 10px 0; font-size: 1.1rem; border-bottom: 2px solid #D4AF37; color: white;">Symulator Wyceny</h3>
        <p style="margin: 0 0 10px 0; font-size: 0.8rem; color: #aaa;">Estymata rejonu: ${hexData.avgPrice.toFixed(0)} PLN/m²</p>
        <label style="font-size: 0.85rem; font-weight: bold; color: #ccc;">Powierzchnia lokalu (m²):</label>
        <input type="number" id="sim-area" value="50" style="width:100%; padding: 5px; margin-bottom: 8px; border: 1px solid #444; border-radius: 3px; background: #222; color: white;">
        <label style="font-size: 0.85rem; font-weight: bold; color: #ccc;">Rok oddania do użytku:</label>
        <input type="number" id="sim-year" value="2010" style="width:100%; padding: 5px; margin-bottom: 15px; border: 1px solid #444; border-radius: 3px; background: #222; color: white;">
        <button id="sim-calculate-btn" style="width:100%; padding: 8px; background: #D4AF37; color: #000; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Przeprowadź symulację</button>
        <div id="sim-result-box" style="display:none; margin-top: 15px; padding: 10px; background: #2a2a2a; border: 1px solid #D4AF37; border-radius: 4px; text-align: center;">
          <span style="font-size: 0.8rem; color: #ccc;">Wartość rynkowa nieruchomości:</span><br>
          <span id="sim-total-price" style="font-size: 1.4rem; font-weight: bold; color: #D4AF37;"></span>
        </div>
      </div>
    `;
    L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(map);
    setTimeout(() => {
      const calcBtn = document.getElementById('sim-calculate-btn');
      if(calcBtn) {
        calcBtn.addEventListener('click', () => {
          const area = parseFloat(document.getElementById('sim-area').value);
          const year = parseFloat(document.getElementById('sim-year').value);
          const agePenalty = (2024 - year) * 0.05; 
          const envEffect = hexData.avgCoef * (1 + agePenalty);
          const adjustedPriceM2 = hexData.avgPrice + envEffect;
          document.getElementById('sim-total-price').innerText = `${(adjustedPriceM2 * area).toLocaleString('pl-PL')} PLN`;
          document.getElementById('sim-result-box').style.display = 'block';
        });
      }
    }, 200);
    return;
  }

  if (appMode === 'iso') {
    executeIsochrone(e.latlng);
    return;
  }

  if (appMode === 'route') {
    if (rState.activeTarget === 'start' && !rState.lockStart) {
      rState.start = e.latlng;
      if (!rState.end && !rState.lockEnd) rState.activeTarget = 'end';
    } else if (rState.activeTarget === 'end' && !rState.lockEnd) {
      rState.end = e.latlng;
      if (!rState.start && !rState.lockStart) rState.activeTarget = 'start';
    } else if (rState.activeTarget === 'waypoint') {
      rState.waypoints.push(e.latlng);
    }
    triggerRouting();
  }
});

function executeIsochrone(center) {
  const mode = document.getElementById('transport-mode').value || 'walk';
  showLoading();
  isoLayer.clearLayers();
  
  L.circleMarker(center, { radius: 6, fillColor: '#8b5cf6', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(isoLayer);

  fetch(`https://agh-uhi-geostatistics.onrender.com/api/route?coords=${coordsStr}&mode=${mode}`)
    .then(res => res.json())
    .then(data => {
      if(data.detail) {
          alert(data.detail);
          return;
      }
      if(data && data.geometry) {
            const iso = L.geoJSON(data, { 
                style: { fillColor: '#8b5cf6', color: '#6d28d9', weight: 2, fillOpacity: 0.3 }
            });
            iso.bindTooltip(`<b>Zasięg Optymalny</b><br>Tryb: ${mode === 'walk' ? 'Pieszy' : 'Rower'}`).addTo(isoLayer);
        }
    }).catch(err => {
        console.error("Błąd wyznaczania izochrony", err);
        alert("Nie można wygenerować izochrony w tym obszarze (punkt odcięty lub brak grafu).");
    }).finally(() => hideLoading());
}

document.getElementById('transport-mode').addEventListener('change', () => {
  if (appMode === 'route') triggerRouting();
});

const searchInput = document.getElementById('geocoder-input');
const suggestionsBox = document.getElementById('geocoder-suggestions');
let searchTimeout = null;

searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value;
  if (query.length < 3) { suggestionsBox.style.display = 'none'; return; }
  searchTimeout = setTimeout(() => {
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Kraków')}&limit=5`)
      .then(res => res.json())
      .then(data => {
        suggestionsBox.innerHTML = '';
        if (data.length > 0) {
          data.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.display_name.split(',').slice(0, 3).join(',');
            li.addEventListener('click', () => {
              searchInput.value = li.textContent;
              suggestionsBox.style.display = 'none';
              map.setView([parseFloat(item.lat), parseFloat(item.lon)], 16);
              if (appMode !== 'explore') map.fire('click', { latlng: L.latLng(parseFloat(item.lat), parseFloat(item.lon)) });
            });
            suggestionsBox.appendChild(li);
          });
          suggestionsBox.style.display = 'block';
        } else { suggestionsBox.style.display = 'none'; }
      });
  }, 400);
});
document.addEventListener('click', e => { if (e.target !== searchInput && e.target !== suggestionsBox) suggestionsBox.style.display = 'none'; });

document.getElementById('export-geojson-btn').addEventListener('click', () => {
  if (!currentGeoJson) return;
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentGeoJson));
  const anchorNode = document.createElement('a');
  anchorNode.setAttribute("href", dataStr);
  anchorNode.setAttribute("download", `analiza_przestrzenna.geojson`);
  document.body.appendChild(anchorNode); anchorNode.click(); anchorNode.remove();
});

function updateDeepLink() {
  const urlInput = document.getElementById('share-url');
  if(!urlInput) return;
  const url = new URL(window.location);
  if (appMode === 'route' && (rState.start || rState.end)) {
    url.searchParams.set('m', appMode);
    url.searchParams.set('mode', document.getElementById('transport-mode').value);
    const validPoints = [rState.start, ...rState.waypoints, rState.end].filter(p => p !== null);
    const coordsStr = validPoints.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|');
    url.searchParams.set('coords', coordsStr);
  } else { url.search = ''; }
  window.history.pushState({}, '', url);
  urlInput.value = url.toString();
}

document.getElementById('copy-url-btn').addEventListener('click', () => {
  const urlInput = document.getElementById('share-url');
  if (urlInput.value) { urlInput.select(); document.execCommand('copy'); alert("Skopiowano link dostępu!"); }
});

function drawStressChart(physData, envData) {
  const canvas = document.getElementById('stressChart');
  if(!canvas) return; 
  const ctx = canvas.getContext('2d');
  
  if (routingChartInstance) routingChartInstance.destroy(); 
  const mapData = (profile) => profile.map(p => ({ x: p.dist, y: p.stress }));

  routingChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        { label: 'Trajektoria Klasyczna', data: mapData(physData), borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
        { label: 'Trajektoria Środowiskowa', data: mapData(envData), borderColor: '#006A4E', backgroundColor: 'rgba(0, 106, 78, 0.15)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#ccc', font: { size: 10 } } } },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Odległość (m)', color: '#888' }, ticks: { color: '#888' }, grid: { color: '#333' } },
        y: { title: { display: true, text: 'Indeks UHI', color: '#888' }, ticks: { color: '#888' }, grid: { color: '#333' }, beginAtZero: true }
      }
    }
  });
}