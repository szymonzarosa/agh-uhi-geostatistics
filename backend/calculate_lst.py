import rasterio
from rasterio.windows import from_bounds
import numpy as np
import os

b4_path = '../data/raw/LC09_L1TP_188025_20240813_20240813_02_T1_B4.TIF'
b5_path = '../data/raw/LC09_L1TP_188025_20240813_20240813_02_T1_B5.TIF'
b10_path = '../data/raw/LC09_L1TP_188025_20240813_20240813_02_T1_B10.TIF'
output_lst = '../data/processed/Krakow_LST.tif'

krakow_bbox = (415000, 5538000, 434300, 5555000) 

RADIANCE_MULT_B10 = 0.00038
RADIANCE_ADD_B10 = 0.10000
K1_B10 = 799.0284
K2_B10 = 1329.2405

def process_thermal_data():
    with rasterio.open(b10_path) as src_b10:
        window = from_bounds(*krakow_bbox, transform=src_b10.transform)
        b10_data = src_b10.read(1, window=window).astype(np.float32)
        out_meta = src_b10.meta.copy()
        out_meta.update({
            "height": window.height,
            "width": window.width,
            "transform": rasterio.windows.transform(window, src_b10.transform),
            "dtype": 'float32'
        })

    valid_mask = b10_data > 0

    toa_radiance = np.zeros_like(b10_data, dtype=np.float32)
    toa_radiance[valid_mask] = (RADIANCE_MULT_B10 * b10_data[valid_mask]) + RADIANCE_ADD_B10

    bt_celsius = np.zeros_like(b10_data, dtype=np.float32)
    
    with np.errstate(divide='ignore', invalid='ignore'):
        bt_celsius[valid_mask] = (K2_B10 / np.log((K1_B10 / toa_radiance[valid_mask]) + 1)) - 273.15

    with rasterio.open(output_lst, 'w', **out_meta) as dest:
        dest.write(bt_celsius, 1)
        
    print(f"Zakończono. Raster LST zapisany w: {output_lst}")

if __name__ == "__main__":
    process_thermal_data()