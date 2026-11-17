import pandas as pd

input_csv = '../data/raw/apartments_pl_2024_06.csv'
output_csv = '../data/raw/krakow_nieruchomosci.csv'

def prepare_real_estate_data():
    print("Wczytywanie bazy danych Kaggle...")
    df = pd.read_csv(input_csv, sep=';', decimal=',')
    df_krakow = df[df['city'] == 'krakow'].copy()

    print("Przetwarzanie zmiennych...")
    df_model = pd.DataFrame()
    df_model['id'] = df_krakow['id']
    df_model['lat'] = df_krakow['latitude']
    df_model['lon'] = df_krakow['longitude']
    df_model['cena_m2'] = (df_krakow['price'] / df_krakow['squareMeters']).round(2)
    df_model['powierzchnia'] = df_krakow['squareMeters']
    
    df_model['rok_budowy'] = pd.to_numeric(df_krakow['buildYear'], errors='coerce')
    df_model['dystans_centrum'] = df_krakow['centreDistance']

    bbox = {
        'min_lat': 50.045, 
        'max_lat': 50.090, 
        'min_lon': 19.890, 
        'max_lon': 19.960
    }
    
    df_filtered = df_model[
        (df_model['lat'] >= bbox['min_lat']) & (df_model['lat'] <= bbox['max_lat']) &
        (df_model['lon'] >= bbox['min_lon']) & (df_model['lon'] <= bbox['max_lon'])
    ].copy()

    df_filtered.dropna(subset=['lat', 'lon', 'cena_m2', 'rok_budowy'], inplace=True)
    df_filtered.to_csv(output_csv, index=False)
    print(f"Sukces! Przygotowano {len(df_filtered)} rzeczywistych transakcji/ofert do algorytmu topologicznego.")

if __name__ == "__main__":
    prepare_real_estate_data()