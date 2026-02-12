// === PORTERO DE SEGURIDAD: MONITOR / PRUEBA ===
(function() {
    // 1. ¿Tengo credenciales para ver en VIVO?
    const tokenVivo = localStorage.getItem('auth_token');
    const usuarioVivo = localStorage.getItem('auth_user');
    const esModoVivo = tokenVivo && usuarioVivo;

    // 2. ¿Tengo credenciales para ver REPRODUCCIÓN (vengo de sesiones)?
    const esPlayback = localStorage.getItem('playback_mode') === 'true';
    const idSesion = localStorage.getItem('playback_session_id');
    const esModoHistorial = esPlayback && idSesion;

    // VALIDACIÓN FINAL: Debe cumplir al menos UNA de las dos condiciones
    if (!esModoVivo && !esModoHistorial) {
        alert("⛔ Acceso denegado. Debes iniciar sesión.");
        window.location.href = "indexLogin.html";
        throw new Error("Stop execution"); // Detiene todo el script inmediatamente
    }
})();

// === VERIFICACIÓN DE MODO: ¿VIVO O REPRODUCCIÓN? ===
const ES_PLAYBACK = localStorage.getItem('playback_mode') === 'true';
const ID_SESION_PLAYBACK = localStorage.getItem('playback_session_id');
const btnSalir = document.querySelector('.btn-salir');

// Si es playback, cambiamos el título del botón de salir
if (ES_PLAYBACK) {
    console.warn("⚠️ MODO REPRODUCCIÓN ACTIVO: No se guardarán datos nuevos.");
    
    if(btnSalir) {
        btnSalir.innerText = "⬅ Volver al Historial";
        btnSalir.onclick = function() {
            localStorage.removeItem('playback_mode'); // Limpiar modo
            window.location.href = 'indexSesiones.html';
        };
    }
    document.getElementById("session-id-display").innerText = "REPRODUCCIÓN: " + ID_SESION_PLAYBACK;
}
else{
    btnSalir.onclick = function() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.href = 'indexLogin.html';
}
}

const sessionToken = localStorage.getItem('auth_token');
const usuarioActual = localStorage.getItem('auth_user');



function cerrarSesionForzada() {
    alert("⛔ Tu sesión no es válida o ha expirado.");
    localStorage.clear(); // Limpia todo
    window.location.href = "indexLogin.html";
}

document.getElementById("session-id-display").innerText = sessionToken;

const allowedDevicesStr = localStorage.getItem('allowed_devices');
const aliasesStr = localStorage.getItem('device_aliases'); // <--- NUEVO

const DISPOSITIVOS_PERMITIDOS = JSON.parse(allowedDevicesStr);
// Si por alguna razón falla, usamos un objeto vacío
const NOMBRES_GPS = aliasesStr ? JSON.parse(aliasesStr) : {}; 

console.log("🔒 Dispositivos:", DISPOSITIVOS_PERMITIDOS);
console.log("🏷️ Nombres:", NOMBRES_GPS);

// === Mapa Leaflet ===
const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// === Variables Globales ===
let markers = {}; 
let rutaLayer = null; 
let unsubscribeLive = null; // Para guardar la conexión en vivo y poder apagarla
let drawnItems = new L.FeatureGroup(); // Capa para guardar lo que dibujes
map.addLayer(drawnItems);
let drawControl = null; // Control de dibujo
const colorMap = {};
const colors = ['red', 'blue', 'green', 'orange', 'purple', 'yellow', 'black'];
let colorIndex = 0;

// === Funciones Auxiliares ===
function getIcon(color) {
    return L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
}

function limpiarMapa() {
    // 1. Quitar marcadores en vivo
    Object.values(markers).forEach(marker => map.removeLayer(marker));
    markers = {}; // Resetear objeto

    // 2. Quitar ruta si existe
    if (rutaLayer) {
        map.removeLayer(rutaLayer);
        rutaLayer = null;
    }
}

