import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import pandas as pd
import io
import hashlib
from sqlalchemy import create_engine, text

app = FastAPI(title="SaaS - Sistema HRIS Multi-Tenant")

# ==========================================
# CONFIGURACIÓN DE SEGURIDAD Y CONEXIÓN
# ==========================================

# Configuración CORS CORREGIDA
# Especificamos explícitamente tu Vercel y tu entorno local
origenes_permitidos = [
    "https://rrhh-seven.vercel.app",  # Tu frontend en Vercel
    "http://localhost:5173",          # Tu frontend local (Vite)
]

app.add_middleware(
    CORSMiddleware, 
    allow_origins=origenes_permitidos, 
    allow_credentials=True, 
    allow_methods=["*"], 
    allow_headers=["*"],
)

# Conexión Dinámica a Base de Datos (Soporta Railway PostgreSQL y SQLite Local)
RAILWAY_DB_URL = os.getenv("DATABASE_URL")

# Parche de compatibilidad por si Railway entrega la URL como "postgres://" en lugar de "postgresql://"
if RAILWAY_DB_URL and RAILWAY_DB_URL.startswith("postgres://"):
    RAILWAY_DB_URL = RAILWAY_DB_URL.replace("postgres://", "postgresql://", 1)

# Si estamos en la nube usa Railway, si no, crea el archivo local SQLite
DATABASE_URL = RAILWAY_DB_URL or "sqlite:///./hris_saas.db" 
engine = create_engine(DATABASE_URL)

# --- MODELOS DE DATOS ---
class UsuarioAuth(BaseModel):
    email: str
    password: str
    empresa: str = "Mi Empresa"

class EscaneoQR(BaseModel):
    id_empleado: int
    id_capacitacion: int = 1

class EmpleadoNuevo(BaseModel):
    id_empleado: int
    nombre: str
    puesto: str
    departamento: str

# --- FUNCIÓN DE SEGURIDAD (Encriptación de contraseñas) ---
def crear_hash(password: str):
    return hashlib.sha256(password.encode()).hexdigest()

# ==========================================
# 1. RUTAS DE AUTENTICACIÓN (CUENTAS)
# ==========================================

@app.post("/api/registro/")
def registrar_usuario(user: UsuarioAuth):
    try:
        # 1. Verificamos si el correo ya existe
        try:
            df_users = pd.read_sql_query("SELECT * FROM Usuarios WHERE email = :email", con=engine, params={"email": user.email})
            if not df_users.empty:
                raise HTTPException(status_code=400, detail="El correo ya está registrado.")
        except Exception:
            pass # Si la tabla no existe aún, pasamos directo a crearla

        # 2. Guardamos al nuevo usuario con su contraseña encriptada
        nuevo_usuario = pd.DataFrame([{
            "email": user.email,
            "password_hash": crear_hash(user.password),
            "empresa": user.empresa
        }])
        nuevo_usuario.to_sql('Usuarios', con=engine, if_exists='append', index=False)
        return {"estado": "Éxito", "mensaje": "Cuenta creada. Ya puedes iniciar sesión."}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al registrar: {str(e)}")

@app.post("/api/login/")
def login_usuario(user: UsuarioAuth):
    try:
        hash_pass = crear_hash(user.password)
        query = "SELECT rowid as usuario_id, empresa FROM Usuarios WHERE email = :email AND password_hash = :password"
        df = pd.read_sql_query(query, con=engine, params={"email": user.email, "password": hash_pass})
        
        if df.empty:
            raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos.")
            
        usuario = df.iloc[0]
        # Devolvemos el ID único de este usuario. React lo guardará como una llave.
        return {"usuario_id": int(usuario['usuario_id']), "empresa": usuario['empresa']}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en servidor: {str(e)}")


# ==========================================
# 2. RUTAS DEL SISTEMA (AISLADAS POR USUARIO)
# ==========================================

