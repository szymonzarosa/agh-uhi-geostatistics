import osmnx as ox
import networkx as nx

print("1. Wczytywanie oryginalnego grafu...")
G = ox.load_graphml('../data/processed/Krakow_Graph.graphml')

print("2. Odchudzanie metadanych węzłów...")
for n, data in list(G.nodes(data=True)):
    keys_to_remove = [k for k in data.keys() if k not in ['x', 'y']]
    for k in keys_to_remove:
        del data[k]

print("3. Odchudzanie metadanych krawędzi...")
for u, v, key, data in list(G.edges(keys=True, data=True)):
    keys_to_remove = [k for k in data.keys() if k not in ['length', 'impedance']]
    for k in keys_to_remove:
        del data[k]

output_path = '../data/processed/Krakow_Graph_lite.graphml'
print(f"4. Zapisywanie grafu do: {output_path}")
ox.save_graphml(G, output_path)
print("Gotowe.")