function switchTab(mode) {
    if (unsubscribeLive) { unsubscribeLive(); unsubscribeLive = null; }
    limpiarMapa();
    
    viewLive.style.display = 'none';
    viewHistory.style.display = 'none';
    viewGeofence.style.display = 'none';
    
    tabLive.classList.remove('active');
    tabHistory.classList.remove('active');
    tabGeofence.classList.remove('active');

    if (mode === 'live') {
        viewLive.style.display = 'block'; 
        tabLive.classList.add('active');
        // Si es playback, "Vivo" ahora significa "Ver resumen de la sesión"
        if (ES_PLAYBACK) {
            cargarResumenSesionPlayback(); 
        } else {
            activarModoVivo();
        }
    } else if (mode === 'history') {
        viewHistory.style.display = 'block'; tabHistory.classList.add('active');
    } else if (mode === 'geofence') {
        viewGeofence.style.display = 'block'; tabGeofence.classList.add('active');
    }
}

// === LÓGICA DE PESTAÑAS (TABS) ===
const tabLive = document.getElementById('tab-live');
const tabHistory = document.getElementById('tab-history');
const tabGeofence = document.getElementById('tab-geofence');
const viewLive = document.getElementById('view-live');
const viewHistory = document.getElementById('view-history');
const viewGeofence = document.getElementById('view-geofence');

// --- 1. PESTAÑA VIVO ---
tabLive.addEventListener('click', () => {
    switchTab('live');
    console.log("Iniciando modo en vivo...");
    activarModoVivo();
    drawnItems.clearLayers();
});

// --- 2. PESTAÑA HISTORIAL ---
tabHistory.addEventListener('click', () => {
    switchTab('history');
    console.log("Iniciando modo historial...");
    cargarListaDispositivos('device-select-hist');
    drawnItems.clearLayers();
});

// --- 3. PESTAÑA GEOFENCE ---
tabGeofence.addEventListener('click', () => {
    switchTab('geofence');
    console.log("Iniciando modo geofence...");
    cargarListaDispositivos('device-select-geo');
    activarHerramientasDibujo(); // Activar herramientas solo aquí
    drawnItems.clearLayers();
});

// === LÓGICA DE DIBUJO (LEAFLET DRAW) ===
function activarHerramientasDibujo() {
    drawnItems.clearLayers();
    // Configurar herramientas
    drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
            polyline: false, circlemarker: false, marker: false, // Desactivar lo que no necesitamos
            polygon: true, rectangle: true, circle: true // Activar figuras de zona
        }
    });
    map.addControl(drawControl);
}

// Evento: Cuando terminas de dibujar
map.on(L.Draw.Event.CREATED, function (e) {
    // Borrar figuras anteriores (Solo permitimos 1 zona a la vez para simplificar)
    drawnItems.clearLayers();
    
    const layer = e.layer;
    drawnItems.addLayer(layer);
    
    // Centrar en el dibujo
    // map.fitBounds(layer.getBounds());
});

document.getElementById('btn-delete-shape').addEventListener('click', () => {
    drawnItems.clearLayers();
    if(rutaLayer) map.removeLayer(rutaLayer);
    document.getElementById('geo-results').innerText = "";
});

