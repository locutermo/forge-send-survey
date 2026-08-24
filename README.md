# Forge Send Survey - Jira Service Management

Aplicación desarrollada sobre la plataforma **Atlassian Forge** para la gestión y medición de encuestas de satisfacción en solicitudes de **Jira Service Management (JSM)**.

---

## 🚀 Características Principales

### 1. Envío Automatizado de Encuestas (Workflow Post-Function)
- Módulo **`jira:workflowPostFunction`** (`send-survey-email`) que se ejecuta automáticamente cuando el ticket transiciona al estado **Cerrado**.
- Notifica al **Reporter** vía correo electrónico con una plantilla HTML interactiva y botón directo **"Calificar Atención"**.
- Enlaza de forma segura y dinámica el identificador del ticket (`ticketId`) hacia el WebTrigger de la encuesta.

### 2. Formulario Público de Encuesta (WebTrigger)
- Interfaz web responsiva con escala de calificación de **3 niveles**:
  - 😄 **Bueno** (3 puntos)
  - 😐 **Regular** (2 puntos)
  - 🙁 **Malo** (1 punto)
  - Campo opcional para comentarios adicionales.
- Actualiza automáticamente el campo personalizado tipo Radio Button **`customfield_12706`** en la incidencia de Jira.
- Agrega un comentario interno con el detalle de la calificación recibida y guarda métricas en el almacenamiento Forge Key-Value Storage (`@forge/kvs`).
- **Control de Acceso y Duplicidad**:
  - Bloquea accesos directos sin identificador de ticket válido (`?ticketId=...`).
  - Previene respuestas duplicadas validando el estado previo en KVS y en el campo de Jira, mostrando una tarjeta informativa si la encuesta ya fue completada.

### 3. Módulo de Reportería y Métricas (Project Page)
- Módulo nativo en UI Kit Latest (**`@forge/react`**) integrado en el menú lateral del proyecto (**ITSM**).
- **Tarjetas de KPI**:
  - Total Evaluados
  - Índice CSAT (%)
  - Cantidad y porcentaje de calificaciones Buenas
  - Cantidad y porcentaje de calificaciones Regulares / Malas
- **Tabla Dinámica de Respuestas (`DynamicTable`)**:
  - Clave de Ticket
  - Resumen de la Solicitud
  - Reportado por (Reporter)
  - Atendido por (Assignee)
  - Calificación con Lozenge de estado
  - Fecha y Hora exacta de la respuesta (`DD/MM/AAAA HH:MM`)

---

## ⚙️ Variables de Entorno

La aplicación requiere la siguiente variable de entorno para construir los enlaces de la encuesta enviados por correo:

| Variable | Descripción | Ejemplo de Valor |
| :--- | :--- | :--- |
| `WEBTRIGGER_SURVEY_URL` | URL pública del WebTrigger de la encuesta | `https://<app-id>.webtrigger.atlassian.app/public/<token>` |

### Configuración de la Variable con Forge CLI:

Para configurar la variable en el entorno de desarrollo:
```bash
forge variables set --environment development WEBTRIGGER_SURVEY_URL "https://d855b895-7188-44bc-8e14-21f7d83a1142.webtrigger.atlassian.app/public/KVOty-1Sb6K0u_nw8w1gxLggDqs"
```

Para verificar las variables configuradas:
```bash
forge variables list --environment development
```

---

## 🛠️ Estructura del Proyecto

```
.
├── manifest.yml               # Configuración de módulos, funciones y permisos de Forge
├── package.json               # Dependencias del proyecto (@forge/api, @forge/react, @forge/bridge, @forge/kvs)
├── src/
│   ├── index.js               # Handlers del WebTrigger (run) y de la Post-Función (sendSurveyEmail)
│   └── frontend/
│       └── index.jsx          # Componente nativo UI Kit para el Reporte de Encuestas (Project Page)
└── README.md                  # Documentación del proyecto
```

---

## 📦 Instalación y Despliegue

### Prerrequisitos
- Node.js versión 20.x o superior
- Atlassian Forge CLI instalado globalmente (`npm install -g @forge/cli`)
- Sesión iniciada en Forge (`forge login`)

### 1. Instalar Dependencias
```bash
npm install --legacy-peer-deps
```

### 2. Validar Manifiesto y Código
```bash
forge lint
```

### 3. Desplegar la Aplicación
```bash
forge deploy -e development --non-interactive
```

### 4. Modo Desarrollo con Túnel (Hot-Reload)
```bash
forge tunnel
```

---

## 🔧 Configuración en el Flujo de Trabajo (Workflow) de Jira

Para activar el envío automático de la encuesta por correo al cerrar los tickets:

1. Ingresa a Jira y ve a **Configuración del Proyecto** -> **Flujos de trabajo** (*Workflows*).
2. Selecciona el flujo de trabajo correspondiente y haz clic en **Editar** (*Edit*).
3. Selecciona la transición que conduce al estado **Cerrado** (ej. *Terminado -> Cerrado*).
4. En el panel de propiedades lateral, ingresa a **Funciones posteriores** (*Post Functions*) -> **Agregar función posterior** (*Add post function*).
5. Selecciona de la lista la función: **"Enviar Encuesta de Satisfacción por Correo"**.
6. Haz clic en **Agregar** y finalmente en **Actualizar flujo de trabajo** (*Update workflow* / *Publicar borrador*).

---

## 🔒 Permisos y Scopes (OAuth)

La aplicación utiliza los siguientes permisos mínimos en `manifest.yml`:
- `read:jira-work`: Lectura de incidencias, solicitantes y estados para la reportería y validaciones.
- `write:jira-work`: Actualización de la calificación en `customfield_12706`, publicación de comentarios y envío de notificaciones por correo.
- `storage:app`: Almacenamiento seguro en Forge Key-Value Storage (`@forge/kvs`) para control de duplicidad y métricas.
