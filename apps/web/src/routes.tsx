import type { RouteObject } from 'react-router';
import { Layout } from './components/Layout';
import { Device } from './pages/Device';
import { Home } from './pages/Home';
import { Board, Card, Check, Docs, How, Lab, NotFound, Run, Traps } from './pages/stubs';

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'lab', element: <Lab /> },
      { path: 'run/:id', element: <Run /> },
      { path: 'card/:id', element: <Card /> },
      { path: 'check', element: <Check /> },
      { path: 'board', element: <Board /> },
      { path: 'traps', element: <Traps /> },
      { path: 'how', element: <How /> },
      { path: 'docs', element: <Docs /> },
      { path: 'device', element: <Device /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
