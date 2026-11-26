/* =========================================================
   BATERIAS_MEDICION
   Sistema de gestión y trazabilidad de baterías
   Versión 0.9.3
   Base funcional: v0.9.2

   ETAPA 12 (v0.9.3):
   - Edición y eliminación de mediciones restringida a administrador.
   - Modal de edición completo (datos generales y 4 baterías).
   - Confirmación explícita para eliminar registros.
   - Auditoría estricta en BD vía editar_medicion_completa y
     eliminar_medicion_completa.
   - Gestión completa de técnicos para administrador (habilitar,
     desactivar, reactivar y eliminar/baja lógica).
   - Conserva registro provisional, reportes, historial, mediciones y auth.

   SEGURIDAD:
   - La identidad del usuario se obtiene desde auth.uid().
   - La base de datos valida permisos mediante RLS y RPC.
   - La clave secreta de Supabase nunca se utiliza aquí.
========================================================= */


/* =========================================================
   1. CONFIGURACIÓN DE SUPABASE
========================================================= */

const SUPABASE_URL =
    "https://rmzqeidlzkpbyezhixxw.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_KFRwEobQuk2GJBsKIwX6xg_GYy8LOTD";

const ADMIN_FUNCTION_NAME = "quick-endpoint";

const supabaseClient = (() => {

    if (!window.supabase || !window.supabase.createClient) {
        alert("No se pudo cargar la librería de Supabase.");
        throw new Error("Librería Supabase no disponible.");
    }

    return window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );

})();


/* =========================================================
   2. REFERENCIAS PRINCIPALES
========================================================= */

const appContainer =
    document.querySelector(".app-container");

const navButtons =
    document.querySelectorAll(".nav-item");

const pageTitle =
    document.getElementById("pageTitle");

const sidebar =
    document.getElementById("sidebar");

const mobileMenu =
    document.getElementById("mobileMenu");

const lineSelect =
    document.getElementById("line");

const stationSelect =
    document.getElementById("station");

const dateInput =
    document.getElementById("date");

const technicianInput =
    document.getElementById("technician");

const measurementForm =
    document.getElementById("measurementForm");

let currentUser = null;
let currentProfile = null;

// Evita ejecutar consultas simultáneas al actualizar el dashboard.
let dashboardLoading = false;

let loadedUserId = null;
let loadingUserId = null;


/* =========================================================
   2.1. HELPERS DE PERFIL Y PERMISOS (ETAPA 11 & 12)
========================================================= */

function isProvisionalProfile(profile = currentProfile) {
    if (!profile) return false;
    return profile.estado_acceso === "provisional" && !profile.activo;
}

function isFullActiveProfile(profile = currentProfile) {
    if (!profile) return false;
    return profile.activo === true && profile.estado_acceso !== "provisional";
}

function isAdminUser(profile = currentProfile) {
    return Boolean(profile && profile.rol === "administrador" && isFullActiveProfile(profile));
}

function canAccessView(viewName, profile = currentProfile) {
    if (!profile) return false;

    if (isProvisionalProfile(profile)) {
        return viewName === "mediciones";
    }

    if (!isFullActiveProfile(profile)) {
        return false;
    }

    if (viewName === "administracion") {
        return profile.rol === "administrador";
    }

    return ["dashboard", "mediciones", "historial", "reportes"].includes(viewName);
}


/* =========================================================
   3. ESTILOS DINÁMICOS
========================================================= */

const dynamicStyles = document.createElement("style");

dynamicStyles.textContent = `

    [hidden] {
        display: none !important;
    }

    .auth-screen {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background:
            radial-gradient(circle at top right, #FCEBED, transparent 45%),
            #F4F5F7;
        font-family: inherit;
    }

    .auth-card {
        width: 100%;
        max-width: 440px;
        background: #FFFFFF;
        border-radius: 18px;
        padding: 36px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.10);
        border: 1px solid #E8E8E8;
    }

    .auth-brand {
        text-align: center;
        margin-bottom: 22px;
    }

    .auth-logo {
        width: 68px;
        height: 68px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 15px;
        border-radius: 18px;
        background: #FCEBED;
        font-size: 34px;
    }

    .auth-brand h1 {
        color: #76121D;
        font-size: 23px;
        margin: 0 0 7px;
    }

    .auth-brand p {
        color: #777777;
        font-size: 13px;
        margin: 0;
    }

    .auth-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        background: #F4F5F7;
        padding: 5px;
        border-radius: 10px;
        margin-bottom: 20px;
    }

    .auth-tab {
        border: none;
        background: transparent;
        color: #555555;
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
    }

    .auth-tab.active {
        background: #FFFFFF;
        color: #76121D;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .auth-form {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }

    .auth-row-two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }

    .auth-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .auth-field label {
        font-size: 13px;
        font-weight: 600;
        color: #333333;
    }

    .auth-field input {
        width: 100%;
        box-sizing: border-box;
        padding: 12px 13px;
        border: 1px solid #DADADA;
        border-radius: 9px;
        font-size: 14px;
        outline: none;
    }

    .auth-field input:focus {
        border-color: #D71920;
        box-shadow: 0 0 0 3px rgba(215,25,32,0.10);
    }

    .auth-hint {
        font-size: 11px;
        color: #666666;
        background: #FFF7F8;
        border: 1px solid #F3D1D5;
        border-radius: 8px;
        padding: 10px 12px;
        line-height: 1.5;
    }

    .auth-button {
        width: 100%;
        padding: 14px;
        border: none;
        border-radius: 9px;
        background: linear-gradient(110deg, #76121D, #D71920);
        color: white;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        margin-top: 4px;
    }

    .auth-button:disabled {
        opacity: 0.65;
        cursor: wait;
    }

    .auth-message {
        min-height: 18px;
        font-size: 13px;
        text-align: center;
        line-height: 1.5;
        color: #B42318;
    }

    .auth-footer {
        text-align: center;
        font-size: 11px;
        color: #888888;
        margin-top: 22px;
    }

    .provisional-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        background: #FFF6E5;
        border: 1px solid #F4D394;
        color: #7A4B00;
        border-radius: 10px;
        padding: 12px 16px;
        margin-bottom: 18px;
        font-size: 12px;
        line-height: 1.5;
    }

    .provisional-banner strong {
        color: #5C3700;
    }

    .nav-item.nav-locked {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .logout-button {
        border: 1px solid #D71920;
        background: white;
        color: #D71920;
        padding: 8px 12px;
        border-radius: 7px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        margin-left: 12px;
    }

    .logout-button:hover {
        background: #FCEBED;
    }

    /* Administración */

    .admin-container {
        width: 100%;
        max-width: 1200px;
        margin: 0 auto;
        padding: 10px 0 30px;
        box-sizing: border-box;
    }

    .admin-description {
        color: #777777;
        font-size: 13px;
        margin: 5px 0 22px;
        line-height: 1.6;
    }

    .admin-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 20px;
        margin-bottom: 25px;
    }

    .admin-card {
        background: #FFFFFF;
        border: 1px solid #E6E6E6;
        border-radius: 12px;
        padding: 22px;
        box-shadow: 0 3px 12px rgba(0,0,0,0.04);
        box-sizing: border-box;
    }

    .admin-card h3 {
        margin: 0 0 8px;
        color: #76121D;
        font-size: 17px;
    }

    .admin-card-description {
        margin: 0 0 20px;
        font-size: 12px;
        color: #777777;
        line-height: 1.5;
    }

    .admin-form {
        display: flex;
        flex-direction: column;
        gap: 13px;
    }

    .admin-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .admin-field label {
        color: #444444;
        font-size: 12px;
        font-weight: 600;
    }

    .admin-field input {
        width: 100%;
        box-sizing: border-box;
        padding: 11px 12px;
        border: 1px solid #D8D8D8;
        border-radius: 8px;
        font-size: 13px;
        outline: none;
    }

    .admin-field input:focus {
        border-color: #D71920;
        box-shadow: 0 0 0 3px rgba(215,25,32,0.08);
    }

    .admin-primary-button {
        border: none;
        background: linear-gradient(110deg, #76121D, #D71920);
        color: white;
        padding: 12px 15px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
    }

    .admin-primary-button:disabled {
        opacity: 0.6;
        cursor: wait;
    }

    .admin-secondary-button {
        border: 1px solid #D71920;
        background: white;
        color: #D71920;
        padding: 9px 12px;
        border-radius: 7px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }

    .admin-secondary-button:hover {
        background: #FCEBED;
    }

    .admin-status-message {
        min-height: 18px;
        font-size: 12px;
        line-height: 1.5;
        margin: 3px 0 0;
    }

    .admin-status-success {
        color: #16803C;
    }

    .admin-status-error {
        color: #B42318;
    }

    .admin-list-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 15px;
    }

    .admin-list-header h3 {
        color: #76121D;
        font-size: 17px;
        margin: 0;
    }

    .admin-technician-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .admin-technician-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 15px;
        padding: 14px;
        border: 1px solid #EEEEEE;
        border-radius: 9px;
        background: #FFFFFF;
    }

    .admin-technician-row.is-provisional {
        border-color: #F4D394;
        background: #FFFDF7;
    }

    .admin-technician-data {
        min-width: 0;
        flex: 1;
    }

    .admin-technician-name {
        color: #333333;
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 4px;
        overflow-wrap: anywhere;
    }

    .admin-technician-email {
        color: #777777;
        font-size: 12px;
        overflow-wrap: anywhere;
    }

    .admin-technician-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 8px;
    }

    .admin-status-pill {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 20px;
        font-size: 10px;
        font-weight: 700;
    }

    .admin-status-active {
        color: #16803C;
        background: #E8F5EC;
    }

    .admin-status-provisional {
        color: #9A5B00;
        background: #FFF3D6;
    }

    .admin-status-inactive {
        color: #B42318;
        background: #FCEBED;
    }

    .admin-role-pill {
        color: #555555;
        background: #F0F0F0;
    }

    .admin-row-actions {
        display: flex;
        align-items: center;
        gap: 7px;
        flex-wrap: wrap;
        flex-shrink: 0;
    }

    .admin-action-button {
        border: 1px solid #DADADA;
        background: white;
        color: #444444;
        padding: 8px 10px;
        border-radius: 7px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
    }

    .admin-action-button:hover {
        background: #F5F5F5;
    }

    .admin-action-danger {
        border-color: #D71920;
        color: #D71920;
    }

    .admin-action-delete {
        border: 1px solid #8E121A;
        background: #FFF5F5;
        color: #8E121A;
    }

    .admin-action-delete:hover {
        background: #FCEBED;
    }

    .admin-action-success {
        border-color: #16803C;
        color: #16803C;
    }

    .admin-action-enable {
        border: none;
        background: #16803C;
        color: #FFFFFF;
    }

    .admin-action-enable:hover {
        background: #126931;
    }

    .admin-empty-message,
    .admin-loading {
        padding: 20px;
        text-align: center;
        color: #777777;
        font-size: 13px;
        background: #FAFAFA;
        border-radius: 8px;
    }

    /* Resultado de guardado */

    .measurement-save-message {
        display: none;
        padding: 13px 15px;
        margin: 15px 0;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.5;
    }

    .measurement-save-message.success {
        display: block;
        color: #176B36;
        background: #E8F5EC;
        border: 1px solid #B8DFC4;
    }

    .measurement-save-message.error {
        display: block;
        color: #A32121;
        background: #FCEBED;
        border: 1px solid #F0C4C8;
    }

    .measurement-save-message.info {
        display: block;
        color: #555555;
        background: #F2F2F2;
        border: 1px solid #DDDDDD;
    }

    @media (max-width: 600px) {

        .auth-card {
            padding: 28px 20px;
        }

        .auth-row-two {
            grid-template-columns: 1fr;
        }

        .admin-technician-row {
            align-items: flex-start;
            flex-direction: column;
        }

        .admin-row-actions {
            width: 100%;
        }

        .admin-row-actions button {
            flex: 1;
        }

    }

`;

document.head.appendChild(dynamicStyles);


/* =========================================================
   4. PANTALLA DE INICIO DE SESIÓN Y REGISTRO AUTÓNOMO
========================================================= */

const authScreen = document.createElement("section");

authScreen.id = "authScreen";
authScreen.className = "auth-screen";

authScreen.innerHTML = `

    <div class="auth-card">

        <div class="auth-brand">

            <div class="auth-logo">🔋</div>

            <h1>Baterias_Medicion</h1>

            <p>
                Sistema de Gestión y Trazabilidad de Baterías
            </p>

        </div>

        <div class="auth-tabs" role="tablist">
            <button
                type="button"
                id="tabLoginBtn"
                class="auth-tab active"
                role="tab"
                aria-selected="true"
            >
                Iniciar sesión
            </button>
            <button
                type="button"
                id="tabRegisterBtn"
                class="auth-tab"
                role="tab"
                aria-selected="false"
            >
                Registrarme
            </button>
        </div>

        <form id="loginForm" class="auth-form">

            <div class="auth-field">

                <label for="loginEmail">
                    Correo electrónico
                </label>

                <input
                    type="email"
                    id="loginEmail"
                    placeholder="tecnico@correo.cl"
                    autocomplete="username"
                    required
                >

            </div>

            <div class="auth-field">

                <label for="loginPassword">
                    Contraseña
                </label>

                <input
                    type="password"
                    id="loginPassword"
                    placeholder="Ingresa tu contraseña"
                    autocomplete="current-password"
                    required
                >

            </div>

            <div
                id="authMessage"
                class="auth-message"
                role="status"
            ></div>

            <button
                type="submit"
                id="loginButton"
                class="auth-button"
            >
                Iniciar sesión
            </button>

        </form>

        <form id="registerForm" class="auth-form" hidden>

            <div class="auth-row-two">
                <div class="auth-field">
                    <label for="regNames">Nombres</label>
                    <input
                        type="text"
                        id="regNames"
                        maxlength="100"
                        placeholder="Tus nombres"
                        required
                    >
                </div>

                <div class="auth-field">
                    <label for="regLastNames">Apellidos</label>
                    <input
                        type="text"
                        id="regLastNames"
                        maxlength="100"
                        placeholder="Tus apellidos"
                        required
                    >
                </div>
            </div>

            <div class="auth-field">
                <label for="regEmail">Correo electrónico</label>
                <input
                    type="email"
                    id="regEmail"
                    placeholder="tecnico@metro.cl"
                    autocomplete="email"
                    required
                >
            </div>

            <div class="auth-field">
                <label for="regPassword">Contraseña</label>
                <input
                    type="password"
                    id="regPassword"
                    minlength="10"
                    placeholder="Mínimo 10 caracteres"
                    autocomplete="new-password"
                    required
                >
            </div>

            <div class="auth-hint">
                Tu cuenta se creará con <strong>acceso provisional</strong>: podrás registrar mediciones de inmediato mientras un administrador habilita el resto de módulos.
            </div>

            <div
                id="registerMessage"
                class="auth-message"
                role="status"
            ></div>

            <button
                type="submit"
                id="registerButton"
                class="auth-button"
            >
                Crear cuenta provisional
            </button>

        </form>

        <div class="auth-footer">
            Acceso exclusivo para personal autorizado
        </div>

    </div>

`;

document.body.insertBefore(authScreen, appContainer);

appContainer.hidden = true;

const tabLoginBtn =
    document.getElementById("tabLoginBtn");

const tabRegisterBtn =
    document.getElementById("tabRegisterBtn");

const loginForm =
    document.getElementById("loginForm");

const loginEmail =
    document.getElementById("loginEmail");

const loginPassword =
    document.getElementById("loginPassword");

const loginButton =
    document.getElementById("loginButton");

const authMessage =
    document.getElementById("authMessage");

const registerForm =
    document.getElementById("registerForm");

const regNames =
    document.getElementById("regNames");

const regLastNames =
    document.getElementById("regLastNames");

const regEmail =
    document.getElementById("regEmail");

const regPassword =
    document.getElementById("regPassword");

const registerButton =
    document.getElementById("registerButton");

const registerMessage =
    document.getElementById("registerMessage");


function switchAuthTab(mode) {
    const isRegister = mode === "register";

    tabLoginBtn.classList.toggle("active", !isRegister);
    tabLoginBtn.setAttribute("aria-selected", String(!isRegister));

    tabRegisterBtn.classList.toggle("active", isRegister);
    tabRegisterBtn.setAttribute("aria-selected", String(isRegister));

    loginForm.hidden = isRegister;
    registerForm.hidden = !isRegister;

    showAuthMessage("");
    showRegisterMessage("");
}

tabLoginBtn.addEventListener("click", () => switchAuthTab("login"));
tabRegisterBtn.addEventListener("click", () => switchAuthTab("register"));


