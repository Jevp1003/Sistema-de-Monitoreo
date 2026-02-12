// === PORTERO DE SEGURIDAD: SESIONES ===
(function() {
    // Verificamos si existe el usuario que debió guardar el Login
    const usuarioVisor = localStorage.getItem('history_viewer_user');

    if (!usuarioVisor) {
        // Si no existe, es que alguien intentó entrar directo por la URL
        console.warn("⛔ Acceso denegado: Intento de entrada directa.");
        window.location.href = "indexLogin.html";
        throw new Error("Acceso denegado"); // Detiene la ejecución del script aquí
    }
})();

function cerrarSesionHistorial() {
    localStorage.removeItem('history_viewer_user'); // Borramos la llave
    window.location.href = 'indexLogin.html';
}

// Este valor lo guardaremos en el Login antes de saltar a esta página
const usuarioVisor = localStorage.getItem('history_viewer_user');

if (!usuarioVisor) {
    alert("Acceso no autorizado. Inicia sesión primero.");
    window.location.href = "indexLogin.html";
    throw new Error("Stop");
}

document.getElementById('page-title').innerText += ` (${usuarioVisor})`;

// === 3. CONSTRUIR LA CONSULTA (QUERY) ===
let consulta;

if (usuarioVisor === 'admin') {
    // A) Si es ADMIN: Trae TODO
    console.log("Modo Admin: Viendo todo.");
    consulta = db.collection("sesiones");
} else {
    // B) Si es USUARIO NORMAL: Trae solo LO SUYO
    console.log(`Modo Usuario: Viendo solo registros de ${usuarioVisor}`);
    consulta = db.collection("sesiones").where("usuario", "==", usuarioVisor);
}

// === 4. EJECUTAR Y MOSTRAR ===
consulta.get().then((snapshot) => {
    const tbody = document.getElementById('tbody-sesiones');
    const table = document.getElementById('sessions-table');
    const loading = document.getElementById('loading-msg');

    loading.style.display = 'none';
    
    if (snapshot.empty) {
        loading.innerText = "No se encontraron sesiones registradas.";
        loading.style.display = 'block';
        return;
    }

    table.style.display = 'table';
    
    // Convertimos a array para ordenar por fecha (JS) y evitar crear índices en Firebase
    let datos = [];
    snapshot.forEach(doc => {
        let data = doc.data();
        data.id = doc.id; // <--- IMPORTANTE: Guardamos el ID del documento (Token)
        datos.push(data);
    });

    // Ordenar: Más reciente primero
    datos.sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));

    // Dibujar Tabla
    datos.forEach(sesion => {
        const tr = document.createElement('tr');
        
        // 1. Fecha
        const fechaObj = new Date(sesion.fecha_inicio);
        const fechaTexto = fechaObj.toLocaleString('es-ES', { 
            day: '2-digit', month: '2-digit', year: 'numeric', 
            hour: '2-digit', minute: '2-digit' 
        });

        // 2. Lista de Dispositivos
        let listaHTML = `<ul class="device-list">`;
        const nombres = sesion.nombres_asignados || {}; 
        // Aseguramos que sea un array para evitar errores
        const dispositivos = sesion.dispositivos_autorizados || [];
        
        dispositivos.forEach(idDev => {
            const nombreMostrar = nombres[idDev] ? `<b>${nombres[idDev]}</b> (${idDev})` : idDev;
            listaHTML += `<li>${nombreMostrar}</li>`;
        });
        listaHTML += `</ul>`;

        // 3. Badge Usuario
        const claseBadge = (sesion.usuario === 'admin') ? 'badge-user badge-admin' : 'badge-user';

        // 4. BOTÓN VER (NUEVO)
        // Convertimos los objetos a string para pasarlos a la función
        const strDispositivos = JSON.stringify(dispositivos).replace(/"/g, '&quot;');
        const strNombres = JSON.stringify(nombres).replace(/"/g, '&quot;');

        const btnVer = `
            <button class="btn-back" style="background:#007bff; font-size:0.8em;" 
                onclick="verSesionGrabada('${sesion.id}', '${strDispositivos}', '${strNombres}')">
                👁 Ver
            </button>
        `;

        tr.innerHTML = `
            <td class="date-cell">${fechaTexto}</td>
            <td><span class="${claseBadge}">${sesion.usuario}</span></td>
            <td>${sesion.motivo}</td>
            <td>${listaHTML}</td>
            <td>${btnVer}</td> 
        `;
        tbody.appendChild(tr);
    });

}).catch(error => {
    console.error(error);
    alert("Error cargando historial: " + error.message);
});

window.verSesionGrabada = function(idSesion, dispositivosStr, nombresStr) {
    // Guardamos 'flags' especiales para que indexPrueba sepa qué hacer
    localStorage.setItem('playback_mode', 'true'); // Activamos modo reproducción
    localStorage.setItem('playback_session_id', idSesion);
    
    // Configuramos el entorno como si hubiéramos hecho login
    localStorage.setItem('allowed_devices', dispositivosStr); // Array de dispositivos
    localStorage.setItem('device_aliases', nombresStr);       // Mapa de nombres
    
    // Redirigimos
    window.location.href = "indexPrueba.html";
};