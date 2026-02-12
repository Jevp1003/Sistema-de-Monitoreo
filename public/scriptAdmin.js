
// === 2. SEGURIDAD: VERIFICACIÓN DE PASE ===
const accesoVerificado = localStorage.getItem('admin_access_verified');
if (accesoVerificado !== 'true') {
    window.location.href = "indexLogin.html"; 
    throw new Error("Acceso no autorizado");
}
window.addEventListener('beforeunload', () => {
    localStorage.removeItem('admin_access_verified');
});

// === 3. REFERENCIAS Y VARIABLES ===
const tableBody = document.getElementById('users-table');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const userIdInput = document.getElementById('userId');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');

// Variables para el Modal de Seguridad
const modal = document.getElementById('modal-check');
const modalPassInput = document.getElementById('admin-pass-check');
const btnModalVerify = document.getElementById('btn-verify-modal');
const btnModalClose = document.getElementById('btn-close-modal');

let usuariosCache = {}; // Aquí guardaremos las contraseñas reales en memoria
let idUsuarioARevelar = null; // Para saber qué fila estamos intentando ver

// === 4. LEER USUARIOS (READ) ===
function cargarUsuarios() {
    db.collection("usuarios").onSnapshot((snapshot) => {
        tableBody.innerHTML = "";
        usuariosCache = {}; // Limpiamos caché

        snapshot.forEach((doc) => {
            const user = doc.data();
            const id = doc.id;

            if (user.usuario === 'admin') return; // Ocultar al admin principal
            
            // Guardamos la contraseña real en memoria, no en el HTML
            usuariosCache[id] = user.password;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${user.usuario}</td>
                
                <td>
                    <span id="pass-span-${id}" style="font-family: monospace; letter-spacing: 2px;">••••••</span>
                </td>
                
                <td>
                    <button class="btn-view" onclick="abrirModalRevelar('${id}')">👁️</button>
                    
                    <button class="btn-edit" onclick="prepararEdicion('${id}', '${user.usuario}')">✏️</button>
                    <button class="btn-delete" onclick="borrarUsuario('${id}', '${user.usuario}')">🗑️</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    });
}

// === 5. LÓGICA DE REVELADO (MODAL) ===

// A. Abrir modal al hacer clic en el ojo
window.abrirModalRevelar = function(id) {
    idUsuarioARevelar = id; // Recordamos qué usuario queremos ver
    modal.style.display = 'flex';
    modalPassInput.value = "";
    modalPassInput.focus();
};

// B. Botón "Revelar" dentro del modal
btnModalVerify.addEventListener('click', () => {
    const passIngresada = modalPassInput.value.trim();
    if (!passIngresada) return;

    // Verificamos contraseña de ADMIN en Firebase
    db.collection("usuarios").where("usuario", "==", "admin").where("password", "==", passIngresada).get()
    .then(snap => {
        if (!snap.empty) {
            // ¡ÉXITO! Contraseña correcta.
            modal.style.display = 'none';
            
            // Buscamos el SPAN correcto y le ponemos la contraseña real
            const span = document.getElementById(`pass-span-${idUsuarioARevelar}`);
            if (span && usuariosCache[idUsuarioARevelar]) {
                span.innerText = usuariosCache[idUsuarioARevelar]; // Muestra la clave
                span.style.color = "#d63384"; // La ponemos de un color diferente para destacar
                span.style.fontWeight = "bold";
                
                // Opcional: Volver a ocultar después de 5 segundos
                setTimeout(() => {
                    span.innerText = "••••••";
                    span.style.color = "black";
                }, 5000);
            }
        } else {
            alert("⛔ Contraseña incorrecta. No puedes ver este dato.");
            modalPassInput.value = "";
        }
    });
});

// C. Cerrar modal
btnModalClose.addEventListener('click', () => {
    modal.style.display = 'none';
    idUsuarioARevelar = null;
});


// === 6. GUARDAR (CREAR O EDITAR) ===
btnSave.addEventListener('click', () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();
    const id = userIdInput.value;

    if (!user || !pass) { alert("Faltan datos"); return; }

    if (id) {
        db.collection("usuarios").doc(id).update({ usuario: user, password: pass })
            .then(() => { alert("Actualizado"); limpiarFormulario(); });
    } else {
        const idPersonalizado = user
        db.collection("usuarios").where("usuario", "==", user).get().then((snap) => {
            if (!snap.empty) {
                alert("Ese usuario ya existe.");
            } else {
                db.collection("usuarios").doc(idPersonalizado).set({ 
                    usuario: user, 
                    password: pass 
                })
                    .then(() => { 
                        alert("Usuario creado con éxito."); 
                        limpiarFormulario(); 
                    });
            }
        });
    }
});

// === 7. OTRAS FUNCIONES (BORRAR / EDITAR) ===
window.borrarUsuario = function(id, nombre) {
    if (confirm(`¿Eliminar a "${nombre}"?`)) {
        db.collection("usuarios").doc(id).delete();
    }
};

window.prepararEdicion = function(id, user) {
    // Nota: Al editar, traemos la contraseña de la memoria caché para ponerla en el input
    const passReal = usuariosCache[id];
    
    userIdInput.value = id;
    usernameInput.value = user;
    passwordInput.value = passReal; // Llenamos el campo con la clave real para que la edite
    
    btnSave.textContent = "💾 Actualizar";
    btnSave.className = "btn-edit";
    btnCancel.style.display = "inline-block";
};

btnCancel.addEventListener('click', limpiarFormulario);

function limpiarFormulario() {
    userIdInput.value = "";
    usernameInput.value = "";
    passwordInput.value = "";
    btnSave.textContent = "➕ Guardar";
    btnSave.className = "btn-add";
    btnCancel.style.display = "none";
}

cargarUsuarios();