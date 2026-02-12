
// === 2. CARGAR LISTA DE DISPOSITIVOS (CON CAMPO DE NOMBRE) ===
const deviceContainer = document.getElementById('device-container');

db.collection("ubicaciones").get().then((snapshot) => {
    deviceContainer.innerHTML = ""; 
    snapshot.forEach(doc => {
        const id = doc.id;
        
        // Crear elemento de lista
        const div = document.createElement("div");
        div.className = "device-item";
        div.style.marginBottom = "10px"; // Espacio extra
        div.style.borderBottom = "1px solid #eee";
        div.style.paddingBottom = "5px";

        // HTML: Checkbox (Desmarcado) + ID Original + Input para Nombre
        div.innerHTML = `
            <div style="display:flex; align-items:center; justify-content: space-between; ">
                <label style="display:flex; align-items:center; margin:0; cursor:pointer; white-space: nowrap; margin-right: 10px;">
                    <input type="checkbox" value="${id}" class="dev-checkbox"> 
                    <strong style="margin-left:8px; font-size: 0.9em;">${id}</strong>
                </label>
                <input type="text" class="dev-alias" placeholder="•••Nombre•••" 
                       style="width: 225px; text-align: center; font-size: 0.8em; padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
        `;
        deviceContainer.appendChild(div);

    });
});

// === 3. LÓGICA DE LOGIN (VALIDACIÓN: NI VACÍOS NI REPETIDOS) ===
document.getElementById('btn-login').addEventListener('click', async () => {
    const user = document.getElementById('user').value;
    const pass = document.getElementById('pass').value;
    const reason = document.getElementById('reason').value;
    const errorMsg = document.getElementById('error-msg');

    // 1. Validar campos generales
    if(!user || !pass || !reason) { 
        alert("Por favor completa Usuario, Contraseña y Motivo."); 
        return; 
    }

    // 2. Validar Usuario en Firebase
    const userQuery = await db.collection("usuarios")
        .where("usuario", "==", user)
        .where("password", "==", pass)
        .get();

    if (userQuery.empty) { 
        errorMsg.style.display = "block"; 
        return; 
    }

    // 3. VALIDACIÓN DE DISPOSITIVOS
    const checkboxes = document.querySelectorAll('.dev-checkbox:checked');
    
    if (checkboxes.length === 0) { 
        alert("⚠️ No has seleccionado ningún GPS para monitorear."); 
        return; 
    }

    const selectedDevices = []; 
    const deviceAliases = {};   
    
    // LISTA DE CONTROL PARA DUPLICADOS
    const nombresUsados = new Set(); 

    for (const cb of checkboxes) {
        const originalID = cb.value;
        const inputAlias = cb.parentElement.parentElement.querySelector('.dev-alias');
        const nombreEscribido = inputAlias.value.trim();

        // A) VALIDACIÓN DE NOMBRE VACÍO
        if (nombreEscribido === "") {
            alert(`⚠️ ERROR:\n\nEl dispositivo "${originalID}" está marcado pero NO tiene nombre.`);
            inputAlias.focus(); 
            inputAlias.style.border = "2px solid red";
            return; 
        }

        // B) VALIDACIÓN DE NOMBRE REPETIDO (NUEVO)
        if (nombresUsados.has(nombreEscribido)) {
            alert(`⚠️ ERROR DE DUPLICADO:\n\nYa usaste el nombre "${nombreEscribido}" para otro dispositivo.\n\nPor favor, usa nombres distintos para evitar confusiones en el mapa.`);
            
            inputAlias.focus(); 
            inputAlias.style.border = "2px solid orange"; // Color naranja para diferenciar el error
            return; 
        }

        // Si pasó las pruebas, lo agregamos a la lista de usados y guardamos
        nombresUsados.add(nombreEscribido);
        selectedDevices.push(originalID);
        deviceAliases[originalID] = nombreEscribido;
    }

    // 4. Crear Sesión y Guardar
    const motivoLimpio = reason.trim().replace(/\s+/g, '-').toLowerCase();
    const fechaHoy = new Date().toISOString().split('T')[0];
    const customId = `${user}_${motivoLimpio}_${fechaHoy}`; 

    const sessionData = {
        usuario: user,
        motivo: reason,
        dispositivos_autorizados: selectedDevices,
        nombres_asignados: deviceAliases,
        fecha_inicio: new Date().toISOString(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    db.collection("sesiones").doc(customId).set(sessionData)
        .then(() => {
            console.log("Sesión creada");
            localStorage.setItem('auth_token', customId);
            localStorage.setItem('auth_user', user);
            localStorage.setItem('allowed_devices', JSON.stringify(selectedDevices));
            localStorage.setItem('device_aliases', JSON.stringify(deviceAliases));

            window.location.href = "indexPrueba.html";

        })
        .catch((e) => alert("Error: " + e.message));
});

// Click en "Gestionar Usuarios"
// === LÓGICA DE LA VENTANA MODAL (ADMIN) ===
const modal = document.getElementById('modal-pass');
const adminInput = document.getElementById('admin-pass-input');
const btnConfirm = document.getElementById('btn-confirm-modal');
const btnCancel = document.getElementById('btn-cancel-modal');

// 1. Abrir el Modal al hacer clic en el enlace
document.getElementById('link-admin').addEventListener('click', (e) => {
    e.preventDefault();
    modal.style.display = 'flex'; // Muestra la ventana
    adminInput.value = ""; // Limpia el campo por si acaso
    adminInput.focus(); // Pone el cursor listo para escribir
});

// 2. Botón Cancelar (Cerrar Modal)
btnCancel.addEventListener('click', () => {
    modal.style.display = 'none';
});

// 3. Botón Entrar (Validar)
btnConfirm.addEventListener('click', () => {
    const passwordIngresada = adminInput.value.trim();

    if (passwordIngresada === "") { 
        alert("Escribe la contraseña."); 
        return; 
    }

    // Verificar en Firebase
    db.collection("usuarios")
        .where("usuario", "==", "admin")
        .where("password", "==", passwordIngresada)
        .get()
        .then(snap => {
            if (!snap.empty) {
                // Correcto: Ocultamos modal y redirigimos
                modal.style.display = 'none';
                localStorage.setItem('admin_access_verified', 'true');
                window.location.href = "indexAdmin.html";
            } else {
                alert("⛔ Contraseña incorrecta.");
                adminInput.value = ""; // Limpiar para reintentar
                adminInput.focus();
            }
        })
        .catch(error => {
            console.error(error);
            alert("Error de conexión.");
        });
});

// (Opcional) Permitir dar ENTER en el input del modal para entrar
adminInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        btnConfirm.click();
    }
});

// === BOTÓN "VER MIS SESIONES ANTERIORES" ===
document.getElementById('btn-history').addEventListener('click', async () => {
    const user = document.getElementById('user').value.trim();
    const pass = document.getElementById('pass').value.trim();

    // 1. Validar que haya escrito algo
    if (!user || !pass) {
        alert("Para ver tu historial, primero ingresa tu Usuario y Contraseña en las casillas de arriba.");
        return;
    }

    // 2. Validar credenciales en Firebase
    try {
        const query = await db.collection("usuarios")
            .where("usuario", "==", user)
            .where("password", "==", pass)
            .get();

        if (query.empty) {
            alert("Usuario o contraseña incorrectos.");
        } else {
            // 3. Credenciales válidas -> Mandar al historial
            // Guardamos quién es el que va a mirar
            localStorage.setItem('history_viewer_user', user);
            window.location.href = "indexSesiones.html";
        }
    } catch (error) {
        console.error(error);
        alert("Error de conexión.");
    }
});
