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

      const searchRes = await requestJira('/rest/api/3/search', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jql: `project = "${projectKey}" AND "cf[12706]" is not EMPTY ORDER BY updated DESC`,
          fields: ['summary', 'customfield_12706', 'updated'],
          maxResults: 100
        })
      });

      if (!searchRes.ok) {
        const errorData = await searchRes.text();
        throw new Error(`Error al consultar incidencias (${searchRes.status}): ${errorData}`);
      }

      const data = await searchRes.json();
      const issues = data.issues || [];

      let stats = { total: 0, bueno: 0, regular: 0, malo: 0 };
      const items = issues.map((issue) => {
        const rawField = issue.fields?.customfield_12706;
        const ratingVal = (typeof rawField === 'object' && rawField !== null ? rawField.value : rawField) || 'Bueno';

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
          content: <Text>{item.key}</Text>
        },
        {
          key: 'summary',
          content: <Text>{item.summary || 'Sin resumen'}</Text>
        },
        {
          key: 'rating',
          content: (
            <Lozenge appearance={lozengeAppearance}>
              {item.rating}
            </Lozenge>
          )
        },
        {
          key: 'updated',
          content: <Text>{formattedDate}</Text>
        }
      ]
    };
  });

  if (loading) {
    return (
      <Box padding="space.400">
        <Spinner size="large" />
      </Box>
    );
  }

  return (
    <Stack space="space.300">
      <Inline spread="space-between" alignBlock="center">
        <Stack space="space.050">
          <Inline space="space.100" alignBlock="center">
            <Heading size="large">Reporte de Encuestas de Satisfacción</Heading>
            <Tag text="ITSM" color="blue" />
          </Inline>
          <Text>Desempeño y calificaciones de servicio para las solicitudes del proyecto ITSM</Text>
        </Stack>
        <Button appearance="subtle" onClick={fetchSurveyData}>
          Actualizar datos
        </Button>
      </Inline>

      {error && (
        <SectionMessage appearance="error" title="Error">
          <Text>{error}</Text>
        </SectionMessage>
      )}

      <Inline space="space.200">
        <Box padding="space.200" backgroundColor="color.background.neutral.subtle" borderRadius="border.radius.100">
          <Stack space="space.050">
            <Text size="small">TOTAL EVALUADOS</Text>
            <Heading size="medium">{String(summary.total)}</Heading>
          </Stack>
        </Box>

        <Box padding="space.200" backgroundColor="color.background.neutral.subtle" borderRadius="border.radius.100">
          <Stack space="space.050">
            <Text size="small">ÍNDICE CSAT</Text>
            <Heading size="medium">{`${csat}%`}</Heading>
          </Stack>
        </Box>

        <Box padding="space.200" backgroundColor="color.background.neutral.subtle" borderRadius="border.radius.100">
          <Stack space="space.050">
            <Text size="small">BUENAS</Text>
            <Heading size="medium">{`${summary.bueno} (${buenoPct}%)`}</Heading>
          </Stack>
        </Box>

        <Box padding="space.200" backgroundColor="color.background.neutral.subtle" borderRadius="border.radius.100">
          <Stack space="space.050">
            <Text size="small">REGULARES / MALAS</Text>
            <Heading size="medium">{`${summary.regular + summary.malo} (${regularPct + maloPct}%)`}</Heading>
          </Stack>
        </Box>
      </Inline>

      <Box padding="space.100">
        <Heading size="small">Detalle de Respuestas por Ticket</Heading>
        {ticketList.length === 0 ? (
          <SectionMessage appearance="information" title="Sin registros">
            <Text>Aún no se han registrado encuestas con calificación para este proyecto.</Text>
          </SectionMessage>
        ) : (
          <DynamicTable
            head={head}
            rows={rows}
            rowsPerPage={15}
            defaultPage={1}
            loadingSpinnerSize="large"
          />
        )}
      </Box>
    </Stack>
  );
};

ForgeReconciler.render(<App />);
