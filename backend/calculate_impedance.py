import rasterio
import numpy as np

lst_path = '../data/processed/Krakow_True_LST.tif'
pm10_path = '../data/processed/Krakow_PM10.tif'
output_impedance = '../data/processed/Krakow_Impedance.tif'

def normalize_array(arr, valid_mask):
    min_val = np.nanmin(arr[valid_mask])
    max_val = np.nanmax(arr[valid_mask])
    
    normalized = np.zeros_like(arr, dtype=np.float32)
    normalized[valid_mask] = (arr[valid_mask] - min_val) / (max_val - min_val)
    return normalized

def calculate_impedance():
    with rasterio.open(lst_path) as src_lst:
        lst_data = src_lst.read(1)
        meta = src_lst.meta.copy()

    with rasterio.open(pm10_path) as src_pm10:
        pm10_data = src_pm10.read(1)

    valid_mask = (lst_data > 0) & (pm10_data > 0)

    print("Normalizuję LST i PM10...")
    lst_norm = normalize_array(lst_data, valid_mask)
    pm10_norm = normalize_array(pm10_data, valid_mask)

    print("Łączę warstwy w raster Impedancji Środowiskowej...")
    impedance = np.zeros_like(lst_data, dtype=np.float32)
    
    impedance[valid_mask] = (0.5 * lst_norm[valid_mask]) + (0.5 * pm10_norm[valid_mask])

    with rasterio.open(output_impedance, 'w', **meta) as dest:
        dest.write(impedance, 1)

    print(f"Sukces! Gotowa Powierzchnia Oporu Środowiskowego: {output_impedance}")

if __name__ == "__main__":
    calculate_impedance()