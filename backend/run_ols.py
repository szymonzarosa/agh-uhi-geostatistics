import pandas as pd
import statsmodels.api as sm

csv_path = '../data/processed/nieruchomosci_z_kosztem.csv'

def run_global_regression():
    df = pd.read_csv(csv_path)
    
    Y = df['cena_m2']
    
    X = df[['powierzchnia', 'rok_budowy', 'dystans_centrum', 'koszt_srodowiskowy']]
    
    X = sm.add_constant(X)
    
    print("Obliczam Globalny Model Regresji OLS...")
    model = sm.OLS(Y, X).fit()
    
    print("\n--- PODSUMOWANIE MODELU EKONOMETRYCZNEGO ---")
    print(model.summary())

if __name__ == "__main__":
    run_global_regression()