// === LÓGICA DE ANÁLISIS GEOCERCA ===
document.getElementById('btn-analyze-geo').addEventListener('click', () => {
    // 1. Validaciones
    if (drawnItems.getLayers().length === 0) { alert("¡Primero dibuja una zona en el mapa!"); return; }
    
    const deviceId = document.getElementById('device-select-geo').value;
    const dateStart = document.getElementById('date-start-geo').value;
    const dateEnd = document.getElementById('date-end-geo').value;
    
    if (!deviceId || !dateStart || !dateEnd) { alert("Completa todos los campos."); return; }

    // 2. Obtener la figura dibujada
    const layerZona = drawnItems.getLayers()[0]; // Tomamos la primera figura
    const tipoFigura = (layerZona instanceof L.Circle) ? 'circle' : 'polygon'; // Rectangulo cuenta como poligono

    // 3. Descargar Datos (Igual que historial)
    const startId = dateStart.replace(/-/g, ' ') + "-00:00:00";
    const endId = dateEnd.replace(/-/g, ' ') + "-23:59:59";

    let consulta;
    if (ES_PLAYBACK) {
        // BUSCAR EN LA SESIÓN GRABADA
        consulta = db.collection('sesiones').doc(ID_SESION_PLAYBACK)
                     .collection('dispositivos').doc(deviceId)
                     .collection('ruta');
    } else {
        // BUSCAR EN EL HISTORIAL GENERAL
        consulta = db.collection('ubicaciones').doc(deviceId).collection('Historial');
    }

    consulta
        .where(firebase.firestore.FieldPath.documentId(), '>=', startId)
        .where(firebase.firestore.FieldPath.documentId(), '<=', endId)
        .get()
        .then(snapshot => {
            if (snapshot.empty) { alert("No hay datos en esas fechas."); return; }
            let puntosDentro = [];
            let totalPuntos = 0;

            snapshot.forEach(doc => {
                const d = doc.data();
                const lat = parseFloat(d.Latitud || d.latitud); 
                const lng = parseFloat(d.Longitud || d.longitud);

                if (lat && lng && (lat !== 0)) {
                    totalPuntos++;
                    const puntoGPS = L.latLng(lat, lng);
                    let estaDentro = false;

                    // --- MATEMÁTICA DE INTERSECCIÓN ---
                    if (tipoFigura === 'circle') {
                        // Distancia al centro <= radio
                        if (puntoGPS.distanceTo(layerZona.getLatLng()) <= layerZona.getRadius()) {
                            estaDentro = true;
                        }
                    } else {
                        // Polígono o Rectángulo (Algoritmo Ray Casting)
                        // Leaflet Draw guarda los puntos en layerZona.getLatLngs()[0]
                        // A veces getLatLngs devuelve arrays anidados, aplanamos
                        let vertices = layerZona.getLatLngs();
                        if(Array.isArray(vertices[0]) && Array.isArray(vertices[0][0])) vertices = vertices[0]; // Multi-poly
                        else if(Array.isArray(vertices[0])) vertices = vertices[0]; // Poly simple
                        
                        if (isPointInPolygon(puntoGPS, vertices)) {
                            estaDentro = true;
                        }
                    }

                    if (estaDentro) {
                        puntosDentro.push([lat, lng]);
                    }
                }
            });

            // 4. Dibujar Resultado
            if(rutaLayer) map.removeLayer(rutaLayer);
            
            if (puntosDentro.length > 0) {
                // Dibujar solo la trayectoria DENTRO de la zona
                rutaLayer = L.polyline(puntosDentro, { color: '#6f42c1', weight: 5 }).addTo(map);
                
                document.getElementById('geo-results').innerHTML = 
                    `<b>Resultados:</b><br>Total puntos analizados: ${totalPuntos}<br>
                     ✅ Puntos DENTRO de zona: ${puntosDentro.length}`;
            } else {
                alert("El dispositivo tiene historial en esas fechas, pero NINGÚN punto cayó dentro de tu dibujo.");
            }
        });
});

