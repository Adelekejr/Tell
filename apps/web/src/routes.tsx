import type { RouteObject } from 'react-router';
import { Layout } from './components/Layout';
import { Device } from './pages/Device';
import { Home } from './pages/Home';
import { Lab } from './pages/Lab';
import { Run } from './pages/Run';
import { Check } from './pages/Check';
import { Board } from './pages/Board';
import { Scorecard } from './pages/Scorecard';
import { Verify } from './pages/Verify';
import { Try } from './pages/Try';
import { Docs, How, NotFound, Traps } from './pages/stubs';

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'lab', element: <Lab /> },
      { path: 'run/:id', element: <Run /> },
      { path: 'card/:id', element: <Scorecard /> },
      { path: 'v/:id', element: <Verify /> },
      { path: 'verify', element: <Verify /> },
      { path: 'check', element: <Check /> },
      { path: 'try', element: <Try /> },
      { path: 'board', element: <Board /> },
      { path: 'traps', element: <Traps /> },
      { path: 'how', element: <How /> },
      { path: 'docs', element: <Docs /> },
      { path: 'device', element: <Device /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
