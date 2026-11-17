from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import osmnx as ox
import networkx as nx
from pyproj import Transformer
from shapely.geometry import LineString, MultiPoint, mapping
import uvicorn
import warnings
import pickle

warnings.filterwarnings("ignore")

app = FastAPI(title="Routing Środowiskowy API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

print("1. Ładowanie binarnej topologii miasta do pamięci RAM...")
graph_path = '../data/processed/Krakow_Graph.pkl'
with open(graph_path, 'rb') as f:
    G = pickle.load(f)

print("2. Aplikowanie wykładniczych wag środowiskowych...")
for u, v, key, data in G.edges(keys=True, data=True):
    imp = float(data.get('impedance', 0.0))
    length = float(data.get('length', 0.0))
    if length == 0.0: length = 1.0 
    
    data['env_cost'] = length * (1 + (imp ** 2) * 15)
    data['impedance'] = imp
    data['length'] = length

transformer_to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32634", always_xy=True)
transformer_to_wgs = Transformer.from_crs("EPSG:32634", "EPSG:4326", always_xy=True)

def get_geojson_geometry(path_nodes):
    if len(path_nodes) < 2: return None
    coords_wgs = []
    for n in path_nodes:
        lon, lat = transformer_to_wgs.transform(G.nodes[n]['x'], G.nodes[n]['y'])
        coords_wgs.append((lon, lat))
    return mapping(LineString(coords_wgs))

def calculate_detailed_profile(path_nodes):
    stress_total = 0.0
    dist_total = 0.0
    profile = []
    for i in range(len(path_nodes)-1):
        edge_data = G.get_edge_data(path_nodes[i], path_nodes[i+1])
        edge = edge_data[0] if isinstance(edge_data, dict) and 0 in edge_data else list(edge_data.values())[0]
        
        imp = edge.get('impedance', 0.0)
        length = edge.get('length', 0.0)
        stress_total += imp * length
        dist_total += length
        profile.append({"dist": round(dist_total, 0), "stress": round(imp, 3)})
    return dist_total, stress_total, profile

@app.get("/api/route")
def calculate_routes(coords: str, mode: str = 'walk'):
    try:
        points = [tuple(map(float, p.split(','))) for p in coords.split('|')]
        if len(points) < 2: raise HTTPException(status_code=400, detail="Minimum 2 punkty.")
            
        nodes = []
        for lat, lon in points:
            x_utm, y_utm = transformer_to_utm.transform(lon, lat)
            nodes.append(ox.distance.nearest_nodes(G, X=x_utm, Y=y_utm))

        clean_nodes = [nodes[0]]
        for n in nodes[1:]:
            if n != clean_nodes[-1]:
                clean_nodes.append(n)
                
        if len(clean_nodes) < 2:
            raise HTTPException(status_code=400, detail="Brak drogi w tym miejscu. Punkty przyciągnęły się do tego samego węzła grafu.")

        full_path_phys, full_path_env = [], []
        total_dist_phys, total_stress_phys = 0.0, 0.0
        total_dist_env, total_stress_env = 0.0, 0.0
        prof_phys, prof_env = [], []

        for i in range(len(clean_nodes) - 1):
            start_n, end_n = clean_nodes[i], clean_nodes[i+1]

            try:
                p_phys = nx.shortest_path(G, start_n, end_n, weight='length')
                d_phys, s_phys, pr_phys = calculate_detailed_profile(p_phys)
                for p in pr_phys: p['dist'] += total_dist_phys
                prof_phys.extend(pr_phys)
                total_dist_phys += d_phys
                total_stress_phys += s_phys
                if i == 0: full_path_phys.extend(p_phys)
                else: full_path_phys.extend(p_phys[1:])

                p_env = nx.shortest_path(G, start_n, end_n, weight='env_cost')
                d_env, s_env, pr_env = calculate_detailed_profile(p_env)
                for p in pr_env: p['dist'] += total_dist_env
                prof_env.extend(pr_env)
                total_dist_env += d_env
                total_stress_env += s_env
                if i == 0: full_path_env.extend(p_env)
                else: full_path_env.extend(p_env[1:])
            except nx.NetworkXNoPath:
                continue

        if not full_path_phys:
            raise HTTPException(status_code=400, detail="Odcinek trasy nieosiągalny.")

        speed_mps = 1.38 if mode == 'walk' else 4.16
        time_phys = (total_dist_phys / speed_mps) / 60
        time_env = (total_dist_env / speed_mps) / 60

        return {
            "shortest_dist": total_dist_phys, "shortest_stress": total_stress_phys, "phys_profile": prof_phys, "phys_time": time_phys,
            "env_dist": total_dist_env, "env_stress": total_stress_env, "env_profile": prof_env, "env_time": time_env,
            "shortest_path": {"type": "Feature", "geometry": get_geojson_geometry(full_path_phys)},
            "env_path": {"type": "Feature", "geometry": get_geojson_geometry(full_path_env)}
        }
    except HTTPException as he:
        raise he
    except Exception as e: 
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/isochrone")
def calculate_isochrone(lat: float, lon: float, minutes: int = 15, mode: str = 'walk'):
    try:
        x_utm, y_utm = transformer_to_utm.transform(lon, lat)
        node_start = ox.distance.nearest_nodes(G, X=x_utm, Y=y_utm)
        
        speed_mpm = 83.33 if mode == 'walk' else 250.0
        
        max_cost = minutes * speed_mpm 
        
        subgraph_nodes = nx.single_source_dijkstra_path_length(G, node_start, cutoff=max_cost, weight='length')
        
        if len(subgraph_nodes) < 2: 
            raise HTTPException(status_code=400, detail="Zbyt mały obszar z powodu ekstremalnego stresu UHI.")
            
        coords_wgs = []
        for n in subgraph_nodes.keys():
             lon_wgs, lat_wgs = transformer_to_wgs.transform(G.nodes[n]['x'], G.nodes[n]['y'])
             coords_wgs.append((lon_wgs, lat_wgs))
        
        if len(coords_wgs) == 2:
            line = LineString(coords_wgs)
            poly = line.buffer(0.0005) 
        else:
            poly = MultiPoint(coords_wgs).convex_hull
        
        return {"type": "Feature", "geometry": mapping(poly)}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)