/* =========================================================
   5. MENSAJES DE AUTENTICACIÓN Y REGISTRO
========================================================= */

function showAuthMessage(message, isError = true) {

    authMessage.textContent = message;

    authMessage.style.color = isError
        ? "#B42318"
        : "#16803C";

}

function showRegisterMessage(message, isError = true) {

    registerMessage.textContent = message;

    registerMessage.style.color = isError
        ? "#B42318"
        : "#16803C";

}


function setLoginLoading(isLoading) {

    loginButton.disabled = isLoading;

    loginButton.textContent = isLoading
        ? "Verificando acceso..."
        : "Iniciar sesión";

}

function setRegisterLoading(isLoading) {

    registerButton.disabled = isLoading;

    registerButton.textContent = isLoading
        ? "Creando cuenta..."
        : "Crear cuenta provisional";

}


/* =========================================================
   6. INICIAR SESIÓN Y REGISTRO AUTÓNOMO
========================================================= */

loginForm.addEventListener("submit", async event => {

    event.preventDefault();

    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!email || !password) {

        showAuthMessage(
            "Completa el correo y la contraseña."
        );

        return;
    }

    setLoginLoading(true);
    showAuthMessage("");

    try {

        const { data, error } =
            await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

        if (error) {
            throw error;
        }

        if (!data.user) {
            throw new Error("No se pudo identificar al usuario.");
        }

        loginPassword.value = "";

        console.log(
            "Usuario autenticado:",
            data.user.email
        );

    } catch (error) {

        console.error("Error de autenticación:", error);

        let message = "No fue posible iniciar sesión.";

        const errorMessage =
            String(error.message || "").toLowerCase();

        if (errorMessage.includes("email not confirmed")) {
            message = "Debes confirmar el correo electrónico de tu cuenta.";
        } else if (errorMessage.includes("invalid login credentials")) {
            message = "Correo o contraseña incorrectos.";
        } else if (errorMessage.includes("banned")) {
            message = "Esta cuenta está desactivada. Contacta al administrador.";
        }

        showAuthMessage(message);

    } finally {

        setLoginLoading(false);

    }

});

registerForm.addEventListener("submit", async event => {

    event.preventDefault();

    const nombres = regNames.value.trim();
    const apellidos = regLastNames.value.trim();
    const correo = regEmail.value.trim().toLowerCase();
    const password = regPassword.value;

    if (!nombres || !apellidos || !correo || !password) {
        showRegisterMessage("Completa todos los campos obligatorios.");
        return;
    }

    if (password.length < 10) {
        showRegisterMessage("La contraseña debe tener al menos 10 caracteres.");
        return;
    }

    setRegisterLoading(true);
    showRegisterMessage("");

    try {

        const { data, error } =
            await supabaseClient.auth.signUp({
                email: correo,
                password,
                options: {
                    data: {
                        nombres,
                        apellidos
                    }
                }
            });

        if (error) {
            throw error;
        }

        if (!data.user) {
            throw new Error("No fue posible crear la cuenta.");
        }

        if (data.session) {
            const { error: rpcError } = await supabaseClient.rpc(
                "registrar_tecnico_provisional",
                {
                    p_nombres: nombres,
                    p_apellidos: apellidos,
                    p_correo: correo
                }
            );

            if (rpcError) {
                throw rpcError;
            }

            registerForm.reset();
            await showAuthenticatedApp(data.user);
            return;
        }

        registerForm.reset();
        switchAuthTab("login");
        showAuthMessage(
            "Cuenta creada. Confirma tu correo electrónico e inicia sesión para usar tu acceso provisional.",
            false
        );

    } catch (error) {

        console.error("Error en registro autónomo:", error);

        let message = error.message || "No fue posible completar el registro.";
        const lower = message.toLowerCase();

        if (lower.includes("already registered") || lower.includes("user already exists")) {
            message = "Este correo ya se encuentra registrado. Inicia sesión.";
        }

        showRegisterMessage(message);

    } finally {

        setRegisterLoading(false);

    }

});


/* =========================================================
   7. IDENTIFICAR PERFIL DEL USUARIO
========================================================= */

async function loadUserProfile(user) {

    let { data, error } = await supabaseClient
        .from("tecnicos")
        .select("id, nombres, apellidos, correo, rol, activo, estado_acceso")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data && user.user_metadata?.nombres && user.user_metadata?.apellidos) {
        const { error: createError } = await supabaseClient.rpc(
            "registrar_tecnico_provisional",
            {
                p_nombres: user.user_metadata.nombres,
                p_apellidos: user.user_metadata.apellidos,
                p_correo: user.email
            }
        );

        if (createError) {
            throw createError;
        }

        const retry = await supabaseClient
            .from("tecnicos")
            .select("id, nombres, apellidos, correo, rol, activo, estado_acceso")
            .eq("id", user.id)
            .maybeSingle();

        if (retry.error) {
            throw retry.error;
        }

        data = retry.data;
    }

    if (!data) {
        throw new Error("La cuenta no tiene un perfil registrado.");
    }

    const provisional =
        data.estado_acceso === "provisional" && !data.activo;

    if (!data.activo && !provisional) {
        throw new Error("Tu cuenta se encuentra desactivada o eliminada. Contacta al administrador.");
    }

    if (
        data.rol !== "administrador" &&
        data.rol !== "tecnico"
    ) {
        throw new Error("El perfil tiene un rol no reconocido.");
    }

    return data;

}


/* =========================================================
   8. MOSTRAR APLICACIÓN AUTENTICADA Y CONTROL PROVISIONAL
========================================================= */

function applyAccessRestrictions(profile) {
    const provisional = isProvisionalProfile(profile);

    document.querySelectorAll(".nav-item").forEach(button => {
        const viewName = button.dataset.view;
        const allowed = canAccessView(viewName, profile);

        if (provisional) {
            button.classList.toggle("nav-locked", !allowed);
            button.title = allowed
                ? ""
                : "Disponible cuando un administrador habilite tu cuenta";
        } else {
            button.classList.remove("nav-locked");
            button.title = "";
        }
    });

    const medicionesView = document.getElementById("mediciones");
    const existingBanner = document.getElementById("provisionalAccessBanner");

    if (provisional && medicionesView) {
        if (!existingBanner) {
            const banner = document.createElement("div");
            banner.id = "provisionalAccessBanner";
            banner.className = "provisional-banner";
            banner.innerHTML = `
                <div>
                    <strong>Modo de acceso provisional:</strong> Puedes registrar mediciones de inmediato.
                    Los módulos de <strong>Panel principal</strong>, <strong>Historial</strong> e <strong>Informes</strong> se habilitarán cuando un administrador active tu perfil.
                </div>
            `;
            const heading = medicionesView.querySelector(".section-heading");
            if (heading && heading.nextSibling) {
                medicionesView.insertBefore(banner, heading.nextSibling);
            } else {
                medicionesView.prepend(banner);
            }
        }
    } else if (existingBanner) {
        existingBanner.remove();
    }
}

async function showAuthenticatedApp(user) {

    if (!user) {
        return;
    }

    if (loadingUserId === user.id) {
        return;
    }

    if (loadedUserId === user.id && currentProfile) {
        return;
    }

    loadingUserId = user.id;

    try {

        const profile = await loadUserProfile(user);

        currentUser = user;
        currentProfile = profile;
        loadedUserId = user.id;

        authScreen.hidden = true;
        appContainer.hidden = false;

        const provisional = isProvisionalProfile(profile);

        const fullName =
            `${profile.nombres} ${profile.apellidos}` +
            (provisional ? " (Provisional)" : "");

        technicianInput.value =
            `${profile.nombres} ${profile.apellidos}`;
        technicianInput.readOnly = true;

        const userInfo =
            document.querySelector(".user-info");

        if (userInfo) {

            const avatar = userInfo.querySelector(".avatar");
            const userName = userInfo.querySelector("span");

            if (avatar) {
                avatar.textContent =
                    profile.nombres.charAt(0).toUpperCase();
            }

            if (userName) {
                userName.textContent = fullName;
            }

        }

        createLogoutButton();
        applyAccessRestrictions(profile);
        setupAdminModule();

        await loadLines();

        if (!provisional) {
            setupHistoryModule();
            await loadDashboardData();
            showView("dashboard");
        } else {
            showView("mediciones");
        }

        console.log(
            "Aplicación habilitada:",
            fullName,
            profile.rol,
            profile.estado_acceso
        );

    } catch (error) {

        console.error("Error al cargar perfil:", error);

        currentUser = null;
        currentProfile = null;
        loadedUserId = null;

        await supabaseClient.auth.signOut();

        showLoginScreen();

        showAuthMessage(
            error.message || "No fue posible validar tu perfil."
        );

    } finally {

        loadingUserId = null;

    }

}


/* =========================================================
   9. CERRAR SESIÓN
========================================================= */

function createLogoutButton() {

    const userInfo =
        document.querySelector(".user-info");

    if (!userInfo) {
        return;
    }

    if (document.getElementById("logoutButton")) {
        return;
    }

    const logoutButton = document.createElement("button");

    logoutButton.id = "logoutButton";
    logoutButton.className = "logout-button";
    logoutButton.textContent = "Cerrar sesión";
    logoutButton.type = "button";

    logoutButton.addEventListener("click", async () => {

        const confirmed = confirm("¿Deseas cerrar tu sesión?");

        if (!confirmed) {
            return;
        }

        logoutButton.disabled = true;
        logoutButton.textContent = "Cerrando...";

        const { error } =
            await supabaseClient.auth.signOut();

        if (error) {

            console.error("Error al cerrar sesión:", error);

            alert("No fue posible cerrar la sesión.");

            logoutButton.disabled = false;
            logoutButton.textContent = "Cerrar sesión";

        }

    });

    userInfo.appendChild(logoutButton);

}


function showLoginScreen() {

    currentUser = null;
    currentProfile = null;

    loadedUserId = null;
    loadingUserId = null;

    appContainer.hidden = true;
    authScreen.hidden = false;

    loginForm.reset();
    registerForm.reset();
    switchAuthTab("login");

    showAuthMessage("");
    showRegisterMessage("");

    setLoginLoading(false);
    setRegisterLoading(false);

    const logoutButton =
        document.getElementById("logoutButton");

    if (logoutButton) {
        logoutButton.remove();
    }

    const banner =
        document.getElementById("provisionalAccessBanner");

    if (banner) {
        banner.remove();
    }

    loginEmail.focus();

}


/* =========================================================
   10. CONTROL AUTOMÁTICO DE SESIÓN
========================================================= */

async function checkExistingSession() {

    const { data, error } =
        await supabaseClient.auth.getSession();

    if (error) {

        console.error("No se pudo recuperar la sesión:", error);

        showLoginScreen();

        return;
    }

    if (data.session && data.session.user) {

        await showAuthenticatedApp(data.session.user);

    } else {

        showLoginScreen();

    }

}


supabaseClient.auth.onAuthStateChange(
    (event, session) => {

        if (session && session.user) {

            setTimeout(() => {

                if (currentUser?.id !== session.user.id) {
                    showAuthenticatedApp(session.user);
                }

            }, 0);

        } else {

            showLoginScreen();

        }

    }
);


/* =========================================================
   11. NAVEGACIÓN ENTRE MÓDULOS
========================================================= */

function showView(viewName) {

    if (!currentProfile) {
        return;
    }

    if (!canAccessView(viewName, currentProfile)) {
        if (isProvisionalProfile(currentProfile)) {
            alert(
                "Tu cuenta tiene acceso provisional.\n\n" +
                "Por ahora solo puedes utilizar el módulo Registrar mediciones. " +
                "Un administrador debe habilitar tu cuenta para acceder a los demás módulos."
            );
            if (viewName !== "mediciones") {
                showView("mediciones");
            }
        }
        return;
    }

    const allViews =
        document.querySelectorAll(".view");

    allViews.forEach(view => {

        view.classList.toggle(
            "active",
            view.id === viewName
        );

    });

    document.querySelectorAll(".nav-item").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.view === viewName
        );

    });

    const titles = {
        dashboard: "Panel principal",
        mediciones: "Registrar mediciones",
        historial: "Historial",
        reportes: "Informes y reportes",
        administracion: "Administración de técnicos"
    };

    pageTitle.textContent =
        titles[viewName] || "Baterias_Medicion";

    sidebar.classList.remove("open");

    if (viewName === "dashboard" && currentUser && isFullActiveProfile()) {
        loadDashboardData();
    }

    if (viewName === "historial" && isFullActiveProfile()) {
        initializeHistoryView();
    }

    if (viewName === "reportes" && isFullActiveProfile()) {
        initializeReportsView();
    }

    if (viewName === "administracion" && isAdminUser()) {
        loadTechnicians();
    }

}


navButtons.forEach(button => {

    button.addEventListener("click", () => {

        const viewName = button.dataset.view;

        showView(viewName);

    });

});


document.querySelectorAll("[data-go]").forEach(button => {

    button.addEventListener("click", () => {

        const viewName = button.dataset.go;

        showView(viewName);

    });

});


/* =========================================================
   12. MENÚ PARA DISPOSITIVOS MÓVILES
========================================================= */

if (mobileMenu) {

    mobileMenu.addEventListener("click", () => {
        sidebar.classList.toggle("open");
    });

}


/* =========================================================
   13. FECHA ACTUAL
========================================================= */

