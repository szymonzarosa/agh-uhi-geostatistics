import osmnx as ox
import pickle

print("1. Wczytywanie odchudzonego grafu GraphML...")
G = ox.load_graphml('../data/processed/Krakow_Graph_lite.graphml')

print("2. Zapisywanie do zrzutu binarnego Pickle...")
output_path = '../data/processed/Krakow_Graph.pkl'
with open(output_path, 'wb') as f:
    pickle.dump(G, f, protocol=pickle.HIGHEST_PROTOCOL)

print(f"Gotowe! Plik {output_path} utworzony pomyślnie.")