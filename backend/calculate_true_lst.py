import rasterio
from rasterio.windows import from_bounds
import numpy as np

b4_path = '../data/raw/LC09_L1TP_188025_20240813_20240813_02_T1_B4.TIF'
b5_path = '../data/raw/LC09_L1TP_188025_20240813_20240813_02_T1_B5.TIF'
bt_path = '../data/processed/Krakow_LST.tif'
output_true_lst = '../data/processed/Krakow_True_LST.tif'
output_ndvi = '../data/processed/Krakow_NDVI.tif'

krakow_bbox = (415000, 5538000, 434300, 5555000) 

def process_true_lst():
    with rasterio.open(bt_path) as src_bt:
        bt_data = src_bt.read(1)
        out_meta = src_bt.meta.copy()

    with rasterio.open(b4_path) as src_b4, rasterio.open(b5_path) as src_b5:
        window = from_bounds(*krakow_bbox, transform=src_b4.transform)
        
        red = src_b4.read(1, window=window).astype(np.float32)
        nir = src_b5.read(1, window=window).astype(np.float32)

    min_rows = min(bt_data.shape[0], red.shape[0])
    min_cols = min(bt_data.shape[1], red.shape[1])

    bt_data = bt_data[:min_rows, :min_cols]
    red = red[:min_rows, :min_cols]
    nir = nir[:min_rows, :min_cols]
    out_meta.update({
        "height": min_rows,
        "width": min_cols
    })

    valid_mask = (red > 0) & (nir > 0)

    print("Obliczam NDVI...")
    ndvi = np.zeros_like(red, dtype=np.float32)
    with np.errstate(divide='ignore', invalid='ignore'):
        ndvi[valid_mask] = (nir[valid_mask] - red[valid_mask]) / (nir[valid_mask] + red[valid_mask])

    with rasterio.open(output_ndvi, 'w', **out_meta) as dest:
        dest.write(ndvi, 1)
    
    print("Obliczam emisyjność...")
    ndvi_min, ndvi_max = 0.2, 0.5
    
    ndvi_clipped = np.clip(ndvi, ndvi_min, ndvi_max)
    pv = ((ndvi_clipped - ndvi_min) / (ndvi_max - ndvi_min)) ** 2

    emissivity = np.zeros_like(red, dtype=np.float32)
    emissivity[valid_mask] = 0.004 * pv[valid_mask] + 0.986
    emissivity[ndvi < 0] = 0.991
    emissivity[(ndvi > 0) & (ndvi < 0.2)] = 0.970

    print("Koryguję temperaturę...")
    wave_length = 10.8E-6
    h = 6.626E-34
    c = 2.998E8
    s = 1.38E-23
    p = h * c / s

    true_lst = np.zeros_like(bt_data, dtype=np.float32)
    
    bt_kelvin = bt_data + 273.15
    
    with np.errstate(divide='ignore', invalid='ignore'):
        true_lst_kelvin = bt_kelvin / (1 + (wave_length * bt_kelvin / p) * np.log(emissivity))
        true_lst[valid_mask] = true_lst_kelvin[valid_mask] - 273.15

    with rasterio.open(output_true_lst, 'w', **out_meta) as dest:
        dest.write(true_lst, 1)

    print(f"Sukces! Finalny raster temperatur zapisany w: {output_true_lst}")

if __name__ == "__main__":
    process_true_lst()