function getLocalDate() {

    const now = new Date();

    const year = now.getFullYear();

    const month = String(
        now.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        now.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;

}

dateInput.value = getLocalDate();


/* =========================================================
   14. CARGAR LÍNEAS DESDE SUPABASE
========================================================= */

async function loadLines() {

    lineSelect.innerHTML = "";

    lineSelect.add(
        new Option("Cargando líneas...", "")
    );

    lineSelect.disabled = true;

    stationSelect.innerHTML = "";

    stationSelect.add(
        new Option("Primero selecciona una línea", "")
    );

    stationSelect.disabled = true;

    try {

        const { data, error } =
            await supabaseClient
                .from("lineas")
                .select("id, codigo")
                .order("codigo", {
                    ascending: true
                });

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {

            lineSelect.innerHTML = "";

            lineSelect.add(
                new Option("No hay líneas registradas", "")
            );

            return;
        }

        lineSelect.innerHTML = "";

        lineSelect.add(
            new Option("Seleccionar línea", "")
        );

        data.forEach(linea => {

            lineSelect.add(
                new Option(
                    `Línea ${linea.codigo}`,
                    linea.id
                )
            );

        });

        lineSelect.disabled = false;

        console.log("Líneas cargadas:", data.length);

    } catch (error) {

        console.error("Error al cargar líneas:", error);

        lineSelect.innerHTML = "";

        lineSelect.add(
            new Option("Error al cargar líneas", "")
        );

        alert("No fue posible cargar las líneas desde Supabase.");

    }

}


/* =========================================================
   15. CARGAR ESTACIONES SEGÚN LA LÍNEA
========================================================= */

async function loadStations(lineId) {

    stationSelect.innerHTML = "";

    stationSelect.add(
        new Option("Cargando estaciones...", "")
    );

    stationSelect.disabled = true;

    if (!lineId) {

        stationSelect.innerHTML = "";

        stationSelect.add(
            new Option("Primero selecciona una línea", "")
        );

        return;
    }

    try {

        const { data, error } =
            await supabaseClient
                .from("estaciones")
                .select("id, nemonico, nombre, linea_id")
                .eq("linea_id", lineId)
                .eq("activa", true)
                .order("nombre", {
                    ascending: true
                });

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {

            stationSelect.innerHTML = "";

            stationSelect.add(
                new Option("No hay estaciones disponibles", "")
            );

            return;
        }

        stationSelect.innerHTML = "";

        stationSelect.add(
            new Option("Seleccionar estación", "")
        );

        data.forEach(estacion => {

            stationSelect.add(
                new Option(
                    `${estacion.nombre} (${estacion.nemonico})`,
                    estacion.id
                )
            );

        });

        stationSelect.disabled = false;

        console.log("Estaciones cargadas:", data.length);

    } catch (error) {

        console.error("Error al cargar estaciones:", error);

        stationSelect.innerHTML = "";

        stationSelect.add(
            new Option("Error al cargar estaciones", "")
        );

        alert("No fue posible cargar las estaciones.");

    }

}


lineSelect.addEventListener("change", () => {

    loadStations(lineSelect.value);

});


/* =========================================================
   16. GESTIÓN DE REEMPLAZOS
========================================================= */

const replacementRadios =
    document.querySelectorAll('input[name="replacement"]');

const replacementDetails =
    document.getElementById("replacementDetails");

const replacementCount =
    document.getElementById("replacementCount");


replacementRadios.forEach(radio => {

    radio.addEventListener("change", () => {

        const selectedRadio =
            document.querySelector(
                'input[name="replacement"]:checked'
            );

        if (!selectedRadio) {
            return;
        }

        const showDetails =
            selectedRadio.value === "si";

        replacementDetails.classList.toggle(
            "hidden",
            !showDetails
        );

        replacementCount.required = showDetails;

        if (!showDetails) {
            replacementCount.value = "";
        }

    });

});


/* =========================================================
   17. MENSAJES DEL FORMULARIO DE MEDICIONES
========================================================= */

let measurementSaveMessage = null;


function setupMeasurementMessages() {

    if (measurementSaveMessage) {
        return;
    }

    measurementSaveMessage =
        document.createElement("div");

    measurementSaveMessage.id =
        "measurementSaveMessage";

    measurementSaveMessage.className =
        "measurement-save-message";

    measurementSaveMessage.setAttribute(
        "role",
        "status"
    );

    measurementForm.insertBefore(
        measurementSaveMessage,
        measurementForm.firstChild
    );

}


function showMeasurementMessage(
    message,
    type = "info"
) {

    setupMeasurementMessages();

    measurementSaveMessage.textContent = message;

    measurementSaveMessage.className =
        `measurement-save-message ${type}`;

}


function clearMeasurementMessage() {

    if (!measurementSaveMessage) {
        return;
    }

    measurementSaveMessage.textContent = "";
    measurementSaveMessage.className =
        "measurement-save-message";

}


/* =========================================================
   18. OBTENER UBICACIÓN DEL ARMARIO
========================================================= */

function getCabinetLocation() {

    const inputs =
        measurementForm.querySelectorAll("input");

    for (const input of inputs) {

        const value = input.value.trim();

        if (
            value.toLowerCase().includes("armario de tracción")
        ) {
            return value;
        }

    }

    return "Armario de tracción - Local Técnico";

}


/* =========================================================
   19. RECOPILAR LAS CUATRO LECTURAS DE BATERÍAS
========================================================= */

function collectBatteryReadings() {

    const batteryRows =
        measurementForm.querySelectorAll(".battery-row");

    if (batteryRows.length !== 4) {

        throw new Error(
            "El formulario debe contener exactamente cuatro baterías."
        );

    }

    const batteries = [];

    batteryRows.forEach((row, index) => {

        const position =
            Number(row.dataset.battery || index + 1);

        const voltageInput =
            row.querySelector(".voltage");

        const resistanceInput =
            row.querySelector(".resistance");

        if (!voltageInput) {

            throw new Error(
                `No se encontró el campo de voltaje de la batería ${position}.`
            );

        }

        const voltageText =
            voltageInput.value.trim().replace(",", ".");

        const resistanceText =
            resistanceInput
                ? resistanceInput.value.trim().replace(",", ".")
                : "";

        if (voltageText === "") {

            throw new Error(
                `Debes ingresar el voltaje de la batería ${position}.`
            );

        }

        const voltage = Number(voltageText);

        if (!Number.isFinite(voltage) || voltage < 0) {

            throw new Error(
                `El voltaje de la batería ${position} no es válido.`
            );

        }

        let resistance = null;

        if (resistanceText !== "") {

            resistance = Number(resistanceText);

            if (
                !Number.isFinite(resistance) ||
                resistance < 0
            ) {

                throw new Error(
                    `La resistencia interna de la batería ${position} no es válida.`
                );

            }

        }

        batteries.push({

            posicion: position,

            voltaje: voltage,

            resistencia_interna: resistance,

            unidad_resistencia: null

        });

    });

    const positions =
        batteries.map(battery => battery.posicion);

    const validPositions =
        [1, 2, 3, 4];

    if (
        positions.length !== 4 ||
        new Set(positions).size !== 4 ||
        !validPositions.every(position =>
            positions.includes(position)
        )
    ) {

        throw new Error(
            "Las posiciones de las baterías deben ser 1, 2, 3 y 4."
        );

    }

    return batteries;

}


/* =========================================================
   20. RECOPILAR DATOS GENERALES DE LA MEDICIÓN
========================================================= */

function collectMeasurementData() {

    const selectedReplacement =
        document.querySelector(
            'input[name="replacement"]:checked'
        );

    if (!selectedReplacement) {

        throw new Error(
            "Debes indicar si se realizó un reemplazo."
        );

    }

    const replacementDone =
        selectedReplacement.value === "si";

    let replacementQuantity = 0;

    if (replacementDone) {

        replacementQuantity =
            Number(replacementCount.value);

        if (
            !Number.isInteger(replacementQuantity) ||
            replacementQuantity < 1 ||
            replacementQuantity > 4
        ) {

            throw new Error(
                "La cantidad reemplazada debe estar entre 1 y 4."
            );

        }

    }

    const observations =
        document.getElementById("observations");

    return {

        p_fecha_medicion: dateInput.value,

        p_linea_id: lineSelect.value,

        p_estacion_id: stationSelect.value,

        p_ubicacion_armario: getCabinetLocation(),

        p_reemplazo_realizado: replacementDone,

        p_cantidad_reemplazada: replacementQuantity,

        p_observaciones: observations
            ? observations.value.trim() || null
            : null,

        p_baterias: collectBatteryReadings()

    };

}


/* =========================================================
   21. VALIDAR DATOS ANTES DEL ENVÍO
========================================================= */

function validateMeasurementData(payload) {

    if (!currentUser || !currentProfile) {

        throw new Error(
            "Debes iniciar sesión para registrar mediciones."
        );

    }

    if (!currentProfile.activo && !isProvisionalProfile(currentProfile)) {

        throw new Error(
            "Tu cuenta no se encuentra activa."
        );

    }

    if (!payload.p_fecha_medicion) {

        throw new Error(
            "Debes indicar la fecha de medición."
        );

    }

    if (!payload.p_linea_id) {

        throw new Error(
            "Debes seleccionar una línea."
        );

    }

    if (!payload.p_estacion_id) {

        throw new Error(
            "Debes seleccionar una estación."
        );

    }

    if (!payload.p_baterias || payload.p_baterias.length !== 4) {

        throw new Error(
            "Debes ingresar las cuatro lecturas de baterías."
        );

    }

}


/* =========================================================
   22. GUARDAR MEDICIÓN MEDIANTE FUNCIÓN RPC
========================================================= */

async function saveMeasurement(payload) {

    const { data, error } =
        await supabaseClient.rpc(
            "registrar_medicion_completa",
            payload
        );

    if (error) {

        console.error(
            "Error de Supabase al guardar medición:",
            error
        );

        throw new Error(
            translateMeasurementError(error)
        );

    }

    if (!data || data.success !== true) {

        throw new Error(
            data?.message ||
            "No fue posible confirmar el registro de la medición."
        );

    }

    return data;

}


/* =========================================================
   23. TRADUCIR ERRORES DE BASE DE DATOS
========================================================= */

function translateMeasurementError(error) {

    const message =
        String(error.message || "").toLowerCase();

    if (
        !navigator.onLine ||
        message.includes("failed to fetch") ||
        message.includes("networkerror") ||
        message.includes("load failed")
    ) {
        return "Sin conexión a internet. Tus datos siguen en el formulario; verifica tu red e intenta guardar nuevamente.";
    }

    if (
        message.includes("deb es iniciar") ||
        message.includes("debes iniciar sesión")
    ) {
        return "Tu sesión no es válida. Inicia sesión nuevamente.";
    }

    return error.message ||
        "Ocurrió un error al guardar la medición.";

}


/* =========================================================
   24. ESTADO DEL BOTÓN DE GUARDADO
========================================================= */

function setMeasurementSaving(isSaving) {

    const submitButton =
        measurementForm.querySelector(
            'button[type="submit"], input[type="submit"]'
        );

    if (!submitButton) {
        return;
    }

    if (isSaving) {

        submitButton.dataset.originalText =
            submitButton.tagName === "INPUT"
                ? submitButton.value
                : submitButton.textContent;

        submitButton.disabled = true;

        if (submitButton.tagName === "INPUT") {
            submitButton.value = "Guardando medición...";
        } else {
            submitButton.textContent = "Guardando medición...";
        }

    } else {

        submitButton.disabled = false;

        const originalText =
            submitButton.dataset.originalText ||
            "Guardar medición";

        if (submitButton.tagName === "INPUT") {
            submitButton.value = originalText;
        } else {
            submitButton.textContent = originalText;
        }

    }

}


/* =========================================================
   25. GUARDAR MEDICIÓN
========================================================= */

measurementForm.addEventListener("submit", async event => {

    event.preventDefault();

    if (!measurementForm.reportValidity()) {
        return;
    }

    if (!currentUser || !currentProfile) {

        showMeasurementMessage(
            "Debes iniciar sesión para continuar.",
            "error"
        );

        showLoginScreen();

        return;
    }

    if (!lineSelect.value || !stationSelect.value) {

        showMeasurementMessage(
            "Debes seleccionar una línea y una estación.",
            "error"
        );

        return;
    }

    if (stationSelect.disabled) {

        showMeasurementMessage(
            "La estación seleccionada no está disponible.",
            "error"
        );

        return;
    }

    setMeasurementSaving(true);

    showMeasurementMessage(
        "Validando y guardando la medición...",
        "info"
    );

    try {

        const payload =
            collectMeasurementData();

        validateMeasurementData(payload);

        console.log(
            "Datos preparados para guardar:",
            payload
        );

        const result =
            await saveMeasurement(payload);

        console.log(
            "Medición guardada:",
            result
        );

        const measurementId =
            result.medicion_id;

        measurementForm.reset();

        showMeasurementMessage(
            `${result.message} Identificador: ${measurementId}`,
            "success"
        );

    } catch (error) {

        console.error(
            "Error al registrar medición:",
            error
        );

        showMeasurementMessage(
            error.message ||
            "No fue posible guardar la medición.",
            "error"
        );

    } finally {

        setMeasurementSaving(false);

    }

});


/* =========================================================
   26. CREAR MÓDULO DE ADMINISTRACIÓN
========================================================= */

let adminView = null;
let adminTechnicianList = null;
let adminCreateForm = null;
let adminCreateMessage = null;


function setupAdminModule() {

    if (!isAdminUser(currentProfile)) {

        const existingButton =
            document.getElementById("adminNavButton");

        if (existingButton) {
            existingButton.remove();
        }

        if (adminView) {
            adminView.remove();
            adminView = null;
        }

        return;
    }

    if (document.getElementById("adminNavButton")) {
        loadTechnicians();
        return;
    }

    const adminNavButton =
        document.createElement("button");

    adminNavButton.type = "button";
    adminNavButton.id = "adminNavButton";
    adminNavButton.className = "nav-item";
    adminNavButton.dataset.view = "administracion";

    adminNavButton.innerHTML = `
        <span class="nav-icon">👥</span>
        <span>Administración</span>
    `;

    adminNavButton.addEventListener("click", () => {

        if (!canAccessView("administracion")) {
            return;
        }

        showView("administracion");
        loadTechnicians();

    });

    const navContainer =
        sidebar.querySelector(".sidebar-nav") ||
        sidebar.querySelector("nav") ||
        sidebar;

    navContainer.appendChild(adminNavButton);

    adminView = document.createElement("section");

    adminView.id = "administracion";
    adminView.className = "view";

    adminView.innerHTML = `

        <div class="admin-container">

            <h2>Administración de técnicos</h2>

            <p class="admin-description">
                Gestiona las cuentas de acceso del personal
                autorizado, habilita técnicos provisionales o
                da de baja / elimina técnicos conservando su historial.
            </p>

            <div class="admin-grid">

                <div class="admin-card">

                    <h3>Registrar nuevo técnico</h3>

                    <p class="admin-card-description">
                        Crea una cuenta de acceso y su perfil
                        en el sistema. El rol se asignará
                        automáticamente como técnico.
                    </p>

                    <form id="adminCreateForm" class="admin-form">

                        <div class="admin-field">
                            <label for="newTechNames">Nombres</label>
                            <input
                                id="newTechNames"
                                type="text"
                                maxlength="100"
                                placeholder="Nombres del técnico"
                                required
                            >
                        </div>

                        <div class="admin-field">
                            <label for="newTechLastNames">Apellidos</label>
                            <input
                                id="newTechLastNames"
                                type="text"
                                maxlength="100"
                                placeholder="Apellidos del técnico"
                                required
                            >
                        </div>

                        <div class="admin-field">
                            <label for="newTechEmail">Correo electrónico</label>
                            <input
                                id="newTechEmail"
                                type="email"
                                placeholder="tecnico@metro.cl"
                                required
                            >
                        </div>

                        <div class="admin-field">
                            <label for="newTechPassword">Contraseña inicial</label>
                            <input
                                id="newTechPassword"
                                type="password"
                                minlength="10"
                                autocomplete="new-password"
                                placeholder="Mínimo 10 caracteres"
                                required
                            >
                        </div>

                        <button
                            id="adminCreateButton"
                            type="submit"
                            class="admin-primary-button"
                        >
                            Crear técnico
                        </button>

                        <p
                            id="adminCreateMessage"
                            class="admin-status-message"
                            role="status"
                        ></p>

                    </form>

                </div>

                <div class="admin-card">

                    <h3>Control de acceso</h3>

                    <p class="admin-card-description">
                        Los técnicos registrados de forma autónoma inician en
                        estado provisional hasta que un administrador los habilite.
                    </p>

                    <p style="
                        color:#555;
                        font-size:13px;
                        line-height:1.7;
                    ">
                        <strong>Provisional:</strong>
                        solo puede registrar mediciones.
                        <br><br>
                        <strong>Activo:</strong>
                        accede a panel principal, mediciones, historial e informes.
                        <br><br>
                        <strong>Inactivo / Eliminado:</strong>
                        no puede iniciar sesión; sus registros históricos se conservan.
                    </p>

                </div>

            </div>

            <div class="admin-card">

                <div class="admin-list-header">

                    <h3>Técnicos registrados</h3>

                    <button
                        id="refreshTechnicians"
                        type="button"
                        class="admin-secondary-button"
                    >
                        Actualizar lista
                    </button>

                </div>

                <div
                    id="adminTechnicianList"
                    class="admin-technician-list"
                >
                    <div class="admin-loading">
                        Cargando técnicos...
                    </div>
                </div>

            </div>

        </div>

    `;

    const firstView =
        document.querySelector(".view");

    const viewContainer =
        firstView?.parentElement || appContainer;

    viewContainer.appendChild(adminView);

    adminTechnicianList =
        document.getElementById("adminTechnicianList");

    adminCreateForm =
        document.getElementById("adminCreateForm");

    adminCreateMessage =
        document.getElementById("adminCreateMessage");

    adminCreateForm.addEventListener(
        "submit",
        createTechnician
    );

    document
        .getElementById("refreshTechnicians")
        .addEventListener("click", loadTechnicians);

    loadTechnicians();

}


/* =========================================================
   27. MENSAJES DE ADMINISTRACIÓN
========================================================= */

function showAdminMessage(
    element,
    message,
    isError = false
) {

    if (!element) {
        return;
    }

    element.textContent = message;

    element.className =
        "admin-status-message " +
        (
            isError
                ? "admin-status-error"
                : "admin-status-success"
        );

}


/* =========================================================
   28. INVOCAR EDGE FUNCTION
========================================================= */

async function invokeAdminFunction(payload) {

    if (!currentUser) {
        throw new Error("No existe una sesión activa.");
    }

    const { data, error } =
        await supabaseClient.functions.invoke(
            ADMIN_FUNCTION_NAME,
            {
                body: payload
            }
        );

    if (error) {

        let serverMessage = error.message;

        try {

            if (
                error.context &&
                typeof error.context.json === "function"
            ) {

                const responseBody =
                    await error.context.json();

                if (responseBody?.message) {
                    serverMessage = responseBody.message;
                }

            }

        } catch (parseError) {

            console.warn(
                "No se pudo leer el detalle del error.",
                parseError
            );

        }

        throw new Error(
            serverMessage ||
            "No fue posible completar la operación."
        );

    }

    if (!data || data.success !== true) {

        throw new Error(
            data?.message ||
            "La operación no fue completada."
        );

    }

    return data;

}


/* =========================================================
   29. CREAR TÉCNICO
========================================================= */

async function createTechnician(event) {

    event.preventDefault();

    if (!isAdminUser()) {

        alert("No tienes permisos para crear técnicos.");

        return;
    }

    const names =
        document.getElementById("newTechNames");

    const lastNames =
        document.getElementById("newTechLastNames");

    const email =
        document.getElementById("newTechEmail");

    const password =
        document.getElementById("newTechPassword");

    const button =
        document.getElementById("adminCreateButton");

    const nombres = names.value.trim();
    const apellidos = lastNames.value.trim();
    const correo = email.value.trim().toLowerCase();

    if (!nombres || !apellidos || !correo || !password.value) {

        showAdminMessage(
            adminCreateMessage,
            "Completa todos los campos.",
            true
        );

        return;
    }

    if (password.value.length < 10) {

        showAdminMessage(
            adminCreateMessage,
            "La contraseña debe tener al menos 10 caracteres.",
            true
        );

        return;
    }

    button.disabled = true;
    button.textContent = "Creando técnico...";

    showAdminMessage(
        adminCreateMessage,
        "Procesando solicitud..."
    );

    try {

        const result = await invokeAdminFunction({

            accion: "crear",

            nombres,
            apellidos,
            correo,
            password: password.value

        });

        adminCreateForm.reset();

        showAdminMessage(
            adminCreateMessage,
            result.message || "Técnico creado correctamente."
        );

        await loadTechnicians();

    } catch (error) {

        console.error("Error al crear técnico:", error);

        showAdminMessage(
            adminCreateMessage,
            error.message,
            true
        );

    } finally {

        button.disabled = false;
        button.textContent = "Crear técnico";

    }

}


/* =========================================================
   30. CARGAR LISTADO DE TÉCNICOS
========================================================= */

async function loadTechnicians() {

    if (
        !isAdminUser() ||
        !adminTechnicianList
    ) {
        return;
    }

    adminTechnicianList.innerHTML = `
        <div class="admin-loading">
            Consultando técnicos...
        </div>
    `;

    try {

        const { data, error } =
            await supabaseClient
                .from("tecnicos")
                .select("id, nombres, apellidos, correo, rol, activo, estado_acceso")
                .order("apellidos", {
                    ascending: true
                });

        if (error) {
            throw error;
        }

        adminTechnicianList.innerHTML = "";

        if (!data || data.length === 0) {

            adminTechnicianList.innerHTML = `
                <div class="admin-empty-message">
                    No hay técnicos registrados.
                </div>
            `;

            return;
        }

        const sorted = [...data].sort((a, b) => {
            const aProv = a.estado_acceso === "provisional" && !a.activo ? 0 : 1;
            const bProv = b.estado_acceso === "provisional" && !b.activo ? 0 : 1;
            if (aProv !== bProv) return aProv - bProv;
            return String(a.apellidos || "").localeCompare(String(b.apellidos || ""), "es");
        });

        sorted.forEach(technician => {

            adminTechnicianList.appendChild(
                createTechnicianRow(technician)
            );

        });

        console.log("Técnicos cargados:", data.length);

    } catch (error) {

        console.error("Error al cargar técnicos:", error);

        adminTechnicianList.innerHTML = "";

        const errorMessage =
            document.createElement("div");

        errorMessage.className =
            "admin-empty-message";

        errorMessage.textContent =
            "No fue posible cargar los técnicos: " +
            error.message;

        adminTechnicianList.appendChild(errorMessage);

    }

}


/* =========================================================
   31. CREAR ELEMENTO VISUAL DE TÉCNICO
========================================================= */

function createTechnicianRow(technician) {

    const isProvisional =
        technician.estado_acceso === "provisional" &&
        !technician.activo;

    const isDeleted =
        technician.estado_acceso === "eliminado" &&
        !technician.activo;

    const row = document.createElement("div");

    row.className =
        "admin-technician-row" +
        (isProvisional ? " is-provisional" : "");

    const dataContainer =
        document.createElement("div");

    dataContainer.className =
        "admin-technician-data";

    const name = document.createElement("div");

    name.className = "admin-technician-name";

    name.textContent =
        `${technician.nombres} ${technician.apellidos}`;

    const email = document.createElement("div");

    email.className = "admin-technician-email";

    email.textContent = technician.correo;

    const meta = document.createElement("div");

    meta.className = "admin-technician-meta";

    const status = document.createElement("span");

    if (isProvisional) {
        status.className =
            "admin-status-pill admin-status-provisional";
        status.textContent = "PROVISIONAL";
    } else if (technician.activo) {
        status.className =
            "admin-status-pill admin-status-active";
        status.textContent = "ACTIVO";
    } else if (isDeleted) {
        status.className =
            "admin-status-pill admin-status-inactive";
        status.textContent = "ELIMINADO";
    } else {
        status.className =
            "admin-status-pill admin-status-inactive";
        status.textContent = "INACTIVO";
    }

    const role = document.createElement("span");

    role.className =
        "admin-status-pill admin-role-pill";

    role.textContent =
        technician.rol === "administrador"
            ? "ADMINISTRADOR"
            : "TÉCNICO";

    meta.appendChild(status);
    meta.appendChild(role);

    dataContainer.appendChild(name);
    dataContainer.appendChild(email);
    dataContainer.appendChild(meta);

    row.appendChild(dataContainer);

    const actions = document.createElement("div");

    actions.className = "admin-row-actions";

    const canManage =
        technician.rol === "tecnico" &&
        technician.id !== currentUser?.id;

    if (canManage) {

        if (isProvisional) {
            const enableButton =
                document.createElement("button");

            enableButton.type = "button";
            enableButton.className =
                "admin-action-button admin-action-enable";
            enableButton.textContent = "Habilitar acceso";

            enableButton.addEventListener("click", () => {
                enableProvisionalTechnician(technician);
            });

            actions.appendChild(enableButton);
        } else {
            const actionButton =
                document.createElement("button");

            actionButton.type = "button";

            actionButton.className =
                "admin-action-button " +
                (
                    technician.activo
                        ? "admin-action-danger"
                        : "admin-action-success"
                );

            actionButton.textContent =
                technician.activo
                    ? "Desactivar"
                    : "Reactivar";

            actionButton.addEventListener("click", () => {

                if (technician.activo) {
                    deactivateTechnician(technician);
                } else {
                    reactivateTechnician(technician);
                }

            });

            actions.appendChild(actionButton);
        }

        if (!isDeleted) {
            const deleteButton =
                document.createElement("button");

            deleteButton.type = "button";
            deleteButton.className =
                "admin-action-button admin-action-delete";
            deleteButton.textContent = "Eliminar";

            deleteButton.addEventListener("click", () => {
                deleteTechnicianRecord(technician);
            });

            actions.appendChild(deleteButton);
        }

    }

    row.appendChild(actions);

    return row;

}


/* =========================================================
   32. HABILITAR, DESACTIVAR, REACTIVAR Y ELIMINAR TÉCNICO
========================================================= */

async function enableProvisionalTechnician(technician) {

    if (!isAdminUser()) {
        return;
    }

    const confirmed = confirm(
        `¿Deseas habilitar el acceso completo a ${technician.nombres} ` +
        `${technician.apellidos}?\n\n` +
        "El técnico pasará de estado provisional a activo y podrá " +
        "acceder a Panel principal, Historial e Informes."
    );

    if (!confirmed) {
        return;
    }

    try {

        const { data, error } = await supabaseClient.rpc(
            "activar_tecnico_provisional",
            {
                p_tecnico_id: technician.id
            }
        );

        if (error) {
            throw error;
        }

        alert(
            data?.message ||
            "Técnico habilitado correctamente."
        );

        await loadTechnicians();

    } catch (error) {

        console.error("Error al habilitar técnico provisional:", error);

        alert(
            "No fue posible habilitar al técnico.\n\n" +
            error.message
        );

    }

}

async function deactivateTechnician(technician) {

    if (!isAdminUser()) {
        return;
    }

    const confirmed = confirm(

        `¿Deseas desactivar a ${technician.nombres} ` +
        `${technician.apellidos}?\n\n` +

        "El técnico perderá el acceso al sistema, " +
        "pero sus registros se conservarán."

    );

    if (!confirmed) {
        return;
    }

    try {

        const result = await invokeAdminFunction({

            accion: "desactivar",

            tecnico_id: technician.id

        });

        alert(
            result.message ||
            "Técnico desactivado correctamente."
        );

        await loadTechnicians();

    } catch (error) {

        console.error("Error al desactivar técnico:", error);

        alert(
            "No fue posible desactivar al técnico.\n\n" +
            error.message
        );

    }

}


async function reactivateTechnician(technician) {

    if (!isAdminUser()) {
        return;
    }

    const confirmed = confirm(

        `¿Deseas reactivar a ${technician.nombres} ` +
        `${technician.apellidos}?\n\n` +

        "El técnico podrá volver a iniciar sesión."

    );

    if (!confirmed) {
        return;
    }

    try {

        const result = await invokeAdminFunction({

            accion: "reactivar",

            tecnico_id: technician.id

        });

        alert(
            result.message ||
            "Técnico reactivado correctamente."
        );

        await loadTechnicians();

    } catch (error) {

        console.error("Error al reactivar técnico:", error);

        alert(
            "No fue posible reactivar al técnico.\n\n" +
            error.message
        );

    }

}


async function deleteTechnicianRecord(technician) {

    if (!isAdminUser()) {
        alert("Solo un administrador puede eliminar técnicos.");
        return;
    }

    if (!technician?.id || technician.id === currentUser?.id) {
        alert("No es posible eliminar este registro.");
        return;
    }

    const confirmed = confirm(
        `¿Seguro que deseas ELIMINAR al técnico ${technician.nombres} ` +
        `${technician.apellidos} (${technician.correo})?\n\n` +
        "Se revocará su acceso activo (activo = false, estado_acceso = 'eliminado') " +
        "y se conservarán sus mediciones y auditorías históricas."
    );

    if (!confirmed) {
        return;
    }

    try {

        let handledByFunction = false;

        try {
            const fnResult = await invokeAdminFunction({
                accion: "eliminar",
                tecnico_id: technician.id
            });
            handledByFunction = true;
            alert(fnResult.message || "Técnico eliminado correctamente.");
        } catch (fnError) {
            const msg = String(fnError?.message || "").toLowerCase();
            if (
                msg.includes("not found") ||
                msg.includes("404") ||
                msg.includes("acción") ||
                msg.includes("accion") ||
                msg.includes("no soportada") ||
                msg.includes("unsupported")
            ) {
                const { error: updateError } = await supabaseClient
                    .from("tecnicos")
                    .update({
                        activo: false,
                        estado_acceso: "eliminado"
                    })
                    .eq("id", technician.id);

                if (updateError) {
                    throw updateError;
                }

                handledByFunction = true;
                alert("Técnico eliminado correctamente.");
            } else {
                throw fnError;
            }
        }

        if (handledByFunction) {
            await loadTechnicians();
        }

    } catch (error) {

        console.error("Error al eliminar técnico:", error);

        alert(
            "No fue posible eliminar al técnico.\n\n" +
            error.message
        );

    }

}


/* =========================================================
   34. ETAPA 9 + ETAPA 12 - HISTORIAL Y EDICIÓN/ELIMINACIÓN
========================================================= */

let historyContainer = null;
let historyElements = {};
let historyLoaded = false;
let historyLoading = false;
let editModalBackdrop = null;
let editingRecord = null;


const historyStyles = document.createElement("style");

historyStyles.textContent = `

    .history-container {
        width: 100%;
        max-width: 1200px;
        margin: 0 auto;
        padding: 10px 0 30px;
        box-sizing: border-box;
    }

    .history-description {
        color: #777;
        font-size: 13px;
        line-height: 1.6;
        margin: 5px 0 22px;
    }

    .history-filters {
        background: #FFFFFF;
        border: 1px solid #E6E6E6;
        border-radius: 12px;
        padding: 22px;
        margin-bottom: 20px;
        box-shadow: 0 3px 12px rgba(0,0,0,0.04);
    }

    .history-filters h3 {
        color: #76121D;
        font-size: 16px;
        margin: 0 0 17px;
    }

    .history-filter-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
    }

    .history-field {
        display: flex;
        flex-direction: column;
        gap: 7px;
        min-width: 0;
    }

    .history-field label {
        font-size: 12px;
        font-weight: 600;
        color: #444;
    }

    .history-field input,
    .history-field select,
    .history-field textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 11px 12px;
        border: 1px solid #D8D8D8;
        border-radius: 8px;
        font-size: 13px;
        background: white;
        font-family: inherit;
    }

    .history-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 18px;
    }

    .history-primary-button {
        border: none;
        background: linear-gradient(110deg, #76121D, #D71920);
        color: white;
        padding: 11px 16px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }

    .history-secondary-button {
        border: 1px solid #D71920;
        background: white;
        color: #D71920;
        padding: 10px 14px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }

    .history-danger-button {
        border: 1px solid #B42318;
        background: #FFF5F5;
        color: #B42318;
        padding: 8px 12px;
        border-radius: 7px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
    }

    .history-danger-button:hover {
        background: #FCEBED;
    }

    .history-edit-button {
        border: 1px solid #76121D;
        background: #FFF8F9;
        color: #76121D;
        padding: 8px 12px;
        border-radius: 7px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
    }

    .history-edit-button:hover {
        background: #FCEBED;
    }

    .history-primary-button:disabled,
    .history-secondary-button:disabled,
    .history-danger-button:disabled,
    .history-edit-button:disabled {
        opacity: 0.6;
        cursor: wait;
    }

    .history-results-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 15px;
    }

    .history-results-header h3 {
        color: #76121D;
        font-size: 16px;
        margin: 0;
    }

    .history-status {
        color: #777;
        font-size: 12px;
        margin-top: 5px;
    }

    .history-list {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .history-card {
        background: white;
        border: 1px solid #E6E6E6;
        border-radius: 11px;
        padding: 18px;
        box-shadow: 0 3px 12px rgba(0,0,0,0.035);
    }

    .history-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 14px;
    }

    .history-station-name {
        color: #76121D;
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 5px;
    }

    .history-date {
        color: #777;
        font-size: 12px;
    }

    .history-meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 15px;
    }

    .history-meta-item {
        background: #F8F8F8;
        padding: 10px;
        border-radius: 7px;
        min-width: 0;
    }

    .history-meta-label {
        color: #888;
        font-size: 10px;
        display: block;
        margin-bottom: 5px;
    }

    .history-meta-value {
        color: #333;
        font-size: 12px;
        font-weight: 600;
        overflow-wrap: anywhere;
    }

    .history-battery-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 9px;
        margin-bottom: 14px;
    }

    .history-battery-item {
        border: 1px solid #EEEEEE;
        border-radius: 8px;
        padding: 11px;
        text-align: center;
    }

    .history-battery-title {
        color: #76121D;
        font-size: 11px;
        font-weight: 700;
        margin-bottom: 8px;
    }

    .history-battery-value {
        color: #333;
        font-size: 13px;
        font-weight: 700;
    }

    .history-battery-label {
        color: #888;
        font-size: 10px;
        margin-top: 5px;
    }

    .history-replacement {
        display: inline-block;
        padding: 5px 9px;
        border-radius: 20px;
        font-size: 10px;
        font-weight: 700;
    }

    .history-replacement-yes {
        color: #A32121;
        background: #FCEBED;
    }

    .history-replacement-no {
        color: #176B36;
        background: #E8F5EC;
    }

    .history-card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
    }

    .history-admin-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .history-detail {
        border-top: 1px solid #EEEEEE;
        margin-top: 15px;
        padding-top: 15px;
    }

    .history-detail[hidden] {
        display: none !important;
    }

    .history-detail h4 {
        color: #76121D;
        font-size: 13px;
        margin: 0 0 10px;
    }

    .history-detail p {
        color: #555;
        font-size: 12px;
        line-height: 1.6;
        margin: 5px 0;
        overflow-wrap: anywhere;
    }

    .history-detail-button {
        border: 1px solid #D71920;
        background: white;
        color: #D71920;
        padding: 8px 12px;
        border-radius: 7px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
    }

    .history-empty {
        padding: 30px 20px;
        text-align: center;
        color: #777;
        font-size: 13px;
        background: #FAFAFA;
        border-radius: 9px;
    }

    /* Modal de edición de medición (Etapa 12) */

    .edit-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(18, 24, 32, 0.56);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        z-index: 999;
    }

    .edit-modal-card {
        width: 100%;
        max-width: 720px;
        max-height: 90vh;
        overflow-y: auto;
        background: #FFFFFF;
        border-radius: 14px;
        padding: 24px;
        box-shadow: 0 18px 45px rgba(0,0,0,0.22);
        border: 1px solid #E5E7EB;
        box-sizing: border-box;
    }

    .edit-modal-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #ECEEF0;
    }

    .edit-modal-head h3 {
        margin: 0;
        color: #76121D;
        font-size: 18px;
    }

    .edit-modal-head p {
        margin: 4px 0 0;
        font-size: 12px;
        color: #68707A;
    }

    .edit-modal-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }

    .edit-modal-batteries {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
    }

    .edit-bat-box {
        border: 1px solid #E6E6E6;
        border-radius: 9px;
        padding: 12px;
        background: #FAFAFA;
    }

    .edit-bat-box h4 {
        margin: 0 0 10px;
        font-size: 12px;
        color: #76121D;
    }

    .edit-bat-fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .edit-modal-message {
        min-height: 18px;
        font-size: 12px;
        color: #B42318;
        margin-top: 12px;
    }

    .edit-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid #ECEEF0;
    }

    @media (max-width: 850px) {

        .history-filter-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .history-battery-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

    }

    @media (max-width: 600px) {

        .edit-modal-grid,
        .edit-modal-batteries {
            grid-template-columns: 1fr;
        }

        .history-filter-grid {
            grid-template-columns: 1fr;
        }

        .history-meta {
            grid-template-columns: 1fr;
        }

        .history-card {
            padding: 14px;
        }

        .history-results-header {
            align-items: flex-start;
            flex-direction: column;
        }

        .history-actions button {
            flex: 1;
        }

    }

`;

document.head.appendChild(historyStyles);


function setupHistoryModule() {

    if (!canAccessView("historial")) {
        return;
    }

    if (historyContainer) {
        return;
    }

    const historyView =
        document.getElementById("historial");

    if (!historyView) {

        console.error(
            "No se encontró la vista HTML con id historial."
        );

        return;
    }

    historyContainer = document.createElement("div");

    historyContainer.className = "history-container";

    historyContainer.innerHTML = `

        <div class="history-filters">

            <h3>Filtros de búsqueda</h3>

            <div class="history-filter-grid">

                <div class="history-field">
                    <label for="historyLine">Línea</label>
                    <select id="historyLine">
                        <option value="">Todas las líneas</option>
                    </select>
                </div>

                <div class="history-field">
                    <label for="historyStation">Estación</label>
                    <select id="historyStation" disabled>
                        <option value="">Todas las estaciones</option>
                    </select>
                </div>

                <div class="history-field">
                    <label for="historyDateFrom">Fecha desde</label>
                    <input
                        type="date"
                        id="historyDateFrom"
                    >
                </div>

                <div class="history-field">
                    <label for="historyDateTo">Fecha hasta</label>
                    <input
                        type="date"
                        id="historyDateTo"
                    >
                </div>

            </div>

            <div class="history-actions">

                <button
                    type="button"
                    id="historySearchButton"
                    class="history-primary-button"
                >
                    Buscar mediciones
                </button>

                <button
                    type="button"
                    id="historyClearButton"
                    class="history-secondary-button"
                >
                    Limpiar filtros
                </button>

            </div>

        </div>

        <div class="history-results-header">

            <div>
                <h3>Registros encontrados</h3>

                <div
                    id="historyStatus"
                    class="history-status"
                    role="status"
                >
                    Preparando historial...
                </div>
            </div>

            <button
                type="button"
                id="historyRefreshButton"
                class="history-secondary-button"
            >
                Actualizar
            </button>

        </div>

        <div
            id="historyList"
            class="history-list"
        ></div>

    `;

    historyView.appendChild(historyContainer);

    historyElements = {

        line: document.getElementById("historyLine"),

        station: document.getElementById("historyStation"),

        dateFrom: document.getElementById("historyDateFrom"),

        dateTo: document.getElementById("historyDateTo"),

        searchButton: document.getElementById("historySearchButton"),

        clearButton: document.getElementById("historyClearButton"),

        refreshButton: document.getElementById("historyRefreshButton"),

        status: document.getElementById("historyStatus"),

        list: document.getElementById("historyList")

    };


    historyElements.line.addEventListener(
        "change",
        async () => {

            await loadHistoryStations(
                historyElements.line.value
            );

            await loadHistory();

        }
    );

    historyElements.station.addEventListener(
        "change",
        loadHistory
    );

    historyElements.searchButton.addEventListener(
        "click",
        loadHistory
    );

    historyElements.refreshButton.addEventListener(
        "click",
        loadHistory
    );

    historyElements.clearButton.addEventListener(
        "click",
        clearHistoryFilters
    );


    loadHistoryLines();

}


async function loadHistoryLines() {

    const select = historyElements.line;

    select.innerHTML = "";

    select.add(
        new Option("Todas las líneas", "")
    );

    try {

        const { data, error } =
            await supabaseClient
                .from("lineas")
                .select("id, codigo")
                .order("codigo");

        if (error) {
            throw error;
        }

        data.forEach(linea => {

            select.add(
                new Option(
                    `Línea ${linea.codigo}`,
                    linea.id
                )
            );

        });

    } catch (error) {

        console.error(
            "Error al cargar líneas del historial:",
            error
        );

        historyElements.status.textContent =
            "No fue posible cargar las líneas.";

    }

}


async function loadHistoryStations(lineId) {

    const select = historyElements.station;

    select.innerHTML = "";

    select.add(
        new Option(
            lineId
                ? "Todas las estaciones"
                : "Selecciona una línea",
            ""
        )
    );

    select.disabled = !lineId;

    if (!lineId) {
        return;
    }

    try {

        const { data, error } =
            await supabaseClient
                .from("estaciones")
                .select("id, nemonico, nombre")
                .eq("linea_id", lineId)
                .eq("activa", true)
                .order("nombre");

        if (error) {
            throw error;
        }

        data.forEach(estacion => {

            select.add(
                new Option(
                    `${estacion.nombre} (${estacion.nemonico})`,
                    estacion.id
                )
            );

        });

        select.disabled = false;

    } catch (error) {

        console.error(
            "Error al cargar estaciones del historial:",
            error
        );

        select.innerHTML = "";

        select.add(
            new Option("Error al cargar estaciones", "")
        );

    }

}


async function loadHistory() {

    if (!currentUser || !canAccessView("historial")) {

        if (historyElements.status) {
            historyElements.status.textContent =
                "No tienes permisos activos para consultar el historial.";
        }

        return;
    }

    if (historyLoading) {
        return;
    }

    const dateFrom =
        historyElements.dateFrom.value || null;

    const dateTo =
        historyElements.dateTo.value || null;

    if (dateFrom && dateTo && dateFrom > dateTo) {

        historyElements.status.textContent =
            "La fecha inicial no puede ser posterior a la fecha final.";

        return;
    }

    historyLoading = true;

    historyElements.searchButton.disabled = true;
    historyElements.refreshButton.disabled = true;

    historyElements.status.textContent =
        "Consultando mediciones...";

    historyElements.list.innerHTML = `
        <div class="history-empty">
            Consultando información...
        </div>
    `;

    try {

        const { data, error } =
            await supabaseClient.rpc(
                "consultar_historial_mediciones",
                {

                    p_linea_id:
                        historyElements.line.value || null,

                    p_estacion_id:
                        historyElements.station.value || null,

                    p_fecha_desde: dateFrom,

                    p_fecha_hasta: dateTo

                }
            );

        if (error) {
            throw error;
        }

        const records =
            Array.isArray(data) ? data : [];

        renderHistory(records);

        historyLoaded = true;

    } catch (error) {

        console.error(
            "Error al consultar historial:",
            error
        );

        historyElements.list.innerHTML = "";

        const message =
            document.createElement("div");

        message.className = "history-empty";

        message.textContent =
            "No fue posible consultar el historial: " +
            error.message;

        historyElements.list.appendChild(message);

        historyElements.status.textContent =
            "Error al consultar registros.";

    } finally {

        historyLoading = false;

        historyElements.searchButton.disabled = false;
        historyElements.refreshButton.disabled = false;

    }

}


function renderHistory(records) {

    const list = historyElements.list;

    list.innerHTML = "";

    historyElements.status.textContent =
        `${records.length} registro(s) encontrado(s).`;

    if (records.length === 0) {

        const empty =
            document.createElement("div");

        empty.className = "history-empty";

        empty.textContent =
            "No se encontraron mediciones con los filtros seleccionados.";

        list.appendChild(empty);

        return;
    }

    if (records.length === 200) {

        historyElements.status.textContent +=
            " Se muestran los últimos 200 registros disponibles.";

    }

    records.forEach(record => {

        list.appendChild(
            createHistoryCard(record)
        );

    });

}


function createHistoryCard(record) {

    const card = document.createElement("article");

    card.className = "history-card";

    const header =
        document.createElement("div");

    header.className = "history-card-header";

    const stationInfo =
        document.createElement("div");

    const stationName =
        document.createElement("div");

    stationName.className = "history-station-name";

    stationName.textContent =
        `${record.estacion || "Estación sin nombre"} ` +
        `(${record.nemonico || "Sin nemónico"})`;

    const date =
        document.createElement("div");

    date.className = "history-date";

    date.textContent =
        `Fecha de medición: ${formatHistoryDate(record.fecha_medicion)}`;

    stationInfo.appendChild(stationName);
    stationInfo.appendChild(date);

    header.appendChild(stationInfo);

    const replacement =
        document.createElement("span");

    replacement.className =
        "history-replacement " +
        (
            record.reemplazo_realizado
                ? "history-replacement-yes"
                : "history-replacement-no"
        );

    replacement.textContent =
        record.reemplazo_realizado
            ? `REEMPLAZO: ${record.cantidad_reemplazada}`
            : "SIN REEMPLAZO";

    header.appendChild(replacement);

    card.appendChild(header);


    const meta =
        document.createElement("div");

    meta.className = "history-meta";

    addHistoryMeta(
        meta,
        "Línea",
        record.linea || "-"
    );

    addHistoryMeta(
        meta,
        "Técnico",
        record.tecnico || "-"
    );

    addHistoryMeta(
        meta,
        "Baterías registradas",
        String(record.baterias?.length || 0)
    );

    card.appendChild(meta);


    const batteryGrid =
        document.createElement("div");

    batteryGrid.className =
        "history-battery-grid";

    const batteries =
        Array.isArray(record.baterias)
            ? record.baterias
            : [];

    batteries.forEach(battery => {

        const item =
            document.createElement("div");

        item.className =
            "history-battery-item";

        const title =
            document.createElement("div");

        title.className =
            "history-battery-title";

        title.textContent =
            `Batería ${battery.posicion}`;

        const voltage =
            document.createElement("div");

        voltage.className =
            "history-battery-value";

        voltage.textContent =
            `${battery.voltaje} V`;

        const voltageLabel =
            document.createElement("div");

        voltageLabel.className =
            "history-battery-label";

        voltageLabel.textContent = "Voltaje";

        item.appendChild(title);
        item.appendChild(voltage);
        item.appendChild(voltageLabel);

        batteryGrid.appendChild(item);

    });

    card.appendChild(batteryGrid);


    const footer =
        document.createElement("div");

    footer.className = "history-card-footer";

    const detailButton =
        document.createElement("button");

    detailButton.type = "button";

    detailButton.className =
        "history-detail-button";

    detailButton.textContent =
        "Ver detalle";

    const detail =
        document.createElement("div");

    detail.className = "history-detail";
    detail.hidden = true;

    detail.appendChild(
        createHistoryDetail(record)
    );

    detailButton.addEventListener("click", () => {

        detail.hidden = !detail.hidden;

        detailButton.textContent =
            detail.hidden
                ? "Ver detalle"
                : "Ocultar detalle";

    });

    footer.appendChild(detailButton);

    if (isAdminUser() && record.id) {
        const adminActions = document.createElement("div");
        adminActions.className = "history-admin-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "history-edit-button";
        editButton.textContent = "Editar";
        editButton.addEventListener("click", () => openEditMeasurementModal(record));

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "history-danger-button";
        deleteButton.textContent = "Eliminar";
        deleteButton.addEventListener("click", () => deleteMeasurementRecord(record));

        adminActions.append(editButton, deleteButton);
        footer.appendChild(adminActions);
    }

    card.appendChild(footer);
    card.appendChild(detail);

    return card;

}


/* =========================================================
   34.1. MODAL DE EDICIÓN Y ELIMINACIÓN (ETAPA 12)
========================================================= */

function ensureEditModal() {
    if (editModalBackdrop) return;

    editModalBackdrop = document.createElement("div");
    editModalBackdrop.className = "edit-modal-backdrop";
    editModalBackdrop.hidden = true;

    editModalBackdrop.innerHTML = `
        <div class="edit-modal-card" role="dialog" aria-modal="true" aria-labelledby="editModalTitle">
            <div class="edit-modal-head">
                <div>
                    <h3 id="editModalTitle">Editar medición</h3>
                    <p id="editModalSubtitle">Los cambios quedan registrados en la auditoría de administración.</p>
                </div>
                <button type="button" id="editModalClose" class="history-secondary-button">Cerrar</button>
            </div>

            <form id="editMeasurementForm">
                <div class="edit-modal-grid">
                    <div class="history-field">
                        <label for="editDate">Fecha de medición</label>
                        <input type="date" id="editDate" required>
                    </div>
                    <div class="history-field">
                        <label for="editCabinet">Ubicación del armario</label>
                        <input type="text" id="editCabinet" maxlength="160" required>
                    </div>
                    <div class="history-field">
                        <label for="editLine">Línea</label>
                        <select id="editLine" required></select>
                    </div>
                    <div class="history-field">
                        <label for="editStation">Estación</label>
                        <select id="editStation" required></select>
                    </div>
                    <div class="history-field">
                        <label for="editReplacementDone">¿Reemplazo realizado?</label>
                        <select id="editReplacementDone">
                            <option value="false">No</option>
                            <option value="true">Sí</option>
                        </select>
                    </div>
                    <div class="history-field">
                        <label for="editReplacementCount">Cantidad reemplazada (1 a 4)</label>
                        <input type="number" id="editReplacementCount" min="0" max="4" step="1" value="0">
                    </div>
                </div>

                <div class="history-field" style="margin-top:12px">
                    <label for="editObservations">Observaciones</label>
                    <textarea id="editObservations" rows="2" maxlength="1000"></textarea>
                </div>

                <div class="edit-modal-batteries" id="editBatteriesGrid"></div>

                <div id="editModalMessage" class="edit-modal-message" role="status"></div>

                <div class="edit-modal-footer">
                    <button type="button" id="editModalCancel" class="history-secondary-button">Cancelar</button>
                    <button type="submit" id="editModalSave" class="history-primary-button">Guardar cambios</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(editModalBackdrop);

    const closeBtn = document.getElementById("editModalClose");
    const cancelBtn = document.getElementById("editModalCancel");
    const lineEl = document.getElementById("editLine");
    const repDoneEl = document.getElementById("editReplacementDone");
    const repCountEl = document.getElementById("editReplacementCount");
    const formEl = document.getElementById("editMeasurementForm");

    closeBtn.addEventListener("click", closeEditModal);
    cancelBtn.addEventListener("click", closeEditModal);
    editModalBackdrop.addEventListener("click", event => {
        if (event.target === editModalBackdrop) {
            closeEditModal();
        }
    });

    lineEl.addEventListener("change", async () => {
        await populateModalStations(lineEl.value, "");
    });

    repDoneEl.addEventListener("change", () => {
        const active = repDoneEl.value === "true";
        repCountEl.disabled = !active;
        if (!active) {
            repCountEl.value = "0";
        } else if (Number(repCountEl.value) < 1) {
            repCountEl.value = "1";
        }
    });

    formEl.addEventListener("submit", submitEditMeasurement);
}

function closeEditModal() {
    if (!editModalBackdrop) return;
    editModalBackdrop.hidden = true;
    editingRecord = null;
}

async function populateModalLines(selectedLineId) {
    const lineEl = document.getElementById("editLine");
    lineEl.innerHTML = "";

    const { data, error } = await supabaseClient
        .from("lineas")
        .select("id, codigo")
        .order("codigo", { ascending: true });

    if (error) throw error;

    (data || []).forEach(linea => {
        const opt = new Option(`Línea ${linea.codigo}`, linea.id);
        lineEl.add(opt);
    });

    if (selectedLineId) {
        lineEl.value = selectedLineId;
    }
}

async function populateModalStations(lineId, selectedStationId) {
    const stationEl = document.getElementById("editStation");
    stationEl.innerHTML = "";

    if (!lineId) {
        stationEl.add(new Option("Selecciona una línea", ""));
        stationEl.disabled = true;
        return;
    }

    const { data, error } = await supabaseClient
        .from("estaciones")
        .select("id, nemonico, nombre")
        .eq("linea_id", lineId)
        .eq("activa", true)
        .order("nombre", { ascending: true });

    if (error) throw error;

    (data || []).forEach(est => {
        stationEl.add(new Option(`${est.nombre} (${est.nemonico})`, est.id));
    });

    stationEl.disabled = false;
    if (selectedStationId) {
        stationEl.value = selectedStationId;
    }
}

async function openEditMeasurementModal(record) {
    if (!isAdminUser()) {
        alert("Solo un administrador puede editar mediciones.");
        return;
    }

    ensureEditModal();
    editingRecord = record;

    const msgEl = document.getElementById("editModalMessage");
    msgEl.textContent = "";

    document.getElementById("editModalSubtitle").textContent =
        `Registro del ${formatHistoryDate(record.fecha_medicion)} · Técnico: ${record.tecnico || "-"}`;

    document.getElementById("editDate").value = record.fecha_medicion || getLocalDate();
    document.getElementById("editCabinet").value = record.ubicacion_armario || "Armario de tracción - Local Técnico";

    const repDone = Boolean(record.reemplazo_realizado);
    const repDoneEl = document.getElementById("editReplacementDone");
    const repCountEl = document.getElementById("editReplacementCount");
    repDoneEl.value = String(repDone);
    repCountEl.disabled = !repDone;
    repCountEl.value = repDone ? String(record.cantidad_reemplazada || 1) : "0";

    document.getElementById("editObservations").value = record.observaciones || "";

    const batGrid = document.getElementById("editBatteriesGrid");
    batGrid.innerHTML = "";

    const existingBats = Array.isArray(record.baterias) ? record.baterias : [];

    for (let pos = 1; pos <= 4; pos++) {
        const found = existingBats.find(b => Number(b.posicion) === pos) || {};
        const box = document.createElement("div");
        box.className = "edit-bat-box";
        box.innerHTML = `
            <h4>Batería ${pos}</h4>
            <div class="edit-bat-fields">
                <div class="history-field">
                    <label for="editVolt${pos}">Voltaje (V)</label>
                    <input
                        type="number"
                        id="editVolt${pos}"
                        data-pos="${pos}"
                        class="edit-bat-voltage"
                        step="any"
                        min="0"
                        value="${found.voltaje ?? ""}"
                        required
                    >
                </div>
                <div class="history-field">
                    <label for="editRes${pos}">Resistencia</label>
                    <input
                        type="number"
                        id="editRes${pos}"
                        data-pos="${pos}"
                        class="edit-bat-resistance"
                        step="any"
                        min="0"
                        value="${found.resistencia_interna ?? ""}"
                    >
                </div>
            </div>
        `;
        batGrid.appendChild(box);
    }

    editModalBackdrop.hidden = false;

    try {
        let resolvedLineId = record.linea_id || "";
        let resolvedStationId = record.estacion_id || "";

        if ((!resolvedLineId || !resolvedStationId) && record.id) {
            const { data: rawMed } = await supabaseClient
                .from("mediciones")
                .select("linea_id, estacion_id")
                .eq("id", record.id)
                .maybeSingle();

            if (rawMed) {
                resolvedLineId = resolvedLineId || rawMed.linea_id;
                resolvedStationId = resolvedStationId || rawMed.estacion_id;
            }
        }

        await populateModalLines(resolvedLineId);
        await populateModalStations(document.getElementById("editLine").value, resolvedStationId);
    } catch (error) {
        console.error("Error al cargar catálogos para edición:", error);
        msgEl.textContent = "No fue posible cargar líneas o estaciones.";
    }
}

async function submitEditMeasurement(event) {
    event.preventDefault();
    if (!editingRecord || !isAdminUser()) return;

    const saveBtn = document.getElementById("editModalSave");
    const msgEl = document.getElementById("editModalMessage");
    msgEl.textContent = "";

    const fecha = document.getElementById("editDate").value;
    const lineaId = document.getElementById("editLine").value;
    const estacionId = document.getElementById("editStation").value;
    const ubicacion = document.getElementById("editCabinet").value.trim();
    const reemplazoDone = document.getElementById("editReplacementDone").value === "true";
    const cantidadReemplazada = reemplazoDone ? Number(document.getElementById("editReplacementCount").value) : 0;
    const observaciones = document.getElementById("editObservations").value.trim() || null;

    if (!fecha || !lineaId || !estacionId) {
        msgEl.textContent = "Completa fecha, línea y estación.";
        return;
    }

    if (reemplazoDone && (!Number.isInteger(cantidadReemplazada) || cantidadReemplazada < 1 || cantidadReemplazada > 4)) {
        msgEl.textContent = "La cantidad reemplazada debe ser un entero entre 1 y 4.";
        return;
    }

    const baterias = [];
    for (let pos = 1; pos <= 4; pos++) {
        const vInput = document.getElementById(`editVolt${pos}`);
        const rInput = document.getElementById(`editRes${pos}`);
        const vRaw = String(vInput.value || "").trim().replace(",", ".");
        const rRaw = String(rInput.value || "").trim().replace(",", ".");

        const voltaje = Number(vRaw);
        if (vRaw === "" || !Number.isFinite(voltaje) || voltaje < 0) {
            msgEl.textContent = `El voltaje de la batería ${pos} no es válido.`;
            return;
        }

        let resistencia = null;
        if (rRaw !== "") {
            resistencia = Number(rRaw);
            if (!Number.isFinite(resistencia) || resistencia < 0) {
                msgEl.textContent = `La resistencia interna de la batería ${pos} no es válida.`;
                return;
            }
        }

        baterias.push({
            posicion: pos,
            voltaje,
            resistencia_interna: resistencia,
            unidad_resistencia: null
        });
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Guardando...";

    try {
        const { data, error } = await supabaseClient.rpc("editar_medicion_completa", {
            p_medicion_id: editingRecord.id,
            p_fecha_medicion: fecha,
            p_linea_id: lineaId,
            p_estacion_id: estacionId,
            p_ubicacion_armario: ubicacion,
            p_reemplazo_realizado: reemplazoDone,
            p_cantidad_reemplazada: cantidadReemplazada,
            p_observaciones: observaciones,
            p_baterias: baterias
        });

        if (error) throw error;
        if (!data || data.success !== true) {
            throw new Error(data?.message || "No fue posible guardar los cambios.");
        }

        closeEditModal();
        await loadHistory();
        if (isFullActiveProfile()) {
            await loadDashboardData();
            if (reportsInitialized) {
                await loadReports();
            }
        }
        alert(data.message || "Medición actualizada correctamente.");
    } catch (error) {
        console.error("Error al editar medición:", error);
        msgEl.textContent = error.message || "No fue posible editar la medición.";
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Guardar cambios";
    }
}

async function deleteMeasurementRecord(record) {
    if (!isAdminUser() || !record?.id) {
        alert("Solo un administrador puede eliminar mediciones.");
        return;
    }

    const confirmed = confirm(
        `¿Seguro que deseas ELIMINAR esta medición?\n\n` +
        `Estación: ${record.estacion || "-"} (${record.nemonico || "-"})\n` +
        `Fecha: ${formatHistoryDate(record.fecha_medicion)}\n` +
        `Técnico: ${record.tecnico || "-"}\n\n` +
        "El registro original quedará respaldado en la auditoría antes de eliminarse."
    );

    if (!confirmed) return;

    try {
        const { data, error } = await supabaseClient.rpc("eliminar_medicion_completa", {
            p_medicion_id: record.id
        });

        if (error) throw error;
        if (!data || data.success !== true) {
            throw new Error(data?.message || "No fue posible eliminar la medición.");
        }

        await loadHistory();
        if (isFullActiveProfile()) {
            await loadDashboardData();
            if (reportsInitialized) {
                await loadReports();
            }
        }
        alert(data.message || "Medición eliminada correctamente.");
    } catch (error) {
        console.error("Error al eliminar medición:", error);
        alert("No fue posible eliminar la medición.\n\n" + error.message);
    }
}


function addHistoryMeta(container, label, value) {

    const item =
        document.createElement("div");

    item.className = "history-meta-item";

    const labelElement =
        document.createElement("span");

    labelElement.className =
        "history-meta-label";

    labelElement.textContent = label;

    const valueElement =
        document.createElement("span");

    valueElement.className =
        "history-meta-value";

    valueElement.textContent = value;

    item.appendChild(labelElement);
    item.appendChild(valueElement);

    container.appendChild(item);

}


function createHistoryDetail(record) {

    const container =
        document.createElement("div");

    const title =
        document.createElement("h4");

    title.textContent =
        "Detalle de la medición";

    container.appendChild(title);

    addHistoryDetailLine(
        container,
        "Ubicación del armario",
        record.ubicacion_armario || "-"
    );

    addHistoryDetailLine(
        container,
        "Reemplazo realizado",
        record.reemplazo_realizado ? "Sí" : "No"
    );

    addHistoryDetailLine(
        container,
        "Cantidad reemplazada",
        String(record.cantidad_reemplazada ?? 0)
    );

    addHistoryDetailLine(
        container,
        "Observaciones",
        record.observaciones || "Sin observaciones"
    );

    addHistoryDetailLine(
        container,
        "Fecha de creación",
        formatHistoryDateTime(record.created_at)
    );


    const batteryTitle =
        document.createElement("h4");

    batteryTitle.textContent =
        "Detalle de lecturas";

    batteryTitle.style.marginTop = "18px";

    container.appendChild(batteryTitle);

    const batteries =
        Array.isArray(record.baterias)
            ? record.baterias
            : [];

    batteries.forEach(battery => {

        const resistance =
            battery.resistencia_interna === null ||
            battery.resistencia_interna === undefined
                ? "No informada"
                : `${battery.resistencia_interna}` +
                  (
                      battery.unidad_resistencia
                          ? ` ${battery.unidad_resistencia}`
                          : ""
                  );

        addHistoryDetailLine(
            container,
            `Batería ${battery.posicion}`,
            `Voltaje: ${battery.voltaje} V | ` +
            `Resistencia interna: ${resistance}`
        );

    });

    return container;

}


function addHistoryDetailLine(container, label, value) {

    const paragraph =
        document.createElement("p");

    const strong =
        document.createElement("strong");

    strong.textContent = `${label}: `;

    paragraph.appendChild(strong);

    paragraph.appendChild(
        document.createTextNode(value)
    );

    container.appendChild(paragraph);

}


function formatHistoryDate(dateValue) {

    if (!dateValue) {
        return "Fecha no disponible";
    }

    const parts = String(dateValue).split("-");

    if (parts.length !== 3) {
        return dateValue;
    }

    return `${parts[2]}/${parts[1]}/${parts[0]}`;

}


function formatHistoryDateTime(dateValue) {

    if (!dateValue) {
        return "No disponible";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return String(dateValue);
    }

    return date.toLocaleString("es-CL");

}


async function clearHistoryFilters() {

    historyElements.line.value = "";

    historyElements.station.innerHTML = "";

    historyElements.station.add(
        new Option("Selecciona una línea", "")
    );

    historyElements.station.disabled = true;

    historyElements.dateFrom.value = "";
    historyElements.dateTo.value = "";

    await loadHistory();

}


function initializeHistoryView() {

    if (!canAccessView("historial")) {
        return;
    }

    if (!historyContainer) {
        setupHistoryModule();
    }

    if (!historyLoaded) {
        loadHistory();
    }

}


/* =========================================================
   35. MÓDULO DE DASHBOARD E INDICADORES REALES
========================================================= */

let dashboardStyles = null;

function setupDashboardStyles() {
    if (dashboardStyles) return;

    dashboardStyles = document.createElement("style");
    dashboardStyles.textContent = `
        .dashboard-activity-list { display:flex; flex-direction:column; gap:0; }
        .dashboard-activity-item { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:13px 0; border-bottom:1px solid #eceef0; }
        .dashboard-activity-item:last-child { border-bottom:0; }
        .dashboard-activity-main { min-width:0; }
        .dashboard-activity-station { color:#292d32; font-size:13px; font-weight:700; }
        .dashboard-activity-meta { color:#737a83; font-size:11px; margin-top:4px; }
        .dashboard-activity-tag { flex:0 0 auto; padding:5px 8px; border-radius:20px; font-size:10px; font-weight:700; background:#f1f2f4; color:#59616b; }
        .dashboard-activity-tag.replacement { background:#fcebed; color:#76121D; }
        .dashboard-activity-message { padding:20px; text-align:center; color:#737a83; font-size:12px; }
        @media(max-width:600px) { .dashboard-activity-item { align-items:flex-start; } .dashboard-activity-tag { white-space:nowrap; } }
    `;
    document.head.appendChild(dashboardStyles);
}

async function loadDashboardData() {
    if (!currentUser || !canAccessView("dashboard") || dashboardLoading) return;

    const dashboard = document.getElementById("dashboard");
    if (!dashboard) return;

    dashboardLoading = true;
    setupDashboardStyles();

    const statCards = dashboard.querySelectorAll(".stats-grid .stat-card");
    const activityPanel = dashboard.querySelector(".dashboard-grid .panel:first-child .empty-state");

    try {
        const { data, error } = await supabaseClient.rpc("consultar_reportes_mediciones", {
            p_fecha_desde: null,
            p_fecha_hasta: null,
            p_linea_id: null,
            p_estacion_id: null
        });
        if (error) throw error;
        if (!data || typeof data !== "object") {
            throw new Error("La respuesta de indicadores no tiene el formato esperado.");
        }

        const indicators = data.indicadores || {};
        const stationCount = Array.isArray(data.por_estacion) ? data.por_estacion.length : 0;
        const values = [
            indicators.total_mediciones ?? 0,
            indicators.total_baterias ?? 0,
            indicators.baterias_reemplazadas ?? 0,
            stationCount
        ];
        const notes = [
            "Total histórico",
            "Lecturas registradas",
            "Unidades informadas",
            "Con mediciones"
        ];

        statCards.forEach((card, index) => {
            const value = card.querySelector("strong");
            const note = card.querySelector("small");
            if (value && values[index] !== undefined) {
                value.textContent = Number(values[index]).toLocaleString("es-CL");
            }
            if (note && notes[index]) note.textContent = notes[index];
        });

    } catch (error) {
        console.error("Error al cargar indicadores del dashboard:", error);
        statCards.forEach(card => {
            const value = card.querySelector("strong");
            if (value) value.textContent = "—";
        });
    }

    try {
        const { data, error } = await supabaseClient.rpc("consultar_historial_mediciones", {
            p_linea_id: null,
            p_estacion_id: null,
            p_fecha_desde: null,
            p_fecha_hasta: null
        });
        if (error) throw error;

        const records = Array.isArray(data) ? data.slice(0, 5) : [];
        renderDashboardActivity(records, activityPanel);

    } catch (error) {
        console.error("Error al cargar actividad reciente del dashboard:", error);
        renderDashboardActivity([], activityPanel,
            "No fue posible cargar la actividad reciente. Puedes consultar el historial.");
    } finally {
        dashboardLoading = false;
    }
}

function renderDashboardActivity(records, container, message = "") {
    if (!container) return;
    container.innerHTML = "";

    if (message || !records.length) {
        const text = document.createElement("div");
        text.className = "dashboard-activity-message";
        text.textContent = message || "Todavía no hay mediciones registradas.";
        container.appendChild(text);
        return;
    }

    const list = document.createElement("div");
    list.className = "dashboard-activity-list";

    records.forEach(record => {
        const item = document.createElement("div");
        item.className = "dashboard-activity-item";

        const main = document.createElement("div");
        main.className = "dashboard-activity-main";

        const station = document.createElement("div");
        station.className = "dashboard-activity-station";
        station.textContent = `${record.estacion || "Estación sin nombre"} (${record.nemonico || "—"})`;

        const meta = document.createElement("div");
        meta.className = "dashboard-activity-meta";
        meta.textContent = `${record.linea || "Línea —"} · ${formatHistoryDate(record.fecha_medicion)} · ${record.tecnico || "Técnico no informado"}`;

        main.append(station, meta);

        const tag = document.createElement("span");
        tag.className = "dashboard-activity-tag" + (record.reemplazo_realizado ? " replacement" : "");
        tag.textContent = record.reemplazo_realizado
            ? `Reemplazo: ${record.cantidad_reemplazada ?? 0}`
            : "Sin reemplazo";

        item.append(main, tag);
        list.appendChild(item);
    });

    container.appendChild(list);
}


/* =========================================================
   36. MÓDULO DE INFORMES Y ESTADÍSTICAS (v0.9.1)
========================================================= */

let reportsContainer = null;
let reportsInitialized = false;
let reportsLoading = false;
let reportsElements = {};

const reportsStyles = document.createElement("style");
reportsStyles.textContent = `
    .reports-container { display:flex; flex-direction:column; gap:20px; }
    .reports-description { color:#68707a; font-size:13px; margin-top:-12px; }
    .reports-panel { background:#fff; border:1px solid #e7e7e7; border-radius:12px; padding:20px; box-shadow:0 3px 12px rgba(22,43,69,0.035); }
    .reports-panel-head { display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:16px; }
    .reports-panel h3 { margin:0; font-size:15px; color:#76121D; }
    .reports-panel-sub { margin:4px 0 0; font-size:12px; color:#707780; }
    .reports-filter-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; align-items:end; }
    .reports-field { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .reports-field label { font-size:12px; font-weight:600; color:#43566c; }
    .reports-field input,.reports-field select { width:100%; min-height:40px; border:1px solid #d9dce1; border-radius:7px; padding:8px 10px; background:#fff; color:#24364a; font-size:13px; }
    .reports-field input:focus,.reports-field select:focus { outline:none; border-color:#D71920; box-shadow:0 0 0 3px rgba(215,25,32,0.10); }
    .reports-actions { display:flex; gap:8px; flex-wrap:wrap; }
    .reports-button { border:0; border-radius:7px; padding:10px 16px; font-size:12px; font-weight:600; cursor:pointer; background:linear-gradient(110deg,#76121D,#D71920); color:#fff; }
    .reports-button:hover { filter:brightness(1.04); }
    .reports-button.secondary { background:#fff; color:#76121D; border:1px solid #D71920; }
    .reports-button.secondary:hover { background:#FCEBED; filter:none; }
    .reports-button:disabled { opacity:.55; cursor:wait; }
    .reports-status { color:#686f78; font-size:12px; min-height:17px; margin-top:12px; }
    .reports-active-filters { display:inline-flex; align-items:center; gap:6px; font-size:11px; color:#76121D; background:#FCEBED; border:1px solid #F3C6CB; border-radius:20px; padding:5px 10px; font-weight:600; }

    .reports-group-label { font-size:11px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; color:#76121D; margin:4px 0 10px; }
    .reports-kpi-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
    .reports-kpi-grid.secondary-kpis { grid-template-columns:repeat(3,minmax(0,1fr)); margin-top:12px; }
    .reports-kpi { background:#fff; border:1px solid #e7e7e7; border-left:4px solid #76121D; border-radius:11px; padding:16px; min-width:0; }
    .reports-kpi.accent-red { border-left-color:#D71920; }
    .reports-kpi.accent-soft { border-left-color:#A61C24; background:#FFFAFA; }
    .reports-kpi-label { font-size:11px; color:#64758a; font-weight:600; margin-bottom:8px; }
    .reports-kpi-value { font-size:24px; font-weight:700; color:#76121D; overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
    .reports-kpi-note { font-size:10px; color:#8190a2; margin-top:5px; }

    .reports-legend { display:flex; align-items:center; flex-wrap:wrap; gap:14px; font-size:11px; color:#43566c; }
    .reports-legend-item { display:inline-flex; align-items:center; gap:7px; font-weight:600; }
    .reports-swatch-voltage { width:16px; height:3px; border-radius:2px; background:#D71920; display:inline-block; }
    .reports-swatch-resistance { width:16px; height:0; border-top:3px dashed #76121D; display:inline-block; }
    .reports-swatch-rep-yes { width:10px; height:10px; border-radius:50%; background:#D71920; display:inline-block; }
    .reports-swatch-rep-no { width:10px; height:10px; border-radius:50%; background:#E5E8EC; border:1px solid #9AA5B1; display:inline-block; }

    .reports-chart-scroll { width:100%; overflow-x:auto; padding-bottom:6px; }
    .reports-chart-box { min-width:540px; }
    .reports-chart-svg { width:100%; height:265px; display:block; }
    .reports-axis-label { font-size:10.5px; fill:#64758a; font-weight:600; }
    .reports-month-tick { font-size:11px; fill:#24364a; font-weight:700; }
    .reports-val-voltage { font-size:10px; fill:#D71920; font-weight:700; }
    .reports-val-resistance { font-size:10px; fill:#76121D; font-weight:700; }

    .reports-monthly-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(235px,1fr)); gap:12px; margin-top:16px; }
    .reports-month-card { border:1px solid #eceef0; border-radius:10px; padding:13px; background:#fcfcfd; display:flex; flex-direction:column; gap:8px; }
    .reports-month-card.has-replacement { border-color:#F2C4C9; background:#FFF8F9; }
    .reports-month-card-top { display:flex; justify-content:space-between; align-items:center; gap:8px; }
    .reports-month-card-title { font-size:13px; font-weight:700; color:#76121D; }
    .reports-rep-badge { font-size:10px; font-weight:700; padding:3px 8px; border-radius:20px; white-space:nowrap; }
    .reports-rep-badge.yes { background:#FCEBED; color:#B5121B; border:1px solid #F2C4C9; }
    .reports-rep-badge.no { background:#F1F3F5; color:#52606D; border:1px solid #E4E7EB; }
    .reports-month-metrics { display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:11px; }
    .reports-metric-box { background:#fff; border:1px solid #eef0f2; border-radius:7px; padding:8px; }
    .reports-metric-box span { display:block; color:#737a83; font-size:10px; }
    .reports-metric-box strong { display:block; color:#24364a; font-size:12px; margin-top:2px; font-variant-numeric:tabular-nums; }
    .reports-month-rep-detail { font-size:11px; color:#52606D; padding-top:4px; border-top:1px dashed #e5e7eb; }

    .reports-two-columns { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .reports-table-wrap { overflow-x:auto; }
    .reports-table { width:100%; border-collapse:collapse; font-size:12px; }
    .reports-table th,.reports-table td { padding:10px 9px; border-bottom:1px solid #eceef0; text-align:left; white-space:nowrap; }
    .reports-table th { color:#76121D; font-weight:700; background:#FDF6F7; }
    .reports-empty { padding:22px; text-align:center; color:#777; background:#fafafa; border-radius:8px; font-size:12px; }

    @media(max-width:1000px) {
        .reports-kpi-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .reports-kpi-grid.secondary-kpis { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .reports-filter-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    }
    @media(max-width:650px) {
        .reports-kpi-grid,
        .reports-kpi-grid.secondary-kpis { grid-template-columns:1fr; }
        .reports-two-columns { grid-template-columns:1fr; }
        .reports-filter-grid { grid-template-columns:1fr; }
        .reports-panel { padding:14px; }
        .reports-monthly-cards { grid-template-columns:1fr; }
    }
`;
document.head.appendChild(reportsStyles);

function setupReportsModule() {
    if (!canAccessView("reportes")) return;
    if (reportsContainer) return;

    const reportsView = document.getElementById("reportes");
    if (!reportsView) {
        console.error("No se encontró la vista HTML con id reportes.");
        return;
    }

    reportsContainer = document.createElement("div");
    reportsContainer.className = "reports-container";
    reportsContainer.innerHTML = `
        <section class="reports-panel">
            <div class="reports-panel-head">
                <div>
                    <h3>Filtros de consulta</h3>
                    <p class="reports-panel-sub">Filtra por rango de fechas, línea o estación para sincronizar gráficos y reemplazos.</p>
                </div>
                <span class="reports-active-filters" id="reportsFilterSummary">Filtro general (sin restricciones)</span>
            </div>
            <div class="reports-filter-grid">
                <div class="reports-field"><label for="reportsDateFrom">Fecha desde</label><input id="reportsDateFrom" type="date"></div>
                <div class="reports-field"><label for="reportsDateTo">Fecha hasta</label><input id="reportsDateTo" type="date"></div>
                <div class="reports-field"><label for="reportsLine">Línea</label><select id="reportsLine"><option value="">Todas las líneas</option></select></div>
                <div class="reports-field"><label for="reportsStation">Estación</label><select id="reportsStation" disabled><option value="">Todas las estaciones</option></select></div>
            </div>
            <div class="reports-actions" style="margin-top:14px">
                <button type="button" class="reports-button" id="reportsSearch">Consultar informes</button>
                <button type="button" class="reports-button secondary" id="reportsClear">Limpiar filtros</button>
            </div>
            <div class="reports-status" id="reportsStatus" role="status">Selecciona los filtros y consulta los datos.</div>
        </section>

        <section class="reports-panel">
            <div class="reports-panel-head">
                <div>
                    <h3>Indicadores generales y de reemplazo</h3>
                    <p class="reports-panel-sub">Resumen consolidado según los filtros activos.</p>
                </div>
            </div>
            <div class="reports-group-label">Operación y lecturas</div>
            <div class="reports-kpi-grid" id="reportsKpis">
                <div class="reports-empty" style="grid-column:1/-1">Los indicadores aparecerán al consultar.</div>
            </div>
            <div class="reports-group-label" style="margin-top:18px">Trazabilidad de reemplazos</div>
            <div class="reports-kpi-grid secondary-kpis" id="reportsReplacementKpis">
                <div class="reports-empty" style="grid-column:1/-1">Los indicadores de reemplazo aparecerán al consultar.</div>
            </div>
        </section>

        <section class="reports-panel">
            <div class="reports-panel-head">
                <div>
                    <h3>Evolución mensual de voltaje, resistencia y reemplazos</h3>
                    <p class="reports-panel-sub">Comparativa mensual en eje horizontal con valores por mes y estado de reemplazos.</p>
                </div>
                <div class="reports-legend">
                    <span class="reports-legend-item"><i class="reports-swatch-voltage"></i>Voltaje promedio (V)</span>
                    <span class="reports-legend-item"><i class="reports-swatch-resistance"></i>Resistencia promedio</span>
                    <span class="reports-legend-item"><i class="reports-swatch-rep-yes"></i>Mes con reemplazos</span>
                    <span class="reports-legend-item"><i class="reports-swatch-rep-no"></i>Mes sin reemplazos</span>
                </div>
            </div>
            <div id="reportsMonthly"></div>
        </section>

        <div class="reports-two-columns">
            <section class="reports-panel">
                <div class="reports-panel-head"><div><h3>Mediciones y reemplazos por línea</h3></div></div>
                <div id="reportsByLine"></div>
            </section>
            <section class="reports-panel">
                <div class="reports-panel-head"><div><h3>Mediciones y reemplazos por estación</h3></div></div>
                <div id="reportsByStation"></div>
            </section>
        </div>

        <section class="reports-panel">
            <div class="reports-panel-head"><div><h3>Promedios por posición de batería</h3></div></div>
            <div id="reportsPosition"></div>
        </section>
    `;
    reportsView.appendChild(reportsContainer);

    reportsElements = {
        dateFrom: document.getElementById("reportsDateFrom"),
        dateTo: document.getElementById("reportsDateTo"),
        line: document.getElementById("reportsLine"),
        station: document.getElementById("reportsStation"),
        search: document.getElementById("reportsSearch"),
        clear: document.getElementById("reportsClear"),
        status: document.getElementById("reportsStatus"),
        filterSummary: document.getElementById("reportsFilterSummary"),
        kpis: document.getElementById("reportsKpis"),
        replacementKpis: document.getElementById("reportsReplacementKpis"),
        byLine: document.getElementById("reportsByLine"),
        byStation: document.getElementById("reportsByStation"),
        monthly: document.getElementById("reportsMonthly"),
        position: document.getElementById("reportsPosition")
    };

    reportsElements.line.addEventListener("change", () => {
        loadReportsStations(reportsElements.line.value);
    });
    reportsElements.search.addEventListener("click", loadReports);
    reportsElements.clear.addEventListener("click", clearReportsFilters);

    loadReportsLines();
}

async function loadReportsLines() {
    const select = reportsElements.line;
    select.innerHTML = "<option value=''>Todas las líneas</option>";
    try {
        const { data, error } = await supabaseClient
            .from("lineas").select("id, codigo").order("codigo");
        if (error) throw error;
        (data || []).forEach(linea => {
            select.add(new Option(`Línea ${linea.codigo}`, linea.id));
        });
    } catch (error) {
        console.error("Error al cargar líneas de informes:", error);
        reportsElements.status.textContent = "No fue posible cargar las líneas.";
    }
}

async function loadReportsStations(lineId) {
    const select = reportsElements.station;
    select.innerHTML = "";
    select.add(new Option(lineId ? "Todas las estaciones de la línea" : "Todas las estaciones", ""));
    select.disabled = true;
    try {
        let query = supabaseClient.from("estaciones")
            .select("id, nemonico, nombre").eq("activa", true).order("nombre");
        if (lineId) query = query.eq("linea_id", lineId);
        const { data, error } = await query;
        if (error) throw error;
        (data || []).forEach(estacion => {
            select.add(new Option(`${estacion.nombre} (${estacion.nemonico})`, estacion.id));
        });
        select.disabled = false;
    } catch (error) {
        console.error("Error al cargar estaciones de informes:", error);
        select.add(new Option("Error al cargar estaciones", ""));
    }
}

function updateReportsFilterBadge() {
    if (!reportsElements.filterSummary) return;
    const parts = [];
    if (reportsElements.line.value) {
        const lineText = reportsElements.line.options[reportsElements.line.selectedIndex]?.text || "Línea";
        parts.push(lineText);
    }
    if (reportsElements.station.value) {
        const stationText = reportsElements.station.options[reportsElements.station.selectedIndex]?.text || "Estación";
        parts.push(stationText);
    }
    if (reportsElements.dateFrom.value || reportsElements.dateTo.value) {
        const from = reportsElements.dateFrom.value ? formatReportDate(reportsElements.dateFrom.value) : "Inicio";
        const to = reportsElements.dateTo.value ? formatReportDate(reportsElements.dateTo.value) : "Hoy";
        parts.push(`${from} → ${to}`);
    }
    reportsElements.filterSummary.textContent = parts.length
        ? `Filtros activos: ${parts.join(" · ")}`
        : "Filtro general (sin restricciones)";
}

async function loadReports() {
    if (!currentUser || !canAccessView("reportes")) {
        if (reportsElements.status) {
            reportsElements.status.textContent = "No tienes permisos activos para consultar informes.";
        }
        return;
    }
    if (reportsLoading) return;

    const dateFrom = reportsElements.dateFrom.value || null;
    const dateTo = reportsElements.dateTo.value || null;
    if (dateFrom && dateTo && dateFrom > dateTo) {
        reportsElements.status.textContent = "La fecha inicial no puede ser posterior a la fecha final.";
        return;
    }

    reportsLoading = true;
    reportsElements.search.disabled = true;
    reportsElements.status.textContent = "Calculando indicadores e informes...";
    updateReportsFilterBadge();

    try {
        const { data, error } = await supabaseClient.rpc("consultar_reportes_mediciones", {
            p_fecha_desde: dateFrom,
            p_fecha_hasta: dateTo,
            p_linea_id: reportsElements.line.value || null,
            p_estacion_id: reportsElements.station.value || null
        });
        if (error) throw error;
        if (!data || typeof data !== "object") throw new Error("La respuesta del servidor no tiene el formato esperado.");
        renderReports(data);
        reportsInitialized = true;
        reportsElements.status.textContent = "Informes actualizados correctamente.";
    } catch (error) {
        console.error("Error al consultar informes:", error);
        reportsElements.status.textContent = `No fue posible consultar los informes: ${error.message}`;
    } finally {
        reportsLoading = false;
        reportsElements.search.disabled = false;
    }
}

function normalizeMonthlyRow(item) {
    const rawEvents =
        item.reemplazos ??
        item.eventos_reemplazo ??
        item.reemplazos_realizados ??
        item.total_reemplazos ??
        0;
    const rawBatteries =
        item.baterias_reemplazadas ??
        item.cantidad_reemplazada ??
        item.unidades_reemplazadas ??
        0;

    const events = Number(rawEvents) || 0;
    const batteries = Number(rawBatteries) || 0;
    const hasReplacement =
        typeof item.hubo_reemplazo === "boolean"
            ? item.hubo_reemplazo
            : typeof item.reemplazo_realizado === "boolean"
                ? item.reemplazo_realizado
                : events > 0 || batteries > 0;

    const voltageAvg =
        item.voltaje_promedio !== undefined && item.voltaje_promedio !== null
            ? Number(item.voltaje_promedio)
            : null;
    const resistanceAvg =
        item.resistencia_promedio !== undefined && item.resistencia_promedio !== null
            ? Number(item.resistencia_promedio)
            : null;

    return {
        mes: item.mes,
        mediciones: Number(item.mediciones) || 0,
        voltaje_promedio: Number.isFinite(voltageAvg) ? voltageAvg : null,
        resistencia_promedio: Number.isFinite(resistanceAvg) ? resistanceAvg : null,
        eventos_reemplazo: events,
        baterias_reemplazadas: batteries,
        hasReplacement
    };
}

function renderReports(data) {
    const k = data.indicadores || {};
    const monthlyRows = Array.isArray(data.evolucion_mensual)
        ? data.evolucion_mensual.map(normalizeMonthlyRow)
        : [];

    const monthsWithReplacement = monthlyRows.filter(m => m.hasReplacement).length;
    const monthsWithoutReplacement = Math.max(0, monthlyRows.length - monthsWithReplacement);

    const cards = [
        ["Total de mediciones", Number(k.total_mediciones ?? 0).toLocaleString("es-CL"), "Registros en el filtro", ""],
        ["Baterías medidas", Number(k.total_baterias ?? 0).toLocaleString("es-CL"), "Lecturas registradas", ""],
        ["Última medición", formatReportDate(k.ultima_medicion), "Fecha más reciente", ""],
        ["Meses evaluados", Number(monthlyRows.length).toLocaleString("es-CL"), `${monthsWithReplacement} con reemplazo · ${monthsWithoutReplacement} sin reemplazo`, ""]
    ];
    reportsElements.kpis.innerHTML = "";
    cards.forEach(([label, value, note, extraClass]) => {
        const card = document.createElement("div");
        card.className = `reports-kpi ${extraClass}`.trim();
        const l = document.createElement("div"); l.className = "reports-kpi-label"; l.textContent = label;
        const v = document.createElement("div"); v.className = "reports-kpi-value"; v.textContent = String(value);
        const n = document.createElement("div"); n.className = "reports-kpi-note"; n.textContent = note;
        card.append(l, v, n);
        reportsElements.kpis.appendChild(card);
    });

    const repCards = [
        [
            "Eventos de reemplazo",
            Number(k.reemplazos_realizados ?? 0).toLocaleString("es-CL"),
            "Intervenciones con cambio",
            "accent-red"
        ],
        [
            "Baterías reemplazadas",
            Number(k.baterias_reemplazadas ?? 0).toLocaleString("es-CL"),
            "Unidades reemplazadas en total",
            "accent-soft"
        ],
        [
            "Meses con / sin reemplazo",
            `${monthsWithReplacement} / ${monthsWithoutReplacement}`,
            monthlyRows.length
                ? `${monthsWithReplacement} con reemplazo · ${monthsWithoutReplacement} sin reemplazo`
                : "Sin meses en el rango",
            ""
        ]
    ];
    reportsElements.replacementKpis.innerHTML = "";
    repCards.forEach(([label, value, note, extraClass]) => {
        const card = document.createElement("div");
        card.className = `reports-kpi ${extraClass}`.trim();
        const l = document.createElement("div"); l.className = "reports-kpi-label"; l.textContent = label;
        const v = document.createElement("div"); v.className = "reports-kpi-value"; v.textContent = String(value);
        const n = document.createElement("div"); n.className = "reports-kpi-note"; n.textContent = note;
        card.append(l, v, n);
        reportsElements.replacementKpis.appendChild(card);
    });

    renderReportsTable(
        reportsElements.byLine,
        ["Línea", "Mediciones", "Reemplazos", "Bat. reemplazadas"],
        (data.por_linea || []).map(x => [
            x.linea,
            x.mediciones,
            x.reemplazos,
            x.baterias_reemplazadas
        ])
    );

    renderReportsTable(
        reportsElements.byStation,
        ["Línea", "Estación", "Nemónico", "Mediciones", "Reemplazos"],
        (data.por_estacion || []).map(x => [
            x.linea,
            x.estacion,
            x.nemonico,
            x.mediciones,
            x.reemplazos
        ])
    );

    renderReportsMonthly(monthlyRows);

    renderReportsTable(
        reportsElements.position,
        ["Posición", "Voltaje promedio (V)", "Resistencia promedio", "Lecturas"],
        (data.por_posicion || []).map(x => [
            x.posicion,
            formatReportNumber(x.voltaje_promedio),
            formatReportNumber(x.resistencia_promedio),
            x.lecturas
        ])
    );
}

function renderReportsTable(container, headers, rows) {
    container.innerHTML = "";
    if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "reports-empty";
        empty.textContent = "No hay datos para los filtros seleccionados.";
        container.appendChild(empty);
        return;
    }
    const wrap = document.createElement("div");
    wrap.className = "reports-table-wrap";
    const table = document.createElement("table");
    table.className = "reports-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headers.forEach(label => {
        const th = document.createElement("th");
        th.textContent = label;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach(row => {
        const tr = document.createElement("tr");
        row.forEach(value => {
            const td = document.createElement("td");
            td.textContent = value === null || value === undefined ? "—" : String(value);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
}

function renderReportsMonthly(rows) {
    const container = reportsElements.monthly;
    container.innerHTML = "";

    if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "reports-empty";
        empty.textContent = "No hay evolución mensual para los filtros seleccionados.";
        container.appendChild(empty);
        return;
    }

    const svgNS = "http://www.w3.org/2000/svg";
    const createSvgEl = (tag, attrs = {}) => {
        const el = document.createElementNS(svgNS, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
        return el;
    };

    const colWidth = 108;
    const margin = { top: 34, right: 28, bottom: 52, left: 48 };
    const plotWidth = Math.max(460, rows.length * colWidth);
    const width = margin.left + plotWidth + margin.right;
    const height = 265;
    const plotHeight = height - margin.top - margin.bottom;

    const voltages = rows.map(r => r.voltaje_promedio).filter(v => v !== null);
    const resistances = rows.map(r => r.resistencia_promedio).filter(v => v !== null);

    const vMin = voltages.length ? Math.min(...voltages) : 0;
    const vMax = voltages.length ? Math.max(...voltages) : 1;
    const vPad = Math.max(0.15, (vMax - vMin) * 0.25);
    const vLow = Math.max(0, vMin - vPad);
    const vHigh = vMax + vPad;

    const rMin = resistances.length ? Math.min(...resistances) : 0;
    const rMax = resistances.length ? Math.max(...resistances) : 1;
    const rPad = Math.max(1, (rMax - rMin) * 0.25);
    const rLow = Math.max(0, rMin - rPad);
    const rHigh = rMax + rPad;

    const getX = index => {
        if (rows.length === 1) return margin.left + plotWidth / 2;
        return margin.left + (index / (rows.length - 1)) * plotWidth;
    };

    const getVoltageY = val => {
        const span = Math.max(0.0001, vHigh - vLow);
        const ratio = (val - vLow) / span;
        return margin.top + plotHeight - ratio * plotHeight;
    };

    const getResistanceY = val => {
        const span = Math.max(0.0001, rHigh - rLow);
        const ratio = (val - rLow) / span;
        return margin.top + plotHeight - ratio * plotHeight;
    };

    const scrollBox = document.createElement("div");
    scrollBox.className = "reports-chart-scroll";

    const chartBox = document.createElement("div");
    chartBox.className = "reports-chart-box";
    chartBox.style.width = `${width}px`;

    const svg = createSvgEl("svg", {
        class: "reports-chart-svg",
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": "Gráfico de evolución mensual de voltaje promedio y resistencia promedio"
    });

    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
        const y = margin.top + (i / gridSteps) * plotHeight;
        svg.appendChild(createSvgEl("line", {
            x1: margin.left,
            y1: y,
            x2: margin.left + plotWidth,
            y2: y,
            stroke: i === gridSteps ? "#CBD2D9" : "#EEF2F6",
            "stroke-width": i === gridSteps ? "1.3" : "1"
        }));
    }

    const resistancePoints = rows
        .map((row, idx) => row.resistencia_promedio !== null
            ? { x: getX(idx), y: getResistanceY(row.resistencia_promedio), value: row.resistencia_promedio, row }
            : null)
        .filter(Boolean);

    if (resistancePoints.length > 1) {
        const dRes = resistancePoints
            .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
            .join(" ");
        svg.appendChild(createSvgEl("path", {
            d: dRes,
            fill: "none",
            stroke: "#76121D",
            "stroke-width": "2.2",
            "stroke-dasharray": "6 4"
        }));
    }

    const voltagePoints = rows
        .map((row, idx) => row.voltaje_promedio !== null
            ? { x: getX(idx), y: getVoltageY(row.voltaje_promedio), value: row.voltaje_promedio, row }
            : null)
        .filter(Boolean);

    if (voltagePoints.length > 1) {
        const dVolt = voltagePoints
            .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
            .join(" ");
        svg.appendChild(createSvgEl("path", {
            d: dVolt,
            fill: "none",
            stroke: "#D71920",
            "stroke-width": "2.8"
        }));
    }

    resistancePoints.forEach(pt => {
        svg.appendChild(createSvgEl("rect", {
            x: (pt.x - 4).toFixed(1),
            y: (pt.y - 4).toFixed(1),
            width: "8",
            height: "8",
            rx: "2",
            fill: "#76121D",
            stroke: "#FFFFFF",
            "stroke-width": "1.5"
        }));
        const label = createSvgEl("text", {
            x: pt.x.toFixed(1),
            y: Math.max(margin.top - 12, pt.y - 10).toFixed(1),
            "text-anchor": "middle",
            class: "reports-val-resistance"
        });
        label.textContent = `${formatReportNumber(pt.value)} Ω/mΩ`;
        svg.appendChild(label);
    });

    rows.forEach((row, idx) => {
        const x = getX(idx);

        const monthText = createSvgEl("text", {
            x: x.toFixed(1),
            y: (height - 24).toFixed(1),
            "text-anchor": "middle",
            class: "reports-month-tick"
        });
        monthText.textContent = formatReportMonth(row.mes);
        svg.appendChild(monthText);

        svg.appendChild(createSvgEl("circle", {
            cx: x.toFixed(1),
            cy: (height - 10).toFixed(1),
            r: "4.2",
            fill: row.hasReplacement ? "#D71920" : "#E5E8EC",
            stroke: row.hasReplacement ? "#76121D" : "#9AA5B1",
            "stroke-width": "1.2"
        }));
    });

    voltagePoints.forEach(pt => {
        svg.appendChild(createSvgEl("circle", {
            cx: pt.x.toFixed(1),
            cy: pt.y.toFixed(1),
            r: "5",
            fill: "#D71920",
            stroke: "#FFFFFF",
            "stroke-width": "2"
        }));
        const label = createSvgEl("text", {
            x: pt.x.toFixed(1),
            y: Math.max(margin.top - 2, pt.y + 16).toFixed(1),
            "text-anchor": "middle",
            class: "reports-val-voltage"
        });
        label.textContent = `${formatReportNumber(pt.value)} V`;
        svg.appendChild(label);
    });

    chartBox.appendChild(svg);
    scrollBox.appendChild(chartBox);
    container.appendChild(scrollBox);

    const cardsGrid = document.createElement("div");
    cardsGrid.className = "reports-monthly-cards";

    rows.forEach(row => {
        const card = document.createElement("div");
        card.className = "reports-month-card" + (row.hasReplacement ? " has-replacement" : "");

        const top = document.createElement("div");
        top.className = "reports-month-card-top";

        const title = document.createElement("span");
        title.className = "reports-month-card-title";
        title.textContent = formatReportMonth(row.mes);

        const badge = document.createElement("span");
        badge.className = "reports-rep-badge " + (row.hasReplacement ? "yes" : "no");
        badge.textContent = row.hasReplacement ? "Con reemplazos" : "Sin reemplazos";

        top.append(title, badge);

        const metrics = document.createElement("div");
        metrics.className = "reports-month-metrics";

        const vBox = document.createElement("div");
        vBox.className = "reports-metric-box";
        vBox.innerHTML = `<span>Voltaje prom.</span><strong>${formatReportNumber(row.voltaje_promedio)} V</strong>`;

        const rBox = document.createElement("div");
        rBox.className = "reports-metric-box";
        rBox.innerHTML = `<span>Resistencia prom.</span><strong>${formatReportNumber(row.resistencia_promedio)}</strong>`;

        metrics.append(vBox, rBox);

        const repDetail = document.createElement("div");
        repDetail.className = "reports-month-rep-detail";
        repDetail.textContent = row.hasReplacement
            ? `Eventos: ${row.eventos_reemplazo} · Bat. reemplazadas: ${row.baterias_reemplazadas} · Mediciones: ${row.mediciones}`
            : `0 reemplazos en el mes · Mediciones: ${row.mediciones}`;

        card.append(top, metrics, repDetail);
        cardsGrid.appendChild(card);
    });

    container.appendChild(cardsGrid);
}

function formatReportDate(value) {
    if (!value) return "—";
    const parts = String(value).split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value);
}

function formatReportMonth(value) {
    if (!value) return "—";
    const parts = String(value).split("-");
    if (parts.length < 2) return String(value);
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    return date.toLocaleDateString("es-CL", { month: "short", year: "numeric" });
}

function formatReportNumber(value) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("es-CL", { maximumFractionDigits: 3 }) : String(value);
}

async function clearReportsFilters() {
    reportsElements.dateFrom.value = "";
    reportsElements.dateTo.value = "";
    reportsElements.line.value = "";
    await loadReportsStations("");
    await loadReports();
}

function initializeReportsView() {
    if (!canAccessView("reportes")) return;
    if (!reportsContainer) setupReportsModule();
    if (reportsContainer && !reportsInitialized) loadReports();
}


/* =========================================================
   37. RESTABLECER FORMULARIO
========================================================= */

measurementForm.addEventListener("reset", () => {

    setTimeout(() => {

        dateInput.value = getLocalDate();

        if (currentProfile) {

            technicianInput.value =
                `${currentProfile.nombres} ` +
                `${currentProfile.apellidos}`;

        }

        lineSelect.selectedIndex = 0;

        stationSelect.innerHTML = "";

        stationSelect.add(
            new Option(
                "Primero selecciona una línea",
                ""
            )
        );

        stationSelect.disabled = true;

        replacementDetails.classList.add("hidden");

        replacementCount.required = false;
        replacementCount.value = "";

        clearMeasurementMessage();

    }, 0);

});


/* =========================================================
   38. INICIALIZACIÓN
========================================================= */

async function initializeApp() {

    console.log(
        "Iniciando Baterias_Medicion v0.9.3 (Etapa 12)..."
    );

    setupMeasurementMessages();

    await checkExistingSession();

    console.log(
        "Sistema inicializado."
    );

}


initializeApp();

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(err => {
        console.warn("No se pudo registrar el Service Worker:", err);
    });
}
/* 
```[cite: 2]

### Qué se corrigió y agregó en este archivo

* **Botón `Eliminar` para administradores (`deleteTechnicianRecord`):** Añadido en cada fila de técnicos gestionables (`rol === "tecnico"` y distinto al usuario actual), con confirmación explícita, actualización de `activo = false` y `estado_acceso = "eliminado"`, y respaldo a `supabaseClient.from("tecnicos").update(...)` si la Edge Function `quick-endpoint` no maneja la acción `"eliminar"`[cite: 2].
* **Etiqueta `ELIMINADO` en el listado:** Cuando un técnico queda con `estado_acceso === "eliminado"` y `activo === false`, se muestra claramente como **ELIMINADO** y se oculta el botón **Eliminar** repetido, manteniendo **Reactivar** por si necesitas restaurar su acceso[cite: 2].
* **Sincronización al abrir `administracion`:** Al entrar a la vista `administracion` desde `showView`, se refresca `loadTechnicians()` para mostrar siempre el estado actualizado en base de datos[cite: 2].
* **Cierre limpio del registro del Service Worker:** Se corrigió la llave envolvente extra alrededor de `navigator.serviceWorker.register("./service-worker.js")` al final del script[cite: 2].

### Verificación rápida antes de avanzar a la Etapa 14

1. Guarda este código en tu archivo JS principal en Visual Studio Code, actualiza `CACHE_NAME` en `service-worker.js` y sube los cambios a `EAEM1988/Baterias_Medicion` con `git add .`, `git commit` y `git push`[cite: 2].
2. Abre `[https://eaem1988.github.io/Baterias_Medicion/](https://eaem1988.github.io/Baterias_Medicion/)` con tu cuenta de administrador, entra a **Administración** y prueba eliminar un técnico de prueba[cite: 2].
   * *Verificación:* Aparece la confirmación, el técnico pasa a estado **ELIMINADO** y, si intenta iniciar sesión, se bloquea el acceso conservando sus registros anteriores[cite: 2].

¿Quedó probada la eliminación de técnicos en `[https://eaem1988.github.io/Baterias_Medicion/](https://eaem1988.github.io/Baterias_Medicion/)`, o pasamos ya a redactar la **Etapa 14** (Manual de Usuario, Manual Técnico y Manual de Mantenimiento)?*/