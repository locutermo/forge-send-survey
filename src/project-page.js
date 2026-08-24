import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Heading,
  Text,
  Stack,
  Inline,
  Box,
  DynamicTable,
  Lozenge,
  Spinner,
  SectionMessage,
  Tag,
  Button
} from '@forge/react';
import { requestJira, view } from '@forge/bridge';

const App = () => {
  const [loading, setLoading] = useState(true);
  const [ticketList, setTicketList] = useState([]);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({ total: 0, bueno: 0, regular: 0, malo: 0 });

  const fetchSurveyData = async () => {
    setLoading(true);
    setError(null);
    try {
      const context = await view.getContext();
      const projectKey = context?.extension?.project?.key || 'ITSM';

      const searchRes = await requestJira(
        `/rest/api/3/search?jql=project = "${projectKey}" AND "cf[12706]" is not EMPTY ORDER BY updated DESC&maxResults=100&fields=summary,customfield_12706,updated`
      );

      if (!searchRes.ok) {
        throw new Error('Error al consultar las incidencias de Jira');
      }

      const data = await searchRes.json();
      const issues = data.issues || [];

      let stats = { total: 0, bueno: 0, regular: 0, malo: 0 };
      const items = issues.map((issue) => {
        const ratingVal = issue.fields?.customfield_12706?.value || 'Bueno';

        if (ratingVal === 'Bueno') stats.bueno += 1;
        else if (ratingVal === 'Regular') stats.regular += 1;
        else if (ratingVal === 'Malo') stats.malo += 1;
        stats.total += 1;

        return {
          key: issue.key,
          summary: issue.fields?.summary || '',
          rating: ratingVal,
          updated: issue.fields?.updated || ''
        };
      });

      setSummary(stats);
      setTicketList(items);
    } catch (err) {
      setError(err.message || 'Error cargando los datos de encuestas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSurveyData();
  }, []);

  const csat = summary.total > 0 ? Math.round((summary.bueno / summary.total) * 100) : 0;
  const buenoPct = summary.total > 0 ? Math.round((summary.bueno / summary.total) * 100) : 0;
  const regularPct = summary.total > 0 ? Math.round((summary.regular / summary.total) * 100) : 0;
  const maloPct = summary.total > 0 ? Math.round((summary.malo / summary.total) * 100) : 0;

  const head = {
    cells: [
      { key: 'key', content: 'Clave Ticket', isSortable: true, width: 25 },
      { key: 'summary', content: 'Resumen', width: 40 },
      { key: 'rating', content: 'Calificación', isSortable: true, width: 20 },
      { key: 'updated', content: 'Fecha de Respuesta', isSortable: true, width: 15 }
    ]
  };

  const rows = ticketList.map((item, index) => {
    let lozengeAppearance = 'success';
    if (item.rating === 'Regular') lozengeAppearance = 'inprogress';
    if (item.rating === 'Malo') lozengeAppearance = 'removed';

    const formattedDate = item.updated ? new Date(item.updated).toLocaleDateString('es-ES') : '-';

    return {
      key: `row-${index}-${item.key}`,
      cells: [
        {
          key: 'key',
          content: React.createElement(Text, null, item.key)
        },
        {
          key: 'summary',
          content: React.createElement(Text, null, item.summary || 'Sin resumen')
        },
        {
          key: 'rating',
          content: React.createElement(Lozenge, { appearance: lozengeAppearance }, item.rating)
        },
        {
          key: 'updated',
          content: React.createElement(Text, null, formattedDate)
        }
      ]
    };
  });

  if (loading) {
    return React.createElement(
      Box,
      { padding: 'space.400' },
      React.createElement(Spinner, { size: 'large' })
    );
  }

  return React.createElement(
    Stack,
    { space: 'space.300' },
    React.createElement(
      Inline,
      { spread: 'space-between', alignBlock: 'center' },
      React.createElement(
        Stack,
        { space: 'space.050' },
        React.createElement(
          Inline,
          { space: 'space.100', alignBlock: 'center' },
          React.createElement(Heading, { size: 'large' }, 'Reporte de Encuestas de Satisfacción'),
          React.createElement(Tag, { text: 'ITSM', color: 'blue' })
        ),
        React.createElement(Text, null, 'Desempeño y calificaciones de servicio para las solicitudes del proyecto ITSM')
      ),
      React.createElement(Button, { appearance: 'subtle', onClick: fetchSurveyData }, 'Actualizar datos')
    ),
    error ? React.createElement(
      SectionMessage,
      { appearance: 'error', title: 'Error' },
      React.createElement(Text, null, error)
    ) : null,
    React.createElement(
      Inline,
      { space: 'space.200' },
      React.createElement(
        Box,
        { padding: 'space.200', backgroundColor: 'color.background.neutral.subtle', borderRadius: 'border.radius.100' },
        React.createElement(
          Stack,
          { space: 'space.050' },
          React.createElement(Text, { size: 'small' }, 'TOTAL EVALUADOS'),
          React.createElement(Heading, { size: 'medium' }, String(summary.total))
        )
      ),
      React.createElement(
        Box,
        { padding: 'space.200', backgroundColor: 'color.background.neutral.subtle', borderRadius: 'border.radius.100' },
        React.createElement(
          Stack,
          { space: 'space.050' },
          React.createElement(Text, { size: 'small' }, 'ÍNDICE CSAT'),
          React.createElement(Heading, { size: 'medium' }, `${csat}%`)
        )
      ),
      React.createElement(
        Box,
        { padding: 'space.200', backgroundColor: 'color.background.neutral.subtle', borderRadius: 'border.radius.100' },
        React.createElement(
          Stack,
          { space: 'space.050' },
          React.createElement(Text, { size: 'small' }, 'BUENAS'),
          React.createElement(Heading, { size: 'medium' }, `${summary.bueno} (${buenoPct}%)`)
        )
      ),
      React.createElement(
        Box,
        { padding: 'space.200', backgroundColor: 'color.background.neutral.subtle', borderRadius: 'border.radius.100' },
        React.createElement(
          Stack,
          { space: 'space.050' },
          React.createElement(Text, { size: 'small' }, 'REGULARES / MALAS'),
          React.createElement(Heading, { size: 'medium' }, `${summary.regular + summary.malo} (${regularPct + maloPct}%)`)
        )
      )
    ),
    React.createElement(
      Box,
      { padding: 'space.100' },
      React.createElement(Heading, { size: 'small' }, 'Detalle de Respuestas por Ticket'),
      ticketList.length === 0
        ? React.createElement(
            SectionMessage,
            { appearance: 'information', title: 'Sin registros' },
            React.createElement(Text, null, 'Aún no se han registrado encuestas con calificación para este proyecto.')
          )
        : React.createElement(DynamicTable, {
            head,
            rows,
            rowsPerPage: 15,
            defaultPage: 1,
            loadingSpinnerSize: 'large'
          })
    )
  );
};

export const run = ForgeReconciler.render(React.createElement(App, null));