@app.post("/api/subir-asistencia/")
async def procesar_excel(file: UploadFile = File(...), x_user_id: int = Header(None)):
    if not x_user_id: raise HTTPException(status_code=401, detail="No autorizado")
    if not file.filename.endswith('.xlsx'): raise HTTPException(status_code=400, detail="Sube un archivo .xlsx válido.")
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        df['usuario_id'] = x_user_id # <-- ETIQUETA MULTI-TENANT
        df.to_sql('Asistencias_Diarias', con=engine, if_exists='append', index=False)
        return {"filas_registradas": len(df), "estado": "Éxito"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/registrar-qr/")
def registrar_asistencia_qr(datos: EscaneoQR, x_user_id: int = Header(None)):
    if not x_user_id: raise HTTPException(status_code=401, detail="No autorizado")
    try:
        ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        nuevo_registro = pd.DataFrame([{
            "usuario_id": x_user_id, # <-- ETIQUETA MULTI-TENANT
            "id_capacitacion": datos.id_capacitacion,
            "id_empleado": datos.id_empleado,
            "hora_escaneo": ahora
        }])
        nuevo_registro.to_sql('Asistencias_Capacitacion', con=engine, if_exists='append', index=False)
        return {"mensaje": f"Asistencia registrada. Empleado: {datos.id_empleado}"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/registros-qr/")
def obtener_registros_qr(x_user_id: int = Header(None)):
    if not x_user_id: return []
    try:
        # Consulta segura parametrizada
        query = "SELECT * FROM Asistencias_Capacitacion WHERE usuario_id = :uid"
        df = pd.read_sql_query(query, con=engine, params={"uid": x_user_id})
        return df.to_dict(orient="records")
    except Exception: return []

@app.get("/api/estadisticas/")
def obtener_estadisticas(x_user_id: int = Header(None)):
    if not x_user_id: raise HTTPException(status_code=401)
    try:
        try:
            # Consulta segura parametrizada
            query_excel = "SELECT id_empleado FROM Asistencias_Diarias WHERE usuario_id = :uid"
            df_excel = pd.read_sql_query(query_excel, con=engine, params={"uid": x_user_id})
            total_empleados = len(df_excel['id_empleado'].unique())
        except Exception: total_empleados = 0

        try:
            # Consulta segura parametrizada
            query_qr = "SELECT * FROM Asistencias_Capacitacion WHERE usuario_id = :uid"
            df_qr = pd.read_sql_query(query_qr, con=engine, params={"uid": x_user_id})
            total_capacitados = len(df_qr['id_empleado'].unique())
            df_qr['hora_real'] = pd.to_datetime(df_qr['hora_escaneo'])
            df_qr['hora_sola'] = df_qr['hora_real'].dt.hour 
            conteo = df_qr.groupby('hora_sola').size().reset_index(name='asistencias')
            grafica = [{"name": f"{int(row['hora_sola'])}:00", "asistencias": int(row['asistencias'])} for _, row in conteo.iterrows()]
        except Exception:
            total_capacitados = 0; grafica = []

        pendientes = max(0, total_empleados - total_capacitados)
        return {"resumen": [{"titulo": "Total en Sucursal", "valor": total_empleados}, {"titulo": "Ya Capacitados", "valor": total_capacitados}, {"titulo": "Faltan por ir", "valor": pendientes}], "datos_grafica": grafica}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/empleados/")
def obtener_empleados(x_user_id: int = Header(None)):
    if not x_user_id: return []
    try:
        # Consulta segura parametrizada
        query = "SELECT * FROM Empleados WHERE usuario_id = :uid"
        df = pd.read_sql_query(query, con=engine, params={"uid": x_user_id})
        return df.to_dict(orient="records")
    except Exception: return []

@app.post("/api/empleados/")
def agregar_empleado(emp: EmpleadoNuevo, x_user_id: int = Header(None)):
    if not x_user_id: raise HTTPException(status_code=401)
    try:
        datos = emp.model_dump() # Actualizado de .dict() a model_dump() (estándar de Pydantic v2)
        datos['usuario_id'] = x_user_id 
        nuevo_emp = pd.DataFrame([datos])
        nuevo_emp.to_sql('Empleados', con=engine, if_exists='append', index=False)
        return {"estado": "Éxito", "mensaje": f"Empleado registrado."}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/empleados/{id_empleado}")
def modificar_empleado(id_empleado: int, emp: EmpleadoNuevo, x_user_id: int = Header(None)):
    if not x_user_id: raise HTTPException(status_code=401)
    try:
        with engine.begin() as conn:
            query = text("UPDATE Empleados SET nombre = :n, puesto = :p, departamento = :d WHERE id_empleado = :id AND usuario_id = :uid")
            conn.execute(query, {"n": emp.nombre, "p": emp.puesto, "d": emp.departamento, "id": id_empleado, "uid": x_user_id})
        return {"mensaje": "Datos actualizados."}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/empleados/{id_empleado}")
def eliminar_empleado(id_empleado: int, x_user_id: int = Header(None)):
    if not x_user_id: raise HTTPException(status_code=401)
    try:
        with engine.begin() as conn:
            # Consulta segura parametrizada
            query = text("DELETE FROM Empleados WHERE id_empleado = :id AND usuario_id = :uid")
            conn.execute(query, {"id": id_empleado, "uid": x_user_id})
        return {"mensaje": "Dado de baja."}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))