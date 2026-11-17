import osmnx as ox
import warnings

warnings.filterwarnings("ignore")

def export_parks():
    print("1. Pobieranie terenów zielonych z OSM...")
    center_point = (50.067, 19.925)
    tags = {
        'leisure': ['park', 'nature_reserve', 'garden'], 
        'landuse': ['forest', 'recreation_ground'],
        'natural': ['wood']
    }
    
    green_areas = ox.features_from_point(center_point, dist=3500, tags=tags)
    green_polygons = green_areas[green_areas.geom_type.isin(['Polygon', 'MultiPolygon'])].copy()
    green_polygons = green_polygons.to_crs("EPSG:4326")
    
    if 'name' in green_polygons.columns:
        green_polygons = green_polygons[['name', 'geometry']]
    else:
        green_polygons = green_polygons[['geometry']]
        
    output_path = '../frontend/public/parks.geojson'
    green_polygons.to_file(output_path, driver='GeoJSON')
    print(f"Sukces! Wyeksportowano poligony parków do: {output_path}")

if __name__ == "__main__":
    export_parks()