import osmnx as ox

G = ox.load_graphml("C:/Users/48692/Desktop/krakow_impedance_project/data/processed/Krakow_Graph.graphml")
ox.save_graph_geopackage(G, filepath="C:/Users/48692/Desktop/krakow_impedance_project/data/processed/Krakow_Graph.gpkg")