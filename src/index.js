import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';

export async function run(event, context) {
  const method = event.method ? event.method.toUpperCase() : 'GET';
  const queryParams = event.queryParameters || {};

  const ticketId = queryParams.ticketId
    ? queryParams.ticketId[0]
    : (queryParams.issueKey ? queryParams.issueKey[0] : 'DESCONOCIDO');

  if (!ticketId || ticketId === 'DESCONOCIDO' || ticketId.trim() === '') {
    return {
      statusCode: 400,
      headers: { 'Content-Type': ['text/html; charset=utf-8'] },
      body: `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Enlace Inválido - Encuesta</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f5f7; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); text-align: center; max-width: 440px; width: 90%; }
            h2 { color: #DE350B; margin-bottom: 12px; font-size: 22px; }
            p { color: #5E6C84; line-height: 1.5; font-size: 15px; }
            .status-box { background: #FFEBE6; border: 1px solid #FFBDAD; color: #BF2600; padding: 12px; border-radius: 8px; font-weight: 600; margin-top: 16px; font-size: 14px; }
            .icon { font-size: 56px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">⚠️</div>
            <h2>Enlace de Encuesta Inválido</h2>
            <p>No se especificó ninguna solicitud válida para evaluar.</p>
            <div class="status-box">
              Por favor, utiliza el enlace personalizado enviado a tu correo electrónico al cerrarse el ticket.
            </div>
          </div>
        </body>
        </html>
      `
    };
  }

  let isAlreadySubmitted = false;
  let existingSurveyData = await kvs.get(`survey_completed:${ticketId}`);

  if (existingSurveyData) {
    isAlreadySubmitted = true;
  } else {
    try {
      const issueRes = await api.asApp().requestJira(route`/rest/api/3/issue/${ticketId}?fields=customfield_12706`, {
        headers: { 'Accept': 'application/json' }
      });
      if (issueRes.ok) {
        const issueData = await issueRes.json();
        const fieldValue = issueData.fields?.customfield_12706?.value;
        if (fieldValue) {
          isAlreadySubmitted = true;
          existingSurveyData = { rating: fieldValue };
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (isAlreadySubmitted) {
    const ratingVal = existingSurveyData?.rating || 'Registrada';
    const ratingEmoji = ratingVal === 'Bueno' ? '😄' : (ratingVal === 'Regular' ? '😐' : (ratingVal === 'Malo' ? '🙁' : '✅'));

    return {
      statusCode: 200,
      headers: { 'Content-Type': ['text/html; charset=utf-8'] },
      body: `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Encuesta Completada - ${ticketId}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f5f7; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); text-align: center; max-width: 440px; width: 90%; }
            h2 { color: #0052CC; margin-bottom: 12px; font-size: 22px; }
            p { color: #5E6C84; line-height: 1.5; font-size: 15px; }
            .ticket-badge { background: #DEEBFF; color: #0747A6; padding: 4px 8px; border-radius: 4px; font-weight: 700; font-size: 14px; }
            .status-box { background: #E3FCEF; border: 1px solid #ABF5D1; color: #006644; padding: 12px; border-radius: 8px; font-weight: 600; margin-top: 16px; font-size: 14px; }
            .icon { font-size: 56px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">📋</div>
            <h2>Encuesta Ya Completada</h2>
            <p>La evaluación para la solicitud <span class="ticket-badge">${ticketId}</span> ya fue registrada anteriormente. ¡Muchas gracias por tus comentarios!</p>
            <div class="status-box">
              ${ratingEmoji} Calificación registrada: <strong>${ratingVal}</strong>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }

  if (method === 'POST') {
    try {
      let rating = 'Bueno';
      let comments = '';
      let submittedTicketId = ticketId;

      if (event.body) {
        const parsedParams = new URLSearchParams(event.body);
        rating = parsedParams.get('rating') || rating;
        comments = parsedParams.get('comments') || '';
        submittedTicketId = parsedParams.get('ticketId') || submittedTicketId;
      }

      if (!submittedTicketId || submittedTicketId === 'DESCONOCIDO' || submittedTicketId.trim() === '') {
        return {
          statusCode: 400,
          headers: { 'Content-Type': ['text/html; charset=utf-8'] },
          body: `<h3>No se puede registrar la encuesta sin un identificador de ticket válido.</h3>`
        };
      }

      if (!['Bueno', 'Regular', 'Malo'].includes(rating)) {
        rating = 'Bueno';
      }

      const ratingScore = rating === 'Bueno' ? 3 : (rating === 'Regular' ? 2 : 1);
      const ratingEmoji = rating === 'Bueno' ? '😄' : (rating === 'Regular' ? '😐' : '🙁');

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
                value: rating
              }
            }
          })
        });

        if (!updateFieldRes.ok) {
          const errorText = await updateFieldRes.text();
          console.error(errorText);
        }
      } catch (fieldErr) {
        console.error(fieldErr);
      }

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

      await kvs.set(`survey_completed:${submittedTicketId}`, {
        rating,
        ratingScore,
        comments,
        submittedAt: new Date().toISOString()
      });

      const newRecord = {
        id: `survey:${submittedTicketId}:${Date.now()}`,
        ticketId: submittedTicketId,
        rating,
        ratingScore,
        comments,
        submittedAt: new Date().toISOString()
      };

      const recentList = (await kvs.get('survey_recent_list')) || [];
      recentList.unshift(newRecord);
      if (recentList.length > 100) recentList.pop();
      await kvs.set('survey_recent_list', recentList);

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
      console.error(error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': ['text/html; charset=utf-8'] },
        body: `<h3>Ocurrió un problema al guardar la encuesta para el ticket ${ticketId}.</h3>`
      };
    }
  }

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
        
        .rating-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
        .rating-option { position: relative; }
        .rating-option input[type="radio"] { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
        .rating-card { border: 2px solid #DFE1E6; border-radius: 8px; padding: 16px 8px; text-align: center; transition: all 0.2s ease; cursor: pointer; background: #FAFBFC; display: block; }
        .rating-card .emoji { font-size: 32px; display: block; margin-bottom: 6px; }
        .rating-card .title { font-weight: 600; font-size: 14px; color: #172B4D; }

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

export async function sendSurveyEmail(event, context) {
  try {
    console.log('sendSurveyEmail invocado con event:', JSON.stringify(event));

    const issueKey = event?.issue?.key || event?.issue?.id || event?.issueKey || context?.extension?.issue?.key;
    if (!issueKey) {
      console.error('No se encontro issueKey en el evento');
      return;
    }

    if (event?.changelog) {
      const statusChange = event.changelog.items?.find(item => item.field === 'status');
      if (statusChange) {
        const toStatus = (statusChange.toString || '').toLowerCase();
        if (!toStatus.includes('cerrado') && !toStatus.includes('closed')) {
          console.log(`Estado cambiado a '${statusChange.toString}', no es Cerrado. Se omite.`);
          return;
        }
      }
    }

    const alreadySent = await kvs.get(`survey_email_sent:${issueKey}`);
    if (alreadySent && alreadySent.sentAt) {
      const diffMs = Date.now() - new Date(alreadySent.sentAt).getTime();
      if (diffMs < 30000) {
        console.log(`Correo para ${issueKey} enviado hace menos de 30 segundos. Se omite duplicado.`);
        return;
      }
    }

    await kvs.set(`survey_email_sent:${issueKey}`, {
      sentAt: new Date().toISOString()
    });

    let reporterName = 'Usuario';
    try {
      const issueRes = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}?fields=reporter`);
      if (issueRes.ok) {
        const issueData = await issueRes.json();
        reporterName = issueData.fields?.reporter?.displayName || reporterName;
      }
    } catch (fetchErr) {
      console.error(fetchErr);
    }

    const baseUrl = process.env.WEBTRIGGER_SURVEY_URL || 'https://d855b895-7188-44bc-8e14-21f7d83a1142.webtrigger.atlassian.app/public/KVOty-1Sb6K0u_nw8w1gxLggDqs';
    const separator = baseUrl.includes('?') ? '&' : '?';
    const surveyUrl = `${baseUrl}${separator}ticketId=${issueKey}`;

    const notifyPayload = {
      subject: `Encuesta de Satisfacción - Solicitud ${issueKey}`,
      textBody: `Hola ${reporterName},\n\nTu solicitud ${issueKey} ha sido cerrada.\nTe invitamos a evaluar el servicio recibido ingresando al siguiente enlace:\n${surveyUrl}\n\n¡Gracias por tu tiempo!`,
      htmlBody: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #DFE1E6; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #0052CC; padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600;">Encuesta de Satisfacción</h1>
          </div>
          <div style="padding: 32px 24px; color: #172B4D; font-size: 15px; line-height: 1.6;">
            <p style="margin-top: 0;">Hola <strong>${reporterName}</strong>,</p>
            <p>Te informamos que tu solicitud <strong style="color: #0052CC;">${issueKey}</strong> ha sido marcada como <strong>Cerrada</strong>.</p>
            <p>Queremos brindarte la mejor experiencia posible, por lo que tu opinión sobre la atención recibida es fundamental para nosotros.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${surveyUrl}" style="background-color: #0052CC; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 16px; display: inline-block;">
                Calificar Atención
              </a>
            </div>
          </div>
          <div style="background-color: #F4F5F7; padding: 16px 24px; text-align: center; font-size: 12px; color: #6B778C; border-top: 1px solid #DFE1E6;">
            Mesa de Help Desk • Gestión de Servicios TI
          </div>
        </div>
      `,
      to: {
        reporter: true
      }
    };

    const notifyRes = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/notify`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(notifyPayload)
    });

    const notifyStatus = notifyRes.status;
    const notifyBody = await notifyRes.text();
    console.log(`Respuesta notify para ${issueKey}: status=${notifyStatus}, body=${notifyBody}`);
  } catch (err) {
    console.error('Error en sendSurveyEmail:', err);
  }
}
