import rasterio
import numpy as np
import pandas as pd
from pyproj import Transformer
from pykrige.ok import OrdinaryKriging

ref_path = '../data/processed/Krakow_True_LST.tif'
csv_path = '../data/raw/krakow_pm10.csv'
output_pm10 = '../data/processed/Krakow_PM10.tif'

def process_kriging():
    print("Wczytuję dane GIOŚ z pliku CSV...")
    df = pd.read_csv(csv_path)
    df = df.dropna(subset=['pm10'])

    print("Transformuję układ współrzędnych stacji do UTM Zone 34N...")
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:32634", always_xy=True)
    
    x_utm, y_utm = transformer.transform(df['lon'].values, df['lat'].values)
    pm10_values = df['pm10'].values

    with rasterio.open(ref_path) as src:
        meta = src.meta.copy()
        width = src.width
        height = src.height
        transform = src.transform

    print("Obliczam siatkę przestrzenną...")
    grid_x = np.array([transform * (col, 0) for col in range(width)])[:, 0]
    grid_y_desc = np.array([transform * (0, row) for row in range(height)])[:, 1]
    grid_y_asc = grid_y_desc[::-1]

    print(f"Trenuję model Krigingu Zwyczajnego na bazie {len(pm10_values)} stacji...")
    OK = OrdinaryKriging(
        x_utm, 
        y_utm, 
        pm10_values, 
        variogram_model='spherical',
        verbose=False,
        enable_plotting=False
    )

    print("Interpoluję wartości dla całego rastra... To potrwa kilkanaście sekund.")
    z_grid, ss_grid = OK.execute('grid', grid_x, grid_y_asc)

    pm10_raster = np.flipud(z_grid.data).astype(np.float32)

    with rasterio.open(output_pm10, 'w', **meta) as dest:
        dest.write(pm10_raster, 1)

    print(f"Sukces! Fizycznie oparty raster smogu zapisany w: {output_pm10}")

if __name__ == "__main__":
    process_kriging()