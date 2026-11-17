import pandas as pd
import numpy as np
import geopandas as gpd
from mgwr.gwr import GWR
from mgwr.sel_bw import Sel_BW
import warnings

warnings.filterwarnings("ignore")

csv_path = '../data/processed/nieruchomosci_z_kosztem.csv'
output_geojson = '../data/processed/gwr_results.geojson'

def run_gwr_model():
    print("1. Wczytywanie i geostatystyczna korekta danych...")
    df = pd.read_csv(csv_path)
    
    np.random.seed(42)
    df['x_utm'] = df['x_utm'] + np.random.normal(0, 2, len(df))
    df['y_utm'] = df['y_utm'] + np.random.normal(0, 2, len(df))
    
    coords = list(zip(df['x_utm'], df['y_utm']))
    
    y = df['cena_m2'].values.reshape((-1, 1))
    
    X = df[['powierzchnia', 'rok_budowy', 'koszt_srodowiskowy']].values
    
    X = X + np.random.normal(0, 0.001, X.shape)
    
    X_std = (X - X.mean(axis=0)) / X.std(axis=0)
    y_std = (y - y.mean()) / y.std()

    print("2. Kalibracja szerokości pasma (Bandwidth)...")
    selector = Sel_BW(coords, y_std, X_std, fixed=False, kernel='bisquare')
    bw = selector.search()
    print(f"Optymalna liczba sąsiadów dla każdego punktu: {bw}")

    print("3. Obliczanie Geographically Weighted Regression...")
    model = GWR(coords, y_std, X_std, bw, fixed=False, kernel='bisquare')
    results = model.fit()

    print("\n--- PODSUMOWANIE GWR ---")
    print(f"Globalne R2 (OLS dla porównania): {results.adj_R2:.3f}")
    print(f"Lokalne R2 (GWR): {results.localR2.mean():.3f} (Średnia)")

    print("\n4. Zapis wyników przestrzennych do GeoJSON...")
    df['gwr_r2'] = results.localR2
    
    # (0: stała, 1: powierzchnia, 2: rok_budowy, 3: koszt_srodowiskowy)
    df['gwr_coef_srodowisko'] = results.params[:, 3] 
    df['gwr_tvalue_srodowisko'] = results.tvalues[:, 3]

    gdf = gpd.GeoDataFrame(
        df, 
        geometry=gpd.points_from_xy(df.lon, df.lat), 
        crs="EPSG:4326"
    )
    
    gdf.to_file(output_geojson, driver='GeoJSON')
    print(f"Sukces! Wyniki przestrzenne zapisano w: {output_geojson}")

if __name__ == "__main__":
    run_gwr_model()