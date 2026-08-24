import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';

/**
 * Módulo 1: Web Trigger para capturar encuestas de satisfacción.
 * Escala de 3 niveles: Bueno, Regular, Malo.
 * Registra comentarios en Jira y persiste las métricas en Forge Storage.
 *
 * @param {import('@forge/api').WebTriggerRequest} event
 * @param {import('@forge/api').WebTriggerContext} context
 * @returns {Promise<import('@forge/api').WebTriggerResponse>}
 */
export async function run(event, context) {
  const method = event.method ? event.method.toUpperCase() : 'GET';
  const queryParams = event.queryParameters || {};

  // Extraer el ID del ticket enviado en los query params (ej. ?ticketId=CS-101 o ?issueKey=CS-101)
  const ticketId = queryParams.ticketId
    ? queryParams.ticketId[0]
    : (queryParams.issueKey ? queryParams.issueKey[0] : 'DESCONOCIDO');

  // 1. Procesar envío de formulario (POST)
  if (method === 'POST') {
    try {
      let rating = 'Bueno'; // Valores permitidos: Bueno, Regular, Malo
      let comments = '';
      let submittedTicketId = ticketId;

      if (event.body) {
        const parsedParams = new URLSearchParams(event.body);
        rating = parsedParams.get('rating') || rating;
        comments = parsedParams.get('comments') || '';
        submittedTicketId = parsedParams.get('ticketId') || submittedTicketId;
      }

      // Validar calificación permitida
      if (!['Bueno', 'Regular', 'Malo'].includes(rating)) {
        rating = 'Bueno';
      }

      const ratingScore = rating === 'Bueno' ? 3 : (rating === 'Regular' ? 2 : 1);
      const ratingEmoji = rating === 'Bueno' ? '😄' : (rating === 'Regular' ? '😐' : '🙁');

      if (submittedTicketId !== 'DESCONOCIDO') {
        // A. Actualizar el campo personalizado de tipo Radio Button customfield_12706 en Jira
        try {
          const updateFieldRes = await api.asApp().requestJira(route`/rest/api/3/issue/${submittedTicketId}`, {
            method: 'PUT',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: {
                customfield_12706: {
                  value: rating // 'Bueno', 'Regular', o 'Malo'
                }
              }
            })
          });

          if (!updateFieldRes.ok) {
            const errorText = await updateFieldRes.text();
            console.error(`Error al actualizar customfield_12706 en ${submittedTicketId}:`, errorText);
          }
        } catch (fieldErr) {
          console.error(`Excepción al actualizar customfield_12706:`, fieldErr);
        }

        // B. Publicar comentario interno en la incidencia de Jira
        const commentData = {
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: `⭐ Encuesta de Satisfacción Recibida:\n- Calificación: ${ratingEmoji} ${rating} (${ratingScore}/3)\n- Comentarios: ${comments || 'Sin comentarios'}`
                  }
                ]
              }
            ]
          },
          properties: [
            {
              key: 'jsm-survey-response',
              value: {
                rating,
                ratingScore,
                comments,
                submittedAt: new Date().toISOString()
              }
            }
          ]
        };

        await api.asApp().requestJira(route`/rest/api/3/issue/${submittedTicketId}/comment`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(commentData)
        });

        // C. Persistir respuesta en Forge Storage para Reportería y Métricas
        const newRecord = {
          id: `survey:${submittedTicketId}:${Date.now()}`,
          ticketId: submittedTicketId,
          rating,
          ratingScore,
          comments,
          submittedAt: new Date().toISOString()
        };

        // Actualizar lista reciente (máximo 100 respuestas)
        const recentList = (await kvs.get('survey_recent_list')) || [];
        recentList.unshift(newRecord);
        if (recentList.length > 100) recentList.pop();
        await kvs.set('survey_recent_list', recentList);

        // Actualizar métricas generales
        const summary = (await kvs.get('survey_metrics_summary')) || {
          total: 0,
          bueno: 0,
          regular: 0,
          malo: 0
        };
        summary.total += 1;
        if (rating === 'Bueno') summary.bueno += 1;
        else if (rating === 'Regular') summary.regular += 1;
        else if (rating === 'Malo') summary.malo += 1;

        await kvs.set('survey_metrics_summary', summary);
      }

      // Retornar pantalla de agradecimiento
      return {
        statusCode: 200,
        headers: { 'Content-Type': ['text/html; charset=utf-8'] },
        body: `
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>¡Gracias por tu opinión!</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f5f7; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 90%; }
              h2 { color: #0052CC; margin-bottom: 12px; font-size: 24px; }
              p { color: #5E6C84; line-height: 1.5; font-size: 15px; }
              .icon { font-size: 56px; margin-bottom: 16px; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">🎉</div>
              <h2>¡Gracias por evaluar nuestro servicio!</h2>
              <p>Tu respuesta para el ticket <strong>${submittedTicketId}</strong> (${ratingEmoji} ${rating}) ha sido registrada con éxito.</p>
            </div>
          </body>
          </html>
        `
      };
    } catch (error) {
      console.error('Error al procesar la encuesta:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': ['text/html; charset=utf-8'] },
        body: `<h3>Ocurrió un problema al guardar la encuesta para el ticket ${ticketId}.</h3>`
      };
    }
  }

  // 2. Procesar solicitud de lectura (GET) - Renderizar la interfaz con la Escala de 3 Opciones (Bueno, Regular, Malo)
  const htmlBody = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Encuesta de Satisfacción - ${ticketId}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f5f7; padding: 24px; display: flex; justify-content: center; margin: 0; }
        .container { background: #ffffff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 32px; max-width: 480px; width: 100%; }
        h2 { color: #172B4D; font-size: 22px; margin-top: 0; margin-bottom: 8px; }
        p { color: #5E6C84; font-size: 14px; margin-bottom: 24px; line-height: 1.4; }
        .ticket-badge { background: #DEEBFF; color: #0747A6; padding: 4px 8px; border-radius: 4px; font-weight: 700; font-size: 14px; }
        label { display: block; font-weight: 600; margin-top: 20px; margin-bottom: 8px; color: #344563; font-size: 14px; }
        
        /* Escala de 3 Opciones: Bueno - Regular - Malo */
        .rating-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
        .rating-option { position: relative; }
        .rating-option input[type="radio"] { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
        .rating-card { border: 2px solid #DFE1E6; border-radius: 8px; padding: 16px 8px; text-align: center; transition: all 0.2s ease; cursor: pointer; background: #FAFBFC; display: block; }
        .rating-card .emoji { font-size: 32px; display: block; margin-bottom: 6px; }
        .rating-card .title { font-weight: 600; font-size: 14px; color: #172B4D; }

        /* Estilos seleccionados por opción */
        .rating-option input[value="Bueno"]:checked + .rating-card { border-color: #36B37E; background: #E3FCEF; }
        .rating-option input[value="Bueno"]:checked + .rating-card .title { color: #006644; }

        .rating-option input[value="Regular"]:checked + .rating-card { border-color: #FFAB00; background: #FFF0B3; }
        .rating-option input[value="Regular"]:checked + .rating-card .title { color: #FF8B00; }

        .rating-option input[value="Malo"]:checked + .rating-card { border-color: #FF5630; background: #FFEBE6; }
        .rating-option input[value="Malo"]:checked + .rating-card .title { color: #BF2600; }

        .rating-card:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.05); }

        textarea { width: 100%; height: 90px; border: 1px solid #DFE1E6; border-radius: 6px; padding: 10px; box-sizing: border-box; font-family: inherit; font-size: 14px; resize: vertical; margin-top: 4px; }
        textarea:focus { outline: none; border-color: #4C9AFF; }
        button { background: #0052CC; color: white; border: none; padding: 12px 20px; border-radius: 6px; font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 24px; width: 100%; transition: background 0.2s; }
        button:hover { background: #0065FF; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Encuesta de Atención</h2>
        <p>¿Cómo evalúas el servicio recibido en la solicitud <span class="ticket-badge">${ticketId}</span>?</p>
        
        <form method="POST">
          <input type="hidden" name="ticketId" value="${ticketId}" />
          
          <label>Selecciona una opción:</label>
          <div class="rating-options">
            <div class="rating-option">
              <input type="radio" id="r_bueno" name="rating" value="Bueno" checked />
              <label class="rating-card" for="r_bueno">
                <span class="emoji">😄</span>
                <span class="title">Bueno</span>
              </label>
            </div>

            <div class="rating-option">
              <input type="radio" id="r_regular" name="rating" value="Regular" />
              <label class="rating-card" for="r_regular">
                <span class="emoji">😐</span>
                <span class="title">Regular</span>
              </label>
            </div>

            <div class="rating-option">
              <input type="radio" id="r_malo" name="rating" value="Malo" />
              <label class="rating-card" for="r_malo">
                <span class="emoji">🙁</span>
                <span class="title">Malo</span>
              </label>
            </div>
          </div>

          <label for="comments">Comentarios adicionales (opcional):</label>
          <textarea id="comments" name="comments" placeholder="Cuéntanos más sobre tu experiencia..."></textarea>

          <button type="submit">Enviar Encuesta</button>
        </form>
      </div>
    </body>
    </html>
  `;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': ['text/html; charset=utf-8']
    },
    body: htmlBody
  };
}

/**
 * Módulo 2: Reportería y Dashboard de Métricas de Encuestas (jira:globalPage).
 * Muestra KPIs (Total encuestas, % CSAT, Bueno, Regular, Malo), barra de progreso 
 * y tabla detallada con las últimas respuestas guardadas en Forge Storage.
 *
 * @param {import('@forge/api').WebTriggerRequest} event
 * @param {import('@forge/api').WebTriggerContext} context
 * @returns {Promise<import('@forge/api').WebTriggerResponse>}
 */
export async function runMetrics(event, context) {
  const summary = (await kvs.get('survey_metrics_summary')) || {
    total: 0,
    bueno: 0,
    regular: 0,
    malo: 0
  };

  const recentList = (await kvs.get('survey_recent_list')) || [];

  const csatPercentage = summary.total > 0
    ? Math.round((summary.bueno / summary.total) * 100)
    : 0;

  const buenoPct = summary.total > 0 ? Math.round((summary.bueno / summary.total) * 100) : 0;
  const regularPct = summary.total > 0 ? Math.round((summary.regular / summary.total) * 100) : 0;
  const maloPct = summary.total > 0 ? Math.round((summary.malo / summary.total) * 100) : 0;

  // Generar filas para la tabla de respuestas
  const rowsHtml = recentList.map(item => {
    let badgeClass = 'badge-bueno';
    let emoji = '😄';
    if (item.rating === 'Regular') { badgeClass = 'badge-regular'; emoji = '😐'; }
    if (item.rating === 'Malo') { badgeClass = 'badge-malo'; emoji = '🙁'; }

    const formattedDate = new Date(item.submittedAt).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return `
      <tr>
        <td><strong>${item.ticketId}</strong></td>
        <td><span class="badge ${badgeClass}">${emoji} ${item.rating}</span></td>
        <td>${item.comments || '<em style="color:#A5ADBA">Sin comentarios</em>'}</td>
        <td style="color:#5E6C84; font-size: 13px;">${formattedDate}</td>
      </tr>
    `;
  }).join('');

  const htmlBody = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Reportería de Encuestas</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #FAFBFC; padding: 24px; margin: 0; color: #172B4D; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        h1 { font-size: 24px; margin: 0; color: #091E42; }
        .subtitle { color: #5E6C84; font-size: 14px; margin-top: 4px; }
        
        /* Grid de KPIs */
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .kpi-card { background: white; border: 1px solid #DFE1E6; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .kpi-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #5E6C84; margin-bottom: 8px; letter-spacing: 0.5px; }
        .kpi-value { font-size: 32px; font-weight: 700; color: #091E42; }
        .kpi-sub { font-size: 13px; font-weight: 600; margin-top: 4px; }

        /* Barra de distribución */
        .card { background: white; border: 1px solid #DFE1E6; border-radius: 8px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .card-title { font-size: 16px; font-weight: 700; margin-top: 0; margin-bottom: 16px; color: #091E42; }
        
        .progress-bar { display: flex; height: 16px; border-radius: 8px; overflow: hidden; background: #DFE1E6; margin-bottom: 12px; }
        .bar-bueno { background: #36B37E; width: ${buenoPct}%; }
        .bar-regular { background: #FFAB00; width: ${regularPct}%; }
        .bar-malo { background: #FF5630; width: ${maloPct}%; }

        .legend { display: flex; gap: 24px; font-size: 13px; }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }

        /* Tabla de respuestas */
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
        th { background: #F4F5F7; padding: 12px; border-bottom: 2px solid #DFE1E6; color: #42526E; font-weight: 600; }
        td { padding: 12px; border-bottom: 1px solid #DFE1E6; vertical-align: middle; }
        tr:hover { background: #FAFBFC; }

        .badge { padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 12px; display: inline-block; }
        .badge-bueno { background: #E3FCEF; color: #006644; }
        .badge-regular { background: #FFF0B3; color: #172B4D; }
        .badge-malo { background: #FFEBE6; color: #BF2600; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>Métricas de Encuestas de Satisfacción</h1>
          <div class="subtitle">Panel de reportería general y desempeño de servicio</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-title">Total Encuestas</div>
          <div class="kpi-value">${summary.total}</div>
          <div class="kpi-sub" style="color: #0052CC;">Respuestas Registradas</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">Índice CSAT</div>
          <div class="kpi-value">${csatPercentage}%</div>
          <div class="kpi-sub" style="color: #36B37E;">% Calificación Bueno</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">😄 Buenas</div>
          <div class="kpi-value" style="color: #36B37E;">${summary.bueno}</div>
          <div class="kpi-sub" style="color: #36B37E;">${buenoPct}% del total</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">🙁 Malas / Regulares</div>
          <div class="kpi-value" style="color: #FF5630;">${summary.malo + summary.regular}</div>
          <div class="kpi-sub" style="color: #FF5630;">${maloPct + regularPct}% del total</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Distribución de Calificaciones</div>
        <div class="progress-bar">
          <div class="bar-bueno" title="Bueno: ${buenoPct}%"></div>
          <div class="bar-regular" title="Regular: ${regularPct}%"></div>
          <div class="bar-malo" title="Malo: ${maloPct}%"></div>
        </div>
        <div class="legend">
          <div class="legend-item"><span class="dot" style="background: #36B37E;"></span> Bueno (${summary.bueno} - ${buenoPct}%)</div>
          <div class="legend-item"><span class="dot" style="background: #FFAB00;"></span> Regular (${summary.regular} - ${regularPct}%)</div>
          <div class="legend-item"><span class="dot" style="background: #FF5630;"></span> Malo (${summary.malo} - ${maloPct}%)</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Últimas Respuestas Recibidas</div>
        ${recentList.length === 0 ? '<p style="color:#5E6C84">Aún no se han recibido respuestas de encuestas.</p>' : `
          <table>
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Calificación</th>
                <th>Comentarios</th>
                <th>Fecha de Envío</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        `}
      </div>
    </body>
    </html>
  `;

  return {
    statusCode: 200,
    headers: { 'Content-Type': ['text/html; charset=utf-8'] },
    body: htmlBody
  };
}


