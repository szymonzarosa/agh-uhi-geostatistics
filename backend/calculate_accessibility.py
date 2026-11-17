import osmnx as ox
import networkx as nx
import pandas as pd
import geopandas as gpd
import numpy as np
from pyproj import Transformer
import warnings

warnings.filterwarnings("ignore")

graph_path = '../data/processed/Krakow_Graph.graphml'
properties_csv = '../data/raw/krakow_nieruchomosci.csv'
output_csv = '../data/processed/nieruchomosci_z_kosztem.csv'

def calculate_advanced_accessibility():
    print("1. Wczytywanie obciążonego grafu topologicznego...")
    G = ox.load_graphml(graph_path)

    print("   Naprawa typów danych krawędzi (konwersja tekst -> liczba)...")
    for u, v, key, data in G.edges(keys=True, data=True):
        if 'env_cost' in data:
            data['env_cost'] = float(data['env_cost'])
        if 'length' in data:
            data['length'] = float(data['length'])

    print("2. Dynamiczne pobieranie terenów zielonych z OpenStreetMap...")
    center_point = (50.067, 19.925)
    tags = {
        'leisure': ['park', 'nature_reserve', 'garden'], 
        'landuse': ['forest', 'recreation_ground'],
        'natural': ['wood']
    }
    
    green_areas = ox.features_from_point(center_point, dist=3500, tags=tags)
    
    green_polygons = green_areas[green_areas.geom_type.isin(['Polygon', 'MultiPolygon'])].copy()
    
    green_polygons = green_polygons.to_crs('EPSG:32634')

    print("3. Analiza przestrzenna (Spatial Join) węzłów i parków...")
    nodes_gdf, _ = ox.graph_to_gdfs(G)
    
    nodes_in_parks = gpd.sjoin(nodes_gdf, green_polygons, how='inner', predicate='intersects')
    
    park_nodes = nodes_in_parks.index.unique().tolist()
    print(f"   Zidentyfikowano {len(park_nodes)} węzłów wejściowych do terenów zielonych.")

    print("4. Wczytywanie bazy nieruchomości...")
    df = pd.read_csv(properties_csv)
    
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:32634", always_xy=True)
    df['x_utm'], df['y_utm'] = transformer.transform(df['lon'].values, df['lat'].values)
    
    print("   Mapowanie nieruchomości na węzły grafu...")
    df['node_id'] = ox.distance.nearest_nodes(G, X=df['x_utm'].tolist(), Y=df['y_utm'].tolist())

    print("5. Obliczanie tras algorytmem Multi-Source Dijkstra...")
    G_rev = G.reverse(copy=True)
    
    env_paths = nx.multi_source_dijkstra_path_length(G_rev, park_nodes, weight='env_cost')
    phys_paths = nx.multi_source_dijkstra_path_length(G_rev, park_nodes, weight='length')

    df['koszt_srodowiskowy'] = df['node_id'].map(env_paths)
    df['dystans_fizyczny'] = df['node_id'].map(phys_paths)

    df['indeks_stresu_trasy'] = df['koszt_srodowiskowy'] / df['dystans_fizyczny']

    df.dropna(subset=['koszt_srodowiskowy', 'cena_m2'], inplace=True)
    df.to_csv(output_csv, index=False)
    
    print(f"Sukces! Koszty tranzytu wyliczone dla {len(df)} nieruchomości i zapisane w: {output_csv}")

if __name__ == "__main__":
    calculate_advanced_accessibility()