// === ALGORITMO MATEMÁTICO: PUNTO EN POLÍGONO (Ray Casting) ===
function isPointInPolygon(point, vs) {
    // point: L.latLng object
    // vs: Array of L.latLng objects (vertices del poligono)
    
    var x = point.lat, y = point.lng;
    var inside = false;
    
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i].lat, yi = vs[i].lng;
        var xj = vs[j].lat, yj = vs[j].lng;
        
        var intersect = ((yi > y) != (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

if (!ES_PLAYBACK) {
    // === FUNCIÓN: MODO EN VIVO (CON NOMBRES PERSONALIZADOS) ===
    if (!sessionToken || !usuarioActual) {
    cerrarSesionForzada();
    } else {
        // Verificar en BD si la sesión es válida
        db.collection("sesiones").doc(sessionToken).get().then((doc) => {
            if (doc.exists) {
                console.log("✅ Sesión validada en servidor.");
                // Aquí podrías validar si la sesión ya expiró por fecha
            } else {
                console.warn("⛔ Token falso o sesión eliminada.");
                cerrarSesionForzada();
            }
        }).catch(error => {
            console.error("Error verificando sesión:", error);
            // Opcional: dejar pasar o bloquear si no hay internet
        });
    }

    function activarModoVivo() {
        console.log("Iniciando modo en vivo...");
        const userListDiv = document.getElementById('user-list');
        
        if (unsubscribeLive) return;

        unsubscribeLive = db.collection("ubicaciones").onSnapshot((querySnapshot) => {
            userListDiv.innerHTML = ""; 

            if (querySnapshot.empty) { userListDiv.innerHTML = "<p>Esperando datos...</p>"; return; }

            querySnapshot.forEach((doc) => {
                const usuarioID = doc.id; // El ID técnico (ej: tracker_01)
                
                // 1. Filtro de Seguridad
                if (!DISPOSITIVOS_PERMITIDOS.includes(usuarioID)) return;

                // 2. OBTENER NOMBRE PERSONALIZADO (Alias)
                // Si existe un nombre asignado usamos ese, si no, el ID original
                const nombreMostrar = NOMBRES_GPS[usuarioID] || usuarioID;

                const info = doc.data();
                if (!info || info.Latitud === undefined || info.Longitud === undefined) return;

                // Asignar color (Usamos el ID original para que el color sea consistente)
                if (!colorMap[usuarioID]) {
                    colorMap[usuarioID] = colors[colorIndex % colors.length];
                    colorIndex++;
                }
                const icon = getIcon(colorMap[usuarioID]);
                const { Latitud: lat, Longitud: lng, EstampaTiempo: tiempo } = info;

                // 3. Actualizar Marcador (Usando nombreMostrar)
                if (!markers[usuarioID]) {
                    markers[usuarioID] = L.marker([lat, lng], { icon })
                        .addTo(map)
                        .bindPopup(`<b>${nombreMostrar}</b><br>ID: ${usuarioID}<br>Hora: ${tiempo}`);
                } else {
                    markers[usuarioID].setLatLng([lat, lng]);
                    markers[usuarioID].setPopupContent(`<b>${nombreMostrar}</b><br>ID: ${usuarioID}<br>Hora: ${tiempo}`);
                }

                // 4. Tarjeta Lateral (Usando nombreMostrar)
                const card = document.createElement('div');
                card.className = 'user-card';
                card.style.borderLeftColor = colorMap[usuarioID]; 
                // Aquí mostramos el Nombre Grande y el ID pequeño abajo
                card.innerHTML = `
                    <span class="user-name">${nombreMostrar}</span>
                    <div class="user-info" style="font-size:0.75em; color:#999;">ID: ${usuarioID}</div>
                    <div class="user-info">📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
                `;
                card.addEventListener('click', () => {
                    map.flyTo([lat, lng], 16, { animate: true, duration: 1.5 });
                    markers[usuarioID].openPopup();
                });
                userListDiv.appendChild(card);
            });
        });
    }
} else {
    console.log("Cargando sesión antigua:", ID_SESION_PLAYBACK);
    
    // Mostramos el menú (asegúrate de borrar la línea que lo ocultaba)
    document.querySelector('.menu-bar').style.display = 'flex'; 
    document.getElementById('user-list').innerHTML = "<h3>📂 Dispositivos en esta Sesión</h3>";

    const listaDispositivos = DISPOSITIVOS_PERMITIDOS;
    const colores = ['red', 'blue', 'green', 'orange', 'purple', 'black', 'brown'];

    listaDispositivos.forEach((dispositivoId, index) => {
        const colorLinea = colores[index % colores.length];
        const nombreMostrar = NOMBRES_GPS[dispositivoId] || dispositivoId;

        // Creamos la tarjeta lateral
        const item = document.createElement('div');
        item.className = 'user-card';
        item.style.borderLeft = `5px solid ${colorLinea}`;
        item.innerHTML = `
            <div style="font-weight:bold; color:#333;">${nombreMostrar}</div>
            <div style="font-size:0.8em; color:#666;">ID: ${dispositivoId}</div>
            <div style="font-size:0.85em; margin-top:4px; color: #6f42c1;">Click para ver recorrido ➔</div>
        `;

        // === EL CAMBIO CLAVE: El evento click ahora descarga y dibuja ===
        item.onclick = () => {
            dibujarRutaDispositivoSesion(dispositivoId, colorLinea, nombreMostrar);
        };

        document.getElementById('user-list').appendChild(item);
    });
}
function dibujarRutaDispositivoSesion(dispositivoId, color, nombre) {
    // 1. Limpiamos rutas o marcadores previos para que solo se vea uno a la vez
    limpiarMapa(); 

    console.log(`Cargando ruta grabada de: ${dispositivoId}`);

    db.collection("sesiones").doc(ID_SESION_PLAYBACK)
        .collection("dispositivos").doc(dispositivoId)
        .collection("ruta")
        .orderBy("timestamp_gps", "asc")
        .get()
        .then(snapshotRuta => {
            if (snapshotRuta.empty) {
                alert("Este dispositivo no tiene puntos grabados en esta sesión.");
                return;
            }

            let latlngs = [];
            snapshotRuta.forEach(docPunto => {
                const d = docPunto.data();
                // Validamos ambos casos de mayúsculas/minúsculas por seguridad
                const lat = parseFloat(d.latitud || d.Latitud);
                const lng = parseFloat(d.longitud || d.Longitud);
                
                if (lat && lng && lat !== 0) {
                    latlngs.push([lat, lng]);
                }
            });

            if (latlngs.length > 0) {
                // 2. Dibujar la línea
                rutaLayer = L.polyline(latlngs, { 
                    color: color, 
                    weight: 5, 
                    opacity: 0.8,
                    dashArray: '5, 10' // Opcional: línea punteada para diferenciar de "vivo"
                }).addTo(map);

                // 3. Marcadores de inicio y fin
                const inicio = latlngs[0];
                markers[dispositivoId + "_inicio"] = L.marker(inicio)
                    .addTo(map)
                    .bindPopup(`<b>${nombre}</b><br>Punto de inicio`)
                    .openPopup();
                
                const fin = latlngs[latlngs.length - 1];
                markers[dispositivoId+ "_fin"] = L.marker(fin)
                    .addTo(map)
                    .bindPopup(`<b>${nombre}</b><br>Posición final en sesión.`)
                    .openPopup();

                // 4. Ajustar zoom al recorrido
                map.fitBounds(rutaLayer.getBounds(), { padding: [50, 50] });
            }
        })
        .catch(err => console.error("Error al obtener ruta histórica:", err));
}

// === FUNCIÓN: CARGAR LISTA PARA SELECT (HISTORIAL) ===
function cargarListaDispositivos(selectId) {
    const selectDevice = document.getElementById(selectId);
    
    // Validación de seguridad: si el elemento no existe en el HTML, salir
    if (!selectDevice) {
        console.error(`Error: No se encontró el elemento select con ID: ${selectId}`);
        return;
    }

    // Solo cargamos si está vacío (tiene 0 opciones) o solo tiene la opción por defecto
    // Nota: A veces conviene limpiar y recargar para asegurar datos frescos
    if (selectDevice.options.length > 0) {
        // Opcional: Si quieres forzar recarga, descomenta la siguiente línea:
        // selectDevice.innerHTML = ""; 
        if (selectDevice.options.length > 1) return; // Si ya tiene datos, no recargamos
    }

    db.collection("ubicaciones").get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            // Evitamos duplicados si ya existen
            let existe = false;
            for (let i = 0; i < selectDevice.options.length; i++) {
                if (selectDevice.options[i].value === doc.id) existe = true;
            }

            if (!existe) {
                const option = document.createElement("option");
                option.value = doc.id;
                option.text = doc.id;
                selectDevice.appendChild(option);
            }
        });
    }).catch(error => {
        console.error("Error cargando lista de dispositivos:", error);
    });
}

