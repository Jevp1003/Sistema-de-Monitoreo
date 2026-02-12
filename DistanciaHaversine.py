import numpy as np
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.field_path import FieldPath
from google.cloud.firestore_v1.base_query import FieldFilter

# 1. Configuración de Firebase (Usa tu archivo de credenciales)
cred = credentials.Certificate("credenciales.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

def haversine(lat1, lon1, lat2, lon2, r=6371000):
    # Convertir grados a radianes
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    
    # Diferencias de latitud y longitud
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    # Fórmula de Haversine
    a = np.sin(dlat/2)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2)**2
    c = 2 * np.arcsin(np.sqrt(a))
    return r * c

def procesar_prueba(id_dispositivo, lat_ref, lon_ref, fecha_inicio, fecha_fin):
    print(f"--- Procesando reporte para: {id_dispositivo} ---")
    
    # Consulta al historial de la base de datos
    coleccion = db.collection('ubicaciones').document(id_dispositivo).collection('Historial')

    doc_inicio = coleccion.document(fecha_inicio)
    doc_fin = coleccion.document(fecha_fin)

    puntos_ref = (
        coleccion
        .where(filter=FieldFilter(FieldPath.document_id(), ">=", doc_inicio))
        .where(filter=FieldFilter(FieldPath.document_id(), "<=", doc_fin))
        .order_by(FieldPath.document_id())
    )

    errores = []
    for doc in puntos_ref.stream():
        data = doc.to_dict()
        lat_gps = float(data.get('Latitud'))
        lon_gps = float(data.get('Longitud'))
        
        if lat_gps != 0:
            distancia = haversine(lat_ref, lon_ref, lat_gps, lon_gps)
            errores.append(distancia)

    if not errores:
        print("No se encontraron datos en el rango seleccionado.")
        return

    # Cálculos estadísticos para tus resultados
    promedio = sum(errores) / len(errores)
    maximo = max(errores)
    minimo = min(errores)

    print(f"Muestras analizadas: {len(errores)}")
    print(f"Error Promedio: {promedio:.2f} metros")
    print(f"Error Máximo: {maximo:.2f} metros")
    print(f"Error Mínimo: {minimo:.2f} metros")

# EJEMPLO DE USO:
# Reemplaza con las coordenadas de tu celular y las fechas de tu prueba
procesar_prueba("trakerd-ls", 0.349403, -78.145324, "2026 02 08-21:50:00", "2026 02 08-22:27:00")
# procesar_prueba("lw004-pb", 0.349403, -78.145324, "2026 02 08-19:45:00", "2026 02 08-20:45:00")