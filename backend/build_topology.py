import osmnx as ox
import networkx as nx
import geopandas as gpd
import rasterio
import numpy as np
import time

impedance_path = '../data/processed/Krakow_Impedance.tif'
graph_out_path = '../data/processed/Krakow_Graph.graphml'

def build_topology():
    print("1. Konfiguracja połączenia i obejście limitów Overpass API...")
    ox.settings.timeout = 180
    ox.settings.memory = 1073741824
    
    print("2. Pobieranie grafu wokół centroidu badawczego...")
    center_point = (50.067, 19.925)
    
    try:
        G = ox.graph_from_point(center_point, dist=3500, network_type='walk')
    except Exception as e:
        print(f"Błąd pobierania. Serwer OSM przeciążony. Odczekaj 60 sekund. Błąd: {e}")
        return

    print("3. Transformacja układu współrzędnych do UTM 34N...")
    G_proj = ox.project_graph(G, to_crs='EPSG:32634')

    print("4. Wyciąganie wektorów krawędzi (ulic i ścieżek)...")
    nodes, edges = ox.graph_to_gdfs(G_proj)

    print("5. Obciążanie grafu stresem środowiskowym (Impedancją)...")
    with rasterio.open(impedance_path) as src:
        centroids = edges.geometry.centroid
        coords = [(geom.x, geom.y) for geom in centroids]
        
        sampled_values = list(src.sample(coords))
        impedance_values = [val[0] if val[0] >= 0 else 0.0 for val in sampled_values]

    print("6. Przeliczanie kosztów środowiskowych (env_cost)...")
    edges['impedance'] = impedance_values
    edges['env_cost'] = edges['length'] * (1 + edges['impedance'])

    print("7. Aktualizacja grafu bazowego i zapis...")
    impedance_dict = edges['impedance'].to_dict()
    env_cost_dict = edges['env_cost'].to_dict()

    nx.set_edge_attributes(G_proj, impedance_dict, 'impedance')
    nx.set_edge_attributes(G_proj, env_cost_dict, 'env_cost')

    ox.save_graphml(G_proj, filepath=graph_out_path)
    print(f"Sukces! Zapisano topologię obciążoną środowiskowo w: {graph_out_path}")

if __name__ == "__main__":
    build_topology()