// === FUNCIÓN: BOTÓN VER RUTA ===
const btnRouteHist = document.getElementById('btn-route-hist');

if (btnRouteHist) {
    btnRouteHist.addEventListener('click', () => {
        // NOTA: Usamos los IDs con sufijo "-hist"
        const deviceElem = document.getElementById('device-select-hist');
        const startElem = document.getElementById('date-start-hist');
        const endElem = document.getElementById('date-end-hist');

        // Validación extra por si los elementos no existen
        if (!deviceElem || !startElem || !endElem) {
            console.error("Faltan elementos del DOM para el historial");
            return;
        }

        const deviceId = deviceElem.value;
        const dateStart = startElem.value;
        const dateEnd = endElem.value;

        if (!deviceId || !dateStart || !dateEnd) {
            alert("Completa todos los campos (Dispositivo y Fechas).");
            return;
        }

        // Formato compatible con tu DB: YYYY MM DD-HH:MM:SS
        const startId = dateStart.replace(/-/g, ' ') + "-00:00:00";
        const endId = dateEnd.replace(/-/g, ' ') + "-23:59:59";

        limpiarMapa(); 
        map.setView([0, 0], 2);

        // OJO: Verifica si tu colección se llama 'Historial' (Mayúscula) o 'historial' (minúscula) en Firestore
        // Aquí pongo 'historial' en minúscula que es lo estándar, revisa tu base de datos.
        let consulta;
        if (ES_PLAYBACK) {
            // BUSCAR EN LA SESIÓN GRABADA
            consulta = db.collection('sesiones').doc(ID_SESION_PLAYBACK)
                        .collection('dispositivos').doc(deviceId)
                        .collection('ruta');
        } else {
            // BUSCAR EN EL HISTORIAL GENERAL
            consulta = db.collection('ubicaciones').doc(deviceId).collection('Historial');
        }

        consulta
            .where(firebase.firestore.FieldPath.documentId(), '>=', startId)
            .where(firebase.firestore.FieldPath.documentId(), '<=', endId)
            .get()
            .then(snapshot => {
                if (snapshot.empty) { alert("No hay datos en esas fechas."); return; }

                let listaPuntos = [];
                snapshot.forEach(doc => {
                    listaPuntos.push({ id: doc.id, data: doc.data() });
                });

                // Ordenar por fecha (ID)
                listaPuntos.sort((a, b) => a.id.localeCompare(b.id));

                const coordenadas = [];
                listaPuntos.forEach(punto => {
                    // Intentamos obtener el valor de la propiedad con Mayúscula o Minúscula
                    const latRaw = punto.data.Latitud !== undefined ? punto.data.Latitud : punto.data.latitud;
                    const lngRaw = punto.data.Longitud !== undefined ? punto.data.Longitud : punto.data.longitud;

                    const lat = parseFloat(latRaw);
                    const lng = parseFloat(lngRaw);

                    // Verificamos que sean números válidos (no NaN) y que no sean (0,0)
                    if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
                        coordenadas.push([lat, lng]);
                    }
                });

                if (coordenadas.length > 0) {
                    rutaLayer = L.polyline(coordenadas, { color: 'blue', weight: 4 }).addTo(map);
                    map.fitBounds(rutaLayer.getBounds(), { padding: [50, 50] });
                }else {
                    alert("Se encontraron datos, pero todas las coordenadas eran (0,0).");
                }
            })
            .catch(err => {
                console.error("Error obteniendo ruta:", err);
                alert("Ocurrió un error al buscar la ruta. Revisa la consola.");
            });
    });
}

