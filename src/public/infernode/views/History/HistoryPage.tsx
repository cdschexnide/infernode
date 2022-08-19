import React from 'react';
import Stack from 'react-bootstrap/Stack';
import Card from 'react-bootstrap/Card';
import Ratio from 'react-bootstrap/Ratio';
import { HistorySidebar } from './HistorySidebar';

export const HistoryPage: React.FC = () => (
  <Stack direction="horizontal" gap={3}>
    <HistorySidebar />
    <Card>
      <img src="/mocks/history-header.png" />
      <div style={{ width: 1024, height: 'auto' }}>
        <embed type="image/svg+xml" src="/node-example-fg.svg" width="1024" />
      </div>
      <img src="/mocks/history-footer.png" />
    </Card>
  </Stack>
);
