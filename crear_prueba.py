import pandas as pd

# Inventamos unos datos de asistencia falsos
datos = {
    "id_empleado": [101, 102, 103],
    "fecha": ["2026-02-23", "2026-02-23", "2026-02-23"],
    "hora_entrada": ["08:00", "08:15", "07:55"],
    "hora_salida": ["17:00", "17:00", "17:30"]
}

# Convertimos los datos a una tabla y la guardamos como Excel
df = pd.DataFrame(datos)
df.to_excel("asistencia_prueba.xlsx", index=False)

print("¡Archivo 'asistencia_prueba.xlsx' creado con éxito!")