// Botón Centrar Mapa (En vivo)
document.getElementById('btn-center-map').addEventListener('click', () => {
    const markersArray = Object.values(markers);
    if (markersArray.length > 0) {
        const group = L.featureGroup(markersArray);
        map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
});


db.collection("ubicaciones").onSnapshot((querySnapshot) => {
    // Si estamos en modo reproducción, NO ejecutar esto para no duplicar datos
    if (typeof ES_PLAYBACK !== 'undefined' && ES_PLAYBACK) return; 

    querySnapshot.forEach((doc) => {
        const usuarioID = doc.id; 
        
        // 1. Filtro de Seguridad
        if (!DISPOSITIVOS_PERMITIDOS.includes(usuarioID)) return;

        const info = doc.data();
        if (!info || info.Latitud === undefined || info.Longitud === undefined) return;

        const datosPunto = {
            latitud: info.Latitud,
            longitud: info.Longitud,
            // Guardamos el nombre aquí por si cambias el alias después, saber cómo se llamaba en ese momento
            nombre_asignado: NOMBRES_GPS[usuarioID] || usuarioID, 
            timestamp_gps: info.EstampaTiempo || new Date().toISOString(),
            timestamp_registro: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Usamos el tiempo como ID del documento para ordenarlos fácil
        const tiempoId = info.EstampaTiempo || new Date().toISOString().replace(/[:.]/g, '-');

        // === CAMBIO CLAVE AQUÍ ===
        // Estructura: sesiones -> TOKEN -> dispositivos -> ID_GPS -> ruta -> TIEMPO
        db.collection("sesiones").doc(sessionToken)
            .collection("dispositivos").doc(usuarioID) // Entramos a la carpeta del dispositivo
            .collection("ruta").doc(tiempoId)          // Guardamos el punto en su ruta específica
            .set(datosPunto)
            .then(() => {
                console.log(`📍 Punto guardado para ${usuarioID} en su ruta individual.`);
            })
            .catch((error) => {
                console.error("Error guardando punto:", error);
            });
    });
});