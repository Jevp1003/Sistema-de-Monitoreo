import time
import mysql.connector
from mysql.connector import Error
from datetime import datetime

# --- IMPORTACIONES FIRESTORE ---
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

# 1. CONFIGURACIÓN (Asegúrate de tener tu archivo credenciales.json)
try:
    cred = credentials.Certificate("credenciales.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Conexión a Firestore exitosa.")
except Exception as e:
    print(f"Error inicializando Firestore: {e}")
    exit()

# 2. LISTA DE DISPOSITIVOS A MONITOREAR
TARGET_DEVICES = [
    'trakerd-ls', 
    'lw004-pb'
]

def sendDataToFirestore(usuario, data):
    try:
        # Guardamos en la colección 'ubicaciones', documento = ID del dispositivo
        doc_ref = db.collection('ubicaciones').document(usuario)
        doc_ref.set(data, merge=True)
        
        fecha_id = data['EstampaTiempo']
        
        doc_ref.collection('Historial').document(fecha_id).set(data)
        
        return True
    except Exception as e:
        print(f"Error enviando a Firestore: {e}")
        return False

def getLatestDataForDevice(device_id):
    connection = None
    try:
        connection = mysql.connector.connect(
            host='localhost',
            database='TrackerD_LS',
            user='xibernetiq',
            password='Automatica0123@'
        )
        if connection.is_connected():
            cursor = connection.cursor()
            
            # --- CONSULTA SQL FILTRADA ---
            # Buscamos el último registro DONDE el device_id sea el que pedimos
            query = """
                SELECT device_id, latitude, longitude, received_at 
                FROM TrackerD_LS 
                WHERE device_id = %s 
                ORDER BY id DESC LIMIT 1
            """
            cursor.execute(query, (device_id,))
            dato = cursor.fetchone()
            return dato
    except Error as e:
        print(f"Error MySQL ({device_id}):", e)
        return None
    finally:
        if connection and connection.is_connected():
            cursor.close()
            connection.close()

def readTime():
    return datetime.now().strftime("%d %b %Y %H:%M:%S")

if __name__ == '__main__':
    # Diccionario para recordar el último dato de CADA dispositivo por separado
    # Ejemplo: { 'TrackerD_LS': (datos...), 'eui-cdb7...': (datos...) }
    last_known_data = {} 

    print(f"Iniciando monitoreo para: {TARGET_DEVICES}")

    while True:
        # Recorremos la lista de dispositivos que te interesan
        for target_id in TARGET_DEVICES:
            
            # 1. Buscamos en MySQL solo para este ID
            current_data = getLatestDataForDevice(target_id)
            
###            print(f"Buscando: {target_id} -> MySQL responde: {current_data}")

            # 2. Verificamos si hay datos y si son nuevos comparados con lo que teníamos en memoria
            # Usamos last_known_data.get(target_id) para comparar con SU propio historial
            if current_data and current_data != last_known_data.get(target_id):
                
                # Actualizamos la memoria local
                last_known_data[target_id] = current_data

                device_id_db, latitude, longitude, received_at = current_data
                
                lat_final = float(latitude) if latitude is not None else 0.0
                lon_final = float(longitude) if longitude is not None else 0.0
                fecha = received_at.strftime("%Y %m %d-%H:%M:%S") if received_at else readTime()
                
                # Preparamos el paquete para Firestore
                firebaseData = {
                    'Latitud': lat_final,
                    'Longitud': lon_final,
                    'EstampaTiempo': fecha
                }

                # 3. Enviamos
                if sendDataToFirestore(target_id, firebaseData):
                    print(f"✅ Actualizado: {target_id} -> {firebaseData['EstampaTiempo']}")
            
            # Pequeña pausa entre consultas para no saturar MySQL si la lista fuera grande
            time.sleep(0.1)

        # Esperar 1 segundo antes de volver a revisar todos los dispositivos
        time.sleep(1)
