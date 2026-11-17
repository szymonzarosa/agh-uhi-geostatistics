import osmnx as ox
import geopandas as gpd
from shapely.geometry import box
import warnings

warnings.filterwarnings("ignore")

def export_to_webgis():
    print("1. Wczytywanie obciążonego grafu...")
    G = ox.load_graphml('../data/processed/Krakow_Graph.graphml')
    _, edges = ox.graph_to_gdfs(G)
    
    print("2. Czyszczenie i transformacja do WGS84...")
    edges_web = edges[['impedance', 'geometry']].reset_index(drop=True)
    edges_web = edges_web.to_crs("EPSG:4326")
    
    print("3. Przycinanie wektorów do wspólnego Bounding Boxa...")
    bbox_poly = box(19.890, 50.045, 19.960, 50.090) 
    edges_clipped = gpd.clip(edges_web, bbox_poly)
    
    output_path = '../frontend/public/streets_stress.geojson'
    edges_clipped.to_file(output_path, driver='GeoJSON')
    
    print(f"Gotowe! Zredukowano wielkość z {len(edges_web)} do {len(edges_clipped)} krawędzi.")
    print(f"Wyeksportowano idealnie przycięte wektory do: {output_path}")

if __name__ == "__main__":
    export_to_webgis()